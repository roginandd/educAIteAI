import type { Request, Response } from "express";

import {
  studentCoursePerformanceSummaryEvaluationContextResponseSchema,
  studentOverallPerformanceSummaryEvaluationContextResponseSchema,
} from "../flashcards/flashcard.response";
import { StudentPerformanceService } from "./student-performance.service";

export class StudentPerformanceController {
  constructor(private readonly studentPerformanceService: StudentPerformanceService) {}

  evaluateCourseSummary = async (req: Request, res: Response): Promise<void> => {
    const input = studentCoursePerformanceSummaryEvaluationContextResponseSchema.parse(req.body ?? {});
    const result = await this.studentPerformanceService.evaluateCourseSummary(input);
    res.status(200).json(result);
  };

  evaluateOverallSummary = async (req: Request, res: Response): Promise<void> => {
    const input = studentOverallPerformanceSummaryEvaluationContextResponseSchema.parse(req.body ?? {});
    const result = await this.studentPerformanceService.evaluateOverallSummary(input);
    res.status(200).json(result);
  };
}
