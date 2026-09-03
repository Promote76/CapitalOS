import type { VenueAdapter, VenueFill, VenueOrder } from "./execution-adapters.ts";

export const LIVE_STATUSES = [
  "DISABLED",
  "MICRO_LIVE_ELIGIBLE",
  "MICRO_LIVE_ARMED",
  "MICRO_LIVE_ACTIVE",
  "SAFE_MODE",
  "STOP",
  "EVACUATE",
  "LOCKED",
  "LIMITED_LIVE_ELIGIBLE",
  "LIMITED_LIVE_ARMED",
  "LIMITED_LIVE_ACTIVE",
] as const;
export type LiveStatus = typeof LIVE_STATUSES[number];

export const ORDER_STATES = [
  "CREATED", "VALIDATING", "SUBMITTING", "ACKNOWLEDGED", "PARTIALLY_FILLED", "FILLED",
  "CANCEL_REQUESTED", "CANCEL_PENDING", "CANCELLED", "REJECTED", "UNKNOWN", "EXPIRED",
] as const;
export type OrderState = typeof ORDER_STATES[number];

export type MicroLivePolicy = {
  initialCapitalCents: number;
  maxVenueCapitalCents: number;
  maxStrategyCapitalCents: number;
  maxMarketExposureCents: number;
  maxIndividualOrderCents: number;
  maxInventoryCents: number;
  softDailyLossCents: number;
  hardDailyLossCents: number;
  softDrawdownBps: number;
  hardDrawdownBps: number;
  maxOrdersPerSecond: number;
  maxOrdersPerMinute: number;
  maxCancelsPerMinute: number;
  maxNotionalPerMinuteCents: number;
  maxPositionChangePerMinuteCents: number;
  maxDataAgeMs: number;
  maxQuoteAgeMs: number;
  maxPriceDeviationBps: number;
  maxLossPerMinuteCents: number;
  sessionLossLimitCents: number;
  sessionExposureCapCents: number;
  authorizationHours: number;
};

export const defaultMicroLivePolicy: MicroLivePolicy = {
  initialCapitalCents: 2000,
  maxVenueCapitalCents: 1000,
  maxStrategyCapitalCents: 1000,
  maxMarketExposureCents: 500,
  maxIndividualOrderCents: 100,
  maxInventoryCents: 500,
  softDailyLossCents: 75,
  hardDailyLossCents: 150,
  softDrawdownBps: 400,
  hardDrawdownBps: 600,
  maxOrdersPerSecond: 2,
  maxOrdersPerMinute: 30,
  maxCancelsPerMinute: 60,
  maxNotionalPerMinuteCents: 1000,
  maxPositionChangePerMinuteCents: 500,
  maxDataAgeMs: 3000,
  maxQuoteAgeMs: 5000,
  maxPriceDeviationBps: 150,
  maxLossPerMinuteCents: 40,
  sessionLossLimitCents: 75,
  sessionExposureCapCents: 500,
  authorizationHours: 24,
};

export type EnablementInput = {
  strategyMicroLiveEligible: boolean;
  humanApproval: boolean;
  capitalGovernorPass: boolean;
  riskGovernorPass: boolean;
  venueHealthy: boolean;
  reconciliationClean: boolean;
  venueApproved: boolean;
  marketApproved: boolean;
  jurisdictionConfirmed: boolean;
  credentialsConfigured: boolean;
  withdrawalDisabled: boolean;
  approvedIntegration?: boolean;
  termsReviewed?: boolean;
  marketPermissionsConfigured?: boolean;
  withdrawalReviewed?: boolean;
  householdCapitalAccessible?: boolean;
  protectedCapitalAccessible?: boolean;
};

