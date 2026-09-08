import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  auditEvents, bankStatementDocuments, bankStatementTransactionCorrections, bankStatementTransactions, financialDocuments, idempotencyKeys,
  businessAdvances, businessEntities, businessEscrowMovements, financeTransactions, financialAccounts, profitLossDocuments, profitLossReconciliationRuns,
  settlementCashMatches, settlementDocuments, settlementMathReconciliations, settlementDeductionLines, verifiedHouseholdIncomeEvents,
  financeCategories, statementFinancialInclusions, statementFinancialReversals,
} from "@workspace/db/schema";
import type { Actor } from "./capital-os";
import { assertPermission, GovernanceError } from "../domain/governance";
import { assertDocumentUploadGrant, assertPrivateObjectPath, createDocumentUploadGrant, downloadBusinessDocument, requestBusinessDocumentUpload } from "../lib/business-document-storage";
import { BANK_STATEMENT_PARSER_VERSION, parseBankStatement } from "./bank-statement-parser";
import { statementRowFingerprint } from "../domain/document-budget-bridge";

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
    if (input.correctedValue && "amount" in input.correctedValue) {
      const amount = input.correctedValue.amount;
      if (typeof amount !== "string" || !/^-?\d+(?:\.\d{1,2})?$/.test(amount.trim())) {
        throw new GovernanceError("INVALID_STATE", "Corrected amount must be a decimal value with at most two places");
      }
    }
    // Every action is recorded explicitly. In particular, a resolved row is not
    // necessarily an approved economic observation (it may be a transfer/link).
    const statuses = { APPROVE: "RESOLVED", REJECT: "REJECTED", RECLASSIFY: "RESOLVED", LINK_SETTLEMENT: "RESOLVED", MARK_TRANSFER: "RESOLVED" } as const;
    const correction = input.correctedValue ?? null;
    const [updated] = await tx.update(bankStatementTransactions).set({
      reviewStatus: statuses[input.action], reviewedBy: actor.userId, reviewedAt: new Date(),
      lastReviewAction: input.action,
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
      if (typeof correction.amount === "string") {
        const [inclusion] = await tx.select().from(statementFinancialInclusions).where(and(
          eq(statementFinancialInclusions.householdId, actor.householdId),
          eq(statementFinancialInclusions.statementRowId, transactionId),
        )).limit(1);
        if (inclusion && inclusion.status !== "REVERSED") {
          const officialId = inclusion.createdFinanceTransactionId ?? inclusion.matchedFinanceTransactionId;
          const [official] = officialId ? await tx.select({ amount: financeTransactions.amount }).from(financeTransactions).where(and(
            eq(financeTransactions.id, officialId),
            eq(financeTransactions.householdId, actor.householdId),
          )).limit(1) : [];
          if (official && exactMoney(correction.amount) !== exactMoney(official.amount)) {
            await tx.update(statementFinancialInclusions).set({ reviewRequired: true, mismatchCode: "SOURCE_OFFICIAL_MISMATCH", reconciliationStatus: "REQUIRED", updatedAt: new Date() }).where(eq(statementFinancialInclusions.id, inclusion.id));
            await tx.insert(auditEvents).values({ householdId: actor.householdId, eventType: "statement_source_official_mismatch", actor: actor.userId, entity: "statement_financial_inclusion", entityId: inclusion.id, reason: input.reason, metadata: { cause: "SOURCE_AMOUNT_CHANGED", sourceAmount: exactMoney(correction.amount), officialAmount: exactMoney(official.amount) } });
          }
        }
      }
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
  return db.transaction(async (tx) => {
    // Serialize header and child review changes so verification cannot race an
    // outstanding child review.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`financial-document-review:${actor.householdId}:${documentId}`}, 0))`);
    const [existing] = await tx.select().from(financialDocuments).where(and(
      eq(financialDocuments.id, documentId),
      eq(financialDocuments.householdId, actor.householdId),
    )).limit(1);
    if (!existing) throw new GovernanceError("INVALID_STATE", "Financial document not found");
    const [statement] = await tx.select().from(bankStatementDocuments).where(and(
      eq(bankStatementDocuments.documentId, documentId),
      eq(bankStatementDocuments.householdId, actor.householdId),
    )).limit(1);
    if (statement && input.decision === "VERIFIED") {
      const metadata = existing.sourceMetadata ?? {};
      const parserErrors = Array.isArray(metadata.parserErrors) ? metadata.parserErrors : [];
      const children = await tx.select({ reviewStatus: bankStatementTransactions.reviewStatus }).from(bankStatementTransactions).where(and(
        eq(bankStatementTransactions.householdId, actor.householdId),
        eq(bankStatementTransactions.bankStatementDocumentId, statement.id),
      ));
      if (parserErrors.length || children.some((child) => !["RESOLVED", "REJECTED"].includes(child.reviewStatus.toUpperCase()))) {
        throw new GovernanceError("INVALID_STATE", "Bank statement cannot be verified until parsing errors and every child row are reviewed");
      }
    }
    if (statement && input.decision === "REJECTED") {
      // Preserve terminal review history; only unresolved evidence is cascaded.
      await tx.update(bankStatementTransactions).set({
        reviewStatus: "REJECTED",
        lastReviewAction: "REJECT",
        reviewedBy: actor.userId,
        reviewedAt: new Date(),
      }).where(and(
        eq(bankStatementTransactions.householdId, actor.householdId),
        eq(bankStatementTransactions.bankStatementDocumentId, statement.id),
        sql`upper(${bankStatementTransactions.reviewStatus}) not in ('RESOLVED', 'REJECTED')`,
      ));
      await tx.update(bankStatementDocuments).set({ status: "document_evidence_rejected" }).where(and(
        eq(bankStatementDocuments.id, statement.id),
        eq(bankStatementDocuments.householdId, actor.householdId),
      ));
      // Parent rejection is source evidence disagreement, not authority to
      // delete or rewrite an already official transaction.
      const affected = await tx.select({ id: statementFinancialInclusions.id }).from(statementFinancialInclusions).where(and(
        eq(statementFinancialInclusions.householdId, actor.householdId),
        eq(statementFinancialInclusions.statementDocumentId, statement.id),
        inArray(statementFinancialInclusions.status, ["IMPORTED_NEW", "LINKED_EXISTING"]),
      ));
      if (affected.length) {
        await tx.update(statementFinancialInclusions).set({ reviewRequired: true, mismatchCode: "SOURCE_OFFICIAL_MISMATCH", reconciliationStatus: "REQUIRED", updatedAt: new Date() }).where(inArray(statementFinancialInclusions.id, affected.map((row) => row.id)));
        await tx.insert(auditEvents).values(affected.map((row) => ({ householdId: actor.householdId, eventType: "statement_source_official_mismatch", actor: actor.userId, entity: "statement_financial_inclusion", entityId: row.id, reason: input.reason, metadata: { cause: "PARENT_REJECTED" } })));
      }
    } else if (statement && input.decision === "VERIFIED") {
      await tx.update(bankStatementDocuments).set({ status: "document_evidence_verified" }).where(and(
        eq(bankStatementDocuments.id, statement.id),
        eq(bankStatementDocuments.householdId, actor.householdId),
      ));
    }
    const [document] = await tx.update(financialDocuments).set({
      status: input.decision, reviewDecision: input.decision, reviewReason: input.reason, reviewedBy: actor.userId, reviewedAt: new Date(),
    }).where(and(eq(financialDocuments.id, documentId), eq(financialDocuments.householdId, actor.householdId))).returning();
    await tx.insert(auditEvents).values({ householdId: actor.householdId, eventType: "financial_document_reviewed", actor: actor.userId, entity: "financial_document", entityId: document.id, reason: input.reason, metadata: { decision: input.decision, bankStatement: Boolean(statement) } });
    const refreshedStatement = statement ? (await tx.select().from(bankStatementDocuments).where(eq(bankStatementDocuments.id, statement.id)).limit(1))[0] : undefined;
    return response(document, refreshedStatement, refreshedStatement ? await statementTransactions(tx, refreshedStatement.id, actor.householdId) : []);
  });
}

export async function listFinancialReviewQueue(actor: Actor) {
    const [documents, bankTransactions, settlements, pnls, math, pnlRuns, cashMatches, deductions, advances, escrow, income, pendingTransactions, inclusionMismatches] = await Promise.all([
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
      db.select().from(statementFinancialInclusions).where(and(eq(statementFinancialInclusions.householdId, actor.householdId), eq(statementFinancialInclusions.reviewRequired, true))),
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
    ...inclusionMismatches.map((row) => ({ type: "source_official_mismatch", id: row.id, sourceEntityId: row.statementRowId, status: "OPEN", reason: row.mismatchCode })),
  ] };
}

const normalizeMatchText = (value: string | null | undefined) =>
  (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
const cents = (value: string | null) => {
  if (!value || !/^-?\d+(?:\.\d{1,2})?$/.test(value)) throw new GovernanceError("INVALID_STATE", "Statement amount must be exact cents");
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  return (negative ? -1 : 1) * (Number(whole) * 100 + Number((fraction + "00").slice(0, 2)));
};
const exactMoney = (value: string | null) => `${cents(value) < 0 ? "-" : ""}${Math.floor(Math.abs(cents(value)) / 100)}.${String(Math.abs(cents(value)) % 100).padStart(2, "0")}`;
const authoritativeStatementAmount = (row: typeof bankStatementTransactions.$inferSelect) => {
  const corrected = row.correctedValue?.amount;
  return exactMoney(typeof corrected === "string" ? corrected : row.amount);
};

async function bridgeRow(tx: Pick<typeof db, "select">, householdId: string, id: string) {
  const [row] = await tx.select().from(bankStatementTransactions).where(and(eq(bankStatementTransactions.id, id), eq(bankStatementTransactions.householdId, householdId))).limit(1);
  if (!row) throw new GovernanceError("INVALID_STATE", "Bank statement transaction not found");
  const [statement] = await tx.select().from(bankStatementDocuments).where(and(eq(bankStatementDocuments.id, row.bankStatementDocumentId), eq(bankStatementDocuments.householdId, householdId))).limit(1);
  if (!statement?.accountId) throw new GovernanceError("INVALID_STATE", "Statement must be mapped to a household financial account");
  const [account] = await tx.select({ id: financialAccounts.id }).from(financialAccounts).where(and(
    eq(financialAccounts.id, statement.accountId),
    eq(financialAccounts.householdId, householdId),
  )).limit(1);
  if (!account) throw new GovernanceError("INVALID_STATE", "Statement account does not belong to this household");
  const [document] = await tx.select().from(financialDocuments).where(and(eq(financialDocuments.id, statement.documentId), eq(financialDocuments.householdId, householdId))).limit(1);
  if (!document) throw new GovernanceError("INVALID_STATE", "Statement source document not found");
  return { row, statement, document };
}
function inclusionResponse(row: typeof statementFinancialInclusions.$inferSelect) { return row; }

async function matchPreview(tx: Pick<typeof db, "select">, householdId: string, rowId: string): Promise<any> {
  const { row, statement } = await bridgeRow(tx, householdId, rowId);
  const [existing] = await tx.select().from(statementFinancialInclusions).where(and(eq(statementFinancialInclusions.householdId, householdId), eq(statementFinancialInclusions.statementRowId, row.id))).limit(1);
  const amount = authoritativeStatementAmount(row);
  const fingerprint = statementRowFingerprint({ householdId, accountId: statement.accountId, postedDate: row.postedDate, signedAmount: amount, description: row.description, reference: row.reference });
  if (existing) return { statementRowId: row.id, outcome: existing.status === "REVERSED" ? "KNOWN_DUPLICATE" : "EXACT_ALREADY_LINKED", candidates: [], canImportAsNew: false, requiresHumanDecision: true, existingInclusionId: existing.id };
  const all = await tx.select().from(financeTransactions).where(and(eq(financeTransactions.householdId, householdId), eq(financeTransactions.accountId, statement.accountId!), eq(financeTransactions.transactionDate, row.postedDate!), eq(financeTransactions.amount, amount)));
  const rowWords = new Set([normalizeMatchText(row.description), normalizeMatchText(row.reference)]);
  const candidates = all.filter((candidate) => rowWords.has(normalizeMatchText(candidate.description)) || (candidate.merchant && rowWords.has(normalizeMatchText(candidate.merchant))) || candidate.statementRowFingerprint === fingerprint)
    .map((candidate) => ({ financeTransactionId: candidate.id, accountId: candidate.accountId, transactionDate: new Date(`${candidate.transactionDate}T00:00:00.000Z`), amount: exactMoney(candidate.amount), description: candidate.description, merchant: candidate.merchant, categoryId: candidate.categoryId, confidence: "HIGH" as const, reasons: ["same household", "same account", "same signed cents", "same date", "normalized source identity"] }));
  const outcome = candidates.length === 0 ? "NO_MATCH" : candidates.length === 1 ? "ONE_HIGH_CONFIDENCE_MATCH" : "MULTIPLE_CANDIDATES";
  return { statementRowId: row.id, outcome, candidates, canImportAsNew: outcome === "NO_MATCH", requiresHumanDecision: outcome !== "NO_MATCH", existingInclusionId: null };
}

export async function previewBankStatementTransactionMatch(actor: Actor, transactionId: string) {
  assertPermission(actor.role, "approve");
  return matchPreview(db, actor.householdId, transactionId);
}
export async function getBankStatementTransactionInclusion(actor: Actor, transactionId: string) {
  assertPermission(actor.role, "read");
  const [inclusion] = await db.select().from(statementFinancialInclusions).where(and(
    eq(statementFinancialInclusions.householdId, actor.householdId),
    eq(statementFinancialInclusions.statementRowId, transactionId),
  )).limit(1);
  if (!inclusion) throw new GovernanceError("INVALID_STATE", "Statement row has no financial inclusion");
  return inclusion;
}
export async function reconcileBankStatementTransactionInclusion(actor: Actor, transactionId: string, input: { reason: string; idempotencyKey: string }) {
  return inclusionMutation(actor, transactionId, input.idempotencyKey, "statement_inclusion_reconcile", async (tx, source) => {
    const [existing] = await tx.select().from(statementFinancialInclusions).where(and(eq(statementFinancialInclusions.householdId, actor.householdId), eq(statementFinancialInclusions.statementRowId, source.row.id))).limit(1);
    if (!existing?.reviewRequired) throw new GovernanceError("INVALID_STATE", "Statement inclusion has no outstanding reconciliation");
    const [updated] = await tx.update(statementFinancialInclusions).set({ reviewRequired: false, reconciliationStatus: "RESOLVED", reconciledBy: actor.userId, reconciledAt: new Date(), updatedAt: new Date() }).where(eq(statementFinancialInclusions.id, existing.id)).returning();
    await tx.insert(auditEvents).values({ householdId: actor.householdId, eventType: "statement_inclusion_reconciled", actor: actor.userId, entity: "statement_financial_inclusion", entityId: existing.id, reason: input.reason, metadata: { mismatchCode: existing.mismatchCode } });
    return updated;
  });
}

export async function decideBankStatementTransactionCategory(actor: Actor, transactionId: string, input: { status: "USER_CONFIRMED" | "USER_CORRECTED" | "NOT_APPLICABLE_TRANSFER" | "NOT_APPLICABLE_SETTLEMENT" | "REJECTED"; categoryId?: string | null; economicClassification: "HOUSEHOLD" | "BUSINESS" | "TRANSFER" | "SETTLEMENT_LINK" | "UNKNOWN"; reason: string; idempotencyKey: string }) {
  assertPermission(actor.role, "approve");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`statement-category:${actor.householdId}:${transactionId}:${input.idempotencyKey}`}, 0))`);
    const [prior] = await tx.select().from(idempotencyKeys).where(and(eq(idempotencyKeys.householdId, actor.householdId), eq(idempotencyKeys.key, input.idempotencyKey))).limit(1);
    if (prior) { if (prior.operation !== "statement_category_decision") throw new GovernanceError("IDEMPOTENCY_CONFLICT", "Idempotency-Key was used for another operation"); return prior.responseBody; }
    const { row } = await bridgeRow(tx, actor.householdId, transactionId);
    const [existingInclusion] = await tx.select().from(statementFinancialInclusions).where(and(eq(statementFinancialInclusions.householdId, actor.householdId), eq(statementFinancialInclusions.statementRowId, row.id))).limit(1);
    if (existingInclusion && existingInclusion.status !== "REVERSED" && (existingInclusion.categoryId !== (input.categoryId ?? null) || input.economicClassification !== "HOUSEHOLD")) {
      await tx.update(statementFinancialInclusions).set({ reviewRequired: true, mismatchCode: "SOURCE_OFFICIAL_MISMATCH", reconciliationStatus: "REQUIRED", updatedAt: new Date() }).where(eq(statementFinancialInclusions.id, existingInclusion.id));
      await tx.insert(auditEvents).values({ householdId: actor.householdId, eventType: "statement_source_official_mismatch", actor: actor.userId, entity: "statement_financial_inclusion", entityId: existingInclusion.id, reason: input.reason, metadata: { cause: "SOURCE_CATEGORY_OR_CLASSIFICATION_CHANGED" } });
    }
    if (input.economicClassification === "HOUSEHOLD") {
      if (!input.categoryId || !["USER_CONFIRMED", "USER_CORRECTED"].includes(input.status)) throw new GovernanceError("INVALID_STATE", "Household inclusion requires an explicit category decision");
      const [category] = await tx.select().from(financeCategories).where(and(eq(financeCategories.id, input.categoryId), eq(financeCategories.householdId, actor.householdId), eq(financeCategories.active, true))).limit(1);
      if (!category) throw new GovernanceError("INVALID_STATE", "Category must be active and belong to this household");
    } else if (input.categoryId) throw new GovernanceError("INVALID_STATE", "Non-household evidence cannot receive a household category");
    const [updated] = await tx.update(bankStatementTransactions).set({ selectedCategoryId: input.categoryId ?? null, categoryDecisionStatus: input.status, economicClassification: input.economicClassification, categoryDecidedBy: actor.userId, categoryDecidedAt: new Date(), categoryCorrectionVersion: row.categoryCorrectionVersion + 1 }).where(eq(bankStatementTransactions.id, row.id)).returning();
    const result = { ...updated, correctionHistory: [] };
    await tx.insert(auditEvents).values({ householdId: actor.householdId, eventType: "statement_category_decided", actor: actor.userId, entity: "bank_statement_transaction", entityId: row.id, reason: input.reason, metadata: { status: input.status, economicClassification: input.economicClassification, categoryId: input.categoryId } });
    await tx.insert(idempotencyKeys).values({ householdId: actor.householdId, key: input.idempotencyKey, operation: "statement_category_decision", responseStatus: 200, responseBody: result });
    return result;
  });
}

async function inclusionMutation<T>(actor: Actor, rowId: string, key: string, operation: string, perform: (tx: typeof db, row: Awaited<ReturnType<typeof bridgeRow>>) => Promise<T>): Promise<T> {
  assertPermission(actor.role, "approve");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`statement-inclusion:${actor.householdId}:${rowId}`}, 0))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`statement-idempotency:${actor.householdId}:${key}`}, 0))`);
    const [prior] = await tx.select().from(idempotencyKeys).where(and(eq(idempotencyKeys.householdId, actor.householdId), eq(idempotencyKeys.key, key))).limit(1);
    if (prior) { if (prior.operation !== operation) throw new GovernanceError("IDEMPOTENCY_CONFLICT", "Idempotency-Key was used for another operation"); return prior.responseBody as T; }
    const result = await perform(tx as unknown as typeof db, await bridgeRow(tx, actor.householdId, rowId));
    await tx.insert(idempotencyKeys).values({ householdId: actor.householdId, key, operation, responseStatus: 200, responseBody: result as Record<string, unknown> });
    return result;
  });
}

