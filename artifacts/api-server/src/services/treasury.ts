import { and, desc, eq, sql } from "drizzle-orm";
import {
  capitalRequests,
  capitalReservations,
  allocationRules,
  auditEvents,
  idempotencyKeys,
  treasuryBuckets,
  treasuryPolicies,
  riskStates,
  type TreasuryBucket,
  type TreasuryPolicy,
} from "@workspace/db";
import { db } from "@workspace/db";
import { calculateTreasuryMetrics, allocationDecision } from "../domain/treasury";
import { GovernanceError } from "../domain/governance";
import { centsToMoney, parseMoneyToCents } from "../domain/finance";
import { getCashFlow, getSafeToDeploy } from "./household-finance";
import { ensureTenantCore } from "./seed";
import type { Actor } from "./capital-os";
import { assertPermission } from "../domain/governance";

const today = () => new Date().toISOString().slice(0, 10);
const REDACTED = "REDACTED";

function bucketResponse(bucket: TreasuryBucket) {
  return {
    id: bucket.id,
    name: bucket.name,
    bucketType: bucket.bucketType,
    priority: bucket.priority,
    targetAmount: bucket.targetAmount,
    minimumAmount: bucket.minimumAmount,
    maximumAmount: bucket.maximumAmount,
    currentBalance: bucket.currentBalance,
    protected: bucket.protected,
    liquid: bucket.liquid,
    liquidityClass: bucket.liquidityClass,
    riskClass: bucket.riskClass,
    withdrawalPolicy: bucket.withdrawalPolicy,
    fundingRule: bucket.fundingRule,
  };
}

function policyResponse(policy: TreasuryPolicy) {
  return {
    minimumOperatingCash: policy.minimumOperatingCash,
    emergencyTargetMonths: policy.emergencyTargetMonths,
    minimumWeeklyDuplexContribution: policy.minimumWeeklyDuplexContribution,
    maximumStrategyPercent: policy.maximumStrategyPercent,
    maximumSingleStrategyPercent: policy.maximumSingleStrategyPercent,
    maximumSingleVenuePercent: policy.maximumSingleVenuePercent,
    maximumIlliquidPercent: policy.maximumIlliquidPercent,
    maximumActivePercent: policy.maximumActivePercent,
    autoScale: policy.autoScale,
    hierarchy: policy.hierarchy,
    version: policy.version,
  };
}

function requestResponse(request: typeof capitalRequests.$inferSelect) {
  return {
    id: request.id,
    requestingModule: request.requestingModule,
    strategyId: request.strategyId,
    requestedAmount: request.requestedAmount,
    purpose: request.purpose,
    expectedDuration: request.expectedDuration,
    riskClass: request.riskClass,
    expectedReturnAssumption: request.expectedReturnAssumption,
    liquidityRequirement: request.liquidityRequirement,
    currentAllocation: request.currentAllocation,
    requestedNewAllocation: request.requestedNewAllocation,
    evidence: request.evidence,
    status: request.status,
    decisionReason: request.decisionReason,
    createdAt: request.createdAt,
    reviewedAt: request.reviewedAt,
  };
}

function redactProtectedValues<T extends Record<string, unknown>>(value: T, visible: boolean) {
  return visible
    ? value
    : {
        ...value,
        targetAmount: REDACTED,
        minimumAmount: REDACTED,
        maximumAmount: REDACTED,
        currentBalance: REDACTED,
      };
}

const CAPITAL_REQUEST_OPERATION = "capital_request.create";

function serializeIdempotentResponse(response: Record<string, unknown>, input: unknown) {
  return JSON.parse(JSON.stringify({
    response,
    fingerprint: JSON.stringify(input),
  })) as Record<string, unknown>;
}

function replayIdempotentResponse(row: typeof idempotencyKeys.$inferSelect, operation: string, input: unknown) {
  if (row.operation !== operation || !row.responseBody || row.responseBody.fingerprint !== JSON.stringify(input)) {
    throw new GovernanceError("IDEMPOTENCY_CONFLICT", "Idempotency key was already used for a different request");
  }
  return row.responseBody.response as Record<string, unknown>;
}

async function lockIdempotency(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  householdId: string,
  operation: string,
  idempotencyKey: string,
) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${operation}:${householdId}:${idempotencyKey}`}, 0))`);
}

