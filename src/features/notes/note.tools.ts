import { z } from "zod";

import type { ToolDefinition } from "../../shared/types/tool-definition";
import { generateNoteFromDocumentInputSchema } from "./note.dto";
import { NoteService } from "./note.service";

const generateNoteFromDocumentToolInputSchema = generateNoteFromDocumentInputSchema.extend({
  authorizationHeader: z.string().trim().min(1),
});

export function buildNoteTools(noteService: NoteService): ToolDefinition[] {
  return [{
    name: "generate_note_from_document",
    description: "Fetches a persisted document, generates a note from its PDF, and persists the note through the EducAIte API.",
    inputSchema: generateNoteFromDocumentToolInputSchema,
    async execute(input) {
      const parsedInput = generateNoteFromDocumentToolInputSchema.parse(input);
      return noteService.generateFromDocument(
        {
          documentSqid: parsedInput.documentSqid,
          expiresInMinutes: parsedInput.expiresInMinutes,
        },
        parsedInput.authorizationHeader,
      );
    },
  }];
}
