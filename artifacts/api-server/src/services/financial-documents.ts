import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  auditEvents, bankStatementDocuments, bankStatementTransactionCorrections, bankStatementTransactions, financialDocuments, idempotencyKeys,
  businessAdvances, businessEntities, businessEscrowMovements, financeTransactions, financialAccounts, profitLossDocuments, profitLossReconciliationRuns,
  settlementCashMatches, settlementDocuments, settlementMathReconciliations, settlementDeductionLines, verifiedHouseholdIncomeEvents,
} from "@workspace/db/schema";
import type { Actor } from "./capital-os";
import { assertPermission, GovernanceError } from "../domain/governance";
import { assertDocumentUploadGrant, assertPrivateObjectPath, createDocumentUploadGrant, downloadBusinessDocument, requestBusinessDocumentUpload } from "../lib/business-document-storage";
import { BANK_STATEMENT_PARSER_VERSION, parseBankStatement } from "./bank-statement-parser";

const acceptedTypes = new Set([
  "STEVENS_SETTLEMENT", "BUSINESS_PROFIT_AND_LOSS", "BANK_STATEMENT", "1099",
  "INCOME_VERIFICATION", "INSURANCE_DOCUMENT", "AUTO_LOAN_DOCUMENT",
  "BUSINESS_LEASE_DOCUMENT", "OTHER_FINANCIAL_DOCUMENT",
]);
const reviewableStatuses = new Set(["UPLOADED", "PARSING", "PARSED", "NEEDS_REVIEW"]);

type Correction = typeof bankStatementTransactionCorrections.$inferSelect;
type StatementTransaction = typeof bankStatementTransactions.$inferSelect & { correctionHistory: Correction[] };

function response(document: typeof financialDocuments.$inferSelect, bankStatement?: typeof bankStatementDocuments.$inferSelect, transactions: readonly StatementTransaction[] = []) {
  const { householdId: _householdId, uploadedBy: _uploadedBy, reviewedBy: _reviewedBy, ...value } = document;
  const statement = bankStatement
    ? (({ householdId: _householdId, ...safe }) => safe)(bankStatement)
    : null;
  return { ...value, bankStatement: statement, transactions: transactions.map(({ householdId: _householdId, reviewedBy: _reviewedBy, ...row }) => row) };
}

async function statementTransactions(tx: Pick<typeof db, "select">, statementId: string, householdId: string): Promise<StatementTransaction[]> {
  const rows = await tx.select().from(bankStatementTransactions).where(and(
    eq(bankStatementTransactions.bankStatementDocumentId, statementId),
    eq(bankStatementTransactions.householdId, householdId),
  ));
  if (!rows.length) return [];
  const corrections = await tx.select().from(bankStatementTransactionCorrections).where(and(
    eq(bankStatementTransactionCorrections.householdId, householdId),
    inArray(bankStatementTransactionCorrections.transactionId, rows.map((row) => row.id)),
  )).orderBy(bankStatementTransactionCorrections.revision);
  const byTransaction = new Map<string, Correction[]>();
  for (const correction of corrections) {
    const history = byTransaction.get(correction.transactionId) ?? [];
    history.push(correction);
    byTransaction.set(correction.transactionId, history);
  }
  return rows.map((row) => ({ ...row, correctionHistory: byTransaction.get(row.id) ?? [] }));
}

export async function requestFinancialDocumentUploadUrl(actor: Actor, input: {
  name: string; size: number; contentType: string; documentType: string;
}) {
  assertPermission(actor.role, "contribute");
  if (!acceptedTypes.has(input.documentType)) throw new GovernanceError("INVALID_STATE", "Unsupported financial document type");
  if (!["application/pdf", "text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"].includes(input.contentType)) {
    throw new GovernanceError("INVALID_STATE", "Financial evidence must be PDF, CSV, or XLSX");
  }
  const target = await requestBusinessDocumentUpload();
  return { ...input, ...target, uploadGrant: createDocumentUploadGrant({ householdId: actor.householdId, userId: actor.userId, objectPath: target.objectPath, contentType: input.contentType, size: input.size }) };
}

