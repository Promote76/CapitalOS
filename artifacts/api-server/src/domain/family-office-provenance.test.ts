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

test("structured citations map exact claim references without cross-claim expansion", () => {
  const section = { content: ["claim A"], evidenceIds: ["STRUCTURED:s1:0", "STRUCTURED:missing:9"], provenance: ["STRUCTURED_RESEARCH_DIGESTION"] };
  const empty = { content: [], evidenceIds: [], provenance: [] };
  const sections = Object.fromEntries(["fundamentals", "valuation", "catalysts", "risks", "downsideCase", "peerContext", "portfolioFit", "concentrationLiquidityRisk", "thesisInvalidationConditions", "evidenceQuality"].map((name) => [name, name === "fundamentals" ? section : empty])) as ResearchAdvisorySections;
  const mapped = remapAdvisorySections(
    sections,
    { STRUCTURED_RESEARCH_DIGESTION: ["claim-a-uuid", "claim-b-uuid"] },
    { "STRUCTURED:s1:0": "claim-a-uuid", "STRUCTURED:s2:1": "claim-b-uuid" },
  );
  assert.deepEqual(mapped.fundamentals.evidenceIds, ["claim-a-uuid"]);
  assert.deepEqual(mapped.fundamentals.provenance, ["STRUCTURED_RESEARCH_DIGESTION"]);
  assert.ok(!mapped.fundamentals.evidenceIds.includes("claim-b-uuid"));
  assert.match(mapped.evidenceQuality.content.at(-1) ?? "", /unresolved/);
});

test("uploaded research citations map only the exact reviewed evidence item", () => {
  const section = {
    content: ["Reviewed filing supports this section."],
    evidenceIds: ["REVIEWED:evidence-a"],
    provenance: ["PRIMARY_SOURCE"],
  };
  const empty = { content: [], evidenceIds: [], provenance: [] };
  const sections = Object.fromEntries(
    ["fundamentals", "valuation", "catalysts", "risks", "downsideCase", "peerContext", "portfolioFit", "concentrationLiquidityRisk", "thesisInvalidationConditions", "evidenceQuality"]
      .map((name) => [name, name === "fundamentals" ? section : empty]),
  ) as ResearchAdvisorySections;
  const mapped = remapAdvisorySections(
    sections,
    { PRIMARY_SOURCE: ["persisted-a", "persisted-b"] },
    { "REVIEWED:evidence-a": "persisted-a", "REVIEWED:evidence-b": "persisted-b" },
    { "REVIEWED:evidence-a": "PRIMARY_SOURCE", "REVIEWED:evidence-b": "PRIMARY_SOURCE" },
  );
  assert.deepEqual(mapped.fundamentals.evidenceIds, ["persisted-a"]);
  assert.deepEqual(mapped.fundamentals.provenance, ["PRIMARY_SOURCE"]);
});