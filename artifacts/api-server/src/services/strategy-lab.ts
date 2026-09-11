import { appendAuditEvent, appendAuditEvents } from "./audit";
import { and, desc, eq } from "drizzle-orm";
import {
  auditEvents,
  researchJournalEntries,
  strategies,
  strategyExperiments,
  strategyVersions,
  type Strategy,
  type StrategyExperiment,
} from "@workspace/db";
import { db } from "@workspace/db";
import { assertPermission, GovernanceError } from "../domain/governance";
import { evaluateGraduation, simulateStrategyExperiment, type ExecutionModel, type StrategyLabMode } from "../domain/strategy-lab";
import { ensureTenantCore, type SeedContext } from "./seed";
import type { Actor } from "./capital-os";

type StrategyTemplate = {
  name: string;
  strategyType: string;
  description: string;
  hypothesis: string;
  markets: string[];
  venues: string[];
  assets: string[];
  timeHorizon: string;
  entryLogic: string;
  exitLogic: string;
  positionSizingLogic: string;
  riskLogic: string;
  executionModel: string;
  requiredData: string[];
  assumptions: string[];
  knownRisks: string[];
};

const templates: StrategyTemplate[] = [
  {
    name: "Duplex first",
    strategyType: "core_plan",
    description: "Protected household plan for keeping the duplex reserve pointed at one acquisition window.",
    hypothesis: "A steady protected contribution rhythm increases the probability of reaching a prepared duplex acquisition without exposing household reserves to experimental risk.",
    markets: ["Household planning"],
    venues: ["Capital OS ledger"],
    assets: ["Protected duplex reserve"],
    timeHorizon: "Through June 2027",
    entryLogic: "Record planned contributions against the protected duplex goal.",
    exitLogic: "Review at acquisition, goal completion, or approved household change.",
    positionSizingLogic: "Fixed weekly allocation governed by the household plan.",
    riskLogic: "Protected capital lock and post-close liquidity floor.",
    executionModel: "Moderate",
    requiredData: ["Contributions", "Cash flow", "Property readiness"],
    assumptions: ["This is a planning strategy, not a traded strategy"],
    knownRisks: ["Income change", "Property readiness delay", "Required expense pressure"],
  },
  {
    name: "Dual-Sided Market Making",
    strategyType: "dual_sided_market_making",
    description: "Research template for quoting both sides of a sufficiently liquid market.",
    hypothesis: "During normal volatility, two-sided liquidity may produce positive net expectancy after adverse selection, fees, inventory costs, and missed fills.",
    markets: ["Prediction markets", "Electronic markets"],
    venues: ["Read-only venue adapter"],
    assets: ["Binary contracts", "Liquid pairs"],
    timeHorizon: "Seconds to hours",
    entryLogic: "Quote both sides when spread and displayed depth clear configured thresholds.",
    exitLogic: "Cancel stale quotes and flatten inventory at risk limits.",
    positionSizingLogic: "Inventory-aware fixed notional with hard caps.",
    riskLogic: "Soft, warning, and hard inventory limits plus volatility pause.",
    executionModel: "Queue-aware",
    requiredData: ["Trades", "Quotes", "Order book depth", "Venue fees"],
    assumptions: ["Public market data is timestamped in UTC", "No fill is assumed from price touch alone"],
    knownRisks: ["Adverse selection", "Inventory accumulation", "Liquidity shocks"],
  },
  {
    name: "Prediction Market Relative Value",
    strategyType: "prediction_market_relative_value",
    description: "Research template for testing pricing differences across related prediction contracts.",
    hypothesis: "Related contracts can temporarily diverge when information is fragmented, but the gap must survive fees, latency, and resolution risk.",
    markets: ["Prediction markets"],
    venues: ["Read-only venue adapter"],
    assets: ["Related event contracts"],
    timeHorizon: "Hours to weeks",
    entryLogic: "Enter only when normalized price difference exceeds execution and resolution costs.",
    exitLogic: "Exit at convergence or before the data-confidence deadline.",
    positionSizingLogic: "Equal-risk pairs with a small per-event cap.",
    riskLogic: "Resolution, correlation-break, and liquidity limits.",
    executionModel: "Moderate",
    requiredData: ["Quotes", "Trades", "Contract metadata", "Resolution rules"],
    assumptions: ["Contracts are comparable and independently timestamped"],
    knownRisks: ["Model mismatch", "Resolution ambiguity", "Stale quotes"],
  },
  {
    name: "Cross-Market Relative Value",
    strategyType: "cross_market_relative_value",
    description: "Research template for comparing related instruments across venues without live routing.",
    hypothesis: "Temporary cross-market dislocations may mean-revert when venue and settlement costs are modeled conservatively.",
    markets: ["Cross-market pairs"],
    venues: ["Read-only venue adapter"],
    assets: ["Paired instruments"],
    timeHorizon: "Minutes to days",
    entryLogic: "Screen normalized spread and data freshness before creating a simulated pair.",
    exitLogic: "Close on convergence, timeout, or data-quality failure.",
    positionSizingLogic: "Volatility-scaled pair notional.",
    riskLogic: "Basis, venue outage, and correlation-break limits.",
    executionModel: "Conservative",
    requiredData: ["Synchronized quotes", "Trades", "Fees", "Settlement calendar"],
    assumptions: ["Venue timestamps can be aligned"],
    knownRisks: ["Latency", "Settlement mismatch", "Execution asymmetry"],
  },
  {
    name: "Funding / Basis",
    strategyType: "funding_basis",
    description: "Research template for studying carry after funding, borrow, fees, and execution costs.",
    hypothesis: "Funding or basis premia may compensate for balance-sheet and execution risks in stable regimes, but carry can reverse quickly.",
    markets: ["Crypto derivatives", "Cash markets"],
    venues: ["Read-only venue adapter"],
    assets: ["Spot and perpetual pairs"],
    timeHorizon: "Hours to months",
    entryLogic: "Screen funding, basis, liquidity, and data age.",
    exitLogic: "Exit when carry closes, risk limits trigger, or data becomes stale.",
    positionSizingLogic: "Small delta-neutral notional with explicit capacity limits.",
    riskLogic: "Basis widening, funding reversal, and venue health gates.",
    executionModel: "Conservative",
    requiredData: ["Funding rates", "Best bid/ask", "Volume", "Borrow assumptions"],
    assumptions: ["Funding observations are available without private credentials"],
    knownRisks: ["Basis risk", "Funding reversal", "Counterparty exposure"],
  },
  {
    name: "Mean Reversion",
    strategyType: "mean_reversion",
    description: "Research template for testing bounded reversion after temporary price dislocations.",
    hypothesis: "Short-lived deviations from a stable reference can revert when liquidity remains available and the move is not a regime break.",
    markets: ["Liquid spot markets"],
    venues: ["Historical dataset"],
    assets: ["Reference pairs"],
    timeHorizon: "Minutes to days",
    entryLogic: "Enter after a deviation clears a volatility-adjusted threshold.",
    exitLogic: "Exit on reversion, timeout, or regime change.",
    positionSizingLogic: "Volatility-scaled with a fixed loss budget.",
    riskLogic: "Maximum consecutive losses and regime pause.",
    executionModel: "Moderate",
    requiredData: ["Trades", "Quotes", "Volatility", "Market regime labels"],
    assumptions: ["Reference price is available only up to simulated timestamp"],
    knownRisks: ["Trend continuation", "Lookahead bias", "Crowded exits"],
  },
  {
    name: "Momentum",
    strategyType: "momentum",
    description: "Research template for testing persistent directional movement with bounded exposure.",
    hypothesis: "Information diffusion can create short-lived continuation, but reversals and costs may erase the apparent edge.",
    markets: ["Liquid spot markets"],
    venues: ["Historical dataset"],
    assets: ["Liquid reference instruments"],
    timeHorizon: "Hours to weeks",
    entryLogic: "Enter after a confirmed trend signal and data-quality check.",
    exitLogic: "Exit on signal reversal, timeout, or drawdown rule.",
    positionSizingLogic: "Risk-budgeted notional based on realized volatility.",
    riskLogic: "Trend-break, gap, and daily loss limits.",
    executionModel: "Moderate",
    requiredData: ["Trades", "Quotes", "Volatility", "Corporate or event calendar"],
    assumptions: ["Signal features are lagged to simulated time"],
    knownRisks: ["Whipsaw", "Gap risk", "Crowded positioning"],
  },
  {
    name: "Statistical Arbitrage",
    strategyType: "statistical_arbitrage",
    description: "Research template for testing relationships across a selected instrument basket.",
    hypothesis: "Stable relationships can create relative-value opportunities, provided the relationship survives regime changes and realistic turnover.",
    markets: ["Multi-asset pairs"],
    venues: ["Historical dataset"],
    assets: ["Correlated instruments"],
    timeHorizon: "Minutes to weeks",
    entryLogic: "Enter only when relationship and liquidity checks pass.",
    exitLogic: "Exit on convergence, relationship break, or risk limit.",
    positionSizingLogic: "Equal-risk basket with concentration caps.",
    riskLogic: "Factor, correlation, and model-error limits.",
    executionModel: "Queue-aware",
    requiredData: ["Synchronized prices", "Quotes", "Factor data", "Fees"],
    assumptions: ["Relationship selection is frozen before validation"],
    knownRisks: ["Correlation breakdown", "Data snooping", "Turnover drag"],
  },
  {
    name: "Treasury / Cash Yield",
    strategyType: "treasury_cash_yield",
    description: "Research template for comparing low-volatility cash and treasury yield assumptions.",
    hypothesis: "Low-volatility yield may improve idle-cash efficiency when liquidity, duration, and counterparty risks are fully disclosed.",
    markets: ["Treasury and cash yield"],
    venues: ["Reference data only"],
    assets: ["Cash equivalents", "Treasury instruments"],
    timeHorizon: "Days to months",
    entryLogic: "Compare net yield after fees and availability constraints.",
    exitLogic: "Exit when liquidity needs or duration limits change.",
    positionSizingLogic: "Only simulated balances with a household-defined liquidity floor.",
    riskLogic: "Maturity, liquidity, and issuer limits.",
    executionModel: "Optimistic",
    requiredData: ["Yield curve", "Fees", "Maturity", "Liquidity window"],
    assumptions: ["No leverage or margin", "Cash needs remain outside the lab"],
    knownRisks: ["Rate changes", "Liquidity timing", "Issuer exposure"],
  },
];