export async function ingestFinancialDocument(actor: Actor, input: {
  documentType: string; sourceFileName: string; sourceObjectPath: string; contentType: string; sourceSizeBytes: number;
  businessId?: string; sourceInstitution?: string; accountId?: string; statementStart?: string; statementEnd?: string;
  accountDisplayName?: string; accountMask?: string; uploadGrant: string;
}) {
  assertPermission(actor.role, "contribute");
  if (!acceptedTypes.has(input.documentType)) throw new GovernanceError("INVALID_STATE", "Unsupported financial document type");
  assertPrivateObjectPath(input.sourceObjectPath);
  assertDocumentUploadGrant(input.uploadGrant, {
    householdId: actor.householdId,
    userId: actor.userId,
    objectPath: input.sourceObjectPath,
    contentType: input.contentType,
    size: input.sourceSizeBytes,
  });
  const { bytes, sha256 } = await downloadBusinessDocument(input.sourceObjectPath, {
    maxBytes: 50 * 1024 * 1024,
    expectedBytes: input.sourceSizeBytes,
    expectedContentType: input.contentType,
  });
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`financial-document-ingest:${actor.householdId}:${sha256}`}, 0))`);
    const [existing] = await tx.select().from(financialDocuments).where(and(
      eq(financialDocuments.householdId, actor.householdId), eq(financialDocuments.documentHash, sha256),
    )).limit(1);
    if (existing) {
      const [statement] = await tx.select().from(bankStatementDocuments).where(and(
        eq(bankStatementDocuments.documentId, existing.id),
        eq(bankStatementDocuments.householdId, actor.householdId),
      )).limit(1);
      return response(existing, statement, statement ? await statementTransactions(tx, statement.id, actor.householdId) : []);
    }
    if (input.businessId) {
      const [business] = await tx.select({ id: businessEntities.id }).from(businessEntities).where(and(
        eq(businessEntities.id, input.businessId),
        eq(businessEntities.householdId, actor.householdId),
      )).limit(1);
      if (!business) throw new GovernanceError("INVALID_STATE", "Business does not belong to this household");
    }
    if (input.accountId) {
      const [account] = await tx.select({ id: financialAccounts.id }).from(financialAccounts).where(and(
        eq(financialAccounts.id, input.accountId),
        eq(financialAccounts.householdId, actor.householdId),
      )).limit(1);
      if (!account) throw new GovernanceError("INVALID_STATE", "Financial account does not belong to this household");
    }
    const [document] = await tx.insert(financialDocuments).values({
      householdId: actor.householdId, businessId: input.businessId, documentType: input.documentType,
      // No parser has claimed this evidence; it is explicitly awaiting human review.
      status: "UPLOADED", sourceInstitution: input.sourceInstitution, sourceFileName: input.sourceFileName,
      mimeType: input.contentType, sourceObjectPath: input.sourceObjectPath, documentHash: sha256,
      sourceMetadata: { declaredSizeBytes: input.sourceSizeBytes, observedSizeBytes: bytes.length, ingestion: "metadata_only" },
      uploadedBy: actor.userId,
    }).returning();
    let bankStatement: typeof bankStatementDocuments.$inferSelect | undefined;
    let transactions: StatementTransaction[] = [];
    if (input.documentType === "BANK_STATEMENT") {
      const parsed = await parseBankStatement(bytes, input.contentType);
      const parseable = parsed.errors.length === 0;
      await tx.update(financialDocuments).set({
        parserVersion: BANK_STATEMENT_PARSER_VERSION,
        status: parseable ? "NEEDS_REVIEW" : "NEEDS_REVIEW",
        sourceMetadata: { declaredSizeBytes: input.sourceSizeBytes, observedSizeBytes: bytes.length, parserVersion: BANK_STATEMENT_PARSER_VERSION, parserErrors: parsed.errors },
      }).where(eq(financialDocuments.id, document.id));
      [bankStatement] = await tx.insert(bankStatementDocuments).values({
        householdId: actor.householdId, documentId: document.id, accountId: input.accountId,
        institutionName: input.sourceInstitution, accountDisplayName: input.accountDisplayName, accountMask: input.accountMask,
        statementStart: input.statementStart, statementEnd: input.statementEnd,
        openingBalance: parsed.openingBalance ?? "0.00", closingBalance: parsed.closingBalance ?? "0.00",
        totalDeposits: parsed.totalDeposits ?? "0.00", totalWithdrawals: parsed.totalWithdrawals ?? "0.00",
        status: "document_evidence_pending_review",
      }).returning();
      if (parseable && parsed.rows.length) {
        const inserted = await tx.insert(bankStatementTransactions).values(parsed.rows.map((row) => ({
          householdId: actor.householdId, bankStatementDocumentId: bankStatement!.id, postedDate: row.postedDate,
          description: row.description, amount: row.amount, direction: row.direction, runningBalance: row.runningBalance,
          reference: row.reference, sourcePage: row.sourcePage, confidence: "0.95",
          sourceLine: row.sourceLine, sourceRegion: row.sourceRegion, parserVersion: BANK_STATEMENT_PARSER_VERSION,
          evidenceFingerprint: row.evidenceFingerprint, originalValue: row.originalValue,
          reviewStatus: "document_evidence_pending_review",
        }))).onConflictDoNothing({
          target: [bankStatementTransactions.householdId, bankStatementTransactions.evidenceFingerprint],
        }).returning();
        transactions = inserted.map((row) => ({ ...row, correctionHistory: [] }));
      }
    }
    await tx.insert(auditEvents).values({
      householdId: actor.householdId, eventType: "financial_document_ingested", actor: actor.userId,
      entity: "financial_document", entityId: document.id,
      reason: "Financial evidence recorded; no ledger entry or bank write was made.",
      metadata: { documentType: input.documentType, documentHash: sha256, bankStatement: Boolean(bankStatement) },
    });
    const [updatedDocument] = await tx.select().from(financialDocuments).where(eq(financialDocuments.id, document.id));
    return response(updatedDocument, bankStatement, transactions);
  });
}

export async function reviewBankStatementTransaction(actor: Actor, transactionId: string, input: {
  action: "APPROVE" | "REJECT" | "RECLASSIFY" | "LINK_SETTLEMENT" | "MARK_TRANSFER";
  reason: string; idempotencyKey: string; correctedValue?: Record<string, unknown>; settlementDocumentId?: string;
}) {
  assertPermission(actor.role, "approve");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`bank-statement-review:${actor.householdId}:${input.idempotencyKey}`}, 0))`);
    const [previous] = await tx.select().from(idempotencyKeys).where(and(eq(idempotencyKeys.householdId, actor.householdId), eq(idempotencyKeys.key, input.idempotencyKey)));
    if (previous) {
      if (previous.operation !== "bank_statement_transaction_review") throw new GovernanceError("IDEMPOTENCY_CONFLICT", "Idempotency-Key was used for another operation");
      return previous.responseBody;
    }
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`bank-statement-transaction:${actor.householdId}:${transactionId}`}, 0))`);
    const [row] = await tx.select().from(bankStatementTransactions).where(and(eq(bankStatementTransactions.id, transactionId), eq(bankStatementTransactions.householdId, actor.householdId))).limit(1);
    if (!row) throw new GovernanceError("INVALID_STATE", "Bank statement transaction not found");
    if (input.action === "LINK_SETTLEMENT" && !input.settlementDocumentId) throw new GovernanceError("INVALID_STATE", "A settlement document is required");
    if (input.action === "LINK_SETTLEMENT") {
      const [settlement] = await tx.select({ id: settlementDocuments.id, verificationStatus: settlementDocuments.verificationStatus })
        .from(settlementDocuments)
        .where(and(eq(settlementDocuments.id, input.settlementDocumentId!), eq(settlementDocuments.householdId, actor.householdId)))
        .limit(1);
      if (!settlement) throw new GovernanceError("INVALID_STATE", "Settlement document not found");
      if (settlement.verificationStatus === "rejected") throw new GovernanceError("INVALID_STATE", "Rejected settlement documents cannot be linked");
    }
    const statuses = { APPROVE: "RESOLVED", REJECT: "REJECTED", RECLASSIFY: "NEEDS_USER", LINK_SETTLEMENT: "RESOLVED", MARK_TRANSFER: "RESOLVED" } as const;
    const correction = input.correctedValue ?? null;
    const [updated] = await tx.update(bankStatementTransactions).set({
      reviewStatus: statuses[input.action], reviewedBy: actor.userId, reviewedAt: new Date(),
      correctedValue: correction ?? row.correctedValue, correctionReason: correction ? input.reason : row.correctionReason,
      linkedSettlementDocumentId: input.settlementDocumentId,
    }).where(and(eq(bankStatementTransactions.id, transactionId), eq(bankStatementTransactions.householdId, actor.householdId))).returning();
    if (correction) {
      const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(bankStatementTransactionCorrections).where(and(
        eq(bankStatementTransactionCorrections.householdId, actor.householdId),
        eq(bankStatementTransactionCorrections.transactionId, transactionId),
      ));
      await tx.insert(bankStatementTransactionCorrections).values({
        householdId: actor.householdId,
        transactionId,
        revision: count + 1,
        previousValue: row.correctedValue,
        correctedValue: correction,
        reason: input.reason,
        correctedBy: actor.userId,
      });
    }
    await tx.insert(auditEvents).values({ householdId: actor.householdId, eventType: "bank_statement_transaction_reviewed", actor: actor.userId, entity: "bank_statement_transaction", entityId: transactionId, reason: input.reason, metadata: { action: input.action, idempotencyKey: input.idempotencyKey, originalValue: row.originalValue } });
    const withHistory = await statementTransactions(tx, row.bankStatementDocumentId, actor.householdId);
    const result = withHistory.find((transaction) => transaction.id === updated.id) ?? { ...updated, correctionHistory: [] };
    await tx.insert(idempotencyKeys).values({ householdId: actor.householdId, key: input.idempotencyKey, operation: "bank_statement_transaction_review", responseStatus: 200, responseBody: result });
    return result;
  });
}

export async function listFinancialDocuments(actor: Actor) {
  const documents = await db.select().from(financialDocuments).where(eq(financialDocuments.householdId, actor.householdId)).orderBy(desc(financialDocuments.uploadedAt));
  const ids = documents.map((document) => document.id);
  const statements = ids.length ? await db.select().from(bankStatementDocuments).where(and(eq(bankStatementDocuments.householdId, actor.householdId), inArray(bankStatementDocuments.documentId, ids))) : [];
  const byDocument = new Map(statements.map((statement) => [statement.documentId, statement]));
  const statementRows = statements.length
    ? await Promise.all(statements.map((statement) => statementTransactions(db, statement.id, actor.householdId)))
    : [];
  const transactionsByStatement = new Map(statements.map((statement, index) => [statement.id, statementRows[index]]));
  return { documents: documents.map((document) => {
    const statement = byDocument.get(document.id);
    return response(document, statement, statement ? transactionsByStatement.get(statement.id) : []);
  }) };
}

export async function getFinancialDocument(actor: Actor, documentId: string) {
  const [document] = await db.select().from(financialDocuments).where(and(eq(financialDocuments.id, documentId), eq(financialDocuments.householdId, actor.householdId))).limit(1);
  if (!document) throw new GovernanceError("INVALID_STATE", "Financial document not found");
  const [statement] = await db.select().from(bankStatementDocuments).where(and(eq(bankStatementDocuments.documentId, document.id), eq(bankStatementDocuments.householdId, actor.householdId))).limit(1);
  const transactions = statement ? await statementTransactions(db, statement.id, actor.householdId) : [];
  return response(document, statement, transactions);
}

export async function reviewFinancialDocument(actor: Actor, documentId: string, input: { decision: "VERIFIED" | "REJECTED" | "NEEDS_REVIEW"; reason: string }) {
  assertPermission(actor.role, "approve");
  const [document] = await db.update(financialDocuments).set({
    status: input.decision, reviewDecision: input.decision, reviewReason: input.reason, reviewedBy: actor.userId, reviewedAt: new Date(),
  }).where(and(eq(financialDocuments.id, documentId), eq(financialDocuments.householdId, actor.householdId))).returning();
  if (!document) throw new GovernanceError("INVALID_STATE", "Financial document not found");
  await db.insert(auditEvents).values({ householdId: actor.householdId, eventType: "financial_document_reviewed", actor: actor.userId, entity: "financial_document", entityId: document.id, reason: input.reason, metadata: { decision: input.decision } });
  return getFinancialDocument(actor, document.id);
}

export async function listFinancialReviewQueue(actor: Actor) {
  const [documents, bankTransactions, settlements, pnls, math, pnlRuns, cashMatches, deductions, advances, escrow, income, pendingTransactions] = await Promise.all([
    db.select().from(financialDocuments).where(and(eq(financialDocuments.householdId, actor.householdId), inArray(financialDocuments.status, [...reviewableStatuses]))),
    db.select().from(bankStatementTransactions).where(and(
      eq(bankStatementTransactions.householdId, actor.householdId),
      inArray(bankStatementTransactions.reviewStatus, ["document_evidence_pending_review", "needs_user", "DOCUMENT_EVIDENCE_PENDING_REVIEW", "NEEDS_USER"]),
    )),
    db.select().from(settlementDocuments).where(and(eq(settlementDocuments.householdId, actor.householdId), eq(settlementDocuments.verificationStatus, "needs_review"))),
    db.select().from(profitLossDocuments).where(and(eq(profitLossDocuments.householdId, actor.householdId), eq(profitLossDocuments.verificationStatus, "needs_review"))),
    db.select().from(settlementMathReconciliations).where(and(eq(settlementMathReconciliations.householdId, actor.householdId), inArray(settlementMathReconciliations.status, ["unresolved_variance", "failed", "needs_review"]))),
    db.select().from(profitLossReconciliationRuns).where(and(eq(profitLossReconciliationRuns.householdId, actor.householdId), inArray(profitLossReconciliationRuns.status, ["review_required", "period_mismatch", "needs_review"]))),
    db.select().from(settlementCashMatches).where(and(eq(settlementCashMatches.householdId, actor.householdId), inArray(settlementCashMatches.matchStatus, ["unmatched", "ambiguous", "missing", "partial_match", "timing_match"]))),
    db.select().from(settlementDeductionLines).where(and(eq(settlementDeductionLines.householdId, actor.householdId), eq(settlementDeductionLines.reviewStatus, "needs_review"))),
    db.select().from(businessAdvances).where(and(eq(businessAdvances.householdId, actor.householdId), inArray(businessAdvances.status, ["open", "needs_review"]))),
    db.select().from(businessEscrowMovements).where(and(eq(businessEscrowMovements.householdId, actor.householdId), inArray(businessEscrowMovements.status, ["needs_review", "unknown"]))),
    db.select().from(verifiedHouseholdIncomeEvents).where(and(eq(verifiedHouseholdIncomeEvents.householdId, actor.householdId), inArray(verifiedHouseholdIncomeEvents.verificationStatus, ["needs_review", "cash_received", "eligible_for_draw"]))),
    db.select().from(financeTransactions).where(and(eq(financeTransactions.householdId, actor.householdId), eq(financeTransactions.pending, true))),
  ]);
  const queueStatus = (status: string) => {
    if (status === "REJECTED" || status === "rejected") return "REJECTED";
    if (status === "RESOLVED" || status === "verified") return "RESOLVED";
    if (status === "READY_FOR_APPROVAL" || status === "parsed") return "READY_FOR_APPROVAL";
    if (status === "NEEDS_USER" || status === "needs_review" || status === "NEEDS_REVIEW") return "NEEDS_USER";
    return "OPEN";
  };
  return { items: [
    ...documents.map((row) => ({ type: "financial_document", id: row.id, status: queueStatus(row.status), sourceFileName: row.sourceFileName })),
    ...bankTransactions.map((row) => ({ type: "bank_statement_transaction", id: row.id, status: queueStatus(row.reviewStatus), description: row.description })),
    ...settlements.map((row) => ({ type: "settlement", id: row.id, status: queueStatus(row.verificationStatus), sourceFileName: row.sourceFileName })),
    ...pnls.map((row) => ({ type: "profit_loss", id: row.id, status: queueStatus(row.verificationStatus), sourceFileName: row.sourceFileName })),
    ...math.map((row) => ({ type: "settlement_math_variance", id: row.id, sourceEntityId: row.settlementDocumentId, status: queueStatus(row.status), reason: row.reason })),
    ...pnlRuns.map((row) => ({ type: "profit_loss_mismatch", id: row.id, status: queueStatus(row.status), reason: row.reason })),
    ...cashMatches.map((row) => ({ type: "settlement_deposit_match", id: row.id, sourceEntityId: row.settlementDocumentId, status: queueStatus(row.matchStatus), reason: row.reason })),
    ...deductions.map((row) => ({ type: "settlement_economic_treatment", id: row.id, sourceEntityId: row.settlementDocumentId, status: queueStatus(row.reviewStatus), description: row.description })),
    ...advances.map((row) => ({ type: "advance_recovery", id: row.id, status: queueStatus(row.status), counterparty: row.counterparty })),
    ...escrow.map((row) => ({ type: "escrow_classification", id: row.id, status: queueStatus(row.status), direction: row.direction })),
    ...income.map((row) => ({ type: "verified_income", id: row.id, sourceEntityId: row.ownerDrawProposalId, status: queueStatus(row.verificationStatus) })),
    ...pendingTransactions.map((row) => ({ type: "pending_budget_transaction", id: row.id, status: "OPEN", description: row.description })),
  ] };
}