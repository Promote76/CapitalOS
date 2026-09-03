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
import { households, users } from "./households.ts";
import { recommendationStatusEnum, safetyStateEnum } from "./enums.ts";

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
    analyst: text("analyst").notNull().default("AI CIO"),
    priority: text("priority").notNull().default("medium"),
    rationale: text("rationale").notNull(),
    expectedBenefit: text("expected_benefit").notNull(),
    potentialDownside: text("potential_downside").notNull().default("No material downside identified."),
    riskImpact: text("risk_impact").notNull(),
    dataQuality: text("data_quality").notNull().default("medium"),
    suggestedNextAction: text("suggested_next_action"),
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

export const aiAnalyses = pgTable(
  "ai_analyses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    analyst: text("analyst").notNull(),
    scope: text("scope").notNull(),
    summary: text("summary").notNull(),
    dataQuality: text("data_quality").notNull().default("medium"),
    confidence: numeric("confidence", { precision: 5, scale: 2 }).notNull().default("0"),
    evidence: jsonb("evidence").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("ai_analyses_household_idx").on(table.householdId),
  }),
);

export const aiInsights = pgTable(
  "ai_insights",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    severity: text("severity").notNull().default("low"),
    evidence: jsonb("evidence").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("ai_insights_household_idx").on(table.householdId),
  }),
);

export const recommendationFeedback = pgTable(
  "recommendation_feedback",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    recommendationId: uuid("recommendation_id").notNull().references(() => aiRecommendations.id, { onDelete: "cascade" }),
    feedback: text("feedback").notNull(),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("recommendation_feedback_household_idx").on(table.householdId),
    recommendationIdx: index("recommendation_feedback_recommendation_idx").on(table.recommendationId),
  }),
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
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
export type AIAnalysis = typeof aiAnalyses.$inferSelect;
export type AIInsight = typeof aiInsights.$inferSelect;
export type RecommendationFeedback = typeof recommendationFeedback.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;