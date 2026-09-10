import assert from "node:assert/strict";
import test from "node:test";
import {
  capitalOsDossierContext,
  familyOfficeLabels,
  normalizeTicker,
  researchOutputSchema,
  synthesizeResearch,
  validateInvestmentDossierInput,
  type ResearchOutput,
  type ResearchAdvisorySections,
} from "./family-office.ts";

const sections: ResearchAdvisorySections = {
  fundamentals: { content: ["Revenue is stable."], evidenceIds: [], provenance: ["CAPITAL_OS_CALCULATION"] },
  valuation: { content: [], evidenceIds: [], provenance: [] },
  catalysts: { content: [], evidenceIds: [], provenance: [] },
  risks: { content: ["Liquidity may be limited."], evidenceIds: [], provenance: ["GROK_INFERENCE"] },
  downsideCase: { content: [], evidenceIds: [], provenance: [] },
  peerContext: { content: [], evidenceIds: [], provenance: [] },
  portfolioFit: { content: [], evidenceIds: [], provenance: [] },
  concentrationLiquidityRisk: { content: [], evidenceIds: [], provenance: [] },
  thesisInvalidationConditions: { content: [], evidenceIds: [], provenance: [] },
  evidenceQuality: { content: ["No additional evidence gap identified."], evidenceIds: [], provenance: [] },
};

function output(direction: ResearchOutput["analyticalDirection"], label: ResearchOutput["label"]): ResearchOutput {
  return {
    title: "Ticker dossier",
    thesis: "Advisory thesis",
    label,
    analyticalDirection: direction,
    confidence: 60,
    facts: ["Revenue is stable."],
    assumptions: [],
    risks: ["Liquidity may be limited."],
    sections,
    evidence: [{
      title: "Permitted user evidence",
      sourceKind: "SIMPLY_WALL_ST_PERMITTED_EVIDENCE",
      excerpt: "User-provided excerpt",
      classification: "reviewed_evidence",
      freshness: "current",
      confidence: 80,
    }],
  };
}

test("ticker normalization accepts symbols and rejects malformed input", () => {
  assert.equal(normalizeTicker("  brk.b "), "BRK.B");
  assert.equal(normalizeTicker("aapl"), "AAPL");
  assert.equal(normalizeTicker("not a ticker"), null);
  assert.equal(normalizeTicker(""), null);
  assert.equal(normalizeTicker("$$$$"), null);
});

test("Simply Wall St evidence requires explicit permission and keeps source categories distinct", () => {
  const base = { ticker: "AAPL", permittedEvidence: [{ title: "Metrics", excerpt: "Excerpt", permissionConfirmed: true }] };
  assert.ok(validateInvestmentDossierInput(base));
  assert.equal(validateInvestmentDossierInput({ ...base, permittedEvidence: [{ ...base.permittedEvidence[0], permissionConfirmed: false }] }), null);
  assert.equal(validateInvestmentDossierInput({ ...base, permittedEvidence: [{ title: "Metrics", excerpt: "Excerpt" }] }), null);
  const parsed = researchOutputSchema.safeParse(output("BULLISH", "WATCH"));
  assert.equal(parsed.success, true);
  assert.equal(researchOutputSchema.safeParse({ ...output("BULLISH", "WATCH"), evidence: [{ ...output("BULLISH", "WATCH").evidence[0], sourceKind: "SCHWAB_MARKET_OBSERVATION" }] }).success, true);
  assert.equal(researchOutputSchema.safeParse({ ...output("BULLISH", "WATCH"), evidence: [{ ...output("BULLISH", "WATCH").evidence[0], sourceKind: "SIMPLY_WALL_ST_PERMITTED_EVIDENCE", classification: "analyst_inference" }] }).success, true);
});

test("research response diagnostics identify bounded fields without retaining rejected values", () => {
  const base = output("BULLISH", "WATCH");
  const cases: Array<[unknown, string, string]> = [
    [{ ...base, title: "x".repeat(181) }, "$.title", "max_length"],
    [{ ...base, thesis: "x".repeat(4001) }, "$.thesis", "max_length"],
    [{ ...base, facts: ["x".repeat(1001)] }, "$.facts[0]", "max_length"],
    [{ ...base, assumptions: ["x".repeat(1001)] }, "$.assumptions[0]", "max_length"],
    [{ ...base, risks: ["x".repeat(1001)] }, "$.risks[0]", "max_length"],
    [{ ...base, evidence: [{ ...base.evidence[0], title: "x".repeat(181) }] }, "$.evidence[0].title", "max_length"],
    [{ ...base, evidence: [{ ...base.evidence[0], excerpt: "x".repeat(1501) }] }, "$.evidence[0].excerpt", "max_length"],
    [{ ...base, evidence: [{ ...base.evidence[0], classification: "x".repeat(81) }] }, "$.evidence[0].classification", "max_length"],
    [{ ...base, evidence: [{ ...base.evidence[0], classification: "unsupported_label" }] }, "$.evidence[0].classification", "invalid_enum"],
    [{ ...base, evidence: [{ ...base.evidence[0], freshness: "x".repeat(81) }] }, "$.evidence[0].freshness", "max_length"],
    [{ ...base, evidence: [{ ...base.evidence[0], sourceUrl: "not a url" }] }, "$.evidence[0].sourceUrl", "invalid_url"],
  ];
  for (const [value, path, code] of cases) {
    const result = researchOutputSchema.safeParse(value);
    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.issues[0]?.path, path);
      assert.equal(result.issues[0]?.code, code);
      assert.equal(JSON.stringify(result.issues).includes("xxxx"), false);
    }
  }
});

test("multi-agent synthesis exposes disagreements, gaps, agreements, and only allowed labels", () => {
  const synthesis = synthesizeResearch([
    output("BULLISH", "INVESTMENT_CANDIDATE"),
    output("BEARISH", "RISK_REVIEW_REQUIRED"),
    output("NEUTRAL", "WATCH"),
  ]);
  assert.ok(synthesis.agreements.length > 0);
  assert.ok(synthesis.disagreements.length > 0);
  assert.ok(synthesis.evidenceGaps.length > 0);
  assert.ok((familyOfficeLabels as readonly string[]).includes(synthesis.recommendation));
  assert.equal(synthesis.advisoryOnly, true);
  assert.equal(synthesis.pendingHumanApproval, true);
  assert.equal(synthesis.agentSummaries.length, 3);
});

test("dossier context excludes protected capital and execution authority", () => {
  const context = capitalOsDossierContext();
  assert.equal(context.firstDuplexReserveExcluded, true);
  assert.equal(context.protectedHouseholdCapitalExcluded, true);
  assert.equal(context.deployableAuthority, false);
  assert.equal("executionAuthorization" in context, false);
});