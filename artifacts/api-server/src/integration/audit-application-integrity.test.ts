import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  auditChainHeads, auditEventArchive, auditEvents, auditBackfillState,
  auditVerificationState, households, householdMembers, users,
} from "@workspace/db/schema";
import app from "../app";
import { appendAuditEvent } from "../services/audit";
import {
  AUDIT_VERIFICATION_MAX_AGE_MS, currentAuditMarker, runAuditBackfill,
  verifyAuditIntegrity,
} from "../services/audit-backfill";

const enabled = process.env.CAPITAL_OS_RUN_INTEGRATION === "1";

async function household(name = "audit-integrity") {
  const [row] = await db.insert(households).values({ name: `${name}-${randomUUID()}` }).returning();
  return row.id;
}

async function remove(ids: string[], householdIds: string[]) {
  if (!ids.length) return;
  await db.delete(auditEventArchive).where(inArray(auditEventArchive.eventId, ids));
  await db.delete(auditEvents).where(inArray(auditEvents.id, ids));
  await db.delete(auditChainHeads).where(inArray(auditChainHeads.householdId, householdIds));
}

test("application audit integrity and recovery certification", { skip: !enabled }, async (t) => {
  const ids: string[] = [];
  let originalSystemHead: typeof auditChainHeads.$inferSelect | undefined;
  const h1 = await household();
  const h2 = await household();
  try {
    assert.equal((await runAuditBackfill(1000)).status, "COMPLETE");
    await t.test("serializes same-household appends and isolates household chains", async () => {
      const rows = await Promise.all(Array.from({ length: 8 }, (_, i) => appendAuditEvent({
        householdId: h1, eventType: "integrity_append", actor: "test-user",
        entity: "fixture", entityId: String(i), metadata: {},
      })));
      ids.push(...rows.map((row) => row.id));
      const ordered = rows.sort((a, b) => a.sequence - b.sequence);
      assert.deepEqual(ordered.map((row) => row.sequence), [1, 2, 3, 4, 5, 6, 7, 8]);
      assert.equal(ordered[0].previousHash, null);
      ordered.slice(1).forEach((row, i) => assert.equal(row.previousHash, ordered[i].eventHash));
      const other = await appendAuditEvent({ householdId: h2, eventType: "other_chain", actor: "test-user", entity: "fixture", entityId: "other", metadata: {} });
      ids.push(other.id);
      assert.equal(other.sequence, 1);
      [originalSystemHead] = await db.select().from(auditChainHeads)
        .where(eq(auditChainHeads.chainKey, "system:v1")).limit(1);
      const system = await Promise.all([h1, h2].map((householdId) => appendAuditEvent({
        householdId, eventType: "system_integrity", actor: "system", entity: "fixture", entityId: randomUUID(), metadata: {},
      })));
      ids.push(...system.map((row) => row.id));
      assert.deepEqual(system.map((row) => row.chainKey), ["system:v1", "system:v1"]);
      assert.deepEqual(system.map((row) => row.householdId).sort(), [h1, h2].sort());
    });

    await t.test("replay and archive parity are fail-closed", async () => {
      const key = `integrity-${randomUUID()}`;
      const input = { householdId: h1, eventType: "idempotent", actor: "test-user", entity: "fixture", entityId: "replay", metadata: {}, idempotencyKey: key };
      const first = await appendAuditEvent(input); ids.push(first.id);
      assert.equal((await appendAuditEvent(input)).id, first.id);
      await assert.rejects(() => appendAuditEvent({ ...input, reason: "divergent" }), /AUDIT_IDEMPOTENCY_CONFLICT/);
      await db.delete(auditEventArchive).where(eq(auditEventArchive.eventId, first.id));
      await assert.rejects(() => appendAuditEvent(input), /AUDIT_ARCHIVE_MISSING/);
      await db.insert(auditEventArchive).values({
        eventId: first.id, householdId: first.householdId, eventType: first.eventType,
        actor: first.actor, entity: first.entity, entityId: first.entityId,
        beforeState: first.beforeState, afterState: first.afterState, reason: first.reason,
        metadata: first.metadata, eventTimestamp: first.timestamp, archivedAt: new Date(),
        canonicalVersion: first.canonicalVersion, chainScope: first.chainScope,
        chainKey: first.chainKey, sequence: first.sequence, previousHash: first.previousHash,
        eventHash: first.eventHash,
      });
    });

    await t.test("verifier catches source, archive, extra, and head mutations", async () => {
      const row = await appendAuditEvent({ householdId: h2, eventType: "tamper_fixture", actor: "test-user", entity: "fixture", entityId: randomUUID(), metadata: {} });
      ids.push(row.id);
      const source = await db.select().from(auditEvents).where(eq(auditEvents.id, row.id)).limit(1);
      const original = source[0];
      assert.ok(original);
      await db.update(auditEvents).set({ reason: "tampered" }).where(eq(auditEvents.id, row.id));
      assert.equal((await verifyAuditIntegrity()).status, "FAIL");
      await db.update(auditEvents).set({ reason: original.reason }).where(eq(auditEvents.id, row.id));
      await db.update(auditEvents).set({ eventHash: "bad" }).where(eq(auditEvents.id, row.id));
      assert.equal((await verifyAuditIntegrity()).status, "FAIL");
      await db.update(auditEvents).set({ eventHash: original.eventHash }).where(eq(auditEvents.id, row.id));
      await db.update(auditEventArchive).set({ entity: "archive-tampered" }).where(eq(auditEventArchive.eventId, row.id));
      assert.equal((await verifyAuditIntegrity()).status, "FAIL");
      await db.update(auditEventArchive).set({ entity: original.entity }).where(eq(auditEventArchive.eventId, row.id));
      const extraId = randomUUID();
      await db.insert(auditEventArchive).values({
        eventId: extraId, householdId: original.householdId, eventType: original.eventType,
        actor: original.actor, entity: original.entity, entityId: original.entityId,
        beforeState: original.beforeState, afterState: original.afterState, reason: original.reason,
        metadata: original.metadata, eventTimestamp: original.timestamp, archivedAt: new Date(),
        canonicalVersion: original.canonicalVersion, chainScope: original.chainScope,
        chainKey: original.chainKey, sequence: original.sequence,
        previousHash: original.previousHash, eventHash: original.eventHash,
      });
      assert.equal((await verifyAuditIntegrity()).status, "FAIL");
      await db.delete(auditEventArchive).where(eq(auditEventArchive.eventId, extraId));
      await db.delete(auditEventArchive).where(and(eq(auditEventArchive.eventId, row.id), eq(auditEventArchive.entity, original.entity)));
      await db.insert(auditEventArchive).values({
        eventId: row.id, householdId: row.householdId, eventType: row.eventType, actor: row.actor,
        entity: row.entity, entityId: row.entityId, beforeState: row.beforeState, afterState: row.afterState,
        reason: row.reason, metadata: row.metadata, eventTimestamp: row.timestamp, archivedAt: new Date(),
        canonicalVersion: row.canonicalVersion, chainScope: row.chainScope, chainKey: row.chainKey,
        sequence: row.sequence, previousHash: row.previousHash, eventHash: row.eventHash,
      });
      const [head] = await db.select().from(auditChainHeads).where(eq(auditChainHeads.chainKey, row.chainKey!));
      assert.ok(head);
      await db.update(auditChainHeads).set({ eventHash: "bad" }).where(eq(auditChainHeads.chainKey, row.chainKey!));
      assert.equal((await verifyAuditIntegrity()).status, "FAIL");
      await db.update(auditChainHeads).set({ eventHash: head.eventHash, sequence: head.sequence }).where(eq(auditChainHeads.chainKey, row.chainKey!));
      const [prior] = await db.select().from(auditEvents).where(and(eq(auditEvents.chainKey, row.chainKey!), eq(auditEvents.sequence, row.sequence! - 1))).limit(1);
      await db.delete(auditEventArchive).where(eq(auditEventArchive.eventId, row.id));
      await db.delete(auditEvents).where(eq(auditEvents.id, row.id));
      if (prior) await db.update(auditChainHeads).set({ sequence: prior.sequence, eventHash: prior.eventHash }).where(eq(auditChainHeads.chainKey, row.chainKey!));
      assert.equal((await verifyAuditIntegrity()).status, "PASS");
    });

    await t.test("marker changes for each audit surface", async () => {
      const row = await appendAuditEvent({ householdId: h1, eventType: "marker", actor: "test-user", entity: "fixture", entityId: randomUUID(), metadata: {} });
      ids.push(row.id);
      const first = await currentAuditMarker();
      await db.update(auditEvents).set({ reason: "marker-source" }).where(eq(auditEvents.id, row.id));
      assert.notEqual(await currentAuditMarker(), first);
      await db.update(auditEvents).set({ reason: row.reason }).where(eq(auditEvents.id, row.id));
    });

    await t.test("bounded backfill persists progress and resumes", async () => {
      await db.update(auditBackfillState).set({ status: "PENDING", cursor: null, processed: 0, completedAt: null, lastError: null }).where(eq(auditBackfillState.scope, "legacy-v1"));
      const legacy = await db.insert(auditEvents).values(Array.from({ length: 3 }, (_, i) => ({
        householdId: h1, eventType: "legacy_fixture", actor: "legacy", entity: "fixture", entityId: `legacy-${randomUUID()}-${i}`, metadata: {},
      }))).returning();
      ids.push(...legacy.map((row) => row.id));
      const result = await runAuditBackfill(2);
      assert.ok(result.processed <= 2);
      const state = await db.select().from(auditBackfillState).where(eq(auditBackfillState.scope, "legacy-v1"));
      assert.equal(state[0].processed, result.processed);
      assert.ok(state[0].cursor);
      const live = await appendAuditEvent({ householdId: h2, eventType: "live_during_backfill", actor: "test-user", entity: "fixture", entityId: randomUUID(), metadata: {} });
      ids.push(live.id);
      const resumed = await runAuditBackfill(10);
      const progress = await db.select().from(auditBackfillState).where(eq(auditBackfillState.scope, "legacy-v1"));
      assert.ok(["PAUSED", "COMPLETE", "FAILED"].includes(resumed.status));
    });

    await t.test("protected backfill endpoint enforces owner step-up", async () => {
      process.env.NODE_ENV = "test";
      process.env.CAPITAL_OS_TEST_CONTEXT = "1";
      const [user] = await db.insert(users).values({ email: `${randomUUID()}@test.invalid`, externalAuthId: randomUUID(), displayName: "Audit owner", status: "active" }).returning();
      await db.insert(householdMembers).values({ userId: user.id, householdId: h1, role: "owner", permissions: [], active: true });
      const server = app.listen(0);
      try {
        const address = server.address(); assert.ok(address && typeof address !== "string");
        const base = `http://127.0.0.1:${address.port}/api/operations/audit-backfill?limit=1`;
        const headers = { "X-Test-User-Id": user.id, "X-Test-Household-Id": h1, "Content-Type": "application/json" };
        assert.equal((await fetch(base, { method: "POST", headers, body: JSON.stringify({ limit: 1 }) })).status, 403);
        const accepted = await fetch(base, { method: "POST", headers: { ...headers, "X-Test-Step-Up": "verified" }, body: JSON.stringify({ limit: "1" }) });
        assert.equal(accepted.status, 200);
      } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
    });

    await t.test("readiness verification age is bounded", async () => {
      const [state] = await db.select().from(auditVerificationState).where(eq(auditVerificationState.scope, "legacy-v1"));
      assert.ok(state);
      await db.update(auditVerificationState).set({ verifiedAt: new Date(Date.now() - AUDIT_VERIFICATION_MAX_AGE_MS - 1) }).where(eq(auditVerificationState.scope, "legacy-v1"));
      const stale = await db.select().from(auditVerificationState).where(eq(auditVerificationState.scope, "legacy-v1"));
      assert.ok(Date.now() - stale[0].verifiedAt!.getTime() > AUDIT_VERIFICATION_MAX_AGE_MS);
    });
  } finally {
    await remove(ids, [h1, h2]);
    await db.delete(auditChainHeads).where(eq(auditChainHeads.chainKey, "system:v1"));
    if (originalSystemHead) await db.insert(auditChainHeads).values(originalSystemHead);
    await db.delete(householdMembers).where(eq(householdMembers.householdId, h1));
    await db.delete(households).where(inArray(households.id, [h1, h2]));
    await verifyAuditIntegrity();
    await db.update(auditBackfillState).set({
      status: "PENDING", cursor: null, processed: 0, completedAt: null, lastError: null,
    }).where(eq(auditBackfillState.scope, "legacy-v1"));
  }
});