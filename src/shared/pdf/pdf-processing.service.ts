import { createPartFromBase64, createPartFromText } from "@google/genai";
import { isFinalResponse, stringifyContent, type Runner } from "@google/adk";
import type { ZodType } from "zod";

import { AppError } from "../errors/app-error";
import { BadGatewayError } from "../errors/bad-gateway-error";
import { UpstreamHttpClient } from "../http/upstream-http-client";

interface RunStructuredPdfAgentInput<T> {
  runner: Runner;
  userId: string;
  prompt: string;
  outputKey: string;
  outputSchema: ZodType<T>;
  invalidJsonMessage: string;
  noResponseMessage: string;
}

interface RunStructuredPdfAgentFromUrlInput<T> extends RunStructuredPdfAgentInput<T> {
  signedUrl: string;
  downloadErrorMessage: string;
}

interface RunStructuredPdfAgentFromBase64Input<T> extends RunStructuredPdfAgentInput<T> {
  pdfBase64: string;
}

interface RunStructuredFileAgentFromUrlInput<T> extends RunStructuredPdfAgentInput<T> {
  signedUrl: string;
  mimeType: string;
  downloadErrorMessage: string;
}

interface RunStructuredFileAgentFromBase64Input<T> extends RunStructuredPdfAgentInput<T> {
  fileBase64: string;
  mimeType: string;
}

interface RunStructuredTextAgentInput<T> extends RunStructuredPdfAgentInput<T> {
  sourceText: string;
}

export class PdfProcessingService {
  constructor(private readonly upstreamHttpClient: UpstreamHttpClient) {}

  async runStructuredPdfAgent<T>(input: RunStructuredPdfAgentFromUrlInput<T>): Promise<T> {
    const pdfBase64 = await this.upstreamHttpClient.downloadBase64(
      input.signedUrl,
      input.downloadErrorMessage,
      "application/pdf",
    );
    return this.runStructuredPdfAgentFromBase64({
      runner: input.runner,
      userId: input.userId,
      prompt: input.prompt,
      pdfBase64,
      outputKey: input.outputKey,
      outputSchema: input.outputSchema,
      invalidJsonMessage: input.invalidJsonMessage,
      noResponseMessage: input.noResponseMessage,
    });
  }

  async runStructuredFileAgent<T>(input: RunStructuredFileAgentFromUrlInput<T>): Promise<T> {
    const fileBase64 = await this.upstreamHttpClient.downloadBase64(
      input.signedUrl,
      input.downloadErrorMessage,
      input.mimeType,
    );

    return this.runStructuredFileAgentFromBase64({
      runner: input.runner,
      userId: input.userId,
      prompt: input.prompt,
      fileBase64,
      mimeType: input.mimeType,
      outputKey: input.outputKey,
      outputSchema: input.outputSchema,
      invalidJsonMessage: input.invalidJsonMessage,
      noResponseMessage: input.noResponseMessage,
    });
  }

  async runStructuredPdfAgentFromBase64<T>(input: RunStructuredPdfAgentFromBase64Input<T>): Promise<T> {
    const finalResponseText = await this.runPdfAgent({
      runner: input.runner,
      userId: input.userId,
      prompt: input.prompt,
      pdfBase64: input.pdfBase64,
      outputKey: input.outputKey,
      noResponseMessage: input.noResponseMessage,
    });
    const parsedJson = parseJson(finalResponseText, {
      errorMessage: input.invalidJsonMessage,
      outputKey: input.outputKey,
      userId: input.userId,
      inputType: "pdf",
    });

    return parseSchemaOrThrow({
      schema: input.outputSchema,
      value: parsedJson,
      outputKey: input.outputKey,
      userId: input.userId,
      inputType: "pdf",
    });
  }

