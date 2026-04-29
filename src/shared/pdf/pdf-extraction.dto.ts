import { z } from "zod";

export const pdfSourceTypeSchema = z.enum(["document", "studyload"]);

export const pdfExtractionOutputSchema = z.object({
  extractedText: z.string().trim().min(1),
});

export const pdfExtractionArtifactSchema = z.object({
  id: z.string().uuid(),
  sourceType: pdfSourceTypeSchema,
  sourceSqid: z.string().trim().min(1),
  fileMetadataSqid: z.string().trim().min(1),
  versionToken: z.string().trim().min(1),
  contentFormat: z.literal("markdown"),
  extractedText: z.string().trim().min(1),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const pdfSourceRefSchema = z.object({
  sourceType: pdfSourceTypeSchema,
  sourceSqid: z.string().trim().min(1),
  fileMetadataSqid: z.string().trim().min(1),
  versionToken: z.string().trim().min(1),
  signedUrl: z.string().trim().url(),
  displayName: z.string().trim().min(1).optional(),
});

export type PdfSourceType = z.output<typeof pdfSourceTypeSchema>;
export type PdfExtractionOutput = z.output<typeof pdfExtractionOutputSchema>;
export type PdfExtractionArtifact = z.output<typeof pdfExtractionArtifactSchema>;
export type PdfSourceRef = z.output<typeof pdfSourceRefSchema>;
