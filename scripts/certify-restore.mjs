import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runDir = path.join(rootDir, "docs/certification/restore-runs");
const manifestPath = process.env.CAPITAL_OS_RESTORE_CERTIFICATION_MANIFEST;
const restoreUrl = process.env.CAPITAL_OS_RESTORE_CERTIFICATION_DB_URL;
const sharedUrls = [
  process.env.DATABASE_URL,
  process.env.CAPITAL_OS_CERTIFICATION_DB_URL,
].filter(Boolean);
const gates = [
  ["RC-01", "Restore target isolation"],
  ["RC-02", "Provider recovery evidence"],
  ["RC-03", "Restore metadata"],
  ["RC-04", "Application liveness"],
  ["RC-05", "Application readiness"],
  ["RC-06", "Schema compatibility"],
  ["RC-07", "Identity integrity"],
  ["RC-08", "Tenant isolation"],
  ["RC-09", "Account integrity"],
  ["RC-10", "Ledger integrity"],
  ["RC-11", "Protected capital"],
  ["RC-12", "Safe-to-Deploy"],
  ["RC-13", "Treasury"],
  ["RC-14", "Business boundary"],
  ["RC-15", "Property state"],
  ["RC-16", "Strategy state"],
  ["RC-17", "Execution control"],
  ["RC-18", "Guardian / OMS safety"],
  ["RC-19", "Idempotency history"],
  ["RC-20", "Audit preservation"],
  ["RC-21", "Operations state"],
  ["RC-22", "Source / restore comparison"],
  ["RC-23", "Observability"],
  ["RC-24", "Observed RPO"],
  ["RC-25", "Observed RTO"],
  ["RC-26", "Production target refusal"],
];
const expectedTables = {
  users: "capital_users",
  households: "households",
  memberships: "household_members",
  accounts: "capital_accounts",
  goals: "capital_goals",
  contributions: "contributions",
  transactions: "finance_transactions",
  ledgerTransactions: "ledger_transactions",
  ledgerEntries: "ledger_entries",
  treasuryRecords: "treasury_capital_buckets",
  businesses: "business_entities",
  properties: "property_candidates",
  strategies: "strategies",
  auditEvents: "audit_events",
  idempotencyRecords: "idempotency_keys",
  executionControls: "execution_controls",
  operationsJobs: "operations_jobs",
  operationsSchedules: "operations_schedulers",
};
const results = new Map(gates.map(([id]) => [id, { status: "BLOCKED", reason: "Not executed" }]));
const comparisons = {};
const failures = [];
let manifest;
let appProcess;

function redact(value) {
  return String(value)
    .replace(/postgres(?:ql)?:\/\/[^\s"'`<>]+/gi, "[REDACTED_POSTGRES_URL]")
    .replace(/(CAPITAL_OS_[A-Z0-9_]*(?:URL|SECRET|TOKEN)|DATABASE_URL)=\S+/g, "$1=[REDACTED]");
}

function record(...values) {
  console.log(values.map(redact).join(" "));
}

function setGate(id, status, reason, details) {
  results.set(id, { status, reason, ...(details ? { details } : {}) });
  if (status === "FAIL") failures.push(`${id}: ${reason}`);
}

function blocked(id, reason) {
  setGate(id, "BLOCKED", reason);
}

function pass(id, reason, details) {
  setGate(id, "PASS", reason, details);
}

function fail(id, reason) {
  setGate(id, "FAIL", reason);
}

function canonicalTarget(raw) {
  try {
    const parsed = new URL(raw);
    if (!["postgres:", "postgresql:"].includes(parsed.protocol)) return null;
    return `${parsed.hostname.toLowerCase()}:${parsed.port || "5432"}${parsed.pathname}`;
  } catch {
    return null;
  }
}

function isLocalTarget(raw) {
  try {
    const hostname = new URL(raw).hostname.toLowerCase();
    return ["localhost", "127.0.0.1", "::1"].includes(hostname) ||
      hostname.endsWith(".local");
  } catch {
    return true;
  }
}

function readManifest() {
  if (!manifestPath) {
    blocked("RC-02", "CAPITAL_OS_RESTORE_CERTIFICATION_MANIFEST is required.");
    return null;
  }
  const absolute = path.isAbsolute(manifestPath) ? manifestPath : path.join(rootDir, manifestPath);
  if (!fs.existsSync(absolute)) {
    blocked("RC-02", "The restore manifest does not exist.");
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(absolute, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("manifest must be an object");
    return parsed;
  } catch (error) {
    fail("RC-02", `The restore manifest is invalid: ${error.message}`);
    return null;
  }
}

function required(value, label) {
  return typeof value === "string" && value.trim() ? null : `${label} is required`;
}

function parseMoney(value) {
  if (typeof value === "number") return null;
  if (typeof value !== "string" || !/^-?\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const negative = value.trim().startsWith("-");
  const absolute = value.trim().replace("-", "");
  const [whole, fraction = ""] = absolute.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return negative ? -cents : cents;
}

function normalizeJson(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value));
    } catch {
      return value;
    }
  }
  return JSON.stringify(value);
}

