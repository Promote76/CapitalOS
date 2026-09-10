import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSecFilingPayloads, SEC_BANK_METRIC_NAMES } from "./sec-research";

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
  unit: "USD",
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
  assert.equal(normalized.content.metrics.totalAssets?.accession, accessionQ);
  assert.equal(normalized.content.metrics.totalLiabilities?.value, 80);
  assert.equal(normalized.content.metrics.totalLiabilities?.accession, accessionK);
  assert.equal(normalized.content.metrics.netIncome, null);
  assert.ok(normalized.missingFields.includes("netIncome"));
  assert.ok(normalized.content.metrics.totalAssets?.sourceUrl?.startsWith("https://www.sec.gov/Archives/"));
});

test("SEC normalization never fills unsupported bank metrics", () => {
  const normalized = normalizeSecFilingPayloads(payloads({}));
  assert.deepEqual(Object.keys(normalized.content.metrics), SEC_BANK_METRIC_NAMES);
  assert.ok(Object.values(normalized.content.metrics).every((value) => value === null));
  assert.deepEqual(normalized.missingFields, SEC_BANK_METRIC_NAMES);
  assert.equal(normalized.evidenceQuality, "LOW");
});