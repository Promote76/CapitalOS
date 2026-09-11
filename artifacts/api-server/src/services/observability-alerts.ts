import { appendAuditEvent, appendAuditEvents } from "./audit";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  auditEvents,
  db,
  executionControls,
  guardianHeartbeats,
  observabilityAlertDeliveries,
  observabilityAlertDestinations,
  observabilityAlertIncidents,
  observabilityAlertRules,
  orderIntents,
  reconciliationRuns,
} from "@workspace/db";
import type { Actor } from "./capital-os";
import { assertPermission, GovernanceError } from "../domain/governance";
import {
  enqueueOperationsJob,
  getOperationsMetrics,
  getOperationsSchedulerMetrics,
} from "./operations";
import { metricSnapshot, setMetric } from "../observability/metrics";

const RULES = [
  ["database-not-ready", "database_readiness", "CRITICAL"],
  ["ledger-imbalance", "ledger_imbalance_total", "CRITICAL"],
  ["audit-persistence-failure", "audit_persistence_failure_total", "CRITICAL"],
  ["dead-letter-present", "dead_letter_count", "CRITICAL"],
  ["worker-heartbeat-stale", "stale_worker_count", "HIGH"],
  ["scheduler-heartbeat-stale", "scheduler_lag", "HIGH"],
  ["queue-age", "oldest_pending_job_age", "WARNING"],
  ["reconciliation-failure", "reconciliation_failure_total", "HIGH"],
  ["guardian-stop", "guardian_state", "CRITICAL"],
  ["execution-stop", "execution_state", "CRITICAL"],
  ["provider-auth-failure", "provider_auth_failure_total", "HIGH"],
  [
    "safe-to-deploy-failure",
    "safe_to_deploy_invariant_failure_total",
    "CRITICAL",
  ],
  ["certification-test-critical", "CERTIFICATION_TEST_CRITICAL", "CRITICAL"],
] as const;

export async function ensureObservabilityRules() {
  for (const [ruleKey, metric, severity] of RULES) {
    await db
      .insert(observabilityAlertRules)
      .values({ ruleKey, metric, severity })
      .onConflictDoNothing();
  }
}

/**
 * Safe runtime bootstrap: rules are policy rows, while a destination is only
 * created when an operator explicitly supplied its non-secret channel ID.
 * Never call the provider during startup and never persist credentials.
 */
export async function ensureObservabilityDefaults() {
  await ensureObservabilityRules();
  const configuredTarget = process.env.CAPITAL_OS_ALERT_SLACK_CHANNEL_ID?.trim();
  if (!configuredTarget) return { rules: true, destinationConfigured: false };
  await db.insert(observabilityAlertDestinations).values({
    name: "slack-critical",
    kind: "slack",
    target: configuredTarget,
  }).onConflictDoNothing({ target: observabilityAlertDestinations.name });
  return { rules: true, destinationConfigured: true };
}

async function slackTarget() {
  const configured = process.env.CAPITAL_OS_ALERT_SLACK_CHANNEL_ID?.trim();
  if (configured) return configured;
  const client = new ReplitConnectors();
  const response = await client.proxy("slack", "/api/auth.test");
  const body = (await response.json()) as { ok?: boolean; user_id?: string };
  if (!response.ok || body.ok !== true || !body.user_id)
    throw new Error("SLACK_AUTH_TEST_FAILED");
  const dmResponse = await client.proxy("slack", "/api/conversations.open", {
    method: "POST",
    body: { users: body.user_id },
  });
  const dm = (await dmResponse.json()) as {
    ok?: boolean;
    channel?: { id?: string };
    error?: string;
  };
  if (!dmResponse.ok || dm.ok !== true || !dm.channel?.id)
    throw new Error(`SLACK_DM_OPEN_${dm.error ?? dmResponse.status}`);
  return dm.channel.id;
}

async function destination(actor: Actor) {
  const [existing] = await db
    .select()
    .from(observabilityAlertDestinations)
    .where(eq(observabilityAlertDestinations.name, "slack-critical"))
    .limit(1);
  if (existing) return existing;
  const target = await slackTarget();
  const [created] = await db
    .insert(observabilityAlertDestinations)
    .values({ name: "slack-critical", target, createdBy: actor.userId })
    .returning();
  return created;
}

