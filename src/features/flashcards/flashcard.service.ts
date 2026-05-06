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
import { codeExecutionOutputSchema, executeSmartQuizCodeInputSchema, type CodeExecutionOutput, type ExecuteSmartQuizCodeInput } from "../smart-quiz/smart-quiz.dto";
import type { CodeExecutionSupervisor } from "../smart-quiz/code-execution-supervisor";
import {
  flashcardAnalyticsEvaluationContextResponseSchema,
  flashcardApiResponseSchema,
  flashcardLearnSessionStartFlowResponseSchema,
  flashcardSessionResponseSchema,
  generateFlashcardsFromNoteResponseSchema,
  generateFlashcardsPreviewResponseSchema,
  submitEvaluatedFlashcardSessionAnswerResponseSchema,
  submitFlashcardLearnAnswerResponseSchema,
  submitAndAnalyzeFlashcardResponseSchema,
  evaluateFlashcardAnswerResponseSchema,
  type FlashcardAnalyticsEvaluationContextResponse,
  type FlashcardApiResponse,
  type EvaluateFlashcardAnswerResponse,
  type FlashcardLearnSessionStartFlowResponse,
  type FlashcardSessionResponse,
  type GenerateFlashcardsFromNoteResponse,
  type GenerateFlashcardsPreviewResponse,
  type SubmitFlashcardLearnAnswerResponse,
  type SubmitAndAnalyzeFlashcardResponse,
} from "./flashcard.response";
import {
  buildFlashcardAnalyticsPrompt,
  buildGenerationPrompt,
  buildPreviewPrompt,
} from "./flashcard.prompts";
import {
  buildSuppliedFlashcardContext,
  inferPreviewItemTypes,
  inferTechnicalLanguage,
  isProgrammingFocusedSource,
  mapDraftToAiResponse,
  normalizeDraftForDelivery,
  normalizePreviewDraft,
  parseJson,
  type SuppliedFlashcardContext,
  toFlashcardSessionScopeTypeValue,
  trimSourceTextForPreview,
} from "./flashcard.utils";

export class FlashcardService {
  private static readonly generationBatchLimit = 10;
  private static readonly previewGenerationBatchLimit = 5;

  constructor(
    private readonly generationRunner: Runner,
    private readonly analyticsRunner: Runner,
    private readonly upstreamHttpClient: UpstreamHttpClient,
    private readonly codeExecutionSupervisor: CodeExecutionSupervisor,
  ) {}

  async generateFromNote(
    input: GenerateFlashcardsFromNoteInput,
    authorizationHeader: string | undefined,
  ): Promise<GenerateFlashcardsFromNoteResponse> {
    const parsedInput = generateFlashcardsFromNoteInputSchema.parse(input);
    const authHeader = this.requireAuthorizationHeader(authorizationHeader);

    const note = parsedInput.noteContent
      ? {
          sqid: parsedInput.noteSqid,
          name: parsedInput.noteTitle ?? "Supplied note context",
          noteContent: parsedInput.noteContent,
        }
      : await this.fetchNote(parsedInput.noteSqid, authHeader);
    const generatedFlashcards = await this.generateFlashcardsWithAgent(
      note.name,
      note.noteContent,
      parsedInput.flashcardCount,
      parsedInput,
    );
    const persistedFlashcards = await this.persistFlashcards(note.sqid, generatedFlashcards, authHeader);

    return generateFlashcardsFromNoteResponseSchema.parse({
      noteSqid: note.sqid,
      generatedCount: persistedFlashcards.length,
      flashcards: persistedFlashcards,
      drafts: generatedFlashcards.map(mapDraftToAiResponse),
    });
  }

  async previewGenerateFromNote(
    input: GenerateFlashcardsFromNoteInput,
    authorizationHeader: string | undefined,
  ): Promise<GenerateFlashcardsPreviewResponse> {
    const parsedInput = generateFlashcardsFromNoteInputSchema.parse(input);
    const authHeader = this.requireAuthorizationHeader(authorizationHeader);

    const note = parsedInput.noteContent
      ? {
          sqid: parsedInput.noteSqid,
          name: parsedInput.noteTitle ?? "Supplied flashcard source",
          noteContent: parsedInput.noteContent,
        }
      : await this.fetchNote(parsedInput.noteSqid, authHeader);
    const generatedFlashcards = await this.generateFlashcardsPreviewWithAgent(
      note.name,
      note.noteContent,
      parsedInput.flashcardCount,
      parsedInput,
    );

    return generateFlashcardsPreviewResponseSchema.parse({
      noteSqid: note.sqid,
      generatedCount: generatedFlashcards.length,
      drafts: generatedFlashcards.map(mapDraftToAiResponse),
    });
  }

