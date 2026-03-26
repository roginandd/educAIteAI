import { Router } from "express";
import multer from "multer";

import { StudyLoadController } from "./studyload.controller";
import { StudyLoadService } from "./studyload.service";

export function createStudyLoadRouter(studyLoadService: StudyLoadService): Router {
  const router = Router();
  const studyLoadController = new StudyLoadController(studyLoadService);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 20 * 1024 * 1024,
    },
  });

  router.post("/upload-parse-and-apply", upload.single("studyLoadDocument"), studyLoadController.uploadParseAndApplyPdf);
  router.post("/:studyLoadSqid/parse-and-apply", studyLoadController.parseAndApplyPdf);
  router.post("/:studyLoadSqid/parsed-courses", studyLoadController.applyParsedCourses);

  return router;
}
