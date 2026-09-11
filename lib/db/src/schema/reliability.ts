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

/** Database-backed copy written by the application audit boundary. */
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
  canonicalVersion: integer("canonical_version").notNull().default(1),
  chainScope: text("chain_scope").notNull().default("household"),
  chainKey: text("chain_key"),
  sequence: integer("sequence"),
  previousHash: text("previous_hash"),
  eventHash: text("event_hash"),
});

/** The serialized tail of each audit chain. One row per household (or system scope). */
export const auditChainHeads = pgTable("audit_chain_heads", {
  chainKey: text("chain_key"),
  chainScope: text("chain_scope"),
  householdId: text("household_id"),
  sequence: integer("sequence"),
  eventHash: text("event_hash"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  pk: uniqueIndex("audit_chain_heads_chain_key_unique").on(table.chainKey),
}));

/** Explicit operator-run progress for the bounded legacy audit migration. */
export const auditBackfillState = pgTable("audit_backfill_state", {
  scope: text("scope").primaryKey(),
  status: text("status").notNull().default("PENDING"),
  cursor: text("cursor"),
  processed: integer("processed").notNull().default(0),
  lastError: text("last_error"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const auditVerificationState = pgTable("audit_verification_state", {
  scope: text("scope").primaryKey(),
  status: text("status").notNull().default("PENDING"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  sourceCount: integer("source_count").notNull().default(0),
  archiveCount: integer("archive_count").notNull().default(0),
  highWaterTimestamp: timestamp("high_water_timestamp", { withTimezone: true }),
  highWaterDigest: text("high_water_digest"),
  failureReason: text("failure_reason"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type RateLimitBucket = typeof rateLimitBuckets.$inferSelect;
export type AuditEventArchive = typeof auditEventArchive.$inferSelect;
export type AuditChainHead = typeof auditChainHeads.$inferSelect;
export type AuditBackfillState = typeof auditBackfillState.$inferSelect;
export type AuditVerificationState = typeof auditVerificationState.$inferSelect;

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