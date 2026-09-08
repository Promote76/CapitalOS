CREATE TABLE "capital_designation_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"waterfall_run_id" uuid NOT NULL,
	"bucket_key" text NOT NULL,
	"amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"designation_type" text DEFAULT 'economic' NOT NULL,
	"physical_account_id" uuid,
	"reason" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capital_encumbrances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"purpose" text NOT NULL,
	"source_type" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" date,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capital_governor_input_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"as_of" date NOT NULL,
	"policy_version" text NOT NULL,
	"fingerprint" text NOT NULL,
	"data_readiness" text NOT NULL,
	"source_provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capital_governor_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"version" text DEFAULT '2' NOT NULL,
	"household_cash_buffer" numeric(18, 2) DEFAULT '0' NOT NULL,
	"medical_reserve" numeric(18, 2) DEFAULT '0' NOT NULL,
	"vehicle_reserve_months" integer DEFAULT 3 NOT NULL,
	"annual_obligation_months" integer DEFAULT 1 NOT NULL,
	"maximum_investment_percent" numeric(5, 2) DEFAULT '15' NOT NULL,
	"waterfall" jsonb DEFAULT '["EMERGENCY_RESERVE","VEHICLE_RESERVE","ANNUAL_OBLIGATION_RESERVE","CAPITAL_OS_RESERVE","OPPORTUNITY_RESERVE","INVESTMENT_CAPITAL"]'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capital_waterfall_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"input_snapshot_id" uuid NOT NULL,
	"scenario" text NOT NULL,
	"policy_version" text NOT NULL,
	"status" text NOT NULL,
	"safe_to_deploy" numeric(18, 2) DEFAULT '0' NOT NULL,
	"allocations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"decision" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "protected_capital_registry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"bucket_key" text NOT NULL,
	"designation" text NOT NULL,
	"reason" text NOT NULL,
	"locked" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "capital_designation_ledger" ADD CONSTRAINT "capital_designation_ledger_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capital_designation_ledger" ADD CONSTRAINT "capital_designation_ledger_waterfall_run_id_capital_waterfall_runs_id_fk" FOREIGN KEY ("waterfall_run_id") REFERENCES "public"."capital_waterfall_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capital_designation_ledger" ADD CONSTRAINT "capital_designation_ledger_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capital_encumbrances" ADD CONSTRAINT "capital_encumbrances_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capital_encumbrances" ADD CONSTRAINT "capital_encumbrances_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capital_governor_input_snapshots" ADD CONSTRAINT "capital_governor_input_snapshots_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capital_governor_policies" ADD CONSTRAINT "capital_governor_policies_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capital_governor_policies" ADD CONSTRAINT "capital_governor_policies_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capital_waterfall_runs" ADD CONSTRAINT "capital_waterfall_runs_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capital_waterfall_runs" ADD CONSTRAINT "capital_waterfall_runs_input_snapshot_id_capital_governor_input_snapshots_id_fk" FOREIGN KEY ("input_snapshot_id") REFERENCES "public"."capital_governor_input_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capital_waterfall_runs" ADD CONSTRAINT "capital_waterfall_runs_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protected_capital_registry" ADD CONSTRAINT "protected_capital_registry_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protected_capital_registry" ADD CONSTRAINT "protected_capital_registry_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "capital_designation_ledger_household_run_idx" ON "capital_designation_ledger" USING btree ("household_id","waterfall_run_id");--> statement-breakpoint
CREATE INDEX "capital_encumbrances_household_status_idx" ON "capital_encumbrances" USING btree ("household_id","status");--> statement-breakpoint
CREATE INDEX "capital_governor_snapshots_household_date_idx" ON "capital_governor_input_snapshots" USING btree ("household_id","as_of");--> statement-breakpoint
CREATE UNIQUE INDEX "capital_governor_policies_household_unique" ON "capital_governor_policies" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "capital_waterfall_runs_household_idempotency_unique" ON "capital_waterfall_runs" USING btree ("household_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "capital_waterfall_runs_household_created_idx" ON "capital_waterfall_runs" USING btree ("household_id","created_at");--> statement-breakpoint
CREATE INDEX "protected_capital_registry_household_bucket_idx" ON "protected_capital_registry" USING btree ("household_id","bucket_key");