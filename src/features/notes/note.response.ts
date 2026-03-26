import { z } from "zod";

import { noteApiResponseSchema } from "./note.dto";

export const documentApiResponseSchema = z.object({
  sqid: z.string().trim().min(1),
  documentName: z.string().trim().min(1),
  folderSqid: z.string().trim().min(1),
  fileMetadataSqid: z.string().trim().min(1),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const signedUrlResponseSchema = z.object({
  url: z.string().trim().url(),
});

export const generateNoteFromDocumentResponseSchema = z.object({
  documentSqid: z.string().trim().min(1),
  source: z.literal("generated"),
  note: noteApiResponseSchema,
});

export const summarizeNoteResponseSchema = z.object({
  noteSqid: z.string().trim().min(1),
  originalContent: z.string().trim().min(1),
  summarizedContent: z.string().trim().min(1),
  model: z.string().trim().min(1),
  generatedAt: z.string().datetime(),
});

export type DocumentApiResponse = z.output<typeof documentApiResponseSchema>;
export type SignedUrlResponse = z.output<typeof signedUrlResponseSchema>;
export type GenerateNoteFromDocumentResponse = z.output<typeof generateNoteFromDocumentResponseSchema>;
export type SummarizeNoteResponse = z.output<typeof summarizeNoteResponseSchema>;
