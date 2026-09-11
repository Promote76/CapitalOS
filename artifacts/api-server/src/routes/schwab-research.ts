import { appendAuditEvent, appendAuditEvents } from "../services/audit";
import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { Router, type IRouter } from "express";
import { auditEvents, db, schwabMarketDataConnections } from "@workspace/db";
import { assertPermission } from "../domain/governance";
import { asyncRoute } from "../middleware/errors";
import { actorFrom } from "../middleware/request-context";
import { decryptSchwabOAuthValue } from "../services/schwab-oauth";
import {
  buildSchwabResearchPath,
  normalizeDailyRange,
  normalizeInstrument,
  normalizePriceHistory,
  normalizeMarketDate,
  normalizeQuote,
  normalizeResearchSymbol,
  requestSchwabResearch,
  researchEnvelope,
  researchFreshness,
  SchwabResearchError,
  type SchwabResearchCapability,
} from "../services/schwab-research-adapter";
import {
  getLatestSchwabResearchCertification,
  runSchwabResearchCertification,
} from "../services/schwab-research-certification";
import { createSchwabMarketSnapshot, listSchwabMarketSnapshots, reviewSchwabMarketSnapshot } from "../services/research-dossier";
import { CreateMarketSnapshotBody, ReviewMarketSnapshotBody } from "@workspace/api-zod";

const router: IRouter = Router();

function collectNullPaths(value: unknown, prefix: string): string[] {
  if (value === null) return [prefix];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectNullPaths(item, `${prefix}[${index}]`));
  }
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, child]) => collectNullPaths(child, `${prefix}.${key}`));
}

