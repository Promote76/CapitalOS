import { appendAuditEvent, appendAuditEvents } from "../services/audit";
import { randomBytes, randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { auditEvents, db, schwabMarketDataConnections, schwabMarketDataOAuthStates } from "@workspace/db";
import { normalizeSchwabMarketClock, normalizeSchwabQuotes } from "../adapters/broker-portfolio";
import { assertPermission } from "../domain/governance";
import { asyncRoute } from "../middleware/errors";
import { actorFrom } from "../middleware/request-context";
import {
  decryptSchwabOAuthValue,
  encryptSchwabOAuthValue,
  fetchSchwabObservation,
} from "../services/schwab-oauth";
import {
  createSchwabMarketDataOAuthState,
  exchangeSchwabMarketDataToken,
  schwabMarketDataAuthorizationUrl,
  schwabMarketDataCallbackUrl,
  schwabMarketDataConfigured,
  schwabMarketDataLifecycleLock,
} from "../services/schwab-market-data-oauth";

const router: IRouter = Router();
const browserCookie = "__Host-capitalos_schwab_market_data_oauth";
const oauthCookie = (value: string, maxAge: number) => `${browserCookie}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
const audit = async (householdId: string, actor: string, eventType: string, entityId = householdId) => {
  return appendAuditEvent({
    householdId,
    actor,
    eventType,
    entity: "schwab_market_data_connection",
    entityId,
    metadata: { provider: "schwab", product: "market_data_production", readOnly: true },
  });
};
const parseSymbols = (input: unknown): string[] | null => {
  if (input === undefined) return [];
  if (typeof input !== "string") return null;
  const symbols = [...new Set(input.split(",").map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
  return symbols.length <= 500 && symbols.every((symbol) => /^[A-Z0-9._-]{1,30}$/.test(symbol)) ? symbols : null;
};

router.get("/integrations/schwab/market-data/status", asyncRoute(async (_req, res) => {
  const actor = actorFrom(res);
  const [connection] = await db.select().from(schwabMarketDataConnections).where(eq(schwabMarketDataConnections.householdId, actor.householdId)).limit(1);
  let callbackUrl: string | null = null;
  try { callbackUrl = schwabMarketDataCallbackUrl(); } catch { /* fail closed */ }
  const healthy = connection?.status === "LIVE_CONNECTED" && !!connection.accessTokenExpiresAt && connection.accessTokenExpiresAt > new Date();
  res.json({
    provider: "schwab",
    product: "MARKET_DATA_PRODUCTION",
    readOnly: true,
    tradingEnabled: false,
    dataMode: healthy ? "LIVE_CONNECTED" : "DISCONNECTED",
    credentialsConfigured: schwabMarketDataConfigured(),
    callbackUrl,
    connectionStatus: !schwabMarketDataConfigured() || !callbackUrl ? "CONFIGURATION_REQUIRED" : healthy ? "LIVE_CONNECTED" : connection?.status === "ERROR" ? "ERROR" : "DISCONNECTED",
    tokenHealth: healthy ? "HEALTHY" : connection?.accessTokenExpiresAt ? "EXPIRED" : "UNAVAILABLE",
    tokenExpiresAt: connection?.accessTokenExpiresAt?.toISOString() ?? null,
    lastSuccessfulReadAt: connection?.lastSuccessfulReadAt?.toISOString() ?? null,
  });
}));

router.post("/integrations/schwab/market-data/connect", asyncRoute(async (_req, res) => {
  const actor = actorFrom(res); assertPermission(actor.role, "approve");
  const browserBinding = randomBytes(32).toString("base64url");
  const state = await createSchwabMarketDataOAuthState({ householdId: actor.householdId, actorUserId: actor.userId, browserBinding });
  const authorizationUrl = schwabMarketDataAuthorizationUrl(state);
  await audit(actor.householdId, actor.userId, "schwab_market_data_connect_initiated");
  res.setHeader("Set-Cookie", oauthCookie(browserBinding, 10 * 60));
  res.status(201).json({ authorizationUrl, callbackUrl: schwabMarketDataCallbackUrl(), readOnly: true, tradingEnabled: false });
}));

router.post("/integrations/schwab/market-data/refresh", asyncRoute(async (_req, res) => {
  const actor = actorFrom(res); assertPermission(actor.role, "approve");
  const outcome = await db.transaction(async (tx) => {
    await tx.execute(schwabMarketDataLifecycleLock(actor.householdId));
    const [connection] = await tx.select().from(schwabMarketDataConnections).where(and(
      eq(schwabMarketDataConnections.householdId, actor.householdId),
      eq(schwabMarketDataConnections.status, "LIVE_CONNECTED"),
    )).limit(1);
    if (!connection?.refreshTokenCiphertext || !connection.refreshTokenNonce || !connection.refreshTokenAuthTag) return { status: 409 as const, code: "DISCONNECTED", connectionId: null };
    try {
      const tokens = await exchangeSchwabMarketDataToken({ refreshToken: decryptSchwabOAuthValue({
        ciphertext: connection.refreshTokenCiphertext, nonce: connection.refreshTokenNonce, authTag: connection.refreshTokenAuthTag,
      }) });
      const access = encryptSchwabOAuthValue(tokens.accessToken);
      const refresh = tokens.refreshToken ? encryptSchwabOAuthValue(tokens.refreshToken) : null;
      const now = new Date();
      await tx.update(schwabMarketDataConnections).set({
        accessTokenCiphertext: access.ciphertext, accessTokenNonce: access.nonce, accessTokenAuthTag: access.authTag,
        ...(refresh ? { refreshTokenCiphertext: refresh.ciphertext, refreshTokenNonce: refresh.nonce, refreshTokenAuthTag: refresh.authTag } : {}),
        accessTokenExpiresAt: new Date(now.getTime() + tokens.expiresIn * 1000),
        refreshTokenExpiresAt: refresh && tokens.refreshTokenExpiresIn ? new Date(now.getTime() + tokens.refreshTokenExpiresIn * 1000) : connection.refreshTokenExpiresAt,
        status: "LIVE_CONNECTED", lastErrorCode: null, updatedAt: now,
      }).where(eq(schwabMarketDataConnections.id, connection.id));
      return { status: 200 as const, connectionId: connection.id };
    } catch {
      await tx.update(schwabMarketDataConnections).set({ status: "ERROR", lastErrorCode: "TOKEN_REFRESH_FAILED", updatedAt: new Date() }).where(eq(schwabMarketDataConnections.id, connection.id));
      return { status: 503 as const, connectionId: connection.id };
    }
  });
  await audit(actor.householdId, actor.userId, outcome.status === 200 ? "schwab_market_data_token_refreshed" : "schwab_market_data_token_refresh_failed", outcome.connectionId ?? actor.householdId);
  res.status(outcome.status).json(outcome.status === 200 ? { status: "LIVE_CONNECTED", tokenHealth: "HEALTHY" } : { code: outcome.connectionId ? "TOKEN_REFRESH_FAILED" : "DISCONNECTED" });
}));

router.get("/integrations/schwab/market-data", asyncRoute(async (req, res) => {
  const actor = actorFrom(res);
  const symbols = parseSymbols(req.query.symbols);
  if (!symbols) { res.status(400).json({ code: "INVALID_SYMBOLS" }); return; }
  const [connection] = await db.select().from(schwabMarketDataConnections).where(eq(schwabMarketDataConnections.householdId, actor.householdId)).limit(1);
  if (!connection?.accessTokenExpiresAt || connection.accessTokenExpiresAt <= new Date() || connection.status !== "LIVE_CONNECTED") {
    res.status(409).json({ code: "DISCONNECTED_OR_EXPIRED" }); return;
  }
  try {
    const token = decryptSchwabOAuthValue({ ciphertext: connection.accessTokenCiphertext!, nonce: connection.accessTokenNonce!, authTag: connection.accessTokenAuthTag! });
    const date = new Date().toISOString().slice(0, 10);
    const [quotes, marketClock] = await Promise.all([
      symbols.length ? fetchSchwabObservation(`/marketdata/v1/quotes?symbols=${encodeURIComponent(symbols.join(","))}`, token).then(normalizeSchwabQuotes) : Promise.resolve([]),
      fetchSchwabObservation(`/marketdata/v1/markets?markets=equity&date=${date}`, token).then(normalizeSchwabMarketClock),
    ]);
    const updated = await db.update(schwabMarketDataConnections).set({ lastSuccessfulReadAt: new Date(), lastErrorCode: null, updatedAt: new Date() }).where(and(
      eq(schwabMarketDataConnections.id, connection.id),
      eq(schwabMarketDataConnections.status, "LIVE_CONNECTED"),
      eq(schwabMarketDataConnections.accessTokenCiphertext, connection.accessTokenCiphertext!),
    )).returning({ id: schwabMarketDataConnections.id });
    if (!updated.length) { res.status(409).json({ code: "CONNECTION_CHANGED" }); return; }
    await audit(actor.householdId, actor.userId, "schwab_market_data_read", connection.id);
    res.json({ provider: "schwab", product: "MARKET_DATA_PRODUCTION", readOnly: true, tradingEnabled: false, dataMode: "LIVE_CONNECTED", quotes, marketClock });
  } catch {
    await audit(actor.householdId, actor.userId, "schwab_market_data_failed", connection.id);
    res.status(503).json({ code: "MARKET_DATA_FAILED" });
  }
}));

router.post("/integrations/schwab/market-data/disconnect", asyncRoute(async (_req, res) => {
  const actor = actorFrom(res); assertPermission(actor.role, "approve");
  await db.transaction(async (tx) => {
    await tx.execute(schwabMarketDataLifecycleLock(actor.householdId));
    const now = new Date();
    await tx.update(schwabMarketDataOAuthStates).set({ consumedAt: now }).where(and(
      eq(schwabMarketDataOAuthStates.householdId, actor.householdId),
      isNull(schwabMarketDataOAuthStates.consumedAt),
    ));
    await tx.insert(schwabMarketDataConnections).values({
      householdId: actor.householdId, createdByUserId: actor.userId, status: "DISCONNECTED", lifecycleGeneration: randomUUID(), updatedAt: now,
    }).onConflictDoUpdate({
      target: schwabMarketDataConnections.householdId,
      set: {
        status: "DISCONNECTED", lifecycleGeneration: randomUUID(),
        accessTokenCiphertext: null, accessTokenNonce: null, accessTokenAuthTag: null,
        refreshTokenCiphertext: null, refreshTokenNonce: null, refreshTokenAuthTag: null,
        accessTokenExpiresAt: null, refreshTokenExpiresAt: null, lastErrorCode: null, updatedAt: now,
      },
    });
  });
  await audit(actor.householdId, actor.userId, "schwab_market_data_disconnected");
  res.json({ status: "DISCONNECTED", readOnly: true, tradingEnabled: false });
}));

export default router;