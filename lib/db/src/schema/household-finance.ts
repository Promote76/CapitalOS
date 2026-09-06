import {
  boolean,
  type AnyPgColumn,
  date,
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
import {
  bankConnectionStatusEnum,
  bankConsentStatusEnum,
  bankReconciliationStatusEnum,
  budgetPlanningPeriodStatusEnum,
  billStatusEnum,
  budgetCategoryTypeEnum,
  businessTagEnum,
  essentialStatusEnum,
  financialAccountTypeEnum,
  financeDataSourceEnum,
  financeReviewStatusEnum,
  incomeSourceTypeEnum,
  recurringFrequencyEnum,
  upcomingExpensePriorityEnum,
} from "./enums.ts";
import { households, users } from "./households.ts";
import { businessEntities } from "./business.ts";

const money = (name: string) => numeric(name, { precision: 18, scale: 2 }).notNull().default("0");

export const bankConnections = pgTable(
  "bank_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    status: bankConnectionStatusEnum("status").notNull().default("manual"),
    consentStatus: bankConsentStatusEnum("consent_status").notNull().default("pending"),
    consentGrantedAt: timestamp("consent_granted_at", { withTimezone: true }),
    consentRevokedAt: timestamp("consent_revoked_at", { withTimezone: true }),
    consentActor: text("consent_actor"),
    institutionName: text("institution_name").notNull(),
    providerConnectionRef: text("provider_connection_ref"),
    syncCursor: text("sync_cursor"),
    providerAsOf: timestamp("provider_as_of", { withTimezone: true }),
    reconciliationStatus: bankReconciliationStatusEnum("reconciliation_status").notNull().default("not_run"),
    reconciliationDifference: numeric("reconciliation_difference", { precision: 18, scale: 2 }).notNull().default("0"),
    lastSyncAttempt: timestamp("last_sync_attempt", { withTimezone: true }),
    lastSuccessfulSync: timestamp("last_successful_sync", { withTimezone: true }),
    lastBalanceRefresh: timestamp("last_balance_refresh", { withTimezone: true }),
    lastTransactionSync: timestamp("last_transaction_sync", { withTimezone: true }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("bank_connections_household_idx").on(table.householdId),
  }),
);

export const bankConnectionCredentials = pgTable(
  "bank_connection_credentials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id").notNull().references(() => bankConnections.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    credentialRef: text("credential_ref").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => ({
    householdIdx: index("bank_connection_credentials_household_idx").on(table.householdId),
    connectionUnique: uniqueIndex("bank_connection_credentials_connection_unique").on(table.connectionId),
    credentialUnique: uniqueIndex("bank_connection_credentials_ref_unique").on(table.credentialRef),
  }),
);

export const bankSyncRuns = pgTable(
  "bank_sync_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id").notNull().references(() => bankConnections.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    providerAsOf: timestamp("provider_as_of", { withTimezone: true }),
    insertedCount: integer("inserted_count").notNull().default(0),
    updatedCount: integer("updated_count").notNull().default(0),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    reviewCount: integer("review_count").notNull().default(0),
    removedCount: integer("removed_count").notNull().default(0),
    reconciliationDifference: numeric("reconciliation_difference", { precision: 18, scale: 2 }).notNull().default("0"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("bank_sync_runs_household_idx").on(table.householdId, table.startedAt),
    connectionIdx: index("bank_sync_runs_connection_idx").on(table.connectionId, table.startedAt),
  }),
);

export const bankWebhookEvents = pgTable(
  "bank_webhook_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id").notNull().references(() => bankConnections.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("received"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    providerEventUnique: uniqueIndex("bank_webhook_events_provider_event_unique").on(table.provider, table.providerEventId),
    householdIdx: index("bank_webhook_events_household_idx").on(table.householdId, table.createdAt),
  }),
);

