import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(resolve(here, "App.tsx"), "utf8");
const documents = readFileSync(resolve(here, "pages/documents.tsx"), "utf8");
const evidenceRow = readFileSync(resolve(here, "pages/TransactionEvidenceRow.tsx"), "utf8");
const accounting = readFileSync(resolve(here, "pages/accounting.tsx"), "utf8");
const treasury = readFileSync(resolve(here, "pages/treasury.tsx"), "utf8");

describe("financial route UI/backend contracts", () => {
  it("keeps all recently hardened route links mounted", () => {
    for (const path of ["/budget", "/cash-flow", "/accounting", "/treasury", "/portfolio", "/documents"]) {
      expect(app).toContain(`path="${path}"`);
    }
  });

  it("Cash Flow fails closed instead of substituting zeroes on service failure", () => {
    expect(app).toContain("Cash-flow data is temporarily unavailable");
    expect(app).toContain("No zero-value placeholders are substituted");
    expect(app).toContain("finalized Budget target or latest finalized carry-forward");
  });

  it("Budget evidence links drive the Financial Inbox upload type", () => {
    expect(app).toContain('/documents?type=BANK_STATEMENT');
    expect(documents).toContain('new URLSearchParams(queryText).get("type")');
    expect(documents).toContain("setUploadType(requestedType");
  });

  it("official statement inclusion refreshes every dependent financial route", () => {
    for (const key of [
      "getGetBudgetQueryKey",
      "getGetCashFlowQueryKey",
      "getGetSafeToDeployQueryKey",
      "getGetAccountingOverviewQueryKey",
      "getGetCapitalGovernorV2QueryKey",
      "getGetTreasuryQueryKey",
    ]) {
      expect(evidenceRow).toContain(key);
    }
  });

  it("Accounting renders comparison values as money and has a real review action", () => {
    expect(accounting).toContain('data-testid="button-print-accounting-review"');
    expect(accounting).toContain('Previous period {money(comparison.previousPeriod');
    expect(accounting).not.toContain('dateLabel(comparison.previousPeriod');
    expect(accounting).toContain('Quarter end {money(comparison.quarterEnd');
  });

  it("Treasury exposes role-aware submit and human decision workflows", () => {
    expect(treasury).toContain("useDecideCapitalRequest");
    expect(treasury).toContain('permissions.includes("contribute")');
    expect(treasury).toContain('permissions.includes("approve")');
    expect(treasury).toContain("PARTIALLY_APPROVED");
    expect(treasury).toContain("await onRefresh()");
    expect(treasury).toContain('value === "REDACTED"');
  });

  it("Portfolio renders the backend internal allocation scope and supports export", () => {
    expect(app).toContain("Internal capital allocation");
    expect(app).toContain("displayScopedMoney(data.totalCapital)");
    expect(app).toContain("internalComposition.map");
    expect(app).toContain("exportPortfolioSnapshot");
    expect(app).not.toContain("Demo balances hidden");
    expect(app).toContain("They are not silently added to Accounting net worth");
  });
});
