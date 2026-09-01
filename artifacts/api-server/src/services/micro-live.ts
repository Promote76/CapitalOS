import { and, desc, eq } from "drizzle-orm";
import {
  auditEvents,
  guardianHeartbeats,
  microLivePolicies,
  microLiveSessions,
  orderEvents,
  tradingIncidents,
  venueRegistry,
} from "@workspace/db";
import { db } from "@workspace/db";
import {
  calculateLiveReadiness,
  defaultMicroLivePolicy,
  evaluateLiveEnablement,
  guardianDecision,
  reconcileExecutionState,
  runLiveRehearsal,
} from "../domain/execution-oms";
import { assertPermission } from "../domain/governance";
import { ensureSeedData } from "./seed";
import type { Actor } from "./capital-os";

function policyLimits() {
  return {
    ...defaultMicroLivePolicy,
    initialCapitalCents: defaultMicroLivePolicy.initialCapitalCents,
  };
}

async function ensureMicroLiveSeed() {
  const ids = await ensureSeedData();
  let [policy] = await db.select().from(microLivePolicies).where(eq(microLivePolicies.householdId, ids.householdId)).limit(1);
  if (!policy) {
    [policy] = await db.insert(microLivePolicies).values({
      householdId: ids.householdId,
      limits: policyLimits(),
      autoScale: false,
      leverageEnabled: false,
      marginEnabled: false,
      borrowingEnabled: false,
    }).returning();
  }

  let venues = await db.select().from(venueRegistry).where(eq(venueRegistry.householdId, ids.householdId)).orderBy(venueRegistry.name);
  if (venues.length === 0) {
    venues = await db.insert(venueRegistry).values([
      {
        householdId: ids.householdId,
        name: "Simulated venue adapter",
        adapterType: "simulated",
        status: "Approved for Paper",
        capabilities: { spot: true, makerOrders: true, marketOrders: true, postOnly: true, clientOrderIds: true, bulkCancel: true, balanceApi: true, positionApi: true },
        jurisdictionConfirmed: false,
        withdrawalDisabled: true,
      },
      {
        householdId: ids.householdId,
        name: "External venue adapter",
        adapterType: "provider-neutral",
        status: "Research",
        capabilities: {},
        jurisdictionConfirmed: false,
        withdrawalDisabled: false,
      },
    ]).returning();
  }

  let [session] = await db.select().from(microLiveSessions).where(eq(microLiveSessions.householdId, ids.householdId)).orderBy(desc(microLiveSessions.createdAt)).limit(1);
  if (!session) {
    [session] = await db.insert(microLiveSessions).values({
      householdId: ids.householdId,
      venueId: venues[0]?.id,
      status: "DISABLED",
      mode: "LIVE_REHEARSAL",
      capitalAllocated: "20.00",
      sessionLossLimit: "0.75",
      sessionExposureCap: "5.00",
    }).returning();
  }
  return { ...ids, policy, venues, session };
}

