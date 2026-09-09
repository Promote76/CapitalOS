import { test } from "node:test";
import assert from "node:assert/strict";
import { remapAdvisorySections, sanitizeProviderEvidence, type ResearchOutput, type ResearchAdvisorySections } from "./family-office";

test("provider cannot assert authoritative evidence provenance", () => {
  const output = {
    evidence: [
      { title: "fabricated", sourceKind: "PUBLIC_WEB_RETRIEVAL", excerpt: "x", classification: "x", freshness: "x", confidence: 1 },
      { title: "manual", sourceKind: "SIMPLY_WALL_ST_PERMITTED_EVIDENCE", excerpt: "x", classification: "x", freshness: "x", confidence: 1 },
    ],
  } as ResearchOutput;
  assert.deepEqual(sanitizeProviderEvidence(output).evidence.map((x) => x.sourceKind), ["GROK_INFERENCE", "GROK_INFERENCE"]);
});

test("section IDs come only from supported persisted provenance", () => {
  const section = { content: ["x"], evidenceIds: ["model-id"], provenance: ["PUBLIC_WEB_RETRIEVAL", "SCHWAB_MARKET_OBSERVATION", "GROK_INFERENCE"] };
  const sections = Object.fromEntries(["fundamentals", "valuation", "catalysts", "risks", "downsideCase", "peerContext", "portfolioFit", "concentrationLiquidityRisk", "thesisInvalidationConditions", "evidenceQuality"].map((name) => [name, section])) as ResearchAdvisorySections;
  const mapped = remapAdvisorySections(sections, { PUBLIC_WEB_RETRIEVAL: ["web-id"], GROK_INFERENCE: ["grok-id"] });
  assert.deepEqual(mapped.fundamentals.provenance, ["PUBLIC_WEB_RETRIEVAL", "GROK_INFERENCE"]);
  assert.deepEqual(mapped.fundamentals.evidenceIds, ["web-id", "grok-id"]);
});