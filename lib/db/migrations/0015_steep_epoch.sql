CREATE TABLE "family_office_analyst_scorecards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"analyst" text NOT NULL,
	"specialty" text NOT NULL,
	"status" text DEFAULT 'unrated' NOT NULL,
	"assignment_count" integer DEFAULT 0 NOT NULL,
	"completed_count" integer DEFAULT 0 NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"quality_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"calibration_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"budget_cents" integer DEFAULT 0 NOT NULL,
	"spent_cents" integer DEFAULT 0 NOT NULL,
	"value_cents" integer DEFAULT 0 NOT NULL,
	"authority" text DEFAULT 'advisory_only' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_office_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"report_type" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'unknown' NOT NULL,
	"freshness" text DEFAULT 'unknown' NOT NULL,
	"summary" text,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"generated_at" timestamp with time zone,
	"execution_disabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shadow_portfolio_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"shadow_portfolio_id" uuid NOT NULL,
	"shadow_intent_id" uuid,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone,
	"status" text DEFAULT 'unknown' NOT NULL,
	"shadow_return_bps" numeric(10, 2),
	"benchmark_return_bps" numeric(10, 2),
	"attribution_bps" numeric(10, 2),
	"max_drawdown_bps" numeric(10, 2),
	"confidence" numeric(5, 2) DEFAULT '0' NOT NULL,
	"evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "family_office_analyst_scorecards" ADD CONSTRAINT "family_office_analyst_scorecards_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_office_reports" ADD CONSTRAINT "family_office_reports_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shadow_portfolio_outcomes" ADD CONSTRAINT "shadow_portfolio_outcomes_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shadow_portfolio_outcomes" ADD CONSTRAINT "shadow_portfolio_outcomes_shadow_portfolio_id_shadow_portfolios_id_fk" FOREIGN KEY ("shadow_portfolio_id") REFERENCES "public"."shadow_portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shadow_portfolio_outcomes" ADD CONSTRAINT "shadow_portfolio_outcomes_shadow_intent_id_shadow_order_intents_id_fk" FOREIGN KEY ("shadow_intent_id") REFERENCES "public"."shadow_order_intents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "family_office_analyst_scorecards_household_idx" ON "family_office_analyst_scorecards" USING btree ("household_id","analyst");--> statement-breakpoint
CREATE INDEX "family_office_reports_household_idx" ON "family_office_reports" USING btree ("household_id","report_type");--> statement-breakpoint
CREATE INDEX "family_office_reports_scheduled_idx" ON "family_office_reports" USING btree ("scheduled_for");--> statement-breakpoint
CREATE INDEX "shadow_portfolio_outcomes_household_idx" ON "shadow_portfolio_outcomes" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "shadow_portfolio_outcomes_portfolio_idx" ON "shadow_portfolio_outcomes" USING btree ("shadow_portfolio_id");--> statement-breakpoint
CREATE INDEX "shadow_portfolio_outcomes_as_of_idx" ON "shadow_portfolio_outcomes" USING btree ("as_of");