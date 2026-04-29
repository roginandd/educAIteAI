import { and, eq } from "drizzle-orm";

import { db } from "../../infrastructure/database/client";
import { generatedNoteArtifactsTable } from "../../infrastructure/database/schema";

interface UpsertGeneratedNoteArtifactInput {
  documentSqid: string;
  noteSqid: string;
  fileMetadataSqid: string;
  artifactVersionToken: string;
}

export interface GeneratedNoteArtifactRecord {
  id: string;
  documentSqid: string;
  noteSqid: string;
  fileMetadataSqid: string;
  artifactVersionToken: string;
  createdAt: Date;
  updatedAt: Date;
}

export class GeneratedNoteArtifactRepository {
  async findByDocumentVersion(
    documentSqid: string,
    artifactVersionToken: string,
  ): Promise<GeneratedNoteArtifactRecord | null> {
    const [row] = await db.select()
      .from(generatedNoteArtifactsTable)
      .where(and(
        eq(generatedNoteArtifactsTable.documentSqid, documentSqid),
        eq(generatedNoteArtifactsTable.artifactVersionToken, artifactVersionToken),
      ))
      .limit(1);

    return row ?? null;
  }

  async upsert(input: UpsertGeneratedNoteArtifactInput): Promise<GeneratedNoteArtifactRecord> {
    const [row] = await db.insert(generatedNoteArtifactsTable)
      .values({
        documentSqid: input.documentSqid,
        noteSqid: input.noteSqid,
        fileMetadataSqid: input.fileMetadataSqid,
        artifactVersionToken: input.artifactVersionToken,
      })
      .onConflictDoUpdate({
        target: [generatedNoteArtifactsTable.documentSqid, generatedNoteArtifactsTable.artifactVersionToken],
        set: {
          noteSqid: input.noteSqid,
          fileMetadataSqid: input.fileMetadataSqid,
          updatedAt: new Date(),
        },
      })
      .returning();

    return row;
  }

  async deleteById(id: string): Promise<void> {
    await db.delete(generatedNoteArtifactsTable)
      .where(eq(generatedNoteArtifactsTable.id, id));
  }
}
