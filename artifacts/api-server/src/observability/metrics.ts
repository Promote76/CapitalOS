import type { NextFunction, Request, Response } from "express";

type Labels = Record<string, string>;

const labelName = /^[a-z_][a-z0-9_]*$/;
const labelValue = /^[a-z0-9_./:-]{1,80}$/;
const allowedLabels = new Set([
  "route",
  "status_class",
  "component",
  "provider",
  "severity",
  "state",
  "job_type",
]);

type MetricKind = "counter" | "gauge" | "histogram";
type MetricDefinition = {
  name: string;
  help: string;
  kind: MetricKind;
  labels?: string[];
};

export const OBSERVABILITY_METRIC_DEFINITIONS: ReadonlyArray<MetricDefinition> =
  [
    {
      name: "http_requests_total",
      help: "Completed API requests",
      kind: "counter",
      labels: ["route", "status_class"],
    },
    {
      name: "http_request_errors_total",
      help: "API requests with a 5xx response",
      kind: "counter",
      labels: ["route", "status_class"],
    },
    {
      name: "http_request_duration_ms",
      help: "API request duration in milliseconds",
      kind: "histogram",
      labels: ["route"],
    },
    {
      name: "auth_failures_total",
      help: "Authentication failures",
      kind: "counter",
      labels: ["component"],
    },
    {
      name: "authorization_denials_total",
      help: "Authorization denials",
      kind: "counter",
      labels: ["component"],
    },
    {
      name: "tenant_denials_total",
      help: "Tenant-isolation denials",
      kind: "counter",
      labels: ["component"],
    },
    {
      name: "database_readiness",
      help: "Database readiness (1 ready, 0 unavailable)",
      kind: "gauge",
    },
    {
      name: "database_errors_total",
      help: "Database failures",
      kind: "counter",
      labels: ["component"],
    },
    {
      name: "database_query_duration_ms",
      help: "Database query duration in milliseconds",
      kind: "histogram",
      labels: ["component"],
    },
    {
      name: "ledger_imbalance_total",
      help: "Detected ledger invariant failures",
      kind: "counter",
    },
    {
      name: "idempotency_conflict_total",
      help: "Rejected idempotency conflicts",
      kind: "counter",
    },
    {
      name: "negative_balance_prevention_total",
      help: "Prevented negative balances",
      kind: "counter",
    },
    {
      name: "protected_capital_denial_total",
      help: "Protected capital denials",
      kind: "counter",
    },
    {
      name: "safe_to_deploy_invariant_failure_total",
      help: "Safe-to-deploy invariant failures",
      kind: "counter",
    },
    {
      name: "audit_persistence_failure_total",
      help: "Audit persistence failures",
      kind: "counter",
    },
    {
      name: "queue_depth",
      help: "Durable operations queue depth",
      kind: "gauge",
    },
    {
      name: "oldest_pending_job_age",
      help: "Age of oldest pending job in milliseconds",
      kind: "gauge",
    },
    {
      name: "retry_queue_depth",
      help: "Durable retry queue depth",
      kind: "gauge",
    },
    {
      name: "dead_letter_count",
      help: "Durable dead-letter count",
      kind: "gauge",
    },
    {
      name: "active_worker_count",
      help: "Active durable workers",
      kind: "gauge",
    },
    {
      name: "stale_worker_count",
      help: "Stale durable workers",
      kind: "gauge",
    },
    {
      name: "worker_heartbeat_age",
      help: "Oldest worker heartbeat age in milliseconds",
      kind: "gauge",
    },
    {
      name: "job_execution_duration",
      help: "Mean job execution duration in milliseconds",
      kind: "gauge",
    },
    { name: "job_failure_count", help: "Durable job failures", kind: "gauge" },
    { name: "job_retry_count", help: "Durable job retries", kind: "gauge" },
    {
      name: "recovered_job_count",
      help: "Recovered durable jobs",
      kind: "gauge",
    },
    {
      name: "scheduler_heartbeat",
      help: "Scheduler heartbeat present",
      kind: "gauge",
    },
    {
      name: "scheduler_leader",
      help: "Scheduler leader present",
      kind: "gauge",
    },
    {
      name: "scheduler_lag",
      help: "Scheduler lag in milliseconds",
      kind: "gauge",
    },
    { name: "missed_schedule_count", help: "Missed schedules", kind: "gauge" },
    {
      name: "schedule_recovery_count",
      help: "Recovered schedules",
      kind: "gauge",
    },
    {
      name: "execution_state",
      help: "Execution control state indicator",
      kind: "gauge",
      labels: ["state"],
    },
    {
      name: "guardian_state",
      help: "Guardian state indicator",
      kind: "gauge",
      labels: ["state"],
    },
    {
      name: "risk_governor_state",
      help: "Risk governor state indicator",
      kind: "gauge",
      labels: ["state"],
    },
    { name: "oms_unknown_orders", help: "Unknown OMS orders", kind: "gauge" },
    {
      name: "open_order_intents",
      help: "Open OMS order intents",
      kind: "gauge",
    },
    {
      name: "reconciliation_mismatch_total",
      help: "Reconciliation mismatches",
      kind: "counter",
    },
    {
      name: "reconciliation_failure_total",
      help: "Reconciliation failures",
      kind: "counter",
    },
    { name: "execution_stop_total", help: "Execution stops", kind: "counter" },
    { name: "execution_lock_total", help: "Execution locks", kind: "counter" },
    {
      name: "micro_live_enabled",
      help: "Micro-Live is always disabled unless separately authorized",
      kind: "gauge",
    },
    {
      name: "micro_live_eligible",
      help: "Micro-Live eligibility",
      kind: "gauge",
    },
    {
      name: "micro_live_guardian_health",
      help: "Micro-Live Guardian health",
      kind: "gauge",
    },
    {
      name: "micro_live_reconciliation_health",
      help: "Micro-Live reconciliation health",
      kind: "gauge",
    },
    {
      name: "provider_health",
      help: "Provider health",
      kind: "gauge",
      labels: ["provider"],
    },
    {
      name: "provider_request_errors_total",
      help: "Provider request errors",
      kind: "counter",
      labels: ["provider"],
    },
    {
      name: "provider_request_duration_ms",
      help: "Provider request duration",
      kind: "histogram",
      labels: ["provider"],
    },
    {
      name: "provider_rate_limit_total",
      help: "Provider rate limits",
      kind: "counter",
      labels: ["provider"],
    },
    {
      name: "provider_auth_failure_total",
      help: "Provider authentication failures",
      kind: "counter",
      labels: ["provider"],
    },
    {
      name: "provider_reconnect_total",
      help: "Provider reconnects",
      kind: "counter",
      labels: ["provider"],
    },
    {
      name: "bank_connection_status",
      help: "Read-only bank connection status",
      kind: "gauge",
      labels: ["provider"],
    },
    {
      name: "bank_sync_errors_total",
      help: "Bank sync errors",
      kind: "counter",
      labels: ["provider"],
    },
    {
      name: "bank_sync_age",
      help: "Bank sync age in milliseconds",
      kind: "gauge",
      labels: ["provider"],
    },
    {
      name: "bank_webhook_failures_total",
      help: "Bank webhook failures",
      kind: "counter",
      labels: ["provider"],
    },
    {
      name: "bank_duplicate_event_total",
      help: "Rejected duplicate bank events",
      kind: "counter",
      labels: ["provider"],
    },
    {
      name: "bank_replay_rejection_total",
      help: "Rejected bank event replays",
      kind: "counter",
      labels: ["provider"],
    },
  ];

