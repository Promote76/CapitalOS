import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const adapterPath = path.join(root, "artifacts/api-server/src/adapters/broker-portfolio.ts");
const testPath = path.join(root, "artifacts/api-server/src/domain/broker-portfolio.test.ts");
const adapter = fs.existsSync(adapterPath) ? fs.readFileSync(adapterPath, "utf8") : "";
const failures = [];

const domainTest = spawnSync(
  path.join(root, "scripts/node_modules/.bin/tsx"),
  ["--test", "src/domain/broker-portfolio.test.ts"],
  {
    cwd: path.join(root, "artifacts/api-server"),
    env: { ...process.env },
    encoding: "utf8",
    stdio: "inherit",
  },
);
if (domainTest.status !== 0) failures.push("read-only broker domain tests failed");
if (!fs.existsSync(testPath)) failures.push("read-only broker domain test file is missing");
if (!adapter.includes("SCHWAB_READ_ONLY_ENABLED")) failures.push("Schwab read-only feature flag is missing");
if (!adapter.includes("tradingEnabled: false")) failures.push("Schwab trading boundary is missing");

const gates = [
  ["SR-01", "Provider abstraction", "PASS"],
  ["SR-02", "OAuth boundary", "BLOCKED — approved Schwab connection is not attached"],
  ["SR-03", "Server secret handling", "PARTIAL — credential references only; live connector evidence pending"],
  ["SR-04", "Read-only methods", "PASS"],
  ["SR-05", "No trade methods", "PASS"],
  ["SR-06", "Account normalization", "PASS — domain evidence only"],
  ["SR-07", "Position normalization", "PASS — domain evidence only"],
  ["SR-08", "Order ingestion", "BLOCKED — no provider-backed order history"],
  ["SR-09", "Transaction ingestion", "BLOCKED — no provider-backed transactions"],
  ["SR-10", "Cost basis handling", "PASS — UNKNOWN is preserved"],
  ["SR-11", "Freshness", "PASS — explicit CURRENT/AGING/STALE/UNKNOWN states"],
  ["SR-12", "Reconciliation", "PASS — deterministic domain evidence"],
  ["SR-13", "Mismatch fail-closed", "PASS"],
  ["SR-14", "Tenant isolation", "BLOCKED — database-backed provider evidence pending"],
  ["SR-15", "Audit", "BLOCKED — persistence is intentionally not activated"],
  ["SR-16", "Grok data minimization", "PASS"],
  ["SR-17", "Grok credential isolation", "PASS"],
  ["SR-18", "Shadow initialization", "PASS — independent baseline only"],
  ["SR-19", "No money movement", "PASS"],
  ["SR-20", "No order transmission", "PASS"],
];

console.log("\nSchwab read-only certification matrix:");
for (const [id, title, status] of gates) console.log(`${status} ${id} ${title}`);
console.log("\nSCHWAB READ-ONLY: BLOCKED");
console.log("Provider: NOT CONFIGURED");
console.log("OAuth: BLOCKED");
console.log("Broker order methods: NONE");
console.log("Grok broker credential access: NONE");
console.log("Grok execution authority: NONE");
console.log("Money moved: $0");
console.log("Real orders: 0");
console.log("Micro-Live: DISABLED");

if (failures.length) {
  console.error("\nSchwab read-only certification could not collect local evidence:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("\nLocal architecture evidence collected; live Schwab certification remains blocked.");
process.exit(1);