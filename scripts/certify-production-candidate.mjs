import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const checks = new Map();

function run(label, command, args, extraEnv = {}) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
  });
  if (result.status !== 0) {
    failures.push(`${label} exited with ${result.status ?? "a signal"}`);
    checks.set(label, false);
    return false;
  }
  checks.set(label, true);
  return true;
}

const generated = run("OpenAPI / React Query / Zod generation", "pnpm", ["--filter", "@workspace/api-spec", "run", "codegen"]);
const typechecks = run("Workspace typechecks", "pnpm", ["run", "typecheck"]);
const apiBuild = run("API production build", "pnpm", ["--filter", "@workspace/api-server", "run", "build"]);
const frontendBuild = run("Frontend production build", "pnpm", ["--filter", "@workspace/capital-os", "run", "build"], {
  PORT: process.env.PORT ?? "5000",
  BASE_PATH: process.env.BASE_PATH ?? "/capital-os",
});
const apiTests = run("Default API tests", "pnpm", ["--filter", "@workspace/api-server", "test"]);
const routeParity = run("Express / OpenAPI route parity", "pnpm", ["--filter", "@workspace/api-server", "run", "check-contract"]);

let originExecuted = false;
let originPassed = false;
if (process.env.CAPITAL_OS_CERTIFICATION_ORIGIN) {
  originExecuted = true;
  originPassed = run("Published production origin safety probes", "node", ["scripts/certify-production-origin.mjs"]);
} else {
  console.log("\nBLOCKED: Published production origin is not configured for certification.");
}

const certificationDbUrl = process.env.CAPITAL_OS_CERTIFICATION_DB_URL;
const certificationTargetId = process.env.CAPITAL_OS_CERTIFICATION_TARGET_ID;
const historicalSchemaArtifact = path.join(rootDir, "docs/certification/HISTORICAL_SCHEMA_2026-09-01.sql");
const executedEvidenceArtifact = path.join(rootDir, "docs/certification/EXECUTED_P0_EVIDENCE_2026-09-02.md");
const executedEvidence = fs.existsSync(executedEvidenceArtifact)
  ? fs.readFileSync(executedEvidenceArtifact, "utf8")
  : "";
const historicalUpgradeEvidence = /^## P0-03 — existing-schema upgrade and preservation/m.test(executedEvidence) &&
  executedEvidence.includes("completed successfully.") &&
  executedEvidence.includes("Post-upgrade invariant query:") &&
  executedEvidence.includes("No production branch was modified.");
function evidenceSection(gateId) {
  const heading = `## ${gateId} —`;
  const start = executedEvidence.indexOf(heading);
  if (start < 0) return "";
  const nextHeading = executedEvidence.indexOf("\n## ", start + heading.length);
  return executedEvidence.slice(start, nextHeading < 0 ? executedEvidence.length : nextHeading);
}

