import { z } from "zod";

export const smartQuizItemTypeSchema = z.enum([
  "Flashcard",
  "Conceptual",
  "CodeReading",
  "Debugging",
  "Sql",
  "Algorithm",
  "OutputPrediction",
  "FillInCode",
  "MultipleChoice",
  "ShortAnswer",
  "Flowchart",
]);

export const smartQuizV1ItemTypeSchema = z.enum([
  "Flashcard",
  "Conceptual",
  "CodeReading",
  "Debugging",
  "Algorithm",
  "OutputPrediction",
  "MultipleChoice",
  "ShortAnswer",
]);

export const smartQuizCognitiveSkillSchema = z.enum([
  "Recall",
  "Understand",
  "Apply",
  "Analyze",
  "Debug",
  "Design",
]);

export const smartQuizLearningDomainSchema = z.enum([
  "Unknown",
  "Programming",
  "Database",
  "Math",
  "Writing",
  "Business",
  "GeneralEducation",
]);

export const smartQuizVerdictSchema = z.enum([
  "ExactCorrect",
  "ConceptuallyCorrect",
  "Partial",
  "Incorrect",
]);

export const smartQuizValidationStatusSchema = z.enum([
  "Ready",
  "Pending",
  "Downgraded",
  "Failed",
]);

export const smartQuizHydrationStatusSchema = z.enum([
  "PreviewReady",
  "Hydrating",
  "Ready",
  "PartiallyReady",
  "Failed",
]);

export const noteContextSchema = z.object({
  noteSqid: z.string().trim().min(1),
  noteName: z.string().trim().min(1),
  noteContent: z.string().trim().min(1),
  documentSqid: z.string().trim().min(1).optional(),
  documentName: z.string().trim().min(1).optional(),
});

export const courseContextSchema = z.object({
  courseSqid: z.string().trim().min(1).optional(),
  courseName: z.string().trim().min(1).optional(),
  edpCode: z.string().trim().min(1).optional(),
});

export const smartQuizContextClassifyInputSchema = z.object({
  course: courseContextSchema.optional(),
  notes: z.array(noteContextSchema).min(1).max(12),
  generationIntent: z.object({
    targetLearnerLevel: z.enum(["beginner", "intermediate", "advanced"]).optional(),
    preferredItemCount: z.number().int().min(1).max(50).optional(),
  }).optional(),
});

export const smartQuizContextClassificationOutputSchema = z.object({
  inferredDomain: smartQuizLearningDomainSchema,
  inferredCognitiveSkill: smartQuizCognitiveSkillSchema,
  inferredTopic: z.string().trim().min(1),
  inferredSubtopics: z.array(z.string().trim().min(1)).default([]),
  inferredTechnicalLanguage: z.string().trim().default(""),
  difficulty: z.number().int().min(0).max(100),
  recommendedItemTypes: z.array(smartQuizV1ItemTypeSchema).min(1),
  keyConcepts: z.array(z.string().trim().min(1)).default([]),
  misconceptionRisks: z.array(z.string().trim().min(1)).default([]),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.object({
    field: z.string().trim().min(1),
    sourceText: z.string().trim().min(1),
  })).default([]),
});

export const smartQuizRubricCriterionSchema = z.object({
  name: z.string().trim().min(1),
  weight: z.number().int().min(1).max(100),
  description: z.string().trim().min(1).optional(),
});

const smartQuizValidationOptionSchema = z.object({
  id: z.string().trim().min(1),
  text: z.string().trim().min(1),
});

const smartQuizVisibleTestCaseSchema = z.object({
  name: z.string().trim().min(1),
  input: z.string().trim().min(1),
  expectedOutput: z.string().trim().min(1),
});

const generatedSmartQuizVisibleTestCaseSchema = z.union([
  smartQuizVisibleTestCaseSchema,
  z.string().trim().min(1),
]);

const smartQuizStringMapSchema = z.record(
  z.string().trim().min(1),
  z.string().trim().min(1),
).refine((value) => Object.keys(value).length > 0, {
  message: "At least one entry is required.",
});

const multipleChoiceValidationConfigSchema = z.object({
  options: z.array(smartQuizValidationOptionSchema).length(4),
  correctOptionIds: z.array(z.string().trim().min(1)).min(1),
}).superRefine((value, context) => {
  const optionIds = new Set(value.options.map((option) => option.id));
  for (const correctOptionId of value.correctOptionIds) {
    if (!optionIds.has(correctOptionId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["correctOptionIds"],
        message: `correctOptionIds contains unknown option id "${correctOptionId}".`,
      });
    }
  }
});

