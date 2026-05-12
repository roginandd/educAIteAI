import { z } from "zod";

import { studyLoadCourseParsingOutputSchema } from "../studyloads/studyload.dto";

const optionalParsedStudyLoadJsonSchema = z
  .string()
  .trim()
  .optional()
  .transform((value, ctx) => {
    if (!value) {
      return undefined;
    }

    try {
      return studyLoadCourseParsingOutputSchema.parse(JSON.parse(value));
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Reviewed studyload payload is invalid.",
      });

      return z.NEVER;
    }
  });

export const registerWithStudyLoadBodySchema = z.object({
  firstName: z.string().trim().min(1),
  middleName: z.string().trim().optional().or(z.literal("")),
  lastName: z.string().trim().min(1),
  email: z.string().trim().email(),
  password: z.string().min(1),
  confirmPassword: z.string().min(1),
  studentIdNumber: z.string().trim().min(1),
  expiresInMinutes: z.coerce.number().int().min(1).max(1440).default(60),
  parsedStudyLoadJson: optionalParsedStudyLoadJsonSchema,
});

export const registerWithStudyLoadInputSchema = z.object({
  firstName: z.string().trim().min(1),
  middleName: z.string().trim().optional(),
  lastName: z.string().trim().min(1),
  email: z.string().trim().email(),
  password: z.string().min(1),
  confirmPassword: z.string().min(1),
  studentIdNumber: z.string().trim().min(1),
  expiresInMinutes: z.coerce.number().int().min(1).max(1440).default(60),
  parsedStudyLoad: studyLoadCourseParsingOutputSchema.optional(),
});

export const studentApiResponseSchema = z.object({
  sqid: z.string().trim().min(1),
  id: z.number().int().positive(),
  studentIdNumber: z.string().trim().min(1),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  program: z.string(),
  semester: z.number().int(),
  email: z.string().trim().email(),
  phoneNumber: z.string(),
  createdAt: z.coerce.date(),
});

export const authResultSchema = z.object({
  success: z.boolean(),
  token: z.string().nullable().optional(),
  expiration: z.coerce.date().nullable().optional(),
  error: z.string().nullable().optional(),
});

export type RegisterWithStudyLoadBody = z.output<typeof registerWithStudyLoadBodySchema>;
export type RegisterWithStudyLoadInput = z.output<typeof registerWithStudyLoadInputSchema>;
export type StudentApiResponse = z.output<typeof studentApiResponseSchema>;
export type AuthResult = z.output<typeof authResultSchema>;
