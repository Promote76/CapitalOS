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
  const result = classifyFinancialDocumentText("", "FUQC P&L.pdf", "STEVENS_SETTLEMENT");
  assert.notEqual(result.confidence, "HIGH");
  assert.equal(result.conflictsWithSelectedType, false);
});

test("settlement-specific content wins over a P&L-looking filename", () => {
  const result = classifyFinancialDocumentText(
    "Settlement. Driver ID 41. Load #99. Mileage Pay. Fuel Protection. Net Settlement.",
    "FUQC P&L.pdf",
    "BUSINESS_PROFIT_AND_LOSS",
  );
  assert.equal(result.detectedType, "STEVENS_SETTLEMENT");
  assert.equal(result.confidence, "HIGH");
  assert.equal(result.conflictsWithSelectedType, true);
});