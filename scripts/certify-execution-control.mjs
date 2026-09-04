import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const gates = [
  "EC-01 persistence and DISABLED default",
  "EC-02 household isolation",
  "EC-03 deterministic transition matrix",
  "EC-04 invalid transition denial",
  "EC-05 STOP persistence",
  "EC-06 OMS pre-intent enforcement",
  "EC-07 Guardian and risk integration",
  "EC-08 authorization and recovery verification",
  "EC-09 idempotent STOP",
  "EC-10 immutable transition audit evidence",
  "EC-11 reload/process restart persistence",
  "EC-12 database failure fail-closed behavior",
  "EC-13 concurrent transition serialization",
  "EC-14 IDOR resistance",
  "EC-15 AI and automation cannot raise authority",
  "EC-16 OpenAPI/generated contract parity",
  "EC-17 clean certification fixture execution",
];
const failures = [];
const databaseEvidenceGates = new Set([
  "EC-01", "EC-02", "EC-05", "EC-06", "EC-07", "EC-08", "EC-09",
  "EC-10", "EC-11", "EC-13", "EC-14", "EC-17",
]);

function run(label, args, env = {}) {
  const result = spawnSync("pnpm", args, {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) failures.push(`${label} exited with ${result.status ?? "a signal"}`);
}

function runTsx(label, testFiles, env = {}) {
  const result = spawnSync(path.join(root, "scripts/node_modules/.bin/tsx"), [
    "--test",
    ...testFiles,
  ], {
    cwd: path.join(root, "artifacts/api-server"),
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) failures.push(`${label} exited with ${result.status ?? "a signal"}`);
}

const apiServerPackage = path.join(root, "artifacts/api-server/package.json");
if (!fs.existsSync(apiServerPackage)) failures.push("API server package is missing");
const isolatedDatabaseEvidence = Boolean(
  process.env.CAPITAL_OS_CERTIFICATION_DB_URL &&
  process.env.CAPITAL_OS_RUN_INTEGRATION === "1",
);
runTsx("execution-control domain and integration tests", [
  "src/domain/execution-control.test.ts",
  "src/integration/execution-control.test.ts",
], isolatedDatabaseEvidence
  ? { DATABASE_URL: process.env.CAPITAL_OS_CERTIFICATION_DB_URL, CAPITAL_OS_RUN_INTEGRATION: "1" }
  : {});
run("API contract parity", ["--filter", "@workspace/api-server", "run", "check-contract"]);

if (!process.env.CAPITAL_OS_CERTIFICATION_DB_URL) {
  failures.push("EC-17 blocked: CAPITAL_OS_CERTIFICATION_DB_URL is required for isolated database evidence");
} else if (process.env.CAPITAL_OS_RUN_INTEGRATION !== "1") {
  failures.push("EC-17 blocked: set CAPITAL_OS_RUN_INTEGRATION=1 for database-backed certification");
}

console.log("\nExecution-control certification matrix:");
for (const gate of gates) {
  const id = gate.slice(0, 5);
  const blocked = databaseEvidenceGates.has(id) && !isolatedDatabaseEvidence;
  console.log(`${blocked ? "BLOCKED" : "EVIDENCE COLLECTED"} ${gate}`);
}
if (failures.length) {
  console.error("\nExecution-control certification is NOT READY:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("\nExecution-control certification passed with isolated runtime evidence.");