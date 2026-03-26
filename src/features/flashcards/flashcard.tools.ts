import { z } from "zod";

import type { ToolDefinition } from "../../shared/types/tool-definition";
import { FlashcardService } from "./flashcard.service";
import { generateFlashcardsFromNoteInputSchema } from "./flashcard.dto";

const getDummyFlashcardsInputSchema = z.object({
  noteSqid: z.string().trim().min(1).optional(),
});

const generateFlashcardsFromNoteToolInputSchema = generateFlashcardsFromNoteInputSchema.extend({
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
          },
          parsedInput.authorizationHeader,
        );
      }
    }];
}
