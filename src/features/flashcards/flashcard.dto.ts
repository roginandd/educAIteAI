import { z } from "zod";

export const createBulkFlashcardItemSchema = z.object({
  question: z.string().trim().min(1).max(1000),
  answer: z.string().trim().min(1).max(2000),
  conceptExplanation: z.string().trim().max(4000).optional().default(""),
  answeringGuidance: z.string().trim().max(2000).optional().default(""),
  acceptedAnswerAliases: z.array(z.string().trim().min(1).max(500)).optional().default([]),
});

export const createBulkFlashcardsRequestSchema = z.object({
  notesqid: z.string().trim().min(1),
  flashcards: z.array(createBulkFlashcardItemSchema).min(1),
});

export const noteApiResponseSchema = z.object({
  sqid: z.string().trim().min(1),
  name: z.string().trim().min(1),
  noteContent: z.string().trim().min(1),
  documentSqid: z.string().trim().min(1),
  sequenceNumber: z.number(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const generateFlashcardsFromNoteInputSchema = z.object({
  noteSqid: z.string().trim().min(1),
  flashcardCount: z.coerce.number().int().min(1).max(10).default(5),
});

export const generateFlashcardsFromNoteParamsSchema = z.object({
  noteSqid: z.string().trim().min(1),
});

export const generateFlashcardsFromNoteBodySchema = z.object({
  flashcardCount: z.coerce.number().int().min(1).max(10).default(5),
});

export const submitFlashcardAttemptRequestSchema = z.object({
  answer: z.string().trim().min(1).max(4000),
  responseTimeMs: z.coerce.number().int().min(0).default(0),
});

export const submitAndAnalyzeFlashcardParamsSchema = z.object({
  flashcardSqid: z.string().trim().min(1),
});

export const submitAndAnalyzeFlashcardBodySchema = submitFlashcardAttemptRequestSchema;

export const submitAndAnalyzeFlashcardInputSchema = submitFlashcardAttemptRequestSchema.extend({
  flashcardSqid: z.string().trim().min(1),
});

export const flashcardSessionScopeTypeSchema = z.enum(["Course", "Overall"]);

export const startFlashcardLearnSessionBodySchema = z.object({
  scopeType: flashcardSessionScopeTypeSchema.default("Course"),
  studentCourseSqid: z.string().trim().min(1).optional(),
  documentSqid: z.string().trim().min(1).optional(),
  take: z.coerce.number().int().min(1).max(100).default(30),
});

export const startFlashcardLearnSessionInputSchema = z.object({
  scopeType: flashcardSessionScopeTypeSchema.default("Course"),
  studentCourseSqid: z.string().trim().min(1).optional(),
  documentSqid: z.string().trim().min(1).optional(),
  take: z.coerce.number().int().min(1).max(100).default(30),
});

export const getActiveFlashcardLearnSessionQuerySchema = z.object({
  scopeType: flashcardSessionScopeTypeSchema.default("Course"),
  studentCourseSqid: z.string().trim().min(1).optional(),
  documentSqid: z.string().trim().min(1).optional(),
});

export const getActiveFlashcardLearnSessionInputSchema = z.object({
  scopeType: flashcardSessionScopeTypeSchema.default("Course"),
  studentCourseSqid: z.string().trim().min(1).optional(),
  documentSqid: z.string().trim().min(1).optional(),
});

export const flashcardLearnSessionParamsSchema = z.object({
  sessionSqid: z.string().trim().min(1),
});

export const submitFlashcardLearnAnswerBodySchema = z.object({
  sessionItemSqid: z.string().trim().min(1),
  answer: z.string().trim().min(1).max(4000),
  responseTimeMs: z.coerce.number().int().min(0).default(0),
});

export const submitFlashcardLearnAnswerInputSchema = submitFlashcardLearnAnswerBodySchema.extend({
  sessionSqid: z.string().trim().min(1),
});

export const flashcardMasteryLevelSchema = z.enum(["New", "Learning", "Review", "Mastered"]);
export const flashcardRiskLevelSchema = z.enum(["Low", "Medium", "High"]);
export const flashcardAiStatusSchema = z.enum(["Pending", "Completed", "Failed", "InsufficientSignal"]);
export const flashcardAnalyticsStatusSchema = z.enum(["Completed", "Pending", "Failed"]);
export const flashcardAnswerVerdictSchema = z.enum([
  "ExactCorrect",
  "AbbreviationCorrect",
  "ConceptuallyCorrect",
  "Partial",
  "Incorrect",
]);

export const flashcardGenerationOutputSchema = z.object({
  flashcards: z.array(createBulkFlashcardItemSchema).min(1).max(10),
});

export const flashcardAttemptEvaluationOutputSchema = z.object({
  verdict: flashcardAnswerVerdictSchema,
  acceptedAsCorrect: z.boolean(),
  qualityScore: z.number().int().min(0).max(5),
  feedbackSummary: z.string().trim().min(1).max(1000),
  semanticRationale: z.string().trim().max(2000).default(""),
});

export const flashcardAnalyticsOutputSchema = z.object({
  nextReviewAt: z.string().trim().min(1),
  easeFactor: z.number().finite(),
  repetitionCount: z.number().int(),
  intervalDays: z.number().int(),
  lapseCount: z.number().int(),
  masteryLevel: flashcardMasteryLevelSchema,
  confidenceScore: z.number().finite(),
  consistencyScore: z.number().finite(),
  retentionScore: z.number().finite(),
  riskLevel: flashcardRiskLevelSchema,
  aiStatus: flashcardAiStatusSchema,
  aiInsight: z.string(),
  improvementSuggestion: z.string(),
});

export const flashcardFrontendReviewOutputSchema = z.object({
  resultTone: z.enum(["correct", "close", "partial", "incorrect"]),
  answerReview: z.string().trim().min(1).max(2000),
  conceptExplanation: z.string().trim().max(4000).default(""),
  missingPart: z.string().trim().max(1000).default(""),
});

export const flashcardEvaluationOutputSchema = z.object({
  evaluation: flashcardAttemptEvaluationOutputSchema,
  analytics: flashcardAnalyticsOutputSchema,
  frontendReview: flashcardFrontendReviewOutputSchema,
});

export const performanceSummaryAiOutputSchema = z.object({
  aiStatus: flashcardAiStatusSchema,
  aiInsight: z.string().trim().min(1).max(2000),
  improvementSuggestion: z.string().trim().min(1).max(2000),
});

export const upsertPerformanceSummaryAiRequestSchema = z.object({
  basisLastComputedAt: z.string().trim().min(1),
  aiStatus: flashcardAiStatusSchema,
  aiInsight: z.string().trim().min(1).max(2000),
  improvementSuggestion: z.string().trim().min(1).max(2000),
});

export const submitEvaluatedFlashcardAttemptRequestSchema = z.object({
  answer: z.string().trim().min(1).max(4000),
  responseTimeMs: z.coerce.number().int().min(0).default(0),
  evaluation: flashcardAttemptEvaluationOutputSchema,
  analytics: flashcardAnalyticsOutputSchema,
});

export const submitEvaluatedFlashcardSessionAnswerRequestSchema = z.object({
  sessionItemSqid: z.string().trim().min(1),
  answer: z.string().trim().min(1).max(4000),
  responseTimeMs: z.coerce.number().int().min(0).default(0),
  evaluation: flashcardAttemptEvaluationOutputSchema,
  analytics: flashcardAnalyticsOutputSchema,
});

export type CreateBulkFlashcardItem = z.output<typeof createBulkFlashcardItemSchema>;
export type CreateBulkFlashcardsRequest = z.output<typeof createBulkFlashcardsRequestSchema>;
export type NoteApiResponse = z.output<typeof noteApiResponseSchema>;
export type GenerateFlashcardsFromNoteInput = z.output<typeof generateFlashcardsFromNoteInputSchema>;
export type GenerateFlashcardsFromNoteParams = z.output<typeof generateFlashcardsFromNoteParamsSchema>;
export type GenerateFlashcardsFromNoteBody = z.output<typeof generateFlashcardsFromNoteBodySchema>;
export type SubmitFlashcardAttemptRequest = z.output<typeof submitFlashcardAttemptRequestSchema>;
export type SubmitAndAnalyzeFlashcardParams = z.output<typeof submitAndAnalyzeFlashcardParamsSchema>;
export type SubmitAndAnalyzeFlashcardBody = z.output<typeof submitAndAnalyzeFlashcardBodySchema>;
export type SubmitAndAnalyzeFlashcardInput = z.output<typeof submitAndAnalyzeFlashcardInputSchema>;
export type FlashcardSessionScopeType = z.output<typeof flashcardSessionScopeTypeSchema>;
export type StartFlashcardLearnSessionBody = z.output<typeof startFlashcardLearnSessionBodySchema>;
export type StartFlashcardLearnSessionInput = z.output<typeof startFlashcardLearnSessionInputSchema>;
export type GetActiveFlashcardLearnSessionQuery = z.output<typeof getActiveFlashcardLearnSessionQuerySchema>;
export type GetActiveFlashcardLearnSessionInput = z.output<typeof getActiveFlashcardLearnSessionInputSchema>;
export type FlashcardLearnSessionParams = z.output<typeof flashcardLearnSessionParamsSchema>;
export type SubmitFlashcardLearnAnswerBody = z.output<typeof submitFlashcardLearnAnswerBodySchema>;
export type SubmitFlashcardLearnAnswerInput = z.output<typeof submitFlashcardLearnAnswerInputSchema>;
export type FlashcardAnalyticsStatus = z.output<typeof flashcardAnalyticsStatusSchema>;
export type FlashcardAnswerVerdict = z.output<typeof flashcardAnswerVerdictSchema>;
export type FlashcardGenerationOutput = z.output<typeof flashcardGenerationOutputSchema>;
export type FlashcardAttemptEvaluationOutput = z.output<typeof flashcardAttemptEvaluationOutputSchema>;
export type FlashcardAnalyticsOutput = z.output<typeof flashcardAnalyticsOutputSchema>;
export type FlashcardFrontendReviewOutput = z.output<typeof flashcardFrontendReviewOutputSchema>;
export type FlashcardEvaluationOutput = z.output<typeof flashcardEvaluationOutputSchema>;
export type PerformanceSummaryAiOutput = z.output<typeof performanceSummaryAiOutputSchema>;
export type UpsertPerformanceSummaryAiRequest = z.output<typeof upsertPerformanceSummaryAiRequestSchema>;
export type SubmitEvaluatedFlashcardAttemptRequest = z.output<typeof submitEvaluatedFlashcardAttemptRequestSchema>;
export type SubmitEvaluatedFlashcardSessionAnswerRequest = z.output<typeof submitEvaluatedFlashcardSessionAnswerRequestSchema>;
