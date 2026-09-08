import { centsToMoney, parseMoneyToCents } from "./finance";

export type DocumentEvidenceDocument = { id: string; status: string };
export type DocumentEvidenceStatement = { id: string; documentId: string; status: string; statementStart: string | null; statementEnd: string | null; createdAt: Date };
export type DocumentEvidenceRow = { bankStatementDocumentId: string; parentDocumentStatus?: string; parentStatementStatus?: string; amount: string | null; correctedValue: Record<string, unknown> | null; direction: string | null; reviewStatus: string; lastReviewAction: string | null };

const cents = (value: string | null) => parseMoneyToCents(value ?? "0");
const terminalTotalsActions = new Set(["APPROVE", "RECLASSIFY"]);

/** Pure, evidence-only projection. It deliberately has no financial authority. */
export function summarizeDocumentEvidence(
  documents: readonly DocumentEvidenceDocument[],
  statements: readonly DocumentEvidenceStatement[],
  rows: readonly DocumentEvidenceRow[],
) {
  const documentsById = new Map(documents.map((document) => [document.id, document]));
  const statementsById = new Map(statements.map((statement) => [statement.id, statement]));
  const isRejectedParent = (row: DocumentEvidenceRow) => {
    const statement = statementsById.get(row.bankStatementDocumentId);
    const document = statement ? documentsById.get(statement.documentId) : undefined;
    // Missing parents fail closed rather than allowing an orphaned child to
    // become an advisory total during a concurrent delete/review.
    const statementStatus = row.parentStatementStatus ?? statement?.status;
    const documentStatus = row.parentDocumentStatus ?? document?.status;
    return !statementStatus || !documentStatus || statementStatus.toUpperCase().includes("REJECTED") || documentStatus.toUpperCase() === "REJECTED";
  };
  const evidenceAmount = (row: DocumentEvidenceRow) => {
    const corrected = row.correctedValue?.amount;
    return typeof corrected === "string" ? corrected : row.amount;
  };
  const reviewedRows = rows.filter((row) =>
    !isRejectedParent(row) && row.reviewStatus.toUpperCase() === "RESOLVED" && terminalTotalsActions.has(row.lastReviewAction ?? ""),
  );
  const latestStatement = [...statements].sort((left, right) =>
    String(right.statementEnd ?? right.statementStart ?? right.createdAt).localeCompare(String(left.statementEnd ?? left.statementStart ?? left.createdAt)),
  )[0];
  const pendingRowCount = rows.filter((row) => !["RESOLVED", "REJECTED"].includes(row.reviewStatus.toUpperCase())).length;
  return {
    documentCount: documents.length,
    statementCount: statements.length,
    reviewedDocumentCount: documents.filter((document) => document.status.toUpperCase() === "VERIFIED").length,
    pendingDocumentCount: documents.filter((document) => !["VERIFIED", "REJECTED"].includes(document.status.toUpperCase())).length,
    reviewedRowCount: reviewedRows.length,
    pendingRowCount,
    reviewedDeposits: centsToMoney(reviewedRows.filter((row) => row.direction?.toLowerCase() === "deposit").reduce((sum, row) => sum + cents(evidenceAmount(row)), 0)),
    reviewedWithdrawals: centsToMoney(reviewedRows.filter((row) => row.direction?.toLowerCase() === "withdrawal").reduce((sum, row) => sum + Math.abs(cents(evidenceAmount(row))), 0)),
    excludedTransferCount: rows.filter((row) => row.lastReviewAction === "MARK_TRANSFER").length,
    linkedSettlementDepositCount: rows.filter((row) => row.lastReviewAction === "LINK_SETTLEMENT" && row.direction?.toLowerCase() === "deposit").length,
    latestStatementPeriod: latestStatement ? { start: latestStatement.statementStart, end: latestStatement.statementEnd } : null,
    latestStatementDate: latestStatement?.statementEnd ?? latestStatement?.statementStart ?? null,
    readinessStatus: pendingRowCount > 0 ? "PENDING_REVIEW" : statements.length ? "REVIEWED_EVIDENCE_AVAILABLE" : "NO_UPLOADED_EVIDENCE",
    sourceDocumentIds: documents.map((document) => document.id),
    affectsOfficialTotals: false as const,
    explanation: "Uploaded document evidence is advisory only. It does not create verified income, account balances, ledger transactions, cash flow, or money movement.",
  };
}