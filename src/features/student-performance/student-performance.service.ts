import type { Content } from "@google/genai";
import { isFinalResponse, stringifyContent, type Runner } from "@google/adk";

import { performanceSummaryAiOutputSchema, type PerformanceSummaryAiOutput } from "../flashcards/flashcard.dto";
import {
  studentCoursePerformanceSummaryEvaluationContextResponseSchema,
  studentOverallPerformanceSummaryEvaluationContextResponseSchema,
  type StudentCoursePerformanceSummaryEvaluationContextResponse,
  type StudentOverallPerformanceSummaryEvaluationContextResponse,
} from "../flashcards/flashcard.response";
import { BadGatewayError } from "../../shared/errors/bad-gateway-error";

export class StudentPerformanceService {
  constructor(private readonly performanceSummaryRunner: Runner) {}

  async evaluateCourseSummary(
    input: StudentCoursePerformanceSummaryEvaluationContextResponse,
  ) {
    const parsedInput = studentCoursePerformanceSummaryEvaluationContextResponseSchema.parse(input);
    return this.generatePerformanceSummaryWithAgent("course", parsedInput);
  }

  async evaluateOverallSummary(
    input: StudentOverallPerformanceSummaryEvaluationContextResponse,
  ) {
    const parsedInput = studentOverallPerformanceSummaryEvaluationContextResponseSchema.parse(input);
    return this.generatePerformanceSummaryWithAgent("overall", parsedInput);
  }

  private async generatePerformanceSummaryWithAgent(
    summaryType: "course" | "overall",
    evaluationContext:
      | StudentCoursePerformanceSummaryEvaluationContextResponse
      | StudentOverallPerformanceSummaryEvaluationContextResponse,
  ) {
    const insufficientReason = getInsufficientPerformanceSummaryReason(summaryType, evaluationContext);
    if (insufficientReason) {
      return buildInsufficientPerformanceSummary(insufficientReason);
    }

    const finalResponseText = await this.runPerformanceSummaryAgent(summaryType, evaluationContext);
    const parsedJson = parseJson(finalResponseText, "Performance summary agent returned invalid JSON.");

    return normalizePerformanceSummaryAiOutput(performanceSummaryAiOutputSchema.parse(parsedJson));
  }

  private async runPerformanceSummaryAgent(
    summaryType: "course" | "overall",
    evaluationContext:
      | StudentCoursePerformanceSummaryEvaluationContextResponse
      | StudentOverallPerformanceSummaryEvaluationContextResponse,
  ): Promise<string> {
    const message: Content = {
      role: "user",
      parts: [{ text: buildPerformanceSummaryPrompt(summaryType, evaluationContext) }],
    };

    let finalResponseText: string | null = null;

    for await (const event of this.performanceSummaryRunner.runEphemeral({
      userId: `performance_summary_service_${summaryType}`,
      newMessage: message,
    })) {
      if (event.errorMessage) {
        throw new BadGatewayError(event.errorMessage);
      }

      if (!isFinalResponse(event)) {
        continue;
      }

      const structuredOutput = event.actions.stateDelta.performance_summary_output;
      if (structuredOutput) {
        return JSON.stringify(structuredOutput);
      }

      const content = stringifyContent(event).trim();
      if (content) {
        finalResponseText = content;
      }
    }

    if (!finalResponseText) {
      throw new BadGatewayError("Performance summary agent did not return a final response.");
    }

    return finalResponseText;
  }
}

function parseJson(value: string, errorMessage: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new BadGatewayError(errorMessage);
  }
}

function buildPerformanceSummaryPrompt(
  summaryType: "course" | "overall",
  evaluationContext:
    | StudentCoursePerformanceSummaryEvaluationContextResponse
    | StudentOverallPerformanceSummaryEvaluationContextResponse,
): string {
  const compactContext = serializePerformanceSummaryContext(summaryType, evaluationContext);

  return [
    `Evaluate the student's ${summaryType} performance summary and produce persisted AI summary text.`,
    "Return only JSON.",
    'Return exactly this shape: {"aiStatus":"...","aiInsight":"...","improvementSuggestion":"...","insufficientReason":null}',
    'Use null for aiInsight and improvementSuggestion only when aiStatus is "InsufficientSignal" and no valid non-zero evidence exists.',
    'When returning null insight fields, include "insufficientReason" with a short reason.',
    "Use only these aiStatus values: Pending, Completed, Failed, InsufficientSignal",
    "Rules:",
    "- Use only the supplied summary context.",
    "- Do not invent student behavior, trends, or course details not present in the input.",
    "- Ignore candidate courses or flashcards whose score signals are all zero.",
    "- aiInsight must be one concise grounded sentence.",
    "- improvementSuggestion must be one concrete study action.",
    "- If no valid non-zero score evidence exists, use InsufficientSignal with null aiInsight and null improvementSuggestion.",
    "- If the context is sparse but has non-zero score evidence, use conservative wording.",
    summaryType === "course"
      ? "- Focus on this course's current strengths, risks, and next best action."
      : "- Focus on the cross-course pattern and prioritization across the student's courses.",
    "",
    "Evaluation context:",
    JSON.stringify(compactContext),
  ].join("\n");
}

