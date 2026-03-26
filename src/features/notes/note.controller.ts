import type { Request, Response } from "express";

import {
  generateNoteFromDocumentBodySchema,
  generateNoteFromDocumentInputSchema,
  generateNoteFromDocumentParamsSchema,
} from "./note.dto";
import { NoteService } from "./note.service";

export class NoteController {
  constructor(private readonly noteService: NoteService) {}

  generateFromDocument = async (req: Request, res: Response): Promise<void> => {
    const params = generateNoteFromDocumentParamsSchema.parse(req.params);
    const body = generateNoteFromDocumentBodySchema.parse(req.body ?? {});

    const input = generateNoteFromDocumentInputSchema.parse({
      documentSqid: params.documentSqid,
      expiresInMinutes: body.expiresInMinutes,
    });

    const result = await this.noteService.generateFromDocument(input, req.header("authorization"));

    res.status(200).json(result);
  };
}
