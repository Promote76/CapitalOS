import { desc, eq } from "drizzle-orm";
import {
  auditEvents,
  db,
  schwabMarketDataConnections,
  schwabResearchCertifications,
} from "@workspace/db";
import type { Actor } from "./capital-os";
import {
  buildSchwabResearchPath,
  normalizeInstrument,
  normalizePriceHistory,
  normalizeQuote,
  requestSchwabResearch,
  researchFreshness,
  SchwabResearchError,
  type SchwabResearchCapability,
  type SchwabResearchSafeHeaders,
} from "./schwab-research-adapter";
import { decryptSchwabOAuthValue } from "./schwab-oauth";

const SYMBOL = "BKSC";
const RANGE_MS = 30 * 86_400_000;

type CapabilityStatus = "CONFIRMED" | "PENDING_PROVIDER_CONFIRMATION";

type CapabilityResult = {
  capability: SchwabResearchCapability;
  status: CapabilityStatus;
  providerHttpStatus: number | null;
  providerRequestId: string | null;
  realtime: boolean | null;
  delayed: boolean | null;
  freshness: string | null;
  fieldInventory: string[];
  nullFields: string[];
  candlesReturned: number | null;
  candleDateRange: { start: string; end: string } | null;
  entitlementError: boolean;
  tokenRefreshRequired: boolean;
  errorCode: string | null;
  rateLimit: SchwabResearchSafeHeaders;
};

export type SchwabResearchCertificationRecord = {
  id: string;
  symbol: string;
  result: "PASS" | "BLOCKED";
  requestedAt: string;
  completedAt: string;
  providerGetCount: number;
  capabilities: CapabilityResult[];
  readOnly: true;
  tradingEnabled: false;
  executionAuthority: "none";
  noTradingOrMoneyMovement: true;
  createdAt: string;
};

