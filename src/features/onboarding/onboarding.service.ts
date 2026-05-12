import type { Express } from "express";

import { AppError } from "../../shared/errors/app-error";
import { BadGatewayError } from "../../shared/errors/bad-gateway-error";
import { UpstreamHttpClient } from "../../shared/http/upstream-http-client";
import { cleanupUploadedFile } from "../../shared/uploads/uploaded-file";
import {
  authResultSchema,
  registerWithStudyLoadInputSchema,
  studentApiResponseSchema,
  type AuthResult,
  type RegisterWithStudyLoadInput,
  type StudentApiResponse,
} from "./onboarding.dto";
import { registerWithStudyLoadResponseSchema, type RegisterWithStudyLoadResponse } from "./onboarding.response";
import { StudyLoadService } from "../studyloads/studyload.service";
import type { RegistrationStudyLoadPreviewResponse } from "../studyloads/studyload.response";

export class OnboardingService {
  constructor(
    private readonly studyLoadService: StudyLoadService,
    private readonly upstreamHttpClient: UpstreamHttpClient,
  ) {}

  async registerWithStudyLoad(
    input: RegisterWithStudyLoadInput,
    file: Express.Multer.File | undefined,
  ): Promise<RegisterWithStudyLoadResponse> {
    const parsedInput = registerWithStudyLoadInputSchema.parse(input);
    const parsedStudyLoad = parsedInput.parsedStudyLoad
      ?? await this.studyLoadService.parseUploadedStudyLoadPdf(file, {
        requestKind: "registration-studyload-upload",
        registeredStudentIdNumber: parsedInput.studentIdNumber,
      });
    const transaction = new OnboardingCompensatingTransaction();
    let auth: AuthResult | null = null;

    try {
      const registeredStudent = await this.registerStudent(parsedInput);
      transaction.addRollbackStep("student-registration", async () => {
        await this.rollbackRegisteredStudent(
          registeredStudent.sqid,
          parsedInput.studentIdNumber,
          parsedInput.password,
          auth?.token,
        );
      });

      auth = await this.loginStudent(parsedInput.studentIdNumber, parsedInput.password);
      const authorizationHeader = this.requireAccessToken(auth);

      const studyLoad = await this.studyLoadService.uploadParsedStudyLoad(
        {
          studentSqid: registeredStudent.sqid,
          expiresInMinutes: parsedInput.expiresInMinutes,
        },
        parsedStudyLoad,
        file,
        authorizationHeader,
      );

      return registerWithStudyLoadResponseSchema.parse({
        student: registeredStudent,
        auth,
        studyLoad,
      });
    } catch (error) {
      await transaction.rollbackOrThrow(error);
      throw error;
    } finally {
      await cleanupUploadedFile(file);
    }
  }

  async previewStudyLoad(file: Express.Multer.File | undefined): Promise<RegistrationStudyLoadPreviewResponse> {
    return this.studyLoadService.previewRegistrationStudyLoadPdf(file);
  }

  private async registerStudent(input: RegisterWithStudyLoadInput): Promise<StudentApiResponse> {
    const data = await this.upstreamHttpClient.getJson("/api/Student/register", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        firstName: input.firstName,
        middleName: input.middleName || null,
        lastName: input.lastName,
        email: input.email,
        password: input.password,
        confirmPassword: input.confirmPassword,
        studentIdNumber: input.studentIdNumber,
      }),
    }, "Unable to register the student.");
    return studentApiResponseSchema.parse(data);
  }

  private async loginStudent(studentIdNumber: string, password: string): Promise<AuthResult> {
    const data = await this.upstreamHttpClient.getJson("/api/Auth/login", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        studentIdNumber,
        password,
      }),
    }, "Unable to log in the newly registered student.");
    const auth = authResultSchema.parse(data);

    if (!auth.success || !auth.token) {
      throw new BadGatewayError(auth.error?.trim() || "Login failed after student registration.");
    }

    return auth;
  }

  private async rollbackRegisteredStudent(
    studentSqid: string,
    studentIdNumber: string,
    password: string,
    token: string | null | undefined,
  ): Promise<void> {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    let url = `/api/Student/${encodeURIComponent(studentSqid)}/rollback-registration`;
    let body: string | undefined = JSON.stringify({
      studentIdNumber,
      password,
    });
    let method = "DELETE";

    if (token?.trim()) {
      url = "/api/Student/me";
      headers.Authorization = `Bearer ${token}`;
      body = undefined;
    } else {
      headers["Content-Type"] = "application/json";
    }

    const response = await this.upstreamHttpClient.request(url, {
      method,
      headers,
      body,
    }, "Unable to roll back the registered student.");

    if (!response.ok) {
      const rawBody = await response.text();
      const errorDetails = rawBody.trim();
      const message = errorDetails
        ? `Unable to roll back the registered student. ${errorDetails}`
        : "Unable to roll back the registered student.";
      throw new AppError(message, `UPSTREAM_${response.status}`, response.status);
    }
  }

  private requireAccessToken(auth: AuthResult): string {
    if (!auth.token?.trim()) {
      throw new BadGatewayError("Login response did not include a bearer token.");
    }

    return `Bearer ${auth.token}`;
  }
}

class OnboardingCompensatingTransaction {
  private readonly rollbackSteps: Array<{
    name: string;
    execute: () => Promise<void>;
  }> = [];

  addRollbackStep(name: string, execute: () => Promise<void>): void {
    this.rollbackSteps.push({ name, execute });
  }

  async rollbackOrThrow(primaryError: unknown): Promise<void> {
    if (this.rollbackSteps.length === 0) {
      return;
    }

    const rollbackFailures: string[] = [];

    for (let index = this.rollbackSteps.length - 1; index >= 0; index -= 1) {
      const step = this.rollbackSteps[index];
      try {
        await step.execute();
      } catch (rollbackError) {
        rollbackFailures.push(step.name);
        console.error(`Onboarding rollback step failed: ${step.name}.`, rollbackError);
      }
    }

    if (rollbackFailures.length === 0) {
      return;
    }

    const primaryMessage = extractErrorMessage(primaryError);
    throw new AppError(
      `Onboarding failed and rollback was incomplete (${rollbackFailures.join(", ")}). Primary error: ${primaryMessage}`,
      "ONBOARDING_ROLLBACK_INCOMPLETE",
      502,
    );
  }
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Unknown onboarding failure.";
}
