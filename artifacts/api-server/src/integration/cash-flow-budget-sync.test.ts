import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { and, eq } from "drizzle-orm";
import {
  budgetPlanningCategorySnapshots,
  budgetPlanningPeriods,
  db,
  financeCategories,
  households,
  users,
} from "@workspace/db";
import { getCashFlow } from "../services/household-finance.ts";

function monthStart(offset: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)).toISOString().slice(0, 10);
}

test("Cash Flow forecast uses canonical finalized Budget snapshots instead of mutable category targets", async () => {
  const suffix = randomUUID();
  const [user] = await db.insert(users).values({
    email: `cash-flow-budget-sync-${suffix}@test.invalid`,
    displayName: "Cash Flow Budget sync fixture",
    status: "active",
  }).returning();
  const [household] = await db.insert(households).values({
    name: `DISPOSABLE cash-flow-budget-sync ${suffix}`,
    timezone: "UTC",
  }).returning();
  const actor = {
    userId: user.id,
    householdId: household.id,
    role: "owner" as const,
    source: "test-database" as const,
  };

  try {
    const [housing] = await db.insert(financeCategories).values({
      householdId: household.id,
      name: "Housing",
      categoryType: "fixed_expense",
      essentialStatus: "essential",
      monthlyTarget: "9999.99",
      warningThreshold: "1.00",
    }).returning();

    const nextMonth = monthStart(1);
    const [olderPlan, newerPlan] = await db.insert(budgetPlanningPeriods).values([
      {
        householdId: household.id,
        month: nextMonth,
        status: "approved",
        version: 2,
        createdBy: user.id,
        approvedBy: user.id,
        approvedAt: new Date(Date.now() - 60_000),
        createdAt: new Date(Date.now() - 60_000),
      },
      {
        householdId: household.id,
        month: nextMonth,
        status: "approved",
        version: 2,
        createdBy: user.id,
        approvedBy: user.id,
        approvedAt: new Date(),
        createdAt: new Date(),
      },
    ]).returning();

    await db.insert(budgetPlanningCategorySnapshots).values([
      {
        householdId: household.id,
        periodId: olderPlan.id,
        sourceCategoryId: housing.id,
        name: "Housing",
        categoryType: "fixed_expense",
        essentialStatus: "essential",
        monthlyTarget: "111.11",
        allocationBasisPoints: 10000,
        sortOrder: 0,
        createdBy: user.id,
        updatedBy: user.id,
      },
      {
        householdId: household.id,
        periodId: newerPlan.id,
        sourceCategoryId: housing.id,
        name: "Housing",
        categoryType: "fixed_expense",
        essentialStatus: "essential",
        monthlyTarget: "222.22",
        allocationBasisPoints: 10000,
        sortOrder: 0,
        createdBy: user.id,
        updatedBy: user.id,
      },
      {
        householdId: household.id,
        periodId: newerPlan.id,
        name: "Personal",
        categoryType: "variable_discretionary",
        essentialStatus: "discretionary",
        monthlyTarget: "7777.77",
        allocationBasisPoints: 0,
        sortOrder: 1,
        createdBy: user.id,
        updatedBy: user.id,
      },
    ]);

    const exactMonthForecast = await getCashFlow(actor);
    assert.equal(exactMonthForecast.forecast.nextMonthEssentialOutflow, "222.22");

    await db.delete(budgetPlanningPeriods).where(and(
      eq(budgetPlanningPeriods.householdId, household.id),
      eq(budgetPlanningPeriods.month, nextMonth),
    ));

    const [priorPlan] = await db.insert(budgetPlanningPeriods).values({
      householdId: household.id,
      month: monthStart(0),
      status: "approved",
      version: 2,
      createdBy: user.id,
      approvedBy: user.id,
      approvedAt: new Date(),
      createdAt: new Date(),
    }).returning();

    await db.insert(budgetPlanningCategorySnapshots).values({
      householdId: household.id,
      periodId: priorPlan.id,
      sourceCategoryId: housing.id,
      name: "Housing",
      categoryType: "fixed_expense",
      essentialStatus: "essential",
      monthlyTarget: "333.33",
      allocationBasisPoints: 10000,
      sortOrder: 0,
      createdBy: user.id,
      updatedBy: user.id,
    });

    await db.update(financeCategories)
      .set({ monthlyTarget: "8888.88" })
      .where(eq(financeCategories.id, housing.id));

    const fallbackForecast = await getCashFlow(actor);
    assert.equal(fallbackForecast.forecast.nextMonthEssentialOutflow, "333.33");
  } finally {
    await db.delete(households).where(eq(households.id, household.id));
    await db.delete(users).where(eq(users.id, user.id));
  }
});
