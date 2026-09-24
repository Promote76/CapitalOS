import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";
import {
  budgetPlanningCategorySnapshots,
  budgetPlanningPeriods,
  db,
  financeCategories,
  financeTransactions,
  financialAccounts,
  households,
  users,
} from "@workspace/db";
import { getBudgetPlanningCategoryContributionDetail } from "../services/household-finance.ts";

test("budget contribution detail preserves income and expense sign semantics", async () => {
  const suffix = randomUUID();
  const [user] = await db.insert(users).values({
    email: `budget-detail-${suffix}@test.invalid`,
    displayName: "Budget contribution detail fixture",
    status: "active",
  }).returning();
  const [household] = await db.insert(households).values({
    name: `DISPOSABLE budget contribution detail ${suffix}`,
    timezone: "UTC",
  }).returning();
  const actor = {
    userId: user.id,
    householdId: household.id,
    role: "owner" as const,
    source: "test-database" as const,
  };
  const today = new Date().toISOString().slice(0, 10);
  const month = `${today.slice(0, 7)}-01`;

  try {
    const [account] = await db.insert(financialAccounts).values({
      householdId: household.id,
      institution: "Fixture Bank",
      nickname: "Fixture checking",
      accountType: "checking",
      currentBalance: "1000.00",
      availableBalance: "1000.00",
    }).returning();

    const [incomeCategory, expenseCategory] = await db.insert(financeCategories).values([
      {
        householdId: household.id,
        name: "Fixture income",
        categoryType: "income",
        essentialStatus: "essential",
        monthlyTarget: "500.00",
      },
      {
        householdId: household.id,
        name: "Fixture housing",
        categoryType: "fixed_expense",
        essentialStatus: "essential",
        monthlyTarget: "300.00",
      },
    ]).returning();

    const [period] = await db.insert(budgetPlanningPeriods).values({
      householdId: household.id,
      month,
      status: "approved",
      createdBy: user.id,
      approvedBy: user.id,
      approvedAt: new Date(),
    }).returning();

    const [incomeSnapshot, expenseSnapshot] = await db.insert(budgetPlanningCategorySnapshots).values([
      {
        householdId: household.id,
        periodId: period.id,
        sourceCategoryId: incomeCategory.id,
        name: incomeCategory.name,
        categoryType: incomeCategory.categoryType,
        essentialStatus: incomeCategory.essentialStatus,
        monthlyTarget: "500.00",
        sortOrder: 0,
        createdBy: user.id,
        updatedBy: user.id,
      },
      {
        householdId: household.id,
        periodId: period.id,
        sourceCategoryId: expenseCategory.id,
        name: expenseCategory.name,
        categoryType: expenseCategory.categoryType,
        essentialStatus: expenseCategory.essentialStatus,
        monthlyTarget: "300.00",
        sortOrder: 1,
        createdBy: user.id,
        updatedBy: user.id,
      },
    ]).returning();

    await db.insert(financeTransactions).values([
      {
        householdId: household.id,
        accountId: account.id,
        transactionDate: today,
        description: "Approved income",
        amount: "250.00",
        categoryId: incomeCategory.id,
        reviewStatus: "approved",
        businessTag: "household",
      },
      {
        householdId: household.id,
        accountId: account.id,
        transactionDate: today,
        description: "Approved housing expense",
        amount: "-100.00",
        categoryId: expenseCategory.id,
        reviewStatus: "approved",
        businessTag: "household",
      },
    ]);

    const incomeDetail = await getBudgetPlanningCategoryContributionDetail(actor, period.id, incomeSnapshot.id);
    const expenseDetail = await getBudgetPlanningCategoryContributionDetail(actor, period.id, expenseSnapshot.id);

    assert.equal(incomeDetail.includedActual, "250.00");
    assert.equal(expenseDetail.includedActual, "100.00");
  } finally {
    await db.delete(households).where(eq(households.id, household.id));
    await db.delete(users).where(eq(users.id, user.id));
  }
});