  async submitAndAnalyze(
    input: SubmitAndAnalyzeFlashcardInput,
    authorizationHeader: string | undefined,
  ): Promise<SubmitAndAnalyzeFlashcardResponse> {
    const parsedInput = submitAndAnalyzeFlashcardInputSchema.parse(input);
    const authHeader = this.requireAuthorizationHeader(authorizationHeader);

    const evaluationContext = await this.fetchAnalyticsEvaluationContext(parsedInput.flashcardSqid, authHeader);
    const submittedAnswer = getSubmittedAnswer(parsedInput);
    const suppliedContext = await this.buildEvaluationContextWithExecution(parsedInput, evaluationContext);
    const generatedEvaluation = await this.generateFlashcardEvaluationWithAgent(
      parsedInput.flashcardSqid,
      submittedAnswer,
      evaluationContext,
      parsedInput.responseTimeMs,
      suppliedContext,
    );

    const persistedResult = await this.persistEvaluatedAttempt(
      parsedInput.flashcardSqid,
      {
        answer: submittedAnswer,
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

  async evaluateAnswer(
    input: SubmitAndAnalyzeFlashcardInput,
    authorizationHeader: string | undefined,
  ): Promise<EvaluateFlashcardAnswerResponse> {
    const parsedInput = submitAndAnalyzeFlashcardInputSchema.parse(input);
    this.requireAuthorizationHeader(authorizationHeader);

    const evaluationContext = flashcardAnalyticsEvaluationContextResponseSchema.parse({
      flashcardSqid: parsedInput.flashcardSqid,
      studentCourseSqid: "__evaluation_only__",
      question: parsedInput.question ?? "",
      expectedAnswer: parsedInput.expectedAnswer ?? "",
      conceptExplanation: parsedInput.conceptExplanation ?? "",
      answeringGuidance: parsedInput.answeringGuidance ?? "",
      acceptedAnswerAliases: parsedInput.acceptedAnswerAliases ?? [],
      itemType: parsedInput.itemType ?? "Flashcard",
      cognitiveSkill: parsedInput.cognitiveSkill ?? "Recall",
      learningDomain: parsedInput.learningDomain ?? "Unknown",
      technicalLanguage: parsedInput.technicalLanguage ?? "",
      rubricJson: parsedInput.rubricJson ?? "{}",
      validationConfigJson: parsedInput.validationConfigJson ?? "{}",
      progress: {
        correctCount: 0,
        wrongCount: 0,
        totalAttempts: 0,
        consecutiveCorrectCount: 0,
        consecutiveWrongCount: 0,
        reviewCount: 0,
        lapseCount: 0,
        lastReviewOutcome: "",
        lastEvaluationVerdict: null,
        lastQualityScore: null,
        lastReviewedAt: null,
        nextReviewAt: new Date(),
      },
      recentAnswers: [],
      currentAnalytics: null,
    });

    const submittedAnswer = getSubmittedAnswer(parsedInput);
    const suppliedContext = await this.buildEvaluationContextWithExecution(parsedInput, evaluationContext);
    const generatedEvaluation = await this.generateFlashcardEvaluationWithAgent(
      parsedInput.flashcardSqid,
      submittedAnswer,
      evaluationContext,
      parsedInput.responseTimeMs,
      suppliedContext,
    );

    return evaluateFlashcardAnswerResponseSchema.parse(generatedEvaluation);
  }

  async startLearnSession(
    input: StartFlashcardLearnSessionInput,
    authorizationHeader: string | undefined,
  ): Promise<FlashcardSessionResponse> {
    const parsedInput = startFlashcardLearnSessionInputSchema.parse(input);
    const authHeader = this.requireAuthorizationHeader(authorizationHeader);
    return this.startLearnSessionWithApi(parsedInput, authHeader);
  }

  async getLearnSessionStartFlow(
    input: StartFlashcardLearnSessionInput,
    authorizationHeader: string | undefined,
  ): Promise<FlashcardLearnSessionStartFlowResponse> {
    const parsedInput = startFlashcardLearnSessionInputSchema.parse(input);
    const authHeader = this.requireAuthorizationHeader(authorizationHeader);

    const upstreamStartFlow = await this.startLearnSessionWithStartFlowApi(parsedInput, authHeader);
    if (upstreamStartFlow) {
      return upstreamStartFlow;
    }

    if (parsedInput.startMode !== "new") {
      const activeSession = await this.fetchActiveLearnSession(parsedInput, authHeader);
      if (activeSession) {
        return flashcardLearnSessionStartFlowResponseSchema.parse({
          action: "continueAvailable",
          session: null,
          activeSession,
        });
      }
    }

    const session = await this.startLearnSessionWithApi(parsedInput, authHeader);
    return flashcardLearnSessionStartFlowResponseSchema.parse({
      action: "created",
      session,
      activeSession: null,
    });
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
    const submittedAnswer = getSubmittedAnswer(parsedInput);
    const suppliedContext = await this.buildEvaluationContextWithExecution(parsedInput, evaluationContext);
    const generatedEvaluation = await this.generateFlashcardEvaluationWithAgent(
      sessionItem.flashcardSqid,
      submittedAnswer,
      evaluationContext,
      parsedInput.responseTimeMs,
      suppliedContext,
    );

    const persistedResult = await this.persistEvaluatedSessionAnswer(
      parsedInput.sessionSqid,
      {
        sessionItemSqid: parsedInput.sessionItemSqid,
        answer: submittedAnswer,
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

  private async buildEvaluationContextWithExecution(
    input: SubmitAndAnalyzeFlashcardInput | SubmitFlashcardLearnAnswerInput,
    evaluationContext: FlashcardAnalyticsEvaluationContextResponse,
  ): Promise<SuppliedFlashcardContext> {
    const suppliedContext = buildSuppliedFlashcardContext(input);
    const itemType = suppliedContext.itemType ?? evaluationContext.itemType;
    assertSupportedV1ItemType(itemType);
    if (itemType !== "Algorithm" && itemType !== "Debugging") {
      return suppliedContext;
    }

    const executionInput = buildCodeExecutionInput(input, evaluationContext);
    if (!executionInput) {
      return suppliedContext;
    }

    const execution = await this.codeExecutionSupervisor.execute(executionInput);
    return {
      ...suppliedContext,
      validationConfigJson: mergeExecutionIntoValidationConfig(
        suppliedContext.validationConfigJson ?? evaluationContext.validationConfigJson,
        execution,
      ),
    };
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
    input: GenerateFlashcardsFromNoteInput,
  ): Promise<CreateBulkFlashcardItem[]> {
    return this.generateFlashcardsInBatches(
      flashcardCount,
      (batchCount, existingQuestions) => buildGenerationPrompt(noteTitle, noteContent, batchCount, input, existingQuestions),
      (draft) => normalizeDraftForDelivery(draft, noteContent, input),
    );
  }

  private async generateFlashcardsPreviewWithAgent(
    noteTitle: string,
    noteContent: string,
    flashcardCount: number,
    input: GenerateFlashcardsFromNoteInput,
  ): Promise<CreateBulkFlashcardItem[]> {
    const trimmedNoteContent = trimSourceTextForPreview(noteContent);
    return this.generatePreviewFlashcardsInBatches(
      flashcardCount,
      (batchCount) => buildPreviewPrompt(noteTitle, trimmedNoteContent, batchCount, input),
      (draft) => normalizePreviewDraft(draft, noteContent, input),
    );
  }

  private async generateFlashcardsInBatches(
    flashcardCount: number,
    buildPrompt: (batchCount: number, existingQuestions: string[]) => string,
    normalizeDraft: (draft: CreateBulkFlashcardItem) => CreateBulkFlashcardItem,
  ): Promise<CreateBulkFlashcardItem[]> {
    const drafts: CreateBulkFlashcardItem[] = [];
    const seenQuestions = new Set<string>();

    while (drafts.length < flashcardCount) {
      const remaining = flashcardCount - drafts.length;
      const batchCount = Math.min(remaining, FlashcardService.generationBatchLimit);
      const prompt = buildPrompt(batchCount, drafts.map((draft) => draft.question));
      const finalResponseText = await this.runGenerationAgent(prompt);
      const parsedJson = parseJson(finalResponseText, "Flashcards generation agent returned invalid JSON.");
      const batch = flashcardGenerationOutputSchema.parse(parsedJson).flashcards
        .map(normalizeDraft)
        .filter((draft) => {
          const key = draft.question.trim().toLowerCase();
          return !!key && !seenQuestions.has(key);
        });

      if (batch.length === 0) {
        break;
      }

      for (const draft of batch) {
        const key = draft.question.trim().toLowerCase();
        if (!key || seenQuestions.has(key)) {
          continue;
        }

        seenQuestions.add(key);
        drafts.push(draft);
        if (drafts.length >= flashcardCount) {
          break;
        }
      }
    }

    return drafts.slice(0, flashcardCount);
  }

  private async generatePreviewFlashcardsInBatches(
    flashcardCount: number,
    buildPrompt: (batchCount: number) => string,
    normalizeDraft: (draft: CreateBulkFlashcardItem) => CreateBulkFlashcardItem,
  ): Promise<CreateBulkFlashcardItem[]> {
    const batchCounts: number[] = [];
    let remaining = flashcardCount;
    while (remaining > 0) {
      const batchCount = Math.min(remaining, FlashcardService.previewGenerationBatchLimit);
      batchCounts.push(batchCount);
      remaining -= batchCount;
    }

    const batchResults = await Promise.all(batchCounts.map(async (batchCount, index) => {
      const prompt = buildPrompt(batchCount);
      const finalResponseText = await this.runGenerationAgent(prompt, `flashcards_preview_service_${Date.now()}_${index}`);
      const parsedJson = parseJson(finalResponseText, "Flashcards preview agent returned invalid JSON.");
      return flashcardGenerationOutputSchema.parse(parsedJson).flashcards.map(normalizeDraft);
    }));

    const seenQuestions = new Set<string>();
    return batchResults
      .flat()
      .filter((draft) => {
        const key = draft.question.trim().toLowerCase();
        if (!key || seenQuestions.has(key)) {
          return false;
        }

        seenQuestions.add(key);
        return true;
      })
      .slice(0, flashcardCount);
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

  private async startLearnSessionWithStartFlowApi(
    input: StartFlashcardLearnSessionInput,
    authorizationHeader: string,
  ): Promise<FlashcardLearnSessionStartFlowResponse | null> {
    const payload = {
      ...input,
      scopeType: toFlashcardSessionScopeTypeValue(input.scopeType),
    };
    const data = await this.upstreamHttpClient.getJsonOrNullOnStatus("/api/FlashcardSession/start-flow", {
      method: "POST",
      headers: {
        Authorization: authorizationHeader,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }, "Unable to start flashcard learn session flow.", [404]);

    if (data === null) {
      return null;
    }

    return flashcardLearnSessionStartFlowResponseSchema.parse(data);
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
    suppliedContext: SuppliedFlashcardContext,
  ): Promise<FlashcardEvaluationOutput> {
    const finalResponseText = await this.runAnalyticsAgent(
      flashcardSqid,
      submittedAnswer,
      evaluationContext,
      responseTimeMs,
      suppliedContext,
    );
    const parsedJson = parseJson(finalResponseText, "Flashcard evaluation agent returned invalid JSON.");
    const generatedEvaluation = flashcardEvaluationOutputSchema.parse(parsedJson);
    const deterministicEvaluation = enforceDeterministicCodeEvaluation(generatedEvaluation, suppliedContext, evaluationContext);
    return ensureFrontendFeedback(determineEvaluationTone(deterministicEvaluation), deterministicEvaluation, suppliedContext, evaluationContext);
  }

  private async runGenerationAgent(prompt: string, userId = "flashcards_service"): Promise<string> {
    const message: Content = {
      role: "user",
      parts: [{ text: prompt }],
    };

    let finalResponseText: string | null = null;

    for await (const event of this.generationRunner.runEphemeral({
      userId,
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
    suppliedContext: SuppliedFlashcardContext,
  ): Promise<string> {
    const message: Content = {
      role: "user",
      parts: [{
        text: buildFlashcardAnalyticsPrompt(
          flashcardSqid,
          submittedAnswer,
          evaluationContext,
          responseTimeMs,
          suppliedContext,
        ),
      }],
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

const supportedV1ItemTypes = new Set([
  "Flashcard",
  "Conceptual",
  "CodeReading",
  "Debugging",
  "Algorithm",
  "OutputPrediction",
  "MultipleChoice",
  "ShortAnswer",
]);

function assertSupportedV1ItemType(itemType: string): void {
  if (supportedV1ItemTypes.has(itemType)) {
    return;
  }

  throw new AppError(
    `Item type '${itemType}' is not supported in the V1 flashcard session flow.`,
    "UNSUPPORTED_FLASHCARD_ITEM_TYPE",
    400,
  );
}

function getSubmittedAnswer(input: SubmitAndAnalyzeFlashcardInput | SubmitFlashcardLearnAnswerInput): string {
  return (input.studentCode?.trim() || input.answer?.trim() || "").trim();
}

function buildCodeExecutionInput(
  input: SubmitAndAnalyzeFlashcardInput | SubmitFlashcardLearnAnswerInput,
  evaluationContext: FlashcardAnalyticsEvaluationContextResponse,
): ExecuteSmartQuizCodeInput | null {
  const studentCode = input.studentCode?.trim() || input.answer?.trim();
  if (!studentCode) {
    return null;
  }

  const validationConfig = parseValidationConfig(input.validationConfigJson ?? evaluationContext.validationConfigJson);
  const language = input.language ?? normalizeExecutionLanguage(input.technicalLanguage ?? evaluationContext.technicalLanguage, validationConfig);
  if (!language) {
    return null;
  }

  const visibleTests = readTestCases(validationConfig, "visibleTestCases", "visibleTests");
  const hiddenTests = readTestCases(validationConfig, "hiddenTestCases", "hiddenTests");
  const starterCode = input.starterCode?.trim() || readStarterCode(validationConfig, language);

  return executeSmartQuizCodeInputSchema.parse({
    language,
    runtimeVersion: input.runtimeVersion,
    prompt: input.question ?? evaluationContext.question,
    starterCode,
    studentCode,
    visibleTests,
    hiddenTests,
    limits: readExecutionLimits(validationConfig),
  });
}

function parseValidationConfig(value: string | undefined): Record<string, unknown> {
  if (!value?.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function mergeExecutionIntoValidationConfig(
  validationConfigJson: string | undefined,
  execution: CodeExecutionOutput,
): string {
  const validationConfig = parseValidationConfig(validationConfigJson);
  const visibleConfig = stripPrivateValidationKeys(validationConfig);
  return JSON.stringify({
    ...visibleConfig,
    executionResult: execution,
    executionProvider: "judge0",
  });
}

function enforceDeterministicCodeEvaluation(
  evaluation: FlashcardEvaluationOutput,
  suppliedContext: SuppliedFlashcardContext,
  evaluationContext: FlashcardAnalyticsEvaluationContextResponse,
): FlashcardEvaluationOutput {
  const execution = readExecutionResultFromContext(suppliedContext, evaluationContext);
  if (!execution) {
    return evaluation;
  }

  const allTestsPassed = didAllRequiredExecutionTestsPass(execution);
  const executionFailed = execution.executionStatus !== "completed";
  const feedbackSummary = buildExecutionFeedbackSummary(execution, allTestsPassed);
  const semanticRationale = executionFailed
    ? "Judge0 reported an execution error before deterministic correctness comparison could complete."
    : allTestsPassed
      ? "Judge0 output matched the expected output for every required test case."
      : "Judge0 completed execution, but one or more required test cases failed deterministic output comparison.";

  return flashcardEvaluationOutputSchema.parse({
    ...evaluation,
    evaluation: {
      ...evaluation.evaluation,
      verdict: allTestsPassed ? "ExactCorrect" : "Incorrect",
      acceptedAsCorrect: allTestsPassed,
      qualityScore: allTestsPassed ? evaluation.evaluation.qualityScore : 0,
      feedbackSummary,
      semanticRationale,
    },
    frontendReview: {
      ...evaluation.frontendReview,
      resultTone: allTestsPassed ? "correct" : "incorrect",
      verdict: allTestsPassed ? "Correct" : "Incorrect",
      qualityScore: allTestsPassed ? evaluation.frontendReview.qualityScore : 0,
      isCorrect: allTestsPassed,
      answerReview: feedbackSummary,
      misconception: allTestsPassed
        ? evaluation.frontendReview.misconception
        : executionFailed
          ? "The submission did not complete successfully in Judge0."
          : "The submission did not satisfy all required Judge0 test cases.",
      technicalDiagnostics: {
        language: evaluation.frontendReview.technicalDiagnostics?.language ?? suppliedContext.technicalLanguage ?? evaluationContext.technicalLanguage ?? "",
        expectedBehavior: allTestsPassed
          ? "Pass all required Judge0 test cases."
          : "Pass every predefined Judge0 test case before qualitative review.",
        actualBehavior: execution.message,
        issues: buildExecutionIssues(execution),
      },
    },
  });
}

function ensureFrontendFeedback(
  tone: "correct" | "close" | "partial" | "incorrect",
  evaluation: FlashcardEvaluationOutput,
  suppliedContext: SuppliedFlashcardContext,
  evaluationContext: FlashcardAnalyticsEvaluationContextResponse,
): FlashcardEvaluationOutput {
  const baseInsight = firstNonEmptyString(
    evaluation.frontendReview.conceptExplanation,
    suppliedContext.conceptExplanation,
    evaluationContext.conceptExplanation,
    evaluation.evaluation.semanticRationale,
    evaluation.evaluation.feedbackSummary,
    evaluationContext.expectedAnswer,
  );
  const insight = evaluation.frontendReview.conceptExplanation.trim()
    || buildInsightFromTone(
      tone,
      baseInsight,
      evaluation.frontendReview.missingPart,
      evaluation.frontendReview.misconception,
      evaluation.evaluation.feedbackSummary,
    );
  const aiInsight = evaluation.analytics.aiInsight.trim() || insight;

  return flashcardEvaluationOutputSchema.parse({
    ...evaluation,
    analytics: {
      ...evaluation.analytics,
      aiInsight,
    },
    frontendReview: {
      ...evaluation.frontendReview,
      conceptExplanation: insight,
    },
  });
}

function determineEvaluationTone(
  evaluation: FlashcardEvaluationOutput,
): "correct" | "close" | "partial" | "incorrect" {
  const tone = evaluation.frontendReview.resultTone;
  if (tone === "correct" || tone === "close" || tone === "partial" || tone === "incorrect") {
    return tone;
  }

  return evaluation.evaluation.acceptedAsCorrect ? "correct" : "incorrect";
}

function buildInsightFromTone(
  tone: "correct" | "close" | "partial" | "incorrect",
  baseInsight: string,
  missingPart: string,
  misconception: string,
  feedbackSummary: string,
): string {
  const groundedInsight = baseInsight.trim() || feedbackSummary.trim() || "Review the expected idea and apply it on the next attempt.";

  switch (tone) {
    case "correct":
      return `Key insight: ${groundedInsight}`;
    case "close":
      return `Key insight: ${groundedInsight}${missingPart.trim() ? ` Focus next on ${missingPart.trim()}.` : ""}`;
    case "partial":
      return `Key insight: ${groundedInsight}${missingPart.trim() ? ` You still need ${missingPart.trim()}.` : ""}`;
    default:
      return `Key insight: ${misconception.trim() || groundedInsight}`;
  }
}

function firstNonEmptyString(...values: Array<string | undefined | null>): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function readExecutionResultFromContext(
  suppliedContext: SuppliedFlashcardContext,
  evaluationContext: FlashcardAnalyticsEvaluationContextResponse,
): CodeExecutionOutput | null {
  const validationConfig = parseValidationConfig(suppliedContext.validationConfigJson ?? evaluationContext.validationConfigJson);
  return parseExecutionResult(validationConfig.executionResult);
}

function parseExecutionResult(value: unknown): CodeExecutionOutput | null {
  if (!isRecord(value)) {
    return null;
  }

  try {
    return codeExecutionOutputSchema.parse(value);
  } catch {
    return null;
  }
}

function didAllRequiredExecutionTestsPass(execution: CodeExecutionOutput): boolean {
  return execution.executionStatus === "completed"
    && execution.visibleTestsPassed === execution.visibleTestsTotal
    && execution.hiddenTestsPassed === execution.hiddenTestsTotal;
}

function buildExecutionFeedbackSummary(execution: CodeExecutionOutput, allTestsPassed: boolean): string {
  if (execution.executionStatus !== "completed") {
    return execution.message;
  }

  if (allTestsPassed) {
    return "Judge0 passed all required test cases before AI review.";
  }

  const failedVisibleTests = execution.results.filter((result) => !result.passed);
  if (failedVisibleTests.length > 0) {
    const names = failedVisibleTests.slice(0, 3).map((result) => result.name).join(", ");
    return `Judge0 failed these visible test cases: ${names}.`;
  }

  if (execution.hiddenSummary.failed > 0) {
    return `Visible tests passed, but ${execution.hiddenSummary.failed} hidden test case${execution.hiddenSummary.failed === 1 ? "" : "s"} failed in Judge0.`;
  }

  return execution.message;
}

function buildExecutionIssues(execution: CodeExecutionOutput): string[] {
  if (execution.executionStatus !== "completed") {
    return [execution.message];
  }

  return execution.results
    .filter((result) => !result.passed)
    .map((result) => result.status || `Failed ${result.name}`);
}

function stripPrivateValidationKeys(value: Record<string, unknown>): Record<string, unknown> {
  const clone = { ...value };
  delete clone.hiddenTestCases;
  delete clone.hiddenTests;
  delete clone.referenceSolutionByLanguage;
  delete clone.expectedFix;
  delete clone.private;
  return clone;
}

function normalizeExecutionLanguage(
  technicalLanguage: string | undefined,
  validationConfig: Record<string, unknown>,
): ExecuteSmartQuizCodeInput["language"] | undefined {
  const supportedLanguages = Array.isArray(validationConfig.supportedLanguages)
    ? validationConfig.supportedLanguages
    : [];
  for (const language of supportedLanguages) {
    const normalized = toExecutionLanguage(String(language));
    if (normalized) {
      return normalized;
    }
  }

  return toExecutionLanguage(technicalLanguage ?? "");
}

function toExecutionLanguage(value: string): ExecuteSmartQuizCodeInput["language"] | undefined {
  const normalized = value.trim().toLowerCase().replace(/[\s#.+-]/g, "");
  switch (normalized) {
    case "cpp":
    case "cplusplus":
    case "c":
      return "cpp";
    case "csharp":
    case "cs":
      return "csharp";
    case "java":
      return "java";
    case "python":
    case "py":
      return "python";
    case "javascript":
    case "js":
    case "typescript":
    case "ts":
      return "javascript";
    case "sql":
      return "sql";
    default:
      return undefined;
  }
}

function readTestCases(
  validationConfig: Record<string, unknown>,
  primaryKey: string,
  secondaryKey: string,
): Record<string, unknown>[] {
  const value = validationConfig[primaryKey] ?? validationConfig[secondaryKey];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord);
}

function readStarterCode(
  validationConfig: Record<string, unknown>,
  language: ExecuteSmartQuizCodeInput["language"],
): string {
  const starterCodeByLanguage = validationConfig.starterCodeByLanguage;
  if (!isRecord(starterCodeByLanguage)) {
    return "";
  }

  const direct = starterCodeByLanguage[language];
  if (typeof direct === "string") {
    return direct;
  }

  const matchedKey = Object.keys(starterCodeByLanguage).find((key) => toExecutionLanguage(key) === language);
  const matchedValue = matchedKey ? starterCodeByLanguage[matchedKey] : undefined;
  return typeof matchedValue === "string" ? matchedValue : "";
}

function readExecutionLimits(validationConfig: Record<string, unknown>): ExecuteSmartQuizCodeInput["limits"] {
  const limits = isRecord(validationConfig.limits) ? validationConfig.limits : {};
  return {
    timeoutMs: typeof limits.timeoutMs === "number" ? limits.timeoutMs : 3000,
    memoryMb: typeof limits.memoryMb === "number" ? limits.memoryMb : 128,
    network: false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export {
  inferPreviewItemTypes,
  inferTechnicalLanguage,
  isProgrammingFocusedSource,
};


