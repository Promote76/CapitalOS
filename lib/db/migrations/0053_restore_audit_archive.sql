COMMENT ON TABLE public.audit_events_archive IS
  'Application-maintained audit archive; writes occur in the same transaction as audit_events.';