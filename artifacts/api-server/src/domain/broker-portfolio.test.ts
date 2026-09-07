import assert from "node:assert/strict";
import test from "node:test";
import {
  BrokerProviderError,
  SchwabReadOnlyProvider,
  brokerFreshness,
  getGrokPortfolioResearchSnapshot,
  initializeShadowBrokerBaseline,
  reconcileBrokerPortfolio,
  schwabFeatureStatus,
  type BrokerPortfolioSnapshot,
} from "../adapters/broker-portfolio.ts";

const baseSnapshot = (): BrokerPortfolioSnapshot => ({
  accounts: [{
    id: "account-internal-1",
    householdId: "household-a",
    provider: "schwab",
    providerAccountReference: "provider-private-account-1",
    accountType: "brokerage",
    displayName: "Long-term brokerage",
    status: "open",
    currency: "USD",
    cashBalance: "5000.00",
    buyingPower: "5000.00",
    marginEnabled: false,
    lastSyncedAt: "2026-09-07T12:00:00.000Z",
    dataFreshness: "CURRENT",
  }],
  balances: [],
  positions: [{
    accountId: "account-internal-1",
    householdId: "household-a",
    symbol: "ABC",
    assetType: "equity",
    quantity: "10",
    averageCost: "100.00",
    costBasis: "1000.00",
    marketPrice: "120.00",
    marketValue: "1200.00",
    unrealizedGainLoss: "200.00",
    realizedGainLoss: "UNKNOWN",
    portfolioWeight: "24.00",
    providerTimestamp: "2026-09-07T12:00:00.000Z",
    receivedAt: "2026-09-07T12:01:00.000Z",
    dataFreshness: "CURRENT",
  }],
  orders: [],
  transactions: [],
  investmentTransactions: [],
  asOf: "2026-09-07T12:01:00.000Z",
  dataFreshness: "CURRENT",
  reconciliationStatus: "MATCHED",
});

test("Schwab trading is always disabled, even if a conflicting environment flag is present", () => {
  assert.deepEqual(schwabFeatureStatus({
    SCHWAB_READ_ONLY_ENABLED: "true",
    SCHWAB_TRADING_ENABLED: "true",
  }), {
    readOnlyEnabled: true,
    tradingEnabled: false,
    provider: "schwab",
    connection: "configured",
  });
});

test("disabled Schwab provider fails closed without making a provider request", async () => {
  const provider = new SchwabReadOnlyProvider({});
  const health = await provider.getProviderHealth();
  assert.equal(health.state, "disabled");
  assert.equal(health.tradingEnabled, false);
  assert.equal("placeOrder" in provider, false);
  await assert.rejects(
    provider.getPositions({ credentialRef: "server-side-reference" }),
    (error: unknown) => error instanceof BrokerProviderError && error.code === "PROVIDER_DISABLED",
  );
});

test("enabled without an attached connector remains action-required", async () => {
  const provider = new SchwabReadOnlyProvider({ SCHWAB_READ_ONLY_ENABLED: "true" });
  const health = await provider.getProviderHealth();
  assert.equal(health.state, "configured");
  assert.equal(health.status, "ACTION_REQUIRED");
  await assert.rejects(
    provider.getAccounts({ credentialRef: "server-side-reference" }),
    (error: unknown) => error instanceof BrokerProviderError && error.code === "NOT_CONFIGURED",
  );
});

test("freshness is explicit and unavailable provider timestamps remain UNKNOWN", () => {
  const now = new Date("2026-09-07T12:00:00.000Z");
  assert.equal(brokerFreshness(null, now, now), "UNKNOWN");
  assert.equal(brokerFreshness("2026-09-07T11:59:00.000Z", now, now), "CURRENT");
  assert.equal(brokerFreshness("2026-09-06T12:00:00.000Z", now, now), "AGING");
  assert.equal(brokerFreshness("2026-09-05T12:00:00.000Z", now, now), "STALE");
});

test("matching broker state reconciles without overwriting stored state", () => {
  const snapshot = baseSnapshot();
  const result = reconcileBrokerPortfolio(snapshot, structuredClone(snapshot));
  assert.equal(result.status, "MATCHED");
  assert.equal(result.requiresReview, false);
  assert.equal(result.mismatchCount, 0);
});

test("quantity and cash mismatches become critical review states", () => {
  const providerSnapshot = baseSnapshot();
  const storedSnapshot = structuredClone(providerSnapshot);
  storedSnapshot.accounts[0].cashBalance = "4000.00";
  storedSnapshot.positions[0].quantity = "9";
  const result = reconcileBrokerPortfolio(providerSnapshot, storedSnapshot);
  assert.equal(result.status, "CRITICAL_MISMATCH");
  assert.equal(result.requiresReview, true);
  assert.ok(result.mismatches.includes("account:account-internal-1:cashBalance"));
  assert.ok(result.mismatches.includes("position:account-internal-1:ABC:quantity"));
});

test("Grok projection strips household and provider account identifiers", () => {
  const projected = getGrokPortfolioResearchSnapshot(baseSnapshot());
  const encoded = JSON.stringify(projected);
  assert.equal(encoded.includes("household-a"), false);
  assert.equal(encoded.includes("provider-private-account-1"), false);
  assert.equal(projected.executionDisabled, true);
  assert.equal(projected.advisoryOnly, true);
  assert.equal(projected.positions[0].marketValue, "1200.00");
});

test("Shadow baseline is an independent, human-reviewed copy", () => {
  const baseline = initializeShadowBrokerBaseline(baseSnapshot());
  assert.equal(baseline.source, "broker_read_only_snapshot");
  assert.equal(baseline.independent, true);
  assert.equal(baseline.executionDisabled, true);
  assert.equal(baseline.humanReviewRequired, true);
  assert.equal(baseline.positions[0].symbol, "ABC");
});