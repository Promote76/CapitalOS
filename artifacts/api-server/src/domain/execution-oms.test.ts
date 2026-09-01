import assert from "node:assert/strict";
import test from "node:test";
import { buildClientOrderId, canTransitionOrder, calculateLiveReadiness, defaultMicroLivePolicy, evaluateLiveEnablement, guardianDecision, reconcileExecutionState, runLiveRehearsal, validatePreTrade } from "./execution-oms.ts";

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
  assert.ok(result.chaosTests.length >= 4);
});

test("readiness score cannot enable live execution", () => {
  const result = calculateLiveReadiness({ strategyEvidence: true, paperPerformance: true, venue: true, marketData: true, oms: true, riskGovernor: true, capitalGovernor: true, guardian: true, reconciliation: true, security: true, chaosTests: true });
  assert.equal(result.score, 100);
  assert.equal(result.liveExecutionEnabled, false);
});