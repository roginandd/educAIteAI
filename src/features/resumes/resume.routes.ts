import { Router } from "express";

import { ResumeController } from "./resume.controller";
import { ResumeService } from "./resume.service";

export function createResumeRouter(resumeService: ResumeService): Router {
  const router = Router();
  const resumeController = new ResumeController(resumeService);

  router.get("/:resumeSqid", resumeController.getResumeWithRelations);
  router.post("/:resumeSqid/analyze", resumeController.analyzeResumeWithRelations);
  router.post("/:resumeSqid/tailor", resumeController.tailorResumeForJob);

  return router;
}
