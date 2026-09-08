CREATE TABLE "financial_document_identity_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"compared_document_id" uuid NOT NULL,
	"classification" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"canonical_document_id" uuid,
	"reviewed_by" uuid NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_document_parse_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"financial_document_id" uuid NOT NULL,
	"document_type" text NOT NULL,
	"parser_version" text NOT NULL,
	"status" text DEFAULT 'CURRENT' NOT NULL,
	"extraction_status" text,
	"source_record_type" text,
	"source_record_id" uuid,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_document_type_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"financial_document_id" uuid NOT NULL,
	"original_document_type" text NOT NULL,
	"corrected_document_type" text NOT NULL,
	"reason" text NOT NULL,
	"detection_evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"requested_by" uuid NOT NULL,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone,
	"status" text DEFAULT 'READY_FOR_REVIEW' NOT NULL,
	"idempotency_key" text
);
--> statement-breakpoint
CREATE TABLE "financial_document_type_detections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"financial_document_id" uuid NOT NULL,
	"selected_document_type" text NOT NULL,
	"detected_document_type" text NOT NULL,
	"confidence" text NOT NULL,
	"signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"conflicts_with_selected_type" boolean DEFAULT false NOT NULL,
	"detection_version" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "financial_documents" ADD COLUMN "original_document_type" text;--> statement-breakpoint
ALTER TABLE "financial_documents" ADD COLUMN "detected_document_type" text;--> statement-breakpoint
ALTER TABLE "financial_documents" ADD COLUMN "detection_confidence" text;--> statement-breakpoint
ALTER TABLE "financial_documents" ADD COLUMN "detection_signals" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_documents" ADD COLUMN "detection_version" text;--> statement-breakpoint
ALTER TABLE "financial_documents" ADD COLUMN "type_mismatch_status" text DEFAULT 'NONE' NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_documents" ADD COLUMN "canonical_document_id" uuid;--> statement-breakpoint
ALTER TABLE "financial_documents" ADD COLUMN "duplicate_of_document_id" uuid;--> statement-breakpoint
ALTER TABLE "financial_documents" ADD COLUMN "supersedes_document_id" uuid;--> statement-breakpoint
ALTER TABLE "financial_documents" ADD COLUMN "superseded_by_document_id" uuid;--> statement-breakpoint
ALTER TABLE "financial_documents" ADD COLUMN "version_label" text;--> statement-breakpoint
ALTER TABLE "financial_documents" ADD COLUMN "identity_status" text DEFAULT 'UNREVIEWED' NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_document_identity_reviews" ADD CONSTRAINT "financial_document_identity_reviews_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_document_identity_reviews" ADD CONSTRAINT "financial_document_identity_reviews_document_id_financial_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."financial_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_document_identity_reviews" ADD CONSTRAINT "financial_document_identity_reviews_compared_document_id_financial_documents_id_fk" FOREIGN KEY ("compared_document_id") REFERENCES "public"."financial_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_document_identity_reviews" ADD CONSTRAINT "financial_document_identity_reviews_reviewed_by_capital_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_document_parse_generations" ADD CONSTRAINT "financial_document_parse_generations_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_document_parse_generations" ADD CONSTRAINT "financial_document_parse_generations_financial_document_id_financial_documents_id_fk" FOREIGN KEY ("financial_document_id") REFERENCES "public"."financial_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_document_parse_generations" ADD CONSTRAINT "financial_document_parse_generations_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_document_type_corrections" ADD CONSTRAINT "financial_document_type_corrections_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_document_type_corrections" ADD CONSTRAINT "financial_document_type_corrections_financial_document_id_financial_documents_id_fk" FOREIGN KEY ("financial_document_id") REFERENCES "public"."financial_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_document_type_corrections" ADD CONSTRAINT "financial_document_type_corrections_requested_by_capital_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_document_type_corrections" ADD CONSTRAINT "financial_document_type_corrections_approved_by_capital_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_document_type_detections" ADD CONSTRAINT "financial_document_type_detections_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_document_type_detections" ADD CONSTRAINT "financial_document_type_detections_financial_document_id_financial_documents_id_fk" FOREIGN KEY ("financial_document_id") REFERENCES "public"."financial_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_document_type_detections" ADD CONSTRAINT "financial_document_type_detections_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "financial_document_identity_reviews_pair_unique" ON "financial_document_identity_reviews" USING btree ("household_id","document_id","compared_document_id");--> statement-breakpoint
CREATE INDEX "financial_document_parse_generations_household_document_idx" ON "financial_document_parse_generations" USING btree ("household_id","financial_document_id");--> statement-breakpoint
CREATE INDEX "financial_document_parse_generations_current_idx" ON "financial_document_parse_generations" USING btree ("household_id","status");--> statement-breakpoint
CREATE INDEX "financial_document_type_corrections_household_document_idx" ON "financial_document_type_corrections" USING btree ("household_id","financial_document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_document_type_corrections_idempotency_unique" ON "financial_document_type_corrections" USING btree ("household_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "financial_document_type_detections_household_document_idx" ON "financial_document_type_detections" USING btree ("household_id","financial_document_id");