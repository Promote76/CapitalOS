import assert from "node:assert/strict";
import test from "node:test";
import { MAX_DIGESTION_BYTES, parseResearchDigestion } from "./research-digestion.ts";

const valid = {
  security: { ticker: "msft" },
  company: { name: "Microsoft Corporation" },
  references: [{ source_id: "s1", name: "Filing", link: "https://example.com/filing" }],
  claims: [{ source_id: "s1", text: "Revenue increased." }],
  derivedInsights: [{ text: "The business is resilient.", basis_source_ids: ["s1"], confidence: 0.8 }],
};
const parse = (value: unknown) => parseResearchDigestion(JSON.stringify(value));

test("digestion parser canonicalizes common nested aliases and preserves separation", () => {
  const result = parse(valid);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.ticker, "MSFT");
    assert.equal(result.data.sources[0].url, "https://example.com/filing");
    assert.deepEqual(result.data.sourceClaims, [{ sourceId: "s1", statement: "Revenue increased." }]);
    assert.equal(result.data.inferences?.[0].basisSourceIds[0], "s1");
    assert.match(result.data.fingerprint, /^[a-f0-9]{64}$/);
  }
});

test("Capital OS investment-research compatibility format normalizes linked facts and conclusions", () => {
  const result = parse({
    document_type: "capital_os_investment_research_digestion",
    schema_version: "1.0",
    generated_at: "2026-09-09T00:00:00Z",
    security: { ticker: "bksc", company_name: "Bank of South Carolina Corporation" },
    source_registry: [{
      source_id: "annual-report",
      source_name: "2025 Annual Report",
      source_url: "https://example.com/bksc-annual-report",
      source_type: "annual-report",
      published_at: "2025-12-31",
    }],
    factual_claims: [{
      claim_id: "fact-1",
      category: "fundamentals",
      statement: "Reported deposits increased.",
      source_ids: ["annual-report"],
    }],
    sections: {
      valuation: [{
        conclusion: "Valuation should be reviewed against verified book value.",
        citations: ["annual-report"],
        confidence: 0.72,
        author: "ChatGPT",
      }],
    },
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.ticker, "BKSC");
    assert.equal(result.data.company, "Bank of South Carolina Corporation");
    assert.deepEqual(result.data.sourceClaims, [{ sourceId: "annual-report", statement: "Reported deposits increased." }]);
    assert.deepEqual(result.data.inferences?.[0].basisSourceIds, ["annual-report"]);
  }
});

test("Capital OS compatibility format remains strict and requires provenance links", () => {
  const base = {
    document_type: "capital_os_investment_research",
    security: { ticker: "BKSC", company_name: "Bank of South Carolina Corporation" },
    source_registry: [{ source_id: "s1", source_name: "Filing" }],
    factual_claims: [{ statement: "Revenue increased." }],
    analytical_inferences: [{ conclusion: "Momentum improved.", source_ids: ["s1"], confidence: 0.7 }],
  };
  assert.equal(parse(base).success, false);
  assert.equal(parse({ ...base, factual_claims: [{ statement: "Revenue increased.", source_ids: ["s1"] }], arbitrary: true }).success, false);
  assert.equal(parse({ ...base, factual_claims: [{ statement: "Revenue increased.", source_ids: ["s1"] }], valuation: ["Unsupported unlinked conclusion"] }).success, false);
  assert.equal(parse({
    ...base,
    factual_claims: [{ statement: "Revenue increased.", source_ids: ["s1"] }],
    analytical_inferences: [{ conclusion: "Momentum improved.", source_ids: [], confidence: 0.7 }],
  }).success, false);
  assert.equal(parse({
    ...base,
    factual_claims: [{ statement: "Revenue increased.", source_ids: ["s1"] }],
    format: "unrecognized",
  }).success, false);
  assert.equal(parse({
    ...base,
    ticker: "OTHER",
    factual_claims: [{ statement: "Revenue increased.", source_ids: ["s1"] }],
  }).success, false);
  const linkedConclusion = { conclusion: "Momentum improved.", source_ids: ["s1"], confidence: 0.7 };
  assert.equal(parse({
    ...base,
    factual_claims: [{ statement: "Revenue increased.", source_ids: ["s1"] }],
    valuation: [linkedConclusion],
    sections: { valuation: [{ ...linkedConclusion, conclusion: "Momentum weakened." }] },
  }).success, false);
  const equalDuplicate = parse({
    ...base,
    factual_claims: [{ statement: "Revenue increased.", source_ids: ["s1"] }],
    valuation: [linkedConclusion],
    sections: { valuation: [linkedConclusion] },
  });
  assert.equal(equalDuplicate.success, true);
  if (equalDuplicate.success) assert.equal(equalDuplicate.data.inferences?.length, 2);
});