const values = new Map<string, number>();
const key = (name: string, labels: Labels) =>
  `${name}\0${Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(",")}`;

function safeLabels(labels: Labels = {}): Labels {
  for (const [name, value] of Object.entries(labels)) {
    if (
      !allowedLabels.has(name) ||
      !labelName.test(name) ||
      !labelValue.test(value)
    ) {
      throw new Error("Unsafe or unsupported observability metric label");
    }
  }
  return labels;
}

export function recordMetric(name: string, value = 1, labels: Labels = {}) {
  const definition = OBSERVABILITY_METRIC_DEFINITIONS.find(
    (item) => item.name === name,
  );
  if (!definition || !Number.isFinite(value))
    throw new Error("Unknown or invalid observability metric");
  const safe = safeLabels(labels);
  const expected = definition.labels ?? [];
  if (Object.keys(safe).some((name) => !expected.includes(name)))
    throw new Error("Metric label is not declared");
  const metricKey = key(name, safe);
  values.set(metricKey, (values.get(metricKey) ?? 0) + value);
}

export function setMetric(name: string, value: number, labels: Labels = {}) {
  const definition = OBSERVABILITY_METRIC_DEFINITIONS.find(
    (item) => item.name === name,
  );
  if (!definition || !Number.isFinite(value))
    throw new Error("Unknown or invalid observability metric");
  const safe = safeLabels(labels);
  const expected = definition.labels ?? [];
  if (Object.keys(safe).some((label) => !expected.includes(label)))
    throw new Error("Metric label is not declared");
  values.set(key(name, labels), value);
}

