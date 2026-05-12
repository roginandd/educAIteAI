import { z } from "zod";
import { flashcardEvaluationOutputSchema, flashcardStudyCoachRecapOutputSchema } from "./flashcard.dto";

const flashcardDraftItemTypeSchema = z.enum([
  "Flashcard",
  "Conceptual",
  "CodeReading",
  "Debugging",
  "Algorithm",
  "OutputPrediction",
  "MultipleChoice",
  "ShortAnswer",
]);

const flashcardDraftCognitiveSkillSchema = z.enum([
  "Recall",
  "Understand",
  "Apply",
  "Analyze",
  "Debug",
  "Design",
]);

const flashcardDraftLearningDomainSchema = z.enum([
  "Unknown",
  "Programming",
  "Database",
  "Math",
  "Writing",
  "Business",
  "GeneralEducation",
]);

const flashcardDraftRubricCriterionSchema = z.object({
  name: z.string().trim().min(1),
  weight: z.number().int().min(1).max(100),
  description: z.string().trim().default(""),
});

const flashcardDraftVisibleTestCaseSchema = z.object({
  name: z.string().trim().min(1),
  input: z.string().trim().min(1),
  expectedOutput: z.string().trim().min(1),
  explanation: z.string().trim().default(""),
});

const flashcardDraftOptionSchema = z.object({
  id: z.string().trim().min(1),
  text: z.string().trim().min(1),
});

const flashcardDraftBaseSchema = z.object({
  itemType: flashcardDraftItemTypeSchema,
  question: z.string().trim().min(1),
  explanation: z.string().default(""),
  answeringGuidance: z.string().default(""),
  difficulty: z.number().int().min(0).max(100).default(50),
  cognitiveSkill: flashcardDraftCognitiveSkillSchema.default("Recall"),
  learningDomain: flashcardDraftLearningDomainSchema.default("Unknown"),
  technicalLanguage: z.string().default(""),
  tags: z.array(z.string().trim().min(1)).default([]),
});

