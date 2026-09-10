import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const origin = (process.env.CAPITAL_OS_PUBLISHED_ORIGIN ?? "").replace(
  /\/$/,
  "",
);
const sessionCookie =
  process.env.CAPITAL_OS_PRODUCTION_OPERATOR_SESSION_COOKIE ?? "";
const targetHouseholdId = process.env.CAPITAL_OS_PRODUCTION_HOUSEHOLD_ID ?? "";
const evidencePath = resolve(
  root,
  process.env.CAPITAL_OS_SCHWAB_RESEARCH_EVIDENCE_PATH ??
    "docs/certification/logs/SCHWAB_RESEARCH_BKSC_LATEST.json",
);
const symbol = "BKSC";
const endDate = Date.now() - 1_000;
const startDate = endDate - 30 * 86_400_000;

const routes = [
  {
    id: "instrument-fundamental",
    capability: "INSTRUMENT_FUNDAMENTAL",
    path: `/api/research/schwab/instruments?symbol=${symbol}&projection=fundamental`,
  },
  {
    id: "current-quote",
    capability: "CURRENT_QUOTE",
    path: `/api/research/schwab/quotes/${symbol}`,
  },
  {
    id: "daily-price-history",
    capability: "DAILY_PRICE_HISTORY",
    path: `/api/research/schwab/price-history?symbol=${symbol}&startDate=${startDate}&endDate=${endDate}`,
  },
];

const freshnessStates = new Set([
  "REALTIME",
  "DELAYED",
  "CURRENT",
  "AGING",
  "STALE",
]);
const providerErrorCodes = new Set([
  "TOKEN_REFRESH_REQUIRED",
  "PROVIDER_ENTITLEMENT_REQUIRED",
  "SYMBOL_NOT_FOUND",
  "PROVIDER_RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "INVALID_PROVIDER_RESPONSE",
]);
const preProviderErrorCodes = new Set([
  "AUTHENTICATION_REQUIRED",
  "HOUSEHOLD_MEMBERSHIP_REQUIRED",
  "FORBIDDEN",
  "MARKET_DATA_DISCONNECTED",
  "CONNECTION_CHANGED",
]);

function redactText(value) {
  const input = String(value);
  const withoutSession = sessionCookie
    ? input.replaceAll(sessionCookie, "[REDACTED]")
    : input;
  return withoutSession
    .replace(
      /(cookie|authorization|session|token|jwt|password|secret|otp|api[_-]?key)[=:]\s*\S+/gi,
      "$1=[REDACTED]",
    )
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[REDACTED_EMAIL]");
}

