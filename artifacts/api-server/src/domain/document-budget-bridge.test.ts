import assert from "node:assert/strict";
import test from "node:test";
import {
  canTransitionStatementFinancialInclusion,
  statementCategoryDecisionStatuses,
  statementFinancialInclusionStatuses,
  statementRowFingerprint,
} from "./document-budget-bridge.ts";

test("statement bridge status vocabularies preserve the explicit human-decision states", () => {
  assert.deepEqual(statementCategoryDecisionStatuses, [
    "UNCLASSIFIED", "SUGGESTED", "USER_CONFIRMED", "USER_CORRECTED",
    "NOT_APPLICABLE_TRANSFER", "NOT_APPLICABLE_SETTLEMENT", "REJECTED",
  ]);
  assert.ok(statementFinancialInclusionStatuses.includes("IMPORTED_NEW"));
  assert.ok(statementFinancialInclusionStatuses.includes("REVERSED"));
});

test("statement financial inclusion transitions are monotonic after import or link", () => {
  assert.equal(canTransitionStatementFinancialInclusion("READY_TO_IMPORT", "IMPORTED_NEW"), true);
  assert.equal(canTransitionStatementFinancialInclusion("READY_TO_IMPORT", "LINKED_EXISTING"), true);
  assert.equal(canTransitionStatementFinancialInclusion("IMPORTED_NEW", "REVERSED"), true);
  assert.equal(canTransitionStatementFinancialInclusion("IMPORTED_NEW", "READY_TO_IMPORT"), false);
  assert.equal(canTransitionStatementFinancialInclusion("REVERSED", "IMPORTED_NEW"), false);
});

test("statement row fingerprints are normalized, household-scoped, and not amount-only", () => {
  const base = {
    householdId: "household-a",
    accountId: "account-1",
    postedDate: "2026-09-01",
    signedAmount: "-900.00",
    description: "  ACME   RENT ",
    merchant: "Acme Rent",
    reference: "ref-1",
  };
  const fingerprint = statementRowFingerprint(base);
  assert.equal(fingerprint, statementRowFingerprint({ ...base, description: "acme rent" }));
  assert.notEqual(fingerprint, statementRowFingerprint({ ...base, householdId: "household-b" }));
  assert.notEqual(fingerprint, statementRowFingerprint({ ...base, description: "Different merchant" }));
  assert.notEqual(fingerprint, statementRowFingerprint({ ...base, signedAmount: "-901.00" }));
});