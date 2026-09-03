import { and, desc, eq, inArray } from "drizzle-orm";
import {
  auditEvents,
  executionFills,
  fillSnapshots,
  guardianHeartbeats,
  microLivePolicies,
  microLiveSessions,
  orderEvents,
  orderIntents,
  positionSnapshots,
  postIncidentReviews,
  reactivationRequirements,
  reconciliationRuns,
  tradingIncidents,
  venueRegistry,
} from "@workspace/db";
import { db } from "@workspace/db";
import {
  calculateLiveReadiness,
  defaultMicroLivePolicy,
  evaluateLiveEnablement,
  firstFillHoldDecision,
  guardianDecision,
  recoverExecutionState,
  reconcileExecutionState,
  runLiveRehearsal,
} from "../domain/execution-oms";
import {
  evaluateVenueApproval,
  isIndependentReviewReference,
  isReviewedVenueAdapterRegistered,
  isServerCredentialReference,
  SimulatedVenueAdapter,
} from "../domain/execution-adapters";
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
        capabilities: {
          spot: true,
          makerOrders: true,
          marketOrders: true,
          postOnly: true,
          clientOrderIds: true,
          bulkCancel: true,
          balanceApi: true,
          positionApi: true,
          withdrawals: false,
          transfers: false,
          administration: false,
          securityChanges: false,
        },
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

const emptyMismatches = {
  positionMismatch: false,
  orderMismatch: false,
  missingInternalFills: [] as string[],
  orphanedInternalFills: [] as string[],
};

function asCents(value: string | null | undefined) {
  const parsed = Number(value ?? "0");
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim().length > 0);
}

function toReconciliationRun(run: typeof reconciliationRuns.$inferSelect) {
  return {
    ...run,
    mismatches: { ...emptyMismatches, ...(run.mismatches as Record<string, unknown>) },
  };
}

function toIncident(
  incident: typeof tradingIncidents.$inferSelect,
  reviews: Array<typeof postIncidentReviews.$inferSelect>,
  requirements: Array<typeof reactivationRequirements.$inferSelect>,
) {
  const incidentRequirements = requirements.filter((requirement) => requirement.incidentId === incident.id);
  return {
    ...incident,
    hasReview: reviews.some((review) => review.incidentId === incident.id),
    openRequirementCount: incidentRequirements.filter((requirement) => requirement.status !== "COMPLETE").length,
  };
}

function toIncidentReview(
  review: typeof postIncidentReviews.$inferSelect,
  requirements: Array<typeof reactivationRequirements.$inferSelect>,
) {
  return {
    ...review,
    requirements: requirements.filter((requirement) => requirement.reviewId === review.id),
  };
}

async function persistMicroLiveRecoveryFailure(input: {
  householdId: string;
  session: typeof microLiveSessions.$inferSelect;
  actor: Actor;
  error: unknown;
  capturedAt: Date;
}) {
  const reason = input.error instanceof Error ? input.error.message : "Unknown reconciliation failure";
  const [run] = await db.insert(reconciliationRuns).values({
    householdId: input.householdId,
    sessionId: input.session.id,
    status: "FAILURE",
    mismatches: { ...emptyMismatches, recoveryError: reason },
    internalState: { source: "capital_os_oms", recovery: "FAILED" },
    venueState: { source: "simulated_rehearsal_adapter", recovery: "UNAVAILABLE" },
    completedAt: input.capturedAt,
  }).returning();
  await db.update(microLiveSessions).set({
    status: "STOP",
    stoppedAt: input.capturedAt,
    updatedAt: input.capturedAt,
  }).where(and(eq(microLiveSessions.id, input.session.id), eq(microLiveSessions.householdId, input.householdId)));
  const [existingIncident] = await db.select({ id: tradingIncidents.id }).from(tradingIncidents).where(and(
    eq(tradingIncidents.householdId, input.householdId),
    eq(tradingIncidents.incidentType, "RECONCILIATION_FAILURE"),
    eq(tradingIncidents.status, "OPEN"),
  )).limit(1);
  if (!existingIncident) {
    await db.insert(tradingIncidents).values({
      householdId: input.householdId,
      sessionId: input.session.id,
      severity: "CRITICAL",
      incidentType: "RECONCILIATION_FAILURE",
      title: "Execution reconciliation failed closed",
      timeline: [
        `Reconciliation run ${run.id} could not complete: ${reason}`,
        "The Micro-Live session was stopped and no new exposure is permitted.",
        "A human post-incident review is required before any future reactivation.",
      ],
      status: "OPEN",
    });
  }
  await db.insert(auditEvents).values({
    householdId: input.householdId,
    eventType: "micro_live_reconciliation_failed_closed",
    actor: input.actor.userId,
    entity: "reconciliation_run",
    entityId: run.id,
    reason: "Reconciliation failure persisted and session stopped",
    metadata: { error: reason, liveExecutionEnabled: false },
  });
  return toReconciliationRun(run);
}

