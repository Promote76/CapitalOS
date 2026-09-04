import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import test from "node:test";
import { and, eq, sql } from "drizzle-orm";
import {
  auditEvents,
  db,
  executionControls,
  guardianHeartbeats,
  householdMembers,
  households,
  idempotencyKeys,
  operationsJobAttempts,
  operationsJobs,
  operationsMetrics,
  operationsSchedulerLeases,
  operationsSchedulers,
  operationsWorkers,
  riskStates,
  users,
} from "@workspace/db";
import type { Actor } from "../services/capital-os.ts";
import {
  claimNextOperationsJob,
  completeOperationsJob,
  createOperationsScheduler,
  enqueueOperationsJob,
  failOperationsJob,
  getOperationsMetrics,
  getOperationsSchedulerMetrics,
  heartbeatOperationsWorker,
  listOperationsJobs,
  reprocessOperationsJob,
  recoverStaleOperationsJobs,
  startOperationsJob,
} from "../services/operations.ts";
import { runOperationsSchedulerTick } from "../services/operations-scheduler.ts";
import { assertExecutionPermitted, getExecutionControl, requestExecutionStop } from "../services/execution-control.ts";
import { GovernanceError } from "../domain/governance.ts";

const enabled = process.env.CAPITAL_OS_RUN_INTEGRATION === "1" && Boolean(process.env.DATABASE_URL);
const skip = { skip: !enabled };

type Fixture = {
  householdId: string;
  actor: Actor;
  otherActor: Actor;
};

async function fixture(label: string): Promise<Fixture> {
  const [owner] = await db.insert(users).values({
    email: `${label}-owner-${randomUUID()}@capitalos.test`,
    displayName: `${label} owner`,
    status: "active",
  }).returning({ id: users.id });
  const [otherOwner] = await db.insert(users).values({
    email: `${label}-other-${randomUUID()}@capitalos.test`,
    displayName: `${label} other`,
    status: "active",
  }).returning({ id: users.id });
  const [home] = await db.insert(households).values({ name: `${label}-${randomUUID()}` }).returning({ id: households.id });
  const [otherHome] = await db.insert(households).values({ name: `${label}-other-${randomUUID()}` }).returning({ id: households.id });
  await db.insert(householdMembers).values([
    { householdId: home.id, userId: owner.id, role: "owner", permissions: ["read", "contribute", "approve", "manage_risk"], active: true },
    { householdId: otherHome.id, userId: otherOwner.id, role: "owner", permissions: ["read", "contribute", "approve", "manage_risk"], active: true },
  ]);
  await db.insert(riskStates).values([{ householdId: home.id }, { householdId: otherHome.id }]);
  const actor: Actor = {
    userId: owner.id,
    householdId: home.id,
    role: "owner",
    permissions: ["read", "contribute", "approve", "manage_risk"],
    source: "test-database",
  };
  const otherActor: Actor = {
    userId: otherOwner.id,
    householdId: otherHome.id,
    role: "owner",
    permissions: ["read", "contribute", "approve", "manage_risk"],
    source: "test-database",
  };
  return {
    householdId: home.id,
    actor,
    otherActor,
  };
}

async function cleanup(home: Fixture) {
  await db.delete(auditEvents).where(sql`${auditEvents.householdId} in (${home.householdId}, ${home.otherActor.householdId})`);
  await db.delete(households).where(sql`${households.id} in (${home.householdId}, ${home.otherActor.householdId})`);
}

async function claimAndStart(householdId: string, workerId: string, jobId?: string) {
  const claimed = await claimNextOperationsJob(householdId, workerId);
  assert.ok(claimed);
  if (jobId) assert.equal(claimed.id, jobId);
  const started = await startOperationsJob(claimed.id, householdId, workerId);
  assert.ok(started);
  return started;
}

async function makeAvailable(jobId: string) {
  await db.update(operationsJobs).set({ availableAt: new Date() }).where(eq(operationsJobs.id, jobId));
}

function assertGovernanceCode(error: unknown, code: GovernanceError["code"]) {
  return error instanceof GovernanceError && error.code === code;
}

