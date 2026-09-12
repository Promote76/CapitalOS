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
function opportunity(ticker: string, category: "Income" | "Compounders" | "Balanced") {
  const evidence = {
    id: randomUUID(),
    title: `${ticker} approved market evidence`,
    sourceKind: "SCHWAB_MARKET_SNAPSHOT",
    reviewedAt: date,
    freshness: "CURRENT",
  };
  const factors = { incomeQuality: 82, growthQuality: 78, earningsQuality: 84, balanceSheet: 80, valuation: 76, liquidity: 74, risk: 72, evidenceFreshness: 96, portfolioFit: 88 };
  return {
    ticker,
    companyName: `${ticker} Research Company`,
    platinumScore: 84,
    category,
    thesis: `${ticker} has a bounded, source-linked research thesis.`,
    whyNow: "Approved evidence supports a fresh committee review.",
    redFlags: ["Manual review remains required."],
    evidenceFreshness: "CURRENT",
    portfolioFit: "Constructive",
    concentrationImpact: "Low at screened exposure",
    maximumExposure: "5% maximum",
    bullCase: "The thesis compounds as expected.",
    baseCase: "The thesis develops within the reviewed range.",
    bearCase: "The thesis is invalidated by the listed conditions.",
    invalidationConditions: ["Fresh evidence contradicts the thesis."],
    protectedCapitalStatus: "Protected-capital screen",
    humanReviewStatus: "Human review required",
    factorSubScores: factors,
    sourceCount: 1,
    advisoryOnly: true,
    noExecution: true,
    evidence: [evidence],
    factors,
  };
}

