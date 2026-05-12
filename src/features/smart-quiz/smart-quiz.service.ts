import type { Content } from "@google/genai";
import type { Runner } from "@google/adk";
import type { Express } from "express";
import { randomUUID } from "node:crypto";

import { env } from "../../config/env";
import { AppError } from "../../shared/errors/app-error";
import { NotFoundError } from "../../shared/errors/not-found-error";
import { StructuredAgentRunnerService } from "../../shared/ai/structured-agent-runner.service";
import { pdfExtractionOutputSchema, type PdfExtractionOutput } from "../../shared/pdf/pdf-extraction.dto";
import { PdfProcessingService } from "../../shared/pdf/pdf-processing.service";
import { cleanupUploadedFile, readUploadedFileAsBase64 } from "../../shared/uploads/uploaded-file";
import {
  analyzePdfAndGenerateSmartQuizPreviewOutputSchema,
  codeFeedbackOutputSchema,
  executeSmartQuizCodeInputSchema,
  flowchartEvaluateInputSchema,
  flowchartEvaluationOutputSchema,
  generateSmartQuizItemsPreviewJobOutputSchema,
  generateSmartQuizItemsPreviewInputSchema,
  generateSmartQuizItemsPreviewOutputSchema,
  normalizedGenerateSmartQuizItemsPreviewOutputSchema,
  retryVariantInputSchema,
  retryVariantOutputSchema,
  scoreSmartQuizAnswerInputSchema,
  smartQuizGenerationJobOutputSchema,
  smartQuizContextClassificationOutputSchema,
  smartQuizContextClassifyInputSchema,
  smartQuizScoringOutputSchema,
  type CodeFeedbackOutput,
  type CodeExecutionOutput,
  type ExecuteSmartQuizCodeInput,
  type FlowchartEvaluateInput,
  type FlowchartEvaluationOutput,
  type AnalyzePdfAndGenerateSmartQuizPreviewBody,
  type AnalyzePdfAndGenerateSmartQuizPreviewOutput,
  type GenerateSmartQuizItemsPreviewJobOutput,
  type GenerateSmartQuizItemsPreviewInput,
  type GenerateSmartQuizItemsPreviewOutput,
  type NormalizedGenerateSmartQuizItemsPreviewOutput,
  type RetryVariantInput,
  type RetryVariantOutput,
  type ScoreSmartQuizAnswerInput,
  type SmartQuizContextClassificationOutput,
  type SmartQuizContextClassifyInput,
  type SmartQuizGenerationJobOutput,
  type SmartQuizHydrationStatus,
  type SmartQuizSelectItemTypeInput,
  type SmartQuizSelectItemTypeOutput,
  type SmartQuizScoringOutput,
  type SmartQuizValidationStatus,
  smartQuizSelectItemTypeInputSchema,
  smartQuizSelectItemTypeOutputSchema,
} from "./smart-quiz.dto";
import type { CodeExecutionSupervisor } from "./code-execution-supervisor";
import { SmartQuizGenerationJobRepository } from "./smart-quiz-generation-job.repository";

export class SmartQuizService {
  constructor(
    private readonly contextClassifierRunner: Runner,
    private readonly itemGeneratorRunner: Runner,
    private readonly answerScoringRunner: Runner,
    private readonly codeFeedbackRunner: Runner,
    private readonly flowchartEvaluatorRunner: Runner,
    private readonly retryVariantRunner: Runner,
    private readonly pdfExtractionRunner: Runner,
    private readonly structuredAgentRunnerService: StructuredAgentRunnerService,
    private readonly codeExecutionSupervisor: CodeExecutionSupervisor,
    private readonly pdfProcessingService: PdfProcessingService,
    private readonly generationJobRepository: SmartQuizGenerationJobRepository,
  ) {}

  async classifyContext(input: SmartQuizContextClassifyInput): Promise<SmartQuizContextClassificationOutput> {
    const parsedInput = smartQuizContextClassifyInputSchema.parse(input);

    return this.structuredAgentRunnerService.runStructuredPrompt({
      runner: this.contextClassifierRunner,
      userId: buildUserId("smart-quiz-context"),
      message: buildJsonPrompt("Classify this smart quiz source context.", parsedInput),
      outputKey: "smart_quiz_context_classification_output",
      outputSchema: smartQuizContextClassificationOutputSchema,
      invalidJsonMessage: "Unable to parse smart quiz context classification.",
      noResponseMessage: "Smart quiz context classifier did not return a response.",
    });
  }

  async selectItemType(input: SmartQuizSelectItemTypeInput): Promise<SmartQuizSelectItemTypeOutput> {
    const parsedInput = smartQuizSelectItemTypeInputSchema.parse(input);
    const classification = await this.classifyContext({
      notes: [
        {
          noteSqid: "inline-source",
          noteName: "Inline source material",
          noteContent: parsedInput.sourceText,
        },
      ],
      generationIntent: {
        preferredItemCount: 1,
      },
    });

    const recommendedItemTypes = deriveRecommendedItemTypesFromClassification(classification, {
      includeProgrammingPrimaryTypes: true,
    });
    const selectedItemType = recommendedItemTypes[0] ?? "Conceptual";
    const requiresExecutionValidation =
      selectedItemType === "Algorithm"
      || selectedItemType === "Debugging"
      || selectedItemType === "OutputPrediction";

    return smartQuizSelectItemTypeOutputSchema.parse({
      selectedItemType,
      recommendedItemTypes,
      learningDomain: classification.inferredDomain,
      cognitiveSkill: classification.inferredCognitiveSkill,
      reason: `Selected from classified topic '${classification.inferredTopic}'.`,
      confidence: classification.confidence,
      technicalLanguage: parsedInput.technicalLanguage || classification.inferredTechnicalLanguage || "",
      requiresExecutionValidation,
    });
  }

  async analyzePdfAndGeneratePreview(
    input: AnalyzePdfAndGenerateSmartQuizPreviewBody,
    file: Express.Multer.File | undefined,
  ): Promise<AnalyzePdfAndGenerateSmartQuizPreviewOutput> {
    const pdfFile = requirePdfFile(file);
    const diagnosticId = createSmartQuizPdfDiagnosticId();
    let diagnosticStage = "received";
    const diagnosticContext: Record<string, unknown> = {
      fileName: pdfFile.originalname,
      fileSizeBytes: pdfFile.size,
      documentName: input.documentName,
      count: input.count,
      allowedItemTypes: input.allowedItemTypes ?? [],
      technicalLanguageHint: input.technicalLanguageHint,
      sourceNoteSqid: input.sourceNoteSqid,
      sourceDocumentSqid: input.sourceDocumentSqid,
    };

    logSmartQuizPdfProgress(diagnosticId, diagnosticStage, diagnosticContext);

    try {
      diagnosticStage = "extracting_pdf_text";
      logSmartQuizPdfProgress(diagnosticId, diagnosticStage, diagnosticContext);
      const uploadedPdfBase64 = await readUploadedFileAsBase64(pdfFile);
      const extractedText = await extractPdfTextWithAgent(
        this.pdfProcessingService,
        this.pdfExtractionRunner,
        uploadedPdfBase64,
      );
      diagnosticContext.extractedTextChars = extractedText.length;
      diagnosticContext.extractedTextLines = countNonEmptyLines(extractedText);
      logSmartQuizPdfProgress(diagnosticId, "pdf_text_extracted", diagnosticContext);

      diagnosticStage = "classifying_context";
      const classification = await this.classifyContext({
        notes: [
          {
            noteSqid: input.sourceNoteSqid ?? "uploaded-pdf",
            noteName: input.documentName?.trim() || pdfFile.originalname || "Uploaded PDF",
            noteContent: extractedText,
            documentSqid: input.sourceDocumentSqid,
            documentName: input.documentName?.trim() || pdfFile.originalname || undefined,
          },
        ],
        generationIntent: {
          preferredItemCount: input.count,
        },
      });
      diagnosticContext.classification = {
        inferredDomain: classification.inferredDomain,
        inferredTopic: classification.inferredTopic,
        inferredTechnicalLanguage: classification.inferredTechnicalLanguage,
        recommendedItemTypes: classification.recommendedItemTypes,
        confidence: classification.confidence,
      };
      logSmartQuizPdfProgress(diagnosticId, "context_classified", diagnosticContext);

      const effectiveTechnicalLanguage = input.technicalLanguageHint?.trim()
        ? input.technicalLanguageHint.trim()
        : classification.inferredTechnicalLanguage;

      diagnosticStage = "generating_preview";
      const preview = await this.generatePreviewDrafts({
        notes: [
          {
            noteSqid: input.sourceNoteSqid ?? "uploaded-pdf",
            noteName: input.documentName?.trim() || pdfFile.originalname || "Uploaded PDF",
            noteContent: extractedText,
            documentSqid: input.sourceDocumentSqid,
            documentName: input.documentName?.trim() || pdfFile.originalname || undefined,
          },
        ],
        classification: {
          ...classification,
          inferredTechnicalLanguage: effectiveTechnicalLanguage,
        },
        generationOptions: {
          count: input.count,
          allowedItemTypes: input.allowedItemTypes,
          includeRubrics: true,
          excludeQuestions: [],
        },
      });
      diagnosticContext.generatedDraftCount = preview.drafts.length;
      diagnosticContext.generatedItemTypes = preview.drafts.map((draft) => draft.itemType);
      diagnosticContext.generationWarnings = preview.generationWarnings;
      logSmartQuizPdfProgress(diagnosticId, "preview_generated", diagnosticContext);

      const effectiveItemTypes = input.allowedItemTypes?.length
        ? classification.recommendedItemTypes.filter((itemType) => input.allowedItemTypes?.includes(itemType))
        : classification.recommendedItemTypes;

      diagnosticStage = "building_response";
      const response = analyzePdfAndGenerateSmartQuizPreviewOutputSchema.parse({
        extractedText,
        effectiveItemTypes: deriveRecommendedItemTypesFromClassification({
          ...classification,
          recommendedItemTypes: effectiveItemTypes.length > 0
            ? effectiveItemTypes
            : classification.recommendedItemTypes,
        }, {
          includeProgrammingPrimaryTypes: resolveProgrammingPrimaryTypeCandidates(input.allowedItemTypes).length > 0,
          programmingPrimaryTypeCandidates: resolveProgrammingPrimaryTypeCandidates(input.allowedItemTypes),
        }),
        effectiveLearningDomain: classification.inferredDomain,
        effectiveCognitiveSkill: classification.inferredCognitiveSkill,
        effectiveTechnicalLanguage,
        inferenceConfidence: classification.confidence,
        inferenceReason: `Inferred from uploaded PDF topic '${classification.inferredTopic}'.`,
        drafts: preview.drafts,
        generationWarnings: preview.generationWarnings,
        metadata: preview.metadata,
      });
      logSmartQuizPdfProgress(diagnosticId, "completed", {
        ...diagnosticContext,
        effectiveItemTypes: response.effectiveItemTypes,
      });

      return response;
    } catch (error) {
      logSmartQuizPdfFailure(diagnosticId, diagnosticStage, error, diagnosticContext);
      throw createSmartQuizPdfHttpError(diagnosticId, diagnosticStage, error, diagnosticContext);
    } finally {
      await cleanupUploadedFile(pdfFile);
    }
  }

