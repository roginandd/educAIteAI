import { index, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const pdfExtractionsTable = pgTable("pdf_extractions", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceType: varchar("source_type", { length: 32 }).notNull(),
  sourceSqid: varchar("source_sqid", { length: 128 }).notNull(),
  fileMetadataSqid: varchar("file_metadata_sqid", { length: 128 }).notNull(),
  versionToken: varchar("version_token", { length: 255 }).notNull(),
  contentFormat: varchar("content_format", { length: 32 }).notNull().default("markdown"),
  extractedText: text("extracted_text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  sourceUniqueIndex: uniqueIndex("pdf_extractions_source_unique").on(table.sourceType, table.sourceSqid),
  fileMetadataIndex: index("pdf_extractions_file_metadata_idx").on(table.sourceType, table.fileMetadataSqid),
}));

export type PdfExtractionRow = typeof pdfExtractionsTable.$inferSelect;
export type NewPdfExtractionRow = typeof pdfExtractionsTable.$inferInsert;
