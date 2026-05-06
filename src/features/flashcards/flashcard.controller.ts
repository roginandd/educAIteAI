import type { Request, Response } from "express";

import {
  flashcardLearnSessionParamsSchema,
  getActiveFlashcardLearnSessionInputSchema,
  getActiveFlashcardLearnSessionQuerySchema,
  generateFlashcardsFromNoteBodySchema,
  generateFlashcardsFromNoteInputSchema,
  generateFlashcardsFromNoteParamsSchema,
  startFlashcardLearnSessionBodySchema,
  startFlashcardLearnSessionInputSchema,
  submitFlashcardLearnAnswerBodySchema,
  submitFlashcardLearnAnswerInputSchema,
  submitAndAnalyzeFlashcardBodySchema,
  submitAndAnalyzeFlashcardInputSchema,
  submitAndAnalyzeFlashcardParamsSchema,
} from "./flashcard.dto";
import { FlashcardService } from "./flashcard.service";

export class FlashcardController {
  constructor(private readonly flashcardService: FlashcardService) {}

  startLearnSession = async (req: Request, res: Response): Promise<void> => {
    const body = startFlashcardLearnSessionBodySchema.parse(req.body ?? {});
    const input = startFlashcardLearnSessionInputSchema.parse(body);
    const result = await this.flashcardService.startLearnSession(input, req.header("authorization"));
    res.status(201).json(result);
  };

  getLearnSessionStartFlow = async (req: Request, res: Response): Promise<void> => {
    const body = startFlashcardLearnSessionBodySchema.parse(req.body ?? {});
    const input = startFlashcardLearnSessionInputSchema.parse(body);
    const result = await this.flashcardService.getLearnSessionStartFlow(input, req.header("authorization"));
    res.status(result.action === "created" ? 201 : 200).json(result);
  };

  getActiveLearnSession = async (req: Request, res: Response): Promise<void> => {
    const query = getActiveFlashcardLearnSessionQuerySchema.parse(req.query ?? {});
    const input = getActiveFlashcardLearnSessionInputSchema.parse(query);
    const result = await this.flashcardService.getActiveLearnSession(input, req.header("authorization"));
    res.status(200).json(result);
  };

  resumeLearnSession = async (req: Request, res: Response): Promise<void> => {
    const params = flashcardLearnSessionParamsSchema.parse(req.params);
    const result = await this.flashcardService.resumeLearnSession(params.sessionSqid, req.header("authorization"));
    res.status(200).json(result);
  };

  submitLearnSessionAnswer = async (req: Request, res: Response): Promise<void> => {
    const params = flashcardLearnSessionParamsSchema.parse(req.params);
    const body = submitFlashcardLearnAnswerBodySchema.parse(req.body ?? {});
    const input = submitFlashcardLearnAnswerInputSchema.parse({
      sessionSqid: params.sessionSqid,
      ...body,
    });

    const result = await this.flashcardService.submitLearnSessionAnswer(input, req.header("authorization"));
    res.status(200).json(result);
  };

  restartLearnSession = async (req: Request, res: Response): Promise<void> => {
    const params = flashcardLearnSessionParamsSchema.parse(req.params);
    const result = await this.flashcardService.restartLearnSession(params.sessionSqid, req.header("authorization"));
    res.status(200).json(result);
  };

  abandonLearnSession = async (req: Request, res: Response): Promise<void> => {
    const params = flashcardLearnSessionParamsSchema.parse(req.params);
    await this.flashcardService.abandonLearnSession(params.sessionSqid, req.header("authorization"));
    res.status(204).send();
  };

  generateFromNote = async (req: Request, res: Response): Promise<void> => {
    const params = generateFlashcardsFromNoteParamsSchema.parse(req.params);
    const body = generateFlashcardsFromNoteBodySchema.parse(req.body ?? {});

    const input = generateFlashcardsFromNoteInputSchema.parse({
      noteSqid: params.noteSqid,
      flashcardCount: body.flashcardCount,
    });

    const result = await this.flashcardService.generateFromNote(input, req.header("authorization"));

    res.status(201).json(result);
  };

  submitAndAnalyze = async (req: Request, res: Response): Promise<void> => {
    const params = submitAndAnalyzeFlashcardParamsSchema.parse(req.params);
    const body = submitAndAnalyzeFlashcardBodySchema.parse(req.body ?? {});

    const input = submitAndAnalyzeFlashcardInputSchema.parse({
      flashcardSqid: params.flashcardSqid,
      ...body,
    });

    const result = await this.flashcardService.submitAndAnalyze(input, req.header("authorization"));

    res.status(200).json(result);
  };
}