export async function importBankStatementTransaction(actor: Actor, rowId: string, input: { idempotencyKey: string; expectedMatchOutcome?: "NO_MATCH" | "MULTIPLE_CANDIDATES" }) {
  return inclusionMutation(actor, rowId, input.idempotencyKey, "statement_import", async (tx, source) => {
    const [alreadyIncluded] = await tx.select().from(statementFinancialInclusions).where(and(eq(statementFinancialInclusions.householdId, actor.householdId), eq(statementFinancialInclusions.statementRowId, rowId))).limit(1);
    if (alreadyIncluded) {
      if (alreadyIncluded.status === "REVERSED") throw new GovernanceError("CONFLICT", "Reversed statement evidence cannot be imported again without explicit reconciliation");
      return inclusionResponse(alreadyIncluded);
    }
    if (source.document.reviewDecision !== "VERIFIED" || !["APPROVE", "RECLASSIFY"].includes(source.row.lastReviewAction ?? "")) throw new GovernanceError("INVALID_STATE", "Import requires verified parent evidence and approved row review");
    if (source.row.economicClassification !== "HOUSEHOLD" || !source.row.selectedCategoryId) throw new GovernanceError("INVALID_STATE", "Only explicitly classified household evidence may be imported");
    const preview = await matchPreview(tx, actor.householdId, rowId);
    if (preview.outcome !== "NO_MATCH" || input.expectedMatchOutcome === "MULTIPLE_CANDIDATES") throw new GovernanceError("CONFLICT", "A matching transaction requires explicit link or duplicate review");
    const amount = authoritativeStatementAmount(source.row);
    const fp = statementRowFingerprint({ householdId: actor.householdId, accountId: source.statement.accountId, postedDate: source.row.postedDate, signedAmount: amount, description: source.row.description, reference: source.row.reference });
    const [created] = await tx.insert(financeTransactions).values({ householdId: actor.householdId, accountId: source.statement.accountId!, transactionDate: source.row.postedDate!, description: source.row.description, originalAmount: amount, amount, categoryId: source.row.selectedCategoryId, dataSource: "bank_statement_import", sourceDocumentId: source.document.id, sourceStatementRowId: source.row.id, statementRowFingerprint: fp, importedBy: actor.userId, importedAt: new Date(), reviewStatus: "approved", pending: false, excludedFromBudget: false, metadata: { provenance: "bank_statement_import", evidenceFingerprint: source.row.evidenceFingerprint, incomeVerified: false } }).returning();
    const [inclusion] = await tx.insert(statementFinancialInclusions).values({ householdId: actor.householdId, statementDocumentId: source.statement.id, statementRowId: source.row.id, statementRowFingerprint: fp, evidenceDecision: source.row.lastReviewAction!, categoryId: source.row.selectedCategoryId, inclusionDecision: "IMPORT_NEW", createdFinanceTransactionId: created.id, duplicateStatus: "NO_MATCH", transferStatus: "NOT_TRANSFER", settlementLinkStatus: "NOT_LINKED", approvedBy: actor.userId, approvedAt: new Date(), status: "IMPORTED_NEW" }).returning();
    await tx.insert(auditEvents).values({ householdId: actor.householdId, eventType: "statement_financial_imported", actor: actor.userId, entity: "statement_financial_inclusion", entityId: inclusion.id, reason: "Approved statement evidence imported once", metadata: { financeTransactionId: created.id, amount } });
    return inclusionResponse(inclusion);
  });
}

