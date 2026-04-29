import type { Content } from "@google/genai";
import { isFinalResponse, stringifyContent, type Runner } from "@google/adk";

import { env } from "../../config/env";
import { AppError } from "../../shared/errors/app-error";
import { BadGatewayError } from "../../shared/errors/bad-gateway-error";
import { UnauthorizedError } from "../../shared/errors/unauthorized-error";
import { UpstreamHttpClient } from "../../shared/http/upstream-http-client";
import {
  createBulkFlashcardsRequestSchema,
  getActiveFlashcardLearnSessionInputSchema,
  flashcardEvaluationOutputSchema,
  flashcardGenerationOutputSchema,
  generateFlashcardsFromNoteInputSchema,
  noteApiResponseSchema,
  startFlashcardLearnSessionInputSchema,
  submitEvaluatedFlashcardSessionAnswerRequestSchema,
  submitFlashcardLearnAnswerInputSchema,
  submitEvaluatedFlashcardAttemptRequestSchema,
  submitAndAnalyzeFlashcardInputSchema,
  type CreateBulkFlashcardItem,
  type FlashcardEvaluationOutput,
  type GetActiveFlashcardLearnSessionInput,
  type GenerateFlashcardsFromNoteInput,
  type StartFlashcardLearnSessionInput,
  type SubmitFlashcardLearnAnswerInput,
  type SubmitAndAnalyzeFlashcardInput,
  type SubmitEvaluatedFlashcardSessionAnswerRequest,
  type SubmitEvaluatedFlashcardAttemptRequest,
} from "./flashcard.dto";
import {
  flashcardAnalyticsEvaluationContextResponseSchema,
  flashcardApiResponseSchema,
  flashcardSessionResponseSchema,
  generateFlashcardsFromNoteResponseSchema,
  submitEvaluatedFlashcardSessionAnswerResponseSchema,
  submitFlashcardLearnAnswerResponseSchema,
  submitAndAnalyzeFlashcardResponseSchema,
  type FlashcardAnalyticsEvaluationContextResponse,
  type FlashcardApiResponse,
  type FlashcardSessionResponse,
  type GenerateFlashcardsFromNoteResponse,
  type SubmitFlashcardLearnAnswerResponse,
  type SubmitAndAnalyzeFlashcardResponse,
} from "./flashcard.response";

export class FlashcardService {
  constructor(
    private readonly generationRunner: Runner,
    private readonly analyticsRunner: Runner,
    private readonly upstreamHttpClient: UpstreamHttpClient,
  ) {}

  async generateFromNote(
    input: GenerateFlashcardsFromNoteInput,
    authorizationHeader: string | undefined,
  ): Promise<GenerateFlashcardsFromNoteResponse> {
    const parsedInput = generateFlashcardsFromNoteInputSchema.parse(input);
    const authHeader = this.requireAuthorizationHeader(authorizationHeader);

    const note = await this.fetchNote(parsedInput.noteSqid, authHeader);
    const generatedFlashcards = await this.generateFlashcardsWithAgent(note.name, note.noteContent, parsedInput.flashcardCount);
    const persistedFlashcards = await this.persistFlashcards(note.sqid, generatedFlashcards, authHeader);

    return generateFlashcardsFromNoteResponseSchema.parse({
      noteSqid: note.sqid,
      generatedCount: persistedFlashcards.length,
      flashcards: persistedFlashcards,
    });
  }

  async submitAndAnalyze(
    input: SubmitAndAnalyzeFlashcardInput,
    authorizationHeader: string | undefined,
  ): Promise<SubmitAndAnalyzeFlashcardResponse> {
    const parsedInput = submitAndAnalyzeFlashcardInputSchema.parse(input);
    const authHeader = this.requireAuthorizationHeader(authorizationHeader);

    const evaluationContext = await this.fetchAnalyticsEvaluationContext(parsedInput.flashcardSqid, authHeader);
    const generatedEvaluation = await this.generateFlashcardEvaluationWithAgent(
      parsedInput.flashcardSqid,
      parsedInput.answer,
      evaluationContext,
      parsedInput.responseTimeMs,
    );

    const persistedResult = await this.persistEvaluatedAttempt(
      parsedInput.flashcardSqid,
      {
        answer: parsedInput.answer,
        responseTimeMs: parsedInput.responseTimeMs,
        evaluation: generatedEvaluation.evaluation,
        analytics: generatedEvaluation.analytics,
      },
      authHeader,
    );

    return submitAndAnalyzeFlashcardResponseSchema.parse({
      ...persistedResult,
      frontendReview: generatedEvaluation.frontendReview,
    });
  }