export async function deliverAlert(incidentId: string, actor: Actor) {
  const [incident] = await db
    .select()
    .from(observabilityAlertIncidents)
    .where(eq(observabilityAlertIncidents.id, incidentId))
    .limit(1);
  if (!incident)
    throw new GovernanceError("INVALID_STATE", "Alert incident is missing");
  const target = await destination(actor);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(observabilityAlertDeliveries)
    .where(eq(observabilityAlertDeliveries.incidentId, incident.id));
  const attempt = Number(count) + 1;
  const [delivery] = await db
    .insert(observabilityAlertDeliveries)
    .values({
      incidentId: incident.id,
      destinationId: target.id,
      attempt,
      correlationId: incident.correlationId,
      status: "ATTEMPTING",
      attemptedAt: new Date(),
    })
    .returning();
  try {
    if (
      process.env.CAPITAL_OS_CERTIFICATION_MODE === "1" &&
      process.env.CAPITAL_OS_ALERT_DELIVERY_MODE === "fail"
    ) {
      throw new Error("CERTIFICATION_TEMPORARY_DESTINATION_FAILURE");
    }
    const client = new ReplitConnectors();
    const response = await client.proxy("slack", "/api/chat.postMessage", {
      method: "POST",
      body: {
        channel: target.target,
        text: `[Capital OS ${incident.severity}] ${incident.status} incident ${incident.id}`,
      },
    });
    const body = (await response.json()) as {
      ok?: boolean;
      ts?: string;
      error?: string;
    };
    if (!response.ok || body.ok !== true)
      throw new Error(`SLACK_${body.error ?? response.status}`);
    await db
      .update(observabilityAlertDeliveries)
      .set({
        status: "DELIVERED",
        deliveredAt: new Date(),
        providerReceipt: body.ts ?? "confirmed",
      })
      .where(eq(observabilityAlertDeliveries.id, delivery.id));
    return { ...delivery, status: "DELIVERED" };
  } catch (error) {
    const errorCode =
      error instanceof Error
        ? error.message.replace(/[^A-Z0-9_]/g, "_").slice(0, 80)
        : "DELIVERY_FAILED";
    const terminal = attempt >= 3;
    await db
      .update(observabilityAlertDeliveries)
      .set({ status: terminal ? "DEAD_LETTER" : "RETRY_PENDING", errorCode })
      .where(eq(observabilityAlertDeliveries.id, delivery.id));
    if (!terminal)
      await enqueueOperationsJob({
        householdId: actor.householdId,
        kind: "ALERT_DELIVERY",
        payload: { incidentId },
        maxAttempts: 3,
        idempotencyKey: `alert-delivery:${incident.id}:${attempt}`,
      });
    return {
      ...delivery,
      status: terminal ? "DEAD_LETTER" : "RETRY_PENDING",
      errorCode,
    };
  }
}

export async function triggerObservabilityAlert(
  actor: Actor,
  ruleKey: string,
  correlationId?: string,
) {
  assertPermission(actor.role, "approve");
  await ensureObservabilityRules();
  const [rule] = await db
    .select()
    .from(observabilityAlertRules)
    .where(
      and(
        eq(observabilityAlertRules.ruleKey, ruleKey),
        eq(observabilityAlertRules.enabled, true),
      ),
    )
    .limit(1);
  if (!rule)
    throw new GovernanceError("INVALID_STATE", "Enabled alert rule is missing");
  const cutoff = new Date(Date.now() - rule.dedupeWindowSeconds * 1000);
  const [open] = await db
    .select()
    .from(observabilityAlertIncidents)
    .where(
      and(
        eq(observabilityAlertIncidents.ruleId, rule.id),
        eq(observabilityAlertIncidents.householdId, actor.householdId),
        eq(observabilityAlertIncidents.status, "OPEN"),
      ),
    )
    .orderBy(desc(observabilityAlertIncidents.lastSeenAt))
    .limit(1);
  let incident = open;
  if (open && open.lastSeenAt >= cutoff) {
    [incident] = await db
      .update(observabilityAlertIncidents)
      .set({
        occurrenceCount: open.occurrenceCount + 1,
        lastSeenAt: new Date(),
      })
      .where(eq(observabilityAlertIncidents.id, open.id))
      .returning();
  } else {
    [incident] = await db
      .insert(observabilityAlertIncidents)
      .values({
        ruleId: rule.id,
        householdId: actor.householdId,
        severity: rule.severity,
        correlationId,
      })
      .returning();
  }
  await appendAuditEvent({
      householdId: actor.householdId,
      eventType: "observability_alert_triggered",
      actor: actor.userId,
      entity: "observability_incident",
      entityId: incident.id,
      reason: "Authorized deterministic observability alert",
      metadata: { ruleKey, severity: rule.severity },
    });
  return { incident, delivery: await deliverAlert(incident.id, actor) };
}

