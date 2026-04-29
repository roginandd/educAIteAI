CREATE TABLE "pdf_extractions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" varchar(32) NOT NULL,
	"source_sqid" varchar(128) NOT NULL,
	"file_metadata_sqid" varchar(128) NOT NULL,
	"version_token" varchar(255) NOT NULL,
	"content_format" varchar(32) DEFAULT 'markdown' NOT NULL,
	"extracted_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "pdf_extractions_source_unique" ON "pdf_extractions" USING btree ("source_type","source_sqid");--> statement-breakpoint
CREATE INDEX "pdf_extractions_file_metadata_idx" ON "pdf_extractions" USING btree ("source_type","file_metadata_sqid");