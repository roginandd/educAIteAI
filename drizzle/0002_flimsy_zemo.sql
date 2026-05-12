CREATE TABLE "smart_quiz_generation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generation_job_sqid" varchar(128) NOT NULL,
	"requested_count" integer NOT NULL,
	"source_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"hydration_status" varchar(32) NOT NULL,
	"drafts_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"warnings_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"errors_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "smart_quiz_generation_jobs_sqid_unique" ON "smart_quiz_generation_jobs" USING btree ("generation_job_sqid");--> statement-breakpoint
CREATE INDEX "smart_quiz_generation_jobs_hydration_status_idx" ON "smart_quiz_generation_jobs" USING btree ("hydration_status");