export async function resolveObservabilityAlert(
  actor: Actor,
  incidentId: string,
  note: string,
) {
  assertPermission(actor.role, "approve");
  const [incident] = await db
    .update(observabilityAlertIncidents)
    .set({
      status: "RESOLVED",
      resolvedAt: new Date(),
      resolvedBy: actor.userId,
      note,
    })
    .where(
      and(
        eq(observabilityAlertIncidents.id, incidentId),
        eq(observabilityAlertIncidents.householdId, actor.householdId),
        eq(observabilityAlertIncidents.status, "OPEN"),
      ),
    )
    .returning();
  if (!incident)
    throw new GovernanceError(
      "INVALID_STATE",
      "Only an open household incident can be resolved",
    );
  await appendAuditEvent({
      householdId: actor.householdId,
      eventType: "observability_alert_resolved",
      actor: actor.userId,
      entity: "observability_incident",
      entityId: incident.id,
      reason: "Authorized alert resolution",
      metadata: {},
    });
  await deliverAlert(incident.id, actor);
  return incident;
}

export async function listObservabilityIncidents(actor: Actor) {
  assertPermission(actor.role, "read");
  const [incidents, rules] = await Promise.all([
    db
      .select()
      .from(observabilityAlertIncidents)
      .where(eq(observabilityAlertIncidents.householdId, actor.householdId))
      .orderBy(desc(observabilityAlertIncidents.lastSeenAt)),
    db.select().from(observabilityAlertRules),
  ]);
  const ruleById = new Map(rules.map((rule) => [rule.id, rule]));
  return incidents.map((incident) => {
    const rule = ruleById.get(incident.ruleId);
    return {
      ...incident,
      type: rule?.ruleKey ?? "system-event",
      message: rule
        ? `${rule.metric} crossed its deterministic ${rule.severity.toLowerCase()} threshold`
        : "Deterministic observability rule triggered",
      createdAt: incident.openedAt,
      resolutionNote: incident.note,
    };
  });
}

export async function listObservabilityDestinations(actor: Actor) {
  assertPermission(actor.role, "read");
  return db.select({
    name: observabilityAlertDestinations.name,
    kind: observabilityAlertDestinations.kind,
    enabled: observabilityAlertDestinations.enabled,
    updatedAt: observabilityAlertDestinations.updatedAt,
  }).from(observabilityAlertDestinations);
}

export async function listObservabilityRules(actor: Actor) {
  assertPermission(actor.role, "read");
  return db.select({
    ruleKey: observabilityAlertRules.ruleKey,
    metric: observabilityAlertRules.metric,
    severity: observabilityAlertRules.severity,
    threshold: observabilityAlertRules.threshold,
    dedupeWindowSeconds: observabilityAlertRules.dedupeWindowSeconds,
    enabled: observabilityAlertRules.enabled,
    updatedAt: observabilityAlertRules.updatedAt,
  }).from(observabilityAlertRules);
}