function runPsql(sql, label) {
  if (!restoreUrl) throw new Error(`${label}: restore target is missing`);
  const result = spawnSync("psql", [
    "--no-psqlrc",
    "--dbname",
    restoreUrl,
    "--set",
    "ON_ERROR_STOP=1",
    "--tuples-only",
    "--no-align",
    "--field-separator",
    "\t",
    "--command",
    sql,
  ], {
    cwd: rootDir,
    encoding: "utf8",
    env: { ...process.env, PGAPPNAME: "capital-os-restore-certification" },
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${redact(result.stderr || "psql failed")}`);
  }
  return result.stdout.trim();
}

function queryRows(sql, label) {
  const output = runPsql(sql, label);
  if (!output) return [];
  return output.split("\n").map((line) => line.split("\t"));
}

function queryOne(sql, label) {
  const rows = queryRows(sql, label);
  return rows[0]?.[0] ?? null;
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Unable to determine a free port.")));
        return;
      }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

function runBuild() {
  const result = spawnSync("pnpm", ["--filter", "@workspace/api-server", "run", "build"], {
    cwd: rootDir,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`API build failed: ${redact(result.stderr || result.stdout)}`);
  }
}

async function waitForHealth(baseUrl, endpoint) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}${endpoint}`);
      if (response.ok) return response.status;
    } catch {
      // The process may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
}

async function startCertificationApp() {
  runBuild();
  const port = await findFreePort();
  const env = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    DATABASE_URL: restoreUrl,
    CAPITAL_OS_ALLOWED_ORIGIN: `http://127.0.0.1:${port}`,
    CAPITAL_OS_CERTIFICATION_MODE: "1",
    OPERATIONS_WORKER_ENABLED: "0",
    OPERATIONS_SCHEDULER_ENABLED: "0",
  };
  appProcess = spawn("node", ["--enable-source-maps", "artifacts/api-server/dist/index.mjs"], {
    cwd: rootDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = [];
  appProcess.stdout.on("data", (chunk) => output.push(redact(chunk.toString())));
  appProcess.stderr.on("data", (chunk) => output.push(redact(chunk.toString())));
  const baseUrl = `http://127.0.0.1:${port}/api`;
  const live = await waitForHealth(baseUrl, "/health/live");
  const ready = await waitForHealth(baseUrl, "/health/ready");
  return { live, ready, output: output.join("") };
}

function stopCertificationApp() {
  if (!appProcess || appProcess.killed) return;
  appProcess.kill("SIGTERM");
  appProcess = undefined;
}

function assertExpectedSnapshot(snapshot) {
  const errors = [];
  if (!snapshot || typeof snapshot !== "object") return ["sourceSnapshot is required"];
  for (const key of Object.keys(expectedTables)) {
    if (!Number.isInteger(snapshot.counts?.[key]) || snapshot.counts[key] < 0) {
      errors.push(`sourceSnapshot.counts.${key} is required`);
    }
  }
  for (const key of [
    "totalDebits",
    "totalCredits",
    "protectedBalances",
    "eligibleHouseholdCash",
    "businessCash",
    "safeToDeploy",
    "treasuryTotals",
  ]) {
    if (parseMoney(snapshot.financial?.[key]) === null) {
      errors.push(`sourceSnapshot.financial.${key} must be a string with cents`);
    }
  }
  for (const key of ["users", "memberships", "households", "audit", "idempotency", "accounts"]) {
    if (typeof snapshot.identityDigests?.[key] !== "string" || !/^[a-f0-9]{32,128}$/i.test(snapshot.identityDigests[key])) {
      errors.push(`sourceSnapshot.identityDigests.${key} is required`);
    }
  }
  return errors;
}

function targetCounts() {
  const union = Object.entries(expectedTables)
    .map(([key, table]) => `SELECT '${key}' AS metric, count(*)::text AS value FROM ${table}`)
    .join(" UNION ALL ");
  return Object.fromEntries(queryRows(`${union};`, "target count snapshot").map(([key, value]) => [key, Number(value)]));
}

function targetFinancials() {
  const [row] = queryRows(`
    SELECT
      coalesce((SELECT sum(debit) FROM ledger_entries), 0)::text,
      coalesce((SELECT sum(credit) FROM ledger_entries), 0)::text,
      coalesce((SELECT sum(balance) FROM capital_accounts WHERE protected IS TRUE), 0)::text,
      coalesce((SELECT sum(current_balance) FROM treasury_capital_buckets WHERE protected IS TRUE), 0)::text,
      coalesce((SELECT sum(current_balance) FROM household_financial_accounts WHERE business_entity_id IS NULL AND protected IS FALSE), 0)::text,
      coalesce((SELECT sum(current_balance) FROM household_financial_accounts WHERE business_entity_id IS NOT NULL), 0)::text,
      coalesce((SELECT sum(safe_to_deploy) FROM finance_snapshots), 0)::text,
      coalesce((SELECT sum(current_balance) FROM treasury_capital_buckets), 0)::text
  `, "target financial snapshot");
  return {
    totalDebits: row?.[0],
    totalCredits: row?.[1],
    protectedBalances: row?.[2] && row?.[3] ? (parseMoney(row[2]) + parseMoney(row[3])).toString() : null,
    eligibleHouseholdCash: row?.[4],
    businessCash: row?.[5],
    safeToDeploy: row?.[6],
    treasuryTotals: row?.[7],
  };
}

function targetDigests() {
  const digest = (sql, label) => queryOne(sql, label);
  return {
    users: digest("SELECT md5(coalesce(string_agg(concat_ws('|', id::text, coalesce(external_auth_id, ''), status), E'\\n' ORDER BY id), '')) FROM capital_users", "user identity digest"),
    memberships: digest("SELECT md5(coalesce(string_agg(concat_ws('|', id::text, household_id::text, user_id::text, role, active::text, permissions::text), E'\\n' ORDER BY id), '')) FROM household_members", "membership identity digest"),
    households: digest("SELECT md5(coalesce(string_agg(concat_ws('|', id::text, timezone), E'\\n' ORDER BY id), '')) FROM households", "household identity digest"),
    audit: digest("SELECT md5(coalesce(string_agg(concat_ws('|', id::text, household_id::text, event_type, actor, entity, entity_id, timestamp::text), E'\\n' ORDER BY id), '')) FROM audit_events", "audit digest"),
    idempotency: digest("SELECT md5(coalesce(string_agg(concat_ws('|', id::text, household_id::text, key, operation, response_status::text, created_at::text), E'\\n' ORDER BY id), '')) FROM idempotency_keys", "idempotency digest"),
    accounts: digest("SELECT md5(coalesce(string_agg(concat_ws('|', id::text, household_id::text, balance::text, protected::text, execution_only::text), E'\\n' ORDER BY id), '')) FROM capital_accounts", "account digest"),
  };
}

function groupedStatus(table, column, label) {
  const rows = queryRows(`SELECT ${column}::text, count(*)::text FROM ${table} GROUP BY ${column} ORDER BY ${column};`, label);
  return Object.fromEntries(rows.map(([key, value]) => [key, Number(value)]));
}

function targetStatuses() {
  return {
    businesses: groupedStatus("business_entities", "status", "business status snapshot"),
    properties: groupedStatus("property_candidates", "status", "property status snapshot"),
    strategies: groupedStatus("strategies", "stage", "strategy stage snapshot"),
    treasury: {
      requests: groupedStatus("capital_requests", "status", "capital request status snapshot"),
      reservations: groupedStatus("capital_reservations", "status", "capital reservation status snapshot"),
    },
    executionControls: JSON.parse(queryOne(`
      SELECT coalesce(json_agg(json_build_object('householdId', household_id, 'state', state) ORDER BY household_id)::text, '[]')
      FROM execution_controls
    `, "execution-control snapshot") || "[]"),
  };
}

function compareCounts(source, target) {
  return Object.fromEntries(Object.keys(expectedTables).map((key) => [
    key,
    { source: source?.[key], restored: target?.[key], pass: source?.[key] === target?.[key] },
  ]));
}

function compareMoney(source, target) {
  return Object.fromEntries(Object.keys(target).map((key) => {
    const sourceCents = parseMoney(source?.[key]);
    const targetCents = parseMoney(target?.[key]);
    return [key, {
      source: source?.[key],
      restored: target?.[key],
      pass: sourceCents !== null && targetCents !== null && sourceCents === targetCents,
    }];
  }));
}

function allPassed(object) {
  return Object.values(object).every((value) => value?.pass === true);
}

function requireManifestMetadata() {
  const errors = [
    required(manifest.provider, "provider"),
    required(manifest.recoveryMethod, "recoveryMethod"),
    required(manifest.sourceEnvironment, "sourceEnvironment"),
    required(manifest.sourceDatabaseId, "sourceDatabaseId"),
    required(manifest.recoveryPointReference, "recoveryPointReference"),
    required(manifest.recoveryPointTimestamp, "recoveryPointTimestamp"),
    required(manifest.restoreTargetId, "restoreTargetId"),
    required(manifest.restoreTargetEnvironment, "restoreTargetEnvironment"),
    required(manifest.restoreStartedAt, "restoreStartedAt"),
    required(manifest.restoreCompletedAt, "restoreCompletedAt"),
  ].filter(Boolean);
  if (manifest.productionOverwritten !== false) errors.push("productionOverwritten must be false");
  if (manifest.sourceEnvironment !== "production") errors.push("sourceEnvironment must be production");
  if (manifest.restoreTargetEnvironment !== "certification") errors.push("restoreTargetEnvironment must be certification");
  if (!/^Replit managed PostgreSQL$/i.test(manifest.provider ?? "")) errors.push("provider must identify Replit managed PostgreSQL");
  if (!/^(PITR|scheduled backup|scheduled-backup)$/i.test(manifest.recoveryMethod ?? "")) errors.push("recoveryMethod must be PITR or scheduled backup");
  return errors;
}

function calculateDuration(start, end) {
  const startTime = Date.parse(start);
  const endTime = Date.parse(end);
  return Number.isFinite(startTime) && Number.isFinite(endTime) && endTime >= startTime
    ? endTime - startTime
    : null;
}

function writeEvidence() {
  fs.mkdirSync(runDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[:.]/g, "-");
  const jsonPath = path.join(runDir, `restore-${stamp}.json`);
  const reportPath = path.join(runDir, `restore-${stamp}.md`);
  const payload = {
    provider: manifest?.provider ?? null,
    recoveryMethod: manifest?.recoveryMethod ?? null,
    restoreTarget: manifest?.restoreTargetId ?? null,
    productionOverwritten: manifest?.productionOverwritten ?? null,
    gates: Object.fromEntries(results),
    comparisons,
    failures,
  };
  fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  const lines = [
    "# Managed restore certification run",
    "",
    `- Provider: ${payload.provider ?? "BLOCKED"}`,
    `- Recovery method: ${payload.recoveryMethod ?? "BLOCKED"}`,
    `- Restore target: ${payload.restoreTarget ?? "BLOCKED"}`,
    `- Production overwritten: ${payload.productionOverwritten === false ? "NO" : "NOT PROVEN"}`,
    "",
    "| Gate | Status | Reason |",
    "| --- | --- | --- |",
    ...gates.map(([id, title]) => `| ${id} ${title} | ${results.get(id).status} | ${results.get(id).reason.replace(/\|/g, "\\|")} |`),
    "",
    `Overall: ${failures.length ? "FAIL" : [...results.values()].every((value) => value.status === "PASS") ? "PASS" : "BLOCKED"}`,
    "",
    `Machine-readable evidence: ${path.relative(rootDir, jsonPath)}`,
    "",
    "No credentials or raw records are included.",
  ];
  fs.writeFileSync(reportPath, `${lines.join("\n")}\n`, { mode: 0o600 });
  record(`Evidence: ${path.relative(rootDir, reportPath)}`);
}

async function main() {
  record("Capital OS managed backup / isolated restore certification");
  manifest = readManifest();

  if (!restoreUrl) {
    blocked("RC-01", "CAPITAL_OS_RESTORE_CERTIFICATION_DB_URL is required; no database fallback is allowed.");
  } else if (isLocalTarget(restoreUrl)) {
    fail("RC-01", "The restore target must be a provider-managed remote target, not localhost.");
  } else if (!canonicalTarget(restoreUrl)) {
    fail("RC-01", "The restore target is not a PostgreSQL URL.");
  } else if (sharedUrls.some((url) => canonicalTarget(url) === canonicalTarget(restoreUrl))) {
    fail("RC-01", "The restore target matches DATABASE_URL or the normal certification target.");
  } else if (manifest?.productionOverwritten === false && manifest?.restoreTargetId) {
    pass("RC-01", "Restore target is explicit, remote, isolated, and not a shared target.");
  } else {
    blocked("RC-01", "Restore target identity and production non-overwrite evidence are incomplete.");
  }

  if (manifest) {
    const providerErrors = [
      ...requireManifestMetadata(),
      ...assertExpectedSnapshot(manifest.sourceSnapshot),
    ];
    if (providerErrors.length) {
      blocked("RC-02", providerErrors.join("; "));
      blocked("RC-03", "Provider and restore metadata are incomplete.");
    } else {
      pass("RC-02", "Provider recovery reference and source snapshot are present.");
      pass("RC-03", "Source, recovery-point, target, and restore timestamps are present.");
    }
  }

  if (!restoreUrl || !manifest || failures.length ||
      results.get("RC-01").status !== "PASS" ||
      results.get("RC-02").status !== "PASS" ||
      results.get("RC-03").status !== "PASS") {
    if (!restoreUrl) {
      for (const [id] of gates) if (results.get(id).status === "BLOCKED") blocked(id, results.get(id).reason);
    }
    writeEvidence();
    process.exitCode = failures.length ? 1 : 2;
    return;
  }

  let schemaReady = false;
  try {
    const missingTables = queryRows(`
      SELECT expected.table_name
      FROM unnest(ARRAY[${Object.values(expectedTables).map((table) => `'${table}'`).join(",")}]) AS expected(table_name)
      LEFT JOIN information_schema.tables actual
        ON actual.table_schema = 'public' AND actual.table_name = expected.table_name
      WHERE actual.table_name IS NULL
      ORDER BY expected.table_name;
    `, "schema compatibility").map(([table]) => table);
    if (missingTables.length) {
      fail("RC-06", `Missing restored tables: ${missingTables.join(", ")}`);
    } else {
      pass("RC-06", "All required application tables exist in the restored target.");
      schemaReady = true;
    }
  } catch (error) {
    fail("RC-06", error.message);
  }

  if (!schemaReady) {
    for (const [id] of gates) if (results.get(id).status === "BLOCKED") blocked(id, "Schema compatibility did not pass.");
    writeEvidence();
    process.exitCode = 1;
    return;
  }

  try {
    const counts = targetCounts();
    const financials = targetFinancials();
    const digests = targetDigests();
    const statuses = targetStatuses();
    comparisons.counts = compareCounts(manifest.sourceSnapshot.counts, counts);
    comparisons.financials = compareMoney(manifest.sourceSnapshot.financial, financials);
    comparisons.identityDigests = Object.fromEntries(Object.keys(digests).map((key) => [
      key,
      { source: manifest.sourceSnapshot.identityDigests[key], restored: digests[key], pass: manifest.sourceSnapshot.identityDigests[key] === digests[key] },
    ]));
    comparisons.statuses = statuses;

    if (allPassed(comparisons.identityDigests)) pass("RC-07", "Identity and membership digests match the pre-restore snapshot.");
    else blocked("RC-07", "Identity digest comparison did not pass.");

    const households = queryRows("SELECT id::text FROM households ORDER BY id LIMIT 2;", "restored household sample");
    const httpProbe = manifest.tenantHttpProbe;
    if (households.length >= 2 && httpProbe?.executed === true && httpProbe?.passed === true) {
      pass("RC-08", "Two restored households and real HTTP allow/deny evidence are recorded.");
    } else {
      blocked("RC-08", "Two restored households and a passing real HTTP tenant probe are required.");
    }

    if (comparisons.counts.accounts.pass && comparisons.financials.eligibleHouseholdCash.pass && comparisons.identityDigests.accounts.pass) {
      pass("RC-09", "Account counts, ownership digest, and eligible household cash match.");
    } else blocked("RC-09", "Account counts, ownership digest, or cash comparison failed.");

    const ledgerBalanced = comparisons.financials.totalDebits.pass &&
      comparisons.financials.totalCredits.pass &&
      parseMoney(financials.totalDebits) === parseMoney(financials.totalCredits);
    if (ledgerBalanced) pass("RC-10", "Restored ledger debits and credits are balanced and match the source.");
    else fail("RC-10", "Ledger totals are not balanced or do not match the source.");

    const protectedLocked = queryOne("SELECT count(*) FILTER (WHERE protected_capital_locked IS TRUE)::text || ':' || count(*)::text FROM risk_states;", "protected-capital lock state");
    if (comparisons.financials.protectedBalances.pass && protectedLocked && protectedLocked.split(":")[1] !== "0" && protectedLocked.split(":")[0] === protectedLocked.split(":")[1]) {
      pass("RC-11", "Protected balances match and all restored risk states remain locked.");
    } else blocked("RC-11", "Protected balance or lock-state evidence did not pass.");

    if (comparisons.financials.safeToDeploy.pass) pass("RC-12", "Safe-to-Deploy total matches the pre-restore snapshot.");
    else fail("RC-12", "Safe-to-Deploy changed across restore.");

    if (comparisons.financials.treasuryTotals.pass && normalizeJson(manifest.sourceSnapshot.statuses?.treasury) === normalizeJson(statuses.treasury)) {
      pass("RC-13", "Treasury totals and status evidence match.");
    } else blocked("RC-13", "Treasury total or status evidence is incomplete.");

    const businessCashMatches = comparisons.financials.businessCash.pass;
    if (comparisons.counts.businesses.pass && businessCashMatches && normalizeJson(manifest.sourceSnapshot.statuses?.businesses) === normalizeJson(statuses.businesses)) {
      pass("RC-14", "Business count, status, and operating cash boundary match.");
    } else blocked("RC-14", "Business boundary evidence is incomplete.");

    if (comparisons.counts.properties.pass && normalizeJson(manifest.sourceSnapshot.statuses?.properties) === normalizeJson(statuses.properties)) {
      pass("RC-15", "Property candidate states match without an ownership transition.");
    } else blocked("RC-15", "Property state comparison is incomplete.");

    if (comparisons.counts.strategies.pass && normalizeJson(manifest.sourceSnapshot.statuses?.strategies) === normalizeJson(statuses.strategies)) {
      pass("RC-16", "Strategy stages match without a live or funded transition.");
    } else blocked("RC-16", "Strategy state comparison is incomplete.");

    const executionStates = statuses.executionControls;
    const validExecutionStates = executionStates.every((row) => ["DISABLED", "MICRO_LIVE_ELIGIBLE", "MICRO_LIVE_ARMED", "MICRO_LIVE_ACTIVE", "SAFE_MODE", "STOP", "EVACUATE", "LOCKED"].includes(row.state));
    if (validExecutionStates && normalizeJson(manifest.sourceSnapshot.statuses?.executionControls) === normalizeJson(executionStates)) {
      pass("RC-17", "Execution-control states match exactly and remain explicit.");
    } else fail("RC-17", "Execution-control state is missing, ambiguous, or changed.");

    if (manifest.safetyEvidence?.guardianOmsReconciliation === true) {
      pass("RC-18", "Non-executing Guardian, OMS, and reconciliation evidence is present.");
    } else blocked("RC-18", "Non-executing Guardian, OMS, and reconciliation evidence is required.");

    if (comparisons.counts.idempotencyRecords.pass && comparisons.identityDigests.idempotency.pass) pass("RC-19", "Idempotency history count and digest match.");
    else fail("RC-19", "Idempotency history changed across restore.");

    if (comparisons.counts.auditEvents.pass && comparisons.identityDigests.audit.pass) pass("RC-20", "Audit count and actor/entity digest match.");
    else fail("RC-20", "Audit history changed across restore.");

    if (comparisons.counts.operationsJobs.pass && comparisons.counts.operationsSchedules.pass && manifest.operationsEvidence?.passed === true) {
      pass("RC-21", "Operations state matches and stale work was classified without execution.");
    } else blocked("RC-21", "Operations recovery evidence is incomplete.");

    const sourceRestoreComparisonPassed = allPassed(comparisons.counts) && allPassed(comparisons.financials) && allPassed(comparisons.identityDigests);
    if (sourceRestoreComparisonPassed) pass("RC-22", "All required source/restore count, financial, and digest comparisons match.");
    else fail("RC-22", "At least one source/restore comparison differs.");

    if (manifest.observabilityEvidence?.passed === true) pass("RC-23", "Restored certification instance observability evidence is present.");
    else blocked("RC-23", "Restored instance observability evidence is required.");

    const rpoMs = calculateDuration(manifest.recoveryPointTimestamp, manifest.sourceLatestAuthoritativeTimestamp);
    if (rpoMs !== null && rpoMs >= 0) pass("RC-24", `Observed RPO: ${rpoMs} ms.`, { milliseconds: rpoMs });
    else blocked("RC-24", "Observed RPO timestamps are incomplete or invalid.");

    const restoreMs = calculateDuration(manifest.restoreStartedAt, manifest.restoreCompletedAt);
    const applicationMs = calculateDuration(manifest.restoreCompletedAt, manifest.applicationReadyAt);
    const totalMs = calculateDuration(manifest.restoreStartedAt, manifest.integrityVerifiedAt);
    if ([restoreMs, applicationMs, totalMs].every((value) => value !== null)) {
      pass("RC-25", `Observed RTO: ${totalMs} ms total; restore ${restoreMs} ms; application ${applicationMs} ms.`, { restoreMs, applicationMs, totalMs });
    } else blocked("RC-25", "Observed RTO timestamps are incomplete or invalid.");

    pass("RC-26", "Production target refusal checks passed before connecting to the restore target.");
  } catch (error) {
    fail("RC-22", error.message);
  }

  try {
    const appHealth = await startCertificationApp();
    if (appHealth.live === 200) pass("RC-04", "Certification application returned liveness 200.");
    else fail("RC-04", "Certification application liveness did not return 200.");
    if (appHealth.ready === 200) pass("RC-05", "Certification application returned readiness 200.");
    else fail("RC-05", "Certification application readiness did not return 200.");
  } catch (error) {
    fail("RC-04", error.message);
    fail("RC-05", "Application readiness could not be verified.");
  } finally {
    stopCertificationApp();
  }

  writeEvidence();
  const passed = [...results.values()].filter((value) => value.status === "PASS").length;
  const blockedCount = [...results.values()].filter((value) => value.status === "BLOCKED").length;
  const failed = [...results.values()].filter((value) => value.status === "FAIL").length;
  record(`RC GATES: ${passed}/26 passed, ${blockedCount} blocked, ${failed} failed`);
  process.exitCode = failures.length ? 1 : blockedCount ? 2 : 0;
}

process.on("exit", stopCertificationApp);
await main();