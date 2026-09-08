import { createHash } from "node:crypto";
import { and, eq, inArray, notInArray, or, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  auditEvents,
  bankStatementDocuments,
  bankStatementTransactionCorrections,
  bankStatementTransactions,
  businessEarningsEvents,
  businessDistributions,
  businessEntities,
  businessIncomeAnomalies,
  businessReserves,
  budgetPlanningPeriods,
  economicEventLinks,
  financeTransactions,
  financialAccounts,
  financialDocumentIdentityReviews,
  financialDocumentParseGenerations,
  financialDocuments,
  financialDocumentTypeCorrections,
  financialDocumentTypeDetections,
  financialEvidenceDeletionTombstones,
  idempotencyKeys,
  incomeSources,
  ownerDrawProposals,
  profitLossDocuments,
  profitLossLines,
  profitLossReconciliationRuns,
  settlementCashMatches,
  settlementDeductionLines,
  settlementDocuments,
  settlementMathReconciliations,
  settlementRevenueLines,
  statementFinancialInclusions,
  statementFinancialReversals,
  verifiedHouseholdIncomeEvents,
} from "@workspace/db/schema";
import type { Actor } from "./capital-os";
import { assertPermission, GovernanceError, hasPermission } from "../domain/governance";
import {
  assertBusinessDocumentObjectExists,
  businessDocumentObjectExists,
  deleteBusinessDocumentObject,
} from "../lib/business-document-storage";

const RESET_CONFIRMATION = "RESET FINANCIAL EVIDENCE";
const DELETE_CONFIRMATION = "DELETE FINANCIAL EVIDENCE";
const BULK_OPERATION = "financial_evidence_reset";
const SINGLE_OPERATION = "financial_document_evidence_delete";

type Scope = "ALL" | "SINGLE";
type DeletionInput = {
  confirmationPhrase: string;
  reason: string;
  idempotencyKey: string;
};
type Executor = Pick<typeof db, "select">;

function usesIsolatedStorageStub() {
  return process.env.NODE_ENV === "test" && ["stub", "fail-after-one"].includes(process.env.CAPITAL_OS_TEST_OBJECT_STORAGE ?? "");
}
let isolatedStorageDeleteCount = 0;

async function assertStorageObjectExists(objectPath: string) {
  if (process.env.NODE_ENV === "test" && process.env.CAPITAL_OS_TEST_OBJECT_STORAGE === "fail") {
    throw new Error(`Isolated storage preflight rejected ${objectPath}`);
  }
  if (!usesIsolatedStorageStub()) await assertBusinessDocumentObjectExists(objectPath);
}

async function deleteStorageObject(objectPath: string) {
  if (process.env.NODE_ENV === "test" && process.env.CAPITAL_OS_TEST_OBJECT_STORAGE === "fail-after-one") {
    isolatedStorageDeleteCount += 1;
    if (isolatedStorageDeleteCount > 1) throw new Error(`Isolated storage deletion rejected ${objectPath}`);
  }
  if (!usesIsolatedStorageStub()) await deleteBusinessDocumentObject(objectPath);
}

type RemovalCounts = {
  financialDocuments: number;
  documentTypeDetections: number;
  typeCorrections: number;
  parserGenerations: number;
  identityReviews: number;
  documentRelationshipUpdates: number;
  bankStatementDocuments: number;
  bankStatementTransactions: number;
  statementFinancialInclusions: number;
  statementFinancialReversals: number;
  transactionCorrections: number;
  settlementDocuments: number;
  settlementRevenueLines: number;
  settlementDeductionLines: number;
  settlementReconciliations: number;
  settlementCashMatches: number;
  profitLossDocuments: number;
  profitLossLines: number;
  profitLossReconciliations: number;
  businessEarningsEvents: number;
  economicEventLinks: number;
  businessIncomeAnomalies: number;
  storageObjects: number;
  derivedRecords: number;
};

type EvidenceMetadata = {
  id: string;
  originalFileName: string;
  sha256: string;
  uploadedAt: string;
  documentType: string;
};

type DeletionPlan = {
  scope: Scope;
  documentId: string | null;
  financialDocumentIds: string[];
  bankStatementIds: string[];
  bankStatementTransactionIds: string[];
  inclusionIds: string[];
  settlementIds: string[];
  profitLossIds: string[];
  reconciliationRunIds: string[];
  earningsEventIds: string[];
  anomalyIds: string[];
  objectPaths: string[];
  evidenceMetadata: EvidenceMetadata[];
  counts: RemovalCounts;
  blockingIssues: string[];
};

const ids = <T extends { id: string }>(rows: T[]) => rows.map((row) => row.id);
const dateTime = (value: Date | string) => value instanceof Date ? value.toISOString() : value;

function totalDerived(counts: Omit<RemovalCounts, "derivedRecords">) {
  return Object.entries(counts)
    .filter(([key]) => !["financialDocuments", "storageObjects"].includes(key))
    .reduce((sum, [, value]) => sum + value, 0);
}

