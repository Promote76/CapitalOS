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

export const operationsJobs = pgTable(
  "operations_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    jobKey: text("job_key").notNull(),
    kind: text("kind").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("QUEUED"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    claimedBy: text("claimed_by"),
    lastError: text("last_error"),
    deadLetterReason: text("dead_letter_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    householdJobKeyUnique: uniqueIndex("operations_jobs_household_job_key_unique").on(table.householdId, table.jobKey),
    claimIdx: index("operations_jobs_claim_idx").on(table.status, table.availableAt),
    householdStatusIdx: index("operations_jobs_household_status_idx").on(table.householdId, table.status),
  }),
);

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
export type OperationsJob = typeof operationsJobs.$inferSelect;
export type OperationsNotificationPreferences = typeof operationsNotificationPreferences.$inferSelect;