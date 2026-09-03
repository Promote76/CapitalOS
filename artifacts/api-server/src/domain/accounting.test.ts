import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateNetWorth,
  calculateNetWorthAttribution,
  ledgerDebitsEqualCredits,
  reconcileCrossViewTotals,
  summarizeCashFlow,
} from "./accounting.ts";

test("assets minus liabilities equals net worth", () => {
  assert.equal(calculateNetWorth(11_600 * 100, 780 * 100), 10_820 * 100);
});

test("cross-view reconciliation keeps non-accounting scopes separate", () => {
  const result = reconcileCrossViewTotals({
    accountingAssetsCents: 125_000,
    accountingLiabilitiesCents: 25_000,
    accountingNetWorthCents: 100_000,
    planningCapitalCents: 90_000,
    treasuryCapitalCents: 12_000,
    businessEquityCents: 50_000,
    propertyEquityCents: 300_000,
  });
  assert.equal(result.status, "RECONCILED");
  assert.deepEqual(result.separateScopes.map((scope) => scope.scope), ["planning", "treasury", "business", "property"]);
  assert.equal(result.separateScopes.reduce((sum, scope) => sum + scope.amountCents, 0), 452_000);
  assert.equal(result.accounting.netWorthCents, 100_000);
});

test("cross-view reconciliation requires review when accounting arithmetic is wrong", () => {
  const result = reconcileCrossViewTotals({
    accountingAssetsCents: 10_000,
    accountingLiabilitiesCents: 3_000,
    accountingNetWorthCents: 6_000,
  });
  assert.equal(result.status, "REVIEW_REQUIRED");
  assert.equal(result.accounting.reconciles, false);
});

test("contributions are capital movement, not profit", () => {
  const summary = summarizeCashFlow([
    { amountCents: 1_000 * 100, kind: "contribution" },
  ]);
  assert.equal(summary.contributionsCents, 1_000 * 100);
  assert.equal(summary.incomeCents, 0);
  assert.equal(summary.expensesCents, 0);
});

test("transfers do not create income", () => {
  const summary = summarizeCashFlow([
    { amountCents: 2_000 * 100, kind: "income" },
    { amountCents: -500 * 100, kind: "transfer" },
  ]);
  assert.equal(summary.incomeCents, 2_000 * 100);
  assert.equal(summary.netCashFlowCents, 1_500 * 100);
});

test("ledger debits equal credits", () => {
  assert.equal(ledgerDebitsEqualCredits([
    { debitCents: 100 * 100, creditCents: 100 * 100 },
    { debitCents: 250 * 100, creditCents: 250 * 100 },
  ]), true);
  assert.equal(ledgerDebitsEqualCredits([
    { debitCents: 100 * 100, creditCents: 99 * 100 },
  ]), false);
  assert.equal(ledgerDebitsEqualCredits([]), false);
  assert.equal(ledgerDebitsEqualCredits([
    { debitCents: 0, creditCents: 0 },
  ]), false);
});

test("net-worth attribution reconciles", () => {
  const attribution = calculateNetWorthAttribution({
    netWorthChangeCents: 3_499 * 100,
    capitalContributedCents: 1_000 * 100,
    investmentGrowthCents: 0,
    debtReductionCents: 350 * 100,
  });
  assert.equal(attribution.otherCents, 2_149 * 100);
  assert.equal(attribution.reconciles, true);
});