test("digestion parser returns safe issues for invalid JSON and required fields", () => {
  assert.equal(parseResearchDigestion("{").issues[0]?.code, "invalid_json");
  for (const field of ["ticker", "company", "sources", "sourceClaims"]) {
    const copy = structuredClone(valid);
    if (field === "ticker") delete (copy.security as Record<string, unknown>).ticker;
    if (field === "company") delete (copy.company as Record<string, unknown>).name;
    if (field === "sources") copy.references = [];
    if (field === "sourceClaims") copy.claims = [];
    assert.equal(parse(copy).success, false, field);
  }
});

test("digestion parser rejects conflicting aliases, duplicate IDs, and bad references", () => {
  assert.equal(parse({ ...valid, ticker: "AAPL" }).success, false);
  assert.equal(parse({ ...valid, references: [{ id: "s1", title: "A" }, { id: "s1", title: "B" }] }).success, false);
  assert.equal(parse({ ...valid, claims: [{ sourceId: "missing", statement: "x" }] }).success, false);
});

test("digestion parser rejects unsafe URLs and malformed confidence", () => {
  assert.equal(parse({ ...valid, references: [{ id: "s1", title: "A", url: "http://example.com" }] }).success, false);
  assert.equal(parse({ ...valid, derivedInsights: [{ statement: "x", basisSourceIds: ["s1"], confidence: 2 }] }).success, false);
});

test("digestion parser rejects unknown keys and contradictory populated aliases", () => {
  assert.equal(parse({ ...valid, unexpected: true }).success, false);
  assert.equal(parse({ ...valid, ticker: "AAPL", symbol: "MSFT" }).success, false);
  assert.equal(parse({ ...valid, references: valid.references, sources: [{ id: "other", title: "Other" }] }).success, false);
});

test("equivalent duplicate aliases are accepted without changing claims", () => {
  const result = parse({ ...valid, ticker: "MSFT", symbol: "MSFT", sources: valid.references, sourceClaims: valid.claims });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.sourceClaims[0].statement, "Revenue increased.");
});

test("nested aliases conflict by field and accept normalized equivalents", () => {
  assert.equal(parse({ ...valid, references: [{ id: "s1", source_id: "other", title: "A" }] }).success, false);
  assert.equal(parse({ ...valid, references: [{ id: "s1", source_id: "s1", title: "A", name: " A " }] }).success, true);
  assert.equal(parse({ ...valid, claims: [{ sourceId: "s1", source_id: "other", statement: "x" }] }).success, false);
  assert.equal(parse({ ...valid, derivedInsights: [{ statement: "x", text: " x ", basisSourceIds: ["s1"], basis_source_ids: ["s1"], confidence: 0.2 }] }).success, true);
});

test("digestion parser rejects oversized, deeply nested, and container-explosion payloads", () => {
  assert.equal(parseResearchDigestion("x".repeat(MAX_DIGESTION_BYTES + 1)).success, false);
  let deep: unknown = valid;
  for (let i = 0; i < 14; i++) deep = { x: deep };
  assert.equal(parse(deep).success, false);
  assert.equal(parse({ ...valid, junk: Array.from({ length: 151 }, () => "x") }).success, false);
});