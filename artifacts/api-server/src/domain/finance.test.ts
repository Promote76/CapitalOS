import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateAllocationImpact,
  calculateGoalMetrics,
  centsToMoney,
  normalizeAllocation,
  parseMoneyToCents,
} from "./finance.ts";

test("money uses exact cents without floating point drift", () => {
  assert.equal(parseMoneyToCents("250.00"), 25_000);
  assert.equal(parseMoneyToCents("0.10") + parseMoneyToCents("0.20"), 30);
  assert.equal(centsToMoney(30), "0.30");
  assert.throws(() => parseMoneyToCents("1.005"));
});

test("allocation totals preserve the weekly contribution", () => {
  const allocation = normalizeAllocation({
    duplexReserve: 20_000,
    capitalOs: 2_500,
    opportunityReserve: 2_500,
  });
  assert.equal(allocation.total, 25_000);
});

test("goal progress reports pace and remaining capital", () => {
  const metrics = calculateGoalMetrics({
    targetAmountCents: 120_000,
    currentAmountCents: 48_260,
    weeklyContributionCents: 20_000,
    weeksRemaining: 52,
  });
  assert.equal(metrics.progressPercent, 40.22);
  assert.equal(metrics.amountRemainingCents, 71_740);
  assert.equal(metrics.requiredWeeklyContributionCents, 1_380);
  assert.equal(metrics.projectedCompletionWeeks, 4);
  assert.equal(metrics.status, "ahead");
});

test("allocation impact makes a slower duplex contribution visible", () => {
  const impact = calculateAllocationImpact(
    { total: 25_000, duplexReserve: 20_000, capitalOs: 2_500, opportunityReserve: 2_500 },
    { duplexReserve: 17_500, capitalOs: 2_500, opportunityReserve: 5_000 },
    { amountRemainingCents: 71_740, currentDuplexWeeklyCents: 20_000 },
  );
  assert.equal(impact.totalMatches, true);
  assert.equal(impact.duplexWeeklyChangeCents, -2_500);
  assert.equal(impact.propertyReadinessImpact, "slows");
  assert.ok(impact.projectedDelayWeeks > 0);
});