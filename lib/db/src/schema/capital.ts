import {
  boolean,
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  accountTypeEnum,
  goalPriorityEnum,
  goalStatusEnum,
  riskClassEnum,
  transactionCategoryEnum,
  transactionStatusEnum,
} from "./enums.ts";
import { households, users } from "./households.ts";

const money = (name: string) => numeric(name, { precision: 18, scale: 2 }).notNull().default("0");

export const accounts = pgTable(
  "capital_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    accountType: accountTypeEnum("account_type").notNull(),
    balance: money("balance"),
    protected: boolean("protected").notNull().default(false),
    riskClass: riskClassEnum("risk_class").notNull().default("conservative"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("capital_accounts_household_idx").on(table.householdId),
  }),
);

export const goals = pgTable(
  "capital_goals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    targetAmount: money("target_amount"),
    currentAmount: money("current_amount"),
    protectedAmount: money("protected_amount"),
    weeklyContribution: money("weekly_contribution"),
    startDate: date("start_date").notNull(),
    targetDate: date("target_date").notNull(),
    priority: goalPriorityEnum("priority").notNull().default("normal"),
    status: goalStatusEnum("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("capital_goals_household_idx").on(table.householdId),
  }),
);

export const allocationRules = pgTable(
  "allocation_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    totalWeekly: money("total_weekly"),
    duplexReserve: money("duplex_reserve"),
    capitalOs: money("capital_os"),
    opportunityReserve: money("opportunity_reserve"),
    active: boolean("active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    activeRuleIdx: index("allocation_rules_household_active_idx").on(
      table.householdId,
      table.active,
    ),
  }),
);

export const ledgerTransactions = pgTable(
  "ledger_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
    sourceAccountId: uuid("source_account_id").references(() => accounts.id),
    destinationAccountId: uuid("destination_account_id").references(() => accounts.id),
    amount: money("amount"),
    category: transactionCategoryEnum("category").notNull(),
    status: transactionStatusEnum("status").notNull().default("pending"),
    externalReference: text("external_reference"),
    createdBy: uuid("created_by").references(() => users.id),
    idempotencyKey: text("idempotency_key"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => ({
    householdIdx: index("ledger_transactions_household_idx").on(table.householdId),
    idempotencyUnique: uniqueIndex("ledger_transactions_household_idempotency_unique").on(
      table.householdId,
      table.idempotencyKey,
    ),
  }),
);

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => ledgerTransactions.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    debit: money("debit"),
    credit: money("credit"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    transactionIdx: index("ledger_entries_transaction_idx").on(table.transactionId),
    accountIdx: index("ledger_entries_account_idx").on(table.accountId),
  }),
);

export const contributions = pgTable(
  "contributions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    goalId: uuid("goal_id").references(() => goals.id),
    allocationRuleId: uuid("allocation_rule_id").references(() => allocationRules.id),
    amount: money("amount"),
    status: transactionStatusEnum("status").notNull().default("pending"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => ({
    idempotencyUnique: uniqueIndex("contributions_household_idempotency_unique").on(
      table.householdId,
      table.idempotencyKey,
    ),
    householdIdx: index("contributions_household_idx").on(table.householdId),
  }),
);

export type Account = typeof accounts.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type AllocationRule = typeof allocationRules.$inferSelect;
export type LedgerTransaction = typeof ledgerTransactions.$inferSelect;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type Contribution = typeof contributions.$inferSelect;