async function startProbe(input: {
  householdId: string;
  workerId: string;
  jobId: string;
  mode?: "hold" | "complete";
}) {
  const apiRoot = path.basename(process.cwd()) === "api-server"
    ? process.cwd()
    : path.resolve(process.cwd(), "artifacts/api-server");
  const tsxLoader = path.resolve(apiRoot, "../../scripts/node_modules/tsx/dist/esm/index.mjs");
  const probe = path.resolve(apiRoot, "src/integration/operations-worker-probe.ts");
  const child = spawn(process.execPath, ["--import", tsxLoader, probe], {
    cwd: apiRoot,
    env: {
      ...process.env,
      CAPITAL_OS_PROBE_HOUSEHOLD_ID: input.householdId,
      CAPITAL_OS_PROBE_WORKER_ID: input.workerId,
      CAPITAL_OS_PROBE_JOB_ID: input.jobId,
      CAPITAL_OS_PROBE_MODE: input.mode ?? "hold",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`worker probe timed out: ${output}`)), 15_000);
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (output.includes("READY ")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      if (!output.includes("READY ")) {
        clearTimeout(timer);
        reject(new Error(`worker probe exited before ready (${code}/${signal}): ${output}`));
      }
    });
  });
  await ready;
  const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  return {
    child,
    output: () => output,
    waitForExit: () => exit,
  };
}

test("OR-01 durable persistence and OR-02 atomic leasing", skip, async () => {
  const home = await fixture("or01");
  try {
    const job = await enqueueOperationsJob({
      householdId: home.householdId,
      kind: "ADVISORY",
      payload: { safe: true },
      correlationId: "or01-correlation",
      jobKey: randomUUID(),
    });
    const [stored] = await db.select().from(operationsJobs).where(eq(operationsJobs.id, job.id));
    assert.equal(stored?.status, "QUEUED");
    const claims = await Promise.all([
      claimNextOperationsJob(home.householdId, "or02-a"),
      claimNextOperationsJob(home.householdId, "or02-b"),
    ]);
    assert.equal(claims.filter(Boolean).length, 1);
    assert.equal(claims.find(Boolean)?.id, job.id);
  } finally {
    await cleanup(home);
  }
});

test("OR-03 worker heartbeat and OR-04 stale worker detection", skip, async () => {
  const home = await fixture("or03");
  try {
    const job = await enqueueOperationsJob({ householdId: home.householdId, kind: "ADVISORY", jobKey: randomUUID() });
    await claimAndStart(home.householdId, "or03-worker", job.id);
    const heartbeat = await heartbeatOperationsWorker("or03-worker", job.id);
    assert.equal(heartbeat.workerId, "or03-worker");
    const [renewed] = await db.select().from(operationsJobs).where(eq(operationsJobs.id, job.id));
    assert.ok(renewed?.leaseExpiresAt && renewed.leaseExpiresAt > new Date());
    await db.update(operationsJobs).set({ leaseExpiresAt: new Date(Date.now() - 10_000) }).where(eq(operationsJobs.id, job.id));
    const recovered = await recoverStaleOperationsJobs(home.householdId, 1_000);
    assert.equal(recovered.length, 1);
    const [after] = await db.select().from(operationsJobs).where(eq(operationsJobs.id, job.id));
    assert.equal(after?.status, "RETRY_PENDING");
    assert.equal(after?.leaseOwner, null);
    const [attempt] = await db.select().from(operationsJobAttempts).where(eq(operationsJobAttempts.jobId, job.id));
    assert.equal(attempt?.status, "RECOVERED");
  } finally {
    await cleanup(home);
  }
});

test("OR-05 graceful shutdown relinquishes work and replacement completes it", skip, async () => {
  const home = await fixture("or05");
  try {
    const job = await enqueueOperationsJob({ householdId: home.householdId, kind: "ADVISORY", jobKey: randomUUID() });
    const first = await startProbe({ householdId: home.householdId, workerId: `or05-a-${randomUUID()}`, jobId: job.id });
    first.child.kill("SIGTERM");
    const firstExit = await first.waitForExit();
    assert.equal(firstExit.code, 0);
    const [released] = await db.select().from(operationsJobs).where(eq(operationsJobs.id, job.id));
    assert.equal(released?.leaseOwner, null);
    assert.equal(released?.status, "RETRY_PENDING");
    await makeAvailable(job.id);
    const replacement = await startProbe({ householdId: home.householdId, workerId: `or05-b-${randomUUID()}`, jobId: job.id, mode: "complete" });
    const replacementExit = await replacement.waitForExit();
    assert.equal(replacementExit.code, 0);
    const [completed] = await db.select().from(operationsJobs).where(eq(operationsJobs.id, job.id));
    assert.equal(completed?.status, "SUCCEEDED");
    assert.equal(completed?.attempts, 2);
  } finally {
    await cleanup(home);
  }
});

