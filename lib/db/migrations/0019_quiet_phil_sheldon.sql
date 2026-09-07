ALTER TABLE "operations_guided_run_events" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
UPDATE "operations_guided_run_events" SET "idempotency_key" = "id"::text WHERE "idempotency_key" IS NULL;--> statement-breakpoint
ALTER TABLE "operations_guided_run_events" ALTER COLUMN "idempotency_key" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "operations_guided_run_events_household_idempotency_key_unique" ON "operations_guided_run_events" USING btree ("household_id","idempotency_key");