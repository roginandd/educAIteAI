import type { Request, Response } from "express";

import {
  generateFlashcardsFromNoteBodySchema,
  generateFlashcardsFromNoteInputSchema,
  generateFlashcardsFromNoteParamsSchema,
} from "./flashcard.dto";
import { FlashcardService } from "./flashcard.service";

export class FlashcardController {
  constructor(private readonly flashcardService: FlashcardService) {}

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
}
