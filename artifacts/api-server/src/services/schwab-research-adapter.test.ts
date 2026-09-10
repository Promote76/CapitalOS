import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSchwabResearchPath,
  normalizeDailyRange,
  normalizePriceHistory,
  normalizeQuote,
  normalizeResearchSymbol,
  requestSchwabResearch,
  SchwabResearchError,
} from "./schwab-research-adapter";

test("research symbols and daily ranges are strictly bounded", () => {
  assert.equal(normalizeResearchSymbol(" bksc "), "BKSC");
  assert.throws(() => normalizeResearchSymbol("BKSC,MSFT"), { code: "INVALID_RESEARCH_REQUEST" });
  assert.throws(() => normalizeResearchSymbol("../orders"), { code: "INVALID_RESEARCH_REQUEST" });
  const now = new Date("2026-09-10T00:00:00Z");
  const range = normalizeDailyRange(String(now.getTime() - 30 * 86_400_000), String(now.getTime()), now);
  assert.equal(range.endDate, now.getTime());
  assert.throws(() => normalizeDailyRange(String(now.getTime() - 94 * 86_400_000), String(now.getTime()), now), { code: "INVALID_RESEARCH_REQUEST" });
  assert.throws(() => normalizeDailyRange(String(now.getTime()), String(now.getTime() + 1), now), { code: "INVALID_RESEARCH_REQUEST" });
});

test("research paths expose only fixed GET capabilities without arbitrary passthrough", async () => {
  assert.equal(buildSchwabResearchPath("INSTRUMENT_FUNDAMENTAL", "BKSC"), "/marketdata/v1/instruments?symbol=BKSC&projection=fundamental");
  assert.equal(buildSchwabResearchPath("CURRENT_QUOTE", "BKSC"), "/marketdata/v1/quotes?symbols=BKSC");
  assert.match(buildSchwabResearchPath("DAILY_PRICE_HISTORY", "BKSC", { startDate: 1, endDate: 2 }), /^\/marketdata\/v1\/pricehistory\?/);
  await assert.rejects(
    requestSchwabResearch("/trader/v1/orders", "secret", {}, async () => new Response()),
    { code: "INVALID_RESEARCH_REQUEST" },
  );
});

test("quote normalization preserves useful fields, nulls, and realtime status", () => {
  const value = normalizeQuote({
    BKSC: {
      symbol: "BKSC",
      assetMainType: "EQUITY",
      reference: { description: "Bank stock" },
      quote: {
        bidPrice: 31.1, askPrice: 31.2, lastPrice: 31.15, mark: 31.16,
        closePrice: 30.9, openPrice: 31, highPrice: 31.4, lowPrice: 30.8,
        netChange: 0.25, netPercentChange: 0.8, totalVolume: 1200,
        quoteTime: 1_789_000_000_000, tradeTime: 1_789_000_000_100,
        isRealtime: true, isDelayed: false,
      },
    },
  }, "BKSC");
  assert.equal(value.data.lastPrice, "31.15");
  assert.equal(value.data.bidPrice, "31.1");
  assert.equal(value.data.realtime, true);
  assert.equal(value.data.delayed, false);
  assert.equal(value.data.description, "Bank stock");
  assert.equal(normalizeQuote({ BKSC: { symbol: "BKSC", quote: {} } }, "BKSC").data.lastPrice, null);
});

test("daily candles must be valid, bounded, and strictly ordered", () => {
  const range = { startDate: 1_788_000_000_000, endDate: 1_789_000_000_000 };
  const result = normalizePriceHistory({
    symbol: "BKSC",
    previousClose: 30,
    candles: [
      { datetime: 1_788_000_000_000, open: 30, high: 31, low: 29, close: 30.5, volume: 100 },
      { datetime: 1_788_086_400_000, open: 30.5, high: 32, low: 30, close: 31, volume: 200 },
    ],
  }, "BKSC", range);
  assert.equal(result.data.candles.length, 2);
  assert.equal(result.data.candles[0]?.close, "30.5");
  assert.equal(result.data.candles[0]?.marketDate, new Date(1_788_000_000_000).toISOString().slice(0, 10));
  assert.throws(() => normalizePriceHistory({ candles: [{ datetime: 2 }, { datetime: 1 }] }, "BKSC", range), { code: "INVALID_PROVIDER_RESPONSE" });
  assert.throws(() => normalizePriceHistory({ candles: Array.from({ length: 101 }, (_, datetime) => ({ datetime })) }, "BKSC", range), { code: "INVALID_PROVIDER_RESPONSE" });
});

test("provider failures map to stable safe errors and retain only safe headers", async () => {
  const cases = [
    [401, "TOKEN_REFRESH_REQUIRED"],
    [403, "PROVIDER_ENTITLEMENT_REQUIRED"],
    [404, "SYMBOL_NOT_FOUND"],
    [429, "PROVIDER_RATE_LIMITED"],
    [500, "PROVIDER_UNAVAILABLE"],
  ] as const;
  for (const [status, code] of cases) {
    await assert.rejects(
      requestSchwabResearch("/marketdata/v1/quotes?symbols=BKSC", "raw-secret", {}, async (_url, init) => {
        assert.match(String((init?.headers as Record<string, string>).authorization), /^Bearer /);
        return new Response(JSON.stringify({ token: "must-not-escape" }), {
          status,
          headers: { "x-request-id": "safe-request", "retry-after": "3", "set-cookie": "secret-cookie" },
        });
      }),
      (error: unknown) => {
        assert.ok(error instanceof SchwabResearchError);
        assert.equal(error.code, code);
        assert.doesNotMatch(JSON.stringify(error), /raw-secret|must-not-escape|secret-cookie/);
        assert.equal(error.metadata.providerRequestId, "safe-request");
        return true;
      },
    );
  }
});

test("adapter source has no callable execution capability", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("./schwab-research-adapter.ts", import.meta.url), "utf8"));
  for (const forbidden of ["/orders", "/transfers", "micro-live", "execution-control", "execute_micro_live_order"]) {
    assert.equal(source.includes(forbidden), false, `unexpected execution path: ${forbidden}`);
  }
});