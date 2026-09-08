import { Router, type IRouter } from "express";
import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { auditEvents, db, schwabConnections, schwabOAuthStates, schwabObservationSnapshots } from "@workspace/db";
import { normalizeSchwabAccounts, normalizeSchwabBalances, normalizeSchwabMarketClock, normalizeSchwabOrders, normalizeSchwabPositions, normalizeSchwabQuotes, normalizeSchwabTransactions } from "../adapters/broker-portfolio";
import { assertPermission } from "../domain/governance";
import { asyncRoute } from "../middleware/errors";
import { actorFrom } from "../middleware/request-context";
import {
  consumeSchwabOAuthState, createSchwabOAuthState, decryptSchwabOAuthValue,
  encryptSchwabOAuthValue, exchangeSchwabToken, SchwabOAuthConfigurationError,
  SchwabOAuthStateError, schwabAuthorizationUrl, schwabCallbackUrl, fetchSchwabObservation,
} from "../services/schwab-oauth";

const router: IRouter = Router();
const audit = (householdId: string, actor: string, eventType: string, entityId = householdId) =>
  db.insert(auditEvents).values({ householdId, actor, eventType, entity: "schwab_connection", entityId, metadata: { provider: "schwab", readOnly: true } });
const configured = () => Boolean(process.env.SCHWAB_APP_KEY && process.env.SCHWAB_APP_SECRET);
const lifecycleLock = (householdId: string) => sql`select pg_advisory_xact_lock(hashtextextended(${`schwab-lifecycle:${householdId}`}, 0))`;
const schwabBrowserCookie = "__Host-capitalos_schwab_oauth";
const oauthCookie = (value: string, maxAge: number) =>
  `${schwabBrowserCookie}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
const cookieValue = (header: string | undefined, name: string) =>
  header?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
const observationWindow = (now = new Date()) => ({
  from: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString(),
  to: now.toISOString(),
  date: now.toISOString().slice(0, 10),
});

router.get("/integrations/schwab/status", asyncRoute(async (_req, res) => {
  const actor = actorFrom(res);
  const [connection] = await db.select().from(schwabConnections).where(eq(schwabConnections.householdId, actor.householdId)).limit(1);
  let callbackUrl: string | null = null;
  try { callbackUrl = schwabCallbackUrl(); } catch { /* status intentionally exposes configuration-needed, not origin guesses */ }
  const healthy = !!connection && connection.status === "LIVE_CONNECTED" && !!connection.accessTokenExpiresAt && connection.accessTokenExpiresAt > new Date();
  res.json({
    provider: "schwab", readOnly: true, tradingEnabled: false, dataMode: healthy ? "LIVE_CONNECTED" : "DISCONNECTED",
    credentialsConfigured: configured(), callbackUrl,
    connectionStatus: !configured() || !callbackUrl ? "CONFIGURATION_REQUIRED" : healthy ? "LIVE_CONNECTED" : connection?.status === "ERROR" ? "ERROR" : "DISCONNECTED",
    accountAuthorizationStatus: healthy ? "AUTHORIZED" : "NOT_AUTHORIZED",
    tokenHealth: healthy ? "HEALTHY" : connection?.accessTokenExpiresAt ? "EXPIRED" : "UNAVAILABLE",
    tokenExpiresAt: connection?.accessTokenExpiresAt?.toISOString() ?? null,
    lastSuccessfulSyncAt: connection?.lastSuccessfulSyncAt?.toISOString() ?? null,
  });
}));

router.post("/integrations/schwab/connect", asyncRoute(async (_req, res) => {
  const actor = actorFrom(res); assertPermission(actor.role, "approve");
  const browserBinding = randomBytes(32).toString("base64url");
  const state = await createSchwabOAuthState({ householdId: actor.householdId, actorUserId: actor.userId, browserBinding });
  const authorizationUrl = schwabAuthorizationUrl(state);
  await audit(actor.householdId, actor.userId, "schwab_connect_initiated");
  res.setHeader("Set-Cookie", oauthCookie(browserBinding, 10 * 60));
  res.status(201).json({ authorizationUrl, callbackUrl: schwabCallbackUrl(), readOnly: true, tradingEnabled: false });
}));

router.get("/integrations/schwab/oauth/callback", asyncRoute(async (req, res) => {
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const browserBinding = cookieValue(req.headers.cookie, schwabBrowserCookie);
  let binding: { householdId: string; actorUserId: string; createdAt: Date; lifecycleGeneration: string } | undefined;
  try {
    binding = await consumeSchwabOAuthState(state, browserBinding);
    if (!code || code.length > 4096) throw new SchwabOAuthStateError("OAuth authorization code is invalid");
    const tokens = await exchangeSchwabToken({ code });
    const access = encryptSchwabOAuthValue(tokens.accessToken);
    const refresh = encryptSchwabOAuthValue(tokens.refreshToken!);
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.execute(lifecycleLock(binding!.householdId));
      const [current] = await tx.select({
        lifecycleGeneration: schwabConnections.lifecycleGeneration,
      }).from(schwabConnections).where(eq(schwabConnections.householdId, binding!.householdId)).limit(1);
      if (current?.lifecycleGeneration !== binding!.lifecycleGeneration) {
        throw new SchwabOAuthStateError("OAuth attempt was invalidated by disconnect");
      }
      await tx.insert(schwabConnections).values({
        householdId: binding!.householdId, createdByUserId: binding!.actorUserId, status: "LIVE_CONNECTED",
        lifecycleGeneration: binding!.lifecycleGeneration,
        accessTokenCiphertext: access.ciphertext, accessTokenNonce: access.nonce, accessTokenAuthTag: access.authTag,
        refreshTokenCiphertext: refresh.ciphertext, refreshTokenNonce: refresh.nonce, refreshTokenAuthTag: refresh.authTag,
        accessTokenExpiresAt: new Date(now.getTime() + tokens.expiresIn * 1000),
        refreshTokenExpiresAt: tokens.refreshTokenExpiresIn ? new Date(now.getTime() + tokens.refreshTokenExpiresIn * 1000) : null,
        lastErrorCode: null, updatedAt: now,
      }).onConflictDoUpdate({ target: schwabConnections.householdId, set: {
        status: "LIVE_CONNECTED", accessTokenCiphertext: access.ciphertext, accessTokenNonce: access.nonce, accessTokenAuthTag: access.authTag,
        lifecycleGeneration: binding!.lifecycleGeneration,
        refreshTokenCiphertext: refresh.ciphertext, refreshTokenNonce: refresh.nonce, refreshTokenAuthTag: refresh.authTag,
        accessTokenExpiresAt: new Date(now.getTime() + tokens.expiresIn * 1000),
        refreshTokenExpiresAt: tokens.refreshTokenExpiresIn ? new Date(now.getTime() + tokens.refreshTokenExpiresIn * 1000) : null,
        lastErrorCode: null, updatedAt: now,
      } });
    });
    await audit(binding.householdId, binding.actorUserId, "schwab_oauth_callback_succeeded");
    res.setHeader("Set-Cookie", oauthCookie("", 0));
    res.redirect(303, "/integrations/schwab?oauth=connected");
  } catch (error) {
    if (binding) await audit(binding.householdId, binding.actorUserId, "schwab_oauth_callback_failed");
    res.setHeader("Set-Cookie", oauthCookie("", 0));
    res.redirect(303, `/integrations/schwab?oauth=${error instanceof SchwabOAuthConfigurationError ? "configuration_required" : "failed"}`);
  }
}));

router.post("/integrations/schwab/refresh", asyncRoute(async (_req, res) => {
  const actor = actorFrom(res); assertPermission(actor.role, "approve");
  const outcome = await db.transaction(async (tx) => {
    await tx.execute(lifecycleLock(actor.householdId));
    const [connection] = await tx.select().from(schwabConnections).where(and(eq(schwabConnections.householdId, actor.householdId), eq(schwabConnections.status, "LIVE_CONNECTED"))).limit(1);
    if (!connection?.refreshTokenCiphertext || !connection.refreshTokenNonce || !connection.refreshTokenAuthTag) return { status: 409 as const, code: "DISCONNECTED", connectionId: null };
    if (connection.refreshTokenExpiresAt && connection.refreshTokenExpiresAt <= new Date()) {
      await tx.update(schwabConnections).set({ status: "ERROR", lastErrorCode: "REFRESH_TOKEN_EXPIRED", updatedAt: new Date() }).where(eq(schwabConnections.id, connection.id));
      return { status: 409 as const, code: "REFRESH_TOKEN_EXPIRED", connectionId: connection.id };
    }
    try {
      const tokens = await exchangeSchwabToken({ refreshToken: decryptSchwabOAuthValue({ ciphertext: connection.refreshTokenCiphertext, nonce: connection.refreshTokenNonce, authTag: connection.refreshTokenAuthTag }) });
      const access = encryptSchwabOAuthValue(tokens.accessToken);
      const refresh = tokens.refreshToken ? encryptSchwabOAuthValue(tokens.refreshToken) : null;
      const now = new Date();
      await tx.update(schwabConnections).set({
        accessTokenCiphertext: access.ciphertext, accessTokenNonce: access.nonce, accessTokenAuthTag: access.authTag,
        ...(refresh ? { refreshTokenCiphertext: refresh.ciphertext, refreshTokenNonce: refresh.nonce, refreshTokenAuthTag: refresh.authTag } : {}),
        accessTokenExpiresAt: new Date(now.getTime() + tokens.expiresIn * 1000),
        refreshTokenExpiresAt: refresh && tokens.refreshTokenExpiresIn ? new Date(now.getTime() + tokens.refreshTokenExpiresIn * 1000) : connection.refreshTokenExpiresAt,
        status: "LIVE_CONNECTED", lastErrorCode: null, updatedAt: now,
      }).where(eq(schwabConnections.id, connection.id));
      return { status: 200 as const, code: "LIVE_CONNECTED", connectionId: connection.id };
    } catch {
      await tx.update(schwabConnections).set({ status: "ERROR", lastErrorCode: "TOKEN_REFRESH_FAILED", updatedAt: new Date() }).where(eq(schwabConnections.id, connection.id));
      return { status: 503 as const, code: "TOKEN_REFRESH_FAILED", connectionId: connection.id };
    }
  });
  if (outcome.status === 200) {
    await audit(actor.householdId, actor.userId, "schwab_token_refreshed", outcome.connectionId!);
    res.json({ status: "LIVE_CONNECTED", tokenHealth: "HEALTHY" });
  } else {
    if (outcome.connectionId) await audit(actor.householdId, actor.userId, "schwab_token_refresh_failed", outcome.connectionId);
    res.status(outcome.status).json({ code: outcome.code });
  }
}));

router.post("/integrations/schwab/sync", asyncRoute(async (_req, res) => {
  const actor = actorFrom(res); assertPermission(actor.role, "approve");
  const [connection] = await db.select().from(schwabConnections).where(eq(schwabConnections.householdId, actor.householdId)).limit(1);
  if (!connection?.accessTokenExpiresAt || connection.accessTokenExpiresAt <= new Date() || connection.status !== "LIVE_CONNECTED") { res.status(409).json({ code: "DISCONNECTED_OR_EXPIRED" }); return; }
  try {
    const window = observationWindow();
    const orderQuery = new URLSearchParams({ maxResults: "300", fromEnteredTime: window.from, toEnteredTime: window.to }).toString();
    const transactionQuery = new URLSearchParams({
      startDate: window.from,
      endDate: window.to,
      types: "TRADE,RECEIVE_AND_DELIVER,DIVIDEND_OR_INTEREST,ACH_RECEIPT,ACH_DISBURSEMENT,CASH_RECEIPT,CASH_DISBURSEMENT,ELECTRONIC_FUND,WIRE,ADVISOR_FEE,JOURNAL,MEMORANDUM,MARGIN_CALL,MONEY_MARKET,SMA_ADJUSTMENT",
    }).toString();
    const token = decryptSchwabOAuthValue({
      ciphertext: connection.accessTokenCiphertext!, nonce: connection.accessTokenNonce!, authTag: connection.accessTokenAuthTag!,
    });
    const references = await fetchSchwabObservation("/trader/v1/accounts/accountNumbers", token);
    const hashes = Array.isArray(references) ? references.filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && typeof r.hashValue === "string").map((r) => r.hashValue as string) : [];
    const accountPayloads = await Promise.all(hashes.map((hash) => fetchSchwabObservation(`/trader/v1/accounts/${encodeURIComponent(hash)}?fields=positions`, token)));
    const accounts = accountPayloads.flatMap((payload, index) => normalizeSchwabAccounts(actor.householdId, { ...((payload as Record<string, unknown>).securitiesAccount as Record<string, unknown>), hashValue: hashes[index] }));
    const positions = accountPayloads.flatMap((payload, index) => normalizeSchwabPositions(actor.householdId, hashes[index], (payload as Record<string, unknown>)?.securitiesAccount && ((payload as Record<string, unknown>).securitiesAccount as Record<string, unknown>).positions));
    const balances = accountPayloads.flatMap((payload, index) => normalizeSchwabBalances(hashes[index], ((payload as Record<string, unknown>)?.securitiesAccount as Record<string, unknown> | undefined)?.currentBalances));
    const orders = (await Promise.all(hashes.map((hash) => fetchSchwabObservation(`/trader/v1/accounts/${encodeURIComponent(hash)}/orders?${orderQuery}`, token)))).flatMap((payload, index) => normalizeSchwabOrders(hashes[index], payload));
    const transactions = (await Promise.all(hashes.map((hash) => fetchSchwabObservation(`/trader/v1/accounts/${encodeURIComponent(hash)}/transactions?${transactionQuery}`, token)))).flatMap((payload, index) => normalizeSchwabTransactions(hashes[index], payload));
    const symbols = [...new Set(positions.map((p) => p.symbol).filter((s) => s !== "UNKNOWN"))].slice(0, 500);
    const quotes = symbols.length ? normalizeSchwabQuotes(await fetchSchwabObservation(`/marketdata/v1/quotes?symbols=${encodeURIComponent(symbols.join(","))}`, token)) : [];
    const marketClock = normalizeSchwabMarketClock(await fetchSchwabObservation(`/marketdata/v1/markets?markets=equity&date=${window.date}`, token));
    const committed = await db.transaction(async (tx) => {
      await tx.execute(lifecycleLock(actor.householdId));
      const [current] = await tx.select().from(schwabConnections).where(eq(schwabConnections.householdId, actor.householdId)).limit(1);
      if (current?.id !== connection.id || current.status !== "LIVE_CONNECTED" || current.accessTokenCiphertext !== connection.accessTokenCiphertext || !current.accessTokenExpiresAt || current.accessTokenExpiresAt <= new Date()) return false;
      await tx.insert(schwabObservationSnapshots).values({ householdId: actor.householdId, connectionId: connection.id, accounts, balances, positions, orders, transactions, quotes, marketClock, counts: { accounts: accounts.length, balances: balances.length, positions: positions.length, orders: orders.length, transactions: transactions.length, quotes: quotes.length }, freshness: marketClock.dataFreshness });
      await tx.update(schwabConnections).set({ lastSuccessfulSyncAt: new Date(), updatedAt: new Date() }).where(eq(schwabConnections.id, connection.id));
      return true;
    });
    if (!committed) { res.status(409).json({ code: "CONNECTION_CHANGED" }); return; }
  } catch {
    const markedFailed = await db.transaction(async (tx) => {
      await tx.execute(lifecycleLock(actor.householdId));
      const [current] = await tx.select().from(schwabConnections).where(eq(schwabConnections.householdId, actor.householdId)).limit(1);
      if (current?.id !== connection.id || current.status !== "LIVE_CONNECTED" || current.accessTokenCiphertext !== connection.accessTokenCiphertext) return false;
      await tx.update(schwabConnections).set({ status: "ERROR", lastErrorCode: "OBSERVATION_SYNC_FAILED", updatedAt: new Date() }).where(eq(schwabConnections.id, connection.id));
      return true;
    });
    if (markedFailed) {
      await audit(actor.householdId, actor.userId, "schwab_sync_failed", connection.id);
      res.status(503).json({ code: "SYNC_FAILED" });
    } else {
      res.status(409).json({ code: "CONNECTION_CHANGED" });
    }
    return;
  }
  await audit(actor.householdId, actor.userId, "schwab_sync_succeeded", connection.id); res.json({ status: "SYNCED", dataMode: "LIVE_CONNECTED" });
}));

router.post("/integrations/schwab/disconnect", asyncRoute(async (_req, res) => {
  const actor = actorFrom(res); assertPermission(actor.role, "approve");
  await db.transaction(async (tx) => {
    await tx.execute(lifecycleLock(actor.householdId));
    const now = new Date();
    await tx.update(schwabOAuthStates).set({ consumedAt: now }).where(and(eq(schwabOAuthStates.householdId, actor.householdId), isNull(schwabOAuthStates.consumedAt)));
    await tx.insert(schwabConnections).values({
      householdId: actor.householdId,
      createdByUserId: actor.userId,
      status: "DISCONNECTED",
      lifecycleGeneration: randomUUID(),
      updatedAt: now,
    }).onConflictDoUpdate({
      target: schwabConnections.householdId,
      set: {
        status: "DISCONNECTED", accessTokenCiphertext: null, accessTokenNonce: null, accessTokenAuthTag: null,
        lifecycleGeneration: randomUUID(),
        refreshTokenCiphertext: null, refreshTokenNonce: null, refreshTokenAuthTag: null,
        accessTokenExpiresAt: null, refreshTokenExpiresAt: null, lastErrorCode: null, updatedAt: now,
      },
    });
  });
  await audit(actor.householdId, actor.userId, "schwab_disconnected"); res.json({ status: "DISCONNECTED", readOnly: true, tradingEnabled: false });
}));

export default router;