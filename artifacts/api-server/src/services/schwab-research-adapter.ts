import { createHash } from "node:crypto";

export type SchwabResearchCapability = "INSTRUMENT_FUNDAMENTAL" | "CURRENT_QUOTE" | "DAILY_PRICE_HISTORY";
export type SchwabResearchErrorCode =
  | "MARKET_DATA_DISCONNECTED"
  | "TOKEN_REFRESH_REQUIRED"
  | "PROVIDER_ENTITLEMENT_REQUIRED"
  | "SYMBOL_NOT_FOUND"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "INVALID_PROVIDER_RESPONSE"
  | "CONNECTION_CHANGED"
  | "INVALID_RESEARCH_REQUEST";

export class SchwabResearchError extends Error {
  constructor(
    public readonly code: SchwabResearchErrorCode,
    public readonly status: number,
    message: string,
    public readonly metadata: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "SchwabResearchError";
  }
}

export type SchwabResearchSafeHeaders = {
  providerRequestId: string | null;
  limit: number | null;
  remaining: number | null;
  resetAt: string | null;
  retryAfterSeconds: number | null;
};

export type SchwabResearchProviderResult = {
  payload: unknown;
  requestedAt: string;
  receivedAt: string;
  providerStatus: number;
  headers: SchwabResearchSafeHeaders;
};

const decimal = (value: unknown): string | null =>
  typeof value === "number" && Number.isFinite(value) ? String(value) :
  typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)) ? value : null;
const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value : null;
const bool = (value: unknown): boolean | null => typeof value === "boolean" ? value : null;
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const timestamp = (value: unknown): string | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return null;
};
const headerNumber = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const retrySeconds = (value: string | null): number | null => {
  const seconds = headerNumber(value);
  if (seconds !== null) return Math.max(0, seconds);
  if (!value || Number.isNaN(Date.parse(value))) return null;
  return Math.max(0, Math.ceil((Date.parse(value) - Date.now()) / 1000));
};

export function normalizeResearchSymbol(value: unknown): string {
  if (typeof value !== "string") throw new SchwabResearchError("INVALID_RESEARCH_REQUEST", 400, "A symbol is required");
  const symbol = value.trim().toUpperCase();
  if (!/^[A-Z0-9._-]{1,15}$/.test(symbol)) throw new SchwabResearchError("INVALID_RESEARCH_REQUEST", 400, "Symbol is invalid");
  return symbol;
}

export function normalizeDailyRange(startRaw: unknown, endRaw: unknown, now = new Date()) {
  const startDate = typeof startRaw === "string" && /^\d+$/.test(startRaw) ? Number(startRaw) : NaN;
  const endDate = typeof endRaw === "string" && /^\d+$/.test(endRaw) ? Number(endRaw) : NaN;
  const maxWindowMs = 93 * 24 * 60 * 60 * 1000;
  if (!Number.isSafeInteger(startDate) || !Number.isSafeInteger(endDate) || startDate >= endDate || endDate > now.getTime() || endDate - startDate > maxWindowMs) {
    throw new SchwabResearchError("INVALID_RESEARCH_REQUEST", 400, "Daily price-history range is invalid or exceeds 93 days");
  }
  return { startDate, endDate };
}

export function buildSchwabResearchPath(
  capability: SchwabResearchCapability,
  symbol: string,
  range?: { startDate: number; endDate: number },
) {
  if (capability === "INSTRUMENT_FUNDAMENTAL") {
    return `/marketdata/v1/instruments?symbol=${encodeURIComponent(symbol)}&projection=fundamental`;
  }
  if (capability === "CURRENT_QUOTE") {
    return `/marketdata/v1/quotes?symbols=${encodeURIComponent(symbol)}`;
  }
  if (!range) throw new SchwabResearchError("INVALID_RESEARCH_REQUEST", 400, "A bounded daily range is required");
  const query = new URLSearchParams({
    symbol,
    periodType: "month",
    frequencyType: "daily",
    frequency: "1",
    startDate: String(range.startDate),
    endDate: String(range.endDate),
    needExtendedHoursData: "false",
    needPreviousClose: "true",
  });
  return `/marketdata/v1/pricehistory?${query}`;
}

function safeHeaders(headers: Headers): SchwabResearchSafeHeaders {
  return {
    providerRequestId: headers.get("x-request-id") ?? headers.get("request-id") ?? headers.get("schwab-request-id"),
    limit: headerNumber(headers.get("x-ratelimit-limit")),
    remaining: headerNumber(headers.get("x-ratelimit-remaining")),
    resetAt: headers.get("x-ratelimit-reset"),
    retryAfterSeconds: retrySeconds(headers.get("retry-after")),
  };
}

