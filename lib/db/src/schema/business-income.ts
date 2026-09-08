import { boolean, date, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { households, users } from "./households.ts";
import { businessEntities } from "./business.ts";
import { financeTransactions } from "./household-finance.ts";

const money = (name: string) => numeric(name, { precision: 18, scale: 2 }).notNull().default("0");

export const settlementDocuments = pgTable("business_settlement_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").notNull().references(() => businessEntities.id, { onDelete: "cascade" }),
  sourceKind: text("source_kind").notNull().default("manual"),
  documentType: text("document_type").notNull().default("settlement"),
  provider: text("provider"),
  statementPeriodStart: date("statement_period_start", { mode: "string" }).notNull(),
  statementPeriodEnd: date("statement_period_end", { mode: "string" }).notNull(),
  paidDate: date("paid_date", { mode: "string" }),
  sourceFileName: text("source_file_name"),
  sourceObjectPath: text("source_object_path"),
  sourceSha256: text("source_sha256"),
  sourceContentType: text("source_content_type"),
  sourceSizeBytes: integer("source_size_bytes"),
  sourcePageCount: integer("source_page_count"),
  extractionStatus: text("extraction_status").notNull().default("manual"),
  extractionReason: text("extraction_reason"),
  verificationStatus: text("verification_status").notNull().default("needs_review"),
  reviewDecision: text("review_decision"),
  reviewReason: text("review_reason"),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reportedGross: money("reported_gross"),
  reportedDeductions: money("reported_deductions"),
  reportedNet: money("reported_net"),
  notes: text("notes"),
  correctedFromId: uuid("corrected_from_id"),
  sourceVersion: integer("source_version").notNull().default(1),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  householdPeriodIdx: index("business_settlement_documents_household_period_idx").on(table.householdId, table.statementPeriodEnd),
  businessPeriodIdx: index("business_settlement_documents_business_period_idx").on(table.businessId, table.statementPeriodEnd),
  sourceHashUnique: uniqueIndex("business_settlement_documents_source_hash_unique").on(table.householdId, table.sourceSha256),
}));

export const settlementRevenueLines = pgTable("business_settlement_revenue_lines", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  settlementDocumentId: uuid("settlement_document_id").notNull().references(() => settlementDocuments.id, { onDelete: "cascade" }),
  lineNumber: integer("line_number").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull().default("operating_revenue"),
  quantity: numeric("quantity", { precision: 18, scale: 4 }),
  unitAmount: money("unit_amount"),
  amount: money("amount"),
  serviceDate: date("service_date", { mode: "string" }),
  sourcePage: integer("source_page"),
  reviewStatus: text("review_status").notNull().default("approved"),
  reviewDecision: text("review_decision"),
  reviewReason: text("review_reason"),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  documentLineUnique: uniqueIndex("business_settlement_revenue_lines_document_line_unique").on(table.settlementDocumentId, table.lineNumber),
  householdIdx: index("business_settlement_revenue_lines_household_idx").on(table.householdId),
}));

export const settlementDeductionLines = pgTable("business_settlement_deduction_lines", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  settlementDocumentId: uuid("settlement_document_id").notNull().references(() => settlementDocuments.id, { onDelete: "cascade" }),
  lineNumber: integer("line_number").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull().default("other_deduction"),
  amount: money("amount"),
  taxDeduction: boolean("tax_deduction").notNull().default(false),
  passThrough: boolean("pass_through").notNull().default(false),
  ownerDraw: boolean("owner_draw").notNull().default(false),
  reimbursement: boolean("reimbursement").notNull().default(false),
  sourcePage: integer("source_page"),
  reviewStatus: text("review_status").notNull().default("approved"),
  reviewDecision: text("review_decision"),
  reviewReason: text("review_reason"),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  documentLineUnique: uniqueIndex("business_settlement_deduction_lines_document_line_unique").on(table.settlementDocumentId, table.lineNumber),
  householdIdx: index("business_settlement_deduction_lines_household_idx").on(table.householdId),
}));

export const settlementMathReconciliations = pgTable("business_settlement_math_reconciliations", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  settlementDocumentId: uuid("settlement_document_id").notNull().references(() => settlementDocuments.id, { onDelete: "cascade" }),
  revenueLineTotal: money("revenue_line_total"),
  deductionLineTotal: money("deduction_line_total"),
  calculatedNet: money("calculated_net"),
  reportedNet: money("reported_net"),
  variance: money("variance"),
  status: text("status").notNull().default("needs_review"),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  settlementUnique: uniqueIndex("business_settlement_math_reconciliations_settlement_unique").on(table.settlementDocumentId),
  householdIdx: index("business_settlement_math_reconciliations_household_idx").on(table.householdId),
}));