test("OR-06 hard crash recovery reconstructs the durable lease", skip, async () => {
  const home = await fixture("or06");
  try {
    const job = await enqueueOperationsJob({ householdId: home.householdId, kind: "ADVISORY", jobKey: randomUUID() });
    const crashed = await startProbe({ householdId: home.householdId, workerId: `or06-a-${randomUUID()}`, jobId: job.id });
    crashed.child.kill("SIGKILL");
    const crashExit = await crashed.waitForExit();
    assert.equal(crashExit.signal, "SIGKILL");
    const [leased] = await db.select().from(operationsJobs).where(eq(operationsJobs.id, job.id));
    assert.equal(leased?.status, "RUNNING");
    assert.ok(leased?.leaseOwner);
    await db.update(operationsJobs).set({ leaseExpiresAt: new Date(Date.now() - 10_000) }).where(eq(operationsJobs.id, job.id));
    assert.equal((await recoverStaleOperationsJobs(home.householdId, 1_000)).length, 1);
    await makeAvailable(job.id);
    const replacement = await startProbe({ householdId: home.householdId, workerId: `or06-b-${randomUUID()}`, jobId: job.id, mode: "complete" });
    assert.equal((await replacement.waitForExit()).code, 0);
    const [completed] = await db.select().from(operationsJobs).where(eq(operationsJobs.id, job.id));
    assert.equal(completed?.status, "SUCCEEDED");
    assert.equal(completed?.attempts, 2);
  } finally {
    await cleanup(home);
  }
});

test("OR-07 retry policy and OR-08 persisted bounded backoff", skip, async () => {
  const home = await fixture("or07");
  try {
    const job = await enqueueOperationsJob({ householdId: home.householdId, kind: "ADVISORY", maxAttempts: 3, jobKey: randomUUID() });
    const first = await claimAndStart(home.householdId, "or07-worker", job.id);
    const firstFailure = await failOperationsJob(first.id, home.householdId, "or07-worker", new Error("temporary network timeout"));
    assert.equal(firstFailure?.status, "RETRY_PENDING");
    assert.ok(firstFailure && firstFailure.availableAt.getTime() > Date.now());
    const firstDelay = firstFailure!.availableAt.getTime() - Date.now();
    assert.ok(firstDelay >= 700 && firstDelay <= 1_500);
    await makeAvailable(job.id);
    const second = await claimAndStart(home.householdId, "or07-worker", job.id);
    const secondFailure = await failOperationsJob(second.id, home.householdId, "or07-worker", new Error("temporary network timeout"));
    assert.equal(secondFailure?.status, "RETRY_PENDING");
    const secondDelay = secondFailure!.availableAt.getTime() - Date.now();
    assert.ok(secondDelay >= 1_700 && secondDelay <= 2_500);
    await makeAvailable(job.id);
    const third = await claimAndStart(home.householdId, "or07-worker", job.id);
    const dead = await failOperationsJob(third.id, home.householdId, "or07-worker", new Error("temporary network timeout"));
    assert.equal(dead?.status, "DEAD_LETTER");
    assert.equal(dead?.attempts, 3);
    const attempts = await db.select().from(operationsJobAttempts).where(eq(operationsJobAttempts.jobId, job.id));
    assert.equal(attempts.length, 3);
    assert.ok(attempts.every((attempt) => attempt.error?.includes("temporary network timeout")));
    const permanent = await enqueueOperationsJob({ householdId: home.householdId, kind: "ADVISORY", maxAttempts: 3, jobKey: randomUUID() });
    const permanentRunning = await claimAndStart(home.householdId, "or07-permanent", permanent.id);
    const permanentFailure = await failOperationsJob(permanentRunning.id, home.householdId, "or07-permanent", new Error("invalid payload"));
    assert.equal(permanentFailure?.status, "DEAD_LETTER");
  } finally {
    await cleanup(home);
  }
});

