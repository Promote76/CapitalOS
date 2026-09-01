import assert from "node:assert/strict";
import test from "node:test";
import {
  buildClientOrderId,
  calculateLiveReadiness,
  calculateOpenOrderReserveCents,
  canTransitionOrder,
  deduplicateVenueFills,
  defaultMicroLivePolicy,
  duplicateClientOrderIds,
  evaluateLiveEnablement,
  guardianDecision,
  recoverExecutionState,
  reconcileExecutionState,
  runLiveRehearsal,
  validatePreTrade,
} from "./execution-oms.ts";
import type { OrderValidationInput } from "./execution-oms.ts";
import {
  evaluateVenueApproval,
  registerReviewedVenueAdapter,
  ServerConfiguredVenueAdapter,
  SimulatedVenueAdapter,
} from "./execution-adapters.ts";
import type { VenueCapability, VenueTransport } from "./execution-adapters.ts";

function validValidationInput(overrides: Partial<OrderValidationInput> = {}): OrderValidationInput {
  return {
    liveStatus: "ACTIVE",
    strategyAuthorized: true,
    venueAuthorized: true,
    marketAuthorized: true,
    marketDataAgeMs: 0,
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
    ...overrides,
  };
}

test("the default policy is a configurable $20 sandbox with no leverage", () => {
  assert.equal(defaultMicroLivePolicy.initialCapitalCents, 2000);
  assert.equal(defaultMicroLivePolicy.maxIndividualOrderCents, 100);
  assert.equal(defaultMicroLivePolicy.hardDailyLossCents, 150);
});

test("live enablement fails closed until every gate is explicitly passed", () => {
  const result = evaluateLiveEnablement({
    strategyMicroLiveEligible: true,
    humanApproval: true,
    capitalGovernorPass: true,
    riskGovernorPass: true,
    venueHealthy: true,
    reconciliationClean: true,
    venueApproved: true,
    marketApproved: true,
    jurisdictionConfirmed: true,
    credentialsConfigured: false,
    withdrawalDisabled: true,
  });
  assert.equal(result.enabled, false);
  assert.equal(result.status, "DISABLED");
});

test("real venue approval requires integration, review evidence, and disabled withdrawals", () => {
  const incomplete = evaluateVenueApproval({
    adapterType: "provider-neutral",
    integrationApproved: true,
    adapterRegistered: true,
    credentialsReference: "secret://capital-os/venues/test-venue",
    jurisdictionConfirmed: true,
    termsReviewed: true,
    marketPermissions: ["sandbox"],
    withdrawalReviewed: true,
    withdrawalDisabled: true,
    securityReview: { reference: "review://capital-os/security/test-review", reviewerId: "security-reviewer", reviewedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString() },
    jurisdictionReview: { reference: "review://capital-os/jurisdiction/test-review", reviewerId: "jurisdiction-reviewer", reviewedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString() },
    approvingActorId: "approver",
  });
  assert.equal(incomplete.approved, false);
  assert.ok(incomplete.checks.some((check) => check.name.includes("integration") && !check.passed));

  const approved = evaluateVenueApproval({
    adapterType: "approved-exchange",
    integrationApproved: true,
    adapterRegistered: true,
    credentialsReference: "secret://capital-os/venues/test-venue",
    jurisdictionConfirmed: true,
    termsReviewed: true,
    marketPermissions: ["BTC-USD"],
    withdrawalReviewed: true,
    withdrawalDisabled: true,
    securityReview: { reference: "review://capital-os/security/test-review", reviewerId: "security-reviewer", reviewedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString() },
    jurisdictionReview: { reference: "review://capital-os/jurisdiction/test-review", reviewerId: "jurisdiction-reviewer", reviewedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString() },
    approvingActorId: "approver",
  });
  assert.equal(approved.approved, true);
  assert.equal(approved.status, "APPROVED_FOR_MICRO_LIVE");
});

