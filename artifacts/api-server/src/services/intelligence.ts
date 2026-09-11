import { appendAuditEvent, appendAuditEvents } from "./audit";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { aiAnalyses, aiInsights, aiRecommendations, auditEvents, goals as goalsTable, recommendationFeedback } from "@workspace/db";
import { calculateContributionScenario, calculateCioRecommendation, type SpecialistSignal } from "../domain/intelligence";
import { parseMoneyToCents } from "../domain/finance";
import { getCashFlow, getFinanceInsights, getSafeToDeploy } from "./household-finance";
import { getGoals, getPortfolio, getRisk, getStrategies } from "./capital-os";
import { getPropertyUnderwriting } from "./property-underwriting";
import { ensureTenantCore } from "./seed";
import type { Actor } from "./capital-os";
import { getApprovedFamilyOfficeResearchProjection } from "./family-office";

const cents = (value: string | number | null | undefined) => parseMoneyToCents(String(value ?? "0"));
const dollars = (value: number) => (value / 100).toFixed(2);

async function saveAnalysis(householdId: string, signal: SpecialistSignal) {
  const [existing] = await db.select({ id: aiAnalyses.id }).from(aiAnalyses).where(and(
    eq(aiAnalyses.householdId, householdId),
    eq(aiAnalyses.analyst, signal.analyst),
    eq(aiAnalyses.scope, signal.scope),
  )).limit(1);
  const values = {
    householdId,
    analyst: signal.analyst,
    scope: signal.scope,
    summary: signal.summary,
    dataQuality: signal.dataQuality,
    confidence: signal.confidence.toFixed(2),
    evidence: signal.evidence,
  };
  if (existing) return db.update(aiAnalyses).set(values).where(eq(aiAnalyses.id, existing.id));
  return db.insert(aiAnalyses).values(values);
}

async function saveInsight(householdId: string, insight: {
  scope: string;
  title: string;
  description: string;
  severity: string;
  evidence: string[];
}) {
  const [existing] = await db.select({ id: aiInsights.id }).from(aiInsights).where(and(
    eq(aiInsights.householdId, householdId),
    eq(aiInsights.scope, insight.scope),
    eq(aiInsights.title, insight.title),
  )).limit(1);
  if (existing) return db.update(aiInsights).set(insight).where(eq(aiInsights.id, existing.id));
  return db.insert(aiInsights).values({ householdId, ...insight });
}

