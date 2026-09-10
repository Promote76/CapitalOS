BEGIN;

CREATE OR REPLACE FUNCTION public.archive_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_events_archive (
    event_id, household_id, event_type, actor, entity, entity_id,
    before_state, after_state, reason, metadata, event_timestamp, archived_at
  )
  VALUES (
    NEW.id::text, NEW.household_id::text, NEW.event_type, NEW.actor,
    NEW.entity, NEW.entity_id, NEW.before_state, NEW.after_state,
    NEW.reason, NEW.metadata, NEW.timestamp, clock_timestamp()
  )
  ON CONFLICT (event_id) DO NOTHING;
  RETURN NEW;
END;
$$;

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
$$;

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
$$;

DROP TRIGGER IF EXISTS audit_events_archive_restricted_insert
  ON public.audit_events_archive;

INSERT INTO public.audit_events_archive (
  event_id, household_id, event_type, actor, entity, entity_id,
  before_state, after_state, reason, metadata, event_timestamp, archived_at
)
SELECT
  id::text, household_id::text, event_type, actor, entity, entity_id,
  before_state, after_state, reason, metadata, timestamp, clock_timestamp()
FROM public.audit_events
ON CONFLICT (event_id) DO NOTHING;

DROP TRIGGER IF EXISTS audit_events_archive_on_insert ON public.audit_events;
CREATE TRIGGER audit_events_archive_on_insert
AFTER INSERT ON public.audit_events
FOR EACH ROW EXECUTE FUNCTION public.archive_audit_event();

DROP TRIGGER IF EXISTS audit_events_append_only ON public.audit_events;
CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE OR TRUNCATE ON public.audit_events
FOR EACH STATEMENT EXECUTE FUNCTION public.reject_audit_mutation();

DROP TRIGGER IF EXISTS audit_events_archive_append_only
  ON public.audit_events_archive;
CREATE TRIGGER audit_events_archive_append_only
BEFORE UPDATE OR DELETE OR TRUNCATE ON public.audit_events_archive
FOR EACH STATEMENT EXECUTE FUNCTION public.reject_audit_mutation();

CREATE TRIGGER audit_events_archive_restricted_insert
BEFORE INSERT ON public.audit_events_archive
FOR EACH ROW EXECUTE FUNCTION public.reject_direct_archive_insert();

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.audit_events_archive FROM PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_events FROM PUBLIC;

COMMENT ON TABLE public.audit_events_archive IS
  'Restricted immutable audit destination; retain for 2555 days under the Capital OS internal reliability policy.';

COMMIT;