import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SECURITY_CLASSIFICATION_POLICY_VERSION,
  classifySecurity,
  deriveUniverseVersion,
  parseSecurityDirectory,
} from "./lib/research-security-classification.mjs";

const SOURCE_URL = "https://www.sec.gov/files/company_tickers_exchange.json";
const SUBMISSIONS_URL = "https://data.sec.gov/submissions";
const SECURITY_DIRECTORY_URLS = [
  "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt",
  "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt",
];
const INCLUDED_EXCHANGES = new Set(["NYSE", "Nasdaq", "CBOE"]);
const TICKER_PATTERN = /^[A-Z0-9._-]{1,15}$/;
const DOMESTIC_JURISDICTIONS = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI",
  "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN",
  "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH",
  "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA",
  "WV", "WI", "WY", "PR", "VI", "GU", "AS", "MP",
]);
const USER_AGENT = process.env.SEC_USER_AGENT
  ?? "CapitalOS/1.0 read-only research universe (support@replit.com)";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(
  root,
  "artifacts/api-server/src/data/sec-us-equity-universe.json",
);

const securityDirectoryResponses = await Promise.all(SECURITY_DIRECTORY_URLS.map(async (sourceUrl) => {
  const directoryResponse = await fetch(sourceUrl, {
    headers: { accept: "text/plain", "user-agent": USER_AGENT },
  });
  if (!directoryResponse.ok) {
    throw new Error(`Security directory fetch failed with HTTP ${directoryResponse.status}: ${sourceUrl}`);
  }
  const bytes = Buffer.from(await directoryResponse.arrayBuffer());
  return {
    sourceUrl,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    rows: parseSecurityDirectory(bytes.toString("utf8"), sourceUrl),
  };
}));
const securityDirectoryByTicker = new Map(
  securityDirectoryResponses.flatMap(({ rows }) =>
    rows.flatMap((row) => row.aliases.map((ticker) => [ticker, row]))),
);

