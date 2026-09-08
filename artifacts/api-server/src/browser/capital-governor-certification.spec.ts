import { expect, test } from "@playwright/test";
import { clerkClient } from "@clerk/express";
import { randomUUID } from "node:crypto";
import {
  cleanupCapitalGovernorBrowserFixture,
  setupCapitalGovernorBrowserFixture,
} from "../integration/capital-governor-browser-fixture.ts";

type GovernorState = {
  version: "2.0";
  asOf: string;
  status: "READY" | "CONSERVATIVE" | "INCOMPLETE_DATA";
  safeToDeploy: string;
  rawSafeToDeploy: string;
  householdCapitalSurplus: {
    floor: string;
    base: string;
    strong: string;
    source: string;
  };
  dataReadiness: {
    status: "READY" | "INCOMPLETE_DATA";
    freshnessDays: number | null;
    failClosed: boolean;
  };
  reasons: string[];
  reasonCodes: string[];
  components: Array<{
    key: string;
    label: string;
    amount: string;
    sign: "add" | "subtract";
  }>;
  waterfall: {
    availableForWaterfall: string;
    unallocatedAfterRecommendations: string;
    allocations: Array<{
      bucket: string;
      amount: string;
      recommendedOnly: true;
      physicalMovementAuthorized: false;
    }>;
  };
};

const governorState = (state: Partial<GovernorState>): GovernorState => ({
  version: "2.0",
  asOf: "2026-09-08",
  status: "INCOMPLETE_DATA",
  safeToDeploy: "0.00",
  rawSafeToDeploy: "0.00",
  householdCapitalSurplus: {
    floor: "0.00",
    base: "0.00",
    strong: "0.00",
    source: "verified_income_minus_operating_costs_and_reserve_contributions",
  },
  dataReadiness: {
    status: "INCOMPLETE_DATA",
    freshnessDays: null,
    failClosed: true,
  },
  reasons: ["Required planning, source, or reconciliation evidence is not ready."],
  reasonCodes: ["DATA_INCOMPLETE_DATA"],
  components: [{
    key: "eligible_household_cash",
    label: "Eligible household cash",
    amount: "0.00",
    sign: "add",
  }],
  waterfall: {
    availableForWaterfall: "0.00",
    unallocatedAfterRecommendations: "0.00",
    allocations: [],
  },
  ...state,
});

const readyState = governorState({
  status: "READY",
  safeToDeploy: "1234.00",
  rawSafeToDeploy: "1234.00",
  householdCapitalSurplus: { floor: "800.00", base: "2000.00", strong: "3500.00", source: "verified_income_minus_operating_costs_and_reserve_contributions" },
  dataReadiness: { status: "READY", freshnessDays: 1, failClosed: false },
  reasons: [],
  reasonCodes: [],
  components: [
    { key: "eligible_household_cash", label: "Eligible household cash", amount: "5000.00", sign: "add" },
    { key: "operating_buffer", label: "Household operating buffer", amount: "3766.00", sign: "subtract" },
  ],
  waterfall: {
    availableForWaterfall: "1234.00",
    unallocatedAfterRecommendations: "0.00",
    allocations: [{ bucket: "INVESTMENT_CAPITAL", amount: "750.00", recommendedOnly: true, physicalMovementAuthorized: false }],
  },
});

const conservativeState = governorState({
  status: "CONSERVATIVE",
  safeToDeploy: "500.00",
  rawSafeToDeploy: "500.00",
  householdCapitalSurplus: { floor: "300.00", base: "2000.00", strong: "3500.00", source: "verified_income_minus_operating_costs_and_reserve_contributions" },
  dataReadiness: { status: "READY", freshnessDays: 4, failClosed: false },
  reasons: ["Financial evidence is stale; the result is conservative until refreshed."],
  reasonCodes: ["STALE_EVIDENCE"],
  components: [
    { key: "eligible_household_cash", label: "Eligible household cash", amount: "5,000.00", sign: "add" },
    { key: "reserve_gaps", label: "Reserve funding gaps", amount: "4,500.00", sign: "subtract" },
  ],
  waterfall: {
    availableForWaterfall: "500.00",
    unallocatedAfterRecommendations: "500.00",
    allocations: [],
  },
});

