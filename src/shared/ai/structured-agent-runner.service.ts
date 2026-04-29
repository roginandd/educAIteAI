import type { Content } from "@google/genai";
import { isFinalResponse, stringifyContent, type Runner } from "@google/adk";
import type { ZodType } from "zod";

import { AppError } from "../errors/app-error";
import { BadGatewayError } from "../errors/bad-gateway-error";

interface RunStructuredPromptInput<T> {
  runner: Runner;
  userId: string;
  message: Content;
  outputKey: string;
  outputSchema: ZodType<T>;
  invalidJsonMessage: string;
  noResponseMessage: string;
}

export class StructuredAgentRunnerService {
  async runStructuredPrompt<T>(input: RunStructuredPromptInput<T>): Promise<T> {
    const finalResponseText = await this.runPrompt(input);
    const parsedJson = parseJson(finalResponseText, input.invalidJsonMessage, input.outputKey, input.userId);
    return parseSchemaOrThrow(parsedJson, input.outputSchema, input.outputKey, input.userId);
  }

  private async runPrompt<T>(input: RunStructuredPromptInput<T>): Promise<string> {
    let finalResponseText: string | null = null;
    let sawFinalResponse = false;
    const observedStateDeltaKeys = new Set<string>();

    for await (const event of input.runner.runEphemeral({
      userId: input.userId,
      newMessage: input.message,
    })) {
      if (event.errorMessage?.trim()) {
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
        return JSON.stringify(stateDelta[input.outputKey]);
      }

      const content = stringifyContent(event).trim();
      if (content) {
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

function parseJson(value: string, errorMessage: string, outputKey: string, userId: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new AppError(
      `${errorMessage} Received non-JSON model output for outputKey "${outputKey}" and userId "${userId}".`,
      "RUNNER_INVALID_JSON",
      502,
    );
  }
}

function parseSchemaOrThrow<T>(value: unknown, schema: ZodType<T>, outputKey: string, userId: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AppError(
      `Runner JSON for outputKey "${outputKey}" did not match the expected schema for userId "${userId}".`,
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
