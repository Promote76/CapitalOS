export type StrategyLabMode = "backtest" | "walk_forward" | "shadow" | "paper";
export type ExecutionModel = "optimistic" | "moderate" | "conservative" | "queue_aware";

export type SimulationInput = {
  strategyType: string;
  mode: StrategyLabMode;
  executionModel: ExecutionModel;
  randomSeed: number;
  parameterCount?: number;
};

const executionPenalty: Record<ExecutionModel, number> = {
  optimistic: 0.45,
  moderate: 1.05,
  conservative: 1.75,
  queue_aware: 2.2,
};

const modeCoverage: Record<StrategyLabMode, { orders: number; days: number; multiplier: number }> = {
  backtest: { orders: 2100, days: 252, multiplier: 1 },
  walk_forward: { orders: 1650, days: 180, multiplier: 0.88 },
  shadow: { orders: 720, days: 42, multiplier: 0.78 },
  paper: { orders: 540, days: 36, multiplier: 0.72 },
};

function normalizedType(strategyType: string): string {
  return strategyType.toLowerCase().replace(/[^a-z]/g, "");
}

function hashSeed(seed: number, strategyType: string): number {
  let hash = Math.abs(Math.trunc(seed)) || 1;
  for (const character of strategyType) hash = (hash * 31 + character.charCodeAt(0)) % 2147483647;
  return hash;
}

function noise(seed: number, index: number): number {
  const value = (seed * (index + 17) * 48271) % 2147483647;
  return (value / 2147483647) * 2 - 1;
}