test("real venue approval rejects raw credentials and non-independent reviewers", () => {
  const base = {
    adapterType: "reviewed-exchange",
    integrationApproved: true,
    adapterRegistered: true,
    jurisdictionConfirmed: true,
    termsReviewed: true,
    marketPermissions: ["BTC-USD"],
    withdrawalReviewed: true,
    withdrawalDisabled: true,
    approvingActorId: "approver",
  };
  const rawCredential = evaluateVenueApproval({
    ...base,
    credentialsReference: "sk_live_not-a-vault-reference",
    securityReview: { reference: "review://capital-os/security/test-review", reviewerId: "security-reviewer", reviewedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString() },
    jurisdictionReview: { reference: "review://capital-os/jurisdiction/test-review", reviewerId: "jurisdiction-reviewer", reviewedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString() },
  });
  assert.equal(rawCredential.approved, false);
  assert.ok(rawCredential.checks.some((check) => check.name.includes("credential") && !check.passed));

  const sameReviewer = evaluateVenueApproval({
    ...base,
    credentialsReference: "secret://capital-os/venues/test-venue",
    securityReview: { reference: "review://capital-os/security/test-review", reviewerId: "same-reviewer", reviewedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString() },
    jurisdictionReview: { reference: "review://capital-os/jurisdiction/test-review", reviewerId: "same-reviewer", reviewedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString() },
  });
  assert.equal(sameReviewer.approved, false);
  assert.ok(sameReviewer.checks.some((check) => check.name.includes("distinct") && !check.passed));
});

test("server-configured venue adapter is isolated, allowlisted, and credential-server-side", async () => {
  const capabilities: VenueCapability = {
    spot: true, derivative: false, predictionMarket: false, onChain: false,
    makerOrders: true, marketOrders: true, postOnly: true, reduceOnly: false,
    clientOrderIds: true, bulkCancel: true, positionApi: true, balanceApi: true,
  };
  let connectedWith: { credential: string; accountId: string } | null = null;
  let placeCalls = 0;
  const order = {
    externalOrderId: "external-1",
    clientOrderId: "client-1",
    marketId: "BTC-USD",
    state: "ACKNOWLEDGED" as const,
    quantity: 1,
    filledQuantity: 0,
  };
  const transport: VenueTransport = {
    async connect(input) { connectedWith = input; },
    async disconnect() {},
    async healthCheck() { return { status: "HEALTHY" as const, lastExchangeTimestamp: null, lastReceiveTimestamp: null, sequence: 1 }; },
    async getOrderBook() { return { bid: 99, ask: 101, depth: 10 }; },
    async getBalances() { return [{ asset: "USD", available: 20, committed: 0 }]; },
    async getPositions() { return []; },
    async getOpenOrders() { return [order]; },
    async getRecentFills() { return []; },
    async placeOrder() { placeCalls += 1; return order; },
    async cancelOrder() { return { ...order, state: "CANCELLED" as const }; },
    async cancelAllOrders() {},
    async getOrder() { return order; },
  };
  registerReviewedVenueAdapter({
    adapterType: "reviewed-exchange",
    reviewReference: "review://capital-os/security/test-registration",
    create: (options) => new ServerConfiguredVenueAdapter(options),
  });
  const adapter = new ServerConfiguredVenueAdapter({
    name: "Reviewed exchange test double",
    capabilities,
    account: {
      venueId: "venue-1",
      accountId: "micro-live-account",
      capitalClass: "micro_live",
      householdCapitalAccessible: false,
      protectedCapitalAccessible: false,
      allowedAssets: ["USD"],
    },
    allowedMarkets: ["BTC-USD"],
    credentialsReference: "secret://capital-os/venues/test-venue",
    resolveCredential: async (reference) => {
      assert.equal(reference, "secret://capital-os/venues/test-venue");
      return "server-only-credential";
    },
    transport,
  });

  await assert.rejects(() => adapter.getBalances(), /not connected/);
  await adapter.connect();
  assert.deepEqual(connectedWith, { credential: "server-only-credential", accountId: "micro-live-account" });
  assert.deepEqual(await adapter.getOpenOrders(), [order]);
  await assert.rejects(() => adapter.getOrderBook("ETH-USD"), /not allowlisted/);
  await assert.rejects(() => adapter.placeOrder({ clientOrderId: "client-2", marketId: "ETH-USD", side: "buy", orderType: "market", quantity: 1 }), /not allowlisted/);
  await adapter.placeOrder({ clientOrderId: "client-2", marketId: "BTC-USD", side: "buy", orderType: "market", quantity: 1 });
  assert.equal(placeCalls, 1);
  await adapter.disconnect();
});

