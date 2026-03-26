import { z } from "zod";

import type { ToolDefinition } from "../../shared/types/tool-definition";
import { generateNoteFromDocumentInputSchema, summarizeNoteInputSchema } from "./note.dto";
import { NoteService } from "./note.service";

const generateNoteFromDocumentToolInputSchema = generateNoteFromDocumentInputSchema.extend({
  authorizationHeader: z.string().trim().min(1),
});

const summarizeNoteToolInputSchema = summarizeNoteInputSchema.extend({
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
  }, {
    name: "summarize_note",
    description: "Fetches a persisted note, generates a preview summary, and returns it without persisting any changes.",
    inputSchema: summarizeNoteToolInputSchema,
    async execute(input) {
      const parsedInput = summarizeNoteToolInputSchema.parse(input);
      return noteService.summarizeNote(
        {
          noteSqid: parsedInput.noteSqid,
          style: parsedInput.style,
        },
        parsedInput.authorizationHeader,
      );
    },
  }];
}
