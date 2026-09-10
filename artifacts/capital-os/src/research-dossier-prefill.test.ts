import assert from "node:assert/strict";
import test from "node:test";
import type { ResearchDossierPrefill, ResearchEvidence } from "@workspace/api-client-react";
import {
  buildReviewedPrefillText,
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
  assert.equal(isResearchContentReady(text, "placeholder", true), true);
  assert.equal(isResearchContentReady("placeholder", "placeholder", false), false);
  assert.equal(isResearchContentReady("placeholder", "placeholder", true), true);
});