import assert from "node:assert/strict";
import test from "node:test";
import {
  BrokerProviderError,
  SchwabReadOnlyProvider,
  brokerFreshness,
  getGrokPortfolioResearchSnapshot,
  initializeShadowBrokerBaseline,
  normalizeSchwabAccounts,
  normalizeSchwabBalances,
  normalizeSchwabMarketClock,
  normalizeSchwabOrders,
  normalizeSchwabPositions,
  normalizeSchwabQuotes,
  normalizeSchwabTransactions,
  reconcileBrokerPortfolio,
  schwabFeatureStatus,
  type BrokerPortfolioSnapshot,
} from "../adapters/broker-portfolio.ts";

test("Schwab provider-shaped observations normalize without account numbers or trading methods", async () => {
  const accountNumber = "123456789";
  const accountHash = "opaque-account-hash";
  const account = normalizeSchwabAccounts("household-a", {
    hashValue: accountHash,
    accountNumber,
    type: "MARGIN",
    currentBalances: { cashBalance: 1000, buyingPower: 1200 },
  });
  assert.equal(account[0]?.id, accountHash);
  assert.doesNotMatch(JSON.stringify(account), new RegExp(accountNumber));
  assert.deepEqual(normalizeSchwabAccounts("household-a", { accountNumber }), []);

  const positions = normalizeSchwabPositions("household-a", accountHash, [{
    longQuantity: 4.12345678,
    averagePrice: 10,
    averageLongPrice: 40,
    marketValue: 60,
    longOpenProfitLoss: 8,
    currentDayProfitLoss: 1.25,
    instrument: { symbol: "ABC", assetType: "EQUITY" },
  }]);
  assert.equal(positions[0]?.quantity, "4.12345678");
  assert.equal(positions[0]?.costBasis, "52");
  assert.equal(positions[0]?.dayChange, "1.25");
  assert.equal(normalizeSchwabBalances(accountHash, { cashBalance: 1000 })[0]?.cashBalance, "1000");

  const orders = normalizeSchwabOrders(accountHash, [{
    orderId: 44,
    orderType: "LIMIT",
    orderStrategyType: "SINGLE",
    orderLegCollection: [{ instruction: "BUY", instrument: { symbol: "ABC" } }],
  }]);
  assert.equal(orders[0]?.side, "BUY");
  assert.equal(orders[0]?.orderIdReference, "44");

  const transaction = normalizeSchwabTransactions(accountHash, [{ activityId: 9, type: "DIVIDEND", netAmount: 4 }])[0];
  assert.equal(transaction?.transactionClass, "income");
  assert.equal(transaction?.transactionIdReference, "9");
  const associatedTrade = normalizeSchwabTransactions(accountHash, [{
    activityId: 10,
    type: "TRADE",
    netAmount: -20,
    transferItems: [
      { amount: -20, instrument: { symbol: "CURRENCY_USD" } },
      { amount: 0.51234567, instrument: { symbol: "XDTE" } },
    ],
  }])[0];
  assert.equal(associatedTrade?.symbol, "XDTE");
  assert.equal(associatedTrade?.quantity, "0.51234567");
  assert.equal(normalizeSchwabQuotes({ ABC: { symbol: "ABC", assetMainType: "EQUITY", quote: { lastPrice: 15, quoteTime: 1788900000000 } } })[0]?.providerTimestamp, "2026-09-08T20:40:00.000Z");
  assert.equal(normalizeSchwabMarketClock({ equity: { EQ: { isOpen: true, sessionHours: { regularMarket: [{ start: "2026-09-08T13:30:00.000Z" }] } } } }).marketOpen, true);
  const short = normalizeSchwabPositions("household-a", accountHash, [{
    shortQuantity: 2,
    marketValue: -40,
    instrument: { symbol: "XYZ", assetType: "EQUITY" },
  }])[0];
  assert.equal(short?.quantity, "-2");
  assert.equal(short?.marketPrice, "20");
  assert.equal(short?.costBasis, "UNKNOWN");
  const option = (multiplier?: number) => normalizeSchwabPositions("household-a", accountHash, [{
    longQuantity: 2,
    marketValue: 600,
    instrument: { symbol: "ABC  261218C00100000", assetType: "OPTION", multiplier },
  }])[0];
  assert.equal(option(100)?.marketPrice, "3");
  assert.equal(option(50)?.marketPrice, "6");
  assert.equal(option()?.marketPrice, "UNKNOWN");
  assert.equal(option(0)?.marketPrice, "UNKNOWN");

  const calls: string[] = [];
  const provider = new SchwabReadOnlyProvider(
    { SCHWAB_READ_ONLY_ENABLED: "true" },
    async (path) => {
      calls.push(path);
      return path.includes("markets/equity") ? { equity: { isOpen: false } } : [];
    },
  );
  await provider.getOrders({ householdId: "household-a", credentialRef: accountHash });
  await provider.getTransactions({ householdId: "household-a", credentialRef: accountHash });
  await provider.getMarketClock({ householdId: "household-a", credentialRef: accountHash });
  assert.equal(calls.every((path) => !/place|replace|cancel|transfer|withdraw/i.test(path)), true);
  assert.ok(calls.some((path) => path.includes("fromEnteredTime=") && path.includes("toEnteredTime=")));
  assert.ok(calls.some((path) => path.includes("startDate=") && path.includes("endDate=") && path.includes("types=")));
  assert.ok(calls.some((path) => path.includes("/markets?markets=equity&date=")));
  assert.equal("placeOrder" in provider, false);
});

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
  assert.equal(health.state, "not_configured");
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