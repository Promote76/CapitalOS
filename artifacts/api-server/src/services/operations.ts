import { and, asc, desc, eq, lte, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import {
  financeBills,
  operationsAlerts,
  operationsApprovals,
  operationsAutomations,
  operationsNotificationPreferences,
  operationsJobs,
  operationsJobAttempts,
  operationsWorkers,
  operationsSchedulers,
  operationsSchedulerLeases,
  operationsMetrics,
  auditEvents,
  operationsRuns,
  operationsTasks,
} from "@workspace/db/schema";
import type { Actor } from "./capital-os";
import { ensureTenantCore } from "./seed";
import { assertPermission, GovernanceError } from "../domain/governance";
import { assertSafeAutomationAction, calculateOperationsHealth, classifyOperationsFailure, operationsBackoffMs } from "../domain/operations";

const today = () => new Date().toISOString().slice(0, 10);
const dateAfter = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

function taskResponse(task: typeof operationsTasks.$inferSelect) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    domain: task.domain,
    priority: task.priority,
    status: task.status,
    dueDate: task.dueDate,
    assignedTo: task.assignedTo,
    source: task.source,
    relatedEntityType: task.relatedEntityType,
    relatedEntityId: task.relatedEntityId,
    requiresApproval: task.requiresApproval,
    createdAt: task.createdAt,
    completedAt: task.completedAt,
  };
}

function approvalResponse(approval: typeof operationsApprovals.$inferSelect) {
  return {
    id: approval.id,
    requestType: approval.requestType,
    requestedBy: approval.requestedBy,
    relatedEntity: approval.relatedEntity,
    currentState: approval.currentState,
    proposedState: approval.proposedState,
    financialImpact: approval.financialImpact,
    riskImpact: approval.riskImpact,
    duplexImpact: approval.duplexImpact,
    reason: approval.reason,
    evidence: approval.evidence,
    requiredAuthority: approval.requiredAuthority,
    expiresAt: approval.expiresAt,
    status: approval.status,
    createdAt: approval.createdAt,
    decidedAt: approval.decidedAt,
  };
}

function alertResponse(alert: typeof operationsAlerts.$inferSelect) {
  return {
    id: alert.id,
    alertKey: alert.alertKey,
    title: alert.title,
    message: alert.message,
    severity: alert.severity,
    domain: alert.domain,
    status: alert.status,
    occurrenceCount: alert.occurrenceCount,
    firstSeen: alert.firstSeen,
    lastSeen: alert.lastSeen,
    resolvedAt: alert.resolvedAt,
  };
}

function automationResponse(automation: typeof operationsAutomations.$inferSelect) {
  return {
    id: automation.id,
    name: automation.name,
    trigger: automation.trigger,
    action: automation.action,
    enabled: automation.enabled,
    protected: automation.protected,
    priority: automation.priority,
    lastRun: automation.lastRun,
    nextRun: automation.nextRun,
  };
}

function preferencesResponse(preferences: typeof operationsNotificationPreferences.$inferSelect) {
  return {
    criticalAlerts: preferences.criticalAlerts,
    bills: preferences.bills,
    budget: preferences.budget,
    duplexGoal: preferences.duplexGoal,
    property: preferences.property,
    strategies: preferences.strategies,
    accounting: preferences.accounting,
    security: preferences.security,
    weeklyReports: preferences.weeklyReports,
    monthlyReports: preferences.monthlyReports,
    quietHoursStart: preferences.quietHoursStart,
    quietHoursEnd: preferences.quietHoursEnd,
  };
}

