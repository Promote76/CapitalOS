import { and, desc, eq } from "drizzle-orm";
import {
  capitalRequests,
  capitalReservations,
  allocationRules,
  treasuryBuckets,
  treasuryPolicies,
  type TreasuryBucket,
  type TreasuryPolicy,
} from "@workspace/db";
import { db } from "@workspace/db";
import { calculateTreasuryMetrics, allocationDecision } from "../domain/treasury";
import { GovernanceError } from "../domain/governance";
import { parseMoneyToCents } from "../domain/finance";
import { getCashFlow, getSafeToDeploy } from "./household-finance";
import { ensureSeedData } from "./seed";
import type { Actor } from "./capital-os";
import { assertPermission } from "../domain/governance";

const today = () => new Date().toISOString().slice(0, 10);

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

export async function getTreasury() {
  const ids = await ensureSeedData();
  const [buckets, policy, requests, reservations, safeToDeploy, cashFlow, allocation] = await Promise.all([
    db.select().from(treasuryBuckets).where(eq(treasuryBuckets.householdId, ids.householdId)).orderBy(treasuryBuckets.priority),
    db.select().from(treasuryPolicies).where(eq(treasuryPolicies.householdId, ids.householdId)).limit(1),
    db.select().from(capitalRequests).where(eq(capitalRequests.householdId, ids.householdId)).orderBy(desc(capitalRequests.createdAt)).limit(10),
    db.select().from(capitalReservations).where(and(eq(capitalReservations.householdId, ids.householdId), eq(capitalReservations.status, "active"))),
    getSafeToDeploy(),
    getCashFlow(),
    db.select().from(allocationRules).where(and(eq(allocationRules.householdId, ids.householdId), eq(allocationRules.active, true))).limit(1),
  ]);
  const currentPolicy = policy[0];
  if (!currentPolicy) throw new Error("Treasury policy is missing");
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
    buckets: buckets.map(bucketResponse),
    requests: requests.map(requestResponse),
    reservations: activeReservations.map((reservation) => ({
      id: reservation.id,
      bucketId: reservation.bucketId,
      reason: reservation.reason,
      reservedAmount: reservation.reservedAmount,
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
}) {
  assertPermission(actor.role, "contribute");
  const ids = await ensureSeedData();
  if (parseMoneyToCents(input.requestedAmount) <= 0) {
    throw new GovernanceError("INVALID_STATE", "Capital requests must be greater than zero");
  }
  const [request] = await db.insert(capitalRequests).values({
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
  return requestResponse(request);
}

export async function decideCapitalRequest(actor: Actor, requestId: string, input: {
  decision: "APPROVED" | "PARTIALLY_APPROVED" | "REJECTED";
  approvedAmount?: string;
  reason: string;
}) {
  assertPermission(actor.role, "approve");
  const ids = await ensureSeedData();
  const [request] = await db.select().from(capitalRequests).where(and(eq(capitalRequests.id, requestId), eq(capitalRequests.householdId, ids.householdId))).limit(1);
  if (!request) throw new GovernanceError("INVALID_STATE", "Capital request was not found");
  const [policy] = await db.select().from(treasuryPolicies).where(eq(treasuryPolicies.householdId, ids.householdId)).limit(1);
  const buckets = await db.select().from(treasuryBuckets).where(eq(treasuryBuckets.householdId, ids.householdId));
  const safeToDeploy = await getSafeToDeploy();
  const totalLiquidCents = buckets.filter((bucket) => bucket.liquid).reduce((sum, bucket) => sum + parseMoneyToCents(bucket.currentBalance), 0);
  const strategyCents = buckets.filter((bucket) => bucket.bucketType === "STRATEGY").reduce((sum, bucket) => sum + parseMoneyToCents(bucket.currentBalance), 0);
  const decision = allocationDecision({
    requestedAmountCents: parseMoneyToCents(input.approvedAmount ?? request.requestedAmount),
    safeToDeployCents: parseMoneyToCents(safeToDeploy.safeToDeploy),
    currentStrategyCents: strategyCents,
    totalLiquidCents,
    maxStrategyPercent: Number(policy?.maximumStrategyPercent ?? 15),
    protectedCapitalLocked: false,
  });
  if (input.decision !== "REJECTED" && !decision.approved) {
    throw new GovernanceError("RISK_BLOCKED", decision.reason);
  }
  const [updated] = await db.update(capitalRequests).set({
    status: input.decision,
    decisionReason: input.reason,
    reviewedBy: actor.userId,
    reviewedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(capitalRequests.id, request.id)).returning();
  return requestResponse(updated);
}