import { InMemoryRunner, LlmAgent } from "@google/adk";

import type { AppDependencies } from "../../bootstrap/dependencies";
import { env } from "../../config/env";
import { flashcardGenerationOutputSchema } from "../../features/flashcards/flashcard.dto";
import { buildFlashcardTools } from "../../features/flashcards/flashcard.tools";
import type { AgentDefinition } from "../../shared/types/agent-definition";
import { flashcardsAgentInstructions, flashcardsGenerationAgentInstructions } from "./instructions";

export function createFlashcardsAgent(dependencies: AppDependencies): AgentDefinition {
  return {
    name: "flashcards_agent",
    description: "Specialist agent for note-based flashcard generation workflows.",
    instructions: flashcardsAgentInstructions,
    tools: buildFlashcardTools(dependencies.flashcardService),
  };
}

export function createFlashcardsGenerationAgent(): LlmAgent {
  return new LlmAgent({
    name: "flashcards_generation_agent",
    description: "Generates grounded flashcards from a single note.",
    model: env.GOOGLE_GENAI_MODEL,
    instruction: flashcardsGenerationAgentInstructions,
    outputSchema: flashcardGenerationOutputSchema,
    outputKey: "flashcards_generation_output",
    generateContentConfig: {
      temperature: 0.2,
    },
  });
}

export function createFlashcardsGenerationRunner(): InMemoryRunner {
  return new InMemoryRunner({
    appName: env.GOOGLE_ADK_APP_NAME,
    agent: createFlashcardsGenerationAgent(),
  });
}