async function ensureOperationsSeed(householdId: string, ownerId: string): Promise<void> {
  await db.transaction(async (tx) => {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`operations-seed:${householdId}`}))`);
  const [existingTasks, existingApprovals, existingAlerts, existingAutomations, existingPreferences] = await Promise.all([
    tx.select({ id: operationsTasks.id }).from(operationsTasks).where(eq(operationsTasks.householdId, householdId)).limit(1),
    tx.select({ id: operationsApprovals.id }).from(operationsApprovals).where(eq(operationsApprovals.householdId, householdId)).limit(1),
    tx.select({ id: operationsAlerts.id }).from(operationsAlerts).where(eq(operationsAlerts.householdId, householdId)).limit(1),
    tx.select({ id: operationsAutomations.id }).from(operationsAutomations).where(eq(operationsAutomations.householdId, householdId)).limit(1),
    tx.select({ id: operationsNotificationPreferences.id }).from(operationsNotificationPreferences).where(eq(operationsNotificationPreferences.householdId, householdId)).limit(1),
  ]);

  if (!existingTasks[0]) {
    await tx.insert(operationsTasks).values([
      {
        householdId,
        title: "Confirm this week’s Duplex Reserve contribution",
        description: "Review the planned allocation and confirm the manual transfer was completed.",
        domain: "DUPLEX",
        priority: "HIGH",
        dueDate: today(),
        createdBy: ownerId,
        source: "SYSTEM_RULE",
        relatedEntityType: "goal",
        requiresApproval: false,
      },
      {
        householdId,
        title: "Review two property follow-ups",
        description: "Request the latest insurance estimate and rent estimate for the leading duplex candidates.",
        domain: "PROPERTY",
        priority: "HIGH",
        dueDate: today(),
        createdBy: ownerId,
        source: "PROPERTY_WORKFLOW",
        relatedEntityType: "property_pipeline",
        requiresApproval: false,
      },
      {
        householdId,
        title: "Categorize uncategorized household transactions",
        description: "Clear the current review queue before the next accounting close.",
        domain: "ACCOUNTING",
        priority: "MEDIUM",
        dueDate: dateAfter(2),
        createdBy: ownerId,
        source: "ACCOUNTING_WORKFLOW",
        requiresApproval: false,
      },
      {
        householdId,
        title: "Review weekly Treasury allocation",
        description: "Check reserve coverage and the next safe-to-deploy calculation.",
        domain: "TREASURY",
        priority: "MEDIUM",
        dueDate: dateAfter(4),
        createdBy: ownerId,
        source: "SYSTEM_RULE",
        requiresApproval: false,
      },
    ]);
  }

  if (!existingApprovals[0]) {
    await tx.insert(operationsApprovals).values([
      {
        householdId,
        requestType: "Capital allocation change",
        requestedBy: ownerId,
        relatedEntity: "allocation_rule",
        currentState: "$200/week to Duplex Reserve",
        proposedState: "$250/week to Duplex Reserve",
        financialImpact: "Adds $50/week to the protected duplex plan.",
        riskImpact: "Requires cash-flow and minimum-reserve review.",
        duplexImpact: "May accelerate the acquisition timeline.",
        reason: "Free cash flow has remained above the configured safety floor.",
        evidence: ["Three consecutive positive cash-flow snapshots", "Emergency reserve remains protected"],
        requiredAuthority: "owner",
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
      },
      {
        householdId,
        requestType: "Property promotion",
        requestedBy: ownerId,
        relatedEntity: "duplex-candidate",
        currentState: "Qualified",
        proposedState: "Offer readiness review",
        financialImpact: "No funds move; review prepares a potential future offer.",
        riskImpact: "Requires financing, insurance, and stress-test evidence.",
        duplexImpact: "Advances one candidate toward the acquisition checklist.",
        reason: "The candidate passed the current buy-box screen.",
        evidence: ["Buy-box match recorded", "Financing scenario attached"],
        requiredAuthority: "owner",
        expiresAt: new Date(Date.now() + 5 * 86_400_000),
      },
    ]);
  }

  if (!existingAlerts[0]) {
    await tx.insert(operationsAlerts).values({
      householdId,
      alertKey: "accounting-review-queue",
      title: "Accounting review queue is open",
      message: "A small set of transactions still needs categorization before close.",
      severity: "LOW",
      domain: "ACCOUNTING",
      status: "ACTIVE",
    });
  }

  if (!existingAutomations[0]) {
    await tx.insert(operationsAutomations).values([
      {
        householdId,
        name: "Missed contribution review",
        trigger: "Deadline",
        conditions: { domain: "DUPLEX", daysLate: 1 },
        action: "create_task",
        enabled: true,
        protected: true,
        priority: 10,
        nextRun: new Date(Date.now() + 86_400_000),
        createdBy: ownerId,
      },
      {
        householdId,
        name: "Bank data freshness monitor",
        trigger: "Data Freshness",
        conditions: { maxAgeHours: 24 },
        action: "create_alert",
        enabled: true,
        protected: true,
        priority: 20,
        nextRun: new Date(Date.now() + 2 * 86_400_000),
        createdBy: ownerId,
      },
      {
        householdId,
        name: "Weekly Treasury review",
        trigger: "Scheduled",
        conditions: { cadence: "weekly" },
        action: "request_review",
        enabled: true,
        protected: false,
        priority: 40,
        nextRun: new Date(Date.now() + 4 * 86_400_000),
        createdBy: ownerId,
      },
      {
        householdId,
        name: "Month-end accounting close",
        trigger: "Month-End",
        conditions: { daysBefore: 5 },
        action: "create_task",
        enabled: true,
        protected: false,
        priority: 50,
        nextRun: new Date(Date.now() + 14 * 86_400_000),
        createdBy: ownerId,
      },
      {
        householdId,
        name: "Daily capital brief",
        trigger: "Scheduled",
        conditions: { cadence: "daily" },
        action: "generate_report",
        enabled: true,
        protected: false,
        priority: 60,
        nextRun: new Date(Date.now() + 86_400_000),
        createdBy: ownerId,
      },
    ]);
  }

  if (!existingPreferences[0]) {
    await tx.insert(operationsNotificationPreferences).values({
      householdId,
      userId: ownerId,
    });
  }
  });
}

async function loadOperations(actor: Actor) {
  const ids = await ensureTenantCore(actor.householdId, actor.userId);
  await ensureOperationsSeed(ids.householdId, ids.ownerId);
  const [tasks, approvals, alerts, automations, preferences, bills, jobs] = await Promise.all([
    db.select().from(operationsTasks).where(eq(operationsTasks.householdId, ids.householdId)).orderBy(asc(operationsTasks.dueDate), asc(operationsTasks.priority)),
    db.select().from(operationsApprovals).where(eq(operationsApprovals.householdId, ids.householdId)).orderBy(desc(operationsApprovals.createdAt)),
    db.select().from(operationsAlerts).where(eq(operationsAlerts.householdId, ids.householdId)).orderBy(desc(operationsAlerts.lastSeen)),
    db.select().from(operationsAutomations).where(eq(operationsAutomations.householdId, ids.householdId)).orderBy(asc(operationsAutomations.priority)),
    db.select().from(operationsNotificationPreferences).where(and(eq(operationsNotificationPreferences.householdId, ids.householdId), eq(operationsNotificationPreferences.userId, ids.ownerId))).limit(1),
    db.select({ id: financeBills.id, status: financeBills.status, dueDate: financeBills.dueDate }).from(financeBills).where(and(eq(financeBills.householdId, ids.householdId), eq(financeBills.active, true), lte(financeBills.dueDate, dateAfter(7)))),
    db.select().from(operationsJobs).where(eq(operationsJobs.householdId, ids.householdId)).orderBy(desc(operationsJobs.createdAt)).limit(100),
  ]);
  if (!preferences[0]) throw new Error("Operations notification preferences are missing");
  return { ids, tasks, approvals, alerts, automations, preferences: preferences[0], bills, jobs };
}

type OperationsJobPayload = Record<string, unknown>;

function operationsJobResponse(job: typeof operationsJobs.$inferSelect) {
  return {
    id: job.id,
    householdId: job.householdId,
    jobKey: job.jobKey,
    kind: job.kind,
    status: job.status,
    priority: job.priority,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    availableAt: job.availableAt,
    claimedAt: job.claimedAt,
    claimedBy: job.claimedBy,
    leaseOwner: job.leaseOwner,
    leaseExpiresAt: job.leaseExpiresAt,
    startedAt: job.startedAt,
    idempotencyKey: job.idempotencyKey,
    correlationId: job.correlationId,
    payloadReference: job.payloadReference,
    lastError: job.lastError,
    deadLetterReason: job.deadLetterReason,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
  };
}

export async function enqueueOperationsJob(input: {
  householdId: string;
  kind: string;
  payload?: OperationsJobPayload;
  jobKey?: string;
  maxAttempts?: number;
  idempotencyKey?: string;
  correlationId?: string;
  priority?: number;
}) {
  const [job] = await db.insert(operationsJobs).values({
    householdId: input.householdId,
    jobKey: input.jobKey ?? randomUUID(),
    kind: input.kind,
    payload: input.payload ?? {},
    maxAttempts: input.maxAttempts ?? 3,
    status: "QUEUED",
    priority: input.priority ?? 100,
    idempotencyKey: input.idempotencyKey,
    correlationId: input.correlationId,
  }).onConflictDoNothing({ target: [operationsJobs.householdId, operationsJobs.idempotencyKey] }).returning();
  if (job) {
    await db.insert(auditEvents).values({
      householdId: job.householdId,
      eventType: "operations_job_created",
      actor: "system",
      entity: "operations_job",
      entityId: job.id,
      reason: "Durable operations job persisted",
      metadata: {
        kind: job.kind,
        correlationId: job.correlationId,
        idempotencyKey: job.idempotencyKey,
        payloadReference: job.payloadReference,
      },
    });
    return job;
  }
  if (input.idempotencyKey) {
    const [existing] = await db.select().from(operationsJobs).where(and(eq(operationsJobs.householdId, input.householdId), eq(operationsJobs.idempotencyKey, input.idempotencyKey))).limit(1);
    if (existing) return existing;
  }
  throw new GovernanceError("INVALID_STATE", "Durable operation job could not be persisted");
}

export async function claimNextOperationsJob(householdId: string, workerId: string) {
  return db.transaction(async (tx) => {
    const [job] = await tx.select().from(operationsJobs).where(and(
      eq(operationsJobs.householdId, householdId),
      sql`${operationsJobs.status} in ('QUEUED', 'RETRY_PENDING')`,
      lte(operationsJobs.availableAt, new Date()),
    )).orderBy(desc(operationsJobs.priority), asc(operationsJobs.availableAt), asc(operationsJobs.createdAt)).limit(1).for("update", { skipLocked: true });
    if (!job) return null;
    const [claimed] = await tx.update(operationsJobs).set({
      status: "LEASED",
      attempts: job.attempts + 1,
      claimedAt: new Date(),
      claimedBy: workerId,
      leaseOwner: workerId,
      leaseExpiresAt: new Date(Date.now() + 5 * 60_000),
      updatedAt: new Date(),
    }).where(and(eq(operationsJobs.id, job.id), sql`${operationsJobs.status} in ('QUEUED', 'RETRY_PENDING')`)).returning();
    if (claimed) {
      await tx.insert(operationsJobAttempts).values({ jobId: claimed.id, householdId, attempt: claimed.attempts, workerId, leaseExpiresAt: claimed.leaseExpiresAt });
      await tx.insert(auditEvents).values({ householdId, eventType: "operations_job_leased", actor: "system", entity: "operations_job", entityId: claimed.id, reason: "Atomic durable worker lease", metadata: { workerId, attempt: claimed.attempts } });
    }
    return claimed ?? null;
  });
}

export async function startOperationsJob(jobId: string, householdId: string, workerId: string) {
  const now = new Date();
  const [job] = await db.update(operationsJobs).set({
    status: "RUNNING",
    startedAt: now,
    updatedAt: now,
  }).where(and(
    eq(operationsJobs.id, jobId),
    eq(operationsJobs.householdId, householdId),
    eq(operationsJobs.leaseOwner, workerId),
    eq(operationsJobs.status, "LEASED"),
    sql`${operationsJobs.leaseExpiresAt} > ${now}`,
  )).returning();
  if (job) {
    await db.update(operationsJobAttempts).set({ status: "RUNNING", startedAt: now }).where(and(
      eq(operationsJobAttempts.jobId, jobId),
      eq(operationsJobAttempts.attempt, job.attempts),
      eq(operationsJobAttempts.workerId, workerId),
    ));
    await db.insert(auditEvents).values({
      householdId,
      eventType: "operations_job_started",
      actor: workerId,
      entity: "operations_job",
      entityId: job.id,
      reason: "Durable worker started job",
      metadata: { workerId, attempt: job.attempts },
    });
  }
  return job ?? null;
}

export async function completeOperationsJob(jobId: string, householdId: string, workerId: string) {
  const now = new Date();
  const [job] = await db.update(operationsJobs).set({
    status: "SUCCEEDED",
    completedAt: now,
    updatedAt: now,
    leaseOwner: null,
    leaseExpiresAt: null,
  }).where(and(
    eq(operationsJobs.id, jobId),
    eq(operationsJobs.householdId, householdId),
    eq(operationsJobs.leaseOwner, workerId),
    sql`${operationsJobs.status} in ('LEASED', 'RUNNING')`,
    sql`${operationsJobs.leaseExpiresAt} > ${now}`,
  )).returning();
  if (job) {
    await db.update(operationsJobAttempts).set({ status: "SUCCEEDED", finishedAt: now }).where(and(
      eq(operationsJobAttempts.jobId, jobId),
      eq(operationsJobAttempts.attempt, job.attempts),
      eq(operationsJobAttempts.workerId, workerId),
    ));
    await db.insert(auditEvents).values({ householdId, eventType: "operations_job_completed", actor: workerId, entity: "operations_job", entityId: job.id, reason: "Durable worker completed job", metadata: { attempt: job.attempts } });
    await db.update(operationsWorkers).set({ status: "IDLE", currentJobId: null, updatedAt: now }).where(eq(operationsWorkers.workerId, workerId));
  }
  return job ?? null;
}

export async function failOperationsJob(jobId: string, householdId: string, workerId: string, error: unknown) {
  const [existing] = await db.select().from(operationsJobs).where(and(
    eq(operationsJobs.id, jobId),
    eq(operationsJobs.householdId, householdId),
    eq(operationsJobs.leaseOwner, workerId),
    sql`${operationsJobs.status} in ('LEASED', 'RUNNING')`,
  )).limit(1);
  if (!existing) return null;
  const message = error instanceof Error ? error.message : "Operations job failed";
  const classification = classifyOperationsFailure(error);
  const terminal = existing.attempts >= existing.maxAttempts || classification === "PERMANENT";
  const now = new Date();
  const [job] = await db.update(operationsJobs).set({
    status: terminal ? "DEAD_LETTER" : "RETRY_PENDING",
    availableAt: terminal ? existing.availableAt : new Date(Date.now() + operationsBackoffMs(existing.attempts)),
    lastError: message,
    deadLetterReason: terminal ? message : null,
    updatedAt: now,
    leaseOwner: null,
    leaseExpiresAt: null,
  }).where(and(
    eq(operationsJobs.id, jobId),
    eq(operationsJobs.householdId, householdId),
    eq(operationsJobs.leaseOwner, workerId),
    sql`${operationsJobs.status} in ('LEASED', 'RUNNING')`,
  )).returning();
  if (job) {
    await db.update(operationsJobAttempts).set({
      status: terminal ? "DEAD_LETTER" : "RETRY_PENDING",
      classification,
      error: message,
      finishedAt: now,
    }).where(and(
      eq(operationsJobAttempts.jobId, jobId),
      eq(operationsJobAttempts.attempt, existing.attempts),
      eq(operationsJobAttempts.workerId, workerId),
    ));
    await db.insert(auditEvents).values({ householdId, eventType: terminal ? "operations_job_dead_lettered" : "operations_job_retry_scheduled", actor: workerId, entity: "operations_job", entityId: job.id, reason: message, metadata: { attempt: job.attempts, classification } });
    await db.update(operationsWorkers).set({ status: "IDLE", currentJobId: null, updatedAt: now }).where(eq(operationsWorkers.workerId, workerId));
  }
  return job ?? null;
}

export async function recoverStaleOperationsJobs(householdId: string, staleAfterMs = 5 * 60_000) {
  const cutoff = new Date(Date.now() - staleAfterMs);
  const recovered = await db.update(operationsJobs).set({
    status: "RETRY_PENDING",
    claimedAt: null,
    claimedBy: null,
    leaseOwner: null,
    leaseExpiresAt: null,
    startedAt: null,
    availableAt: new Date(),
    updatedAt: new Date(),
  }).where(and(
    eq(operationsJobs.householdId, householdId),
    sql`${operationsJobs.status} in ('LEASED', 'RUNNING')`,
    lte(operationsJobs.leaseExpiresAt, cutoff),
  )).returning();
  for (const job of recovered) {
    await db.update(operationsJobAttempts).set({ status: "RECOVERED", finishedAt: new Date() }).where(and(
      eq(operationsJobAttempts.jobId, job.id),
      eq(operationsJobAttempts.attempt, job.attempts),
    ));
    await db.insert(auditEvents).values({ householdId, eventType: "operations_job_recovered", actor: "system", entity: "operations_job", entityId: job.id, reason: "Lease expired before completion", metadata: { attempt: job.attempts } });
  }
  return recovered;
}

export async function heartbeatOperationsWorker(workerId: string, currentJobId?: string | null) {
  const now = new Date();
  const [worker] = await db.insert(operationsWorkers).values({
    workerId, currentJobId: currentJobId ?? null, status: currentJobId ? "BUSY" : "IDLE",
    lastHeartbeatAt: now, updatedAt: now, version: process.env.npm_package_version ?? "unknown",
  }).onConflictDoUpdate({
    target: operationsWorkers.workerId,
    set: { currentJobId: currentJobId ?? null, status: currentJobId ? "BUSY" : "IDLE", lastHeartbeatAt: now, updatedAt: now },
  }).returning();
  if (currentJobId) {
    const [job] = await db.update(operationsJobs).set({ leaseExpiresAt: new Date(Date.now() + 5 * 60_000), updatedAt: now })
      .where(and(eq(operationsJobs.id, currentJobId), eq(operationsJobs.leaseOwner, workerId), sql`${operationsJobs.status} in ('LEASED', 'RUNNING')`))
      .returning({ id: operationsJobs.id, householdId: operationsJobs.householdId, attempts: operationsJobs.attempts });
    if (job) {
      await db.insert(auditEvents).values({
        householdId: job.householdId,
        eventType: "operations_worker_heartbeat",
        actor: workerId,
        entity: "operations_job",
        entityId: job.id,
        reason: "Worker heartbeat renewed the job lease",
        metadata: { workerId, attempt: job.attempts },
      });
    }
  }
  return worker;
}

export async function getOperationsMetrics(householdId: string) {
  const now = new Date();
  const rows = await db.select({ status: operationsJobs.status, count: sql<number>`count(*)::int` })
    .from(operationsJobs).where(eq(operationsJobs.householdId, householdId)).groupBy(operationsJobs.status);
  const [pending] = await db.select({
    oldestPendingAt: sql<Date | null>`min(${operationsJobs.createdAt})`,
  }).from(operationsJobs).where(and(
    eq(operationsJobs.householdId, householdId),
    sql`${operationsJobs.status} in ('QUEUED', 'RETRY_PENDING')`,
  ));
  const attempts = await db.select({
    status: operationsJobAttempts.status,
    startedAt: operationsJobAttempts.startedAt,
    finishedAt: operationsJobAttempts.finishedAt,
  }).from(operationsJobAttempts)
    .innerJoin(operationsJobs, eq(operationsJobAttempts.jobId, operationsJobs.id))
    .where(eq(operationsJobs.householdId, householdId));
  const workers = await db.select().from(operationsWorkers);
  const activeWorkerCount = workers.filter((worker) => worker.status === "BUSY").length;
  const staleWorkerCount = workers.filter((worker) => now.getTime() - worker.lastHeartbeatAt.getTime() > 30_000).length;
  const durations = attempts
    .filter((attempt) => attempt.startedAt && attempt.finishedAt)
    .map((attempt) => attempt.finishedAt!.getTime() - attempt.startedAt!.getTime());
  const metrics = {
    queueDepth: rows.filter((r) => ["QUEUED", "RETRY_PENDING"].includes(r.status)).reduce((n, r) => n + Number(r.count), 0),
    oldestPendingJobAgeMs: pending?.oldestPendingAt ? Math.max(0, now.getTime() - new Date(pending.oldestPendingAt).getTime()) : 0,
    retryQueueDepth: Number(rows.find((r) => r.status === "RETRY_PENDING")?.count ?? 0),
    deadLetterCount: Number(rows.find((r) => ["DEAD_LETTER", "DEAD_LETTERED"].includes(r.status))?.count ?? 0),
    activeWorkerCount,
    staleWorkerCount,
    workerHeartbeatAgeMs: workers.length ? Math.max(...workers.map((worker) => Math.max(0, now.getTime() - worker.lastHeartbeatAt.getTime()))) : 0,
    jobExecutionDurationMs: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0,
    jobFailureCount: attempts.filter((attempt) => ["DEAD_LETTER", "FAILED"].includes(attempt.status)).length,
    jobRetryCount: attempts.filter((attempt) => attempt.status === "RETRY_PENDING").length,
    recoveredJobCount: attempts.filter((attempt) => attempt.status === "RECOVERED").length,
    statuses: Object.fromEntries(rows.map((r) => [r.status, Number(r.count)])),
  };
  await db.insert(operationsMetrics).values([
    { householdId, metric: "queue_depth", value: metrics.queueDepth },
    { householdId, metric: "retry_queue_depth", value: metrics.retryQueueDepth },
    { householdId, metric: "dead_letter_count", value: metrics.deadLetterCount },
    { householdId, metric: "active_worker_count", value: metrics.activeWorkerCount },
    { householdId, metric: "stale_worker_count", value: metrics.staleWorkerCount },
    { householdId, metric: "job_failure_count", value: metrics.jobFailureCount },
    { householdId, metric: "job_retry_count", value: metrics.jobRetryCount },
    { householdId, metric: "recovered_job_count", value: metrics.recoveredJobCount },
  ]);
  return metrics;
}

export async function getOperationsSchedulerMetrics(householdId: string) {
  const now = new Date();
  const [lease] = await db.select().from(operationsSchedulerLeases)
    .where(eq(operationsSchedulerLeases.singleton, "operations")).limit(1);
  const schedules = await db.select().from(operationsSchedulers).where(and(
    eq(operationsSchedulers.householdId, householdId),
    eq(operationsSchedulers.enabled, true),
  ));
  const due = schedules.filter((schedule) => schedule.nextRunAt <= now);
  const [recovery] = await db.select({ count: sql<number>`count(*)::int` })
    .from(auditEvents)
    .where(and(
      eq(auditEvents.householdId, householdId),
      eq(auditEvents.eventType, "operations_schedule_missed_recovered"),
    ));
  const metrics = {
    schedulerHeartbeat: lease?.heartbeatAt?.toISOString() ?? null,
    schedulerLeader: Boolean(lease && lease.leaseExpiresAt > now),
    schedulerLagMs: due.length ? Math.max(...due.map((schedule) => now.getTime() - schedule.nextRunAt.getTime())) : 0,
    missedScheduleCount: due.length,
    scheduleRecoveryCount: Number(recovery?.count ?? 0),
  };
  await db.insert(operationsMetrics).values([
    { householdId, metric: "scheduler_lag_ms", value: metrics.schedulerLagMs },
    { householdId, metric: "missed_schedule_count", value: metrics.missedScheduleCount },
    { householdId, metric: "schedule_recovery_count", value: metrics.scheduleRecoveryCount },
  ]);
  return metrics;
}

export async function listOperationsJobs(actor: Actor) {
  assertPermission(actor.role, "read");
  const jobs = await db.select().from(operationsJobs).where(eq(operationsJobs.householdId, actor.householdId)).orderBy(desc(operationsJobs.createdAt)).limit(200);
  return jobs.map(operationsJobResponse);
}

export async function listOperationsWorkerHealth(actor: Actor) {
  assertPermission(actor.role, "read");
  const workers = await db.select().from(operationsWorkers).orderBy(desc(operationsWorkers.lastHeartbeatAt));
  return workers.map((worker) => ({
    workerId: worker.workerId,
    status: worker.status,
    currentJobId: null,
    startedAt: worker.startedAt,
    lastHeartbeatAt: worker.lastHeartbeatAt,
    version: worker.version,
    updatedAt: worker.updatedAt,
  }));
}

export async function reprocessOperationsJob(actor: Actor, jobId: string) {
  assertPermission(actor.role, "approve");
  const [job] = await db.update(operationsJobs).set({
    status: "RETRY_PENDING", availableAt: new Date(), deadLetterReason: null, updatedAt: new Date(),
  }).where(and(eq(operationsJobs.id, jobId), eq(operationsJobs.householdId, actor.householdId), sql`${operationsJobs.status} in ('DEAD_LETTER', 'DEAD_LETTERED')`)).returning();
  if (!job) throw new GovernanceError("INVALID_STATE", "Only a household dead-letter job can be reprocessed");
  await db.insert(auditEvents).values({ householdId: actor.householdId, eventType: "operations_job_manual_reprocess", actor: actor.userId, entity: "operations_job", entityId: job.id, reason: "Authorized operator reprocessing", metadata: { correlationId: job.correlationId } });
  return operationsJobResponse(job);
}

export async function listOperationsSchedulers(actor: Actor) {
  assertPermission(actor.role, "read");
  return db.select().from(operationsSchedulers).where(eq(operationsSchedulers.householdId, actor.householdId)).orderBy(asc(operationsSchedulers.nextRunAt));
}

export async function createOperationsScheduler(actor: Actor, input: {
  name: string;
  jobKind: string;
  cadence: string;
  payload?: Record<string, unknown>;
  missedRunPolicy?: "CATCH_UP" | "SKIP";
  nextRunAt: Date;
}) {
  assertPermission(actor.role, "approve");
  const [schedule] = await db.insert(operationsSchedulers).values({
    householdId: actor.householdId,
    name: input.name,
    jobKind: input.jobKind,
    cadence: input.cadence,
    payload: input.payload ?? {},
    missedRunPolicy: input.missedRunPolicy ?? "SKIP",
    nextRunAt: input.nextRunAt,
    createdBy: actor.userId,
  }).returning();
  if (!schedule) throw new GovernanceError("INVALID_STATE", "Scheduler definition could not be persisted");
  await db.insert(auditEvents).values({
    householdId: actor.householdId,
    eventType: "operations_scheduler_created",
    actor: actor.userId,
    entity: "operations_scheduler",
    entityId: schedule.id,
    reason: "Persistent scheduler definition created",
    metadata: { jobKind: schedule.jobKind, cadence: schedule.cadence, missedRunPolicy: schedule.missedRunPolicy },
  });
  return schedule;
}

export async function acquireOperationsSchedulerLeadership(actor: Actor) {
  assertPermission(actor.role, "approve");
  const now = new Date();
  const expiry = new Date(Date.now() + 30_000);
  const lease = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('operations-scheduler-leadership'))`);
    const [current] = await tx.select().from(operationsSchedulerLeases).where(eq(operationsSchedulerLeases.singleton, "operations")).limit(1);
    if (current && current.leaseExpiresAt > now && current.ownerId !== actor.userId) {
      throw new GovernanceError("INVALID_STATE", "Another scheduler currently holds leadership");
    }
    const [updated] = current
      ? await tx.update(operationsSchedulerLeases).set({ ownerId: actor.userId, leaseExpiresAt: expiry, heartbeatAt: now }).where(eq(operationsSchedulerLeases.singleton, "operations")).returning()
      : await tx.insert(operationsSchedulerLeases).values({ ownerId: actor.userId, leaseExpiresAt: expiry, heartbeatAt: now }).returning();
    if (!updated) throw new GovernanceError("INVALID_STATE", "Scheduler leadership could not be persisted");
    return updated;
  });
  await db.insert(auditEvents).values({ householdId: actor.householdId, eventType: "operations_scheduler_leadership", actor: actor.userId, entity: "operations_scheduler_lease", entityId: lease.singleton, reason: "Scheduler leadership acquired", metadata: {} });
  return lease;
}

