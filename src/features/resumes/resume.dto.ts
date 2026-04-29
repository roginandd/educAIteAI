import { z } from "zod";

export const resumeParamsSchema = z.object({
  resumeSqid: z.string().trim().min(1),
});

export const resumeRelationsQuerySchema = z.object({
  includeExperiences: z.coerce.boolean().default(true),
  includeEducations: z.coerce.boolean().default(true),
  includeSkills: z.coerce.boolean().default(true),
  includeProjects: z.coerce.boolean().default(true),
  includeCertifications: z.coerce.boolean().default(true),
});

export const getResumeWithRelationsInputSchema = z.object({
  resumeSqid: z.string().trim().min(1),
  includeExperiences: z.coerce.boolean().default(true),
  includeEducations: z.coerce.boolean().default(true),
  includeSkills: z.coerce.boolean().default(true),
  includeProjects: z.coerce.boolean().default(true),
  includeCertifications: z.coerce.boolean().default(true),
});

export const analyzeResumeWithRelationsBodySchema = z.object({
  includeExperiences: z.coerce.boolean().default(true),
  includeEducations: z.coerce.boolean().default(true),
  includeSkills: z.coerce.boolean().default(true),
  includeProjects: z.coerce.boolean().default(true),
  includeCertifications: z.coerce.boolean().default(true),
});

export const analyzeResumeWithRelationsInputSchema = z.object({
  resumeSqid: z.string().trim().min(1),
  includeExperiences: z.coerce.boolean().default(true),
  includeEducations: z.coerce.boolean().default(true),
  includeSkills: z.coerce.boolean().default(true),
  includeProjects: z.coerce.boolean().default(true),
  includeCertifications: z.coerce.boolean().default(true),
});

export const tailorResumeForJobBodySchema = z.object({
  jobTitle: z.string().trim().min(1).max(200),
  companyName: z.string().trim().min(1).max(200).optional(),
  jobDescription: z.string().trim().min(1).max(20000),
  includeExperiences: z.coerce.boolean().default(true),
  includeEducations: z.coerce.boolean().default(true),
  includeSkills: z.coerce.boolean().default(true),
  includeProjects: z.coerce.boolean().default(true),
  includeCertifications: z.coerce.boolean().default(true),
});

export const tailorResumeForJobInputSchema = z.object({
  resumeSqid: z.string().trim().min(1),
  jobTitle: z.string().trim().min(1).max(200),
  companyName: z.string().trim().min(1).max(200).optional(),
  jobDescription: z.string().trim().min(1).max(20000),
  includeExperiences: z.coerce.boolean().default(true),
  includeEducations: z.coerce.boolean().default(true),
  includeSkills: z.coerce.boolean().default(true),
  includeProjects: z.coerce.boolean().default(true),
  includeCertifications: z.coerce.boolean().default(true),
});

export const studentJobTargetSuggestionsInputSchema = z.object({
  resumeSqid: z.string().trim().min(1),
  degreeProgram: z.string().trim().min(1).max(200).nullable().optional(),
  yearLevel: z.string().trim().min(1).max(80).nullable().optional(),
  subjects: z.array(z.string().trim().min(1).max(120)).default([]),
  certificates: z.array(z.string().trim().min(1).max(200)).default([]),
});

export const studentCareerHintInputSchema = z.object({
  resumeSqid: z.string().trim().min(1),
  targetRole: z.string().trim().min(1).max(200).nullable().optional(),
  activeSection: z.string().trim().min(1).max(80),
});

export const companyRecommendationSearchInputSchema = z.object({
  resumeSqid: z.string().trim().min(1),
  targetRole: z.string().trim().min(1).max(200).nullable().optional(),
  location: z.string().trim().min(1).max(200).nullable().optional(),
  workSetup: z.array(z.string().trim().min(1).max(40)).default([]),
  employmentType: z.array(z.string().trim().min(1).max(80)).default([]),
  maxResults: z.number().int().min(1).max(20).default(10),
});

export const studentJobTargetSuggestionsOutputSchema = z.object({
  suggestions: z.array(z.object({
    title: z.string().trim().min(1).max(200),
    roleType: z.string().trim().min(1).max(80),
    matchReason: z.string().trim().min(1).max(1000),
    importantSkills: z.array(z.string().trim().min(1).max(100)).max(12),
    recommendedResumeFocus: z.array(z.string().trim().min(1).max(200)).max(8),
    companyTypes: z.array(z.string().trim().min(1).max(200)).max(8),
  })).min(1).max(6),
});