export async function refreshIntelligence(actor: Actor) {
  const [cashFlow, safeToDeploy, property, goals, portfolio, strategies, risk, financeInsights] = await Promise.all([
    getCashFlow(actor),
    getSafeToDeploy(actor),
    getPropertyUnderwriting(actor),
    getGoals(actor),
    getPortfolio(actor),
    getStrategies(actor),
    getRisk(actor),
    getFinanceInsights(actor),
  ]);
  const [goalRow] = await db.select({ id: goalsTable.id }).from(goalsTable)
    .where(eq(goalsTable.householdId, actor.householdId))
    .orderBy(goalsTable.priority)
    .limit(1);
  const [recommendationRow] = await db.select({ id: aiRecommendations.id }).from(aiRecommendations)
    .where(eq(aiRecommendations.householdId, actor.householdId))
    .orderBy(aiRecommendations.createdAt)
    .limit(1);
  const ids = {
    householdId: actor.householdId,
    ownerId: actor.userId,
    goalId: goalRow?.id ?? "",
    recommendationId: recommendationRow?.id ?? "",
  };
  const goal = goals[0];
  const topCandidate = property.candidates[0];
  const strategyConfidence = strategies.length
    ? Math.round(strategies.reduce((sum, strategy) => sum + strategy.confidenceScore, 0) / strategies.length)
    : 0;
  const confidenceScore = Math.round(
    (Number(safeToDeploy.confidenceScore) + Number(cashFlow.forecast.confidence) + property.dataConfidence) / 3,
  );
  const propertyGovernorStatus =
    topCandidate?.readinessStatus === "pass" || topCandidate?.readinessStatus === "blocked"
      ? topCandidate.readinessStatus
      : "review";
  const riskState =
    risk.state === "normal"
      ? "normal"
      : risk.state === "review" || risk.state === "safe_mode"
        ? "review"
        : "locked";
  const recommendation = calculateCioRecommendation({
    safeToDeployCents: cents(safeToDeploy.safeToDeploy),
    emergencyReserveMonths: property.household.emergencyReserveMonths,
    emergencyReserveTargetMonths: cashFlow.reserve.targetMonths,
    propertyReadinessScore: property.propertyGoal.readiness.score,
    propertyGovernorStatus,
    propertyCandidateCount: property.candidates.length,
    financeAnomalyCount: financeInsights.anomalyCount,
    freeCashFlowCents: cents(cashFlow.metrics.freeCashFlow),
    savingsRate: Number(cashFlow.metrics.savingsRate),
    riskState,
    emergencyStopActive: risk.emergencyStopActive,
    strategyCount: strategies.length,
    strategyConfidence,
    confidenceScore,
  });

  const specialistSignals: SpecialistSignal[] = [
    {
      analyst: "Household Analyst",
      scope: "household",
      summary: `Free cash flow is $${dollars(cents(cashFlow.metrics.freeCashFlow))} per month with a ${cashFlow.metrics.savingsRate}% savings rate.`,
      confidence: Number(cashFlow.forecast.confidence),
      dataQuality: Number(cashFlow.forecast.confidence) >= 80 ? "high" : "medium",
      evidence: [
        `Free cash flow: $${cashFlow.metrics.freeCashFlow}/month`,
        `Savings rate: ${cashFlow.metrics.savingsRate}%`,
        `Next income date: ${cashFlow.forecast.nextIncomeDate ?? "not scheduled"}`,
      ],
    },
    {
      analyst: "Duplex Goal Analyst",
      scope: "duplex_goal",
      summary: `${goal?.status ?? "Active"} · ${goal?.progressPercent?.toFixed(1) ?? "0.0"}% of the protected duplex reserve is funded.`,
      confidence: 84,
      dataQuality: "high",
      evidence: [
        `Protected reserve: $${goal?.currentAmount ?? "0.00"} of $${goal?.targetAmount ?? "0.00"}`,
        `Weekly contribution: $${goal?.weeklyContribution ?? "0.00"}`,
        `Target date: ${goal?.targetDate ?? "not set"}`,
      ],
    },
    {
      analyst: "Property Analyst",
      scope: "property",
      summary: topCandidate
        ? `${topCandidate.addressLabel} has a ${topCandidate.buyBoxScore}% Buy Box match and ${topCandidate.dealQualityScore}% deal-quality score.`
        : "No property candidates are available for comparison.",
      confidence: property.dataConfidence,
      dataQuality: property.dataConfidence >= 80 ? "high" : property.dataConfidence >= 60 ? "medium" : "low",
      evidence: topCandidate
        ? [`Buy Box match: ${topCandidate.buyBoxScore}%`, `Deal quality: ${topCandidate.dealQualityScore}%`, `Data confidence: ${property.dataConfidence}%`]
        : ["Property pipeline is empty"],
    },
    {
      analyst: "Strategy Analyst",
      scope: "strategy",
      summary: strategies.length
        ? `${strategies.length} strategy record(s) are being monitored; average confidence is ${strategyConfidence}/100.`
        : "No strategies are currently being monitored.",
      confidence: strategyConfidence,
      dataQuality: strategies.length ? "medium" : "low",
      evidence: strategies.map((strategy) => `${strategy.name}: ${strategy.stage}, ${strategy.confidenceScore}/100 confidence`),
    },
    {
      analyst: "Portfolio Analyst",
      scope: "portfolio",
      summary: `$${portfolio.totalCapital} is tracked across protected, active, and reserve sleeves; ledger balanced: ${portfolio.ledgerBalanced ? "yes" : "no"}.`,
      confidence: portfolio.ledgerBalanced ? 90 : 45,
      dataQuality: portfolio.ledgerBalanced ? "high" : "low",
      evidence: [
        `Total capital: $${portfolio.totalCapital}`,
        `Protected capital: $${portfolio.protectedCapital}`,
        `Ledger balanced: ${portfolio.ledgerBalanced ? "yes" : "no"}`,
      ],
    },
    {
      analyst: "Risk Advisor",
      scope: "risk",
      summary: risk.emergencyStopActive ? "Emergency stop is active." : `Risk Governor state is ${risk.state}; protected capital lock is ${risk.protectedCapitalLocked ? "active" : "under review"}.`,
      confidence: 96,
      dataQuality: "high",
      evidence: [
        `Risk state: ${risk.state}`,
        `Protected capital lock: ${risk.protectedCapitalLocked ? "active" : "review"}`,
        `Emergency stop: ${risk.emergencyStopActive ? "active" : "ready"}`,
      ],
    },
  ];

  await Promise.all(specialistSignals.map((signal) => saveAnalysis(ids.householdId, signal)));
  await Promise.all([
    saveInsight(ids.householdId, {
      scope: "household",
      title: financeInsights.anomalyCount ? "Household activity needs review" : "Household rhythm is holding",
      description: financeInsights.anomalyCount
        ? `${financeInsights.anomalyCount} transaction(s) are not fully reviewed. Resolve those before changing allocation.`
        : "Current cash flow and contribution signals support keeping the existing rhythm.",
      severity: financeInsights.anomalyCount ? "medium" : "low",
      evidence: [`Finance items needing review: ${financeInsights.anomalyCount}`, `Savings rate: ${cashFlow.metrics.savingsRate}%`],
    }),
    saveInsight(ids.householdId, {
      scope: "property",
      title: topCandidate?.readinessStatus === "blocked" ? "Top property is not offer-ready" : "Property research can continue",
      description: topCandidate?.readinessStatus === "blocked"
        ? "The current candidate fails the Property Capital Governor. Research may continue, but no offer action is recommended."
        : "Continue validating rents, insurance, repairs, and cash-to-close before advancing.",
      severity: topCandidate?.readinessStatus === "blocked" ? "high" : "low",
      evidence: topCandidate ? [`Governor: ${topCandidate.readinessStatus ?? "review"}`, `Next action: ${topCandidate.nextAction ?? "research further"}`] : ["No candidate data"],
    }),
  ]);

  await db.update(aiRecommendations).set({
    analyst: recommendation.analyst,
    priority: recommendation.priority,
    recommendation: recommendation.recommendation,
    rationale: recommendation.reason,
    expectedBenefit: recommendation.expectedBenefit,
    potentialDownside: recommendation.potentialDownside,
    riskImpact: recommendation.impactOnHouseholdLiquidity,
    dataQuality: recommendation.dataQuality,
    suggestedNextAction: recommendation.suggestedNextAction,
    evidence: recommendation.evidence,
    confidence: recommendation.confidence.toFixed(2),
    affectedGoalId: ids.goalId,
    affectedCapital: "Duplex Reserve and household liquidity",
  }).where(and(
    eq(aiRecommendations.id, ids.recommendationId),
    eq(aiRecommendations.householdId, ids.householdId),
  ));

  await appendAuditEvent({
    householdId: ids.householdId,
    eventType: "intelligence_refreshed",
    actor: actor.userId,
    entity: "intelligence_snapshot",
    entityId: ids.recommendationId,
    reason: "Deterministic advisory intelligence refreshed from current household, property, portfolio, strategy, and risk data.",
    metadata: { advisoryOnly: true, externalProvider: false },
  });
  return readIntelligenceSnapshot(actor);
}

