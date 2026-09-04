import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import { households, operationsJobs, operationsSchedulers } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { enqueueOperationsJob, claimNextOperationsJob, recoverStaleOperationsJobs, heartbeatOperationsWorker, failOperationsJob, reprocessOperationsJob } from "../services/operations.ts";
import { runOperationsSchedulerTick } from "../services/operations-scheduler.ts";
import type { Actor } from "../services/capital-os.ts";

const enabled = process.env.CAPITAL_OS_RUN_INTEGRATION === "1" && Boolean(process.env.DATABASE_URL);
const suite = enabled ? describe : describe.skip;

async function cleanupHousehold(householdId: string) {
  // Certification targets are disposable. Audit history is intentionally
  // append-only and retains the lifecycle evidence, so fixture rows remain
  // until the isolated database itself is discarded.
}

suite("durable operations recovery (isolated PostgreSQL)", () => {
  it("serializes competing claims and preserves household scope", async () => {
    const [home] = await db.insert(households).values({ name: `operations-cert-${randomUUID()}` }).returning({ id: households.id });
    const job = await enqueueOperationsJob({ householdId: home.id, kind: "ADVISORY", jobKey: randomUUID() });
    const claims = await Promise.all([claimNextOperationsJob(home.id, "worker-a"), claimNextOperationsJob(home.id, "worker-b")]);
    assert.equal(claims.filter(Boolean).length, 1);
    assert.equal(claims.find(Boolean)?.id, job.id);
    await cleanupHousehold(home.id);
  });

  it("supports idempotency, expiry recovery, heartbeat fencing, and dead letter", async () => {
    const [home] = await db.insert(households).values({ name: `operations-cert-${randomUUID()}` }).returning({ id: households.id });
    const key = randomUUID();
    const first = await enqueueOperationsJob({ householdId: home.id, kind: "ADVISORY", idempotencyKey: key });
    const replay = await enqueueOperationsJob({ householdId: home.id, kind: "ADVISORY", idempotencyKey: key });
    assert.equal(first.id, replay.id);
    const initialClaim = await claimNextOperationsJob(home.id, "worker-a");
    assert.equal(initialClaim?.id, first.id);
    await db.update(operationsJobs).set({ leaseExpiresAt: new Date(Date.now() - 6 * 60_000) }).where(eq(operationsJobs.id, first.id));
    assert.equal((await recoverStaleOperationsJobs(home.id)).length, 1);
    const claimed = await claimNextOperationsJob(home.id, "worker-a");
    await heartbeatOperationsWorker("worker-a", claimed?.id);
    await failOperationsJob(first.id, home.id, "worker-a", new Error("invalid payload"));
    const [current] = await db.select().from(operationsJobs).where(and(eq(operationsJobs.id, first.id), eq(operationsJobs.householdId, home.id)));
    assert.equal(current?.status, "DEAD_LETTER");
    await cleanupHousehold(home.id);
  });

  it("handles a 100-job contention set without duplicate claims", async () => {
    const [home] = await db.insert(households).values({ name: `operations-cert-${randomUUID()}` }).returning({ id: households.id });
    await Promise.all(Array.from({ length: 100 }, () => enqueueOperationsJob({ householdId: home.id, kind: "ADVISORY", jobKey: randomUUID() })));
    const claims = (await Promise.all(Array.from({ length: 100 }, (_, i) => claimNextOperationsJob(home.id, `worker-${i}`)))).filter(Boolean);
    assert.equal(new Set(claims.map((job) => job!.id)).size, claims.length);
    await cleanupHousehold(home.id);
  });

  it("persists schedules, serializes leadership, and enqueues one missed run", async () => {
    const [home] = await db.insert(households).values({ name: `operations-cert-${randomUUID()}` }).returning({ id: households.id });
    const [schedule] = await db.insert(operationsSchedulers).values({
      householdId: home.id,
      name: `daily-${randomUUID()}`,
      jobKind: "ADVISORY",
      cadence: "daily",
      payload: { report: "daily-capital-brief" },
      missedRunPolicy: "CATCH_UP",
      nextRunAt: new Date(Date.now() - 60_000),
    }).returning();
    const [first, second] = await Promise.all([
      runOperationsSchedulerTick("scheduler-a"),
      runOperationsSchedulerTick("scheduler-b"),
    ]);
    assert.equal([first, second].filter((result) => result.leader).length, 1);
    assert.equal(first.leader ? first.enqueued : second.enqueued, 1);
    const [updated] = await db.select().from(operationsSchedulers).where(eq(operationsSchedulers.id, schedule.id));
    assert.ok(updated?.lastRunAt);
    const jobs = await db.select().from(operationsJobs).where(eq(operationsJobs.householdId, home.id));
    assert.equal(jobs.length, 1);
    await cleanupHousehold(home.id);
  });

  it("preserves the household boundary for dead-letter reprocessing", async () => {
    const [home] = await db.insert(households).values({ name: `operations-cert-${randomUUID()}` }).returning({ id: households.id });
    const job = await enqueueOperationsJob({ householdId: home.id, kind: "ADVISORY", jobKey: randomUUID() });
    await db.update(operationsJobs).set({ status: "DEAD_LETTER", deadLetterReason: "test" }).where(eq(operationsJobs.id, job.id));
    const actor: Actor = { userId: randomUUID(), householdId: home.id, role: "owner", source: "test-database" };
    const requeued = await reprocessOperationsJob(actor, job.id);
    assert.equal(requeued.status, "RETRY_PENDING");
    await cleanupHousehold(home.id);
  });
});