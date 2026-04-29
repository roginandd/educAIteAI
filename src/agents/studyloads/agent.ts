import { InMemoryRunner, LlmAgent } from "@google/adk";

import { env } from "../../config/env";
import { studyLoadCourseParsingOutputSchema } from "../../features/studyloads/studyload.dto";
import { buildStudyLoadAgentTools } from "../../features/studyloads/studyload.tools";
import { StudyLoadService } from "../../features/studyloads/studyload.service";
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
