import { Router } from "express";

import { createPdfUpload } from "../../shared/uploads/pdf-upload";
import { StudyLoadController } from "./studyload.controller";
import { StudyLoadService } from "./studyload.service";

export function createStudyLoadRouter(studyLoadService: StudyLoadService): Router {
  const router = Router();
  const studyLoadController = new StudyLoadController(studyLoadService);
  const upload = createPdfUpload();

  router.post("/upload-parse-and-apply", upload.single("studyLoadDocument"), studyLoadController.uploadParseAndApplyPdf);
  router.post("/:studyLoadSqid/parse-and-apply", studyLoadController.parseAndApplyPdf);
  router.post("/:studyLoadSqid/parsed-courses", studyLoadController.applyParsedCourses);

  return router;
}
