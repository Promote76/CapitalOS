import { expect, test, type Page } from "@playwright/test";
import { clerkClient } from "@clerk/express";
import { randomUUID } from "node:crypto";
import {
  cleanupResearchAdvisoryBrowserFixture,
  makeResearchOpportunityStale,
  seedResearchObservation,
  setupResearchAdvisoryBrowserFixture,
} from "../integration/research-advisory-browser-fixture.ts";

async function signIn(page: Page, userId: string) {
  const ticket = await clerkClient.signInTokens.createSignInToken({ userId, expiresInSeconds: 60 });
  await page.goto(`/sign-in?__clerk_ticket=${encodeURIComponent(ticket.token)}`);
  await expect(page).not.toHaveURL(/\/sign-in/);
}

function installResearchSupportFixtures(page: Page) {
  page.route("**/api/family-office/research-dossiers", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      evidence: [],
      dossiers: [],
      capabilityReadiness: {
        quote: "implemented",
        market_hours: "implemented",
        portfolio_position: "implemented",
        instrument_metadata: "CONFIRMED",
        fundamentals: "CONFIRMED",
        price_history: "CONFIRMED",
        movers: "PENDING_PROVIDER_CONFIRMATION",
        options: "PENDING_PROVIDER_CONFIRMATION",
        streaming: "PENDING_PROVIDER_CONFIRMATION",
        news: "PENDING_PROVIDER_CONFIRMATION",
        tax_data: "PENDING_PROVIDER_CONFIRMATION",
        schwab_reports: "PENDING_PROVIDER_CONFIRMATION",
        execution: "DISABLED_NOT_IN_SCOPE",
        order: "DISABLED_NOT_IN_SCOPE",
        transfer: "DISABLED_NOT_IN_SCOPE",
        withdrawal: "DISABLED_NOT_IN_SCOPE",
        micro_live: "DISABLED_NOT_IN_SCOPE",
        capital_allocation: "DISABLED_NOT_IN_SCOPE",
        reasons: {},
      },
      advisoryOnly: true,
    }),
  }));
  page.route("**/api/research/schwab/market-snapshots", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ snapshots: [] }),
  }));
  page.route("**/api/research/sec/filings", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ drafts: [], approved: [] }),
  }));
  page.route("**/api/research/schwab/certification", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ certification: null }),
  }));
}

