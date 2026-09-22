import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const origin = (process.env.CAPITAL_OS_PUBLISHED_ORIGIN ?? "").replace(/\/$/, "");
const sessionCookie = process.env.CAPITAL_OS_PRODUCTION_OPERATOR_SESSION_COOKIE ?? "";
const targetHouseholdId = process.env.CAPITAL_OS_PRODUCTION_HOUSEHOLD_ID ?? "";
const cleanupHouseholdId = process.env.CAPITAL_OS_SCHWAB_DISPOSABLE_HOUSEHOLD_ID ?? "";
const cleanupRequested = process.env.CAPITAL_OS_SCHWAB_CLEANUP === "1";
const cleanupNamePrefix = process.env.CAPITAL_OS_SCHWAB_CLEANUP_NAME_PREFIX ?? "Schwab certification";
const evidencePath = resolve(
  root,
  process.env.CAPITAL_OS_SCHWAB_PORTFOLIO_EVIDENCE_PATH ??
    "docs/certification/logs/SCHWAB_PORTFOLIO_SYNC_LATEST.json",
);
const today = new Date().toISOString().slice(0, 10);
const adapterPath = resolve(root, "artifacts/api-server/src/adapters/broker-portfolio.ts");
const routePath = resolve(root, "artifacts/api-server/src/routes/schwab.ts");
const appPath = resolve(root, "artifacts/capital-os/src/App.tsx");
const domainTestPath = resolve(root, "artifacts/api-server/src/domain/broker-portfolio.test.ts");

const checks = [];
const evidence = {
  runner: "certify-schwab-read-only",
  version: "2026-09-22.portfolio-sync.v1",
  observedAt: new Date().toISOString(),
  today,
  publishedOrigin: origin || "[missing]",
  sessionProvided: Boolean(sessionCookie),
  targetHouseholdConfigured: Boolean(targetHouseholdId),
  authentication: {},
  before: {},
  sync: {},
  after: {},
  browser: {},
  cleanup: {
    status: cleanupRequested ? "PENDING" : "NOT_REQUESTED",
    householdPurged: false,
    reason: cleanupRequested
      ? "Cleanup is restricted to an explicitly named disposable development household."
      : "Set CAPITAL_OS_SCHWAB_CLEANUP=1 with a disposable household UUID to enable cleanup.",
  },
  checks,
  containsCredentials: false,
  executionAuthority: "none",
  moneyMovement: "none",
  result: "BLOCKED",
};

function redactText(value) {
  return String(value)
    .replaceAll(sessionCookie, sessionCookie ? "[REDACTED]" : "")
    .replace(
      /(cookie|authorization|session|token|jwt|password|secret|otp|api[_-]?key)[=:]\s*\S+/gi,
      "$1=[REDACTED]",
    )
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[REDACTED_EMAIL]");
}

function safeError(error) {
  return redactText(error instanceof Error ? error.message : String(error));
}

