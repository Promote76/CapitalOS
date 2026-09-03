export const RELIABILITY_METRICS = [
  "readiness.blocked",
  "authorization.denied",
  "database.failure",
  "audit.write_failure",
  "idempotency.conflict",
  "operations.job_failure",
  "operations.job_dead_lettered",
  "micro_live.reconciliation_failure",
  "micro_live.guardian_stop",
] as const;

export type ReliabilityMetric = typeof RELIABILITY_METRICS[number];
export type ReliabilitySeverity = "INFO" | "LOW" | "HIGH" | "CRITICAL";

export const RELIABILITY_ALERTS: ReadonlyArray<{
  key: string;
  metric: ReliabilityMetric;
  severity: ReliabilitySeverity;
  condition: string;
  response: string;
}> = [
  {
    key: "readiness-blocked",
    metric: "readiness.blocked",
    severity: "HIGH",
    condition: "Readiness is not healthy for a protected operation.",
    response: "Keep the operation blocked and investigate the named dependency.",
  },
  {
    key: "authorization-denial-spike",
    metric: "authorization.denied",
    severity: "HIGH",
    condition: "Denied requests exceed the configured review threshold.",
    response: "Review actor, household, route, and origin context for abuse or misconfiguration.",
  },
  {
    key: "database-failure",
    metric: "database.failure",
    severity: "CRITICAL",
    condition: "A required database read or write fails.",
    response: "Serve no synthetic success; keep writes fail-closed and preserve the error context.",
  },
  {
    key: "audit-write-failure",
    metric: "audit.write_failure",
    severity: "CRITICAL",
    condition: "An audited mutation cannot append its audit record.",
    response: "Treat the mutation as failed and page the operator; never continue silently.",
  },
  {
    key: "idempotency-conflict",
    metric: "idempotency.conflict",
    severity: "HIGH",
    condition: "A reused idempotency key carries a different payload.",
    response: "Reject the replay and retain the original result for investigation.",
  },
  {
    key: "operations-dead-lettered",
    metric: "operations.job_dead_lettered",
    severity: "CRITICAL",
    condition: "A safe job exhausts its attempts.",
    response: "Keep it in the dead-letter state and require human review before replay.",
  },
  {
    key: "micro-live-reconciliation-failure",
    metric: "micro_live.reconciliation_failure",
    severity: "CRITICAL",
    condition: "Venue recovery or reconciliation cannot complete.",
    response: "Persist the failure, stop the session, and require post-incident review.",
  },
  {
    key: "micro-live-guardian-stop",
    metric: "micro_live.guardian_stop",
    severity: "CRITICAL",
    condition: "Guardian heartbeat is missing, stale, invalid, or disagrees with exposure.",
    response: "Stop and do not re-arm until an independent healthy heartbeat is recorded.",
  },
];

export function reliabilityEvent(input: {
  metric: ReliabilityMetric;
  severity: ReliabilitySeverity;
  householdId?: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  return {
    metric: input.metric,
    severity: input.severity,
    householdId: input.householdId ?? null,
    message: input.message,
    metadata: input.metadata ?? {},
    occurredAt: new Date().toISOString(),
  };
}