import { expect, test } from "@playwright/test";
import { clerkClient } from "@clerk/express";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { auditEvents, db, financeTransactions, statementFinancialReversals } from "@workspace/db";
import { cleanupDocumentBudgetBridgeBrowserFixture, setupDocumentBudgetBridgeBrowserFixture } from "../integration/document-budget-bridge-browser-fixture.ts";

test("authenticated document evidence becomes an official Budget actual only by explicit bridge decisions", async ({ page }) => {
  const email = process.env.BROWSER_TEST_EMAIL;
  if (!email) throw new Error("BROWSER_TEST_EMAIL is required");
  const [local, domain] = email.split("@");
  if (!local || !domain) throw new Error("BROWSER_TEST_EMAIL must be valid");
  const runId = randomUUID();
  const disposableEmail = `${local}+dbb-${runId.slice(0, 8)}@${domain}`;
    const month = new Date().toISOString().slice(0, 7);
  let clerkUserId: string | undefined;
  try {
    const user = await clerkClient.users.createUser({ emailAddress: [disposableEmail], firstName: "Bridge", lastName: "certification", skipPasswordRequirement: true });
    clerkUserId = user.id;
    const ticket = await clerkClient.signInTokens.createSignInToken({ userId: user.id, expiresInSeconds: 60 });
    await page.goto(`/sign-in?__clerk_ticket=${encodeURIComponent(ticket.token)}`);
    await expect(page).not.toHaveURL(/\/sign-in/);
    const onboarding = page.getByRole("heading", { name: /set up your household/i });
    await expect(onboarding.or(page.locator(".session-controls"))).toBeVisible();
    if (await onboarding.isVisible()) {
      await page.getByLabel("Household name").fill(`Bridge browser ${runId}`);
      await page.getByRole("button", { name: "Create household" }).click();
      await expect(onboarding).not.toBeVisible();
    }
    const fixture = await setupDocumentBudgetBridgeBrowserFixture(user.id, disposableEmail, runId, month);
    const accountingBefore = await page.evaluate(async () => {
      const response = await fetch("/api/accounting");
      return { status: response.status, body: await response.json() };
    }) as { status: number; body: { incomeStatement: { totalExpenses: string } } };
    expect(accountingBefore.status).toBe(200);
    await page.goto("/documents");
    const rent = page.getByTestId(`statement-transaction-${fixture.rows.rent}`);
    await expect(rent).toContainText("Evidence: RESOLVED");
    await page.getByTestId(`select-statement-category-${fixture.rows.rent}`).selectOption(fixture.categoryId);
    await page.getByTestId(`button-confirm-statement-category-${fixture.rows.rent}`).click();
    await page.getByTestId(`button-preview-statement-match-${fixture.rows.rent}`).click();
    await expect(page.getByTestId(`statement-match-result-${fixture.rows.rent}`)).toContainText("NO MATCH");
    await expect(page.getByTestId(`statement-match-result-${fixture.rows.rent}`)).toContainText("changes actuals, not the planned target");
    await page.getByTestId(`button-import-statement-row-${fixture.rows.rent}`).click();
    await expect(rent).toContainText("Inclusion: IMPORTED NEW");
    const importedRows = await db.select().from(financeTransactions).where(and(
      eq(financeTransactions.householdId, fixture.householdId),
      eq(financeTransactions.sourceStatementRowId, fixture.rows.rent),
    ));
    expect(importedRows).toHaveLength(1);
    expect(importedRows[0]).toMatchObject({
      amount: "-900.00", categoryId: fixture.categoryId, dataSource: "bank_statement_import",
      sourceDocumentId: fixture.documentId, sourceStatementRowId: fixture.rows.rent,
    });
    // An imported row no longer exposes an import action; its durable source
    // fingerprint also ensures a browser replay cannot create another row.
    await expect(page.getByTestId(`button-import-statement-row-${fixture.rows.rent}`)).toHaveCount(0);

    await page.goto(`/budget?month=${month}`);
    const budgetRow = page.getByTestId(`budget-category-desktop-${fixture.categoryId}`);
    await expect(budgetRow).toContainText("$900.00");

    await page.goto("/accounting");
    await expect(page.getByRole("heading", { name: /see the whole balance/i })).toBeVisible();
    const accounting = await page.evaluate(async () => {
      const response = await fetch("/api/accounting");
      return { status: response.status, body: await response.json() };
    }) as { status: number; body: { incomeStatement: { totalExpenses: string } } };
    expect(accounting.status).toBe(200);
    expect(Number(accounting.body.incomeStatement.totalExpenses) - Number(accountingBefore.body.incomeStatement.totalExpenses)).toBe(900);

    await page.goto("/documents");
    const one = page.getByTestId(`statement-transaction-${fixture.rows.oneMatch}`);
    await page.getByTestId(`select-statement-category-${fixture.rows.oneMatch}`).selectOption(fixture.matchCategoryId);
    await page.getByTestId(`button-confirm-statement-category-${fixture.rows.oneMatch}`).click();
    await page.getByTestId(`button-preview-statement-match-${fixture.rows.oneMatch}`).click();
    await expect(one).toContainText("ONE HIGH CONFIDENCE MATCH");
    await page.getByTestId(`button-link-statement-row-${fixture.rows.oneMatch}`).click();
    await expect(one).toContainText("LINKED EXISTING");
    expect(await db.select().from(financeTransactions).where(eq(financeTransactions.id, fixture.existingTransactionId))).toHaveLength(1);

    for (const [key, action] of [["transfer", "button-exclude-statement-transfer"], ["settlement", "button-exclude-statement-settlement"]] as const) {
      await page.getByTestId(`${action}-${fixture.rows[key]}`).click();
      await expect(page.getByTestId(`text-statement-category-decision-${fixture.rows[key]}`)).toContainText(key === "transfer" ? "NOT APPLICABLE TRANSFER" : "NOT APPLICABLE SETTLEMENT");
      expect(await db.select().from(financeTransactions).where(eq(financeTransactions.sourceStatementRowId, fixture.rows[key]))).toHaveLength(0);
    }
    await page.getByTestId(`select-statement-category-${fixture.rows.ambiguous}`).selectOption(fixture.matchCategoryId);
    await page.getByTestId(`button-confirm-statement-category-${fixture.rows.ambiguous}`).click();
    await page.getByTestId(`button-preview-statement-match-${fixture.rows.ambiguous}`).click();
    await expect(page.getByTestId(`statement-match-result-${fixture.rows.ambiguous}`)).toContainText("MULTIPLE CANDIDATES");
    await expect(page.getByTestId(`button-import-statement-row-${fixture.rows.ambiguous}`)).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(rent).toBeVisible();
    expect(await page.evaluate(() => {
      const browser = globalThis as unknown as { document: { documentElement: { scrollWidth: number } }; innerWidth: number };
      return browser.document.documentElement.scrollWidth <= browser.innerWidth;
    })).toBe(true);
    await page.getByTestId(`button-reverse-statement-import-${fixture.rows.rent}`).click();
    await expect(rent).toContainText("Financial inclusion was reversed");
    expect(await db.select().from(statementFinancialReversals).where(eq(statementFinancialReversals.statementRowId, fixture.rows.rent))).toHaveLength(1);
    expect(await db.select().from(auditEvents).where(eq(auditEvents.householdId, fixture.householdId))).not.toHaveLength(0);
    await page.goto(`/budget?month=${month}`);
    await expect(budgetRow).toContainText("$0.00");
  } finally {
    if (clerkUserId) {
      try {
        await cleanupDocumentBudgetBridgeBrowserFixture(clerkUserId, disposableEmail, runId);
      } finally {
        await clerkClient.users.deleteUser(clerkUserId);
      }
    }
  }
});