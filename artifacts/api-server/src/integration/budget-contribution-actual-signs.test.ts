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

test("Budget contribution actuals preserve income and expense sign semantics", async () => {
  const suffix = randomUUID();
  const [user] = await db.insert(users).values({
    email: `budget-actual-${suffix}@test.invalid`,
    displayName: "Budget actual sign fixture",
    status: "active",
  }).returning();
  const [household] = await db.insert(households).values({
    name: `DISPOSABLE budget actual sign ${suffix}`,
    timezone: "UTC",
  }).returning();
  const actor = {
    userId: user.id,
    householdId: household.id,
    role: "owner" as const,
    source: "test-database" as const,
  };
  const month = new Date().toISOString().slice(0, 7);
  const monthDate = `${month}-01`;
  const transactionDate = `${month}-15`;

  try {
    const [account] = await db.insert(financialAccounts).values({
      householdId: household.id,
      institution: "Fixture Bank",
      nickname: "Fixture Checking",
      accountType: "checking",
      currentBalance: "0.00",
      availableBalance: "0.00",
      includedInNetWorth: true,
      includedInBudget: true,
      connectionStatus: "manual",
      dataSource: "manual",
      dataMode: "manual",
    }).returning();

    const [incomeCategory, housingCategory] = await db.insert(financeCategories).values([
      {
        householdId: household.id,
        name: "Fixture income",
        categoryType: "income",
        essentialStatus: "essential",
        monthlyTarget: "2000.00",
        warningThreshold: "1.00",
      },
      {
        householdId: household.id,
        name: "Fixture housing",
        categoryType: "fixed_expense",
        essentialStatus: "essential",
        monthlyTarget: "700.00",
        warningThreshold: "1.00",
      },
    ]).returning();

    const [period] = await db.insert(budgetPlanningPeriods).values({
      householdId: household.id,
      month: monthDate,
      status: "approved",
      version: 2,
      createdBy: user.id,
      approvedBy: user.id,
      approvedAt: new Date(),
    }).returning();

    const [incomeSnapshot, housingSnapshot] = await db.insert(budgetPlanningCategorySnapshots).values([
      {
        householdId: household.id,
        periodId: period.id,
        sourceCategoryId: incomeCategory.id,
        name: "Fixture income",
        categoryType: "income",
        essentialStatus: "essential",
        monthlyTarget: "2000.00",
        warningThreshold: "1.00",
        sortOrder: 0,
        createdBy: user.id,
        updatedBy: user.id,
      },
      {
        householdId: household.id,
        periodId: period.id,
        sourceCategoryId: housingCategory.id,
        name: "Fixture housing",
        categoryType: "fixed_expense",
        essentialStatus: "essential",
        monthlyTarget: "700.00",
        warningThreshold: "1.00",
        sortOrder: 1,
        createdBy: user.id,
        updatedBy: user.id,
      },
    ]).returning();

    await db.insert(financeTransactions).values([
      {
        householdId: household.id,
        accountId: account.id,
        transactionDate,
        description: "Payroll",
        amount: "1000.00",
        categoryId: incomeCategory.id,
        reviewStatus: "approved",
        businessTag: "household",
        dataSource: "manual",
      },
      {
        householdId: household.id,
        accountId: account.id,
        transactionDate,
        description: "Payroll correction",
        amount: "-100.00",
        categoryId: incomeCategory.id,
        reviewStatus: "approved",
        businessTag: "household",
        dataSource: "manual",
      },
      {
        householdId: household.id,
        accountId: account.id,
        transactionDate,
        description: "Rent",
        amount: "-600.00",
        categoryId: housingCategory.id,
        reviewStatus: "approved",
        businessTag: "household",
        dataSource: "manual",
      },
      {
        householdId: household.id,
        accountId: account.id,
        transactionDate,
        description: "Rent credit",
        amount: "50.00",
        categoryId: housingCategory.id,
        reviewStatus: "approved",
        businessTag: "household",
        dataSource: "manual",
      },
    ]);

    const incomeDetail = await getBudgetPlanningCategoryContributionDetail(actor, period.id, incomeSnapshot.id);
    const housingDetail = await getBudgetPlanningCategoryContributionDetail(actor, period.id, housingSnapshot.id);

    assert.equal(incomeDetail.includedActual, "900.00");
    assert.equal(housingDetail.includedActual, "550.00");
    assert.equal(incomeDetail.includedReviewedHouseholdTransactions.length, 2);
    assert.equal(housingDetail.includedReviewedHouseholdTransactions.length, 2);
  } finally {
    await db.delete(households).where(eq(households.id, household.id));
    await db.delete(users).where(eq(users.id, user.id));
  }
});