test("live enablement cannot pass when household or protected capital is reachable", () => {
  const result = evaluateLiveEnablement({
    strategyMicroLiveEligible: true,
    humanApproval: true,
    capitalGovernorPass: true,
    riskGovernorPass: true,
    venueHealthy: true,
    reconciliationClean: true,
    venueApproved: true,
    marketApproved: true,
    jurisdictionConfirmed: true,
    credentialsConfigured: true,
    approvedIntegration: true,
    termsReviewed: true,
    marketPermissionsConfigured: true,
    withdrawalReviewed: true,
    withdrawalDisabled: true,
    householdCapitalAccessible: true,
    protectedCapitalAccessible: false,
  });
  assert.equal(result.enabled, false);
  assert.ok(result.gates.some((gate) => gate.name === "Household capital is inaccessible" && !gate.passed));
});

test("pre-trade validation blocks stale data and oversized orders", () => {
  const result = validatePreTrade(defaultMicroLivePolicy, {
    liveStatus: "ACTIVE", strategyAuthorized: true, venueAuthorized: true, marketAuthorized: true,
    marketDataAgeMs: 4000, venueHealthy: true, reconciled: true, riskHeartbeatHealthy: true,
    orderNotionalCents: 10001, priceBps: 10000, referencePriceBps: 10000, marketExposureCents: 0,
    strategyExposureCents: 0, venueExposureCents: 0, totalActiveExposureCents: 0, dailyLossCents: 0,
    drawdownBps: 0, inventoryCents: 0, ordersInSecond: 0, ordersInMinute: 0, cancelsInMinute: 0,
    notionalInMinuteCents: 0, positionChangeInMinuteCents: 0,
  });
  assert.equal(result.accepted, false);
  assert.ok(result.failures.some((failure) => failure.includes("stale")));
  assert.ok(result.failures.some((failure) => failure.includes("individual order")));
});

test("OMS transitions model partial fills and cancel/fill races", () => {
  assert.equal(canTransitionOrder("ACKNOWLEDGED", "PARTIALLY_FILLED"), true);
  assert.equal(canTransitionOrder("CANCEL_REQUESTED", "FILLED"), true);
  assert.equal(canTransitionOrder("FILLED", "CANCELLED"), false);
});

test("reconciliation mismatch stops new exposure and identifies missing fills", () => {
  const result = reconcileExecutionState({ internalPositionCents: 0, venuePositionCents: 100, internalOpenOrders: 1, venueOpenOrders: 0, internalFillIds: [], venueFillIds: ["fill-1"] });
  assert.equal(result.clean, false);
  assert.equal(result.action, "STOP_CANCEL_FETCH_REBUILD_VERIFY");
  assert.deepEqual(result.mismatches.missingInternalFills, ["fill-1"]);
});

test("Guardian locks on disagreement and stops on stale heartbeat", () => {
  assert.equal(guardianDecision({ liveStatus: "ACTIVE", heartbeatAgeMs: 10, maxHeartbeatAgeMs: 1000, reportedExposureCents: 0, observedVenueExposureCents: 1, hardExposureCents: 500, riskEngineHealthy: true }).action, "LOCKED");
  assert.equal(guardianDecision({ liveStatus: "ACTIVE", heartbeatAgeMs: 1001, maxHeartbeatAgeMs: 1000, reportedExposureCents: 0, observedVenueExposureCents: 0, hardExposureCents: 500, riskEngineHealthy: true }).action, "STOP");
});

test("client order IDs are deterministic and encode the audit boundary", () => {
  const input = { strategyId: "strategy-1", venueId: "venue-1", marketId: "market-1", quoteCycle: "42", intent: "bid" };
  assert.equal(buildClientOrderId(input), buildClientOrderId(input));
  assert.match(buildClientOrderId(input), /^cos_/);
});