export const financialAccounts = pgTable(
  "household_financial_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    bankConnectionId: uuid("bank_connection_id").references(() => bankConnections.id, { onDelete: "set null" }),
    institution: text("institution").notNull(),
    nickname: text("nickname").notNull(),
    providerAccountRef: text("provider_account_ref"),
    accountType: financialAccountTypeEnum("account_type").notNull(),
    currentBalance: money("current_balance"),
    availableBalance: numeric("available_balance", { precision: 18, scale: 2 }),
    lastSync: timestamp("last_sync", { withTimezone: true }),
    connectionStatus: bankConnectionStatusEnum("connection_status").notNull().default("manual"),
    includedInNetWorth: boolean("included_in_net_worth").notNull().default(true),
    includedInBudget: boolean("included_in_budget").notNull().default(true),
    protected: boolean("protected").notNull().default(false),
    businessEntityId: uuid("business_entity_id").references(() => businessEntities.id, { onDelete: "set null" }),
    dataSource: financeDataSourceEnum("data_source").notNull().default("manual"),
    lastSuccessfulSync: timestamp("last_successful_sync", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("household_financial_accounts_household_idx").on(table.householdId),
  }),
);

export const financeCategories = pgTable(
  "finance_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    categoryType: budgetCategoryTypeEnum("category_type").notNull(),
    essentialStatus: essentialStatusEnum("essential_status").notNull(),
    monthlyTarget: money("monthly_target"),
    warningThreshold: numeric("warning_threshold", { precision: 6, scale: 4 }).notNull().default("1.00"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdNameUnique: uniqueIndex("finance_categories_household_name_unique").on(table.householdId, table.name),
  }),
);

/**
 * Planning records deliberately do not replace financeCategories: that table remains
 * the transaction taxonomy, while these records preserve the plan that was reviewed.
 */
export const budgetPlanningPeriods = pgTable(
  "budget_planning_periods",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    month: date("month", { mode: "string" }).notNull(),
    status: budgetPlanningPeriodStatusEnum("status").notNull().default("draft"),
    version: integer("version").notNull().default(1),
    copiedFromPeriodId: uuid("copied_from_period_id").references((): AnyPgColumn => budgetPlanningPeriods.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedBy: uuid("closed_by").references(() => users.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdMonthUnique: uniqueIndex("budget_planning_periods_household_month_unique").on(table.householdId, table.month),
    householdStatusIdx: index("budget_planning_periods_household_status_idx").on(table.householdId, table.status, table.month),
  }),
);

export const budgetPlanningCategorySnapshots = pgTable(
  "budget_planning_category_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    periodId: uuid("period_id").notNull().references(() => budgetPlanningPeriods.id, { onDelete: "cascade" }),
    sourceCategoryId: uuid("source_category_id").references(() => financeCategories.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    categoryType: budgetCategoryTypeEnum("category_type").notNull(),
    essentialStatus: essentialStatusEnum("essential_status").notNull(),
    monthlyTarget: money("monthly_target"),
    warningThreshold: numeric("warning_threshold", { precision: 6, scale: 4 }).notNull().default("1.00"),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    archived: boolean("archived").notNull().default(false),
    createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
    updatedBy: uuid("updated_by").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    periodSortUnique: uniqueIndex("budget_planning_category_snapshots_period_sort_unique").on(table.periodId, table.sortOrder),
    periodSourceUnique: uniqueIndex("budget_planning_category_snapshots_period_source_unique").on(table.periodId, table.sourceCategoryId),
    householdPeriodIdx: index("budget_planning_category_snapshots_household_period_idx").on(table.householdId, table.periodId),
  }),
);

export const financeTransactions = pgTable(
  "finance_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull().references(() => financialAccounts.id, { onDelete: "cascade" }),
    externalId: text("external_id"),
    transactionDate: date("transaction_date", { mode: "string" }).notNull(),
    description: text("description").notNull(),
    merchant: text("merchant"),
    originalAmount: money("original_amount"),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    categoryId: uuid("category_id").references(() => financeCategories.id, { onDelete: "set null" }),
    dataSource: financeDataSourceEnum("data_source").notNull().default("manual"),
    reviewStatus: financeReviewStatusEnum("review_status").notNull().default("uncategorized"),
    businessTag: businessTagEnum("business_tag").notNull().default("household"),
    excludedFromBudget: boolean("excluded_from_budget").notNull().default(false),
    pending: boolean("pending").notNull().default(false),
    transferGroupId: text("transfer_group_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdDateIdx: index("finance_transactions_household_date_idx").on(table.householdId, table.transactionDate),
    externalUnique: uniqueIndex("finance_transactions_account_external_unique").on(table.accountId, table.externalId),
  }),
);