router.post("/research/schwab/market-snapshots", asyncRoute(async (req, res) => {
  const actor = actorFrom(res);
  assertPermission(actor.role, "contribute");
  const body = CreateMarketSnapshotBody.parse(req.body);
  const symbol = normalizeResearchSymbol(body.ticker);
  const range = normalizeDailyRange(body.startDate, body.endDate);
  const [connection] = await db.select().from(schwabMarketDataConnections).where(eq(schwabMarketDataConnections.householdId, actor.householdId)).limit(1);
  if (!connection || connection.status !== "LIVE_CONNECTED") throw new SchwabResearchError("MARKET_DATA_DISCONNECTED", 409, "Schwab Market Data is disconnected");
  if (!connection.accessTokenExpiresAt || connection.accessTokenExpiresAt <= new Date()) throw new SchwabResearchError("TOKEN_REFRESH_REQUIRED", 409, "Schwab access token must be refreshed");
  if (!connection.accessTokenCiphertext || !connection.accessTokenNonce || !connection.accessTokenAuthTag) throw new SchwabResearchError("MARKET_DATA_DISCONNECTED", 409, "Schwab Market Data authorization is unavailable");
  const token = decryptSchwabOAuthValue({ ciphertext: connection.accessTokenCiphertext, nonce: connection.accessTokenNonce, authTag: connection.accessTokenAuthTag });
  const calls = await Promise.all((["INSTRUMENT_FUNDAMENTAL", "CURRENT_QUOTE", "DAILY_PRICE_HISTORY"] as const).map(async (capability) => {
    const path = buildSchwabResearchPath(capability, symbol, capability === "DAILY_PRICE_HISTORY" ? range : undefined);
    const provider = await requestSchwabResearch(path, token);
    const normalized = capability === "INSTRUMENT_FUNDAMENTAL" ? normalizeInstrument(provider.payload, symbol) : capability === "CURRENT_QUOTE" ? normalizeQuote(provider.payload, symbol) : normalizePriceHistory(provider.payload, symbol, range);
    return { capability, path, provider, normalized };
  }));
  const instrument = calls[0]!.normalized; const quote = calls[1]!.normalized; const history = calls[2]!.normalized;
  const capabilities = calls.map((c) => ({
      capability: c.capability, data: c.normalized.data, requestedAt: c.provider.requestedAt,
      receivedAt: c.provider.receivedAt, providerAsOf: c.normalized.providerAsOf,
      freshness: researchFreshness(c.normalized.providerAsOf, c.provider.receivedAt, c.normalized.realtime, c.normalized.delayed),
      realtime: c.normalized.realtime, delayed: c.normalized.delayed,
      providerRequestId: c.provider.headers.providerRequestId,
      rateLimit: c.provider.headers,
      payloadSha256: createHash("sha256").update(JSON.stringify(c.provider.payload)).digest("hex"),
    }));
  const missingFlags = capabilities.flatMap((item) =>
    collectNullPaths(item.data, item.capability),
  );
  const qualityFlags = new Set<string>();
  if (!instrument.providerAsOf) qualityFlags.add("FUNDAMENTAL_AS_OF_UNKNOWN");
  if (quote.delayed === null) qualityFlags.add("DELAY_STATUS_UNKNOWN");
  for (const item of capabilities) {
    if (collectNullPaths(item.data, item.capability).length > 0) {
      qualityFlags.add(`PARTIAL_${item.capability}`);
    }
    if (item.freshness === "UNKNOWN") qualityFlags.add(`UNKNOWN_FRESHNESS_${item.capability}`);
    if (item.freshness === "AGING") qualityFlags.add(`AGING_${item.capability}`);
    if (item.freshness === "STALE") qualityFlags.add(`STALE_${item.capability}`);
    if (item.freshness === "DELAYED") qualityFlags.add(`DELAYED_${item.capability}`);
  }
  const retrievedAt = calls.map((call) => call.provider.receivedAt).sort().at(-1)!;
  const readAt = new Date(retrievedAt);
  const connectionStillCurrent = await db.update(schwabMarketDataConnections).set({
    lastSuccessfulReadAt: readAt,
    lastErrorCode: null,
    updatedAt: readAt,
  }).where(and(
    eq(schwabMarketDataConnections.id, connection.id),
    eq(schwabMarketDataConnections.householdId, actor.householdId),
    eq(schwabMarketDataConnections.status, "LIVE_CONNECTED"),
    eq(schwabMarketDataConnections.lifecycleGeneration, connection.lifecycleGeneration),
    eq(schwabMarketDataConnections.accessTokenCiphertext, connection.accessTokenCiphertext),
  )).returning({ id: schwabMarketDataConnections.id });
  if (!connectionStillCurrent.length) {
    throw new SchwabResearchError("CONNECTION_CHANGED", 409, "Schwab Market Data connection changed during snapshot retrieval");
  }
  const freshness = capabilities.some((item) => item.freshness === "UNKNOWN") ? "UNKNOWN"
    : capabilities.some((item) => item.freshness === "STALE") ? "STALE"
      : capabilities.some((item) => item.freshness === "DELAYED") ? "DELAYED"
        : capabilities.some((item) => item.freshness === "AGING") ? "AGING"
          : capabilities.some((item) => item.freshness === "REALTIME") ? "REALTIME"
            : "CURRENT";
  const envelope = {
    ticker: symbol, capabilities,
    instrument: instrument.data, quote: quote.data, dailyHistory: history.data,
    readOnly: true, tradingEnabled: false, executionAuthority: "none", noTradingOrMoneyMovement: true,
  };
  const snapshot = await createSchwabMarketSnapshot(actor, {
    ticker: symbol, content: envelope, requestedAt: calls.map((c) => c.provider.requestedAt).sort()[0]!, retrievedAt,
    providerAsOf: quote.providerAsOf ?? instrument.providerAsOf ?? history.providerAsOf, marketDate: normalizeMarketDate(history as ReturnType<typeof normalizePriceHistory>),
    realtime: quote.realtime, delayed: quote.delayed, freshness,
    missingFlags, qualityFlags: [...qualityFlags],
    provenance: { provider: "schwab", providerProduct: "MARKET_DATA_PRODUCTION", capabilities: calls.map((c) => c.capability), retrievedAt, requests: calls.map((c) => ({ capability: c.capability, endpoint: new URL(c.path, "https://provider.invalid").pathname, requestedAt: c.provider.requestedAt, providerRequestId: c.provider.headers.providerRequestId, payloadSha256: createHash("sha256").update(JSON.stringify(c.provider.payload)).digest("hex") })) },
  });
  res.status(201).json(snapshot);
}));

router.post("/research/schwab/market-snapshots/:snapshotId/review", asyncRoute(async (req, res) => {
  const actor = actorFrom(res); assertPermission(actor.role, "approve");
  const body = ReviewMarketSnapshotBody.parse(req.body);
  res.json(await reviewSchwabMarketSnapshot(actor, String(req.params.snapshotId), body.disposition, body.reason));
}));