test("rehearsal never transmits an order", () => {
  const result = runLiveRehearsal();
  assert.equal(result.liveOrderTransmission, false);
  assert.equal(result.status, "SAFE_MODE");
  assert.deepEqual(result.chaosTests.map((chaosTest) => chaosTest.name), [
    "restart recovery",
    "duplicate order",
    "stale market data",
    "duplicate fill",
    "partial fill",
    "cancel timeout then fill",
    "unknown order state",
    "open-order reserve",
    "loss velocity",
    "venue failure",
    "Guardian heartbeat failure",
    "Guardian disagreement",
    "protected-capital attempt",
  ]);
});

test("readiness score cannot enable live execution", () => {
  const result = calculateLiveReadiness({ strategyEvidence: true, paperPerformance: true, venue: true, marketData: true, oms: true, riskGovernor: true, capitalGovernor: true, guardian: true, reconciliation: true, security: true, chaosTests: true });
  assert.equal(result.score, 100);
  assert.equal(result.liveExecutionEnabled, false);
});

test("restart recovery rebuilds from venue state and preserves only unfilled reserves", async () => {
  const fill = { externalFillId: "fill-1", externalOrderId: "venue-order-1", marketId: "sandbox", quantity: 1, price: 1, fee: 0, timestamp: "2026-09-01T00:00:00.000Z" };
  const adapter = new SimulatedVenueAdapter({
    balances: [{ asset: "USD", available: 19, committed: 1 }],
    positions: [{ marketId: "sandbox", quantity: 1, averagePrice: 1 }],
    openOrders: [{
      externalOrderId: "venue-order-1",
      clientOrderId: "cos_strategy_venue_market_cycle_bid",
      marketId: "sandbox",
      state: "PARTIALLY_FILLED",
      quantity: 3,
      filledQuantity: 1,
      price: 1.5,
    }],
    recentFills: [fill, fill],
  });

  const beforeRestart = await recoverExecutionState(adapter, {
    internalPositionCents: 100,
    internalOpenOrders: 1,
    internalFillIds: ["fill-1"],
  });
  await adapter.restart();
  const afterRestart = await recoverExecutionState(adapter, {
    internalPositionCents: 100,
    internalOpenOrders: 1,
    internalFillIds: ["fill-1"],
  });

  assert.equal(beforeRestart.safeToContinue, true);
  assert.equal(afterRestart.safeToContinue, true);
  assert.equal(afterRestart.action, "CONTINUE");
  assert.equal(afterRestart.openOrderReserveCents, 300);
  assert.deepEqual(afterRestart.duplicateFillIds, ["fill-1"]);
  assert.equal((await adapter.getOrder("venue-order-1"))?.state, "PARTIALLY_FILLED");
  await assert.rejects(() => adapter.placeOrder({
    clientOrderId: "new-order",
    marketId: "sandbox",
    side: "buy",
    orderType: "limit",
    quantity: 1,
    price: 1,
  }), /does not transmit orders/);
});

test("duplicate client orders and unknown venue states stop recovery", async () => {
  const duplicateOrder = {
    externalOrderId: "venue-order-1",
    clientOrderId: "same-intent",
    marketId: "sandbox",
    state: "ACKNOWLEDGED" as const,
    quantity: 1,
    filledQuantity: 0,
    price: 1,
  };
  const adapter = new SimulatedVenueAdapter({ openOrders: [duplicateOrder, { ...duplicateOrder, externalOrderId: "venue-order-2" }] });
  const duplicateRecovery = await recoverExecutionState(adapter, { internalPositionCents: 0, internalOpenOrders: 2, internalFillIds: [] });
  assert.equal(duplicateRecovery.safeToContinue, false);
  assert.equal(duplicateRecovery.action, "STOP_CANCEL_FETCH_REBUILD_VERIFY");
  assert.deepEqual(duplicateRecovery.duplicateOrderIds, ["same-intent"]);
  assert.deepEqual(duplicateClientOrderIds([duplicateOrder, { ...duplicateOrder, externalOrderId: "venue-order-2" }]), ["same-intent"]);

  const unknownAdapter = new SimulatedVenueAdapter({
    openOrders: [{ ...duplicateOrder, state: "UNKNOWN", externalOrderId: "unknown-order" }],
  });
  const unknownRecovery = await recoverExecutionState(unknownAdapter, { internalPositionCents: 0, internalOpenOrders: 1, internalFillIds: [] });
  assert.equal(unknownRecovery.safeToContinue, false);
  assert.deepEqual(unknownRecovery.unknownOrderIds, ["unknown-order"]);
});

