import { z } from "zod";

import { parsedStudyLoadCourseItemSchema, studyLoadSemesterSchema } from "./studyload.dto";

export const studyLoadCourseApiResponseSchema = z.object({
  courseId: z.number().int().nonnegative(),
  edpCode: z.string().trim().min(1),
  courseName: z.string().trim().min(1),
  units: z.number().int().nonnegative(),
  createdAt: z.coerce.date(),
});

export const fileMetadataApiResponseSchema = z.object({
  fileMetadataId: z.number().int().nonnegative(),
  studentId: z.number().int().nonnegative(),
  fileName: z.string().trim().min(1),
  fileExtension: z.string().trim().min(1),
  contentType: z.string().trim().min(1),
  storageKey: z.string().trim().min(1),
  fileSizeInBytes: z.number().int().nonnegative(),
  uploadedAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const studyLoadApiResponseSchema = z.object({
  sqid: z.string().trim().min(1),
  studyLoadId: z.number().int().nonnegative(),
  studentSqid: z.string().trim().min(1),
  studentId: z.number().int().nonnegative(),
  fileMetadataSqid: z.string().trim().min(1),
  fileMetadata: fileMetadataApiResponseSchema.nullable(),
  schoolYearStart: z.union([z.string(), z.number()]).transform((value) => String(value)),
  schoolYearEnd: z.union([z.string(), z.number()]).transform((value) => String(value)),
  semester: z.string().trim().min(1),
  courses: z.array(studyLoadCourseApiResponseSchema),
  totalUnits: z.number().int().nonnegative(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const signedUrlResponseSchema = z.object({
  url: z.string().trim().url(),
});

export const parseAndApplyStudyLoadPdfResponseSchema = z.object({
  studyLoadSqid: z.string().trim().min(1),
  storageKey: z.string().trim().min(1),
  signedUrl: z.string().trim().url(),
  parsedSemester: studyLoadSemesterSchema,
  parsedSchoolYearStart: z.coerce.number().int().min(1900).max(9999),
  parsedSchoolYearEnd: z.coerce.number().int().min(1900).max(9999),
  parsedCourses: z.array(parsedStudyLoadCourseItemSchema).min(1),
  appliedStudyLoad: studyLoadApiResponseSchema,
});

export const uploadAndParseStudyLoadPdfResponseSchema = z.object({
  uploadedStudyLoad: studyLoadApiResponseSchema,
  parseResult: parseAndApplyStudyLoadPdfResponseSchema,
});

export type StudyLoadCourseApiResponse = z.output<typeof studyLoadCourseApiResponseSchema>;
export type FileMetadataApiResponse = z.output<typeof fileMetadataApiResponseSchema>;
export type StudyLoadApiResponse = z.output<typeof studyLoadApiResponseSchema>;
export type SignedUrlResponse = z.output<typeof signedUrlResponseSchema>;
export type ParseAndApplyStudyLoadPdfResponse = z.output<typeof parseAndApplyStudyLoadPdfResponseSchema>;
export type UploadAndParseStudyLoadPdfResponse = z.output<typeof uploadAndParseStudyLoadPdfResponseSchema>;
