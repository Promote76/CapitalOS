import test from "node:test";
import assert from "node:assert/strict";
import { classifyFinancialDocumentText } from "./financial-document-type-detector";

test("content signals detect a P&L even when the filename is misleading", () => {
  const result = classifyFinancialDocumentText(
    "Profit & Loss Statement. Total Income 1000.00. Total Expenses 400.00. Net Income 600.00. Period Ended 2026-06-30.",
    "000001.pdf",
    "STEVENS_SETTLEMENT",
  );
  assert.equal(result.detectedType, "BUSINESS_PROFIT_AND_LOSS");
  assert.equal(result.confidence, "HIGH");
  assert.equal(result.conflictsWithSelectedType, true);
});

test("a filename alone never creates a high-confidence type mismatch", () => {
  const result = classifyFinancialDocumentText("", "example-business-pnl.pdf", "STEVENS_SETTLEMENT");
  assert.notEqual(result.confidence, "HIGH");
  assert.equal(result.conflictsWithSelectedType, false);
});

test("settlement-specific content wins over a P&L-looking filename", () => {
  const result = classifyFinancialDocumentText(
    "Settlement. Driver ID 41. Load #99. Mileage Pay. Fuel Protection. Net Settlement.",
    "example-business-pnl.pdf",
    "BUSINESS_PROFIT_AND_LOSS",
  );
  assert.equal(result.detectedType, "STEVENS_SETTLEMENT");
  assert.equal(result.confidence, "HIGH");
  assert.equal(result.conflictsWithSelectedType, true);
});

test("Wells Fargo activity summaries classify as bank statements without a bank statement heading", () => {
  const result = classifyFinancialDocumentText(
    [
      "Wells Fargo Everyday Checking",
      "Statement period activity summary",
      "Beginning balance on 8/10 $0.00",
      "Deposits/Additions $8,705.94",
      "Withdrawals/Subtractions - $7,374.79",
      "Ending balance on 9/8 $1,331.15",
      "Transaction history",
      "Date Check Number Description",
      "Deposits/Additions Withdrawals/Subtractions Ending daily balance",
    ].join("\n"),
    "090826 WellsFargo.pdf",
    "OTHER_FINANCIAL_DOCUMENT",
  );
  assert.equal(result.detectedType, "BANK_STATEMENT");
  assert.equal(result.confidence, "HIGH");
  assert.equal(result.conflictsWithSelectedType, true);
});