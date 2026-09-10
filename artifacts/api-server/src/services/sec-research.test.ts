import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSecFilingPayloads, resolveSecIssuer, SEC_BANK_METRIC_NAMES } from "./sec-research";

const accessionQ = "0000000001-26-000010";
const accessionK = "0000000001-25-000020";
const source = (accession: string) => ({
  form: accession === accessionQ ? "10-Q" : "10-K",
  accn: accession,
  filed: accession === accessionQ ? "2026-08-01" : "2025-03-01",
  fy: 2026,
  fp: accession === accessionQ ? "Q2" : "FY",
  start: "2026-01-01",
  end: "2026-06-30",
});

const payloads = (facts: Record<string, unknown>) => ({
  symbol: "BKSC",
  accessedAt: "2026-09-10T00:00:00.000Z",
  tickerMap: { 0: { ticker: "BKSC", cik_str: 1001 } },
  submissions: { filings: { recent: {
    form: ["10-Q", "10-K"],
    filingDate: ["2026-08-01", "2025-03-01"],
    accessionNumber: [accessionQ, accessionK],
    primaryDocument: ["q.htm", "k.htm"],
  } } },
  facts: { facts: { "us-gaap": facts } },
});

test("SEC normalization retains exact accession provenance and supplements only missing fields from 10-K", () => {
  const normalized = normalizeSecFilingPayloads(payloads({
    Assets: { units: { USD: [{ ...source(accessionQ), val: 100 }] } },
    Liabilities: { units: { USD: [{ ...source(accessionK), val: 80 }] } },
    NetIncomeLoss: { units: { USD: [{ ...source("different-accession"), val: 999 }] } },
  }));
  assert.equal(normalized.content.filings[0]?.form, "10-Q");
  assert.equal(normalized.content.filings[1]?.form, "10-K");
  assert.equal(normalized.content.metrics.totalAssets?.value, 100);
  assert.equal(normalized.content.metrics.totalAssets?.unit, "USD");
  assert.equal(normalized.content.metrics.totalAssets?.accession, accessionQ);
  assert.equal(normalized.content.metrics.totalLiabilities?.value, 80);
  assert.equal(normalized.content.metrics.totalLiabilities?.accession, accessionK);
  assert.equal(normalized.content.metrics.netIncome, null);
  assert.equal(normalized.content.metrics.depositRetention, null);
  assert.equal(normalized.content.metrics.earningsTrend, null);
  assert.equal(normalized.content.metrics.dividendPayout, null);
  assert.ok(normalized.missingFields.includes("netIncome"));
  assert.ok(normalized.missingFields.includes("depositRetention"));
  assert.ok(normalized.missingFields.includes("earningsTrend"));
  assert.ok(normalized.missingFields.includes("dividendPayout"));
  assert.ok(normalized.content.metrics.totalAssets?.sourceUrl?.startsWith("https://www.sec.gov/Archives/"));
});

test("SEC normalization never fills unsupported bank metrics", () => {
  const normalized = normalizeSecFilingPayloads(payloads({}));
  assert.deepEqual(Object.keys(normalized.content.metrics), SEC_BANK_METRIC_NAMES);
  assert.ok(Object.values(normalized.content.metrics).every((value) => value === null));
  assert.deepEqual(normalized.missingFields, SEC_BANK_METRIC_NAMES);
  assert.equal(normalized.evidenceQuality, "LOW");
});

test("SEC issuer lookup falls back to the official legacy ticker index", () => {
  const issuer = resolveSecIssuer(
    "bksc",
    { 0: { ticker: "SSB", cik_str: 764038 } },
    "aapl\t320193\r\nbksc\t1007273\r\n",
  );
  assert.deepEqual(issuer, { ticker: "BKSC", cik: "0001007273", source: "ticker.txt" });
  assert.throws(
    () => resolveSecIssuer("BKSC", {}, "bkscx\t1007273\n"),
    /Ticker is not present in the SEC issuer index/,
  );
});

test("live BKSC SEC facts match their official companyfacts citations", {
  skip: process.env.CAPITAL_OS_RUN_SEC_LIVE_CERTIFICATION !== "1",
}, async () => {
  const headers = {
    "User-Agent": process.env.SEC_USER_AGENT || "Capital OS research/1.0 (research@capital-os.local)",
    Accept: "application/json",
  };
  const json = async (url: string): Promise<any> => {
    const response = await fetch(url, { headers });
    assert.equal(response.status, 200, `SEC request failed: ${url}`);
    return response.json();
  };
  const tickerMap = await json("https://www.sec.gov/files/company_tickers.json");
  const legacyResponse = await fetch("https://www.sec.gov/include/ticker.txt", {
    headers: { ...headers, Accept: "text/plain" },
  });
  assert.equal(legacyResponse.status, 200);
  const issuer = resolveSecIssuer("BKSC", tickerMap, await legacyResponse.text());
  assert.deepEqual(issuer, { ticker: "BKSC", cik: "0001007273", source: "ticker.txt" });

  const [submissions, facts] = await Promise.all([
    json(`https://data.sec.gov/submissions/CIK${issuer.cik}.json`),
    json(`https://data.sec.gov/api/xbrl/companyfacts/CIK${issuer.cik}.json`),
  ]);
  assert.equal(submissions.name, "BANK OF SOUTH CAROLINA CORP");
  const normalized = normalizeSecFilingPayloads({
    symbol: "BKSC",
    tickerMap: { ...tickerMap, legacy: { ticker: "BKSC", cik_str: Number(issuer.cik) } },
    submissions,
    facts,
    accessedAt: new Date().toISOString(),
  });

  const populated = Object.entries(normalized.content.metrics).filter(([, fact]) => fact !== null);
  assert.ok(populated.length > 0);
  for (const [field, fact] of populated) {
    assert.ok(fact, field);
    const officialRows = facts.facts["us-gaap"][fact.tag].units[fact.unit!];
    assert.ok(Array.isArray(officialRows), `${field} official unit rows`);
    assert.ok(officialRows.some((row: any) =>
      row.val === fact.value &&
      (row.start ?? null) === fact.start &&
      (row.end ?? null) === fact.end &&
      row.accn === fact.accession &&
      row.form === fact.form &&
      (row.filed ?? null) === fact.filed &&
      (row.fy ?? null) === fact.fiscalYear &&
      (row.fp ?? null) === fact.fiscalPeriod &&
      (row.frame ?? null) === fact.frame
    ), `${field} did not match an exact official XBRL fact`);
    assert.ok(fact.sourceUrl?.includes(fact.accession.replaceAll("-", "")));
  }
  assert.deepEqual(
    normalized.missingFields,
    SEC_BANK_METRIC_NAMES.filter((field) => normalized.content.metrics[field] === null),
  );
  assert.ok(normalized.missingFields.length > 0);
});