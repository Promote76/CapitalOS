import assert from "node:assert/strict";
import test from "node:test";
import {
  HouseholdSelectionRequired,
  requestedHouseholdId,
  selectActiveMembership,
} from "./request-context.ts";

const memberships = [
  { householdId: "household-a", role: "owner" },
  { householdId: "household-b", role: "viewer" },
];

test("multiple memberships require an explicit active household", () => {
  assert.throws(
    () => selectActiveMembership(memberships, null),
    (error) => error instanceof HouseholdSelectionRequired &&
      error.code === "HOUSEHOLD_SELECTION_REQUIRED",
  );
});

test("active household selection is restricted to memberships", () => {
  assert.equal(selectActiveMembership(memberships, "household-b").role, "viewer");
  assert.throws(() => selectActiveMembership(memberships, "other-household"), /not a member/);
});

test("a single membership preserves automatic selection", () => {
  assert.equal(selectActiveMembership([memberships[0]], null).householdId, "household-a");
});

test("the canonical selection header wins over the compatibility header", () => {
  const req = {
    header(name: string) {
      return {
        "X-Capital-OS-Household-Id": "household-b",
        "X-Household-Id": "household-a",
      }[name];
    },
  } as never;
  assert.equal(requestedHouseholdId(req), "household-b");
});