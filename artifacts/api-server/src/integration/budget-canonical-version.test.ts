import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";
import {
  budgetPlanningCategorySnapshots,
  budgetPlanningPeriods,
  db,
  financeCategories,
  households,
  users,
} from "@workspace/db";
import {
  createSupersedingBudgetPlanningPeriod,
  getBudget,
  getBudgetPlanningComparison,
} from "../services/household-finance.ts";
import { getVariableBudgetIntelligence } from "../services/variable-income.ts";

test("canonical same-month correction is used by downstream budget consumers", async () => {
  const suffix = randomUUID();
  const [user] = await db.insert(users).values({
    email: `budget-canonical-${suffix}@test.invalid`,
    displayName: "Canonical budget fixture",
    status: "active",
  }).returning();
  const [household] = await db.insert(households).values({
    name: `DISPOSABLE canonical budget ${suffix}`,
    timezone: "UTC",
  }).returning();
  const actor = {
    userId: user.id,
    householdId: household.id,
    role: "owner" as const,
    source: "test-database" as const,
  };
  const asOf = new Date().toISOString().slice(0, 10);
  const month = asOf.slice(0, 7);
  const monthDate = `${month}-01`;

  try {
    await getBudget(actor);

    const [housing] = await db.select().from(financeCategories).where(eq(financeCategories.householdId, household.id))
      .then((rows) => rows.filter((row) => row.name === "Housing"));
    assert.ok(housing);

    const [original] = await db.insert(budgetPlanningPeriods).values({
      householdId: household.id,
      month: monthDate,
      status: "approved",
      version: 2,
      createdBy: user.id,
      approvedBy: user.id,
      approvedAt: new Date(Date.now() - 86_400_000),
      createdAt: new Date(Date.now() - 86_400_000),
    }).returning();

    const [corrected] = await db.insert(budgetPlanningPeriods).values({
      householdId: household.id,
      month: monthDate,
      status: "approved",
      version: 2,
      supersedesPeriodId: original.id,
      copiedFromPeriodId: original.id,
      createdBy: user.id,
      approvedBy: user.id,
      approvedAt: new Date(),
      createdAt: new Date(),
    }).returning();

    await db.insert(budgetPlanningCategorySnapshots).values([
      {
        householdId: household.id,
        periodId: original.id,
        sourceCategoryId: housing.id,
        name: "Housing",
        categoryType: "fixed_expense",
        essentialStatus: "essential",
        monthlyTarget: "100.00",
        allocationBasisPoints: 10000,
        warningThreshold: "1.00",
        sortOrder: 0,
        createdBy: user.id,
        updatedBy: user.id,
      },
      {
        householdId: household.id,
        periodId: corrected.id,
        sourceCategoryId: housing.id,
        name: "Housing",
        categoryType: "fixed_expense",
        essentialStatus: "essential",
        monthlyTarget: "200.00",
        allocationBasisPoints: 10000,
        warningThreshold: "1.00",
        sortOrder: 0,
        createdBy: user.id,
        updatedBy: user.id,
      },
    ]);

    const comparison = await getBudgetPlanningComparison(actor, month);
    assert.equal(comparison.monthBudgeted, "200.00");
    assert.equal(comparison.approvedPeriodCount, 1);

    const officialBudget = await getBudget(actor);
    const housingBudget = officialBudget.categories.find((category) => category.name === "Housing");
    assert.ok(housingBudget);
    assert.equal(housingBudget.budgeted, "200.00");

    const intelligence = await getVariableBudgetIntelligence(actor, asOf);
    assert.equal(intelligence.constraints.mandatoryObligations, "200.00");

    await assert.rejects(
      () => createSupersedingBudgetPlanningPeriod(actor, original.id, `stale-${randomUUID()}`),
      (error: unknown) => error instanceof Error && "code" in error && error.code === "CONFLICT",
    );
  } finally {
    await db.delete(households).where(eq(households.id, household.id));
    await db.delete(users).where(eq(users.id, user.id));
  }
});
