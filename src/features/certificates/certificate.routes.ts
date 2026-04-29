import { Router } from "express";

import { CertificateController } from "./certificate.controller";
import { CertificateService } from "./certificate.service";

export function createCertificateRouter(certificateService: CertificateService): Router {
  const router = Router();
  const certificateController = new CertificateController(certificateService);

  router.post("/parse", certificateController.parseCertificate);
  router.post("/suggest", certificateController.suggestCertificates);

  return router;
}