async function readIntelligenceSnapshot(actor: Actor) {
  const seeded = await ensureTenantCore(actor.householdId, actor.userId);
  const ids = { householdId: actor.householdId, recommendationId: seeded.recommendationId };
  const [recommendationSeed] = await db.select({ id: aiRecommendations.id }).from(aiRecommendations)
    .where(eq(aiRecommendations.householdId, actor.householdId))
    .orderBy(aiRecommendations.createdAt)
    .limit(1);
  ids.recommendationId = recommendationSeed?.id ?? "";
  const [recommendation, analyses, insights, cashFlow, safeToDeploy, property, goals, portfolio, risk, researchContext] = await Promise.all([
    db.select().from(aiRecommendations).where(and(
      eq(aiRecommendations.id, ids.recommendationId),
      eq(aiRecommendations.householdId, ids.householdId),
    )).limit(1),
    db.select().from(aiAnalyses).where(eq(aiAnalyses.householdId, ids.householdId)),
    db.select().from(aiInsights).where(eq(aiInsights.householdId, ids.householdId)),
    getCashFlow(actor),
    getSafeToDeploy(actor),
    getPropertyUnderwriting(actor),
    getGoals(actor),
    getPortfolio(actor),
    getRisk(actor),
    getApprovedFamilyOfficeResearchProjection(actor),
  ]);
  if (!recommendation[0]) throw new Error("CIO recommendation was not found");
  const row = recommendation[0];
  return {
    recommendation: {
      id: row.id,
      analyst: row.analyst,
      priority: row.priority,
      recommendation: row.recommendation,
      reason: row.rationale,
      evidence: row.evidence,
      expectedBenefit: row.expectedBenefit,
      potentialDownside: row.potentialDownside,
      impactOnDuplexGoal: row.affectedCapital?.includes("Duplex") ? "Protected duplex reserve remains the priority." : "No direct goal impact recorded.",
      impactOnHouseholdLiquidity: row.riskImpact,
      riskLevel: row.priority === "critical" ? "high" : row.priority === "high" ? "moderate" : "low",
      confidence: Number(row.confidence),
      dataQuality: row.dataQuality,
      status: row.status,
      requiredApproval: row.status === "proposed" ? "Human review remains required for any change." : "Human decision recorded.",
      suggestedNextAction: row.suggestedNextAction ?? "Review the current household plan.",
      advisoryOnly: true,
      createdAt: row.createdAt,
    },
    analysts: analyses.map((analysis) => ({
      id: analysis.id,
      analyst: analysis.analyst,
      scope: analysis.scope,
      summary: analysis.summary,
      dataQuality: analysis.dataQuality,
      confidence: Number(analysis.confidence),
      evidence: analysis.evidence,
      createdAt: analysis.createdAt,
    })),
    insights: insights.map((insight) => ({
      id: insight.id,
      scope: insight.scope,
      title: insight.title,
      description: insight.description,
      severity: insight.severity,
      evidence: insight.evidence,
      createdAt: insight.createdAt,
    })),
    dailyBrief: {
      status: safeToDeploy.safeToDeploy === "0.00" ? "Review" : "Monitoring",
      safeToDeploy: safeToDeploy.safeToDeploy,
      emergencyReserveMonths: property.household.emergencyReserveMonths,
      propertyCandidates: property.candidates.length,
      topRecommendation: row.recommendation,
    },
    weeklyReport: {
      title: "Weekly CIO Report",
      summary: row.rationale,
      sections: ["Household cash flow", "Duplex progress", "Property readiness", "Portfolio", "Strategies", "Risk"],
      generatedAt: new Date().toISOString(),
    },
    monthlyReview: {
      openingNetWorth: portfolio.totalCapital,
      closingNetWorth: portfolio.totalCapital,
      change: "Historical comparison is not available in the current tracked snapshot.",
      income: cashFlow.metrics.grossInflow,
      expenses: dollars(cents(cashFlow.metrics.essentialOutflow) + cents(cashFlow.metrics.discretionaryOutflow) + cents(cashFlow.metrics.debtService)),
      savings: cashFlow.metrics.savingsContributions,
      investments: cashFlow.metrics.investmentContributions,
      duplexProgress: goals[0] ? `${goals[0].progressPercent.toFixed(1)}% funded · ${goals[0].status}` : "No duplex goal data",
      portfolioPerformance: `${portfolio.totalCapital} tracked capital · ledger balanced: ${portfolio.ledgerBalanced ? "yes" : "no"}`,
      propertyProgress: `${property.candidates.length} candidate(s) · readiness ${property.propertyGoal.readiness.score}/100`,
      riskReview: `${risk.state} · protected capital lock ${risk.protectedCapitalLocked ? "active" : "review"}`,
      topFinancialDecisions: [row.recommendation],
      nextMonthPriorities: [row.suggestedNextAction ?? "Review the current household plan."],
    },
    researchContext,
  };
}

