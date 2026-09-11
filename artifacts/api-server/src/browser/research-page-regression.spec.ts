import { expect, test } from "@playwright/test";
import { clerkClient } from "@clerk/express";
import { randomUUID } from "node:crypto";

const ids = {
  schwab: "11111111-1111-4111-8111-111111111111",
  sec: "22222222-2222-4222-8222-222222222222",
  latest: "33333333-3333-4333-8333-333333333333",
  older: "44444444-4444-4444-8444-444444444444",
};
const date = "2025-01-15T12:00:00.000Z";
const digest = "a".repeat(64);

function prefill(kind: "SCHWAB_MARKET_SNAPSHOT" | "SEC_FILING", title: string, id: string) {
  return {
    kind, ticker: "BKSC", suggestedTitle: "BKSC Research Chair",
    instrument: { symbol: "BKSC", description: "Bank of South Carolina Corp", assetType: "EQUITY", exchange: "NASDAQ" },
    fundamentals: { asOf: "2025-01-14", marketCap: "1000000", sharesOutstanding: "1000", epsTrailingTwelveMonths: "1", peRatio: "10", dividendAmount: "0.1", dividendYield: "1", dividendPayDate: null, beta: "1", high52Week: "12", low52Week: "8" },
    quote: { asOf: date, bidPrice: "10", askPrice: "11", lastPrice: "10.5", markPrice: "10.5", closePrice: "10.5", openPrice: "10", highPrice: "11", lowPrice: "9", netChange: "0.5", netPercentChange: "5", totalVolume: "100" },
    priceHistory: { frequency: "DAILY", requestedStart: "2025-01-01", requestedEnd: "2025-01-15", candleCount: 1, firstMarketDate: "2025-01-14", lastMarketDate: "2025-01-14", periodOpen: "10", periodHigh: "11", periodLow: "9", periodClose: "10.5", recentCloses: [{ marketDate: "2025-01-14", close: "10.5", volume: "100" }] },
    freshness: { label: kind === "SEC_FILING" ? "AS_FILED" : "CURRENT", providerAsOf: date, marketDate: "2025-01-14", realtime: false, delayed: true },
    warnings: { missingFields: [], qualityFlags: [] },
    source: { provider: kind === "SEC_FILING" ? "SEC EDGAR" : "Schwab Market Data", title, provenanceClass: "PRIMARY_SOURCE", requestedAt: date, retrievedAt: date, reviewedAt: date, contentDigest: digest },
    sourceFacts: kind === "SEC_FILING" ? [{ evidenceId: id, field: "Revenue", value: "100", unit: "USD", filingType: "10-Q", filingDate: "2025-01-14", accession: "0000000000-25-000001", sourceUrl: "https://www.sec.gov/Archives/example", periodStart: "2024-10-01", periodEnd: "2024-12-31", tag: "Revenue" }] : [],
    advisoryOnly: true, readOnly: true, tradingEnabled: false, executionAuthority: "none", noTradingOrMoneyMovement: true,
  };
}

function evidence(id: string, title: string, kind: "SCHWAB_MARKET_SNAPSHOT" | "SEC_FILING") {
  return { id, householdId: "55555555-5555-4555-8555-555555555555", title, provenanceClass: "PRIMARY_SOURCE", reviewStatus: "APPROVED", mimeType: "application/json", objectPath: `research/${id}`, byteLength: 1, sha256: digest, extractionStatus: "complete", advisoryOnly: true, evidenceKind: kind, dossierPrefill: prefill(kind, title, id) };
}
function source(id: string, title: string, sourceKind: "SCHWAB_MARKET_SNAPSHOT" | "SEC_FILING") {
  return { id, title, sourceKind, provenanceClass: "PRIMARY_SOURCE" };
}
function dossier(id: string, title: string, createdAt: string, reportStatus: string, sources: ReturnType<typeof source>[], blockDiagnostic: string | null = null) {
  return { id, householdId: "55555555-5555-4555-8555-555555555555", ticker: "BKSC", title, evidenceIds: sources.map((s) => s.id), sources, reviewStatus: "APPROVED", createdAt, reportStatus, blockDiagnostic, proposal: null, advisoryOnly: true, executionAuthority: "none", noCapitalSideEffects: true };
}