export async function listObservabilityDeliveries(
  actor: Actor,
  incidentId: string,
) {
  assertPermission(actor.role, "read");
  const [incident] = await db
    .select({ id: observabilityAlertIncidents.id })
    .from(observabilityAlertIncidents)
    .where(
      and(
        eq(observabilityAlertIncidents.id, incidentId),
        eq(observabilityAlertIncidents.householdId, actor.householdId),
      ),
    )
    .limit(1);
  if (!incident)
    throw new GovernanceError("INVALID_STATE", "Alert incident is missing");
  const [deliveries, destinations] = await Promise.all([
    db
      .select()
      .from(observabilityAlertDeliveries)
      .where(eq(observabilityAlertDeliveries.incidentId, incidentId))
      .orderBy(desc(observabilityAlertDeliveries.attempt)),
    db.select().from(observabilityAlertDestinations),
  ]);
  const destinationById = new Map(
    destinations.map((destination) => [destination.id, destination]),
  );
  return deliveries.map((delivery) => ({
    ...delivery,
    destination:
      destinationById.get(delivery.destinationId)?.name ?? "named-destination",
    status: ["RETRY_PENDING", "DEAD_LETTER"].includes(delivery.status)
      ? "FAILED"
      : delivery.status,
    timestamp:
      delivery.deliveredAt ?? delivery.attemptedAt ?? delivery.createdAt,
  }));
}

export async function reprocessObservabilityAlert(
  actor: Actor,
  incidentId: string,
) {
  assertPermission(actor.role, "approve");
  const [incident] = await db
    .select({ id: observabilityAlertIncidents.id })
    .from(observabilityAlertIncidents)
    .where(
      and(
        eq(observabilityAlertIncidents.id, incidentId),
        eq(observabilityAlertIncidents.householdId, actor.householdId),
      ),
    )
    .limit(1);
  if (!incident)
    throw new GovernanceError("INVALID_STATE", "Alert incident is missing");
  await appendAuditEvent({
    householdId: actor.householdId,
    eventType: "observability_alert_delivery_reprocessed",
    actor: actor.userId,
    entity: "observability_incident",
    entityId: incidentId,
    reason: "Authorized alert delivery replay",
    metadata: {},
  });
  return deliverAlert(incidentId, actor);
}

export async function evaluateObservabilityMetric(
  actor: Actor,
  metric: string,
  value: number,
  correlationId?: string,
) {
  assertPermission(actor.role, "approve");
  await ensureObservabilityRules();
  const rules = await db
    .select()
    .from(observabilityAlertRules)
    .where(
      and(
        eq(observabilityAlertRules.metric, metric),
        eq(observabilityAlertRules.enabled, true),
      ),
    );
  const results = [];
  for (const rule of rules) {
    const breached =
      metric === "database_readiness"
        ? value < rule.threshold
        : value >= rule.threshold;
    if (breached) {
      results.push(
        await triggerObservabilityAlert(actor, rule.ruleKey, correlationId),
      );
      continue;
    }
    const [open] = await db
      .select()
      .from(observabilityAlertIncidents)
      .where(
        and(
          eq(observabilityAlertIncidents.ruleId, rule.id),
          eq(observabilityAlertIncidents.householdId, actor.householdId),
          eq(observabilityAlertIncidents.status, "OPEN"),
        ),
      )
      .limit(1);
    if (open)
      results.push({
        incident: await resolveObservabilityAlert(
          actor,
          open.id,
          "Metric recovered below alert threshold",
        ),
      });
  }
  return results;
}