  async runStructuredFileAgentFromBase64<T>(input: RunStructuredFileAgentFromBase64Input<T>): Promise<T> {
    const finalResponseText = await this.runFileAgent({
      runner: input.runner,
      userId: input.userId,
      prompt: input.prompt,
      fileBase64: input.fileBase64,
      mimeType: input.mimeType,
      outputKey: input.outputKey,
      noResponseMessage: input.noResponseMessage,
    });
    const parsedJson = parseJson(finalResponseText, {
      errorMessage: input.invalidJsonMessage,
      outputKey: input.outputKey,
      userId: input.userId,
      inputType: "file",
    });

    return parseSchemaOrThrow({
      schema: input.outputSchema,
      value: parsedJson,
      outputKey: input.outputKey,
      userId: input.userId,
      inputType: "file",
    });
  }

  async runStructuredTextAgent<T>(input: RunStructuredTextAgentInput<T>): Promise<T> {
    const finalResponseText = await this.runTextAgent({
      runner: input.runner,
      userId: input.userId,
      prompt: input.prompt,
      sourceText: input.sourceText,
      outputKey: input.outputKey,
      noResponseMessage: input.noResponseMessage,
    });
    const parsedJson = parseJson(finalResponseText, {
      errorMessage: input.invalidJsonMessage,
      outputKey: input.outputKey,
      userId: input.userId,
      inputType: "text",
    });

    return parseSchemaOrThrow({
      schema: input.outputSchema,
      value: parsedJson,
      outputKey: input.outputKey,
      userId: input.userId,
      inputType: "text",
    });
  }

  private async runPdfAgent(input: {
    runner: Runner;
    userId: string;
    prompt: string;
    pdfBase64: string;
    outputKey: string;
    noResponseMessage: string;
  }): Promise<string> {
    const message = {
      role: "user" as const,
      parts: [
        createPartFromText(input.prompt),
        createPartFromBase64(input.pdfBase64, "application/pdf"),
      ],
    };

    let finalResponseText: string | null = null;
    let sawFinalResponse = false;
    const observedStateDeltaKeys = new Set<string>();

    for await (const event of input.runner.runEphemeral({
      userId: input.userId,
      newMessage: message,
    })) {
      if (event.errorMessage?.trim()) {
        logRunnerError("Runner returned event.errorMessage.", {
          userId: input.userId,
          outputKey: input.outputKey,
          inputType: "pdf",
          errorMessage: event.errorMessage,
        });
        throw mapRunnerErrorToAppError(event.errorMessage);
      }

      if (!isFinalResponse(event)) {
        continue;
      }

      sawFinalResponse = true;

      const stateDelta = event.actions?.stateDelta ?? {};
      for (const key of Object.keys(stateDelta)) {
        observedStateDeltaKeys.add(key);
      }

      if (Object.hasOwn(stateDelta, input.outputKey) && stateDelta[input.outputKey] !== undefined) {
        const structuredOutput = stateDelta[input.outputKey];
        return JSON.stringify(structuredOutput);
      }

      const content = stringifyContent(event).trim();
      if (content) {
        if (observedStateDeltaKeys.size > 0 && !Object.hasOwn(stateDelta, input.outputKey)) {
          logRunnerError("Final response fell back to text because outputKey was not found in stateDelta.", {
            userId: input.userId,
            outputKey: input.outputKey,
            inputType: "pdf",
            availableStateDeltaKeys: [...observedStateDeltaKeys],
            textPreview: truncateForLog(content),
          });
        }
        finalResponseText = content;
      }
    }

    if (sawFinalResponse && observedStateDeltaKeys.size > 0 && !observedStateDeltaKeys.has(input.outputKey)) {
      throw new AppError(
        `Runner final response did not include expected outputKey "${input.outputKey}". Available keys: ${[...observedStateDeltaKeys].join(", ")}.`,
        "RUNNER_OUTPUT_KEY_MISMATCH",
        502,
      );
    }

    if (sawFinalResponse && !finalResponseText) {
      throw new AppError(
        `Runner final response did not include structured output or text content for outputKey "${input.outputKey}".`,
        "RUNNER_EMPTY_FINAL_RESPONSE",
        502,
      );
    }

    if (!finalResponseText) {
      throw new BadGatewayError(input.noResponseMessage);
    }

    return finalResponseText;
  }

