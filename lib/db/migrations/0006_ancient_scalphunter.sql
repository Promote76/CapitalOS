CREATE TABLE "execution_controls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"state" text DEFAULT 'DISABLED' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"reason" text DEFAULT 'Execution control initialized fail-closed' NOT NULL,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"correlation_id" text,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "execution_controls" ADD CONSTRAINT "execution_controls_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_controls" ADD CONSTRAINT "execution_controls_changed_by_capital_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."capital_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "execution_controls_household_unique" ON "execution_controls" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "execution_controls_household_state_idx" ON "execution_controls" USING btree ("household_id","state");