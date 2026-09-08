import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateBusinessCashPosition,
  evaluateOwnerDraw,
  matchSettlementCash,
  reconcileBusinessPeriod,
  reconcileSettlementMath,
  verifiedIncomeFromApprovedDraw,
} from "./business-income.ts";

test("settlement math reconciles only when every reported total agrees", () => {
  const result = reconcileSettlementMath({
    revenueLines: [{ amount: "1250.00" }],
    deductionLines: [{ amount: "250.00" }],
    reportedGross: "1250.00",
    reportedDeductions: "250.00",
    reportedNet: "1000.00",
  });
  assert.equal(result.status, "reconciled");
  assert.equal(result.calculatedNetCents, 100000);
});

test("settlement math fails closed when reported evidence is incomplete", () => {
  const result = reconcileSettlementMath({
    revenueLines: [{ amount: "1250.00" }],
    deductionLines: [],
    reportedNet: "1250.00",
  });
  assert.equal(result.status, "needs_review");
  assert.match(result.reason, /all required/);
});

test("cash matching rejects ambiguous same-amount evidence", () => {
  const result = matchSettlementCash({
    settlementNet: "1000.00",
    paidDate: "2026-09-07",
    candidates: [
      { id: "a", transactionDate: "2026-09-07", amount: "1000.00", description: "Client deposit" },
      { id: "b", transactionDate: "2026-09-08", amount: "1000.00", description: "Client deposit duplicate" },
    ],
  });
  assert.equal(result.status, "needs_review");
  assert.equal(result.transactionId, null);
});

test("cash position subtracts reserve, escrow, and reimbursements before owner draw capacity", () => {
  const result = calculateBusinessCashPosition({
    bankCash: "10000.00",
    pendingDeposits: "500.00",
    outstandingAdvances: "300.00",
    escrowHeld: "1000.00",
    reimbursementsDue: "500.00",
    reserveFloor: "6000.00",
  });
  assert.equal(result.safeToDistributeCents, 250000);
});

test("owner draw eligibility blocks unresolved evidence", () => {
  const result = evaluateOwnerDraw({
    requestedAmount: "1000.00",
    safeToDistribute: "5000.00",
    unresolvedAnomalies: 1,
    cashMatchStatus: "matched",
    settlementMathStatus: "reconciled",
  });
  assert.equal(result.status, "needs_review");
  assert.equal(result.eligibleAmountCents, 0);
});

test("verified household income requires an approved, unblocked draw", () => {
  assert.throws(() => verifiedIncomeFromApprovedDraw({
    proposalStatus: "approved",
    approvedAmount: "500.00",
    requestedAmount: "1000.00",
    blockedReasons: ["Cash match needs review"],
  }), /approved, unblocked/);
  assert.equal(verifiedIncomeFromApprovedDraw({
    proposalStatus: "approved",
    approvedAmount: "500.00",
    requestedAmount: "1000.00",
    blockedReasons: [],
  }), 50000);
});

test("period reconciliation remains incomplete without a covering source period", () => {
  const result = reconcileBusinessPeriod({
    settlementGross: "1000.00",
    settlementDeductions: "0.00",
    operatingExpenses: "200.00",
    reportedProfit: "800.00",
    settlementPeriods: [{ start: "2026-09-01", end: "2026-09-15" }],
    requestedPeriod: { start: "2026-09-01", end: "2026-09-30" },
  });
  assert.equal(result.periodCoverage, "incomplete");
  assert.equal(result.status, "needs_review");
});