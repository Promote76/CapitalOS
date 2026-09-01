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
import { evaluateVenueApproval } from "../domain/execution-adapters";
import { assertPermission, GovernanceError } from "../domain/governance";
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
        integrationApproved: false,
        termsReviewed: false,
        marketPermissions: [],
        withdrawalReviewed: false,
        withdrawalDisabled: true,
      },
      {
        householdId: ids.householdId,
        name: "External venue adapter",
        adapterType: "provider-neutral",
        status: "Research",
        capabilities: {},
        jurisdictionConfirmed: false,
        integrationApproved: false,
        termsReviewed: false,
        marketPermissions: [],
        withdrawalReviewed: false,
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
    approvedIntegration: false,
    termsReviewed: false,
    marketPermissionsConfigured: false,
    withdrawalReviewed: false,
    withdrawalDisabled: false,
    householdCapitalAccessible: false,
    protectedCapitalAccessible: false,
  });
  const [heartbeat] = await db.select().from(guardianHeartbeats).where(eq(guardianHeartbeats.householdId, session.householdId)).orderBy(desc(guardianHeartbeats.lastHeartbeatAt)).limit(1);
  const incidents = await db.select().from(tradingIncidents).where(eq(tradingIncidents.householdId, session.householdId)).orderBy(desc(tradingIncidents.createdAt)).limit(10);
  const events = await db.select().from(orderEvents).where(eq(orderEvents.orderIntentId, session.id)).orderBy(desc(orderEvents.createdAt)).limit(20);
  return {
    status: session.status,
    policy: { version: policy.policyVersion, limits: policy.limits, autoScale: policy.autoScale, leverageEnabled: policy.leverageEnabled, marginEnabled: policy.marginEnabled, borrowingEnabled: policy.borrowingEnabled },
    session: { id: session.id, mode: session.mode, capitalAllocated: session.capitalAllocated, currentPosition: "0.00", openOrders: 0, netPnl: "0.00", lossLimit: session.sessionLossLimit, exposureCap: session.sessionExposureCap, expiresAt: session.authorizationExpiresAt },
    venues: venues.map((venue) => {
      const approval = evaluateVenueApproval(venue);
      return {
        id: venue.id,
        name: venue.name,
        adapterType: venue.adapterType,
        status: venue.status,
        capabilities: venue.capabilities,
        jurisdictionConfirmed: venue.jurisdictionConfirmed,
        integrationApproved: venue.integrationApproved,
        credentialsConfigured: Boolean(venue.credentialsReference?.trim()),
        termsReviewed: venue.termsReviewed,
        marketPermissions: venue.marketPermissions,
        withdrawalReviewed: venue.withdrawalReviewed,
        withdrawalDisabled: venue.withdrawalDisabled,
        approval,
        health: venue.status === "Approved for Paper" ? "HEALTHY" : "NOT_CONNECTED",
      };
    }),
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

export type VenueApprovalRequest = {
  credentialsReference: string;
  jurisdictionConfirmed: boolean;
  termsReviewed: boolean;
  marketPermissions: string[];
  withdrawalReviewed: boolean;
  withdrawalDisabled: boolean;
};

function isVenueApprovalRequest(value: unknown): value is VenueApprovalRequest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.credentialsReference === "string" &&
    typeof candidate.jurisdictionConfirmed === "boolean" &&
    typeof candidate.termsReviewed === "boolean" &&
    Array.isArray(candidate.marketPermissions) &&
    candidate.marketPermissions.every((market) => typeof market === "string") &&
    typeof candidate.withdrawalReviewed === "boolean" &&
    typeof candidate.withdrawalDisabled === "boolean";
}