function serializePerformanceSummaryContext(
  summaryType: "course" | "overall",
  evaluationContext:
    | StudentCoursePerformanceSummaryEvaluationContextResponse
    | StudentOverallPerformanceSummaryEvaluationContextResponse,
): unknown {
  if (summaryType === "course") {
    const context = evaluationContext as StudentCoursePerformanceSummaryEvaluationContextResponse;
    return {
      studentCourseSqid: context.studentCourseSqid,
      courseName: context.courseName,
      edpCode: context.edpCode,
      summary: {
        ...context.summary,
        lastComputedAt: context.summary.lastComputedAt.toISOString(),
      },
      topRiskFlashcards: context.topRiskFlashcards.filter(hasNonZeroFlashcardSignal).slice(0, 5).map((flashcard) => ({
        flashcardSqid: flashcard.flashcardSqid,
        question: flashcard.question,
        masteryLevel: flashcard.masteryLevel,
        confidenceScore: flashcard.confidenceScore,
        retentionScore: flashcard.retentionScore,
        riskLevel: flashcard.riskLevel,
      })),
      skippedZeroScoreFlashcardCount: context.topRiskFlashcards.filter((flashcard) => !hasNonZeroFlashcardSignal(flashcard)).length,
    };
  }

  const context = evaluationContext as StudentOverallPerformanceSummaryEvaluationContextResponse;
  return {
    summary: {
      ...context.summary,
      lastComputedAt: context.summary.lastComputedAt.toISOString(),
    },
    courseBreakdown: context.courseBreakdown.filter(hasNonZeroCourseBreakdownSignal).slice(0, 5).map((course) => ({
      studentCourseSqid: course.studentCourseSqid,
      courseName: course.courseName,
      edpCode: course.edpCode,
      trackedFlashcardsCount: course.trackedFlashcardsCount,
      masteredFlashcardsCount: course.masteredFlashcardsCount,
      flashcardAccuracyRate: course.flashcardAccuracyRate,
      learningRetentionRate: course.learningRetentionRate,
      overallPerformanceScore: course.overallPerformanceScore,
      confidenceScore: course.confidenceScore,
      riskLevel: course.riskLevel,
      aiInsight: course.aiInsight,
    })),
    skippedZeroScoreCourseCount: context.courseBreakdown.filter((course) => !hasNonZeroCourseBreakdownSignal(course)).length,
  };
}

function normalizePerformanceSummaryAiOutput(output: PerformanceSummaryAiOutput): PerformanceSummaryAiOutput {
  if (output.aiStatus !== "InsufficientSignal" && (!output.aiInsight?.trim() || !output.improvementSuggestion?.trim())) {
    throw new BadGatewayError("Performance summary agent returned empty insight text for a sufficient signal.");
  }

  if (output.aiStatus === "InsufficientSignal" && !output.aiInsight && !output.improvementSuggestion) {
    return performanceSummaryAiOutputSchema.parse({
      ...output,
      insufficientReason: output.insufficientReason ?? "Insufficient non-zero performance data.",
    });
  }

  return output;
}

function buildInsufficientPerformanceSummary(insufficientReason: string): PerformanceSummaryAiOutput {
  return performanceSummaryAiOutputSchema.parse({
    aiStatus: "InsufficientSignal",
    aiInsight: null,
    improvementSuggestion: null,
    insufficientReason,
  });
}

function getInsufficientPerformanceSummaryReason(
  summaryType: "course" | "overall",
  evaluationContext:
    | StudentCoursePerformanceSummaryEvaluationContextResponse
    | StudentOverallPerformanceSummaryEvaluationContextResponse,
): string | null {
  if (summaryType === "course") {
    const context = evaluationContext as StudentCoursePerformanceSummaryEvaluationContextResponse;
    if (hasNonZeroSummarySignal(context.summary) || context.topRiskFlashcards.some(hasNonZeroFlashcardSignal)) {
      return null;
    }

    return "No non-zero course performance or flashcard risk score is available yet.";
  }

  const context = evaluationContext as StudentOverallPerformanceSummaryEvaluationContextResponse;
  if (hasNonZeroSummarySignal(context.summary) || context.courseBreakdown.some(hasNonZeroCourseBreakdownSignal)) {
    return null;
  }

  return "No non-zero overall performance or course breakdown score is available yet.";
}

function hasNonZeroSummarySignal(summary: {
  flashcardAccuracyRate?: number;
  learningRetentionRate?: number;
  confidenceScore?: number;
  overallPerformanceScore?: number;
}): boolean {
  return [
    summary.flashcardAccuracyRate,
    summary.learningRetentionRate,
    summary.confidenceScore,
    summary.overallPerformanceScore,
  ].some(isPositiveFiniteNumber);
}

function hasNonZeroFlashcardSignal(flashcard: {
  confidenceScore: number;
  retentionScore: number;
}): boolean {
  return [
    flashcard.confidenceScore,
    flashcard.retentionScore,
  ].some(isPositiveFiniteNumber);
}

function hasNonZeroCourseBreakdownSignal(course: {
  flashcardAccuracyRate: number;
  learningRetentionRate: number;
  confidenceScore: number;
  overallPerformanceScore: number;
}): boolean {
  return [
    course.flashcardAccuracyRate,
    course.learningRetentionRate,
    course.confidenceScore,
    course.overallPerformanceScore,
  ].some(isPositiveFiniteNumber);
}

function isPositiveFiniteNumber(value: number | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