  async extractPdfText(file: Express.Multer.File | undefined): Promise<PdfExtractionOutput> {
    const pdfFile = requirePdfFile(file);

    try {
      const extractedText = await extractPdfTextWithAgent(
        this.pdfProcessingService,
        this.pdfExtractionRunner,
        await readUploadedFileAsBase64(pdfFile),
      );

      return pdfExtractionOutputSchema.parse({ extractedText });
    } finally {
      await cleanupUploadedFile(pdfFile);
    }
  }

  async generatePreview(input: GenerateSmartQuizItemsPreviewInput): Promise<GenerateSmartQuizItemsPreviewJobOutput> {
    const parsedInput = normalizeGenerationInputOptions(generateSmartQuizItemsPreviewInputSchema.parse(input));
    const requestedCount = resolveRequestedDraftCount(parsedInput);
    const sourceGroundingContext = createSourceGroundingContext(parsedInput.notes);
    const preview = await this.generateRawPreviewDrafts(parsedInput);
    const generationJobSqid = createGenerationJobSqid();
    const initialDrafts = buildInitialGenerationJobDrafts(
      preview.drafts,
      sourceGroundingContext,
      requestedCount,
    );
    const hydrationStatus = initialDrafts.some((draft) => draft.validationStatus === "Pending")
      ? "PreviewReady"
      : resolveHydrationStatus(initialDrafts, requestedCount);
    const warnings = collectGenerationJobWarnings(preview.generationWarnings, initialDrafts, requestedCount);
    const errors = collectGenerationJobErrors(initialDrafts);

    await this.generationJobRepository.create({
      generationJobSqid,
      requestedCount,
      sourceMetadata: buildGenerationSourceMetadata(parsedInput, preview.metadata),
      hydrationStatus,
      draftsJson: initialDrafts,
      warningsJson: warnings,
      errorsJson: errors,
    });

    if (initialDrafts.some((draft) => draft.validationStatus === "Pending")) {
      this.startBackgroundHydration(generationJobSqid);
    }

    return generateSmartQuizItemsPreviewJobOutputSchema.parse({
      generationJobSqid,
      requestedCount,
      drafts: initialDrafts.map(toPreviewDraftResponse),
      hydrationStatus,
      warnings,
      errors,
      metadata: preview.metadata,
    });
  }

  async getGenerationJob(generationJobSqid: string): Promise<SmartQuizGenerationJobOutput> {
    const job = await this.generationJobRepository.findBySqid(generationJobSqid);
    if (!job) {
      throw new NotFoundError("Smart quiz generation job was not found.");
    }

    return mapGenerationJobRowToResponse(job);
  }

  async retryHydration(generationJobSqid: string): Promise<SmartQuizGenerationJobOutput> {
    const job = await this.generationJobRepository.findBySqid(generationJobSqid);
    if (!job) {
      throw new NotFoundError("Smart quiz generation job was not found.");
    }

    const drafts = parseGenerationJobDrafts(job.draftsJson);
    const retryDrafts = drafts.map((draft) => {
      if (
        (draft.validationStatus === "Pending" || draft.validationStatus === "Failed")
        && isHydrationEligibleDraft(draft.previewDraft)
        && !isJavaExecutableDraft(draft.previewDraft)
      ) {
        return {
          ...draft,
          validationStatus: "Pending" as const,
          validationWarnings: [
            ...draft.validationWarnings,
            "Hydration retry queued.",
          ],
          validationErrors: [],
          practiceDraft: undefined,
        };
      }

      return draft;
    });

    const warnings = collectGenerationJobWarnings(parseStringArray(job.warningsJson), retryDrafts, job.requestedCount);
    const errors = collectGenerationJobErrors(retryDrafts);
    const updatedJob = await this.generationJobRepository.updateBySqid(generationJobSqid, {
      hydrationStatus: "Hydrating",
      draftsJson: retryDrafts,
      warningsJson: warnings,
      errorsJson: errors,
    });

    this.startBackgroundHydration(generationJobSqid);

    return mapGenerationJobRowToResponse(updatedJob ?? job);
  }

  private async generatePreviewDrafts(input: GenerateSmartQuizItemsPreviewInput): Promise<NormalizedGenerateSmartQuizItemsPreviewOutput> {
    const parsedInput = normalizeGenerationInputOptions(generateSmartQuizItemsPreviewInputSchema.parse(input));
    const expectedDraftCount = resolveRequestedDraftCount(parsedInput);
    const sourceGroundingContext = createSourceGroundingContext(parsedInput.notes);
    const preview = await this.generateRawPreviewDrafts(parsedInput);

    try {
      const normalizedDrafts = preview.drafts
        .slice(0, expectedDraftCount)
        .map((draft, index) => normalizeDraftForV1Contract(draft, sourceGroundingContext, index));

      return normalizedGenerateSmartQuizItemsPreviewOutputSchema.parse({
        ...preview,
        drafts: normalizedDrafts,
      });
    } catch (error) {
      logSmartQuizGenerationFailure(error, "", preview);
      throw error;
    }
  }

  private async generateRawPreviewDrafts(input: GenerateSmartQuizItemsPreviewInput): Promise<GenerateSmartQuizItemsPreviewOutput> {
    const parsedInput = normalizeGenerationInputOptions(generateSmartQuizItemsPreviewInputSchema.parse(input));
    const expectedDraftCount = resolveRequestedDraftCount(parsedInput);
    const generatedTrace = await this.runSmartQuizItemGeneration(parsedInput);
    let rawDrafts = dedupeDraftsByQuestion(generatedTrace.data.drafts);
    const generationWarnings = [...generatedTrace.data.generationWarnings];

    if (rawDrafts.length < expectedDraftCount) {
      const retryTrace = await this.runSmartQuizItemGeneration(
        buildMissingDraftRetryInput(parsedInput, expectedDraftCount - rawDrafts.length, rawDrafts),
      );
      rawDrafts = dedupeDraftsByQuestion([
        ...rawDrafts,
        ...retryTrace.data.drafts,
      ]);
      generationWarnings.push(...retryTrace.data.generationWarnings);
    }

    try {
      const countWarnings = createDraftCountWarnings(rawDrafts.length, expectedDraftCount);

      return generateSmartQuizItemsPreviewOutputSchema.parse({
        ...generatedTrace.data,
        drafts: rawDrafts.slice(0, expectedDraftCount),
        generationWarnings: [
          ...generationWarnings,
          ...countWarnings,
        ],
      });
    } catch (error) {
      logSmartQuizGenerationFailure(error, generatedTrace.rawResponseText, generatedTrace.normalizedJson);
      throw error;
    }
  }

  private async runSmartQuizItemGeneration(
    input: GenerateSmartQuizItemsPreviewInput,
  ): Promise<{
    data: GenerateSmartQuizItemsPreviewOutput;
    rawResponseText: string;
    normalizedJson: unknown;
  }> {
    const parsedInput = normalizeGenerationInputOptions(generateSmartQuizItemsPreviewInputSchema.parse(input));

    return this.structuredAgentRunnerService.runStructuredPromptWithTrace({
      runner: this.itemGeneratorRunner,
      userId: buildUserId("smart-quiz-generate"),
      message: buildJsonPrompt("Generate previewable smart quiz item drafts.", parsedInput),
      outputKey: "smart_quiz_item_generation_output",
      outputSchema: generateSmartQuizItemsPreviewOutputSchema,
      invalidJsonMessage: "Unable to parse generated smart quiz item drafts.",
      noResponseMessage: "Smart quiz item generator did not return a response.",
    });
  }

  private startBackgroundHydration(generationJobSqid: string): void {
    setTimeout(() => {
      void this.hydrateGenerationJob(generationJobSqid).catch((error) => {
        console.error("[SmartQuizService] Background hydration failed", {
          generationJobSqid,
          error: getErrorMessage(error),
        });
      });
    }, 0);
  }

  private async hydrateGenerationJob(generationJobSqid: string): Promise<void> {
    const job = await this.generationJobRepository.findBySqid(generationJobSqid);
    if (!job) {
      return;
    }

    const sourceMetadata = parseGenerationSourceMetadata(job.sourceMetadata);
    const sourceGroundingContext = createSourceGroundingContext(sourceMetadata.notes);
    const drafts = parseGenerationJobDrafts(job.draftsJson);
    const hydratingDrafts = drafts.map((draft) =>
      draft.validationStatus === "Pending"
        ? {
            ...draft,
            validationErrors: [],
          }
        : draft);

    await this.generationJobRepository.updateBySqid(generationJobSqid, {
      hydrationStatus: "Hydrating",
      draftsJson: hydratingDrafts,
      warningsJson: parseStringArray(job.warningsJson),
      errorsJson: [],
    });

    const hydratedDrafts = hydratingDrafts.map((draft, index) => {
      if (draft.validationStatus !== "Pending") {
        return draft;
      }

      return hydrateGenerationJobDraft(draft, sourceGroundingContext, index);
    });
    const warnings = collectGenerationJobWarnings(parseStringArray(job.warningsJson), hydratedDrafts, job.requestedCount);
    const errors = collectGenerationJobErrors(hydratedDrafts);

    await this.generationJobRepository.updateBySqid(generationJobSqid, {
      hydrationStatus: resolveHydrationStatus(hydratedDrafts, job.requestedCount),
      draftsJson: hydratedDrafts,
      warningsJson: warnings,
      errorsJson: errors,
    });
  }

  async scoreAnswer(input: ScoreSmartQuizAnswerInput): Promise<SmartQuizScoringOutput> {
    const parsedInput = scoreSmartQuizAnswerInputSchema.parse(input);

    return this.structuredAgentRunnerService.runStructuredPrompt({
      runner: this.answerScoringRunner,
      userId: buildUserId("smart-quiz-score"),
      message: buildJsonPrompt("Score this smart quiz answer.", parsedInput),
      outputKey: "smart_quiz_answer_scoring_output",
      outputSchema: smartQuizScoringOutputSchema,
      invalidJsonMessage: "Unable to parse smart quiz scoring result.",
      noResponseMessage: "Smart quiz answer scorer did not return a response.",
    });
  }

  async executeCode(input: ExecuteSmartQuizCodeInput): Promise<CodeFeedbackOutput> {
    const parsedInput = executeSmartQuizCodeInputSchema.parse(input);
    const execution = await this.codeExecutionSupervisor.execute(parsedInput);
    const deterministicFeedback = buildDeterministicCodeFeedback(execution);

    if (execution.executionStatus === "sandboxUnavailable") {
      return deterministicFeedback;
    }

    try {
      const aiFeedback = await this.structuredAgentRunnerService.runStructuredPrompt({
        runner: this.codeFeedbackRunner,
        userId: buildUserId("smart-quiz-code"),
        message: buildJsonPrompt("Review this coding quiz execution result.", {
          input: parsedInput,
          execution,
        }),
        outputKey: "smart_quiz_code_feedback_output",
        outputSchema: codeFeedbackOutputSchema,
        invalidJsonMessage: "Unable to parse smart quiz code feedback.",
        noResponseMessage: "Smart quiz code feedback agent did not return a response.",
      });

      return mergeDeterministicCodeFeedback(deterministicFeedback, aiFeedback);
    } catch {
      return deterministicFeedback;
    }
  }

