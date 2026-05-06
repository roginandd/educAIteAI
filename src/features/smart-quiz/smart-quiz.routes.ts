import { Router } from "express";

import { createPdfUpload } from "../../shared/uploads/pdf-upload";
import { SmartQuizController } from "./smart-quiz.controller";
import { SmartQuizService } from "./smart-quiz.service";

export function createSmartQuizRouter(smartQuizService: SmartQuizService): Router {
  const router = Router();
  const smartQuizController = new SmartQuizController(smartQuizService);
  const upload = createPdfUpload();

  router.post("/context/classify", smartQuizController.classifyContext);
  router.post("/context/select-type", smartQuizController.selectItemType);
  router.post("/items/generate-preview", smartQuizController.generatePreview);
  router.post("/pdf/analyze-and-generate-preview", upload.single("file"), smartQuizController.analyzePdfAndGeneratePreview);
  router.post("/answers/score", smartQuizController.scoreAnswer);
  router.post("/code/run", smartQuizController.runCode);
  router.post("/code/execute", smartQuizController.executeCode);
  router.post("/flowcharts/evaluate", smartQuizController.evaluateFlowchart);
  router.post("/items/retry-variant", smartQuizController.generateRetryVariant);

  return router;
}
