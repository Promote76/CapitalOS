import { pgEnum } from "drizzle-orm/pg-core";

export const householdRoleEnum = pgEnum("household_role", [
  "owner",
  "partner",
  "viewer",
  "advisor",
]);

export const accountTypeEnum = pgEnum("account_type", [
  "protected_capital",
  "active_capital",
  "cash_reserve",
  "duplex_reserve",
  "opportunity_reserve",
  "strategy_capital",
  "property_capital",
  "treasury",
]);

export const goalStatusEnum = pgEnum("goal_status", [
  "draft",
  "active",
  "on_track",
  "behind",
  "ahead",
  "completed",
  "paused",
]);

export const goalPriorityEnum = pgEnum("goal_priority", [
  "critical",
  "high",
  "normal",
  "low",
]);

export const riskClassEnum = pgEnum("risk_class", [
  "protected",
  "conservative",
  "moderate",
  "experimental",
]);

export const transactionCategoryEnum = pgEnum("transaction_category", [
  "contribution",
  "transfer",
  "strategy_allocation",
  "strategy_return",
  "strategy_loss",
  "property_expense",
  "closing_expense",
  "income",
  "withdrawal",
  "adjustment",
  "refund",
]);

export const transactionStatusEnum = pgEnum("transaction_status", [
  "draft",
  "pending",
  "authorized",
  "processing",
  "completed",
  "failed",
  "cancelled",
  "reversed",
]);

export const propertyStatusEnum = pgEnum("property_status", [
  "research",
  "watchlist",
  "qualified",
  "tour",
  "offer_candidate",
  "offer_submitted",
  "under_contract",
  "acquired",
  "rejected",
]);

export const milestoneStatusEnum = pgEnum("milestone_status", [
  "future",
  "current",
  "complete",
  "blocked",
]);

export const strategyStageEnum = pgEnum("strategy_stage", [
  "research",
  "backtest",
  "shadow",
  "paper",
  "micro_live",
  "approved",
  "production",
  "paused",
  "retired",
]);

export const recommendationStatusEnum = pgEnum("recommendation_status", [
  "proposed",
  "under_review",
  "approved",
  "rejected",
  "expired",
]);

export const safetyStateEnum = pgEnum("safety_state", [
  "normal",
  "review",
  "safe_mode",
  "stop",
  "evacuate",
  "locked",
]);

export const financialAccountTypeEnum = pgEnum("financial_account_type", [
  "checking",
  "savings",
  "money_market",
  "credit_card",
  "loan",
  "mortgage",
  "brokerage",
  "retirement",
  "crypto",
  "business_checking",
  "protected_duplex",
  "opportunity_reserve",
  "other",
]);

export const bankConnectionStatusEnum = pgEnum("bank_connection_status", [
  "connected",
  "healthy",
  "needs_reauthentication",
  "syncing",
  "delayed",
  "disconnected",
  "manual",
  "error",
]);

export const financeDataSourceEnum = pgEnum("finance_data_source", [
  "plaid",
  "manual",
  "csv_import",
  "capital_os_ledger",
  "user_entered",
  "calculated",
]);

export const budgetCategoryTypeEnum = pgEnum("budget_category_type", [
  "fixed_expense",
  "variable_essential",
  "variable_discretionary",
  "savings",
  "investment",
  "debt_payment",
  "transfer",
  "income",
  "one_time_expense",
]);

export const essentialStatusEnum = pgEnum("essential_status", [
  "essential",
  "discretionary",
  "mixed",
]);

export const financeReviewStatusEnum = pgEnum("finance_review_status", [
  "approved",
  "needs_review",
  "uncategorized",
  "possible_duplicate",
  "possible_transfer",
  "possible_business",
  "possible_property",
  "excluded",
]);

export const businessTagEnum = pgEnum("business_tag", [
  "household",
  "business",
  "mixed",
  "reimbursable",
]);

export const recurringFrequencyEnum = pgEnum("recurring_frequency", [
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "annual",
]);

export const billStatusEnum = pgEnum("bill_status", [
  "upcoming",
  "due_soon",
  "paid",
  "overdue",
  "estimated",
  "skipped",
]);

export const incomeSourceTypeEnum = pgEnum("income_source_type", [
  "employment",
  "contract",
  "business",
  "rental",
  "investment",
  "interest",
  "other",
]);

export const upcomingExpensePriorityEnum = pgEnum("upcoming_expense_priority", [
  "low",
  "normal",
  "high",
  "critical",
]);