export function metricValue(name: string, labels: Labels = {}) {
  return values.get(key(name, safeLabels(labels))) ?? 0;
}

export function metricSnapshot() {
  return Object.fromEntries(
    [...values.entries()].map(([metricKey, value]) => [
      metricKey.replace("\0", "|"),
      value,
    ]),
  );
}

export function resetMetricsForCertification() {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.CAPITAL_OS_CERTIFICATION_MODE !== "1"
  ) {
    throw new Error("Metric reset is certification-only");
  }
  values.clear();
  setMetric("micro_live_enabled", 0);
}

function routeForMetric(req: Request) {
  const route = req.route?.path;
  if (typeof route !== "string") return "unmatched";
  return (
    req.baseUrl +
    route
      .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id")
      .replace(/\/\d+(?=\/|$)/g, "/:id")
  );
}

export function apiMetrics(req: Request, res: Response, next: NextFunction) {
  const started = process.hrtime.bigint();
  res.once("finish", () => {
    const route = routeForMetric(req);
    const statusClass = `${Math.floor(res.statusCode / 100)}xx`;
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;
    recordMetric("http_requests_total", 1, {
      route,
      status_class: statusClass,
    });
    recordMetric("http_request_duration_ms", elapsedMs, { route });
    if (res.statusCode >= 500)
      recordMetric("http_request_errors_total", 1, {
        route,
        status_class: statusClass,
      });
  });
  next();
}

export function metricsOpenMetrics(): string {
  const lines: string[] = [];
  for (const definition of OBSERVABILITY_METRIC_DEFINITIONS) {
    lines.push(
      `# HELP ${definition.name} ${definition.help}`,
      `# TYPE ${definition.name} ${definition.kind === "histogram" ? "summary" : definition.kind}`,
    );
    const entries = [...values.entries()].filter(([metricKey]) =>
      metricKey.startsWith(`${definition.name}\0`),
    );
    if (!entries.length) lines.push(`${definition.name} 0`);
    for (const [metricKey, value] of entries) {
      const encoded = metricKey.split("\0")[1];
      const labels = encoded
        ? `{${encoded
            .split(",")
            .map((entry) => {
              const [name, label] = entry.split("=");
              return `${name}="${label}"`;
            })
            .join(",")}}`
        : "";
      lines.push(`${definition.name}${labels} ${value}`);
    }
  }
  return `${lines.join("\n")}\n# EOF\n`;
}

setMetric("micro_live_enabled", 0);
