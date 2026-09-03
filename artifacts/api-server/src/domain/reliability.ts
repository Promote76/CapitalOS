export const RELIABILITY_METRICS = [
  "readiness.blocked",
  "authorization.denied",
  "database.failure",
  "rate_limit.unavailable",
  "rate_limit.exceeded",
  "audit.write_failure",
  "idempotency.conflict",
  "operations.job_failure",
  "operations.job_dead_lettered",
  "micro_live.reconciliation_failure",
  "micro_live.guardian_stop",
] as const;

export type ReliabilityMetric = typeof RELIABILITY_METRICS[number];
export type ReliabilitySeverity = "INFO" | "LOW" | "HIGH" | "CRITICAL";

export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX_REQUESTS_PER_WINDOW = 120;
export const AUDIT_RETENTION_DAYS = 2_555;
export const AUDIT_ARCHIVE_DESTINATION = "postgresql://audit_events_archive";
export const RELIABILITY_ALERT_OWNER = "reliability-operator";

export const RELIABILITY_ALERT_THRESHOLDS: Readonly<Record<ReliabilityMetric, {
  threshold: number;
  windowMinutes: number;
}>> = {
  "readiness.blocked": { threshold: 1, windowMinutes: 1 },
  "authorization.denied": { threshold: 10, windowMinutes: 5 },
  "database.failure": { threshold: 1, windowMinutes: 1 },
  "rate_limit.unavailable": { threshold: 1, windowMinutes: 1 },
  "rate_limit.exceeded": { threshold: 5, windowMinutes: 5 },
  "audit.write_failure": { threshold: 1, windowMinutes: 1 },
  "idempotency.conflict": { threshold: 5, windowMinutes: 5 },
  "operations.job_failure": { threshold: 3, windowMinutes: 15 },
  "operations.job_dead_lettered": { threshold: 1, windowMinutes: 1 },
  "micro_live.reconciliation_failure": { threshold: 1, windowMinutes: 1 },
  "micro_live.guardian_stop": { threshold: 1, windowMinutes: 1 },
};

export type ReliabilityConfiguration = {
  rateLimitStore: "postgres";
  trustedProxy: string[];
  auditArchiveDestination: string;
  auditRetentionDays: number;
  operatorOwner: string;
};

export function readReliabilityConfiguration(
  env: Record<string, string | undefined> = process.env,
): ReliabilityConfiguration {
  const trustedProxy = (env.CAPITAL_OS_TRUSTED_PROXY ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (env.NODE_ENV === "production" && trustedProxy.length === 0) {
    throw new Error("CAPITAL_OS_TRUSTED_PROXY must identify the API ingress proxy in production");
  }

  if (env.NODE_ENV === "production" && env.CAPITAL_OS_RATE_LIMIT_STORE !== "postgres") {
    throw new Error("CAPITAL_OS_RATE_LIMIT_STORE must be explicitly set to postgres in production");
  }

  const retentionValue = env.CAPITAL_OS_AUDIT_RETENTION_DAYS ?? String(AUDIT_RETENTION_DAYS);
  const auditRetentionDays = Number(retentionValue);
  if (!Number.isInteger(auditRetentionDays) || auditRetentionDays < 365) {
    throw new Error("CAPITAL_OS_AUDIT_RETENTION_DAYS must be an integer of at least 365 days");
  }
  if (env.NODE_ENV === "production" && !env.CAPITAL_OS_AUDIT_RETENTION_DAYS) {
    throw new Error("CAPITAL_OS_AUDIT_RETENTION_DAYS must be explicitly configured in production");
  }

  const operatorOwner = env.CAPITAL_OS_RELIABILITY_OWNER?.trim();
  if (!operatorOwner) {
    throw new Error("CAPITAL_OS_RELIABILITY_OWNER must identify the reliability operator");
  }

  const rateLimitStore = env.CAPITAL_OS_RATE_LIMIT_STORE ?? "postgres";
  if (rateLimitStore !== "postgres") {
    throw new Error("CAPITAL_OS_RATE_LIMIT_STORE must be postgres");
  }
  if (env.NODE_ENV === "production" && !env.CAPITAL_OS_AUDIT_ARCHIVE_DESTINATION) {
    throw new Error("CAPITAL_OS_AUDIT_ARCHIVE_DESTINATION must be explicitly configured in production");
  }

  return {
    rateLimitStore,
    trustedProxy,
    auditArchiveDestination: env.CAPITAL_OS_AUDIT_ARCHIVE_DESTINATION ?? AUDIT_ARCHIVE_DESTINATION,
    auditRetentionDays,
    operatorOwner,
  };
}

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
    key: "rate-limit-unavailable",
    metric: "rate_limit.unavailable",
    severity: "CRITICAL",
    condition: "The shared rate-limit store cannot be reached.",
    response: "Fail protected mutations closed, preserve the error context, and page the reliability operator.",
  },
  {
    key: "rate-limit-exceeded",
    metric: "rate_limit.exceeded",
    severity: "HIGH",
    condition: "A route, actor, household, or network identity exceeds its configured request window.",
    response: "Review the trusted-proxy and actor context before changing thresholds or allowing traffic.",
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