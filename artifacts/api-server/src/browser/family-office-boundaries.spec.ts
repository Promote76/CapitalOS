import { expect, test } from "@playwright/test";
import { clerkClient } from "@clerk/express";
import { randomUUID } from "node:crypto";
import {
  cleanupFamilyOfficeBrowserFixture,
  setupFamilyOfficeBrowserFixture,
} from "../integration/family-office-browser-fixture.ts";

test("authenticated Family Office route shows fail-closed and Shadow-only browser boundaries", async ({ page }) => {
  const email = process.env.BROWSER_TEST_EMAIL;
  if (!email) throw new Error("BROWSER_TEST_EMAIL is required");
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) throw new Error("BROWSER_TEST_EMAIL must be a valid email address");

  const runId = randomUUID().slice(0, 12);
  const disposableEmail = `${localPart}+fo-${runId}@${domain}`;
  let disposableClerkUserId: string | undefined;
  try {
    const disposableUser = await clerkClient.users.createUser({
      emailAddress: [disposableEmail],
      firstName: "Family Office",
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
      await page.getByLabel("Household name").fill(`Family Office browser ${runId}`);
      const onboarded = page.waitForResponse((response) =>
        response.url().endsWith("/api/auth/onboard") && response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Create household" }).click();
      expect((await onboarded).ok()).toBe(true);
      await expect(onboarding).not.toBeVisible();
    }

    const fixture = await setupFamilyOfficeBrowserFixture(disposableUser.id, runId);
    const familyOfficeUrl = /\/api\/family-office$/;

    await page.route("**/api/family-office**", async (route) => {
      if (!familyOfficeUrl.test(new URL(route.request().url()).pathname)) return route.continue();
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.continue();
    });
    await page.goto("/family-office");
    await expect(page.getByText("Loading the household-scoped intelligence workspace.")).toBeVisible();
    await expect(page.getByText("Provider boundary")).toBeVisible();
    await page.unroute("**/api/family-office**");

    const providerCard = page.locator("section.card").filter({ hasText: "Provider boundary" });
    const providerState = providerCard.locator(".card-title-row .status");
    await expect(providerState).toHaveText(/^(disabled|configured|verified|unavailable)$/);
    const providerStateText = (await providerState.textContent())?.trim();
    const researchButton = page.getByRole("button", { name: /run advisory research/i });
    if (providerStateText === "disabled") {
      await expect(page.getByText("Provider is disabled or not configured.")).toBeVisible();
      await expect(researchButton).toBeDisabled();
    } else {
      await expect(researchButton).toBeEnabled();
    }
    await expect(page.getByText("Live execution", { exact: true }).locator("..")).toContainText("Disabled");
    await expect(page.getByText("Real orders sent", { exact: true }).locator("..")).toContainText("0");
    await expect(page.getByText("Money moved", { exact: true }).locator("..")).toContainText("0¢");

    await expect(page.getByText("Analyst proposals")).toBeVisible();
    await expect(page.getByRole("heading", { name: `Browser Shadow proposal ${runId}` })).toBeVisible();
    await expect(page.getByText("Human review required", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve Shadow review" })).toBeVisible();
    await expect(page.locator(".card-title").filter({ hasText: /^Shadow portfolio$/ })).toBeVisible();
    await expect(page.locator(".review-row strong").filter({ hasText: `Browser Shadow portfolio ${runId}` })).toBeVisible();
    await expect(page.getByText("Hypothetical intent", { exact: true })).toBeVisible();
    await expect(page.getByText("Records a research scenario; it is never transmitted.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Record Shadow intent" })).toBeEnabled();

    await page.route("**/api/family-office", async (route) => {
      if (!familyOfficeUrl.test(new URL(route.request().url()).pathname)) return route.continue();
      await route.abort("failed");
    });
    await page.reload();
    await expect(page.getByRole("alert")).toContainText("Family Office unavailable");
    await expect(page.getByRole("alert")).toContainText("No advisory records are shown");
    await page.unroute("**/api/family-office**");

    const bodyText = await page.locator("body").textContent();
    expect(bodyText).not.toContain("XAI_API_KEY");
    expect(bodyText).not.toContain("Authorization: Bearer");

    console.log(JSON.stringify({
      gate: "BROWSER-FAMILY-OFFICE",
      authenticated: true,
      providerState: providerStateText,
      providerBoundary: "PASS",
      loadingState: "PASS",
      errorState: "PASS",
      proposalReview: "PASS",
      portfolioState: "PASS",
      hypotheticalIntentState: "PASS",
      secretsExposed: false,
      fixtureProposalId: fixture.proposalId,
      fixturePortfolioId: fixture.portfolioId,
    }));
  } finally {
    await cleanupFamilyOfficeBrowserFixture(runId);
    if (disposableClerkUserId) await clerkClient.users.deleteUser(disposableClerkUserId);
  }
});