function dateTime(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function metricsOf(experiment: StrategyExperiment): Record<string, unknown> {
  return experiment.metrics as Record<string, unknown>;
}

async function ensureStrategyLabSeed(ids: SeedContext) {
  const current = await db.select().from(strategies).where(eq(strategies.householdId, ids.householdId));
  const byName = new Map(current.map((strategy) => [strategy.name, strategy]));
  for (const template of templates) {
    let strategy = byName.get(template.name);
    if (!strategy) {
      const [created] = await db.insert(strategies).values({
        householdId: ids.householdId,
        ...template,
        stage: "research",
        allocation: "0.00",
        confidenceScore: "0.00",
        riskLevel: "unproven",
        runtimeDays: "0",
        enabled: false,
      }).returning();
      strategy = created;
      byName.set(template.name, created);
    } else if (!strategy.hypothesis || !strategy.description) {
      const [updated] = await db.update(strategies).set(template).where(eq(strategies.id, strategy.id)).returning();
      strategy = updated;
      byName.set(template.name, updated);
    }
    const versions = await db.select({ id: strategyVersions.id }).from(strategyVersions).where(eq(strategyVersions.strategyId, strategy.id)).limit(1);
    if (versions.length === 0) {
      await db.insert(strategyVersions).values({
        strategyId: strategy.id,
        version: "1.0",
        configuration: { template: true, hypothesisRequired: true, immutable: true },
      });
    }
    const journal = await db.select({ id: researchJournalEntries.id }).from(researchJournalEntries).where(eq(researchJournalEntries.strategyId, strategy.id)).limit(1);
    if (journal.length === 0) {
      await db.insert(researchJournalEntries).values({
        householdId: ids.householdId,
        strategyId: strategy.id,
        entryType: "hypothesis",
        title: "Research hypothesis recorded",
        body: template.hypothesis,
        createdBy: ids.ownerId,
      });
    }
  }
  const experiments = await db.select({ id: strategyExperiments.id }).from(strategyExperiments).where(eq(strategyExperiments.householdId, ids.householdId)).limit(1);
  if (experiments.length === 0) {
    const failedStrategy = byName.get("Mean Reversion");
    if (failedStrategy) {
      const [version] = await db.select().from(strategyVersions).where(eq(strategyVersions.strategyId, failedStrategy.id)).limit(1);
      if (version) {
        await db.insert(strategyExperiments).values({
          householdId: ids.householdId,
          strategyId: failedStrategy.id,
          strategyVersionId: version.id,
          name: "Mean reversion baseline · failed review",
          mode: "backtest",
          datasetVersion: "historical-demo-2026-08",
          status: "completed",
          parameters: { lookback: 20, threshold: 2 },
          executionAssumptions: { model: "conservative", feesIncluded: true, slippageIncluded: true },
          riskLimits: { maxDrawdownPct: 6, maxDailyLossPct: 1 },
          randomSeed: "17",
          metrics: { ...simulateStrategyExperiment({ strategyType: failedStrategy.strategyType, mode: "backtest", executionModel: "conservative", randomSeed: 17 }), totalReturnPct: -1.8, expectancyBps: -0.7, maxDrawdownPct: 8.2, fills: 318, evidenceScore: 28 },
          failureReason: "No repeatable edge after fees and slippage in high-volatility periods.",
          completedAt: new Date(),
        });
      }
    }
  }
  const seededFailure = await db.select().from(strategyExperiments)
    .where(and(eq(strategyExperiments.householdId, ids.householdId), eq(strategyExperiments.name, "Mean reversion baseline · failed review")))
    .limit(1);
  if (seededFailure[0] && !("orders" in (seededFailure[0].metrics as Record<string, unknown>))) {
    const failedStrategy = byName.get("Mean Reversion");
    if (failedStrategy) {
      await db.update(strategyExperiments).set({
        metrics: { ...simulateStrategyExperiment({ strategyType: failedStrategy.strategyType, mode: "backtest", executionModel: "conservative", randomSeed: 17 }), totalReturnPct: -1.8, expectancyBps: -0.7, maxDrawdownPct: 8.2, fills: 318, evidenceScore: 28 },
      }).where(eq(strategyExperiments.id, seededFailure[0].id));
    }
  }
}

function strategyView(strategy: Strategy, versions: Array<typeof strategyVersions.$inferSelect>, experiments: StrategyExperiment[]) {
  const latestVersion = versions[0];
  const latestExperiment = experiments[0];
  const metrics = latestExperiment ? metricsOf(latestExperiment) : {};
  return {
    id: strategy.id,
    name: strategy.name,
    description: strategy.description ?? "Research template awaiting a written description.",
    strategyType: strategy.strategyType,
    stage: strategy.stage,
    status: strategy.stage === "research" ? "unproven" : strategy.stage,
    owner: strategy.owner ?? "Household research",
    version: latestVersion?.version ?? "0.0",
    versionId: latestVersion?.id ?? null,
    hypothesis: strategy.hypothesis ?? "",
    markets: strategy.markets,
    venues: strategy.venues,
    assets: strategy.assets,
    timeHorizon: strategy.timeHorizon ?? "Not defined",
    entryLogic: strategy.entryLogic ?? "",
    exitLogic: strategy.exitLogic ?? "",
    positionSizingLogic: strategy.positionSizingLogic ?? "",
    riskLogic: strategy.riskLogic ?? "",
    executionModel: strategy.executionModel ?? "Moderate",
    requiredData: strategy.requiredData,
    parameters: strategy.parameters,
    assumptions: strategy.assumptions,
    knownRisks: strategy.knownRisks,
    confidenceScore: Number(strategy.confidenceScore),
    allocation: strategy.allocation ?? "0.00",
    enabled: strategy.enabled,
    createdAt: strategy.createdAt,
    updatedAt: strategy.updatedAt,
    latestExperimentId: latestExperiment?.id ?? null,
    latestMetrics: latestExperiment ? metrics : undefined,
    graduation: {
      strategyId: strategy.id,
      strategyName: strategy.name,
      ...evaluateGraduation({
        stage: strategy.stage,
        hypothesis: strategy.hypothesis,
        versionExists: Boolean(latestVersion),
        experiments: experiments.map((experiment) => ({ mode: experiment.mode, status: experiment.status, metrics: metricsOf(experiment) })),
      }),
    },
  };
}

function experimentView(experiment: StrategyExperiment, strategyName: string) {
  return {
    id: experiment.id,
    strategyId: experiment.strategyId,
    strategyName,
    strategyVersionId: experiment.strategyVersionId,
    name: experiment.name,
    mode: experiment.mode,
    datasetVersion: experiment.datasetVersion,
    status: experiment.status,
    parameters: experiment.parameters,
    executionAssumptions: experiment.executionAssumptions,
    riskLimits: experiment.riskLimits,
    randomSeed: Number(experiment.randomSeed),
    softwareVersion: experiment.softwareVersion,
    metrics: experiment.metrics,
    failureReason: experiment.failureReason,
    createdAt: experiment.createdAt,
    completedAt: dateTime(experiment.completedAt),
  };
}

export async function getStrategyLabSnapshot(actor: Actor) {
  const ids = await ensureTenantCore(actor.householdId, actor.userId);
  await ensureStrategyLabSeed(ids);
  const [strategyRows, versionRows, experimentRows, journalRows] = await Promise.all([
    db.select().from(strategies).where(eq(strategies.householdId, ids.householdId)).orderBy(strategies.name),
    db.select().from(strategyVersions).innerJoin(strategies, eq(strategyVersions.strategyId, strategies.id)).where(eq(strategies.householdId, ids.householdId)).orderBy(desc(strategyVersions.createdAt)),
    db.select().from(strategyExperiments).where(eq(strategyExperiments.householdId, ids.householdId)).orderBy(desc(strategyExperiments.createdAt)),
    db.select().from(researchJournalEntries).where(eq(researchJournalEntries.householdId, ids.householdId)).orderBy(desc(researchJournalEntries.createdAt)),
  ]);
  const versionsByStrategy = new Map<string, Array<typeof strategyVersions.$inferSelect>>();
  for (const row of versionRows) {
    const list = versionsByStrategy.get(row.strategy_versions.strategyId) ?? [];
    list.push(row.strategy_versions);
    versionsByStrategy.set(row.strategy_versions.strategyId, list);
  }
  const experimentsByStrategy = new Map<string, StrategyExperiment[]>();
  for (const experiment of experimentRows) {
    const list = experimentsByStrategy.get(experiment.strategyId) ?? [];
    list.push(experiment);
    experimentsByStrategy.set(experiment.strategyId, list);
  }
  const strategyViews = strategyRows.map((strategy) => strategyView(strategy, versionsByStrategy.get(strategy.id) ?? [], experimentsByStrategy.get(strategy.id) ?? []));
  const strategyNames = new Map(strategyRows.map((strategy) => [strategy.id, strategy.name]));
  const experimentViews = experimentRows.map((experiment) => experimentView(experiment, strategyNames.get(experiment.strategyId) ?? "Unknown strategy"));
  const completed = experimentViews.filter((experiment) => experiment.status === "completed");
  const metrics = completed.map((experiment) => experiment.metrics as Record<string, unknown>);
  const best = [...strategyViews].sort((a, b) => Number(b.latestMetrics?.evidenceScore ?? 0) - Number(a.latestMetrics?.evidenceScore ?? 0))[0];
  const lowestDrawdown = [...strategyViews].filter((strategy) => strategy.latestExperimentId).sort((a, b) => Number(a.latestMetrics?.maxDrawdownPct ?? 99) - Number(b.latestMetrics?.maxDrawdownPct ?? 99))[0];
  const latestFailure = experimentViews.find((experiment) => Boolean(experiment.failureReason));
  const stageCounts = Object.fromEntries(["research", "backtest", "shadow", "paper", "micro_live", "approved", "production", "paused", "retired"].map((stage) => [stage, strategyRows.filter((strategy) => strategy.stage === stage).length]));
  return {
    overview: {
      totalStrategiesTested: strategyRows.length,
      researchStrategies: stageCounts.research,
      backtestsRunning: experimentRows.filter((experiment) => experiment.status === "running").length,
      shadowStrategies: stageCounts.shadow,
      paperStrategies: stageCounts.paper,
      microLiveEligible: strategyViews.filter((strategy) => strategy.graduation.eligible).length,
      approvedStrategies: stageCounts.approved + stageCounts.production,
      retiredStrategies: stageCounts.retired,
      profitableExperiments: metrics.filter((metric) => Number(metric.totalReturnPct ?? 0) > 0).length,
      unprofitableExperiments: metrics.filter((metric) => Number(metric.totalReturnPct ?? 0) <= 0).length,
      bestRiskAdjustedStrategy: best?.name ?? "No completed runs",
      highestConfidenceStrategy: best?.name ?? "No completed runs",
      lowestDrawdownStrategy: lowestDrawdown?.name ?? "No completed runs",
      mostDataCollected: [...strategyViews].sort((a, b) => Number(b.latestMetrics?.fills ?? 0) - Number(a.latestMetrics?.fills ?? 0))[0]?.name ?? "No completed runs",
      latestFailure: latestFailure?.failureReason ?? "No failed experiments recorded",
    },
    stageCounts,
    strategies: strategyViews,
    experiments: experimentViews,
    journal: journalRows.map((entry) => ({
      id: entry.id,
      strategyId: entry.strategyId,
      entryType: entry.entryType,
      title: entry.title,
      body: entry.body,
      createdAt: entry.createdAt,
    })),
    paperAccount: {
      startingCapital: "100.00",
      virtualCash: "100.00",
      virtualPositions: 0,
      virtualOrders: 0,
      virtualFills: experimentViews.filter((experiment) => experiment.mode === "paper").reduce((sum, experiment) => sum + Number((experiment.metrics as Record<string, unknown>).fills ?? 0), 0),
      maxOrder: "1.00",
      maxMarketExposure: "5.00",
      maxStrategyExposure: "20.00",
      maxDailyLoss: "1.50",
      maxTotalDrawdownPct: 6,
      killSwitch: "SAFE_MODE",
    },
    safety: {
      liveExecutionEnabled: false,
      liveCredentialsRequired: false,
      realOrderSubmissionEnabled: false,
      protectedCapitalAccessible: false,
      note: "All Strategy Lab results are simulated, shadow, or paper-only. Micro-live is an eligibility review, not activation.",
    },
  };
}

export async function createResearchStrategy(actor: Actor, input: {
  name: string;
  strategyType: string;
  description: string;
  hypothesis: string;
  executionModel?: string;
}) {
  assertPermission(actor.role, "contribute");
  if (!input.hypothesis.trim()) throw new GovernanceError("INVALID_STATE", "A written economic hypothesis is required before research can begin");
  const ids = await ensureTenantCore(actor.householdId, actor.userId);
  const [strategy] = await db.insert(strategies).values({
    householdId: ids.householdId,
    name: input.name,
    strategyType: input.strategyType,
    description: input.description,
    hypothesis: input.hypothesis,
    executionModel: input.executionModel ?? "Moderate",
    owner: "Household research",
    stage: "research",
    allocation: "0.00",
    confidenceScore: "0.00",
    riskLevel: "unproven",
    enabled: false,
  }).returning();
  const [version] = await db.insert(strategyVersions).values({
    strategyId: strategy.id,
    version: "1.0",
    configuration: { executionModel: input.executionModel ?? "Moderate", immutable: true },
  }).returning();
  await db.insert(researchJournalEntries).values({
    householdId: ids.householdId,
    strategyId: strategy.id,
    entryType: "hypothesis",
    title: "Research hypothesis recorded",
    body: input.hypothesis,
    createdBy: actor.userId,
  });
  await appendAuditEvent({
    householdId: ids.householdId,
    eventType: "strategy_created",
    actor: actor.userId,
    entity: "strategy",
    entityId: strategy.id,
    reason: "Research strategy created with required hypothesis",
    metadata: { versionId: version.id, advisoryOnly: true },
  });
  return { id: strategy.id, versionId: version.id, name: strategy.name, stage: strategy.stage, hypothesis: strategy.hypothesis };
}

export async function createStrategyVersion(actor: Actor, strategyId: string, input: { version: string; reason: string; logicChanges: string; parameters?: Record<string, unknown> }) {
  assertPermission(actor.role, "contribute");
  const ids = await ensureTenantCore(actor.householdId, actor.userId);
  const [strategy] = await db.select().from(strategies).where(and(eq(strategies.id, strategyId), eq(strategies.householdId, ids.householdId))).limit(1);
  if (!strategy) throw new GovernanceError("INVALID_STATE", "Strategy was not found");
  if (!input.reason.trim() || !input.logicChanges.trim()) throw new GovernanceError("INVALID_STATE", "Version reason and logic changes are required");
  const [previous] = await db.select().from(strategyVersions).where(eq(strategyVersions.strategyId, strategyId)).orderBy(desc(strategyVersions.createdAt)).limit(1);
  const [version] = await db.insert(strategyVersions).values({
    strategyId,
    version: input.version,
    configuration: { reason: input.reason, logicChanges: input.logicChanges, parameters: input.parameters ?? {}, previousVersionId: previous?.id ?? null, immutable: true },
  }).returning();
  await appendAuditEvent({
    householdId: ids.householdId,
    eventType: "strategy_version_created",
    actor: actor.userId,
    entity: "strategy_version",
    entityId: version.id,
    reason: input.reason,
    metadata: { strategyId, previousVersionId: previous?.id ?? null },
  });
  return { id: version.id, strategyId, version: version.version, configuration: version.configuration, createdAt: version.createdAt };
}

export async function runStrategyExperiment(actor: Actor, input: {
  strategyId: string;
  strategyVersionId: string;
  name: string;
  mode: StrategyLabMode;
  datasetVersion: string;
  executionModel: ExecutionModel;
  randomSeed: number;
  parameters?: Record<string, unknown>;
  riskLimits?: Record<string, unknown>;
}) {
  assertPermission(actor.role, "contribute");
  const ids = await ensureTenantCore(actor.householdId, actor.userId);
  const [strategy] = await db.select().from(strategies).where(and(eq(strategies.id, input.strategyId), eq(strategies.householdId, ids.householdId))).limit(1);
  const [version] = await db.select().from(strategyVersions).where(and(eq(strategyVersions.id, input.strategyVersionId), eq(strategyVersions.strategyId, input.strategyId))).limit(1);
  if (!strategy || !version) throw new GovernanceError("INVALID_STATE", "Strategy version was not found");
  const metrics = simulateStrategyExperiment({
    strategyType: strategy.strategyType,
    mode: input.mode,
    executionModel: input.executionModel,
    randomSeed: input.randomSeed,
    parameterCount: Object.keys(input.parameters ?? {}).length,
  });
  const [experiment] = await db.insert(strategyExperiments).values({
    householdId: ids.householdId,
    strategyId: strategy.id,
    strategyVersionId: version.id,
    name: input.name,
    mode: input.mode,
    datasetVersion: input.datasetVersion,
    status: "completed",
    parameters: input.parameters ?? {},
    executionAssumptions: { model: input.executionModel, feesIncluded: true, slippageIncluded: true, latencyIncluded: true, partialFillsIncluded: true },
    riskLimits: input.riskLimits ?? { maxDrawdownPct: 6, maxDailyLossPct: 1 },
    randomSeed: String(input.randomSeed),
    metrics,
    completedAt: new Date(),
  }).returning();
  await appendAuditEvent({
    householdId: ids.householdId,
    eventType: input.mode === "backtest" ? "backtest_completed" : `${input.mode}_completed`,
    actor: actor.userId,
    entity: "strategy_experiment",
    entityId: experiment.id,
    reason: "Simulated Strategy Lab experiment completed",
    metadata: { strategyId: strategy.id, strategyVersionId: version.id, liveExecutionEnabled: false },
  });
  return experimentView(experiment, strategy.name);
}

export async function evaluateStrategyGraduation(actor: Actor, strategyId: string) {
  assertPermission(actor.role, actor.role === "advisor" ? "recommend" : "approve");
  const ids = await ensureTenantCore(actor.householdId, actor.userId);
  const [strategy] = await db.select().from(strategies).where(and(eq(strategies.id, strategyId), eq(strategies.householdId, ids.householdId))).limit(1);
  if (!strategy) throw new GovernanceError("INVALID_STATE", "Strategy was not found");
  const versions = await db.select().from(strategyVersions).where(eq(strategyVersions.strategyId, strategyId)).orderBy(desc(strategyVersions.createdAt));
  const experiments = await db.select().from(strategyExperiments).where(eq(strategyExperiments.strategyId, strategyId)).orderBy(desc(strategyExperiments.createdAt));
  const result = evaluateGraduation({
    stage: strategy.stage,
    hypothesis: strategy.hypothesis,
    versionExists: versions.length > 0,
    experiments: experiments.map((experiment) => ({ mode: experiment.mode, status: experiment.status, metrics: metricsOf(experiment) })),
  });
  await appendAuditEvent({
    householdId: ids.householdId,
    eventType: result.eligible ? "strategy_graduation_evaluated" : "strategy_graduation_denied",
    actor: actor.userId,
    entity: "strategy",
    entityId: strategy.id,
    reason: result.note,
    metadata: { result, liveTradingEnabled: false },
  });
  return { strategyId, strategyName: strategy.name, ...result };
}

export async function createResearchJournalEntry(actor: Actor, input: { strategyId: string; entryType: string; title: string; body: string }) {
  assertPermission(actor.role, "contribute");
  const ids = await ensureTenantCore(actor.householdId, actor.userId);
  const [strategy] = await db.select({ id: strategies.id }).from(strategies).where(and(eq(strategies.id, input.strategyId), eq(strategies.householdId, ids.householdId))).limit(1);
  if (!strategy) throw new GovernanceError("INVALID_STATE", "Strategy was not found");
  const [entry] = await db.insert(researchJournalEntries).values({ householdId: ids.householdId, ...input, createdBy: actor.userId }).returning();
  return entry;
}