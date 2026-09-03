import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function run(label, command, args) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(command, args, { cwd: rootDir, env: process.env, stdio: "inherit" });
  if (result.status !== 0) {
    failures.push(`${label} exited with ${result.status ?? "a signal"}`);
    return false;
  }
  return true;
}

const requiredFiles = [
  "artifacts/api-server/src/domain/reliability.ts",
  "artifacts/api-server/src/domain/accounting.ts",
  "lib/db/src/schema/operations.ts",
  "docs/CAPITAL_OS_INTERNAL_RELIABILITY.md",
  "scripts/verify-future-restore.mjs",
];
const missingFiles = requiredFiles.filter((file) => !fs.existsSync(path.join(rootDir, file)));
if (missingFiles.length) failures.push(`Missing reliability artifacts: ${missingFiles.join(", ")}`);

const sourceAssertions = [
  ["operations queue states", "lib/db/src/schema/operations.ts", /QUEUED|RUNNING|DEAD_LETTERED/],
  ["micro-live failure persistence", "artifacts/api-server/src/services/micro-live.ts", /RECONCILIATION_FAILURE/],
  ["guardian fail-closed default", "artifacts/api-server/src/services/micro-live.ts", /status: heartbeat\?\.status \?\? "STOP"/],
  ["accounting scope separation", "artifacts/api-server/src/domain/accounting.ts", /separate_scope/],
];
for (const [label, file, pattern] of sourceAssertions) {
  const content = fs.existsSync(path.join(rootDir, file)) ? fs.readFileSync(path.join(rootDir, file), "utf8") : "";
  if (!pattern.test(content)) failures.push(`Source assertion failed: ${label}`);
}

run("Workspace typechecks", "pnpm", ["run", "typecheck"]) &&
  run("API reliability/domain tests", "pnpm", ["--filter", "@workspace/api-server", "run", "test"]);

console.log("\n=== Internal reliability result ===");
console.log("P1 implementation evidence is local and deterministic; authenticated contribution browser evidence and provider-supported Clerk step-up remain explicit evidence gates.");
console.log(`P1 CHECK FAILURES: ${failures.length}`);
for (const failure of failures) console.error(`- ${failure}`);
if (failures.length > 0) {
  console.error("INTERNAL RELIABILITY: NOT READY");
  process.exitCode = 1;
} else {
  console.log("INTERNAL RELIABILITY: IMPLEMENTATION CHECKS PASS");
  console.log("RELEASE STATUS: FAIL-CLOSED UNTIL OPEN EVIDENCE GATES ARE CERTIFIED");
  process.exitCode = 2;
}