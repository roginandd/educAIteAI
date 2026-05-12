import { BadGatewayError } from "../../shared/errors/bad-gateway-error";
import type {
  CreateBulkFlashcardItem,
  GenerateFlashcardsFromNoteInput,
  SubmitAndAnalyzeFlashcardInput,
  SubmitFlashcardLearnAnswerInput,
} from "./flashcard.dto";

export type SuppliedFlashcardContext = {
  itemType?: string;
  question?: string;
  expectedAnswer?: string;
  conceptExplanation?: string;
  answeringGuidance?: string;
  acceptedAnswerAliases?: string[];
  cognitiveSkill?: string;
  learningDomain?: string;
  technicalLanguage?: string;
  rubricJson?: string;
  validationConfigJson?: string;
};

function tryParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export function parseJson(value: string, errorMessage: string): unknown {
  const parsed = tryParseJson(value);
  if (parsed === null) {
    throw new BadGatewayError(errorMessage);
  }

  return parsed;
}

export function toFlashcardSessionScopeTypeValue(scopeType: "Course" | "Overall"): number {
  switch (scopeType) {
    case "Course":
      return 1;
    case "Overall":
      return 2;
    default:
      return 1;
  }
}

export function buildSuppliedFlashcardContext(input: SubmitAndAnalyzeFlashcardInput | SubmitFlashcardLearnAnswerInput): SuppliedFlashcardContext {
  return {
    itemType: input.itemType,
    question: input.question,
    expectedAnswer: input.expectedAnswer,
    conceptExplanation: input.conceptExplanation,
    answeringGuidance: input.answeringGuidance,
    acceptedAnswerAliases: input.acceptedAnswerAliases,
    cognitiveSkill: input.cognitiveSkill,
    learningDomain: input.learningDomain,
    technicalLanguage: input.technicalLanguage,
    rubricJson: input.rubricJson,
    validationConfigJson: input.validationConfigJson,
  };
}

