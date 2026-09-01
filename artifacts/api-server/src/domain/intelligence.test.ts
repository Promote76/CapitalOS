import assert from "node:assert/strict";
import test from "node:test";
import { calculateCioRecommendation, calculateContributionScenario, dataQualityFromConfidence } from "./intelligence.ts";

test("CIO prioritizes a locked Risk Governor over growth", () => {
  const recommendation = calculateCioRecommendation({
    safeToDeployCents: 50000,
    emergencyReserveMonths: 6,
    emergencyReserveTargetMonths: 6,
    propertyReadinessScore: 80,
    propertyGovernorStatus: "pass",
    propertyCandidateCount: 2,
    financeAnomalyCount: 0,
    freeCashFlowCents: 200000,
    savingsRate: 15,
    riskState: "locked",
    emergencyStopActive: false,
    strategyCount: 1,
    strategyConfidence: 78,
    confidenceScore: 90,
  });
  assert.equal(recommendation.priority, "critical");
  assert.match(recommendation.recommendation, /Pause/);
});

test("CIO blocks discretionary deployment when Safe-to-Deploy is zero", () => {
  const recommendation = calculateCioRecommendation({
    safeToDeployCents: 0,
    emergencyReserveMonths: 2,
    emergencyReserveTargetMonths: 3,
    propertyReadinessScore: 66,
    propertyGovernorStatus: "blocked",
    propertyCandidateCount: 1,
    financeAnomalyCount: 0,
    freeCashFlowCents: 349900,
    savingsRate: 12,
    riskState: "normal",
    emergencyStopActive: false,
    strategyCount: 1,
    strategyConfidence: 78,
    confidenceScore: 86,
  });
  assert.equal(recommendation.priority, "high");
  assert.ok(recommendation.evidence.length >= 3);
  assert.equal(recommendation.requiredApproval, "None for maintaining the existing plan.");
});

test("missing signals reduce data quality rather than inventing certainty", () => {
  assert.equal(dataQualityFromConfidence(91, 0), "high");
  assert.equal(dataQualityFromConfidence(82, 1), "medium");
  assert.equal(dataQualityFromConfidence(55, 0), "low");
});

test("contribution scenarios stay deterministic and do not mutate the goal", () => {
  const result = calculateContributionScenario({
    currentWeeklyCents: 20000,
    proposedWeeklyCents: 30000,
    remainingGoalCents: 12000000,
  });
  assert.equal(result.currentWeeks, 600);
  assert.equal(result.proposedWeeks, 400);
  assert.equal(result.weeksEarlier, 200);
  assert.equal(result.weeklyChangeCents, 10000);
});