test("fill deduplication is idempotent while cancel and fill races remain resolvable", () => {
  const fill = { externalFillId: "fill-1", externalOrderId: "venue-order-1", marketId: "sandbox", quantity: 1, price: 1, fee: 0, timestamp: "2026-09-01T00:00:00.000Z" };
  const result = deduplicateVenueFills([fill, fill, { ...fill, externalFillId: "fill-2" }]);
  assert.deepEqual(result.fills.map((item) => item.externalFillId), ["fill-1", "fill-2"]);
  assert.deepEqual(result.duplicateFillIds, ["fill-1"]);
  assert.equal(canTransitionOrder("CANCEL_REQUESTED", "FILLED"), true);
  assert.equal(canTransitionOrder("CANCEL_PENDING", "PARTIALLY_FILLED"), true);
  assert.equal(canTransitionOrder("UNKNOWN", "FILLED"), true);
  assert.equal(canTransitionOrder("FILLED", "CANCELLED"), false);
});

test("open-order reserves and loss velocity fail closed before an adapter call", () => {
  assert.equal(calculateOpenOrderReserveCents([
    { quantity: 3, filledQuantity: 1, price: 1.5 },
    { quantity: 2, filledQuantity: 2, price: 99 },
  ]), 300);
  const result = validatePreTrade(defaultMicroLivePolicy, validValidationInput({
    openOrderReserveCents: 450,
    lossPerMinuteCents: defaultMicroLivePolicy.maxLossPerMinuteCents,
    sessionLossCents: defaultMicroLivePolicy.sessionLossLimitCents,
    protectedCapitalAttempted: true,
  }));
  assert.equal(result.accepted, false);
  assert.ok(result.failures.some((failure) => failure.includes("open-order reserve")));
  assert.ok(result.failures.some((failure) => failure.includes("loss-per-minute")));
  assert.ok(result.failures.some((failure) => failure.includes("session loss")));
  assert.ok(result.failures.some((failure) => failure.includes("protected capital")));
});

test("stale data, venue failure, heartbeat loss, and Guardian disagreement contain exposure", async () => {
  const stale = validatePreTrade(defaultMicroLivePolicy, validValidationInput({ marketDataAgeMs: defaultMicroLivePolicy.maxDataAgeMs + 1 }));
  assert.equal(stale.accepted, false);
  assert.ok(stale.failures.includes("market data is stale"));

  const failedVenue = new SimulatedVenueAdapter({ health: "FAILED" });
  const recovery = await recoverExecutionState(failedVenue, { internalPositionCents: 0, internalOpenOrders: 0, internalFillIds: [] });
  assert.equal(recovery.safeToContinue, false);
  assert.equal(recovery.action, "STOP");

  const heartbeatLoss = validatePreTrade(defaultMicroLivePolicy, validValidationInput({ riskHeartbeatHealthy: false }));
  assert.equal(heartbeatLoss.accepted, false);
  assert.ok(heartbeatLoss.failures.includes("risk engine heartbeat is unavailable"));
  assert.equal(guardianDecision({
    liveStatus: "ACTIVE",
    heartbeatAgeMs: 4001,
    maxHeartbeatAgeMs: 4000,
    reportedExposureCents: 100,
    observedVenueExposureCents: 100,
    hardExposureCents: 500,
    riskEngineHealthy: true,
  }).action, "STOP");
  assert.equal(guardianDecision({
    liveStatus: "ACTIVE",
    heartbeatAgeMs: 1,
    maxHeartbeatAgeMs: 4000,
    reportedExposureCents: 100,
    observedVenueExposureCents: 101,
    hardExposureCents: 500,
    riskEngineHealthy: true,
  }).action, "LOCKED");
});