export async function linkBankStatementTransaction(actor: Actor, rowId: string, input: { financeTransactionId: string; idempotencyKey: string }) {
  return inclusionMutation(actor, rowId, input.idempotencyKey, "statement_link", async (tx, source) => {
    const [target] = await tx.select().from(financeTransactions).where(and(
      eq(financeTransactions.id, input.financeTransactionId),
      eq(financeTransactions.householdId, actor.householdId),
      eq(financeTransactions.accountId, source.statement.accountId!),
    )).limit(1);
    if (!target) throw new GovernanceError("CONFLICT", "Selected transaction is not the sole verified match candidate");
    const [alreadyIncluded] = await tx.select().from(statementFinancialInclusions).where(and(eq(statementFinancialInclusions.householdId, actor.householdId), eq(statementFinancialInclusions.statementRowId, rowId))).limit(1);
    if (alreadyIncluded) {
      if (alreadyIncluded.status === "REVERSED") throw new GovernanceError("CONFLICT", "Reversed statement evidence cannot be linked again without explicit reconciliation");
      if (alreadyIncluded.status === "LINKED_EXISTING" && alreadyIncluded.matchedFinanceTransactionId === target.id) return inclusionResponse(alreadyIncluded);
      throw new GovernanceError("CONFLICT", "Statement evidence already has a different active financial inclusion");
    }
    if (source.document.reviewDecision !== "VERIFIED" || !["APPROVE", "RECLASSIFY"].includes(source.row.lastReviewAction ?? "")) throw new GovernanceError("INVALID_STATE", "Link requires verified parent evidence and approved row review");
    if (source.row.economicClassification !== "HOUSEHOLD" || !source.row.selectedCategoryId) throw new GovernanceError("INVALID_STATE", "Only explicitly classified household evidence may be linked");
    const preview = await matchPreview(tx, actor.householdId, rowId);
    const candidate = preview.candidates.find((item: { financeTransactionId: string }) => item.financeTransactionId === input.financeTransactionId);
    if (!candidate || preview.outcome !== "ONE_HIGH_CONFIDENCE_MATCH") throw new GovernanceError("CONFLICT", "Selected transaction is not the sole verified match candidate");
    if (target.categoryId !== source.row.selectedCategoryId) throw new GovernanceError("INVALID_STATE", "Linked transaction must have the selected household category and account");
    const fp = statementRowFingerprint({ householdId: actor.householdId, accountId: source.statement.accountId, postedDate: source.row.postedDate, signedAmount: authoritativeStatementAmount(source.row), description: source.row.description, reference: source.row.reference });
    const [inclusion] = await tx.insert(statementFinancialInclusions).values({ householdId: actor.householdId, statementDocumentId: source.statement.id, statementRowId: source.row.id, statementRowFingerprint: fp, evidenceDecision: source.row.lastReviewAction!, categoryId: source.row.selectedCategoryId, inclusionDecision: "LINK_EXISTING", matchedFinanceTransactionId: target.id, duplicateStatus: "ONE_HIGH_CONFIDENCE_MATCH", transferStatus: "NOT_TRANSFER", settlementLinkStatus: "NOT_LINKED", approvedBy: actor.userId, approvedAt: new Date(), status: "LINKED_EXISTING" }).returning();
    await tx.insert(auditEvents).values({ householdId: actor.householdId, eventType: "statement_financial_linked", actor: actor.userId, entity: "statement_financial_inclusion", entityId: inclusion.id, reason: "Evidence linked to existing transaction", metadata: { financeTransactionId: target.id } });
    return inclusionResponse(inclusion);
  });
}

