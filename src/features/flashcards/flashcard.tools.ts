import { z } from "zod";

import type { ToolDefinition } from "../../shared/types/tool-definition";
import { FlashcardService } from "./flashcard.service";
import { generateFlashcardsFromNoteInputSchema, submitAndAnalyzeFlashcardInputSchema } from "./flashcard.dto";

const getDummyFlashcardsInputSchema = z.object({
  noteSqid: z.string().trim().min(1).optional(),
});

const generateFlashcardsFromNoteToolInputSchema = generateFlashcardsFromNoteInputSchema.extend({
  authorizationHeader: z.string().trim().min(1),
});

const submitAndAnalyzeFlashcardToolInputSchema = submitAndAnalyzeFlashcardInputSchema.extend({
  authorizationHeader: z.string().trim().min(1),
});

export function buildFlashcardTools(flashcardService: FlashcardService): ToolDefinition[] {
   return [{
      name: "generate_flashcards_from_note",
      description: "Fetches a note from the EducAIte API, generates flashcards, and persists them through the bulk flashcard endpoint.",
      inputSchema: generateFlashcardsFromNoteToolInputSchema,
      async execute(input) {
        const parsedInput = generateFlashcardsFromNoteToolInputSchema.parse(input);
        return flashcardService.generateFromNote(
          {
            noteSqid: parsedInput.noteSqid,
            flashcardCount: parsedInput.flashcardCount,
            itemTypes: parsedInput.itemTypes,
            learningDomain: parsedInput.learningDomain,
            cognitiveSkill: parsedInput.cognitiveSkill,
            technicalLanguage: parsedInput.technicalLanguage,
            programContext: parsedInput.programContext,
            noteTitle: parsedInput.noteTitle,
            noteContent: parsedInput.noteContent,
          },
          parsedInput.authorizationHeader,
        );
      }
    }, {
      name: "submit_and_analyze_flashcard_answer",
      description: "Fetches flashcard evaluation context, lets the AI semantically grade the answer, and persists one grounded evaluated-attempt plus analytics snapshot to the EducAIte API.",
      inputSchema: submitAndAnalyzeFlashcardToolInputSchema,
      async execute(input) {
        const parsedInput = submitAndAnalyzeFlashcardToolInputSchema.parse(input);
        return flashcardService.submitAndAnalyze(
          {
            flashcardSqid: parsedInput.flashcardSqid,
            answer: parsedInput.answer,
            responseTimeMs: parsedInput.responseTimeMs,
            itemType: parsedInput.itemType,
            question: parsedInput.question,
            expectedAnswer: parsedInput.expectedAnswer,
            conceptExplanation: parsedInput.conceptExplanation,
            answeringGuidance: parsedInput.answeringGuidance,
            acceptedAnswerAliases: parsedInput.acceptedAnswerAliases,
            cognitiveSkill: parsedInput.cognitiveSkill,
            learningDomain: parsedInput.learningDomain,
            technicalLanguage: parsedInput.technicalLanguage,
            rubricJson: parsedInput.rubricJson,
            validationConfigJson: parsedInput.validationConfigJson,
            language: parsedInput.language,
            runtimeVersion: parsedInput.runtimeVersion,
            starterCode: parsedInput.starterCode,
            studentCode: parsedInput.studentCode,
          },
          parsedInput.authorizationHeader,
        );
      },
    }];
}

export function buildFlashcardAgentTools(flashcardService: FlashcardService, authorizationHeader: string): ToolDefinition[] {
  return [{
    name: "generate_flashcards_from_note",
    description: "Fetches a note from the EducAIte API, generates flashcards, and persists them through the bulk flashcard endpoint.",
    inputSchema: generateFlashcardsFromNoteInputSchema,
    async execute(input) {
      const parsedInput = generateFlashcardsFromNoteInputSchema.parse(input);
      return flashcardService.generateFromNote(parsedInput, authorizationHeader);
    }
  }, {
    name: "submit_and_analyze_flashcard_answer",
    description: "Fetches flashcard evaluation context, lets the AI semantically grade the answer, and persists one grounded evaluated-attempt plus analytics snapshot to the EducAIte API.",
    inputSchema: submitAndAnalyzeFlashcardInputSchema,
    async execute(input) {
      const parsedInput = submitAndAnalyzeFlashcardInputSchema.parse(input);
      return flashcardService.submitAndAnalyze(parsedInput, authorizationHeader);
    },
  }];
}