export const recurringTransactions = pgTable(
  "recurring_finance_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => financialAccounts.id, { onDelete: "set null" }),
    categoryId: uuid("category_id").references(() => financeCategories.id, { onDelete: "set null" }),
    merchant: text("merchant").notNull(),
    expectedAmount: money("expected_amount"),
    averageAmount: money("average_amount"),
    frequency: recurringFrequencyEnum("frequency").notNull(),
    nextExpectedDate: date("next_expected_date", { mode: "string" }).notNull(),
    confidence: numeric("confidence", { precision: 5, scale: 2 }).notNull().default("0"),
    essentialStatus: essentialStatusEnum("essential_status").notNull(),
    annualCost: money("annual_cost"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("recurring_finance_transactions_household_idx").on(table.householdId),
  }),
);

export const financeBills = pgTable(
  "finance_bills",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => financialAccounts.id, { onDelete: "set null" }),
    recurringTransactionId: uuid("recurring_transaction_id").references(() => recurringTransactions.id, { onDelete: "set null" }),
    billName: text("bill_name").notNull(),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    expectedAmount: money("expected_amount"),
    status: billStatusEnum("status").notNull().default("upcoming"),
    essential: boolean("essential").notNull().default(true),
    autoPay: boolean("auto_pay").notNull().default(false),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdDueIdx: index("finance_bills_household_due_idx").on(table.householdId, table.dueDate),
  }),
);

export const upcomingExpenses = pgTable(
  "upcoming_finance_expenses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    estimatedAmount: money("estimated_amount"),
    expectedDate: date("expected_date", { mode: "string" }).notNull(),
    priority: upcomingExpensePriorityEnum("priority").notNull().default("normal"),
    required: boolean("required").notNull().default(false),
    fundedAmount: money("funded_amount"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdDateIdx: index("upcoming_finance_expenses_household_date_idx").on(table.householdId, table.expectedDate),
  }),
);

export const incomeSources = pgTable(
  "income_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sourceType: incomeSourceTypeEnum("source_type").notNull(),
    expectedMonthly: money("expected_monthly"),
    cadence: recurringFrequencyEnum("cadence").notNull().default("monthly"),
    nextPayDate: date("next_pay_date", { mode: "string" }).notNull().default("2026-09-15"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("income_sources_household_idx").on(table.householdId),
  }),
);

export const emergencyReserves = pgTable(
  "emergency_reserves",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    targetMonths: integer("target_months").notNull().default(6),
    essentialMonthlyExpenses: money("essential_monthly_expenses"),
    currentAmount: money("current_amount"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdUnique: uniqueIndex("emergency_reserves_household_unique").on(table.householdId),
  }),
);

export const financeSnapshots = pgTable(
  "finance_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    snapshotDate: date("snapshot_date", { mode: "string" }).notNull(),
    grossInflow: money("gross_inflow"),
    essentialOutflow: money("essential_outflow"),
    discretionaryOutflow: money("discretionary_outflow"),
    debtService: money("debt_service"),
    savingsContributions: money("savings_contributions"),
    investmentContributions: money("investment_contributions"),
    netCashFlow: money("net_cash_flow"),
    freeCashFlow: money("free_cash_flow"),
    safeToDeploy: money("safe_to_deploy"),
    safeToDeployConfidence: numeric("safe_to_deploy_confidence", { precision: 5, scale: 2 }).notNull().default("0"),
    financialHealthScore: numeric("financial_health_score", { precision: 5, scale: 2 }).notNull().default("0"),
    budgetPerformance: jsonb("budget_performance").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdDateUnique: uniqueIndex("finance_snapshots_household_date_unique").on(table.householdId, table.snapshotDate),
  }),
);

export type BankConnection = typeof bankConnections.$inferSelect;
export type FinancialAccount = typeof financialAccounts.$inferSelect;
export type FinanceCategory = typeof financeCategories.$inferSelect;
export type BudgetPlanningPeriod = typeof budgetPlanningPeriods.$inferSelect;
export type BudgetPlanningCategorySnapshot = typeof budgetPlanningCategorySnapshots.$inferSelect;
export type FinanceTransaction = typeof financeTransactions.$inferSelect;
export type RecurringTransaction = typeof recurringTransactions.$inferSelect;
export type FinanceBill = typeof financeBills.$inferSelect;
export type UpcomingExpense = typeof upcomingExpenses.$inferSelect;
export type IncomeSource = typeof incomeSources.$inferSelect;
export type EmergencyReserve = typeof emergencyReserves.$inferSelect;
export type FinanceSnapshot = typeof financeSnapshots.$inferSelect;