function emptyCounts(): RemovalCounts {
  return {
    financialDocuments: 0,
    documentTypeDetections: 0,
    typeCorrections: 0,
    parserGenerations: 0,
    identityReviews: 0,
    documentRelationshipUpdates: 0,
    bankStatementDocuments: 0,
    bankStatementTransactions: 0,
    statementFinancialInclusions: 0,
    statementFinancialReversals: 0,
    transactionCorrections: 0,
    settlementDocuments: 0,
    settlementRevenueLines: 0,
    settlementDeductionLines: 0,
    settlementReconciliations: 0,
    settlementCashMatches: 0,
    profitLossDocuments: 0,
    profitLossLines: 0,
    profitLossReconciliations: 0,
    businessEarningsEvents: 0,
    economicEventLinks: 0,
    businessIncomeAnomalies: 0,
    storageObjects: 0,
    derivedRecords: 0,
  };
}

async function buildDeletionPlan(executor: Executor, actor: Actor, documentId?: string, authorizedObjectPaths?: string[]): Promise<DeletionPlan> {
  const scope: Scope = documentId ? "SINGLE" : "ALL";
  const selectedCentralDocuments = documentId
    ? await executor.select().from(financialDocuments).where(and(
      eq(financialDocuments.householdId, actor.householdId),
      eq(financialDocuments.id, documentId),
    ))
    : await executor.select().from(financialDocuments).where(eq(financialDocuments.householdId, actor.householdId));
  const centralDocuments = authorizedObjectPaths
    ? selectedCentralDocuments.filter((row) => authorizedObjectPaths.includes(row.sourceObjectPath))
    : selectedCentralDocuments;

  if (documentId && centralDocuments.length === 0) {
    throw new GovernanceError("INVALID_STATE", "Financial document was not found in this household");
  }

  const centralIds = ids(centralDocuments);
  const objectPaths = new Set(centralDocuments.map((row) => row.sourceObjectPath));
  const hashes = centralDocuments.map((row) => row.documentHash);
  const linkedSettlementIds = centralDocuments
    .filter((row) => row.sourceRecordType === "settlement_document" && row.sourceRecordId)
    .map((row) => row.sourceRecordId!);
  const linkedProfitLossIds = centralDocuments
    .filter((row) => row.sourceRecordType === "profit_loss_document" && row.sourceRecordId)
    .map((row) => row.sourceRecordId!);
  const blockingIssues = centralDocuments
    .filter((row) => row.sourceRecordId && !["bank_statement_document", "settlement_document", "profit_loss_document"].includes(row.sourceRecordType ?? ""))
    .map((row) => `Document ${row.id} has an unsupported derived source type and cannot be deleted safely.`);

  const allObjectSettlements = await executor.select().from(settlementDocuments).where(and(
    eq(settlementDocuments.householdId, actor.householdId),
    eq(settlementDocuments.sourceKind, "object_storage"),
  ));
  const allObjectProfitLoss = await executor.select().from(profitLossDocuments).where(and(
    eq(profitLossDocuments.householdId, actor.householdId),
    eq(profitLossDocuments.sourceKind, "object_storage"),
  ));
  const targetedSettlements = scope === "ALL"
    ? authorizedObjectPaths ? allObjectSettlements.filter((row) => Boolean(row.sourceObjectPath && authorizedObjectPaths.includes(row.sourceObjectPath))) : allObjectSettlements
    : allObjectSettlements.filter((row) =>
      linkedSettlementIds.includes(row.id) ||
      Boolean(row.sourceObjectPath && objectPaths.has(row.sourceObjectPath)) ||
      Boolean(row.sourceSha256 && hashes.includes(row.sourceSha256)),
    );
  const targetedProfitLoss = scope === "ALL"
    ? authorizedObjectPaths ? allObjectProfitLoss.filter((row) => Boolean(row.sourceObjectPath && authorizedObjectPaths.includes(row.sourceObjectPath))) : allObjectProfitLoss
    : allObjectProfitLoss.filter((row) =>
      linkedProfitLossIds.includes(row.id) ||
      Boolean(row.sourceObjectPath && objectPaths.has(row.sourceObjectPath)) ||
      Boolean(row.sourceSha256 && hashes.includes(row.sourceSha256)),
    );
  for (const row of [...targetedSettlements, ...targetedProfitLoss]) {
    if (!row.sourceObjectPath || !row.sourceSha256 || !row.sourceFileName) {
      blockingIssues.push(`Uploaded business source ${row.id} is missing required deletion provenance.`);
    } else {
      objectPaths.add(row.sourceObjectPath);
    }
  }

  const settlementIds = ids(targetedSettlements);
  const profitLossIds = ids(targetedProfitLoss);
  const bankStatements = centralIds.length
    ? await executor.select().from(bankStatementDocuments).where(and(
      eq(bankStatementDocuments.householdId, actor.householdId),
      inArray(bankStatementDocuments.documentId, centralIds),
    ))
    : [];
  const bankStatementIds = ids(bankStatements);
  const statementTransactions = bankStatementIds.length
    ? await executor.select().from(bankStatementTransactions).where(and(
      eq(bankStatementTransactions.householdId, actor.householdId),
      inArray(bankStatementTransactions.bankStatementDocumentId, bankStatementIds),
    ))
    : [];
  const statementTransactionIds = ids(statementTransactions);
  const inclusions = statementTransactionIds.length
    ? await executor.select().from(statementFinancialInclusions).where(and(
      eq(statementFinancialInclusions.householdId, actor.householdId),
      inArray(statementFinancialInclusions.statementRowId, statementTransactionIds),
    ))
    : [];
  const inclusionIds = ids(inclusions);
  const relatedDocuments = centralIds.length
    ? await executor.select({ id: financialDocuments.id }).from(financialDocuments).where(and(
      eq(financialDocuments.householdId, actor.householdId),
      notInArray(financialDocuments.id, centralIds),
      or(
        inArray(financialDocuments.canonicalDocumentId, centralIds),
        inArray(financialDocuments.duplicateOfDocumentId, centralIds),
        inArray(financialDocuments.supersedesDocumentId, centralIds),
        inArray(financialDocuments.supersededByDocumentId, centralIds),
      ),
    ))
    : [];

  const [detections, corrections, generations, identityReviews, transactionCorrections, reversals] = await Promise.all([
    centralIds.length ? executor.select().from(financialDocumentTypeDetections).where(and(eq(financialDocumentTypeDetections.householdId, actor.householdId), inArray(financialDocumentTypeDetections.financialDocumentId, centralIds))) : [],
    centralIds.length ? executor.select().from(financialDocumentTypeCorrections).where(and(eq(financialDocumentTypeCorrections.householdId, actor.householdId), inArray(financialDocumentTypeCorrections.financialDocumentId, centralIds))) : [],
    centralIds.length ? executor.select().from(financialDocumentParseGenerations).where(and(eq(financialDocumentParseGenerations.householdId, actor.householdId), inArray(financialDocumentParseGenerations.financialDocumentId, centralIds))) : [],
    centralIds.length ? executor.select().from(financialDocumentIdentityReviews).where(and(eq(financialDocumentIdentityReviews.householdId, actor.householdId), or(inArray(financialDocumentIdentityReviews.documentId, centralIds), inArray(financialDocumentIdentityReviews.comparedDocumentId, centralIds)))) : [],
    statementTransactionIds.length ? executor.select().from(bankStatementTransactionCorrections).where(and(eq(bankStatementTransactionCorrections.householdId, actor.householdId), inArray(bankStatementTransactionCorrections.transactionId, statementTransactionIds))) : [],
    inclusionIds.length ? executor.select().from(statementFinancialReversals).where(and(eq(statementFinancialReversals.householdId, actor.householdId), inArray(statementFinancialReversals.inclusionId, inclusionIds))) : [],
  ]);

  const [settlementRevenue, settlementDeductions, settlementMath, settlementMatches, pnlLines, earningsEvents] = await Promise.all([
    settlementIds.length ? executor.select().from(settlementRevenueLines).where(and(eq(settlementRevenueLines.householdId, actor.householdId), inArray(settlementRevenueLines.settlementDocumentId, settlementIds))) : [],
    settlementIds.length ? executor.select().from(settlementDeductionLines).where(and(eq(settlementDeductionLines.householdId, actor.householdId), inArray(settlementDeductionLines.settlementDocumentId, settlementIds))) : [],
    settlementIds.length ? executor.select().from(settlementMathReconciliations).where(and(eq(settlementMathReconciliations.householdId, actor.householdId), inArray(settlementMathReconciliations.settlementDocumentId, settlementIds))) : [],
    settlementIds.length ? executor.select().from(settlementCashMatches).where(and(eq(settlementCashMatches.householdId, actor.householdId), inArray(settlementCashMatches.settlementDocumentId, settlementIds))) : [],
    profitLossIds.length ? executor.select().from(profitLossLines).where(and(eq(profitLossLines.householdId, actor.householdId), inArray(profitLossLines.profitLossDocumentId, profitLossIds))) : [],
    settlementIds.length || profitLossIds.length
      ? executor.select().from(businessEarningsEvents).where(and(
        eq(businessEarningsEvents.householdId, actor.householdId),
        or(
          settlementIds.length ? inArray(businessEarningsEvents.settlementDocumentId, settlementIds) : sql`false`,
          profitLossIds.length ? inArray(businessEarningsEvents.profitLossDocumentId, profitLossIds) : sql`false`,
        ),
      ))
      : [],
  ]);

  const allRuns = await executor.select().from(profitLossReconciliationRuns).where(eq(profitLossReconciliationRuns.householdId, actor.householdId));
  const allHouseholdSettlements = await executor.select().from(settlementDocuments).where(eq(settlementDocuments.householdId, actor.householdId));
  const allHouseholdProfitLoss = await executor.select().from(profitLossDocuments).where(eq(profitLossDocuments.householdId, actor.householdId));
  const targetSettlementSet = new Set(settlementIds);
  const targetProfitLossSet = new Set(profitLossIds);
  const reconciliationRuns = allRuns.filter((run) => {
    const runSettlements = allHouseholdSettlements.filter((row) =>
      row.businessId === run.businessId &&
      row.statementPeriodStart >= run.statementPeriodStart &&
      row.statementPeriodEnd <= run.statementPeriodEnd,
    );
    const runProfitLoss = allHouseholdProfitLoss.filter((row) =>
      row.businessId === run.businessId &&
      row.statementPeriodStart === run.statementPeriodStart &&
      row.statementPeriodEnd === run.statementPeriodEnd,
    );
    const touchesTarget = runSettlements.some((row) => targetSettlementSet.has(row.id)) ||
      runProfitLoss.some((row) => targetProfitLossSet.has(row.id));
    if (!touchesTarget) return false;
    const touchesPreservedSource = runSettlements.some((row) => !targetSettlementSet.has(row.id)) ||
      runProfitLoss.some((row) => !targetProfitLossSet.has(row.id));
    if (touchesPreservedSource) {
      blockingIssues.push(`Reconciliation run ${run.id} combines deleted and preserved evidence; resolve it before deletion.`);
      return false;
    }
    return true;
  });
  const reconciliationRunIds = ids(reconciliationRuns);
  const earningsEventIds = ids(earningsEvents);
  const eventLinks = earningsEventIds.length ? await executor.select().from(economicEventLinks).where(and(
    eq(economicEventLinks.householdId, actor.householdId),
    or(inArray(economicEventLinks.eventId, earningsEventIds), inArray(economicEventLinks.linkedEventId, earningsEventIds)),
  )) : [];
  const anomalies = (settlementIds.length || profitLossIds.length || reconciliationRunIds.length)
    ? await executor.select().from(businessIncomeAnomalies).where(and(
      eq(businessIncomeAnomalies.householdId, actor.householdId),
      or(
        settlementIds.length ? and(eq(businessIncomeAnomalies.relatedEntityType, "settlement_document"), inArray(businessIncomeAnomalies.relatedEntityId, settlementIds)) : sql`false`,
        profitLossIds.length ? and(eq(businessIncomeAnomalies.relatedEntityType, "profit_loss_document"), inArray(businessIncomeAnomalies.relatedEntityId, profitLossIds)) : sql`false`,
        reconciliationRunIds.length ? and(eq(businessIncomeAnomalies.relatedEntityType, "profit_loss_reconciliation_run"), inArray(businessIncomeAnomalies.relatedEntityId, reconciliationRunIds)) : sql`false`,
      ),
    ))
    : [];

  const evidenceMetadata: EvidenceMetadata[] = centralDocuments.map((row) => ({
    id: row.id,
    originalFileName: row.sourceFileName,
    sha256: row.documentHash,
    uploadedAt: dateTime(row.uploadedAt),
    documentType: row.documentType,
  }));
  const seenMetadata = new Set(evidenceMetadata.map((row) => `${row.id}:${row.sha256}`));
  for (const row of targetedSettlements) {
    const key = `${row.id}:${row.sourceSha256}`;
    if (!seenMetadata.has(key) && row.sourceFileName && row.sourceSha256) {
      evidenceMetadata.push({ id: row.id, originalFileName: row.sourceFileName, sha256: row.sourceSha256, uploadedAt: dateTime(row.createdAt), documentType: "STEVENS_SETTLEMENT" });
      seenMetadata.add(key);
    }
  }
  for (const row of targetedProfitLoss) {
    const key = `${row.id}:${row.sourceSha256}`;
    if (!seenMetadata.has(key) && row.sourceFileName && row.sourceSha256) {
      evidenceMetadata.push({ id: row.id, originalFileName: row.sourceFileName, sha256: row.sourceSha256, uploadedAt: dateTime(row.createdAt), documentType: "BUSINESS_PROFIT_AND_LOSS" });
      seenMetadata.add(key);
    }
  }

  const partialCounts = {
    financialDocuments: centralDocuments.length,
    documentTypeDetections: detections.length,
    typeCorrections: corrections.length,
    parserGenerations: generations.length,
    identityReviews: identityReviews.length,
    documentRelationshipUpdates: relatedDocuments.length,
    bankStatementDocuments: bankStatements.length,
    bankStatementTransactions: statementTransactions.length,
    statementFinancialInclusions: inclusions.length,
    statementFinancialReversals: reversals.length,
    transactionCorrections: transactionCorrections.length,
    settlementDocuments: targetedSettlements.length,
    settlementRevenueLines: settlementRevenue.length,
    settlementDeductionLines: settlementDeductions.length,
    settlementReconciliations: settlementMath.length,
    settlementCashMatches: settlementMatches.length,
    profitLossDocuments: targetedProfitLoss.length,
    profitLossLines: pnlLines.length,
    profitLossReconciliations: reconciliationRuns.length,
    businessEarningsEvents: earningsEvents.length,
    economicEventLinks: eventLinks.length,
    businessIncomeAnomalies: anomalies.length,
    storageObjects: objectPaths.size,
  };
  return {
    scope,
    documentId: documentId ?? null,
    financialDocumentIds: centralIds,
    bankStatementIds,
    bankStatementTransactionIds: statementTransactionIds,
    inclusionIds,
    settlementIds,
    profitLossIds,
    reconciliationRunIds,
    earningsEventIds,
    anomalyIds: ids(anomalies),
    objectPaths: Array.from(objectPaths),
    evidenceMetadata,
    counts: { ...partialCounts, derivedRecords: totalDerived(partialCounts) },
    blockingIssues,
  };
}

