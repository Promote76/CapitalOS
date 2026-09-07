CREATE TABLE "family_office_refreshes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"trigger" text DEFAULT 'on_demand' NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"provider_status" text DEFAULT 'disabled' NOT NULL,
	"failure_classification" text,
	"evidence_freshness" text DEFAULT 'unknown' NOT NULL,
	"result_fingerprint" text,
	"skip_reason" text,
	"run_id" uuid,
	"created_by" uuid
);
--> statement-breakpoint
ALTER TABLE "family_office_refreshes" ADD CONSTRAINT "family_office_refreshes_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_office_refreshes" ADD CONSTRAINT "family_office_refreshes_run_id_family_office_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."family_office_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_office_refreshes" ADD CONSTRAINT "family_office_refreshes_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "family_office_refreshes_household_idx" ON "family_office_refreshes" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "family_office_refreshes_household_requested_idx" ON "family_office_refreshes" USING btree ("household_id","requested_at");--> statement-breakpoint
CREATE INDEX "family_office_refreshes_trigger_requested_idx" ON "family_office_refreshes" USING btree ("trigger","requested_at");