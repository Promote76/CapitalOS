import assert from "node:assert/strict";
import test from "node:test";
import { summarizeDocumentEvidence } from "./document-evidence";

test("document evidence advisory totals are exact and exclude unreviewed economic claims", () => {
  const result = summarizeDocumentEvidence(
    [{ id: "verified", status: "VERIFIED" }, { id: "pending", status: "NEEDS_REVIEW" }, { id: "rejected", status: "REJECTED" }],
    [{ id: "statement", documentId: "verified", status: "document_evidence_verified", statementStart: "2026-01-01", statementEnd: "2026-01-31", createdAt: new Date("2026-02-01T00:00:00Z") }],
    [
      { bankStatementDocumentId: "statement", amount: "100.01", correctedValue: null, direction: "deposit", reviewStatus: "RESOLVED", lastReviewAction: "APPROVE" },
      { bankStatementDocumentId: "statement", amount: "-20.02", correctedValue: { amount: "-21.03" }, direction: "withdrawal", reviewStatus: "RESOLVED", lastReviewAction: "RECLASSIFY" },
      { bankStatementDocumentId: "statement", amount: "300.03", correctedValue: null, direction: "deposit", reviewStatus: "document_evidence_pending_review", lastReviewAction: null },
      { bankStatementDocumentId: "statement", amount: "400.04", correctedValue: null, direction: "deposit", reviewStatus: "REJECTED", lastReviewAction: "REJECT" },
      { bankStatementDocumentId: "statement", amount: "500.05", correctedValue: null, direction: "deposit", reviewStatus: "RESOLVED", lastReviewAction: "MARK_TRANSFER" },
      { bankStatementDocumentId: "statement", amount: "600.06", correctedValue: null, direction: "deposit", reviewStatus: "RESOLVED", lastReviewAction: "LINK_SETTLEMENT" },
    ],
  );
  assert.equal(result.reviewedDeposits, "100.01");
  assert.equal(result.reviewedWithdrawals, "21.03");
  assert.equal(result.reviewedRowCount, 2);
  assert.equal(result.pendingRowCount, 1);
  assert.equal(result.excludedTransferCount, 1);
  assert.equal(result.linkedSettlementDepositCount, 1);
  assert.equal(result.reviewedDocumentCount, 1);
  assert.equal(result.pendingDocumentCount, 1);
  assert.deepEqual(result.sourceDocumentIds, ["verified", "pending", "rejected"]);
  assert.equal(result.readinessStatus, "PENDING_REVIEW");
  assert.equal(result.affectsOfficialTotals, false);
});

test("rejected statement parent excludes previously approved child evidence", () => {
  const result = summarizeDocumentEvidence(
    [{ id: "document", status: "REJECTED" }],
    [{ id: "statement", documentId: "document", status: "document_evidence_rejected", statementStart: null, statementEnd: null, createdAt: new Date() }],
    [{ bankStatementDocumentId: "statement", amount: "99.99", correctedValue: null, direction: "deposit", reviewStatus: "RESOLVED", lastReviewAction: "APPROVE" }],
  );
  assert.equal(result.reviewedRowCount, 0);
  assert.equal(result.reviewedDeposits, "0.00");
});