const codeReadingValidationConfigSchema = z.object({
  language: z.string().trim().min(1),
  codeSnippet: z.string().trim().min(1),
});

const outputPredictionValidationConfigSchema = z.object({
  language: z.string().trim().min(1).optional(),
  codeSnippet: z.string().trim().min(1),
  expectedOutput: z.string().trim().min(1),
});

const algorithmValidationConfigSchema = z.object({
  functionSignature: z.string().trim().min(1),
  starterCodeByLanguage: smartQuizStringMapSchema,
  visibleTestCases: z.array(smartQuizVisibleTestCaseSchema).min(1),
  constraints: z.string().trim().min(1).optional(),
  private: z.object({
    hiddenTestCases: z.array(smartQuizVisibleTestCaseSchema).default([]).optional(),
    referenceSolutionByLanguage: smartQuizStringMapSchema.optional(),
  }).partial().optional(),
});

const debuggingValidationConfigSchema = z.object({
  buggyCode: z.string().trim().min(1),
  visibleTestCases: z.array(smartQuizVisibleTestCaseSchema).min(1),
  private: z.object({
    expectedFix: z.string().trim().min(1).optional(),
    hiddenTestCases: z.array(smartQuizVisibleTestCaseSchema).default([]).optional(),
  }).partial().optional(),
});

const genericValidationConfigSchema = z.record(z.string(), z.unknown()).default({});

const generatedSmartQuizItemDraftBaseSchema = z.object({
  itemType: smartQuizV1ItemTypeSchema,
  question: z.string().trim().min(1).max(4000),
  expectedAnswer: z.string().trim().max(4000).default(""),
  explanation: z.string().trim().max(4000).default(""),
  answeringGuidance: z.string().trim().max(2000).default(""),
  difficulty: z.number().int().min(0).max(100),
  cognitiveSkill: smartQuizCognitiveSkillSchema,
  learningDomain: smartQuizLearningDomainSchema,
  technicalLanguage: z.string().trim().max(80).default(""),
  tags: z.array(z.string().trim().min(1)).default([]),
  rubric: z.object({
    criteria: z.array(z.union([smartQuizRubricCriterionSchema, z.string().trim().min(1)])).default([]),
  }).default({ criteria: [] }),
  validationConfig: genericValidationConfigSchema.optional().default({}),
  sourceNoteSqids: z.array(z.string().trim().min(1)).default([]),
});

export const generatedSmartQuizItemDraftSchema = z.discriminatedUnion("itemType", [
  generatedSmartQuizItemDraftBaseSchema.extend({
    itemType: z.literal("Flashcard"),
    answer: z.string().trim().max(4000).default(""),
    acceptedAnswerAliases: z.array(z.string().trim().min(1)).default([]),
  }),
  generatedSmartQuizItemDraftBaseSchema.extend({
    itemType: z.literal("Conceptual"),
    rubricCriteria: z.array(smartQuizRubricCriterionSchema).default([]),
  }),
  generatedSmartQuizItemDraftBaseSchema.extend({
    itemType: z.literal("ShortAnswer"),
    rubricCriteria: z.array(smartQuizRubricCriterionSchema).default([]),
  }),
  generatedSmartQuizItemDraftBaseSchema.extend({
    itemType: z.literal("MultipleChoice"),
    options: z.array(smartQuizValidationOptionSchema).default([]),
    correctOptionIds: z.array(z.string().trim().min(1)).default([]),
    singleSelect: z.boolean().default(true),
  }),
  generatedSmartQuizItemDraftBaseSchema.extend({
    itemType: z.literal("CodeReading"),
    codeSnippet: z.string().trim().max(20000).default(""),
    language: z.string().trim().max(80).default(""),
  }),
  generatedSmartQuizItemDraftBaseSchema.extend({
    itemType: z.literal("OutputPrediction"),
    codeSnippet: z.string().trim().max(20000).default(""),
    expectedOutput: z.string().trim().max(4000).default(""),
    language: z.string().trim().max(80).default(""),
  }),
  generatedSmartQuizItemDraftBaseSchema.extend({
    itemType: z.literal("Algorithm"),
    functionSignature: z.string().trim().max(2000).default(""),
    supportedLanguages: z.array(z.string().trim().min(1)).default([]),
    starterCodeByLanguage: z.record(z.string().trim().min(1), z.string().trim().min(1)).default({}),
    visibleTestCases: z.array(generatedSmartQuizVisibleTestCaseSchema).default([]),
    hiddenTestCases: z.array(generatedSmartQuizVisibleTestCaseSchema).default([]),
    languagePolicy: z.string().trim().max(120).optional(),
  }),
  generatedSmartQuizItemDraftBaseSchema.extend({
    itemType: z.literal("Debugging"),
    buggyCode: z.string().trim().max(20000).default(""),
    language: z.string().trim().max(80).default(""),
    visibleTestCases: z.array(generatedSmartQuizVisibleTestCaseSchema).default([]),
    hiddenTestCases: z.array(generatedSmartQuizVisibleTestCaseSchema).default([]),
    expectedFixSummary: z.string().trim().max(4000).optional(),
  }),
]);