function preflightResponse(actor: Actor, plan: DeletionPlan) {
  const canApprove = hasPermission(actor.role, "approve");
  return {
    scope: plan.scope,
    documentId: plan.documentId,
    canApprove,
    approvalExplanation: canApprove
      ? "Your current household membership includes approve permission."
      : "Approve permission is required. This action is disabled for your current household membership.",
    confirmationPhrase: plan.scope === "ALL" ? RESET_CONFIRMATION : DELETE_CONFIRMATION,
    documents: plan.counts.financialDocuments + plan.counts.settlementDocuments + plan.counts.profitLossDocuments,
    derivedRecords: plan.counts.derivedRecords,
    counts: plan.counts,
    blockingIssues: plan.blockingIssues,
  };
}

export async function getFinancialEvidenceResetPreflight(actor: Actor) {
  assertPermission(actor.role, "read");
  return preflightResponse(actor, await buildDeletionPlan(db, actor));
}

export async function getFinancialDocumentDeletionPreflight(actor: Actor, documentId: string) {
  assertPermission(actor.role, "read");
  return preflightResponse(actor, await buildDeletionPlan(db, actor, documentId));
}

async function postResetVerification(executor: Executor, householdId: string) {
  const [documents, detections, corrections, generations, identityReviews, settlements, profitLoss, ledgerTransactions, businesses] = await Promise.all([
    executor.select({ id: financialDocuments.id }).from(financialDocuments).where(eq(financialDocuments.householdId, householdId)),
    executor.select({ id: financialDocumentTypeDetections.id }).from(financialDocumentTypeDetections).where(eq(financialDocumentTypeDetections.householdId, householdId)),
    executor.select({ id: financialDocumentTypeCorrections.id }).from(financialDocumentTypeCorrections).where(eq(financialDocumentTypeCorrections.householdId, householdId)),
    executor.select({ id: financialDocumentParseGenerations.id }).from(financialDocumentParseGenerations).where(eq(financialDocumentParseGenerations.householdId, householdId)),
    executor.select({ id: financialDocumentIdentityReviews.id }).from(financialDocumentIdentityReviews).where(eq(financialDocumentIdentityReviews.householdId, householdId)),
    executor.select({ id: settlementDocuments.id }).from(settlementDocuments).where(and(eq(settlementDocuments.householdId, householdId), eq(settlementDocuments.sourceKind, "object_storage"))),
    executor.select({ id: profitLossDocuments.id }).from(profitLossDocuments).where(and(eq(profitLossDocuments.householdId, householdId), eq(profitLossDocuments.sourceKind, "object_storage"))),
    executor.select({ id: financeTransactions.id }).from(financeTransactions).where(eq(financeTransactions.householdId, householdId)),
    executor.select({ id: businessEntities.id }).from(businessEntities).where(eq(businessEntities.householdId, householdId)),
  ]);
  return {
    financialDocumentsRemaining: documents.length,
    documentDetectionsRemaining: detections.length,
    typeCorrectionsRemaining: corrections.length,
    parserGenerationsRemaining: generations.length,
    identityReviewsRemaining: identityReviews.length,
    settlementSourceRecordsRemaining: settlements.length,
    profitLossSourceRecordsRemaining: profitLoss.length,
    householdLedgerTransactionsRemaining: ledgerTransactions.length,
    canonicalBusinessEntityStillPresent: businesses.length > 0,
  };
}

