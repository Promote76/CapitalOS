import { and, desc, eq, sql } from "drizzle-orm";
import {
  auditEvents,
  db,
  executionControls,
  idempotencyKeys,
  riskStates,
  guardianHeartbeats,
  type ExecutionControlState,
} from "@workspace/db";
import type { Actor } from "./capital-os";
import {
  allowedExecutionTransitions,
  canTransitionExecutionState,
  executionStateAllowsNewOrder,
  isExecutionControlState,
  type ExecutionControlState as DomainExecutionControlState,
} from "../domain/execution-control";
import { GovernanceError, assertPermission } from "../domain/governance";

type CommandInput = {
  reason: string;
  correlationId?: string | null;
  idempotencyKey?: string | null;
};

function stateOf(value: string): DomainExecutionControlState {
  if (!isExecutionControlState(value)) {
    throw new GovernanceError("RISK_BLOCKED", "Execution control state is unknown; new execution is denied");
  }
  return value;
}

function commandOperation(target: DomainExecutionControlState) {
  return `execution_control:${target}`;
}

function serializeControl(control: typeof executionControls.$inferSelect, idempotent = false) {
  const state = stateOf(control.state);
  return {
    id: control.id,
    householdId: control.householdId,
    state,
    version: control.version,
    reason: control.reason,
    changedBy: control.changedBy,
    changedAt: control.changedAt.toISOString(),
    correlationId: control.correlationId,
    createdAt: control.createdAt.toISOString(),
    updatedAt: control.updatedAt.toISOString(),
    availableTransitions: allowedExecutionTransitions(state),
    executionPermitted: executionStateAllowsNewOrder(state),
    idempotent,
  };
}

async function ensureControl(householdId: string) {
  const [existing] = await db.select().from(executionControls)
    .where(eq(executionControls.householdId, householdId))
    .limit(1);
  if (existing) return existing;
  const [created] = await db.insert(executionControls).values({
    householdId,
    state: "DISABLED",
    reason: "Execution control initialized fail-closed",
  }).onConflictDoNothing({ target: executionControls.householdId }).returning();
  if (created) return created;
  const [raced] = await db.select().from(executionControls)
    .where(eq(executionControls.householdId, householdId))
    .limit(1);
  if (!raced) throw new GovernanceError("RISK_BLOCKED", "Execution control state is unavailable");
  return raced;
}

export async function getExecutionControl(actor: Actor) {
  try {
    return serializeControl(await ensureControl(actor.householdId));
  } catch (error) {
    if (error instanceof GovernanceError) throw error;
    throw new GovernanceError("RISK_BLOCKED", "Execution control state is unavailable");
  }
}