export async function getIntelligenceSnapshot(actor: Actor) {
  const snapshot = await readIntelligenceSnapshot(actor);
  if (snapshot.analysts.length === 0) return refreshIntelligence(actor);
  return snapshot;
}

export async function runContributionScenario(proposedWeekly: string, actor: Actor) {
  const [goals] = await Promise.all([getGoals(actor)]);
  const ids = { householdId: actor.householdId, goalId: goals[0]?.id ?? "" };
  const goal = goals[0];
  if (!goal) throw new Error("Duplex goal was not found");
  const result = {
    name: "Contribution pace scenario",
    proposedWeekly,
    ...calculateContributionScenario({
      currentWeeklyCents: cents(goal.weeklyContribution),
      proposedWeeklyCents: cents(proposedWeekly),
      remainingGoalCents: cents(goal.amountRemaining),
    }),
    currentSafeToDeploy: (await getSafeToDeploy(actor)).safeToDeploy,
    productionDataChanged: false,
    householdId: ids.householdId,
  };
  await appendAuditEvent({
    householdId: ids.householdId,
    eventType: "intelligence_scenario_created",
    actor: actor.userId,
    entity: "contribution_scenario",
    entityId: ids.goalId,
    reason: "Planning-only contribution pace scenario calculated; production data was not changed.",
    metadata: { advisoryOnly: true, productionDataChanged: false, proposedWeekly },
  });
  return result;
}