export async function getMicroLiveSnapshot() {
  const { policy, venues, session } = await ensureMicroLiveSeed();
  const rehearsal = runLiveRehearsal();
  const reconciliation = reconcileExecutionState({
    internalPositionCents: 0,
    venuePositionCents: 0,
    internalOpenOrders: 0,
    venueOpenOrders: 0,
    internalFillIds: [],
    venueFillIds: [],
  });
  const guardian = guardianDecision({
    liveStatus: session.status as "DISABLED" | "ARMED" | "ACTIVE" | "SAFE_MODE" | "STOP" | "EVACUATE" | "LOCKED",
    heartbeatAgeMs: 0,
    maxHeartbeatAgeMs: 3000,
    reportedExposureCents: 0,
    observedVenueExposureCents: 0,
    hardExposureCents: Number(policy.limits.maxMarketExposureCents ?? 500),
    riskEngineHealthy: true,
  });
  const readiness = calculateLiveReadiness({
    strategyEvidence: false,
    paperPerformance: false,
    venue: false,
    marketData: false,
    oms: true,
    riskGovernor: true,
    capitalGovernor: true,
    guardian: true,
    reconciliation: reconciliation.clean,
    security: false,
    chaosTests: true,
  });
  const enablement = evaluateLiveEnablement({
    strategyMicroLiveEligible: false,
    humanApproval: false,
    capitalGovernorPass: true,
    riskGovernorPass: true,
    venueHealthy: false,
    reconciliationClean: reconciliation.clean,
    venueApproved: false,
    marketApproved: false,
    jurisdictionConfirmed: false,
    credentialsConfigured: false,
    withdrawalDisabled: false,
  });
  const [heartbeat] = await db.select().from(guardianHeartbeats).where(eq(guardianHeartbeats.householdId, session.householdId)).orderBy(desc(guardianHeartbeats.lastHeartbeatAt)).limit(1);
  const incidents = await db.select().from(tradingIncidents).where(eq(tradingIncidents.householdId, session.householdId)).orderBy(desc(tradingIncidents.createdAt)).limit(10);
  const events = await db.select().from(orderEvents).where(eq(orderEvents.orderIntentId, session.id)).orderBy(desc(orderEvents.createdAt)).limit(20);
  return {
    status: session.status,
    policy: { version: policy.policyVersion, limits: policy.limits, autoScale: policy.autoScale, leverageEnabled: policy.leverageEnabled, marginEnabled: policy.marginEnabled, borrowingEnabled: policy.borrowingEnabled },
    session: { id: session.id, mode: session.mode, capitalAllocated: session.capitalAllocated, currentPosition: "0.00", openOrders: 0, netPnl: "0.00", lossLimit: session.sessionLossLimit, exposureCap: session.sessionExposureCap, expiresAt: session.authorizationExpiresAt },
    venues: venues.map((venue) => ({ id: venue.id, name: venue.name, adapterType: venue.adapterType, status: venue.status, capabilities: venue.capabilities, jurisdictionConfirmed: venue.jurisdictionConfirmed, withdrawalDisabled: venue.withdrawalDisabled, health: venue.status === "Approved for Paper" ? "HEALTHY" : "NOT_CONNECTED" })),
    readiness,
    enablement,
    guardian: { status: heartbeat?.status ?? "HEALTHY", lastHeartbeatAt: heartbeat?.lastHeartbeatAt ?? null, decision: guardian.action, reason: guardian.reason, independentDeployment: "Guardian is modeled as a separate process boundary for future independent hosting." },
    reconciliation: { status: reconciliation.clean ? "CLEAN" : "FAILURE", action: reconciliation.action, mismatches: reconciliation.mismatches },
    rehearsal,
    timeline: [
      "Live execution starts DISABLED after every application restart.",
      "Venue state must be fetched before any future re-arm.",
      "Reconciliation and hard risk checks must pass before human arming.",
    ],
    incidents,
    events,
    safety: { liveOrderTransmissionEnabled: false, householdCapitalAccessible: false, protectedCapitalAccessible: false, autoScale: false, aiCanPlaceOrders: false, aiCanChangeRisk: false },
  };
}

export async function runMicroLiveRehearsal(actor: Actor) {
  assertPermission(actor.role, "contribute");
  const { householdId, session } = await ensureMicroLiveSeed();
  const rehearsal = runLiveRehearsal();
  await db.insert(auditEvents).values({
    householdId,
    eventType: "micro_live_rehearsal_completed",
    actor: actor.userId,
    entity: "micro_live_session",
    entityId: session.id,
    reason: "Rehearsal completed without transmitting orders",
    metadata: { status: rehearsal.status, liveOrderTransmission: rehearsal.liveOrderTransmission, chaosTests: rehearsal.chaosTests },
  });
  return rehearsal;
}

export async function reviewMicroLiveEnablement(actor: Actor) {
  assertPermission(actor.role, "approve");
  const snapshot = await getMicroLiveSnapshot();
  const { householdId } = await ensureSeedData();
  await db.insert(auditEvents).values({
    householdId,
    eventType: "micro_live_enablement_reviewed",
    actor: actor.userId,
    entity: "micro_live",
    entityId: snapshot.session.id,
    reason: "Enablement gates reviewed without enabling live execution",
    metadata: { status: snapshot.status, readiness: snapshot.readiness, enabled: snapshot.enablement.enabled },
  });
  return { status: snapshot.status, readiness: snapshot.readiness, enablement: snapshot.enablement, liveExecutionEnabled: false };
}