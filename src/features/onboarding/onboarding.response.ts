import { z } from "zod";

import { authResultSchema, studentApiResponseSchema } from "./onboarding.dto";
import { uploadAndParseStudyLoadPdfResponseSchema } from "../studyloads/studyload.response";

export const registerWithStudyLoadResponseSchema = z.object({
  student: studentApiResponseSchema,
  auth: authResultSchema,
  studyLoad: uploadAndParseStudyLoadPdfResponseSchema,
});

export type RegisterWithStudyLoadResponse = z.output<typeof registerWithStudyLoadResponseSchema>;