test("authenticated Treasury certifies Safe-to-Deploy 2.0 readiness states and retry boundary", async ({ page }) => {
  const email = process.env.BROWSER_TEST_EMAIL;
  if (!email) throw new Error("BROWSER_TEST_EMAIL is required");
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) throw new Error("BROWSER_TEST_EMAIL must be a valid email address");

  const runId = randomUUID().slice(0, 12);
  const disposableEmail = `${localPart}+capital-governor-${runId}@${domain}`;
  let disposableClerkUserId: string | undefined;
  let governorResponse: GovernorState | undefined;
  let governorError = false;

  await page.route("**/api/capital-governor/v2", async (route) => {
    if (governorError) {
      await route.abort("failed");
      return;
    }
    if (governorResponse) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(governorResponse),
      });
      return;
    }
    await route.continue();
  });

  try {
    const disposableUser = await clerkClient.users.createUser({
      emailAddress: [disposableEmail],
      firstName: "Capital Governor",
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
      await page.getByLabel("Household name").fill(`Capital Governor browser ${runId}`);
      const onboarded = page.waitForResponse((response) =>
        response.url().endsWith("/api/auth/onboard") && response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Create household" }).click();
      expect((await onboarded).ok()).toBe(true);
      await expect(onboarding).not.toBeVisible();
    }

    const fixture = await setupCapitalGovernorBrowserFixture(disposableUser.id, disposableEmail);
    expect(fixture.householdId).toBeTruthy();

    governorResponse = readyState;
    await page.goto("/budget");
    await expect(page.getByRole("heading", { name: /Give every dollar/i })).toBeVisible();
    const budgetPanel = page.getByTestId("budget-capital-governor");
    await expect(budgetPanel).toBeVisible();
    await expect(budgetPanel).toContainText("Capital Governor 2.0");
    await expect(budgetPanel).toContainText("Safe to deploy");
    await expect(budgetPanel).toContainText("Capital surplus · base");
    await expect(budgetPanel).toContainText("Waterfall available");
    await expect(budgetPanel).toContainText("Advisory only");
    await expect(budgetPanel).toContainText("do not move money");

    governorResponse = undefined;
    await page.goto("/treasury");
    await expect(page.getByRole("heading", { name: /Every dollar with a job/i })).toBeVisible();
    const panel = page.getByTestId("capital-governor-v2-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("INCOMPLETE_DATA");
    await expect(panel).toContainText("V2 safe to deploy");
    await expect(panel).toContainText("Household capital surplus");
    await expect(panel).toContainText("no movement authorized");
    await expect(page.getByText("Advisory only", { exact: true })).toBeVisible();

    governorResponse = readyState;
    await page.reload();
    await expect(panel.getByText("READY", { exact: true })).toBeVisible();
    await expect(panel).toContainText("$1,234");
    await expect(panel).toContainText("$2,000");
    await expect(panel).toContainText("Household capital surplus");
    await expect(panel).toContainText("no movement authorized");

    governorResponse = conservativeState;
    await page.reload();
    await expect(panel.getByText("CONSERVATIVE", { exact: true })).toBeVisible();
    await expect(panel).toContainText("$500");
    await expect(panel).toContainText("Financial evidence is stale; the result is conservative until refreshed.");
    await expect(panel).toContainText("$2,000");

    governorResponse = governorState({
      status: "INCOMPLETE_DATA",
      safeToDeploy: "0.00",
      householdCapitalSurplus: { floor: "-400.00", base: "100.00", strong: "900.00", source: "verified_income_minus_operating_costs_and_reserve_contributions" },
      reasons: ["Complete reviewed plan, reconciliation, and freshness requirements before treating surplus as deployable."],
    });
    await page.reload();
    await expect(panel.getByText("INCOMPLETE_DATA", { exact: true })).toBeVisible();
    await expect(panel).toContainText("$0");
    await expect(panel).toContainText("$100");
    await expect(panel).toContainText("Complete reviewed plan");
    await expect(panel).toContainText("no movement authorized");

    governorResponse = undefined;
    governorError = true;
    await page.reload();
    await expect(panel).toContainText("V2 evidence is unavailable");
    await expect(panel).toContainText("legacy Safe-to-Deploy authority remains unchanged");
    await expect(panel.getByRole("button", { name: "Retry" })).toBeVisible();

    governorError = false;
    governorResponse = readyState;
    await panel.getByRole("button", { name: "Retry" }).click();
    await expect(panel.getByText("READY", { exact: true })).toBeVisible();
    await expect(panel).toContainText("$1,234");

    console.log(JSON.stringify({
      gate: "BROWSER-CAPITAL-GOVERNOR-V2",
      authenticated: true,
      tenantScopedTreasury: "PASS",
      incompleteState: "PASS",
      readyState: "PASS",
      conservativeState: "PASS",
      capitalSurplusSeparated: "PASS",
      advisoryOnly: "PASS",
      noMoneyMovement: "PASS",
      retryErrorState: "PASS",
      retryRecovery: "PASS",
    }));
  } finally {
    await cleanupCapitalGovernorBrowserFixture(disposableClerkUserId ?? "", disposableEmail);
    if (disposableClerkUserId) await clerkClient.users.deleteUser(disposableClerkUserId);
  }
});