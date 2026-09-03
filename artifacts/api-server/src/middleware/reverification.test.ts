import assert from "node:assert/strict";
import test from "node:test";
import { reverificationError } from "@clerk/shared/authorization-errors";
import { hasProviderReverification } from "./reverification.ts";
import type { RequestSecurityContext } from "./request-scope.ts";

const clerkContext: RequestSecurityContext = {
  authStrength: "clerk_session",
  userId: "user_1",
  householdId: "household_1",
  role: "owner",
  permissions: ["manage_risk"],
  source: "clerk-session",
};

const testContext: RequestSecurityContext = {
  ...clerkContext,
  authStrength: "test_database",
  source: "test-database",
};

function requestWith(headers: Record<string, string>) {
  return {
    header(name: string) {
      return headers[name] ?? headers[name.toLowerCase()];
    },
  } as never;
}

test("real Clerk sessions accept only the provider reverification check", () => {
  const requested: string[] = [];
  const req = requestWith({ "X-Test-Step-Up": "verified" });
  const accepted = hasProviderReverification(req, clerkContext, () => {
    requested.push("reverification");
    return true;
  });

  assert.equal(accepted, true);
  assert.deepEqual(requested, ["reverification"]);
});

test("real Clerk sessions fail closed when provider reverification is absent", () => {
  const req = requestWith({ "X-Test-Step-Up": "verified" });
  assert.equal(hasProviderReverification(req, clerkContext, () => false), false);
});

test("the test-only header remains isolated to database fixtures", () => {
  const req = requestWith({ "X-Test-Step-Up": "verified" });
  assert.equal(hasProviderReverification(req, testContext), true);
  assert.equal(hasProviderReverification(requestWith({}), testContext), false);
});

test("the failed Clerk path uses the provider-formatted reverification hint", () => {
  assert.deepEqual(reverificationError("strict"), {
    clerk_error: {
      type: "forbidden",
      reason: "reverification-error",
      metadata: { reverification: "strict" },
    },
  });
});