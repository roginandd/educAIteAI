import express, { type NextFunction, type Request, type Response } from "express";
import { ZodError } from "zod";

import type { AppDependencies } from "../bootstrap/dependencies";
import { createAgentRouter } from "../features/agent/agent.routes";
import { createCertificateRouter } from "../features/certificates/certificate.routes";
import { createFlashcardRouter } from "../features/flashcards/flashcard.routes";
import { createNoteRouter } from "../features/notes/note.routes";
import { createOnboardingRouter } from "../features/onboarding/onboarding.routes";
import { createResumeRouter } from "../features/resumes/resume.routes";
import { createSmartQuizRouter } from "../features/smart-quiz/smart-quiz.routes";
import { createStudentPerformanceRouter } from "../features/student-performance/student-performance.routes";
import { createStudyLoadRouter } from "../features/studyloads/studyload.routes";
import { AppError } from "../shared/errors/app-error";

const jsonBodyLimit = "2mb";

export function createApp(dependencies: AppDependencies) {
  const app = express();
  const allowedOrigin = "http://localhost:5173";

  app.use((req, res, next) => {
    const origin = req.headers.origin;

    if (origin === allowedOrigin) {
      res.header("Access-Control-Allow-Origin", allowedOrigin);
      res.header("Vary", "Origin");
      res.header("Access-Control-Allow-Credentials", "true");
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    }

    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }

    next();
  });

  app.use(express.json({ limit: jsonBodyLimit }));

  app.get("/health", (_req, res) => {
    res.status(200).json({
      ok: true,
      service: "educAIteAI",
    });
  });

  app.use("/api/flashcards", createFlashcardRouter(dependencies.flashcardService));
  app.use("/api/agent", createAgentRouter(dependencies.agentService));
  app.use("/api/onboarding", createOnboardingRouter(dependencies.onboardingService));
  app.use("/api/resumes", createResumeRouter(dependencies.resumeService));
  app.use("/api/smart-quiz", createSmartQuizRouter(dependencies.smartQuizService));
  app.use("/internal/adk/certificates", createCertificateRouter(dependencies.certificateService));
  app.use("/internal/student-performance", createStudentPerformanceRouter(dependencies.studentPerformanceService));
  app.use("/api/notes", createNoteRouter(dependencies.noteService));
  app.use("/api/studyloads", createStudyLoadRouter(dependencies.studyLoadService));

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (isPayloadTooLargeError(error)) {
      res.status(413).json({
        code: "PAYLOAD_TOO_LARGE",
        message: `Request body is too large. Keep the submitted content under ${jsonBodyLimit}.`,
        details: {
          limitBytes: error.limit,
          receivedBytes: error.received,
        },
      });
      return;
    }

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
        ...(error.details ? { details: error.details } : {}),
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

function isPayloadTooLargeError(error: unknown): error is {
  type: string;
  limit?: number;
  received?: number;
} {
  return (
    typeof error === "object"
    && error !== null
    && (error as { type?: unknown }).type === "entity.too.large"
  );
}
