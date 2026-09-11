import assert from "node:assert/strict";
import test from "node:test";
import type { ResearchDossierPrefill, ResearchEvidence } from "@workspace/api-client-react";
import { parseResearchDigestion } from "../../api-server/src/domain/research-digestion";
import {
  buildReviewedPrefillText,
  groupDossiersByTicker,
  hasExactDossierEvidenceSet,
  loadResearchSelection,
  reconcileSelectedEvidenceIds,
  stableEvidenceIds,
  isDossierEligibleEvidence,
  isResearchContentReady,
} from "./pages/investment-research";

const prefill: ResearchDossierPrefill = {
  kind: "SCHWAB_MARKET_SNAPSHOT",
  ticker: "BKSC",
  suggestedTitle: "BKSC Investment Research",
  instrument: { symbol: "BKSC", description: "Bank of South Carolina", assetType: "EQUITY", exchange: "NASDAQ" },
  fundamentals: {
    asOf: "2026-09-09T20:00:00.000Z", marketCap: "123", sharesOutstanding: "45",
    epsTrailingTwelveMonths: "1.23", peRatio: "9.5", dividendAmount: "0.18",
    dividendYield: "3.2", dividendPayDate: null, beta: "0.7", high52Week: "15", low52Week: "11",
  },
  quote: {
    asOf: "2026-09-10T14:00:00.000Z", bidPrice: "13.00", askPrice: "13.10",
    lastPrice: "13.05", markPrice: "13.05", closePrice: "12.95", openPrice: "13.00",
    highPrice: "13.20", lowPrice: "12.90", netChange: "0.10", netPercentChange: "0.77",
    totalVolume: "5000",
  },
  priceHistory: {
    frequency: "DAILY", requestedStart: "2026-08-10T00:00:00.000Z", requestedEnd: "2026-09-10T00:00:00.000Z",
    candleCount: 2, firstMarketDate: "2026-09-09", lastMarketDate: "2026-09-10",
    periodOpen: "12.80", periodHigh: "13.20", periodLow: "12.70", periodClose: "13.05",
    recentCloses: [{ marketDate: "2026-09-10", close: "13.05", volume: "5000" }],
  },
  freshness: { label: "CURRENT", providerAsOf: "2026-09-10T14:00:00.000Z", marketDate: "2026-09-10", realtime: true, delayed: false },
  warnings: { missingFields: [], qualityFlags: [] },
  source: {
    provider: "Schwab Market Data", title: "Schwab BKSC market snapshot", provenanceClass: "PRIMARY_SOURCE",
    requestedAt: "2026-09-10T13:59:59.000Z", retrievedAt: "2026-09-10T14:00:01.000Z",
    reviewedAt: "2026-09-10T14:01:00.000Z", contentDigest: "a".repeat(64),
  },
  advisoryOnly: true, readOnly: true, tradingEnabled: false, executionAuthority: "none", noTradingOrMoneyMovement: true,
};

const evidence = (overrides: Partial<ResearchEvidence>): ResearchEvidence => ({
  id: "00000000-0000-0000-0000-000000000001",
  householdId: "00000000-0000-0000-0000-000000000002",
  title: "Evidence",
  provenanceClass: "PRIMARY_SOURCE",
  reviewStatus: "PENDING_HUMAN_REVIEW",
  mimeType: "text/plain",
  objectPath: "private/evidence",
  byteLength: 1,
  sha256: "b".repeat(64),
  extractionStatus: "complete",
  advisoryOnly: true,
  evidenceKind: "UPLOADED_DOCUMENT",
  ...overrides,
});

test("approved snapshots and reviewed uploads are both dossier eligible", () => {
  assert.equal(isDossierEligibleEvidence(evidence({ reviewStatus: "REVIEWED" })), true);
  assert.equal(isDossierEligibleEvidence(evidence({
    reviewStatus: "APPROVED",
    evidenceKind: "SCHWAB_MARKET_SNAPSHOT",
    dossierPrefill: prefill,
  })), true);
  assert.equal(isDossierEligibleEvidence(evidence({ reviewStatus: "REJECTED" })), false);
  assert.equal(isDossierEligibleEvidence(evidence({ reviewStatus: "REVIEWED", extractionStatus: "failed" })), false);
});

test("reviewed snapshot prefill is source-linked and valid without rewriting", () => {
  const text = buildReviewedPrefillText(prefill.suggestedTitle, prefill.ticker, [prefill]);
  assert.match(text, /Ticker: BKSC/);
  assert.match(text, /Current quote/);
  assert.match(text, /Bounded daily history/);
  assert.match(text, /Freshness: CURRENT/);
  assert.match(text, new RegExp(prefill.source.contentDigest));
  const parsed = parseResearchDigestion(text);
  assert.equal(parsed.success, true, parsed.success ? undefined : JSON.stringify(parsed.issues));
  if (parsed.success) {
    assert.equal(parsed.data.sources[0]?.title, prefill.source.title);
    assert.ok(parsed.data.sourceClaims.some((claim) =>
      claim.sourceId === "source-1"
      && claim.statement.includes(prefill.source.contentDigest),
    ));
  }
  assert.equal(isResearchContentReady(text, "placeholder", true), true);
  assert.equal(isResearchContentReady("placeholder", "placeholder", false), false);
  assert.equal(isResearchContentReady("placeholder", "placeholder", true), true);
});

