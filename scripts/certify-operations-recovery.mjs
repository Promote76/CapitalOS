import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

if (!process.env.CAPITAL_OS_CERTIFICATION_DB_URL) {
  console.error("Operations recovery certification blocked: CAPITAL_OS_CERTIFICATION_DB_URL is required.");
  process.exit(1);
}
if (process.env.CAPITAL_OS_RUN_INTEGRATION !== "1") {
  console.error("Operations recovery certification blocked: set CAPITAL_OS_RUN_INTEGRATION=1.");
  process.exit(1);
}
const required = [
  "src/domain/operations.test.ts",
  "src/integration/operations-recovery.test.ts",
];
for (const file of required) {
  if (!fs.existsSync(path.join(process.cwd(), "artifacts/api-server", file))) {
    console.error(`Operations recovery certification blocked: missing required test ${file}`);
    process.exit(1);
  }
}
const result = spawnSync(path.join(process.cwd(), "scripts/node_modules/.bin/tsx"), [
  "--test", "src/domain/operations.test.ts", "src/integration/operations-recovery.test.ts",
], {
  cwd: path.join(process.cwd(), "artifacts/api-server"),
  env: { ...process.env, DATABASE_URL: process.env.CAPITAL_OS_CERTIFICATION_DB_URL },
  stdio: "inherit",
});
if (result.status !== 0) process.exit(result.status ?? 1);
const collectedGates = new Set([
  "OR-01 Durable Persistence", "OR-02 Atomic Leasing", "OR-03 Worker Heartbeat",
  "OR-04 Stale Worker Detection", "OR-09 Dead Letter", "OR-10 Operator Reprocessing",
  "OR-11 Idempotent Recovery", "OR-12 Scheduler Persistence", "OR-13 Scheduler Leadership",
  "OR-14 Missed Schedule Recovery", "OR-15 Household Isolation", "OR-22 Multi-Worker Contention",
]);
const blockedGates = [
  "OR-05 Graceful Shutdown", "OR-06 Hard Crash Recovery", "OR-07 Retry Policy", "OR-08 Backoff",
  "OR-16 Execution Control Integration", "OR-17 Guardian Integration", "OR-18 STOP During Job",
  "OR-19 Reconciliation Recovery", "OR-20 UNKNOWN Order Recovery", "OR-21 Audit Attribution",
  "OR-23 Queue Metrics", "OR-24 Scheduler Metrics",
];
console.log("\nOperations recovery certification matrix:");
for (const gate of [...collectedGates, ...blockedGates]) console.log(`${collectedGates.has(gate) ? "EVIDENCE COLLECTED" : "BLOCKED"} ${gate}`);
console.error("\nOperations recovery certification blocked: runtime evidence is incomplete for one or more required gates.");
process.exit(2);