async function protectedStateSnapshot(executor: Executor, householdId: string) {
  const tables = [
    financialAccounts,
    financeTransactions,
    budgetPlanningPeriods,
    incomeSources,
    businessEntities,
    businessDistributions,
    businessReserves,
    ownerDrawProposals,
    verifiedHouseholdIncomeEvents,
  ] as const;
  const names = ["financialAccounts", "financeTransactions", "budgetPlanningPeriods", "incomeSources", "businessEntities", "businessDistributions", "businessReserves", "ownerDrawProposals", "verifiedHouseholdIncomeEvents"] as const;
  const rows = await Promise.all(tables.map((table) => executor.select({ id: table.id }).from(table).where(eq(table.householdId, householdId))));
  return Object.fromEntries(rows.map((items, index) => [names[index], items.map((item) => item.id).sort()])) as Record<string, string[]>;
}

function assertProtectedStatePreserved(before: Record<string, string[]>, after: Record<string, string[]>) {
  for (const [name, identifiers] of Object.entries(before)) {
    const current = new Set(after[name] ?? []);
    if (identifiers.some((identifier) => !current.has(identifier))) {
      throw new GovernanceError("CONFLICT", `Protected ${name} state changed during evidence deletion; the database transaction was rolled back`);
    }
  }
}

