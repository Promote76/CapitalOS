import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import {
  auditEvents,
  db,
  householdMembers,
  households,
  schwabConnections,
  schwabOAuthStates,
  schwabObservationSnapshots,
  users,
} from "@workspace/db";
import {
  consumeSchwabOAuthState,
  createSchwabOAuthState,
  SchwabOAuthStateError,
} from "../services/schwab-oauth.ts";

const enabled = process.env.CAPITAL_OS_RUN_INTEGRATION === "1";

async function fixture() {
  const [userA] = await db.insert(users).values({ email: `schwab-a-${randomUUID()}@capitalos.test`, displayName: "Schwab A", status: "active" }).returning({ id: users.id });
  const [userB] = await db.insert(users).values({ email: `schwab-b-${randomUUID()}@capitalos.test`, displayName: "Schwab B", status: "active" }).returning({ id: users.id });
  const [householdA] = await db.insert(households).values({ name: `Schwab A ${randomUUID()}` }).returning({ id: households.id });
  const [householdB] = await db.insert(households).values({ name: `Schwab B ${randomUUID()}` }).returning({ id: households.id });
  await db.insert(householdMembers).values([
    { householdId: householdA.id, userId: userA.id, role: "owner", permissions: ["read", "approve"], active: true },
    { householdId: householdB.id, userId: userB.id, role: "owner", permissions: ["read", "approve"], active: true },
  ]);
  return { userA: userA.id, userB: userB.id, householdA: householdA.id, householdB: householdB.id };
}

