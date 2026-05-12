import { InMemoryRunner, LlmAgent } from "@google/adk";

import { env } from "../../config/env";
import {
  registrationStudyLoadPreviewOutputSchema,
  studyLoadCourseParsingOutputSchema,
} from "../../features/studyloads/studyload.dto";
import { buildStudyLoadAgentTools } from "../../features/studyloads/studyload.tools";
import { StudyLoadService } from "../../features/studyloads/studyload.service";
import { toGeminiServingSchema } from "../../shared/ai/gemini-serving-schema";
import { toAdkFunctionTools } from "../shared/adk-tool-adapter";
import { studyloadPdfParsingAgentInstructions, studyloadsAgentInstructions } from "./instructions";

export function createStudyloadsAgent(studyLoadService: StudyLoadService, authorizationHeader: string): LlmAgent {
  return new LlmAgent({
    name: "studyloads_agent",
    description: "Specialist agent for studyload PDF parsing and studyload-course synchronization workflows.",
    model: env.GOOGLE_GENAI_MODEL,
    instruction: studyloadsAgentInstructions,
    tools: toAdkFunctionTools(buildStudyLoadAgentTools(studyLoadService, authorizationHeader)),
  });
}

export function createStudyLoadParsingAgent(): LlmAgent {
  return new LlmAgent({
    name: "studyload_pdf_parsing_agent",
    description: "Parses a studyload PDF into normalized studyload metadata and course rows.",
    model: env.GOOGLE_GENAI_MODEL,
    instruction: studyloadPdfParsingAgentInstructions,
    outputSchema: toGeminiServingSchema(studyLoadCourseParsingOutputSchema),
    outputKey: "studyload_parsing_output",
    generateContentConfig: {
      temperature: 0,
    },
  });
}

export function createRegistrationStudyLoadPreviewAgent(): LlmAgent {
  return new LlmAgent({
    name: "studyload_registration_preview_agent",
    description: "Parses a registration studyload PDF into editable student suggestions and normalized course rows.",
    model: env.GOOGLE_GENAI_MODEL,
    instruction: studyloadPdfParsingAgentInstructions,
    outputSchema: toGeminiServingSchema(registrationStudyLoadPreviewOutputSchema),
    outputKey: "studyload_parsing_output",
    generateContentConfig: {
      temperature: 0,
    },
  });
}

export function createStudyLoadParsingRunner(): InMemoryRunner {
  return new InMemoryRunner({
    appName: env.GOOGLE_ADK_APP_NAME,
    agent: createStudyLoadParsingAgent(),
  });
}

export function createRegistrationStudyLoadPreviewRunner(): InMemoryRunner {
  return new InMemoryRunner({
    appName: env.GOOGLE_ADK_APP_NAME,
    agent: createRegistrationStudyLoadPreviewAgent(),
  });
}
