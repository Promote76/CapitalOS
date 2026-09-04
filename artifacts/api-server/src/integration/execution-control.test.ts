import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  auditEvents,
  db,
  executionControls,
  householdMembers,
  households,
  idempotencyKeys,
  users,
} from "@workspace/db";
import type { Actor } from "../services/capital-os";
import {
  getExecutionControl,
  recoverExecutionControl,
  requestExecutionSafeMode,
  requestExecutionStop,
} from "../services/execution-control";
import { GovernanceError } from "../domain/governance";

const enabled = process.env.CAPITAL_OS_RUN_INTEGRATION === "1";

test("execution control persists, isolates households, audits denials, and serializes STOP", { skip: !enabled }, async () => {
  const [userA] = await db.insert(users).values({
    email: `execution-control-a-${randomUUID()}@capitalos.test`,
    displayName: "Execution Control A",
    status: "active",
  }).returning({ id: users.id });
  const [userB] = await db.insert(users).values({
    email: `execution-control-b-${randomUUID()}@capitalos.test`,
    displayName: "Execution Control B",
    status: "active",
  }).returning({ id: users.id });
  const [householdA] = await db.insert(households).values({ name: `Execution A ${randomUUID()}` }).returning({ id: households.id });
  const [householdB] = await db.insert(households).values({ name: `Execution B ${randomUUID()}` }).returning({ id: households.id });
  await db.insert(householdMembers).values([
    { householdId: householdA.id, userId: userA.id, role: "owner", permissions: ["read", "manage_risk", "approve"], active: true },
    { householdId: householdB.id, userId: userB.id, role: "owner", permissions: ["read", "manage_risk", "approve"], active: true },
  ]);
  const actorA: Actor = { role: "owner", userId: userA.id, householdId: householdA.id, permissions: ["read", "manage_risk", "approve"], source: "test-database" };
  const actorB: Actor = { role: "owner", userId: userB.id, householdId: householdB.id, permissions: ["read", "manage_risk", "approve"], source: "test-database" };

  try {
    const initialA = await getExecutionControl(actorA);
    const initialB = await getExecutionControl(actorB);
    assert.equal(initialA.state, "DISABLED");
    assert.equal(initialB.state, "DISABLED");
    assert.notEqual(initialA.id, initialB.id);
    assert.equal(initialA.householdId, householdA.id);
    assert.equal(initialB.householdId, householdB.id);

    const first = await requestExecutionStop(actorA, {
      reason: "Certification stop",
      correlationId: "ec-certification",
      idempotencyKey: "ec-stop-key-0001",
    });
    assert.equal(first.state, "STOP");
    assert.equal(first.version, 2);
    const replay = await requestExecutionStop(actorA, {
      reason: "Certification stop replay",
      correlationId: "ec-certification-replay",
      idempotencyKey: "ec-stop-key-0001",
    });
    assert.equal(replay.state, "STOP");
    assert.equal(replay.idempotent, true);
    assert.equal(replay.version, first.version);
    assert.equal((await getExecutionControl(actorB)).state, "DISABLED");

    await assert.rejects(
      () => requestExecutionSafeMode(actorA, { reason: "Invalid recovery path", idempotencyKey: "ec-invalid-key-0001" }),
      (error: unknown) => error instanceof GovernanceError && error.code === "INVALID_STATE",
    );

    const concurrent = await Promise.all([
      requestExecutionStop(actorA, { reason: "Concurrent stop one", idempotencyKey: "ec-stop-key-0002" }),
      requestExecutionStop(actorA, { reason: "Concurrent stop two", idempotencyKey: "ec-stop-key-0003" }),
    ]);
    assert.ok(concurrent.every((result) => result.state === "STOP"));
    assert.equal((await getExecutionControl(actorA)).version, first.version);

    const recovered = await recoverExecutionControl(actorA, {
      reason: "Owner recovery for certification",
      correlationId: "ec-recovery",
      idempotencyKey: "ec-recover-key-0001",
    });
    assert.equal(recovered.state, "DISABLED");
    assert.equal(recovered.executionPermitted, false);

    const [audit] = await db.select({ count: sql<number>`count(*)` }).from(auditEvents).where(and(
      eq(auditEvents.householdId, householdA.id),
      eq(auditEvents.eventType, "execution_control_transition_attempt"),
    ));
    assert.ok(Number(audit?.count ?? 0) >= 5);
    const [stored] = await db.select().from(executionControls).where(eq(executionControls.householdId, householdA.id)).limit(1);
    assert.equal(stored?.state, "DISABLED");
  } finally {
    await db.delete(auditEvents).where(inArray(auditEvents.householdId, [householdA.id, householdB.id]));
    await db.delete(idempotencyKeys).where(inArray(idempotencyKeys.householdId, [householdA.id, householdB.id]));
    await db.delete(households).where(inArray(households.id, [householdA.id, householdB.id]));
    await db.delete(users).where(inArray(users.id, [userA.id, userB.id]));
  }
});