function redactId(value) {
  if (!value) return null;
  const text = String(value);
  return `${text.slice(0, 6)}…${text.slice(-4)}`;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function check(id, passed, detail, statusWhenFalse = "FAIL", extra = {}) {
  const result = {
    id,
    status: passed ? "PASS" : statusWhenFalse,
    detail: redactText(detail),
    ...extra,
  };
  checks.push(result);
  console.log(`${id}: ${result.status} — ${result.detail}`);
  return passed;
}

function blocked(id, detail, extra = {}) {
  return check(id, false, detail, "BLOCKED", extra);
}

function requireConfiguration() {
  let valid = true;
  valid = check(
    "SW-00-published-origin",
    /^https:\/\/[^/]+(?:\/[^/]*)?$/.test(origin),
    "A published HTTPS origin is required for provider-backed evidence.",
    "BLOCKED",
  ) && valid;
  valid = check(
    "SW-00-session",
    Boolean(sessionCookie),
    "A pre-approved Clerk operator session cookie is required; its value is never printed or persisted.",
    "BLOCKED",
  ) && valid;
  valid = check(
    "SW-00-household",
    /^[0-9a-f-]{36}$/i.test(targetHouseholdId),
    "The authenticated target household UUID is required.",
    "BLOCKED",
  ) && valid;
  return valid;
}

function requestHeaders() {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Origin: origin,
    Cookie: sessionCookie,
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${origin}${path}`, {
    ...options,
    headers: { ...requestHeaders(), ...(options.headers ?? {}) },
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { text: redactText(text).slice(0, 300) };
  }
  return { status: response.status, body };
}

function snapshotSummary(body) {
  const snapshot = isRecord(body?.snapshot) ? body.snapshot : null;
  const positions = Array.isArray(snapshot?.positions) ? snapshot.positions : [];
  const transactions = Array.isArray(snapshot?.transactions) ? snapshot.transactions : [];
  const trades = transactions.filter((transaction) => transaction?.transactionClass === "trade");
  const todayTrades = trades.filter((transaction) => {
    const timestamp = typeof transaction?.transactionTimestamp === "string"
      ? transaction.transactionTimestamp
      : typeof transaction?.providerTimestamp === "string"
        ? transaction.providerTimestamp
        : null;
    return timestamp?.slice(0, 10) === today;
  });
  return {
    status: body?.status ?? null,
    dataMode: body?.dataMode ?? null,
    readOnly: body?.readOnly === true,
    tradingEnabled: body?.tradingEnabled ?? null,
    lastSuccessfulSyncAt: typeof body?.lastSuccessfulSyncAt === "string" ? body.lastSuccessfulSyncAt : null,
    capturedAt: typeof snapshot?.capturedAt === "string" ? snapshot.capturedAt : null,
    freshness: snapshot?.freshness ?? null,
    positionCount: positions.length,
    transactionCount: transactions.length,
    tradeCount: trades.length,
    todayTradeCount: todayTrades.length,
    todayTradeSymbols: [...new Set(todayTrades.map((trade) => typeof trade?.symbol === "string" ? trade.symbol : null).filter(Boolean))].slice(0, 25),
    counts: isRecord(snapshot?.counts) ? snapshot.counts : {},
  };
}

function portfolioSummary(body) {
  return {
    totalCapital: body?.totalCapital ?? null,
    protectedCapital: body?.protectedCapital ?? null,
    activeCapital: body?.activeCapital ?? null,
    cashReserve: body?.cashReserve ?? null,
    ledgerBalanced: body?.ledgerBalanced ?? null,
    composition: Array.isArray(body?.composition)
      ? body.composition.map((item) => ({
        label: item?.label ?? null,
        amount: item?.amount ?? null,
        percent: item?.percent ?? null,
      }))
      : [],
  };
}

function stable(value) {
  return JSON.stringify(value);
}

function cookiesFromHeader(value) {
  return value
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.includes("="))
    .map((part) => {
      const index = part.indexOf("=");
      return { name: part.slice(0, index), value: part.slice(index + 1) };
    });
}

function runLocalEvidence() {
  const adapter = existsSync(adapterPath) ? readFileSync(adapterPath, "utf8") : "";
  const route = existsSync(routePath) ? readFileSync(routePath, "utf8") : "";
  const app = existsSync(appPath) ? readFileSync(appPath, "utf8") : "";
  const domainTest = spawnSync(
    resolve(root, "scripts/node_modules/.bin/tsx"),
    ["--test", "src/domain/broker-portfolio.test.ts"],
    {
      cwd: resolve(root, "artifacts/api-server"),
      env: { ...process.env },
      encoding: "utf8",
      stdio: "inherit",
    },
  );

  check(
    "SW-LOCAL-domain-tests",
    domainTest.status === 0,
    "Read-only broker domain tests pass.",
    "FAIL",
  );
  check("SW-LOCAL-domain-test-file", existsSync(domainTestPath), "The broker domain test file exists.");
  check("SW-LOCAL-feature-flag", adapter.includes("SCHWAB_READ_ONLY_ENABLED"), "The read-only provider feature flag is present.");
  check("SW-LOCAL-trading-disabled", adapter.includes("tradingEnabled: false"), "The Schwab adapter keeps trading disabled.");
  check(
    "SW-LOCAL-portfolio-projection",
    app.includes("Schwab observed holdings") &&
      app.includes("Recent Schwab trades") &&
      app.includes("No ledger transactions were created."),
    "Portfolio renders observed holdings and trades with an explicit no-ledger-mutation message.",
  );
  check(
    "SW-LOCAL-route-inventory",
    !/router\.(?:get|post|put|patch|delete)\(["'][^"']*(?:order|place|replace|cancel|transfer|withdraw|execution|micro-live)/i.test(route),
    "The Schwab route inventory contains no order, execution, or money-movement endpoint.",
  );
}

async function verifyBrowser(afterSnapshot) {
  const requireFromApiServer = createRequire(resolve(root, "artifacts/api-server/package.json"));
  const { chromium } = requireFromApiServer("@playwright/test");
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? "/repl/tools/bin/chromium",
    headless: true,
  });
  try {
    const context = await browser.newContext();
    const cookies = cookiesFromHeader(sessionCookie).map((cookie) => ({ ...cookie, url: origin }));
    if (cookies.length === 0) throw new Error("The operator session cookie did not contain a browser cookie pair");
    await context.addCookies(cookies);
    const page = await context.newPage();
    const response = await page.goto(`${origin}/portfolio`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const responseStatus = response?.status() ?? null;
    await page.getByText("Schwab observed holdings", { exact: true }).waitFor({ state: "visible", timeout: 15_000 });
    await page.getByText("Recent Schwab trades", { exact: true }).waitFor({ state: "visible", timeout: 15_000 });
    const section = page.locator("section").filter({ hasText: "Recent Schwab trades" }).first();
    const visibleTradeRows = await section.locator(".activity-item").count();
    const bodyText = await page.locator("body").innerText();
    const hasEmptyTradeMessage = bodyText.includes("No trade transactions were returned in the latest observation.");
    const hasSnapshotTimestamp = afterSnapshot.capturedAt
      ? bodyText.includes(new Date(afterSnapshot.capturedAt).toLocaleString("en-US", { timeZone: "UTC" }).split(",")[0])
      : false;
    evidence.browser = {
      route: "/portfolio",
      responseStatus,
      reloaded: true,
      holdingsSectionVisible: true,
      tradesSectionVisible: true,
      visibleTradeRows,
      hasEmptyTradeMessage,
      hasSnapshotTimestamp,
    };
    check(
      "SW-05-portfolio-browser",
      responseStatus === 200 &&
        visibleTradeRows >= afterSnapshot.todayTradeCount &&
        !hasEmptyTradeMessage,
      "A fresh Portfolio reload rendered the observed holdings and today’s trade transactions.",
      "FAIL",
    );
  } finally {
    await browser.close();
  }
}

async function cleanupDisposableHousehold() {
  if (!cleanupRequested) return;
  if (process.env.REPLIT_ENVIRONMENT === "production") {
    evidence.cleanup = {
      status: "BLOCKED",
      householdPurged: false,
      reason: "Direct household cleanup is never allowed against a production environment.",
    };
    blocked("SW-10-disposable-cleanup", evidence.cleanup.reason);
    return;
  }
  if (
    !/^[0-9a-f-]{36}$/i.test(cleanupHouseholdId) ||
    cleanupHouseholdId !== targetHouseholdId
  ) {
    evidence.cleanup = {
      status: "BLOCKED",
      householdPurged: false,
      reason: "Cleanup UUID must be a valid UUID matching the authenticated target household.",
    };
    blocked("SW-10-disposable-cleanup", evidence.cleanup.reason);
    return;
  }
  if (evidence.sync.routeStatus !== 200 || evidence.browser.reloaded !== true) {
    evidence.cleanup = {
      status: "BLOCKED",
      householdPurged: false,
      reason: "Cleanup is withheld until sync and Portfolio browser evidence have completed.",
    };
    blocked("SW-10-disposable-cleanup", evidence.cleanup.reason);
    return;
  }

  const databaseUrl = process.env.CAPITAL_OS_SCHWAB_CLEANUP_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    evidence.cleanup = {
      status: "BLOCKED",
      householdPurged: false,
      reason: "A development cleanup database connection is required.",
    };
    blocked("SW-10-disposable-cleanup", evidence.cleanup.reason);
    return;
  }

  const requireFromDb = createRequire(resolve(root, "lib/db/package.json"));
  const pg = requireFromDb("pg");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    const candidate = await pool.query(
      "SELECT name FROM households WHERE id = $1 LIMIT 1",
      [cleanupHouseholdId],
    );
    const name = candidate.rows[0]?.name;
    if (typeof name !== "string" || !name.startsWith(cleanupNamePrefix)) {
      evidence.cleanup = {
        status: "BLOCKED",
        householdPurged: false,
        reason: "The target household does not carry the required disposable certification name prefix.",
      };
      blocked("SW-10-disposable-cleanup", evidence.cleanup.reason);
      return;
    }
    const deleted = await pool.query(
      "DELETE FROM households WHERE id = $1 AND name LIKE $2 RETURNING id",
      [cleanupHouseholdId, `${cleanupNamePrefix}%`],
    );
    const purged = deleted.rowCount === 1;
    evidence.cleanup = {
      status: purged ? "PASS" : "FAIL",
      householdPurged: purged,
      reason: purged
        ? "The explicitly marked disposable household and cascading certification data were removed."
        : "The disposable household was not removed.",
    };
    check("SW-10-disposable-cleanup", purged, evidence.cleanup.reason, "FAIL");
  } catch (error) {
    evidence.cleanup = {
      status: "FAIL",
      householdPurged: false,
      reason: safeError(error),
    };
    check("SW-10-disposable-cleanup", false, evidence.cleanup.reason, "FAIL");
  } finally {
    await pool.end();
  }
}

async function runLiveEvidence() {
  if (!requireConfiguration()) return;

  let auth;
  try {
    auth = await request("/api/auth/me");
  } catch (error) {
    blocked("SW-01-authenticated-session", `The authenticated session preflight failed: ${safeError(error)}`);
    return;
  }
  const memberships = Array.isArray(auth.body?.memberships) ? auth.body.memberships : [];
  const matchedMembership = memberships.some(
    (membership) => membership?.active !== false && membership?.householdId === targetHouseholdId,
  );
  evidence.authentication = {
    routeStatus: auth.status,
    authStrength: auth.body?.authStrength === "clerk_session" ? "clerk_session" : null,
    membershipCount: memberships.length,
    targetHousehold: redactId(targetHouseholdId),
    targetMembershipMatched: matchedMembership,
  };
  if (!check(
    "SW-01-authenticated-session",
    auth.status === 200 && auth.body?.authStrength === "clerk_session" && matchedMembership,
    "The target household is authenticated through a live Clerk session.",
    "BLOCKED",
  )) return;

  const status = await request("/api/integrations/schwab/status");
  if (!check(
    "SW-02-live-connection",
    status.status === 200 &&
      status.body?.connectionStatus === "LIVE_CONNECTED" &&
      status.body?.dataMode === "LIVE_CONNECTED" &&
      status.body?.readOnly === true &&
      status.body?.tradingEnabled === false,
    "The target household has a healthy read-only Schwab connection.",
    "BLOCKED",
  )) return;
  const beforePortfolio = await request("/api/portfolio");
  const beforeObservation = await request("/api/integrations/schwab/observations/latest");
  evidence.before = {
    portfolio: portfolioSummary(beforePortfolio.body),
    observation: snapshotSummary(beforeObservation.body),
  };
  if (beforePortfolio.status !== 200) {
    blocked("SW-03-portfolio-before", "The baseline Portfolio response was not available.");
    return;
  }

  const sync = await request("/api/integrations/schwab/sync", { method: "POST" });
  evidence.sync = {
    routeStatus: sync.status,
    status: sync.body?.status ?? null,
    dataMode: sync.body?.dataMode ?? null,
    responseFields: isRecord(sync.body) ? Object.keys(sync.body).sort() : [],
  };
  if (!check(
    "SW-04-sync",
    sync.status === 200 && sync.body?.status === "SYNCED" && sync.body?.dataMode === "LIVE_CONNECTED",
    "The authenticated household completed the read-only Schwab sync path.",
    "BLOCKED",
  )) return;

  const afterPortfolio = await request("/api/portfolio");
  const afterObservation = await request("/api/integrations/schwab/observations/latest");
  const after = snapshotSummary(afterObservation.body);
  const afterLedger = portfolioSummary(afterPortfolio.body);
  evidence.after = { portfolio: afterLedger, observation: after };
  const beforeSnapshotAt = evidence.before.observation.capturedAt
    ? Date.parse(evidence.before.observation.capturedAt)
    : 0;
  const afterSnapshotAt = after.capturedAt ? Date.parse(after.capturedAt) : 0;
  check(
    "SW-06-fresh-snapshot",
    afterSnapshotAt > 0 &&
      (beforeSnapshotAt === 0 || afterSnapshotAt > beforeSnapshotAt) &&
      Boolean(after.lastSuccessfulSyncAt),
    "The sync recorded a fresh snapshot and successful-sync timestamp.",
    "FAIL",
  );
  check(
    "SW-07-positions-and-today-trades",
    after.positionCount > 0 && after.todayTradeCount > 0,
    "The latest observation contains current positions and at least one trade transaction dated today.",
    "FAIL",
    { positionCount: after.positionCount, todayTradeCount: after.todayTradeCount },
  );
  check(
    "SW-08-ledger-unchanged",
    stable(evidence.before.portfolio) === stable(afterLedger),
    "Portfolio ledger totals and composition are unchanged by observation sync.",
    "FAIL",
  );
  check(
    "SW-09-no-execution-authority",
    afterObservation.body?.readOnly === true &&
      afterObservation.body?.tradingEnabled === false &&
      sync.body?.dataMode === "LIVE_CONNECTED",
    "The sync response remains explicitly read-only with trading disabled.",
    "FAIL",
  );
  await verifyBrowser(after);
}

async function main() {
  console.log("\nSchwab read-only Portfolio certification:");
  runLocalEvidence();
  try {
    await runLiveEvidence();
  } catch (error) {
    blocked("SW-LIVE-unhandled", `Live certification stopped safely: ${safeError(error)}`);
  }
  try {
    await cleanupDisposableHousehold();
  } catch (error) {
    evidence.cleanup = {
      status: "FAIL",
      householdPurged: false,
      reason: safeError(error),
    };
    check("SW-10-disposable-cleanup", false, evidence.cleanup.reason, "FAIL");
  }
  if (!origin || !sessionCookie || !targetHouseholdId) {
    blocked(
      "SW-LIVE-provider-evidence",
      "Live provider evidence was not collected because origin, authenticated session, or target household configuration is missing.",
    );
  }
  const failures = checks.filter((item) => item.status === "FAIL");
  const blockedChecks = checks.filter((item) => item.status === "BLOCKED");
  evidence.result = failures.length ? "FAIL" : blockedChecks.length ? "BLOCKED" : "PASS";
  mkdirSync(resolve(evidencePath, ".."), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  console.log(`Redacted evidence: ${relative(root, evidencePath)}`);
  console.log(`SCHWAB PORTFOLIO SYNC: ${evidence.result}`);
  return evidence;
}

export { portfolioSummary, snapshotSummary };

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedPath) {
  const result = await main();
  if (result.result === "FAIL") process.exitCode = 1;
  if (result.result === "BLOCKED") process.exitCode = 2;
}