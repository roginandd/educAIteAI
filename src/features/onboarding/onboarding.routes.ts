import { Router } from "express";

import { createPdfUpload } from "../../shared/uploads/pdf-upload";
import { OnboardingController } from "./onboarding.controller";
import { OnboardingService } from "./onboarding.service";

export function createOnboardingRouter(onboardingService: OnboardingService): Router {
  const router = Router();
  const controller = new OnboardingController(onboardingService);
  const upload = createPdfUpload();

  router.post("/studyload-preview", upload.single("studyLoadDocument"), controller.previewStudyLoad);
  router.post("/register-with-studyload", upload.single("studyLoadDocument"), controller.registerWithStudyLoad);

  return router;
}
