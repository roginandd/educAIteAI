import { z } from "zod";

export const studyBuddyRecentMessageSchema = z.object({
  role: z.string().trim().min(1).max(40),
  content: z.string().trim().min(1).max(4000),
});

export const studyBuddyOverallSummarySchema = z.object({
  overallPerformanceScore: z.number(),
  learningRetentionRate: z.number(),
  confidenceScore: z.number(),
  riskLevel: z.string().trim().min(1).max(80),
  aiInsight: z.string().trim().max(4000),
  improvementSuggestion: z.string().trim().max(4000),
});

export const studyBuddyCourseSummarySchema = z.object({
  studentCourseSqid: z.string().trim().min(1),
  courseName: z.string().trim().min(1).max(300),
  overallPerformanceScore: z.number(),
  learningRetentionRate: z.number(),
  confidenceScore: z.number(),
  riskLevel: z.string().trim().min(1).max(80),
  aiInsight: z.string().trim().max(4000),
  improvementSuggestion: z.string().trim().max(4000),
});

export const studyBuddyFlashcardRiskSchema = z.object({
  flashcardSqid: z.string().trim().min(1),
  question: z.string().trim().min(1).max(4000),
  masteryLevel: z.string().trim().min(1).max(80),
  confidenceScore: z.number(),
  retentionScore: z.number(),
  riskLevel: z.string().trim().min(1).max(80),
  aiInsight: z.string().trim().max(4000),
  improvementSuggestion: z.string().trim().max(4000),
});

export const studyBuddyContextSchema = z.object({
  overallSummary: studyBuddyOverallSummarySchema.nullable().optional(),
  topRiskCourses: z.array(studyBuddyCourseSummarySchema).max(10).default([]),
  topRiskFlashcards: z.array(studyBuddyFlashcardRiskSchema).max(10).default([]),
});

export const studyBuddyIntentSchema = z.enum([
  "greeting",
  "smalltalk",
  "studytoday",
  "weakestsubject",
  "topicfocus",
  "notelink",
  "weaktopics",
  "flashcardreview",
  "progresssummary",
  "notesfocus",
  "strugglediagnosis",
  "quizprep",
  "recentactivity",
  "repeatedmistakes",
  "confusedresponse",
  "unrelatedrefusal",
]);

export const studyBuddyRecentMaterialSchema = z.object({
  noteSqid: z.string().trim().min(1),
  documentSqid: z.string().trim().min(1),
  studentCourseSqid: z.string().trim().min(1),
  noteName: z.string().trim().min(1).max(400),
  documentName: z.string().trim().min(1).max(400),
  updatedAt: z.string().datetime(),
});

export const studyBuddyRecentQuizAttemptSchema = z.object({
  quizItemSqid: z.string().trim().min(1),
  prompt: z.string().trim().min(1).max(4000),
  correctnessScore: z.number().nullable().optional(),
  confidenceScore: z.number().nullable().optional(),
  answeredAt: z.string().datetime(),
});

export const studyBuddyWeakConceptSchema = z.object({
  concept: z.string().trim().min(1).max(4000),
  missCount: z.number().int().min(0),
  averageCorrectnessScore: z.number().nullable().optional(),
  lastAnsweredAt: z.string().datetime().nullable().optional(),
});

export const studyBuddyRecentActivitySchema = z.object({
  activityType: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(4000),
  occurredAt: z.string().datetime(),
});

export const studyBuddyStudentContextSnapshotSchema = z.object({
  recentMaterials: z.array(studyBuddyRecentMaterialSchema).max(20).default([]),
  recentQuizAttempts: z.array(studyBuddyRecentQuizAttemptSchema).max(20).default([]),
  repeatedWeakConcepts: z.array(studyBuddyWeakConceptSchema).max(20).default([]),
  recentActivityTimeline: z.array(studyBuddyRecentActivitySchema).max(30).default([]),
});

export const studyFocusChatInputSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  intent: studyBuddyIntentSchema.optional(),
  recentMessages: z.array(studyBuddyRecentMessageSchema).max(20).default([]),
  studyContext: studyBuddyContextSchema.default({
    overallSummary: null,
    topRiskCourses: [],
    topRiskFlashcards: [],
  }),
  studentContextSnapshot: studyBuddyStudentContextSnapshotSchema.optional(),
  behaviorInstruction: z.string().trim().min(1).max(2000),
});

export const studyFocusChatOutputSchema = z.object({
  message: z.string().trim().max(4000).default(""),
  recommendedTopic: z.string().trim().default(""),
  reason: z.string().trim().default(""),
  studySequence: z.array(z.string().trim().min(1).max(300)).max(8).default([]),
  reviewChecklist: z.array(z.string().trim().min(1).max(300)).max(8).default([]),
  practiceTask: z.string().trim().min(1).max(1000).nullable().optional(),
  fallbackText: z.string().trim().min(1).max(4000).nullable().optional(),
  primaryAction: z.object({
    label: z.string().trim().min(1).max(120),
    type: z.string().trim().min(1).max(80),
    href: z.string().trim().min(1).max(400),
  }).nullable().optional(),
  actions: z.array(z.object({
    label: z.string().trim().min(1).max(120),
    type: z.string().trim().min(1).max(80),
    href: z.string().trim().min(1).max(400),
  })).max(8).default([]),
  context: z.object({
    courseSqid: z.string().trim().nullable().optional(),
    topic: z.string().trim().nullable().optional(),
    noteSqid: z.string().trim().nullable().optional(),
    documentSqid: z.string().trim().nullable().optional(),
    deckSqid: z.string().trim().nullable().optional(),
    flashcardSqid: z.string().trim().nullable().optional(),
  }).nullable().optional(),
});

export type StudyFocusChatInput = z.output<typeof studyFocusChatInputSchema>;
export type StudyFocusChatOutput = z.output<typeof studyFocusChatOutputSchema>;
export type StudyBuddyCourseSummary = z.output<typeof studyBuddyCourseSummarySchema>;
export type StudyBuddyFlashcardRisk = z.output<typeof studyBuddyFlashcardRiskSchema>;
