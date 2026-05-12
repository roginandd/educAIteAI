import type { Runner } from "@google/adk";
import type { Express } from "express";

import { AppError } from "../../shared/errors/app-error";
import { BadGatewayError } from "../../shared/errors/bad-gateway-error";
import { UnauthorizedError } from "../../shared/errors/unauthorized-error";
import { UpstreamHttpClient } from "../../shared/http/upstream-http-client";
import { PdfExtractionService } from "../../shared/pdf/pdf-extraction.service";
import { PdfProcessingService } from "../../shared/pdf/pdf-processing.service";
import { cleanupUploadedFile, readUploadedFileAsBase64, readUploadedFileAsBlob } from "../../shared/uploads/uploaded-file";
import {
  applyParsedStudyLoadCoursesInputSchema,
  parseAndApplyStudyLoadPdfInputSchema,
  studyLoadCourseParsingOutputSchema,
  uploadAndParseStudyLoadPdfInputSchema,
  registrationStudyLoadPreviewOutputSchema,
  type ApplyParsedStudyLoadCoursesInput,
  type AuthenticatedStudyLoadStudentContext,
  type ParsedStudyLoadCourseItem,
  type ParseAndApplyStudyLoadPdfInput,
  type RegistrationStudyLoadPreviewOutput,
  type StudyLoadCourseParsingOutput,
  type UploadAndParseStudyLoadPdfInput,
} from "./studyload.dto";
import {
  parseAndApplyStudyLoadPdfResponseSchema,
  registrationStudyLoadPreviewResponseSchema,
  signedUrlResponseSchema,
  studyLoadApiResponseSchema,
  uploadAndParseStudyLoadPdfResponseSchema,
  type ParseAndApplyStudyLoadPdfResponse,
  type RegistrationStudyLoadPreviewResponse,
  type SignedUrlResponse,
  type StudyLoadApiResponse,
  type UploadAndParseStudyLoadPdfResponse,
} from "./studyload.response";

export interface StudyLoadParsingContext {
  requestKind:
    | "registration-studyload-preview"
    | "registration-studyload-upload"
    | "upload-parse-and-apply"
    | "parse-and-apply";
  studentSqid?: string;
  registeredStudentIdNumber?: string;
  studyLoadSqid?: string;
  studyLoadStudentSqid?: string;
  authenticatedStudent?: AuthenticatedStudyLoadStudentContext;
}

export class StudyLoadService {
  constructor(
    private readonly parsingRunner: Runner,
    private readonly registrationPreviewRunner: Runner,
    private readonly upstreamHttpClient: UpstreamHttpClient,
    private readonly pdfProcessingService: PdfProcessingService,
    private readonly pdfExtractionService: PdfExtractionService,
  ) {}

  async parseUploadedStudyLoadPdf(
    file: Express.Multer.File | undefined,
    context: StudyLoadParsingContext,
  ): Promise<StudyLoadCourseParsingOutput> {
    const parsingContext = requireStudyLoadParsingContext(context);
    const studyLoadFile = this.requireStudyLoadPdf(file);
    return this.parseStudyLoadPdfBase64WithAgent(await readUploadedFileAsBase64(studyLoadFile), parsingContext);
  }

  async previewRegistrationStudyLoadPdf(
    file: Express.Multer.File | undefined,
  ): Promise<RegistrationStudyLoadPreviewResponse> {
    const studyLoadFile = this.requireStudyLoadPdf(file);

    try {
      const preview = await this.parseRegistrationStudyLoadPdfBase64WithAgent(
        await readUploadedFileAsBase64(studyLoadFile),
      );
      const suggestedStudent = normalizeRegistrationSuggestedStudent(preview);

      return registrationStudyLoadPreviewResponseSchema.parse({
        suggestedStudent,
        parseResult: {
          parsedSemester: preview.semester,
          parsedSchoolYearStart: preview.schoolYearStart,
          parsedSchoolYearEnd: preview.schoolYearEnd,
          parsedCourses: preview.courses,
        },
        warnings: preview.warnings,
      });
    } finally {
      await cleanupUploadedFile(file);
    }
  }

