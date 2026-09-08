import { boolean, date, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { households, users } from "./households.ts";
import { businessEntities } from "./business.ts";
import { financeCategories, financeTransactions, financialAccounts } from "./household-finance.ts";
import { settlementDocuments } from "./business-income.ts";
import {
  statementCategoryDecisionStatusEnum,
  statementEconomicClassificationEnum,
  statementFinancialInclusionStatusEnum,
} from "./enums.ts";

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
  originalDocumentType: text("original_document_type"),
  detectedDocumentType: text("detected_document_type"),
  detectionConfidence: text("detection_confidence"),
  detectionSignals: jsonb("detection_signals").$type<string[]>().notNull().default([]),
  detectionVersion: text("detection_version"),
  typeMismatchStatus: text("type_mismatch_status").notNull().default("NONE"),
  canonicalDocumentId: uuid("canonical_document_id"),
  duplicateOfDocumentId: uuid("duplicate_of_document_id"),
  supersedesDocumentId: uuid("supersedes_document_id"),
  supersededByDocumentId: uuid("superseded_by_document_id"),
  versionLabel: text("version_label"),
  identityStatus: text("identity_status").notNull().default("UNREVIEWED"),
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

/** Immutable detector observations. A new observation is written instead of mutating prior evidence. */
export const financialDocumentTypeDetections = pgTable("financial_document_type_detections", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  financialDocumentId: uuid("financial_document_id").notNull().references(() => financialDocuments.id, { onDelete: "cascade" }),
  selectedDocumentType: text("selected_document_type").notNull(),
  detectedDocumentType: text("detected_document_type").notNull(),
  confidence: text("confidence").notNull(),
  signals: jsonb("signals").$type<string[]>().notNull().default([]),
  conflictsWithSelectedType: boolean("conflicts_with_selected_type").notNull().default(false),
  detectionVersion: text("detection_version").notNull(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  householdDocumentIdx: index("financial_document_type_detections_household_document_idx").on(table.householdId, table.financialDocumentId),
}));

/** Human-attributed type changes. The original document and every parse generation remain intact. */
export const financialDocumentTypeCorrections = pgTable("financial_document_type_corrections", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  financialDocumentId: uuid("financial_document_id").notNull().references(() => financialDocuments.id, { onDelete: "cascade" }),
  originalDocumentType: text("original_document_type").notNull(),
  correctedDocumentType: text("corrected_document_type").notNull(),
  reason: text("reason").notNull(),
  detectionEvidence: jsonb("detection_evidence").$type<Record<string, unknown>>().notNull().default({}),
  requestedBy: uuid("requested_by").notNull().references(() => users.id),
  approvedBy: uuid("approved_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  status: text("status").notNull().default("READY_FOR_REVIEW"),
  idempotencyKey: text("idempotency_key"),
}, (table) => ({
  householdDocumentIdx: index("financial_document_type_corrections_household_document_idx").on(table.householdId, table.financialDocumentId),
  idempotencyUnique: uniqueIndex("financial_document_type_corrections_idempotency_unique").on(table.householdId, table.idempotencyKey),
}));

/** Parser generations are append-only; only one CURRENT generation may feed derived calculations. */
export const financialDocumentParseGenerations = pgTable("financial_document_parse_generations", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  financialDocumentId: uuid("financial_document_id").notNull().references(() => financialDocuments.id, { onDelete: "cascade" }),
  documentType: text("document_type").notNull(),
  parserVersion: text("parser_version").notNull(),
  status: text("status").notNull().default("CURRENT"),
  extractionStatus: text("extraction_status"),
  sourceRecordType: text("source_record_type"),
  sourceRecordId: uuid("source_record_id"),
  evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  householdDocumentIdx: index("financial_document_parse_generations_household_document_idx").on(table.householdId, table.financialDocumentId),
  currentGenerationIdx: index("financial_document_parse_generations_current_idx").on(table.householdId, table.status),
}));