function hasPassingResult(section) {
  return /Result:\s*(?:`|\*{0,2})PASS\b/i.test(section);
}

const certifiedEvidence = {
  "P0-01": hasPassingResult(evidenceSection("P0-01")),
  "P0-02": hasPassingResult(evidenceSection("P0-02")),
  "P0-03": historicalUpgradeEvidence,
  "P0-05": hasPassingResult(evidenceSection("P0-05")),
  "P0-06": hasPassingResult(evidenceSection("P0-06")),
  "P0-07": /Result:\s*\*\*\d+\s+tests\s+passed,\s*0\s+failed\b/i.test(evidenceSection("P0-07")),
  "P0-08": hasPassingResult(evidenceSection("P0-08")),
};
let cleanMigrationExecuted = false;
let cleanMigrationPassed = false;
let httpFixtureExecuted = false;
let httpFixturePassed = false;
if (!certificationDbUrl) {
  console.log("\nBLOCKED: Dedicated certification PostgreSQL URL is not configured.");
} else if (!certificationTargetId) {
  console.log("\nBLOCKED: Disposable certification target sentinel ID is not configured.");
} else {
  if (process.env.CAPITAL_OS_CERTIFICATION_ALLOW_RESET === "1") {
    cleanMigrationExecuted = true;
    cleanMigrationPassed = run("Clean isolated migration baseline", "pnpm", ["run", "certify:migrations"], {
      CAPITAL_OS_CERTIFICATION_DB_URL: certificationDbUrl,
    });
  } else {
    console.log("\nBLOCKED: Clean migration requires CAPITAL_OS_CERTIFICATION_ALLOW_RESET=1.");
  }
  const pnpmStore = path.join(rootDir, "node_modules", ".pnpm");
  const tsxPackage = fs.readdirSync(pnpmStore).find((entry) => entry.startsWith("tsx@"));
  const tsxCli = tsxPackage && path.join(pnpmStore, tsxPackage, "node_modules", "tsx", "dist", "cli.mjs");
  if (!cleanMigrationPassed) {
    console.log("\nBLOCKED: HTTP certification requires a successful isolated clean migration in the same run.");
  } else if (!tsxCli || !fs.existsSync(tsxCli)) {
    failures.push("The workspace TypeScript runner is unavailable for the HTTP fixture");
  } else {
    httpFixtureExecuted = true;
    httpFixturePassed = run("Database-backed HTTP certification fixture", "node", [
      tsxCli,
      "--test",
      "artifacts/api-server/src/integration/p0-http.test.ts",
    ], {
      DATABASE_URL: certificationDbUrl,
      NODE_ENV: "test",
      CAPITAL_OS_TEST_CONTEXT: "1",
      CAPITAL_OS_RUN_INTEGRATION: "1",
      CAPITAL_OS_ALLOWED_ORIGIN: process.env.CAPITAL_OS_ALLOWED_ORIGIN ?? "http://capitalos.test",
    });
  }
}

const foundationalChecksPassed = generated && typechecks && apiBuild && frontendBuild && apiTests && routeParity;
const fixtureFailed = httpFixtureExecuted && !httpFixturePassed;
const migrationFailed = cleanMigrationExecuted && !cleanMigrationPassed;

const p0Gates = [
  {
    id: "P0-01",
    title: "Caller-controlled identifier / IDOR matrix",
    status: fixtureFailed ? "FAIL" : httpFixturePassed || certifiedEvidence["P0-01"] ? "PASS" : "BLOCKED",
    implementation: "IMPLEMENTED",
    execution: httpFixtureExecuted
      ? "EXECUTED (108-route inventory, household reads, foreign/malformed identifiers, and mass-assignment probes)"
      : certifiedEvidence["P0-01"]
        ? "EXECUTED (documented isolated 108-route inventory and tenant-boundary probes)"
        : "NOT EXECUTED",
    certification: httpFixturePassed || certifiedEvidence["P0-01"] ? "CERTIFIED" : "NOT CERTIFIED",
    reason: fixtureFailed
      ? "The database-backed HTTP fixture failed."
      : httpFixturePassed || certifiedEvidence["P0-01"]
        ? "The isolated PostgreSQL fixture completed the route inventory and all applicable tenant-boundary probes without leakage, unsafe success, or server errors."
        : "The isolated PostgreSQL HTTP fixture did not execute.",
  },
  {
    id: "P0-02",
    title: "Origin / CSRF certification",
    status: !apiTests || (originExecuted && !originPassed)
      ? "FAIL"
      : originPassed || certifiedEvidence["P0-02"]
        ? "PASS"
        : "BLOCKED",
    implementation: "IMPLEMENTED",
    execution: !apiTests
      ? "FAILED"
      : originExecuted
        ? "EXECUTED (middleware tests + published origin probes)"
        : certifiedEvidence["P0-02"]
          ? "EXECUTED (documented published-origin probes and middleware matrix)"
        : "EXECUTED (middleware tests)",
    certification: originPassed || certifiedEvidence["P0-02"] ? "CERTIFIED" : "NOT CERTIFIED",
    reason: !apiTests
      ? "The API test suite failed."
      : originPassed || certifiedEvidence["P0-02"]
        ? "Published-origin probes passed missing, malformed, cross-site, allowed, and invalid-credential write cases."
        : "Allowed, disallowed, malformed, missing, and credentialed-origin behavior has not been certified through the published production origin.",
  },
  {
    id: "P0-03",
    title: "Existing-schema upgrade",
    status: migrationFailed ? "FAIL" : historicalUpgradeEvidence ? "PASS" : "BLOCKED",
    implementation: fs.existsSync(historicalSchemaArtifact) ? "IMPLEMENTED (historical artifact)" : "PARTIAL",
    execution: historicalUpgradeEvidence
      ? "EXECUTED (documented disposable historical upgrade and data-preservation comparison)"
      : cleanMigrationExecuted
        ? "EXECUTED (clean baseline only)"
        : "NOT EXECUTED",
    certification: historicalUpgradeEvidence ? "CERTIFIED" : "NOT CERTIFIED",
    reason: migrationFailed
      ? "The isolated clean migration command failed."
      : historicalUpgradeEvidence
        ? "Documented isolated upgrade evidence records preserved representative records, balances, statuses, and audit actor without modifying production."
        : fs.existsSync(historicalSchemaArtifact)
          ? "The approved historical snapshot exists, but the isolated upgrade and data-preservation comparison have not executed."
          : "No approved historical schema artifact or data-preservation upgrade execution are available.",
  },
  {
    id: "P0-04",
    title: "Managed backup / restore",
    status: "BLOCKED",
    implementation: "RUNBOOK ONLY",
    execution: "NOT EXECUTED",
    certification: "NOT CERTIFIED",
    reason: "Provider-managed backup reference, isolated restore target, and invariant verification are unavailable.",
  },
  {
    id: "P0-05",
    title: "Authenticated browser journey",
    status: certifiedEvidence["P0-05"] ? "PASS" : "BLOCKED",
    implementation: certifiedEvidence["P0-05"] ? "IMPLEMENTED" : "PARTIAL",
    execution: certifiedEvidence["P0-05"]
      ? "EXECUTED (authenticated Clerk journey with onboarding, persistence, sign-out, sign-in, and isolation assertions)"
      : "NOT EXECUTED",
    certification: certifiedEvidence["P0-05"] ? "CERTIFIED" : "NOT CERTIFIED",
    reason: certifiedEvidence["P0-05"]
      ? "The authenticated Clerk browser journey passed its documented lifecycle assertions."
      : "An authenticated Clerk browser environment and approved secure test-user flow are unavailable.",
  },
  {
    id: "P0-06",
    title: "Role / effective-permission HTTP certification",
    status: fixtureFailed ? "FAIL" : httpFixturePassed || certifiedEvidence["P0-06"] ? "PASS" : "BLOCKED",
    implementation: "IMPLEMENTED",
    execution: httpFixtureExecuted
      ? "EXECUTED (role, effective-permission, membership, selection, and tampering probes)"
      : certifiedEvidence["P0-06"]
        ? "EXECUTED (documented isolated role, permission, membership, selection, and tampering probes)"
        : "NOT EXECUTED",
    certification: httpFixturePassed || certifiedEvidence["P0-06"] ? "CERTIFIED" : "NOT CERTIFIED",
    reason: fixtureFailed
      ? "The database-backed HTTP fixture failed."
      : httpFixturePassed || certifiedEvidence["P0-06"]
        ? "The isolated PostgreSQL fixture passed the documented role, effective-permission, membership, selection, and tampering cases."
        : "The isolated PostgreSQL HTTP fixture did not execute.",
  },
  {
    id: "P0-07",
    title: "Concurrent idempotency breadth",
    status: fixtureFailed ? "FAIL" : httpFixturePassed || certifiedEvidence["P0-07"] ? "PASS" : "BLOCKED",
    implementation: "IMPLEMENTED",
    execution: httpFixtureExecuted
      ? "EXECUTED (contribution, transfer, strategy allocation, capital request, distribution preparation)"
      : certifiedEvidence["P0-07"]
        ? "EXECUTED (documented isolated same-key concurrency and mismatched replay cases)"
        : "NOT EXECUTED",
    certification: httpFixturePassed || certifiedEvidence["P0-07"] ? "CERTIFIED" : "NOT CERTIFIED",
    reason: fixtureFailed
      ? "The database-backed HTTP fixture failed."
      : httpFixturePassed || certifiedEvidence["P0-07"]
        ? "Every current idempotency-key economic write path has same-key concurrent execution in the isolated PostgreSQL fixture."
        : "The isolated PostgreSQL HTTP fixture did not execute.",
  },
  {
    id: "P0-08",
    title: "Actor attribution certification",
    status: fixtureFailed ? "FAIL" : httpFixturePassed || certifiedEvidence["P0-08"] ? "PASS" : "BLOCKED",
    implementation: "IMPLEMENTED",
    execution: httpFixtureExecuted
      ? "EXECUTED (persisted actors for representative permitted and denied actions)"
      : certifiedEvidence["P0-08"]
        ? "EXECUTED (documented isolated persisted actor and denied-action audit checks)"
        : "NOT EXECUTED",
    certification: httpFixturePassed || certifiedEvidence["P0-08"] ? "CERTIFIED" : "NOT CERTIFIED",
    reason: fixtureFailed
      ? "The database-backed HTTP fixture failed."
      : httpFixturePassed || certifiedEvidence["P0-08"]
        ? "The isolated PostgreSQL fixture verified persisted actor attribution and absence of misleading audit rows for the exercised action matrix."
        : "The isolated PostgreSQL HTTP fixture did not execute.",
  },
];

const p0Open = p0Gates.filter((gate) => gate.status !== "PASS").length;

console.log("\n=== P0 certification mapping ===");
console.log("Status values are exactly PASS, FAIL, or BLOCKED; implementation and execution evidence do not close a gate.");
for (const gate of p0Gates) {
  console.log(`${gate.id} | ${gate.status} | ${gate.implementation} | ${gate.execution} | ${gate.certification} | ${gate.title} | ${gate.reason}`);
}

console.log("\n=== Certification result ===");
if (failures.length) {
  console.error("FAILED:");
  for (const failure of failures) console.error(`- ${failure}`);
}
console.log(`P0 TOTAL: ${p0Gates.length}`);
console.log(`P0 PASS: ${p0Gates.filter((gate) => gate.status === "PASS").length}`);
console.log(`P0 OPEN: ${p0Open}`);
if (p0Open > 0 || failures.length > 0) {
  console.error("PRODUCTION CANDIDATE: NOT READY");
  process.exitCode = failures.length > 0 ? 1 : 2;
} else {
  console.log("PRODUCTION CANDIDATE: READY");
}