import { randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import { auditEvents, operationsSchedulerLeases, operationsSchedulers } from "@workspace/db/schema";
import { and, eq, lte, sql } from "drizzle-orm";
import { enqueueOperationsJob } from "./operations";

function nextRunAt(from: Date, cadence: string) {
  const next = new Date(from);
  if (cadence.toLowerCase() === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  else if (cadence.toLowerCase() === "monthly") next.setUTCMonth(next.getUTCMonth() + 1);
  else next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

export async function runOperationsSchedulerTick(ownerId: string) {
  const now = new Date();
  const expiry = new Date(now.getTime() + 30_000);
  const leader = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('operations-scheduler-leadership'))`);
    const [current] = await tx.select().from(operationsSchedulerLeases).where(eq(operationsSchedulerLeases.singleton, "operations")).limit(1);
    if (current && current.leaseExpiresAt > now && current.ownerId !== ownerId) return false;
    await (current
      ? tx.update(operationsSchedulerLeases).set({ ownerId, leaseExpiresAt: expiry, heartbeatAt: now }).where(eq(operationsSchedulerLeases.singleton, "operations"))
      : tx.insert(operationsSchedulerLeases).values({ ownerId, leaseExpiresAt: expiry, heartbeatAt: now }));
    return true;
  });
  if (!leader) return { leader: false, enqueued: 0 };

  const due = await db.select().from(operationsSchedulers).where(and(
    eq(operationsSchedulers.enabled, true),
    lte(operationsSchedulers.nextRunAt, now),
  ));
  let enqueued = 0;
  for (const schedule of due) {
    if (!["SAFE_AUTOMATION", "ADVISORY", "RECONCILIATION"].includes(schedule.jobKind)) {
      await db.update(operationsSchedulers).set({
        lastRunAt: schedule.nextRunAt,
        nextRunAt: nextRunAt(schedule.nextRunAt, schedule.cadence),
        updatedAt: now,
      }).where(eq(operationsSchedulers.id, schedule.id));
      await db.insert(auditEvents).values({
        householdId: schedule.householdId,
        eventType: "operations_schedule_missed_skipped",
        actor: ownerId,
        entity: "operations_scheduler",
        entityId: schedule.id,
        reason: `Unsupported scheduled job kind ${schedule.jobKind}`,
        metadata: { ownerId, nextRunAt: schedule.nextRunAt.toISOString(), policy: schedule.missedRunPolicy },
      });
      continue;
    }
    if (schedule.missedRunPolicy === "CATCH_UP" || schedule.nextRunAt >= new Date(now.getTime() - 86_400_000)) {
      await enqueueOperationsJob({
        householdId: schedule.householdId,
        kind: schedule.jobKind,
        payload: schedule.payload,
        jobKey: `schedule:${schedule.id}:${schedule.nextRunAt.toISOString()}`,
        idempotencyKey: `schedule:${schedule.id}:${schedule.nextRunAt.toISOString()}`,
        correlationId: `schedule:${schedule.id}`,
      });
      enqueued += 1;
      await db.insert(auditEvents).values({
        householdId: schedule.householdId,
        eventType: "operations_schedule_missed_recovered",
        actor: ownerId,
        entity: "operations_scheduler",
        entityId: schedule.id,
        reason: "Persistent scheduler recovered a due run",
        metadata: { ownerId, nextRunAt: schedule.nextRunAt.toISOString(), policy: schedule.missedRunPolicy },
      });
    }
    await db.update(operationsSchedulers).set({
      lastRunAt: schedule.nextRunAt,
      nextRunAt: nextRunAt(schedule.nextRunAt, schedule.cadence),
      updatedAt: now,
    }).where(eq(operationsSchedulers.id, schedule.id));
  }
  return { leader: true, enqueued };
}

export function startOperationsScheduler() {
  if (process.env.OPERATIONS_SCHEDULER_ENABLED !== "1") return () => undefined;
  const ownerId = `api-scheduler:${randomUUID()}`;
  let stopping = false;
  const tick = () => {
    if (stopping) return;
    void runOperationsSchedulerTick(ownerId).catch(() => undefined);
  };
  const timer = setInterval(tick, 5_000);
  tick();
  return () => {
    stopping = true;
    clearInterval(timer);
  };
}