  async runCode(input: ExecuteSmartQuizCodeInput): Promise<CodeExecutionOutput> {
    const parsedInput = executeSmartQuizCodeInputSchema.parse(input);
    return this.codeExecutionSupervisor.execute(parsedInput);
  }

  async evaluateFlowchart(input: FlowchartEvaluateInput): Promise<FlowchartEvaluationOutput> {
    const parsedInput = flowchartEvaluateInputSchema.parse(input);

    if (!looksLikeMermaidFlowchart(parsedInput.studentAnswer.mermaidText)) {
      return flowchartEvaluationOutputSchema.parse({
        parseStatus: "invalid",
        scorePercent: 0,
        qualityScore: 0,
        correctnessScore: 0,
        completenessScore: 0,
        confidenceScore: 100,
        clarityScore: 0,
        misconceptionScore: 0,
        uncertaintyScore: 0,
        sentimentLabel: "Neutral",
        verdict: "Incorrect",
        scoringSource: "FallbackRules",
        aiConfidence: 100,
        feedbackSummary: "The answer is not valid Mermaid flowchart text. Start with graph or flowchart syntax.",
        semanticRationale: "The submission failed deterministic Mermaid flowchart pre-validation.",
        misconceptions: [],
        rubricBreakdown: {
          parseStatus: "invalid",
        },
        needsStudentConfirmation: false,
        lowConfidenceReason: "",
        missingSteps: [],
        incorrectBranches: [],
      });
    }

    return this.structuredAgentRunnerService.runStructuredPrompt({
      runner: this.flowchartEvaluatorRunner,
      userId: buildUserId("smart-quiz-flowchart"),
      message: buildJsonPrompt("Evaluate this Mermaid flowchart quiz answer.", parsedInput),
      outputKey: "smart_quiz_flowchart_evaluation_output",
      outputSchema: flowchartEvaluationOutputSchema,
      invalidJsonMessage: "Unable to parse smart quiz flowchart evaluation.",
      noResponseMessage: "Smart quiz flowchart evaluator did not return a response.",
    });
  }

  async generateRetryVariant(input: RetryVariantInput): Promise<RetryVariantOutput> {
    const parsedInput = retryVariantInputSchema.parse(input);

    return this.structuredAgentRunnerService.runStructuredPrompt({
      runner: this.retryVariantRunner,
      userId: buildUserId("smart-quiz-retry"),
      message: buildJsonPrompt("Generate a smart quiz retry variant.", parsedInput),
      outputKey: "smart_quiz_retry_variant_output",
      outputSchema: retryVariantOutputSchema,
      invalidJsonMessage: "Unable to parse smart quiz retry variant.",
      noResponseMessage: "Smart quiz retry variant agent did not return a response.",
    });
  }
}

type SmartQuizV1ItemType = SmartQuizSelectItemTypeOutput["recommendedItemTypes"][number];

const PROGRAMMING_PRIMARY_ITEM_TYPES: SmartQuizV1ItemType[] = ["Algorithm", "Debugging"];
const PROGRAMMING_ITEM_TYPE_PRIORITY: SmartQuizV1ItemType[] = [
  "Algorithm",
  "Debugging",
  "OutputPrediction",
  "CodeReading",
  "ShortAnswer",
  "MultipleChoice",
  "Conceptual",
  "Flashcard",
];
const PROGRAMMING_RELATED_ITEM_TYPES = new Set<SmartQuizV1ItemType>([
  "Algorithm",
  "Debugging",
  "OutputPrediction",
  "CodeReading",
]);

async function extractPdfTextWithAgent(
  pdfProcessingService: PdfProcessingService,
  extractionRunner: Runner,
  pdfBase64: string,
): Promise<string> {
  const extraction = await pdfProcessingService.runStructuredPdfAgentFromBase64({
    runner: extractionRunner,
    userId: buildUserId("smart-quiz-pdf-extract"),
    prompt: buildSmartQuizPdfExtractionPrompt(),
    pdfBase64,
    outputKey: "pdf_extraction_output",
    outputSchema: pdfExtractionOutputSchema,
    invalidJsonMessage: "Unable to parse extracted PDF text for smart quiz generation.",
    noResponseMessage: "Smart quiz PDF extraction did not return a final response.",
  });

  return extraction.extractedText;
}

function requirePdfFile(file: Express.Multer.File | undefined): Express.Multer.File {
  if (!file) {
    throw new AppError("PDF file is required.", "VALIDATION_ERROR", 400);
  }

  const normalizedMimeType = file.mimetype.trim().toLowerCase();
  const normalizedFileName = file.originalname.trim().toLowerCase();
  if (normalizedMimeType !== "application/pdf" && !normalizedFileName.endsWith(".pdf")) {
    throw new AppError("Smart quiz upload must be a PDF file.", "VALIDATION_ERROR", 400);
  }

  return file;
}

function buildSmartQuizPdfExtractionPrompt(): string {
  return [
    "Extract faithful text from this PDF for smart quiz generation.",
    'Return only JSON matching this shape: {"extractedText":"..."}.',
    "Do not summarize or explain the content.",
    "Preserve headings, lists, tables, code blocks, formulas, and terminology as clean Markdown where possible.",
    "If a fragment is unreadable, omit that fragment instead of guessing.",
  ].join("\n");
}

function deriveRecommendedItemTypesFromClassification(
  classification: SmartQuizContextClassificationOutput,
  options: {
    includeProgrammingPrimaryTypes?: boolean;
    programmingPrimaryTypeCandidates?: SmartQuizV1ItemType[];
  } = {},
): SmartQuizSelectItemTypeOutput["recommendedItemTypes"] {
  return normalizeRecommendedTypeOrder(classification.recommendedItemTypes, {
    includeProgrammingPrimaryTypes: options.includeProgrammingPrimaryTypes ?? false,
    programmingPrimaryTypeCandidates: options.programmingPrimaryTypeCandidates,
    prioritizeProgrammingTypes: isProgrammingDrivenClassification(classification) && !isJavaDrivenClassification(classification),
  });
}

function normalizeRecommendedTypeOrder(
  recommendedItemTypes: SmartQuizContextClassificationOutput["recommendedItemTypes"],
  options: {
    includeProgrammingPrimaryTypes?: boolean;
    programmingPrimaryTypeCandidates?: SmartQuizV1ItemType[];
    prioritizeProgrammingTypes?: boolean;
  } = {},
): SmartQuizSelectItemTypeOutput["recommendedItemTypes"] {
  const unique = recommendedItemTypes.filter((itemType, index) => recommendedItemTypes.indexOf(itemType) === index);
  if (unique.length === 0) {
    return ["Conceptual"];
  }

  return options.prioritizeProgrammingTypes
    ? prioritizeProgrammingItemTypes(
        unique,
        options.includeProgrammingPrimaryTypes ?? false,
        options.programmingPrimaryTypeCandidates,
      )
    : unique;
}

function prioritizeProgrammingItemTypes(
  itemTypes: SmartQuizV1ItemType[],
  includeProgrammingPrimaryTypes: boolean,
  programmingPrimaryTypeCandidates: SmartQuizV1ItemType[] = PROGRAMMING_PRIMARY_ITEM_TYPES,
): SmartQuizSelectItemTypeOutput["recommendedItemTypes"] {
  const unique = itemTypes.filter((itemType, index) => itemTypes.indexOf(itemType) === index);
  const augmented = includeProgrammingPrimaryTypes
    ? [...programmingPrimaryTypeCandidates, ...unique]
    : unique;
  const available = new Set(augmented);
  const prioritized = PROGRAMMING_ITEM_TYPE_PRIORITY.filter((itemType) => available.has(itemType));

  return prioritized.length > 0 ? prioritized : unique;
}

function resolveProgrammingPrimaryTypeCandidates(
  allowedItemTypes: SmartQuizV1ItemType[] | undefined,
): SmartQuizV1ItemType[] {
  return allowedItemTypes?.length
    ? PROGRAMMING_PRIMARY_ITEM_TYPES.filter((itemType) => allowedItemTypes.includes(itemType))
    : PROGRAMMING_PRIMARY_ITEM_TYPES;
}

function isProgrammingRelatedItemType(itemType: SmartQuizV1ItemType): boolean {
  return PROGRAMMING_RELATED_ITEM_TYPES.has(itemType);
}

function isProgrammingDrivenClassification(classification: SmartQuizContextClassificationOutput): boolean {
  return classification.inferredDomain === "Programming"
    || classification.recommendedItemTypes.some(isProgrammingRelatedItemType)
    || classification.evidence.some((entry) => looksLikeProgrammingDrivenSource(entry.sourceText));
}

function isJavaDrivenClassification(classification: SmartQuizContextClassificationOutput): boolean {
  return isJavaLanguageLabel(classification.inferredTechnicalLanguage)
    || classification.evidence.some((entry) => isJavaLanguageLabel(entry.sourceText) || looksLikeJavaCode(entry.sourceText));
}

function isProgrammingDrivenGenerationInput(input: GenerateSmartQuizItemsPreviewInput): boolean {
  const sourceLooksProgrammingDriven = input.notes.some((note) => looksLikeProgrammingDrivenSource(note.noteContent));
  return input.classification
    ? isProgrammingDrivenClassification(input.classification) || sourceLooksProgrammingDriven
    : sourceLooksProgrammingDriven;
}

function isJavaDrivenGenerationInput(input: GenerateSmartQuizItemsPreviewInput): boolean {
  const sourceLooksJavaDriven = input.notes.some((note) => isJavaLanguageLabel(note.noteContent) || looksLikeJavaCode(note.noteContent));
  return input.classification
    ? isJavaDrivenClassification(input.classification) || sourceLooksJavaDriven
    : sourceLooksJavaDriven;
}

