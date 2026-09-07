import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { and, eq } from "drizzle-orm";
import {
  db,
  householdMembers,
  households,
  users,
} from "@workspace/db";
import {
  getFamilyOfficeSnapshot,
} from "../services/family-office.ts";
import {
  getOperationsOverview,
  listOperationsTasks,
} from "../services/operations.ts";
import {
  cleanupDailyOpsBrowserFixture,
  setupDailyOpsBrowserFixture,
} from "./daily-ops-browser-fixture.ts";

const enabled = process.env.CAPITAL_OS_RUN_INTEGRATION === "1";
const permissions = ["read", "contribute", "transfer", "allocate", "approve", "manage_risk"];

test("Daily Ops service reads fail closed on provider failure and stay household isolated", { skip: !enabled }, async () => {
  const runId = randomUUID();
  const identities = await Promise.all(["a", "b"].map(async (suffix) => {
    const externalAuthId = `daily-ops-${runId}-${suffix}`;
    const email = `${externalAuthId}@capitalos.test`;
    const [user] = await db.insert(users).values({
      email,
      externalAuthId,
      displayName: `Daily Ops ${suffix}`,
      status: "active",
    }).returning({ id: users.id });
    const [household] = await db.insert(households).values({
      name: `Daily Ops certification ${runId} ${suffix}`,
      timezone: "America/Chicago",
    }).returning({ id: households.id });
    await db.insert(householdMembers).values({
      householdId: household.id,
      userId: user.id,
      role: "owner",
      permissions,
      active: true,
    });
    return { externalAuthId, userId: user.id, householdId: household.id };
  }));

  const actor = (identity: typeof identities[number]) => ({
    userId: identity.userId,
    householdId: identity.householdId,
    role: "owner" as const,
    permissions,
    source: "test-database" as const,
  });

  try {
    const [fixtureA, fixtureB] = await Promise.all(
      identities.map((identity) => setupDailyOpsBrowserFixture(identity.externalAuthId, runId)),
    );
    const [snapshotA, operationsA, tasksA] = await Promise.all([
      getFamilyOfficeSnapshot(actor(identities[0])),
      getOperationsOverview(actor(identities[0])),
      listOperationsTasks(actor(identities[0])),
    ]);

    assert.equal(snapshotA.provider.state, "unavailable");
    assert.equal(snapshotA.provider.lastResult, "failed");
    assert.equal(snapshotA.provider.lastErrorCode, "AI_PROVIDER_UPSTREAM_ERROR");
    assert.equal(snapshotA.proposals.length, 0);
    assert.ok(tasksA.some((task) => task.id === fixtureA.taskId));
    assert.ok(operationsA.tasks.some((task) => task.id === fixtureA.taskId));
    assert.ok(fixtureB.taskId);
    assert.ok(tasksA.every((task) => task.id !== fixtureB.taskId));
    assert.ok(operationsA.tasks.every((task) => task.id !== fixtureB.taskId));
    assert.ok(snapshotA.runs.every((run) => run.id !== fixtureB.providerRunId));
  } finally {
    await cleanupDailyOpsBrowserFixture(runId);
    for (const identity of identities) {
      await db.transaction(async (tx) => {
        await tx.delete(householdMembers).where(eq(householdMembers.householdId, identity.householdId));
        await tx.delete(households).where(eq(households.id, identity.householdId));
        await tx.delete(users).where(and(eq(users.id, identity.userId), eq(users.externalAuthId, identity.externalAuthId)));
      });
    }
  }
});