async function reverseStatementInclusion(actor: Actor, rowId: string, input: { reason: string; idempotencyKey: string }, operation: string, requireImported: boolean) {
  return inclusionMutation(actor, rowId, input.idempotencyKey, operation, async (tx, source) => {
    const [existing] = await tx.select().from(statementFinancialInclusions).where(and(eq(statementFinancialInclusions.householdId, actor.householdId), eq(statementFinancialInclusions.statementRowId, source.row.id))).limit(1);
    if (!existing || existing.status === "REVERSED") throw new GovernanceError("CONFLICT", "Statement row has no active inclusion to reverse");
    if (requireImported && existing.status !== "IMPORTED_NEW") throw new GovernanceError("INVALID_STATE", "Reverse import only applies to an imported transaction");
    const transactionId = existing.createdFinanceTransactionId ?? existing.matchedFinanceTransactionId;
    if (existing.createdFinanceTransactionId) await tx.update(financeTransactions).set({ excludedFromBudget: true, metadata: sql`${financeTransactions.metadata} || ${JSON.stringify({ statementImportReversed: true, reconciliationRequired: true })}::jsonb` }).where(and(eq(financeTransactions.id, existing.createdFinanceTransactionId), eq(financeTransactions.householdId, actor.householdId)));
    const [inclusion] = await tx.update(statementFinancialInclusions).set({ status: "REVERSED", reversedBy: actor.userId, reversedAt: new Date(), updatedAt: new Date() }).where(eq(statementFinancialInclusions.id, existing.id)).returning();
    const [reversal] = await tx.insert(statementFinancialReversals).values({ householdId: actor.householdId, inclusionId: existing.id, statementRowId: source.row.id, financeTransactionId: transactionId, previousState: existing, newState: inclusion, reason: input.reason, actor: actor.userId }).returning();
    await tx.insert(auditEvents).values({ householdId: actor.householdId, eventType: "statement_financial_reversed", actor: actor.userId, entity: "statement_financial_inclusion", entityId: existing.id, reason: input.reason, metadata: { before: existing.status, after: inclusion.status, financeTransactionId: transactionId } });
    return { inclusion, reversal };
  });
}
export const unlinkBankStatementTransaction = (actor: Actor, rowId: string, input: { reason: string; idempotencyKey: string }) => reverseStatementInclusion(actor, rowId, input, "statement_unlink", false);
export const reverseBankStatementTransactionImport = (actor: Actor, rowId: string, input: { reason: string; idempotencyKey: string }) => reverseStatementInclusion(actor, rowId, input, "statement_reverse_import", true);