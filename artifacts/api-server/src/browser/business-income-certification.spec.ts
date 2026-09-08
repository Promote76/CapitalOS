import { expect, test } from "@playwright/test";
import { clerkClient } from "@clerk/express";
import { randomUUID } from "node:crypto";
import {
  cleanupBusinessIncomeBrowserFixture,
  setupBusinessIncomeBrowserFixture,
} from "../integration/business-income-browser-fixture.ts";

test("authenticated Business page records settlement evidence and keeps blocked draws non-approvable", async ({ page }) => {
  const email = process.env.BROWSER_TEST_EMAIL;
  if (!email) throw new Error("BROWSER_TEST_EMAIL is required");
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) throw new Error("BROWSER_TEST_EMAIL must be a valid email address");
  const runId = randomUUID().slice(0, 12);
  const disposableEmail = `${localPart}+business-income-${runId}@${domain}`;
  let disposableClerkUserId: string | undefined;
  try {
    const disposableUser = await clerkClient.users.createUser({
      emailAddress: [disposableEmail],
      firstName: "Business Income",
      lastName: "browser fixture",
      skipPasswordRequirement: true,
    });
    disposableClerkUserId = disposableUser.id;
    const ticket = await clerkClient.signInTokens.createSignInToken({ userId: disposableUser.id, expiresInSeconds: 60 });
    await page.goto(`/sign-in?__clerk_ticket=${encodeURIComponent(ticket.token)}`);
    await expect(page).not.toHaveURL(/\/sign-in/);
    const onboarding = page.getByRole("heading", { name: /set up your household/i });
    await expect(onboarding.or(page.locator(".session-controls"))).toBeVisible();
    if (await onboarding.isVisible()) {
      await page.getByLabel("Household name").fill(`Business income browser ${runId}`);
      const onboarded = page.waitForResponse((response) =>
        response.url().endsWith("/api/auth/onboard") && response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Create household" }).click();
      expect((await onboarded).ok()).toBe(true);
      await expect(onboarding).not.toBeVisible();
    }
    const fixture = await setupBusinessIncomeBrowserFixture(disposableUser.id, runId);
    await page.goto("/business");
    await expect(page.getByRole("heading", { name: /reconcile the money/i })).toBeVisible();
    await expect(page.getByText("Bank evidence is read-only.")).toBeVisible();

    const settlement = await page.evaluate(async (businessId) => {
      const response = await fetch("/api/business/income/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          statementPeriodStart: "2026-09-01",
          statementPeriodEnd: "2026-09-15",
          paidDate: "2026-09-15",
          provider: "Browser fixture processor",
          sourceFileName: "browser-settlement.pdf",
          reportedGross: "100.00",
          reportedDeductions: "10.00",
          reportedNet: "90.00",
          revenueLines: [{ description: "Browser services", amount: "100.00" }],
          deductionLines: [{ description: "Browser fee", amount: "10.00" }],
        }),
      });
      return { status: response.status, body: await response.json() };
    }, fixture.businessId) as { status: number; body: { id: string } };
    expect(settlement.status).toBe(201);

    const cashPosition = await page.evaluate(async (businessId) => {
      const response = await fetch("/api/business/income/cash-position", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, asOf: "2026-09-15" }),
      });
      return { status: response.status, body: await response.json() };
    }, fixture.businessId) as { status: number; body: { safeToDistribute: string } };
    expect(cashPosition.status).toBe(201);
    expect(cashPosition.body.safeToDistribute).toBe("0.00");

    const draw = await page.evaluate(async (businessId) => {
      const response = await fetch("/api/business/income/owner-draws", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, proposalDate: "2026-09-15", amount: "100.00", notes: "Blocked browser draw" }),
      });
      return { status: response.status, body: await response.json() };
    }, fixture.businessId) as { status: number; body: { status: string } };
    expect(draw.status).toBe(201);
    expect(draw.body.status).toBe("needs_review");

    await page.getByRole("link", { name: "Dashboard", exact: true }).click();
    await page.getByTestId("link-topnav-business").click();
    await expect(page.getByRole("heading", { name: /reconcile the money/i })).toBeVisible();
    await expect(page.getByText("$90 net · 2026-09-01T00:00:00.000Z to 2026-09-15T00:00:00.000Z")).toBeVisible();
    await expect(page.getByText("$100 · Needs review")).toBeVisible();
    await expect(page.getByText("Approve", { exact: true })).not.toBeVisible();
  } finally {
    await cleanupBusinessIncomeBrowserFixture(runId);
    if (disposableClerkUserId) await clerkClient.users.deleteUser(disposableClerkUserId);
  }
});