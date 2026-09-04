CREATE TABLE "operations_job_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"worker_id" text NOT NULL,
	"status" text DEFAULT 'LEASED' NOT NULL,
	"classification" text,
	"error" text,
	"leased_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "operations_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid,
	"metric" text NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operations_scheduler_leases" (
	"singleton" text PRIMARY KEY DEFAULT 'operations' NOT NULL,
	"owner_id" text NOT NULL,
	"lease_expires_at" timestamp with time zone NOT NULL,
	"heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operations_schedulers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"job_kind" text NOT NULL,
	"cadence" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"missed_run_policy" text DEFAULT 'SKIP' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operations_workers" (
	"worker_id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'STARTING' NOT NULL,
	"current_job_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" text DEFAULT 'unknown' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "operations_jobs" ADD COLUMN "priority" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "operations_jobs" ADD COLUMN "lease_owner" text;--> statement-breakpoint
ALTER TABLE "operations_jobs" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "operations_jobs" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "operations_jobs" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "operations_jobs" ADD COLUMN "correlation_id" text;--> statement-breakpoint
ALTER TABLE "operations_jobs" ADD COLUMN "payload_reference" text;--> statement-breakpoint
ALTER TABLE "operations_job_attempts" ADD CONSTRAINT "operations_job_attempts_job_id_operations_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."operations_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_job_attempts" ADD CONSTRAINT "operations_job_attempts_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_metrics" ADD CONSTRAINT "operations_metrics_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_schedulers" ADD CONSTRAINT "operations_schedulers_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_schedulers" ADD CONSTRAINT "operations_schedulers_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_workers" ADD CONSTRAINT "operations_workers_current_job_id_operations_jobs_id_fk" FOREIGN KEY ("current_job_id") REFERENCES "public"."operations_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "operations_job_attempts_job_attempt_unique" ON "operations_job_attempts" USING btree ("job_id","attempt");--> statement-breakpoint
CREATE INDEX "operations_job_attempts_household_idx" ON "operations_job_attempts" USING btree ("household_id","leased_at");--> statement-breakpoint
CREATE INDEX "operations_metrics_metric_observed_idx" ON "operations_metrics" USING btree ("metric","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "operations_schedulers_household_name_unique" ON "operations_schedulers" USING btree ("household_id","name");--> statement-breakpoint
CREATE INDEX "operations_schedulers_due_idx" ON "operations_schedulers" USING btree ("enabled","next_run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "operations_jobs_household_idempotency_unique" ON "operations_jobs" USING btree ("household_id","idempotency_key");