export function trimSourceTextForPreview(noteContent: string): string {
  const normalized = noteContent
    .replace(/\r\n/g, "\n")
    .replace(/^.*Page \d+\s*$/gim, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (normalized.length <= 3500) {
    return normalized;
  }

  const headLength = 2400;
  const tailLength = 900;
  return `${normalized.slice(0, headLength).trim()}\n\n[content truncated for preview]\n\n${normalized.slice(-tailLength).trim()}`;
}

export function inferPreviewItemTypes(noteContent: string, requestedItemTypes: string[]): string[] {
  if (requestedItemTypes.length > 0) {
    return requestedItemTypes;
  }

  if (!isProgrammingFocusedSource(noteContent, "")) {
    return ["Flashcard", "Conceptual", "ShortAnswer"];
  }

  return ["Algorithm", "CodeReading", "OutputPrediction", "Debugging", "ShortAnswer", "Conceptual"];
}

export function isProgrammingFocusedSource(noteContent: string, technicalLanguage: string): boolean {
  const normalized = noteContent.toLowerCase();
  if (technicalLanguage.trim().length > 0) {
    return true;
  }

  const hasCodeSyntaxSignal =
    /```|class\s+\w+|public\s+class|public\s+static|def\s+\w+\s*\(|function\s+\w+\s*\(|console\.log|console\.writeline|system\.out\.println|#include|std::|select\s+.+\s+from|import\s+[\w.*{}]+|using\s+\w+|package\s+\w+|return\s+.+|if\s*\(|else\b|for\s*\(|while\s*\(|try\s*\{|catch\s*\(|=>|;\s*$|\{\s*$/im.test(noteContent);

  const hasProgrammingVocabularySignal =
    /\b(programming|algorithm|code|method|function|class|object|interface|module|package|namespace|array|list|map|set|dictionary|hashmap|hashset|loop|recursion|debug|bug|exception|runtime|compiler|test case|time complexity|space complexity|binary search|sliding window|two pointers|dfs|bfs|dynamic programming|sorting|graph|tree|sql|api|endpoint|request|response|implementation|compiler error|runtime error)\b/i.test(normalized);

  const hasLanguageSignal =
    /\b(java|python|javascript|typescript|csharp|sql|go|golang|rust|php|ruby|kotlin|swift|dart)\b/i.test(normalized)
    || /c\s*#|c\+\+/i.test(noteContent);

  return hasCodeSyntaxSignal || hasProgrammingVocabularySignal || hasLanguageSignal;
}

export function normalizePreviewDraft(
  draft: CreateBulkFlashcardItem,
  noteContent: string,
  input: GenerateFlashcardsFromNoteInput,
): CreateBulkFlashcardItem {
  const normalizedDraft = normalizeDraftForDelivery(
    draft.itemType === "MultipleChoice"
      ? {
          ...draft,
          itemType: "ShortAnswer",
        }
      : draft,
    noteContent,
    input,
  );

  return {
    ...normalizedDraft,
    validationConfigJson: {},
  };
}

export function normalizeDraftForDelivery(
  draft: CreateBulkFlashcardItem,
  noteContent: string,
  input: GenerateFlashcardsFromNoteInput,
): CreateBulkFlashcardItem {
  const technicalLanguage = draft.technicalLanguage?.trim()
    || input.technicalLanguage?.trim()
    || inferTechnicalLanguage(noteContent)
    || "Generic";
  const codeSnippet = extractCodeSnippetForDraft(noteContent, draft);
  const normalizedValidationConfig = { ...draft.validationConfigJson };
  let normalizedDraft: CreateBulkFlashcardItem = {
    ...draft,
    answer: normalizeDraftAnswer(draft),
    conceptExplanation: normalizeConceptExplanation(draft),
    answeringGuidance: normalizeAnsweringGuidance(draft),
    acceptedAnswerAliases: normalizeAcceptedAnswerAliases(draft),
    technicalLanguage,
    rubricJson: normalizeRubricJson(draft),
    validationConfigJson: normalizedValidationConfig,
  };

  switch (normalizedDraft.itemType) {
    case "CodeReading": {
      const existingCodeSnippet = readStringConfig(normalizedValidationConfig, "codeSnippet");
      const finalCodeSnippet = existingCodeSnippet || codeSnippet;
      if (!finalCodeSnippet) {
        normalizedDraft = convertToShortAnswerInsteadOfConceptual(normalizedDraft);
        break;
      }

      normalizedValidationConfig.codeSnippet = finalCodeSnippet;
      normalizedValidationConfig.language ??= technicalLanguage;
      break;
    }
    case "OutputPrediction": {
      const existingCodeSnippet = readStringConfig(normalizedValidationConfig, "codeSnippet");
      const finalCodeSnippet = existingCodeSnippet || codeSnippet;
      if (!finalCodeSnippet) {
        normalizedDraft = convertToShortAnswerInsteadOfConceptual(normalizedDraft);
        break;
      }

      normalizedValidationConfig.codeSnippet = finalCodeSnippet;
      normalizedValidationConfig.expectedOutput ??= normalizedDraft.answer;
      break;
    }
    case "Algorithm": {
      const existingFunctionSignature = readStringConfig(normalizedValidationConfig, "functionSignature");
      const existingStarterCode = normalizedValidationConfig.starterCodeByLanguage;
      const starterCodeByLanguage = normalizeStarterCodeByLanguage(existingStarterCode, technicalLanguage);
      const visibleTestCases = normalizeVisibleTestCases(normalizedValidationConfig.visibleTestCases);
      if (
        !existingFunctionSignature
        || !starterCodeByLanguage
        || !visibleTestCases
        || !looksLikeAlgorithmPrompt(normalizedDraft.question)
      ) {
        normalizedDraft = convertToShortAnswerInsteadOfConceptual(normalizedDraft);
        break;
      }

      normalizedValidationConfig.functionSignature = existingFunctionSignature;
      normalizedValidationConfig.starterCodeByLanguage = starterCodeByLanguage;
      normalizedValidationConfig.visibleTestCases = visibleTestCases;
      normalizedValidationConfig.languagePolicy = normalizeLanguagePolicy(
        normalizedValidationConfig.languagePolicy,
        technicalLanguage,
      );
      normalizedValidationConfig.supportedLanguages = normalizeSupportedLanguages(
        normalizedValidationConfig.supportedLanguages,
        technicalLanguage,
      );
      break;
    }
    case "Debugging": {
      const existingBuggyCode = readStringConfig(normalizedValidationConfig, "buggyCode");
      const finalBuggyCode = ensureJudge0ProgramShape(existingBuggyCode || codeSnippet, technicalLanguage);
      const visibleTestCases = normalizeVisibleTestCases(normalizedValidationConfig.visibleTestCases);
      if (!finalBuggyCode) {
        normalizedDraft = convertToShortAnswerInsteadOfConceptual(normalizedDraft);
        break;
      }

      normalizedValidationConfig.buggyCode = finalBuggyCode;
      if (!visibleTestCases) {
        normalizedDraft = convertToShortAnswerInsteadOfConceptual(normalizedDraft);
        break;
      }

      normalizedValidationConfig.visibleTestCases = visibleTestCases;
      break;
    }
  }

  return {
    ...normalizedDraft,
    technicalLanguage,
    conceptExplanation: normalizeConceptExplanation(normalizedDraft),
    answeringGuidance: normalizeAnsweringGuidance(normalizedDraft),
    acceptedAnswerAliases: normalizeAcceptedAnswerAliases(normalizedDraft),
    rubricJson: normalizeRubricJson(normalizedDraft),
    validationConfigJson: normalizedValidationConfig,
  };
}

function convertToShortAnswerInsteadOfConceptual(draft: CreateBulkFlashcardItem): CreateBulkFlashcardItem {
  return {
    ...draft,
    itemType: "ShortAnswer",
    answer: normalizeDraftAnswer({
      ...draft,
      itemType: "ShortAnswer",
    }),
    conceptExplanation: normalizeConceptExplanation({
      ...draft,
      itemType: "ShortAnswer",
    }),
    answeringGuidance: normalizeAnsweringGuidance({
      ...draft,
      itemType: "ShortAnswer",
    }),
    rubricJson: normalizeRubricJson({
      ...draft,
      itemType: "ShortAnswer",
    }),
    validationConfigJson: {},
  };
}

export function inferTechnicalLanguage(noteContent: string): string {
  if (/\bjava\b|import\s+java\.|system\.out\.println|public\s+static\s+void\s+main|arraylist\s*<|hashmap\s*<|hashset\s*<\s*integer|throws\s+exception/i.test(noteContent)) {
    return "Java";
  }

  if (/c\s*#|csharp|console\.writeline|namespace\s+\w+|using\s+system|list\s*<|dictionary\s*<|hashset\s*</i.test(noteContent)) {
    return "C#";
  }

  if (/\bpython\b|def\s+\w+\s*\(|print\s*\(|self\b|if\s+__name__\s*==\s*["']__main__["']/i.test(noteContent)) {
    return "Python";
  }

  if (/\btypescript\b|interface\s+\w+|type\s+\w+\s*=|:\s*string\b|:\s*number\b|promise\s*</i.test(noteContent)) {
    return "TypeScript";
  }

  if (/\bjavascript\b|console\.log|function\s+\w+\s*\(|\blet\b|\bconst\b|\bvar\b|module\.exports|document\.queryselector/i.test(noteContent)) {
    return "JavaScript";
  }

  if (/c\+\+|#include|std::|cout\s*<<|cin\s*>>|vector\s*<|unordered_map|unordered_set|int\s+main\s*\(/i.test(noteContent)) {
    return "C++";
  }

  if (/\bsql\b|select\s+.+\s+from|insert\s+into|update\s+.+\s+set|delete\s+from|join\s+.+\s+on|group\s+by|order\s+by/i.test(noteContent)) {
    return "SQL";
  }

  if (/\bgo\b|package\s+main|func\s+\w+\s*\(|fmt\.println|map\s*\[.*\]/i.test(noteContent)) {
    return "Go";
  }

  if (/\brust\b|fn\s+\w+\s*\(|println!|let\s+mut|vec!|hashmap/i.test(noteContent)) {
    return "Rust";
  }

  if (/\bphp\b|<\?php|function\s+\w+\s*\(|echo\s+/i.test(noteContent)) {
    return "PHP";
  }

  if (/\bruby\b|def\s+\w+|puts\s+|end\b/i.test(noteContent)) {
    return "Ruby";
  }

  if (/\bkotlin\b|fun\s+\w+\s*\(|println\s*\(|val\s+\w+|var\s+\w+/i.test(noteContent)) {
    return "Kotlin";
  }

  if (/\bswift\b|func\s+\w+\s*\(|print\s*\(|let\s+\w+|var\s+\w+/i.test(noteContent)) {
    return "Swift";
  }

  if (/\bdart\b|void\s+main\s*\(|print\s*\(|final\s+\w+|class\s+\w+/i.test(noteContent)) {
    return "Dart";
  }

  return "";
}

function extractRepresentativeCodeSnippet(noteContent: string): string {
  const normalized = noteContent.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const codeLineIndexes = lines
    .map((line, index) => ({ line: line.trim(), index }))
    .filter(({ line }) => /[;{}()]|system\.out\.println|console\.log|^\w+\s+\w+\s*=|^class\s+\w+|^public\s+/.test(line))
    .map(({ index }) => index);

  if (codeLineIndexes.length === 0) {
    return "";
  }

  const start = Math.max(0, codeLineIndexes[0] - 1);
  let end = start;

  while (end < lines.length) {
    const current = lines[end].trim();
    if (end > start && current.length === 0) {
      break;
    }

    if (end > start + 12) {
      break;
    }

    end++;
  }

  return lines
    .slice(start, end)
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function extractCodeSnippetForDraft(noteContent: string, draft: CreateBulkFlashcardItem): string {
  const fromQuestion = extractCodeSnippetFromQuestion(draft.question);
  if (fromQuestion) {
    return fromQuestion;
  }

  const fromLocalWindow = extractLocalCodeWindow(noteContent, draft.question);
  if (fromLocalWindow) {
    return fromLocalWindow;
  }

  return "";
}

function extractCodeSnippetFromQuestion(question: string): string {
  const normalizedQuestion = question.replace(/\s+/g, " ").trim();
  const markers = [
    "following code?",
    "following code:",
    "given code?",
    "given code:",
    "code snippet:",
    "snippet:",
  ];

  for (const marker of markers) {
    const markerIndex = normalizedQuestion.toLowerCase().indexOf(marker);
    if (markerIndex < 0) {
      continue;
    }

    const candidate = normalizedQuestion.slice(markerIndex + marker.length).trim();
    const formatted = formatInlineCodeSnippet(candidate);
    if (looksLikeCodeSnippet(formatted)) {
      return formatted;
    }
  }

  return "";
}

function extractLocalCodeWindow(noteContent: string, question: string): string {
  const normalizedContent = noteContent.replace(/\r\n/g, "\n");
  const anchors = question
    .split(/[^A-Za-z0-9_.]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 8)
    .slice(0, 8);

  const anchor = anchors.find((token) => normalizedContent.toLowerCase().includes(token.toLowerCase()));
  if (!anchor) {
    return "";
  }

  const anchorIndex = normalizedContent.toLowerCase().indexOf(anchor.toLowerCase());
  if (anchorIndex < 0) {
    return "";
  }

  const start = Math.max(0, anchorIndex - 180);
  const end = Math.min(normalizedContent.length, anchorIndex + 420);
  const window = normalizedContent.slice(start, end);
  const formatted = formatInlineCodeSnippet(window);
  return isStrictCodeSnippet(formatted) ? formatted : "";
}

function formatInlineCodeSnippet(value: string): string {
  return value
    .replace(/\s*;\s*/g, ";\n")
    .replace(/\s*\{\s*/g, " {\n")
    .replace(/\s*\}\s*/g, "\n}\n")
    .replace(/\)\s*(?=(System\.out\.println|console\.log|return\b|if\b|for\b|while\b))/g, ")\n")
    .replace(/\s{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function looksLikeCodeSnippet(value: string): boolean {
  return /[;{}()]|System\.out\.println|console\.log|return\b|class\s+\w+|public\s+/.test(value);
}

function isStrictCodeSnippet(value: string): boolean {
  if (!looksLikeCodeSnippet(value)) {
    return false;
  }

  if (value.length > 600) {
    return false;
  }

  if (/flashcard generator test case|purpose:|suggested flashcard targets|this is polymorphism|expected flashcard coverage/i.test(value)) {
    return false;
  }

  const wordCount = value.split(/\s+/).filter(Boolean).length;
  const symbolCount = (value.match(/[;{}()=<>\[\].,+\-*/%]/g) ?? []).length;
  return symbolCount >= 6 || wordCount <= 60;
}

function looksLikeAlgorithmPrompt(question: string): boolean {
  return /\b(algorithm|implement|write a function|write code|leetcode|time complexity|space complexity|solve)\b/i.test(question);
}

function readStringConfig(config: Record<string, unknown>, key: string): string {
  const value = config[key];
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStarterCodeByLanguage(value: unknown, technicalLanguage: string): Record<string, string> | null {
  const language = technicalLanguage || "Generic";
  if (!isStringRecord(value)) {
    return null;
  }

  const normalizedEntries = Object.entries(value)
    .map(([key, starterCode]) => [key.trim(), ensureJudge0ProgramShape(starterCode.trim(), key || technicalLanguage)] as const)
    .filter(([key, starterCode]) => key && starterCode && !looksLikeStaticStarterCode(starterCode));

  if (normalizedEntries.length === 0) {
    return null;
  }

  const hasSelectedLanguage = normalizedEntries.some(([key]) => key.toLowerCase() === language.toLowerCase());
  const hasGenericLanguage = normalizedEntries.some(([key]) => key.toLowerCase() === "generic");
  if (!hasSelectedLanguage && language !== "Generic" && !hasGenericLanguage) {
    return null;
  }

  return Object.fromEntries(normalizedEntries);
}

function normalizeVisibleTestCases(value: unknown, minimumCount = 1): Array<{ name: string; input: string; expectedOutput: string; explanation: string }> | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const concreteTestCases = value.flatMap((testCase, index) => {
    if (!isUnknownRecord(testCase)) {
      return [];
    }

    const name = typeof testCase.name === "string" && testCase.name.trim()
      ? testCase.name.trim()
      : typeof testCase.label === "string" && testCase.label.trim()
        ? testCase.label.trim()
        : `Test ${index + 1}`;
    const input = typeof testCase.input === "string" ? testCase.input.trim() : "";
    const expectedOutput = typeof testCase.expectedOutput === "string" ? testCase.expectedOutput.trim() : "";
    const explanation = typeof testCase.explanation === "string" ? testCase.explanation.trim() : "";
    const isConcrete = !!input
      && !!expectedOutput
      && !/^(sample|second sample|example)/i.test(input)
      && !/^(sample|expected|example)/i.test(expectedOutput);

    return isConcrete
      ? [{ name, input, expectedOutput, explanation }]
      : [];
  });

  return concreteTestCases.length >= minimumCount ? concreteTestCases : null;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function looksLikeStaticStarterCode(value: string): boolean {
  return /\bsolve\s*\(\s*(object\s+)?input\s*\)|write your (code|query) here|your_table|sample input|second sample input/i.test(value);
}

function ensureJudge0ProgramShape(code: string, language: string): string {
  const trimmed = code.trim();
  if (!trimmed) {
    return trimmed;
  }

  const normalizedLanguage = language.trim().toLowerCase();
  switch (normalizedLanguage) {
    case "java":
      return ensureJavaProgramShape(trimmed);
    case "c#":
    case "csharp":
    case "cs":
      return ensureCSharpProgramShape(trimmed);
    default:
      return trimmed;
  }
}

function ensureJavaProgramShape(code: string): string {
  if (/\b(class|record|interface|enum)\s+\w+/.test(code)) {
    return code;
  }

  if (/\b(public|private|protected)?\s*(static\s+)?[\w<>\[\]]+\s+\w+\s*\([^)]*\)\s*\{/.test(code)) {
    return `public class Main {\n${indentBlock(code)}\n}`;
  }

  return [
    "public class Main {",
    "  public static void main(String[] args) {",
    indentBlock(code, 4),
    "  }",
    "}",
  ].join("\n");
}

function ensureCSharpProgramShape(code: string): string {
  if (/\b(class|record|interface|struct|enum)\s+\w+/.test(code)) {
    return code;
  }

  if (/\b(public|private|protected|internal)?\s*(static\s+)?[\w<>\[\],?]+\s+\w+\s*\([^)]*\)\s*\{/.test(code)) {
    return [
      "using System;",
      "",
      "public class Program",
      "{",
      indentBlock(code),
      "}",
    ].join("\n");
  }

  return [
    "using System;",
    "",
    "public class Program",
    "{",
    "    public static void Main(string[] args)",
    "    {",
    indentBlock(code, 8),
    "    }",
    "}",
  ].join("\n");
}

function indentBlock(value: string, spaces = 2): string {
  const prefix = " ".repeat(spaces);
  return value
    .split(/\r?\n/)
    .map((line) => line.trim().length > 0 ? `${prefix}${line}` : line)
    .join("\n");
}

function normalizeLanguagePolicy(value: unknown, technicalLanguage: string): "source-language" | "any" {
  if (value === "source-language" || value === "any") {
    return value;
  }

  return technicalLanguage && technicalLanguage !== "Generic" ? "source-language" : "any";
}

function normalizeSupportedLanguages(value: unknown, technicalLanguage: string): string[] {
  if (Array.isArray(value)) {
    const languages = value
      .filter((language): language is string => typeof language === "string")
      .map((language) => language.trim())
      .filter(Boolean);

    if (languages.length > 0) {
      return [...new Set(languages)];
    }
  }

  return technicalLanguage && technicalLanguage !== "Generic" ? [technicalLanguage] : [];
}

export function mapDraftToAiResponse(draft: CreateBulkFlashcardItem) {
  const explanation = normalizeConceptExplanation(draft);
  const answeringGuidance = normalizeAnsweringGuidance(draft);
  const expectedAnswer = normalizeDraftAnswer(draft);
  const tags = normalizeTags(draft);
  const rubricCriteria = normalizeRubricCriteria(draft);
  const validationConfig = normalizeValidationConfig(draft.validationConfigJson);
  const commonFields = {
    itemType: draft.itemType,
    question: draft.question.trim(),
    explanation,
    answeringGuidance,
    difficulty: draft.difficulty,
    cognitiveSkill: draft.cognitiveSkill,
    learningDomain: draft.learningDomain,
    technicalLanguage: draft.technicalLanguage.trim(),
    tags,
  };

  switch (draft.itemType) {
    case "Flashcard":
      return {
        ...commonFields,
        itemType: "Flashcard" as const,
        answer: expectedAnswer,
        acceptedAnswerAliases: normalizeAcceptedAnswerAliases(draft),
      };
    case "Conceptual":
      return {
        ...commonFields,
        itemType: "Conceptual" as const,
        expectedAnswer,
        rubricCriteria,
      };
    case "ShortAnswer":
      return {
        ...commonFields,
        itemType: "ShortAnswer" as const,
        expectedAnswer,
        rubricCriteria,
      };
    case "MultipleChoice":
      return {
        ...commonFields,
        itemType: "MultipleChoice" as const,
        options: readOptions(validationConfig),
        correctOptionIds: readStringArray(validationConfig, "correctOptionIds"),
        singleSelect: readBoolean(validationConfig, "singleSelect", true),
      };
    case "CodeReading":
      return {
        ...commonFields,
        itemType: "CodeReading" as const,
        expectedAnswer,
        codeSnippet: readString(validationConfig, "codeSnippet"),
        language: readString(validationConfig, "language", draft.technicalLanguage.trim()),
      };
    case "Debugging":
      return {
        ...commonFields,
        itemType: "Debugging" as const,
        expectedAnswer,
        buggyCode: readString(validationConfig, "buggyCode"),
        visibleTestCases: readVisibleTestCases(validationConfig, "visibleTestCases"),
        expectedFixSummary: readOptionalString(validationConfig, "expectedFixSummary")
          ?? readOptionalString(readObject(validationConfig, "private"), "expectedFix"),
      };
    case "Algorithm":
      return {
        ...commonFields,
        itemType: "Algorithm" as const,
        expectedAnswer,
        functionSignature: readString(validationConfig, "functionSignature"),
        supportedLanguages: readSupportedLanguages(validationConfig, draft.technicalLanguage.trim()),
        starterCodeByLanguage: readStringMap(validationConfig, "starterCodeByLanguage"),
        visibleTestCases: readVisibleTestCases(validationConfig, "visibleTestCases"),
        languagePolicy: readOptionalString(validationConfig, "languagePolicy"),
      };
    case "OutputPrediction":
      return {
        ...commonFields,
        itemType: "OutputPrediction" as const,
        codeSnippet: readString(validationConfig, "codeSnippet"),
        expectedOutput: readString(validationConfig, "expectedOutput", expectedAnswer),
        language: readString(validationConfig, "language", draft.technicalLanguage.trim()),
      };
    default:
      return {
        ...commonFields,
        itemType: "Flashcard" as const,
        answer: expectedAnswer,
        acceptedAnswerAliases: normalizeAcceptedAnswerAliases(draft),
      };
  }
}

function normalizeDraftAnswer(draft: CreateBulkFlashcardItem): string {
  const answer = draft.answer.trim();
  if (answer) {
    return answer;
  }

  const explanation = draft.conceptExplanation.trim();
  if (explanation) {
    return explanation;
  }

  switch (draft.itemType) {
    case "Algorithm":
      return "Describe the correct algorithm, why it works, and the expected time and space complexity.";
    case "CodeReading":
      return "Explain what the code does and the key behavior it demonstrates.";
    case "OutputPrediction":
      return "State the exact output, return value, or final state produced by the code.";
    case "Debugging":
      return "Identify the bug and explain the concrete fix.";
    case "Conceptual":
    case "ShortAnswer":
      return "Provide the canonical answer grounded in the source material.";
    default:
      return "Provide the grounded expected answer from the source material.";
  }
}

function normalizeConceptExplanation(draft: CreateBulkFlashcardItem): string {
  const explanation = draft.conceptExplanation.trim();
  if (explanation) {
    return explanation;
  }

  switch (draft.itemType) {
    case "Algorithm":
      return "Explain the intended approach, the main data structures, and why the complexity fits the problem.";
    case "CodeReading":
      return "Explain the execution flow and the important behavior shown in the snippet.";
    case "OutputPrediction":
      return "Explain the evaluation steps that lead to the final output or state.";
    case "Debugging":
      return "Explain why the bug occurs and why the proposed fix resolves it.";
    case "Conceptual":
    case "ShortAnswer":
      return draft.answer.trim();
    default:
      return "";
  }
}

function normalizeAnsweringGuidance(draft: CreateBulkFlashcardItem): string {
  const guidance = draft.answeringGuidance.trim();
  if (guidance) {
    return guidance;
  }

  switch (draft.itemType) {
    case "Algorithm":
      return "State the algorithm, justify the key steps, and include time and space complexity.";
    case "CodeReading":
      return "Describe the code behavior directly from the snippet without rewriting the whole program.";
    case "OutputPrediction":
      return "Give only the final output, return value, or final state, then briefly justify it if needed.";
    case "Debugging":
      return "Name the bug, show the fix, and explain the failure mode briefly.";
    case "Conceptual":
      return "Answer in one or two grounded sentences using the source terminology.";
    case "ShortAnswer":
      return "Answer briefly using the exact technical term, rule, or result from the source.";
    default:
      return "";
  }
}

function normalizeAcceptedAnswerAliases(draft: CreateBulkFlashcardItem): string[] {
  return [...new Set(
    draft.acceptedAnswerAliases
      .map((alias) => alias.trim())
      .filter(Boolean),
  )];
}

function normalizeRubricJson(draft: CreateBulkFlashcardItem): Record<string, unknown> {
  if (hasMeaningfulRubric(draft.rubricJson)) {
    return draft.rubricJson;
  }

  if (draft.itemType === "Conceptual" || draft.itemType === "ShortAnswer") {
    return {
      criteria: [
        {
          name: "correctness",
          weight: 1,
          description: draft.answer.trim() || "Matches the source material.",
        },
      ],
    };
  }

  if (draft.itemType === "Algorithm" || draft.itemType === "Debugging" || draft.itemType === "CodeReading" || draft.itemType === "OutputPrediction") {
    return {
      criteria: [
        {
          name: "technical-correctness",
          weight: 1,
          description: "Matches the behavior or solution grounded in the source material.",
        },
      ],
    };
  }

  return draft.rubricJson;
}

function hasMeaningfulRubric(value: Record<string, unknown>): boolean {
  if (Array.isArray(value.criteria) && value.criteria.length > 0) {
    return true;
  }

  if (Array.isArray(value.requiredIdeas) && value.requiredIdeas.length > 0) {
    return true;
  }

  return false;
}

function normalizeTags(draft: CreateBulkFlashcardItem): string[] {
  return [...new Set(
    (draft.tagsJson ?? [])
      .map((tag) => tag.trim())
      .filter(Boolean),
  )];
}

function normalizeRubricCriteria(draft: CreateBulkFlashcardItem): Array<{ name: string; weight: number; description: string }> {
  const rubric = normalizeRubricJson(draft);
  const criteria = Array.isArray(rubric.criteria) ? rubric.criteria : [];

  return criteria
    .filter((criterion): criterion is Record<string, unknown> => isRecord(criterion))
    .map((criterion) => ({
      name: readString(criterion, "name", "correctness"),
      weight: readNumber(criterion, "weight", 1),
      description: readString(criterion, "description"),
    }));
}

function normalizeValidationConfig(value: Record<string, unknown>): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function readOptions(value: Record<string, unknown>): Array<{ id: string; text: string }> {
  const options = Array.isArray(value.options) ? value.options : [];

  return options
    .filter((option): option is Record<string, unknown> => isRecord(option))
    .map((option, index) => ({
      id: readString(option, "id", String.fromCharCode(65 + index)),
      text: readString(option, "text"),
    }))
    .filter((option) => option.text.length > 0);
}

function readVisibleTestCases(value: Record<string, unknown>, key: string): Array<{ name: string; input: string; expectedOutput: string; explanation: string }> {
  const testCases = Array.isArray(value[key]) ? value[key] : [];

  return testCases
    .filter((testCase): testCase is Record<string, unknown> => isRecord(testCase))
    .map((testCase, index) => ({
      name: readString(testCase, "name", readString(testCase, "label", `Test ${index + 1}`)),
      input: readString(testCase, "input"),
      expectedOutput: readString(testCase, "expectedOutput"),
      explanation: readString(testCase, "explanation"),
    }))
    .filter((testCase) => testCase.input.length > 0 && testCase.expectedOutput.length > 0);
}

function readSupportedLanguages(value: Record<string, unknown>, technicalLanguage: string): string[] {
  const explicit = readStringArray(value, "supportedLanguages");
  if (explicit.length > 0) {
    return explicit;
  }

  return technicalLanguage ? [technicalLanguage] : [];
}

function readStringMap(value: Record<string, unknown>, key: string): Record<string, string> {
  const map = value[key];
  if (!isRecord(map)) {
    return {};
  }

  return Object.entries(map).reduce<Record<string, string>>((result, [entryKey, entryValue]) => {
    if (typeof entryValue === "string" && entryKey.trim() && entryValue.trim()) {
      result[entryKey.trim()] = entryValue.trim();
    }

    return result;
  }, {});
}

function readStringArray(value: Record<string, unknown>, key: string): string[] {
  const items = Array.isArray(value[key]) ? value[key] : [];
  return [...new Set(
    items
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean),
  )];
}

function readObject(value: Record<string, unknown>, key: string): Record<string, unknown> {
  return isRecord(value[key]) ? value[key] : {};
}

function readString(value: Record<string, unknown>, key: string, fallback = ""): string {
  const candidate = value[key];
  return typeof candidate === "string" ? candidate.trim() : fallback;
}

function readOptionalString(value: Record<string, unknown>, key: string): string | undefined {
  const candidate = value[key];
  if (typeof candidate !== "string") {
    return undefined;
  }

  const normalized = candidate.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function readBoolean(value: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const candidate = value[key];
  return typeof candidate === "boolean" ? candidate : fallback;
}

function readNumber(value: Record<string, unknown>, key: string, fallback: number): number {
  const candidate = value[key];
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