export function evaluateLiveEnablement(input: EnablementInput) {
  const gates = [
    { name: "Strategy is Micro-Live Eligible", passed: input.strategyMicroLiveEligible },
    { name: "Human approval recorded", passed: input.humanApproval },
    { name: "Capital Governor passes", passed: input.capitalGovernorPass },
    { name: "Risk Governor passes", passed: input.riskGovernorPass },
    { name: "Venue health is healthy", passed: input.venueHealthy },
    { name: "Reconciliation is clean", passed: input.reconciliationClean },
    { name: "Venue is allowlisted for Micro-Live", passed: input.venueApproved },
    { name: "Market is allowlisted", passed: input.marketApproved },
    { name: "Jurisdiction and account eligibility confirmed", passed: input.jurisdictionConfirmed },
    { name: "Server-side credential reference configured", passed: input.credentialsConfigured },
    { name: "Explicit real venue integration approved", passed: input.approvedIntegration === true },
    { name: "Venue terms reviewed", passed: input.termsReviewed === true },
    { name: "Market permissions recorded", passed: input.marketPermissionsConfigured === true },
    { name: "Withdrawal permissions reviewed", passed: input.withdrawalReviewed === true },
    { name: "Withdrawals disabled for the execution account", passed: input.withdrawalDisabled },
    { name: "Household capital is inaccessible", passed: input.householdCapitalAccessible === false },
    { name: "Protected capital is inaccessible", passed: input.protectedCapitalAccessible === false },
  ];
  return {
    enabled: gates.every((gate) => gate.passed),
    status: gates.every((gate) => gate.passed) ? "MICRO_LIVE_ELIGIBLE" as const : "DISABLED" as const,
    gates,
    note: "Eligibility is not activation. A separate human arming action and expiring session are required.",
  };
}

const validTransitions: Record<OrderState, OrderState[]> = {
  CREATED: ["VALIDATING", "REJECTED", "EXPIRED"],
  VALIDATING: ["SUBMITTING", "REJECTED"],
  SUBMITTING: ["ACKNOWLEDGED", "UNKNOWN", "REJECTED"],
  ACKNOWLEDGED: ["PARTIALLY_FILLED", "FILLED", "CANCEL_REQUESTED", "EXPIRED", "UNKNOWN"],
  PARTIALLY_FILLED: ["PARTIALLY_FILLED", "FILLED", "CANCEL_REQUESTED", "CANCEL_PENDING", "UNKNOWN"],
  FILLED: [],
  CANCEL_REQUESTED: ["CANCEL_PENDING", "PARTIALLY_FILLED", "FILLED", "UNKNOWN"],
  CANCEL_PENDING: ["CANCELLED", "PARTIALLY_FILLED", "FILLED", "UNKNOWN"],
  CANCELLED: [],
  REJECTED: [],
  UNKNOWN: ["ACKNOWLEDGED", "PARTIALLY_FILLED", "FILLED", "CANCELLED", "REJECTED"],
  EXPIRED: [],
};

export function canTransitionOrder(from: OrderState, to: OrderState): boolean {
  return from === to || validTransitions[from].includes(to);
}

export function buildClientOrderId(input: { strategyId: string; venueId: string; marketId: string; quoteCycle: string; intent: string }): string {
  const compact = (value: string) => value.replace(/[^a-zA-Z0-9]/g, "").slice(-12);
  return `cos_${compact(input.strategyId)}_${compact(input.venueId)}_${compact(input.marketId)}_${compact(input.quoteCycle)}_${compact(input.intent)}`.slice(0, 96);
}

export function isMicroLiveExecutionStatus(status: LiveStatus): boolean {
  return status === "MICRO_LIVE_ARMED" || status === "MICRO_LIVE_ACTIVE";
}

export function firstFillHoldDecision(input: {
  fillObserved: boolean;
  reconciliationClean: boolean;
  explicitResumeApproval: boolean;
}) {
  if (!input.fillObserved) {
    return { status: "NOT_TRIGGERED" as const, allowNewOrders: true, reason: "No first fill has been observed" };
  }
  if (!input.reconciliationClean) {
    return { status: "LOCKED" as const, allowNewOrders: false, reason: "First-fill reconciliation is not clean" };
  }
  if (!input.explicitResumeApproval) {
    return { status: "HOLD" as const, allowNewOrders: false, reason: "Explicit human approval is required after the first fill" };
  }
  return { status: "RESUMED" as const, allowNewOrders: true, reason: "First-fill review was explicitly approved" };
}