export const normalizedGeneratedSmartQuizItemDraftSchema = z.discriminatedUnion("itemType", [
  generatedSmartQuizItemDraftBaseSchema.omit({ rubric: true, validationConfig: true }).extend({
    itemType: z.literal("Flashcard"),
    answer: z.string().trim().min(1).max(4000),
    acceptedAnswerAliases: z.array(z.string().trim().min(1)).default([]),
  }),
  generatedSmartQuizItemDraftBaseSchema.omit({ rubric: true, validationConfig: true }).extend({
    itemType: z.literal("Conceptual"),
    expectedAnswer: z.string().trim().min(1).max(4000),
    rubricCriteria: z.array(smartQuizRubricCriterionSchema).min(1),
  }),
  generatedSmartQuizItemDraftBaseSchema.omit({ rubric: true, validationConfig: true }).extend({
    itemType: z.literal("ShortAnswer"),
    expectedAnswer: z.string().trim().min(1).max(4000),
    rubricCriteria: z.array(smartQuizRubricCriterionSchema).min(1),
  }),
  generatedSmartQuizItemDraftBaseSchema.omit({ rubric: true, validationConfig: true }).extend({
    itemType: z.literal("MultipleChoice"),
    expectedAnswer: z.string().trim().min(1).max(4000),
    options: z.array(smartQuizValidationOptionSchema).length(4),
    correctOptionIds: z.array(z.string().trim().min(1)).min(1),
    singleSelect: z.boolean().default(true),
  }),
  generatedSmartQuizItemDraftBaseSchema.omit({ rubric: true, validationConfig: true }).extend({
    itemType: z.literal("CodeReading"),
    expectedAnswer: z.string().trim().min(1).max(4000),
    codeSnippet: z.string().trim().min(1).max(20000),
    language: z.string().trim().min(1).max(80),
  }),
  generatedSmartQuizItemDraftBaseSchema.omit({ rubric: true, validationConfig: true }).extend({
    itemType: z.literal("OutputPrediction"),
    expectedAnswer: z.string().trim().min(1).max(4000),
    codeSnippet: z.string().trim().min(1).max(20000),
    expectedOutput: z.string().trim().min(1).max(4000),
    language: z.string().trim().min(1).max(80),
  }),
  generatedSmartQuizItemDraftBaseSchema.omit({ rubric: true, validationConfig: true }).extend({
    itemType: z.literal("Algorithm"),
    expectedAnswer: z.string().trim().min(1).max(4000),
    functionSignature: z.string().trim().min(1).max(2000),
    supportedLanguages: z.array(z.string().trim().min(1)).default([]),
    starterCodeByLanguage: smartQuizStringMapSchema,
    visibleTestCases: z.array(smartQuizVisibleTestCaseSchema).min(1),
    hiddenTestCases: z.array(smartQuizVisibleTestCaseSchema).default([]),
    languagePolicy: z.string().trim().max(120).optional(),
  }),
  generatedSmartQuizItemDraftBaseSchema.omit({ rubric: true, validationConfig: true }).extend({
    itemType: z.literal("Debugging"),
    expectedAnswer: z.string().trim().min(1).max(4000),
    buggyCode: z.string().trim().min(1).max(20000),
    language: z.string().trim().min(1).max(80),
    visibleTestCases: z.array(smartQuizVisibleTestCaseSchema).min(1),
    hiddenTestCases: z.array(smartQuizVisibleTestCaseSchema).default([]),
    expectedFixSummary: z.string().trim().max(4000).optional(),
  }),
]);

