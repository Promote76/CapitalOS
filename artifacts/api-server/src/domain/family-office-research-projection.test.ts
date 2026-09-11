import assert from "node:assert/strict";
import test from "node:test";
import {
  buildApprovedResearchProjection,
  type ResearchProjectionEvidence,
  type ResearchProjectionProposal,
} from "./family-office-research-projection";

const householdId = "household-a";
const otherHouseholdId = "household-b";
const now = new Date("2026-09-11T12:00:00.000Z");

function proposal(overrides: Partial<ResearchProjectionProposal> = {}): ResearchProjectionProposal {
  return {
    id: "proposal-1",
    householdId,
    title: "Approved research",
    thesis: "The reviewed thesis remains suitable for advisory monitoring.",
    label: "WATCH",
    analyticalDirection: "NEUTRAL",
    confidence: "82",
    risks: ["Valuation can change."],
    ticker: "abc",
    dossierKind: "investment",
    evidenceIds: ["evidence-1", "grok-1"],
    status: "shadow_approved",
    reviewedAt: new Date("2026-09-10T12:00:00.000Z"),
    ...overrides,
  };
}

function evidence(overrides: Partial<ResearchProjectionEvidence> = {}): ResearchProjectionEvidence {
  return {
    id: "evidence-1",
    householdId,
    title: "Primary reviewed source",
    sourceKind: "PRIMARY_SOURCE",
    classification: "reviewed_uploaded_evidence",
    freshness: "unknown",
    retrievedAt: null,
    createdAt: new Date("2026-09-10T12:00:00.000Z"),
    ...overrides,
  };
}

test("projects only approved, reviewed, fresh evidence and strips raw provider evidence", () => {
    const result = buildApprovedResearchProjection({
      householdId,
      proposals: [proposal()],
      evidence: [
        evidence(),
        {
          ...evidence({
            id: "grok-1",
            title: "Raw provider output",
            sourceKind: "GROK_INFERENCE",
            classification: "provider_output",
          }),
        },
      ],
      now,
    });

    assert.equal(result.status, "available");
    assert.equal(result.projections.length, 1);
    assert.equal(result.projections[0].ticker, "ABC");
    assert.deepEqual(result.projections[0].evidenceQuality.sources, [
      { id: "evidence-1", title: "Primary reviewed source", sourceKind: "PRIMARY_SOURCE", freshness: "fresh" },
    ]);
    assert.deepEqual({
      advisoryOnly: result.projections[0].advisoryOnly,
      executionAuthorization: result.projections[0].executionAuthorization,
      householdCapitalIncluded: result.projections[0].householdCapitalIncluded,
    }, { advisoryOnly: true, executionAuthorization: false, householdCapitalIncluded: false });
    assert.equal(JSON.stringify(result).includes("Raw provider output"), false);
  });

test("preserves household isolation", () => {
    const result = buildApprovedResearchProjection({
      householdId,
      proposals: [proposal({ householdId: otherHouseholdId })],
      evidence: [evidence({ householdId: otherHouseholdId })],
      now,
    });

    assert.equal(result.status, "empty");
    assert.equal(result.projections.length, 0);
    assert.equal(result.excludedCount, 1);
  });

test("excludes pending, blocked, unreviewed, stale, and malformed records", () => {
    const proposals = [
      proposal({ id: "pending", status: "pending" }),
      proposal({ id: "blocked", status: "blocked" }),
      proposal({ id: "unreviewed", reviewedAt: null }),
      proposal({ id: "malformed", evidenceIds: ["missing"] }),
      proposal({ id: "invalid-confidence", confidence: "not-a-number" }),
      proposal({ id: "stale", evidenceIds: ["stale-evidence"] }),
    ];
    const result = buildApprovedResearchProjection({
      householdId,
      proposals,
      evidence: [
        evidence({ id: "stale-evidence", createdAt: new Date("2026-07-01T12:00:00.000Z") }),
      ],
      now,
    });

    assert.equal(result.status, "empty");
    assert.equal(result.projections.length, 0);
    assert.equal(result.excludedCount, proposals.length);
  });

test("does not create financial or execution authority", () => {
    const result = buildApprovedResearchProjection({
      householdId,
      proposals: [proposal()],
      evidence: [evidence(), evidence({
        id: "grok-1",
        sourceKind: "GROK_INFERENCE",
        classification: "provider_output",
      })],
      now,
    });

    assert.equal("balances" in result, false);
    assert.equal("allocations" in result, false);
    assert.equal("orders" in result, false);
    assert.equal("transfers" in result, false);
    assert.equal("safeToDeploy" in result, false);
  });