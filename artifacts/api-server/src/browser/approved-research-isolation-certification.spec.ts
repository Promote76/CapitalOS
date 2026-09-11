import { expect, test, type Page } from "@playwright/test";
import { clerkClient } from "@clerk/express";
import { randomUUID } from "node:crypto";
import {
  cleanupApprovedResearchIsolationBrowserFixture,
  setupApprovedResearchIsolationBrowserFixture,
} from "../integration/family-office-browser-fixture.ts";

type StateSnapshot = {
  portfolio: unknown;
  safeToDeploy: unknown;
  capitalGovernor: unknown;
  familyOffice: unknown;
  executionControl: unknown;
};

async function readState(page: Page): Promise<StateSnapshot> {
  return page.evaluate(async () => {
    const paths = {
      portfolio: "/api/portfolio",
      safeToDeploy: "/api/safe-to-deploy",
      capitalGovernor: "/api/capital-governor/v2",
      familyOffice: "/api/family-office",
      executionControl: "/api/execution-control",
    } as const;
    const entries = await Promise.all(Object.entries(paths).map(async ([key, path]) => {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`${path} returned ${response.status}`);
      const body = await response.json() as Record<string, unknown>;
      if (key === "capitalGovernor") {
        const { inputSnapshotId: _inputSnapshotId, waterfallRunId: _waterfallRunId, ...stableBody } = body;
        return [key, stableBody] as const;
      }
      return [key, body] as const;
    }));
    return Object.fromEntries(entries) as StateSnapshot;
  });
}

function assertNoBrowserOverflow(page: Page) {
  return page.evaluate(() => {
    const browser = globalThis as unknown as {
      document: { documentElement: { scrollWidth: number } };
      innerWidth: number;
    };
    return browser.document.documentElement.scrollWidth <= browser.innerWidth;
  });
}

