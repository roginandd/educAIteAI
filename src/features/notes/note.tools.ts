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
    description: "Fetches a persisted document, reuses an existing generated note for the same artifact when available, otherwise generates and persists a new note.",
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

export function buildNoteAgentTools(noteService: NoteService, authorizationHeader: string): ToolDefinition[] {
  return [{
    name: "generate_note_from_document",
    description: "Fetches a persisted document, reuses an existing generated note for the same artifact when available, otherwise generates and persists a new note.",
    inputSchema: generateNoteFromDocumentInputSchema,
    async execute(input) {
      const parsedInput = generateNoteFromDocumentInputSchema.parse(input);
      return noteService.generateFromDocument(parsedInput, authorizationHeader);
    },
  }, {
    name: "summarize_note",
    description: "Fetches a persisted note, generates a preview summary, and returns it without persisting any changes.",
    inputSchema: summarizeNoteInputSchema,
    async execute(input) {
      const parsedInput = summarizeNoteInputSchema.parse(input);
      return noteService.summarizeNote(parsedInput, authorizationHeader);
    },
  }];
}
