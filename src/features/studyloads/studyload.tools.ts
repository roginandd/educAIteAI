import { z } from "zod";

import type { ToolDefinition } from "../../shared/types/tool-definition";
import { StudyLoadService } from "./studyload.service";
import {
  applyParsedStudyLoadCoursesInputSchema,
  parseAndApplyStudyLoadPdfInputSchema,
  uploadAndParseStudyLoadPdfInputSchema,
} from "./studyload.dto";

const applyParsedStudyLoadCoursesToolInputSchema = applyParsedStudyLoadCoursesInputSchema.extend({
  authorizationHeader: z.string().trim().min(1),
});

const parseAndApplyStudyLoadPdfToolInputSchema = parseAndApplyStudyLoadPdfInputSchema.extend({
  authorizationHeader: z.string().trim().min(1),
});

const uploadAndParseStudyLoadPdfToolInputSchema = uploadAndParseStudyLoadPdfInputSchema.extend({
  authorizationHeader: z.string().trim().min(1),
  fileName: z.string().trim().min(1),
  mimeType: z.string().trim().min(1).default("application/pdf"),
  pdfBase64: z.string().trim().min(1),
});

export function buildStudyLoadTools(studyLoadService: StudyLoadService): ToolDefinition[] {
  return [{
    name: "upload_parse_and_apply_studyload_pdf",
    description: "Uploads a studyload PDF to the EducAIte API, then parses the uploaded studyload with AI and applies its courses.",
    inputSchema: uploadAndParseStudyLoadPdfToolInputSchema,
    async execute(input) {
      const parsedInput = uploadAndParseStudyLoadPdfToolInputSchema.parse(input);
      return studyLoadService.uploadParseAndApplyStudyLoadPdf(
        {
          studentSqid: parsedInput.studentSqid,
          expiresInMinutes: parsedInput.expiresInMinutes,
        },
        {
          fieldname: "studyLoadDocument",
          originalname: parsedInput.fileName,
          encoding: "7bit",
          mimetype: parsedInput.mimeType,
          size: Buffer.byteLength(parsedInput.pdfBase64, "base64"),
          buffer: Buffer.from(parsedInput.pdfBase64, "base64"),
          destination: "",
          filename: "",
          path: "",
          stream: undefined as never,
        },
        parsedInput.authorizationHeader,
      );
    },
  }, {
    name: "parse_and_apply_studyload_pdf",
    description: "Loads the persisted studyload, generates a signed URL for its PDF, parses the PDF with AI, and applies the normalized course rows to the target study load.",
    inputSchema: parseAndApplyStudyLoadPdfToolInputSchema,
    async execute(input) {
      const parsedInput = parseAndApplyStudyLoadPdfToolInputSchema.parse(input);
      return studyLoadService.parseAndApplyStudyLoadPdf(
        {
          studyLoadSqid: parsedInput.studyLoadSqid,
          expiresInMinutes: parsedInput.expiresInMinutes,
        },
        parsedInput.authorizationHeader,
      );
    },
  }, {
    name: "apply_parsed_studyload_courses",
    description: "Persists parsed studyload course rows through the EducAIte StudyLoad API and automatically syncs courses and student-course enrollments.",
    inputSchema: applyParsedStudyLoadCoursesToolInputSchema,
    async execute(input) {
      const parsedInput = applyParsedStudyLoadCoursesToolInputSchema.parse(input);
      return studyLoadService.applyParsedCourses(
        {
          studyLoadSqid: parsedInput.studyLoadSqid,
          courses: parsedInput.courses,
        },
        parsedInput.authorizationHeader,
      );
    },
  }];
}