/** Explicit comparison decisions for similar-looking files; never inferred from filename alone. */
export const financialDocumentIdentityReviews = pgTable("financial_document_identity_reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  documentId: uuid("document_id").notNull().references(() => financialDocuments.id, { onDelete: "cascade" }),
  comparedDocumentId: uuid("compared_document_id").notNull().references(() => financialDocuments.id, { onDelete: "cascade" }),
  classification: text("classification").notNull(),
  evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
  canonicalDocumentId: uuid("canonical_document_id"),
  reviewedBy: uuid("reviewed_by").notNull().references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  pairUnique: uniqueIndex("financial_document_identity_reviews_pair_unique").on(table.householdId, table.documentId, table.comparedDocumentId),
}));

/**
 * Immutable metadata-only record of an authorized evidence deletion. This
 * table is intentionally independent of financialDocuments so document
 * cascades cannot erase the destructive-action history.
 */
export const financialEvidenceDeletionTombstones = pgTable("financial_evidence_deletion_tombstones", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id),
  actor: uuid("actor").notNull().references(() => users.id),
  scope: text("scope").notNull(),
  reason: text("reason").notNull(),
  confirmationPhrase: text("confirmation_phrase").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  requestFingerprint: text("request_fingerprint").notNull(),
  deletedDocuments: jsonb("deleted_documents").$type<Array<{
    id: string;
    originalFileName: string;
    sha256: string;
    uploadedAt: string;
    documentType: string;
  }>>().notNull().default([]),
  removedCounts: jsonb("removed_counts").$type<Record<string, number>>().notNull().default({}),
  postResetVerification: jsonb("post_reset_verification").$type<Record<string, number | boolean>>().notNull().default({}),
  storageObjectCount: integer("storage_object_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  householdCreatedIdx: index("financial_evidence_deletion_tombstones_household_created_idx").on(table.householdId, table.createdAt),
  householdIdempotencyUnique: uniqueIndex("financial_evidence_deletion_tombstones_household_idempotency_unique").on(table.householdId, table.idempotencyKey),
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
  suggestedCategoryId: uuid("suggested_category_id").references(() => financeCategories.id, { onDelete: "set null" }),
  suggestedCategoryConfidence: text("suggested_category_confidence"),
  suggestedCategoryReason: text("suggested_category_reason"),
  suggestedCategorySource: text("suggested_category_source"),
  selectedCategoryId: uuid("selected_category_id").references(() => financeCategories.id, { onDelete: "set null" }),
  categoryDecisionStatus: statementCategoryDecisionStatusEnum("category_decision_status").notNull().default("UNCLASSIFIED"),
  categoryDecidedBy: uuid("category_decided_by").references(() => users.id, { onDelete: "set null" }),
  categoryDecidedAt: timestamp("category_decided_at", { withTimezone: true }),
  categoryCorrectionVersion: integer("category_correction_version").notNull().default(0),
  economicClassification: statementEconomicClassificationEnum("economic_classification").notNull().default("UNKNOWN"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  householdReviewIdx: index("bank_statement_transactions_household_review_idx").on(table.householdId, table.reviewStatus),
  householdCategoryDecisionIdx: index("bank_statement_transactions_household_category_decision_idx").on(table.householdId, table.categoryDecisionStatus),
  statementFingerprintUnique: uniqueIndex("bank_statement_transactions_statement_fingerprint_unique").on(table.bankStatementDocumentId, table.evidenceFingerprint),
  householdFingerprintUnique: uniqueIndex("bank_statement_transactions_household_fingerprint_unique").on(table.householdId, table.evidenceFingerprint),
}));

/**
 * The one durable bridge from reviewed statement evidence to official activity.
 * A row may be linked or imported once; reversing records history rather than
 * freeing the row for a second import.
 */
