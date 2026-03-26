import { z } from "zod";

export const noteApiResponseSchema = z.object({
  sqid: z.string().trim().min(1),
  name: z.string().trim().min(1),
  noteContent: z.string().trim().min(1),
  documentSqid: z.string().trim().min(1),
  sequenceNumber: z.number().int(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const noteGenerationOutputSchema = z.object({
  name: z.string().trim().min(1),
  noteContent: z.string().trim().min(1),
});

export const summarizeNoteStyleSchema = z.enum(["concise", "default", "detailed"]);

export const summarizeNoteOutputSchema = z.object({
  summarizedContent: z.string().trim().min(1),
});

export const generateNoteFromDocumentParamsSchema = z.object({
  documentSqid: z.string().trim().min(1),
});

export const generateNoteFromDocumentBodySchema = z.object({
  expiresInMinutes: z.coerce.number().int().min(1).max(1440).default(60),
});

export const generateNoteFromDocumentInputSchema = z.object({
  documentSqid: z.string().trim().min(1),
  expiresInMinutes: z.coerce.number().int().min(1).max(1440).default(60),
});

export const summarizeNoteParamsSchema = z.object({
  noteSqid: z.string().trim().min(1),
});

export const summarizeNoteBodySchema = z.object({
  style: summarizeNoteStyleSchema.optional(),
});

export const summarizeNoteInputSchema = z.object({
  noteSqid: z.string().trim().min(1),
  style: summarizeNoteStyleSchema.optional(),
});

export const createNoteRequestSchema = z.object({
  name: z.string().trim().min(1),
  noteContent: z.string().trim().min(1),
  documentSqid: z.string().trim().min(1),
});

export type NoteApiResponse = z.output<typeof noteApiResponseSchema>;
export type NoteGenerationOutput = z.output<typeof noteGenerationOutputSchema>;
export type SummarizeNoteStyle = z.output<typeof summarizeNoteStyleSchema>;
export type SummarizeNoteOutput = z.output<typeof summarizeNoteOutputSchema>;
export type GenerateNoteFromDocumentParams = z.output<typeof generateNoteFromDocumentParamsSchema>;
export type GenerateNoteFromDocumentBody = z.output<typeof generateNoteFromDocumentBodySchema>;
export type GenerateNoteFromDocumentInput = z.output<typeof generateNoteFromDocumentInputSchema>;
export type SummarizeNoteParams = z.output<typeof summarizeNoteParamsSchema>;
export type SummarizeNoteBody = z.output<typeof summarizeNoteBodySchema>;
export type SummarizeNoteInput = z.output<typeof summarizeNoteInputSchema>;
export type CreateNoteRequest = z.output<typeof createNoteRequestSchema>;
