import { InMemoryRunner, LlmAgent } from "@google/adk";

import { env } from "../../config/env";
import { studyFocusChatOutputSchema } from "../../features/study-buddy/study-buddy.dto";
import { toGeminiServingSchema } from "../../shared/ai/gemini-serving-schema";
import { studyBuddyAgentInstructions } from "./instructions";

export function createStudyBuddyRunner(): InMemoryRunner {
  return new InMemoryRunner({
    appName: env.GOOGLE_ADK_APP_NAME,
    agent: new LlmAgent({
      name: "study_buddy_agent",
      description: "Constrained EducAIte study buddy for study planning, weak-topic review, flashcards, quizzes, and progress summaries.",
      model: env.GOOGLE_GENAI_MODEL,
      instruction: studyBuddyAgentInstructions,
      outputSchema: toGeminiServingSchema(studyFocusChatOutputSchema),
      outputKey: "study_focus_chat_output",
      generateContentConfig: {
        temperature: 0.1,
      },
    }),
  });
}
