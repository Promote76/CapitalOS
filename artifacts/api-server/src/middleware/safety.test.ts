import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRateLimitKey,
  rateLimit,
  setRateLimitStoreForTests,
  trustedProxySetting,
  writeBoundary,
} from "./safety.ts";

function runBoundary(
  env: Record<string, string | undefined>,
  headers: Record<string, string> = {},
  method = "POST",
) {
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    allowedOrigin: process.env.CAPITAL_OS_ALLOWED_ORIGIN,
    allowedOrigins: process.env.CAPITAL_OS_ALLOWED_ORIGINS,
    testContext: process.env.CAPITAL_OS_TEST_CONTEXT,
  };
  for (const [key, value] of Object.entries({
    NODE_ENV: env.NODE_ENV,
    CAPITAL_OS_ALLOWED_ORIGIN: env.CAPITAL_OS_ALLOWED_ORIGIN,
    CAPITAL_OS_ALLOWED_ORIGINS: env.CAPITAL_OS_ALLOWED_ORIGINS,
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
  process.env.CAPITAL_OS_ALLOWED_ORIGINS = previous.allowedOrigins;
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

test("writes accept any exact origin in the configured allowlist", () => {
  const result = runBoundary(
    {
      NODE_ENV: "production",
      CAPITAL_OS_ALLOWED_ORIGIN: "https://capital.example",
      CAPITAL_OS_ALLOWED_ORIGINS: "https://capital-custom.example, https://capital-alt.example",
    },
    { Origin: "https://capital-custom.example", "Sec-Fetch-Site": "same-origin" },
  );
  assert.equal(result.statusCode, 200);
  assert.equal(result.continued, true);
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

function runRateLimit(
  method: string,
  store: { consume: () => Promise<{
    allowed: boolean;
    count: number;
    resetAt: Date;
  }> },
) {
  const req = {
    method,
    path: "/api/transfers",
    ip: "203.0.113.10",
    socket: { remoteAddress: "10.0.0.4" },
    header() {
      return undefined;
    },
  } as never;
  let statusCode = 200;
  let payload: unknown;
  let continued = false;
  const responseHeaders = new Map<string, number | string>();
  const res = {
    locals: { correlationId: "test-correlation" },
    setHeader(name: string, value: number | string) {
      responseHeaders.set(name, value);
      return this;
    },
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      payload = value;
      return this;
    },
  } as never;
  setRateLimitStoreForTests(store);
  return rateLimit(req, res, () => {
    continued = true;
  }).then(() => ({ statusCode, payload, continued, responseHeaders }));
}

test("rate-limit keys include route, actor, household, and client network", () => {
  const req = {
    method: "POST",
    path: "/api/transfers/123e4567-e89b-12d3-a456-426614174000",
    ip: "203.0.113.10",
    socket: { remoteAddress: "10.0.0.4" },
    header(name: string) {
      return name === "X-Test-Household-Id" ? "household-1" : undefined;
    },
  } as never;
  const res = {
    locals: {
      securityContext: { userId: "user-1" },
      householdId: "household-1",
    },
  } as never;
  process.env.NODE_ENV = "test";
  process.env.CAPITAL_OS_TEST_CONTEXT = "1";
  const key = buildRateLimitKey(req, res);
  assert.match(key, /POST:api\/transfers\/:id/);
  assert.match(key, /actor:user-1/);
  assert.match(key, /household:household-1/);
  assert.match(key, /network:203\.0\.113\.10/);
});

test("protected mutations fail closed when the shared limiter is unavailable", async () => {
  const result = await runRateLimit("POST", {
    async consume() {
      throw new Error("database unavailable");
    },
  });
  assert.equal(result.statusCode, 503);
  assert.equal(result.continued, false);
  assert.equal((result.payload as { code: string }).code, "RATE_LIMITER_UNAVAILABLE");
});

test("read traffic preserves liveness while the limiter is unavailable", async () => {
  const result = await runRateLimit("GET", {
    async consume() {
      throw new Error("database unavailable");
    },
  });
  assert.equal(result.statusCode, 200);
  assert.equal(result.continued, true);
});

test("rate-limit responses include a retry window", async () => {
  const result = await runRateLimit("POST", {
    async consume() {
      return { allowed: false, count: 121, resetAt: new Date(Date.now() + 30_000) };
    },
  });
  assert.equal(result.statusCode, 429);
  assert.equal(result.continued, false);
  assert.equal(result.responseHeaders.get("Retry-After"), 30);
});

test("trusted proxy configuration never trusts forwarded addresses by default", () => {
  assert.equal(trustedProxySetting({ NODE_ENV: "development" }), false);
  assert.deepEqual(
    trustedProxySetting({
      NODE_ENV: "production",
      CAPITAL_OS_TRUSTED_PROXY: "10.0.0.0/8, 192.0.2.10",
    }),
    ["10.0.0.0/8", "192.0.2.10"],
  );
  assert.throws(
    () => trustedProxySetting({ NODE_ENV: "production" }),
    /CAPITAL_OS_TRUSTED_PROXY/,
  );
});