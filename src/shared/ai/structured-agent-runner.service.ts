import type { Content } from "@google/genai";
import { isFinalResponse, stringifyContent, type Runner } from "@google/adk";
import type { ZodError, ZodType } from "zod";

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

export interface StructuredPromptTrace<T> {
  data: T;
  rawResponseText: string;
  normalizedJson: unknown;
}

export class StructuredAgentRunnerService {
  async runStructuredPrompt<T>(input: RunStructuredPromptInput<T>): Promise<T> {
    const traced = await this.runStructuredPromptWithTrace(input);
    return traced.data;
  }

  async runStructuredPromptWithTrace<T>(input: RunStructuredPromptInput<T>): Promise<StructuredPromptTrace<T>> {
    const finalResponseText = await this.runPrompt(input);
    const parsedJson = parseJson(finalResponseText, input.invalidJsonMessage, input.outputKey, input.userId);
    const normalizedJson = normalizeStructuredOutput(parsedJson, input.outputKey);
    return {
      data: parseSchemaOrThrow(normalizedJson, input.outputSchema, input.outputKey, input.userId),
      rawResponseText: finalResponseText,
      normalizedJson,
    };
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
        return serializeStructuredOutputValue(stateDelta[input.outputKey]);
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

function serializeStructuredOutputValue(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  return JSON.stringify(value);
}

function parseJson(value: string, errorMessage: string, outputKey: string, userId: string): unknown {
  try {
    return unwrapStringifiedJson(JSON.parse(value) as unknown);
  } catch {
    console.error("[StructuredAgentRunnerService] Invalid JSON response", {
      outputKey,
      userId,
      rawResponseText: truncateForLog(value),
    });
    throw new AppError(
      `${errorMessage} Received non-JSON model output for outputKey "${outputKey}" and userId "${userId}".`,
      "RUNNER_INVALID_JSON",
      502,
    );
  }
}

function unwrapStringifiedJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return value;
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function parseSchemaOrThrow<T>(value: unknown, schema: ZodType<T>, outputKey: string, userId: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issueSummary = summarizeZodIssues(parsed.error);
    console.error("[StructuredAgentRunnerService] Schema mismatch", {
      outputKey,
      userId,
      issues: issueSummary,
      normalizedJson: truncateForLog(safeSerialize(value)),
    });
    throw new AppError(
      `Runner JSON for outputKey "${outputKey}" did not match the expected schema for userId "${userId}". Issues: ${issueSummary}`,
      "RUNNER_SCHEMA_MISMATCH",
      502,
    );
  }

  return parsed.data;
}

function normalizeStructuredOutput(value: unknown, outputKey: string): unknown {
  if (outputKey === "smart_quiz_item_generation_output") {
    return normalizeSmartQuizItemGenerationOutput(value);
  }

  if (outputKey === "smart_quiz_context_classification_output") {
    return normalizeSmartQuizContextClassificationOutput(value);
  }

  return value;
}

function normalizeSmartQuizItemGenerationOutput(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const drafts = Array.isArray(value.drafts)
    ? value.drafts.map((draft) => normalizeSmartQuizDraft(draft))
    : value.drafts;

  return {
    ...value,
    drafts,
  };
}

function normalizeSmartQuizContextClassificationOutput(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  return {
    ...value,
    inferredDomain: normalizeLearningDomain(value.inferredDomain),
    inferredTechnicalLanguage: normalizeTechnicalLanguage(value.inferredTechnicalLanguage),
    recommendedItemTypes: Array.isArray(value.recommendedItemTypes)
      ? value.recommendedItemTypes.map((itemType) => normalizeItemType(itemType))
      : value.recommendedItemTypes,
  };
}

function normalizeSmartQuizDraft(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const normalizedOptions = normalizeDraftOptions(value.options);
  const normalizedRubricCriteria = normalizeDraftRubricCriteria(value.rubricCriteria);
  const normalizedCorrectOptionIds = normalizeDraftCorrectOptionIds(value.correctOptionIds);
  const normalizedStarterCodeByLanguage = normalizeDraftStarterCodeByLanguage(
    value.starterCodeByLanguage,
    value.technicalLanguage,
  );
  const normalizedVisibleTestCases = normalizeDraftVisibleTestCases(value.visibleTestCases);
  const normalizedHiddenTestCases = normalizeDraftVisibleTestCases(value.hiddenTestCases);

  return {
    ...value,
    itemType: normalizeItemType(value.itemType),
    cognitiveSkill: normalizeCognitiveSkill(value.cognitiveSkill),
    learningDomain: normalizeLearningDomain(value.learningDomain),
    technicalLanguage: normalizeTechnicalLanguage(value.technicalLanguage),
    answeringGuidance: normalizeDraftAnsweringGuidance(value.answeringGuidance),
    options: normalizedOptions ?? value.options,
    correctOptionIds: normalizedCorrectOptionIds ?? value.correctOptionIds,
    rubricCriteria: normalizedRubricCriteria ?? value.rubricCriteria,
    starterCodeByLanguage: normalizedStarterCodeByLanguage ?? value.starterCodeByLanguage,
    visibleTestCases: normalizedVisibleTestCases ?? value.visibleTestCases,
    hiddenTestCases: normalizedHiddenTestCases ?? value.hiddenTestCases,
  };
}

function normalizeTechnicalLanguage(value: unknown): string {
  const raw = readString(value);
  if (!raw) {
    return "";
  }

  const normalized = raw.toLowerCase();
  const aliases: Array<[RegExp, string]> = [
    [/\bjavascript\b|\bnode(?:\.js)?\b|\becmascript\b|\bjs\b/, "JavaScript"],
    [/\btypescript\b|\bts\b/, "TypeScript"],
    [/\bpython\b|\bpython\s*3\b|\bpy\b/, "Python"],
    [/\bc#\b|\bcsharp\b|\bc sharp\b/, "C#"],
    [/\bc\+\+\b|\bcpp\b/, "C++"],
    [/\bc\b/, "C"],
    [/\bsql\b|\bpostgres(?:ql)?\b|\bmysql\b|\bsqlite\b/, "SQL"],
    [/\bhtml\b/, "HTML"],
    [/\bcss\b/, "CSS"],
    [/\bjava\b/, "Java"],
  ];

  for (const [pattern, label] of aliases) {
    if (pattern.test(normalized)) {
      return label;
    }
  }

  const firstPhrase = raw
    .replace(/[`*_#>\[\](){}]/g, " ")
    .split(/[.;:\n\r]/)[0]
    ?.trim()
    .replace(/\s+/g, " ");

  return firstPhrase ? firstPhrase.slice(0, 80).trim() : "";
}

function normalizeDraftAnsweringGuidance(value: unknown): unknown {
  if (value === null || value === undefined) {
    return "";
  }

  return value;
}

function normalizeDraftOptions(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((entry, index) => {
    if (typeof entry === "string" && entry.trim()) {
      return {
        id: String.fromCharCode(65 + index),
        text: entry.trim(),
      };
    }

    if (!isRecord(entry)) {
      return entry;
    }

    const text = readString(entry.text ?? entry.label ?? entry.value ?? entry.option);
    if (!text) {
      return entry;
    }

    return {
      ...entry,
      id: readString(entry.id ?? entry.key) ?? String.fromCharCode(65 + index),
      text,
    };
  });
}

function normalizeDraftRubricCriteria(value: unknown): unknown {
  if (typeof value === "string" && value.trim()) {
    return [createRubricCriterion(value.trim())];
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((entry) => {
    if (typeof entry === "string" && entry.trim()) {
      return createRubricCriterion(entry.trim());
    }

    return entry;
  });
}

function normalizeDraftCorrectOptionIds(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((entry) => {
    if (typeof entry === "number" && Number.isFinite(entry)) {
      return String(entry);
    }

    return entry;
  });
}

function normalizeDraftStarterCodeByLanguage(value: unknown, technicalLanguage: unknown): unknown {
  if (isRecord(value)) {
    return value;
  }

  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  const trimmed = value.trim();
  const parsed = tryParseJson(trimmed);
  if (isRecord(parsed)) {
    return parsed;
  }

  const language = readString(technicalLanguage) ?? "Generic";
  return {
    [language]: trimmed,
  };
}

function normalizeDraftVisibleTestCases(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry, index) => normalizeDraftVisibleTestCaseEntry(entry, index));
  }

  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  const trimmed = value.trim();
  const parsed = tryParseJson(trimmed);
  if (Array.isArray(parsed)) {
    return parsed;
  }

  return trimmed
    .split(/\n{2,}/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry, index) => normalizeDraftVisibleTestCaseEntry(entry, index));
}

function normalizeDraftVisibleTestCaseEntry(value: unknown, index: number): unknown {
  if (typeof value === "string") {
    const parsed = parseDraftVisibleTestCaseText(value, index);
    return parsed ?? value;
  }

  if (!isRecord(value)) {
    return value;
  }

  const input = readString(value.input ?? value.stdin ?? value.args);
  const expectedOutput = readString(value.expectedOutput ?? value.expected_output ?? value.output);
  if (!input || !expectedOutput) {
    return value;
  }

  return {
    ...value,
    name: readString(value.name ?? value.label) ?? `Test ${index + 1}`,
    input,
    expectedOutput,
  };
}

function parseDraftVisibleTestCaseText(value: string, index: number): { name: string; input: string; expectedOutput: string } | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const labeledMatch = trimmed.match(/input\s*:\s*([\s\S]+?)\s*(?:expected(?:\s*output)?|output)\s*:\s*([\s\S]+)/i);
  if (labeledMatch) {
    const input = labeledMatch[1]?.trim();
    const expectedOutput = labeledMatch[2]?.trim();
    return input && expectedOutput
      ? { name: `Test ${index + 1}`, input, expectedOutput }
      : null;
  }

  for (const separator of ["=>", "->", "|"]) {
    const separatorIndex = trimmed.indexOf(separator);
    if (separatorIndex <= 0) {
      continue;
    }

    const input = trimmed.slice(0, separatorIndex).trim();
    const expectedOutput = trimmed.slice(separatorIndex + separator.length).trim();
    if (input && expectedOutput) {
      return { name: `Test ${index + 1}`, input, expectedOutput };
    }
  }

  return null;
}

function createRubricCriterion(text: string): { name: string; weight: number; description: string } {
  return {
    name: text,
    weight: 100,
    description: text,
  };
}

function normalizeItemType(value: unknown): unknown {
  const normalizedKey = normalizeAliasKey(value);
  if (!normalizedKey) {
    return value;
  }

  const aliases: Record<string, string> = {
    coderead: "CodeReading",
    codereading: "CodeReading",
    debug: "Debugging",
    mcq: "MultipleChoice",
    multiplechoice: "MultipleChoice",
    short: "ShortAnswer",
    shortanswer: "ShortAnswer",
    output: "OutputPrediction",
    outputprediction: "OutputPrediction",
  };

  return aliases[normalizedKey] ?? value;
}

function normalizeCognitiveSkill(value: unknown): unknown {
  const normalizedKey = normalizeAliasKey(value);
  if (!normalizedKey) {
    return value;
  }

  const aliases: Record<string, string> = {
    recall: "Recall",
    remember: "Recall",
    memorization: "Recall",
    understand: "Understand",
    understanding: "Understand",
    comprehend: "Understand",
    comprehension: "Understand",
    apply: "Apply",
    application: "Apply",
    analyze: "Analyze",
    analysis: "Analyze",
    debug: "Debug",
    debugging: "Debug",
    troubleshoot: "Debug",
    design: "Design",
    create: "Design",
  };

  return aliases[normalizedKey] ?? value;
}

function normalizeLearningDomain(value: unknown): unknown {
  const normalizedKey = normalizeAliasKey(value);
  if (!normalizedKey) {
    return value;
  }

  const aliases: Record<string, string> = {
    unknown: "Unknown",
    programming: "Programming",
    coding: "Programming",
    computerscience: "Programming",
    softwaredevelopment: "Programming",
    development: "Programming",
    database: "Database",
    databases: "Database",
    sql: "Database",
    data: "Database",
    mathematics: "Math",
    math: "Math",
    maths: "Math",
    writing: "Writing",
    english: "Writing",
    business: "Business",
    entrepreneurship: "Business",
    generaleducation: "GeneralEducation",
    general: "GeneralEducation",
    education: "GeneralEducation",
  };

  return aliases[normalizedKey] ?? value;
}

function normalizeAliasKey(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, "");
  return normalized.length > 0 ? normalized : null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function summarizeZodIssues(error: ZodError): string {
  const summarized = error.issues
    .slice(0, 8)
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
      return `${path}: ${issue.message}`;
    });

  return summarized.length > 0 ? summarized.join("; ") : "Unknown schema validation failure.";
}

function safeSerialize(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable-json]";
  }
}

function truncateForLog(value: string, maxLength = 6000): string {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, maxLength)}... [truncated ${value.length - maxLength} chars]`;
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
