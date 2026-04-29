import { Router } from "express";

import { StudentPerformanceController } from "./student-performance.controller";
import { StudentPerformanceService } from "./student-performance.service";

export function createStudentPerformanceRouter(studentPerformanceService: StudentPerformanceService): Router {
  const router = Router();
  const controller = new StudentPerformanceController(studentPerformanceService);

  router.post("/course-summary/evaluate", controller.evaluateCourseSummary);
  router.post("/overall-summary/evaluate", controller.evaluateOverallSummary);

  return router;
}
