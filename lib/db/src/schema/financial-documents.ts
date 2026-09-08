import { date, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { households, users } from "./households.ts";
import { businessEntities } from "./business.ts";
import { financialAccounts } from "./household-finance.ts";
import { settlementDocuments } from "./business-income.ts";

const money = (name: string) => numeric(name, { precision: 18, scale: 2 }).notNull().default("0");

/**
 * The immutable source-evidence envelope.  Existing settlement and P&L rows
 * remain their economic/reconciliation records and are linked by sourceRecord*.
 */
export const financialDocuments = pgTable("financial_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").references(() => businessEntities.id, { onDelete: "set null" }),
  documentType: text("document_type").notNull(),
  status: text("status").notNull().default("uploaded"),
  sourceInstitution: text("source_institution"),
  sourceFileName: text("source_file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sourceObjectPath: text("source_object_path").notNull(),
  documentHash: text("document_hash").notNull(),
  sourceMetadata: jsonb("source_metadata").$type<Record<string, unknown>>().notNull().default({}),
  periodStart: date("period_start", { mode: "string" }),
  periodEnd: date("period_end", { mode: "string" }),
  statementDate: date("statement_date", { mode: "string" }),
  parserVersion: text("parser_version"),
  sourceRecordType: text("source_record_type"),
  sourceRecordId: uuid("source_record_id"),
  uploadedBy: uuid("uploaded_by").notNull().references(() => users.id),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewDecision: text("review_decision"),
  reviewReason: text("review_reason"),
  reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
}, (table) => ({
  householdUploadedIdx: index("financial_documents_household_uploaded_idx").on(table.householdId, table.uploadedAt),
  householdStatusIdx: index("financial_documents_household_status_idx").on(table.householdId, table.status),
  householdHashUnique: uniqueIndex("financial_documents_household_hash_unique").on(table.householdId, table.documentHash),
}));

export const bankStatementDocuments = pgTable("bank_statement_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  documentId: uuid("document_id").notNull().references(() => financialDocuments.id, { onDelete: "cascade" }),
  accountId: uuid("account_id").references(() => financialAccounts.id, { onDelete: "set null" }),
  institutionName: text("institution_name"),
  accountDisplayName: text("account_display_name"),
  accountMask: text("account_mask"),
  statementStart: date("statement_start", { mode: "string" }),
  statementEnd: date("statement_end", { mode: "string" }),
  openingBalance: money("opening_balance"),
  closingBalance: money("closing_balance"),
  totalDeposits: money("total_deposits"),
  totalWithdrawals: money("total_withdrawals"),
  status: text("status").notNull().default("document_evidence_pending_review"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  documentUnique: uniqueIndex("bank_statement_documents_document_unique").on(table.documentId),
  householdIdx: index("bank_statement_documents_household_idx").on(table.householdId, table.statementEnd),
}));

/** Evidence only; no trigger or service promotes this table to finance_transactions. */
export const bankStatementTransactions = pgTable("bank_statement_transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  bankStatementDocumentId: uuid("bank_statement_document_id").notNull().references(() => bankStatementDocuments.id, { onDelete: "cascade" }),
  postedDate: date("posted_date", { mode: "string" }),
  description: text("description").notNull(),
  amount: money("amount"),
  direction: text("direction"),
  runningBalance: numeric("running_balance", { precision: 18, scale: 2 }),
  reference: text("reference"),
  confidence: numeric("confidence", { precision: 5, scale: 2 }),
  sourcePage: integer("source_page"),
  sourceLine: integer("source_line"),
  sourceRegion: text("source_region"),
  parserVersion: text("parser_version").notNull().default("bank-statement-v1"),
  evidenceFingerprint: text("evidence_fingerprint").notNull(),
  originalValue: jsonb("original_value").$type<Record<string, unknown>>().notNull().default({}),
  correctedValue: jsonb("corrected_value").$type<Record<string, unknown>>(),
  correctionReason: text("correction_reason"),
  reviewStatus: text("review_status").notNull().default("document_evidence_pending_review"),
  // Explicit reviewer disposition; generic reviewStatus alone must not imply economic treatment.
  lastReviewAction: text("last_review_action"),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  linkedSettlementDocumentId: uuid("linked_settlement_document_id").references(() => settlementDocuments.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  householdReviewIdx: index("bank_statement_transactions_household_review_idx").on(table.householdId, table.reviewStatus),
  statementFingerprintUnique: uniqueIndex("bank_statement_transactions_statement_fingerprint_unique").on(table.bankStatementDocumentId, table.evidenceFingerprint),
  householdFingerprintUnique: uniqueIndex("bank_statement_transactions_household_fingerprint_unique").on(table.householdId, table.evidenceFingerprint),
}));

/** Append-only reviewer corrections; the evidence row retains the latest projection. */
export const bankStatementTransactionCorrections = pgTable("bank_statement_transaction_corrections", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  transactionId: uuid("transaction_id").notNull().references(() => bankStatementTransactions.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull(),
  previousValue: jsonb("previous_value").$type<Record<string, unknown>>(),
  correctedValue: jsonb("corrected_value").$type<Record<string, unknown>>().notNull(),
  reason: text("reason").notNull(),
  correctedBy: uuid("corrected_by").notNull().references(() => users.id),
  correctedAt: timestamp("corrected_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  transactionRevisionUnique: uniqueIndex("bank_statement_transaction_corrections_revision_unique").on(table.transactionId, table.revision),
  householdTransactionIdx: index("bank_statement_transaction_corrections_household_transaction_idx").on(table.householdId, table.transactionId),
}));

export type FinancialDocument = typeof financialDocuments.$inferSelect;
export type BankStatementDocument = typeof bankStatementDocuments.$inferSelect;
export type BankStatementTransaction = typeof bankStatementTransactions.$inferSelect;
export type BankStatementTransactionCorrection = typeof bankStatementTransactionCorrections.$inferSelect;