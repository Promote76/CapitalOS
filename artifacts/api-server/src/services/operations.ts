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
  operationsRuns,
  operationsTasks,
} from "@workspace/db/schema";
import type { Actor } from "./capital-os";
import { ensureTenantCore } from "./seed";
import { assertPermission, GovernanceError } from "../domain/governance";
import { assertSafeAutomationAction, calculateOperationsHealth } from "../domain/operations";

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

export async function enqueueOperationsJob(input: {
  householdId: string;
  kind: string;
  payload?: OperationsJobPayload;
  jobKey?: string;
  maxAttempts?: number;
}) {
  const [job] = await db.insert(operationsJobs).values({
    householdId: input.householdId,
    jobKey: input.jobKey ?? randomUUID(),
    kind: input.kind,
    payload: input.payload ?? {},
    maxAttempts: input.maxAttempts ?? 3,
    status: "QUEUED",
  }).returning();
  return job;
}

export async function claimNextOperationsJob(householdId: string, workerId: string) {
  return db.transaction(async (tx) => {
    const [job] = await tx.select().from(operationsJobs).where(and(
      eq(operationsJobs.householdId, householdId),
      eq(operationsJobs.status, "QUEUED"),
      lte(operationsJobs.availableAt, new Date()),
    )).orderBy(asc(operationsJobs.availableAt), asc(operationsJobs.createdAt)).limit(1).for("update", { skipLocked: true });
    if (!job) return null;
    const [claimed] = await tx.update(operationsJobs).set({
      status: "RUNNING",
      attempts: job.attempts + 1,
      claimedAt: new Date(),
      claimedBy: workerId,
      updatedAt: new Date(),
    }).where(and(eq(operationsJobs.id, job.id), eq(operationsJobs.status, "QUEUED"))).returning();
    return claimed ?? null;
  });
}

export async function completeOperationsJob(jobId: string, householdId: string) {
  const [job] = await db.update(operationsJobs).set({
    status: "COMPLETED",
    completedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(eq(operationsJobs.id, jobId), eq(operationsJobs.householdId, householdId), eq(operationsJobs.status, "RUNNING"))).returning();
  return job ?? null;
}

export async function failOperationsJob(jobId: string, householdId: string, error: unknown) {
  const [existing] = await db.select().from(operationsJobs).where(and(eq(operationsJobs.id, jobId), eq(operationsJobs.householdId, householdId))).limit(1);
  if (!existing) return null;
  const message = error instanceof Error ? error.message : "Operations job failed";
  const terminal = existing.attempts >= existing.maxAttempts;
  const [job] = await db.update(operationsJobs).set({
    status: terminal ? "DEAD_LETTERED" : "FAILED",
    availableAt: terminal ? existing.availableAt : new Date(Date.now() + Math.min(60_000, 2 ** existing.attempts * 1_000)),
    lastError: message,
    deadLetterReason: terminal ? message : null,
    updatedAt: new Date(),
  }).where(and(eq(operationsJobs.id, jobId), eq(operationsJobs.householdId, householdId))).returning();
  return job ?? null;
}

export async function recoverStaleOperationsJobs(householdId: string, staleAfterMs = 5 * 60_000) {
  const cutoff = new Date(Date.now() - staleAfterMs);
  return db.update(operationsJobs).set({
    status: "QUEUED",
    claimedAt: null,
    claimedBy: null,
    availableAt: new Date(),
    updatedAt: new Date(),
  }).where(and(
    eq(operationsJobs.householdId, householdId),
    eq(operationsJobs.status, "RUNNING"),
    lte(operationsJobs.claimedAt, cutoff),
  )).returning();
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
    await completeOperationsJob(claimed.id, ids.householdId);
  } catch (error) {
    await failOperationsJob(claimed.id, ids.householdId, error);
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