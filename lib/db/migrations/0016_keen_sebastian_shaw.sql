CREATE TABLE "operations_decision_journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"entry_type" text DEFAULT 'DECISION' NOT NULL,
	"title" text NOT NULL,
	"decision_context" text NOT NULL,
	"outcome" text,
	"evidence_links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"unresolved_blockers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"related_entity_type" text,
	"related_entity_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operations_guided_run_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"guided_run_id" uuid NOT NULL,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"snoozed_until" timestamp with time zone,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operations_guided_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"run_date" date NOT NULL,
	"cadence" text NOT NULL,
	"status" text DEFAULT 'NOT_STARTED' NOT NULL,
	"latest_reason" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"snoozed_until" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "operations_decision_journal_entries" ADD CONSTRAINT "operations_decision_journal_entries_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_decision_journal_entries" ADD CONSTRAINT "operations_decision_journal_entries_actor_id_capital_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_guided_run_events" ADD CONSTRAINT "operations_guided_run_events_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_guided_run_events" ADD CONSTRAINT "operations_guided_run_events_guided_run_id_operations_guided_runs_id_fk" FOREIGN KEY ("guided_run_id") REFERENCES "public"."operations_guided_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_guided_run_events" ADD CONSTRAINT "operations_guided_run_events_actor_id_capital_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_guided_runs" ADD CONSTRAINT "operations_guided_runs_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_guided_runs" ADD CONSTRAINT "operations_guided_runs_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_guided_runs" ADD CONSTRAINT "operations_guided_runs_updated_by_capital_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "operations_decision_journal_household_created_idx" ON "operations_decision_journal_entries" USING btree ("household_id","created_at");--> statement-breakpoint
CREATE INDEX "operations_decision_journal_household_type_idx" ON "operations_decision_journal_entries" USING btree ("household_id","entry_type");--> statement-breakpoint
CREATE INDEX "operations_guided_run_events_household_occurred_idx" ON "operations_guided_run_events" USING btree ("household_id","occurred_at");--> statement-breakpoint
CREATE INDEX "operations_guided_run_events_run_occurred_idx" ON "operations_guided_run_events" USING btree ("guided_run_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "operations_guided_runs_household_date_cadence_unique" ON "operations_guided_runs" USING btree ("household_id","run_date","cadence");--> statement-breakpoint
CREATE INDEX "operations_guided_runs_household_status_idx" ON "operations_guided_runs" USING btree ("household_id","status");