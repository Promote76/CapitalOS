import { expect, test } from "@playwright/test";
import { clerkClient } from "@clerk/express";
import { randomUUID } from "node:crypto";
import {
  cleanupBudgetReviewBrowserFixture,
  cleanupDisposableBudgetReviewTenant,
  setupBudgetReviewBrowserFixture,
} from "../integration/budget-review-browser-fixture.ts";

const reasons = ["pending", "unreviewed", "nonHousehold", "excluded", "transfer", "uncategorized", "nonIncome"] as const;
const actionable = new Set(["unreviewed", "uncategorized"]);

test("Budget exclusion links recover the guidance basis and refresh its fingerprint", async ({ page }) => {
  const email = process.env.BROWSER_TEST_EMAIL;
  const origin = process.env.CAPITAL_OS_BROWSER_ORIGIN ?? "http://127.0.0.1:4173";
  if (!email) {
    throw new Error("BROWSER_TEST_EMAIL is required");
  }

  const runId = randomUUID();
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) throw new Error("BROWSER_TEST_EMAIL must be a valid email address");
  const disposableEmail = `${localPart}+brb-${runId.slice(0, 8)}@${domain}`;
  const month = `${2100 + (Number.parseInt(runId.slice(0, 4), 16) % 100)}-${String((Number.parseInt(runId.slice(4, 6), 16) % 12) + 1).padStart(2, "0")}`;
  let fixture: Awaited<ReturnType<typeof setupBudgetReviewBrowserFixture>> | undefined;
  let disposableClerkUserId: string | undefined;
  try {
    const disposableUser = await clerkClient.users.createUser({
      emailAddress: [disposableEmail],
      firstName: "Budget review",
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
      await page.getByLabel("Household name").fill(`Budget review browser ${runId}`);
      const onboarded = page.waitForResponse((response) =>
        response.url().endsWith("/api/auth/onboard") && response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Create household" }).click();
      expect((await onboarded).ok()).toBe(true);
      await expect(onboarding).not.toBeVisible();
    }

    fixture = await setupBudgetReviewBrowserFixture(disposableUser.id, runId, month);
    await page.goto(`/budget?month=${month}`);
    const fingerprint = page.getByTestId("text-weekly-guidance-fingerprint");
    await expect(fingerprint).toHaveText(/[a-f0-9]{12}/);
    const beforeFingerprint = await fingerprint.textContent();
    await expect(page.getByText("Included Outflow").locator("..")).toContainText("1 rows");
    await expect(page.getByText("Exclusions").locator("..")).toContainText("7 items");

    for (const reason of reasons) {
      const link = page.getByTestId(`link-weekly-guidance-exclusion-${reason}`);
      await expect(link).toContainText("(1)");
      await link.click();
      await expect(page).toHaveURL(new RegExp(`reason=${reason}`));
      await expect(page.getByTestId("button-filter-transaction-review-guidance-reason")).toContainText("(1)");
      const transactionId = fixture.transactionIds[reason];
      const card = page.getByTestId(`card-transaction-review-${transactionId}`);
      await expect(card).toBeVisible();
      const category = page.getByTestId(`select-transaction-category-${transactionId}`);
      const save = page.getByTestId(`button-categorize-transaction-${transactionId}`);
      if (actionable.has(reason)) {
        await expect(category).toBeEnabled();
        await expect(save).toBeEnabled();
      } else {
        await expect(category).toBeDisabled();
        await expect(save).toBeDisabled();
        await expect(page.getByTestId(`button-approve-transaction-${transactionId}`)).toBeDisabled();
      }
      await page.getByTestId("link-return-to-budget").click();
      await expect(fingerprint).toBeVisible();
    }

    await page.getByTestId("link-weekly-guidance-exclusion-uncategorized").click();
    const transactionId = fixture.transactionIds.uncategorized;
    await page.getByTestId(`select-transaction-category-${transactionId}`).selectOption(fixture.categoryId);
    const approve = page.getByTestId(`button-approve-transaction-${transactionId}`);
    await expect(approve).toBeEnabled();
    await approve.click();
    await expect(page.getByTestId(`card-transaction-review-${transactionId}`)).not.toBeVisible();
    await page.getByTestId("link-return-to-budget").click();

    await expect(page.getByTestId("link-weekly-guidance-exclusion-uncategorized")).not.toBeVisible();
    await expect(page.getByText("Included Outflow").locator("..")).toContainText("2 rows");
    await expect(page.getByText("Exclusions").locator("..")).toContainText("6 items");
    await expect(fingerprint).not.toHaveText(beforeFingerprint ?? "");
    const afterFingerprint = await fingerprint.textContent();
    await page.reload();
    await expect(page.getByText("Included Outflow").locator("..")).toContainText("2 rows");
    await expect(fingerprint).toHaveText(afterFingerprint ?? "");
  } finally {
    let databaseTenantPurged = false;
    try {
      if (fixture && disposableClerkUserId) {
        await cleanupBudgetReviewBrowserFixture(runId, {
          tenantOwner: {
            externalAuthId: disposableClerkUserId,
            email: disposableEmail,
            householdId: fixture.householdId,
          },
        });
        databaseTenantPurged = true;
      }
    } finally {
      try {
        if (disposableClerkUserId && !databaseTenantPurged) {
          await cleanupDisposableBudgetReviewTenant({
            externalAuthId: disposableClerkUserId,
            email: disposableEmail,
          }, runId);
        }
      } finally {
        if (disposableClerkUserId) await clerkClient.users.deleteUser(disposableClerkUserId);
      }
    }
  }
});