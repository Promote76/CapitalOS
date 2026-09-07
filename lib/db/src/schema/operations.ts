import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { households, users } from "./households.ts";

export const operationsTasks = pgTable(
  "operations_tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    domain: text("domain").notNull(),
    priority: text("priority").notNull().default("MEDIUM"),
    status: text("status").notNull().default("OPEN"),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    assignedTo: uuid("assigned_to").references(() => users.id),
    createdBy: uuid("created_by").notNull().references(() => users.id),
    source: text("source").notNull().default("USER"),
    relatedEntityType: text("related_entity_type"),
    relatedEntityId: text("related_entity_id"),
    requiresApproval: boolean("requires_approval").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: uuid("completed_by").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => ({
    householdStatusIdx: index("operations_tasks_household_status_idx").on(table.householdId, table.status),
    dueDateIdx: index("operations_tasks_due_date_idx").on(table.householdId, table.dueDate),
  }),
);

export const operationsApprovals = pgTable(
  "operations_approvals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    requestType: text("request_type").notNull(),
    requestedBy: uuid("requested_by").notNull().references(() => users.id),
    relatedEntity: text("related_entity").notNull(),
    currentState: text("current_state").notNull(),
    proposedState: text("proposed_state").notNull(),
    financialImpact: text("financial_impact").notNull(),
    riskImpact: text("risk_impact").notNull(),
    duplexImpact: text("duplex_impact").notNull(),
    reason: text("reason").notNull(),
    evidence: jsonb("evidence").$type<string[]>().notNull().default([]),
    requiredAuthority: text("required_authority").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    status: text("status").notNull().default("PENDING"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (table) => ({
    householdStatusIdx: index("operations_approvals_household_status_idx").on(table.householdId, table.status),
  }),
);

export const operationsAlerts = pgTable(
  "operations_alerts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    alertKey: text("alert_key").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    severity: text("severity").notNull().default("INFO"),
    domain: text("domain").notNull(),
    status: text("status").notNull().default("ACTIVE"),
    occurrenceCount: integer("occurrence_count").notNull().default(1),
    firstSeen: timestamp("first_seen", { withTimezone: true }).defaultNow().notNull(),
    lastSeen: timestamp("last_seen", { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => ({
    householdAlertKeyUnique: uniqueIndex("operations_alerts_household_key_unique").on(table.householdId, table.alertKey),
    householdStatusIdx: index("operations_alerts_household_status_idx").on(table.householdId, table.status),
  }),
);

export const operationsAutomations = pgTable(
  "operations_automations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    trigger: text("trigger").notNull(),
    conditions: jsonb("conditions").$type<Record<string, unknown>>().notNull().default({}),
    action: text("action").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    protected: boolean("protected").notNull().default(false),
    priority: integer("priority").notNull().default(100),
    lastRun: timestamp("last_run", { withTimezone: true }),
    nextRun: timestamp("next_run", { withTimezone: true }),
    createdBy: uuid("created_by").notNull().references(() => users.id),
  },
  (table) => ({
    householdIdx: index("operations_automations_household_idx").on(table.householdId),
  }),
);

export const operationsRuns = pgTable(
  "operations_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    automationId: uuid("automation_id").notNull().references(() => operationsAutomations.id, { onDelete: "cascade" }),
    result: text("result").notNull(),
    actionsCreated: jsonb("actions_created").$type<string[]>().notNull().default([]),
    errors: jsonb("errors").$type<string[]>().notNull().default([]),
    safeBoundary: text("safe_boundary").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("operations_runs_household_idx").on(table.householdId),
  }),
);

export const operationsDecisionJournalEntries = pgTable(
  "operations_decision_journal_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").notNull().references(() => users.id),
    entryType: text("entry_type").notNull().default("DECISION"),
    title: text("title").notNull(),
    decisionContext: text("decision_context").notNull(),
    outcome: text("outcome"),
    evidenceLinks: jsonb("evidence_links").$type<string[]>().notNull().default([]),
    unresolvedBlockers: jsonb("unresolved_blockers").$type<string[]>().notNull().default([]),
    relatedEntityType: text("related_entity_type"),
    relatedEntityId: text("related_entity_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdCreatedIdx: index("operations_decision_journal_household_created_idx").on(table.householdId, table.createdAt),
    householdTypeIdx: index("operations_decision_journal_household_type_idx").on(table.householdId, table.entryType),
  }),
);

export const operationsGuidedRuns = pgTable(
  "operations_guided_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    runDate: date("run_date", { mode: "string" }).notNull(),
    cadence: text("cadence").notNull(),
    status: text("status").notNull().default("NOT_STARTED"),
    latestReason: text("latest_reason"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    createdBy: uuid("created_by").notNull().references(() => users.id),
    updatedBy: uuid("updated_by").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdDateCadenceUnique: uniqueIndex("operations_guided_runs_household_date_cadence_unique").on(table.householdId, table.runDate, table.cadence),
    householdStatusIdx: index("operations_guided_runs_household_status_idx").on(table.householdId, table.status),
  }),
);

export const operationsGuidedRunEvents = pgTable(
  "operations_guided_run_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    guidedRunId: uuid("guided_run_id").notNull().references(() => operationsGuidedRuns.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    action: text("action").notNull(),
    reason: text("reason").notNull(),
    actorId: uuid("actor_id").notNull().references(() => users.id),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdempotencyKeyUnique: uniqueIndex("operations_guided_run_events_household_idempotency_key_unique").on(table.householdId, table.idempotencyKey),
    householdOccurredIdx: index("operations_guided_run_events_household_occurred_idx").on(table.householdId, table.occurredAt),
    guidedRunOccurredIdx: index("operations_guided_run_events_run_occurred_idx").on(table.guidedRunId, table.occurredAt),
  }),
);