export const profitLossDocuments = pgTable("business_profit_loss_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").notNull().references(() => businessEntities.id, { onDelete: "cascade" }),
  statementPeriodStart: date("statement_period_start", { mode: "string" }).notNull(),
  statementPeriodEnd: date("statement_period_end", { mode: "string" }).notNull(),
  sourceFileName: text("source_file_name"),
  sourceObjectPath: text("source_object_path"),
  sourceSha256: text("source_sha256"),
  sourceKind: text("source_kind").notNull().default("manual"),
  sourceContentType: text("source_content_type"),
  sourceSizeBytes: integer("source_size_bytes"),
  sourcePageCount: integer("source_page_count"),
  extractionStatus: text("extraction_status").notNull().default("manual"),
  extractionReason: text("extraction_reason"),
  verificationStatus: text("verification_status").notNull().default("needs_review"),
  reviewDecision: text("review_decision"),
  reviewReason: text("review_reason"),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reportedRevenue: money("reported_revenue"),
  reportedExpenses: money("reported_expenses"),
  reportedProfit: numeric("reported_profit", { precision: 18, scale: 2 }),
  status: text("status").notNull().default("needs_review"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  householdPeriodIdx: index("business_profit_loss_documents_household_period_idx").on(table.householdId, table.statementPeriodEnd),
}));

export const profitLossLines = pgTable("business_profit_loss_lines", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  profitLossDocumentId: uuid("profit_loss_document_id").notNull().references(() => profitLossDocuments.id, { onDelete: "cascade" }),
  lineNumber: integer("line_number").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull().default("other"),
  lineType: text("line_type").notNull().default("expense"),
  amount: money("amount"),
  sourcePage: integer("source_page"),
  reviewStatus: text("review_status").notNull().default("approved"),
  reviewDecision: text("review_decision"),
  reviewReason: text("review_reason"),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  documentLineUnique: uniqueIndex("business_profit_loss_lines_document_line_unique").on(table.profitLossDocumentId, table.lineNumber),
}));

export const profitLossReconciliationRuns = pgTable("business_profit_loss_reconciliation_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").notNull().references(() => businessEntities.id, { onDelete: "cascade" }),
  statementPeriodStart: date("statement_period_start", { mode: "string" }).notNull(),
  statementPeriodEnd: date("statement_period_end", { mode: "string" }).notNull(),
  settlementGross: money("settlement_gross"),
  settlementDeductions: money("settlement_deductions"),
  operatingExpenses: money("operating_expenses"),
  calculatedProfit: money("calculated_profit"),
  reportedProfit: money("reported_profit"),
  variance: money("variance"),
  periodCoverage: text("period_coverage").notNull().default("incomplete"),
  status: text("status").notNull().default("needs_review"),
  reason: text("reason").notNull(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  householdPeriodIdx: index("business_profit_loss_reconciliation_runs_household_period_idx").on(table.householdId, table.statementPeriodEnd),
}));

export const businessEarningsEvents = pgTable("business_earnings_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").notNull().references(() => businessEntities.id, { onDelete: "cascade" }),
  eventDate: date("event_date", { mode: "string" }).notNull(),
  eventType: text("event_type").notNull(),
  settlementDocumentId: uuid("settlement_document_id").references(() => settlementDocuments.id, { onDelete: "set null" }),
  profitLossDocumentId: uuid("profit_loss_document_id").references(() => profitLossDocuments.id, { onDelete: "set null" }),
  financeTransactionId: uuid("finance_transaction_id").references(() => financeTransactions.id, { onDelete: "set null" }),
  grossAmount: money("gross_amount"),
  businessExpenseAmount: money("business_expense_amount"),
  passThroughAmount: money("pass_through_amount"),
  householdIncomeAmount: money("household_income_amount"),
  classification: text("classification").notNull().default("needs_review"),
  notes: text("notes"),
  idempotencyKey: text("idempotency_key"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  householdDateIdx: index("business_earnings_events_household_date_idx").on(table.householdId, table.eventDate),
  idempotencyUnique: uniqueIndex("business_earnings_events_idempotency_unique").on(table.householdId, table.idempotencyKey),
}));

export const economicEventLinks = pgTable("business_economic_event_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  eventId: uuid("event_id").notNull().references(() => businessEarningsEvents.id, { onDelete: "cascade" }),
  linkedEventId: uuid("linked_event_id").notNull().references(() => businessEarningsEvents.id, { onDelete: "cascade" }),
  linkType: text("link_type").notNull(),
  amount: money("amount"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  eventLinkUnique: uniqueIndex("business_economic_event_links_event_pair_unique").on(table.eventId, table.linkedEventId, table.linkType),
}));

export const settlementCashMatches = pgTable("business_settlement_cash_matches", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").notNull().references(() => businessEntities.id, { onDelete: "cascade" }),
  settlementDocumentId: uuid("settlement_document_id").notNull().references(() => settlementDocuments.id, { onDelete: "cascade" }),
  financeTransactionId: uuid("finance_transaction_id").references(() => financeTransactions.id, { onDelete: "set null" }),
  matchedAmount: money("matched_amount"),
  matchStatus: text("match_status").notNull().default("unmatched"),
  confidence: numeric("confidence", { precision: 5, scale: 2 }).notNull().default("0"),
  reason: text("reason").notNull(),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  settlementUnique: uniqueIndex("business_settlement_cash_matches_settlement_unique").on(table.settlementDocumentId),
  transactionUnique: uniqueIndex("business_settlement_cash_matches_transaction_unique").on(table.financeTransactionId),
}));

