import type { Content } from "@google/genai";
import { createPartFromBase64, createPartFromText } from "@google/genai";
import { isFinalResponse, stringifyContent, type Runner } from "@google/adk";
import type { Express } from "express";

import { env } from "../../config/env";
import { AppError } from "../../shared/errors/app-error";
import { BadGatewayError } from "../../shared/errors/bad-gateway-error";
import { UnauthorizedError } from "../../shared/errors/unauthorized-error";
import {
  applyParsedStudyLoadCoursesInputSchema,
  parseAndApplyStudyLoadPdfInputSchema,
  studyLoadCourseParsingOutputSchema,
  uploadAndParseStudyLoadPdfInputSchema,
  type ApplyParsedStudyLoadCoursesInput,
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

export class StudyLoadService {
  constructor(private readonly parsingRunner: Runner) {}

  async uploadParseAndApplyStudyLoadPdf(
    input: UploadAndParseStudyLoadPdfInput,
    file: Express.Multer.File | undefined,
    authorizationHeader: string | undefined,
  ): Promise<UploadAndParseStudyLoadPdfResponse> {
    const parsedInput = uploadAndParseStudyLoadPdfInputSchema.parse(input);
    const authHeader = this.requireAuthorizationHeader(authorizationHeader);
    const studyLoadFile = this.requireStudyLoadPdf(file);
    const parsedStudyLoad = await this.parseStudyLoadPdfWithAgent(studyLoadFile.buffer.toString("base64"));

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
    const pdfBase64 = await this.downloadPdfAsBase64(signedUrl.url);
    const parsedStudyLoad = await this.parseStudyLoadPdfWithAgent(pdfBase64);
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

    const response = await fetch(
      `${env.EDUCAITE_API_BASE_URL}/api/studyload/${encodeURIComponent(parsedInput.studyLoadSqid)}/parsed-courses`,
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
    );


    const data = await this.parseJsonResponse(response, "Unable to apply parsed studyload courses.");
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
      new Blob([file.buffer], {
        type: file.mimetype || "application/pdf",
      }),
      file.originalname,
    );

    const response = await fetch(`${env.EDUCAITE_API_BASE_URL}/api/studyload`, {
      method: "POST",
      headers: {
        Authorization: authorizationHeader,
        Accept: "application/json",
      },
      body: formData,
    });

    const data = await this.parseJsonResponse(response, "Unable to upload the studyload PDF to EducAIte API.");
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

    const response = await fetch(
      `${env.EDUCAITE_API_BASE_URL}/api/aws/signed-url/study-load?${query.toString()}`,
      {
        method: "GET",
        headers: {
          Authorization: authorizationHeader,
          Accept: "application/json",
        },
      },
    );

    const data = await this.parseJsonResponse(response, "Unable to generate a signed URL for the studyload PDF.");
    return signedUrlResponseSchema.parse(data);
  }

  private async fetchStudyLoad(studyLoadSqid: string, authorizationHeader: string): Promise<StudyLoadApiResponse> {
    const response = await fetch(`${env.EDUCAITE_API_BASE_URL}/api/studyload/${encodeURIComponent(studyLoadSqid)}`, {
      method: "GET",
      headers: {
        Authorization: authorizationHeader,
        Accept: "application/json",
      },
    });


    const data = await this.parseJsonResponse(response, "Unable to fetch studyload details from EducAIte API.");
    return studyLoadApiResponseSchema.parse(data);
  }

  private async downloadPdfAsBase64(signedUrl: string): Promise<string> {
    const response = await fetch(signedUrl, {
      method: "GET",
      headers: {
        Accept: "application/pdf",
      },
    });

    if (!response.ok) {
      throw new BadGatewayError("Unable to download the studyload PDF from the signed URL.");
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      throw new BadGatewayError("Studyload PDF download returned an empty file.");
    }

    return Buffer.from(arrayBuffer).toString("base64");
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

  private async parseStudyLoadPdfWithAgent(pdfBase64: string): Promise<StudyLoadCourseParsingOutput> {
    const finalResponseText = await this.runStudyLoadParsingAgent(pdfBase64);
    const parsedJson = parseJson(finalResponseText, "Studyload parsing agent returned invalid JSON.");

    return studyLoadCourseParsingOutputSchema.parse(parsedJson);
  }

  private requireAuthorizationHeader(headerValue: string | undefined): string {
    if (!headerValue?.trim()) {
      throw new UnauthorizedError();
    }

    return headerValue;
  }

  private async parseJsonResponse(response: Response, fallbackMessage: string): Promise<unknown> {
    const rawBody = await response.text();
    const parsedBody = rawBody ? tryParseJson(rawBody) : null;

    if (!response.ok) {
      const message = extractErrorMessage(parsedBody) ?? fallbackMessage;

      if (response.status >= 500) {
        throw new BadGatewayError(message);
      }

      throw new AppError(message, `UPSTREAM_${response.status}`, response.status);
    }

    if (parsedBody === null) {
      throw new BadGatewayError(fallbackMessage);
    }

    return parsedBody;
  }

  private async runStudyLoadParsingAgent(pdfBase64: string): Promise<string> {
    const message: Content = {
      role: "user",
      parts: [
        createPartFromText(buildStudyLoadParsingPrompt()),
        createPartFromBase64(pdfBase64, "application/pdf"),
      ],
    };

    let finalResponseText: string | null = null;

    for await (const event of this.parsingRunner.runEphemeral({
      userId: "studyload_service",
      newMessage: message,
    })) {
      if (event.errorMessage) {
        throw new BadGatewayError(event.errorMessage);
      }

      if (!isFinalResponse(event)) {
        continue;
      }

      const structuredOutput = event.actions.stateDelta.studyload_parsing_output;
      if (structuredOutput) {
        return JSON.stringify(structuredOutput);
      }

      const content = stringifyContent(event).trim();
      if (content) {
        finalResponseText = content;
      }
    }

    if (!finalResponseText) {
      throw new BadGatewayError("Studyload parsing agent did not return a final response.");
    }

    return finalResponseText;
  }
}

function extractErrorMessage(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const directMessage = (payload as { message?: unknown }).message;
  if (typeof directMessage === "string" && directMessage.trim()) {
    return directMessage;
  }

  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }

  const nestedMessage = (payload as { error?: { message?: unknown } }).error?.message;
  if (typeof nestedMessage === "string" && nestedMessage.trim()) {
    return nestedMessage;
  }

  const title = (payload as { title?: unknown }).title;
  if (typeof title === "string" && title.trim()) {
    return title;
  }

  const validationErrors = (payload as { errors?: unknown }).errors;
  if (typeof validationErrors === "object" && validationErrors !== null) {
    for (const value of Object.values(validationErrors)) {
      if (Array.isArray(value)) {
        const firstMessage = value.find((item) => typeof item === "string" && item.trim());
        if (typeof firstMessage === "string") {
          return firstMessage;
        }
      }
    }
  }

  return null;
}

function tryParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function parseJson(value: string, errorMessage: string): unknown {
  const parsed = tryParseJson(value);
  if (parsed === null) {
    throw new BadGatewayError(errorMessage);
  }

  return parsed;
}

function buildStudyLoadParsingPrompt(): string {
  return [
    "Extract normalized course rows from this studyload PDF.",
    'Return only JSON matching this shape: {"courses":[{"edpCode":"...","courseName":"...","units":3}]}.',
    "Only return real course rows supported by the PDF.",
    "Ignore non-course content such as headers, student information, page numbers, and totals.",
    "If a row is unreadable or missing a trustworthy EDP code, omit it instead of guessing.",
  ].join("\n");
}