  private async runFileAgent(input: {
    runner: Runner;
    userId: string;
    prompt: string;
    fileBase64: string;
    mimeType: string;
    outputKey: string;
    noResponseMessage: string;
  }): Promise<string> {
    const message = {
      role: "user" as const,
      parts: [
        createPartFromText(input.prompt),
        createPartFromBase64(input.fileBase64, input.mimeType),
      ],
    };

    let finalResponseText: string | null = null;
    let sawFinalResponse = false;
    const observedStateDeltaKeys = new Set<string>();

    for await (const event of input.runner.runEphemeral({
      userId: input.userId,
      newMessage: message,
    })) {
      if (event.errorMessage?.trim()) {
        logRunnerError("Runner returned event.errorMessage.", {
          userId: input.userId,
          outputKey: input.outputKey,
          inputType: "file",
          mimeType: input.mimeType,
          errorMessage: event.errorMessage,
        });
        throw mapRunnerErrorToAppError(event.errorMessage);
      }

      if (!isFinalResponse(event)) {
        continue;
      }

      sawFinalResponse = true;

      const stateDelta = event.actions?.stateDelta ?? {};
      for (const key of Object.keys(stateDelta)) {
        observedStateDeltaKeys.add(key);
      }

      if (Object.hasOwn(stateDelta, input.outputKey) && stateDelta[input.outputKey] !== undefined) {
        const structuredOutput = stateDelta[input.outputKey];
        return JSON.stringify(structuredOutput);
      }

      const content = stringifyContent(event).trim();
      if (content) {
        if (observedStateDeltaKeys.size > 0 && !Object.hasOwn(stateDelta, input.outputKey)) {
          logRunnerError("Final response fell back to text because outputKey was not found in stateDelta.", {
            userId: input.userId,
            outputKey: input.outputKey,
            inputType: "file",
            availableStateDeltaKeys: [...observedStateDeltaKeys],
            textPreview: truncateForLog(content),
          });
        }
        finalResponseText = content;
      }
    }

    if (sawFinalResponse && observedStateDeltaKeys.size > 0 && !observedStateDeltaKeys.has(input.outputKey)) {
      throw new AppError(
        `Runner final response did not include expected outputKey "${input.outputKey}". Available keys: ${[...observedStateDeltaKeys].join(", ")}.`,
        "RUNNER_OUTPUT_KEY_MISMATCH",
        502,
      );
    }

    if (sawFinalResponse && !finalResponseText) {
      throw new AppError(
        `Runner final response did not include structured output or text content for outputKey "${input.outputKey}".`,
        "RUNNER_EMPTY_FINAL_RESPONSE",
        502,
      );
    }

    if (!finalResponseText) {
      throw new BadGatewayError(input.noResponseMessage);
    }

    return finalResponseText;
  }