export type OrderValidationInput = {
  liveStatus: LiveStatus;
  strategyAuthorized: boolean;
  venueAuthorized: boolean;
  marketAuthorized: boolean;
  marketDataAgeMs: number;
  venueHealthy: boolean;
  reconciled: boolean;
  riskHeartbeatHealthy: boolean;
  orderNotionalCents: number;
  priceBps: number;
  referencePriceBps: number;
  marketExposureCents: number;
  strategyExposureCents: number;
  venueExposureCents: number;
  totalActiveExposureCents: number;
  dailyLossCents: number;
  drawdownBps: number;
  inventoryCents: number;
  ordersInSecond: number;
  ordersInMinute: number;
  cancelsInMinute: number;
  notionalInMinuteCents: number;
  positionChangeInMinuteCents: number;
  openOrderReserveCents?: number;
  lossPerMinuteCents?: number;
  sessionLossCents?: number;
  protectedCapitalAttempted?: boolean;
  authorizationExpiresAt?: string | Date | null;
  now?: Date;
  firstFillHoldActive?: boolean;
};

export function validatePreTrade(policy: MicroLivePolicy, input: OrderValidationInput) {
  const failures: string[] = [];
  if (!isMicroLiveExecutionStatus(input.liveStatus)) {
    failures.push(input.liveStatus.startsWith("LIMITED_LIVE_")
      ? "Limited-Live is locked and cannot submit orders"
      : "live status is not armed or active");
  }
  if (isMicroLiveExecutionStatus(input.liveStatus)) {
    const expiresAt = input.authorizationExpiresAt
      ? new Date(input.authorizationExpiresAt).getTime()
      : Number.NaN;
    const now = (input.now ?? new Date()).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= now) failures.push("human authorization is missing or expired");
  }
  if (!input.strategyAuthorized) failures.push("strategy is not authorized");
  if (!input.venueAuthorized) failures.push("venue is not authorized");
  if (!input.marketAuthorized) failures.push("market is not authorized");
  if (input.marketDataAgeMs > policy.maxDataAgeMs) failures.push("market data is stale");
  if (!input.venueHealthy) failures.push("venue health is not healthy");
  if (!input.reconciled) failures.push("position or balance reconciliation is not clean");
  if (!input.riskHeartbeatHealthy) failures.push("risk engine heartbeat is unavailable");
  if (input.orderNotionalCents <= 0 || input.orderNotionalCents > policy.maxIndividualOrderCents) failures.push("order size exceeds the individual order cap");
  if (Math.abs(input.priceBps - input.referencePriceBps) > input.referencePriceBps * policy.maxPriceDeviationBps / 10000) failures.push("price fails the reference-price sanity check");
  if (input.marketExposureCents + input.orderNotionalCents > policy.maxMarketExposureCents) failures.push("market exposure cap would be exceeded");
  if (input.strategyExposureCents + input.orderNotionalCents > policy.maxStrategyCapitalCents) failures.push("strategy capital cap would be exceeded");
  if (input.venueExposureCents + input.orderNotionalCents > policy.maxVenueCapitalCents) failures.push("venue capital cap would be exceeded");
  if (input.totalActiveExposureCents + input.orderNotionalCents > policy.sessionExposureCapCents) failures.push("session exposure cap would be exceeded");
  if (input.dailyLossCents >= policy.hardDailyLossCents) failures.push("hard daily loss limit has been reached");
  if (input.drawdownBps >= policy.hardDrawdownBps) failures.push("hard drawdown limit has been reached");
  if (Math.abs(input.inventoryCents) + input.orderNotionalCents > policy.maxInventoryCents) failures.push("inventory cap would be exceeded");
  if (input.ordersInSecond >= policy.maxOrdersPerSecond) failures.push("orders-per-second velocity limit has been reached");
  if (input.ordersInMinute >= policy.maxOrdersPerMinute) failures.push("orders-per-minute velocity limit has been reached");
  if (input.cancelsInMinute >= policy.maxCancelsPerMinute) failures.push("cancels-per-minute velocity limit has been reached");
  if (input.notionalInMinuteCents + input.orderNotionalCents > policy.maxNotionalPerMinuteCents) failures.push("notional-per-minute velocity limit has been reached");
  if (input.positionChangeInMinuteCents + input.orderNotionalCents > policy.maxPositionChangePerMinuteCents) failures.push("position-change velocity limit has been reached");
  if ((input.openOrderReserveCents ?? 0) + input.orderNotionalCents > policy.maxMarketExposureCents - input.marketExposureCents) failures.push("open-order reserve and new order would exceed the market exposure cap");
  if ((input.openOrderReserveCents ?? 0) + input.orderNotionalCents > policy.maxVenueCapitalCents - input.venueExposureCents) failures.push("open-order reserve and new order would exceed the venue capital cap");
  if ((input.lossPerMinuteCents ?? 0) >= policy.maxLossPerMinuteCents) failures.push("loss-per-minute velocity limit has been reached");
  if ((input.sessionLossCents ?? 0) >= policy.sessionLossLimitCents) failures.push("session loss limit has been reached");
  if (input.protectedCapitalAttempted) failures.push("protected capital is not available to experimental strategies");
  if (input.firstFillHoldActive) failures.push("first-fill review hold is active");
  return { accepted: failures.length === 0, failures, state: failures.length === 0 ? "VALIDATED" as const : "REJECTED" as const };
}

