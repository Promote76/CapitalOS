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