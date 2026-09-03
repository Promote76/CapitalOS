import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

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