import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";
import {
  auditEvents,
  budgetPlanningCategorySnapshots,
  budgetPlanningPeriods,
  db,
  households,
  users,
} from "@workspace/db";
import { approveBudgetPlanningPeriod } from "../services/household-finance.ts";

test("budget approval compares full-precision schema money in exact cents", async () => {
  const suffix = randomUUID();
  const [user] = await db.insert(users).values({
    email: `budget-exact-cents-${suffix}@test.invalid`,
    displayName: "Budget exact cents fixture",
    status: "active",
  }).returning();
  const [household] = await db.insert(households).values({
    name: `DISPOSABLE budget exact cents ${suffix}`,
    timezone: "UTC",
  }).returning();
  const actor = {
    userId: user.id,
    householdId: household.id,
    role: "owner" as const,
    source: "test-database" as const,
  };
  const month = `${new Date().toISOString().slice(0, 7)}-01`;

  try {
    const [period] = await db.insert(budgetPlanningPeriods).values({
      householdId: household.id,
      month,
      status: "draft",
      version: 1,
      createdBy: user.id,
    }).returning();

    const snapshots = await db.insert(budgetPlanningCategorySnapshots).values([
      {
        householdId: household.id,
        periodId: period.id,
        name: "Household income",
        categoryType: "income",
        essentialStatus: "essential",
        monthlyTarget: "9999999999999999.99",
        allocationBasisPoints: null,
        sortOrder: 0,
        createdBy: user.id,
        updatedBy: user.id,
      },
      {
        householdId: household.id,
        periodId: period.id,
        name: "Housing",
        categoryType: "fixed_expense",
        essentialStatus: "essential",
        monthlyTarget: "9999999999999999.94",
        allocationBasisPoints: 2000,
        sortOrder: 1,
        createdBy: user.id,
        updatedBy: user.id,
      },
      {
        householdId: household.id,
        periodId: period.id,
        name: "Food",
        categoryType: "variable_essential",
        essentialStatus: "essential",
        monthlyTarget: "0.01",
        allocationBasisPoints: 2000,
        sortOrder: 2,
        createdBy: user.id,
        updatedBy: user.id,
      },
      {
        householdId: household.id,
        periodId: period.id,
        name: "Savings",
        categoryType: "savings",
        essentialStatus: "essential",
        monthlyTarget: "0.01",
        allocationBasisPoints: 2000,
        sortOrder: 3,
        createdBy: user.id,
        updatedBy: user.id,
      },
      {
        householdId: household.id,
        periodId: period.id,
        name: "Personal",
        categoryType: "variable_discretionary",
        essentialStatus: "discretionary",
        monthlyTarget: "0.01",
        allocationBasisPoints: 2000,
        sortOrder: 4,
        createdBy: user.id,
        updatedBy: user.id,
      },
      {
        householdId: household.id,
        periodId: period.id,
        name: "Capital investment",
        categoryType: "investment",
        essentialStatus: "mixed",
        monthlyTarget: "0.01",
        allocationBasisPoints: 2000,
        sortOrder: 5,
        createdBy: user.id,
        updatedBy: user.id,
      },
    ]).returning();

    await assert.rejects(
      () => approveBudgetPlanningPeriod(actor, period.id, 1, `mismatch-${randomUUID()}`),
      (error: unknown) => error instanceof Error && "code" in error && error.code === "INVALID_STATE" && /assign all planned income/i.test(error.message),
    );

    const housing = snapshots.find((snapshot) => snapshot.name === "Housing");
    assert.ok(housing);
    await db.update(budgetPlanningCategorySnapshots)
      .set({ monthlyTarget: "9999999999999999.95" })
      .where(eq(budgetPlanningCategorySnapshots.id, housing.id));

    const approved = await approveBudgetPlanningPeriod(actor, period.id, 1, `exact-${randomUUID()}`);
    assert.equal(approved.status, "approved");
  } finally {
    await db.delete(auditEvents).where(eq(auditEvents.householdId, household.id));
    await db.delete(households).where(eq(households.id, household.id));
    await db.delete(users).where(eq(users.id, user.id));
  }
});
