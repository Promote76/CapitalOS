import assert from "node:assert/strict";
import test from "node:test";
import {
  canTransitionStatementFinancialInclusion,
  statementCategoryDecisionStatuses,
  statementFinancialInclusionStatuses,
  statementRowFingerprint,
  suggestStatementCategory,
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

test("statement category suggestions use only supplied household candidates and preserve reviewer uncertainty", () => {
  const candidates = [
    { id: "income", name: "Household income", categoryType: "income" },
    { id: "housing", name: "Bridge Housing", categoryType: "fixed_expense" },
    { id: "food", name: "Food", categoryType: "variable_expense" },
    { id: "transfer", name: "Credit card payment", categoryType: "transfer" },
  ];
  assert.deepEqual(
    suggestStatementCategory("Bridge Housing monthly payment", "withdrawal", candidates),
    {
      categoryId: "housing",
      confidence: "HIGH",
      reason: 'Statement description contains the household category name "Bridge Housing".',
    },
  );
  assert.equal(suggestStatementCategory("Payroll", "deposit", candidates)?.categoryId, "income");
  assert.equal(suggestStatementCategory("Unknown merchant", "withdrawal", candidates)?.confidence, "LOW");
  assert.notEqual(suggestStatementCategory("Credit card payment", "withdrawal", candidates)?.categoryId, "transfer");
  assert.equal(suggestStatementCategory("Credit card payment", "withdrawal", [candidates[0], candidates[3]]), null);
  assert.equal(suggestStatementCategory("Payroll", "deposit", candidates.filter((item) => item.id !== "income")), null);
});