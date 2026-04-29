import { pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const generatedNoteArtifactsTable = pgTable("generated_note_artifacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentSqid: varchar("document_sqid", { length: 128 }).notNull(),
  noteSqid: varchar("note_sqid", { length: 128 }).notNull(),
  fileMetadataSqid: varchar("file_metadata_sqid", { length: 128 }).notNull(),
  artifactVersionToken: varchar("artifact_version_token", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  documentVersionUniqueIndex: uniqueIndex("generated_note_artifacts_document_version_unique").on(
    table.documentSqid,
    table.artifactVersionToken,
  ),
  noteSqidUniqueIndex: uniqueIndex("generated_note_artifacts_note_sqid_unique").on(table.noteSqid),
}));

export type GeneratedNoteArtifactRow = typeof generatedNoteArtifactsTable.$inferSelect;
