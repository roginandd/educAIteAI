import { Router } from "express";

import { FlashcardController } from "./flashcard.controller";
import { FlashcardService } from "./flashcard.service";

export function createFlashcardRouter(flashcardService: FlashcardService): Router {
  const router = Router();
  const flashcardController = new FlashcardController(flashcardService);

  router.post("/notes/:noteSqid/generate", flashcardController.generateFromNote);

  return router;
}
