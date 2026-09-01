import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { households, users } from "./households";
import { recommendationStatusEnum, safetyStateEnum } from "./enums";

export const riskStates = pgTable("risk_states", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .unique()
    .references(() => households.id, { onDelete: "cascade" }),
  state: safetyStateEnum("state").notNull().default("normal"),
  maxActiveCapital: numeric("max_active_capital", { precision: 18, scale: 2 }).notNull().default("0"),
  maxStrategyAllocation: numeric("max_strategy_allocation", { precision: 18, scale: 2 }).notNull().default("0"),
  maxWeeklyRisk: numeric("max_weekly_risk", { precision: 8, scale: 4 }).notNull().default("0"),
  maxDrawdown: numeric("max_drawdown", { precision: 8, scale: 4 }).notNull().default("0"),
  minimumCashReserve: numeric("minimum_cash_reserve", { precision: 18, scale: 2 }).notNull().default("0"),
  protectedCapitalLocked: boolean("protected_capital_locked").notNull().default(true),
  emergencyStopActive: boolean("emergency_stop_active").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const riskEvents = pgTable(
  "risk_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    rule: text("rule").notNull(),
    severity: text("severity").notNull(),
    message: text("message").notNull(),
    blocked: boolean("blocked").notNull().default(false),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("risk_events_household_idx").on(table.householdId),
  }),
);

export const aiRecommendations = pgTable(
  "ai_recommendations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    recommendation: text("recommendation").notNull(),
    rationale: text("rationale").notNull(),
    expectedBenefit: text("expected_benefit").notNull(),
    riskImpact: text("risk_impact").notNull(),
    affectedGoalId: uuid("affected_goal_id"),
    affectedCapital: text("affected_capital"),
    evidence: jsonb("evidence").$type<string[]>().notNull().default([]),
    confidence: numeric("confidence", { precision: 5, scale: 2 }).notNull().default("0"),
    status: recommendationStatusEnum("status").notNull().default("proposed"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
  },
  (table) => ({
    householdIdx: index("ai_recommendations_household_idx").on(table.householdId),
  }),
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    actor: text("actor").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    beforeState: jsonb("before_state").$type<Record<string, unknown> | null>(),
    afterState: jsonb("after_state").$type<Record<string, unknown> | null>(),
    reason: text("reason"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("audit_events_household_idx").on(table.householdId),
    timestampIdx: index("audit_events_timestamp_idx").on(table.timestamp),
  }),
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    operation: text("operation").notNull(),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueKey: uniqueIndex("idempotency_keys_household_key_unique").on(table.householdId, table.key),
  }),
);

export type RiskState = typeof riskStates.$inferSelect;
export type AIRecommendation = typeof aiRecommendations.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;