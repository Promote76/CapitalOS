CREATE TABLE "research_advisory_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"ticker" text NOT NULL,
	"decision" text NOT NULL,
	"reason" text,
	"opportunity_snapshot" jsonb NOT NULL,
	"evidence_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"advisory_only" boolean DEFAULT true NOT NULL,
	"execution_authority" text DEFAULT 'none' NOT NULL,
	"no_trading_or_money_movement" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_advisory_decisions_decision_check" CHECK ("research_advisory_decisions"."decision" in ('SKIP','WATCH','REVIEW','SHADOW','OPEN_SCHWAB')),
	CONSTRAINT "research_advisory_decisions_advisory_check" CHECK ("research_advisory_decisions"."advisory_only" = true and "research_advisory_decisions"."execution_authority" = 'none' and "research_advisory_decisions"."no_trading_or_money_movement" = true)
);
--> statement-breakpoint
ALTER TABLE "research_advisory_decisions" ADD CONSTRAINT "research_advisory_decisions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_advisory_decisions" ADD CONSTRAINT "research_advisory_decisions_actor_user_id_capital_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "research_advisory_decisions_household_created_idx" ON "research_advisory_decisions" USING btree ("household_id","created_at");--> statement-breakpoint
CREATE INDEX "research_advisory_decisions_household_ticker_idx" ON "research_advisory_decisions" USING btree ("household_id","ticker");