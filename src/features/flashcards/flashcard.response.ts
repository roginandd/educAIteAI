import { z } from "zod";

export const flashcardApiResponseSchema = z.object({
  sqid: z.string().trim().min(1),
  question: z.string().trim().min(1),
  answer: z.string().trim().min(1),
  noteSqid: z.string().trim().min(1),
  documentSqid: z.string().trim().min(1),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const generateFlashcardsFromNoteResponseSchema = z.object({
  noteSqid: z.string().trim().min(1),
  generatedCount: z.number().int().min(1),
  flashcards: z.array(flashcardApiResponseSchema),
});

export type FlashcardApiResponse = z.output<typeof flashcardApiResponseSchema>;
export type GenerateFlashcardsFromNoteResponse = z.output<typeof generateFlashcardsFromNoteResponseSchema>;
