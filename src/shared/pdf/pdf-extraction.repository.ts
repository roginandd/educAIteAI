import { and, eq } from "drizzle-orm";

import { db } from "../../infrastructure/database/client";
import { pdfExtractionsTable } from "../../infrastructure/database/schema";
import { pdfExtractionArtifactSchema, type PdfExtractionArtifact, type PdfSourceType } from "./pdf-extraction.dto";

interface UpsertPdfExtractionInput {
  sourceType: PdfSourceType;
  sourceSqid: string;
  fileMetadataSqid: string;
  versionToken: string;
  extractedText: string;
}

export class PdfExtractionRepository {
  async findBySource(sourceType: PdfSourceType, sourceSqid: string): Promise<PdfExtractionArtifact | null> {
    const [row] = await db.select()
      .from(pdfExtractionsTable)
      .where(and(
        eq(pdfExtractionsTable.sourceType, sourceType),
        eq(pdfExtractionsTable.sourceSqid, sourceSqid),
      ))
      .limit(1);

    return row ? pdfExtractionArtifactSchema.parse(row) : null;
  }

  async upsert(input: UpsertPdfExtractionInput): Promise<PdfExtractionArtifact> {
    const [row] = await db.insert(pdfExtractionsTable)
      .values({
        sourceType: input.sourceType,
        sourceSqid: input.sourceSqid,
        fileMetadataSqid: input.fileMetadataSqid,
        versionToken: input.versionToken,
        contentFormat: "markdown",
        extractedText: input.extractedText,
      })
      .onConflictDoUpdate({
        target: [pdfExtractionsTable.sourceType, pdfExtractionsTable.sourceSqid],
        set: {
          fileMetadataSqid: input.fileMetadataSqid,
          versionToken: input.versionToken,
          contentFormat: "markdown",
          extractedText: input.extractedText,
          updatedAt: new Date(),
        },
      })
      .returning();

    return pdfExtractionArtifactSchema.parse(row);
  }
}