test("Schwab OAuth state is hash-only, expiring, single-use, and household+actor bound", { skip: !enabled }, async () => {
  const f = await fixture();
  const now = new Date();
  const browserA = "A".repeat(43);
  const browserB = "B".repeat(43);
  const state = await createSchwabOAuthState({ householdId: f.householdA, actorUserId: f.userA, browserBinding: browserA, now });
  assert.match(state, /^[A-Za-z0-9_-]{43}$/);
  const [stored] = await db.select().from(schwabOAuthStates).where(eq(schwabOAuthStates.householdId, f.householdA));
  assert.ok(stored);
  assert.notEqual(stored.stateHash, state);
  assert.equal(stored.stateHash.includes(state), false);
  assert.equal(stored.actorUserId, f.userA);
  assert.equal(stored.expiresAt.getTime(), now.getTime() + 10 * 60 * 1000);
  await assert.rejects(() => consumeSchwabOAuthState(state, browserB, new Date(now.getTime() + 1)), SchwabOAuthStateError);
  const consumed = await consumeSchwabOAuthState(state, browserA, new Date(now.getTime() + 1));
  assert.deepEqual({ householdId: consumed.householdId, actorUserId: consumed.actorUserId }, { householdId: f.householdA, actorUserId: f.userA });
  await assert.rejects(() => consumeSchwabOAuthState(state, browserA, new Date(now.getTime() + 2)), SchwabOAuthStateError);

  const concurrent = await createSchwabOAuthState({ householdId: f.householdB, actorUserId: f.userB, browserBinding: browserB, now });
  const consumption = await Promise.allSettled([consumeSchwabOAuthState(concurrent, browserB), consumeSchwabOAuthState(concurrent, browserB)]);
  assert.equal(consumption.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(consumption.filter((result) => result.status === "rejected").length, 1);
  const expired = await createSchwabOAuthState({ householdId: f.householdA, actorUserId: f.userA, browserBinding: browserA, now: new Date(0) });
  await assert.rejects(() => consumeSchwabOAuthState(expired, browserA, new Date()), SchwabOAuthStateError);
  await assert.rejects(() => consumeSchwabOAuthState("not-a-valid-state", browserA), SchwabOAuthStateError);
});

test("Schwab routes fail closed, isolate households, redact status, and callback redirects safely", { skip: !enabled }, async () => {
  process.env.NODE_ENV = "test";
  process.env.CAPITAL_OS_TEST_CONTEXT = "1";
  process.env.CAPITAL_OS_ALLOWED_ORIGIN = "http://capitalos.test";
  process.env.SESSION_SECRET = "test-session-secret-long-enough-to-derive-a-schwa b-key".replace(" ", "");
  process.env.CAPITAL_OS_PUBLIC_ORIGIN = "https://capital-os-fund.replit.app";
  process.env.SCHWAB_APP_KEY = "test-key";
  process.env.SCHWAB_APP_SECRET = "test-secret";
  const f = await fixture();
  const { default: app } = await import("../app.ts");
  const server = app.listen(0);
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}/api`;
  const realFetch = globalThis.fetch;
  const request = (path: string, init: RequestInit = {}, actor: Pick<typeof f, "userA" | "householdA"> = f) => realFetch(`${base}${path}`, {
    redirect: "manual", ...init, headers: {
      "X-Test-User-Id": actor.userA, "X-Test-Household-Id": actor.householdA,
      "X-Test-Step-Up": "verified", ...(init.headers ?? {}),
    },
  });
  try {
    assert.equal((await request("/integrations/schwab/sync", { method: "POST" })).status, 409);
    assert.equal((await request("/integrations/schwab/refresh", { method: "POST" })).status, 409);
    const browserBinding = "C".repeat(43);
    const state = await createSchwabOAuthState({ householdId: f.householdA, actorUserId: f.userA, browserBinding });
    globalThis.fetch = (async () => new Response(JSON.stringify({ access_token: "access-secret", refresh_token: "refresh-secret", expires_in: 3600 }), { status: 200 })) as typeof fetch;
    const wrongBrowserCallback = await request(`/integrations/schwab/oauth/callback?code=one-time-code&state=${state}`);
    assert.equal(wrongBrowserCallback.headers.get("location"), "/integrations/schwab?oauth=failed");
    const callback = await request(`/integrations/schwab/oauth/callback?code=one-time-code&state=${state}`, { headers: { Cookie: `__Host-capitalos_schwab_oauth=${browserBinding}` } });
    assert.equal(callback.status, 303);
    assert.equal(callback.headers.get("location"), "/integrations/schwab?oauth=connected");
    assert.doesNotMatch(callback.headers.get("location") ?? "", /code|state|token/i);
    const [connection] = await db.select().from(schwabConnections).where(eq(schwabConnections.householdId, f.householdA));
    assert.ok(connection);
    assert.equal(connection.accessTokenCiphertext?.includes("access-secret"), false);
    assert.equal(connection.refreshTokenCiphertext?.includes("refresh-secret"), false);
    const status = await (await request("/integrations/schwab/status")).json() as Record<string, unknown>;
    assert.equal(status.connectionStatus, "LIVE_CONNECTED");
    assert.doesNotMatch(JSON.stringify(status), /access-secret|refresh-secret|ciphertext|nonce|authTag/i);
    const originalRefreshCiphertext = connection.refreshTokenCiphertext;
    globalThis.fetch = (async () => new Response(JSON.stringify({ access_token: "replacement-access", expires_in: 3600 }), { status: 200 })) as typeof fetch;
    assert.equal((await request("/integrations/schwab/refresh", { method: "POST" })).status, 200);
    const [refreshed] = await db.select().from(schwabConnections).where(eq(schwabConnections.id, connection.id));
    assert.equal(refreshed?.refreshTokenCiphertext, originalRefreshCiphertext, "refresh rotation omission must retain the existing encrypted refresh token");
    const forbiddenAccountNumber = "9988776655";
    globalThis.fetch = (async (input) => {
      const url = String(input);
      if (url.includes("/accountNumbers")) return new Response(JSON.stringify([{ hashValue: "opaque-hash" }]));
      if (url.includes("/orders?")) {
        assert.match(url, /fromEnteredTime=.*toEnteredTime=/);
        return new Response(JSON.stringify([{ orderId: 1, orderLegCollection: [{ instruction: "BUY", instrument: { symbol: "ABC" } }] }]));
      }
      if (url.includes("/transactions?")) {
        assert.match(url, /startDate=.*endDate=.*types=/);
        return new Response(JSON.stringify([{ activityId: 2, type: "DIVIDEND", netAmount: 3 }]));
      }
      if (url.includes("/quotes?")) return new Response(JSON.stringify({ ABC: { symbol: "ABC", quote: { lastPrice: 15, quoteTime: Date.now() } } }));
      if (url.includes("/markets?markets=equity&date=")) return new Response(JSON.stringify({ equity: { isOpen: true } }));
      if (url.includes("/accounts/opaque-hash?fields=positions")) return new Response(JSON.stringify({ securitiesAccount: {
        accountNumber: forbiddenAccountNumber,
        type: "MARGIN",
        currentBalances: { cashBalance: 100 },
        positions: [{ longQuantity: 2, marketValue: 30, instrument: { symbol: "ABC", assetType: "EQUITY" } }],
      } }));
      return new Response("unexpected Schwab fixture path", { status: 404 });
    }) as typeof fetch;
    assert.equal((await request("/integrations/schwab/sync", { method: "POST" })).status, 200);
    const [snapshot] = await db.select().from(schwabObservationSnapshots).where(eq(schwabObservationSnapshots.householdId, f.householdA));
    assert.ok(snapshot);
    assert.doesNotMatch(JSON.stringify(snapshot), new RegExp(forbiddenAccountNumber));
    await db.update(schwabConnections).set({ accessTokenExpiresAt: new Date(Date.now() - 1) }).where(eq(schwabConnections.id, connection.id));
    assert.equal((await request("/integrations/schwab/sync", { method: "POST" })).status, 409, "expired tokens must fail closed before observation");
    const statusB = await (await request("/integrations/schwab/status", {}, { userA: f.userB, householdA: f.householdB })).json() as Record<string, unknown>;
    assert.equal(statusB.connectionStatus, "DISCONNECTED");
    const failed = await request("/integrations/schwab/oauth/callback?code=secret-code&state=invalid");
    assert.equal(failed.headers.get("location"), "/integrations/schwab?oauth=failed");
    assert.doesNotMatch(failed.headers.get("location") ?? "", /secret-code|invalid/);
    const [successAudit] = await db.select().from(auditEvents).where(and(eq(auditEvents.householdId, f.householdA), eq(auditEvents.eventType, "schwab_oauth_callback_succeeded")));
    assert.ok(successAudit);
    const pendingBinding = "D".repeat(43);
    const pendingState = await createSchwabOAuthState({ householdId: f.householdA, actorUserId: f.userA, browserBinding: pendingBinding });
    assert.equal((await request("/integrations/schwab/disconnect", { method: "POST" })).status, 200);
    const callbackAfterDisconnect = await request(`/integrations/schwab/oauth/callback?code=late-code&state=${pendingState}`, { headers: { Cookie: `__Host-capitalos_schwab_oauth=${pendingBinding}` } });
    assert.equal(callbackAfterDisconnect.headers.get("location"), "/integrations/schwab?oauth=failed");
    const disconnected = await (await request("/integrations/schwab/status")).json() as Record<string, unknown>;
    assert.equal(disconnected.connectionStatus, "DISCONNECTED");
  } finally {
    globalThis.fetch = realFetch;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("Schwab route and OpenAPI inventories expose only the read-only connector surface", async () => {
  const routes = [
    await readFile(fileURLToPath(new URL("../routes/schwab.ts", import.meta.url)), "utf8"),
    await readFile(fileURLToPath(new URL("../routes/schwab-market-data.ts", import.meta.url)), "utf8"),
  ].join("\n");
  const openapi = await readFile(fileURLToPath(new URL("../../../../lib/api-spec/openapi.yaml", import.meta.url)), "utf8");
  const documented = [...openapi.matchAll(/^\s{2}(\/integrations\/schwab[^:]*):/gm)].map((match) => match[1]);
  assert.deepEqual(documented, [
    "/integrations/schwab/status",
    "/integrations/schwab/connect",
    "/integrations/schwab/oauth/callback",
    "/integrations/schwab/refresh",
    "/integrations/schwab/sync",
    "/integrations/schwab/observations/latest",
    "/integrations/schwab/market-data",
    "/integrations/schwab/market-data/status",
    "/integrations/schwab/market-data/connect",
    "/integrations/schwab/market-data/refresh",
    "/integrations/schwab/market-data/disconnect",
    "/integrations/schwab/disconnect",
  ]);
  const schwabBlock = routes.match(/router\.(?:get|post)\("([^"]+)"/g)?.join("\n") ?? "";
  for (const forbidden of ["order", "place", "replace", "cancel", "transfer", "withdraw", "risk", "execution", "micro-live"]) {
    assert.equal(schwabBlock.toLowerCase().includes(forbidden), false, `Schwab route inventory must not expose ${forbidden}`);
    assert.equal(documented.some((path) => path.toLowerCase().includes(forbidden)), false, `OpenAPI must not expose Schwab ${forbidden}`);
  }
});