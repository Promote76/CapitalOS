import { expect, test } from "@playwright/test";
import { clerkClient } from "@clerk/express";
import { randomUUID } from "node:crypto";
import { cleanupDisposableBudgetReviewTenant } from "../integration/budget-review-browser-fixture.ts";

test("authenticated Budget plan builder navigation preserves the planning hash", async ({ page }) => {
  const email = process.env.BROWSER_TEST_EMAIL;
  if (!email) throw new Error("BROWSER_TEST_EMAIL is required");
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) throw new Error("BROWSER_TEST_EMAIL must be a valid email address");

  const runId = randomUUID().slice(0, 12);
  const disposableEmail = `${localPart}+brb-${runId.slice(0, 8)}@${domain}`;
  let disposableClerkUserId: string | undefined;

  try {
    const disposableUser = await clerkClient.users.createUser({
      emailAddress: [disposableEmail],
      firstName: "Budget plan",
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
    const authenticatedShell = page.locator(".session-controls");
    await expect(onboarding.or(authenticatedShell)).toBeVisible();
    if (await onboarding.isVisible()) {
      await page.getByLabel("Household name").fill(`Budget plan browser ${runId}`);
      const onboarded = page.waitForResponse((response) =>
        response.url().endsWith("/api/auth/onboard") && response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Create household" }).click();
      expect((await onboarded).ok()).toBe(true);
      await expect(onboarding).not.toBeVisible();
    }

    let authMe = await page.evaluate(async () => {
      const response = await fetch("/api/auth/me");
      return { status: response.status, body: await response.json() };
    }) as {
      status: number;
      body: {
        authStrength: string;
        activeHouseholdId: string | null;
        memberships: Array<{ active: boolean; householdId: string }>;
      };
    };
    if (!authMe.body.activeHouseholdId) {
      const onboarded = await page.evaluate(async (householdName) => {
        const response = await fetch("/api/auth/onboard", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: householdName, timezone: "America/Chicago" }),
        });
        return { status: response.status, body: await response.json().catch(() => ({})) as { code?: string } };
      }, `Budget plan browser ${runId}`);
      expect(
        onboarded.status === 201 || (onboarded.status === 409 && onboarded.body.code === "HOUSEHOLD_ALREADY_EXISTS"),
        JSON.stringify(onboarded.body),
      ).toBe(true);
      authMe = await page.evaluate(async () => {
        const response = await fetch("/api/auth/me");
        return { status: response.status, body: await response.json() };
      }) as typeof authMe;
    }
    expect(authMe.status).toBe(200);
    expect(authMe.body.authStrength).toBe("clerk_session");
    expect(authMe.body.activeHouseholdId).toBeTruthy();
    expect(authMe.body.memberships.filter((membership) => membership.active)).toHaveLength(1);
    expect(authMe.body.memberships[0]?.householdId).toBe(authMe.body.activeHouseholdId);

    for (const viewport of [
      { name: "desktop", width: 1440, height: 1000 },
      { name: "mobile", width: 390, height: 844 },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/budget");
      const openPlanBuilder = page.getByTestId("link-open-plan-builder");
      const planning = page.locator("#budget-planning");
      const planningHeading = planning.getByText("Planning Control Center", { exact: true });

      await expect(openPlanBuilder).toBeVisible();
      await openPlanBuilder.click();
      await expect(page).toHaveURL(/\/budget#budget-planning$/);
      await expect(planningHeading).toBeVisible();
      await expect(planningHeading).toBeInViewport();

      const clickPosition = await planningHeading.boundingBox();
      expect(clickPosition?.y, `${viewport.name} click should scroll to planning`).toBeGreaterThanOrEqual(0);
      expect(clickPosition?.y, `${viewport.name} click should place planning near the viewport top`).toBeLessThan(220);

      await page.goto("/budget#budget-planning");
      await expect(page).toHaveURL(/\/budget#budget-planning$/);
      await expect(planning).toBeVisible();
      await expect(planningHeading).toBeInViewport();

      const directLoadPosition = await planningHeading.boundingBox();
      expect(directLoadPosition?.y, `${viewport.name} direct hash load should scroll to planning`).toBeGreaterThanOrEqual(0);
      expect(directLoadPosition?.y, `${viewport.name} direct hash load should place planning near the viewport top`).toBeLessThan(220);
    }

    console.log(JSON.stringify({
      gate: "BROWSER-BUDGET-PLAN-NAVIGATION",
      authenticated: true,
      householdMembership: "PASS",
      desktopClick: "PASS",
      mobileClick: "PASS",
      desktopDirectHash: "PASS",
      mobileDirectHash: "PASS",
    }));
  } finally {
    try {
      if (disposableClerkUserId) {
        await cleanupDisposableBudgetReviewTenant({
          externalAuthId: disposableClerkUserId,
          email: disposableEmail,
        }, runId);
      }
    } finally {
      if (disposableClerkUserId) await clerkClient.users.deleteUser(disposableClerkUserId);
    }
  }
});