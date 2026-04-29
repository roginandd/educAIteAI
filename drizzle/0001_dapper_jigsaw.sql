CREATE TABLE "generated_note_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_sqid" varchar(128) NOT NULL,
	"note_sqid" varchar(128) NOT NULL,
	"file_metadata_sqid" varchar(128) NOT NULL,
	"artifact_version_token" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "generated_note_artifacts_document_version_unique" ON "generated_note_artifacts" USING btree ("document_sqid","artifact_version_token");--> statement-breakpoint
CREATE UNIQUE INDEX "generated_note_artifacts_note_sqid_unique" ON "generated_note_artifacts" USING btree ("note_sqid");