async function ensureMicroLiveBaseline(session: typeof microLiveSessions.$inferSelect) {
  const [existingRun] = await db
    .select()
    .from(reconciliationRuns)
    .where(and(eq(reconciliationRuns.householdId, session.householdId), eq(reconciliationRuns.sessionId, session.id)))
    .orderBy(desc(reconciliationRuns.completedAt))
    .limit(1);
  if (existingRun) return existingRun;

  const capturedAt = new Date();
  const positionValues = [
    { source: "INTERNAL", metadata: { authority: "capital_os_oms", baseline: true } },
    { source: "VENUE", metadata: { authority: "simulated_rehearsal_adapter", baseline: true } },
  ].map((position) => ({
    householdId: session.householdId,
    sessionId: session.id,
    venueId: session.venueId,
    marketId: "sandbox",
    source: position.source,
    quantity: "0",
    averagePrice: "0",
    markPrice: "0",
    notional: "0",
    metadata: position.metadata,
    capturedAt,
  }));
  await db.insert(positionSnapshots).values(positionValues);
  const [run] = await db.insert(reconciliationRuns).values({
    householdId: session.householdId,
    sessionId: session.id,
    status: "CLEAN",
    mismatches: emptyMismatches,
    internalState: { positionCents: 0, openOrders: 0, fillIds: [], source: "capital_os_oms" },
    venueState: { positionCents: 0, openOrders: 0, fillIds: [], source: "simulated_rehearsal_adapter" },
    completedAt: capturedAt,
  }).returning();
  return run;
}

