import { z } from "zod";

export const supportedCertificateMimeTypeSchema = z.enum([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

export const certificateParseBodySchema = z.object({
  certificationSqid: z.string().trim().min(1).max(120),
  fileUrl: z.string().trim().url(),
  fileMimeType: supportedCertificateMimeTypeSchema,
  fileName: z.string().trim().min(1).max(500),
  expectedFields: z.array(z.string().trim().min(1).max(120)).default([
    "achievementName",
    "institution",
    "issuedDate",
    "gradeOrScore",
  ]),
});

export const certificateParseInputSchema = certificateParseBodySchema;

export const certificateQualityCheckSchema = z.object({
  isReadable: z.boolean(),
  recommendedDpi: z.number().int().min(0).max(1200).nullable(),
  detectedIssues: z.array(z.string().trim().min(1).max(300)).max(12),
  qualityScore: z.number().int().min(0).max(100),
});

export const certificateOcrSchema = z.object({
  rawText: z.string().max(50000),
  textDetected: z.boolean(),
  ocrConfidence: z.number().int().min(0).max(100),
});

export const certificateParsedFieldsSchema = z.object({
  achievementName: z.string().trim().min(1).max(300).nullable(),
  institution: z.string().trim().min(1).max(300).nullable(),
  issuedDate: z.string().trim().min(1).max(40).nullable(),
  gradeOrScore: z.string().trim().min(1).max(200).nullable(),
  tags: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
});

export const certificateFieldConfidenceSchema = z.object({
  fieldName: z.string().trim().min(1).max(120),
  value: z.string().max(1000).nullable(),
  confidence: z.number().int().min(0).max(100),
  needsReview: z.boolean(),
});

export const certificateStatusRecommendationSchema = z.enum([
  "parsed",
  "needs_review",
  "failed",
]);

export const certificateParsingAgentOutputSchema = z.object({
  certificationSqid: z.string().trim().min(1).max(120),
  qualityCheck: certificateQualityCheckSchema,
  ocr: certificateOcrSchema,
  parsedFields: certificateParsedFieldsSchema,
  fieldConfidence: z.array(certificateFieldConfidenceSchema).max(20),
  overallConfidence: z.number().int().min(0).max(100),
  statusRecommendation: certificateStatusRecommendationSchema,
});

export const certificateParsingOutputSchema = certificateParsingAgentOutputSchema.extend({
  model: z.string().trim().min(1).max(120),
  generatedAt: z.string().trim().min(1),
});

export const certificateSuggestionCertificateSchema = z.object({
  certificationSqid: z.string().trim().min(1).max(120),
  achievementName: z.string().trim().min(1).max(300),
  institution: z.string().trim().min(1).max(300),
  issuedDate: z.string().trim().min(1).max(40).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
});

export const certificateSuggestionBodySchema = z.object({
  resumeSqid: z.string().trim().min(1).max(120),
  jobTitle: z.string().trim().min(1).max(200),
  companyName: z.string().trim().min(1).max(200).optional(),
  jobDescription: z.string().trim().min(1).max(20000),
  certificates: z.array(certificateSuggestionCertificateSchema).max(100),
  maxSuggestions: z.number().int().min(1).max(20).default(5),
});

export const certificateSuggestionInputSchema = certificateSuggestionBodySchema;

export const certificateSuggestionJobProfileSchema = z.object({
  targetRole: z.string().trim().min(1).max(200),
  companyName: z.string().trim().min(1).max(200).nullable().optional(),
  detectedSignals: z.array(z.string().trim().min(1).max(120)).max(20),
});

export const certificateSuggestionItemSchema = z.object({
  certificationSqid: z.string().trim().min(1).max(120),
  matchScore: z.number().int().min(0).max(100),
  recommendation: z.enum(["include", "exclude"]),
  reason: z.string().trim().min(1).max(1000),
  matchedSignals: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
});

export const certificateExcludedItemSchema = z.object({
  certificationSqid: z.string().trim().min(1).max(120),
  recommendation: z.literal("exclude"),
  reason: z.string().trim().min(1).max(1000),
});

export const certificateSuggestionAgentOutputSchema = z.object({
  resumeSqid: z.string().trim().min(1).max(120),
  jobProfile: certificateSuggestionJobProfileSchema,
  suggestions: z.array(certificateSuggestionItemSchema).max(20),
  excluded: z.array(certificateExcludedItemSchema).max(100),
});

export const certificateSuggestionOutputSchema = certificateSuggestionAgentOutputSchema.extend({
  model: z.string().trim().min(1).max(120),
  generatedAt: z.string().trim().min(1),
});

export type CertificateParseInput = z.output<typeof certificateParseInputSchema>;
export type CertificateParsingAgentOutput = z.output<typeof certificateParsingAgentOutputSchema>;
export type CertificateParsingOutput = z.output<typeof certificateParsingOutputSchema>;
export type CertificateSuggestionInput = z.output<typeof certificateSuggestionInputSchema>;
export type CertificateSuggestionAgentOutput = z.output<typeof certificateSuggestionAgentOutputSchema>;
export type CertificateSuggestionOutput = z.output<typeof certificateSuggestionOutputSchema>;