function safeError(error) {
  return redactText(error instanceof Error ? error.message : String(error));
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isIsoDate(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function fieldInventory(value, prefix = "data") {
  if (value === null) return [`${prefix}:null`];
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${prefix}:array`];
    return [`${prefix}:array`, ...fieldInventory(value[0], `${prefix}[]`)];
  }
  if (!isRecord(value)) return [`${prefix}:${typeof value}`];

  return Object.keys(value)
    .sort()
    .flatMap((key) => fieldInventory(value[key], `${prefix}.${key}`));
}

function safeProviderHeaders(body) {
  const rateLimit = isRecord(body?.rateLimit) ? body.rateLimit : {};
  return {
    providerRequestId:
      typeof body?.provenance?.providerRequestId === "string"
        ? body.provenance.providerRequestId
        : null,
    providerStatus:
      typeof body?.providerStatus === "number" ? body.providerStatus : null,
    rateLimit: {
      limit: typeof rateLimit.limit === "number" ? rateLimit.limit : null,
      remaining:
        typeof rateLimit.remaining === "number" ? rateLimit.remaining : null,
      resetAt: typeof rateLimit.resetAt === "string" ? rateLimit.resetAt : null,
      retryAfterSeconds:
        typeof rateLimit.retryAfterSeconds === "number"
          ? rateLimit.retryAfterSeconds
          : null,
    },
  };
}

function providerGetCount(status, code) {
  if (status === 200 || providerErrorCodes.has(code)) return 1;
  if (preProviderErrorCodes.has(code)) return 0;
  return null;
}

function safeBodySummary(body) {
  if (!isRecord(body)) {
    return { responseFields: [], errorCode: "INVALID_RESPONSE_BODY" };
  }
  return {
    responseFields: Object.keys(body).sort(),
    errorCode: typeof body.code === "string" ? body.code : null,
    providerSafeHeaders: safeProviderHeaders(body),
  };
}

function schemaCheck(body, route) {
  if (!isRecord(body))
    return { passed: false, reason: "The response body was not an object." };
  const provenance = isRecord(body.provenance) ? body.provenance : null;
  const rateLimit = isRecord(body.rateLimit) ? body.rateLimit : null;
  const dataPresent = Object.prototype.hasOwnProperty.call(body, "data");
  const endpoint = provenance?.providerEndpoint;
  const validEndpoint =
    endpoint === "/marketdata/v1/instruments" ||
    endpoint === "/marketdata/v1/quotes" ||
    endpoint === "/marketdata/v1/pricehistory";
  const validHash =
    typeof provenance?.payloadSha256 === "string" &&
    /^[a-f0-9]{64}$/i.test(provenance.payloadSha256);
  const validRateLimit =
    rateLimit !== null &&
    (rateLimit.limit === null || typeof rateLimit.limit === "number") &&
    (rateLimit.remaining === null || typeof rateLimit.remaining === "number") &&
    (rateLimit.resetAt === null || typeof rateLimit.resetAt === "string") &&
    (rateLimit.retryAfterSeconds === null ||
      typeof rateLimit.retryAfterSeconds === "number");
  const valid =
    body.provider === "schwab" &&
    body.providerProduct === "MARKET_DATA_PRODUCTION" &&
    body.capability === route.capability &&
    body.symbol === symbol &&
    isIsoDate(body.requestedAt) &&
    isIsoDate(body.receivedAt) &&
    body.readOnly === true &&
    body.tradingEnabled === false &&
    body.executionAuthority === "none" &&
    dataPresent &&
    provenance?.sourceClass === "SCHWAB_MARKET_DATA" &&
    validEndpoint &&
    validHash &&
    validRateLimit;
  return {
    passed: valid,
    reason: valid
      ? "The read-only Schwab envelope and allowlisted provider metadata are present."
      : "The response is missing a required read-only envelope, provider metadata, or schema field.",
  };
}

function freshnessCheck(body) {
  const knownFreshness =
    freshnessStates.has(body?.freshness) &&
    (body?.providerAsOf === null || isIsoDate(body?.providerAsOf));
  return {
    passed: knownFreshness,
    reason: knownFreshness
      ? "The provider freshness state is explicit."
      : "Provider freshness evidence is missing or invalid; the result remains blocked.",
  };
}

function check(checks, id, passed, detail, statusWhenFalse = "FAIL") {
  const result = {
    id,
    status: passed ? "PASS" : statusWhenFalse,
    detail: redactText(detail),
  };
  checks.push(result);
  console.log(`${id}: ${result.status} — ${result.detail}`);
  return passed;
}

function blocked(checks, id, detail) {
  return check(checks, id, false, detail, "BLOCKED");
}

function requireConfiguration(checks) {
  let valid = true;
  valid =
    check(
      checks,
      "SW-00-published-origin",
      /^https:\/\/[^/]+(?:\/[^/]*)?$/.test(origin),
      "A published HTTPS origin is required.",
      "BLOCKED",
    ) && valid;
  valid =
    check(
      checks,
      "SW-00-session",
      Boolean(sessionCookie),
      "A pre-approved Clerk operator session cookie is required; its value is never printed or persisted.",
      "BLOCKED",
    ) && valid;
  if (!valid) throw new Error("SCHWAB_RESEARCH_CONFIGURATION_REQUIRED");
}

function requestHeaders() {
  return {
    Accept: "application/json",
    Origin: origin,
    Cookie: sessionCookie,
  };
}

async function request(path) {
  const response = await fetch(`${origin}${path}`, {
    headers: requestHeaders(),
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  const responseText = await response.text();
  let body = null;
  try {
    body = responseText ? JSON.parse(responseText) : null;
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

async function main() {
  const checks = [];
  const evidence = {
    runner: "certify-schwab-research",
    version: "2026-09-10.published-origin.v1",
    observedAt: new Date().toISOString(),
    publishedOrigin: origin || "[missing]",
    symbol,
    sessionProvided: Boolean(sessionCookie),
    targetHouseholdConfigured: Boolean(targetHouseholdId),
    authentication: {},
    routes: [],
    providerGetCounts: {
      expectedPerRoute: 1,
      expectedTotal: routes.length,
      observedByRoute: {},
      observedTotal: 0,
    },
    checks,
    containsCredentials: false,
    executionAuthority: "none",
    dossierAccess: false,
  };

  try {
    requireConfiguration(checks);

    let authResult;
    try {
      authResult = await request("/api/auth/me");
      const body = authResult.body;
      const memberships = Array.isArray(body?.memberships)
        ? body.memberships
        : [];
      const activeMemberships = memberships.filter(
        (item) => item?.active !== false,
      );
      const targetMatched = targetHouseholdId
        ? activeMemberships.some(
            (item) => item?.householdId === targetHouseholdId,
          )
        : activeMemberships.length > 0;
      evidence.authentication = {
        routeStatus: authResult.status,
        authStrength:
          body?.authStrength === "clerk_session" ? "clerk_session" : null,
        membershipCount: memberships.length,
        activeMembershipCount: activeMemberships.length,
        targetMembershipMatched: targetMatched,
        responseFields: isRecord(body) ? Object.keys(body).sort() : [],
      };
      check(
        checks,
        "SW-01-authenticated-clerk-session",
        authResult.status === 200 &&
          body?.authStrength === "clerk_session" &&
          targetMatched,
        "The published origin returned an authenticated Clerk session with an active household membership.",
        "BLOCKED",
      );
    } catch (error) {
      evidence.authentication = {
        routeStatus: null,
        transport: "unavailable",
        error: safeError(error),
      };
      blocked(
        checks,
        "SW-01-authenticated-clerk-session",
        "The published origin authentication preflight could not complete.",
      );
    }

    for (const route of routes) {
      let result;
      try {
        result = await request(route.path);
      } catch (error) {
        const record = {
          id: route.id,
          capability: route.capability,
          path: route.path.split("?")[0],
          routeStatus: null,
          providerGetCount: null,
          responseFields: [],
          error: safeError(error),
        };
        evidence.routes.push(record);
        evidence.providerGetCounts.observedByRoute[route.id] = null;
        continue;
      }

      const summary = safeBodySummary(result.body);
      const code = summary.errorCode;
      const observedProviderGets = providerGetCount(result.status, code);
      const record = {
        id: route.id,
        capability: route.capability,
        path: route.path.split("?")[0],
        requestParameterNames: [
          ...new URL(`${origin}${route.path}`).searchParams.keys(),
        ].sort(),
        routeStatus: result.status,
        providerGetCount: observedProviderGets,
        responseFields: summary.responseFields,
        providerSafeHeaders: summary.providerSafeHeaders,
      };

      if (result.status === 200) {
        const schema = schemaCheck(result.body, route);
        const freshness = freshnessCheck(result.body);
        record.fieldInventory = schema.passed
          ? fieldInventory(result.body.data)
          : [];
        record.freshness = {
          providerAsOf: isIsoDate(result.body?.providerAsOf)
            ? result.body.providerAsOf
            : null,
          freshness: result.body?.freshness ?? null,
          realtime:
            typeof result.body?.realtime === "boolean"
              ? result.body.realtime
              : null,
          delayed:
            typeof result.body?.delayed === "boolean"
              ? result.body.delayed
              : null,
        };
        check(
          checks,
          `SW-${route.id}-route`,
          true,
          "The published research route returned HTTP 200.",
        );
        check(checks, `SW-${route.id}-schema`, schema.passed, schema.reason);
        check(
          checks,
          `SW-${route.id}-freshness`,
          freshness.passed,
          freshness.reason,
          "BLOCKED",
        );
        check(
          checks,
          `SW-${route.id}-provider-get-count`,
          observedProviderGets === 1,
          "Exactly one provider GET is represented by this single read route.",
        );
      } else {
        record.fieldInventory = [];
        record.freshness = {
          providerAsOf: null,
          freshness: null,
          realtime: null,
          delayed: null,
        };
        const blockedRoute =
          result.status === 401 ||
          result.status === 403 ||
          result.status === 409 ||
          code === "PROVIDER_ENTITLEMENT_REQUIRED" ||
          code === "TOKEN_REFRESH_REQUIRED";
        check(
          checks,
          `SW-${route.id}-route`,
          false,
          `The published research route returned HTTP ${result.status}${code ? ` (${code})` : ""}.`,
          blockedRoute ? "BLOCKED" : "FAIL",
        );
        blocked(
          checks,
          `SW-${route.id}-freshness`,
          "No provider freshness evidence was returned because the route did not produce a research envelope.",
        );
        check(
          checks,
          `SW-${route.id}-provider-get-count`,
          observedProviderGets === 1 || observedProviderGets === 0,
          "Provider GET count is recorded from the route contract without exposing provider payloads.",
          "FAIL",
        );
      }

      evidence.routes.push(record);
      evidence.providerGetCounts.observedByRoute[route.id] =
        observedProviderGets;
    }

    const observedCounts = Object.values(
      evidence.providerGetCounts.observedByRoute,
    );
    evidence.providerGetCounts.observedTotal = observedCounts.reduce(
      (total, count) => total + (typeof count === "number" ? count : 0),
      0,
    );
    check(
      checks,
      "SW-05-no-dossier-or-execution-routes",
      evidence.routes.every(
        (route) =>
          !/dossier|orders|transfers|withdraw|execution|micro-live/i.test(
            route.path,
          ),
      ),
      "Only the authenticated preflight and three fixed Schwab research paths were requested.",
    );
    check(
      checks,
      "SW-06-exactly-three-provider-gets",
      evidence.providerGetCounts.observedTotal === routes.length &&
        observedCounts.every((count) => count === 1),
      "Each research capability must account for exactly one provider GET.",
      "BLOCKED",
    );

    const failures = checks.filter((item) => item.status === "FAIL");
    const blockedChecks = checks.filter((item) => item.status === "BLOCKED");
    evidence.result = failures.length
      ? "FAIL"
      : blockedChecks.length
        ? "BLOCKED"
        : "PASS";
    return evidence;
  } catch (error) {
    evidence.result = "BLOCKED";
    evidence.error = safeError(error);
    return evidence;
  } finally {
    mkdirSync(resolve(evidencePath, ".."), { recursive: true });
    writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {
      mode: 0o600,
    });
    console.log(`Redacted evidence: ${relative(root, evidencePath)}`);
    console.log(`SCHWAB RESEARCH: ${evidence.result ?? "BLOCKED"}`);
  }
}

export {
  fieldInventory,
  freshnessCheck,
  providerGetCount,
  safeProviderHeaders,
  schemaCheck,
};

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedPath) {
  const evidence = await main();
  if (evidence.result === "FAIL") process.exitCode = 1;
  if (evidence.result === "BLOCKED") process.exitCode = 2;
}