export async function getMicroLiveSnapshot() {
  const { policy, venues, session } = await ensureMicroLiveSeed();
  await ensureMicroLiveBaseline(session);
  const rehearsal = runLiveRehearsal();
  const [heartbeat] = await db.select().from(guardianHeartbeats).where(eq(guardianHeartbeats.householdId, session.householdId)).orderBy(desc(guardianHeartbeats.lastHeartbeatAt)).limit(1);
  const [latestReconciliation] = await db.select().from(reconciliationRuns)
    .where(and(eq(reconciliationRuns.householdId, session.householdId), eq(reconciliationRuns.sessionId, session.id)))
    .orderBy(desc(reconciliationRuns.completedAt)).limit(1);
  const reconciliation = latestReconciliation
    ? { ...reconcileExecutionState({ internalPositionCents: 0, venuePositionCents: 0, internalOpenOrders: 0, venueOpenOrders: 0, internalFillIds: [], venueFillIds: [] }), clean: latestReconciliation.status === "CLEAN", mismatches: { ...emptyMismatches, ...(latestReconciliation.mismatches as Record<string, unknown>) }, action: latestReconciliation.status === "CLEAN" ? "CONTINUE" as const : "STOP_CANCEL_FETCH_REBUILD_VERIFY" as const }
    : reconcileExecutionState({ internalPositionCents: 0, venuePositionCents: 0, internalOpenOrders: 0, venueOpenOrders: 0, internalFillIds: [], venueFillIds: [] });
  const heartbeatAgeMs = heartbeat ? Math.max(0, Date.now() - heartbeat.lastHeartbeatAt.getTime()) : Number.POSITIVE_INFINITY;
  const heartbeatHealthy = Boolean(
    heartbeat &&
    heartbeat.status === "HEALTHY" &&
    heartbeat.signatureValid &&
    heartbeatAgeMs <= 3000,
  );
  const guardian = guardianDecision({
    liveStatus: session.status as "DISABLED" | "MICRO_LIVE_ELIGIBLE" | "MICRO_LIVE_ARMED" | "MICRO_LIVE_ACTIVE" | "SAFE_MODE" | "STOP" | "EVACUATE" | "LOCKED" | "LIMITED_LIVE_ELIGIBLE" | "LIMITED_LIVE_ARMED" | "LIMITED_LIVE_ACTIVE",
    heartbeatAgeMs,
    maxHeartbeatAgeMs: 3000,
    reportedExposureCents: asCents(heartbeat?.reportedExposure),
    observedVenueExposureCents: asCents(heartbeat?.observedExposure),
    hardExposureCents: Number(policy.limits.maxMarketExposureCents ?? 500),
    riskEngineHealthy: heartbeatHealthy,
  });
  const readiness = calculateLiveReadiness({
    strategyEvidence: false,
    paperPerformance: false,
    venue: false,
    marketData: false,
    oms: true,
    riskGovernor: true,
    capitalGovernor: true,
    guardian: heartbeatHealthy,
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
  const [allIncidents, reviews, requirements, reconciliationHistory, positions, fills] = await Promise.all([
    db.select().from(tradingIncidents).where(and(eq(tradingIncidents.householdId, session.householdId), eq(tradingIncidents.status, "OPEN"))).orderBy(desc(tradingIncidents.createdAt)).limit(20),
    db.select().from(postIncidentReviews).where(eq(postIncidentReviews.householdId, session.householdId)).orderBy(desc(postIncidentReviews.reviewedAt)).limit(20),
    db.select().from(reactivationRequirements).where(eq(reactivationRequirements.householdId, session.householdId)).orderBy(desc(reactivationRequirements.createdAt)).limit(50),
    db.select().from(reconciliationRuns).where(eq(reconciliationRuns.householdId, session.householdId)).orderBy(desc(reconciliationRuns.completedAt)).limit(20),
    db.select().from(positionSnapshots).where(eq(positionSnapshots.householdId, session.householdId)).orderBy(desc(positionSnapshots.capturedAt)).limit(50),
    db.select().from(fillSnapshots).where(eq(fillSnapshots.householdId, session.householdId)).orderBy(desc(fillSnapshots.capturedAt)).limit(50),
  ]);
  const firstFillHold = firstFillHoldDecision({
    fillObserved: fills.some((fill) => fill.sessionId === session.id && fill.source === "VENUE"),
    reconciliationClean: reconciliation.clean,
    explicitResumeApproval: false,
  });
  const incidents = allIncidents.map((incident) => toIncident(incident, reviews, requirements));
  const sessionIntents = await db.select({ id: orderIntents.id }).from(orderIntents).where(and(
    eq(orderIntents.sessionId, session.id),
    eq(orderIntents.householdId, session.householdId),
  ));
  const events = sessionIntents.length
    ? await db.select().from(orderEvents).where(inArray(orderEvents.orderIntentId, sessionIntents.map((intent) => intent.id))).orderBy(desc(orderEvents.createdAt)).limit(20)
    : [];
  return {
    status: session.status,
    policy: { version: policy.policyVersion, limits: policy.limits, autoScale: policy.autoScale, leverageEnabled: policy.leverageEnabled, marginEnabled: policy.marginEnabled, borrowingEnabled: policy.borrowingEnabled },
    session: { id: session.id, mode: session.mode, capitalAllocated: session.capitalAllocated, currentPosition: "0.00", openOrders: 0, netPnl: "0.00", lossLimit: session.sessionLossLimit, exposureCap: session.sessionExposureCap, expiresAt: session.authorizationExpiresAt },
    venues: venues.map((venue) => {
      const approval = evaluateVenueApproval({
        ...venue,
        adapterRegistered: isReviewedVenueAdapterRegistered(venue.adapterType),
        approvingActorId: venue.approvedBy ?? undefined,
      });
      return {
        id: venue.id,
        name: venue.name,
        adapterType: venue.adapterType,
        status: venue.status,
        capabilities: venue.capabilities,
        jurisdictionConfirmed: venue.jurisdictionConfirmed,
        integrationApproved: venue.integrationApproved,
        credentialsConfigured: isServerCredentialReference(venue.credentialsReference),
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
    guardian: { status: heartbeat?.status ?? "STOP", lastHeartbeatAt: heartbeat?.lastHeartbeatAt ?? null, decision: guardian.action, reason: guardian.reason, independentDeployment: "Guardian is modeled as a separate process boundary for future independent hosting." },
    reconciliation: { runId: latestReconciliation?.id ?? null, status: latestReconciliation?.status ?? (reconciliation.clean ? "CLEAN" : "FAILURE"), action: reconciliation.action, mismatches: reconciliation.mismatches, completedAt: latestReconciliation?.completedAt ?? null },
    reconciliationRuns: reconciliationHistory.map(toReconciliationRun),
    positionSnapshots: positions,
    fillSnapshots: fills,
    rehearsal,
    timeline: [
      "Live execution starts DISABLED after every application restart.",
      "Venue state must be fetched before any future re-arm.",
      "Reconciliation and hard risk checks must pass before human arming.",
    ],
    incidents,
    incidentReviews: reviews.map((review) => toIncidentReview(review, requirements)),
    reactivationRequirements: requirements,
    events,
    firstFillHold,
    safety: { liveOrderTransmissionEnabled: false, householdCapitalAccessible: false, protectedCapitalAccessible: false, autoScale: false, aiCanPlaceOrders: false, aiCanChangeRisk: false, firstFillHoldActive: !firstFillHold.allowNewOrders },
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

export type VenueReviewRequest = {
  reviewReference: string;
};

function isVenueReviewRequest(value: unknown, kind: "security" | "jurisdiction"): value is VenueReviewRequest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return isIndependentReviewReference(candidate.reviewReference, kind);
}

function isVenueApprovalRequest(value: unknown): value is VenueApprovalRequest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return isServerCredentialReference(candidate.credentialsReference) &&
    typeof candidate.jurisdictionConfirmed === "boolean" &&
    typeof candidate.termsReviewed === "boolean" &&
    Array.isArray(candidate.marketPermissions) &&
    candidate.marketPermissions.every((market) => typeof market === "string") &&
    typeof candidate.withdrawalReviewed === "boolean" &&
    typeof candidate.withdrawalDisabled === "boolean" &&
    !Object.prototype.hasOwnProperty.call(candidate, "securityReviewReference") &&
    !Object.prototype.hasOwnProperty.call(candidate, "jurisdictionReviewReference");
}

async function loadMicroLiveVenue(venueId: string) {
  const { householdId } = await ensureSeedData();
  const [venue] = await db.select().from(venueRegistry).where(and(
    eq(venueRegistry.id, venueId),
    eq(venueRegistry.householdId, householdId),
  )).limit(1);
  if (!venue) throw new GovernanceError("INVALID_STATE", "Venue is not registered for this household");
  return { householdId, venue };
}

export async function recordMicroLiveVenueReview(
  actor: Actor,
  venueId: string,
  kind: "security" | "jurisdiction",
  request: unknown,
) {
  assertPermission(actor.role, kind === "security" ? "review_venue_security" : "review_venue_jurisdiction");
  if (!isVenueReviewRequest(request, kind)) {
    throw new GovernanceError("INVALID_STATE", "A valid independent review reference is required");
  }
  const { householdId } = await loadMicroLiveVenue(venueId);
  const review = {
    reference: request.reviewReference,
    reviewerId: actor.userId,
    reviewedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
  };
  const reviewColumn = kind === "security" ? "securityReview" : "jurisdictionReview";
  const [updatedVenue] = await db.update(venueRegistry).set({
    [reviewColumn]: review,
    status: "Review in progress",
    updatedAt: new Date(),
  }).where(and(
    eq(venueRegistry.id, venueId),
    eq(venueRegistry.householdId, householdId),
  )).returning();
  await db.insert(auditEvents).values({
    householdId,
    eventType: `micro_live_venue_${kind}_reviewed`,
    actor: actor.userId,
    entity: "venue_registry",
    entityId: venueId,
    reason: `Independent ${kind} review recorded; venue approval remains blocked until all gates pass`,
    metadata: {
      reviewReference: request.reviewReference,
      reviewerId: actor.userId,
      expiresAt: review.expiresAt,
      liveExecutionEnabled: false,
    },
  });
  return {
    venueId: updatedVenue.id,
    reviewType: kind,
    reviewedBy: actor.userId,
    reviewedAt: review.reviewedAt,
    expiresAt: review.expiresAt,
    liveExecutionEnabled: false,
  };
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
  const [otherApprovedVenue] = await db.select({ id: venueRegistry.id }).from(venueRegistry).where(and(
    eq(venueRegistry.householdId, householdId),
    eq(venueRegistry.integrationApproved, true),
  )).limit(1);
  if (otherApprovedVenue && otherApprovedVenue.id !== venueId) {
    throw new GovernanceError("INVALID_STATE", "Only one provider venue may be approved for Micro-Live");
  }

  const approval = evaluateVenueApproval({
    adapterType: venue.adapterType,
    integrationApproved: isReviewedVenueAdapterRegistered(venue.adapterType),
    adapterRegistered: isReviewedVenueAdapterRegistered(venue.adapterType),
    credentialsReference: request.credentialsReference,
    jurisdictionConfirmed: request.jurisdictionConfirmed,
    termsReviewed: request.termsReviewed,
    marketPermissions: request.marketPermissions,
    withdrawalReviewed: request.withdrawalReviewed,
    withdrawalDisabled: request.withdrawalDisabled,
    securityReview: venue.securityReview,
    jurisdictionReview: venue.jurisdictionReview,
    approvingActorId: actor.userId,
  });
  if (!approval.approved) {
    throw new GovernanceError("INVALID_STATE", "Venue approval is incomplete; no live enablement was granted");
  }

  const [approvedVenue] = await db.update(venueRegistry)
    .set({
      integrationApproved: true,
      credentialsReference: request.credentialsReference,
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
      approval: evaluateVenueApproval({
        ...approvedVenue,
        adapterRegistered: isReviewedVenueAdapterRegistered(approvedVenue.adapterType),
        approvingActorId: actor.userId,
      }),
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
  const providerVenues = snapshot.venues.filter((candidate) =>
    candidate.adapterType !== "simulated" && candidate.adapterType !== "provider-neutral");
  if (providerVenues.length !== 1 || providerVenues[0]?.id !== venueId) {
    throw new GovernanceError("INVALID_STATE", "Micro-Live requires exactly one selected provider venue");
  }
  if (!snapshot.firstFillHold.allowNewOrders) {
    throw new GovernanceError("INVALID_STATE", "First-fill review hold must be explicitly cleared before re-arming");
  }

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
      status: "MICRO_LIVE_ARMED",
      mode: "MICRO_LIVE",
      authorizationExpiresAt: expiresAt,
      armedBy: actor.userId,
      armedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(
      eq(microLiveSessions.id, snapshot.session.id),
      eq(microLiveSessions.householdId, (await ensureSeedData()).householdId),
    ))
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

export async function runMicroLiveReconciliation(actor: Actor) {
  assertPermission(actor.role, "contribute");
  const { householdId, session } = await ensureMicroLiveSeed();
  const [sessionVenue] = await db.select().from(venueRegistry).where(and(
    eq(venueRegistry.id, session.venueId ?? ""),
    eq(venueRegistry.householdId, householdId),
  )).limit(1);
  if (sessionVenue && sessionVenue.adapterType !== "simulated") {
    throw new GovernanceError("INVALID_STATE", "Real venue reconciliation is disabled until its separately reviewed server adapter is registered");
  }
  const rehearsalAdapter = new SimulatedVenueAdapter();
  await rehearsalAdapter.connect();
  const capturedAt = new Date();
  const [internalPosition] = await db.select().from(positionSnapshots)
    .where(and(eq(positionSnapshots.householdId, householdId), eq(positionSnapshots.source, "INTERNAL")))
    .orderBy(desc(positionSnapshots.capturedAt)).limit(1);
  const internalFills = await db.select({ externalFillId: executionFills.externalFillId }).from(executionFills)
    .where(eq(executionFills.householdId, householdId));
  const internalPositionCents = asCents(internalPosition?.notional);
  let recovery: Awaited<ReturnType<typeof recoverExecutionState>>;
  try {
    recovery = await recoverExecutionState(rehearsalAdapter, {
      internalPositionCents,
      internalOpenOrders: 0,
      internalFillIds: internalFills.map((fill) => fill.externalFillId),
    });
  } catch (error) {
    await rehearsalAdapter.disconnect().catch(() => undefined);
    return persistMicroLiveRecoveryFailure({ householdId, session, actor, error, capturedAt });
  }
  await rehearsalAdapter.disconnect();
  const venuePositionCents = recovery.venuePositionCents;
  const venueFills = recovery.fills;
  const result = recovery.reconciliation;
  const internalState = {
    positionCents: internalPositionCents,
    openOrders: 0,
    fillIds: internalFills.map((fill) => fill.externalFillId),
    source: "capital_os_oms",
  };
  const venueState = {
    positionCents: venuePositionCents,
    openOrders: recovery.openOrders.length,
    fillIds: venueFills.map((fill) => fill.externalFillId),
    source: "simulated_rehearsal_adapter",
    venueHealth: recovery.venueHealth,
    balances: recovery.balances,
  };
  if (venueFills.length > 0) {
    await db.insert(fillSnapshots).values(venueFills.map((fill) => ({
      householdId,
      sessionId: session.id,
      venueId: session.venueId,
      externalFillId: fill.externalFillId,
      marketId: fill.marketId,
      source: "VENUE",
      side: "unknown",
      quantity: fill.quantity.toString(),
      price: fill.price.toString(),
      fee: fill.fee.toString(),
      metadata: { externalOrderId: fill.externalOrderId, reconciledAt: capturedAt.toISOString() },
      capturedAt,
    }))).onConflictDoNothing();
  }
  const [run] = await db.insert(reconciliationRuns).values({
    householdId,
    sessionId: session.id,
    status: result.clean ? "CLEAN" : "FAILURE",
    mismatches: result.mismatches,
    internalState,
    venueState,
    completedAt: capturedAt,
  }).returning();

  if (!result.clean) {
    await db.update(microLiveSessions).set({
      status: "STOP",
      stoppedAt: capturedAt,
      updatedAt: capturedAt,
    }).where(and(eq(microLiveSessions.id, session.id), eq(microLiveSessions.householdId, householdId)));
    const [existingIncident] = await db.select({ id: tradingIncidents.id }).from(tradingIncidents).where(and(
      eq(tradingIncidents.householdId, householdId),
      eq(tradingIncidents.incidentType, "RECONCILIATION_MISMATCH"),
      eq(tradingIncidents.status, "OPEN"),
    )).limit(1);
    if (!existingIncident) {
      await db.insert(tradingIncidents).values({
        householdId,
        sessionId: session.id,
        severity: "CRITICAL",
        incidentType: "RECONCILIATION_MISMATCH",
        title: "Venue and internal execution state disagree",
        timeline: [
          `Reconciliation run ${run.id} found a position, order, or fill mismatch.`,
          "New exposure is blocked until venue-authoritative state is fetched and rebuilt.",
          "A human post-incident review is required before reactivation.",
        ],
        capitalImpact: ((venuePositionCents - internalPositionCents) / 100).toFixed(2),
        status: "OPEN",
      });
    }
  }

  await db.insert(auditEvents).values({
    householdId,
    eventType: "micro_live_reconciliation_completed",
    actor: actor.userId,
    entity: "reconciliation_run",
    entityId: run.id,
    reason: result.clean ? "Venue-authoritative reconciliation completed cleanly" : "Reconciliation mismatch contained; new exposure remains blocked",
    metadata: { status: run.status, mismatches: result.mismatches, liveExecutionEnabled: false },
  });
  return toReconciliationRun(run);
}

export async function listMicroLiveReconciliationRuns() {
  const { householdId } = await ensureMicroLiveSeed();
  const runs = await db.select().from(reconciliationRuns)
    .where(eq(reconciliationRuns.householdId, householdId))
    .orderBy(desc(reconciliationRuns.completedAt)).limit(50);
  return runs.map(toReconciliationRun);
}

export async function listMicroLivePositionSnapshots() {
  const { householdId } = await ensureMicroLiveSeed();
  return db.select().from(positionSnapshots)
    .where(eq(positionSnapshots.householdId, householdId))
    .orderBy(desc(positionSnapshots.capturedAt)).limit(50);
}

export async function listMicroLiveFillSnapshots() {
  const { householdId } = await ensureMicroLiveSeed();
  return db.select().from(fillSnapshots)
    .where(eq(fillSnapshots.householdId, householdId))
    .orderBy(desc(fillSnapshots.capturedAt)).limit(50);
}

export async function listMicroLiveIncidents() {
  const { householdId } = await ensureMicroLiveSeed();
  const [incidents, reviews, requirements] = await Promise.all([
    db.select().from(tradingIncidents).where(and(eq(tradingIncidents.householdId, householdId), eq(tradingIncidents.status, "OPEN"))).orderBy(desc(tradingIncidents.createdAt)).limit(50),
    db.select().from(postIncidentReviews).where(eq(postIncidentReviews.householdId, householdId)),
    db.select().from(reactivationRequirements).where(eq(reactivationRequirements.householdId, householdId)),
  ]);
  return incidents.map((incident) => toIncident(incident, reviews, requirements));
}

export async function listMicroLiveIncidentReviews() {
  const { householdId } = await ensureMicroLiveSeed();
  const [reviews, requirements] = await Promise.all([
    db.select().from(postIncidentReviews)
    .where(eq(postIncidentReviews.householdId, householdId))
    .orderBy(desc(postIncidentReviews.reviewedAt)).limit(50),
    db.select().from(reactivationRequirements).where(eq(reactivationRequirements.householdId, householdId)),
  ]);
  return reviews.map((review) => toIncidentReview(review, requirements));
}

export async function listMicroLiveReactivationRequirements() {
  const { householdId } = await ensureMicroLiveSeed();
  return db.select().from(reactivationRequirements)
    .where(eq(reactivationRequirements.householdId, householdId))
    .orderBy(desc(reactivationRequirements.createdAt)).limit(100);
}

type IncidentReviewRequest = {
  rootCause: string;
  capitalImpact: string;
  safeguardsWorked: string[];
  requiredFixes: string[];
  reactivationRequirements: string[];
  notes?: string | null;
};

function isIncidentReviewRequest(value: unknown): value is IncidentReviewRequest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.rootCause === "string" && candidate.rootCause.trim().length > 0 &&
    typeof candidate.capitalImpact === "string" && /^-?[0-9]+(\.[0-9]{1,2})?$/.test(candidate.capitalImpact) &&
    isStringArray(candidate.safeguardsWorked) && isStringArray(candidate.requiredFixes) &&
    isStringArray(candidate.reactivationRequirements) && candidate.reactivationRequirements.length > 0 &&
    (candidate.notes === undefined || candidate.notes === null || typeof candidate.notes === "string");
}

export async function createMicroLiveIncidentReview(actor: Actor, incidentId: string, request: unknown) {
  assertPermission(actor.role, "approve");
  if (!isIncidentReviewRequest(request)) {
    throw new GovernanceError("INVALID_STATE", "A complete human post-incident review is required");
  }
  const { householdId } = await ensureSeedData();
  const [incident] = await db.select().from(tradingIncidents).where(and(
    eq(tradingIncidents.id, incidentId),
    eq(tradingIncidents.householdId, householdId),
  )).limit(1);
  if (!incident) throw new GovernanceError("INVALID_STATE", "Incident is not registered for this household");
  const [existingReview] = await db.select({ id: postIncidentReviews.id }).from(postIncidentReviews)
    .where(eq(postIncidentReviews.incidentId, incidentId)).limit(1);
  if (existingReview) throw new GovernanceError("INVALID_STATE", "This incident already has a post-incident review");

  const result = await db.transaction(async (tx) => {
    const [review] = await tx.insert(postIncidentReviews).values({
      householdId,
      incidentId,
      reviewedBy: actor.userId,
      rootCause: request.rootCause.trim(),
      capitalImpact: request.capitalImpact,
      safeguardsWorked: request.safeguardsWorked.map((item) => item.trim()),
      requiredFixes: request.requiredFixes.map((item) => item.trim()),
      reactivationRequirements: request.reactivationRequirements.map((item) => item.trim()),
      notes: request.notes?.trim() || null,
    }).returning();
    const requirements = await tx.insert(reactivationRequirements).values(
      request.reactivationRequirements.map((requirement) => ({
        householdId,
        incidentId,
        reviewId: review.id,
        requirement: requirement.trim(),
        status: "OPEN",
      })),
    ).returning();
    return { review, requirements };
  });
  await db.insert(auditEvents).values({
    householdId,
    eventType: "micro_live_incident_review_recorded",
    actor: actor.userId,
    entity: "trading_incident",
    entityId: incidentId,
    reason: "Human post-incident review recorded; reactivation remains blocked until requirements are complete",
    metadata: { reviewId: result.review.id, requirementCount: result.requirements.length, liveExecutionEnabled: false },
  });
  return {
    ...result.review,
    requirements: result.requirements,
  };
}

export async function completeMicroLiveReactivationRequirement(actor: Actor, requirementId: string) {
  assertPermission(actor.role, "approve");
  const { householdId } = await ensureSeedData();
  const [requirement] = await db.select().from(reactivationRequirements).where(and(
    eq(reactivationRequirements.id, requirementId),
    eq(reactivationRequirements.householdId, householdId),
  )).limit(1);
  if (!requirement) throw new GovernanceError("INVALID_STATE", "Reactivation requirement is not registered for this household");
  const completedAt = requirement.status === "COMPLETE" ? requirement.completedAt ?? new Date() : new Date();
  const [completed] = await db.update(reactivationRequirements).set({
    status: "COMPLETE",
    completedBy: actor.userId,
    completedAt,
  }).where(and(
    eq(reactivationRequirements.id, requirementId),
    eq(reactivationRequirements.householdId, householdId),
  )).returning();
  const remaining = await db.select({ id: reactivationRequirements.id }).from(reactivationRequirements).where(and(
    eq(reactivationRequirements.incidentId, completed.incidentId),
    eq(reactivationRequirements.householdId, householdId),
    eq(reactivationRequirements.status, "OPEN"),
  ));
  if (remaining.length === 0) {
    await db.update(tradingIncidents).set({ status: "RESOLVED", resolvedAt: new Date() }).where(and(
      eq(tradingIncidents.id, completed.incidentId),
      eq(tradingIncidents.householdId, householdId),
    ));
  }
  await db.insert(auditEvents).values({
    householdId,
    eventType: "micro_live_reactivation_requirement_completed",
    actor: actor.userId,
    entity: "reactivation_requirement",
    entityId: requirementId,
    reason: remaining.length === 0 ? "All human reactivation requirements completed; incident resolved" : "Human reactivation requirement completed; incident remains blocked",
    metadata: { incidentId: completed.incidentId, remainingRequirements: remaining.length, liveExecutionEnabled: false },
  });
  return completed;
}