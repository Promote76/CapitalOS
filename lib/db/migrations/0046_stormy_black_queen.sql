CREATE TABLE "family_office_research_digestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"canonical_payload" text NOT NULL,
	"fingerprint" text NOT NULL,
	"original_payload" text NOT NULL,
	"original_fingerprint" text NOT NULL,
	"canonical_fingerprint" text NOT NULL,
	"ticker" text NOT NULL,
	"company" text NOT NULL,
	"source_metadata" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_claims" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"inferences" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"advisory_only" boolean DEFAULT true NOT NULL,
	"verified_financial_authority" boolean DEFAULT false NOT NULL,
	CONSTRAINT "family_office_research_digestions_advisory_only_check" CHECK ("family_office_research_digestions"."advisory_only" = true),
	CONSTRAINT "family_office_research_digestions_verified_authority_check" CHECK ("family_office_research_digestions"."verified_financial_authority" = false)
);
--> statement-breakpoint
ALTER TABLE "family_office_proposals" ADD COLUMN "digestion_summary" jsonb;--> statement-breakpoint
ALTER TABLE "family_office_research_digestions" ADD CONSTRAINT "family_office_research_digestions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_office_research_digestions" ADD CONSTRAINT "family_office_research_digestions_run_id_family_office_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."family_office_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_office_research_digestions" ADD CONSTRAINT "family_office_research_digestions_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "family_office_runs_id_household_unique" ON "family_office_runs" USING btree ("id","household_id");--> statement-breakpoint
ALTER TABLE "family_office_research_digestions" ADD CONSTRAINT "family_office_research_digestions_run_household_fk" FOREIGN KEY ("run_id","household_id") REFERENCES "public"."family_office_runs"("id","household_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "family_office_research_digestions_household_idx" ON "family_office_research_digestions" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "family_office_research_digestions_run_idx" ON "family_office_research_digestions" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "family_office_research_digestions_fingerprint_idx" ON "family_office_research_digestions" USING btree ("household_id","fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "family_office_research_digestions_run_unique" ON "family_office_research_digestions" USING btree ("run_id");--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_family_office_research_digestion_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'family office research digestions are immutable';
END;
$$;--> statement-breakpoint
CREATE TRIGGER family_office_research_digestions_immutable BEFORE UPDATE OR DELETE ON family_office_research_digestions FOR EACH ROW EXECUTE FUNCTION prevent_family_office_research_digestion_mutation();
