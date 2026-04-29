import { z } from "zod";

import {
  companyRecommendationSearchOutputSchema,
  resumeAnalysisOutputSchema,
  resumeJobProfileOutputSchema,
  resumeTailoringOutputSchema,
  studentCareerHintOutputSchema,
  studentJobTargetSuggestionsOutputSchema,
} from "./resume.dto";

export const resumeTemplateResponseSchema = z.object({
  resumeTemplateSqid: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
}).passthrough();

export const resumePersonalDetailsResponseSchema = z.object({
  resumeSqid: z.string().trim().min(1),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  middleName: z.string().trim().min(1).nullable().optional(),
  email: z.string().trim().min(1),
  phoneNumber: z.string().trim().min(1),
  addressLine1: z.string().trim().min(1),
  addressLine2: z.string().trim().min(1).nullable().optional(),
  city: z.string().trim().min(1),
  provinceState: z.string().trim().min(1),
  country: z.string().trim().min(1),
  postalCode: z.string().trim().min(1),
  linkedInUrl: z.string().trim().min(1).nullable().optional(),
  portfolioUrl: z.string().trim().min(1).nullable().optional(),
  updatedAt: z.string().trim().min(1),
});

export const resumeEducationResponseSchema = z.object({
  educationSqid: z.string().trim().min(1),
  resumeSqid: z.string().trim().min(1),
  schoolName: z.string().trim().min(1),
  degree: z.string().trim().min(1),
  fieldOfStudy: z.string().trim().min(1).nullable().optional(),
  startDate: z.string().trim().min(1),
  endDate: z.string().trim().min(1).nullable().optional(),
  isCurrent: z.boolean(),
  description: z.string().trim().min(1).nullable().optional(),
  orderIndex: z.number().int(),
  updatedAt: z.string().trim().min(1),
});

export const resumeEmploymentHistoryResponseSchema = z.object({
  employmentSqid: z.string().trim().min(1),
  resumeSqid: z.string().trim().min(1),
  companyName: z.string().trim().min(1),
  positionTitle: z.string().trim().min(1),
  location: z.string().trim().min(1).nullable().optional(),
  startDate: z.string().trim().min(1),
  endDate: z.string().trim().min(1).nullable().optional(),
  isCurrent: z.boolean(),
  responsibilities: z.array(z.string().trim().min(1)),
  orderIndex: z.number().int(),
  updatedAt: z.string().trim().min(1),
});

export const resumeSummaryResponseSchema = z.object({
  resumeSqid: z.string().trim().min(1),
  summaryText: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
});

export const resumeCertificateItemResponseSchema = z.object({
  certificationSqid: z.string().trim().min(1),
  name: z.string().trim().min(1),
  issuer: z.string().trim().min(1),
  issuedAt: z.string().trim().min(1).nullable().optional(),
});

export const resumeReviewCompletenessResponseSchema = z.object({
  isComplete: z.boolean(),
  missingRequiredFields: z.array(z.string().trim().min(1)),
});

export const resumeWithRelationsResponseSchema = z.object({
  resumeSqid: z.string().trim().min(1),
  title: z.string().trim().min(1),
  targetRole: z.string().trim().min(1).nullable().optional(),
  template: resumeTemplateResponseSchema.nullable().optional(),
  personalDetails: resumePersonalDetailsResponseSchema.nullable().optional(),
  education: z.array(resumeEducationResponseSchema),
  employmentHistory: z.array(resumeEmploymentHistoryResponseSchema),
  summary: resumeSummaryResponseSchema.nullable().optional(),
  certificates: z.array(resumeCertificateItemResponseSchema),
  completeness: resumeReviewCompletenessResponseSchema,
}).passthrough();

export const analyzeResumeWithRelationsResponseSchema = z.object({
  resume: resumeWithRelationsResponseSchema,
  analysis: resumeAnalysisOutputSchema,
});

export const tailorResumeForJobResponseSchema = z.object({
  resume: resumeWithRelationsResponseSchema,
  jobProfile: resumeJobProfileOutputSchema,
  alignment: resumeTailoringOutputSchema.shape.alignment,
  tailoredResume: resumeTailoringOutputSchema.shape.tailoredResume,
  tailoringDecisions: resumeTailoringOutputSchema.shape.tailoringDecisions,
  evidenceMap: resumeTailoringOutputSchema.shape.evidenceMap,
  metadata: z.object({
    model: z.string().trim().min(1),
    generatedAt: z.string().trim().min(1),
    retryCount: z.number().int().min(0).max(1),
  }),
});

export const studentJobTargetSuggestionsResponseSchema = studentJobTargetSuggestionsOutputSchema;

export const studentCareerHintResponseSchema = studentCareerHintOutputSchema;

export const companyRecommendationSearchResponseSchema = companyRecommendationSearchOutputSchema;

export type ResumeWithRelationsResponse = z.output<typeof resumeWithRelationsResponseSchema>;
export type AnalyzeResumeWithRelationsResponse = z.output<typeof analyzeResumeWithRelationsResponseSchema>;
export type TailorResumeForJobResponse = z.output<typeof tailorResumeForJobResponseSchema>;
export type StudentJobTargetSuggestionsResponse = z.output<typeof studentJobTargetSuggestionsResponseSchema>;
export type StudentCareerHintResponse = z.output<typeof studentCareerHintResponseSchema>;
export type CompanyRecommendationSearchResponse = z.output<typeof companyRecommendationSearchResponseSchema>;