router.get("/research/schwab/market-snapshots", asyncRoute(async (_req, res) => {
  const actor = actorFrom(res); assertPermission(actor.role, "read");
  res.json(await listSchwabMarketSnapshots(actor));
}));

const handle = (capability: SchwabResearchCapability) => asyncRoute(async (req, res) => {
  const actor = actorFrom(res);
  assertPermission(actor.role, "read");
  const symbol = normalizeResearchSymbol(req.params.symbol ?? req.query.symbol);
  if (capability === "INSTRUMENT_FUNDAMENTAL" && req.query.projection !== "fundamental") {
    throw new SchwabResearchError("INVALID_RESEARCH_REQUEST", 400, "Instrument projection must be fundamental");
  }
  const range = capability === "DAILY_PRICE_HISTORY"
    ? normalizeDailyRange(req.query.startDate, req.query.endDate)
    : undefined;
  const [connection] = await db.select().from(schwabMarketDataConnections)
    .where(eq(schwabMarketDataConnections.householdId, actor.householdId)).limit(1);
  if (!connection || connection.status !== "LIVE_CONNECTED") {
    throw new SchwabResearchError("MARKET_DATA_DISCONNECTED", 409, "Schwab Market Data is disconnected");
  }
  if (!connection.accessTokenExpiresAt || connection.accessTokenExpiresAt <= new Date()) {
    throw new SchwabResearchError("TOKEN_REFRESH_REQUIRED", 409, "Schwab access token must be refreshed");
  }
  if (!connection.accessTokenCiphertext || !connection.accessTokenNonce || !connection.accessTokenAuthTag) {
    throw new SchwabResearchError("MARKET_DATA_DISCONNECTED", 409, "Schwab Market Data authorization is unavailable");
  }
  const path = buildSchwabResearchPath(capability, symbol, range);
  const provider = await requestSchwabResearch(path, decryptSchwabOAuthValue({
    ciphertext: connection.accessTokenCiphertext,
    nonce: connection.accessTokenNonce,
    authTag: connection.accessTokenAuthTag,
  }));
  const normalized = capability === "INSTRUMENT_FUNDAMENTAL"
    ? normalizeInstrument(provider.payload, symbol)
    : capability === "CURRENT_QUOTE"
      ? normalizeQuote(provider.payload, symbol)
      : normalizePriceHistory(provider.payload, symbol, range!);
  const now = new Date();
  const updated = await db.update(schwabMarketDataConnections).set({
    lastSuccessfulReadAt: now,
    lastErrorCode: null,
    updatedAt: now,
  }).where(and(
    eq(schwabMarketDataConnections.id, connection.id),
    eq(schwabMarketDataConnections.householdId, actor.householdId),
    eq(schwabMarketDataConnections.status, "LIVE_CONNECTED"),
    eq(schwabMarketDataConnections.lifecycleGeneration, connection.lifecycleGeneration),
    eq(schwabMarketDataConnections.accessTokenCiphertext, connection.accessTokenCiphertext),
  )).returning({ id: schwabMarketDataConnections.id });
  if (!updated.length) throw new SchwabResearchError("CONNECTION_CHANGED", 409, "Schwab Market Data connection changed during research retrieval");
  await appendAuditEvent({
    householdId: actor.householdId,
    actor: actor.userId,
    eventType: "schwab_research_read",
    entity: "schwab_research",
    entityId: actor.householdId,
    metadata: { provider: "schwab", product: "market_data_production", capability, symbol, readOnly: true, tradingEnabled: false },
  });
  res.json(researchEnvelope<unknown>(capability, symbol, path, provider, normalized));
});

router.get("/research/schwab/instruments", handle("INSTRUMENT_FUNDAMENTAL"));
router.get("/research/schwab/quotes/:symbol", handle("CURRENT_QUOTE"));
router.get("/research/schwab/price-history", handle("DAILY_PRICE_HISTORY"));

router.get("/research/schwab/certification", asyncRoute(async (_req, res) => {
  const actor = actorFrom(res);
  assertPermission(actor.role, "read");
  res.json({ certification: await getLatestSchwabResearchCertification(actor) });
}));

router.post("/research/schwab/certification", asyncRoute(async (_req, res) => {
  const actor = actorFrom(res);
  assertPermission(actor.role, "read");
  res.json(await runSchwabResearchCertification(actor));
}));

export default router;