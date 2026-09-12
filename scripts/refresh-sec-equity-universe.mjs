import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_URL = "https://www.sec.gov/files/company_tickers_exchange.json";
const INCLUDED_EXCHANGES = new Set(["NYSE", "Nasdaq", "CBOE"]);
const TICKER_PATTERN = /^[A-Z0-9._-]{1,15}$/;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(
  root,
  "artifacts/api-server/src/data/sec-us-equity-universe.json",
);

const response = await fetch(SOURCE_URL, {
  headers: {
    accept: "application/json",
    "user-agent": process.env.SEC_USER_AGENT
      ?? "CapitalOS/1.0 read-only research universe (https://capital-os-fund.replit.app)",
  },
});
if (!response.ok) {
  throw new Error(`SEC universe fetch failed with HTTP ${response.status}`);
}

const sourceBytes = Buffer.from(await response.arrayBuffer());
const sourceSha256 = crypto.createHash("sha256").update(sourceBytes).digest("hex");
const payload = JSON.parse(sourceBytes.toString("utf8"));
if (
  !Array.isArray(payload?.fields)
  || payload.fields.join(",") !== "cik,name,ticker,exchange"
  || !Array.isArray(payload?.data)
) {
  throw new Error("SEC universe response shape is not recognized");
}

const retrievedAt = new Date().toISOString();
const asOf = retrievedAt.slice(0, 10);
const version = `sec-company-tickers-exchange-${asOf}-${sourceSha256.slice(0, 12)}`;
const exclusions = {
  unsupportedExchange: 0,
  missingExchange: 0,
  invalidTicker: 0,
  duplicateTicker: 0,
};
const byTicker = new Map();

for (const row of payload.data) {
  if (!Array.isArray(row) || row.length < 4) {
    exclusions.invalidTicker += 1;
    continue;
  }
  const [cik, name, rawTicker, exchange] = row;
  if (!exchange) {
    exclusions.missingExchange += 1;
    continue;
  }
  if (!INCLUDED_EXCHANGES.has(exchange)) {
    exclusions.unsupportedExchange += 1;
    continue;
  }
  const ticker = typeof rawTicker === "string" ? rawTicker.trim().toUpperCase() : "";
  if (!TICKER_PATTERN.test(ticker)) {
    exclusions.invalidTicker += 1;
    continue;
  }
  if (byTicker.has(ticker)) {
    exclusions.duplicateTicker += 1;
    continue;
  }
  byTicker.set(ticker, {
    ticker,
    cik: String(cik).padStart(10, "0"),
    name: String(name),
    exchange,
  });
}

const entries = [...byTicker.values()]
  .map((entry) => ({
    ...entry,
    selectionKey: crypto
      .createHash("sha256")
      .update(`${version}:${entry.ticker}`)
      .digest("hex"),
  }))
  .sort((a, b) =>
    a.selectionKey.localeCompare(b.selectionKey)
    || a.ticker.localeCompare(b.ticker))
  .map(({ selectionKey: _selectionKey, ...entry }) => entry);

const artifact = {
  schemaVersion: 1,
  source: {
    provider: "U.S. Securities and Exchange Commission",
    title: "Company Tickers Exchange",
    url: SOURCE_URL,
    retrievedAt,
    sourceSha256,
    version,
    sourceRowCount: payload.data.length,
    includedExchanges: [...INCLUDED_EXCHANGES],
    selectionMethod: "SHA-256(version:ticker), ascending; ticker ascending as tie-breaker",
    limitations: [
      "This is an SEC issuer-and-exchange directory, not an investment recommendation or market-wide Schwab screener.",
      "OTC and records without a supported exchange are excluded from this U.S. listed-equity screening universe.",
      "The SEC source does not guarantee that every listed symbol is currently tradable or entitled through Schwab.",
    ],
  },
  counts: {
    available: entries.length,
    excluded: Object.values(exclusions).reduce((sum, count) => sum + count, 0),
    exclusions,
  },
  entries,
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(artifact)}\n`);
console.log(
  `Wrote ${path.relative(root, outputPath)} with ${entries.length} symbols `
  + `from ${payload.data.length} SEC rows (${version}).`,
);