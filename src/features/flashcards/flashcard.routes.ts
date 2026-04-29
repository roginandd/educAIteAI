import { Router } from "express";

import { FlashcardController } from "./flashcard.controller";
import { FlashcardService } from "./flashcard.service";

export function createFlashcardRouter(flashcardService: FlashcardService): Router {
  const router = Router();
  const flashcardController = new FlashcardController(flashcardService);

  router.post("/learn/sessions", flashcardController.startLearnSession);
  router.get("/learn/sessions/active", flashcardController.getActiveLearnSession);
  router.post("/learn/sessions/:sessionSqid/resume", flashcardController.resumeLearnSession);
  router.post("/learn/sessions/:sessionSqid/answers", flashcardController.submitLearnSessionAnswer);
  router.post("/learn/sessions/:sessionSqid/restart", flashcardController.restartLearnSession);
  router.post("/learn/sessions/:sessionSqid/abandon", flashcardController.abandonLearnSession);
  router.post("/notes/:noteSqid/generate", flashcardController.generateFromNote);
  router.post("/:flashcardSqid/submit-and-analyze", flashcardController.submitAndAnalyze);

  return router;
}