  async uploadParsedStudyLoad(
    input: UploadAndParseStudyLoadPdfInput,
    parsedStudyLoad: StudyLoadCourseParsingOutput,
    file: Express.Multer.File | undefined,
    authorizationHeader: string | undefined,
  ): Promise<UploadAndParseStudyLoadPdfResponse> {
    const parsedInput = uploadAndParseStudyLoadPdfInputSchema.parse(input);
    const authHeader = this.requireAuthorizationHeader(authorizationHeader);
    const studyLoadFile = this.requireStudyLoadPdf(file);

    const uploadedStudyLoad = await this.uploadStudyLoad(
      parsedInput,
      parsedStudyLoad,
      studyLoadFile,
      authHeader,
    );
    const appliedStudyLoad = await this.applyParsedCourses(
      {
        studyLoadSqid: uploadedStudyLoad.sqid,
        courses: parsedStudyLoad.courses,
      },
      authHeader,
    );

    return uploadAndParseStudyLoadPdfResponseSchema.parse({
      uploadedStudyLoad,
      parseResult: {
        studyLoadSqid: uploadedStudyLoad.sqid,
        storageKey: uploadedStudyLoad.fileMetadata?.storageKey ?? "",
        signedUrl: await this.getSignedUrlOrPlaceholder(uploadedStudyLoad, parsedInput.expiresInMinutes, authHeader),
        parsedSemester: parsedStudyLoad.semester,
        parsedSchoolYearStart: parsedStudyLoad.schoolYearStart,
        parsedSchoolYearEnd: parsedStudyLoad.schoolYearEnd,
        parsedCourses: parsedStudyLoad.courses,
        appliedStudyLoad,
      },
    });
  }

  async uploadParseAndApplyStudyLoadPdf(
    input: UploadAndParseStudyLoadPdfInput,
    file: Express.Multer.File | undefined,
    authorizationHeader: string | undefined,
  ): Promise<UploadAndParseStudyLoadPdfResponse> {
    const parsedInput = uploadAndParseStudyLoadPdfInputSchema.parse(input);
    const authHeader = this.requireAuthorizationHeader(authorizationHeader);

    try {
      const parsedStudyLoad = await this.parseUploadedStudyLoadPdf(file, {
        requestKind: "upload-parse-and-apply",
        studentSqid: parsedInput.studentSqid,
      });
      return this.uploadParsedStudyLoad(parsedInput, parsedStudyLoad, file, authHeader);
    } finally {
      await cleanupUploadedFile(file);
    }
  }

  async parseAndApplyStudyLoadPdf(
    input: ParseAndApplyStudyLoadPdfInput,
    authorizationHeader: string | undefined,
  ): Promise<ParseAndApplyStudyLoadPdfResponse> {
    const parsedInput = parseAndApplyStudyLoadPdfInputSchema.parse(input);
    const authHeader = this.requireAuthorizationHeader(authorizationHeader);

    const studyLoad = await this.fetchStudyLoad(parsedInput.studyLoadSqid, authHeader);
    
    const storageKey = studyLoad.fileMetadata?.storageKey?.trim();
    if (!storageKey) {
      throw new BadGatewayError("Studyload file metadata is missing a storage key.");
    }

    const signedUrl = await this.getStudyLoadSignedUrl(storageKey, parsedInput.expiresInMinutes, authHeader);
    const extractedArtifact = await this.pdfExtractionService.ensureExtraction({
      sourceType: "studyload",
      sourceSqid: studyLoad.sqid,
      fileMetadataSqid: studyLoad.fileMetadataSqid,
      versionToken: `${studyLoad.fileMetadataSqid}:${studyLoad.fileMetadata?.updatedAt.toISOString() ?? studyLoad.updatedAt.toISOString()}`,
      signedUrl: signedUrl.url,
      displayName: `${studyLoad.semester} ${studyLoad.schoolYearStart}-${studyLoad.schoolYearEnd}`,
    });
    const parsedStudyLoad = await this.parseStudyLoadFromExtractedText(extractedArtifact.extractedText, {
      requestKind: "parse-and-apply",
      studyLoadSqid: studyLoad.sqid,
      studyLoadStudentSqid: studyLoad.studentSqid,
      authenticatedStudent: parsedInput.authenticatedStudent,
    });
    const appliedStudyLoad = await this.applyParsedCourses(
      {
        studyLoadSqid: parsedInput.studyLoadSqid,
        courses: parsedStudyLoad.courses,
      },
      authHeader,
    );

    return parseAndApplyStudyLoadPdfResponseSchema.parse({
      studyLoadSqid: parsedInput.studyLoadSqid,
      storageKey,
      signedUrl: signedUrl.url,
      parsedSemester: parsedStudyLoad.semester,
      parsedSchoolYearStart: parsedStudyLoad.schoolYearStart,
      parsedSchoolYearEnd: parsedStudyLoad.schoolYearEnd,
      parsedCourses: parsedStudyLoad.courses,
      appliedStudyLoad,
    });
  }

