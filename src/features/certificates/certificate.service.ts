import type { Content } from "@google/genai";
import type { Runner } from "@google/adk";

import { env } from "../../config/env";
import { StructuredAgentRunnerService } from "../../shared/ai/structured-agent-runner.service";
import { AppError } from "../../shared/errors/app-error";
import { PdfProcessingService } from "../../shared/pdf/pdf-processing.service";
import {
  certificateParseInputSchema,
  certificateParsingAgentOutputSchema,
  certificateParsingOutputSchema,
  certificateSuggestionAgentOutputSchema,
  certificateSuggestionInputSchema,
  certificateSuggestionOutputSchema,
  type CertificateParseInput,
  type CertificateParsingAgentOutput,
  type CertificateParsingOutput,
  type CertificateSuggestionAgentOutput,
  type CertificateSuggestionInput,
  type CertificateSuggestionOutput,
} from "./certificate.dto";

const retryableRunnerCodes = new Set([
  "RUNNER_INVALID_JSON",
  "RUNNER_SCHEMA_MISMATCH",
  "RUNNER_OUTPUT_KEY_MISMATCH",
  "RUNNER_EMPTY_FINAL_RESPONSE",
]);

export class CertificateService {
  constructor(
    private readonly parsingRunner: Runner,
    private readonly suggestionRunner: Runner,
    private readonly pdfProcessingService: PdfProcessingService,
    private readonly structuredAgentRunnerService: StructuredAgentRunnerService,
  ) {}

  async parseCertificate(input: CertificateParseInput): Promise<CertificateParsingOutput> {
    const parsedInput = certificateParseInputSchema.parse(input);
    const parsedCertificate = await this.runWithStructuredRetry(() => this.parseCertificateOnce(parsedInput));

    return certificateParsingOutputSchema.parse({
      ...parsedCertificate,
      model: env.GOOGLE_GENAI_RESUME_MODEL,
      generatedAt: new Date().toISOString(),
    });
  }

  async suggestCertificates(input: CertificateSuggestionInput): Promise<CertificateSuggestionOutput> {
    const parsedInput = certificateSuggestionInputSchema.parse(input);
    const suggestions = await this.runWithStructuredRetry(() => this.suggestCertificatesOnce(parsedInput));

    return certificateSuggestionOutputSchema.parse({
      ...suggestions,
      model: env.GOOGLE_GENAI_RESUME_MODEL,
      generatedAt: new Date().toISOString(),
    });
  }

  private async parseCertificateOnce(input: CertificateParseInput): Promise<CertificateParsingAgentOutput> {
    return this.pdfProcessingService.runStructuredFileAgent({
      runner: this.parsingRunner,
      userId: `certificate_parse_${input.certificationSqid}`,
      prompt: buildCertificateParsingPrompt(input),
      signedUrl: input.fileUrl,
      mimeType: input.fileMimeType,
      outputKey: "certificate_parsing_output",
      outputSchema: certificateParsingAgentOutputSchema,
      invalidJsonMessage: "Certificate parsing agent returned invalid JSON.",
      noResponseMessage: "Certificate parsing agent did not return a final response.",
      downloadErrorMessage: "Unable to download the certificate file for parsing.",
    });
  }

  private async suggestCertificatesOnce(input: CertificateSuggestionInput): Promise<CertificateSuggestionAgentOutput> {
    const message: Content = {
      role: "user",
      parts: [{ text: buildCertificateSuggestionPrompt(input) }],
    };

    return this.structuredAgentRunnerService.runStructuredPrompt({
      runner: this.suggestionRunner,
      userId: `certificate_suggest_${input.resumeSqid}`,
      message,
      outputKey: "certificate_suggestion_output",
      outputSchema: certificateSuggestionAgentOutputSchema,
      invalidJsonMessage: "Certificate suggestion agent returned invalid JSON.",
      noResponseMessage: "Certificate suggestion agent did not return a final response.",
    });
  }

  private async runWithStructuredRetry<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableRunnerError(error)) {
        throw error;
      }

      return operation();
    }
  }
}

function isRetryableRunnerError(error: unknown): boolean {
  return error instanceof AppError && retryableRunnerCodes.has(error.code);
}

function buildCertificateParsingPrompt(input: CertificateParseInput): string {
  return [
    "Parse this certificate file for the EducAIte Resume Builder.",
    "Return only JSON matching the configured schema.",
    "Required behavior:",
    "- Perform a readability and quality check before field extraction.",
    "- Extract faithful rawText from the certificate.",
    "- Extract achievementName, institution, issuedDate, gradeOrScore, and useful tags when visibly supported.",
    "- Use null for fields that are not visible or not trustworthy.",
    "- Return confidence integers from 0 to 100.",
    "- Mark needsReview true for missing or low-confidence fields.",
    "- Do not claim authenticity or verification.",
    "",
    "Certificate input:",
    JSON.stringify({
      certificationSqid: input.certificationSqid,
      fileName: input.fileName,
      fileMimeType: input.fileMimeType,
      expectedFields: input.expectedFields,
    }),
  ].join("\n");
}

function buildCertificateSuggestionPrompt(input: CertificateSuggestionInput): string {
  return [
    "Rank these certificates for the target job.",
    "Return only JSON matching the configured schema.",
    "Rules:",
    "- Use only the supplied job input and certificate list.",
    "- Detect concrete job signals from the job description.",
    "- Suggest at most maxSuggestions certificates.",
    "- Put weakly relevant certificates in excluded.",
    "- Do not invent certificate facts.",
    "",
    "Suggestion input:",
    JSON.stringify({
      resumeSqid: input.resumeSqid,
      jobTitle: input.jobTitle,
      companyName: input.companyName ?? null,
      jobDescription: input.jobDescription,
      maxSuggestions: input.maxSuggestions,
      certificates: input.certificates,
    }),
  ].join("\n");
}
