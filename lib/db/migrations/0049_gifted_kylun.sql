CREATE TABLE "investment_research_dossiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"ticker" text NOT NULL,
	"title" text NOT NULL,
	"evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"digestion" jsonb,
	"report" jsonb,
	"review_status" text DEFAULT 'PENDING_HUMAN_REVIEW' NOT NULL,
	"advisory_only" boolean DEFAULT true NOT NULL,
	"execution_authority" text DEFAULT 'none' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "investment_research_dossiers_advisory_only_check" CHECK ("investment_research_dossiers"."advisory_only" = true),
	CONSTRAINT "investment_research_dossiers_execution_authority_check" CHECK ("investment_research_dossiers"."execution_authority" = 'none')
);
--> statement-breakpoint
CREATE TABLE "research_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"financial_document_id" uuid,
	"title" text NOT NULL,
	"provenance_class" text NOT NULL,
	"review_status" text DEFAULT 'PENDING_HUMAN_REVIEW' NOT NULL,
	"mime_type" text NOT NULL,
	"object_path" text NOT NULL,
	"byte_length" integer NOT NULL,
	"sha256" text NOT NULL,
	"extracted_text" text,
	"extraction_status" text DEFAULT 'needs_review' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_evidence_provenance_check" CHECK ("research_evidence"."provenance_class" in ('UPLOADED_LICENSED_RESEARCH','PRIMARY_SOURCE')),
	CONSTRAINT "research_evidence_review_check" CHECK ("research_evidence"."review_status" in ('PENDING_HUMAN_REVIEW','REVIEWED','REJECTED')),
	CONSTRAINT "research_evidence_extraction_check" CHECK ("research_evidence"."extraction_status" in ('needs_review','needs_review_unsupported_pdf','complete','failed','failed_timeout','failed_output_bound')),
	CONSTRAINT "research_evidence_byte_length_check" CHECK ("research_evidence"."byte_length" > 0 and "research_evidence"."byte_length" <= 10485760)
);
--> statement-breakpoint
ALTER TABLE "investment_research_dossiers" ADD CONSTRAINT "investment_research_dossiers_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_research_dossiers" ADD CONSTRAINT "investment_research_dossiers_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_evidence" ADD CONSTRAINT "research_evidence_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_evidence" ADD CONSTRAINT "research_evidence_uploaded_by_capital_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_evidence" ADD CONSTRAINT "research_evidence_reviewed_by_capital_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "investment_research_dossiers_household_created_idx" ON "investment_research_dossiers" USING btree ("household_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "research_evidence_household_sha256_unique" ON "research_evidence" USING btree ("household_id","sha256");--> statement-breakpoint
CREATE INDEX "research_evidence_household_created_idx" ON "research_evidence" USING btree ("household_id","created_at");