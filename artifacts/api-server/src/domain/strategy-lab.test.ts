import assert from "node:assert/strict";
import test from "node:test";
import { evaluateGraduation, simulateStrategyExperiment } from "./strategy-lab.ts";

test("strategy simulations are reproducible for the same version and seed", () => {
  const input = { strategyType: "mean_reversion", mode: "backtest" as const, executionModel: "queue_aware" as const, randomSeed: 42 };
  assert.deepEqual(simulateStrategyExperiment(input), simulateStrategyExperiment(input));
});

test("execution friction is included and optimistic assumptions are disclosed", () => {
  const result = simulateStrategyExperiment({
    strategyType: "dual_sided_market_making",
    mode: "shadow",
    executionModel: "conservative",
    randomSeed: 7,
  });
  assert.ok(result.partialFillRatePct > 0);
  assert.ok(result.adverseSelectionBps > 0);
  assert.ok(result.feeBps > 0);
  assert.equal(result.dataChecks.futureDataLeakage, false);
});

test("paper graduation is eligibility only and requires evidence gates", () => {
  const result = evaluateGraduation({
    stage: "paper",
    hypothesis: "A tested economic edge persists after execution costs.",
    versionExists: true,
    experiments: [{
      mode: "paper",
      status: "completed",
      metrics: { fills: 540, marketDays: 36, evidenceScore: 82, inventoryLimitBreaches: 0 },
    }],
  });
  assert.equal(result.eligible, true);
  assert.equal(result.liveTradingEnabled, false);
});