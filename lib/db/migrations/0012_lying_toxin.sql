CREATE TABLE "family_office_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"source_kind" text DEFAULT 'user_context' NOT NULL,
	"title" text NOT NULL,
	"source_url" text,
	"excerpt" text NOT NULL,
	"classification" text DEFAULT 'unverified' NOT NULL,
	"freshness" text DEFAULT 'unknown' NOT NULL,
	"confidence" numeric(5, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_office_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"run_id" uuid,
	"title" text NOT NULL,
	"thesis" text NOT NULL,
	"label" text DEFAULT 'RESEARCH_ONLY' NOT NULL,
	"analytical_direction" text DEFAULT 'NEUTRAL' NOT NULL,
	"confidence" numeric(5, 2) DEFAULT '0' NOT NULL,
	"facts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assumptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"risks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"review_reason" text
);
--> statement-breakpoint
CREATE TABLE "family_office_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"analyst" text DEFAULT 'Research Analyst' NOT NULL,
	"scope" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"provider_status" text DEFAULT 'disabled' NOT NULL,
	"error_code" text,
	"output_summary" text,
	"cost_cents" numeric(12, 2) DEFAULT '0' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "shadow_order_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"shadow_portfolio_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"direction" text NOT NULL,
	"hypothetical_quantity" numeric(24, 8) NOT NULL,
	"hypothetical_notional" numeric(18, 2) NOT NULL,
	"reference_price" numeric(24, 8) NOT NULL,
	"reference_timestamp" timestamp with time zone NOT NULL,
	"time_horizon" text NOT NULL,
	"model" text DEFAULT 'shadow-reference' NOT NULL,
	"agent" text DEFAULT 'AI CIO' NOT NULL,
	"status" text DEFAULT 'hypothetical' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shadow_portfolios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"benchmark" text DEFAULT 'Not configured' NOT NULL,
	"strategy" text DEFAULT 'Research only' NOT NULL,
	"capital_model" text DEFAULT 'hypothetical' NOT NULL,
	"risk_policy" text DEFAULT 'No real capital; human review required' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "family_office_evidence" ADD CONSTRAINT "family_office_evidence_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_office_evidence" ADD CONSTRAINT "family_office_evidence_run_id_family_office_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."family_office_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_office_proposals" ADD CONSTRAINT "family_office_proposals_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_office_proposals" ADD CONSTRAINT "family_office_proposals_run_id_family_office_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."family_office_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_office_proposals" ADD CONSTRAINT "family_office_proposals_reviewed_by_capital_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_office_runs" ADD CONSTRAINT "family_office_runs_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_office_runs" ADD CONSTRAINT "family_office_runs_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shadow_order_intents" ADD CONSTRAINT "shadow_order_intents_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shadow_order_intents" ADD CONSTRAINT "shadow_order_intents_proposal_id_family_office_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."family_office_proposals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shadow_order_intents" ADD CONSTRAINT "shadow_order_intents_shadow_portfolio_id_shadow_portfolios_id_fk" FOREIGN KEY ("shadow_portfolio_id") REFERENCES "public"."shadow_portfolios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shadow_portfolios" ADD CONSTRAINT "shadow_portfolios_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "family_office_evidence_household_idx" ON "family_office_evidence" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "family_office_evidence_run_idx" ON "family_office_evidence" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "family_office_proposals_household_idx" ON "family_office_proposals" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "family_office_proposals_status_idx" ON "family_office_proposals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "family_office_runs_household_idx" ON "family_office_runs" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "family_office_runs_created_idx" ON "family_office_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "shadow_order_intents_household_idx" ON "shadow_order_intents" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "shadow_order_intents_portfolio_idx" ON "shadow_order_intents" USING btree ("shadow_portfolio_id");--> statement-breakpoint
CREATE INDEX "shadow_portfolios_household_idx" ON "shadow_portfolios" USING btree ("household_id");