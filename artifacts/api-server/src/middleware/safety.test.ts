import assert from "node:assert/strict";
import test from "node:test";
import { writeBoundary } from "./safety.ts";

function runBoundary(
  env: Record<string, string | undefined>,
  headers: Record<string, string> = {},
  method = "POST",
) {
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
    method,
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

test("the complete production origin matrix covers every state-changing method", () => {
  const methods = ["POST", "PUT", "PATCH", "DELETE"];
  const cases: Array<{
    name: string;
    headers: Record<string, string>;
    statusCode: number;
    code: string | undefined;
  }> = [
    {
      name: "same origin",
      headers: { Origin: "https://capital.example", "Sec-Fetch-Site": "same-origin" },
      statusCode: 200,
      code: undefined,
    },
    {
      name: "explicitly allowed origin",
      headers: { Origin: "https://capital.example", "Sec-Fetch-Site": "same-site" },
      statusCode: 200,
      code: undefined,
    },
    {
      name: "disallowed origin",
      headers: { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" },
      statusCode: 403,
      code: "CSRF_BLOCKED",
    },
    {
      name: "malformed origin",
      headers: { Origin: "not a URL", "Sec-Fetch-Site": "same-origin" },
      statusCode: 403,
      code: "ORIGIN_NOT_ALLOWED",
    },
    {
      name: "missing origin",
      headers: { "Sec-Fetch-Site": "same-origin" },
      statusCode: 403,
      code: "ORIGIN_NOT_ALLOWED",
    },
    {
      name: "cross-site credentialed request",
      headers: { Origin: "https://capital.example", "Sec-Fetch-Site": "cross-site" },
      statusCode: 403,
      code: "CSRF_BLOCKED",
    },
  ];

  for (const method of methods) {
    for (const scenario of cases) {
      const result = runBoundary(
        { NODE_ENV: "production", CAPITAL_OS_ALLOWED_ORIGIN: "https://capital.example" },
        scenario.headers,
        method,
      );
      assert.equal(result.statusCode, scenario.statusCode, `${method} ${scenario.name}`);
      assert.equal(result.continued, scenario.statusCode === 200, `${method} ${scenario.name}`);
      if (scenario.code) {
        assert.equal((result.payload as { code: string }).code, scenario.code, `${method} ${scenario.name}`);
      }
    }
  }
});