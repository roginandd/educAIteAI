import { InMemoryRunner, LlmAgent } from "@google/adk";

import type { AppDependencies } from "../../bootstrap/dependencies";
import { env } from "../../config/env";
import { studyLoadCourseParsingOutputSchema } from "../../features/studyloads/studyload.dto";
import { buildStudyLoadTools } from "../../features/studyloads/studyload.tools";
import type { AgentDefinition } from "../../shared/types/agent-definition";
import { studyloadPdfParsingAgentInstructions, studyloadsAgentInstructions } from "./instructions";

export function createStudyloadsAgent(dependencies: AppDependencies): AgentDefinition {
  return {
    name: "studyloads_agent",
    description: "Specialist agent for studyload PDF parsing and studyload-course synchronization workflows.",
    instructions: studyloadsAgentInstructions,
    tools: buildStudyLoadTools(dependencies.studyLoadService),
  };
}

export function createStudyLoadParsingAgent(): LlmAgent {
  return new LlmAgent({
    name: "studyload_pdf_parsing_agent",
    description: "Parses a studyload PDF into normalized studyload metadata and course rows.",
    model: env.GOOGLE_GENAI_MODEL,
    instruction: studyloadPdfParsingAgentInstructions,
    outputSchema: studyLoadCourseParsingOutputSchema,
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
