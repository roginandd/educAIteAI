import { z } from "zod";

export const flashcardApiResponseSchema = z.object({
  sqid: z.string().trim().min(1),
  question: z.string().trim().min(1),
  answer: z.string().trim().min(1),
  conceptExplanation: z.string(),
  answeringGuidance: z.string(),
  acceptedAnswerAliases: z.array(z.string()),
  noteSqid: z.string().trim().min(1),
  documentSqid: z.string().trim().min(1),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const generateFlashcardsFromNoteResponseSchema = z.object({
  noteSqid: z.string().trim().min(1),
  generatedCount: z.number().int().min(1),
  flashcards: z.array(flashcardApiResponseSchema),
});

export const studentFlashcardProgressResponseSchema = z.object({
  flashcardSqid: z.string().trim().min(1),
  noteSqid: z.string().trim().min(1),
  documentSqid: z.string().trim().min(1),
  studentCourseSqid: z.string().trim().min(1),
  correctCount: z.number().int(),
  wrongCount: z.number().int(),
  totalAttempts: z.number().int(),
  consecutiveCorrectCount: z.number().int(),
  consecutiveWrongCount: z.number().int(),
  reviewCount: z.number().int(),
  lapseCount: z.number().int(),
  lastReviewOutcome: z.string().nullable(),
  lastEvaluationVerdict: z.string().nullable(),
  lastQualityScore: z.number().int().nullable(),
  lastReviewedAt: z.coerce.date().nullable(),
  nextReviewAt: z.coerce.date(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const flashcardAnswerEvaluationResponseSchema = z.object({
  verdict: z.string().trim().min(1),
  acceptedAsCorrect: z.boolean(),
  qualityScore: z.number().int(),
  feedbackSummary: z.string().trim().min(1),
  semanticRationale: z.string(),
});

export const flashcardAttemptResultResponseSchema = z.object({
  flashcardSqid: z.string().trim().min(1),
  submittedAnswer: z.string().trim().min(1),
  expectedAnswer: z.string().trim().min(1),
  feedback: z.string().trim().min(1),
  isCorrect: z.boolean(),
  evaluation: flashcardAnswerEvaluationResponseSchema,
  showAgainInSession: z.boolean(),
  requeueAfter: z.number().int(),
  nextReviewAt: z.coerce.date(),
  progress: studentFlashcardProgressResponseSchema,
});

export const studentFlashcardAnalyticsResponseSchema = z.object({
  flashcardSqid: z.string().trim().min(1),
  studentCourseSqid: z.string().trim().min(1),
  lastAnsweredAt: z.coerce.date().nullable(),
  nextReviewAt: z.coerce.date(),
  easeFactor: z.number(),
  repetitionCount: z.number().int(),
  intervalDays: z.number().int(),
  lapseCount: z.number().int(),
  masteryLevel: z.string().trim().min(1),
  confidenceScore: z.number(),
  consistencyScore: z.number(),
  retentionScore: z.number(),
  riskLevel: z.string().trim().min(1),
  aiStatus: z.string().trim().min(1),
  aiInsight: z.string(),
  improvementSuggestion: z.string(),
  aiLastEvaluatedAt: z.coerce.date().nullable(),
  lastComputedAt: z.coerce.date(),
});

export const flashcardAnalyticsProgressSnapshotResponseSchema = z.object({
  correctCount: z.number().int(),
  wrongCount: z.number().int(),
  totalAttempts: z.number().int(),
  consecutiveCorrectCount: z.number().int(),
  consecutiveWrongCount: z.number().int(),
  reviewCount: z.number().int(),
  lapseCount: z.number().int(),
  lastReviewOutcome: z.string(),
  lastEvaluationVerdict: z.string().nullable(),
  lastQualityScore: z.number().int().nullable(),
  lastReviewedAt: z.coerce.date().nullable(),
  nextReviewAt: z.coerce.date(),
});

export const flashcardAnalyticsRecentAnswerResponseSchema = z.object({
  submittedAnswer: z.string(),
  expectedAnswerSnapshot: z.string(),
  responseTimeMs: z.number().int(),
  finalQualityScore: z.number().int(),
  wasAcceptedAsCorrect: z.boolean(),
  verdict: z.string().nullable(),
  feedbackSummary: z.string(),
  semanticRationale: z.string(),
  answeredAt: z.coerce.date(),
});

export const flashcardAnalyticsEvaluationContextResponseSchema = z.object({
  flashcardSqid: z.string().trim().min(1),
  studentCourseSqid: z.string().trim().min(1),
  question: z.string().trim().min(1),
  expectedAnswer: z.string().trim().min(1),
  conceptExplanation: z.string(),
  answeringGuidance: z.string(),
  acceptedAnswerAliases: z.array(z.string()),
  progress: flashcardAnalyticsProgressSnapshotResponseSchema,
  recentAnswers: z.array(flashcardAnalyticsRecentAnswerResponseSchema),
  currentAnalytics: studentFlashcardAnalyticsResponseSchema.nullable(),
});

export const flashcardFrontendReviewResponseSchema = z.object({
  resultTone: z.enum(["correct", "close", "partial", "incorrect"]),
  answerReview: z.string().trim().min(1),
  conceptExplanation: z.string(),
  missingPart: z.string(),
});

export const submitAndAnalyzeFlashcardResponseSchema = z.object({
  attempt: flashcardAttemptResultResponseSchema,
  analytics: studentFlashcardAnalyticsResponseSchema,
  analyticsStatus: z.enum(["Completed", "Pending", "Failed"]),
  frontendReview: flashcardFrontendReviewResponseSchema,
});

export const flashcardSessionItemResponseSchema = z.object({
  sessionItemSqid: z.string().trim().min(1),
  flashcardSqid: z.string().trim().min(1),
  studentCourseSqid: z.string().trim().min(1),
  question: z.string().trim().min(1),
  originalOrder: z.number().int(),
  currentOrder: z.number().int(),
  status: z.string().trim().min(1),
});

export const flashcardSessionResponseSchema = z.object({
  sessionSqid: z.string().trim().min(1),
  studentCourseSqid: z.string().trim().min(1).nullable(),
  documentSqid: z.string().trim().min(1).nullable(),
  scopeType: z.string().trim().min(1),
  status: z.string().trim().min(1),
  currentItemIndex: z.number().int(),
  startedAt: z.coerce.date(),
  lastActiveAt: z.coerce.date(),
  items: z.array(flashcardSessionItemResponseSchema),
});

export const flashcardSessionAnswerEvaluationResultResponseSchema = z.object({
  sessionItemSqid: z.string().trim().min(1),
  flashcardSqid: z.string().trim().min(1),
  qualityScore: z.number().int(),
  showAgainInSession: z.boolean(),
  requeuedToOrder: z.number().int().nullable(),
  nextReviewAt: z.coerce.date(),
  progress: studentFlashcardProgressResponseSchema,
  evaluation: flashcardAnswerEvaluationResponseSchema,
  analytics: studentFlashcardAnalyticsResponseSchema,
});

export const submitEvaluatedFlashcardSessionAnswerResponseSchema = z.object({
  session: flashcardSessionResponseSchema,
  answer: flashcardSessionAnswerEvaluationResultResponseSchema,
});

export const submitFlashcardLearnAnswerResponseSchema = z.object({
  session: flashcardSessionResponseSchema,
  answer: flashcardSessionAnswerEvaluationResultResponseSchema,
  frontendReview: flashcardFrontendReviewResponseSchema,
});

export const studentCoursePerformanceSummaryResponseSchema = z.object({
  studentCourseSqid: z.string().trim().min(1),
  trackedFlashcardsCount: z.number().int(),
  masteredFlashcardsCount: z.number().int(),
  flashcardAccuracyRate: z.number(),
  learningRetentionRate: z.number(),
  confidenceScore: z.number(),
  overallPerformanceScore: z.number(),
  riskLevel: z.string().trim().min(1),
  aiStatus: z.string().trim().min(1),
  aiInsight: z.string(),
  improvementSuggestion: z.string(),
  lastComputedAt: z.coerce.date(),
});

export const studentOverallPerformanceSummaryResponseSchema = z.object({
  trackedCoursesCount: z.number().int(),
  trackedFlashcardsCount: z.number().int(),
  masteredFlashcardsCount: z.number().int(),
  flashcardAccuracyRate: z.number(),
  learningRetentionRate: z.number(),
  confidenceScore: z.number(),
  overallPerformanceScore: z.number(),
  riskLevel: z.string().trim().min(1),
  aiStatus: z.string().trim().min(1),
  aiInsight: z.string(),
  improvementSuggestion: z.string(),
  lastComputedAt: z.coerce.date(),
});

export const coursePerformanceSummarySnapshotResponseSchema = z.object({
  trackedFlashcardsCount: z.number().int(),
  masteredFlashcardsCount: z.number().int(),
  flashcardAccuracyRate: z.number(),
  learningRetentionRate: z.number(),
  confidenceScore: z.number(),
  overallPerformanceScore: z.number(),
  riskLevel: z.string().trim().min(1),
  aiStatus: z.string().trim().min(1),
  aiInsight: z.string(),
  improvementSuggestion: z.string(),
  lastComputedAt: z.coerce.date(),
});

export const overallPerformanceSummarySnapshotResponseSchema = z.object({
  trackedCoursesCount: z.number().int(),
  trackedFlashcardsCount: z.number().int(),
  masteredFlashcardsCount: z.number().int(),
  flashcardAccuracyRate: z.number(),
  learningRetentionRate: z.number(),
  confidenceScore: z.number(),
  overallPerformanceScore: z.number(),
  riskLevel: z.string().trim().min(1),
  aiStatus: z.string().trim().min(1),
  aiInsight: z.string(),
  improvementSuggestion: z.string(),
  lastComputedAt: z.coerce.date(),
});

export const coursePerformanceSummaryFlashcardContextResponseSchema = z.object({
  flashcardSqid: z.string().trim().min(1),
  question: z.string().trim().min(1),
  masteryLevel: z.string().trim().min(1),
  confidenceScore: z.number(),
  retentionScore: z.number(),
  riskLevel: z.string().trim().min(1),
  aiInsight: z.string(),
});

export const coursePerformanceSummaryBreakdownResponseSchema = z.object({
  studentCourseSqid: z.string().trim().min(1),
  courseName: z.string().trim().min(1),
  edpCode: z.string(),
  trackedFlashcardsCount: z.number().int(),
  masteredFlashcardsCount: z.number().int(),
  flashcardAccuracyRate: z.number(),
  learningRetentionRate: z.number(),
  confidenceScore: z.number(),
  overallPerformanceScore: z.number(),
  riskLevel: z.string().trim().min(1),
  aiInsight: z.string(),
});

export const studentCoursePerformanceSummaryEvaluationContextResponseSchema = z.object({
  studentCourseSqid: z.string().trim().min(1),
  courseName: z.string().trim().min(1),
  edpCode: z.string(),
  summary: coursePerformanceSummarySnapshotResponseSchema,
  topRiskFlashcards: z.array(coursePerformanceSummaryFlashcardContextResponseSchema),
});

export const studentOverallPerformanceSummaryEvaluationContextResponseSchema = z.object({
  summary: overallPerformanceSummarySnapshotResponseSchema,
  courseBreakdown: z.array(coursePerformanceSummaryBreakdownResponseSchema),
});

export type FlashcardApiResponse = z.output<typeof flashcardApiResponseSchema>;
export type GenerateFlashcardsFromNoteResponse = z.output<typeof generateFlashcardsFromNoteResponseSchema>;
export type StudentFlashcardProgressResponse = z.output<typeof studentFlashcardProgressResponseSchema>;
export type FlashcardAnswerEvaluationResponse = z.output<typeof flashcardAnswerEvaluationResponseSchema>;
export type FlashcardAttemptResultResponse = z.output<typeof flashcardAttemptResultResponseSchema>;
export type StudentFlashcardAnalyticsResponse = z.output<typeof studentFlashcardAnalyticsResponseSchema>;
export type FlashcardAnalyticsProgressSnapshotResponse = z.output<typeof flashcardAnalyticsProgressSnapshotResponseSchema>;
export type FlashcardAnalyticsRecentAnswerResponse = z.output<typeof flashcardAnalyticsRecentAnswerResponseSchema>;
export type FlashcardAnalyticsEvaluationContextResponse = z.output<typeof flashcardAnalyticsEvaluationContextResponseSchema>;
export type FlashcardFrontendReviewResponse = z.output<typeof flashcardFrontendReviewResponseSchema>;
export type SubmitAndAnalyzeFlashcardResponse = z.output<typeof submitAndAnalyzeFlashcardResponseSchema>;
export type FlashcardSessionItemResponse = z.output<typeof flashcardSessionItemResponseSchema>;
export type FlashcardSessionResponse = z.output<typeof flashcardSessionResponseSchema>;
export type FlashcardSessionAnswerEvaluationResultResponse = z.output<typeof flashcardSessionAnswerEvaluationResultResponseSchema>;
export type SubmitEvaluatedFlashcardSessionAnswerResponse = z.output<typeof submitEvaluatedFlashcardSessionAnswerResponseSchema>;
export type SubmitFlashcardLearnAnswerResponse = z.output<typeof submitFlashcardLearnAnswerResponseSchema>;
export type StudentCoursePerformanceSummaryResponse = z.output<typeof studentCoursePerformanceSummaryResponseSchema>;
export type StudentOverallPerformanceSummaryResponse = z.output<typeof studentOverallPerformanceSummaryResponseSchema>;
export type CoursePerformanceSummarySnapshotResponse = z.output<typeof coursePerformanceSummarySnapshotResponseSchema>;
export type OverallPerformanceSummarySnapshotResponse = z.output<typeof overallPerformanceSummarySnapshotResponseSchema>;
export type CoursePerformanceSummaryFlashcardContextResponse = z.output<typeof coursePerformanceSummaryFlashcardContextResponseSchema>;
export type CoursePerformanceSummaryBreakdownResponse = z.output<typeof coursePerformanceSummaryBreakdownResponseSchema>;
export type StudentCoursePerformanceSummaryEvaluationContextResponse = z.output<typeof studentCoursePerformanceSummaryEvaluationContextResponseSchema>;
export type StudentOverallPerformanceSummaryEvaluationContextResponse = z.output<typeof studentOverallPerformanceSummaryEvaluationContextResponseSchema>;
