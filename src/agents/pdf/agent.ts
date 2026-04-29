import { InMemoryRunner, LlmAgent } from "@google/adk";

import { env } from "../../config/env";
import { pdfExtractionOutputSchema } from "../../shared/pdf/pdf-extraction.dto";
import { pdfExtractionAgentInstructions } from "./instructions";

export function createPdfExtractionAgent(): LlmAgent {
  return new LlmAgent({
    name: "pdf_extraction_agent",
    description: "Extracts faithful Markdown text from a single PDF document.",
    model: env.GOOGLE_GENAI_NOTE_PDF_MODEL,
    instruction: pdfExtractionAgentInstructions,
    outputSchema: pdfExtractionOutputSchema,
    outputKey: "pdf_extraction_output",
    generateContentConfig: {
      temperature: 0,
    },
  });
}

export function createPdfExtractionRunner(): InMemoryRunner {
  return new InMemoryRunner({
    appName: env.GOOGLE_ADK_APP_NAME,
    agent: createPdfExtractionAgent(),
  });
}
