import {
  boolean,
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { households, users } from "./households";
import { milestoneStatusEnum, propertyStatusEnum, strategyStageEnum } from "./enums";

const money = (name: string) => numeric(name, { precision: 18, scale: 2 }).notNull().default("0");

export const propertyGoals = pgTable("property_goals", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  targetMarket: text("target_market"),
  targetBudget: money("target_budget"),
  estimatedDownPayment: money("estimated_down_payment"),
  estimatedClosingCosts: money("estimated_closing_costs"),
  readinessScore: numeric("readiness_score", { precision: 5, scale: 2 }).notNull().default("0"),
  targetDate: date("target_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const targetMarkets = pgTable(
  "target_markets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    score: numeric("score", { precision: 5, scale: 2 }).notNull().default("0"),
    medianPrice: money("median_price"),
    rentYield: numeric("rent_yield", { precision: 6, scale: 3 }).notNull().default("0"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("target_markets_household_idx").on(table.householdId),
  }),
);

export const propertyCandidates = pgTable(
  "property_candidates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    propertyGoalId: uuid("property_goal_id")
      .notNull()
      .references(() => propertyGoals.id, { onDelete: "cascade" }),
    marketId: uuid("market_id").references(() => targetMarkets.id),
    addressLabel: text("address_label").notNull(),
    propertyType: text("property_type").notNull().default("duplex"),
    units: numeric("units", { precision: 4, scale: 0 }).notNull().default("2"),
    bedrooms: numeric("bedrooms", { precision: 4, scale: 0 }).notNull().default("4"),
    askingPrice: money("asking_price"),
    estimatedRent: money("estimated_rent"),
    downPayment: money("down_payment"),
    closingCosts: money("closing_costs"),
    repairs: money("repairs"),
    financingEstimate: money("financing_estimate"),
    cashRequired: money("cash_required"),
    projectedCashFlow: money("projected_cash_flow"),
    status: propertyStatusEnum("status").notNull().default("research"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    goalIdx: index("property_candidates_goal_idx").on(table.propertyGoalId),
  }),
);

export const propertyMilestones = pgTable(
  "property_milestones",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    propertyGoalId: uuid("property_goal_id")
      .notNull()
      .references(() => propertyGoals.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: milestoneStatusEnum("status").notNull().default("future"),
    progress: numeric("progress", { precision: 5, scale: 2 }).notNull().default("0"),
    target: text("target"),
    currentState: text("current_state"),
    nextAction: text("next_action"),
    dueDate: date("due_date"),
    sortOrder: numeric("sort_order", { precision: 4, scale: 0 }).notNull().default("0"),
  },
  (table) => ({
    goalIdx: index("property_milestones_goal_idx").on(table.propertyGoalId),
  }),
);

export const propertyNotes = pgTable("property_notes", {
  id: uuid("id").defaultRandom().primaryKey(),
  propertyGoalId: uuid("property_goal_id")
    .notNull()
    .references(() => propertyGoals.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const propertyDocuments = pgTable("property_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  propertyGoalId: uuid("property_goal_id")
    .notNull()
    .references(() => propertyGoals.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  storagePath: text("storage_path"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const strategies = pgTable(
  "strategies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    strategyType: text("strategy_type").notNull(),
    stage: strategyStageEnum("stage").notNull().default("research"),
    allocation: money("allocation"),
    expectedEdge: numeric("expected_edge", { precision: 8, scale: 4 }).notNull().default("0"),
    maxDrawdown: numeric("max_drawdown", { precision: 8, scale: 4 }).notNull().default("0"),
    confidenceScore: numeric("confidence_score", { precision: 5, scale: 2 }).notNull().default("0"),
    riskLevel: text("risk_level").notNull().default("low"),
    runtimeDays: numeric("runtime_days", { precision: 8, scale: 0 }).notNull().default("0"),
    enabled: boolean("enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("strategies_household_idx").on(table.householdId),
  }),
);

export const strategyVersions = pgTable("strategy_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  strategyId: uuid("strategy_id")
    .notNull()
    .references(() => strategies.id, { onDelete: "cascade" }),
  version: text("version").notNull(),
  configuration: jsonb("configuration").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const strategyPerformance = pgTable("strategy_performance", {
  id: uuid("id").defaultRandom().primaryKey(),
  strategyId: uuid("strategy_id")
    .notNull()
    .references(() => strategies.id, { onDelete: "cascade" }),
  observations: numeric("observations", { precision: 12, scale: 0 }).notNull().default("0"),
  fills: numeric("fills", { precision: 12, scale: 0 }).notNull().default("0"),
  runtimeHours: numeric("runtime_hours", { precision: 12, scale: 2 }).notNull().default("0"),
  expectancy: numeric("expectancy", { precision: 12, scale: 6 }).notNull().default("0"),
  drawdown: numeric("drawdown", { precision: 12, scale: 6 }).notNull().default("0"),
  reconciliationAccuracy: numeric("reconciliation_accuracy", { precision: 8, scale: 5 }).notNull().default("0"),
  criticalErrorCount: numeric("critical_error_count", { precision: 8, scale: 0 }).notNull().default("0"),
  capturedAt: timestamp("captured_at", { withTimezone: true }).defaultNow().notNull(),
});

export const strategyApprovals = pgTable("strategy_approvals", {
  id: uuid("id").defaultRandom().primaryKey(),
  strategyId: uuid("strategy_id")
    .notNull()
    .references(() => strategies.id, { onDelete: "cascade" }),
  fromStage: strategyStageEnum("from_stage").notNull(),
  toStage: strategyStageEnum("to_stage").notNull(),
  approvedBy: uuid("approved_by").references(() => users.id),
  evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PropertyGoal = typeof propertyGoals.$inferSelect;
export type PropertyMilestone = typeof propertyMilestones.$inferSelect;
export type Strategy = typeof strategies.$inferSelect;