export async function recoverMissedOperationsSchedules(actor: Actor) {
  assertPermission(actor.role, "approve");
  const due = await db.select().from(operationsSchedulers).where(and(eq(operationsSchedulers.householdId, actor.householdId), eq(operationsSchedulers.enabled, true), lte(operationsSchedulers.nextRunAt, new Date())));
  for (const schedule of due) {
    if (schedule.missedRunPolicy === "CATCH_UP") {
      await enqueueOperationsJob({ householdId: actor.householdId, kind: schedule.jobKind, payload: schedule.payload, jobKey: `schedule:${schedule.id}:${schedule.nextRunAt.toISOString()}`, correlationId: `schedule:${schedule.id}` });
    }
    await db.update(operationsSchedulers).set({ lastRunAt: schedule.nextRunAt, nextRunAt: new Date(Date.now() + 86_400_000), updatedAt: new Date() }).where(eq(operationsSchedulers.id, schedule.id));
  }
  return due.length;
}

export async function getOperationsOverview(actor: Actor) {
  const data = await loadOperations(actor);
  const activeAlerts = data.alerts.filter((item) => item.status === "ACTIVE" || item.status === "ACKNOWLEDGED");
  const pendingApprovals = data.approvals.filter((item) => item.status === "PENDING");
  const openTasks = data.tasks.filter((item) => !["COMPLETED", "DISMISSED", "EXPIRED"].includes(item.status));
  const overdueTasks = openTasks.filter((item) => item.dueDate < today()).length;
  const criticalAlerts = activeAlerts.filter((item) => item.severity === "CRITICAL").length;
  const automationFailures = data.jobs.filter((job) => ["FAILED", "DEAD_LETTERED"].includes(job.status)).length;
  const nextTask = [...openTasks].sort((a, b) => {
    const weight = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return (weight[a.priority as keyof typeof weight] ?? 4) - (weight[b.priority as keyof typeof weight] ?? 4) || a.dueDate.localeCompare(b.dueDate);
  })[0];
  return {
    today: {
      criticalAlerts,
      approvalsPending: pendingApprovals.length,
      tasksDue: openTasks.filter((item) => item.dueDate <= today()).length,
      billsDue: data.bills.filter((item) => ["upcoming", "due_soon", "overdue"].includes(item.status)).length,
      goalActions: openTasks.filter((item) => item.domain === "DUPLEX").length,
      propertyActions: openTasks.filter((item) => item.domain === "PROPERTY").length,
      securityActions: openTasks.filter((item) => item.domain === "SECURITY").length,
      reviewsScheduled: data.automations.filter((item) => item.nextRun && item.nextRun <= new Date(Date.now() + 7 * 86_400_000)).length,
    },
    nextBestAction: nextTask?.title ?? (pendingApprovals[0] ? `Review ${pendingApprovals[0].requestType}` : null),
    noActionRequired: openTasks.length === 0 && pendingApprovals.length === 0 && activeAlerts.length === 0,
    health: {
      score: calculateOperationsHealth({ overdueTasks, pendingApprovals: pendingApprovals.length, criticalAlerts, automationFailures }),
      overdueTasks,
      pendingApprovals: pendingApprovals.length,
      criticalAlerts,
      bills: data.bills.some((item) => item.status === "overdue") ? "Needs review" : "Current",
      accounting: activeAlerts.some((item) => item.domain === "ACCOUNTING") ? "Review queue open" : "Current",
      security: "Current",
      automationFailures,
    },
    tasks: data.tasks.map(taskResponse),
    approvals: data.approvals.map(approvalResponse),
    alerts: data.alerts.map(alertResponse),
    automations: data.automations.map(automationResponse),
    notifications: preferencesResponse(data.preferences),
  };
}

