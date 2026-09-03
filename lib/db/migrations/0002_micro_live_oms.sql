ALTER TABLE "capital_accounts" ADD COLUMN "execution_only" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "execution_fills" ADD COLUMN "ledger_transaction_id" uuid;
--> statement-breakpoint
ALTER TABLE "execution_fills" ADD COLUMN "fee_ledger_transaction_id" uuid;
--> statement-breakpoint
ALTER TABLE "micro_live_sessions" ADD COLUMN "first_fill_resume_approved_by" uuid;
--> statement-breakpoint
ALTER TABLE "micro_live_sessions" ADD COLUMN "first_fill_resume_approved_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "order_intents" ADD COLUMN "idempotency_key" text;
--> statement-breakpoint
UPDATE "order_intents" SET "idempotency_key" = 'legacy:' || "id";
--> statement-breakpoint
ALTER TABLE "order_intents" ALTER COLUMN "idempotency_key" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "order_intents" ADD COLUMN "submitted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "order_intents" ADD COLUMN "acknowledged_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "order_intents" ADD COLUMN "last_error" text;
--> statement-breakpoint
ALTER TABLE "venue_orders" ADD COLUMN "side" text;
--> statement-breakpoint
ALTER TABLE "venue_orders" ADD COLUMN "order_type" text;
--> statement-breakpoint
ALTER TABLE "venue_orders" ADD COLUMN "price" numeric(18, 8);
--> statement-breakpoint
ALTER TABLE "venue_orders" ADD COLUMN "quantity" numeric(18, 8);
--> statement-breakpoint
ALTER TABLE "venue_orders" ADD COLUMN "filled_quantity" numeric(18, 8);
--> statement-breakpoint
DROP INDEX IF EXISTS "execution_fills_external_fill_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "order_intents_household_idempotency_idx" ON "order_intents" USING btree ("household_id","idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "execution_fills_external_fill_idx" ON "execution_fills" USING btree ("household_id","external_fill_id");
--> statement-breakpoint
CREATE TABLE "venue_balance_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL,
  "session_id" uuid,
  "venue_id" uuid,
  "asset" text NOT NULL,
  "available" numeric(18, 8) NOT NULL,
  "committed" numeric(18, 8) NOT NULL,
  "source" text DEFAULT 'VENUE' NOT NULL,
  "captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "execution_fills" ADD CONSTRAINT "execution_fills_ledger_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("ledger_transaction_id") REFERENCES "ledger_transactions"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "execution_fills" ADD CONSTRAINT "execution_fills_fee_ledger_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("fee_ledger_transaction_id") REFERENCES "ledger_transactions"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "micro_live_sessions" ADD CONSTRAINT "micro_live_sessions_first_fill_resume_approved_by_capital_users_id_fk" FOREIGN KEY ("first_fill_resume_approved_by") REFERENCES "capital_users"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "venue_balance_snapshots" ADD CONSTRAINT "venue_balance_snapshots_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "venue_balance_snapshots" ADD CONSTRAINT "venue_balance_snapshots_session_id_micro_live_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "micro_live_sessions"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "venue_balance_snapshots" ADD CONSTRAINT "venue_balance_snapshots_venue_id_venue_registry_id_fk" FOREIGN KEY ("venue_id") REFERENCES "venue_registry"("id") ON DELETE set null;
--> statement-breakpoint
CREATE INDEX "venue_balance_snapshots_household_idx" ON "venue_balance_snapshots" USING btree ("household_id");
--> statement-breakpoint
CREATE INDEX "venue_balance_snapshots_captured_idx" ON "venue_balance_snapshots" USING btree ("household_id","captured_at");