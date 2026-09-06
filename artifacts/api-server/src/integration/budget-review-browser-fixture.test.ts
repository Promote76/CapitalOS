import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { db, householdMembers, households, users } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getWeeklyBudgetGuidance, reviewFinancialTransaction } from "../services/household-finance.ts";
import { cleanupBudgetReviewBrowserFixture, setupBudgetReviewBrowserFixture } from "./budget-review-browser-fixture.ts";

const enabled = process.env.CAPITAL_OS_RUN_INTEGRATION === "1";

test("browser fixture exposes every weekly-guidance recovery reason and refreshes after review", { skip: !enabled }, async () => {
  const runId = randomUUID();
  const email = `fixture+brb-${runId.slice(0, 8)}@capitalos.test`;
  const externalAuthId = `fixture-${runId}`;
  const [user] = await db.insert(users).values({ email, externalAuthId, displayName: "Budget review fixture", status: "active" }).returning({ id: users.id });
  const [household] = await db.insert(households).values({ name: `Budget review fixture ${runId}`, timezone: "America/Chicago" }).returning({ id: households.id });
  await db.insert(householdMembers).values({
    householdId: household.id,
    userId: user.id,
    role: "owner",
    permissions: ["read", "contribute", "transfer", "allocate", "approve", "manage_risk"],
    active: true,
  });
  const actor = {
    userId: user.id,
    householdId: household.id,
    role: "owner" as const,
    permissions: ["read", "contribute", "transfer", "allocate", "approve", "manage_risk"],
    source: "test-database" as const,
  };

  let tenantRemoved = false;
  try {
    const fixture = await setupBudgetReviewBrowserFixture(externalAuthId, runId, "2000-01");
    const before = await getWeeklyBudgetGuidance(actor, fixture.periodId);
    assert.deepEqual(before.exclusions, {
      pending: 1,
      unreviewed: 1,
      nonHousehold: 1,
      excluded: 1,
      transfer: 1,
      uncategorized: 1,
      nonIncome: 1,
    });
    assert.equal(before.includedOutflowCount, 1);

    await reviewFinancialTransaction(actor, fixture.transactionIds.uncategorized, {
      status: "approved",
      categoryId: fixture.categoryId,
    });
    const after = await getWeeklyBudgetGuidance(actor, fixture.periodId);
    assert.equal(after.exclusions.uncategorized, 0);
    assert.equal(after.includedOutflowCount, 2);
    assert.notEqual(after.fingerprint, before.fingerprint);
  } finally {
    const cleanup = await cleanupBudgetReviewBrowserFixture(runId, {
      tenantOwner: { externalAuthId, email, householdId: household.id },
    });
    tenantRemoved = cleanup.tenantPurged === true;
  }
  assert.equal(tenantRemoved, true);
  assert.equal((await db.select({ id: users.id }).from(users).where(eq(users.externalAuthId, externalAuthId))).length, 0);
  assert.equal((await db.select({ id: households.id }).from(households).where(eq(households.id, household.id))).length, 0);
});