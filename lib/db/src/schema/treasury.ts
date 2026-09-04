import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import {
  capitalRequestStatusEnum,
  liquidityClassEnum,
  riskClassEnum,
  treasuryBucketTypeEnum,
} from "./enums.ts";
import { households, users } from "./households.ts";
import { strategies } from "./property-strategy.ts";

const money = (name: string) =>
  numeric(name, { precision: 18, scale: 2 }).notNull().default("0");

export const treasuryBuckets = pgTable(
  "treasury_capital_buckets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    bucketType: treasuryBucketTypeEnum("bucket_type").notNull(),
    priority: integer("priority").notNull(),
    targetAmount: money("target_amount"),
    minimumAmount: money("minimum_amount"),
    maximumAmount: money("maximum_amount"),
    currentBalance: money("current_balance"),
    protected: boolean("protected").notNull().default(false),
    liquid: boolean("liquid").notNull().default(true),
    liquidityClass: liquidityClassEnum("liquidity_class").notNull(),
    riskClass: riskClassEnum("risk_class").notNull().default("conservative"),
    withdrawalPolicy: text("withdrawal_policy").notNull(),
    fundingRule: text("funding_rule").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("treasury_buckets_household_idx").on(table.householdId),
    priorityIdx: index("treasury_buckets_household_priority_idx").on(
      table.householdId,
      table.priority,
    ),
  }),
);

export const treasuryPolicies = pgTable(
  "treasury_policies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .unique()
      .references(() => households.id, { onDelete: "cascade" }),
    minimumOperatingCash: money("minimum_operating_cash"),
    emergencyTargetMonths: integer("emergency_target_months").notNull().default(6),
    minimumWeeklyDuplexContribution: money("minimum_weekly_duplex_contribution"),
    maximumStrategyPercent: numeric("maximum_strategy_percent", { precision: 5, scale: 2 })
      .notNull()
      .default("15"),
    maximumSingleStrategyPercent: numeric("maximum_single_strategy_percent", {
      precision: 5,
      scale: 2,
    })
      .notNull()
      .default("5"),
    maximumSingleVenuePercent: numeric("maximum_single_venue_percent", {
      precision: 5,
      scale: 2,
    })
      .notNull()
      .default("5"),
    maximumIlliquidPercent: numeric("maximum_illiquid_percent", { precision: 5, scale: 2 })
      .notNull()
      .default("20"),
    maximumActivePercent: numeric("maximum_active_percent", { precision: 5, scale: 2 })
      .notNull()
      .default("30"),
    autoScale: boolean("auto_scale").notNull().default(false),
    hierarchy: jsonb("hierarchy").$type<string[]>().notNull().default([]),
    version: text("version").notNull().default("1"),
    updatedBy: uuid("updated_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("treasury_policies_household_idx").on(table.householdId),
  }),
);

export const capitalRequests = pgTable(
  "capital_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    requestingModule: text("requesting_module").notNull(),
    strategyId: uuid("strategy_id").references(() => strategies.id, { onDelete: "set null" }),
    requestedAmount: money("requested_amount"),
    purpose: text("purpose").notNull(),
    expectedDuration: text("expected_duration").notNull(),
    riskClass: riskClassEnum("risk_class").notNull(),
    expectedReturnAssumption: text("expected_return_assumption").notNull(),
    liquidityRequirement: text("liquidity_requirement").notNull(),
    currentAllocation: money("current_allocation"),
    requestedNewAllocation: money("requested_new_allocation"),
    evidence: jsonb("evidence").$type<string[]>().notNull().default([]),
    status: capitalRequestStatusEnum("status").notNull().default("SUBMITTED"),
    decisionReason: text("decision_reason"),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("capital_requests_household_idx").on(table.householdId),
    statusIdx: index("capital_requests_household_status_idx").on(
      table.householdId,
      table.status,
    ),
  }),
);

export const capitalReservations = pgTable(
  "capital_reservations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    requestId: uuid("request_id")
      .unique()
      .references(() => capitalRequests.id, { onDelete: "cascade" }),
    bucketId: uuid("bucket_id")
      .notNull()
      .references(() => treasuryBuckets.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    reservedAmount: money("reserved_amount"),
    startsAt: date("starts_at").notNull(),
    expiresAt: date("expires_at"),
    status: text("status").notNull().default("active"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("capital_reservations_household_idx").on(table.householdId),
    requestIdx: index("capital_reservations_request_idx").on(table.requestId),
    bucketIdx: index("capital_reservations_bucket_idx").on(table.bucketId),
  }),
);

export type TreasuryBucket = typeof treasuryBuckets.$inferSelect;
export type TreasuryPolicy = typeof treasuryPolicies.$inferSelect;
export type CapitalRequest = typeof capitalRequests.$inferSelect;
export type CapitalReservation = typeof capitalReservations.$inferSelect;