const response = await fetch(SOURCE_URL, {
  headers: {
    accept: "application/json",
    "user-agent": USER_AGENT,
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
const version = deriveUniverseVersion({
  asOf,
  secSourceSha256: sourceSha256,
  securitySourceSha256s: securityDirectoryResponses.map(({ sha256 }) => sha256),
});
const issuerClassificationByCik = new Map();
const classificationCiks = [...new Set(payload.data
  .filter((row) => Array.isArray(row) && INCLUDED_EXCHANGES.has(row[3]))
  .map((row) => String(row[0]).padStart(10, "0")))];

async function fetchIssuerClassification(cik) {
  const sourceUrl = `${SUBMISSIONS_URL}/CIK${cik}.json`;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const submissionResponse = await fetch(sourceUrl, {
      headers: { accept: "application/json", "user-agent": USER_AGENT },
    });
    if (submissionResponse.ok) {
      const submission = await submissionResponse.json();
      const jurisdictionCode = typeof submission.stateOfIncorporation === "string"
        ? submission.stateOfIncorporation.trim().toUpperCase()
        : "";
      const status = !jurisdictionCode
        ? "UNKNOWN"
        : DOMESTIC_JURISDICTIONS.has(jurisdictionCode)
          ? "VERIFIED_DOMESTIC"
          : "VERIFIED_FOREIGN";
      return {
        status,
        jurisdictionCode: jurisdictionCode || null,
        jurisdictionName: typeof submission.stateOfIncorporationDescription === "string"
          ? submission.stateOfIncorporationDescription
          : null,
        entityType: typeof submission.entityType === "string" ? submission.entityType : null,
        sic: typeof submission.sic === "string" ? submission.sic : null,
        sicDescription: typeof submission.sicDescription === "string" ? submission.sicDescription : null,
        sourceUrl,
      };
    }
    if (![403, 429, 500, 502, 503, 504].includes(submissionResponse.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  return {
    status: "UNKNOWN",
    jurisdictionCode: null,
    jurisdictionName: null,
    entityType: null,
    sic: null,
    sicDescription: null,
    sourceUrl,
  };
}

for (let offset = 0; offset < classificationCiks.length; offset += 8) {
  const batch = classificationCiks.slice(offset, offset + 8);
  const classifications = await Promise.all(batch.map(fetchIssuerClassification));
  batch.forEach((cik, index) => issuerClassificationByCik.set(cik, classifications[index]));
  if (offset + batch.length < classificationCiks.length) {
    await new Promise((resolve) => setTimeout(resolve, 850));
  }
  if (offset > 0 && offset % 400 === 0) {
    console.log(`Classified ${Math.min(offset + batch.length, classificationCiks.length)} / ${classificationCiks.length} SEC issuers`);
  }
}

const exclusions = {
  unsupportedExchange: 0,
  missingExchange: 0,
  invalidTicker: 0,
  duplicateTicker: 0,
  foreignIssuer: 0,
  unknownDomesticClassification: 0,
};
const byTicker = new Map();

for (const row of payload.data) {
  if (!Array.isArray(row) || row.length < 4) {
    exclusions.invalidTicker += 1;
    continue;
  }
  const [rawCik, name, rawTicker, exchange] = row;
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
  const cik = String(rawCik).padStart(10, "0");
  const issuerClassification = issuerClassificationByCik.get(cik);
  if (!issuerClassification || issuerClassification.status === "UNKNOWN") {
    exclusions.unknownDomesticClassification += 1;
    continue;
  }
  if (issuerClassification.status === "VERIFIED_FOREIGN") {
    exclusions.foreignIssuer += 1;
    continue;
  }
  const securityClassification = classifySecurity(securityDirectoryByTicker.get(ticker));
  const securityType = ["ETF", "CLOSED_END_FUND"].includes(securityClassification.instrumentType)
    ? "ETF_FUND"
    : securityClassification.instrumentType === "PREFERRED"
      ? "PREFERRED_INCOME"
      : securityClassification.instrumentType === "COMMON_STOCK"
        ? "COMMON_STOCK"
        : "OTHER";
  byTicker.set(ticker, {
    ticker,
    cik,
    name: String(name),
    exchange,
    issuerClassification,
    securityClassification,
    securityType,
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
  schemaVersion: 3,
  source: {
    provider: "U.S. Securities and Exchange Commission",
    title: "Company Tickers Exchange",
    url: SOURCE_URL,
    retrievedAt,
    sourceSha256,
    version,
    sourceRowCount: payload.data.length,
    includedExchanges: [...INCLUDED_EXCHANGES],
    classificationPolicyVersion: SECURITY_CLASSIFICATION_POLICY_VERSION,
    issuerClassificationSource: `${SUBMISSIONS_URL}/CIK##########.json`,
    securityClassificationSources: securityDirectoryResponses.map(({ sourceUrl, sha256, rows }) => ({
      provider: "Nasdaq Trader",
      url: sourceUrl,
      sha256,
      rowCount: rows.length,
    })),
    domesticJurisdictions: [...DOMESTIC_JURISDICTIONS].sort(),
    selectionMethod: "SHA-256(version:ticker), ascending; ticker ascending as tie-breaker",
    limitations: [
      "This is an SEC issuer-and-exchange directory, not an investment recommendation or market-wide Schwab screener.",
      "Foreign issuers and issuers without verified SEC incorporation jurisdiction are excluded before discovery.",
      "Security-type labels use Nasdaq Trader security-level rows; unmatched instrument types are recorded as UNKNOWN and excluded from typed universes.",
      "The SEC source does not guarantee that every listed symbol is currently tradable or entitled through Schwab.",
    ],
  },
  counts: {
    available: entries.length,
    excluded: Object.values(exclusions).reduce((sum, count) => sum + count, 0),
    exclusions,
    instrumentTypes: Object.fromEntries(
      [...new Set(entries.map((entry) => entry.securityClassification.instrumentType))]
        .sort()
        .map((instrumentType) => [
          instrumentType,
          entries.filter((entry) => entry.securityClassification.instrumentType === instrumentType).length,
        ]),
    ),
  },
  entries,
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(artifact)}\n`);
console.log(
  `Wrote ${path.relative(root, outputPath)} with ${entries.length} symbols `
  + `from ${payload.data.length} SEC rows (${version}).`,
);