  async applyParsedCourses(
    input: ApplyParsedStudyLoadCoursesInput,
    authorizationHeader: string | undefined,
  ): Promise<StudyLoadApiResponse> {
    const parsedInput = applyParsedStudyLoadCoursesInputSchema.parse(input);
    const authHeader = this.requireAuthorizationHeader(authorizationHeader);

    const data = await this.upstreamHttpClient.getJson(
      `/api/studyload/${encodeURIComponent(parsedInput.studyLoadSqid)}/parsed-courses`,
      {
        method: "POST",
        headers: {
          Authorization: authHeader,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          courses: parsedInput.courses.map((course) => ({
            edpCode: course.edpCode,
            courseName: course.courseName,
            units: course.units,
          })),
        }),
      },
      "Unable to apply parsed studyload courses.",
    );
    return studyLoadApiResponseSchema.parse(data);
  }

  private requireStudyLoadPdf(file: Express.Multer.File | undefined): Express.Multer.File {
    if (!file) {
      throw new AppError("Studyload PDF file is required.", "VALIDATION_ERROR", 400);
    }

    const normalizedMimeType = file.mimetype.trim().toLowerCase();
    const normalizedFileName = file.originalname.trim().toLowerCase();
    if (normalizedMimeType !== "application/pdf" && !normalizedFileName.endsWith(".pdf")) {
      throw new AppError("Studyload upload must be a PDF file.", "VALIDATION_ERROR", 400);
    }

    return file;
  }

  private async uploadStudyLoad(
    input: UploadAndParseStudyLoadPdfInput,
    parsedStudyLoad: StudyLoadCourseParsingOutput,
    file: Express.Multer.File,
    authorizationHeader: string,
  ): Promise<StudyLoadApiResponse> {
    const formData = new FormData();
    formData.append("studentSqid", input.studentSqid);
    formData.append("schoolYearStart", String(parsedStudyLoad.schoolYearStart));
    formData.append("schoolYearEnd", String(parsedStudyLoad.schoolYearEnd));
    formData.append("semester", String(parsedStudyLoad.semester));
    formData.append(
      "studyLoadDocument",
      await readUploadedFileAsBlob(file),
      file.originalname,
    );

    const data = await this.upstreamHttpClient.getJson("/api/studyload", {
      method: "POST",
      headers: {
        Authorization: authorizationHeader,
        Accept: "application/json",
      },
      body: formData,
    }, "Unable to upload the studyload PDF to EducAIte API.");
    return studyLoadApiResponseSchema.parse(data);
  }

  private async getStudyLoadSignedUrl(
    storageKey: string,
    expiresInMinutes: number,
    authorizationHeader: string,
  ): Promise<SignedUrlResponse> {
    const query = new URLSearchParams({
      key: storageKey,
      expiresInMinutes: String(expiresInMinutes),
    });

    const data = await this.upstreamHttpClient.getJson(
      `/api/aws/signed-url/study-load?${query.toString()}`,
      {
        method: "GET",
        headers: {
          Authorization: authorizationHeader,
          Accept: "application/json",
        },
      },
      "Unable to generate a signed URL for the studyload PDF.",
    );
    return signedUrlResponseSchema.parse(data);
  }

  private async fetchStudyLoad(studyLoadSqid: string, authorizationHeader: string): Promise<StudyLoadApiResponse> {
    const data = await this.upstreamHttpClient.getJson(`/api/studyload/${encodeURIComponent(studyLoadSqid)}`, {
      method: "GET",
      headers: {
        Authorization: authorizationHeader,
        Accept: "application/json",
      },
    }, "Unable to fetch studyload details from EducAIte API.");
    return studyLoadApiResponseSchema.parse(data);
  }

  private async getSignedUrlOrPlaceholder(
    uploadedStudyLoad: StudyLoadApiResponse,
    expiresInMinutes: number,
    authorizationHeader: string,
  ): Promise<string> {
    const storageKey = uploadedStudyLoad.fileMetadata?.storageKey?.trim();
    if (!storageKey) {
      return "";
    }

    const signedUrl = await this.getStudyLoadSignedUrl(storageKey, expiresInMinutes, authorizationHeader);
    return signedUrl.url;
  }

  private async parseStudyLoadPdfBase64WithAgent(
    pdfBase64: string,
    context: StudyLoadParsingContext,
  ): Promise<StudyLoadCourseParsingOutput> {
    const parsingContext = requireStudyLoadParsingContext(context);

    return this.pdfProcessingService.runStructuredPdfAgentFromBase64({
      runner: this.parsingRunner,
      userId: "studyload_service",
      prompt: buildStudyLoadParsingPrompt(parsingContext),
      pdfBase64,
      outputKey: "studyload_parsing_output",
      outputSchema: studyLoadCourseParsingOutputSchema,
      invalidJsonMessage: "Studyload parsing agent returned invalid JSON.",
      noResponseMessage: "Studyload parsing agent did not return a final response.",
    });
  }

  private async parseRegistrationStudyLoadPdfBase64WithAgent(
    pdfBase64: string,
  ): Promise<RegistrationStudyLoadPreviewOutput> {
    return this.pdfProcessingService.runStructuredPdfAgentFromBase64({
      runner: this.registrationPreviewRunner,
      userId: "studyload_registration_preview",
      prompt: buildRegistrationStudyLoadPreviewPrompt(),
      pdfBase64,
      outputKey: "studyload_parsing_output",
      outputSchema: registrationStudyLoadPreviewOutputSchema,
      invalidJsonMessage: "Studyload preview agent returned invalid JSON.",
      noResponseMessage: "Studyload preview agent did not return a final response.",
    });
  }

  private async parseStudyLoadFromExtractedText(
    extractedText: string,
    context: StudyLoadParsingContext,
  ): Promise<StudyLoadCourseParsingOutput> {
    const parsingContext = requireStudyLoadParsingContext(context);

    return this.pdfProcessingService.runStructuredTextAgent({
      runner: this.parsingRunner,
      userId: "studyload_service",
      prompt: buildStudyLoadParsingPrompt(parsingContext),
      sourceText: extractedText,
      outputKey: "studyload_parsing_output",
      outputSchema: studyLoadCourseParsingOutputSchema,
      invalidJsonMessage: "Studyload parsing agent returned invalid JSON.",
      noResponseMessage: "Studyload parsing agent did not return a final response.",
    });
  }

  private requireAuthorizationHeader(headerValue: string | undefined): string {
    if (!headerValue?.trim()) {
      throw new UnauthorizedError();
    }

    return headerValue;
  }
}

