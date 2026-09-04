import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { households, users } from "./households.ts";

/**
 * Shared coordination state for the API rate limiter. The row is updated with
 * one PostgreSQL upsert, so separate API processes contend on the same row
 * instead of maintaining independent in-memory counters.
 */
export const rateLimitBuckets = pgTable("rate_limit_buckets", {
  bucketKey: text("bucket_key").primaryKey(),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
  requestCount: integer("request_count").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

/**
 * Database-backed immutable copy of every application audit event. Inserts
 * are performed by the audit_events trigger in the migration; application
 * code should continue writing only to auditEvents.
 */
export const auditEventArchive = pgTable("audit_events_archive", {
  eventId: text("event_id").primaryKey(),
  householdId: text("household_id").notNull(),
  eventType: text("event_type").notNull(),
  actor: text("actor").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  beforeState: jsonb("before_state").$type<Record<string, unknown> | null>(),
  afterState: jsonb("after_state").$type<Record<string, unknown> | null>(),
  reason: text("reason"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
  eventTimestamp: timestamp("event_timestamp", { withTimezone: true }).notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }).notNull(),
});

export type RateLimitBucket = typeof rateLimitBuckets.$inferSelect;
export type AuditEventArchive = typeof auditEventArchive.$inferSelect;

/** Persisted operational alert policy. Targets contain no credentials. */
export const observabilityAlertRules = pgTable("observability_alert_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  ruleKey: text("rule_key").notNull().unique(),
  metric: text("metric").notNull(),
  severity: text("severity").notNull(),
  threshold: integer("threshold").notNull().default(1),
  dedupeWindowSeconds: integer("dedupe_window_seconds").notNull().default(300),
  enabled: boolean("enabled").notNull().default(true),
  createdBy: uuid("created_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const observabilityAlertDestinations = pgTable("observability_alert_destinations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  kind: text("kind").notNull().default("slack"),
  target: text("target").notNull(), // channel ID or auth.test user ID only; never a credential
  enabled: boolean("enabled").notNull().default(true),
  createdBy: uuid("created_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const observabilityAlertIncidents = pgTable("observability_alert_incidents", {
  id: uuid("id").defaultRandom().primaryKey(),
  ruleId: uuid("rule_id").notNull().references(() => observabilityAlertRules.id),
  householdId: uuid("household_id").references(() => households.id, { onDelete: "cascade" }),
  correlationId: text("correlation_id"),
  severity: text("severity").notNull(),
  status: text("status").notNull().default("OPEN"),
  occurrenceCount: integer("occurrence_count").notNull().default(1),
  openedAt: timestamp("opened_at", { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: uuid("resolved_by").references(() => users.id),
  note: text("note"),
}, (table) => ({
  openRuleIdx: index("observability_incidents_open_rule_idx").on(table.ruleId, table.status),
}));

export const observabilityAlertDeliveries = pgTable("observability_alert_deliveries", {
  id: uuid("id").defaultRandom().primaryKey(),
  incidentId: uuid("incident_id").notNull().references(() => observabilityAlertIncidents.id, { onDelete: "cascade" }),
  destinationId: uuid("destination_id").notNull().references(() => observabilityAlertDestinations.id),
  attempt: integer("attempt").notNull().default(1),
  status: text("status").notNull().default("PENDING"),
  correlationId: text("correlation_id"),
  providerReceipt: text("provider_receipt"),
  errorCode: text("error_code"),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  incidentAttemptUnique: uniqueIndex("observability_delivery_incident_attempt_unique").on(table.incidentId, table.destinationId, table.attempt),
}));

export type ObservabilityAlertRule = typeof observabilityAlertRules.$inferSelect;
export type ObservabilityAlertIncident = typeof observabilityAlertIncidents.$inferSelect;
export type ObservabilityAlertDestination = typeof observabilityAlertDestinations.$inferSelect;
export type ObservabilityAlertDelivery = typeof observabilityAlertDeliveries.$inferSelect;