function fixed(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

export function simulateStrategyExperiment(input: SimulationInput) {
  const type = normalizedType(input.strategyType);
  const coverage = modeCoverage[input.mode];
  const seed = hashSeed(input.randomSeed, input.strategyType);
  const isMarketMaking = type.includes("marketmaking") || type.includes("markets");
  const isTreasury = type.includes("treasury") || type.includes("yield");
  const baseEdge = isTreasury ? 4.1 : isMarketMaking ? 5.2 : type.includes("momentum") ? 2.4 : 3.1;
  const penalty = executionPenalty[input.executionModel];
  const volatilityDrag = Math.abs(noise(seed, 2)) * 1.35;
  const adverseSelectionBps = fixed((isMarketMaking ? 2.1 : 0.8) + penalty * 0.8 + volatilityDrag);
  const feeBps = fixed(isTreasury ? 0.15 : 0.7 + penalty * 0.15);
  const slippageBps = fixed(0.55 + penalty * 0.45 + Math.abs(noise(seed, 7)) * 0.3);
  const grossSpreadCaptureBps = fixed(baseEdge + 1.2 + noise(seed, 4) * 0.35);
  const rebatesBps = fixed(isMarketMaking ? 0.35 : 0.05);
  const hedgeCostBps = fixed(isMarketMaking ? 0.4 + penalty * 0.2 : 0.1);
  const inventoryLossBps = fixed(isMarketMaking ? 0.65 + Math.abs(noise(seed, 9)) * 0.5 : 0.15);
  const netEdgeBps = fixed(grossSpreadCaptureBps + rebatesBps - adverseSelectionBps - feeBps - slippageBps - inventoryLossBps - hedgeCostBps);
  const partialFillRatePct = fixed(18 + penalty * 9 + Math.abs(noise(seed, 11)) * 8);
  const fillRatePct = fixed(Math.max(18, 78 - penalty * 14 - Math.abs(noise(seed, 13)) * 7));
  const fills = Math.round(coverage.orders * fillRatePct / 100);
  const trades = Math.max(1, Math.round(fills * (isMarketMaking ? 0.58 : 0.44)));
  const totalReturnPct = fixed(netEdgeBps * fills / 10000 * coverage.multiplier);
  const maxDrawdownPct = fixed(2.3 + penalty * 1.4 + Math.abs(noise(seed, 17)) * 1.8 + (input.mode === "paper" ? 0.4 : 0));
  const winRatePct = fixed(Math.min(72, 48 + netEdgeBps * 2.4 + noise(seed, 19) * 2));
  const averageWinBps = fixed(Math.max(1.2, 5.4 + noise(seed, 23)));
  const averageLossBps = fixed(Math.max(2.2, 4.6 + penalty * 0.5 + Math.abs(noise(seed, 29))));
  const profitFactor = fixed(Math.max(0.62, (winRatePct * averageWinBps) / Math.max(1, (100 - winRatePct) * averageLossBps)));
  const evidenceScore = Math.max(18, Math.min(94, Math.round(
    36 + Math.min(26, fills / 70) + Math.min(15, coverage.days / 18) +
    (input.mode === "walk_forward" ? 8 : 0) + (input.executionModel === "queue_aware" ? 5 : 0) -
    (input.parameterCount ?? 4) * 0.8 - (maxDrawdownPct > 7 ? 8 : 0),
  )));
  const regimeBase = netEdgeBps;
  const regimes = {
    lowVolatilityBps: fixed(regimeBase + 1.2),
    normalVolatilityBps: fixed(regimeBase + 0.4),
    highVolatilityBps: fixed(regimeBase - 1.4),
    extremeVolatilityBps: fixed(regimeBase - 3.1),
    trendingBps: fixed(regimeBase - 0.2),
    rangeBoundBps: fixed(regimeBase + 0.7),
  };
  const criticalModelErrors = input.executionModel === "optimistic" && input.mode !== "backtest" ? 1 : 0;
  return {
    orders: coverage.orders,
    fills,
    trades,
    marketDays: coverage.days,
    independentEvents: Math.round(coverage.days * (isMarketMaking ? 5.2 : 2.1)),
    totalReturnPct,
    annualizedReturnPct: fixed(totalReturnPct * (252 / Math.max(1, coverage.days))),
    profitFactor,
    winRatePct,
    averageWinBps,
    averageLossBps,
    expectancyBps: netEdgeBps,
    maxDrawdownPct,
    averageDrawdownPct: fixed(maxDrawdownPct * 0.42),
    recoveryTimeDays: Math.max(1, Math.round(maxDrawdownPct * 1.8)),
    sharpeRatio: fixed(netEdgeBps / Math.max(1, maxDrawdownPct) * 1.8),
    sortinoRatio: fixed(netEdgeBps / Math.max(1, maxDrawdownPct) * 2.3),
    calmarRatio: fixed(totalReturnPct / Math.max(0.1, maxDrawdownPct)),
    volatilityPct: fixed(5.2 + penalty * 1.7),
    exposurePct: fixed(isMarketMaking ? 34 + penalty * 8 : 48 + penalty * 5),
    turnover: fixed(1.8 + fills / 900),
    fillRatePct,
    partialFillRatePct,
    adverseSelectionBps,
    grossSpreadCaptureBps,
    rebatesBps,
    feeBps,
    slippageBps,
    hedgeCostBps,
    inventoryLossBps,
    netEdgeBps,
    latencyMs: Math.round(100 + penalty * 70 + Math.abs(noise(seed, 31)) * 40),
    inventoryPeak: fixed(isMarketMaking ? 1.4 + penalty * 0.8 : 0.8),
    inventoryLimitBreaches: maxDrawdownPct > 7 ? 1 : 0,
    averageHoldingMinutes: Math.round(isMarketMaking ? 18 + penalty * 11 : 95 + penalty * 20),
    riskEvents: maxDrawdownPct > 7 ? ["drawdown threshold review"] : ["no hard risk events"],
    regimes,
    tradeDistribution: {
      bestTradeBps: fixed(averageWinBps * 2.7),
      worstTradeBps: fixed(-averageLossBps * 2.9),
      medianTradeBps: fixed(netEdgeBps * 0.8),
      holdingTimeDistribution: "mostly short duration; tail reviewed separately",
    },
    evidenceScore,
    dataQuality: input.mode === "backtest" ? "medium" : "high",
    criticalModelErrors,
    reproducibility: { deterministic: true, randomSeed: input.randomSeed, softwareVersion: "capital-os-lab-1" },
    dataChecks: {
      futureDataLeakage: false,
      duplicatedEvents: false,
      timestampDisorder: false,
      missingIntervals: input.mode === "backtest" ? false : true,
      invalidPrices: false,
      invalidSizes: false,
    },
    executionLabel: input.executionModel === "optimistic" ? "Use cautiously; does not model queue friction." : "Execution friction included.",
    warning: "SIMULATED RESEARCH RESULT — NOT REAL PERFORMANCE",
  };
}

export function evaluateGraduation(input: {
  stage: string;
  hypothesis?: string | null;
  versionExists: boolean;
  experiments: Array<{ mode: string; metrics: Record<string, unknown>; status: string }>;
}) {
  const latest = (mode: string) => input.experiments.find((experiment) => experiment.mode === mode && experiment.status === "completed");
  const backtest = latest("backtest");
  const walkForward = latest("walk_forward");
  const shadow = latest("shadow");
  const paper = latest("paper");
  const gates = [
    { name: "Written economic hypothesis", passed: Boolean(input.hypothesis?.trim()) },
    { name: "Immutable strategy version", passed: input.versionExists },
  ];
  if (input.stage === "research") {
    gates.push({ name: "Ready to begin historical backtest", passed: true });
  } else if (input.stage === "backtest") {
    gates.push({ name: "Positive out-of-sample expectancy", passed: Number(walkForward?.metrics.expectancyBps ?? -1) > 0 });
    gates.push({ name: "Execution and data checks pass", passed: Boolean(backtest && Number(backtest.metrics.criticalModelErrors ?? 1) === 0 && backtest.metrics.dataChecks && !(backtest.metrics.dataChecks as { futureDataLeakage?: boolean }).futureDataLeakage) });
  } else if (input.stage === "shadow") {
    gates.push({ name: "Minimum hypothetical runtime", passed: Number(shadow?.metrics.marketDays ?? 0) >= 30 });
    gates.push({ name: "Positive realistic expectancy", passed: Number(shadow?.metrics.expectancyBps ?? -1) > 0 });
    gates.push({ name: "Risk rules defined", passed: true });
  } else if (input.stage === "paper") {
    gates.push({ name: "500+ paper fills", passed: Number(paper?.metrics.fills ?? 0) >= 500 });
    gates.push({ name: "30+ paper days", passed: Number(paper?.metrics.marketDays ?? 0) >= 30 });
    gates.push({ name: "Evidence score above threshold", passed: Number(paper?.metrics.evidenceScore ?? 0) >= 75 });
    gates.push({ name: "No uncontrolled inventory event", passed: Number(paper?.metrics.inventoryLimitBreaches ?? 1) === 0 });
  } else {
    gates.push({ name: "Capital remains behind the research gate", passed: false });
  }
  const eligible = gates.every((gate) => gate.passed) && input.stage === "paper";
  return {
    eligible,
    decision: eligible ? "micro_live_eligible" : "continue_testing",
    nextStage: input.stage === "research" ? "backtest" : input.stage === "backtest" ? "shadow" : input.stage === "shadow" ? "paper" : input.stage === "paper" ? "micro_live" : input.stage,
    gates,
    liveTradingEnabled: false,
    note: eligible ? "Eligibility review only. Live trading remains disabled." : "Do not advance until every gate is satisfied.",
  };
}