export async function listOperationsTasks(actor: Actor) {
  const data = await loadOperations(actor);
  return data.tasks.map(taskResponse);
}

export async function createOperationsTask(actor: Actor, input: {
  title: string;
  description: string;
  domain: string;
  priority: string;
  dueDate: string | Date;
  assignedTo?: string;
  requiresApproval?: boolean;
}) {
  assertPermission(actor.role, "contribute");
  const ids = await ensureTenantCore(actor.householdId, actor.userId);
  const [task] = await db.insert(operationsTasks).values({
    householdId: ids.householdId,
    title: input.title,
    description: input.description,
    domain: input.domain,
    priority: input.priority,
    dueDate: input.dueDate instanceof Date ? input.dueDate.toISOString().slice(0, 10) : input.dueDate,
    assignedTo: input.assignedTo,
    createdBy: actor.userId,
    source: "USER",
    requiresApproval: input.requiresApproval ?? false,
  }).returning();
  return taskResponse(task);
}

export async function updateOperationsTask(actor: Actor, taskId: string, input: { status?: string; assignedTo?: string }) {
  assertPermission(actor.role, "contribute");
  const ids = await ensureTenantCore(actor.householdId, actor.userId);
  const [existing] = await db.select().from(operationsTasks).where(and(eq(operationsTasks.id, taskId), eq(operationsTasks.householdId, ids.householdId))).limit(1);
  if (!existing) throw new GovernanceError("INVALID_STATE", "Operations task was not found");
  const [task] = await db.update(operationsTasks).set({
    status: input.status ?? existing.status,
    assignedTo: input.assignedTo ?? existing.assignedTo,
    completedAt: input.status === "COMPLETED" ? new Date() : existing.completedAt,
  }).where(and(
    eq(operationsTasks.id, taskId),
    eq(operationsTasks.householdId, ids.householdId),
  )).returning();
  return taskResponse(task);
}

