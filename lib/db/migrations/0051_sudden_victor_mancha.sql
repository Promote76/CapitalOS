CREATE TABLE "reviewed_research_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"ticker" text NOT NULL,
	"canonical_content" jsonb NOT NULL,
	"canonical_sha256" text NOT NULL,
	"provenance" jsonb NOT NULL,
	"read_only" boolean DEFAULT true NOT NULL,
	"trading_enabled" boolean DEFAULT false NOT NULL,
	"execution_authority" text DEFAULT 'none' NOT NULL,
	"non_authoritative" boolean DEFAULT false NOT NULL,
	"approved_by" uuid NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviewed_research_evidence_authority_check" CHECK ("reviewed_research_evidence"."read_only" = true and "reviewed_research_evidence"."trading_enabled" = false and "reviewed_research_evidence"."execution_authority" = 'none' and "reviewed_research_evidence"."non_authoritative" = false)
);
--> statement-breakpoint
CREATE TABLE "schwab_market_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"ticker" text NOT NULL,
	"content" jsonb NOT NULL,
	"provenance" jsonb NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	"provider_as_of" timestamp with time zone,
	"market_date" text,
	"realtime" boolean,
	"delayed" boolean,
	"freshness" text NOT NULL,
	"missing_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"quality_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"review_status" text DEFAULT 'PENDING_HUMAN_REVIEW' NOT NULL,
	"created_by" uuid NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schwab_market_snapshots_review_check" CHECK ("schwab_market_snapshots"."review_status" in ('PENDING_HUMAN_REVIEW','APPROVED','REJECTED'))
);
--> statement-breakpoint
ALTER TABLE "reviewed_research_evidence" ADD CONSTRAINT "reviewed_research_evidence_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewed_research_evidence" ADD CONSTRAINT "reviewed_research_evidence_snapshot_id_schwab_market_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."schwab_market_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewed_research_evidence" ADD CONSTRAINT "reviewed_research_evidence_approved_by_capital_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schwab_market_snapshots" ADD CONSTRAINT "schwab_market_snapshots_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schwab_market_snapshots" ADD CONSTRAINT "schwab_market_snapshots_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schwab_market_snapshots" ADD CONSTRAINT "schwab_market_snapshots_reviewed_by_capital_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reviewed_research_evidence_snapshot_unique" ON "reviewed_research_evidence" USING btree ("snapshot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reviewed_research_evidence_household_digest_unique" ON "reviewed_research_evidence" USING btree ("household_id","canonical_sha256");--> statement-breakpoint
CREATE INDEX "reviewed_research_evidence_household_created_idx" ON "reviewed_research_evidence" USING btree ("household_id","created_at");--> statement-breakpoint
CREATE INDEX "schwab_market_snapshots_household_created_idx" ON "schwab_market_snapshots" USING btree ("household_id","created_at");