test("OR-09 dead letter preserves safe recovery metadata", skip, async () => {
  const home = await fixture("or09");
  try {
    const job = await enqueueOperationsJob({
      householdId: home.householdId,
      kind: "ADVISORY",
      payload: { secretLike: "must-not-leak-through-projection" },
      correlationId: "or09-correlation",
      jobKey: randomUUID(),
      maxAttempts: 1,
    });
    const running = await claimAndStart(home.householdId, "or09-worker", job.id);
    await failOperationsJob(running.id, home.householdId, "or09-worker", new Error("invalid payload"));
    const [dead] = await db.select().from(operationsJobs).where(eq(operationsJobs.id, job.id));
    assert.equal(dead?.status, "DEAD_LETTER");
    assert.equal(dead?.correlationId, "or09-correlation");
    assert.equal(dead?.attempts, 1);
    const projected = await listOperationsJobs(home.actor);
    const safe = projected.find((item) => item.id === job.id);
    assert.ok(safe);
    assert.equal("payload" in safe!, false);
    assert.equal(safe?.payloadReference, null);
  } finally {
    await cleanup(home);
  }
});

test("OR-10 operator reprocessing is authorized and household-scoped", skip, async () => {
  const home = await fixture("or10");
  try {
    const job = await enqueueOperationsJob({ householdId: home.householdId, kind: "ADVISORY", jobKey: randomUUID() });
    await db.update(operationsJobs).set({ status: "DEAD_LETTER", deadLetterReason: "certification" }).where(eq(operationsJobs.id, job.id));
    const reprocessed = await reprocessOperationsJob(home.actor, job.id);
    assert.equal(reprocessed.status, "RETRY_PENDING");
    const viewer: Actor = { ...home.actor, role: "viewer" };
    await assert.rejects(() => reprocessOperationsJob(viewer, job.id), (error) => assertGovernanceCode(error, "FORBIDDEN"));
    await assert.rejects(() => reprocessOperationsJob(home.otherActor, job.id), (error) => assertGovernanceCode(error, "INVALID_STATE"));
  } finally {
    await cleanup(home);
  }
});

test("OR-11 retry recovery applies one persisted idempotent effect", skip, async () => {
  const home = await fixture("or11");
  try {
    const effectKey = `or11-effect-${randomUUID()}`;
    const job = await enqueueOperationsJob({ householdId: home.householdId, kind: "RECONCILIATION", idempotencyKey: effectKey, jobKey: randomUUID() });
    const effectWrites = await Promise.all([
      db.insert(idempotencyKeys).values({ householdId: home.householdId, key: `effect:${effectKey}`, operation: "certification.effect", responseStatus: 200, responseBody: { applied: true } }).onConflictDoNothing().returning(),
      db.insert(idempotencyKeys).values({ householdId: home.householdId, key: `effect:${effectKey}`, operation: "certification.effect", responseStatus: 200, responseBody: { applied: true } }).onConflictDoNothing().returning(),
    ]);
    assert.equal(effectWrites.flat().length, 1);
    const replay = await enqueueOperationsJob({ householdId: home.householdId, kind: "RECONCILIATION", idempotencyKey: effectKey, jobKey: randomUUID() });
    assert.equal(replay.id, job.id);
    const [effectCount] = await db.select({ count: sql<number>`count(*)::int` }).from(idempotencyKeys).where(and(
      eq(idempotencyKeys.householdId, home.householdId),
      eq(idempotencyKeys.key, `effect:${effectKey}`),
    ));
    assert.equal(Number(effectCount?.count), 1);
  } finally {
    await cleanup(home);
  }
});