export async function listOperationsApprovals(actor: Actor) {
  const data = await loadOperations(actor);
  return data.approvals.map(approvalResponse);
}

export async function decideOperationsApproval(actor: Actor, approvalId: string, input: { decision: string; reason: string }) {
  assertPermission(actor.role, "approve");
  const ids = await ensureTenantCore(actor.householdId, actor.userId);
  const [existing] = await db.select().from(operationsApprovals).where(and(eq(operationsApprovals.id, approvalId), eq(operationsApprovals.householdId, ids.householdId))).limit(1);
  if (!existing) throw new GovernanceError("INVALID_STATE", "Approval request was not found");
  if (existing.status !== "PENDING") throw new GovernanceError("INVALID_STATE", "Only pending approvals can be decided");
  const [approval] = await db.update(operationsApprovals).set({
    status: input.decision,
    decidedAt: new Date(),
  }).where(and(
    eq(operationsApprovals.id, approvalId),
    eq(operationsApprovals.householdId, ids.householdId),
  )).returning();
  return approvalResponse(approval);
}

export async function listOperationsAlerts(actor: Actor) {
  const data = await loadOperations(actor);
  return data.alerts.map(alertResponse);
}

export async function updateOperationsAlert(actor: Actor, alertId: string, status: string) {
  assertPermission(actor.role, "contribute");
  const ids = await ensureTenantCore(actor.householdId, actor.userId);
  const [existing] = await db.select().from(operationsAlerts).where(and(eq(operationsAlerts.id, alertId), eq(operationsAlerts.householdId, ids.householdId))).limit(1);
  if (!existing) throw new GovernanceError("INVALID_STATE", "Operations alert was not found");
  const [alert] = await db.update(operationsAlerts).set({
    status,
    resolvedAt: status === "RESOLVED" ? new Date() : existing.resolvedAt,
  }).where(and(
    eq(operationsAlerts.id, alertId),
    eq(operationsAlerts.householdId, ids.householdId),
  )).returning();
  return alertResponse(alert);
}