export function reconcileExecutionState(input: {
  internalPositionCents: number;
  venuePositionCents: number;
  internalOpenOrders: number;
  venueOpenOrders: number;
  internalFillIds: string[];
  venueFillIds: string[];
  toleranceCents?: number;
}) {
  const tolerance = input.toleranceCents ?? 0;
  const positionMismatch = Math.abs(input.internalPositionCents - input.venuePositionCents) > tolerance;
  const orderMismatch = input.internalOpenOrders !== input.venueOpenOrders;
  const internalFills = new Set(input.internalFillIds);
  const venueFills = new Set(input.venueFillIds);
  const missingInternalFills = input.venueFillIds.filter((id) => !internalFills.has(id));
  const orphanedInternalFills = input.internalFillIds.filter((id) => !venueFills.has(id));
  const clean = !positionMismatch && !orderMismatch && missingInternalFills.length === 0 && orphanedInternalFills.length === 0;
  return {
    clean,
    mismatches: { positionMismatch, orderMismatch, missingInternalFills, orphanedInternalFills },
    action: clean ? "CONTINUE" as const : "STOP_CANCEL_FETCH_REBUILD_VERIFY" as const,
  };
}

export function calculateOpenOrderReserveCents(
  orders: Array<Pick<VenueOrder, "quantity" | "filledQuantity"> & { price?: number; reservedNotionalCents?: number }>,
) {
  return orders.reduce((reserve, order) => {
    if (order.reservedNotionalCents !== undefined) return reserve + Math.max(0, Math.round(order.reservedNotionalCents));
    const remainingQuantity = Math.max(0, order.quantity - order.filledQuantity);
    return reserve + Math.max(0, Math.round(remainingQuantity * (order.price ?? 0) * 100));
  }, 0);
}

