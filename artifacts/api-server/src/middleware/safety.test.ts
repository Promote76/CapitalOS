import assert from "node:assert/strict";
import test from "node:test";
import { writeBoundary } from "./safety.ts";

function runBoundary(env: Record<string, string | undefined>, headers: Record<string, string> = {}) {
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    allowedOrigin: process.env.CAPITAL_OS_ALLOWED_ORIGIN,
    testContext: process.env.CAPITAL_OS_TEST_CONTEXT,
  };
  for (const [key, value] of Object.entries({
    NODE_ENV: env.NODE_ENV,
    CAPITAL_OS_ALLOWED_ORIGIN: env.CAPITAL_OS_ALLOWED_ORIGIN,
    CAPITAL_OS_TEST_CONTEXT: env.CAPITAL_OS_TEST_CONTEXT,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const req = {
    method: "POST",
    header(name: string) {
      return headers[name] ?? headers[name.toLowerCase()];
    },
  } as never;
  let statusCode = 200;
  let payload: unknown;
  let continued = false;
  const res = {
    locals: { correlationId: "test-correlation" },
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      payload = value;
      return this;
    },
  } as never;
  writeBoundary(req, res, () => {
    continued = true;
  });
  process.env.NODE_ENV = previous.nodeEnv;
  process.env.CAPITAL_OS_ALLOWED_ORIGIN = previous.allowedOrigin;
  process.env.CAPITAL_OS_TEST_CONTEXT = previous.testContext;
  return { statusCode, payload, continued };
}

test("writes fail closed when no origin allowlist is configured", () => {
  const result = runBoundary({ NODE_ENV: "production", CAPITAL_OS_ALLOWED_ORIGIN: undefined });
  assert.equal(result.statusCode, 403);
  assert.equal(result.continued, false);
  assert.equal((result.payload as { code: string }).code, "ORIGIN_POLICY_MISSING");
});

test("cross-site writes are blocked even with an allowed origin configured", () => {
  const result = runBoundary(
    { NODE_ENV: "production", CAPITAL_OS_ALLOWED_ORIGIN: "https://capital.example" },
    { Origin: "https://capital.example", "Sec-Fetch-Site": "cross-site" },
  );
  assert.equal(result.statusCode, 403);
  assert.equal(result.continued, false);
  assert.equal((result.payload as { code: string }).code, "CSRF_BLOCKED");
});

test("the database-backed test context can exercise writes without weakening production policy", () => {
  const result = runBoundary(
    { NODE_ENV: "test", CAPITAL_OS_ALLOWED_ORIGIN: undefined, CAPITAL_OS_TEST_CONTEXT: "1" },
  );
  assert.equal(result.continued, true);
  assert.equal(result.statusCode, 200);
});