export async function listOperationsAutomations(actor: Actor) {
  const data = await loadOperations(actor);
  return data.automations.map(automationResponse);
}

export async function runOperationsAutomation(actor: Actor, automationId: string) {
  assertPermission(actor.role, "contribute");
  const ids = await ensureTenantCore(actor.householdId, actor.userId);
  const [automation] = await db.select().from(operationsAutomations).where(and(eq(operationsAutomations.id, automationId), eq(operationsAutomations.householdId, ids.householdId))).limit(1);
  if (!automation) throw new GovernanceError("INVALID_STATE", "Automation rule was not found");
  if (!automation.enabled) throw new GovernanceError("INVALID_STATE", "Automation rule is disabled");
  assertSafeAutomationAction(automation.action);
  const job = await enqueueOperationsJob({
    householdId: ids.householdId,
    kind: "SAFE_AUTOMATION",
    payload: { automationId: automation.id, action: automation.action },
    jobKey: `automation:${automation.id}:${randomUUID()}`,
  });
  const claimed = await claimNextOperationsJob(ids.householdId, `api:${actor.userId}`);
  if (!claimed || claimed.id !== job.id) throw new GovernanceError("INVALID_STATE", "Safe automation job could not be claimed");
  let run: typeof operationsRuns.$inferSelect;
  try {
    const startedAt = new Date();
    [run] = await db.insert(operationsRuns).values({
      householdId: ids.householdId,
      automationId: automation.id,
      result: "PREPARED",
      actionsCreated: [`${automation.action}: ${automation.name}`],
      errors: [],
      safeBoundary: "This run may create tasks, alerts, reviews, or reports only. No funds, orders, credentials, or ownership changed.",
      startedAt,
      completedAt: new Date(),
    }).returning();
    await db.update(operationsAutomations).set({ lastRun: run.completedAt }).where(and(
      eq(operationsAutomations.id, automation.id),
      eq(operationsAutomations.householdId, ids.householdId),
    ));
    await completeOperationsJob(claimed.id, ids.householdId, claimed.claimedBy ?? `api:${actor.userId}`);
  } catch (error) {
    await failOperationsJob(claimed.id, ids.householdId, claimed.claimedBy ?? `api:${actor.userId}`, error);
    throw error;
  }
  return {
    id: run.id,
    automationId: run.automationId,
    result: run.result,
    actionsCreated: run.actionsCreated,
    errors: run.errors,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    safeBoundary: run.safeBoundary,
  };
}

