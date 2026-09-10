CREATE TABLE "reviewed_sec_filing_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"ticker" text NOT NULL,
	"canonical_content" jsonb NOT NULL,
	"canonical_sha256" text NOT NULL,
	"provenance" jsonb NOT NULL,
	"approved_by" uuid NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_only" boolean DEFAULT true NOT NULL,
	"trading_enabled" boolean DEFAULT false NOT NULL,
	"execution_authority" text DEFAULT 'none' NOT NULL,
	CONSTRAINT "reviewed_sec_filing_evidence_authority_check" CHECK ("reviewed_sec_filing_evidence"."read_only" = true and "reviewed_sec_filing_evidence"."trading_enabled" = false and "reviewed_sec_filing_evidence"."execution_authority" = 'none')
);
--> statement-breakpoint
CREATE TABLE "sec_filing_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"ticker" text NOT NULL,
	"filing_form" text NOT NULL,
	"filing_date" text NOT NULL,
	"accession" text NOT NULL,
	"source_url" text NOT NULL,
	"content" jsonb NOT NULL,
	"provenance" jsonb NOT NULL,
	"missing_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_quality" text NOT NULL,
	"extraction_timestamp" timestamp with time zone NOT NULL,
	"review_status" text DEFAULT 'PENDING_HUMAN_REVIEW' NOT NULL,
	"created_by" uuid NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sec_filing_snapshots_review_check" CHECK ("sec_filing_snapshots"."review_status" in ('PENDING_HUMAN_REVIEW','APPROVED','REJECTED')),
	CONSTRAINT "sec_filing_snapshots_quality_check" CHECK ("sec_filing_snapshots"."evidence_quality" in ('HIGH','MEDIUM','LOW'))
);
--> statement-breakpoint
ALTER TABLE "reviewed_sec_filing_evidence" ADD CONSTRAINT "reviewed_sec_filing_evidence_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewed_sec_filing_evidence" ADD CONSTRAINT "reviewed_sec_filing_evidence_snapshot_id_sec_filing_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."sec_filing_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewed_sec_filing_evidence" ADD CONSTRAINT "reviewed_sec_filing_evidence_approved_by_capital_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sec_filing_snapshots" ADD CONSTRAINT "sec_filing_snapshots_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sec_filing_snapshots" ADD CONSTRAINT "sec_filing_snapshots_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sec_filing_snapshots" ADD CONSTRAINT "sec_filing_snapshots_reviewed_by_capital_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reviewed_sec_filing_evidence_snapshot_unique" ON "reviewed_sec_filing_evidence" USING btree ("snapshot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reviewed_sec_filing_evidence_household_digest_unique" ON "reviewed_sec_filing_evidence" USING btree ("household_id","canonical_sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "sec_filing_snapshots_household_accession_unique" ON "sec_filing_snapshots" USING btree ("household_id","accession");--> statement-breakpoint
CREATE INDEX "sec_filing_snapshots_household_created_idx" ON "sec_filing_snapshots" USING btree ("household_id","created_at");