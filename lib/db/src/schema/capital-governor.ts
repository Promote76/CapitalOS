import {
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { households, users } from "./households.ts";

const money = (name: string) => numeric(name, { precision: 18, scale: 2 }).notNull().default("0");

export const capitalGovernorInputSnapshots = pgTable(
  "capital_governor_input_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    asOf: date("as_of", { mode: "string" }).notNull(),
    policyVersion: text("policy_version").notNull(),
    fingerprint: text("fingerprint").notNull(),
    dataReadiness: text("data_readiness").notNull(),
    sourceProvenance: jsonb("source_provenance").$type<Record<string, unknown>>().notNull().default({}),
    input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
    result: jsonb("result").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdDateIdx: index("capital_governor_snapshots_household_date_idx").on(table.householdId, table.asOf),
  }),
);

export const capitalGovernorPolicies = pgTable(
  "capital_governor_policies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    version: text("version").notNull().default("2"),
    householdCashBuffer: money("household_cash_buffer"),
    medicalReserve: money("medical_reserve"),
    vehicleReserveMonths: integer("vehicle_reserve_months").notNull().default(3),
    annualObligationMonths: integer("annual_obligation_months").notNull().default(1),
    maximumInvestmentPercent: numeric("maximum_investment_percent", { precision: 5, scale: 2 }).notNull().default("15"),
    waterfall: jsonb("waterfall").$type<string[]>().notNull().default([
      "EMERGENCY_RESERVE",
      "VEHICLE_RESERVE",
      "ANNUAL_OBLIGATION_RESERVE",
      "CAPITAL_OS_RESERVE",
      "OPPORTUNITY_RESERVE",
      "INVESTMENT_CAPITAL",
    ]),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdUnique: uniqueIndex("capital_governor_policies_household_unique").on(table.householdId),
  }),
);

export const capitalEncumbrances = pgTable(
  "capital_encumbrances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    amount: money("amount"),
    purpose: text("purpose").notNull(),
    sourceType: text("source_type").notNull(),
    status: text("status").notNull().default("active"),
    expiresAt: date("expires_at", { mode: "string" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdStatusIdx: index("capital_encumbrances_household_status_idx").on(table.householdId, table.status),
  }),
);

export const protectedCapitalRegistry = pgTable(
  "protected_capital_registry",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    bucketKey: text("bucket_key").notNull(),
    designation: text("designation").notNull(),
    reason: text("reason").notNull(),
    locked: integer("locked").notNull().default(1),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdBucketIdx: index("protected_capital_registry_household_bucket_idx").on(table.householdId, table.bucketKey),
  }),
);

export const capitalWaterfallRuns = pgTable(
  "capital_waterfall_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    inputSnapshotId: uuid("input_snapshot_id").notNull().references(() => capitalGovernorInputSnapshots.id, { onDelete: "restrict" }),
    scenario: text("scenario").notNull(),
    policyVersion: text("policy_version").notNull(),
    status: text("status").notNull(),
    safeToDeploy: money("safe_to_deploy"),
    allocations: jsonb("allocations").$type<Array<Record<string, unknown>>>().notNull().default([]),
    decision: jsonb("decision").$type<Record<string, unknown>>().notNull().default({}),
    idempotencyKey: text("idempotency_key").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdempotencyUnique: uniqueIndex("capital_waterfall_runs_household_idempotency_unique").on(table.householdId, table.idempotencyKey),
    householdCreatedIdx: index("capital_waterfall_runs_household_created_idx").on(table.householdId, table.createdAt),
  }),
);

export const capitalDesignationLedger = pgTable(
  "capital_designation_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    waterfallRunId: uuid("waterfall_run_id").notNull().references(() => capitalWaterfallRuns.id, { onDelete: "restrict" }),
    bucketKey: text("bucket_key").notNull(),
    amount: money("amount"),
    designationType: text("designation_type").notNull().default("economic"),
    physicalAccountId: uuid("physical_account_id"),
    reason: text("reason").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdRunIdx: index("capital_designation_ledger_household_run_idx").on(table.householdId, table.waterfallRunId),
  }),
);

export type CapitalGovernorInputSnapshot = typeof capitalGovernorInputSnapshots.$inferSelect;
export type CapitalGovernorPolicy = typeof capitalGovernorPolicies.$inferSelect;
export type CapitalEncumbrance = typeof capitalEncumbrances.$inferSelect;
export type ProtectedCapitalRegistryEntry = typeof protectedCapitalRegistry.$inferSelect;
export type CapitalWaterfallRun = typeof capitalWaterfallRuns.$inferSelect;