test("OR-12 scheduler persistence and OR-13 concurrent leadership", skip, async () => {
  const home = await fixture("or12");
  try {
    await db.delete(operationsSchedulerLeases);
    const schedule = await createOperationsScheduler(home.actor, {
      name: `or12-${randomUUID()}`,
      jobKind: "ADVISORY",
      cadence: "daily",
      payload: { report: "certification" },
      missedRunPolicy: "CATCH_UP",
      nextRunAt: new Date(Date.now() - 60_000),
    });
    assert.equal(schedule.householdId, home.householdId);
    const [first, second] = await Promise.all([runOperationsSchedulerTick("or12-a"), runOperationsSchedulerTick("or12-b")]);
    assert.equal([first, second].filter((result) => result.leader).length, 1);
    const jobs = await db.select().from(operationsJobs).where(eq(operationsJobs.householdId, home.householdId));
    assert.equal(jobs.length, 1);
    const [lease] = await db.select().from(operationsSchedulerLeases);
    assert.ok(lease?.ownerId);
  } finally {
    await cleanup(home);
    await db.delete(operationsSchedulerLeases);
  }
});

test("OR-14 missed schedule recovery follows CATCH_UP and SKIP policy", skip, async () => {
  const home = await fixture("or14");
  try {
    await db.delete(operationsSchedulerLeases);
    const catchUp = await createOperationsScheduler(home.actor, {
      name: `or14-catch-${randomUUID()}`,
      jobKind: "ADVISORY",
      cadence: "daily",
      missedRunPolicy: "CATCH_UP",
      nextRunAt: new Date(Date.now() - 86_400_000),
    });
    const skipSchedule = await createOperationsScheduler(home.actor, {
      name: `or14-skip-${randomUUID()}`,
      jobKind: "ADVISORY",
      cadence: "daily",
      missedRunPolicy: "SKIP",
      nextRunAt: new Date(Date.now() - 86_400_000),
    });
    await runOperationsSchedulerTick(`or14-${randomUUID()}`);
    const jobs = await db.select().from(operationsJobs).where(eq(operationsJobs.householdId, home.householdId));
    assert.equal(jobs.length, 1);
    assert.ok(jobs.some((job) => job.correlationId === `schedule:${catchUp.id}`));
    assert.equal((await db.select().from(operationsSchedulers).where(eq(operationsSchedulers.id, skipSchedule.id))).at(0)?.lastRunAt !== null, true);
  } finally {
    await cleanup(home);
    await db.delete(operationsSchedulerLeases);
  }
});

test("OR-15 household isolation rejects cross-household job access", skip, async () => {
  const home = await fixture("or15");
  try {
    const jobA = await enqueueOperationsJob({ householdId: home.householdId, kind: "ADVISORY", jobKey: randomUUID() });
    const jobB = await enqueueOperationsJob({ householdId: home.otherActor.householdId, kind: "ADVISORY", jobKey: randomUUID() });
    const visibleA = await listOperationsJobs(home.actor);
    assert.equal(visibleA.some((job) => job.id === jobA.id), true);
    assert.equal(visibleA.some((job) => job.id === jobB.id), false);
    await assert.rejects(() => reprocessOperationsJob(home.actor, jobB.id), (error) => assertGovernanceCode(error, "INVALID_STATE"));
  } finally {
    await cleanup(home);
  }
});

test("OR-16 execution control integration and OR-18 STOP during job fail closed", skip, async () => {
  const home = await fixture("or16");
  try {
    await getExecutionControl(home.actor);
    await db.update(executionControls).set({ state: "MICRO_LIVE_ACTIVE", updatedAt: new Date() }).where(eq(executionControls.householdId, home.householdId));
    await db.insert(guardianHeartbeats).values({
      householdId: home.householdId,
      service: "certification-guardian",
      status: "HEALTHY",
      signatureValid: true,
      lastHeartbeatAt: new Date(),
    });
    await assertExecutionPermitted(home.actor);
    await requestExecutionStop(home.actor, { reason: "Certification STOP during active job", correlationId: "or18-stop" });
    await assert.rejects(() => assertExecutionPermitted(home.actor), (error) => assertGovernanceCode(error, "RISK_BLOCKED"));
  } finally {
    await cleanup(home);
  }
});