function normalizeRegistrationSuggestedStudent(
  preview: RegistrationStudyLoadPreviewOutput,
): RegistrationStudyLoadPreviewOutput["suggestedStudent"] {
  const parsedIdentity = parseOfficialStudyLoadIdentityLine(preview.studentIdentityLine);
  const suggestedName = normalizeSuggestedName(preview.suggestedStudent);

  return {
    firstName: toNameCase(parsedIdentity?.firstName ?? suggestedName.firstName),
    middleName: toNameCase(parsedIdentity?.middleName ?? suggestedName.middleName),
    lastName: toNameCase(parsedIdentity?.lastName ?? suggestedName.lastName),
    studentIdNumber: (parsedIdentity?.studentIdNumber ?? preview.suggestedStudent.studentIdNumber).trim(),
    program: (parsedIdentity?.program ?? preview.suggestedStudent.program).trim().toUpperCase(),
    schoolEducation: preview.suggestedStudent.schoolEducation.trim(),
  };
}

function normalizeSuggestedName(
  suggestedStudent: RegistrationStudyLoadPreviewOutput["suggestedStudent"],
): Pick<RegistrationStudyLoadPreviewOutput["suggestedStudent"], "firstName" | "middleName" | "lastName"> {
  if (!suggestedStudent.middleName.trim()) {
    return {
      firstName: suggestedStudent.firstName,
      middleName: "",
      lastName: suggestedStudent.lastName,
    };
  }

  return {
    firstName: cleanNameTokens([suggestedStudent.firstName, suggestedStudent.middleName]),
    middleName: "",
    lastName: suggestedStudent.lastName,
  };
}