export const businessCashPositions = pgTable("business_cash_positions", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").notNull().references(() => businessEntities.id, { onDelete: "cascade" }),
  asOf: date("as_of", { mode: "string" }).notNull(),
  bankCash: money("bank_cash"),
  pendingDeposits: money("pending_deposits"),
  outstandingAdvances: money("outstanding_advances"),
  escrowHeld: money("escrow_held"),
  reimbursementsDue: money("reimbursements_due"),
  reserveFloor: money("reserve_floor"),
  safeToDistribute: money("safe_to_distribute"),
  status: text("status").notNull().default("needs_review"),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  businessDateUnique: uniqueIndex("business_cash_positions_business_date_unique").on(table.businessId, table.asOf),
}));

export const businessAdvances = pgTable("business_advances", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").notNull().references(() => businessEntities.id, { onDelete: "cascade" }),
  advanceDate: date("advance_date", { mode: "string" }).notNull(),
  counterparty: text("counterparty").notNull(),
  amount: money("amount"),
  recoveredAmount: money("recovered_amount"),
  status: text("status").notNull().default("open"),
  notes: text("notes"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const businessEscrowMovements = pgTable("business_escrow_movements", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").notNull().references(() => businessEntities.id, { onDelete: "cascade" }),
  movementDate: date("movement_date", { mode: "string" }).notNull(),
  direction: text("direction").notNull(),
  amount: money("amount"),
  counterparty: text("counterparty"),
  status: text("status").notNull().default("held"),
  notes: text("notes"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const reimbursementMatches = pgTable("business_reimbursement_matches", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").notNull().references(() => businessEntities.id, { onDelete: "cascade" }),
  financeTransactionId: uuid("finance_transaction_id").references(() => financeTransactions.id, { onDelete: "set null" }),
  amount: money("amount"),
  status: text("status").notNull().default("needs_review"),
  reason: text("reason").notNull(),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  transactionUnique: uniqueIndex("business_reimbursement_matches_transaction_unique").on(table.financeTransactionId),
}));

export const ownerDrawProposals = pgTable("business_owner_draw_proposals", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").notNull().references(() => businessEntities.id, { onDelete: "cascade" }),
  proposalDate: date("proposal_date", { mode: "string" }).notNull(),
  amount: money("amount"),
  status: text("status").notNull().default("needs_review"),
  eligibleAmount: money("eligible_amount"),
  blockedReasons: jsonb("blocked_reasons").$type<string[]>().notNull().default([]),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  notes: text("notes"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const verifiedHouseholdIncomeEvents = pgTable("business_verified_household_income_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").notNull().references(() => businessEntities.id, { onDelete: "cascade" }),
  ownerDrawProposalId: uuid("owner_draw_proposal_id").notNull().references(() => ownerDrawProposals.id, { onDelete: "restrict" }),
  incomeDate: date("income_date", { mode: "string" }).notNull(),
  amount: money("amount"),
  sourceType: text("source_type").notNull().default("business_distribution"),
  verificationStatus: text("verification_status").notNull().default("verified"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  proposalUnique: uniqueIndex("business_verified_household_income_events_proposal_unique").on(table.ownerDrawProposalId),
}));

export const businessIncomeAnomalies = pgTable("business_income_anomalies", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").notNull().references(() => businessEntities.id, { onDelete: "cascade" }),
  anomalyType: text("anomaly_type").notNull(),
  severity: text("severity").notNull().default("warning"),
  status: text("status").notNull().default("open"),
  relatedEntityType: text("related_entity_type"),
  relatedEntityId: uuid("related_entity_id"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: uuid("resolved_by").references(() => users.id),
});

export type SettlementDocument = typeof settlementDocuments.$inferSelect;
export type SettlementRevenueLine = typeof settlementRevenueLines.$inferSelect;
export type SettlementDeductionLine = typeof settlementDeductionLines.$inferSelect;
export type SettlementMathReconciliation = typeof settlementMathReconciliations.$inferSelect;
export type ProfitLossDocument = typeof profitLossDocuments.$inferSelect;
export type ProfitLossLine = typeof profitLossLines.$inferSelect;
export type ProfitLossReconciliationRun = typeof profitLossReconciliationRuns.$inferSelect;
export type BusinessEarningsEvent = typeof businessEarningsEvents.$inferSelect;
export type EconomicEventLink = typeof economicEventLinks.$inferSelect;
export type SettlementCashMatch = typeof settlementCashMatches.$inferSelect;
export type BusinessCashPosition = typeof businessCashPositions.$inferSelect;
export type BusinessAdvance = typeof businessAdvances.$inferSelect;
export type BusinessEscrowMovement = typeof businessEscrowMovements.$inferSelect;
export type ReimbursementMatch = typeof reimbursementMatches.$inferSelect;
export type OwnerDrawProposal = typeof ownerDrawProposals.$inferSelect;
export type VerifiedHouseholdIncomeEvent = typeof verifiedHouseholdIncomeEvents.$inferSelect;
export type BusinessIncomeAnomaly = typeof businessIncomeAnomalies.$inferSelect;