test("Research page preserves reviewed sources and stays read-only", async ({ page, context }) => {
  const email = process.env.BROWSER_TEST_EMAIL;
  if (!email) throw new Error("BROWSER_TEST_EMAIL is required");
  const [localPart, domain] = email.split("@");
  const runId = randomUUID().slice(0, 10);
  let userId: string | undefined;
  const selected = [ids.schwab, ids.sec];
  const latestSources = [source(ids.schwab, "BKSC Schwab snapshot", "SCHWAB_MARKET_SNAPSHOT"), source(ids.sec, "BKSC SEC filing", "SEC_FILING")];
  const blocked = dossier(ids.older, "Older blocked BKSC", "2024-01-01T12:00:00.000Z", "blocked", [source(ids.schwab, "BKSC Schwab snapshot", "SCHWAB_MARKET_SNAPSHOT")], "bounded diagnostic: provider response was rejected");
  const initial = { evidence: [evidence(ids.schwab, "BKSC Schwab snapshot", "SCHWAB_MARKET_SNAPSHOT"), evidence(ids.sec, "BKSC SEC filing", "SEC_FILING")], dossiers: [blocked], capabilityReadiness: { quote: "implemented", market_hours: "implemented", portfolio_position: "implemented", instrument_metadata: "CONFIRMED", fundamentals: "CONFIRMED", price_history: "CONFIRMED", movers: "PENDING_PROVIDER_CONFIRMATION", options: "PENDING_PROVIDER_CONFIRMATION", streaming: "PENDING_PROVIDER_CONFIRMATION", news: "PENDING_PROVIDER_CONFIRMATION", tax_data: "PENDING_PROVIDER_CONFIRMATION", schwab_reports: "PENDING_PROVIDER_CONFIRMATION", execution: "DISABLED_NOT_IN_SCOPE", order: "DISABLED_NOT_IN_SCOPE", transfer: "DISABLED_NOT_IN_SCOPE", withdrawal: "DISABLED_NOT_IN_SCOPE", micro_live: "DISABLED_NOT_IN_SCOPE", capital_allocation: "DISABLED_NOT_IN_SCOPE", reasons: {} }, advisoryOnly: true };
  let created = false;
  let dossierState: "normal" | "error" | "empty" = "normal";
  const requests: string[] = [];
  const forbiddenRequests: string[] = [];
  try {
    const user = await clerkClient.users.createUser({ emailAddress: [`${localPart}+research-${runId}@${domain}`], firstName: "Research", lastName: "browser fixture", skipPasswordRequirement: true });
    userId = user.id;
    const ticket = await clerkClient.signInTokens.createSignInToken({ userId: user.id, expiresInSeconds: 60 });
    await page.route("**/api/family-office/research-dossiers", async (route) => {
      requests.push(route.request().url());
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON();
        expect(body.evidenceIds).toEqual(selected);
        created = true;
        await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ dossier: dossier(ids.latest, "BKSC Research Chair", date, "completed", latestSources), proposal: null, refresh: { ...initial, dossiers: [dossier(ids.latest, "BKSC Research Chair", date, "completed", latestSources), blocked] } }) });
      } else {
        if (dossierState === "error") {
          await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "fixture unavailable" }) });
        } else if (dossierState === "empty") {
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...initial, evidence: [], dossiers: [] }) });
        } else {
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...initial, dossiers: created ? [dossier(ids.latest, "BKSC Research Chair", date, "completed", latestSources), blocked] : [blocked] }) });
        }
      }
    });
    await page.route("**/api/research/schwab/market-snapshots", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ snapshots: [] }) }));
    await page.route("**/api/research/sec/filings", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ drafts: [], approved: [] }) }));
    await page.route("**/api/research/schwab/certification", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ certification: null }) }));
    page.on("request", (request) => {
      if (/(order|trade|transfer|withdraw|allocation|money-movement)/i.test(new URL(request.url()).pathname)) forbiddenRequests.push(request.url());
    });
    await page.goto(`/sign-in?__clerk_ticket=${encodeURIComponent(ticket.token)}`);
    await expect(page).not.toHaveURL(/\/sign-in/);
    const onboarding = page.getByRole("heading", { name: /set up your household/i });
    if (await onboarding.isVisible()) {
      await page.getByLabel("Household name").fill(`Research browser ${runId}`);
      await page.getByRole("button", { name: "Create household" }).click();
      await expect(onboarding).not.toBeVisible();
    }
    const loadingPage = await context.newPage();
    let releaseLoadingRequest: (() => void) | undefined;
    const loadingGate = new Promise<void>((resolve) => {
      releaseLoadingRequest = resolve;
    });
    await loadingPage.route("**/api/family-office/research-dossiers", async (route) => {
      await loadingGate;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(initial) });
    });
    const loadingNavigation = loadingPage.goto("/investment-research");
    await expect(loadingPage.locator(".loading-skeleton")).toBeVisible();
    releaseLoadingRequest?.();
    await loadingNavigation;
    await loadingPage.close();

    await page.goto("/");
    await page.evaluate(() => (globalThis as unknown as { sessionStorage: { removeItem(key: string): void } }).sessionStorage.removeItem("capital-os:research:selected-evidence"));
    await page.unroute("**/api/family-office/research-dossiers");
    await page.route("**/api/family-office/research-dossiers", async (route) => {
      requests.push(route.request().url());
      if (route.request().method() === "GET" && dossierState === "error") {
        return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "fixture unavailable" }) });
      }
      if (route.request().method() === "GET" && dossierState === "empty") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...initial, evidence: [], dossiers: [] }) });
      }
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON();
        expect(body.evidenceIds).toEqual(selected);
        created = true;
        return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ dossier: dossier(ids.latest, "BKSC Research Chair", date, "completed", latestSources), proposal: null, refresh: { ...initial, dossiers: [dossier(ids.latest, "BKSC Research Chair", date, "completed", latestSources), blocked] } }) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...initial, dossiers: created ? [dossier(ids.latest, "BKSC Research Chair", date, "completed", latestSources), blocked] : [blocked] }) });
    });
    await page.goto("/investment-research");
    await expect(page.getByText("0 sources selected")).toBeVisible();
    const schwabCheckbox = page.locator("label").filter({ hasText: "BKSC Schwab snapshot" }).getByRole("checkbox");
    const secCheckbox = page.locator("label").filter({ hasText: "BKSC SEC filing" }).getByRole("checkbox");
    await schwabCheckbox.check();
    await secCheckbox.check();
    await expect(page.getByText("2 sources selected")).toBeVisible();
    await expect(schwabCheckbox).toBeChecked();
    await expect(secCheckbox).toBeChecked();
    const selectedSummary = page.getByRole("status").filter({ hasText: "2 sources selected" });
    await expect(selectedSummary).toContainText("BKSC Schwab snapshot (SCHWAB MARKET SNAPSHOT · PRIMARY SOURCE)");
    await expect(selectedSummary).toContainText("BKSC SEC filing (SEC FILING · PRIMARY SOURCE)");
    await expect(page.locator("textarea")).toContainText("BKSC Schwab snapshot");
    await expect(page.locator("textarea")).toContainText("BKSC SEC filing");
    await page.getByRole("button", { name: /Compile dossier/i }).click();
    await expect(page.getByText("Dossier created", { exact: true })).toBeVisible();
    // The create response invalidates/refetches the dossier query; selection must survive that rerender.
    await expect(schwabCheckbox).toBeChecked();
    await expect(secCheckbox).toBeChecked();
    await expect(page.getByText("BKSC Research Chair")).toBeVisible();
    const latestPersistedSources = page.getByTestId(`sources-${ids.latest}`);
    await expect(latestPersistedSources).toContainText("Persisted sources");
    await expect(latestPersistedSources).toContainText("BKSC Schwab snapshot");
    await expect(latestPersistedSources).toContainText("BKSC SEC filing");
    await expect(page.getByRole("alert")).toContainText("Exact evidence set already completed");
    await expect(page.getByRole("button", { name: /Compile dossier/i })).toBeDisabled();
    await expect(page.getByText("Older BKSC attempts (1)")).toBeVisible();
    await page.getByText("Older BKSC attempts (1)").click();
    await expect(page.getByText(/bounded diagnostic/)).toBeVisible();
    await page.reload();
    await expect(page.getByText("2 sources selected")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Horizontal overflow");
    expect(await page.evaluate(() => {
      const browser = globalThis as unknown as { document: { documentElement: { scrollWidth: number } }; innerWidth: number };
      return browser.document.documentElement.scrollWidth <= browser.innerWidth;
    })).toBe(true);
    expect(requests.filter((url) => url.includes("research-dossiers")).length).toBeGreaterThan(0);
    expect(forbiddenRequests).toEqual([]);
    dossierState = "error";
    await page.reload();
    await expect(page.getByText("Data unavailable")).toBeVisible();
    dossierState = "empty";
    await page.reload();
    await expect(page.getByText("No evidence recorded")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByPlaceholder("AAPL")).toBeVisible();
    await expect(page.getByRole("button", { name: /Compile dossier/i })).toBeVisible();
    expect(await page.evaluate(() => {
      const browser = globalThis as unknown as { document: { documentElement: { scrollWidth: number } }; innerWidth: number };
      return browser.document.documentElement.scrollWidth <= browser.innerWidth;
    })).toBe(true);
  } finally {
    if (userId) await clerkClient.users.deleteUser(userId);
  }
});