test("authenticated Research decisions use persisted advisory and observation records", async ({ page, browser }) => {
  const email = process.env.BROWSER_TEST_EMAIL;
  if (!email) throw new Error("BROWSER_TEST_EMAIL is required");
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) throw new Error("BROWSER_TEST_EMAIL must be a valid email address");
  const runId = randomUUID().slice(0, 12);
  const disposableEmail = `${localPart}+research-e2e-${runId}@${domain}`;
  let userId: string | undefined;
  let fixture: Awaited<ReturnType<typeof setupResearchAdvisoryBrowserFixture>> | undefined;
  let secondContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  const forbiddenRequests: string[] = [];

  try {
    const user = await clerkClient.users.createUser({
      emailAddress: [disposableEmail],
      firstName: "Research",
      lastName: "authenticated fixture",
      skipPasswordRequirement: true,
    });
    userId = user.id;
    await signIn(page, user.id);

    const onboarding = page.getByRole("heading", { name: /set up your household/i });
    if (await onboarding.isVisible()) {
      await page.getByLabel("Household name").fill(`Research authenticated browser ${runId}`);
      const onboarded = page.waitForResponse((response) =>
        response.url().endsWith("/api/auth/onboard") && response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Create household" }).click();
      expect((await onboarded).ok()).toBe(true);
      await expect(onboarding).not.toBeVisible();
    }

    fixture = await setupResearchAdvisoryBrowserFixture(user.id, runId);
    installResearchSupportFixtures(page);
    page.on("request", (request) => {
      if (request.method() !== "GET" && /(order|trade|transfer|withdraw|allocation|money-movement)/i.test(new URL(request.url()).pathname)) {
        forbiddenRequests.push(request.url());
      }
    });
    page.on("response", async (response) => {
      if (response.url().includes("/api/research/opportunities") && !response.ok()) {
        globalThis.console.log(`research opportunities response ${response.status()}: ${await response.text()}`);
      }
    });

    await page.goto("/investment-research");
    await expect(page.getByTestId("card-opportunity-INCM")).toBeVisible();
    await expect(page.getByTestId("card-opportunity-CMPD")).toBeVisible();

    const recordDecision = async (ticker: string, button: string) => {
      await page.getByTestId(`card-opportunity-${ticker}`).click();
      const responsePromise = page.waitForResponse((response) =>
        response.url().endsWith("/api/research/advisory-decisions") && response.request().method() === "POST",
      );
      await page.getByTestId(button).click();
      expect((await responsePromise).status()).toBe(201);
    };

    await recordDecision("INCM", "button-watch-INCM");
    await recordDecision("CMPD", "button-review-CMPD");
    await recordDecision("INCM", "button-shadow-INCM");

    const persistedAfterActions = await page.evaluate(async () => {
      const response = await fetch("/api/research/advisory-decisions");
      if (!response.ok) throw new Error(`advisory list failed: ${response.status}`);
      return response.json();
    }) as { decisions: Array<{ ticker: string; decision: string; isCurrent: boolean }> };
    expect(persistedAfterActions.decisions.filter((decision) => decision.ticker === "INCM")).toHaveLength(2);
    expect(persistedAfterActions.decisions.filter((decision) => decision.ticker === "INCM" && decision.isCurrent)).toEqual([
      expect.objectContaining({ decision: "SHADOW" }),
    ]);

    await page.reload();
    await expect(page.getByTestId("research-decision-journal")).toContainText("SHADOW");
    await expect(page.getByTestId("research-decision-journal")).toContainText("HISTORY");

    secondContext = await browser.newContext();
    const secondPage = await secondContext.newPage();
    installResearchSupportFixtures(secondPage);
    secondPage.on("request", (request) => {
      if (request.method() !== "GET" && /(order|trade|transfer|withdraw|allocation|money-movement)/i.test(new URL(request.url()).pathname)) {
        forbiddenRequests.push(request.url());
      }
    });
    await signIn(secondPage, user.id);
    await secondPage.goto("/investment-research");
    await expect(secondPage.getByTestId("research-decision-journal")).toContainText("SHADOW");
    await expect(secondPage.getByTestId("research-decision-journal")).toContainText("HISTORY");

    await seedResearchObservation(fixture, "INCM");
    await secondPage.reload();
    await expect(secondPage.locator('[data-testid="research-decision-INCM"][data-decision-state="current"]')).toContainText("OBSERVED IN PORTFOLIO");
    const persistedWithObservation = await secondPage.evaluate(async () => (await fetch("/api/research/advisory-decisions")).json()) as {
      decisions: Array<{ ticker: string; observationStatus: string; isCurrent: boolean }>;
    };
    expect(persistedWithObservation.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ ticker: "INCM", observationStatus: "OBSERVED_IN_PORTFOLIO", isCurrent: true }),
    ]));

    await secondPage.getByTestId("button-review-brief-INCM").click();
    await expect(secondPage.getByTestId("panel-decision-card-INCM")).toBeVisible();
    const evidenceCard = secondPage.getByTestId("decision-card-evidence-INCM");
    await expect(evidenceCard).toContainText("Research browser Schwab observation");
    await expect(evidenceCard).toContainText("APPROVED");
    await expect(evidenceCard).toContainText("CURRENT");
    await expect(evidenceCard).toContainText("Open source provenance");

    await makeResearchOpportunityStale(fixture.sourceIds[1]!);
    await secondPage.reload();
    await expect(secondPage.getByTestId("research-decision-CMPD")).toContainText("NEEDS REVIEW");

    const evidenceConsole = secondPage.getByTestId("advanced-evidence-console");
    await evidenceConsole.locator("summary").click();
    await expect(evidenceConsole).toHaveAttribute("open", "");
    const refreshedOpportunities = secondPage.waitForResponse((response) => {
      if (!response.url().includes("/api/research/opportunities") || !response.ok()) return false;
      return new URL(response.url()).searchParams.get("search") === "INCM";
    });
    await secondPage.getByTestId("input-research-discovery").fill("INCM");
    await refreshedOpportunities;
    await expect(evidenceConsole).toHaveAttribute("open", "");
    expect(forbiddenRequests).toEqual([]);
  } finally {
    if (secondContext) await secondContext.close();
    if (fixture) await cleanupResearchAdvisoryBrowserFixture(fixture);
    if (userId) await clerkClient.users.deleteUser(userId);
  }
});