export const generateSmartQuizItemsPreviewInputSchema = z.object({
  deckSqid: z.string().trim().min(1).optional(),
  count: z.coerce.number().int().min(3).max(10).optional(),
  course: courseContextSchema.optional(),
  notes: z.array(noteContextSchema).min(1).max(12),
  classification: smartQuizContextClassificationOutputSchema.optional(),
  generationOptions: z.object({
    count: z.coerce.number().int().min(3).max(10).default(10),
    allowedItemTypes: z.array(smartQuizV1ItemTypeSchema).optional(),
    includeRubrics: z.boolean().default(true),
    excludeQuestions: z.array(z.string().trim().min(1)).default([]),
  }).optional(),
});

export const smartQuizSelectItemTypeInputSchema = z.object({
  sourceText: z.string().trim().min(1).max(50000),
  technicalLanguage: z.string().trim().max(80).optional().default(""),
});

export const smartQuizSelectItemTypeOutputSchema = z.object({
  selectedItemType: smartQuizV1ItemTypeSchema,
  recommendedItemTypes: z.array(smartQuizV1ItemTypeSchema).min(1),
  learningDomain: smartQuizLearningDomainSchema,
  cognitiveSkill: smartQuizCognitiveSkillSchema,
  reason: z.string().trim().min(1),
  confidence: z.number().min(0).max(1),
  technicalLanguage: z.string().trim().default(""),
  requiresExecutionValidation: z.boolean(),
});

export const generateSmartQuizItemsPreviewOutputSchema = z.object({
  drafts: z.array(generatedSmartQuizItemDraftSchema).min(1),
  generationWarnings: z.array(z.string().trim().min(1)).default([]),
  metadata: z.object({
    promptVersion: z.string().trim().min(1),
    model: z.string().trim().min(1),
    generatedAt: z.string().datetime(),
  }),
});

export const normalizedGenerateSmartQuizItemsPreviewOutputSchema = z.object({
  drafts: z.array(normalizedGeneratedSmartQuizItemDraftSchema).min(1),
  generationWarnings: z.array(z.string().trim().min(1)).default([]),
  metadata: z.object({
    promptVersion: z.string().trim().min(1),
    model: z.string().trim().min(1),
    generatedAt: z.string().datetime(),
  }),
});

const smartQuizDraftValidationFieldsSchema = z.object({
  draftId: z.string().trim().min(1),
  validationStatus: smartQuizValidationStatusSchema,
  validationWarnings: z.array(z.string().trim().min(1)).default([]),
  validationErrors: z.array(z.string().trim().min(1)).default([]),
});

export const smartQuizGenerationPreviewDraftSchema = generatedSmartQuizItemDraftSchema
  .and(smartQuizDraftValidationFieldsSchema);

export const smartQuizSafePracticeDraftSchema = normalizedGeneratedSmartQuizItemDraftSchema
  .and(smartQuizDraftValidationFieldsSchema.extend({
    validationStatus: z.enum(["Ready", "Downgraded"]),
  }));

export const generateSmartQuizItemsPreviewJobOutputSchema = z.object({
  generationJobSqid: z.string().trim().min(1),
  requestedCount: z.number().int().min(3).max(10),
  drafts: z.array(smartQuizGenerationPreviewDraftSchema),
  hydrationStatus: smartQuizHydrationStatusSchema,
  warnings: z.array(z.string().trim().min(1)).default([]),
  errors: z.array(z.string().trim().min(1)).default([]),
  metadata: z.object({
    promptVersion: z.string().trim().min(1),
    model: z.string().trim().min(1),
    generatedAt: z.string().datetime(),
  }),
});

export const smartQuizGenerationJobParamsSchema = z.object({
  generationJobSqid: z.string().trim().min(1),
});

export const smartQuizGenerationJobOutputSchema = generateSmartQuizItemsPreviewJobOutputSchema.extend({
  jobStatus: smartQuizHydrationStatusSchema,
  safeToPracticeDrafts: z.array(smartQuizSafePracticeDraftSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const csvItemTypesSchema = z.string().trim().transform((value) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean),
);

const multipartAllowedItemTypesSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    if (trimmed.startsWith("[")) {
      try {
        return JSON.parse(trimmed) as unknown;
      } catch {
        return trimmed;
      }
    }

    return trimmed;
  }

  return value;
}, z.union([
  z.array(smartQuizV1ItemTypeSchema),
  csvItemTypesSchema.pipe(z.array(smartQuizV1ItemTypeSchema)),
]).optional());