export async function getOperationsNotificationPreferences(actor: Actor) {
  const data = await loadOperations(actor);
  return preferencesResponse(data.preferences);
}

export async function updateOperationsNotificationPreferences(actor: Actor, input: Partial<{
  criticalAlerts: string[];
  bills: string[];
  budget: string[];
  duplexGoal: string[];
  property: string[];
  strategies: string[];
  accounting: string[];
  security: string[];
  weeklyReports: string[];
  monthlyReports: string[];
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}>) {
  assertPermission(actor.role, "contribute");
  const ids = await ensureTenantCore(actor.householdId, actor.userId);
  const [existing] = await db.select().from(operationsNotificationPreferences).where(and(eq(operationsNotificationPreferences.householdId, ids.householdId), eq(operationsNotificationPreferences.userId, ids.ownerId))).limit(1);
  if (!existing) throw new GovernanceError("INVALID_STATE", "Notification preferences are missing");
  const [updated] = await db.update(operationsNotificationPreferences).set({ ...input, updatedAt: new Date() }).where(and(
    eq(operationsNotificationPreferences.id, existing.id),
    eq(operationsNotificationPreferences.householdId, ids.householdId),
    eq(operationsNotificationPreferences.userId, actor.userId),
  )).returning();
  return preferencesResponse(updated);
}