test("authenticated approved research stays isolated across Portfolio, Risk, and Insights", async ({ page }) => {
  const email = process.env.BROWSER_TEST_EMAIL;
  if (!email) throw new Error("BROWSER_TEST_EMAIL is required");
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) throw new Error("BROWSER_TEST_EMAIL must be a valid email address");

  const runId = randomUUID().slice(0, 12);
  const disposableEmail = `${localPart}+research-isolation-${runId}@${domain}`;
  let disposableClerkUserId: string | undefined;
  let fixture: Awaited<ReturnType<typeof setupApprovedResearchIsolationBrowserFixture>> | undefined;
  try {
    const disposableUser = await clerkClient.users.createUser({
      emailAddress: [disposableEmail],
      firstName: "Approved research",
      lastName: "browser fixture",
      skipPasswordRequirement: true,
    });
    disposableClerkUserId = disposableUser.id;
    const ticket = await clerkClient.signInTokens.createSignInToken({
      userId: disposableUser.id,
      expiresInSeconds: 60,
    });
    await page.goto(`/sign-in?__clerk_ticket=${encodeURIComponent(ticket.token)}`);
    await expect(page).not.toHaveURL(/\/sign-in/);

    const onboarding = page.getByRole("heading", { name: /set up your household/i });
    await expect(onboarding.or(page.locator(".session-controls"))).toBeVisible();
    if (await onboarding.isVisible()) {
      await page.getByLabel("Household name").fill(`Approved research browser ${runId}`);
      const onboarded = page.waitForResponse((response) =>
        response.url().endsWith("/api/auth/onboard") && response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Create household" }).click();
      expect((await onboarded).ok()).toBe(true);
      await expect(onboarding).not.toBeVisible();
    }

    fixture = await setupApprovedResearchIsolationBrowserFixture(disposableUser.id, runId);
    const before = await readState(page);
    const forbiddenRequests: string[] = [];
    page.on("request", (request) => {
      if (request.method() !== "GET" && /(order|trade|transfer|withdraw|allocation|money-movement)/i.test(new URL(request.url()).pathname)) {
        forbiddenRequests.push(request.url());
      }
    });

    const assertResearchProjection = async (title: string) => {
      const card = page.getByTestId("card-approved-research-context");
      await expect(card).toBeVisible();
      await expect(card).toContainText(title);
      await expect(card).toContainText("Human-reviewed advisory context");
      await expect(card).toContainText("Advisory review");
      await expect(card).toContainText("approved source");
      await expect(card).not.toContainText("pending thesis");
      await expect(card).not.toContainText("stale thesis");
      await expect(card).not.toContainText("cross-household thesis");
      await expect(card).not.toContainText("Malformed research");
      await expect(card).not.toContainText("execution authorization");
    };

    const assertLoadingState = async (path: string, apiPath: string, loadingText: string) => {
      const loadingPage = await page.context().newPage();
      try {
        await loadingPage.route(`**${apiPath}`, async (route) => {
          await new Promise((resolve) => setTimeout(resolve, 800));
          await route.continue();
        });
        const navigation = loadingPage.goto(path);
        await expect(loadingPage.getByText(loadingText, { exact: true })).toBeVisible();
        await navigation;
      } finally {
        await loadingPage.close();
      }
    };

    const assertEmptyState = async (path: string, apiPath: string) => {
      await page.route(`**${apiPath}`, async (route) => {
        const upstream = await route.fetch();
        const body = await upstream.json() as Record<string, unknown>;
        await route.fulfill({
          response: upstream,
          json: {
            ...body,
            researchContext: {
              status: "empty",
              projections: [],
              excludedCount: 4,
              policy: "human-reviewed shadow-approved research with fresh evidence only",
              advisoryOnly: true,
              executionAuthorization: false,
              householdCapitalIncluded: false,
            },
          },
        });
      });
      await page.goto(path);
      await expect(page.getByText("No eligible approved research")).toBeVisible();
      await page.unroute(`**${apiPath}`);
    };

    await page.setViewportSize({ width: 1440, height: 1000 });
    await assertLoadingState("/portfolio", "/api/portfolio", "Loading portfolio…");
    await assertLoadingState("/risk", "/api/risk", "Loading risk and readiness…");
    await assertLoadingState("/insights", "/api/intelligence", "Preparing the latest household read…");
    await assertEmptyState("/portfolio", "/api/portfolio");
    await assertEmptyState("/risk", "/api/risk");
    await assertEmptyState("/insights", "/api/intelligence");
    for (const [path, heading] of [
      ["/portfolio", /Know what is/i],
      ["/risk", /Protect the plan/i],
      ["/insights", /A clearer read on/i],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      await expect(page.getByText(/Loading (portfolio|risk and readiness|finance insights)…/i)).toHaveCount(0);
      await assertResearchProjection(fixture.approvedTitle);
      expect(await assertNoBrowserOverflow(page)).toBe(true);
    }

    await page.goto("/portfolio");
    await expect(page.getByText("Capital composition")).toBeVisible();
    await expect(page.getByText("Accounts & sleeves")).toBeVisible();
    await expect(page.getByText("Total tracked capital")).toBeVisible();
    await page.goto("/risk");
    await expect(page.getByText("Server execution control")).toBeVisible();
    await expect(page.getByText("Risk Governor safeguards")).toBeVisible();
    await expect(page.getByTestId("status-execution-control")).toHaveText(/DISABLED|SAFE_MODE|STOP/);
    await page.goto("/insights");
    await expect(page.getByText("Specialist analyst desk")).toBeVisible();
    await expect(page.getByText("This never changes the live allocation.")).toBeVisible();

    const after = await readState(page);
    expect(after.portfolio).toEqual(before.portfolio);
    expect(after.safeToDeploy).toEqual(before.safeToDeploy);
    expect(after.capitalGovernor).toEqual(before.capitalGovernor);
    expect(after.executionControl).toEqual(before.executionControl);
    const beforeShadow = (before.familyOffice as { shadowPortfolioProjection: { nonExecuting: boolean; createsPortfoliosOrIntents: boolean; householdCapitalIncluded: boolean } }).shadowPortfolioProjection;
    const afterShadow = (after.familyOffice as { shadowPortfolioProjection: { nonExecuting: boolean; createsPortfoliosOrIntents: boolean; householdCapitalIncluded: boolean } }).shadowPortfolioProjection;
    expect(afterShadow).toEqual(beforeShadow);
    expect({
      nonExecuting: afterShadow.nonExecuting,
      createsPortfoliosOrIntents: afterShadow.createsPortfoliosOrIntents,
      householdCapitalIncluded: afterShadow.householdCapitalIncluded,
    }).toEqual({
      nonExecuting: true,
      createsPortfoliosOrIntents: false,
      householdCapitalIncluded: false,
    });
    expect(forbiddenRequests).toEqual([]);

    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ["/portfolio", "/risk", "/insights"]) {
      await page.goto(path);
      await expect(page.getByTestId("card-approved-research-context")).toBeVisible();
      await expect(page.getByTestId("card-approved-research-context")).toContainText(fixture.approvedTitle);
      expect(await assertNoBrowserOverflow(page)).toBe(true);
    }

    await page.route("**/api/portfolio", (route) => route.abort("failed"));
    await page.goto("/portfolio");
    await expect(page.getByRole("alert")).toContainText("Portfolio data is temporarily unavailable");
    await page.unroute("**/api/portfolio");
    await page.route("**/api/risk", (route) => route.abort("failed"));
    await page.goto("/risk");
    await expect(page.getByRole("alert")).toContainText("Risk and readiness data is temporarily unavailable");
    await page.unroute("**/api/risk");
    await page.route("**/api/intelligence", (route) => route.abort("failed"));
    await page.goto("/insights");
    await expect(page.getByTestId("state-intelligence-error")).toContainText("Intelligence is unavailable");
    await page.unroute("**/api/intelligence");

    console.log(JSON.stringify({
      gate: "BROWSER-APPROVED-RESEARCH-ISOLATION",
      authenticated: true,
      approvedOnlyProjection: "PASS",
      provenanceVisible: "PASS",
      householdIsolation: "PASS",
      desktopStates: "PASS",
      mobileStates: "PASS",
      errorStates: "PASS",
      balancesAllocationsUnchanged: "PASS",
      safeToDeployUnchanged: "PASS",
      capitalGovernorUnchanged: "PASS",
      shadowTransmissionUnchanged: "PASS",
      executionStateUnchanged: "PASS",
      forbiddenWrites: forbiddenRequests.length === 0,
      fixtureHouseholdId: fixture.householdId,
      fixtureApprovedProposalId: fixture.approvedProposalId,
    }));
  } finally {
    await cleanupApprovedResearchIsolationBrowserFixture(runId);
    if (disposableClerkUserId) await clerkClient.users.deleteUser(disposableClerkUserId);
  }
});