export const analyzePdfAndGenerateSmartQuizPreviewBodySchema = z.object({
  count: z.coerce.number().int().min(3).max(10).optional().default(5),
  allowedItemTypes: multipartAllowedItemTypesSchema,
  technicalLanguageHint: z.string().trim().max(80).optional().default(""),
  programContext: z.string().trim().max(4000).optional(),
  sourceNoteSqid: z.string().trim().min(1).optional(),
  sourceDocumentSqid: z.string().trim().min(1).optional(),
  documentName: z.string().trim().min(1).optional(),
});

export const analyzePdfAndGenerateSmartQuizPreviewOutputSchema = z.object({
  extractedText: z.string().trim().min(1),
  effectiveItemTypes: z.array(smartQuizV1ItemTypeSchema).min(1),
  effectiveLearningDomain: smartQuizLearningDomainSchema,
  effectiveCognitiveSkill: smartQuizCognitiveSkillSchema,
  effectiveTechnicalLanguage: z.string().trim().default(""),
  inferenceConfidence: z.number().min(0).max(1),
  inferenceReason: z.string().trim().min(1),
  drafts: z.array(normalizedGeneratedSmartQuizItemDraftSchema).min(1),
  generationWarnings: z.array(z.string().trim().min(1)).default([]),
  metadata: z.object({
    promptVersion: z.string().trim().min(1),
    model: z.string().trim().min(1),
    generatedAt: z.string().datetime(),
  }),
});

export const scoreSmartQuizAnswerInputSchema = z.object({
  quizItem: z.intersection(
    generatedSmartQuizItemDraftSchema,
    z.object({
      quizItemSqid: z.string().trim().min(1).optional(),
    }),
  ),
  studentAnswer: z.object({
    answerText: z.string().trim().min(1),
  }),
  context: z.object({
    courseName: z.string().trim().min(1).optional(),
    noteSnippets: z.array(z.string().trim().min(1)).default([]),
  }).optional(),
});

export const smartQuizScoringOutputSchema = z.object({
  scorePercent: z.number().int().min(0).max(100),
  qualityScore: z.number().int().min(0).max(5),
  correctnessScore: z.number().int().min(0).max(100),
  completenessScore: z.number().int().min(0).max(100),
  confidenceScore: z.number().int().min(0).max(100),
  clarityScore: z.number().int().min(0).max(100),
  misconceptionScore: z.number().int().min(0).max(100),
  uncertaintyScore: z.number().int().min(0).max(100),
  sentimentLabel: z.string().trim().min(1).default("Neutral"),
  verdict: smartQuizVerdictSchema,
  scoringSource: z.enum(["Ai", "FallbackRules", "Compiler", "Hybrid"]).default("Ai"),
  aiConfidence: z.number().int().min(0).max(100),
  feedbackSummary: z.string().trim().min(1).max(1000),
  semanticRationale: z.string().trim().max(4000).default(""),
  misconceptions: z.array(z.string().trim().min(1)).default([]),
  rubricBreakdown: z.record(z.string(), z.unknown()).default({}),
  needsStudentConfirmation: z.boolean().default(false),
  lowConfidenceReason: z.string().trim().max(1000).default(""),
});

export const executeSmartQuizCodeInputSchema = z.object({
  language: z.enum(["cpp", "csharp", "java", "python", "javascript", "sql"]),
  runtimeVersion: z.string().trim().min(1).optional(),
  prompt: z.string().trim().min(1).optional(),
  starterCode: z.string().default(""),
  studentCode: z.string().trim().min(1).max(20000),
  visibleTests: z.array(z.record(z.string(), z.unknown())).default([]),
  hiddenTests: z.array(z.record(z.string(), z.unknown())).default([]),
  limits: z.object({
    timeoutMs: z.number().int().min(100).max(10000).default(3000),
    memoryMb: z.number().int().min(16).max(512).default(128),
    network: z.literal(false).default(false),
  }).default({
    timeoutMs: 3000,
    memoryMb: 128,
    network: false,
  }),
});

export const codeExecutionOutputSchema = z.object({
  executionStatus: z.enum(["completed", "compileError", "runtimeError", "timeout", "memoryLimitExceeded", "sandboxUnavailable"]),
  compileStatus: z.enum(["success", "failed", "notRun"]),
  runtimeStatus: z.enum(["completed", "failed", "notRun"]),
  stdout: z.string().default(""),
  stderr: z.string().default(""),
  visibleTestsPassed: z.number().int().min(0),
  visibleTestsTotal: z.number().int().min(0),
  hiddenTestsPassed: z.number().int().min(0),
  hiddenTestsTotal: z.number().int().min(0),
  message: z.string().trim().min(1),
  results: z.array(z.object({
    name: z.string().trim().min(1).default("Test"),
    passed: z.boolean().default(false),
    input: z.string().default(""),
    expectedOutput: z.string().default(""),
    actualOutput: z.string().default(""),
    stderr: z.string().default(""),
    status: z.string().default(""),
  })).default([]),
  hiddenSummary: z.object({
    passed: z.number().int().min(0),
    failed: z.number().int().min(0),
    total: z.number().int().min(0),
  }).default({
    passed: 0,
    failed: 0,
    total: 0,
  }),
});

