import assert from "node:assert/strict";
import test from "node:test";
import { normalizeProposalSynthesis } from "./family-office";

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