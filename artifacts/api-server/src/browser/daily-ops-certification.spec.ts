import { expect, test } from "@playwright/test";
import { clerkClient } from "@clerk/express";
import { randomUUID } from "node:crypto";
import {
  cleanupDailyOpsBrowserFixture,
  setupDailyOpsBrowserFixture,
} from "../integration/daily-ops-browser-fixture.ts";

test("authenticated Daily Ops cockpit certifies responsive review and fail-closed source states", async ({ page }) => {
  const email = process.env.BROWSER_TEST_EMAIL;
  if (!email) throw new Error("BROWSER_TEST_EMAIL is required");
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) throw new Error("BROWSER_TEST_EMAIL must be a valid email address");

  const runId = randomUUID().slice(0, 12);
  const disposableEmail = `${localPart}+daily-ops-${runId}@${domain}`;
  let disposableClerkUserId: string | undefined;
  try {
    const disposableUser = await clerkClient.users.createUser({
      emailAddress: [disposableEmail],
      firstName: "Daily Ops",
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
      await page.getByLabel("Household name").fill(`Daily Ops browser ${runId}`);
      const onboarded = page.waitForResponse((response) =>
        response.url().endsWith("/api/auth/onboard") && response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Create household" }).click();
      expect((await onboarded).ok()).toBe(true);
      await expect(onboarding).not.toBeVisible();
    }

    const fixture = await setupDailyOpsBrowserFixture(disposableUser.id, runId);
    const requestCounts = new Map<string, number>();
    page.on("request", (request) => {
      if (request.method() !== "GET") return;
      const pathname = new URL(request.url()).pathname;
      if (pathname.startsWith("/api/")) requestCounts.set(pathname, (requestCounts.get(pathname) ?? 0) + 1);
    });

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/daily-ops");
    await expect(page.getByRole("heading", { name: /Run the house with context/i })).toBeVisible();
    await expect(page.getByText("Advisory only", { exact: true })).toBeVisible();
    await expect(page.getByText("Grok is unavailable.")).toBeVisible();
    await expect(page.getByText(/No synthetic brief is shown/)).toBeVisible();
    await expect(page.getByText(/Shadow-only/).first()).toBeVisible();
    await expect(page.getByText(/No broker credentials or execution authority/)).toBeVisible();

    const desktopOverflow = await page.evaluate(() => {
      const browser = globalThis as unknown as {
        document: { documentElement: { scrollWidth: number } };
        innerWidth: number;
      };
      return browser.document.documentElement.scrollWidth > browser.innerWidth;
    });
    expect(desktopOverflow).toBe(false);
    for (const [label, href] of [
      ["Open Treasury", "/treasury"],
      ["Open Accounting", "/accounting"],
      ["Open Operations command center", "/operations"],
      ["Open Family Office history", "/family-office"],
    ] as const) {
      await expect(page.getByRole("link", { name: new RegExp(label) }).first()).toHaveAttribute("href", href);
    }

    const task = page.locator(".daily-ops-task").filter({ hasText: fixture.marker });
    await expect(task).toBeVisible();
    await task.getByRole("button", { name: "Start" }).click();
    await expect(task.getByRole("button", { name: "Complete" })).toBeVisible();
    await task.getByRole("button", { name: "Complete" }).click();
    await expect(task.getByRole("button", { name: "Reopen" })).toBeVisible();

    for (const [label, selected] of [["This week", "WEEK"], ["This month", "MONTH"], ["Today", "TODAY"]] as const) {
      await page.getByRole("tab", { name: label }).click();
      await expect(page.getByRole("tab", { name: label })).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("tab", { name: label === "This week" ? "This month" : label === "This month" ? "Today" : "This week" })).toHaveAttribute("aria-selected", "false");
      expect(selected).toBeTruthy();
    }

    const refreshButton = page.getByRole("button", { name: /Refresh cockpit/i });
    const operationsPath = "/api/operations";
    const beforeRefresh = requestCounts.get(operationsPath) ?? 0;
    await page.route("**/api/operations/daily-ops", (route) => route.abort("failed"));
    await expect(refreshButton).toBeEnabled();
    await refreshButton.click();
    await expect(refreshButton).toBeEnabled();
    const afterRefresh = requestCounts.get(operationsPath) ?? 0;
    expect(afterRefresh - beforeRefresh).toBeGreaterThan(0);
    expect(afterRefresh - beforeRefresh).toBeLessThanOrEqual(2);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { name: /Run the house with context/i })).toBeVisible();
    const mobileOverflow = await page.evaluate(() => {
      const browser = globalThis as unknown as {
        document: { documentElement: { scrollWidth: number } };
        innerWidth: number;
      };
      return browser.document.documentElement.scrollWidth > browser.innerWidth;
    });
    expect(mobileOverflow).toBe(false);

    await page.route("**/api/treasury", (route) => route.abort("failed"));
    await page.route("**/api/accounting", (route) => route.abort("failed"));
    await page.route("**/api/operations**", (route) => route.abort("failed"));
    await page.reload();
    await expect(page.locator(".daily-ops-posture-card").getByText("Capital posture").locator("..")).toContainText("Unavailable");
    const conditionCells = page.locator(".daily-ops-condition-card .daily-ops-condition-grid > div");
    await expect(conditionCells.nth(0)).toContainText("Unavailable");
    await expect(conditionCells.nth(1)).toContainText("Unavailable");
    await expect(page.getByText("No capital posture is inferred while Treasury is unavailable.")).toBeVisible();
    await expect(page.getByText("No current balance-sheet change is shown.")).toBeVisible();
    await expect(conditionCells.nth(2)).toContainText("Unavailable");
    await expect(page.getByText("Operations tasks is unavailable.")).toBeVisible();
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).not.toMatch(/Safe to deploy\s+\$0/);
    expect(bodyText).not.toMatch(/Net worth\s+\$0/);
    expect(bodyText).not.toContain("Treasury posture is visible");
    expect(bodyText).not.toContain("Accounting snapshot available");

    console.log(JSON.stringify({
      gate: "BROWSER-DAILY-OPS",
      authenticated: true,
      desktopLayout: "PASS",
      mobileLayout: "PASS",
      cadenceTabs: "PASS",
      boundedRefresh: "PASS",
      sourceLinks: "PASS",
      taskStatus: "PASS",
      providerFailure: "PASS",
      unavailableSources: "PASS",
      advisoryOnly: "PASS",
    }));
  } finally {
    await cleanupDailyOpsBrowserFixture(runId);
    if (disposableClerkUserId) await clerkClient.users.deleteUser(disposableClerkUserId);
  }
});