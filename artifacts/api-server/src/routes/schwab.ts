import { appendAuditEvent, appendAuditEvents } from "../services/audit";
import { Router, type IRouter } from "express";
import { randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { auditEvents, db, schwabConnections, schwabOAuthStates, schwabObservationSnapshots } from "@workspace/db";
import { brokerFreshness, normalizeSchwabAccounts, normalizeSchwabBalances, normalizeSchwabMarketClock, normalizeSchwabOrders, normalizeSchwabPositions, normalizeSchwabQuotes, normalizeSchwabTransactions } from "../adapters/broker-portfolio";
import { assertPermission } from "../domain/governance";
import { asyncRoute } from "../middleware/errors";
import { actorFrom } from "../middleware/request-context";
import { logger } from "../lib/logger";
import {
  consumeSchwabOAuthState, createSchwabOAuthState, decryptSchwabOAuthValue,
  encryptSchwabOAuthValue, exchangeSchwabToken, SchwabOAuthConfigurationError,
  SchwabOAuthStateError, schwabAuthorizationUrl, schwabCallbackUrl, fetchSchwabObservation,
} from "../services/schwab-oauth";
import { completeSchwabMarketDataOAuthCallback } from "../services/schwab-market-data-oauth";

const router: IRouter = Router();
const audit = async (householdId: string, actor: string, eventType: string, entityId = householdId) => {
  return appendAuditEvent({ householdId, actor, eventType, entity: "schwab_connection", entityId, metadata: { provider: "schwab", readOnly: true } });
};
const marketDataAudit = async (householdId: string, actor: string, eventType: string, entityId = householdId) => {
  return appendAuditEvent({ householdId, actor, eventType, entity: "schwab_market_data_connection", entityId, metadata: { provider: "schwab", product: "market_data_production", readOnly: true } });
};
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
  const marketDataBrowserBinding = cookieValue(req.headers.cookie, "__Host-capitalos_schwab_market_data_oauth");
  if (marketDataBrowserBinding) {
    let marketBinding: Awaited<ReturnType<typeof completeSchwabMarketDataOAuthCallback>> | undefined;
    try {
      marketBinding = await completeSchwabMarketDataOAuthCallback({ state, code, browserBinding: marketDataBrowserBinding });
      await marketDataAudit(marketBinding.householdId, marketBinding.actorUserId, "schwab_market_data_oauth_succeeded");
      res.setHeader("Set-Cookie", `__Host-capitalos_schwab_market_data_oauth=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
      res.redirect(303, "/integrations/schwab?market_data_oauth=connected");
    } catch (error) {
      if (marketBinding) await marketDataAudit(marketBinding.householdId, marketBinding.actorUserId, "schwab_market_data_oauth_failed");
      res.setHeader("Set-Cookie", `__Host-capitalos_schwab_market_data_oauth=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
      res.redirect(303, `/integrations/schwab?market_data_oauth=${error instanceof SchwabOAuthConfigurationError ? "configuration_required" : "failed"}`);
    }
    return;
  }
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
  let syncStage = "prepare";
  try {
    const window = observationWindow();
    const orderQuery = new URLSearchParams({ maxResults: "300", fromEnteredTime: window.from, toEnteredTime: window.to }).toString();
    const transactionQuery = new URLSearchParams({
      startDate: window.from,
      endDate: window.to,
      types: "TRADE,RECEIVE_AND_DELIVER,DIVIDEND_OR_INTEREST,ACH_RECEIPT,ACH_DISBURSEMENT,CASH_RECEIPT,CASH_DISBURSEMENT,ELECTRONIC_FUND,WIRE_OUT,WIRE_IN,JOURNAL,MEMORANDUM,MARGIN_CALL,MONEY_MARKET,SMA_ADJUSTMENT",
    }).toString();
    const token = decryptSchwabOAuthValue({
      ciphertext: connection.accessTokenCiphertext!, nonce: connection.accessTokenNonce!, authTag: connection.accessTokenAuthTag!,
    });
    syncStage = "account_references";
    const references = await fetchSchwabObservation("/trader/v1/accounts/accountNumbers", token);
    const hashes = Array.isArray(references) ? references.filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && typeof r.hashValue === "string").map((r) => r.hashValue as string) : [];
    syncStage = "positions";
    const accountPayloads = await Promise.all(hashes.map((hash) => fetchSchwabObservation(`/trader/v1/accounts/${encodeURIComponent(hash)}?fields=positions`, token)));
    const accounts = accountPayloads.flatMap((payload, index) => normalizeSchwabAccounts(actor.householdId, { ...((payload as Record<string, unknown>).securitiesAccount as Record<string, unknown>), hashValue: hashes[index] }));
    const positions = accountPayloads.flatMap((payload, index) => normalizeSchwabPositions(actor.householdId, hashes[index], (payload as Record<string, unknown>)?.securitiesAccount && ((payload as Record<string, unknown>).securitiesAccount as Record<string, unknown>).positions));
    const balances = accountPayloads.flatMap((payload, index) => normalizeSchwabBalances(hashes[index], ((payload as Record<string, unknown>)?.securitiesAccount as Record<string, unknown> | undefined)?.currentBalances));
    const orderPayloads = await Promise.allSettled(hashes.map((hash) => fetchSchwabObservation(`/trader/v1/accounts/${encodeURIComponent(hash)}/orders?${orderQuery}`, token)));
    const orders = orderPayloads.flatMap((result, index) => result.status === "fulfilled" ? normalizeSchwabOrders(hashes[index], result.value) : []);
    const transactionPayloads = await Promise.allSettled(hashes.map((hash) => fetchSchwabObservation(`/trader/v1/accounts/${encodeURIComponent(hash)}/transactions?${transactionQuery}`, token)));
    const transactions = transactionPayloads.flatMap((result, index) => result.status === "fulfilled" ? normalizeSchwabTransactions(hashes[index], result.value) : []);
    const symbols = [...new Set(positions.map((p) => p.symbol).filter((s) => s !== "UNKNOWN"))].slice(0, 500);
    const [quoteResult, marketClockResult] = await Promise.allSettled([
      symbols.length ? fetchSchwabObservation(`/marketdata/v1/quotes?symbols=${encodeURIComponent(symbols.join(","))}`, token) : Promise.resolve([]),
      fetchSchwabObservation(`/marketdata/v1/markets?markets=equity&date=${window.date}`, token),
    ]);
    const quotes = quoteResult.status === "fulfilled" ? normalizeSchwabQuotes(quoteResult.value) : [];
    const marketClock = marketClockResult.status === "fulfilled"
      ? normalizeSchwabMarketClock(marketClockResult.value)
      : { dataFreshness: "UNKNOWN" as const };
    syncStage = "persist";
    const committed = await db.transaction(async (tx) => {
      await tx.execute(lifecycleLock(actor.householdId));
      const [current] = await tx.select().from(schwabConnections).where(eq(schwabConnections.householdId, actor.householdId)).limit(1);
      if (current?.id !== connection.id || current.status !== "LIVE_CONNECTED" || current.accessTokenCiphertext !== connection.accessTokenCiphertext || !current.accessTokenExpiresAt || current.accessTokenExpiresAt <= new Date()) return false;
      await tx.insert(schwabObservationSnapshots).values({ householdId: actor.householdId, connectionId: connection.id, accounts, balances, positions, orders, transactions, quotes, marketClock, counts: { accounts: accounts.length, balances: balances.length, positions: positions.length, orders: orders.length, transactions: transactions.length, quotes: quotes.length }, freshness: "CURRENT" });
      await tx.update(schwabConnections).set({ lastSuccessfulSyncAt: new Date(), updatedAt: new Date() }).where(eq(schwabConnections.id, connection.id));
      return true;
    });
    if (!committed) { res.status(409).json({ code: "CONNECTION_CHANGED" }); return; }
  } catch (error) {
    logger.warn({
      syncStage,
      errorType: error instanceof Error ? error.name : "UnknownError",
    }, "Schwab observation sync failed");
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

router.get("/integrations/schwab/observations/latest", asyncRoute(async (_req, res) => {
  const actor = actorFrom(res);
  const [connection] = await db.select().from(schwabConnections).where(eq(schwabConnections.householdId, actor.householdId)).limit(1);
  const [snapshot] = await db.select().from(schwabObservationSnapshots)
    .where(eq(schwabObservationSnapshots.householdId, actor.householdId))
    .orderBy(desc(schwabObservationSnapshots.createdAt), desc(schwabObservationSnapshots.id))
    .limit(1);
  const healthy = !!connection && connection.status === "LIVE_CONNECTED" && !!connection.accessTokenExpiresAt && connection.accessTokenExpiresAt > new Date();
  const status = !configured()
    ? "CONFIGURATION_REQUIRED"
    : connection?.status === "ERROR"
      ? "ERROR"
      : healthy
        ? "LIVE_CONNECTED"
        : "DISCONNECTED";
  const numberOrNull = (value: unknown) => {
    const parsed = typeof value === "string" || typeof value === "number" ? Number(value) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : null;
  };
  const snapshotFreshness = snapshot
    ? brokerFreshness(snapshot.createdAt.toISOString(), snapshot.createdAt.toISOString())
    : "UNKNOWN";
  const accountRecords = (snapshot?.accounts ?? []).filter((account): account is Record<string, unknown> => !!account && typeof account === "object");
  const balanceRecords = (snapshot?.balances ?? []).filter((balance): balance is Record<string, unknown> => !!balance && typeof balance === "object");
  const positionRecords = (snapshot?.positions ?? []).filter((position): position is Record<string, unknown> => !!position && typeof position === "object");
  const investedMarketValue = positionRecords.reduce((total, position) => total + (numberOrNull(position.marketValue) ?? 0), 0);
  const brokerageCash = balanceRecords.reduce((total, balance) => total + (numberOrNull(balance.cashBalance) ?? 0), 0);
  const providerAccountValue = accountRecords.reduce((total, account) => total + (numberOrNull(account.totalValue) ?? 0), 0);
  const calculatedAccountValue = investedMarketValue + brokerageCash;
  const totalAccountValue = providerAccountValue > 0 ? providerAccountValue : calculatedAccountValue;
  const unrealizedGainLoss = positionRecords.reduce((total, position) => total + (numberOrNull(position.unrealizedGainLoss) ?? 0), 0);
  const dayChange = positionRecords.reduce((total, position) => total + (numberOrNull(position.dayChange) ?? 0), 0);
  const costBasis = positionRecords.reduce((total, position) => total + (numberOrNull(position.costBasis) ?? 0), 0);
  const redactPosition = (position: Record<string, unknown>) => ({
    symbol: String(position.symbol ?? "UNKNOWN"),
    assetType: String(position.assetType ?? "UNKNOWN"),
    quantity: String(position.quantity ?? "UNKNOWN"),
    averageCost: String(position.averageCost ?? "UNKNOWN"),
    costBasis: String(position.costBasis ?? "UNKNOWN"),
    marketPrice: String(position.marketPrice ?? "UNKNOWN"),
    marketValue: String(position.marketValue ?? "UNKNOWN"),
    dayChange: String(position.dayChange ?? "UNKNOWN"),
    dayChangePercent: String(position.dayChangePercent ?? "UNKNOWN"),
    unrealizedGainLoss: String(position.unrealizedGainLoss ?? "UNKNOWN"),
    realizedGainLoss: String(position.realizedGainLoss ?? "UNKNOWN"),
    portfolioWeight: String(position.portfolioWeight ?? "UNKNOWN"),
    providerTimestamp: typeof position.providerTimestamp === "string" ? position.providerTimestamp : null,
    receivedAt: String(position.receivedAt ?? snapshot?.createdAt.toISOString() ?? new Date().toISOString()),
    dataFreshness: position.dataFreshness === "UNKNOWN" ? snapshotFreshness : String(position.dataFreshness ?? snapshotFreshness),
    freshnessBasis: position.providerTimestamp ? "PROVIDER_TIMESTAMP" : snapshot ? "SNAPSHOT_RECEIVED" : "UNKNOWN",
  });
  const redactOrder = (order: Record<string, unknown>) => ({
    symbol: String(order.symbol ?? "UNKNOWN"),
    side: String(order.side ?? "UNKNOWN"),
    orderType: String(order.orderType ?? "UNKNOWN"),
    quantity: String(order.quantity ?? "UNKNOWN"),
    status: String(order.status ?? "UNKNOWN"),
    submittedAt: typeof order.submittedAt === "string" ? order.submittedAt : null,
    filledAt: typeof order.filledAt === "string" ? order.filledAt : null,
    filledQuantity: String(order.filledQuantity ?? "UNKNOWN"),
    averageFillPrice: String(order.averageFillPrice ?? "UNKNOWN"),
    providerTimestamp: typeof order.providerTimestamp === "string" ? order.providerTimestamp : null,
    receivedAt: String(order.receivedAt ?? snapshot?.createdAt.toISOString() ?? new Date().toISOString()),
    dataFreshness: String(order.dataFreshness ?? snapshot?.freshness ?? "UNKNOWN"),
  });
  const redactTransaction = (transaction: Record<string, unknown>) => ({
    symbol: typeof transaction.symbol === "string" ? transaction.symbol : null,
    transactionClass: String(transaction.transactionClass ?? "unknown"),
    eventType: String(transaction.eventType ?? "UNKNOWN"),
    currency: typeof transaction.currency === "string" ? transaction.currency : null,
    amount: String(transaction.amount ?? "UNKNOWN"),
    quantity: String(transaction.quantity ?? "UNKNOWN"),
    description: String(transaction.description ?? "No description supplied"),
    transactionTimestamp: typeof transaction.transactionTimestamp === "string" ? transaction.transactionTimestamp : null,
    providerTimestamp: typeof transaction.providerTimestamp === "string" ? transaction.providerTimestamp : null,
    receivedAt: String(transaction.receivedAt ?? snapshot?.createdAt.toISOString() ?? new Date().toISOString()),
    dataFreshness: transaction.dataFreshness === "UNKNOWN" ? snapshotFreshness : String(transaction.dataFreshness ?? snapshotFreshness),
    freshnessBasis: transaction.providerTimestamp ? "PROVIDER_TIMESTAMP" : snapshot ? "SNAPSHOT_RECEIVED" : "UNKNOWN",
  });
  res.json({
    status,
    dataMode: healthy ? "LIVE_CONNECTED" : "DISCONNECTED",
    readOnly: true,
    tradingEnabled: false,
    lastSuccessfulSyncAt: connection?.lastSuccessfulSyncAt?.toISOString() ?? null,
    snapshot: snapshot ? {
      capturedAt: snapshot.createdAt.toISOString(),
      freshness: snapshotFreshness,
      freshnessBasis: "SNAPSHOT_RECEIVED",
      summary: {
        totalAccountValue: totalAccountValue.toFixed(8),
        investedMarketValue: investedMarketValue.toFixed(8),
        brokerageCash: brokerageCash.toFixed(8),
        costBasis: costBasis.toFixed(8),
        unrealizedGainLoss: unrealizedGainLoss.toFixed(8),
        dayChange: dayChange.toFixed(8),
        reconciliationDelta: (totalAccountValue - calculatedAccountValue).toFixed(8),
        reconciled: Math.abs(totalAccountValue - calculatedAccountValue) < 0.01,
      },
      counts: snapshot.counts ?? {},
      positions: (snapshot.positions ?? []).slice(0, 500).map((position) => redactPosition(position)),
      orders: (snapshot.orders ?? []).slice(0, 300).map((order) => redactOrder(order)),
      transactions: (snapshot.transactions ?? []).slice(0, 300).map((transaction) => redactTransaction(transaction)),
    } : null,
  });
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