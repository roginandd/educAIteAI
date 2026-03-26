import { InMemoryRunner, LlmAgent } from "@google/adk";

import type { AppDependencies } from "../../bootstrap/dependencies";
import { env } from "../../config/env";
import { noteGenerationOutputSchema, summarizeNoteOutputSchema } from "../../features/notes/note.dto";
import { buildNoteTools } from "../../features/notes/note.tools";
import type { AgentDefinition } from "../../shared/types/agent-definition";
import { noteGenerationAgentInstructions, notesAgentInstructions, noteSummarizationAgentInstructions } from "./instructions";

export function createNotesAgent(dependencies: AppDependencies): AgentDefinition {
  return {
    name: "notes_agent",
    description: "Specialist agent for document-to-note generation workflows.",
    instructions: notesAgentInstructions,
    tools: buildNoteTools(dependencies.noteService),
  };
}

export function createNoteGenerationAgent(): LlmAgent {
  return new LlmAgent({
    name: "note_generation_agent",
    description: "Generates a grounded study note from a single PDF document.",
    model: env.GOOGLE_GENAI_NOTE_PDF_MODEL,
    instruction: noteGenerationAgentInstructions,
    outputSchema: noteGenerationOutputSchema,
    outputKey: "note_generation_output",
    generateContentConfig: {
      temperature: 0.2,
    },
  });
}

export function createNotesGenerationRunner(): InMemoryRunner {
  return new InMemoryRunner({
    appName: env.GOOGLE_ADK_APP_NAME,
    agent: createNoteGenerationAgent(),
  });
}

export function createNoteSummarizationAgent(): LlmAgent {
  return new LlmAgent({
    name: "note_summarization_agent",
    description: "Generates a preview summary from a persisted note.",
    model: env.GOOGLE_GENAI_MODEL,
    instruction: noteSummarizationAgentInstructions,
    outputSchema: summarizeNoteOutputSchema,
    outputKey: "note_summarization_output",
    generateContentConfig: {
      temperature: 0.2,
    },
  });
}

export function createNotesSummarizationRunner(): InMemoryRunner {
  return new InMemoryRunner({
    appName: env.GOOGLE_ADK_APP_NAME,
    agent: createNoteSummarizationAgent(),
  });
}