async function deleteEvidence(actor: Actor, input: DeletionInput, documentId?: string) {
  assertPermission(actor.role, "approve");
  const scope: Scope = documentId ? "SINGLE" : "ALL";
  const expectedConfirmation = scope === "ALL" ? RESET_CONFIRMATION : DELETE_CONFIRMATION;
  if (input.confirmationPhrase !== expectedConfirmation) {
    throw new GovernanceError("INVALID_STATE", `Type ${expectedConfirmation} exactly to confirm`);
  }
  if (input.reason.trim().length < 8) throw new GovernanceError("INVALID_STATE", "A specific deletion reason is required");
  const fingerprint = JSON.stringify({ scope, documentId: documentId ?? null, confirmationPhrase: input.confirmationPhrase, reason: input.reason.trim() });

  const [prior] = await db.select().from(financialEvidenceDeletionTombstones).where(and(
    eq(financialEvidenceDeletionTombstones.householdId, actor.householdId),
    eq(financialEvidenceDeletionTombstones.idempotencyKey, input.idempotencyKey),
  )).limit(1);
  if (prior) {
    if (prior.requestFingerprint !== fingerprint) throw new GovernanceError("IDEMPOTENCY_CONFLICT", "Idempotency key was already used for a different deletion request");
    return {
      status: "ALREADY_COMPLETED" as const,
      scope,
      tombstoneId: prior.id,
      removedCounts: { ...emptyCounts(), ...(prior.removedCounts as RemovalCounts) },
      verification: prior.postResetVerification,
      message: "This authorized deletion was already completed. No additional records were changed.",
    };
  }

  const initialPlan = await buildDeletionPlan(db, actor, documentId);
  if (initialPlan.blockingIssues.length) {
    throw new GovernanceError("CONFLICT", initialPlan.blockingIssues.join(" "));
  }
  const operation = scope === "ALL" ? BULK_OPERATION : SINGLE_OPERATION;
  const [existingOperation] = await db.select().from(idempotencyKeys).where(and(
    eq(idempotencyKeys.householdId, actor.householdId),
    eq(idempotencyKeys.key, input.idempotencyKey),
  )).limit(1);
  const existingBody = existingOperation?.responseBody as {
    fingerprint?: string;
    status?: string;
    objectPaths?: string[];
    deletedObjectPaths?: string[];
    protectedState?: Record<string, string[]>;
  } | null;
  if (existingOperation && (existingOperation.operation !== operation || existingBody?.fingerprint !== fingerprint)) {
    throw new GovernanceError("IDEMPOTENCY_CONFLICT", "Idempotency key was already used for a different request");
  }
  const protectedState = existingBody?.protectedState ?? await protectedStateSnapshot(db, actor.householdId);
  const operationPaths = existingBody?.objectPaths ?? [...initialPlan.objectPaths].sort();
  if (JSON.stringify(operationPaths) !== JSON.stringify([...initialPlan.objectPaths].sort())) {
    throw new GovernanceError("CONFLICT", "The evidence deletion set changed after the durable deletion intent was recorded");
  }
  let deletedObjectPaths = existingBody?.deletedObjectPaths ?? [];

  if (!existingOperation) {
    for (const objectPath of operationPaths) await assertStorageObjectExists(objectPath);
    isolatedStorageDeleteCount = 0;
    await db.transaction(async (tx) => {
      await tx.insert(idempotencyKeys).values({
        householdId: actor.householdId,
        key: input.idempotencyKey,
        operation,
        responseStatus: 202,
        responseBody: { fingerprint, status: "PENDING_STORAGE", objectPaths: operationPaths, deletedObjectPaths: [], protectedState },
      });
      await tx.insert(auditEvents).values({
        householdId: actor.householdId,
        eventType: "financial_evidence_deletion_started",
        actor: actor.userId,
        entity: "financial_evidence_deletion_operation",
        entityId: input.idempotencyKey,
        reason: input.reason.trim(),
        metadata: { scope, documentIds: initialPlan.evidenceMetadata.map((row) => row.id), documentHashes: initialPlan.evidenceMetadata.map((row) => row.sha256), removedCounts: initialPlan.counts, storageObjectCount: operationPaths.length },
      });
    });
  } else {
    for (const objectPath of operationPaths.filter((path) => !deletedObjectPaths.includes(path))) {
      if (usesIsolatedStorageStub()) continue;
      if (!await businessDocumentObjectExists(objectPath)) {
        deletedObjectPaths = [...deletedObjectPaths, objectPath];
        await db.transaction(async (tx) => {
          await tx.update(idempotencyKeys).set({ responseStatus: 202, responseBody: { fingerprint, status: "PENDING_DATABASE", objectPaths: operationPaths, deletedObjectPaths, protectedState } }).where(and(eq(idempotencyKeys.householdId, actor.householdId), eq(idempotencyKeys.key, input.idempotencyKey)));
          await tx.insert(auditEvents).values({
            householdId: actor.householdId,
            eventType: "financial_evidence_storage_absence_reconciled",
            actor: actor.userId,
            entity: "financial_evidence_deletion_operation",
            entityId: input.idempotencyKey,
            reason: "Confirmed an absent source object under an existing authorized deletion intent",
            metadata: { objectPathHash: createHash("sha256").update(objectPath).digest("hex"), completedObjectCount: deletedObjectPaths.length, storageObjectCount: operationPaths.length },
          });
        });
      }
    }
  }

  for (const objectPath of operationPaths.filter((path) => !deletedObjectPaths.includes(path))) {
    try {
      await deleteStorageObject(objectPath);
      deletedObjectPaths = [...deletedObjectPaths, objectPath];
      await db.transaction(async (tx) => {
        await tx.update(idempotencyKeys).set({
          responseStatus: 202,
          responseBody: { fingerprint, status: "PENDING_DATABASE", objectPaths: operationPaths, deletedObjectPaths, protectedState },
        }).where(and(eq(idempotencyKeys.householdId, actor.householdId), eq(idempotencyKeys.key, input.idempotencyKey)));
        await tx.insert(auditEvents).values({
          householdId: actor.householdId,
          eventType: "financial_evidence_storage_object_deleted",
          actor: actor.userId,
          entity: "financial_evidence_deletion_operation",
          entityId: input.idempotencyKey,
          reason: "Deleted one private source object under a durable evidence deletion intent",
          metadata: { objectPathHash: createHash("sha256").update(objectPath).digest("hex"), completedObjectCount: deletedObjectPaths.length, storageObjectCount: operationPaths.length },
        });
      });
    } catch (error) {
      await db.update(idempotencyKeys).set({
        responseStatus: 409,
        responseBody: { fingerprint, status: "STORAGE_RETRY_REQUIRED", objectPaths: operationPaths, deletedObjectPaths, protectedState },
      }).where(and(eq(idempotencyKeys.householdId, actor.householdId), eq(idempotencyKeys.key, input.idempotencyKey)));
      throw error;
    }
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`financial-evidence-delete:${actor.householdId}`}, 0))`);
    const [racedPrior] = await tx.select().from(financialEvidenceDeletionTombstones).where(and(
      eq(financialEvidenceDeletionTombstones.householdId, actor.householdId),
      eq(financialEvidenceDeletionTombstones.idempotencyKey, input.idempotencyKey),
    )).limit(1);
    if (racedPrior) {
      if (racedPrior.requestFingerprint !== fingerprint) throw new GovernanceError("IDEMPOTENCY_CONFLICT", "Idempotency key was already used for a different deletion request");
      return {
        status: "ALREADY_COMPLETED" as const,
        scope,
        tombstoneId: racedPrior.id,
        removedCounts: { ...emptyCounts(), ...(racedPrior.removedCounts as RemovalCounts) },
        verification: racedPrior.postResetVerification,
        message: "This authorized deletion was already completed. No additional records were changed.",
      };
    }
    const plan = await buildDeletionPlan(tx, actor, documentId, operationPaths);
    if (plan.blockingIssues.length) throw new GovernanceError("CONFLICT", plan.blockingIssues.join(" "));
    if (JSON.stringify([...plan.objectPaths].sort()) !== JSON.stringify(operationPaths)) {
      throw new GovernanceError("CONFLICT", "Financial evidence changed after preflight. Review the new counts and confirm again.");
    }

    if (plan.financialDocumentIds.length) {
      const remainingDocument = and(
        eq(financialDocuments.householdId, actor.householdId),
        notInArray(financialDocuments.id, plan.financialDocumentIds),
      );
      await tx.update(financialDocuments).set({ canonicalDocumentId: null, identityStatus: "REVIEW_REQUIRED" }).where(and(
        remainingDocument,
        inArray(financialDocuments.canonicalDocumentId, plan.financialDocumentIds),
      ));
      await tx.update(financialDocuments).set({ duplicateOfDocumentId: null, identityStatus: "REVIEW_REQUIRED" }).where(and(
        remainingDocument,
        inArray(financialDocuments.duplicateOfDocumentId, plan.financialDocumentIds),
      ));
      await tx.update(financialDocuments).set({ supersedesDocumentId: null, identityStatus: "REVIEW_REQUIRED" }).where(and(
        remainingDocument,
        inArray(financialDocuments.supersedesDocumentId, plan.financialDocumentIds),
      ));
      await tx.update(financialDocuments).set({ supersededByDocumentId: null, identityStatus: "REVIEW_REQUIRED" }).where(and(
        remainingDocument,
        inArray(financialDocuments.supersededByDocumentId, plan.financialDocumentIds),
      ));
    }
    if (plan.anomalyIds.length) await tx.delete(businessIncomeAnomalies).where(and(eq(businessIncomeAnomalies.householdId, actor.householdId), inArray(businessIncomeAnomalies.id, plan.anomalyIds)));
    if (plan.earningsEventIds.length) await tx.delete(businessEarningsEvents).where(and(eq(businessEarningsEvents.householdId, actor.householdId), inArray(businessEarningsEvents.id, plan.earningsEventIds)));
    if (plan.reconciliationRunIds.length) await tx.delete(profitLossReconciliationRuns).where(and(eq(profitLossReconciliationRuns.householdId, actor.householdId), inArray(profitLossReconciliationRuns.id, plan.reconciliationRunIds)));
    if (plan.settlementIds.length) await tx.delete(settlementDocuments).where(and(eq(settlementDocuments.householdId, actor.householdId), inArray(settlementDocuments.id, plan.settlementIds)));
    if (plan.profitLossIds.length) await tx.delete(profitLossDocuments).where(and(eq(profitLossDocuments.householdId, actor.householdId), inArray(profitLossDocuments.id, plan.profitLossIds)));
    if (plan.financialDocumentIds.length) await tx.delete(financialDocuments).where(and(eq(financialDocuments.householdId, actor.householdId), inArray(financialDocuments.id, plan.financialDocumentIds)));

    const verification = await postResetVerification(tx, actor.householdId);
    if (scope === "ALL" && (
      verification.financialDocumentsRemaining !== 0 ||
      verification.documentDetectionsRemaining !== 0 ||
      verification.typeCorrectionsRemaining !== 0 ||
      verification.parserGenerationsRemaining !== 0 ||
      verification.identityReviewsRemaining !== 0 ||
      verification.settlementSourceRecordsRemaining !== 0 ||
      verification.profitLossSourceRecordsRemaining !== 0
    )) {
      throw new GovernanceError("CONFLICT", "Post-reset verification found active uploaded evidence; the transaction was rolled back");
    }
    assertProtectedStatePreserved(protectedState, await protectedStateSnapshot(tx, actor.householdId));

    const [tombstone] = await tx.insert(financialEvidenceDeletionTombstones).values({
      householdId: actor.householdId,
      actor: actor.userId,
      scope,
      reason: input.reason.trim(),
      confirmationPhrase: input.confirmationPhrase,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: fingerprint,
      deletedDocuments: plan.evidenceMetadata,
      removedCounts: plan.counts,
      postResetVerification: verification,
      storageObjectCount: plan.objectPaths.length,
    }).returning();
    await tx.insert(auditEvents).values({
      householdId: actor.householdId,
      eventType: scope === "ALL" ? "financial_evidence_reset" : "financial_document_evidence_deleted",
      actor: actor.userId,
      entity: "financial_evidence_deletion_tombstone",
      entityId: tombstone.id,
      reason: input.reason.trim(),
      metadata: {
        scope,
        documentIds: plan.evidenceMetadata.map((row) => row.id),
        documentHashes: plan.evidenceMetadata.map((row) => row.sha256),
        removedCounts: plan.counts,
        confirmationPhrase: input.confirmationPhrase,
        idempotencyKey: input.idempotencyKey,
        storageObjectCount: plan.objectPaths.length,
      },
    });
    const result = {
      status: "DELETED" as const,
      scope,
      tombstoneId: tombstone.id,
      removedCounts: plan.counts,
      verification,
      message: scope === "ALL"
        ? "All uploaded financial evidence was removed. Ledger, budget, accounts, and business entity state were preserved."
        : "The selected financial evidence and its derived records were removed. Non-document financial state was preserved.",
    };
    await tx.update(idempotencyKeys).set({
      responseStatus: 200,
      responseBody: { fingerprint, status: "COMPLETED", response: result, objectPaths: operationPaths, deletedObjectPaths, protectedState },
    }).where(and(eq(idempotencyKeys.householdId, actor.householdId), eq(idempotencyKeys.key, input.idempotencyKey)));
    return result;
  });
}

export async function resetFinancialEvidence(actor: Actor, input: DeletionInput) {
  return deleteEvidence(actor, input);
}

export async function deleteFinancialDocumentEvidence(actor: Actor, documentId: string, input: DeletionInput) {
  return deleteEvidence(actor, input, documentId);
}