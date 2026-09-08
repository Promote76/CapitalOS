import assert from "node:assert/strict";
import test from "node:test";
import { parseBusinessPdf } from "../services/business-document-parser.ts";
import {
  ambiguousSettlementPdfFixture,
  profitLossPdfFixture,
  settlementPdfFixture,
} from "../fixtures/business-income-pdfs.ts";
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

test("representative settlement PDF preserves totals, dates, line items, and page count", async () => {
  const result = await parseBusinessPdf(settlementPdfFixture(), "settlement");
  assert.equal(result.extractionStatus, "complete");
  assert.equal(result.pageCount, 2);
  assert.equal(result.statementPeriodStart, "2026-08-01");
  assert.equal(result.statementPeriodEnd, "2026-08-31");
  assert.equal(result.paidDate, "2026-09-03");
  assert.equal(result.gross, "1250.00");
  assert.equal(result.deductions, "250.00");
  assert.equal(result.net, "1000.00");
  assert.deepEqual(result.revenueLines, [
    { description: "Service revenue", amount: "900.00", sourcePage: 1 },
    { description: "Subscription revenue", amount: "350.00", sourcePage: 1 },
  ]);
  assert.deepEqual(result.deductionLines, [
    { description: "Processor fee", amount: "50.00", sourcePage: 2 },
    { description: "Withholding tax", amount: "200.00", sourcePage: 2 },
  ]);
});

test("representative P&L PDF preserves totals, dates, line items, and page count", async () => {
  const result = await parseBusinessPdf(profitLossPdfFixture(), "profit_loss");
  assert.equal(result.extractionStatus, "complete");
  assert.equal(result.pageCount, 2);
  assert.equal(result.statementPeriodStart, "2026-08-01");
  assert.equal(result.statementPeriodEnd, "2026-08-31");
  assert.equal(result.revenue, "2000.00");
  assert.equal(result.expenses, "700.00");
  assert.equal(result.profit, "1300.00");
  assert.deepEqual(result.lines, [
    { description: "Service revenue", amount: "1400.00", lineType: "revenue", sourcePage: 1 },
    { description: "Product revenue", amount: "600.00", lineType: "revenue", sourcePage: 1 },
    { description: "Contractor expense", amount: "500.00", lineType: "expense", sourcePage: 2 },
    { description: "Software expense", amount: "200.00", lineType: "expense", sourcePage: 2 },
  ]);
});

test("PDF parser fails closed for malformed, unsupported, and ambiguous source evidence", async () => {
  const malformed = await parseBusinessPdf(Buffer.from("%PDF-1.4\nnot a valid PDF"), "settlement");
  assert.equal(malformed.extractionStatus, "failed");
  assert.match(malformed.reason, /could not be read/i);

  const unsupported = await parseBusinessPdf(Buffer.from("not a PDF"), "profit_loss");
  assert.equal(unsupported.extractionStatus, "failed");
  assert.match(unsupported.reason, /only PDF files/i);

  const ambiguous = await parseBusinessPdf(ambiguousSettlementPdfFixture(), "settlement");
  assert.equal(ambiguous.extractionStatus, "ambiguous");
  assert.match(ambiguous.reason, /unambiguous/i);
});