function parseOfficialStudyLoadIdentityLine(
  identityLine: string,
): Partial<RegistrationStudyLoadPreviewOutput["suggestedStudent"]> | null {
  const tokens = identityLine.trim().split(/\s+/).filter(Boolean);
  const studentIdIndex = tokens.findIndex(isStudentIdToken);

  if (studentIdIndex < 0) {
    return null;
  }

  const trailingTokens = tokens.slice(studentIdIndex + 1);
  const programIndex = findProgramTokenIndex(trailingTokens);
  const nameTokens = programIndex >= 0 ? trailingTokens.slice(0, programIndex) : trailingTokens;
  const parsedName = parseStudentNameTokens(nameTokens);

  return {
    ...parsedName,
    studentIdNumber: tokens[studentIdIndex],
    program: programIndex >= 0 ? trailingTokens[programIndex] : undefined,
  };
}

function parseStudentNameTokens(
  tokens: string[],
): Pick<RegistrationStudyLoadPreviewOutput["suggestedStudent"], "firstName" | "middleName" | "lastName"> {
  const dotIndex = tokens.findIndex((token) => token === ".");
  if (dotIndex >= 0) {
    return {
      firstName: cleanNameTokens(tokens.slice(0, dotIndex)),
      middleName: "",
      lastName: cleanNameTokens(tokens.slice(dotIndex + 1)),
    };
  }

  const joinedName = cleanNameTokens(tokens);
  const commaIndex = joinedName.indexOf(",");
  if (commaIndex >= 0) {
    return {
      firstName: joinedName.slice(commaIndex + 1).trim(),
      middleName: "",
      lastName: joinedName.slice(0, commaIndex).trim(),
    };
  }

  if (tokens.length <= 1) {
    return {
      firstName: cleanNameTokens(tokens),
      middleName: "",
      lastName: "",
    };
  }

  return {
    firstName: cleanNameTokens(tokens.slice(0, -1)),
    middleName: "",
    lastName: cleanNameTokens(tokens.slice(-1)),
  };
}

function cleanNameTokens(tokens: string[]): string {
  return tokens
    .filter((token) => token !== ".")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function toNameCase(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[a-z]+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}

function findProgramTokenIndex(tokens: string[]): number {
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index];
    if (isYearLevelToken(token)) {
      continue;
    }

    if (isProgramToken(token)) {
      return index;
    }
  }

  return -1;
}

function isStudentIdToken(token: string): boolean {
  return /^\d{5,}$/.test(token);
}

function isProgramToken(token: string): boolean {
  return /^[A-Z]{2,}(?:[-A-Z0-9]*)?$/.test(token);
}

function isYearLevelToken(token: string): boolean {
  return /^\d(?:st|nd|rd|th)?$/i.test(token);
}

function buildStudyLoadParsingPrompt(context: StudyLoadParsingContext): string {
  return [
    "RLF-Studyload-Context-Enforcer:",
    "Use the request context below as the only allowed identity boundary for this parse.",
    "Do not infer student identity from the PDF text and do not mix rows across another student or studyload.",
    `Request context JSON: ${JSON.stringify(context)}`,
    "",
    "Extract normalized course rows from this extracted studyload text.",
    'Return only JSON matching this shape: {"semester":1,"schoolYearStart":2025,"schoolYearEnd":2026,"courses":[{"edpCode":"...","courseName":"...","units":3}]}.',
    "Only return real course rows supported by the extracted text.",
    "Only return semester and school-year values supported by the extracted text.",
    "Ignore non-course content such as headers, student information, page numbers, and totals.",
    "If a row is unreadable or missing a trustworthy EDP code, omit it instead of guessing.",
  ].join("\n");
}

