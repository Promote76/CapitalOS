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