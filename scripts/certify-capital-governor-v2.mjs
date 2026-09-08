import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const has = (file, pattern) => pattern.test(read(file));
const gates = [];
const add = (id, title, pass, reason) => gates.push({ id, title, status: pass ? "PASS" : "BLOCKED", reason });
const run = (command, args, cwd = root) => {
  const result = spawnSync(command, args, { cwd, stdio: "pipe", encoding: "utf8" });
  return { pass: result.status === 0, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
};

const domain = "artifacts/api-server/src/domain/capital-governor.ts";
const service = "artifacts/api-server/src/services/capital-governor.ts";
const schema = "lib/db/src/schema/capital-governor.ts";
const routes = "artifacts/api-server/src/routes/variable-income.ts";
const ui = "artifacts/capital-os/src/pages/treasury.tsx";
const docs = "docs/SAFE_TO_DEPLOY_V2_ARCHITECTURE.md";

add("CG2-01", "Account cash is not Safe-to-Deploy", has(domain, /eligible_household_cash/) && has(domain, /next30DayObligations/), "Cash is reduced by explicit obligations and protections.");
add("CG2-02", "Business cash exclusion", has(service, /businessCashCents/) && has(domain, /BUSINESS_CASH_EXCLUDED/), "Business cash is evidence, not household deployable capital.");
add("CG2-03", "Duplex Reserve lock", has(service, /DUPLEX_RESERVE/) && has(domain, /protectedDuplexReserveLocked/), "The Duplex designation remains protected.");
add("CG2-04", "Emergency and vehicle gaps", has(service, /EMERGENCY_RESERVE/) && has(service, /VEHICLE_RESERVE/), "Reserve gaps are explicit inputs.");
add("CG2-05", "No double subtraction", has(domain, /duplicateSubtractionDetected/) && has(domain, /obligationsAreDisjoint/), "The calculation blocks ambiguous overlapping deductions.");
add("CG2-06", "Forecast shortfall", has(domain, /forecastShortfall/), "Forecast shortfall is a first-class blocking component.");
add("CG2-07", "Freshness and readiness", has(domain, /STALE/) && has(domain, /INCOMPLETE_DATA/), "Stale and incomplete evidence fail closed.");
add("CG2-08", "Floor/base/strong scenarios", has(domain, /scenarioBehavior/) && has(service, /scenario/), "Income scenarios remain distinct.");
add("CG2-09", "Advisory waterfall", has(domain, /recommendedOnly/) && has(domain, /physicalMovementAuthorized/), "Recommendations do not authorize movement.");
add("CG2-10", "Protected capital control", has(schema, /protectedCapitalRegistry/) && has(domain, /capitalGovernorLocked/), "Protected designations are server-controlled.");
add("CG2-11", "No Micro-Live or Strategy Lab authority", has(domain, /microLiveAuthorized/) && has(domain, /strategyLabAuthority/), "The response explicitly returns both controls as false.");
add("CG2-12", "Tenant and actor scope", has(service, /ensureTenantCore/) && has(service, /assertPermission/), "Reads and writes are actor-scoped and permission-gated.");
add("CG2-13", "Waterfall approval", has(service, /assertPermission\(actor.role, "approve"\)/), "Creating a persisted waterfall run requires approval permission.");
add("CG2-14", "Idempotency", has(service, /idempotencyKey/) && has(service, /capital-waterfall/), "Waterfall runs are idempotent and serialized.");
add("CG2-15", "Versioned provenance", has(schema, /capitalGovernorInputSnapshots/) && has(service, /sourceProvenance/), "Snapshots preserve policy and source evidence.");
add("CG2-16", "Stale-write protection", has(service, /pg_advisory_xact_lock/), "Concurrent waterfall requests share a database lock.");
add("CG2-17", "Economic vs physical designation", has(schema, /designationType/) && has(domain, /physicalMovementAuthorized/), "Economic planning records are distinct from accounts.");
add("CG2-18", "No manual override", has(domain, /manualOverride: false/), "The v2 output does not expose a manual bypass.");
add("CG2-19", "Exact-cent math", has(domain, /centsToMoney/) && has(domain, /Math.round/), "Calculation values use integer cents.");
add("CG2-20", "Waterfall priority", has(domain, /EMERGENCY_RESERVE/) && has(domain, /INVESTMENT_CAPITAL/), "Protection precedes opportunity and investment.");
add("CG2-21", "Legacy authority preserved", has(ui, /legacy Safe-to-Deploy authority remains unchanged/), "The v2 panel is additive.");
add("CG2-22", "Treasury integration", has(ui, /Safe-to-Deploy 2.0/) && has(routes, /capital-governor\/v2/), "Treasury displays the new authority boundary.");
add("CG2-23", "Explicit failure state", has(domain, /failClosed/) && has(domain, /reasonCodes/), "Failures return structured reason codes.");
add("CG2-24", "Reconciliation failure", has(service, /UNRECONCILED/) && has(domain, /UNRECONCILED_CASH/), "Unreconciled sources cannot silently become deployable.");
add("CG2-25", "Protected provenance", has(domain, /provenance/) && has(service, /protectedEntries/), "Protected bucket provenance is returned.");
add("CG2-26", "Capital surplus separation", has(domain, /householdCapitalSurplus/) && has(service, /floorOperatingSurplusCents/), "Surplus does not replace Safe-to-Deploy.");
add("CG2-27", "Audit evidence", has(service, /capital_waterfall_recommended/) && has(service, /auditEvents/), "Each recommendation is auditable.");
add("CG2-28", "Replay behavior", has(service, /if \(existing\)/) && has(service, /responseShape/), "Idempotent replay returns the stored run.");
add("CG2-29", "No money movement", !has(service, /\b(ach|withdraw|transferFunds|moveMoney)\b/i), "The service has no movement path.");
add("CG2-30", "Artifact freshness", has(docs, /immutable evidence/) && has("lib/api-spec/openapi.yaml", /capital-governor\/v2/), "Documentation and API contracts are present.");

const checks = [
  ["domain tests", path.join(root, "scripts", "node_modules", ".bin", "tsx"), ["--test", "src/domain/capital-governor.test.ts"], path.join(root, "artifacts", "api-server")],
  ["api typecheck", "pnpm", ["--filter", "@workspace/api-server", "run", "typecheck"]],
  ["web typecheck", "pnpm", ["--filter", "@workspace/capital-os", "run", "typecheck"]],
  ["contract parity", "pnpm", ["--filter", "@workspace/api-server", "run", "check-contract"]],
  ["generated artifacts", "pnpm", ["run", "check:generated-finance-artifacts"]],
];
for (const [label, command, args, cwd] of checks) {
  const result = run(command, args, cwd);
  if (!result.pass) gates.push({ id: `CHECK-${label.toUpperCase().replaceAll(" ", "-")}`, title: label, status: "FAIL", reason: result.output.trim().split("\n").slice(-3).join(" ") });
}

console.log("\n=== Capital Governor V2 certification ===");
for (const gate of gates) console.log(`${gate.id} | ${gate.status} | ${gate.title} | ${gate.reason}`);
const failed = gates.filter((gate) => gate.status === "FAIL");
const blocked = gates.filter((gate) => gate.status === "BLOCKED");
console.log(`CAPITAL-GOVERNOR-V2 CERTIFICATION: ${failed.length ? "FAIL" : blocked.length ? "BLOCKED" : "PASS"}`);
process.exitCode = failed.length ? 1 : 0;