export async function approveMicroLiveVenue(
  actor: Actor,
  venueId: string,
  request: unknown,
) {
  assertPermission(actor.role, "approve");
  if (!isVenueApprovalRequest(request)) {
    throw new GovernanceError("INVALID_STATE", "A complete venue approval review is required");
  }

  const { householdId } = await ensureSeedData();
  const [venue] = await db.select().from(venueRegistry).where(and(
    eq(venueRegistry.id, venueId),
    eq(venueRegistry.householdId, householdId),
  )).limit(1);
  if (!venue) throw new GovernanceError("INVALID_STATE", "Venue is not registered for this household");

  const approval = evaluateVenueApproval({
    adapterType: venue.adapterType,
    integrationApproved: true,
    credentialsReference: request.credentialsReference,
    jurisdictionConfirmed: request.jurisdictionConfirmed,
    termsReviewed: request.termsReviewed,
    marketPermissions: request.marketPermissions,
    withdrawalReviewed: request.withdrawalReviewed,
    withdrawalDisabled: request.withdrawalDisabled,
  });
  if (!approval.approved) {
    throw new GovernanceError("INVALID_STATE", "Venue approval is incomplete; no live enablement was granted");
  }

  const [approvedVenue] = await db.update(venueRegistry)
    .set({
      integrationApproved: true,
      credentialsReference: request.credentialsReference.trim(),
      jurisdictionConfirmed: request.jurisdictionConfirmed,
      termsReviewed: request.termsReviewed,
      marketPermissions: request.marketPermissions.map((market) => market.trim()),
      withdrawalReviewed: request.withdrawalReviewed,
      withdrawalDisabled: request.withdrawalDisabled,
      status: "Approved for Micro-Live",
      approvedBy: actor.userId,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(venueRegistry.id, venueId), eq(venueRegistry.householdId, householdId)))
    .returning();

  await db.insert(auditEvents).values({
    householdId,
    eventType: "micro_live_venue_approved",
    actor: actor.userId,
    entity: "venue_registry",
    entityId: venueId,
    reason: "Real venue approval review completed; household capital remains inaccessible",
    metadata: {
      adapterType: venue.adapterType,
      jurisdictionConfirmed: approvedVenue.jurisdictionConfirmed,
      termsReviewed: approvedVenue.termsReviewed,
      marketPermissions: approvedVenue.marketPermissions,
      withdrawalReviewed: approvedVenue.withdrawalReviewed,
      withdrawalDisabled: approvedVenue.withdrawalDisabled,
      liveExecutionEnabled: false,
    },
  });
  return {
    venue: {
      id: approvedVenue.id,
      name: approvedVenue.name,
      adapterType: approvedVenue.adapterType,
      status: approvedVenue.status,
      marketPermissions: approvedVenue.marketPermissions,
      approval: evaluateVenueApproval(approvedVenue),
    },
    liveExecutionEnabled: false,
    householdCapitalAccessible: false,
    protectedCapitalAccessible: false,
  };
}

export async function armMicroLive(actor: Actor, venueId: string) {
  assertPermission(actor.role, "approve");
  const snapshot = await getMicroLiveSnapshot();
  const venue = snapshot.venues.find((candidate) => candidate.id === venueId);
  if (!venue) throw new GovernanceError("INVALID_STATE", "Venue is not registered for this household");

  const approval = venue.approval;
  const enablement = evaluateLiveEnablement({
    strategyMicroLiveEligible: false,
    humanApproval: true,
    capitalGovernorPass: true,
    riskGovernorPass: true,
    venueHealthy: venue.health === "HEALTHY" && venue.adapterType !== "provider-neutral",
    reconciliationClean: snapshot.reconciliation.status === "CLEAN",
    venueApproved: approval.approved,
    marketApproved: venue.marketPermissions.length > 0,
    jurisdictionConfirmed: venue.jurisdictionConfirmed,
    credentialsConfigured: venue.credentialsConfigured,
    withdrawalDisabled: venue.withdrawalDisabled,
    approvedIntegration: approval.checks[0]?.passed === true,
    termsReviewed: venue.termsReviewed,
    marketPermissionsConfigured: venue.marketPermissions.length > 0,
    withdrawalReviewed: venue.withdrawalReviewed,
    householdCapitalAccessible: false,
    protectedCapitalAccessible: false,
  });
  if (!enablement.enabled) {
    throw new GovernanceError("INVALID_STATE", "Human arming is blocked until strategy, venue, market, risk, and reconciliation gates pass");
  }

  const expiresAt = new Date(Date.now() + defaultMicroLivePolicy.authorizationHours * 60 * 60 * 1000);
  const [session] = await db.update(microLiveSessions)
    .set({
      venueId,
      status: "ARMED",
      mode: "MICRO_LIVE",
      authorizationExpiresAt: expiresAt,
      armedBy: actor.userId,
      armedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(microLiveSessions.id, snapshot.session.id))
    .returning();
  await db.insert(auditEvents).values({
    householdId: session.householdId,
    eventType: "micro_live_human_armed",
    actor: actor.userId,
    entity: "micro_live_session",
    entityId: session.id,
    reason: "Human-controlled arming completed after all enablement gates passed",
    metadata: { venueId, authorizationExpiresAt: expiresAt.toISOString(), liveExecutionEnabled: false },
  });
  return { status: session.status, sessionId: session.id, authorizationExpiresAt: expiresAt, liveExecutionEnabled: false };
}