export async function projectObservabilityMetrics(actor: Actor) {
  assertPermission(actor.role, "read");
  const [
    queue,
    scheduler,
    controlRows,
    guardianRows,
    unknownOrders,
    openOrders,
    reconciliationFailures,
  ] = await Promise.all([
    getOperationsMetrics(actor.householdId),
    getOperationsSchedulerMetrics(actor.householdId),
    db
      .select()
      .from(executionControls)
      .where(eq(executionControls.householdId, actor.householdId))
      .limit(1),
    db
      .select()
      .from(guardianHeartbeats)
      .where(eq(guardianHeartbeats.householdId, actor.householdId))
      .orderBy(desc(guardianHeartbeats.lastHeartbeatAt))
      .limit(1),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(orderIntents)
      .where(
        and(
          eq(orderIntents.householdId, actor.householdId),
          eq(orderIntents.state, "UNKNOWN"),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(orderIntents)
      .where(
        and(
          eq(orderIntents.householdId, actor.householdId),
          sql`${orderIntents.state} not in ('FILLED', 'CANCELLED', 'REJECTED')`,
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(reconciliationRuns)
      .where(
        and(
          eq(reconciliationRuns.householdId, actor.householdId),
          eq(reconciliationRuns.status, "FAILURE"),
        ),
      ),
  ]);
  setMetric("queue_depth", queue.queueDepth);
  setMetric("oldest_pending_job_age", queue.oldestPendingJobAgeMs);
  setMetric("retry_queue_depth", queue.retryQueueDepth);
  setMetric("dead_letter_count", queue.deadLetterCount);
  setMetric("active_worker_count", queue.activeWorkerCount);
  setMetric("stale_worker_count", queue.staleWorkerCount);
  setMetric("worker_heartbeat_age", queue.workerHeartbeatAgeMs);
  setMetric("job_execution_duration", queue.jobExecutionDurationMs);
  setMetric("job_failure_count", queue.jobFailureCount);
  setMetric("job_retry_count", queue.jobRetryCount);
  setMetric("recovered_job_count", queue.recoveredJobCount);
  setMetric("scheduler_heartbeat", scheduler.schedulerHeartbeat ? 1 : 0);
  setMetric("scheduler_leader", scheduler.schedulerLeader ? 1 : 0);
  setMetric("scheduler_lag", scheduler.schedulerLagMs);
  setMetric("missed_schedule_count", scheduler.missedScheduleCount);
  setMetric("schedule_recovery_count", scheduler.scheduleRecoveryCount);
  const executionState = controlRows[0]?.state ?? "DISABLED";
  setMetric("execution_state", 1, { state: executionState.toLowerCase() });
  const guardianState = guardianRows[0]?.status ?? "STOP";
  setMetric("guardian_state", guardianState === "HEALTHY" ? 1 : 0, {
    state: guardianState.toLowerCase(),
  });
  setMetric("risk_governor_state", executionState === "ACTIVE" ? 1 : 0, {
    state: executionState === "ACTIVE" ? "permitted" : "blocked",
  });
  setMetric("oms_unknown_orders", Number(unknownOrders[0]?.count ?? 0));
  setMetric("open_order_intents", Number(openOrders[0]?.count ?? 0));
  setMetric(
    "reconciliation_failure_total",
    Number(reconciliationFailures[0]?.count ?? 0),
  );
  setMetric("micro_live_enabled", 0);
  setMetric("micro_live_eligible", 0);
  setMetric("micro_live_guardian_health", guardianState === "HEALTHY" ? 1 : 0);
  setMetric(
    "micro_live_reconciliation_health",
    Number(reconciliationFailures[0]?.count ?? 0) === 0 ? 1 : 0,
  );
  setMetric("provider_health", 1, { provider: "fixture" });
  setMetric("bank_connection_status", 0, { provider: "disabled" });
  return {
    queue,
    scheduler,
    execution: {
      state: executionState,
      guardian: guardianState,
      riskGovernor: executionState === "ACTIVE" ? "PERMITTED" : "BLOCKED",
      unknownOrders: Number(unknownOrders[0]?.count ?? 0),
      openOrderIntents: Number(openOrders[0]?.count ?? 0),
      reconciliationFailures: Number(reconciliationFailures[0]?.count ?? 0),
      microLive: "DISABLED",
    },
    metrics: metricSnapshot(),
  };
}

/** Narrow worker extension: the persisted job contains only an incident UUID. */
export async function dispatchQueuedAlertDelivery(
  householdId: string,
  incidentId: string,
) {
  const [incident] = await db
    .select()
    .from(observabilityAlertIncidents)
    .where(
      and(
        eq(observabilityAlertIncidents.id, incidentId),
        eq(observabilityAlertIncidents.householdId, householdId),
      ),
    )
    .limit(1);
  if (!incident) throw new Error("ALERT_INCIDENT_NOT_FOUND");
  const [existingDestination] = await db
    .select()
    .from(observabilityAlertDestinations)
    .where(eq(observabilityAlertDestinations.name, "slack-critical"))
    .limit(1);
  if (!existingDestination) throw new Error("ALERT_DESTINATION_NOT_CONFIGURED");
  return deliverAlert(incidentId, {
    householdId,
    userId: existingDestination.createdBy ?? "system",
    role: "owner",
    permissions: ["approve"],
    source: "test-seed",
  });
}