export const statementFinancialInclusions = pgTable("statement_financial_inclusions", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  statementDocumentId: uuid("statement_document_id").notNull().references(() => bankStatementDocuments.id, { onDelete: "cascade" }),
  statementRowId: uuid("statement_row_id").notNull().references(() => bankStatementTransactions.id, { onDelete: "cascade" }),
  statementRowFingerprint: text("statement_row_fingerprint").notNull(),
  evidenceDecision: text("evidence_decision").notNull(),
  categoryId: uuid("category_id").references(() => financeCategories.id, { onDelete: "set null" }),
  inclusionDecision: text("inclusion_decision").notNull(),
  matchedFinanceTransactionId: uuid("matched_finance_transaction_id").references(() => financeTransactions.id, { onDelete: "set null" }),
  createdFinanceTransactionId: uuid("created_finance_transaction_id").references(() => financeTransactions.id, { onDelete: "set null" }),
  duplicateStatus: text("duplicate_status").notNull().default("NOT_REVIEWED"),
  transferStatus: text("transfer_status").notNull().default("NOT_REVIEWED"),
  settlementLinkStatus: text("settlement_link_status").notNull().default("NOT_REVIEWED"),
  approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  reversedBy: uuid("reversed_by").references(() => users.id, { onDelete: "set null" }),
  reversedAt: timestamp("reversed_at", { withTimezone: true }),
  status: statementFinancialInclusionStatusEnum("status").notNull().default("NOT_REVIEWED"),
  // A source revision never mutates the official transaction. It opens this
  // durable reconciliation gate until an approver explicitly resolves it.
  reviewRequired: boolean("review_required").notNull().default(false),
  mismatchCode: text("mismatch_code"),
  reconciliationStatus: text("reconciliation_status").notNull().default("NOT_REQUIRED"),
  reconciledBy: uuid("reconciled_by").references(() => users.id, { onDelete: "set null" }),
  reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  householdStatusIdx: index("statement_financial_inclusions_household_status_idx").on(table.householdId, table.status),
  householdRowIdx: index("statement_financial_inclusions_household_row_idx").on(table.householdId, table.statementRowId),
  householdRowUnique: uniqueIndex("statement_financial_inclusions_household_row_unique").on(table.householdId, table.statementRowId),
  householdFingerprintUnique: uniqueIndex("statement_financial_inclusions_household_fingerprint_unique").on(table.householdId, table.statementRowFingerprint),
}));

/** Append-only record of every explicit unlink or reversal. */
export const statementFinancialReversals = pgTable("statement_financial_reversals", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  inclusionId: uuid("inclusion_id").notNull().references(() => statementFinancialInclusions.id, { onDelete: "cascade" }),
  statementRowId: uuid("statement_row_id").notNull().references(() => bankStatementTransactions.id, { onDelete: "cascade" }),
  financeTransactionId: uuid("finance_transaction_id").references(() => financeTransactions.id, { onDelete: "set null" }),
  previousState: jsonb("previous_state").$type<Record<string, unknown>>().notNull(),
  newState: jsonb("new_state").$type<Record<string, unknown>>().notNull(),
  reason: text("reason").notNull(),
  actor: uuid("actor").notNull().references(() => users.id, { onDelete: "restrict" }),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  householdInclusionIdx: index("statement_financial_reversals_household_inclusion_idx").on(table.householdId, table.inclusionId),
  householdRowIdx: index("statement_financial_reversals_household_row_idx").on(table.householdId, table.statementRowId),
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
export type FinancialDocumentTypeDetection = typeof financialDocumentTypeDetections.$inferSelect;
export type FinancialDocumentTypeCorrection = typeof financialDocumentTypeCorrections.$inferSelect;
export type FinancialDocumentParseGeneration = typeof financialDocumentParseGenerations.$inferSelect;
export type FinancialDocumentIdentityReview = typeof financialDocumentIdentityReviews.$inferSelect;
export type FinancialEvidenceDeletionTombstone = typeof financialEvidenceDeletionTombstones.$inferSelect;
export type BankStatementDocument = typeof bankStatementDocuments.$inferSelect;
export type BankStatementTransaction = typeof bankStatementTransactions.$inferSelect;
export type BankStatementTransactionCorrection = typeof bankStatementTransactionCorrections.$inferSelect;
export type StatementFinancialInclusion = typeof statementFinancialInclusions.$inferSelect;
export type StatementFinancialReversal = typeof statementFinancialReversals.$inferSelect;