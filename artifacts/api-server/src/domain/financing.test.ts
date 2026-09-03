import test from "node:test";
import assert from "node:assert/strict";
import { calculateCashToClose, calculateMonthlyPayment, calculateDebtMetrics, calculateFinancingReadiness } from "./financing.ts";

test("amortization is deterministic and zero-rate safe", () => {
  assert.equal(calculateMonthlyPayment({ principalCents: 120000, annualRatePercent: 0, termMonths: 12 }), 10000);
  assert.equal(calculateMonthlyPayment({ principalCents: 30000000, annualRatePercent: 7, termMonths: 360 }), 199591);
});

test("DTI and revolving utilization remain distinct from property DSCR", () => {
  const metrics = calculateDebtMetrics({
    liabilities: [
      { currentBalanceCents: 50000, monthlyPaymentCents: 5000, liabilityType: "revolving", creditLimitCents: 100000, ownership: "household", status: "active" },
    ],
    monthlyIncomeCents: 20000,
    proposedMonthlyPaymentCents: 5000,
    propertyMonthlyNoiCents: 15000,
  });
  assert.equal(metrics.dtiPercent, 50);
  assert.equal(metrics.revolvingUtilizationPercent, 50);
  assert.equal(metrics.propertyDscr, 1.5);
});

test("cash to close excludes protected and business operating cash and surfaces gaps", () => {
  const result = calculateCashToClose({
    purchasePriceCents: 40000000,
    downPaymentPercent: 0.05,
    closingCostsCents: 800000,
    loanFeesCents: 150000,
    immediateRepairsCents: 300000,
    initialReservesCents: 600000,
    creditsCents: 50000,
    availableHouseholdCashCents: 20000000,
    protectedCashCents: 6000000,
    businessOperatingCashCents: 9000000,
  });
  assert.equal(result.eligibleCashCents, 5000000);
  assert.equal(result.fundingGapCents, 0);
  assert.match(result.explanation, /subject to reserve/);
});

test("readiness never turns missing data into approval", () => {
  const result = calculateFinancingReadiness({
    metrics: { monthlyDebtServiceCents: 0, monthlyIncomeCents: 0, dtiPercent: null, revolvingUtilizationPercent: null, propertyDscr: null },
    score: null,
    documentsComplete: 0,
    documentsTotal: 2,
    cashToCloseGapCents: 100,
    safeToBorrowCents: 0,
  });
  assert.equal(result.status, "not_ready");
  assert.ok(result.reasons.some((reason) => reason.includes("credit score")));
});