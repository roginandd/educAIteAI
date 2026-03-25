import { z } from "zod";

export const parsedStudyLoadCourseItemSchema = z.object({
  edpCode: z.string().trim().min(1),
  courseName: z.string().trim().min(1),
  units: z.coerce.number().int().min(0).max(255),
});

export const studyLoadSemesterSchema = z.coerce.number().int().min(1).max(4);

export const applyParsedStudyLoadCoursesRequestSchema = z.object({
  courses: z.array(parsedStudyLoadCourseItemSchema).min(1),
});

export const applyParsedStudyLoadCoursesParamsSchema = z.object({
  studyLoadSqid: z.string().trim().min(1),
});

export const applyParsedStudyLoadCoursesBodySchema = applyParsedStudyLoadCoursesRequestSchema;

export const applyParsedStudyLoadCoursesInputSchema = z.object({
  studyLoadSqid: z.string().trim().min(1),
  courses: z.array(parsedStudyLoadCourseItemSchema).min(1),
});

export const parseAndApplyStudyLoadPdfParamsSchema = z.object({
  studyLoadSqid: z.string().trim().min(1),
});

export const parseAndApplyStudyLoadPdfBodySchema = z.object({
  expiresInMinutes: z.coerce.number().int().min(1).max(1440).default(60),
});

export const parseAndApplyStudyLoadPdfInputSchema = z.object({
  studyLoadSqid: z.string().trim().min(1),
  expiresInMinutes: z.coerce.number().int().min(1).max(1440).default(60),
});

export const uploadAndParseStudyLoadPdfBodySchema = z.object({
  studentSqid: z.string().trim().min(1),
  expiresInMinutes: z.coerce.number().int().min(1).max(1440).default(60),
});

export const uploadAndParseStudyLoadPdfInputSchema = z.object({
  studentSqid: z.string().trim().min(1),
  expiresInMinutes: z.coerce.number().int().min(1).max(1440).default(60),
});

export const studyLoadCourseParsingOutputSchema = z.object({
  semester: studyLoadSemesterSchema,
  schoolYearStart: z.coerce.number().int().min(1900).max(9999),
  schoolYearEnd: z.coerce.number().int().min(1900).max(9999),
  courses: z.array(parsedStudyLoadCourseItemSchema).min(1),
});

export type ParsedStudyLoadCourseItem = z.output<typeof parsedStudyLoadCourseItemSchema>;
export type ApplyParsedStudyLoadCoursesRequest = z.output<typeof applyParsedStudyLoadCoursesRequestSchema>;
export type ApplyParsedStudyLoadCoursesParams = z.output<typeof applyParsedStudyLoadCoursesParamsSchema>;
export type ApplyParsedStudyLoadCoursesBody = z.output<typeof applyParsedStudyLoadCoursesBodySchema>;
export type ApplyParsedStudyLoadCoursesInput = z.output<typeof applyParsedStudyLoadCoursesInputSchema>;
export type ParseAndApplyStudyLoadPdfParams = z.output<typeof parseAndApplyStudyLoadPdfParamsSchema>;
export type ParseAndApplyStudyLoadPdfBody = z.output<typeof parseAndApplyStudyLoadPdfBodySchema>;
export type ParseAndApplyStudyLoadPdfInput = z.output<typeof parseAndApplyStudyLoadPdfInputSchema>;
export type UploadAndParseStudyLoadPdfBody = z.output<typeof uploadAndParseStudyLoadPdfBodySchema>;
export type UploadAndParseStudyLoadPdfInput = z.output<typeof uploadAndParseStudyLoadPdfInputSchema>;
export type StudyLoadCourseParsingOutput = z.output<typeof studyLoadCourseParsingOutputSchema>;