export const studentCareerHintOutputSchema = z.object({
  hint: z.string().trim().min(1).max(500),
});

export const companyRecommendationItemOutputSchema = z.object({
  recommendationSqid: z.string().trim().min(1).nullable().optional(),
  companyName: z.string().trim().min(1).max(200),
  roleTitle: z.string().trim().min(1).max(200),
  matchScore: z.number().int().min(0).max(100),
  matchLevel: z.string().trim().min(1).max(80),
  whyItMatches: z.string().trim().min(1).max(2000),
  requiredSkills: z.array(z.string().trim().min(1).max(100)).max(30),
  studentMatchingSkills: z.array(z.string().trim().min(1).max(100)).max(30),
  missingSkills: z.array(z.string().trim().min(1).max(100)).max(30),
  location: z.string().trim().min(1).max(200).nullable().optional(),
  workSetup: z.string().trim().min(1).max(40),
  employmentType: z.string().trim().min(1).max(80).nullable().optional(),
  sourceUrl: z.string().trim().url().max(1000),
  sourceDomain: z.string().trim().max(255).optional(),
  recommendedAction: z.string().trim().min(1).max(1000),
  status: z.string().trim().min(1).max(40).nullable().optional(),
  savedAt: z.string().trim().min(1).nullable().optional(),
  searchedAt: z.string().trim().min(1),
});

export const companyRecommendationSearchOutputSchema = z.object({
  resumeSqid: z.string().trim().min(1),
  targetRole: z.string().trim().min(1).max(200),
  results: z.array(companyRecommendationItemOutputSchema).max(20),
  searchedAt: z.string().trim().min(1),
});

export const resumeRelationTypeSchema = z.enum([
  "experience",
  "education",
  "skill",
  "project",
  "certification",
  "resume",
  "general",
]);

const prioritySchema = z.enum(["high", "medium", "low"]);

export const resumeAnalysisOutputSchema = z.object({
  strengths: z.array(z.object({
    title: z.string().trim().min(1).max(200),
    evidence: z.string().trim().min(1).max(1000),
    relationType: resumeRelationTypeSchema,
    relationSqid: z.string().trim().min(1).optional(),
  })),
  gaps: z.array(z.object({
    title: z.string().trim().min(1).max(200),
    impact: z.string().trim().min(1).max(1000),
    evidence: z.string().trim().min(1).max(1000),
    relationType: resumeRelationTypeSchema.optional(),
    relationSqid: z.string().trim().min(1).optional(),
  })),
  relationIssues: z.array(z.object({
    relationType: resumeRelationTypeSchema,
    relationSqid: z.string().trim().min(1).optional(),
    issue: z.string().trim().min(1).max(1000),
    severity: z.enum(["low", "medium", "high"]),
    recommendedFix: z.string().trim().min(1).max(1000),
  })),
  nextActions: z.array(z.object({
    priority: prioritySchema,
    action: z.string().trim().min(1).max(1000),
    reason: z.string().trim().min(1).max(1000),
  })),
});

export const resumeJobProfileOutputSchema = z.object({
  targetRole: z.string().trim().min(1).max(200),
  companyName: z.string().trim().min(1).max(200).optional(),
  targetTone: z.string().trim().min(1).max(200),
  recruiterSignals: z.array(z.string().trim().min(1).max(400)).max(10),
  coreRequirements: z.array(z.object({
    requirement: z.string().trim().min(1).max(500),
    priority: prioritySchema,
    rationale: z.string().trim().min(1).max(500),
    keywords: z.array(z.string().trim().min(1).max(100)).max(8),
  })).min(1).max(12),
  focusAreas: z.array(z.string().trim().min(1).max(300)).max(8),
  downplayAreas: z.array(z.string().trim().min(1).max(300)).max(8),
});

const sourceRefSchema = z.object({
  relationType: resumeRelationTypeSchema,
  relationSqid: z.string().trim().min(1).optional(),
  field: z.string().trim().min(1).max(120),
  quote: z.string().trim().min(1).max(600),
});