function emptyHeaders(): SchwabResearchSafeHeaders {
  return {
    providerRequestId: null,
    limit: null,
    remaining: null,
    resetAt: null,
    retryAfterSeconds: null,
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function fieldInventory(value: unknown, prefix = "data"): string[] {
  if (value === null) return [`${prefix}:null`];
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${prefix}:array`];
    return [`${prefix}:array`, ...fieldInventory(value[0], `${prefix}[]`)];
  }
  if (!value || typeof value !== "object") return [`${prefix}:${typeof value}`];
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .flatMap((key) => fieldInventory((value as Record<string, unknown>)[key], `${prefix}.${key}`));
}

function nullFields(value: unknown, prefix = "data"): string[] {
  if (value === null) return [prefix];
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((item, index) => nullFields(item, `${prefix}[${index}]`));
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, child]) => nullFields(child, `${prefix}.${key}`));
}

function errorDetails(error: unknown) {
  if (!(error instanceof SchwabResearchError)) {
    return {
      code: "PROVIDER_UNAVAILABLE",
      providerHttpStatus: null,
      providerRequestId: null,
      rateLimit: emptyHeaders(),
    };
  }
  const metadata = error.metadata;
  const safeHeaders = record(metadata.providerSafeHeaders);
  const rateLimit: SchwabResearchSafeHeaders = {
    providerRequestId: typeof safeHeaders?.providerRequestId === "string" ? safeHeaders.providerRequestId : null,
    limit: typeof safeHeaders?.limit === "number" ? safeHeaders.limit : null,
    remaining: typeof safeHeaders?.remaining === "number" ? safeHeaders.remaining : null,
    resetAt: typeof safeHeaders?.resetAt === "string" ? safeHeaders.resetAt : null,
    retryAfterSeconds: typeof safeHeaders?.retryAfterSeconds === "number" ? safeHeaders.retryAfterSeconds : null,
  };
  return {
    code: error.code,
    providerHttpStatus: typeof metadata.providerStatus === "number" ? metadata.providerStatus : null,
    providerRequestId: rateLimit.providerRequestId,
    rateLimit,
  };
}

function blockedCapability(
  capability: SchwabResearchCapability,
  code: string,
  providerHttpStatus: number | null = null,
  providerRequestId: string | null = null,
  rateLimit = emptyHeaders(),
): CapabilityResult {
  return {
    capability,
    status: "PENDING_PROVIDER_CONFIRMATION",
    providerHttpStatus,
    providerRequestId,
    realtime: null,
    delayed: null,
    freshness: null,
    fieldInventory: [],
    nullFields: [],
    candlesReturned: null,
    candleDateRange: null,
    entitlementError: code === "PROVIDER_ENTITLEMENT_REQUIRED",
    tokenRefreshRequired: code === "TOKEN_REFRESH_REQUIRED",
    errorCode: code,
    rateLimit,
  };
}

async function runCapability(
  capability: SchwabResearchCapability,
  token: string,
  startDate: number,
  endDate: number,
): Promise<CapabilityResult> {
  const path = buildSchwabResearchPath(
    capability,
    SYMBOL,
    capability === "DAILY_PRICE_HISTORY" ? { startDate, endDate } : undefined,
  );
  try {
    const provider = await requestSchwabResearch(path, token);
    const normalized = capability === "INSTRUMENT_FUNDAMENTAL"
      ? normalizeInstrument(provider.payload, SYMBOL)
      : capability === "CURRENT_QUOTE"
        ? normalizeQuote(provider.payload, SYMBOL)
        : normalizePriceHistory(provider.payload, SYMBOL, { startDate, endDate });
    const data = normalized.data as unknown;
    const history = capability === "DAILY_PRICE_HISTORY" ? record(data) : null;
    const candles = Array.isArray(history?.candles) ? history.candles : null;
    const candleDates = candles
      ?.map((candle) => record(candle)?.timestamp)
      .filter((value): value is string => typeof value === "string") ?? [];
    return {
      capability,
      status: "CONFIRMED",
      providerHttpStatus: provider.providerStatus,
      providerRequestId: provider.headers.providerRequestId,
      realtime: normalized.realtime,
      delayed: normalized.delayed,
      freshness: researchFreshness(normalized.providerAsOf, provider.receivedAt, normalized.realtime, normalized.delayed),
      fieldInventory: fieldInventory(data),
      nullFields: nullFields(data),
      candlesReturned: candles?.length ?? null,
      candleDateRange: candleDates.length
        ? { start: candleDates[0]!, end: candleDates[candleDates.length - 1]! }
        : null,
      entitlementError: false,
      tokenRefreshRequired: false,
      errorCode: null,
      rateLimit: provider.headers,
    };
  } catch (error) {
    const details = errorDetails(error);
    return blockedCapability(
      capability,
      details.code,
      details.providerHttpStatus,
      details.providerRequestId,
      details.rateLimit,
    );
  }
}

function projectRecord(row: typeof schwabResearchCertifications.$inferSelect): SchwabResearchCertificationRecord {
  const value = row.record as Omit<SchwabResearchCertificationRecord, "id" | "createdAt">;
  return {
    ...value,
    id: row.id,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getLatestSchwabResearchCertification(actor: Actor) {
  const [row] = await db.select().from(schwabResearchCertifications)
    .where(eq(schwabResearchCertifications.householdId, actor.householdId))
    .orderBy(desc(schwabResearchCertifications.createdAt))
    .limit(1);
  return row ? projectRecord(row) : null;
}

export async function runSchwabResearchCertification(actor: Actor) {
  const requestedAt = new Date().toISOString();
  const endDate = Date.now() - 1_000;
  const startDate = endDate - RANGE_MS;
  const capabilities: SchwabResearchCapability[] = [
    "INSTRUMENT_FUNDAMENTAL",
    "CURRENT_QUOTE",
    "DAILY_PRICE_HISTORY",
  ];
  const [connection] = await db.select().from(schwabMarketDataConnections)
    .where(eq(schwabMarketDataConnections.householdId, actor.householdId))
    .limit(1);

  let results: CapabilityResult[];
  if (!connection || connection.status !== "LIVE_CONNECTED") {
    results = capabilities.map((capability) => blockedCapability(capability, "MARKET_DATA_DISCONNECTED"));
  } else if (!connection.accessTokenExpiresAt || connection.accessTokenExpiresAt <= new Date()) {
    results = capabilities.map((capability) => blockedCapability(capability, "TOKEN_REFRESH_REQUIRED"));
  } else if (!connection.accessTokenCiphertext || !connection.accessTokenNonce || !connection.accessTokenAuthTag) {
    results = capabilities.map((capability) => blockedCapability(capability, "MARKET_DATA_DISCONNECTED"));
  } else {
    let token: string;
    try {
      token = decryptSchwabOAuthValue({
        ciphertext: connection.accessTokenCiphertext,
        nonce: connection.accessTokenNonce,
        authTag: connection.accessTokenAuthTag,
      });
    } catch {
      results = capabilities.map((capability) => blockedCapability(capability, "MARKET_DATA_DISCONNECTED"));
      token = "";
    }
    results = token
      ? await Promise.all(capabilities.map((capability) => runCapability(capability, token, startDate, endDate)))
      : results!;
  }

  const completedAt = new Date().toISOString();
  const result = results.every((item) => item.status === "CONFIRMED") ? "PASS" as const : "BLOCKED" as const;
  const recordValue = {
    symbol: SYMBOL,
    result,
    requestedAt,
    completedAt,
    providerGetCount: connection?.status === "LIVE_CONNECTED" && connection.accessTokenExpiresAt && connection.accessTokenExpiresAt > new Date() ? 3 : 0,
    capabilities: results,
    readOnly: true as const,
    tradingEnabled: false as const,
    executionAuthority: "none" as const,
    noTradingOrMoneyMovement: true as const,
  };
  const [saved] = await db.insert(schwabResearchCertifications).values({
    householdId: actor.householdId,
    actorUserId: actor.userId,
    symbol: SYMBOL,
    result,
    record: recordValue,
  }).returning();
  await db.insert(auditEvents).values({
    householdId: actor.householdId,
    actor: actor.userId,
    eventType: "schwab_research_certification",
    entity: "schwab_research_certification",
    entityId: saved.id,
    metadata: {
      provider: "schwab",
      product: "market_data_production",
      symbol: SYMBOL,
      result,
      capabilityStatuses: results.map(({ capability, status }) => ({ capability, status })),
      providerGetCount: recordValue.providerGetCount,
      readOnly: true,
      tradingEnabled: false,
      executionAuthority: "none",
    },
  });
  return projectRecord(saved);
}