function buildRegistrationStudyLoadPreviewPrompt(): string {
  const requestContext = {
    requestKind: "registration-studyload-preview",
    registrationRequest: true,
  };

  return [
    "You are the EducAIte registration studyload preview parser.",
    "This is a pre-registration helper. No account exists yet, and nothing is persisted from this response.",
    `Request context JSON: ${JSON.stringify(requestContext)}`,
    "",
    "Return editable suggestions only from the uploaded studyload PDF.",
    "Extract student identity and school education fields only when the PDF explicitly supports them.",
    "If a student field is missing or uncertain, return an empty string for that field.",
    "Do not invent names, school IDs, programs, courses, semester, or school-year values.",
    "",
    'Return only JSON matching this shape: {"studentIdentityLine":"","suggestedStudent":{"firstName":"","middleName":"","lastName":"","studentIdNumber":"","program":"","schoolEducation":""},"semester":1,"schoolYearStart":2025,"schoolYearEnd":2026,"courses":[{"edpCode":"...","courseName":"...","units":3}],"warnings":[]}.',
    "Recognize student names from labels such as Student Name, Name, Full Name, Student, or Learner.",
    'Also recognize unlabeled official studyload identity rows like "21436613 ROGINAND . VILLEGAS BSCS 3" directly under "OFFICIAL STUDY LOAD".',
    "Set studentIdentityLine to the exact raw identity row used for suggestedStudent, or an empty string when no identity row is supported.",
    'For that row, set studentIdNumber from the first long numeric token, program from the final program-like token such as BSCS or BSIT, and student name from the text between them.',
    'For "21436613 ROGINAND . VILLEGAS BSCS 3", return {"firstName":"ROGINAND","middleName":"","lastName":"VILLEGAS","studentIdNumber":"21436613","program":"BSCS"}.',
    'Treat a lone "." inside the name as the split marker: every name token before "." belongs to firstName, and every name token after "." belongs to lastName.',
    'For "JOHN CARL . ATILLO", return {"firstName":"JOHN CARL","middleName":"","lastName":"ATILLO"}. Do not return middleName "CARL".',
    'For comma-form names like "Dela Cruz, Juan Santos", return {"firstName":"Juan Santos","middleName":"","lastName":"Dela Cruz"}.',
    'For forward-form names like "Juan Santos Dela Cruz", keep multi-word given names in firstName; do not automatically use the second token as middleName.',
    "Do not use adviser, registrar, instructor, department, college, or school names as the student name.",
    "Use studentIdNumber for labels such as Student ID, ID No., Student No., or ID Number.",
    "Use program for the student's academic program or course, such as BSCS, BSIT, or Bachelor of Science in Computer Science.",
    'Use schoolEducation for the top school header, college, department, or education level shown in the PDF, such as "UNIVERSITY OF CEBU - MAIN".',
    "",
    "Course extraction rules:",
    "- Extract only real course rows supported by the PDF.",
    "- Treat EDP code as the primary identity for a course row.",
    "- Keep course names concise and cleaned of obvious OCR noise.",
    "- Normalize units to integers.",
    "- Deduplicate repeated rows.",
    "- Omit unreadable rows instead of guessing.",
  ].join("\n");
}

function requireStudyLoadParsingContext(context: StudyLoadParsingContext): StudyLoadParsingContext {
  const parsedContext: StudyLoadParsingContext = {
    requestKind: context.requestKind,
    studentSqid: context.studentSqid?.trim(),
    registeredStudentIdNumber: context.registeredStudentIdNumber?.trim(),
    studyLoadSqid: context.studyLoadSqid?.trim(),
    studyLoadStudentSqid: context.studyLoadStudentSqid?.trim(),
    authenticatedStudent: context.authenticatedStudent,
  };

  const hasIdentity = Boolean(
    parsedContext.authenticatedStudent?.studentSqid
      || parsedContext.studentSqid
      || parsedContext.registeredStudentIdNumber
      || parsedContext.studyLoadSqid
      || parsedContext.studyLoadStudentSqid,
  );

  if (parsedContext.requestKind === "registration-studyload-preview") {
    return parsedContext;
  }

  if (!parsedContext.requestKind || !hasIdentity) {
    throw new AppError(
      "Studyload parsing requires authenticated student, registration request, or persisted studyload context.",
      "STUDYLOAD_PARSE_CONTEXT_REQUIRED",
      400,
    );
  }

  return parsedContext;
}