async function transition(
  actor: Actor,
  target: DomainExecutionControlState,
  input: CommandInput,
) {
  const idempotencyKey = input.idempotencyKey?.trim() || null;
  if (idempotencyKey && idempotencyKey.length > 200) {
    throw new GovernanceError("INVALID_STATE", "Execution command idempotency key is too long");
  }

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`execution-control:${actor.householdId}`}, 0))`);
    const [current] = await tx.select().from(executionControls)
      .where(eq(executionControls.householdId, actor.householdId))
      .limit(1);
    const control = current ?? (await tx.insert(executionControls).values({
      householdId: actor.householdId,
      state: "DISABLED",
      reason: "Execution control initialized fail-closed",
    }).returning())[0];
    if (!control) throw new GovernanceError("RISK_BLOCKED", "Execution control state is unavailable");

    if (idempotencyKey) {
      const [existingKey] = await tx.select().from(idempotencyKeys).where(and(
        eq(idempotencyKeys.householdId, actor.householdId),
        eq(idempotencyKeys.key, idempotencyKey),
      )).limit(1);
      if (existingKey) {
        if (existingKey.operation !== commandOperation(target)) {
          throw new GovernanceError("IDEMPOTENCY_CONFLICT", "Execution command idempotency key was already used for another command");
        }
        const replay = serializeControl(control, true);
        await tx.insert(auditEvents).values({
          householdId: actor.householdId,
          eventType: "execution_control_transition_attempt",
          actor: actor.userId,
          entity: "execution_control",
          entityId: control.id,
          beforeState: { state: control.state, version: control.version },
          afterState: { state: control.state, version: control.version },
          reason: input.reason,
          metadata: {
            requestedState: target,
            result: "IDEMPOTENT_REPLAY",
            correlationId: input.correlationId ?? null,
            idempotencyKey,
          },
        });
        return replay;
      }
    }

    const from = stateOf(control.state);
    if (!canTransitionExecutionState(from, target)) {
      await tx.insert(auditEvents).values({
        householdId: actor.householdId,
        eventType: "execution_control_transition_attempt",
        actor: actor.userId,
        entity: "execution_control",
        entityId: control.id,
        beforeState: { state: from, version: control.version },
        afterState: { state: from, version: control.version },
        reason: input.reason,
        metadata: {
          requestedState: target,
          result: "DENIED_INVALID_TRANSITION",
          correlationId: input.correlationId ?? null,
          idempotencyKey,
        },
      });
      return { denied: true as const, from };
    }

    const now = new Date();
    const nextVersion = from === target ? control.version : control.version + 1;
    const [updated] = await tx.update(executionControls).set({
      state: target,
      version: nextVersion,
      reason: input.reason,
      changedBy: actor.userId,
      changedAt: now,
      correlationId: input.correlationId ?? null,
      idempotencyKey,
      updatedAt: now,
    }).where(and(
      eq(executionControls.id, control.id),
      eq(executionControls.householdId, actor.householdId),
      eq(executionControls.version, control.version),
    )).returning();
    if (!updated) throw new GovernanceError("RISK_BLOCKED", "Execution control changed concurrently; retry safely");

    await tx.insert(auditEvents).values({
      householdId: actor.householdId,
      eventType: "execution_control_transition_attempt",
      actor: actor.userId,
      entity: "execution_control",
      entityId: control.id,
      beforeState: { state: from, version: control.version },
      afterState: { state: target, version: nextVersion },
      reason: input.reason,
      metadata: {
        requestedState: target,
        result: from === target ? "NOOP" : "APPLIED",
        correlationId: input.correlationId ?? null,
        idempotencyKey,
      },
    });
    if (idempotencyKey) {
      await tx.insert(idempotencyKeys).values({
        householdId: actor.householdId,
        key: idempotencyKey,
        operation: commandOperation(target),
        responseStatus: 200,
        responseBody: serializeControl(updated),
      });
    }
    if (target === "STOP" || target === "EVACUATE" || target === "LOCKED") {
      await tx.update(riskStates).set({
        state: "locked",
        emergencyStopActive: true,
        updatedAt: new Date(),
      }).where(eq(riskStates.householdId, actor.householdId));
    } else if (target === "DISABLED") {
      await tx.update(riskStates).set({
        state: "normal",
        emergencyStopActive: false,
        updatedAt: new Date(),
      }).where(eq(riskStates.householdId, actor.householdId));
    }
    return serializeControl(updated);
  });
  if ("denied" in result) {
    throw new GovernanceError("INVALID_STATE", `Execution control cannot transition from ${result.from} to ${target}`);
  }
  return result;
}

export async function requestExecutionStop(actor: Actor, input: CommandInput) {
  assertPermission(actor.role, "manage_risk");
  return transition(actor, "STOP", input);
}

export async function requestExecutionSafeMode(actor: Actor, input: CommandInput) {
  assertPermission(actor.role, "manage_risk");
  return transition(actor, "SAFE_MODE", input);
}

export async function requestExecutionEvacuate(actor: Actor, input: CommandInput) {
  assertPermission(actor.role, "manage_risk");
  return transition(actor, "EVACUATE", input);
}

export async function recoverExecutionControl(actor: Actor, input: CommandInput) {
  if (actor.role !== "owner") {
    throw new GovernanceError("FORBIDDEN", "Only the household owner may recover execution control");
  }
  return transition(actor, "DISABLED", input);
}

export async function armExecutionControl(actor: Actor, correlationId?: string | null) {
  assertPermission(actor.role, "approve");
  const current = await ensureControl(actor.householdId);
  const currentState = stateOf(current.state);
  if (currentState === "STOP" || currentState === "EVACUATE" || currentState === "LOCKED") {
    throw new GovernanceError("RISK_BLOCKED", `Execution control is ${currentState}; explicit recovery is required before arming`);
  }
  if (currentState === "MICRO_LIVE_ARMED" || currentState === "MICRO_LIVE_ACTIVE") {
    return serializeControl(current, true);
  }
  const eligible = currentState === "DISABLED"
    ? await transition(actor, "MICRO_LIVE_ELIGIBLE", {
      reason: "Micro-Live arming gates passed; execution remains non-active",
      correlationId,
    })
    : serializeControl(current, true);
  return transition(actor, "MICRO_LIVE_ARMED", {
    reason: "Human-controlled Micro-Live arming completed; executable activation remains separate",
    correlationId,
  });
}

export async function assertExecutionPermitted(actor: Actor) {
  try {
    const control = await ensureControl(actor.householdId);
    const state = stateOf(control.state);
    if (!executionStateAllowsNewOrder(state)) {
      throw new GovernanceError("RISK_BLOCKED", `Execution control is ${state}; new order intents are denied`);
    }
    if (Date.now() - control.updatedAt.getTime() > 5 * 60 * 1000) {
      throw new GovernanceError("RISK_BLOCKED", "Execution control state is stale; new order intents are denied");
    }
    const [heartbeat] = await db.select().from(guardianHeartbeats)
      .where(eq(guardianHeartbeats.householdId, actor.householdId))
      .orderBy(desc(guardianHeartbeats.lastHeartbeatAt))
      .limit(1);
    const heartbeatHealthy = Boolean(
      heartbeat &&
      heartbeat.status === "HEALTHY" &&
      heartbeat.signatureValid &&
      Date.now() - heartbeat.lastHeartbeatAt.getTime() <= 3000,
    );
    const guardianAgrees = Boolean(
      heartbeat &&
      Number(heartbeat.observedExposure) === Number(heartbeat.reportedExposure),
    );
    const [risk] = await db.select().from(riskStates)
      .where(eq(riskStates.householdId, actor.householdId))
      .limit(1);
    if (!heartbeatHealthy || !guardianAgrees || !risk || risk.emergencyStopActive || risk.state !== "normal") {
      throw new GovernanceError("RISK_BLOCKED", "Guardian, risk, or capital governor does not permit execution");
    }
    return control;
  } catch (error) {
    if (error instanceof GovernanceError) throw error;
    throw new GovernanceError("RISK_BLOCKED", "Execution control is unavailable; new execution is denied");
  }
}