  async startLearnSession(
    input: StartFlashcardLearnSessionInput,
    authorizationHeader: string | undefined,
  ): Promise<FlashcardSessionResponse> {
    const parsedInput = startFlashcardLearnSessionInputSchema.parse(input);
    const authHeader = this.requireAuthorizationHeader(authorizationHeader);
    return this.startLearnSessionWithApi(parsedInput, authHeader);
  }

  async getActiveLearnSession(
    input: GetActiveFlashcardLearnSessionInput,
    authorizationHeader: string | undefined,
  ): Promise<FlashcardSessionResponse | null> {
    const parsedInput = getActiveFlashcardLearnSessionInputSchema.parse(input);
    const authHeader = this.requireAuthorizationHeader(authorizationHeader);
    return this.fetchActiveLearnSession(parsedInput, authHeader);
  }

  async resumeLearnSession(sessionSqid: string, authorizationHeader: string | undefined): Promise<FlashcardSessionResponse> {
    const authHeader = this.requireAuthorizationHeader(authorizationHeader);
    return this.resumeLearnSessionWithApi(sessionSqid, authHeader);
  }

  async restartLearnSession(sessionSqid: string, authorizationHeader: string | undefined): Promise<FlashcardSessionResponse> {
    const authHeader = this.requireAuthorizationHeader(authorizationHeader);
    return this.restartLearnSessionWithApi(sessionSqid, authHeader);
  }

  async abandonLearnSession(sessionSqid: string, authorizationHeader: string | undefined): Promise<void> {
    const authHeader = this.requireAuthorizationHeader(authorizationHeader);
    await this.abandonLearnSessionWithApi(sessionSqid, authHeader);
  }

  async submitLearnSessionAnswer(
    input: SubmitFlashcardLearnAnswerInput,
    authorizationHeader: string | undefined,
  ): Promise<SubmitFlashcardLearnAnswerResponse> {
    const parsedInput = submitFlashcardLearnAnswerInputSchema.parse(input);
    const authHeader = this.requireAuthorizationHeader(authorizationHeader);

    const session = await this.resumeLearnSessionWithApi(parsedInput.sessionSqid, authHeader);
    const sessionItem = session.items.find((item) => item.sessionItemSqid === parsedInput.sessionItemSqid);
    if (!sessionItem) {
      throw new AppError("The requested flashcard session item was not found in the active session.", "SESSION_ITEM_NOT_FOUND", 404);
    }

    const evaluationContext = await this.fetchAnalyticsEvaluationContext(sessionItem.flashcardSqid, authHeader);
    const generatedEvaluation = await this.generateFlashcardEvaluationWithAgent(
      sessionItem.flashcardSqid,
      parsedInput.answer,
      evaluationContext,
      parsedInput.responseTimeMs,
    );

    const persistedResult = await this.persistEvaluatedSessionAnswer(
      parsedInput.sessionSqid,
      {
        sessionItemSqid: parsedInput.sessionItemSqid,
        answer: parsedInput.answer,
        responseTimeMs: parsedInput.responseTimeMs,
        evaluation: generatedEvaluation.evaluation,
        analytics: generatedEvaluation.analytics,
      },
      authHeader,
    );

    return submitFlashcardLearnAnswerResponseSchema.parse({
      ...persistedResult,
      frontendReview: generatedEvaluation.frontendReview,
    });
  }

  private requireAuthorizationHeader(headerValue: string | undefined): string {
    if (!headerValue?.trim()) {
      throw new UnauthorizedError();
    }

    return headerValue;
  }

  private async fetchNote(noteSqid: string, authorizationHeader: string) {
    const data = await this.upstreamHttpClient.getJson(`/api/note/${encodeURIComponent(noteSqid)}`, {
      method: "GET",
      headers: {
        Authorization: authorizationHeader,
        Accept: "application/json",
      },
    }, "Unable to fetch note from EducAIte API.");
    return noteApiResponseSchema.parse(data);
  }

  private async generateFlashcardsWithAgent(
    noteTitle: string,
    noteContent: string,
    flashcardCount: number,
  ): Promise<CreateBulkFlashcardItem[]> {
    const prompt = buildGenerationPrompt(noteTitle, noteContent, flashcardCount);
    const finalResponseText = await this.runGenerationAgent(prompt);
    const parsedJson = parseJson(finalResponseText, "Flashcards generation agent returned invalid JSON.");

    return flashcardGenerationOutputSchema.parse(parsedJson).flashcards;
  }

