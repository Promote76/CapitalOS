import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";
import { CreateBudgetPlanningCategoryBody, UpdateBudgetPlanningCategoryBody } from "@workspace/api-zod";
import {
  auditEvents,
  budgetPlanningCategorySnapshots,
  db,
  households,
  users,
} from "@workspace/db";
import {
  approveBudgetPlanningPeriod,
  createBudgetPlanningCategory,
  getBudget,
  getBudgetPlanningPeriod,
  updateBudgetPlanningCategory,
} from "../services/household-finance.ts";

test("budget monthly targets are nonnegative at contract, service, and approval boundaries", async () => {
  assert.equal(CreateBudgetPlanningCategoryBody.safeParse({
    version: 1,
    name: "Invalid negative target",
    categoryType: "fixed_expense",
    essentialStatus: "essential",
    monthlyTarget: "-1.00",
  }).success, false);
  assert.equal(UpdateBudgetPlanningCategoryBody.safeParse({
    version: 1,
    monthlyTarget: "-0.01",
  }).success, false);

  const suffix = randomUUID();
  const [user] = await db.insert(users).values({
    email: `budget-target-${suffix}@test.invalid`,
    displayName: "Budget target validation fixture",
    status: "active",
  }).returning();
  const [household] = await db.insert(households).values({
    name: `DISPOSABLE budget target validation ${suffix}`,
    timezone: "UTC",
  }).returning();
  const actor = {
    userId: user.id,
    householdId: household.id,
    role: "owner" as const,
    source: "test-database" as const,
  };
  const month = new Date().toISOString().slice(0, 7);

  try {
    await getBudget(actor);
    const period = await getBudgetPlanningPeriod(actor, month);
    const housing = period.categories.find((category) => category.name === "Housing");
    assert.ok(housing);

    await assert.rejects(
      () => createBudgetPlanningCategory(actor, period.id, period.version, {
        name: "Invalid negative category",
        categoryType: "fixed_expense",
        essentialStatus: "essential",
        monthlyTarget: "-1.00",
      }),
      (error: unknown) => error instanceof Error && "code" in error && error.code === "INVALID_STATE" && /cannot be negative/i.test(error.message),
    );

    await assert.rejects(
      () => updateBudgetPlanningCategory(actor, period.id, housing.id, period.version, {
        monthlyTarget: "-1.00",
      }),
      (error: unknown) => error instanceof Error && "code" in error && error.code === "INVALID_STATE" && /cannot be negative/i.test(error.message),
    );

    await db.update(budgetPlanningCategorySnapshots)
      .set({ monthlyTarget: "-1.00" })
      .where(eq(budgetPlanningCategorySnapshots.id, housing.id));

    await assert.rejects(
      () => approveBudgetPlanningPeriod(actor, period.id, period.version, `negative-approval-${randomUUID()}`),
      (error: unknown) => error instanceof Error && "code" in error && error.code === "INVALID_STATE" && /cannot be negative/i.test(error.message),
    );
  } finally {
    await db.delete(auditEvents).where(eq(auditEvents.householdId, household.id));
    await db.delete(households).where(eq(households.id, household.id));
    await db.delete(users).where(eq(users.id, user.id));
  }
});
