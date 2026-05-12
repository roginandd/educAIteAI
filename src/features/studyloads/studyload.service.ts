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
  type ApplyParsedStudyLoadCoursesInput,
  type AuthenticatedStudyLoadStudentContext,
  type ParsedStudyLoadCourseItem,
  type ParseAndApplyStudyLoadPdfInput,
  type StudyLoadCourseParsingOutput,
  type UploadAndParseStudyLoadPdfInput,
} from "./studyload.dto";
import {
  parseAndApplyStudyLoadPdfResponseSchema,
  signedUrlResponseSchema,
  studyLoadApiResponseSchema,
  uploadAndParseStudyLoadPdfResponseSchema,
  type ParseAndApplyStudyLoadPdfResponse,
  type SignedUrlResponse,
  type StudyLoadApiResponse,
  type UploadAndParseStudyLoadPdfResponse,
} from "./studyload.response";

export interface StudyLoadParsingContext {
  requestKind: "registration-studyload-upload" | "upload-parse-and-apply" | "parse-and-apply";
  studentSqid?: string;
  registeredStudentIdNumber?: string;
  studyLoadSqid?: string;
  studyLoadStudentSqid?: string;
  authenticatedStudent?: AuthenticatedStudyLoadStudentContext;
}

export class StudyLoadService {
  constructor(
    private readonly parsingRunner: Runner,
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

  if (!parsedContext.requestKind || !hasIdentity) {
    throw new AppError(
      "Studyload parsing requires authenticated student, registration request, or persisted studyload context.",
      "STUDYLOAD_PARSE_CONTEXT_REQUIRED",
      400,
    );
  }

  return parsedContext;
}
