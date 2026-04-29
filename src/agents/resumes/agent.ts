import { InMemoryRunner, LlmAgent } from "@google/adk";

import { env } from "../../config/env";
import {
  resumeAnalysisOutputSchema,
  resumeJobProfileOutputSchema,
  resumeTailoringOutputSchema,
} from "../../features/resumes/resume.dto";
import { buildResumeAgentTools } from "../../features/resumes/resume.tools";
import { ResumeService } from "../../features/resumes/resume.service";
import { toAdkFunctionTools } from "../shared/adk-tool-adapter";
import {
  resumeAnalysisAgentInstructions,
  resumeJobProfilingAgentInstructions,
  resumeTailoringAgentInstructions,
  resumesAgentInstructions,
} from "./instructions";

export function createResumesAgent(resumeService: ResumeService, authorizationHeader: string): LlmAgent {
  return new LlmAgent({
    name: "resumes_agent",
    description: "Specialist agent for resume retrieval, tailoring, and structured resume analysis.",
    model: env.GOOGLE_GENAI_RESUME_MODEL,
    instruction: resumesAgentInstructions,
    tools: toAdkFunctionTools(buildResumeAgentTools(resumeService, authorizationHeader)),
  });
}

export function createResumeAnalysisAgent(): LlmAgent {
  return new LlmAgent({
    name: "resume_analysis_agent",
    description: "Analyzes a resume payload and returns grounded structured audit output.",
    model: env.GOOGLE_GENAI_RESUME_MODEL,
    instruction: resumeAnalysisAgentInstructions,
    outputSchema: resumeAnalysisOutputSchema,
    outputKey: "resume_analysis_output",
    generateContentConfig: {
      temperature: 0.1,
    },
  });
}

export function createResumeJobProfileAgent(): LlmAgent {
  return new LlmAgent({
    name: "resume_job_profile_agent",
    description: "Extracts the real hiring signals, priorities, and phrasing targets from a job posting.",
    model: env.GOOGLE_GENAI_RESUME_MODEL,
    instruction: resumeJobProfilingAgentInstructions,
    outputSchema: resumeJobProfileOutputSchema,
    outputKey: "resume_job_profile_output",
    generateContentConfig: {
      temperature: 0.1,
    },
  });
}

export function createResumeTailoringAgent(): LlmAgent {
  return new LlmAgent({
    name: "resume_tailoring_agent",
    description: "Produces a tailored but truthful resume version aligned to a target job.",
    model: env.GOOGLE_GENAI_RESUME_MODEL,
    instruction: resumeTailoringAgentInstructions,
    outputSchema: resumeTailoringOutputSchema,
    outputKey: "resume_tailoring_output",
    generateContentConfig: {
      temperature: 0.1,
    },
  });
}

export function createResumeAnalysisRunner(): InMemoryRunner {
  return new InMemoryRunner({
    appName: env.GOOGLE_ADK_APP_NAME,
    agent: createResumeAnalysisAgent(),
  });
}

export function createResumeJobProfileRunner(): InMemoryRunner {
  return new InMemoryRunner({
    appName: env.GOOGLE_ADK_APP_NAME,
    agent: createResumeJobProfileAgent(),
  });
}

export function createResumeTailoringRunner(): InMemoryRunner {
  return new InMemoryRunner({
    appName: env.GOOGLE_ADK_APP_NAME,
    agent: createResumeTailoringAgent(),
  });
}
