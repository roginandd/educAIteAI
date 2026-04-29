import type { Request, Response } from "express";

import {
  certificateParseBodySchema,
  certificateParseInputSchema,
  certificateSuggestionBodySchema,
  certificateSuggestionInputSchema,
} from "./certificate.dto";
import { CertificateService } from "./certificate.service";

export class CertificateController {
  constructor(private readonly certificateService: CertificateService) {}

  parseCertificate = async (req: Request, res: Response): Promise<void> => {
    const body = certificateParseBodySchema.parse(req.body ?? {});
    const input = certificateParseInputSchema.parse(body);
    const result = await this.certificateService.parseCertificate(input);

    res.status(200).json(result);
  };

  suggestCertificates = async (req: Request, res: Response): Promise<void> => {
    const body = certificateSuggestionBodySchema.parse(req.body ?? {});
    const input = certificateSuggestionInputSchema.parse(body);
    const result = await this.certificateService.suggestCertificates(input);

    res.status(200).json(result);
  };
}