export async function getTreasury(actor: Actor) {
  const ids = await ensureTenantCore(actor.householdId, actor.userId);
  const [buckets, policy, requests, reservations, safeToDeploy, cashFlow, allocation] = await Promise.all([
    db.select().from(treasuryBuckets).where(eq(treasuryBuckets.householdId, ids.householdId)).orderBy(treasuryBuckets.priority),
    db.select().from(treasuryPolicies).where(eq(treasuryPolicies.householdId, ids.householdId)).limit(1),
    db.select().from(capitalRequests).where(eq(capitalRequests.householdId, ids.householdId)).orderBy(desc(capitalRequests.createdAt)).limit(10),
    db.select().from(capitalReservations).where(and(eq(capitalReservations.householdId, ids.householdId), eq(capitalReservations.status, "active"))),
    getSafeToDeploy(actor),
    getCashFlow(actor),
    db.select().from(allocationRules).where(and(eq(allocationRules.householdId, ids.householdId), eq(allocationRules.active, true))).limit(1),
  ]);
  const currentPolicy = policy[0];
  if (!currentPolicy) throw new Error("Treasury policy is missing");
  const visibleBuckets = buckets.map((bucket) =>
    redactProtectedValues(bucketResponse(bucket), actor.role !== "advisor" || !bucket.protected)
  );
  const protectedBucketIds = new Set(buckets.filter((bucket) => bucket.protected).map((bucket) => bucket.id));
  const activeReservations = reservations.filter((reservation) => !reservation.expiresAt || reservation.expiresAt >= today());
  const reservedCents = activeReservations.reduce((sum, reservation) => sum + parseMoneyToCents(reservation.reservedAmount), 0);
  const snapshot = calculateTreasuryMetrics({
    buckets: buckets.map(bucketResponse),
    policy: policyResponse(currentPolicy),
    safeToDeploy: safeToDeploy.safeToDeploy,
    essentialMonthlyExpenses: cashFlow.metrics.essentialOutflow,
    weeklyDuplexContribution: allocation[0]?.duplexReserve ?? "0.00",
    reservationsCents: reservedCents,
  });
  return {
    ...snapshot,
    totals: actor.role === "advisor"
      ? { ...snapshot.totals, totalCapital: REDACTED, protectedCapital: REDACTED, safeToDeploy: REDACTED }
      : snapshot.totals,
    buckets: visibleBuckets,
    requests: requests.map(requestResponse),
    reservations: activeReservations.map((reservation) => ({
      id: reservation.id,
      bucketId: reservation.bucketId,
      reason: reservation.reason,
      reservedAmount: actor.role === "advisor" && protectedBucketIds.has(reservation.bucketId)
        ? REDACTED
        : reservation.reservedAmount,
      startsAt: reservation.startsAt,
      expiresAt: reservation.expiresAt,
      status: reservation.status,
    })),
    lastUpdated: new Date().toISOString(),
  };
}

export async function createCapitalRequest(actor: Actor, input: {
  requestingModule: string;
  strategyId?: string;
  requestedAmount: string;
  purpose: string;
  expectedDuration: string;
  riskClass: "protected" | "conservative" | "moderate" | "experimental";
  expectedReturnAssumption: string;
  liquidityRequirement: string;
  currentAllocation?: string;
  requestedNewAllocation?: string;
  evidence?: string[];
}, idempotencyKey: string) {
  assertPermission(actor.role, "contribute");
  const ids = await ensureTenantCore(actor.householdId, actor.userId);
  if (parseMoneyToCents(input.requestedAmount) <= 0) {
    throw new GovernanceError("INVALID_STATE", "Capital requests must be greater than zero");
  }
  return db.transaction(async (tx) => {
    await lockIdempotency(tx, ids.householdId, CAPITAL_REQUEST_OPERATION, idempotencyKey);
    const [existing] = await tx.select().from(idempotencyKeys).where(and(
      eq(idempotencyKeys.householdId, ids.householdId),
      eq(idempotencyKeys.key, idempotencyKey),
    )).limit(1);
    if (existing) return replayIdempotentResponse(existing, CAPITAL_REQUEST_OPERATION, input);
    const [request] = await tx.insert(capitalRequests).values({
      householdId: ids.householdId,
      requestingModule: input.requestingModule,
      strategyId: input.strategyId,
      requestedAmount: input.requestedAmount,
      purpose: input.purpose,
      expectedDuration: input.expectedDuration,
      riskClass: input.riskClass,
      expectedReturnAssumption: input.expectedReturnAssumption,
      liquidityRequirement: input.liquidityRequirement,
      currentAllocation: input.currentAllocation ?? "0.00",
      requestedNewAllocation: input.requestedNewAllocation ?? input.requestedAmount,
      evidence: input.evidence ?? [],
      status: "SUBMITTED",
      createdBy: actor.userId,
    }).returning();
    await tx.insert(auditEvents).values({
      householdId: ids.householdId,
      eventType: "capital_request_submitted",
      actor: actor.userId,
      entity: "capital_request",
      entityId: request.id,
      reason: input.purpose,
      metadata: {
        idempotencyKey,
        amount: request.requestedAmount,
        requestingModule: request.requestingModule,
        riskClass: request.riskClass,
      },
    });
    const response = requestResponse(request);
    await tx.insert(idempotencyKeys).values({
      householdId: ids.householdId,
      key: idempotencyKey,
      operation: CAPITAL_REQUEST_OPERATION,
      responseStatus: 201,
      responseBody: serializeIdempotentResponse(response, input),
    });
    return response;
  });
}