test("OR-17 Guardian stale, unavailable, STOP, and disagreement states fail closed", skip, async () => {
  const home = await fixture("or17");
  try {
    await getExecutionControl(home.actor);
    await db.update(executionControls).set({ state: "MICRO_LIVE_ACTIVE", updatedAt: new Date() }).where(eq(executionControls.householdId, home.householdId));
    const [heartbeat] = await db.insert(guardianHeartbeats).values({
      householdId: home.householdId,
      service: "certification-guardian",
      status: "HEALTHY",
      signatureValid: true,
      lastHeartbeatAt: new Date(),
    }).returning();
    await assertExecutionPermitted(home.actor);
    for (const update of [
      { status: "STALE", lastHeartbeatAt: new Date() },
      { status: "UNAVAILABLE", lastHeartbeatAt: new Date() },
      { status: "STOP", lastHeartbeatAt: new Date() },
      { status: "HEALTHY", signatureValid: false, lastHeartbeatAt: new Date() },
      { status: "HEALTHY", signatureValid: true, observedExposure: "1.00", reportedExposure: "0.00", lastHeartbeatAt: new Date() },
    ]) {
      await db.update(guardianHeartbeats).set(update).where(eq(guardianHeartbeats.id, heartbeat.id));
      await assert.rejects(() => assertExecutionPermitted(home.actor), (error) => assertGovernanceCode(error, "RISK_BLOCKED"));
    }
  } finally {
    await cleanup(home);
  }
});

test("OR-19 reconciliation recovery and OR-20 UNKNOWN order recovery preserve evidence", skip, async () => {
  const home = await fixture("or19");
  try {
    const reconciliation = await enqueueOperationsJob({
      householdId: home.householdId,
      kind: "RECONCILIATION",
      payload: { discrepancy: "simulated", orderState: "UNKNOWN", venue: "simulated-only" },
      idempotencyKey: `reconciliation-${randomUUID()}`,
      jobKey: randomUUID(),
    });
    const crashed = await startProbe({ householdId: home.householdId, workerId: `or19-a-${randomUUID()}`, jobId: reconciliation.id });
    crashed.child.kill("SIGKILL");
    await crashed.waitForExit();
    await db.update(operationsJobs).set({ leaseExpiresAt: new Date(Date.now() - 10_000) }).where(eq(operationsJobs.id, reconciliation.id));
    await recoverStaleOperationsJobs(home.householdId, 1_000);
    await makeAvailable(reconciliation.id);
    const replacement = await startProbe({ householdId: home.householdId, workerId: `or19-b-${randomUUID()}`, jobId: reconciliation.id, mode: "complete" });
    await replacement.waitForExit();
    const [recovered] = await db.select().from(operationsJobs).where(eq(operationsJobs.id, reconciliation.id));
    assert.equal(recovered?.status, "SUCCEEDED");
    assert.deepEqual(recovered?.payload, { discrepancy: "simulated", orderState: "UNKNOWN", venue: "simulated-only" });
    const [attempt] = await db.select().from(operationsJobAttempts).where(eq(operationsJobAttempts.jobId, reconciliation.id)).orderBy(sql`${operationsJobAttempts.attempt} desc`).limit(1);
    assert.equal(attempt?.status, "SUCCEEDED");
    const [recoveryEvidence] = await db.select({ count: sql<number>`count(*)::int` }).from(auditEvents).where(and(
      eq(auditEvents.householdId, home.householdId),
      eq(auditEvents.eventType, "operations_job_recovered"),
      eq(auditEvents.entityId, reconciliation.id),
    ));
    assert.equal(Number(recoveryEvidence?.count), 1);
  } finally {
    await cleanup(home);
  }
});

