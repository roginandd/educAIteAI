import type { Request, Response } from "express";

import {
  analyzeResumeWithRelationsBodySchema,
  analyzeResumeWithRelationsInputSchema,
  getResumeWithRelationsInputSchema,
  resumeParamsSchema,
  resumeRelationsQuerySchema,
  tailorResumeForJobBodySchema,
  tailorResumeForJobInputSchema,
} from "./resume.dto";
import { ResumeService } from "./resume.service";

export class ResumeController {
  constructor(private readonly resumeService: ResumeService) {}

  getResumeWithRelations = async (req: Request, res: Response): Promise<void> => {
    const params = resumeParamsSchema.parse(req.params);
    const query = resumeRelationsQuerySchema.parse(req.query ?? {});

    const input = getResumeWithRelationsInputSchema.parse({
      resumeSqid: params.resumeSqid,
      includeExperiences: query.includeExperiences,
      includeEducations: query.includeEducations,
      includeSkills: query.includeSkills,
      includeProjects: query.includeProjects,
      includeCertifications: query.includeCertifications,
    });

    const result = await this.resumeService.getResumeWithRelations(input, req.header("authorization"));
    res.status(200).json(result);
  };

  analyzeResumeWithRelations = async (req: Request, res: Response): Promise<void> => {
    const params = resumeParamsSchema.parse(req.params);
    const body = analyzeResumeWithRelationsBodySchema.parse(req.body ?? {});

    const input = analyzeResumeWithRelationsInputSchema.parse({
      resumeSqid: params.resumeSqid,
      includeExperiences: body.includeExperiences,
      includeEducations: body.includeEducations,
      includeSkills: body.includeSkills,
      includeProjects: body.includeProjects,
      includeCertifications: body.includeCertifications,
    });

    const result = await this.resumeService.analyzeResumeWithRelations(input, req.header("authorization"));
    res.status(200).json(result);
  };

  tailorResumeForJob = async (req: Request, res: Response): Promise<void> => {
    const params = resumeParamsSchema.parse(req.params);
    const body = tailorResumeForJobBodySchema.parse(req.body ?? {});

    const input = tailorResumeForJobInputSchema.parse({
      resumeSqid: params.resumeSqid,
      jobTitle: body.jobTitle,
      companyName: body.companyName,
      jobDescription: body.jobDescription,
      includeExperiences: body.includeExperiences,
      includeEducations: body.includeEducations,
      includeSkills: body.includeSkills,
      includeProjects: body.includeProjects,
      includeCertifications: body.includeCertifications,
    });

    const result = await this.resumeService.tailorResumeForJob(input, req.header("authorization"));
    res.status(200).json(result);
  };
}