  private async runTextAgent(input: {
    runner: Runner;
    userId: string;
    prompt: string;
    sourceText: string;
    outputKey: string;
    noResponseMessage: string;
  }): Promise<string> {
    const message = {
      role: "user" as const,
      parts: [
        createPartFromText(input.prompt),
        createPartFromText(`Source material:\n${input.sourceText}`),
      ],
    };

    let finalResponseText: string | null = null;
    let sawFinalResponse = false;
    const observedStateDeltaKeys = new Set<string>();

    for await (const event of input.runner.runEphemeral({
      userId: input.userId,
      newMessage: message,
    })) {
      if (event.errorMessage?.trim()) {
        logRunnerError("Runner returned event.errorMessage.", {
          userId: input.userId,
          outputKey: input.outputKey,
          inputType: "text",
          errorMessage: event.errorMessage,
        });
        throw mapRunnerErrorToAppError(event.errorMessage);
      }

      if (!isFinalResponse(event)) {
        continue;
      }

      sawFinalResponse = true;

      const stateDelta = event.actions?.stateDelta ?? {};
      for (const key of Object.keys(stateDelta)) {
        observedStateDeltaKeys.add(key);
      }

      if (Object.hasOwn(stateDelta, input.outputKey) && stateDelta[input.outputKey] !== undefined) {
        const structuredOutput = stateDelta[input.outputKey];
        return JSON.stringify(structuredOutput);
      }

      const content = stringifyContent(event).trim();
      if (content) {
        if (observedStateDeltaKeys.size > 0 && !Object.hasOwn(stateDelta, input.outputKey)) {
          logRunnerError("Final response fell back to text because outputKey was not found in stateDelta.", {
            userId: input.userId,
            outputKey: input.outputKey,
            inputType: "text",
            availableStateDeltaKeys: [...observedStateDeltaKeys],
            textPreview: truncateForLog(content),
          });
        }
        finalResponseText = content;
      }
    }

    if (sawFinalResponse && observedStateDeltaKeys.size > 0 && !observedStateDeltaKeys.has(input.outputKey)) {
      throw new AppError(
        `Runner final response did not include expected outputKey "${input.outputKey}". Available keys: ${[...observedStateDeltaKeys].join(", ")}.`,
        "RUNNER_OUTPUT_KEY_MISMATCH",
        502,
      );
    }

    if (sawFinalResponse && !finalResponseText) {
      throw new AppError(
        `Runner final response did not include structured output or text content for outputKey "${input.outputKey}".`,
        "RUNNER_EMPTY_FINAL_RESPONSE",
        502,
      );
    }

    if (!finalResponseText) {
      throw new BadGatewayError(input.noResponseMessage);
    }

    return finalResponseText;
  }
}

function tryParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function parseJson(
  value: string,
  input: {
    errorMessage: string;
    outputKey: string;
    userId: string;
    inputType: "pdf" | "text" | "file";
  },
): unknown {
  const parsed = tryParseJson(value);
  if (parsed === null) {
    logRunnerError("Runner response was not valid JSON.", {
      userId: input.userId,
      outputKey: input.outputKey,
      inputType: input.inputType,
      textPreview: truncateForLog(value),
    });
    throw new AppError(
      `${input.errorMessage} Received non-JSON model output.`,
      "RUNNER_INVALID_JSON",
      502,
    );
  }

  return parsed;
}

function parseSchemaOrThrow<T>(input: {
  schema: ZodType<T>;
  value: unknown;
  outputKey: string;
  userId: string;
  inputType: "pdf" | "text" | "file";
}): T {
  const parsed = input.schema.safeParse(input.value);
  if (!parsed.success) {
    logRunnerError("Runner JSON did not match expected schema.", {
      userId: input.userId,
      outputKey: input.outputKey,
      inputType: input.inputType,
      issues: parsed.error.issues,
    });
    throw new AppError(
      `Runner JSON for outputKey "${input.outputKey}" did not match the expected schema.`,
      "RUNNER_SCHEMA_MISMATCH",
      502,
    );
  }

  return parsed.data;
}

function mapRunnerErrorToAppError(message: string): AppError {
  const normalizedMessage = message.trim();
  const lowered = normalizedMessage.toLowerCase();

  if (
    lowered.includes("resource exhausted")
    || lowered.includes("error-code-429")
    || lowered.includes("\"code\":\"resource_exhausted\"")
  ) {
    return new AppError(
      normalizedMessage || "AI provider capacity is temporarily exhausted. Please retry shortly.",
      "UPSTREAM_429",
      429,
    );
  }

  return new BadGatewayError(normalizedMessage || "AI provider request failed.");
}

function truncateForLog(value: string, maxLength = 400): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}

function logRunnerError(message: string, details: Record<string, unknown>): void {
  console.error(`[PdfProcessingService] ${message}`, details);
}
