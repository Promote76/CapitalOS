CREATE TYPE "public"."bank_consent_status" AS ENUM('pending', 'granted', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."bank_reconciliation_status" AS ENUM('not_run', 'matched', 'review', 'stale', 'outage', 'rate_limited', 'revoked');--> statement-breakpoint
CREATE TABLE "bank_connection_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"credential_ref" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "bank_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"provider_as_of" timestamp with time zone,
	"inserted_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"removed_count" integer DEFAULT 0 NOT NULL,
	"reconciliation_difference" numeric(18, 2) DEFAULT '0' NOT NULL,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bank_connections" ADD COLUMN "consent_status" "bank_consent_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_connections" ADD COLUMN "consent_granted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bank_connections" ADD COLUMN "consent_revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bank_connections" ADD COLUMN "consent_actor" text;--> statement-breakpoint
ALTER TABLE "bank_connections" ADD COLUMN "sync_cursor" text;--> statement-breakpoint
ALTER TABLE "bank_connections" ADD COLUMN "provider_as_of" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bank_connections" ADD COLUMN "reconciliation_status" "bank_reconciliation_status" DEFAULT 'not_run' NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_connections" ADD COLUMN "reconciliation_difference" numeric(18, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_connections" ADD COLUMN "last_sync_attempt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "household_financial_accounts" ADD COLUMN "provider_account_ref" text;--> statement-breakpoint
ALTER TABLE "bank_connection_credentials" ADD CONSTRAINT "bank_connection_credentials_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_connection_credentials" ADD CONSTRAINT "bank_connection_credentials_connection_id_bank_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."bank_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_sync_runs" ADD CONSTRAINT "bank_sync_runs_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_sync_runs" ADD CONSTRAINT "bank_sync_runs_connection_id_bank_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."bank_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_connection_credentials_household_idx" ON "bank_connection_credentials" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_connection_credentials_connection_unique" ON "bank_connection_credentials" USING btree ("connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_connection_credentials_ref_unique" ON "bank_connection_credentials" USING btree ("credential_ref");--> statement-breakpoint
CREATE INDEX "bank_sync_runs_household_idx" ON "bank_sync_runs" USING btree ("household_id","started_at");--> statement-breakpoint
CREATE INDEX "bank_sync_runs_connection_idx" ON "bank_sync_runs" USING btree ("connection_id","started_at");