test("real Schwab and SEC two-source prefill satisfies the backend digestion contract", () => {
  const secPrefill: ResearchDossierPrefill = {
    ...prefill,
    kind: "SEC_FILING",
    source: {
      ...prefill.source,
      provider: "SEC EDGAR",
      title: "SEC BKSC filing",
      contentDigest: "c".repeat(64),
    },
    sourceFacts: [{
      evidenceId: "22222222-2222-4222-8222-222222222222",
      field: "Assets",
      value: "700000000",
      unit: "USD",
      filingType: "10-Q",
      filingDate: "2026-08-01",
      accession: "0001007273-26-000001",
      sourceUrl: "https://www.sec.gov/Archives/edgar/data/1007273/fixture.htm",
      periodStart: "2026-04-01",
      periodEnd: "2026-06-30",
      tag: "Assets",
    }],
  };
  const text = buildReviewedPrefillText("BKSC Investment Research", "BKSC", [prefill, secPrefill]);
  assert.match(text, /\[source-1,source-2\]/);
  const parsed = parseResearchDigestion(text);
  assert.equal(parsed.success, true, parsed.success ? undefined : JSON.stringify(parsed.issues));
  if (!parsed.success) {
    assert.equal(parsed.issues.some((issue) => issue.code === "ambiguous_source_reference"), false);
    assert.equal(parsed.issues.some((issue) => issue.code === "invalid_inference"), false);
    return;
  }
  assert.deepEqual(parsed.data.sources.map((source) => source.title), [
    "Schwab BKSC market snapshot",
    "SEC BKSC filing",
  ]);
  assert.equal(parsed.data.sourceClaims.some((claim) => claim.sourceId === "source-1"), true);
  assert.equal(parsed.data.sourceClaims.some((claim) => claim.sourceId === "source-2"), true);
});

test("selection survives storage, reconciles refetches, and produces stable multi-ID payloads", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  } as Storage;
  storage.setItem("capital-os:research:selected-evidence", JSON.stringify(["z-id", "a-id"]));
  const loaded = loadResearchSelection(storage);
  assert.deepEqual(Array.from(reconcileSelectedEvidenceIds(loaded, ["a-id", "z-id", "new-id"])), ["z-id", "a-id"]);
  assert.deepEqual(stableEvidenceIds(loaded, ["z-id", "a-id", "new-id"]), ["a-id", "z-id"]);
  assert.deepEqual(Array.from(reconcileSelectedEvidenceIds(loaded, ["a-id"])), ["a-id"]);
});

test("exact duplicate detection uses completed dossier sources, not source ordering", () => {
  const dossier = {
    id: "dossier-1", ticker: "BKSC", createdAt: "2026-09-10T00:00:00Z", reportStatus: "COMPLETED",
    sources: [
      { id: "z-id", title: "Zulu", sourceKind: "UPLOADED_DOCUMENT", provenanceClass: "PRIMARY_SOURCE" },
      { id: "a-id", title: "Alpha", sourceKind: "SEC_FILING", provenanceClass: "PRIMARY_SOURCE" },
    ],
  };
  assert.equal(hasExactDossierEvidenceSet([dossier], "bkSC", ["a-id", "z-id"]), true);
  assert.equal(hasExactDossierEvidenceSet([dossier], "BKSC", ["a-id"]), false);
  assert.equal(hasExactDossierEvidenceSet([{ ...dossier, reportStatus: "PENDING_PROVIDER" }], "BKSC", ["a-id", "z-id"]), false);
});

test("dossiers group by ticker with newest createdAt as latest", () => {
  const dossiers = [
    { id: "old", ticker: "BKSC", title: "Old", createdAt: "2026-09-01T00:00:00Z", reportStatus: "blocked" },
    { id: "new", ticker: "BKSC", title: "New", createdAt: "2026-09-03T00:00:00Z", reportStatus: "COMPLETED" },
    { id: "other", ticker: "AAPL", title: "Other", createdAt: "2026-09-02T00:00:00Z", reportStatus: "PENDING_PROVIDER" },
  ];
  const groups = groupDossiersByTicker(dossiers);
  assert.equal(groups.find((group) => group.ticker === "BKSC")?.latest.id, "new");
  assert.deepEqual(groups.find((group) => group.ticker === "BKSC")?.history.map((item) => item.id), ["old"]);
});

test("multiple reviewed prefills retain each exact source name and source-linked facts", () => {
  const second = { ...prefill, source: { ...prefill.source, title: "Second reviewed source", contentDigest: "c".repeat(64) } };
  const text = buildReviewedPrefillText(prefill.suggestedTitle, prefill.ticker, [prefill, second]);
  assert.match(text, /Schwab BKSC market snapshot/);
  assert.match(text, /Second reviewed source/);
  assert.match(text, new RegExp(second.source.contentDigest));
  assert.match(text, /\[source-1\]/);
  assert.match(text, /\[source-2\]/);
});