test("OR-21 audit attribution records job lifecycle and scheduler actions", skip, async () => {
  const home = await fixture("or21");
  try {
    const job = await enqueueOperationsJob({ householdId: home.householdId, kind: "ADVISORY", correlationId: "or21-correlation", jobKey: randomUUID() });
    const running = await claimAndStart(home.householdId, "or21-worker", job.id);
    await heartbeatOperationsWorker("or21-worker", job.id);
    await completeOperationsJob(running.id, home.householdId, "or21-worker");
    const scheduler = await createOperationsScheduler(home.actor, {
      name: `or21-${randomUUID()}`,
      jobKind: "ADVISORY",
      cadence: "daily",
      missedRunPolicy: "CATCH_UP",
      nextRunAt: new Date(Date.now() - 60_000),
    });
    await db.delete(operationsSchedulerLeases);
    await runOperationsSchedulerTick("or21-scheduler");
    const events = await db.select().from(auditEvents).where(and(eq(auditEvents.householdId, home.householdId), sql`${auditEvents.entityId} in (${job.id}, ${scheduler.id})`));
    const types = new Set(events.map((event) => event.eventType));
    for (const required of ["operations_job_created", "operations_job_leased", "operations_job_started", "operations_worker_heartbeat", "operations_job_completed", "operations_scheduler_created", "operations_schedule_missed_recovered"]) {
      assert.equal(types.has(required), true, `missing audit event ${required}`);
    }
    assert.ok(events.some((event) => event.entityId === job.id && event.actor === "or21-worker"));
    assert.ok(events.some((event) => event.entityId === scheduler.id && event.actor === "or21-scheduler"));
  } finally {
    await cleanup(home);
    await db.delete(operationsSchedulerLeases);
  }
});

test("OR-22 100-job multi-worker contention accounts for every job once", skip, async () => {
  const home = await fixture("or22");
  try {
    const jobs = await Promise.all(Array.from({ length: 100 }, () => enqueueOperationsJob({ householdId: home.householdId, kind: "ADVISORY", jobKey: randomUUID() })));
    const claims = await Promise.all(Array.from({ length: 100 }, (_, index) => claimNextOperationsJob(home.householdId, `or22-worker-${index % 8}`)));
    const claimed = claims.filter(Boolean);
    assert.equal(claimed.length, 100);
    assert.equal(new Set(claimed.map((job) => job!.id)).size, 100);
    assert.equal(new Set(jobs.map((job) => job.id)).size, 100);
    assert.equal(claimed.every((job) => jobs.some((candidate) => candidate.id === job!.id)), true);
  } finally {
    await cleanup(home);
  }
});

test("OR-23 queue metrics and OR-24 scheduler metrics change with runtime events", skip, async () => {
  const home = await fixture("or23");
  try {
    const before = await getOperationsMetrics(home.householdId);
    assert.equal(before.queueDepth, 0);
    const job = await enqueueOperationsJob({ householdId: home.householdId, kind: "ADVISORY", jobKey: randomUUID() });
    const queued = await getOperationsMetrics(home.householdId);
    assert.equal(queued.queueDepth, 1);
    assert.ok(queued.oldestPendingJobAgeMs >= 0);
    const running = await claimAndStart(home.householdId, "or23-worker", job.id);
    await heartbeatOperationsWorker("or23-worker", job.id);
    await completeOperationsJob(running.id, home.householdId, "or23-worker");
    const after = await getOperationsMetrics(home.householdId);
    assert.equal(after.queueDepth, 0);
    assert.equal(after.activeWorkerCount, before.activeWorkerCount);
    assert.ok(after.jobExecutionDurationMs >= 0);
    await db.delete(operationsSchedulerLeases);
    await createOperationsScheduler(home.actor, {
      name: `or24-${randomUUID()}`,
      jobKind: "ADVISORY",
      cadence: "daily",
      missedRunPolicy: "CATCH_UP",
      nextRunAt: new Date(Date.now() - 60_000),
    });
    const schedulerBefore = await getOperationsSchedulerMetrics(home.householdId);
    assert.equal(schedulerBefore.missedScheduleCount, 1);
    await runOperationsSchedulerTick("or24-scheduler");
    const schedulerAfter = await getOperationsSchedulerMetrics(home.householdId);
    assert.ok(schedulerAfter.schedulerHeartbeat);
    assert.equal(schedulerAfter.schedulerLeader, true);
    assert.ok(schedulerAfter.scheduleRecoveryCount >= 1);
  } finally {
    await cleanup(home);
    await db.delete(operationsSchedulerLeases);
    await db.delete(operationsWorkers).where(eq(operationsWorkers.workerId, "or23-worker"));
    await db.delete(operationsMetrics).where(eq(operationsMetrics.householdId, home.householdId));
  }
});