test("Research page preserves reviewed sources and stays read-only", async ({ page, context }) => {
  const email = process.env.BROWSER_TEST_EMAIL;
  if (!email) throw new Error("BROWSER_TEST_EMAIL is required");
  const [localPart, domain] = email.split("@");
  const runId = randomUUID().slice(0, 10);
  const fixtureHouseholdId = `55555555-5555-4555-8555-${runId.padEnd(12, "0").slice(0, 12)}`;
  let userId: string | undefined;
  const selected = [ids.schwab, ids.sec];
  const latestSources = [source(ids.schwab, "BKSC Schwab snapshot", "SCHWAB_MARKET_SNAPSHOT"), source(ids.sec, "BKSC SEC filing", "SEC_FILING")];
  const blocked = dossier(ids.older, "Older blocked BKSC", "2024-01-01T12:00:00.000Z", "blocked", [source(ids.schwab, "BKSC Schwab snapshot", "SCHWAB_MARKET_SNAPSHOT")], "bounded diagnostic: provider response was rejected");
  const initial = { evidence: [evidence(ids.schwab, "BKSC Schwab snapshot", "SCHWAB_MARKET_SNAPSHOT"), evidence(ids.sec, "BKSC SEC filing", "SEC_FILING")], dossiers: [blocked], capabilityReadiness: { quote: "implemented", market_hours: "implemented", portfolio_position: "implemented", instrument_metadata: "CONFIRMED", fundamentals: "CONFIRMED", price_history: "CONFIRMED", movers: "PENDING_PROVIDER_CONFIRMATION", options: "PENDING_PROVIDER_CONFIRMATION", streaming: "PENDING_PROVIDER_CONFIRMATION", news: "PENDING_PROVIDER_CONFIRMATION", tax_data: "PENDING_PROVIDER_CONFIRMATION", schwab_reports: "PENDING_PROVIDER_CONFIRMATION", execution: "DISABLED_NOT_IN_SCOPE", order: "DISABLED_NOT_IN_SCOPE", transfer: "DISABLED_NOT_IN_SCOPE", withdrawal: "DISABLED_NOT_IN_SCOPE", micro_live: "DISABLED_NOT_IN_SCOPE", capital_allocation: "DISABLED_NOT_IN_SCOPE", reasons: {} }, advisoryOnly: true };
  let created = false;
  let dossierState: "normal" | "error" | "empty" = "normal";
  let opportunityState: "current" | "stale" | "loading" | "error" | "empty" = "current";
  let releaseOpportunityLoading: (() => void) | undefined;
  let opportunityLoadingGate: Promise<void> | undefined;
  const requests: string[] = [];
  const forbiddenRequests: string[] = [];
  const decisionRequests: Array<{ ticker: string; decision: string; reason?: string }> = [];
  const savedDecisions: Array<Record<string, unknown>> = [];
  let readOnlyObservationFixtureReady = false;
  let discoveryRequests = 0;
  const discoveryOffsets: number[] = [];
  let discoveryAuthFailure = false;
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
    await page.route("**/api/research/opportunities**", async (route) => {
      const requestUrl = new URL(route.request().url());
      if (route.request().method() === "POST" && requestUrl.pathname.endsWith("/api/research/opportunities/discover")) {
        discoveryRequests += 1;
        const requestBody = route.request().postDataJSON() as {
          offset?: number;
          universe?: string;
          universeVersion?: string;
          customSymbols?: string[];
        };
        discoveryOffsets.push(requestBody.offset ?? -1);
        expect(requestBody.universe).toBeTruthy();
        expect(requestBody.offset).toEqual(expect.any(Number));
        expect(requestBody.offset).toBeGreaterThanOrEqual(0);
        if (discoveryAuthFailure) {
          await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ message: "Sign in is required to access Capital OS financial data." }) });
          return;
        }
        if (discoveryRequests === 1) {
          await new Promise((resolve) => setTimeout(resolve, 1_500));
        }
        const batchHasCandidate = (requestBody.offset ?? 0) === 0;
        const opportunities = batchHasCandidate ? [opportunity("FRESH", "Balanced")] : [];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            opportunities,
            totalEligible: 1,
            excludedStaleOrUnreviewed: 1,
            generatedAt: new Date().toISOString(),
            ranking: { method: "Browser discovery fixture", factors: ["quality"], missingData: "Missing values remain explicit.", lens: "Balanced", universe: requestBody.universe, universeVersion: "fixture-source-v1" },
            diagnostics: { reviewedMarketEvidence: 1, reviewedSecEvidence: 1, currentMarketEvidence: 1, currentSecEvidence: 1, duplicateEvidence: 0, excludedMissingSource: 0, excludedUnapproved: 1, excludedTickerMismatch: 0, excludedStale: 0 },
            lensCounts: { Income: 0, Compounders: 0, Balanced: 1 },
            advisoryOnly: true,
            executionAuthorization: false,
            householdCapitalIncluded: false,
            noTradingOrMoneyMovement: true,
            discovery: {
              status: "LIMITED",
              universe: requestBody.universe,
              universeLabel: requestBody.universe === "COMMON_STOCKS" ? "Common Stocks" : "Broad U.S. Market",
              cursorVersion: `fixture-source-v1:${requestBody.universe}:fixture`,
              domesticOnly: true,
              classificationUnknownExcluded: true,
              progress: { phase: "COMPLETED", completed: 2, total: 2, message: "Discovery completed." },
              knownUniverseCount: 50,
              source: {
                provider: "SEC EDGAR",
                title: "SEC company universe",
                url: "https://www.sec.gov/files/company_tickers.json",
                version: "2025-01-15",
                retrievedAt: date,
                sourceSha256: digest,
                classificationPolicyVersion: "sec-incorporation-jurisdiction-v1",
                issuerClassificationSource: "https://data.sec.gov/submissions/CIK##########.json",
              },
              rawSourceRowCount: 50,
              availableSymbolCount: 50,
              sourceExclusions: { total: 0, counts: {} },
              runOffset: requestBody.offset ?? 0,
              runCap: 25,
              selected: 2,
              screened: 2,
              symbolsSelected: 2,
              symbolsScreened: 2,
              symbolsEligible: batchHasCandidate ? 1 : 0,
              symbolsExcluded: 1,
              successfulSchwabEnrichments: 2,
              providerFailures: 0,
              schwabFailures: 0,
              secFailures: 0,
              providerOmissions: 0,
              pendingReview: 3,
              approvedEligible: batchHasCandidate ? 1 : 0,
              finalCandidates: batchHasCandidate ? 1 : 0,
              nextOffset: requestBody.offset === 0 ? 25 : null,
              limitations: [
                "SEC supplied the universe; Schwab did not.",
                "Schwab is limited to targeted read-only fundamentals, quotes, and 93-day daily history.",
              ],
              finalCandidateCount: batchHasCandidate ? 1 : 0,
              marketDraftsCreated: 2,
              secDraftsCreated: 1,
              secSnapshotsReused: 1,
              exclusionReasons: [
                { code: "PROVIDER_WIDE_SCREENER_UNAVAILABLE", count: 1, message: "The authorized Schwab API has no provider-wide screener." },
                { code: "PENDING_HUMAN_REVIEW", count: 1, message: "New evidence remains pending human review." },
              ],
              provider: {
                schwabConnectionStatus: "LIVE_CONNECTED",
                schwabTokenStatus: "CURRENT",
                schwabLastSuccessfulReadAt: date,
                schwabFreshness: "REFRESHED",
                secStatus: "REFRESHED",
                coverageStatus: "LIMITED",
                providerWideDiscovery: false,
                universeProvider: "SEC",
                schwabSuppliedUniverse: false,
                symbolLimit: 25,
                rateLimit: { limit: 120, remaining: 100, resetAt: null, retryAfterSeconds: null },
              },
            },
          }),
        });
        return;
      }
      if (opportunityState === "loading") {
        await opportunityLoadingGate;
      }
      if (opportunityState === "error") {
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "opportunity fixture unavailable" }) });
        return;
      }
      const lens = (requestUrl.searchParams.get("lens") ?? "Balanced").toLowerCase();
      const search = (requestUrl.searchParams.get("search") ?? "").toLowerCase();
      const allOpportunities = [opportunity("INCM", "Income"), opportunity("CMPD", "Compounders")];
      const opportunities = opportunityState === "empty" ? [] : allOpportunities.filter((item) => {
        const matchesLens = lens === "balanced" || item.category.toLowerCase() === lens;
        const matchesSearch = !search || `${item.ticker} ${item.companyName} ${item.category}`.toLowerCase().includes(search);
        return matchesLens && matchesSearch;
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          opportunities,
          totalEligible: opportunities.length,
          excludedStaleOrUnreviewed: opportunityState === "stale" ? 2 : 0,
          generatedAt: date,
          ranking: { method: "Browser fixture", factors: ["quality"], missingData: "Missing values remain explicit." },
           diagnostics: { reviewedMarketEvidence: 2, reviewedSecEvidence: 0, currentMarketEvidence: 2, currentSecEvidence: 0, duplicateEvidence: 0, excludedMissingSource: 0, excludedUnapproved: 0, excludedTickerMismatch: 0, excludedStale: opportunityState === "stale" ? 2 : 0 },
           lensCounts: { Income: 1, Compounders: 1, Balanced: 2 },
          advisoryOnly: true,
          executionAuthorization: false,
          householdCapitalIncluded: false,
          noTradingOrMoneyMovement: true,
        }),
      });
    });
    await page.route("**/api/research/advisory-decisions", async (route) => {
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON() as { ticker: string; decision: string; reason?: string };
        decisionRequests.push(body);
        const opportunitySnapshot = opportunity(body.ticker, body.ticker === "INCM" ? "Income" : "Compounders");
        const savedDecision = {
          id: `decision-${body.ticker}-${body.decision}-${savedDecisions.length + 1}`,
          householdId: fixtureHouseholdId,
          ticker: body.ticker,
          decision: body.decision,
          reason: body.reason ?? null,
          createdAt: date,
          updatedAt: date,
          observationAsOf: readOnlyObservationFixtureReady ? date : null,
          monitoringStatus: body.decision === "SKIP" ? "NOT_STARTED" : "MONITORING",
          manualHandoffPath: body.decision === "OPEN_SCHWAB" ? `/schwab-integration?symbol=${body.ticker}` : null,
          opportunitySnapshot,
          evidenceSnapshot: opportunitySnapshot.evidence,
          advisoryOnly: true,
          executionAuthorization: false,
          noTradingOrMoneyMovement: true,
        };
        savedDecisions.push(savedDecision);
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            ...savedDecision,
            observationStatus: readOnlyObservationFixtureReady ? "OBSERVED_IN_PORTFOLIO" : "UNKNOWN",
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          decisions: savedDecisions.map((decision) => ({
            ...decision,
            observationStatus: readOnlyObservationFixtureReady ? "OBSERVED_IN_PORTFOLIO" : "UNKNOWN",
          })),
          advisoryOnly: true,
          executionAuthorization: false,
          noTradingOrMoneyMovement: true,
        }),
      });
    });
    await page.route("**/api/integrations/schwab/sync", async (route) => {
      expect(route.request().method()).toBe("POST");
      readOnlyObservationFixtureReady = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "SYNCED",
          dataMode: "LIVE_CONNECTED",
          readOnly: true,
          tradingEnabled: false,
          positions: [{ symbol: "INCM", quantity: 1 }],
          noTradingOrMoneyMovement: true,
        }),
      });
    });
    page.on("request", (request) => {
      if (/(order|trade|transfer|withdraw|allocation|money-movement)/i.test(new URL(request.url()).pathname)) forbiddenRequests.push(request.url());
    });
    await page.addInitScript(() => {
      (globalThis as unknown as { open: () => null }).open = () => null;
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
    await expect(page.getByTestId("select-research-universe")).toHaveValue("BROAD_US_MARKET");
    await expect(page.getByTestId("status-research-current")).toBeVisible();
    await expect(page.getByTestId("card-opportunity-INCM")).toBeVisible();
    await expect(page.getByTestId("card-opportunity-CMPD")).toBeVisible();
    const discoveryResponse = page.waitForResponse((response) =>
      response.request().method() === "POST"
      && new URL(response.url()).pathname.endsWith("/api/research/opportunities/discover")
      && response.ok(),
    );
    await page.getByTestId("button-find-opportunities").click();
    await Promise.all([
      expect.poll(() => discoveryRequests).toBe(1),
      expect(page.getByTestId("button-find-opportunities")).toHaveText(/Screening/),
      expect(page.getByTestId("status-research-discovery-progress")).toContainText("Running read-only discovery"),
    ]);
    const completedDiscovery = await discoveryResponse;
    const completedBody = await completedDiscovery.json();
    expect(completedBody.discovery.status).toBe("LIMITED");
    expect(completedBody.discovery.runOffset).toBe(0);
    expect(completedBody.discovery.nextOffset).toBe(25);
    expect(completedBody.discovery.exclusionReasons[0].code).toBe("PROVIDER_WIDE_SCREENER_UNAVAILABLE");
    expect(discoveryOffsets).toEqual([0]);
    await Promise.all([
      expect(page.getByTestId("research-discovery-summary")).toContainText("Broad U.S. Market bounded-batch summary"),
      expect(page.getByTestId("card-opportunity-FRESH")).toBeVisible(),
    ]);
    await expect(page.getByTestId("research-discovery-summary")).toContainText("SEC supplied and classified the verified-domestic directory; Schwab did not");
    await expect(page.getByTestId("research-discovery-summary")).toContainText("93-day daily history");
    await expect(page.getByTestId("research-discovery-summary")).toContainText("Evidence remains pending until approval");
    await expect(page.getByTestId("research-discovery-boundary")).toContainText("no execution or account action");
    expect(discoveryRequests).toBe(1);
    expect(forbiddenRequests).toEqual([]);
    const nextDiscoveryResponse = page.waitForResponse((response) =>
      response.request().method() === "POST"
      && new URL(response.url()).pathname.endsWith("/api/research/opportunities/discover")
      && response.ok(),
    );
    await page.getByTestId("button-find-opportunities").click();
    const nextDiscoveryBody = await (await nextDiscoveryResponse).json();
    expect(nextDiscoveryBody.discovery.runOffset).toBe(25);
    expect(nextDiscoveryBody.discovery.nextOffset).toBeNull();
    expect(discoveryOffsets).toEqual([0, 25]);
    expect(discoveryRequests).toBe(2);
    await expect(page.getByTestId("research-discovery-boundary")).toContainText("Pending review only");
    await expect(page.getByTestId("research-discovery-boundary")).toContainText("no execution or account action");
    await page.reload();
    await expect(page.getByTestId("card-opportunity-INCM")).toBeVisible();
    discoveryAuthFailure = true;
    const discoveryAuthResponse = page.waitForResponse((response) =>
      response.request().method() === "POST"
      && new URL(response.url()).pathname.endsWith("/api/research/opportunities/discover"),
    );
    await page.getByTestId("button-find-opportunities").click();
    expect((await discoveryAuthResponse).status()).toBe(401);
    await expect(page.getByTestId("status-research-discovery-error")).toContainText("Sign in is required");
    discoveryAuthFailure = false;
    expect(discoveryOffsets).toEqual([0, 25, 0]);
    const waitForLens = (lens: "Income" | "Compounders") => page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.ok() && url.pathname.endsWith("/api/research/opportunities") && url.searchParams.get("lens") === lens;
    });
    const incomeResponse = waitForLens("Income");
    await page.getByRole("tab", { name: "Income" }).click();
    await incomeResponse;
    await expect(page.getByTestId("card-opportunity-INCM")).toBeVisible();
    const compoundersResponse = waitForLens("Compounders");
    await page.getByTestId("tab-research-compounders").click();
    await compoundersResponse;
    await expect(page.getByTestId("card-opportunity-CMPD")).toBeVisible();
    await page.getByRole("tab", { name: "Balanced" }).click();
    await expect(page.getByTestId("card-opportunity-INCM")).toBeVisible();
    await page.getByTestId("select-research-universe").selectOption("CUSTOM");
    await expect(page.getByTestId("input-research-custom-symbols")).toBeVisible();
    await page.getByTestId("input-research-custom-symbols").fill("CSCO, TD");
    const customDiscoveryResponse = page.waitForResponse((response) =>
      response.request().method() === "POST"
      && new URL(response.url()).pathname.endsWith("/api/research/opportunities/discover")
      && response.ok(),
    );
    await page.getByTestId("button-find-opportunities").click();
    const customBody = await (await customDiscoveryResponse).json();
    expect(customBody.discovery.runOffset).toBe(0);
    expect(customBody.discovery.universe).toBe("CUSTOM");
    await page.getByTestId("select-research-universe").selectOption("BROAD_US_MARKET");
    await expect(page.getByTestId("card-opportunity-CMPD")).toBeVisible();
    const discoveryInput = page.getByTestId("input-research-discovery");
    await discoveryInput.fill("CMPD");
    await expect(page.getByTestId("card-opportunity-CMPD")).toBeVisible();
    await expect(page.getByTestId("card-opportunity-INCM")).toHaveCount(0);
    await discoveryInput.fill("NO-MATCH");
    await expect(page.getByTestId("status-research-no-match")).toBeVisible();
    await expect(page.getByTestId("status-research-no-match")).toContainText("NO-MATCH");
    await page.getByTestId("button-clear-no-match").click();
    await expect(discoveryInput).toHaveValue("");
    await expect(page.getByTestId("card-opportunity-INCM")).toBeVisible();
    await expect(page.getByTestId("card-opportunity-CMPD")).toBeVisible();
    const firstOpportunity = page.getByTestId("checkbox-opportunity-INCM");
    const secondOpportunity = page.getByTestId("checkbox-opportunity-CMPD");
    await firstOpportunity.check();
    await expect(firstOpportunity).toBeChecked();
    await expect(page.getByTestId("button-compare-selected")).toHaveText(/Compare \(1\)/);
    await secondOpportunity.check();
    await expect(secondOpportunity).toBeChecked();
    await expect(firstOpportunity).toBeChecked();
    await expect(page.getByTestId("button-compare-selected")).toHaveText(/Compare \(2\)/);
    await page.waitForTimeout(500);
    await page.getByTestId("button-compare-selected").click({ force: true });
    await expect(page.getByTestId("research-comparison")).toBeVisible();
    await expect(page.getByTestId("comparison-INCM")).toBeVisible();
    await expect(page.getByTestId("comparison-CMPD")).toBeVisible();
    await page.getByTestId("comparison-INCM").click();
    await expect(page.getByTestId("panel-decision-card-INCM")).toBeVisible();
    for (const action of ["Skip", "Watch", "Review", "Shadow", "Open in Schwab"] as const) {
      const decisionPost = page.waitForResponse((response) =>
        response.request().method() === "POST"
        && new URL(response.url()).pathname.endsWith("/api/research/advisory-decisions")
        && response.ok(),
      );
      const testId = action === "Open in Schwab" ? "button-open-schwab-INCM" : `button-${action.toLowerCase()}-INCM`;
      await page.getByTestId(testId).click();
      await decisionPost;
      await expect(page.getByText(`${action} queued for review`, { exact: true })).toBeVisible();
    }
    expect(decisionRequests.map((request) => request.decision)).toEqual(["SKIP", "WATCH", "REVIEW", "SHADOW", "OPEN_SCHWAB"]);
    expect(decisionRequests.every((request) => request.ticker === "INCM")).toBe(true);
    expect(savedDecisions.every((decision) => decision.householdId === fixtureHouseholdId)).toBe(true);
    expect(savedDecisions.find((decision) => decision.decision === "OPEN_SCHWAB")?.manualHandoffPath).toBe("/schwab-integration?symbol=INCM");
    await expect(page.getByTestId("research-decision-journal")).toBeVisible();
    await expect(page.getByTestId("research-decision-INCM")).toHaveCount(5);
    await expect(page.getByTestId("research-decision-journal")).toContainText("UNKNOWN");
    await expect(page.locator('[data-component-name="ToastDescription"]').filter({ hasText: "No order or account action was sent." })).toBeVisible();
    expect(forbiddenRequests).toEqual([]);

    await page.reload();
    await expect(page.getByTestId("research-decision-INCM")).toHaveCount(5);
    await expect(page.getByTestId("research-decision-journal")).toContainText("UNKNOWN");
    const observationSync = page.waitForResponse((response) =>
      response.request().method() === "POST"
      && new URL(response.url()).pathname.endsWith("/api/integrations/schwab/sync")
      && response.ok(),
    );
    await page.evaluate(async () => {
      const response = await fetch("/api/integrations/schwab/sync", { method: "POST" });
      if (!response.ok) throw new Error("read-only Schwab observation fixture failed");
    });
    await observationSync;
    await page.reload();
    await expect(page.getByTestId("research-decision-INCM")).toHaveCount(5);
    await expect(page.getByTestId("research-decision-journal")).toContainText("OBSERVED IN PORTFOLIO");
    expect(forbiddenRequests).toEqual([]);

    opportunityState = "stale";
    await page.reload();
    await expect(page.getByTestId("status-research-stale")).toContainText("excluded as stale or unreviewed");
    await expect(page.getByTestId("card-opportunity-INCM")).toBeVisible();
    await expect(page.getByTestId("panel-decision-card-INCM")).toHaveCount(0);
    await expect(page.getByTestId("research-decision-INCM")).toHaveCount(5);
    expect(forbiddenRequests).toEqual([]);

    opportunityState = "loading";
    opportunityLoadingGate = new Promise<void>((resolve) => {
      releaseOpportunityLoading = resolve;
    });
    const loadingOpportunityNavigation = page.reload();
    await expect(page.getByTestId("status-research-loading")).toBeVisible();
    await expect(page.getByTestId("card-opportunity-INCM")).toHaveCount(0);
    releaseOpportunityLoading?.();
    await loadingOpportunityNavigation;

    opportunityState = "error";
    await page.reload();
    await expect(page.getByTestId("status-research-error")).toContainText("committee feed is unavailable");
    await expect(page.getByTestId("card-opportunity-INCM")).toHaveCount(0);
    await expect(page.locator('[data-testid^="button-skip-"]')).toHaveCount(0);
    opportunityState = "empty";
    await page.reload();
    await expect(page.getByTestId("status-research-empty")).toContainText("No opportunities meet this lens yet");
    await expect(page.getByTestId("card-opportunity-INCM")).toHaveCount(0);
    await expect(page.locator('[data-testid^="button-skip-"]')).toHaveCount(0);

    opportunityState = "current";
    await page.setViewportSize({ width: 1280, height: 2000 });
    await page.reload();
    await expect(page.getByTestId("card-opportunity-INCM")).toBeVisible();
    await page.waitForLoadState("networkidle");
    const evidenceConsole = page.getByTestId("advanced-evidence-console");
    const ensureEvidenceConsoleOpen = async () => {
      await evidenceConsole.evaluate((element) => {
        (element as unknown as { open: boolean }).open = true;
      });
      await expect(evidenceConsole).toHaveAttribute("open", "");
    };
    await ensureEvidenceConsoleOpen();
    await expect(evidenceConsole).toContainText("0 sources selected");
    const schwabCheckbox = page.getByTestId(`checkbox-research-evidence-${ids.schwab}`);
    const secCheckbox = page.getByTestId(`checkbox-research-evidence-${ids.sec}`);
    await schwabCheckbox.check({ force: true });
    await expect(schwabCheckbox).toBeChecked();
    await secCheckbox.check({ force: true });
    await expect(secCheckbox).toBeChecked();
    await ensureEvidenceConsoleOpen();
    await expect(evidenceConsole).toContainText("2 sources selected");
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
    const reloadedEvidenceConsole = page.getByTestId("advanced-evidence-console");
    await reloadedEvidenceConsole.evaluate((element) => {
      (element as unknown as { open: boolean }).open = true;
    });
    await expect(reloadedEvidenceConsole).toHaveAttribute("open", "");
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
    await page.getByTestId("advanced-evidence-console").evaluate((element) => {
      (element as unknown as { open: boolean }).open = true;
    });
    await expect(page.getByText("No evidence recorded")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.getByTestId("advanced-evidence-console").evaluate((element) => {
      (element as unknown as { open: boolean }).open = true;
    });
    await expect(page.getByPlaceholder("AAPL")).toBeVisible();
    await expect(page.getByRole("button", { name: /Compile dossier/i })).toBeVisible();
    await expect(page.getByTestId("card-opportunity-INCM")).toBeVisible();
    expect(await page.evaluate(() => {
      const browser = globalThis as unknown as { document: { documentElement: { scrollWidth: number } }; innerWidth: number };
      return browser.document.documentElement.scrollWidth <= browser.innerWidth;
    })).toBe(true);
  } finally {
    if (userId) await clerkClient.users.deleteUser(userId);
  }
});