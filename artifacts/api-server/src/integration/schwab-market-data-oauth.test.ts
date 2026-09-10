import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";
import {
  db,
  householdMembers,
  households,
  schwabConnections,
  schwabMarketDataConnections,
  schwabMarketDataOAuthStates,
  schwabResearchCertifications,
  users,
} from "@workspace/db";
import {
  createSchwabMarketDataOAuthState,
  schwabMarketDataAuthorizationUrl,
  schwabMarketDataCallbackUrl,
} from "../services/schwab-market-data-oauth";

const enabled = process.env.CAPITAL_OS_RUN_INTEGRATION === "1";

test("separate Schwab Market Data app keeps OAuth, tokens, reads, and disconnect isolated", { skip: !enabled }, async () => {
  process.env.NODE_ENV = "test";
  process.env.CAPITAL_OS_TEST_CONTEXT = "1";
  process.env.CAPITAL_OS_ALLOWED_ORIGIN = "http://capitalos.test";
  process.env.CAPITAL_OS_PUBLIC_ORIGIN = "https://capital-os-fund.replit.app";
  process.env.SESSION_SECRET = "market-data-test-session-secret-long-enough-for-encryption";
  process.env.SCHWAB_MARKET_DATA_APP_KEY = "market-data-test-key";
  process.env.SCHWAB_MARKET_DATA_APP_SECRET = "market-data-test-secret";

  assert.equal(schwabMarketDataCallbackUrl(), "https://capital-os-fund.replit.app/api/integrations/schwab/oauth/callback");
  const authorizationUrl = schwabMarketDataAuthorizationUrl("A".repeat(43));
  assert.match(authorizationUrl, /client_id=market-data-test-key/);
  assert.match(authorizationUrl, /schwab%2Foauth%2Fcallback/);

  const [user] = await db.insert(users).values({ email: `schwab-market-${randomUUID()}@capitalos.test`, displayName: "Market Data", status: "active" }).returning({ id: users.id });
  const [household] = await db.insert(households).values({ name: `Market Data ${randomUUID()}` }).returning({ id: households.id });
  await db.insert(householdMembers).values({ householdId: household.id, userId: user.id, role: "owner", permissions: ["read", "approve"], active: true });
  await db.insert(schwabConnections).values({ householdId: household.id, createdByUserId: user.id, status: "DISCONNECTED", lifecycleGeneration: "portfolio-generation" });

  const browserBinding = "B".repeat(43);
  const state = await createSchwabMarketDataOAuthState({ householdId: household.id, actorUserId: user.id, browserBinding });
  const [storedState] = await db.select().from(schwabMarketDataOAuthStates).where(eq(schwabMarketDataOAuthStates.householdId, household.id));
  assert.ok(storedState);
  assert.notEqual(storedState.stateHash, state);

  const { default: app } = await import("../app");
  const server = app.listen(0);
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}/api`;
  const realFetch = globalThis.fetch;
  const request = (path: string, init: RequestInit = {}) => realFetch(`${base}${path}`, {
    redirect: "manual",
    ...init,
    headers: {
      "X-Test-User-Id": user.id,
      "X-Test-Household-Id": household.id,
      "X-Test-Step-Up": "verified",
      ...(init.headers ?? {}),
    },
  });
  try {
    globalThis.fetch = (async () => new Response(JSON.stringify({
      access_token: "market-access-secret",
      refresh_token: "market-refresh-secret",
      expires_in: 3600,
    }), { status: 200 })) as typeof fetch;
    const callback = await request(`/integrations/schwab/oauth/callback?code=market-code&state=${state}`, {
      headers: { Cookie: `__Host-capitalos_schwab_market_data_oauth=${browserBinding}` },
    });
    assert.equal(callback.status, 303);
    assert.equal(callback.headers.get("location"), "/integrations/schwab?market_data_oauth=connected");

    const [connection] = await db.select().from(schwabMarketDataConnections).where(eq(schwabMarketDataConnections.householdId, household.id));
    assert.ok(connection);
    assert.equal(connection.status, "LIVE_CONNECTED");
    assert.doesNotMatch(JSON.stringify(connection), /market-access-secret|market-refresh-secret/);

    globalThis.fetch = (async (input) => {
      const url = String(input);
      if (url.includes("/quotes?symbols=ABC%2CMSFT")) return new Response(JSON.stringify({
        ABC: { symbol: "ABC", assetMainType: "EQUITY", quote: { lastPrice: 15, quoteTime: Date.now() } },
        MSFT: { symbol: "MSFT", assetMainType: "EQUITY", quote: { lastPrice: 500, quoteTime: Date.now() } },
      }));
      if (url.includes("/markets?markets=equity&date=")) return new Response(JSON.stringify({ equity: { isOpen: true } }));
      return new Response("unexpected path", { status: 404 });
    }) as typeof fetch;
    const marketResponse = await request("/integrations/schwab/market-data?symbols=abc,MSFT,abc");
    assert.equal(marketResponse.status, 200);
    const marketData = await marketResponse.json() as Record<string, any>;
    assert.deepEqual(marketData.quotes.map((quote: Record<string, unknown>) => quote.symbol), ["ABC", "MSFT"]);
    assert.equal(marketData.marketClock.marketOpen, true);
    assert.equal(marketData.product, "MARKET_DATA_PRODUCTION");
    assert.equal(marketData.tradingEnabled, false);
    assert.equal((await request("/integrations/schwab/market-data?symbols=ABC,%24INVALID")).status, 400);

    const researchCalls: Array<{ url: string; method: string }> = [];
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      researchCalls.push({ url, method: String(init?.method ?? "GET").toUpperCase() });
      if (url.includes("/marketdata/v1/instruments?symbol=BKSC&projection=fundamental")) {
        return new Response(JSON.stringify({ instruments: [{ symbol: "BKSC", assetType: "EQUITY", fundamental: { peRatio: 12.5 } }] }), {
          headers: {
            "x-request-id": "instrument-safe-id",
            "x-ratelimit-limit": "120",
            "x-ratelimit-remaining": "119",
            "x-ratelimit-reset": "2026-09-10T01:00:00Z",
          },
        });
      }
      if (url.includes("/marketdata/v1/quotes?symbols=BKSC")) {
        return new Response(JSON.stringify({ BKSC: { symbol: "BKSC", quote: { lastPrice: 31.5, isRealtime: true, quoteTime: Date.now() } } }), {
          headers: {
            "x-request-id": "quote-safe-id",
            "x-ratelimit-limit": "120",
            "x-ratelimit-remaining": "118",
            "retry-after": "0",
          },
        });
      }
      if (url.includes("/marketdata/v1/pricehistory?")) {
        return new Response(JSON.stringify({ symbol: "BKSC", candles: [{ datetime: Date.now() - 5 * 60_000, close: 31 }] }), {
          headers: {
            "x-request-id": "history-safe-id",
            "x-ratelimit-limit": "120",
            "x-ratelimit-remaining": "117",
          },
        });
      }
      return new Response("unexpected path", { status: 404 });
    }) as typeof fetch;
    const instrument = await request("/research/schwab/instruments?symbol=BKSC&projection=fundamental");
    assert.equal(instrument.status, 200);
    const instrumentBody = await instrument.json() as Record<string, any>;
    assert.equal(instrumentBody.data.fundamental.peRatio, "12.5");
    assert.equal(instrumentBody.provenance.providerRequestId, "instrument-safe-id");
    assert.equal(instrumentBody.rateLimit.limit, 120);
    assert.equal(instrumentBody.rateLimit.remaining, 119);
    assert.equal(instrumentBody.freshness, "UNKNOWN");
    assert.equal(instrumentBody.tradingEnabled, false);
    assert.equal(instrumentBody.executionAuthority, "none");
    const quote = await request("/research/schwab/quotes/BKSC");
    assert.equal(quote.status, 200);
    const quoteBody = await quote.json() as Record<string, any>;
    assert.equal(quoteBody.data.realtime, true);
    assert.equal(quoteBody.realtime, true);
    assert.equal(quoteBody.delayed, null);
    assert.equal(quoteBody.freshness, "REALTIME");
    assert.equal(quoteBody.provenance.providerRequestId, "quote-safe-id");
    assert.equal(quoteBody.rateLimit.remaining, 118);
    const endDate = Date.now();
    const history = await request(`/research/schwab/price-history?symbol=BKSC&startDate=${endDate - 30 * 86_400_000}&endDate=${endDate}`);
    assert.equal(history.status, 200);
    const historyBody = await history.json() as Record<string, any>;
    assert.equal(historyBody.data.candles.length, 1);
    assert.equal(historyBody.provenance.providerRequestId, "history-safe-id");
    assert.equal(historyBody.rateLimit.limit, 120);
    assert.equal(historyBody.freshness, "CURRENT");
    assert.deepEqual(researchCalls.map(({ url }) => new URL(url).pathname).sort(), [
      "/marketdata/v1/instruments",
      "/marketdata/v1/pricehistory",
      "/marketdata/v1/quotes",
    ]);
    assert.ok(researchCalls.every(({ method }) => method === "GET"));
    assert.equal(researchCalls.length, 3);
    assert.ok(researchCalls.every(({ url }) => !/orders|transfers|micro-live|execution-control/.test(url)));

    researchCalls.length = 0;
    const certification = await request("/research/schwab/certification", { method: "POST" });
    assert.equal(certification.status, 200);
    const certificationBody = await certification.json() as Record<string, any>;
    assert.equal(certificationBody.result, "PASS");
    assert.equal(certificationBody.symbol, "BKSC");
    assert.equal(certificationBody.providerGetCount, 3);
    assert.equal(certificationBody.capabilities.length, 3);
    assert.ok(certificationBody.capabilities.every((item: Record<string, unknown>) => item.status === "CONFIRMED"));
    assert.ok(certificationBody.capabilities.every((item: Record<string, unknown>) => item.providerHttpStatus === 200));
    assert.equal(certificationBody.readOnly, true);
    assert.equal(certificationBody.tradingEnabled, false);
    assert.equal(certificationBody.executionAuthority, "none");
    assert.equal(certificationBody.noTradingOrMoneyMovement, true);
    assert.doesNotMatch(JSON.stringify(certificationBody), /market-access-secret|market-refresh-secret/);
    assert.equal(researchCalls.length, 3);
    const [savedCertification] = await db.select().from(schwabResearchCertifications)
      .where(eq(schwabResearchCertifications.householdId, household.id));
    assert.ok(savedCertification);
    assert.equal(savedCertification.result, "PASS");
    assert.doesNotMatch(JSON.stringify(savedCertification.record), /market-access-secret|market-refresh-secret/);
    assert.ok(researchCalls.every(({ method }) => method === "GET"));
    assert.deepEqual(researchCalls.map(({ url }) => new URL(url).pathname).sort(), [
      "/marketdata/v1/instruments",
      "/marketdata/v1/pricehistory",
      "/marketdata/v1/quotes",
    ]);
    const certificationHistoryRequest = researchCalls.find(({ url }) => url.includes("/pricehistory"));
    assert.ok(certificationHistoryRequest);
    const certificationHistoryUrl = new URL(certificationHistoryRequest.url);
    assert.equal(certificationHistoryUrl.searchParams.get("symbol"), "BKSC");
    assert.ok(Number(certificationHistoryUrl.searchParams.get("endDate")) < Date.now());
    assert.ok(Number(certificationHistoryUrl.searchParams.get("endDate")) - Number(certificationHistoryUrl.searchParams.get("startDate")) <= 30 * 86_400_000);

    await db.update(schwabMarketDataConnections)
      .set({ accessTokenExpiresAt: new Date(Date.now() - 1_000) })
      .where(eq(schwabMarketDataConnections.householdId, household.id));
    researchCalls.length = 0;
    const expiredCertification = await request("/research/schwab/certification", { method: "POST" });
    assert.equal(expiredCertification.status, 200);
    const expiredCertificationBody = await expiredCertification.json() as Record<string, any>;
    assert.equal(expiredCertificationBody.result, "BLOCKED");
    assert.equal(expiredCertificationBody.providerGetCount, 0);
    assert.ok(expiredCertificationBody.capabilities.every((item: Record<string, unknown>) => item.tokenRefreshRequired === true));
    assert.equal(researchCalls.length, 0);

    const [otherUser] = await db.insert(users).values({ email: `schwab-market-other-${randomUUID()}@capitalos.test`, displayName: "Other household", status: "active" }).returning({ id: users.id });
    const [otherHousehold] = await db.insert(households).values({ name: `Other Market Data ${randomUUID()}` }).returning({ id: households.id });
    await db.insert(householdMembers).values({ householdId: otherHousehold.id, userId: otherUser.id, role: "owner", permissions: ["read"], active: true });
    const isolated = await realFetch(`${base}/research/schwab/quotes/BKSC`, {
      headers: { "X-Test-User-Id": otherUser.id, "X-Test-Household-Id": otherHousehold.id },
    });
    assert.equal(isolated.status, 409);
    assert.equal((await isolated.json() as Record<string, unknown>).code, "MARKET_DATA_DISCONNECTED");
    assert.equal(researchCalls.length, 0);

    assert.equal((await request("/integrations/schwab/market-data/disconnect", { method: "POST" })).status, 200);
    const [portfolio] = await db.select().from(schwabConnections).where(eq(schwabConnections.householdId, household.id));
    assert.equal(portfolio.lifecycleGeneration, "portfolio-generation");
    const [disconnected] = await db.select().from(schwabMarketDataConnections).where(eq(schwabMarketDataConnections.householdId, household.id));
    assert.equal(disconnected.status, "DISCONNECTED");
    assert.equal(disconnected.accessTokenCiphertext, null);
  } finally {
    globalThis.fetch = realFetch;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});