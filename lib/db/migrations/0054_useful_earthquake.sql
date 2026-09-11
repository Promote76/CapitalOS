CREATE TABLE "audit_backfill_state" (
	"scope" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"cursor" text,
	"processed" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_chain_heads" (
	"chain_key" text,
	"chain_scope" text,
	"household_id" text,
	"sequence" integer,
	"event_hash" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_verification_state" (
	"scope" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"verified_at" timestamp with time zone,
	"source_count" integer DEFAULT 0 NOT NULL,
	"archive_count" integer DEFAULT 0 NOT NULL,
	"high_water_timestamp" timestamp with time zone,
	"high_water_digest" text,
	"failure_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "canonical_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "chain_scope" text DEFAULT 'household' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "chain_key" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "sequence" integer;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "previous_hash" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "event_hash" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "audit_events_archive" ADD COLUMN "canonical_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_events_archive" ADD COLUMN "chain_scope" text DEFAULT 'household' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_events_archive" ADD COLUMN "chain_key" text;--> statement-breakpoint
ALTER TABLE "audit_events_archive" ADD COLUMN "sequence" integer;--> statement-breakpoint
ALTER TABLE "audit_events_archive" ADD COLUMN "previous_hash" text;--> statement-breakpoint
ALTER TABLE "audit_events_archive" ADD COLUMN "event_hash" text;--> statement-breakpoint
CREATE UNIQUE INDEX "audit_chain_heads_chain_key_unique" ON "audit_chain_heads" USING btree ("chain_key");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_events_chain_sequence_unique" ON "audit_events" USING btree ("chain_key","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_events_idempotency_unique" ON "audit_events" USING btree ("household_id","idempotency_key");