function looksLikeProgrammingDrivenSource(value: unknown): boolean {
  const source = readStringValue(value);
  if (!source) {
    return false;
  }

  const signals = [
    /```(?:[a-z+#]+)?\s*[\s\S]*?\b(?:function|def|class|return|for|while|if|else|public|private|static|console\.log|System\.out\.println)\b/i,
    /\b(?:algorithm|debug|bug|runtime|compile|syntax|function|method|class|object|array|loop|recursion|parameter|variable|return|condition|iteration|output)\b/i,
    /\b(?:def|function|const|let|var|class|interface|return|for|while|if|else|switch|try|catch|public|private|static|void|int|string|bool|boolean)\b/i,
    /[{};]\s*$/m,
    /(?:=>|==|!=|<=|>=|\+\+|--)/,
  ];
  const signalCount = signals.filter((pattern) => pattern.test(source)).length;

  return signalCount >= 2;
}

function buildJsonPrompt(task: string, payload: unknown): Content {
  return {
    role: "user",
    parts: [
      {
        text: `${task}\n\nInput JSON:\n${JSON.stringify(payload, null, 2)}`,
      },
    ],
  };
}

function buildUserId(prefix: string): string {
  return `${prefix}-system`;
}

function looksLikeMermaidFlowchart(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith("flowchart ") || normalized.startsWith("graph ");
}

function buildDeterministicCodeFeedback(execution: CodeExecutionOutput): CodeFeedbackOutput {
  if (execution.executionStatus === "sandboxUnavailable") {
    return codeFeedbackOutputSchema.parse({
      execution,
      scorePercent: 0,
      qualityScore: 0,
      correctnessScore: 0,
      completenessScore: 0,
      confidenceScore: 100,
      clarityScore: 0,
      misconceptionScore: 0,
      uncertaintyScore: 0,
      sentimentLabel: "Neutral",
      verdict: "Incorrect",
      scoringSource: "Compiler",
      aiConfidence: 100,
      feedbackSummary: execution.message,
      semanticRationale: "No compiler or runtime scoring was performed because sandbox execution is disabled.",
      misconceptions: [],
      rubricBreakdown: {
        deterministicValidation: buildDeterministicExecutionSummary(execution),
      },
      needsStudentConfirmation: true,
      lowConfidenceReason: "Code execution sandbox is not configured.",
    });
  }

  const allTestsPassed = didAllRequiredTestsPass(execution);
  const executionFailed = execution.executionStatus !== "completed";

  return codeFeedbackOutputSchema.parse({
    execution,
    scorePercent: allTestsPassed ? 100 : 0,
    qualityScore: allTestsPassed ? 5 : 0,
    correctnessScore: allTestsPassed ? 100 : 0,
    completenessScore: allTestsPassed ? 100 : 0,
    confidenceScore: 100,
    clarityScore: allTestsPassed ? 100 : 0,
    misconceptionScore: allTestsPassed ? 0 : 100,
    uncertaintyScore: 0,
    sentimentLabel: allTestsPassed ? "Positive" : "Neutral",
    verdict: allTestsPassed ? "ExactCorrect" : "Incorrect",
    scoringSource: "Compiler",
    aiConfidence: 100,
    feedbackSummary: buildDeterministicExecutionFeedback(execution, allTestsPassed),
    semanticRationale: executionFailed
      ? "Judge0 reported an execution error before deterministic output comparison could complete."
      : allTestsPassed
        ? "Judge0 output matched the expected output for every required test case."
        : "Judge0 completed execution, but one or more required test cases did not match the expected output.",
    misconceptions: [],
    rubricBreakdown: {
      deterministicValidation: buildDeterministicExecutionSummary(execution),
    },
    needsStudentConfirmation: false,
    lowConfidenceReason: "",
  });
}

function mergeDeterministicCodeFeedback(
  deterministicFeedback: CodeFeedbackOutput,
  aiFeedback: CodeFeedbackOutput,
): CodeFeedbackOutput {
  const allTestsPassed = didAllRequiredTestsPass(deterministicFeedback.execution);
  const executionFailed = deterministicFeedback.execution.executionStatus !== "completed";

  return codeFeedbackOutputSchema.parse({
    ...deterministicFeedback,
    qualityScore: allTestsPassed ? aiFeedback.qualityScore : deterministicFeedback.qualityScore,
    completenessScore: allTestsPassed ? aiFeedback.completenessScore : deterministicFeedback.completenessScore,
    clarityScore: allTestsPassed ? aiFeedback.clarityScore : deterministicFeedback.clarityScore,
    misconceptionScore: allTestsPassed ? aiFeedback.misconceptionScore : deterministicFeedback.misconceptionScore,
    sentimentLabel: aiFeedback.sentimentLabel || deterministicFeedback.sentimentLabel,
    scoringSource: "Hybrid",
    aiConfidence: aiFeedback.aiConfidence,
    feedbackSummary: aiFeedback.feedbackSummary || deterministicFeedback.feedbackSummary,
    semanticRationale: aiFeedback.semanticRationale || deterministicFeedback.semanticRationale,
    misconceptions: aiFeedback.misconceptions,
    rubricBreakdown: {
      ...aiFeedback.rubricBreakdown,
      deterministicValidation: buildDeterministicExecutionSummary(deterministicFeedback.execution),
      validationOutcome: executionFailed
        ? "execution-error"
        : allTestsPassed
          ? "passed"
          : "failed",
    },
    needsStudentConfirmation: deterministicFeedback.needsStudentConfirmation,
    lowConfidenceReason: deterministicFeedback.lowConfidenceReason,
  });
}

function didAllRequiredTestsPass(execution: CodeExecutionOutput): boolean {
  return execution.executionStatus === "completed"
    && execution.visibleTestsPassed === execution.visibleTestsTotal
    && execution.hiddenTestsPassed === execution.hiddenTestsTotal;
}

function buildDeterministicExecutionFeedback(execution: CodeExecutionOutput, allTestsPassed: boolean): string {
  if (execution.executionStatus !== "completed") {
    return execution.message;
  }

  if (allTestsPassed) {
    return "All required Judge0 test cases passed.";
  }

  const failedVisibleTests = execution.results.filter((result) => !result.passed);
  if (failedVisibleTests.length === 0) {
    if (execution.hiddenSummary.failed > 0) {
      return `Visible tests passed, but ${execution.hiddenSummary.failed} hidden test case${execution.hiddenSummary.failed === 1 ? "" : "s"} failed.`;
    }

    return execution.message;
  }

  const failedNames = failedVisibleTests
    .slice(0, 3)
    .map((result) => result.name)
    .join(", ");
  return `Judge0 found failing test cases: ${failedNames}.`;
}

function buildDeterministicExecutionSummary(execution: CodeExecutionOutput): Record<string, unknown> {
  return {
    executionStatus: execution.executionStatus,
    compileStatus: execution.compileStatus,
    runtimeStatus: execution.runtimeStatus,
    allRequiredTestsPassed: didAllRequiredTestsPass(execution),
    visibleTestsPassed: execution.visibleTestsPassed,
    visibleTestsTotal: execution.visibleTestsTotal,
    hiddenTestsPassed: execution.hiddenTestsPassed,
    hiddenTestsTotal: execution.hiddenTestsTotal,
    failedVisibleTests: execution.results
      .filter((result) => !result.passed)
      .map((result) => ({
        name: result.name,
        status: result.status,
        expectedOutput: result.expectedOutput,
        actualOutput: result.actualOutput,
        stderr: result.stderr,
      })),
    hiddenSummary: execution.hiddenSummary,
  };
}

type GeneratedSmartQuizDraft = GenerateSmartQuizItemsPreviewOutput["drafts"][number];
type NormalizedSmartQuizDraft = NormalizedGenerateSmartQuizItemsPreviewOutput["drafts"][number];

interface SmartQuizGenerationJobDraft {
  draftId: string;
  previewDraft: GeneratedSmartQuizDraft;
  practiceDraft?: NormalizedSmartQuizDraft;
  validationStatus: SmartQuizValidationStatus;
  validationWarnings: string[];
  validationErrors: string[];
}

interface SmartQuizGenerationSourceMetadata {
  deckSqid?: string;
  course?: GenerateSmartQuizItemsPreviewInput["course"];
  notes: GenerateSmartQuizItemsPreviewInput["notes"];
  classification?: GenerateSmartQuizItemsPreviewInput["classification"];
  generationOptions?: GenerateSmartQuizItemsPreviewInput["generationOptions"];
  generationMetadata: GenerateSmartQuizItemsPreviewOutput["metadata"];
}

function createGenerationJobSqid(): string {
  return `sqjg_${randomUUID().replace(/-/g, "")}`;
}

function resolveRequestedDraftCount(input: GenerateSmartQuizItemsPreviewInput): number {
  return input.generationOptions?.count ?? input.count ?? 10;
}

function normalizeGenerationInputOptions(input: GenerateSmartQuizItemsPreviewInput): GenerateSmartQuizItemsPreviewInput {
  const count = resolveRequestedDraftCount(input);
  const prioritizeProgrammingTypes = isProgrammingDrivenGenerationInput(input) && !isJavaDrivenGenerationInput(input);
  const programmingPrimaryTypeCandidates = resolveProgrammingPrimaryTypeCandidates(input.generationOptions?.allowedItemTypes);
  const classification = input.classification && prioritizeProgrammingTypes
    ? {
        ...input.classification,
        recommendedItemTypes: normalizeRecommendedTypeOrder(input.classification.recommendedItemTypes, {
          includeProgrammingPrimaryTypes: programmingPrimaryTypeCandidates.length > 0,
          programmingPrimaryTypeCandidates,
          prioritizeProgrammingTypes: true,
        }),
      }
    : input.classification;
  const allowedItemTypes = input.generationOptions?.allowedItemTypes && prioritizeProgrammingTypes
    ? prioritizeProgrammingItemTypes(input.generationOptions.allowedItemTypes, false)
    : input.generationOptions?.allowedItemTypes;

  return {
    ...input,
    classification,
    generationOptions: {
      count,
      allowedItemTypes,
      includeRubrics: input.generationOptions?.includeRubrics ?? true,
      excludeQuestions: input.generationOptions?.excludeQuestions ?? [],
    },
  };
}

function buildMissingDraftRetryInput(
  input: GenerateSmartQuizItemsPreviewInput,
  missingCount: number,
  existingDrafts: GeneratedSmartQuizDraft[],
): GenerateSmartQuizItemsPreviewInput {
  const retryCount = Math.max(3, Math.min(10, missingCount));
  return {
    ...input,
    count: retryCount,
    generationOptions: {
      ...input.generationOptions,
      count: retryCount,
      includeRubrics: input.generationOptions?.includeRubrics ?? true,
      excludeQuestions: [
        ...(input.generationOptions?.excludeQuestions ?? []),
        ...existingDrafts.map((draft) => draft.question.trim()).filter(Boolean),
      ],
    },
  };
}

function dedupeDraftsByQuestion(drafts: GeneratedSmartQuizDraft[]): GeneratedSmartQuizDraft[] {
  const seenQuestions = new Set<string>();
  return drafts.filter((draft) => {
    const normalizedQuestion = draft.question.trim().toLowerCase().replace(/\s+/g, " ");
    if (!normalizedQuestion || seenQuestions.has(normalizedQuestion)) {
      return false;
    }

    seenQuestions.add(normalizedQuestion);
    return true;
  });
}

function buildGenerationSourceMetadata(
  input: GenerateSmartQuizItemsPreviewInput,
  generationMetadata: GenerateSmartQuizItemsPreviewOutput["metadata"],
): SmartQuizGenerationSourceMetadata {
  return {
    deckSqid: input.deckSqid,
    course: input.course,
    notes: input.notes,
    classification: input.classification,
    generationOptions: input.generationOptions,
    generationMetadata,
  };
}

function buildInitialGenerationJobDrafts(
  drafts: GeneratedSmartQuizDraft[],
  sourceGroundingContext: SourceGroundingContext,
  requestedCount: number,
): SmartQuizGenerationJobDraft[] {
  return drafts.slice(0, requestedCount).map((draft, index) => {
    if (isJavaExecutableDraft(draft)) {
      return buildDowngradedGenerationJobDraft(
        draft,
        index,
        "Java executable quiz generation is not supported; this draft was converted to a non-executable study item.",
      );
    }

    if (isHydrationEligibleDraft(draft)) {
      return {
        draftId: createDraftId(index),
        previewDraft: draft,
        validationStatus: "Pending",
        validationWarnings: ["Executable validation is hydrating in the background."],
        validationErrors: [],
      };
    }

    return hydrateGenerationJobDraft({
      draftId: createDraftId(index),
      previewDraft: draft,
      validationStatus: "Pending",
      validationWarnings: [],
      validationErrors: [],
    }, sourceGroundingContext, index);
  });
}

function hydrateGenerationJobDraft(
  draft: SmartQuizGenerationJobDraft,
  sourceGroundingContext: SourceGroundingContext,
  index: number,
): SmartQuizGenerationJobDraft {
  if (isJavaExecutableDraft(draft.previewDraft)) {
    return buildDowngradedGenerationJobDraft(
      draft.previewDraft,
      index,
      "Java executable quiz generation is not supported; this draft was converted to a non-executable study item.",
      draft.validationWarnings,
    );
  }

  try {
    const practiceDraft = normalizedGenerateSmartQuizItemsPreviewOutputSchema.shape.drafts.element.parse(
      normalizeDraftForV1Contract(draft.previewDraft, sourceGroundingContext, index),
    );
    const wasDowngraded = practiceDraft.itemType !== draft.previewDraft.itemType;
    return {
      ...draft,
      practiceDraft,
      validationStatus: wasDowngraded ? "Downgraded" : "Ready",
      validationWarnings: wasDowngraded
        ? [
            ...draft.validationWarnings,
            "Draft was converted to a non-executable study item because executable validation fields were not safely grounded.",
          ]
        : draft.validationWarnings,
      validationErrors: [],
    };
  } catch (error) {
    return {
      ...draft,
      practiceDraft: undefined,
      validationStatus: "Failed",
      validationErrors: [getErrorMessage(error)],
    };
  }
}

function buildDowngradedGenerationJobDraft(
  draft: GeneratedSmartQuizDraft,
  index: number,
  warning: string,
  existingWarnings: string[] = [],
): SmartQuizGenerationJobDraft {
  const expectedAnswer = normalizeExpectedAnswer(draft);
  const normalizedRubric = normalizeRubricForItemType(draft.itemType, draft.rubric, expectedAnswer);
  const common = {
    itemType: draft.itemType,
    question: draft.question.trim(),
    explanation: draft.explanation.trim() || warning,
    answeringGuidance: draft.answeringGuidance.trim() || "Answer as a study question without writing or running Java code.",
    difficulty: draft.difficulty,
    cognitiveSkill: draft.cognitiveSkill,
    learningDomain: draft.learningDomain,
    technicalLanguage: draft.technicalLanguage.trim(),
    tags: draft.tags,
    sourceNoteSqids: draft.sourceNoteSqids,
  };

  return {
    draftId: createDraftId(index),
    previewDraft: draft,
    practiceDraft: createConceptualFallbackDraft(common, expectedAnswer, normalizedRubric, draft),
    validationStatus: "Downgraded",
    validationWarnings: [...existingWarnings, warning],
    validationErrors: [],
  };
}

function createDraftId(index: number): string {
  return `draft_${index + 1}`;
}

function toPreviewDraftResponse(draft: SmartQuizGenerationJobDraft): unknown {
  const responseDraft = draft.validationStatus === "Downgraded" && draft.practiceDraft
    ? draft.practiceDraft
    : draft.previewDraft;

  return {
    ...responseDraft,
    draftId: draft.draftId,
    validationStatus: draft.validationStatus,
    validationWarnings: draft.validationWarnings,
    validationErrors: draft.validationErrors,
  };
}

function toSafePracticeDraftResponse(draft: SmartQuizGenerationJobDraft): unknown | null {
  if (!draft.practiceDraft || (draft.validationStatus !== "Ready" && draft.validationStatus !== "Downgraded")) {
    return null;
  }

  return {
    ...draft.practiceDraft,
    draftId: draft.draftId,
    validationStatus: draft.validationStatus,
    validationWarnings: draft.validationWarnings,
    validationErrors: draft.validationErrors,
  };
}

function collectGenerationJobWarnings(
  baseWarnings: string[],
  drafts: SmartQuizGenerationJobDraft[],
  requestedCount: number,
): string[] {
  return [
    ...baseWarnings,
    ...drafts.flatMap((draft) => draft.validationWarnings),
    ...createDraftCountWarnings(drafts.length, requestedCount),
  ].filter((warning, index, warnings) => warnings.indexOf(warning) === index);
}

function collectGenerationJobErrors(drafts: SmartQuizGenerationJobDraft[]): string[] {
  return drafts
    .flatMap((draft) => draft.validationErrors.map((error) => `${draft.draftId}: ${error}`))
    .filter((error, index, errors) => errors.indexOf(error) === index);
}

function resolveHydrationStatus(
  drafts: SmartQuizGenerationJobDraft[],
  requestedCount: number,
): SmartQuizHydrationStatus {
  if (drafts.some((draft) => draft.validationStatus === "Pending")) {
    return "Hydrating";
  }

  const safeDraftCount = drafts.filter((draft) =>
    draft.practiceDraft && (draft.validationStatus === "Ready" || draft.validationStatus === "Downgraded")).length;
  if (safeDraftCount === 0) {
    return "Failed";
  }

  return safeDraftCount >= requestedCount ? "Ready" : "PartiallyReady";
}

function mapGenerationJobRowToResponse(job: {
  generationJobSqid: string;
  requestedCount: number;
  sourceMetadata: unknown;
  hydrationStatus: string;
  draftsJson: unknown;
  warningsJson: unknown;
  errorsJson: unknown;
  createdAt: Date;
  updatedAt: Date;
}): SmartQuizGenerationJobOutput {
  const sourceMetadata = parseGenerationSourceMetadata(job.sourceMetadata);
  const drafts = parseGenerationJobDrafts(job.draftsJson);
  const safeToPracticeDrafts = drafts
    .map(toSafePracticeDraftResponse)
    .filter((draft): draft is NonNullable<typeof draft> => draft !== null);
  const hydrationStatus = parseHydrationStatus(job.hydrationStatus);

  return smartQuizGenerationJobOutputSchema.parse({
    generationJobSqid: job.generationJobSqid,
    requestedCount: job.requestedCount,
    drafts: drafts.map(toPreviewDraftResponse),
    hydrationStatus,
    jobStatus: hydrationStatus,
    safeToPracticeDrafts,
    warnings: parseStringArray(job.warningsJson),
    errors: parseStringArray(job.errorsJson),
    metadata: sourceMetadata.generationMetadata,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  });
}

function parseGenerationJobDrafts(value: unknown): SmartQuizGenerationJobDraft[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry): SmartQuizGenerationJobDraft | null => {
      if (!isRecord(entry)) {
        return null;
      }

      const previewDraftResult = generateSmartQuizItemsPreviewOutputSchema.shape.drafts.element.safeParse(entry.previewDraft);
      if (!previewDraftResult.success) {
        return null;
      }

      const practiceDraftResult = entry.practiceDraft === undefined
        ? undefined
        : normalizedGenerateSmartQuizItemsPreviewOutputSchema.shape.drafts.element.safeParse(entry.practiceDraft);
      if (practiceDraftResult && !practiceDraftResult.success) {
        return null;
      }

      const parsedDraft: SmartQuizGenerationJobDraft = {
        draftId: readStringValue(entry.draftId) ?? createDraftId(0),
        previewDraft: previewDraftResult.data,
        validationStatus: parseValidationStatus(entry.validationStatus),
        validationWarnings: parseStringArray(entry.validationWarnings),
        validationErrors: parseStringArray(entry.validationErrors),
      };

      if (practiceDraftResult?.data) {
        parsedDraft.practiceDraft = practiceDraftResult.data;
      }

      return parsedDraft;
    })
    .filter((entry): entry is SmartQuizGenerationJobDraft => entry !== null);
}

function parseGenerationSourceMetadata(value: unknown): SmartQuizGenerationSourceMetadata {
  if (!isRecord(value) || !Array.isArray(value.notes)) {
    return {
      notes: [],
      generationMetadata: {
        promptVersion: "unknown",
        model: "unknown",
        generatedAt: new Date().toISOString(),
      },
    };
  }

  return {
    deckSqid: readStringValue(value.deckSqid),
    course: isRecord(value.course) ? value.course as GenerateSmartQuizItemsPreviewInput["course"] : undefined,
    notes: value.notes as GenerateSmartQuizItemsPreviewInput["notes"],
    classification: isRecord(value.classification)
      ? value.classification as GenerateSmartQuizItemsPreviewInput["classification"]
      : undefined,
    generationOptions: isRecord(value.generationOptions)
      ? value.generationOptions as GenerateSmartQuizItemsPreviewInput["generationOptions"]
      : undefined,
    generationMetadata: isRecord(value.generationMetadata)
      ? value.generationMetadata as GenerateSmartQuizItemsPreviewOutput["metadata"]
      : {
          promptVersion: "unknown",
          model: "unknown",
          generatedAt: new Date().toISOString(),
        },
  };
}

function parseHydrationStatus(value: unknown): SmartQuizHydrationStatus {
  return value === "PreviewReady"
    || value === "Hydrating"
    || value === "Ready"
    || value === "PartiallyReady"
    || value === "Failed"
    ? value
    : "Failed";
}

function parseValidationStatus(value: unknown): SmartQuizValidationStatus {
  return value === "Ready"
    || value === "Pending"
    || value === "Downgraded"
    || value === "Failed"
    ? value
    : "Failed";
}

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => readStringValue(entry)).filter((entry): entry is string => !!entry)
    : [];
}

function isHydrationEligibleDraft(draft: GeneratedSmartQuizDraft): boolean {
  return draft.itemType === "Algorithm"
    || draft.itemType === "Debugging"
    || draft.itemType === "OutputPrediction";
}

function isJavaExecutableDraft(draft: GeneratedSmartQuizDraft): boolean {
  if (!isHydrationEligibleDraft(draft)) {
    return false;
  }

  const starterCodeValues = "starterCodeByLanguage" in draft
    ? Object.values(draft.starterCodeByLanguage).join("\n")
    : undefined;
  const languageHints = [
    draft.technicalLanguage,
    "language" in draft ? draft.language : undefined,
    "supportedLanguages" in draft ? draft.supportedLanguages.join(" ") : undefined,
    "starterCodeByLanguage" in draft ? Object.keys(draft.starterCodeByLanguage).join(" ") : undefined,
    starterCodeValues,
    "codeSnippet" in draft ? draft.codeSnippet : undefined,
    "buggyCode" in draft ? draft.buggyCode : undefined,
    "functionSignature" in draft ? draft.functionSignature : undefined,
  ];

  return languageHints.some((hint) => isJavaLanguageLabel(hint) || looksLikeJavaCode(hint));
}

function isJavaLanguageLabel(value: unknown): boolean {
  const label = readStringValue(value);
  if (!label) {
    return false;
  }

  const normalized = label.toLowerCase();
  return /\bjava\b/.test(normalized) && !/\bjavascript\b/.test(normalized);
}

function looksLikeJavaCode(value: unknown): boolean {
  const source = readStringValue(value);
  if (!source) {
    return false;
  }

  const javaSignals = [
    /\bimport\s+java\./i,
    /\bSystem\.out\.(?:print|println|printf)\b/i,
    /\bpublic\s+static\s+void\s+main\s*\(\s*String\s*\[\]\s+\w+\s*\)/i,
    /\b(?:extends|implements)\s+[A-Z]\w*/i,
    /\bthrows\s+[A-Z]\w*/i,
  ];

  return javaSignals.some((pattern) => pattern.test(source));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown smart quiz hydration error.";
}

function isCodeBasedItemType(
  itemType: GenerateSmartQuizItemsPreviewOutput["drafts"][number]["itemType"],
): boolean {
  return itemType === "CodeReading"
    || itemType === "OutputPrediction"
    || itemType === "Debugging"
    || itemType === "Algorithm";
}

function isUngroundedCodeSnippetError(error: unknown): boolean {
  return error instanceof AppError && error.code === "SMART_QUIZ_UNGROUNDED_CODE_SNIPPET";
}

function normalizeDraftForV1Contract(
  draft: GenerateSmartQuizItemsPreviewOutput["drafts"][number],
  sourceGroundingContext: SourceGroundingContext,
  draftIndex: number,
): NormalizedGenerateSmartQuizItemsPreviewOutput["drafts"][number] {
  const normalizedExpectedAnswer = normalizeExpectedAnswer(draft);
  const normalizedRubric = normalizeRubricForItemType(draft.itemType, draft.rubric, normalizedExpectedAnswer);
  const common = {
    itemType: draft.itemType,
    question: draft.question.trim(),
    explanation: draft.explanation.trim(),
    answeringGuidance: draft.answeringGuidance.trim(),
    difficulty: draft.difficulty,
    cognitiveSkill: draft.cognitiveSkill,
    learningDomain: draft.learningDomain,
    technicalLanguage: draft.technicalLanguage.trim(),
    tags: draft.tags,
    sourceNoteSqids: draft.sourceNoteSqids,
  };

  try {
    const normalizedValidationConfig = normalizeValidationConfigForItemType(
      draft.itemType,
      draft.validationConfig,
      draft,
      sourceGroundingContext,
      draftIndex,
    );

    switch (draft.itemType) {
      case "Flashcard":
        return {
          ...common,
          itemType: "Flashcard",
          expectedAnswer: normalizedExpectedAnswer,
          answer: readStringValue(draft.answer) ?? normalizedExpectedAnswer,
          acceptedAnswerAliases: normalizeStringArray(draft.acceptedAnswerAliases),
        };
      case "Conceptual":
        return {
          ...common,
          itemType: "Conceptual",
          expectedAnswer: normalizedExpectedAnswer,
          rubricCriteria: normalizeRubricCriteria(normalizedRubric),
        };
      case "ShortAnswer":
        return {
          ...common,
          itemType: "ShortAnswer",
          expectedAnswer: normalizedExpectedAnswer,
          rubricCriteria: normalizeRubricCriteria(normalizedRubric),
        };
      case "MultipleChoice":
        return {
          ...common,
          itemType: "MultipleChoice",
          expectedAnswer: normalizedExpectedAnswer,
          options: normalizeOptions(draft.options ?? normalizedValidationConfig.options, normalizedExpectedAnswer) ?? createFallbackOptions(normalizedExpectedAnswer),
          correctOptionIds: normalizeCorrectOptionIds(
            draft.correctOptionIds ?? normalizedValidationConfig.correctOptionIds,
            normalizeOptions(draft.options ?? normalizedValidationConfig.options, normalizedExpectedAnswer) ?? createFallbackOptions(normalizedExpectedAnswer),
            normalizedExpectedAnswer,
          ) ?? ["A"],
          singleSelect: typeof draft.singleSelect === "boolean"
            ? draft.singleSelect
            : readBooleanValue(normalizedValidationConfig.singleSelect) ?? true,
        };
      case "CodeReading":
        return {
          ...common,
          itemType: "CodeReading",
          expectedAnswer: normalizedExpectedAnswer,
          codeSnippet: resolveGroundedCodeFieldValue(
            "codeSnippet",
            readStringValue(draft.codeSnippet) ?? readStringValue(normalizedValidationConfig.codeSnippet),
            draft,
            sourceGroundingContext,
            draftIndex,
          ),
          language: readStringValue(draft.language)
            ?? readStringValue(normalizedValidationConfig.language)
            ?? draft.technicalLanguage
            ?? "Generic",
        };
      case "OutputPrediction":
        return {
          ...common,
          itemType: "OutputPrediction",
          expectedAnswer: normalizedExpectedAnswer,
          codeSnippet: resolveGroundedCodeFieldValue(
            "codeSnippet",
            readStringValue(draft.codeSnippet) ?? readStringValue(normalizedValidationConfig.codeSnippet),
            draft,
            sourceGroundingContext,
            draftIndex,
          ),
          expectedOutput: readStringValue(draft.expectedOutput)
            ?? readStringValue(normalizedValidationConfig.expectedOutput)
            ?? normalizedExpectedAnswer,
          language: readStringValue(draft.language)
            ?? readStringValue(normalizedValidationConfig.language)
            ?? draft.technicalLanguage
            ?? "Generic",
        };
      case "Debugging": {
        const visibleTestCases = normalizeFirstVisibleTestCases(
          draft.visibleTestCases,
          normalizedValidationConfig.visibleTestCases,
        );
        if (!visibleTestCases) {
          return createConceptualFallbackDraft(common, normalizedExpectedAnswer, normalizedRubric, draft);
        }

        return {
          ...common,
          itemType: "Debugging",
          expectedAnswer: normalizedExpectedAnswer,
          buggyCode: resolveGroundedCodeFieldValue(
            "buggyCode",
            readStringValue(draft.buggyCode) ?? readStringValue(normalizedValidationConfig.buggyCode),
            draft,
            sourceGroundingContext,
            draftIndex,
          ),
          language: readStringValue(draft.language)
            ?? readStringValue(normalizedValidationConfig.language)
            ?? draft.technicalLanguage
            ?? "Generic",
          visibleTestCases,
          hiddenTestCases: normalizeVisibleTestCases(
            draft.hiddenTestCases
            ?? (isRecord(normalizedValidationConfig.private) ? normalizedValidationConfig.private.hiddenTestCases : undefined)
            ?? normalizedValidationConfig.hiddenTestCases,
          ) ?? [],
          expectedFixSummary: readStringValue(draft.expectedFixSummary)
            ?? readStringValue(normalizedValidationConfig.expectedFix)
            ?? readStringValue((isRecord(normalizedValidationConfig.private) ? normalizedValidationConfig.private.expectedFix : undefined)),
        };
      }
      case "Algorithm": {
        const visibleTestCases = normalizeFirstVisibleTestCases(
          draft.visibleTestCases,
          normalizedValidationConfig.visibleTestCases,
        );
        const functionSignature = readStringValue(draft.functionSignature)
          ?? readStringValue(normalizedValidationConfig.functionSignature);
        const supportedLanguages = normalizeSupportedLanguages(
          draft.supportedLanguages.length > 0 ? draft.supportedLanguages : normalizedValidationConfig.supportedLanguages,
          draft.technicalLanguage,
        );
        const starterCodeByLanguage = normalizeStarterCodeByLanguage(
          Object.keys(draft.starterCodeByLanguage).length > 0 ? draft.starterCodeByLanguage : normalizedValidationConfig.starterCodeByLanguage,
          draft.technicalLanguage,
        );
        if (
          !visibleTestCases
          || !functionSignature
          || supportedLanguages.length === 0
          || !starterCodeByLanguage
          || Object.keys(starterCodeByLanguage).length === 0
        ) {
          return createConceptualFallbackDraft(common, normalizedExpectedAnswer, normalizedRubric, draft);
        }

        return {
          ...common,
          itemType: "Algorithm",
          expectedAnswer: normalizedExpectedAnswer,
          functionSignature,
          supportedLanguages,
          starterCodeByLanguage,
          visibleTestCases,
          hiddenTestCases: normalizeVisibleTestCases(
            draft.hiddenTestCases
            ?? (isRecord(normalizedValidationConfig.private) ? normalizedValidationConfig.private.hiddenTestCases : undefined)
            ?? normalizedValidationConfig.hiddenTestCases,
          ) ?? [],
          languagePolicy: readStringValue(draft.languagePolicy)
            ?? readStringValue(normalizedValidationConfig.languagePolicy),
        };
      }
    }
  } catch (error) {
    if (isUngroundedCodeSnippetError(error) && isCodeBasedItemType(draft.itemType)) {
      return createConceptualFallbackDraft(common, normalizedExpectedAnswer, normalizedRubric, draft);
    }

    throw error;
  }
}

function normalizeFirstVisibleTestCases(
  ...values: unknown[]
): Array<{ name: string; input: string; expectedOutput: string }> | undefined {
  for (const value of values) {
    const normalized = normalizeVisibleTestCases(value);
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

function createConceptualFallbackDraft(
  common: {
    itemType: GenerateSmartQuizItemsPreviewOutput["drafts"][number]["itemType"];
    question: string;
    explanation: string;
    answeringGuidance: string;
    difficulty: number;
    cognitiveSkill: GenerateSmartQuizItemsPreviewOutput["drafts"][number]["cognitiveSkill"];
    learningDomain: GenerateSmartQuizItemsPreviewOutput["drafts"][number]["learningDomain"];
    technicalLanguage: string;
    tags: string[];
    sourceNoteSqids: string[];
  },
  expectedAnswer: string,
  normalizedRubric: { criteria: Array<{ name: string; weight: number; description?: string }> },
  draft: GenerateSmartQuizItemsPreviewOutput["drafts"][number],
): NormalizedGenerateSmartQuizItemsPreviewOutput["drafts"][number] {
  return {
    ...common,
    itemType: "Conceptual",
    explanation: common.explanation
      || "This item was converted to a conceptual question because no grounded code snippet could be verified from the source material.",
    answeringGuidance: common.answeringGuidance || "Answer using only the explanation supported by the source material.",
    expectedAnswer: expectedAnswer.trim() || `Explain the concept behind: ${draft.question.trim() || "the source material"}`,
    rubricCriteria: normalizeRubricCriteria(normalizedRubric),
  };
}


function normalizeRubricCriteria(
  rubric: { criteria: Array<{ name: string; weight: number; description?: string }> },
): Array<{ name: string; weight: number; description: string }> {
  return rubric.criteria.map((criterion) => ({
    name: criterion.name,
    weight: criterion.weight,
    description: criterion.description ?? "",
  }));
}

function normalizeExpectedAnswer(
  draft: GenerateSmartQuizItemsPreviewOutput["drafts"][number],
): string {
  const directExpectedAnswer = draft.expectedAnswer.trim();
  if (directExpectedAnswer) {
    return directExpectedAnswer;
  }

  const explanation = draft.explanation.trim();
  if (explanation) {
    return explanation;
  }

  const guidance = draft.answeringGuidance.trim();
  if (guidance) {
    return guidance;
  }

  return `Answer should match the source material for: ${draft.question.trim() || "the question"}`;
}

function normalizeRubricForItemType(
  itemType: GenerateSmartQuizItemsPreviewOutput["drafts"][number]["itemType"],
  rubric: GenerateSmartQuizItemsPreviewOutput["drafts"][number]["rubric"],
  expectedAnswer: string,
): { criteria: Array<{ name: string; weight: number; description?: string }> } {
  const criteria = Array.isArray(rubric.criteria)
    ? rubric.criteria
        .map((criterion) => {
          if (typeof criterion === "string") {
            return normalizeCriterion({ name: criterion, weight: 100, description: criterion });
          }

          return normalizeCriterion(criterion);
        })
        .filter((criterion): criterion is NonNullable<typeof criterion> => criterion !== null)
    : [];

  if (criteria.length > 0) {
    return { criteria };
  }

  if (itemType === "Conceptual" || itemType === "ShortAnswer") {
    return {
      criteria: [
        {
          name: "correctness",
          weight: 100,
          description: expectedAnswer.trim() || "Answer should match the source material.",
        },
      ],
    };
  }

  return {
    criteria: [
      {
        name: "correctness",
        weight: 100,
        description: expectedAnswer.trim() || "Answer should match the source material.",
      },
    ],
  };
}

function normalizeCriterion(value: unknown): { name: string; weight: number; description?: string } | null {
  if (!isRecord(value)) {
    return null;
  }

  const name = typeof value.name === "string" && value.name.trim()
    ? value.name.trim()
    : typeof value.description === "string" && value.description.trim()
      ? value.description.trim()
      : null;

  if (!name) {
    return null;
  }

  const weight = typeof value.weight === "number" && Number.isFinite(value.weight)
    ? Math.max(1, Math.min(100, Math.round(value.weight)))
    : 100;

  const description = typeof value.description === "string" && value.description.trim()
    ? value.description.trim()
    : undefined;

  return {
    name,
    weight,
    description,
  };
}

function normalizeValidationConfigForItemType(
  itemType: GenerateSmartQuizItemsPreviewOutput["drafts"][number]["itemType"],
  validationConfig: GenerateSmartQuizItemsPreviewOutput["drafts"][number]["validationConfig"],
  draft: GenerateSmartQuizItemsPreviewOutput["drafts"][number],
  sourceGroundingContext: SourceGroundingContext,
  draftIndex: number,
): Record<string, unknown> {
  const normalized = isRecord(validationConfig) ? { ...validationConfig } : {};

  switch (itemType) {
    case "MultipleChoice": {
      normalized.options = normalizeOptions(
        normalized.options
          ?? normalized.choices
          ?? normalized.answerOptions
          ?? normalized.answers,
        draft.expectedAnswer,
      );
      normalized.correctOptionIds = normalizeCorrectOptionIds(
        normalized.correctOptionIds
          ?? normalized.correctOptions
          ?? normalized.correctAnswers
          ?? normalized.answerKey,
        normalized.options,
        draft.expectedAnswer,
      );
      break;
    }
    case "OutputPrediction": {
      normalized.codeSnippet = resolveGroundedCodeFieldValue(
        "codeSnippet",
        readStringValue(
        normalized.codeSnippet
          ?? normalized.code
          ?? normalized.codeBlock
          ?? normalized.snippet,
        ),
        draft,
        sourceGroundingContext,
        draftIndex,
      );
      normalized.expectedOutput = readStringValue(
        normalized.expectedOutput
          ?? normalized.output
          ?? normalized.answer
          ?? draft.expectedAnswer,
      );
      normalized.language = readStringValue(
        normalized.language
          ?? draft.technicalLanguage,
      ) ?? "Java";
      break;
    }
    case "CodeReading": {
      normalized.codeSnippet = resolveGroundedCodeFieldValue(
        "codeSnippet",
        readStringValue(
        normalized.codeSnippet
          ?? normalized.code
          ?? normalized.codeBlock
          ?? normalized.snippet,
        ),
        draft,
        sourceGroundingContext,
        draftIndex,
      );
      normalized.language = readStringValue(
        normalized.language
          ?? draft.technicalLanguage,
      ) ?? "Java";
      break;
    }
    case "Algorithm": {
      normalized.functionSignature = readStringValue(
        normalized.functionSignature
          ?? normalized.signature,
      );
      normalized.starterCodeByLanguage = normalizeStarterCodeByLanguage(
        normalized.starterCodeByLanguage
          ?? normalized.starterCode
          ?? normalized.templates,
        draft.technicalLanguage,
      );
      normalized.visibleTestCases = normalizeVisibleTestCases(
        normalized.visibleTestCases
          ?? normalized.visibleTests
          ?? normalized.testCases
          ?? normalized.tests,
      ) ?? [];
      break;
    }
    case "Debugging": {
      normalized.buggyCode = resolveGroundedCodeFieldValue(
        "buggyCode",
        readStringValue(
        normalized.buggyCode
          ?? normalized.codeSnippet
          ?? normalized.code
          ?? normalized.brokenCode,
        ),
        draft,
        sourceGroundingContext,
        draftIndex,
      );
      normalized.visibleTestCases = normalizeVisibleTestCases(
        normalized.visibleTestCases
          ?? normalized.visibleTests
          ?? normalized.testCases
          ?? normalized.tests,
      ) ?? [];
      break;
    }
  }

  return normalized;
}

function normalizeOptions(value: unknown, expectedAnswer: string): Array<{ id: string; text: string }> | undefined {
  if (!Array.isArray(value)) {
    return createFallbackOptions(expectedAnswer);
  }

  const normalized = value
    .map((entry, index) => {
      if (typeof entry === "string" && entry.trim()) {
        return {
          id: String.fromCharCode(65 + index),
          text: entry.trim(),
        };
      }

      if (!isRecord(entry)) {
        return null;
      }

      const text = readStringValue(entry.text ?? entry.label ?? entry.value ?? entry.option);
      if (!text) {
        return null;
      }

      const id = readStringValue(entry.id ?? entry.key) || String.fromCharCode(65 + index);
      return { id, text };
    })
    .filter((entry): entry is { id: string; text: string } => entry !== null);

  if (normalized.length === 0) {
    return createFallbackOptions(expectedAnswer);
  }

  const unique = normalized.filter((entry, index, collection) =>
    collection.findIndex((candidate) => candidate.id === entry.id) === index);

  if (unique.length >= 4) {
    return unique.slice(0, 4);
  }

  const fallback = createFallbackOptions(expectedAnswer);
  const existingIds = new Set(unique.map((entry) => entry.id));
  const padded = [...unique];
  for (const option of fallback) {
    if (padded.length >= 4) {
      break;
    }

    if (existingIds.has(option.id)) {
      continue;
    }

    padded.push(option);
    existingIds.add(option.id);
  }

  return padded.slice(0, 4);
}

function normalizeCorrectOptionIds(
  value: unknown,
  options: unknown,
  expectedAnswer: string,
): string[] | undefined {
  if (Array.isArray(value)) {
    const ids = value
      .map((entry) => readStringValue(entry))
      .filter((entry): entry is string => !!entry);
    if (ids.length > 0) {
      return [...new Set(ids)];
    }
  }

  const direct = readStringValue(value);
  if (direct) {
    return [direct];
  }

  if (!Array.isArray(options)) {
    return undefined;
  }

  const normalizedExpectedAnswer = expectedAnswer.trim().toLowerCase();
  if (normalizedExpectedAnswer) {
    const matched = options.find((option) =>
      isRecord(option)
      && typeof option.id === "string"
      && typeof option.text === "string"
      && option.text.trim().toLowerCase() === normalizedExpectedAnswer);

    if (matched && isRecord(matched) && typeof matched.id === "string") {
      return [matched.id];
    }
  }

  const firstOption = options.find((option) => isRecord(option) && typeof option.id === "string");
  return firstOption && isRecord(firstOption) && typeof firstOption.id === "string"
    ? [firstOption.id]
    : undefined;
}

function normalizeStarterCodeByLanguage(value: unknown, technicalLanguage: string): Record<string, string> | undefined {
  if (isRecord(value)) {
    const entries = Object.entries(value)
      .map(([key, entryValue]) => [key.trim(), readStringValue(entryValue)] as const)
      .filter((entry): entry is readonly [string, string] => !!entry[0] && !!entry[1]);
    if (entries.length > 0) {
      return Object.fromEntries(entries);
    }
  }

  const starterCode = readStringValue(value);
  const language = technicalLanguage.trim();
  if (starterCode && language) {
    return { [language]: starterCode };
  }

  return undefined;
}

function normalizeSupportedLanguages(value: unknown, technicalLanguage: string): string[] {
  const normalized = normalizeStringArray(value);
  if (normalized.length > 0) {
    return [...new Set(normalized)];
  }

  const fallback = technicalLanguage.trim();
  return fallback ? [fallback] : [];
}

function normalizeVisibleTestCases(value: unknown): Array<{ name: string; input: string; expectedOutput: string }> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .map((entry, index) => {
      if (typeof entry === "string") {
        return parseStringVisibleTestCase(entry, index);
      }

      if (!isRecord(entry)) {
        return null;
      }

      const name = readStringValue(entry.name ?? entry.label) ?? `Test ${index + 1}`;
      const input = readStringValue(entry.input ?? entry.stdin ?? entry.args);
      const expectedOutput = readStringValue(entry.expectedOutput ?? entry.expected_output ?? entry.output);
      if (!input || !expectedOutput) {
        return null;
      }

      return { name, input, expectedOutput };
    })
    .filter((entry): entry is { name: string; input: string; expectedOutput: string } => entry !== null);

  return normalized.length > 0 ? normalized : undefined;
}

function parseStringVisibleTestCase(value: string, index: number): { name: string; input: string; expectedOutput: string } | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const labeledMatch = trimmed.match(/input\s*:\s*([\s\S]+?)\s*(?:expected(?:\s*output)?|output)\s*:\s*([\s\S]+)/i);
  if (labeledMatch) {
    const input = labeledMatch[1]?.trim();
    const expectedOutput = labeledMatch[2]?.trim();
    if (input && expectedOutput) {
      return { name: `Test ${index + 1}`, input, expectedOutput };
    }
  }

  const arrowSeparators = ["=>", "->", "|"];
  for (const separator of arrowSeparators) {
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

function createFallbackOptions(expectedAnswer: string): Array<{ id: string; text: string }> {
  const correct = expectedAnswer.trim() || "Correct answer based on the source material";
  return [
    { id: "A", text: correct },
    { id: "B", text: "Off-by-one boundary issue" },
    { id: "C", text: "Uses the wrong data structure" },
    { id: "D", text: "Produces a runtime error" },
  ];
}

function createFallbackFunctionSignature(technicalLanguage: string): string {
  const language = technicalLanguage.trim().toLowerCase();
  if (language === "python") {
    return "def solve(input_data):";
  }

  if (language === "javascript" || language === "typescript") {
    return "function solve(inputData) {}";
  }

  return "public static int solve(int[] values)";
}

function createFallbackStarterCode(language: string): string {
  if (language.toLowerCase() === "python") {
    return "def solve(input_data):\n    # TODO: implement based on the source material\n    pass";
  }

  if (language.toLowerCase() === "javascript" || language.toLowerCase() === "typescript") {
    return "function solve(inputData) {\n  // TODO: implement based on the source material\n}";
  }

  return "public static int solve(int[] values) {\n    // TODO: implement based on the source material\n    return 0;\n}";
}

function readStringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => readStringValue(entry))
    .filter((entry): entry is string => !!entry);
}

function readBooleanValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }

    if (normalized === "false") {
      return false;
    }
  }

  return undefined;
}

function hasRequiredKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((key) => Object.hasOwn(value, key) && value[key] !== undefined && value[key] !== null);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type SourceGroundingContext = {
  noteContents: string[];
  normalizedNoteContents: string[];
  representativeCodeSnippets: string[];
};

function createSourceGroundingContext(
  notes: GenerateSmartQuizItemsPreviewInput["notes"],
): SourceGroundingContext {
  const noteContents = notes.map((note) => note.noteContent.replace(/\r\n/g, "\n"));
  return {
    noteContents,
    normalizedNoteContents: noteContents.map((noteContent) => normalizeGroundingText(noteContent)),
    representativeCodeSnippets: noteContents
      .map((noteContent) => extractRepresentativeCodeSnippet(noteContent))
      .filter((snippet) => !!snippet),
  };
}

function createDraftCountWarnings(actualDraftCount: number, expectedDraftCount: number): string[] {
  if (actualDraftCount === expectedDraftCount) {
    return [];
  }

  if (actualDraftCount > expectedDraftCount) {
    return [
      `Generated ${actualDraftCount} drafts; keeping the first ${expectedDraftCount} requested drafts.`,
    ];
  }

  return [
    `Generated ${actualDraftCount} of ${expectedDraftCount} requested drafts.`,
  ];
}

function resolveGroundedCodeFieldValue(
  fieldName: "codeSnippet" | "buggyCode",
  value: string | undefined,
  draft: GenerateSmartQuizItemsPreviewOutput["drafts"][number],
  sourceGroundingContext: SourceGroundingContext,
  draftIndex: number,
): string {
  const snippet = value || deriveGroundedCodeSnippet(draft, sourceGroundingContext);
  if (!snippet) {
    throw new AppError(
      `Draft ${draftIndex} with itemType "${draft.itemType}" is missing required grounded field "${fieldName}".`,
      "SMART_QUIZ_UNGROUNDED_CODE_SNIPPET",
      502,
    );
  }

  if (isPlaceholderCodeSnippet(snippet) || !looksLikeGroundedCodeSnippet(snippet)) {
    throw new AppError(
      `Draft ${draftIndex} with itemType "${draft.itemType}" contains an invalid grounded field "${fieldName}".`,
      "SMART_QUIZ_UNGROUNDED_CODE_SNIPPET",
      502,
    );
  }

  if (!isSnippetGroundedInSource(snippet, sourceGroundingContext)) {
    throw new AppError(
      `Draft ${draftIndex} with itemType "${draft.itemType}" contains a ${fieldName} that was not grounded in the provided notes.`,
      "SMART_QUIZ_UNGROUNDED_CODE_SNIPPET",
      502,
    );
  }

  return snippet;
}

function isPlaceholderCodeSnippet(value: string): boolean {
  return /source-grounded code review item|review the source material and analyze the code behavior/i.test(value);
}

function looksLikeGroundedCodeSnippet(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  if (!/[;{}()=<>\[\].,+\-*/%]/.test(trimmed) && !/\b(class|public|private|return|if|else|for|while|import|select|from|where|join)\b/i.test(trimmed)) {
    return false;
  }

  const nonCommentLines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("//") && !line.startsWith("/*") && !line.startsWith("*"));

  return nonCommentLines.length > 0;
}

function isSnippetGroundedInSource(
  snippet: string,
  sourceGroundingContext: SourceGroundingContext,
): boolean {
  const normalizedSnippet = normalizeGroundingText(snippet);
  if (!normalizedSnippet) {
    return false;
  }

  if (sourceGroundingContext.normalizedNoteContents.some((noteContent) => noteContent.includes(normalizedSnippet))) {
    return true;
  }

  const snippetLines = extractMeaningfulCodeLines(snippet);
  if (snippetLines.length === 0) {
    return false;
  }

  return sourceGroundingContext.normalizedNoteContents.some((noteContent) =>
    hasSufficientGroundedLineCoverage(noteContent, snippetLines),
  );
}

function normalizeGroundingText(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function extractMeaningfulCodeLines(value: string): string[] {
  return value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => normalizeGroundingText(line))
    .filter((line) => line.length >= 8)
    .filter((line) => /[;{}()=<>\[\].,+\-*/%]|\b(return|class|public|private|static|for|while|if|else|new|map)\b/i.test(line));
}

function hasSufficientGroundedLineCoverage(noteContent: string, snippetLines: string[]): boolean {
  const matchedLines = snippetLines.filter((line) => noteContent.includes(line));
  const minimumMatches = Math.max(2, Math.ceil(snippetLines.length * 0.6));

  if (matchedLines.length >= minimumMatches) {
    return true;
  }

  const snippetTokens = extractGroundingTokens(snippetLines.join(" "));
  if (snippetTokens.length < 6) {
    return false;
  }

  const noteTokens = new Set(extractGroundingTokens(noteContent));
  const matchedTokens = snippetTokens.filter((token) => noteTokens.has(token));
  return matchedTokens.length >= Math.ceil(snippetTokens.length * 0.75);
}

function extractGroundingTokens(value: string): string[] {
  return value
    .split(/[^a-z0-9_]+/i)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length >= 2);
}

function createSmartQuizPdfDiagnosticId(): string {
  return `smart-quiz-pdf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function countNonEmptyLines(value: string): number {
  return value.split(/\r?\n/).filter((line) => line.trim()).length;
}

function logSmartQuizPdfProgress(
  diagnosticId: string,
  stage: string,
  context: Record<string, unknown>,
): void {
  console.info("[SmartQuizService] PDF generation diagnostic", {
    diagnosticId,
    stage,
    ...context,
  });
}

function logSmartQuizPdfFailure(
  diagnosticId: string,
  stage: string,
  error: unknown,
  context: Record<string, unknown>,
): void {
  console.error("[SmartQuizService] PDF generation failed", {
    diagnosticId,
    stage,
    ...context,
    error: formatDiagnosticError(error),
  });
}

function createSmartQuizPdfHttpError(
  diagnosticId: string,
  stage: string,
  error: unknown,
  context: Record<string, unknown>,
): AppError {
  const details = {
    diagnosticId,
    stage,
    context,
    error: formatDiagnosticError(error),
  };

  if (error instanceof AppError) {
    return new AppError(error.message, error.code, error.statusCode, details);
  }

  return new AppError(
    `Smart quiz PDF preview failed during ${stage}.`,
    "SMART_QUIZ_PDF_GENERATION_FAILED",
    502,
    details,
  );
}

function logSmartQuizGenerationFailure(error: unknown, rawResponseText: string, normalizedJson: unknown): void {
  console.error("[SmartQuizService] Item generation validation failed", {
    error: formatDiagnosticError(error),
    rawResponseText: truncateLogPayload(rawResponseText),
    normalizedJson: truncateLogPayload(safeSerializeForLog(normalizedJson)),
  });
}

function formatDiagnosticError(error: unknown): Record<string, unknown> {
  if (error instanceof AppError) {
    return {
      name: error.name,
      code: error.code,
      statusCode: error.statusCode,
      message: error.message,
      stack: error.stack ? truncateLogPayload(error.stack, 4000) : undefined,
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      issues: summarizeValidationIssues(error),
      stack: error.stack ? truncateLogPayload(error.stack, 4000) : undefined,
    };
  }

  if (isRecord(error)) {
    return {
      message: readStringValue(error.message) ?? safeSerializeForLog(error),
      issues: summarizeValidationIssues(error),
    };
  }

  return {
    message: String(error),
  };
}

function summarizeValidationIssues(error: unknown): Array<{ path: string; code: string; message: string }> | undefined {
  if (!isRecord(error) || !Array.isArray(error.issues)) {
    return undefined;
  }

  const issues = error.issues
    .map((issue) => {
      if (!isRecord(issue)) {
        return null;
      }

      return {
        path: formatIssuePath(issue.path),
        code: readStringValue(issue.code) ?? "unknown",
        message: readStringValue(issue.message) ?? "Validation failed.",
      };
    })
    .filter((issue): issue is { path: string; code: string; message: string } => issue !== null);

  return issues.length > 0 ? issues.slice(0, 12) : undefined;
}

function formatIssuePath(value: unknown): string {
  if (!Array.isArray(value)) {
    return readStringValue(value) ?? "";
  }

  return value.map((entry) => String(entry)).join(".");
}

function deriveGroundedCodeSnippet(
  draft: GenerateSmartQuizItemsPreviewOutput["drafts"][number],
  sourceGroundingContext: SourceGroundingContext,
): string | undefined {
  const fromQuestion = extractCodeSnippetFromQuestion(draft.question);
  if (fromQuestion && isSnippetGroundedInSource(fromQuestion, sourceGroundingContext)) {
    return fromQuestion;
  }

  const fromLocalWindow = extractLocalCodeWindow(sourceGroundingContext.noteContents, draft.question);
  if (fromLocalWindow) {
    return fromLocalWindow;
  }

  return sourceGroundingContext.representativeCodeSnippets[0];
}

function extractRepresentativeCodeSnippet(noteContent: string): string {
  const normalized = noteContent.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const codeLineIndexes = lines
    .map((line, index) => ({ line: line.trim(), index }))
    .filter(({ line }) => /[;{}()]|system\.out\.println|console\.log|^\w+\s+\w+\s*=|^class\s+\w+|^public\s+/i.test(line))
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

function extractLocalCodeWindow(noteContents: string[], question: string): string {
  for (const noteContent of noteContents) {
    const normalizedContent = noteContent.replace(/\r\n/g, "\n");
    const anchors = question
      .split(/[^A-Za-z0-9_.]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 8)
      .slice(0, 8);

    const anchor = anchors.find((token) => normalizedContent.toLowerCase().includes(token.toLowerCase()));
    if (!anchor) {
      continue;
    }

    const anchorIndex = normalizedContent.toLowerCase().indexOf(anchor.toLowerCase());
    if (anchorIndex < 0) {
      continue;
    }

    const start = Math.max(0, anchorIndex - 180);
    const end = Math.min(normalizedContent.length, anchorIndex + 420);
    const window = normalizedContent.slice(start, end);
    const formatted = formatInlineCodeSnippet(window);
    if (isStrictCodeSnippet(formatted)) {
      return formatted;
    }
  }

  return "";
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
  return /[;{}()]|System\.out\.println|console\.log|return\b|class\s+\w+|public\s+/i.test(value);
}

function isStrictCodeSnippet(value: string): boolean {
  if (!looksLikeCodeSnippet(value)) {
    return false;
  }

  if (value.length > 600) {
    return false;
  }

  if (/flashcard generator test case|purpose:|suggested flashcard targets|expected flashcard coverage/i.test(value)) {
    return false;
  }

  const wordCount = value.split(/\s+/).filter(Boolean).length;
  const symbolCount = (value.match(/[;{}()=<>\[\].,+\-*/%]/g) ?? []).length;
  return symbolCount >= 6 || wordCount <= 60;
}

function safeSerializeForLog(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable-json]";
  }
}

function truncateLogPayload(value: string, maxLength = 6000): string {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, maxLength)}... [truncated ${value.length - maxLength} chars]`;
}
