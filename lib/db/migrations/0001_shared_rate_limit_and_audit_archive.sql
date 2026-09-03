CREATE TABLE "operations_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"job_key" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by" text,
	"last_error" text,
	"dead_letter_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_events_archive" (
	"event_id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"event_type" text NOT NULL,
	"actor" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb,
	"reason" text,
	"metadata" jsonb NOT NULL,
	"event_timestamp" timestamp with time zone NOT NULL,
	"archived_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"bucket_key" text PRIMARY KEY NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"request_count" integer NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_household_id_households_id_fk";
--> statement-breakpoint
ALTER TABLE "operations_jobs" ADD CONSTRAINT "operations_jobs_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "operations_jobs_household_job_key_unique" ON "operations_jobs" USING btree ("household_id","job_key");--> statement-breakpoint
CREATE INDEX "operations_jobs_claim_idx" ON "operations_jobs" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "operations_jobs_household_status_idx" ON "operations_jobs" USING btree ("household_id","status");--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.archive_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_events_archive (
    event_id,
    household_id,
    event_type,
    actor,
    entity,
    entity_id,
    before_state,
    after_state,
    reason,
    metadata,
    event_timestamp,
    archived_at
  )
  VALUES (
    NEW.id::text,
    NEW.household_id::text,
    NEW.event_type,
    NEW.actor,
    NEW.entity,
    NEW.entity_id,
    NEW.before_state,
    NEW.after_state,
    NEW.reason,
    NEW.metadata,
    NEW.timestamp,
    clock_timestamp()
  );
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Audit history is append-only'
    USING ERRCODE = '42501';
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.reject_direct_archive_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() <= 1 THEN
    RAISE EXCEPTION 'Audit archive accepts inserts only from the source audit trigger'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
INSERT INTO public.audit_events_archive (
  event_id,
  household_id,
  event_type,
  actor,
  entity,
  entity_id,
  before_state,
  after_state,
  reason,
  metadata,
  event_timestamp,
  archived_at
)
SELECT
  id::text,
  household_id::text,
  event_type,
  actor,
  entity,
  entity_id,
  before_state,
  after_state,
  reason,
  metadata,
  timestamp,
  clock_timestamp()
FROM public.audit_events
ON CONFLICT (event_id) DO NOTHING;--> statement-breakpoint
CREATE TRIGGER audit_events_archive_on_insert
AFTER INSERT ON public.audit_events
FOR EACH ROW EXECUTE FUNCTION public.archive_audit_event();--> statement-breakpoint
CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE OR TRUNCATE ON public.audit_events
FOR EACH STATEMENT EXECUTE FUNCTION public.reject_audit_mutation();--> statement-breakpoint
CREATE TRIGGER audit_events_archive_append_only
BEFORE UPDATE OR DELETE OR TRUNCATE ON public.audit_events_archive
FOR EACH STATEMENT EXECUTE FUNCTION public.reject_audit_mutation();--> statement-breakpoint
CREATE TRIGGER audit_events_archive_restricted_insert
BEFORE INSERT ON public.audit_events_archive
FOR EACH ROW EXECUTE FUNCTION public.reject_direct_archive_insert();--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.audit_events_archive FROM PUBLIC;--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_events FROM PUBLIC;--> statement-breakpoint
COMMENT ON TABLE public.audit_events_archive IS 'Restricted immutable audit destination; retain for 2555 days under the Capital OS internal reliability policy.';