import assert from "node:assert/strict";
import test from "node:test";
import {
  assertAIActionAllowed,
  assertAllocationAllowed,
  assertPermission,
  assertStrategyPromotion,
  GovernanceError,
} from "./governance.ts";

test("viewer cannot mutate household capital", () => {
  assert.throws(
    () => assertPermission("viewer", "transfer"),
    (error) => error instanceof GovernanceError && error.code === "FORBIDDEN",
  );
});

test("protected capital is blocked from experimental strategy allocation", () => {
  assert.throws(
    () =>
      assertAllocationAllowed({
        proposedStrategyAllocationCents: 1_000,
        activeCapitalCents: 0,
        protectedCapitalCents: 48_260,
        maxStrategyAllocationCents: 5_000,
        maxActiveCapitalCents: 10_000,
        protectedCapitalLocked: true,
        sourceAccountProtected: true,
      }),
    (error) => error instanceof GovernanceError && error.code === "RISK_BLOCKED",
  );
});

test("strategy stages cannot be skipped without evidence", () => {
  assert.throws(
    () =>
      assertStrategyPromotion({
        fromStage: "paper",
        toStage: "production",
        evidence: { minimumObservations: true, reconciliationAccurate: true, noCriticalErrors: true },
      }),
    (error) => error instanceof GovernanceError && error.code === "INVALID_STATE",
  );
});

test("AI cannot move money even when a recommendation is approved", () => {
  assert.throws(
    () => assertAIActionAllowed("move_money"),
    (error) => error instanceof GovernanceError && error.code === "FORBIDDEN",
  );
});