function providerError(status: number, headers: SchwabResearchSafeHeaders): SchwabResearchError {
  const metadata = {
    providerStatus: status,
    providerRequestId: headers.providerRequestId,
    providerSafeHeaders: headers,
  };
  if (status === 401) return new SchwabResearchError("TOKEN_REFRESH_REQUIRED", 409, "Schwab access token must be refreshed", metadata);
  if (status === 403) return new SchwabResearchError("PROVIDER_ENTITLEMENT_REQUIRED", 403, "Schwab entitlement does not permit this research capability", metadata);
  if (status === 404) return new SchwabResearchError("SYMBOL_NOT_FOUND", 404, "Schwab did not find the requested symbol", metadata);
  if (status === 429) return new SchwabResearchError("PROVIDER_RATE_LIMITED", 429, "Schwab rate limit reached", metadata);
  if (status >= 500) return new SchwabResearchError("PROVIDER_UNAVAILABLE", 503, "Schwab research service is unavailable", metadata);
  return new SchwabResearchError("INVALID_PROVIDER_RESPONSE", 502, "Schwab rejected the research request", metadata);
}

export async function requestSchwabResearch(
  path: string,
  accessToken: string,
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
): Promise<SchwabResearchProviderResult> {
  const base = env.SCHWAB_API_BASE_URL ?? "https://api.schwabapi.com";
  const allowedPaths = ["/marketdata/v1/instruments", "/marketdata/v1/quotes", "/marketdata/v1/pricehistory"];
  let url: URL;
  try { url = new URL(path, base); } catch { throw new SchwabResearchError("INVALID_RESEARCH_REQUEST", 400, "Research endpoint is invalid"); }
  if (url.protocol !== "https:" || url.origin !== new URL(base).origin || !allowedPaths.includes(url.pathname)) {
    throw new SchwabResearchError("INVALID_RESEARCH_REQUEST", 400, "Research endpoint is not allowlisted");
  }
  let response: Response;
  const requestedAt = new Date().toISOString();
  try {
    response = await fetcher(url, {
      method: "GET",
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new SchwabResearchError("PROVIDER_UNAVAILABLE", 503, "Schwab research service is unavailable");
  }
  const headers = safeHeaders(response.headers);
  if (!response.ok) throw providerError(response.status, headers);
  const payload = await response.json().catch(() => { throw new SchwabResearchError("INVALID_PROVIDER_RESPONSE", 502, "Schwab research response is not valid JSON"); });
  return { payload, requestedAt, receivedAt: new Date().toISOString(), providerStatus: response.status, headers };
}

export function researchFreshness(providerAsOf: string | null, receivedAt: string, realtime: boolean | null, delayed: boolean | null) {
  if (delayed === true) return "DELAYED" as const;
  if (realtime === true) return "REALTIME" as const;
  if (!providerAsOf) return "UNKNOWN" as const;
  const age = Date.parse(receivedAt) - Date.parse(providerAsOf);
  if (!Number.isFinite(age)) return "UNKNOWN" as const;
  if (age <= 15 * 60_000) return "CURRENT" as const;
  if (age <= 24 * 60 * 60_000) return "AGING" as const;
  return "STALE" as const;
}

export function normalizeInstrument(payload: unknown, symbol: string) {
  const root = record(payload);
  const instruments = Array.isArray(root?.instruments) ? root!.instruments : [];
  const item = instruments.map(record).find((candidate) => candidate?.symbol === symbol) ?? instruments.map(record).find(Boolean);
  if (!item) throw new SchwabResearchError("SYMBOL_NOT_FOUND", 404, "Schwab did not find the requested symbol");
  const fundamental = record(item.fundamental);
  return {
    data: {
      symbol: text(item.symbol) ?? symbol,
      description: text(item.description),
      assetType: text(item.assetType),
      exchange: text(item.exchange),
      cusip: text(item.cusip),
      fundamental: fundamental ? {
        asOf: timestamp(fundamental.asOf ?? fundamental.fundamentalDate),
        marketCap: decimal(fundamental.marketCap),
        sharesOutstanding: decimal(fundamental.sharesOutstanding),
        epsTrailingTwelveMonths: decimal(fundamental.epsTTM),
        peRatio: decimal(fundamental.peRatio),
        dividendAmount: decimal(fundamental.dividendAmount),
        dividendYield: decimal(fundamental.dividendYield),
        dividendPayDate: timestamp(fundamental.dividendPayDate),
        beta: decimal(fundamental.beta),
        high52Week: decimal(fundamental.high52),
        low52Week: decimal(fundamental.low52),
      } : null,
    },
    providerAsOf: fundamental ? timestamp(fundamental.asOf ?? fundamental.fundamentalDate) : null,
    realtime: null,
    delayed: null,
  };
}

export function normalizeQuote(payload: unknown, symbol: string) {
  const root = record(payload);
  const item = record(root?.[symbol]) ?? Object.values(root ?? {}).map(record).find((candidate) => candidate?.symbol === symbol);
  const quote = record(item?.quote);
  const reference = record(item?.reference);
  if (!item || !quote) throw new SchwabResearchError("SYMBOL_NOT_FOUND", 404, "Schwab did not return a quote for the requested symbol");
  const quoteTime = timestamp(quote.quoteTime);
  const tradeTime = timestamp(quote.tradeTime);
  const realtime = bool(quote.isRealtime ?? item.realtime);
  const delayed = bool(quote.isDelayed ?? item.delayed);
  return {
    data: {
      symbol: text(item.symbol) ?? symbol,
      assetType: text(item.assetMainType),
      description: text(reference?.description),
      bidPrice: decimal(quote.bidPrice),
      askPrice: decimal(quote.askPrice),
      lastPrice: decimal(quote.lastPrice),
      markPrice: decimal(quote.mark),
      closePrice: decimal(quote.closePrice),
      openPrice: decimal(quote.openPrice),
      highPrice: decimal(quote.highPrice),
      lowPrice: decimal(quote.lowPrice),
      netChange: decimal(quote.netChange),
      netPercentChange: decimal(quote.netPercentChange),
      totalVolume: decimal(quote.totalVolume),
      quoteTime,
      tradeTime,
      realtime,
      delayed,
    },
    providerAsOf: quoteTime ?? tradeTime,
    realtime,
    delayed,
  };
}

export function normalizePriceHistory(payload: unknown, symbol: string, range: { startDate: number; endDate: number }) {
  const root = record(payload);
  if (!root || !Array.isArray(root.candles)) throw new SchwabResearchError("INVALID_PROVIDER_RESPONSE", 502, "Schwab price history response is invalid");
  if (root.candles.length > 100) throw new SchwabResearchError("INVALID_PROVIDER_RESPONSE", 502, "Schwab returned too many daily candles");
  const candles = root.candles.map((raw) => {
    const candle = record(raw);
    const at = timestamp(candle?.datetime);
    if (!candle || !at) throw new SchwabResearchError("INVALID_PROVIDER_RESPONSE", 502, "Schwab returned an invalid daily candle");
    return {
      timestamp: at,
      open: decimal(candle.open),
      high: decimal(candle.high),
      low: decimal(candle.low),
      close: decimal(candle.close),
      volume: decimal(candle.volume),
    };
  });
  for (let index = 1; index < candles.length; index += 1) {
    if (candles[index]!.timestamp <= candles[index - 1]!.timestamp) {
      throw new SchwabResearchError("INVALID_PROVIDER_RESPONSE", 502, "Schwab daily candles are duplicate or out of order");
    }
  }
  return {
    data: {
      symbol: text(root.symbol) ?? symbol,
      empty: bool(root.empty) ?? candles.length === 0,
      previousClose: decimal(root.previousClose),
      previousCloseDate: timestamp(root.previousCloseDate),
      candles,
      requestedRange: {
        start: new Date(range.startDate).toISOString(),
        end: new Date(range.endDate).toISOString(),
        frequency: "DAILY" as const,
        extendedHoursIncluded: false as const,
      },
    },
    providerAsOf: candles.at(-1)?.timestamp ?? null,
    realtime: null,
    delayed: null,
  };
}

export function researchEnvelope<T>(
  capability: SchwabResearchCapability,
  symbol: string,
  path: string,
  result: SchwabResearchProviderResult,
  normalized: { data: T; providerAsOf: string | null; realtime: boolean | null; delayed: boolean | null },
) {
  const query = new URL(path, "https://provider.invalid").searchParams;
  const requestParameters = Object.fromEntries([...query.entries()].map(([key, value]) => [key, /^\d+$/.test(value) ? Number(value) : value]));
  return {
    provider: "schwab" as const,
    providerProduct: "MARKET_DATA_PRODUCTION" as const,
    capability,
    symbol,
    requestedAt: result.requestedAt,
    receivedAt: result.receivedAt,
    providerAsOf: normalized.providerAsOf,
    freshness: researchFreshness(normalized.providerAsOf, result.receivedAt, normalized.realtime, normalized.delayed),
    realtime: normalized.realtime,
    delayed: normalized.delayed,
    provenance: {
      sourceClass: "SCHWAB_MARKET_DATA" as const,
      providerEndpoint: new URL(path, "https://provider.invalid").pathname,
      retrievedAt: result.receivedAt,
      requestParameters,
      payloadSha256: createHash("sha256").update(JSON.stringify(result.payload)).digest("hex"),
      providerRequestId: result.headers.providerRequestId,
    },
    rateLimit: {
      limit: result.headers.limit,
      remaining: result.headers.remaining,
      resetAt: result.headers.resetAt,
      retryAfterSeconds: result.headers.retryAfterSeconds,
    },
    readOnly: true as const,
    tradingEnabled: false as const,
    executionAuthority: "none" as const,
    data: normalized.data,
  };
}