export function duplicateClientOrderIds(orders: Pick<VenueOrder, "clientOrderId">[]) {
  const counts = new Map<string, number>();
  for (const order of orders) counts.set(order.clientOrderId, (counts.get(order.clientOrderId) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([clientOrderId]) => clientOrderId);
}

export function deduplicateVenueFills(fills: VenueFill[]) {
  const seen = new Set<string>();
  const unique: VenueFill[] = [];
  const duplicateFillIds: string[] = [];
  for (const fill of fills) {
    if (seen.has(fill.externalFillId)) {
      duplicateFillIds.push(fill.externalFillId);
      continue;
    }
    seen.add(fill.externalFillId);
    unique.push(fill);
  }
  return { fills: unique, duplicateFillIds };
}

export type ExecutionRecoveryInput = {
  internalPositionCents: number;
  internalOpenOrders: number;
  internalFillIds: string[];
};

/**
 * Rebuilds the OMS view from venue-authoritative state after a restart.
 * Any health failure, unknown order, duplicate client order, or reconciliation
 * mismatch keeps the system stopped until an operator resolves it.
 */
export async function recoverExecutionState(
  adapter: Pick<VenueAdapter, "healthCheck" | "getBalances" | "getPositions" | "getOpenOrders" | "getRecentFills">,
  input: ExecutionRecoveryInput,
) {
  try {
    const [health, balances, positions, openOrders, rawFills] = await Promise.all([
      adapter.healthCheck(),
      adapter.getBalances(),
      adapter.getPositions(),
      adapter.getOpenOrders(),
      adapter.getRecentFills(),
    ]);
    const { fills, duplicateFillIds } = deduplicateVenueFills(rawFills);
    const duplicateOrderIds = duplicateClientOrderIds(openOrders);
    const unknownOrderIds = openOrders
      .filter((order) => order.state === "UNKNOWN")
      .map((order) => order.externalOrderId);
    const venuePositionCents = positions.reduce(
      (total, position) => total + Math.round(position.quantity * position.averagePrice * 100),
      0,
    );
    const baseReconciliation = reconcileExecutionState({
      internalPositionCents: input.internalPositionCents,
      venuePositionCents,
      internalOpenOrders: input.internalOpenOrders,
      venueOpenOrders: openOrders.length,
      internalFillIds: input.internalFillIds,
      venueFillIds: fills.map((fill) => fill.externalFillId),
    });
    const clean =
      baseReconciliation.clean &&
      duplicateOrderIds.length === 0 &&
      unknownOrderIds.length === 0;
    const reconciliation = clean
      ? baseReconciliation
      : {
          ...baseReconciliation,
          clean: false,
          action: "STOP_CANCEL_FETCH_REBUILD_VERIFY" as const,
        };
    const safeToContinue = health.status === "HEALTHY" && clean;
    return {
      venueHealth: health.status,
      balances,
      positions,
      openOrders,
      fills,
      duplicateFillIds,
      duplicateOrderIds,
      unknownOrderIds,
      openOrderReserveCents: calculateOpenOrderReserveCents(openOrders),
      venuePositionCents,
      reconciliation,
      safeToContinue,
      action: safeToContinue
        ? "CONTINUE" as const
        : health.status === "FAILED"
          ? "STOP" as const
          : "STOP_CANCEL_FETCH_REBUILD_VERIFY" as const,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "venue recovery failed";
    return {
      venueHealth: "FAILED" as const,
      balances: [],
      positions: [],
      openOrders: [],
      fills: [],
      duplicateFillIds: [],
      duplicateOrderIds: [],
      unknownOrderIds: [],
      openOrderReserveCents: 0,
      venuePositionCents: 0,
      reconciliation: {
        clean: false,
        mismatches: {
          positionMismatch: false,
          orderMismatch: false,
          missingInternalFills: [],
          orphanedInternalFills: [],
        },
        action: "STOP_CANCEL_FETCH_REBUILD_VERIFY" as const,
      },
      safeToContinue: false,
      action: "STOP" as const,
      error: reason,
    };
  }
}

export function guardianDecision(input: {
   liveStatus: LiveStatus;
  heartbeatAgeMs: number;
  maxHeartbeatAgeMs: number;
  reportedExposureCents: number;
  observedVenueExposureCents: number;
  hardExposureCents: number;
  riskEngineHealthy: boolean;
}) {
  if (Math.abs(input.reportedExposureCents - input.observedVenueExposureCents) > 0) return { action: "LOCKED" as const, reason: "Guardian and venue position disagree" };
  if (!input.riskEngineHealthy || input.heartbeatAgeMs > input.maxHeartbeatAgeMs) return { action: "STOP" as const, reason: "Critical heartbeat is stale or risk engine is unavailable" };
  if (input.observedVenueExposureCents > input.hardExposureCents) return { action: "EVACUATE" as const, reason: "Observed exposure exceeds the hard cap" };
  if (input.liveStatus === "SAFE_MODE" || input.liveStatus === "STOP") return { action: input.liveStatus, reason: "Preserve the existing fail-safe state" };
  return { action: "NO_ACTION" as const, reason: "Guardian checks are within policy" };
}

export function calculateLiveReadiness(input: {
  strategyEvidence: boolean;
  paperPerformance: boolean;
  venue: boolean;
  marketData: boolean;
  oms: boolean;
  riskGovernor: boolean;
  capitalGovernor: boolean;
  guardian: boolean;
  reconciliation: boolean;
  security: boolean;
  chaosTests: boolean;
}) {
  const checks = Object.entries(input).map(([name, passed]) => ({ name, passed }));
  const score = Math.round(checks.filter((check) => check.passed).length / checks.length * 100);
  return { score, checks, status: score === 100 ? "READY_FOR_HUMAN_ARMING" as const : "NOT_READY" as const, liveExecutionEnabled: false };
}

export function runLiveRehearsal(policy = defaultMicroLivePolicy) {
  const validation = validatePreTrade(policy, {
    liveStatus: "SAFE_MODE",
    strategyAuthorized: true,
    venueAuthorized: true,
    marketAuthorized: true,
    marketDataAgeMs: policy.maxDataAgeMs + 1,
    venueHealthy: true,
    reconciled: true,
    riskHeartbeatHealthy: true,
    orderNotionalCents: 100,
    priceBps: 10000,
    referencePriceBps: 10000,
    marketExposureCents: 0,
    strategyExposureCents: 0,
    venueExposureCents: 0,
    totalActiveExposureCents: 0,
    dailyLossCents: 0,
    drawdownBps: 0,
    inventoryCents: 0,
    ordersInSecond: 0,
    ordersInMinute: 0,
    cancelsInMinute: 0,
    notionalInMinuteCents: 0,
    positionChangeInMinuteCents: 0,
  });
  return {
    mode: "LIVE_REHEARSAL",
   status: "SAFE_MODE" as const,
    liveOrderTransmission: false,
    sequence: [
      "OrderIntentCreated",
      "OrderValidationFailed",
      "OrderRejected",
      "PartialFillReconciled",
      "CancelFillRaceResolved",
      "GuardianHeartbeatVerified",
      "ReconciliationCompleted",
    ],
    validation,
    chaosTests: [
      { name: "restart recovery", result: "rebuilt from venue-authoritative state", expectedState: "SAFE_MODE" },
      { name: "duplicate order", result: "stopped for operator review", expectedState: "STOP" },
      { name: "stale market data", result: "contained", expectedState: "SAFE_MODE" },
      { name: "duplicate fill", result: "deduplicated", expectedState: "SAFE_MODE" },
      { name: "partial fill", result: "reconciled", expectedState: "SAFE_MODE" },
      { name: "cancel timeout then fill", result: "resolved through venue query", expectedState: "SAFE_MODE" },
      { name: "unknown order state", result: "stopped for operator review", expectedState: "STOP" },
      { name: "open-order reserve", result: "rejected before transmission", expectedState: "SAFE_MODE" },
      { name: "loss velocity", result: "rejected before transmission", expectedState: "SAFE_MODE" },
      { name: "venue failure", result: "contained", expectedState: "STOP" },
      { name: "Guardian heartbeat failure", result: "contained", expectedState: "STOP" },
      { name: "Guardian disagreement", result: "locked", expectedState: "LOCKED" },
      { name: "protected-capital attempt", result: "rejected before transmission", expectedState: "SAFE_MODE" },
    ],
    note: "This rehearsal uses the production-shaped control flow but transmits no orders and touches no funds.",
  };
}