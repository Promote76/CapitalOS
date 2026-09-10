import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  observabilityAlertDestinations,
  observabilityAlertRules,
  operationsSchedulerLeases,
  operationsWorkers,
} from "@workspace/db/schema";
import app from "../app";
import { ensureObservabilityDefaults } from "../services/observability-alerts";
import { startOperationsScheduler } from "../services/operations-scheduler";
import { startOperationsWorker } from "../services/operations-worker";

const waitFor = async (predicate: () => Promise<boolean>, timeoutMs = 5_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for RC1 runtime state.");
};

test("RC1 exact-release readiness certification", async (t) => {
  await t.test("archive migration backfilled the pre-trigger audit row", async () => {
    const result = await db.execute<{ count: number }>(sql`
      select count(*)::int as count
      from audit_events_archive
      where event_id = '00000000-0000-4000-8000-000000000053'
    `);
    assert.equal(result.rows[0]?.count, 1);
  });

  await t.test("archive trigger is enabled and synchronous", async () => {
    const result = await db.execute<{ enabled: boolean }>(sql`
      select exists (
        select 1 from pg_trigger
        where tgname = 'audit_events_archive_on_insert' and tgenabled <> 'D'
      ) as enabled
    `);
    assert.equal(result.rows[0]?.enabled, true);
    await db.execute(sql`
      insert into audit_events (
        id, household_id, event_type, actor, entity, entity_id, metadata
      ) values (
        '00000000-0000-4000-8000-000000000054',
        '00000000-0000-4000-8000-000000000053',
        'rc1_synchronous_archive',
        'rc1-certification',
        'release',
        'rc1',
        '{}'::jsonb
      )
    `);
    const archived = await db.execute<{ count: number }>(sql`
      select count(*)::int as count from audit_events_archive
      where event_id = '00000000-0000-4000-8000-000000000054'
    `);
    assert.equal(archived.rows[0]?.count, 1);
  });

  await t.test("audit source and archive are append-only", async () => {
    await assert.rejects(() =>
      db.execute(sql`update audit_events set reason = 'forbidden' where id = '00000000-0000-4000-8000-000000000054'`),
    );
    await assert.rejects(() =>
      db.execute(sql`delete from audit_events_archive where event_id = '00000000-0000-4000-8000-000000000054'`),
    );
    await assert.rejects(() =>
      db.execute(sql`
        insert into audit_events_archive (
          event_id, household_id, event_type, actor, entity, entity_id,
          metadata, event_timestamp
        ) values (
          'direct-insert-forbidden',
          '00000000-0000-4000-8000-000000000053',
          'forbidden',
          'rc1-certification',
          'release',
          'rc1',
          '{}'::jsonb,
          now()
        )
      `),
    );
  });

  await t.test("production runtime starts worker and scheduler but blocks readiness without an approved destination", async () => {
    const previous = {
      nodeEnv: process.env.NODE_ENV,
      worker: process.env.OPERATIONS_WORKER_ENABLED,
      scheduler: process.env.OPERATIONS_SCHEDULER_ENABLED,
      destination: process.env.CAPITAL_OS_ALERT_SLACK_CHANNEL_ID,
    };
    process.env.NODE_ENV = "production";
    process.env.OPERATIONS_WORKER_ENABLED = "1";
    process.env.OPERATIONS_SCHEDULER_ENABLED = "1";
    delete process.env.CAPITAL_OS_ALERT_SLACK_CHANNEL_ID;
    await db.delete(observabilityAlertDestinations);
    await ensureObservabilityDefaults();
    const stopWorker = startOperationsWorker();
    const stopScheduler = startOperationsScheduler();
    const server = app.listen(0);
    try {
      await waitFor(async () => {
        const [workers, leases] = await Promise.all([
          db.select().from(operationsWorkers),
          db.select().from(operationsSchedulerLeases),
        ]);
        return workers.length > 0 && leases.length > 0;
      });
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/health/ready`,
      );
      const body = (await response.json()) as {
        code?: string;
        dependencies?: Record<string, string>;
      };
      assert.equal(response.status, 503);
      assert.equal(body.code, "OBSERVABILITY_NOT_READY");
      assert.equal(body.dependencies?.operationsWorker, "enabled");
      assert.equal(body.dependencies?.operationsScheduler, "enabled");
      assert.equal(body.dependencies?.auditArchive, "ready");
      assert.equal(body.dependencies?.observabilityRules, "ready");
      assert.equal(body.dependencies?.observabilityDestination, "missing");
      const rules = await db.select().from(observabilityAlertRules);
      assert.ok(rules.length >= 13);
    } finally {
      stopWorker();
      stopScheduler();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      if (previous.nodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous.nodeEnv;
      if (previous.worker === undefined) delete process.env.OPERATIONS_WORKER_ENABLED;
      else process.env.OPERATIONS_WORKER_ENABLED = previous.worker;
      if (previous.scheduler === undefined) delete process.env.OPERATIONS_SCHEDULER_ENABLED;
      else process.env.OPERATIONS_SCHEDULER_ENABLED = previous.scheduler;
      if (previous.destination === undefined) delete process.env.CAPITAL_OS_ALERT_SLACK_CHANNEL_ID;
      else process.env.CAPITAL_OS_ALERT_SLACK_CHANNEL_ID = previous.destination;
    }
  });
});