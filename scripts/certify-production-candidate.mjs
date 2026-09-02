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

const certificationDbUrl = process.env.CAPITAL_OS_CERTIFICATION_DB_URL;
let cleanMigrationExecuted = false;
let cleanMigrationPassed = false;
let httpFixtureExecuted = false;
let httpFixturePassed = false;
if (!certificationDbUrl) {
  console.log("\nBLOCKED: Dedicated certification PostgreSQL URL is not configured.");
} else if (certificationDbUrl === process.env.DATABASE_URL) {
  failures.push("CAPITAL_OS_CERTIFICATION_DB_URL must not equal the shared DATABASE_URL");
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
  if (!tsxCli || !fs.existsSync(tsxCli)) {
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
    status: fixtureFailed ? "FAIL" : "BLOCKED",
    implementation: "IMPLEMENTED",
    execution: httpFixtureExecuted ? "EXECUTED (selected scenarios)" : "NOT EXECUTED",
    certification: "NOT CERTIFIED",
    reason: fixtureFailed
      ? "The database-backed HTTP fixture failed."
      : "The complete route-by-route A→A/A→B/malformed/foreign-parent/mass-assignment matrix has not executed.",
  },
  {
    id: "P0-02",
    title: "Origin / CSRF certification",
    status: !apiTests ? "FAIL" : "BLOCKED",
    implementation: "IMPLEMENTED",
    execution: apiTests ? "EXECUTED (middleware tests)" : "FAILED",
    certification: "NOT CERTIFIED",
    reason: !apiTests
      ? "The API test suite failed."
      : "Allowed, disallowed, malformed, missing, and credentialed-origin behavior has not been certified through the published production origin.",
  },
  {
    id: "P0-03",
    title: "Existing-schema upgrade",
    status: migrationFailed ? "FAIL" : "BLOCKED",
    implementation: "PARTIAL",
    execution: cleanMigrationExecuted ? "EXECUTED (clean baseline only)" : "NOT EXECUTED",
    certification: "NOT CERTIFIED",
    reason: migrationFailed
      ? "The isolated clean migration command failed."
      : "No approved historical schema artifact and data-preservation upgrade execution are available.",
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
    status: "BLOCKED",
    implementation: "PARTIAL",
    execution: "NOT EXECUTED",
    certification: "NOT CERTIFIED",
    reason: "An authenticated Clerk browser environment and approved secure test-user flow are unavailable.",
  },
  {
    id: "P0-06",
    title: "Role / effective-permission HTTP certification",
    status: fixtureFailed ? "FAIL" : "BLOCKED",
    implementation: "IMPLEMENTED",
    execution: httpFixtureExecuted ? "EXECUTED (selected roles/actions)" : "NOT EXECUTED",
    certification: "NOT CERTIFIED",
    reason: fixtureFailed
      ? "The database-backed HTTP fixture failed."
      : "The complete Owner/Partner/Advisor/Viewer grant, revoke, membership-change, and tampering matrix has not executed.",
  },
  {
    id: "P0-07",
    title: "Concurrent idempotency breadth",
    status: fixtureFailed ? "FAIL" : httpFixturePassed ? "PASS" : "BLOCKED",
    implementation: "IMPLEMENTED",
    execution: httpFixtureExecuted ? "EXECUTED (contribution, transfer, strategy allocation, capital request, distribution preparation)" : "NOT EXECUTED",
    certification: httpFixturePassed ? "CERTIFIED" : "NOT CERTIFIED",
    reason: fixtureFailed
      ? "The database-backed HTTP fixture failed."
      : httpFixturePassed
        ? "Every current idempotency-key economic write path has same-key concurrent execution in the isolated PostgreSQL fixture."
        : "The isolated PostgreSQL HTTP fixture did not execute.",
  },
  {
    id: "P0-08",
    title: "Actor attribution certification",
    status: fixtureFailed ? "FAIL" : "BLOCKED",
    implementation: "IMPLEMENTED",
    execution: httpFixtureExecuted ? "EXECUTED (representative actions)" : "NOT EXECUTED",
    certification: "NOT CERTIFIED",
    reason: fixtureFailed
      ? "The database-backed HTTP fixture failed."
      : "Persisted audit verification across all permitted representative Owner/Partner/Advisor actions has not executed.",
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