export async function recordRecommendationFeedback(
  actor: Actor,
  input: { recommendationId: string; feedback: "helpful" | "not_helpful" | "implemented" | "dismissed"; note?: string },
) {
  const ids = { householdId: actor.householdId };
  const [recommendation] = await db.select({ id: aiRecommendations.id }).from(aiRecommendations).where(and(
    eq(aiRecommendations.id, input.recommendationId),
    eq(aiRecommendations.householdId, ids.householdId),
  )).limit(1);
  if (!recommendation) throw new Error("Recommendation was not found");
  const [saved] = await db.insert(recommendationFeedback).values({
    householdId: ids.householdId,
    recommendationId: recommendation.id,
    feedback: input.feedback,
    note: input.note,
    createdBy: actor.userId,
  }).returning();
  await appendAuditEvent({
    householdId: ids.householdId,
    eventType: "recommendation_feedback_recorded",
    actor: actor.userId,
    entity: "recommendation_feedback",
    entityId: saved.id,
    reason: input.note ?? `Recommendation feedback: ${input.feedback}`,
    metadata: { recommendationId: recommendation.id, feedback: input.feedback, advisoryOnly: true },
  });
  return {
    id: saved.id,
    recommendationId: saved.recommendationId,
    feedback: saved.feedback,
    note: saved.note,
    createdAt: saved.createdAt,
    advisoryOnly: true,
  };
}