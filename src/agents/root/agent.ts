import { AgentTool, LlmAgent } from "@google/adk";

import { createNotesAgent } from "../notes/agent";
import { createResumesAgent } from "../resumes/agent";
import { env } from "../../config/env";
import { FlashcardService } from "../../features/flashcards/flashcard.service";
import { NoteService } from "../../features/notes/note.service";
import { ResumeService } from "../../features/resumes/resume.service";
import { StudyLoadService } from "../../features/studyloads/studyload.service";
import { buildHealthTool } from "../../tools/shared/health.tool";
import { createFlashcardsAgent } from "../flashcards/agent";
import { createStudyloadsAgent } from "../studyloads/agent";
import { toAdkFunctionTool } from "../shared/adk-tool-adapter";
import { rootAgentInstructions } from "./instructions";

export interface RootAgentDependencies {
  flashcardService: FlashcardService;
  noteService: NoteService;
  resumeService: ResumeService;
  studyLoadService: StudyLoadService;
}

export function createRootAgent(dependencies: RootAgentDependencies, authorizationHeader: string): LlmAgent {
  const flashcardsAgent = createFlashcardsAgent(dependencies.flashcardService, authorizationHeader);
  const notesAgent = createNotesAgent(dependencies.noteService, authorizationHeader);
  const resumesAgent = createResumesAgent(dependencies.resumeService, authorizationHeader);
  const studyloadsAgent = createStudyloadsAgent(dependencies.studyLoadService, authorizationHeader);

  return new LlmAgent({
    name: "root_agent",
    description: "Top-level coordinator for the backend agent system.",
    model: env.GOOGLE_GENAI_MODEL,
    instruction: rootAgentInstructions,
    tools: [
      toAdkFunctionTool(buildHealthTool()),
      new AgentTool({ agent: notesAgent }),
      new AgentTool({ agent: flashcardsAgent }),
      new AgentTool({ agent: resumesAgent }),
      new AgentTool({ agent: studyloadsAgent }),
    ],
  });
}
