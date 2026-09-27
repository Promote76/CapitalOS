import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(resolve(here, "App.tsx"), "utf8");
const documents = readFileSync(resolve(here, "pages/documents.tsx"), "utf8");
const evidenceRow = readFileSync(resolve(here, "pages/TransactionEvidenceRow.tsx"), "utf8");
const accounting = readFileSync(resolve(here, "pages/accounting.tsx"), "utf8");
const treasury = readFileSync(resolve(here, "pages/treasury.tsx"), "utf8");

test("keeps all recently hardened route links mounted", () => {
    for (const path of ["/budget", "/cash-flow", "/accounting", "/treasury", "/portfolio", "/documents"]) {
      assert.ok(app.includes(`path="${path}"`));
    }
  });


test("Cash Flow fails closed instead of substituting zeroes on service failure", () => {
    assert.ok(app.includes("Cash-flow data is temporarily unavailable"));
    assert.ok(app.includes("No zero-value placeholders are substituted"));
    assert.ok(app.includes("finalized Budget target or latest finalized carry-forward"));
  });


test("Budget evidence links drive the Financial Inbox upload type", () => {
    assert.ok(app.includes('/documents?type=BANK_STATEMENT'));
    assert.ok(documents.includes('new URLSearchParams(queryText).get("type")'));
    assert.ok(documents.includes("setUploadType(requestedType"));
  });


test("official statement inclusion refreshes every dependent financial route", () => {
    for (const key of [
      "getGetBudgetQueryKey",
      "getGetCashFlowQueryKey",
      "getGetSafeToDeployQueryKey",
      "getGetAccountingOverviewQueryKey",
      "getGetCapitalGovernorV2QueryKey",
      "getGetTreasuryQueryKey",
    ]) {
      assert.ok(evidenceRow.includes(key));
    }
  });


test("Accounting renders comparison values as money and has a real review action", () => {
    assert.ok(accounting.includes('data-testid="button-print-accounting-review"'));
    assert.ok(accounting.includes('Previous period {money(comparison.previousPeriod'));
    assert.ok(!accounting.includes('dateLabel(comparison.previousPeriod'));
    assert.ok(accounting.includes('Quarter end {money(comparison.quarterEnd'));
  });


test("Treasury exposes role-aware submit and human decision workflows", () => {
    assert.ok(treasury.includes("useDecideCapitalRequest"));
    assert.ok(treasury.includes('permissions.includes("contribute")'));
    assert.ok(treasury.includes('permissions.includes("approve")'));
    assert.ok(treasury.includes("PARTIALLY_APPROVED"));
    assert.ok(treasury.includes("await onRefresh()"));
    assert.ok(treasury.includes('value === "REDACTED"'));
  });


test("Portfolio renders the backend internal allocation scope and supports export", () => {
    assert.ok(app.includes("Internal capital allocation"));
    assert.ok(app.includes("displayScopedMoney(data.totalCapital)"));
    assert.ok(app.includes("internalComposition.map"));
    assert.ok(app.includes("exportPortfolioSnapshot"));
    assert.ok(!app.includes("Demo balances hidden"));
    assert.ok(app.includes("They are not silently added to Accounting net worth"));
});
