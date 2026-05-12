import type { Request, Response } from "express";

import { registerWithStudyLoadBodySchema, registerWithStudyLoadInputSchema } from "./onboarding.dto";
import { OnboardingService } from "./onboarding.service";

export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  registerWithStudyLoad = async (req: Request, res: Response): Promise<void> => {
    const body = registerWithStudyLoadBodySchema.parse(req.body ?? {});

    const input = registerWithStudyLoadInputSchema.parse({
      firstName: body.firstName,
      middleName: body.middleName || undefined,
      lastName: body.lastName,
      email: body.email,
      password: body.password,
      confirmPassword: body.confirmPassword,
      studentIdNumber: body.studentIdNumber,
      expiresInMinutes: body.expiresInMinutes,
      parsedStudyLoad: body.parsedStudyLoadJson,
    });

    const result = await this.onboardingService.registerWithStudyLoad(input, req.file);
    res.status(201).json(result);
  };

  previewStudyLoad = async (req: Request, res: Response): Promise<void> => {
    const result = await this.onboardingService.previewStudyLoad(req.file);
    res.status(200).json(result);
  };
}
