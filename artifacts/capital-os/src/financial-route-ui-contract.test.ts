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


test("Financial Inbox expands parser recovery targets and gates statement inclusion by approver permission", () => {
  assert.ok(documents.includes("focusFinancialDocument"));
  assert.ok(documents.includes("canReview={canReview}"));
  assert.ok(documents.includes("Household accounts are unavailable"));
  assert.ok(documents.includes("Business entities are unavailable"));
  assert.ok(evidenceRow.includes("canReview: boolean"));
  assert.ok(evidenceRow.includes("Read-only evidence. Approver permission is required"));
  assert.ok(evidenceRow.includes("Budget categories are unavailable"));
});

test("Financial Inbox refreshes planning guidance and every downstream financial surface", () => {
  assert.ok(documents.includes('includes("/weekly-guidance")'));
  assert.ok(evidenceRow.includes("includes('/weekly-guidance')"));
  for (const key of [
    "getGetCashFlowQueryKey",
    "getGetSafeToDeployQueryKey",
    "getGetAccountingOverviewQueryKey",
    "getGetCapitalGovernorV2QueryKey",
    "getGetTreasuryQueryKey",
  ]) {
    assert.ok(documents.includes(key), key);
    assert.ok(evidenceRow.includes(key), key);
  }
});

test("Budget mutations are permission-aware and expose comparison failures", () => {
  assert.ok(app.includes("Loading Budget permissions"));
  assert.ok(app.includes("Budget permissions are unavailable"));
  assert.ok(app.includes("Budget comparison unavailable"));
  assert.ok(app.includes("Contributor permission is required to create a plan"));
  assert.ok(app.includes("Approver permission required"));
  assert.ok(app.includes("Read-only transaction view"));
  assert.ok(app.includes("Read-only scenario view"));
});

test("Budget mutations refresh all financial consumers that can become stale", () => {
  for (const key of [
    "getGetBudgetQueryKey",
    "getGetCashFlowQueryKey",
    "getGetSafeToDeployQueryKey",
    "getGetVariableBudgetIntelligenceQueryKey",
    "getGetCapitalGovernorV2QueryKey",
    "getGetAccountingOverviewQueryKey",
    "getGetTreasuryQueryKey",
  ]) {
    assert.ok(app.includes(key), key);
  }
  assert.ok(app.includes("getGetWeeklyBudgetGuidanceQueryKey"));
  assert.ok(app.includes("includes('/weekly-guidance')"));
});

test("Treasury distinguishes permission-query failure from genuine read-only access", () => {
  assert.ok(treasury.includes("permissionsReady"));
  assert.ok(treasury.includes("Confirming Treasury action permissions"));
  assert.ok(treasury.includes("Retry permissions"));
  assert.ok(treasury.includes("Permissions pending"));
});

test("Portfolio distinguishes Schwab read failure from an empty external observation", () => {
  assert.ok(app.includes("Schwab summary unavailable"));
  assert.ok(app.includes("The internal Portfolio above remains valid"));
  assert.ok(app.includes("Retry Schwab read"));
});
