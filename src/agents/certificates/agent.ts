import { InMemoryRunner, LlmAgent } from "@google/adk";

import { env } from "../../config/env";
import {
  certificateParsingAgentOutputSchema,
  certificateSuggestionAgentOutputSchema,
} from "../../features/certificates/certificate.dto";
import {
  certificateParsingAgentInstructions,
  certificateSuggestionAgentInstructions,
} from "./instructions";
import { toGeminiServingSchema } from "../../shared/ai/gemini-serving-schema";

export function createCertificateParsingAgent(): LlmAgent {
  return new LlmAgent({
    name: "certificate_parsing_agent",
    description: "Extracts certificate fields, confidence, OCR text, and quality signals from a certificate image or PDF.",
    model: env.GOOGLE_GENAI_RESUME_MODEL,
    instruction: certificateParsingAgentInstructions,
    outputSchema: toGeminiServingSchema(certificateParsingAgentOutputSchema),
    outputKey: "certificate_parsing_output",
    generateContentConfig: {
      temperature: 0,
    },
  });
}

export function createCertificateSuggestionAgent(): LlmAgent {
  return new LlmAgent({
    name: "certificate_suggestion_agent",
    description: "Ranks existing certificates against a target job and explains include/exclude recommendations.",
    model: env.GOOGLE_GENAI_RESUME_MODEL,
    instruction: certificateSuggestionAgentInstructions,
    outputSchema: toGeminiServingSchema(certificateSuggestionAgentOutputSchema),
    outputKey: "certificate_suggestion_output",
    generateContentConfig: {
      temperature: 0.1,
    },
  });
}

export function createCertificateParsingRunner(): InMemoryRunner {
  return new InMemoryRunner({
    appName: env.GOOGLE_ADK_APP_NAME,
    agent: createCertificateParsingAgent(),
  });
}

export function createCertificateSuggestionRunner(): InMemoryRunner {
  return new InMemoryRunner({
    appName: env.GOOGLE_ADK_APP_NAME,
    agent: createCertificateSuggestionAgent(),
  });
}