const evidenceMapItemSchema = z.object({
  statementId: z.string().trim().min(1).max(120),
  statement: z.string().trim().min(1).max(1000),
  sourceRefs: z.array(sourceRefSchema).min(1).max(6),
});

const tailoredStatementSchema = z.object({
  statementId: z.string().trim().min(1).max(120),
  text: z.string().trim().min(1).max(1000),
});

export const resumeTailoringOutputSchema = z.object({
  alignment: z.object({
    score: z.number().int().min(0).max(100),
    matched: z.array(z.object({
      requirement: z.string().trim().min(1).max(500),
      evidence: z.string().trim().min(1).max(1000),
      priority: prioritySchema,
    })).max(12),
    gaps: z.array(z.object({
      requirement: z.string().trim().min(1).max(500),
      reason: z.string().trim().min(1).max(1000),
      priority: prioritySchema,
    })).max(12),
    priorityFocus: z.array(z.string().trim().min(1).max(300)).max(8),
  }),
  tailoredResume: z.object({
    headline: tailoredStatementSchema,
    professionalSummary: z.array(tailoredStatementSchema).min(1).max(6),
    keySkills: z.array(tailoredStatementSchema).max(12),
    experiences: z.array(z.object({
      employmentSqid: z.string().trim().min(1).optional(),
      companyName: z.string().trim().min(1).max(200),
      positionTitle: z.string().trim().min(1).max(200),
      location: z.string().trim().min(1).max(200).optional(),
      dateRange: z.string().trim().min(1).max(120),
      bullets: z.array(tailoredStatementSchema).min(1).max(6),
    })).max(12),
    education: z.array(z.object({
      educationSqid: z.string().trim().min(1).optional(),
      schoolName: z.string().trim().min(1).max(200),
      degree: z.string().trim().min(1).max(200),
      dateRange: z.string().trim().min(1).max(120),
      highlights: z.array(tailoredStatementSchema).min(1).max(4),
    })).max(8),
    certifications: z.array(z.object({
      certificationSqid: z.string().trim().min(1).optional(),
      name: z.string().trim().min(1).max(200),
      issuer: z.string().trim().min(1).max(200),
      highlight: tailoredStatementSchema,
    })).max(8),
  }),
  tailoringDecisions: z.object({
    highlighted: z.array(z.string().trim().min(1).max(400)).max(10),
    downplayed: z.array(z.string().trim().min(1).max(400)).max(10),
    noiseReduced: z.array(z.string().trim().min(1).max(400)).max(10),
  }),
  evidenceMap: z.array(evidenceMapItemSchema).min(1).max(80),
});

export type ResumeParams = z.output<typeof resumeParamsSchema>;
export type ResumeRelationsQuery = z.output<typeof resumeRelationsQuerySchema>;
export type GetResumeWithRelationsInput = z.output<typeof getResumeWithRelationsInputSchema>;
export type AnalyzeResumeWithRelationsBody = z.output<typeof analyzeResumeWithRelationsBodySchema>;
export type AnalyzeResumeWithRelationsInput = z.output<typeof analyzeResumeWithRelationsInputSchema>;
export type TailorResumeForJobBody = z.output<typeof tailorResumeForJobBodySchema>;
export type TailorResumeForJobInput = z.output<typeof tailorResumeForJobInputSchema>;
export type StudentJobTargetSuggestionsInput = z.output<typeof studentJobTargetSuggestionsInputSchema>;
export type StudentCareerHintInput = z.output<typeof studentCareerHintInputSchema>;
export type CompanyRecommendationSearchInput = z.output<typeof companyRecommendationSearchInputSchema>;
export type ResumeRelationType = z.output<typeof resumeRelationTypeSchema>;
export type ResumeAnalysisOutput = z.output<typeof resumeAnalysisOutputSchema>;
export type ResumeJobProfileOutput = z.output<typeof resumeJobProfileOutputSchema>;
export type ResumeTailoringOutput = z.output<typeof resumeTailoringOutputSchema>;
export type StudentJobTargetSuggestionsOutput = z.output<typeof studentJobTargetSuggestionsOutputSchema>;
export type StudentCareerHintOutput = z.output<typeof studentCareerHintOutputSchema>;
export type CompanyRecommendationSearchOutput = z.output<typeof companyRecommendationSearchOutputSchema>;
