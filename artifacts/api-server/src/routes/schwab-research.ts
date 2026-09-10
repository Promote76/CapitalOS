import { and, eq } from "drizzle-orm";
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
  normalizeQuote,
  normalizeResearchSymbol,
  requestSchwabResearch,
  researchEnvelope,
  SchwabResearchError,
  type SchwabResearchCapability,
} from "../services/schwab-research-adapter";

const router: IRouter = Router();

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
  await db.insert(auditEvents).values({
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

export default router;