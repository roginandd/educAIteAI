import { index, integer, jsonb, pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const smartQuizGenerationJobsTable = pgTable("smart_quiz_generation_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  generationJobSqid: varchar("generation_job_sqid", { length: 128 }).notNull(),
  requestedCount: integer("requested_count").notNull(),
  sourceMetadata: jsonb("source_metadata").notNull().default({}),
  hydrationStatus: varchar("hydration_status", { length: 32 }).notNull(),
  draftsJson: jsonb("drafts_json").notNull().default([]),
  warningsJson: jsonb("warnings_json").notNull().default([]),
  errorsJson: jsonb("errors_json").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  generationJobSqidUniqueIndex: uniqueIndex("smart_quiz_generation_jobs_sqid_unique").on(table.generationJobSqid),
  hydrationStatusIndex: index("smart_quiz_generation_jobs_hydration_status_idx").on(table.hydrationStatus),
}));

export type SmartQuizGenerationJobRow = typeof smartQuizGenerationJobsTable.$inferSelect;
export type NewSmartQuizGenerationJobRow = typeof smartQuizGenerationJobsTable.$inferInsert;
