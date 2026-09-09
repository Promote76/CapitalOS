import assert from "node:assert/strict";
import test from "node:test";
import { normalizeProposalSynthesis, projectSchwabResearchObservation } from "./family-office";

test("legacy proposals fail closed when their synthesis predates the response contract", () => {
  assert.deepEqual(normalizeProposalSynthesis({}), {
    agreements: [],
    disagreements: [],
    evidenceGaps: ["Historical proposal has no complete multi-agent synthesis."],
    recommendation: "INSUFFICIENT_EVIDENCE",
    advisoryOnly: true,
    pendingHumanApproval: true,
    agentSummaries: [],
  });
});


test("complete proposal synthesis is preserved", () => {
  const synthesis = {
    agreements: ["Cash flow is positive."],
    disagreements: [],
    evidenceGaps: ["No audited statement."],
    recommendation: "WATCH" as const,
    advisoryOnly: true as const,
    pendingHumanApproval: true as const,
    agentSummaries: [{ agent: "portfolio-cio", thesis: "Watch pending evidence.", confidence: 55 }],
  };

  assert.deepEqual(normalizeProposalSynthesis(synthesis), synthesis);
});

test("Schwab quote projection carries normalized price and provenance without account data", () => {
  assert.deepEqual(projectSchwabResearchObservation({
    ticker: "AAPL",
    positions: [{ symbol: "AAPL", accountId: "must-not-leak", quantity: "2" }],
    quotes: [{
      symbol: "aapl",
      assetType: "EQUITY",
      marketPrice: "227.42",
      providerTimestamp: "2026-09-08T20:40:00.000Z",
      receivedAt: "2026-09-08T20:40:01.000Z",
      dataFreshness: "CURRENT",
      accountId: "must-not-leak",
    }, { symbol: "MSFT", marketPrice: "500" }],
    marketClock: { marketOpen: true },
    freshness: "CURRENT",
    asOf: "2026-09-08T20:40:01.000Z",
  }), {
    ticker: "AAPL",
    positions: [{ symbol: "AAPL", quantity: "2" }],
    quotes: [{
      symbol: "aapl",
      assetType: "EQUITY",
      marketPrice: "227.42",
      providerTimestamp: "2026-09-08T20:40:00.000Z",
      receivedAt: "2026-09-08T20:40:01.000Z",
      dataFreshness: "CURRENT",
    }],
    marketClock: { marketOpen: true },
    freshness: "CURRENT",
    asOf: "2026-09-08T20:40:01.000Z",
  });
});