export const codeFeedbackOutputSchema = smartQuizScoringOutputSchema.extend({
  execution: codeExecutionOutputSchema,
});

export const flowchartEvaluateInputSchema = z.object({
  quizItem: z.intersection(
    generatedSmartQuizItemDraftSchema,
    z.object({
      quizItemSqid: z.string().trim().min(1).optional(),
      expectedProcess: z.array(z.string().trim().min(1)).default([]),
    }),
  ),
  studentAnswer: z.object({
    format: z.literal("mermaid"),
    mermaidText: z.string().trim().min(1).max(10000),
  }),
});

export const flowchartEvaluationOutputSchema = smartQuizScoringOutputSchema.extend({
  parseStatus: z.enum(["valid", "invalid"]),
  missingSteps: z.array(z.string().trim().min(1)).default([]),
  incorrectBranches: z.array(z.string().trim().min(1)).default([]),
});

export const retryVariantInputSchema = z.object({
  originalItem: generatedSmartQuizItemDraftSchema,
  studentAttempt: smartQuizScoringOutputSchema,
  weaknessSignals: z.array(z.string().trim().min(1)).default([]),
  targetDifficulty: z.enum(["same", "easier", "harder"]).default("same"),
});

export const retryVariantOutputSchema = z.object({
  retryItem: generatedSmartQuizItemDraftSchema,
  targetedWeaknesses: z.array(z.string().trim().min(1)).default([]),
});

export type SmartQuizContextClassifyInput = z.output<typeof smartQuizContextClassifyInputSchema>;
export type SmartQuizContextClassificationOutput = z.output<typeof smartQuizContextClassificationOutputSchema>;
export type SmartQuizSelectItemTypeInput = z.output<typeof smartQuizSelectItemTypeInputSchema>;
export type SmartQuizSelectItemTypeOutput = z.output<typeof smartQuizSelectItemTypeOutputSchema>;
export type SmartQuizValidationStatus = z.output<typeof smartQuizValidationStatusSchema>;
export type SmartQuizHydrationStatus = z.output<typeof smartQuizHydrationStatusSchema>;
export type GenerateSmartQuizItemsPreviewInput = z.output<typeof generateSmartQuizItemsPreviewInputSchema>;
export type GenerateSmartQuizItemsPreviewOutput = z.output<typeof generateSmartQuizItemsPreviewOutputSchema>;
export type NormalizedGenerateSmartQuizItemsPreviewOutput = z.output<typeof normalizedGenerateSmartQuizItemsPreviewOutputSchema>;
export type GenerateSmartQuizItemsPreviewJobOutput = z.output<typeof generateSmartQuizItemsPreviewJobOutputSchema>;
export type SmartQuizGenerationJobOutput = z.output<typeof smartQuizGenerationJobOutputSchema>;
export type AnalyzePdfAndGenerateSmartQuizPreviewBody = z.output<typeof analyzePdfAndGenerateSmartQuizPreviewBodySchema>;
export type AnalyzePdfAndGenerateSmartQuizPreviewOutput = z.output<typeof analyzePdfAndGenerateSmartQuizPreviewOutputSchema>;
export type ScoreSmartQuizAnswerInput = z.output<typeof scoreSmartQuizAnswerInputSchema>;
export type SmartQuizScoringOutput = z.output<typeof smartQuizScoringOutputSchema>;
export type ExecuteSmartQuizCodeInput = z.output<typeof executeSmartQuizCodeInputSchema>;
export type CodeExecutionOutput = z.output<typeof codeExecutionOutputSchema>;
export type CodeFeedbackOutput = z.output<typeof codeFeedbackOutputSchema>;
export type FlowchartEvaluateInput = z.output<typeof flowchartEvaluateInputSchema>;
export type FlowchartEvaluationOutput = z.output<typeof flowchartEvaluationOutputSchema>;
export type RetryVariantInput = z.output<typeof retryVariantInputSchema>;
export type RetryVariantOutput = z.output<typeof retryVariantOutputSchema>;
