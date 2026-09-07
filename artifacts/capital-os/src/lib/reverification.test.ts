import assert from "node:assert/strict";
import test from "node:test";
import {
  extractClerkReverificationHint,
  isClerkReverificationHint,
} from "./reverification.ts";

const hint = {
  clerk_error: {
    type: "forbidden",
    reason: "reverification-error",
    metadata: { reverification: "strict" },
  },
} as const;

test("extracts Clerk reverification hints from generated API errors", () => {
  assert.deepEqual(extractClerkReverificationHint({ data: hint }), hint);
});

test("extracts Clerk reverification hints from production error envelopes", () => {
  assert.deepEqual(extractClerkReverificationHint({ error: hint }), hint);
  assert.deepEqual(extractClerkReverificationHint({ body: hint }), hint);
  assert.deepEqual(extractClerkReverificationHint({ cause: hint }), hint);
});

test("does not reinterpret unrelated forbidden responses as reverification", () => {
  assert.equal(isClerkReverificationHint({ code: "ORIGIN_NOT_ALLOWED" }), false);
  assert.equal(
    isClerkReverificationHint({
      clerk_error: {
        type: "forbidden",
        reason: "insufficient-permissions",
      },
    }),
    false,
  );
});