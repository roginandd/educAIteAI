import express, { type NextFunction, type Request, type Response } from "express";
import { ZodError } from "zod";

import type { AppDependencies } from "../bootstrap/dependencies";
import { createFlashcardRouter } from "../features/flashcards/flashcard.routes";
import { createNoteRouter } from "../features/notes/note.routes";
import { createStudyLoadRouter } from "../features/studyloads/studyload.routes";
import { AppError } from "../shared/errors/app-error";

export function createApp(dependencies: AppDependencies) {
  const app = express();

  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.status(200).json({
      ok: true,
      service: "educAIteAI",
    });
  });

  app.use("/api/flashcards", createFlashcardRouter(dependencies.flashcardService));
  app.use("/api/notes", createNoteRouter(dependencies.noteService));
  app.use("/api/studyloads", createStudyLoadRouter(dependencies.studyLoadService));

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ZodError) {
      res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Request validation failed.",
        issues: error.issues,
      });
      return;
    }

    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        code: error.code,
        message: error.message,
      });
      return;
    }

    console.error(error);
    res.status(500).json({
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred.",
    });
  });

  return app;
}
