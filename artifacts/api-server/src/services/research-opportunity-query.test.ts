import assert from "node:assert/strict";
import test from "node:test";
import { ListResearchOpportunitiesQueryParams } from "@workspace/api-zod";

test("Research opportunity GET filters accept only the declared contract", () => {
  assert.deepEqual(ListResearchOpportunitiesQueryParams.parse({
    universe: "INCOME",
    lens: "Balanced",
    portfolioFit: "Review",
    minScore: "80",
  }), {
    universe: "INCOME",
    lens: "Balanced",
    portfolioFit: "Review",
    minScore: 80,
  });

  for (const query of [
    { universe: "NOT_A_UNIVERSE" },
    { lens: "Momentum" },
    { portfolioFit: "Aggressive" },
    { minScore: "not-a-number" },
    { minScore: "80.5" },
    { minScore: "-1" },
    { minScore: "101" },
  ]) {
    assert.equal(ListResearchOpportunitiesQueryParams.safeParse(query).success, false);
  }
});