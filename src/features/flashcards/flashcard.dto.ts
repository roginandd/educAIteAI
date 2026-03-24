import { z } from "zod";

export const createBulkFlashcardItemSchema = z.object({
  question: z.string().trim().min(1).max(1000),
  answer: z.string().trim().min(1).max(2000),
});

export const createBulkFlashcardsRequestSchema = z.object({
  notesqid: z.string().trim().min(1),
  flashcards: z.array(createBulkFlashcardItemSchema).min(1),
});

export const noteApiResponseSchema = z.object({
  sqid: z.string().trim().min(1),
  name: z.string().trim().min(1),
  noteContent: z.string().trim().min(1),
  documentSqid: z.string().trim().min(1),
  sequenceNumber: z.number(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const generateFlashcardsFromNoteInputSchema = z.object({
  noteSqid: z.string().trim().min(1),
  flashcardCount: z.coerce.number().int().min(1).max(10).default(5),
});

export const generateFlashcardsFromNoteParamsSchema = z.object({
  noteSqid: z.string().trim().min(1),
});

export const generateFlashcardsFromNoteBodySchema = z.object({
  flashcardCount: z.coerce.number().int().min(1).max(10).default(5),
});

export const flashcardGenerationOutputSchema = z.object({
  flashcards: z.array(createBulkFlashcardItemSchema).min(1).max(10),
});

export type CreateBulkFlashcardItem = z.output<typeof createBulkFlashcardItemSchema>;
export type CreateBulkFlashcardsRequest = z.output<typeof createBulkFlashcardsRequestSchema>;
export type NoteApiResponse = z.output<typeof noteApiResponseSchema>;
export type GenerateFlashcardsFromNoteInput = z.output<typeof generateFlashcardsFromNoteInputSchema>;
export type GenerateFlashcardsFromNoteParams = z.output<typeof generateFlashcardsFromNoteParamsSchema>;
export type GenerateFlashcardsFromNoteBody = z.output<typeof generateFlashcardsFromNoteBodySchema>;
export type FlashcardGenerationOutput = z.output<typeof flashcardGenerationOutputSchema>;
