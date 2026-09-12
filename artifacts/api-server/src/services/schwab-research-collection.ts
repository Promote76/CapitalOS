import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, schwabMarketDataConnections } from "@workspace/db";
import type { Actor } from "./capital-os";
import { decryptSchwabOAuthValue } from "./schwab-oauth";
import {
  buildSchwabResearchPath,
  normalizeDailyRange,
  normalizeInstrument,
  normalizeMarketDate,
  normalizePriceHistory,
  normalizeQuote,
  normalizeResearchSymbol,
  requestSchwabResearch,
  researchFreshness,
  SchwabResearchError,
} from "./schwab-research-adapter";
import { createSchwabMarketSnapshot } from "./research-dossier";

function collectNullPaths(value: unknown, prefix: string): string[] {
  if (value === null) return [prefix];
  if (Array.isArray(value)) return value.flatMap((item, index) => collectNullPaths(item, `${prefix}[${index}]`));
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, child]) => collectNullPaths(child, `${prefix}.${key}`));
}

export async function collectSchwabMarketSnapshotDraft(
  actor: Actor,
  input: { ticker: string; startDate?: string; endDate?: string },
) {
  const symbol = normalizeResearchSymbol(input.ticker);
  const endDate = input.endDate ?? String(Date.now());
  const startDate = input.startDate ?? String(Number(endDate) - 90 * 24 * 60 * 60 * 1000);
  const range = normalizeDailyRange(startDate, endDate);
  const [connection] = await db.select().from(schwabMarketDataConnections)
    .where(eq(schwabMarketDataConnections.householdId, actor.householdId))
    .limit(1);
  if (!connection || connection.status !== "LIVE_CONNECTED") {
    throw new SchwabResearchError("MARKET_DATA_DISCONNECTED", 409, "Schwab Market Data is disconnected");
  }
  if (!connection.accessTokenExpiresAt || connection.accessTokenExpiresAt <= new Date()) {
    throw new SchwabResearchError("TOKEN_REFRESH_REQUIRED", 409, "Schwab access token must be refreshed");
  }
  if (!connection.accessTokenCiphertext || !connection.accessTokenNonce || !connection.accessTokenAuthTag) {
    throw new SchwabResearchError("MARKET_DATA_DISCONNECTED", 409, "Schwab Market Data authorization is unavailable");
  }
  const token = decryptSchwabOAuthValue({
    ciphertext: connection.accessTokenCiphertext,
    nonce: connection.accessTokenNonce,
    authTag: connection.accessTokenAuthTag,
  });
  const calls = await Promise.all((["INSTRUMENT_FUNDAMENTAL", "CURRENT_QUOTE", "DAILY_PRICE_HISTORY"] as const).map(async (capability) => {
    const path = buildSchwabResearchPath(capability, symbol, capability === "DAILY_PRICE_HISTORY" ? range : undefined);
    const provider = await requestSchwabResearch(path, token);
    const normalized = capability === "INSTRUMENT_FUNDAMENTAL"
      ? normalizeInstrument(provider.payload, symbol)
      : capability === "CURRENT_QUOTE"
        ? normalizeQuote(provider.payload, symbol)
        : normalizePriceHistory(provider.payload, symbol, range);
    return { capability, path, provider, normalized };
  }));
  const instrument = calls[0]!.normalized as ReturnType<typeof normalizeInstrument>;
  const quote = calls[1]!.normalized as ReturnType<typeof normalizeQuote>;
  const history = calls[2]!.normalized as ReturnType<typeof normalizePriceHistory>;
  const capabilities = calls.map((call) => ({
    capability: call.capability,
    data: call.normalized.data,
    requestedAt: call.provider.requestedAt,
    receivedAt: call.provider.receivedAt,
    providerAsOf: call.normalized.providerAsOf,
    freshness: researchFreshness(call.normalized.providerAsOf, call.provider.receivedAt, call.normalized.realtime, call.normalized.delayed),
    realtime: call.normalized.realtime,
    delayed: call.normalized.delayed,
    providerRequestId: call.provider.headers.providerRequestId,
    rateLimit: call.provider.headers,
    payloadSha256: createHash("sha256").update(JSON.stringify(call.provider.payload)).digest("hex"),
  }));
  const missingFlags = capabilities.flatMap((item) => collectNullPaths(item.data, item.capability));
  const qualityFlags = new Set<string>();
  if (!instrument.providerAsOf) qualityFlags.add("FUNDAMENTAL_AS_OF_UNKNOWN");
  if (quote.delayed === null) qualityFlags.add("DELAY_STATUS_UNKNOWN");
  for (const item of capabilities) {
    if (collectNullPaths(item.data, item.capability).length > 0) qualityFlags.add(`PARTIAL_${item.capability}`);
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
    ticker: symbol,
    capabilities,
    instrument: instrument.data,
    quote: quote.data,
    dailyHistory: history.data,
    readOnly: true,
    tradingEnabled: false,
    executionAuthority: "none",
    noTradingOrMoneyMovement: true,
  };
  return createSchwabMarketSnapshot(actor, {
    ticker: symbol,
    content: envelope,
    requestedAt: calls.map((call) => call.provider.requestedAt).sort()[0]!,
    retrievedAt,
    providerAsOf: quote.providerAsOf ?? instrument.providerAsOf ?? history.providerAsOf,
    marketDate: normalizeMarketDate(history),
    realtime: quote.realtime,
    delayed: quote.delayed,
    freshness,
    missingFlags,
    qualityFlags: [...qualityFlags],
    provenance: {
      provider: "schwab",
      providerProduct: "MARKET_DATA_PRODUCTION",
      capabilities: calls.map((call) => call.capability),
      retrievedAt,
      requests: calls.map((call) => ({
        capability: call.capability,
        endpoint: new URL(call.path, "https://provider.invalid").pathname,
        requestedAt: call.provider.requestedAt,
        providerRequestId: call.provider.headers.providerRequestId,
        rateLimit: call.provider.headers,
        payloadSha256: createHash("sha256").update(JSON.stringify(call.provider.payload)).digest("hex"),
      })),
    },
  });
}