  private async persistFlashcards(
    noteSqid: string,
    flashcards: CreateBulkFlashcardItem[],
    authorizationHeader: string,
  ): Promise<FlashcardApiResponse[]> {
    const payload = createBulkFlashcardsRequestSchema.parse({
      notesqid: noteSqid,
      flashcards,
    });
    const data = await this.upstreamHttpClient.getJson("/api/flashcard/bulk", {
      method: "POST",
      headers: {
        Authorization: authorizationHeader,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }, "Unable to persist generated flashcards.");
    return flashcardApiResponseSchema.array().parse(data);
  }

  private async persistEvaluatedAttempt(
    flashcardSqid: string,
    request: SubmitEvaluatedFlashcardAttemptRequest,
    authorizationHeader: string,
  ): Promise<Omit<SubmitAndAnalyzeFlashcardResponse, "frontendReview">> {
    const payload = submitEvaluatedFlashcardAttemptRequestSchema.parse(request);
    const data = await this.upstreamHttpClient.getJson(`/api/Flashcard/${encodeURIComponent(flashcardSqid)}/evaluated-attempt`, {
      method: "POST",
      headers: {
        Authorization: authorizationHeader,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }, "Unable to persist the evaluated flashcard answer through EducAIte API.");
    return submitAndAnalyzeFlashcardResponseSchema.omit({ frontendReview: true }).parse(data);
  }

  private async startLearnSessionWithApi(
    input: StartFlashcardLearnSessionInput,
    authorizationHeader: string,
  ): Promise<FlashcardSessionResponse> {
    const payload = {
      ...input,
      scopeType: toFlashcardSessionScopeTypeValue(input.scopeType),
    };
    const data = await this.upstreamHttpClient.getJson("/api/FlashcardSession", {
      method: "POST",
      headers: {
        Authorization: authorizationHeader,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }, "Unable to start the flashcard learn session.");
    return flashcardSessionResponseSchema.parse(data);
  }

  private async fetchActiveLearnSession(
    input: GetActiveFlashcardLearnSessionInput,
    authorizationHeader: string,
  ): Promise<FlashcardSessionResponse | null> {
    const query = new URLSearchParams();
    query.set("scopeType", input.scopeType);

    if (input.studentCourseSqid) {
      query.set("studentCourseSqid", input.studentCourseSqid);
    }

    if (input.documentSqid) {
      query.set("documentSqid", input.documentSqid);
    }

    const data = await this.upstreamHttpClient.getJsonOrNullOnStatus(`/api/FlashcardSession/active?${query.toString()}`, {
      method: "GET",
      headers: {
        Authorization: authorizationHeader,
        Accept: "application/json",
      },
    }, "Unable to fetch the active flashcard learn session.", [404]);

    if (data === null) {
      return null;
    }
    return flashcardSessionResponseSchema.parse(data);
  }

  private async resumeLearnSessionWithApi(sessionSqid: string, authorizationHeader: string): Promise<FlashcardSessionResponse> {
    const data = await this.upstreamHttpClient.getJson(`/api/FlashcardSession/${encodeURIComponent(sessionSqid)}/resume`, {
      method: "POST",
      headers: {
        Authorization: authorizationHeader,
        Accept: "application/json",
      },
    }, "Unable to resume the flashcard learn session.");
    return flashcardSessionResponseSchema.parse(data);
  }

  private async restartLearnSessionWithApi(sessionSqid: string, authorizationHeader: string): Promise<FlashcardSessionResponse> {
    const data = await this.upstreamHttpClient.getJson(`/api/FlashcardSession/${encodeURIComponent(sessionSqid)}/restart`, {
      method: "POST",
      headers: {
        Authorization: authorizationHeader,
        Accept: "application/json",
      },
    }, "Unable to restart the flashcard learn session.");
    return flashcardSessionResponseSchema.parse(data);
  }

  private async abandonLearnSessionWithApi(sessionSqid: string, authorizationHeader: string): Promise<void> {
    await this.upstreamHttpClient.expectNoContent(`/api/FlashcardSession/${encodeURIComponent(sessionSqid)}/abandon`, {
      method: "POST",
      headers: {
        Authorization: authorizationHeader,
        Accept: "application/json",
      },
    }, "Unable to abandon the flashcard learn session.", [204]);
  }

  private async persistEvaluatedSessionAnswer(
    sessionSqid: string,
    request: SubmitEvaluatedFlashcardSessionAnswerRequest,
    authorizationHeader: string,
  ) {
    const payload = submitEvaluatedFlashcardSessionAnswerRequestSchema.parse(request);
    const data = await this.upstreamHttpClient.getJson(`/api/FlashcardSession/${encodeURIComponent(sessionSqid)}/evaluated-answers`, {
      method: "POST",
      headers: {
        Authorization: authorizationHeader,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }, "Unable to persist the evaluated flashcard session answer through EducAIte API.");
    return submitEvaluatedFlashcardSessionAnswerResponseSchema.parse(data);
  }

  private async fetchAnalyticsEvaluationContext(
    flashcardSqid: string,
    authorizationHeader: string,
  ): Promise<FlashcardAnalyticsEvaluationContextResponse> {
    const data = await this.upstreamHttpClient.getJson(
      `/api/FlashcardAnalytics/${encodeURIComponent(flashcardSqid)}/evaluation-context`,
      {
        method: "GET",
        headers: {
          Authorization: authorizationHeader,
          Accept: "application/json",
        },
      },
      "Unable to fetch flashcard analytics evaluation context.",
    );
    return flashcardAnalyticsEvaluationContextResponseSchema.parse(data);
  }

  private async generateFlashcardEvaluationWithAgent(
    flashcardSqid: string,
    submittedAnswer: string,
    evaluationContext: FlashcardAnalyticsEvaluationContextResponse,
    responseTimeMs: number,
  ): Promise<FlashcardEvaluationOutput> {
    const finalResponseText = await this.runAnalyticsAgent(flashcardSqid, submittedAnswer, evaluationContext, responseTimeMs);
    const parsedJson = parseJson(finalResponseText, "Flashcard evaluation agent returned invalid JSON.");

    return flashcardEvaluationOutputSchema.parse(parsedJson);
  }

  private async runGenerationAgent(prompt: string): Promise<string> {
    const message: Content = {
      role: "user",
      parts: [{ text: prompt }],
    };

    let finalResponseText: string | null = null;

    for await (const event of this.generationRunner.runEphemeral({
      userId: "flashcards_service",
      newMessage: message,
    })) {
      if (event.errorMessage) {
        throw new BadGatewayError(event.errorMessage);
      }

      if (!isFinalResponse(event)) {
        continue;
      }

      const structuredOutput = event.actions.stateDelta.flashcards_generation_output;
      if (structuredOutput) {
        return JSON.stringify(structuredOutput);
      }

      const content = stringifyContent(event).trim();
      if (content) {
        finalResponseText = content;
      }
    }

    if (!finalResponseText) {
      throw new BadGatewayError("Flashcards generation agent did not return a final response.");
    }

    return finalResponseText;
  }

  private async runAnalyticsAgent(
    flashcardSqid: string,
    submittedAnswer: string,
    evaluationContext: FlashcardAnalyticsEvaluationContextResponse,
    responseTimeMs: number,
  ): Promise<string> {
    const message: Content = {
      role: "user",
      parts: [{ text: buildFlashcardAnalyticsPrompt(flashcardSqid, submittedAnswer, evaluationContext, responseTimeMs) }],
    };

    let finalResponseText: string | null = null;

    for await (const event of this.analyticsRunner.runEphemeral({
      userId: "flashcard_analytics_service",
      newMessage: message,
    })) {
      if (event.errorMessage) {
        throw new BadGatewayError(event.errorMessage);
      }

      if (!isFinalResponse(event)) {
        continue;
      }

      const structuredOutput = event.actions.stateDelta.flashcard_evaluation_output;
      if (structuredOutput) {
        return JSON.stringify(structuredOutput);
      }

      const content = stringifyContent(event).trim();
      if (content) {
        finalResponseText = content;
      }
    }

    if (!finalResponseText) {
      throw new BadGatewayError("Flashcard analytics agent did not return a final response.");
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

function parseJson(value: string, errorMessage: string): unknown {
  const parsed = tryParseJson(value);
  if (parsed === null) {
    throw new BadGatewayError(errorMessage);
  }

  return parsed;
}

function toFlashcardSessionScopeTypeValue(scopeType: "Course" | "Overall"): number {
  switch (scopeType) {
    case "Course":
      return 1;
    case "Overall":
      return 2;
    default:
      return 1;
  }
}

function buildGenerationPrompt(noteTitle: string, noteContent: string, flashcardCount: number): string {
  return [
    "Generate grounded flashcards from the following note.",
    `Return exactly ${flashcardCount} flashcards.`,
    'Return only JSON matching this shape: {"flashcards":[{"question":"...","answer":"..."}]}.',
    "",
    `Note title: ${noteTitle}`,
    "Note content:",
    noteContent,
  ].join("\n");
}

function buildFlashcardAnalyticsPrompt(
  flashcardSqid: string,
  submittedAnswer: string,
  evaluationContext: FlashcardAnalyticsEvaluationContextResponse,
  responseTimeMs: number,
): string {
  const compactContext = {
    flashcardSqid: evaluationContext.flashcardSqid,
    studentCourseSqid: evaluationContext.studentCourseSqid,
    question: evaluationContext.question,
    expectedAnswer: evaluationContext.expectedAnswer,
    conceptExplanation: evaluationContext.conceptExplanation,
    answeringGuidance: evaluationContext.answeringGuidance,
    acceptedAnswerAliases: evaluationContext.acceptedAnswerAliases,
    progress: {
      ...evaluationContext.progress,
      lastReviewedAt: evaluationContext.progress.lastReviewedAt?.toISOString() ?? null,
      nextReviewAt: evaluationContext.progress.nextReviewAt.toISOString(),
    },
    recentAnswers: evaluationContext.recentAnswers.slice(-3).map((answer) => ({
      submittedAnswer: answer.submittedAnswer,
      finalQualityScore: answer.finalQualityScore,
      wasAcceptedAsCorrect: answer.wasAcceptedAsCorrect,
      verdict: answer.verdict,
      answeredAt: answer.answeredAt.toISOString(),
    })),
    currentAnalytics: evaluationContext.currentAnalytics
      ? {
          masteryLevel: evaluationContext.currentAnalytics.masteryLevel,
          confidenceScore: evaluationContext.currentAnalytics.confidenceScore,
          retentionScore: evaluationContext.currentAnalytics.retentionScore,
          riskLevel: evaluationContext.currentAnalytics.riskLevel,
          nextReviewAt: evaluationContext.currentAnalytics.nextReviewAt.toISOString(),
          lastComputedAt: evaluationContext.currentAnalytics.lastComputedAt.toISOString(),
        }
      : null,
  };

  return [
    "Evaluate the student's submitted flashcard answer and produce the semantic evaluation, analytics snapshot, and frontend review payload.",
    "Return only JSON.",
    'Return exactly this shape: {"evaluation":{"verdict":"...","acceptedAsCorrect":true,"qualityScore":0,"feedbackSummary":"...","semanticRationale":"..."},"analytics":{"nextReviewAt":"...","easeFactor":0,"repetitionCount":0,"intervalDays":0,"lapseCount":0,"masteryLevel":"...","confidenceScore":0,"consistencyScore":0,"retentionScore":0,"riskLevel":"...","aiStatus":"...","aiInsight":"...","improvementSuggestion":"..."},"frontendReview":{"resultTone":"...","answerReview":"...","conceptExplanation":"...","missingPart":"..."}}',
    "Use only these evaluation verdicts: ExactCorrect, AbbreviationCorrect, ConceptuallyCorrect, Partial, Incorrect",
    "Use only these enum values:",
    "masteryLevel: New, Learning, Review, Mastered",
    "riskLevel: Low, Medium, High",
    "aiStatus: Pending, Completed, Failed, InsufficientSignal",
    "frontendReview.resultTone: correct, close, partial, incorrect",
    "Rules:",
    "- Use only the supplied submitted answer and evaluation context.",
    "- acceptedAnswerAliases are strong grounding hints for semantic equivalence.",
    "- Accepted abbreviations and canonical short forms should be marked correct when they identify the same concept.",
    "- feedbackSummary and semanticRationale must reflect the semantic verdict, not exact string matching.",
    "- Keep confidenceScore, consistencyScore, and retentionScore within 0 to 100.",
    "- Keep easeFactor within 1.3 to 3.0.",
    "- Keep repetitionCount, intervalDays, and lapseCount as non-negative integers.",
    "- nextReviewAt must be an ISO 8601 UTC datetime string.",
    "- nextReviewAt must not be earlier than the latest recorded review.",
    "- Prefer the provided next review schedule unless the evidence strongly supports a different grounded value.",
    "- If the evidence is weak or sparse, use conservative values and set aiStatus to InsufficientSignal.",
    "- aiInsight must be one concise sentence.",
    "- improvementSuggestion must be one concrete sentence.",
    "- frontendReview is for UI only; it may explain the concept after the answer, but the persisted source of truth is evaluation + analytics.",
    "",
    "Submitted answer:",
    JSON.stringify({
      flashcardSqid,
      submittedAnswer,
      responseTimeMs,
    }),
    "",
    "Evaluation context:",
    JSON.stringify(compactContext),
  ].join("\n");
}
