import test from "node:test";
import assert from "node:assert/strict";
import { allocationDecision, calculateTreasuryMetrics } from "./treasury.ts";

const policy = {
  minimumOperatingCash: "2000.00",
  emergencyTargetMonths: 6,
  minimumWeeklyDuplexContribution: "200.00",
  maximumStrategyPercent: "15",
  maximumSingleStrategyPercent: "5",
  maximumSingleVenuePercent: "5",
  maximumIlliquidPercent: "20",
  maximumActivePercent: "30",
  autoScale: false,
  version: "1",
};

test("protected reserves remain outside eligible capital", () => {
  const result = calculateTreasuryMetrics({
    policy,
    safeToDeploy: "900.00",
    essentialMonthlyExpenses: "3000.00",
    weeklyDuplexContribution: "200.00",
    buckets: [
      { id: "operating", name: "Operating", bucketType: "OPERATING", priority: 1, targetAmount: "2000.00", minimumAmount: "2000.00", maximumAmount: "0", currentBalance: "3000.00", protected: false, liquid: true, liquidityClass: "IMMEDIATE", riskClass: "conservative", withdrawalPolicy: "Household obligations only", fundingRule: "Before allocations" },
      { id: "emergency", name: "Emergency", bucketType: "EMERGENCY", priority: 2, targetAmount: "18000.00", minimumAmount: "18000.00", maximumAmount: "0", currentBalance: "18000.00", protected: true, liquid: true, liquidityClass: "ONE_TO_THREE_DAYS", riskClass: "protected", withdrawalPolicy: "Emergency only", fundingRule: "Until six months covered" },
      { id: "strategy", name: "Strategy", bucketType: "STRATEGY", priority: 8, targetAmount: "0", minimumAmount: "0", maximumAmount: "0", currentBalance: "1000.00", protected: false, liquid: true, liquidityClass: "SEVEN_TO_THIRTY_DAYS", riskClass: "experimental", withdrawalPolicy: "Human review", fundingRule: "After protected priorities" },
    ],
  });
  assert.equal(result.totals.protectedCapital, "18000.00");
  assert.equal(result.health.emergencyCoverage, 6);
  assert.equal(result.health.state, "NORMAL");
});

test("a protected-capital request is fail-closed", () => {
  const decision = allocationDecision({
    requestedAmountCents: 5000,
    safeToDeployCents: 10000,
    currentStrategyCents: 0,
    totalLiquidCents: 100000,
    maxStrategyPercent: 15,
    protectedCapitalLocked: true,
  });
  assert.equal(decision.approved, false);
  assert.match(decision.reason, /locked/);
});