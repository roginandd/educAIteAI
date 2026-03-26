import type { Request, Response } from "express";

import {
  applyParsedStudyLoadCoursesBodySchema,
  applyParsedStudyLoadCoursesInputSchema,
  applyParsedStudyLoadCoursesParamsSchema,
  parseAndApplyStudyLoadPdfBodySchema,
  parseAndApplyStudyLoadPdfInputSchema,
  parseAndApplyStudyLoadPdfParamsSchema,
  uploadAndParseStudyLoadPdfBodySchema,
  uploadAndParseStudyLoadPdfInputSchema,
} from "./studyload.dto";
import { StudyLoadService } from "./studyload.service";

export class StudyLoadController {
  constructor(private readonly studyLoadService: StudyLoadService) {}

  uploadParseAndApplyPdf = async (req: Request, res: Response): Promise<void> => {
    const body = uploadAndParseStudyLoadPdfBodySchema.parse(req.body ?? {});

    const input = uploadAndParseStudyLoadPdfInputSchema.parse({
      studentSqid: body.studentSqid,
      expiresInMinutes: body.expiresInMinutes,
    });

    const result = await this.studyLoadService.uploadParseAndApplyStudyLoadPdf(
      input,
      req.file,
      req.header("authorization"),
    );

    res.status(201).json(result);
  };

  parseAndApplyPdf = async (req: Request, res: Response): Promise<void> => {
    const params = parseAndApplyStudyLoadPdfParamsSchema.parse(req.params);
    const body = parseAndApplyStudyLoadPdfBodySchema.parse(req.body ?? {});

    const input = parseAndApplyStudyLoadPdfInputSchema.parse({
      studyLoadSqid: params.studyLoadSqid,
      expiresInMinutes: body.expiresInMinutes,
    });

    const result = await this.studyLoadService.parseAndApplyStudyLoadPdf(input, req.header("authorization"));

    res.status(200).json(result);
  };

  applyParsedCourses = async (req: Request, res: Response): Promise<void> => {
    const params = applyParsedStudyLoadCoursesParamsSchema.parse(req.params);
    const body = applyParsedStudyLoadCoursesBodySchema.parse(req.body ?? {});

    const input = applyParsedStudyLoadCoursesInputSchema.parse({
      studyLoadSqid: params.studyLoadSqid,
      courses: body.courses,
    });

    const result = await this.studyLoadService.applyParsedCourses(input, req.header("authorization"));

    res.status(200).json(result);
  };
}
