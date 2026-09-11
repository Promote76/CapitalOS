import assert from "node:assert/strict";
import test from "node:test";
import { researchContextUiState } from "./research-context-state";

test("research context UI exposes safe loading, error, empty, and available states", () => {
  assert.equal(researchContextUiState({ isLoading: true, isError: false }), "loading");
  assert.equal(researchContextUiState({ isLoading: false, isError: true }), "error");
  assert.equal(researchContextUiState({ isLoading: false, isError: false, data: { researchContext: { status: "empty" } } }), "empty");
  assert.equal(researchContextUiState({ isLoading: false, isError: false, data: { researchContext: { status: "available" } } }), "available");
});