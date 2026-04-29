import { z } from "zod";

import type { ToolDefinition } from "../../shared/types/tool-definition";
import {
  analyzeResumeWithRelationsInputSchema,
  getResumeWithRelationsInputSchema,
  tailorResumeForJobInputSchema,
} from "./resume.dto";
import { ResumeService } from "./resume.service";

const getResumeWithRelationsToolInputSchema = getResumeWithRelationsInputSchema.extend({
  authorizationHeader: z.string().trim().min(1),
});

const analyzeResumeWithRelationsToolInputSchema = analyzeResumeWithRelationsInputSchema.extend({
  authorizationHeader: z.string().trim().min(1),
});

const tailorResumeForJobToolInputSchema = tailorResumeForJobInputSchema.extend({
  authorizationHeader: z.string().trim().min(1),
});

export function buildResumeTools(resumeService: ResumeService): ToolDefinition[] {
  return [{
    name: "get_resume_with_relations",
    description: "Fetches a resume and selected related entities from the EducAIte API.",
    inputSchema: getResumeWithRelationsToolInputSchema,
    async execute(input) {
      const parsedInput = getResumeWithRelationsToolInputSchema.parse(input);
      return resumeService.getResumeWithRelations(
        {
          resumeSqid: parsedInput.resumeSqid,
          includeExperiences: parsedInput.includeExperiences,
          includeEducations: parsedInput.includeEducations,
          includeSkills: parsedInput.includeSkills,
          includeProjects: parsedInput.includeProjects,
          includeCertifications: parsedInput.includeCertifications,
        },
        parsedInput.authorizationHeader,
      );
    },
  }, {
    name: "analyze_resume_with_relations",
    description: "Fetches a resume with selected relations and returns structured AI quality analysis.",
    inputSchema: analyzeResumeWithRelationsToolInputSchema,
    async execute(input) {
      const parsedInput = analyzeResumeWithRelationsToolInputSchema.parse(input);
      return resumeService.analyzeResumeWithRelations(
        {
          resumeSqid: parsedInput.resumeSqid,
          includeExperiences: parsedInput.includeExperiences,
          includeEducations: parsedInput.includeEducations,
          includeSkills: parsedInput.includeSkills,
          includeProjects: parsedInput.includeProjects,
          includeCertifications: parsedInput.includeCertifications,
        },
        parsedInput.authorizationHeader,
      );
    },
  }, {
    name: "tailor_resume_for_job",
    description: "Fetches a resume review payload and returns a truthful, job-tailored version aligned to the target role.",
    inputSchema: tailorResumeForJobToolInputSchema,
    async execute(input) {
      const parsedInput = tailorResumeForJobToolInputSchema.parse(input);
      return resumeService.tailorResumeForJob(
        {
          resumeSqid: parsedInput.resumeSqid,
          jobTitle: parsedInput.jobTitle,
          companyName: parsedInput.companyName,
          jobDescription: parsedInput.jobDescription,
          includeExperiences: parsedInput.includeExperiences,
          includeEducations: parsedInput.includeEducations,
          includeSkills: parsedInput.includeSkills,
          includeProjects: parsedInput.includeProjects,
          includeCertifications: parsedInput.includeCertifications,
        },
        parsedInput.authorizationHeader,
      );
    },
  }];
}

export function buildResumeAgentTools(resumeService: ResumeService, authorizationHeader: string): ToolDefinition[] {
  return [{
    name: "get_resume_with_relations",
    description: "Fetches a resume and selected related entities from the EducAIte API.",
    inputSchema: getResumeWithRelationsInputSchema,
    async execute(input) {
      const parsedInput = getResumeWithRelationsInputSchema.parse(input);
      return resumeService.getResumeWithRelations(parsedInput, authorizationHeader);
    },
  }, {
    name: "analyze_resume_with_relations",
    description: "Fetches a resume with selected relations and returns structured AI quality analysis.",
    inputSchema: analyzeResumeWithRelationsInputSchema,
    async execute(input) {
      const parsedInput = analyzeResumeWithRelationsInputSchema.parse(input);
      return resumeService.analyzeResumeWithRelations(parsedInput, authorizationHeader);
    },
  }, {
    name: "tailor_resume_for_job",
    description: "Fetches a resume review payload and returns a truthful, job-tailored version aligned to the target role.",
    inputSchema: tailorResumeForJobInputSchema,
    async execute(input) {
      const parsedInput = tailorResumeForJobInputSchema.parse(input);
      return resumeService.tailorResumeForJob(parsedInput, authorizationHeader);
    },
  }];
}
