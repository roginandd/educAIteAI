import { InMemoryRunner, LlmAgent } from "@google/adk";

import { env } from "../../config/env";
import {
  flashcardEvaluationOutputSchema,
  flashcardGenerationOutputSchema,
  flashcardStudyCoachRecapOutputSchema,
  performanceSummaryAiOutputSchema,
} from "../../features/flashcards/flashcard.dto";
import { buildFlashcardAgentTools } from "../../features/flashcards/flashcard.tools";
import { FlashcardService } from "../../features/flashcards/flashcard.service";
import { toGeminiServingSchema } from "../../shared/ai/gemini-serving-schema";
import { toAdkFunctionTools } from "../shared/adk-tool-adapter";
import {
  flashcardAnalyticsGenerationAgentInstructions,
  flashcardStudyCoachRecapAgentInstructions,
  flashcardsAgentInstructions,
  flashcardsGenerationAgentInstructions,
  performanceSummaryGenerationAgentInstructions,
} from "./instructions";

export function createFlashcardsAgent(flashcardService: FlashcardService, authorizationHeader: string): LlmAgent {
  return new LlmAgent({
    name: "flashcards_agent",
    description: "Specialist agent for flashcard generation and flashcard analytics workflows.",
    model: env.GOOGLE_GENAI_MODEL,
    instruction: flashcardsAgentInstructions,
    tools: toAdkFunctionTools(buildFlashcardAgentTools(flashcardService, authorizationHeader)),
  });
}

export function createFlashcardsGenerationAgent(): LlmAgent {
  return new LlmAgent({
    name: "flashcards_generation_agent",
    description: "Generates grounded flashcards from a single note.",
    model: env.GOOGLE_GENAI_MODEL,
    instruction: flashcardsGenerationAgentInstructions,
    outputSchema: toGeminiServingSchema(flashcardGenerationOutputSchema),
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

export function createFlashcardAnalyticsAgent(): LlmAgent {
  return new LlmAgent({
    name: "flashcard_analytics_agent",
    description: "Evaluates one flashcard answer and returns a semantic verdict, analytics snapshot, and frontend review payload.",
    model: env.GOOGLE_GENAI_MODEL,
    instruction: flashcardAnalyticsGenerationAgentInstructions,
    outputSchema: toGeminiServingSchema(flashcardEvaluationOutputSchema),
    outputKey: "flashcard_evaluation_output",
    generateContentConfig: {
      temperature: 0.1,
    },
  });
}

export function createFlashcardAnalyticsRunner(): InMemoryRunner {
  return new InMemoryRunner({
    appName: env.GOOGLE_ADK_APP_NAME,
    agent: createFlashcardAnalyticsAgent(),
  });
}

export function createFlashcardStudyCoachRecapAgent(): LlmAgent {
  return new LlmAgent({
    name: "flashcard_study_coach_recap_agent",
    description: "Creates a concise AImpatin study coach recap for a completed flashcard session.",
    model: env.GOOGLE_GENAI_MODEL,
    instruction: flashcardStudyCoachRecapAgentInstructions,
    outputSchema: toGeminiServingSchema(flashcardStudyCoachRecapOutputSchema),
    outputKey: "flashcard_study_coach_recap_output",
    generateContentConfig: {
      temperature: 0.35,
    },
  });
}

export function createFlashcardStudyCoachRecapRunner(): InMemoryRunner {
  return new InMemoryRunner({
    appName: env.GOOGLE_ADK_APP_NAME,
    agent: createFlashcardStudyCoachRecapAgent(),
  });
}

export function createPerformanceSummaryAgent(): LlmAgent {
  return new LlmAgent({
    name: "performance_summary_agent",
    description: "Evaluates a persisted course or overall performance summary and returns AI insight text.",
    model: env.GOOGLE_GENAI_MODEL,
    instruction: performanceSummaryGenerationAgentInstructions,
    outputSchema: toGeminiServingSchema(performanceSummaryAiOutputSchema),
    outputKey: "performance_summary_output",
    generateContentConfig: {
      temperature: 0.1,
    },
  });
}

export function createPerformanceSummaryRunner(): InMemoryRunner {
  return new InMemoryRunner({
    appName: env.GOOGLE_ADK_APP_NAME,
    agent: createPerformanceSummaryAgent(),
  });
}