export const flashcardApiResponseSchema = z.object({
  sqid: z.string().trim().min(1),
  question: z.string().trim().min(1),
  answer: z.string().trim().min(1),
  conceptExplanation: z.string(),
  answeringGuidance: z.string(),
  acceptedAnswerAliases: z.array(z.string()),
  noteSqid: z.string().trim().min(1),
  documentSqid: z.string().trim().min(1),
  deckSqid: z.string().trim().min(1).nullable().optional(),
  sourceNoteSqid: z.string().trim().min(1).nullable().optional(),
  sourceDocumentSqid: z.string().trim().min(1).nullable().optional(),
  itemType: z.string().trim().min(1).optional(),
  difficulty: z.number().int().optional(),
  cognitiveSkill: z.string().trim().min(1).optional(),
  learningDomain: z.string().trim().min(1).optional(),
  technicalLanguage: z.string().optional(),
  tagsJson: z.string().optional(),
  rubricJson: z.string().optional(),
  validationConfigJson: z.string().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const generatedFlashcardDraftAiResponseSchema = z.discriminatedUnion("itemType", [
  flashcardDraftBaseSchema.extend({
    itemType: z.literal("Flashcard"),
    answer: z.string().trim().min(1),
    acceptedAnswerAliases: z.array(z.string().trim().min(1)).default([]),
  }),
  flashcardDraftBaseSchema.extend({
    itemType: z.literal("Conceptual"),
    expectedAnswer: z.string().trim().min(1),
    rubricCriteria: z.array(flashcardDraftRubricCriterionSchema).default([]),
  }),
  flashcardDraftBaseSchema.extend({
    itemType: z.literal("ShortAnswer"),
    expectedAnswer: z.string().trim().min(1),
    rubricCriteria: z.array(flashcardDraftRubricCriterionSchema).default([]),
  }),
  flashcardDraftBaseSchema.extend({
    itemType: z.literal("MultipleChoice"),
    options: z.array(flashcardDraftOptionSchema).min(2),
    correctOptionIds: z.array(z.string().trim().min(1)).min(1),
    singleSelect: z.boolean().default(true),
  }),
  flashcardDraftBaseSchema.extend({
    itemType: z.literal("CodeReading"),
    expectedAnswer: z.string().trim().min(1),
    codeSnippet: z.string().trim().min(1),
    language: z.string().default(""),
  }),
  flashcardDraftBaseSchema.extend({
    itemType: z.literal("Debugging"),
    expectedAnswer: z.string().trim().min(1),
    buggyCode: z.string().trim().min(1),
    visibleTestCases: z.array(flashcardDraftVisibleTestCaseSchema).default([]),
    expectedFixSummary: z.string().trim().optional(),
  }),
  flashcardDraftBaseSchema.extend({
    itemType: z.literal("Algorithm"),
    expectedAnswer: z.string().trim().min(1),
    functionSignature: z.string().trim().min(1),
    supportedLanguages: z.array(z.string().trim().min(1)).default([]),
    starterCodeByLanguage: z.record(z.string().trim().min(1), z.string().trim().min(1)).default({}),
    visibleTestCases: z.array(flashcardDraftVisibleTestCaseSchema).default([]),
    languagePolicy: z.string().trim().optional(),
  }),
  flashcardDraftBaseSchema.extend({
    itemType: z.literal("OutputPrediction"),
    codeSnippet: z.string().trim().min(1),
    expectedOutput: z.string().trim().min(1),
    language: z.string().default(""),
  }),
]);

const generatedFlashcardPreviewDraftAiResponseSchema = z.discriminatedUnion("itemType", [
  flashcardDraftBaseSchema.extend({
    itemType: z.literal("Flashcard"),
    answer: z.string().trim().min(1),
    acceptedAnswerAliases: z.array(z.string().trim().min(1)).default([]),
  }),
  flashcardDraftBaseSchema.extend({
    itemType: z.literal("Conceptual"),
    expectedAnswer: z.string().trim().min(1),
    rubricCriteria: z.array(flashcardDraftRubricCriterionSchema).default([]),
  }),
  flashcardDraftBaseSchema.extend({
    itemType: z.literal("ShortAnswer"),
    expectedAnswer: z.string().trim().min(1),
    rubricCriteria: z.array(flashcardDraftRubricCriterionSchema).default([]),
  }),
  flashcardDraftBaseSchema.extend({
    itemType: z.literal("MultipleChoice"),
    options: z.array(flashcardDraftOptionSchema).default([]),
    correctOptionIds: z.array(z.string().trim().min(1)).default([]),
    singleSelect: z.boolean().default(true),
  }),
  flashcardDraftBaseSchema.extend({
    itemType: z.literal("CodeReading"),
    expectedAnswer: z.string().trim().min(1),
    codeSnippet: z.string().trim().default(""),
    language: z.string().default(""),
  }),
  flashcardDraftBaseSchema.extend({
    itemType: z.literal("Debugging"),
    expectedAnswer: z.string().trim().min(1),
    buggyCode: z.string().trim().default(""),
    visibleTestCases: z.array(flashcardDraftVisibleTestCaseSchema).default([]),
    expectedFixSummary: z.string().trim().optional(),
  }),
  flashcardDraftBaseSchema.extend({
    itemType: z.literal("Algorithm"),
    expectedAnswer: z.string().trim().min(1),
    functionSignature: z.string().trim().default(""),
    supportedLanguages: z.array(z.string().trim().min(1)).default([]),
    starterCodeByLanguage: z.record(z.string().trim().min(1), z.string().trim().min(1)).default({}),
    visibleTestCases: z.array(flashcardDraftVisibleTestCaseSchema).default([]),
    languagePolicy: z.string().trim().optional(),
  }),
  flashcardDraftBaseSchema.extend({
    itemType: z.literal("OutputPrediction"),
    codeSnippet: z.string().trim().default(""),
    expectedOutput: z.string().trim().min(1),
    language: z.string().default(""),
  }),
]);

export const generateFlashcardsFromNoteResponseSchema = z.object({
  noteSqid: z.string().trim().min(1),
  generatedCount: z.number().int().min(1),
  flashcards: z.array(flashcardApiResponseSchema),
  drafts: z.array(generatedFlashcardDraftAiResponseSchema).optional().default([]),
});

export const generateFlashcardsPreviewResponseSchema = z.object({
  noteSqid: z.string().trim().min(1),
  generatedCount: z.number().int().min(0),
  drafts: z.array(generatedFlashcardPreviewDraftAiResponseSchema).default([]),
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
  itemType: z.string().trim().min(1).optional().default("Flashcard"),
  cognitiveSkill: z.string().trim().min(1).nullable().optional(),
  learningDomain: z.string().trim().min(1).nullable().optional(),
  technicalLanguage: z.string().optional().default(""),
  rubricJson: z.string().optional().default("{}"),
  validationConfigJson: z.string().optional().default("{}"),
  progress: flashcardAnalyticsProgressSnapshotResponseSchema,
  recentAnswers: z.array(flashcardAnalyticsRecentAnswerResponseSchema),
  currentAnalytics: studentFlashcardAnalyticsResponseSchema.nullable(),
});

export const flashcardFrontendReviewResponseSchema = z.object({
  resultTone: z.enum(["correct", "close", "partial", "incorrect"]),
  sentimentLabel: z.string().trim().min(1),
  verdict: z.string().default(""),
  qualityScore: z.number().nullable().optional(),
  isCorrect: z.boolean().nullable().optional(),
  answerReview: z.string().trim().min(1),
  conceptExplanation: z.string(),
  missingPart: z.string(),
  misconception: z.string().default(""),
  rubricFeedback: z.array(z.object({
    criterion: z.string(),
    score: z.number().nullable().optional(),
    feedback: z.string(),
  })).optional().default([]),
  technicalDiagnostics: z.object({
    language: z.string(),
    expectedBehavior: z.string(),
    actualBehavior: z.string(),
    issues: z.array(z.string()),
  }).nullable().optional(),
});

export const submitAndAnalyzeFlashcardResponseSchema = z.object({
  attempt: flashcardAttemptResultResponseSchema,
  analytics: studentFlashcardAnalyticsResponseSchema,
  analyticsStatus: z.enum(["Completed", "Pending", "Failed"]),
  frontendReview: flashcardFrontendReviewResponseSchema,
});

export const evaluateFlashcardAnswerResponseSchema = flashcardEvaluationOutputSchema;

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

export const flashcardLearnSessionStartFlowResponseSchema = z.object({
  action: z.enum(["created", "continueAvailable"]),
  session: flashcardSessionResponseSchema.nullable(),
  activeSession: flashcardSessionResponseSchema.nullable(),
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
  studyCoachRecap: flashcardStudyCoachRecapOutputSchema.nullable().optional(),
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
export type GenerateFlashcardsPreviewResponse = z.output<typeof generateFlashcardsPreviewResponseSchema>;
export type StudentFlashcardProgressResponse = z.output<typeof studentFlashcardProgressResponseSchema>;
export type FlashcardAnswerEvaluationResponse = z.output<typeof flashcardAnswerEvaluationResponseSchema>;
export type FlashcardAttemptResultResponse = z.output<typeof flashcardAttemptResultResponseSchema>;
export type StudentFlashcardAnalyticsResponse = z.output<typeof studentFlashcardAnalyticsResponseSchema>;
export type FlashcardAnalyticsProgressSnapshotResponse = z.output<typeof flashcardAnalyticsProgressSnapshotResponseSchema>;
export type FlashcardAnalyticsRecentAnswerResponse = z.output<typeof flashcardAnalyticsRecentAnswerResponseSchema>;
export type FlashcardAnalyticsEvaluationContextResponse = z.output<typeof flashcardAnalyticsEvaluationContextResponseSchema>;
export type FlashcardFrontendReviewResponse = z.output<typeof flashcardFrontendReviewResponseSchema>;
export type FlashcardStudyCoachRecapResponse = z.output<typeof flashcardStudyCoachRecapOutputSchema>;
export type SubmitAndAnalyzeFlashcardResponse = z.output<typeof submitAndAnalyzeFlashcardResponseSchema>;
export type EvaluateFlashcardAnswerResponse = z.output<typeof evaluateFlashcardAnswerResponseSchema>;
export type FlashcardSessionItemResponse = z.output<typeof flashcardSessionItemResponseSchema>;
export type FlashcardSessionResponse = z.output<typeof flashcardSessionResponseSchema>;
export type FlashcardLearnSessionStartFlowResponse = z.output<typeof flashcardLearnSessionStartFlowResponseSchema>;
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

