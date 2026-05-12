import type { Request, Response } from "express";

import {
  analyzePdfAndGenerateSmartQuizPreviewBodySchema,
  executeSmartQuizCodeInputSchema,
  flowchartEvaluateInputSchema,
  generateSmartQuizItemsPreviewInputSchema,
  retryVariantInputSchema,
  scoreSmartQuizAnswerInputSchema,
  smartQuizGenerationJobParamsSchema,
  smartQuizSelectItemTypeInputSchema,
  smartQuizContextClassifyInputSchema,
} from "./smart-quiz.dto";
import { SmartQuizService } from "./smart-quiz.service";

export class SmartQuizController {
  constructor(private readonly smartQuizService: SmartQuizService) {}

  classifyContext = async (req: Request, res: Response): Promise<void> => {
    const input = smartQuizContextClassifyInputSchema.parse(req.body ?? {});
    const result = await this.smartQuizService.classifyContext(input);
    res.status(200).json(result);
  };

  selectItemType = async (req: Request, res: Response): Promise<void> => {
    const input = smartQuizSelectItemTypeInputSchema.parse(req.body ?? {});
    const result = await this.smartQuizService.selectItemType(input);
    res.status(200).json(result);
  };

  generatePreview = async (req: Request, res: Response): Promise<void> => {
    const input = generateSmartQuizItemsPreviewInputSchema.parse(req.body ?? {});
    const result = await this.smartQuizService.generatePreview(input);
    res.status(200).json(result);
  };

  getGenerationJob = async (req: Request, res: Response): Promise<void> => {
    const params = smartQuizGenerationJobParamsSchema.parse(req.params);
    const result = await this.smartQuizService.getGenerationJob(params.generationJobSqid);
    res.status(200).json(result);
  };

  retryHydration = async (req: Request, res: Response): Promise<void> => {
    const params = smartQuizGenerationJobParamsSchema.parse(req.params);
    const result = await this.smartQuizService.retryHydration(params.generationJobSqid);
    res.status(202).json(result);
  };

  analyzePdfAndGeneratePreview = async (req: Request, res: Response): Promise<void> => {
    const body = analyzePdfAndGenerateSmartQuizPreviewBodySchema.parse(req.body ?? {});
    const result = await this.smartQuizService.analyzePdfAndGeneratePreview(body, req.file);
    res.status(200).json(result);
  };

  extractPdfText = async (req: Request, res: Response): Promise<void> => {
    const result = await this.smartQuizService.extractPdfText(req.file);
    res.status(200).json(result);
  };

  scoreAnswer = async (req: Request, res: Response): Promise<void> => {
    const input = scoreSmartQuizAnswerInputSchema.parse(req.body ?? {});
    const result = await this.smartQuizService.scoreAnswer(input);
    res.status(200).json(result);
  };

  executeCode = async (req: Request, res: Response): Promise<void> => {
    const input = executeSmartQuizCodeInputSchema.parse(req.body ?? {});
    const result = await this.smartQuizService.executeCode(input);
    res.status(200).json(result);
  };

  runCode = async (req: Request, res: Response): Promise<void> => {
    const input = executeSmartQuizCodeInputSchema.parse(req.body ?? {});
    const result = await this.smartQuizService.runCode(input);
    res.status(200).json(result);
  };

  evaluateFlowchart = async (req: Request, res: Response): Promise<void> => {
    const input = flowchartEvaluateInputSchema.parse(req.body ?? {});
    const result = await this.smartQuizService.evaluateFlowchart(input);
    res.status(200).json(result);
  };

  generateRetryVariant = async (req: Request, res: Response): Promise<void> => {
    const input = retryVariantInputSchema.parse(req.body ?? {});
    const result = await this.smartQuizService.generateRetryVariant(input);
    res.status(200).json(result);
  };
}
