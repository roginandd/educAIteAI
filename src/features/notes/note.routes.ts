import { Router } from "express";

import { NoteController } from "./note.controller";
import { NoteService } from "./note.service";

export function createNoteRouter(noteService: NoteService): Router {
  const router = Router();
  const noteController = new NoteController(noteService);

  router.post("/documents/:documentSqid/generate", noteController.generateFromDocument);

  return router;
}