export const operationsJobs = pgTable(
  "operations_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    jobKey: text("job_key").notNull(),
    kind: text("kind").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("QUEUED"),
    priority: integer("priority").notNull().default(100),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    claimedBy: text("claimed_by"),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    idempotencyKey: text("idempotency_key"),
    correlationId: text("correlation_id"),
    payloadReference: text("payload_reference"),
    lastError: text("last_error"),
    deadLetterReason: text("dead_letter_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    householdJobKeyUnique: uniqueIndex("operations_jobs_household_job_key_unique").on(table.householdId, table.jobKey),
    idempotencyUnique: uniqueIndex("operations_jobs_household_idempotency_unique").on(table.householdId, table.idempotencyKey),
    claimIdx: index("operations_jobs_claim_idx").on(table.status, table.availableAt),
    householdStatusIdx: index("operations_jobs_household_status_idx").on(table.householdId, table.status),
  }),
);

/** Immutable record of each lease/attempt. Payloads are intentionally absent. */
export const operationsJobAttempts = pgTable(
  "operations_job_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id").notNull().references(() => operationsJobs.id, { onDelete: "cascade" }),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    attempt: integer("attempt").notNull(),
    workerId: text("worker_id").notNull(),
    status: text("status").notNull().default("LEASED"),
    classification: text("classification"),
    error: text("error"),
    leasedAt: timestamp("leased_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  },
  (table) => ({
    jobAttemptUnique: uniqueIndex("operations_job_attempts_job_attempt_unique").on(table.jobId, table.attempt),
    householdIdx: index("operations_job_attempts_household_idx").on(table.householdId, table.leasedAt),
  }),
);

export const operationsWorkers = pgTable("operations_workers", {
  workerId: text("worker_id").primaryKey(),
  status: text("status").notNull().default("STARTING"),
  currentJobId: uuid("current_job_id").references(() => operationsJobs.id, { onDelete: "set null" }),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }).defaultNow().notNull(),
  version: text("version").notNull().default("unknown"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const operationsSchedulers = pgTable("operations_schedulers", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  jobKind: text("job_kind").notNull(),
  cadence: text("cadence").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  missedRunPolicy: text("missed_run_policy").notNull().default("SKIP"),
  enabled: boolean("enabled").notNull().default(true),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  householdNameUnique: uniqueIndex("operations_schedulers_household_name_unique").on(table.householdId, table.name),
  dueIdx: index("operations_schedulers_due_idx").on(table.enabled, table.nextRunAt),
}));

export const operationsSchedulerLeases = pgTable("operations_scheduler_leases", {
  singleton: text("singleton").primaryKey().default("operations"),
  ownerId: text("owner_id").notNull(),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }).notNull(),
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }).defaultNow().notNull(),
});

export const operationsMetrics = pgTable("operations_metrics", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").references(() => households.id, { onDelete: "cascade" }),
  metric: text("metric").notNull(),
  value: integer("value").notNull().default(0),
  observedAt: timestamp("observed_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  metricIdx: index("operations_metrics_metric_observed_idx").on(table.metric, table.observedAt),
}));

export const operationsNotificationPreferences = pgTable(
  "operations_notification_preferences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    criticalAlerts: jsonb("critical_alerts").$type<string[]>().notNull().default(["in_app", "email"]),
    bills: jsonb("bills").$type<string[]>().notNull().default(["in_app"]),
    budget: jsonb("budget").$type<string[]>().notNull().default(["in_app"]),
    duplexGoal: jsonb("duplex_goal").$type<string[]>().notNull().default(["in_app", "email"]),
    property: jsonb("property").$type<string[]>().notNull().default(["in_app"]),
    strategies: jsonb("strategies").$type<string[]>().notNull().default(["in_app"]),
    accounting: jsonb("accounting").$type<string[]>().notNull().default(["in_app"]),
    security: jsonb("security").$type<string[]>().notNull().default(["in_app", "email"]),
    weeklyReports: jsonb("weekly_reports").$type<string[]>().notNull().default(["in_app", "email"]),
    monthlyReports: jsonb("monthly_reports").$type<string[]>().notNull().default(["in_app", "email"]),
    quietHoursStart: text("quiet_hours_start"),
    quietHoursEnd: text("quiet_hours_end"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdUserUnique: uniqueIndex("operations_notification_preferences_household_user_unique").on(table.householdId, table.userId),
  }),
);

export type OperationsTask = typeof operationsTasks.$inferSelect;
export type OperationsApproval = typeof operationsApprovals.$inferSelect;
export type OperationsAlert = typeof operationsAlerts.$inferSelect;
export type OperationsAutomation = typeof operationsAutomations.$inferSelect;
export type OperationsRun = typeof operationsRuns.$inferSelect;
export type OperationsDecisionJournalEntry = typeof operationsDecisionJournalEntries.$inferSelect;
export type OperationsGuidedRun = typeof operationsGuidedRuns.$inferSelect;
export type OperationsGuidedRunEvent = typeof operationsGuidedRunEvents.$inferSelect;
export type OperationsJob = typeof operationsJobs.$inferSelect;
export type OperationsJobAttempt = typeof operationsJobAttempts.$inferSelect;
export type OperationsWorker = typeof operationsWorkers.$inferSelect;
export type OperationsScheduler = typeof operationsSchedulers.$inferSelect;
export type OperationsMetric = typeof operationsMetrics.$inferSelect;
export type OperationsNotificationPreferences = typeof operationsNotificationPreferences.$inferSelect;