export async function decideCapitalRequest(actor: Actor, requestId: string, input: {
  decision: "APPROVED" | "PARTIALLY_APPROVED" | "REJECTED";
  approvedAmount?: string;
  reason: string;
}) {
  assertPermission(actor.role, "approve");
  const ids = await ensureTenantCore(actor.householdId, actor.userId);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`treasury-decision:${ids.householdId}:${requestId}`}, 0))`);
    const [request] = await tx.select().from(capitalRequests).where(and(
      eq(capitalRequests.id, requestId),
      eq(capitalRequests.householdId, ids.householdId),
    )).limit(1);
    if (!request) throw new GovernanceError("INVALID_STATE", "Capital request was not found");

    const [existingReservation] = await tx.select().from(capitalReservations).where(eq(capitalReservations.requestId, request.id)).limit(1);
    const requestedCents = parseMoneyToCents(request.requestedAmount);
    const approvedCents = parseMoneyToCents(input.approvedAmount ?? request.requestedAmount);
    const alreadyFinal = ["APPROVED", "PARTIALLY_APPROVED", "REJECTED", "EXPIRED", "CANCELLED"].includes(request.status);
    if (alreadyFinal) {
      const sameDecision = request.status === input.decision
        && request.decisionReason === input.reason
        && (input.decision === "REJECTED"
          ? !input.approvedAmount
          : existingReservation?.reservedAmount === centsToMoney(approvedCents));
      if (sameDecision) return requestResponse(request);
      throw new GovernanceError("IDEMPOTENCY_CONFLICT", "Capital request already has a different decision");
    }

    if (input.decision === "APPROVED" && approvedCents !== requestedCents) {
      throw new GovernanceError("INVALID_STATE", "An approved request must reserve its full requested amount");
    }
    if (input.decision === "PARTIALLY_APPROVED" && (approvedCents <= 0 || approvedCents >= requestedCents)) {
      throw new GovernanceError("INVALID_STATE", "A partial approval must be positive and below the requested amount");
    }

    const [policy] = await tx.select().from(treasuryPolicies).where(eq(treasuryPolicies.householdId, ids.householdId)).limit(1);
    const buckets = await tx.select().from(treasuryBuckets).where(eq(treasuryBuckets.householdId, ids.householdId));
    const activeReservations = await tx.select().from(capitalReservations).where(and(
      eq(capitalReservations.householdId, ids.householdId),
      eq(capitalReservations.status, "active"),
    ));
    const reservedCents = activeReservations.reduce((sum, reservation) => sum + parseMoneyToCents(reservation.reservedAmount), 0);
    const safeToDeploy = await getSafeToDeploy(actor);
    const totalLiquidCents = buckets.filter((bucket) => bucket.liquid).reduce((sum, bucket) => sum + parseMoneyToCents(bucket.currentBalance), 0);
    const strategyCents = buckets.filter((bucket) => bucket.bucketType === "STRATEGY").reduce((sum, bucket) => sum + parseMoneyToCents(bucket.currentBalance), 0);
    const [riskState] = await tx.select({ protectedCapitalLocked: riskStates.protectedCapitalLocked })
      .from(riskStates)
      .where(and(
        eq(riskStates.id, ids.riskStateId),
        eq(riskStates.householdId, ids.householdId),
      ))
      .limit(1);
    const decision = allocationDecision({
      requestedAmountCents: approvedCents,
      safeToDeployCents: Math.max(0, parseMoneyToCents(safeToDeploy.safeToDeploy) - reservedCents),
      currentStrategyCents: strategyCents,
      totalLiquidCents,
      maxStrategyPercent: Number(policy?.maximumStrategyPercent ?? 15),
      protectedCapitalLocked: riskState?.protectedCapitalLocked ?? true,
    });
    if (input.decision !== "REJECTED" && !decision.approved) {
      throw new GovernanceError("RISK_BLOCKED", decision.reason);
    }

    const [updated] = await tx.update(capitalRequests).set({
      status: input.decision,
      decisionReason: input.reason,
      reviewedBy: actor.userId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(
      eq(capitalRequests.id, request.id),
      eq(capitalRequests.householdId, ids.householdId),
    )).returning();

    let reservationId: string | undefined;
    if (input.decision !== "REJECTED") {
      const sourceBucket = buckets.find((bucket) => bucket.bucketType === "TREASURY" && bucket.liquid && !bucket.protected);
      if (!sourceBucket) throw new GovernanceError("INVALID_STATE", "No unprotected liquid Treasury bucket is available");
      const [reservation] = await tx.insert(capitalReservations).values({
        householdId: ids.householdId,
        requestId: request.id,
        bucketId: sourceBucket.id,
        reason: input.reason,
        reservedAmount: centsToMoney(approvedCents),
        startsAt: today(),
        status: "active",
        createdBy: actor.userId,
      }).returning({ id: capitalReservations.id });
      reservationId = reservation.id;
    }

    await tx.insert(auditEvents).values({
      householdId: ids.householdId,
      eventType: "capital_request_decided",
      actor: actor.userId,
      entity: "capital_request",
      entityId: request.id,
      reason: input.reason,
      metadata: {
        decision: input.decision,
        approvedAmount: input.decision === "REJECTED" ? "0.00" : centsToMoney(approvedCents),
        reservationId,
      },
    });
    return requestResponse(updated);
  });
}