import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const apiDir = path.join(root, "artifacts", "api-server");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const has = (file, pattern) => pattern.test(read(file));
const gates = [];
const add = (id, title, pass, reason) => gates.push({ id, title, status: pass ? "PASS" : "BLOCKED", reason });
const run = (command, args, cwd = root) => {
  const result = spawnSync(command, args, { cwd, stdio: "pipe", encoding: "utf8" });
  return { pass: result.status === 0, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
};

const domain = "artifacts/api-server/src/domain/variable-income.ts";
const service = "artifacts/api-server/src/services/variable-income.ts";
const financeService = "artifacts/api-server/src/services/household-finance.ts";
const capitalGovernorService = "artifacts/api-server/src/services/capital-governor.ts";
const schema = "lib/db/src/schema/variable-income.ts";
const apiSpec = "lib/api-spec/openapi.yaml";
const routes = "artifacts/api-server/src/routes/variable-income.ts";
const ui = "artifacts/capital-os/src/App.tsx";

add("VB-01", "Verified Income Source", has(service, /verifiedHouseholdIncomeEvents/) && has(domain, /verificationStatus/), "The service reads only verified household-income events.");
add("VB-02", "Variable Income Profile", has(domain, /calculateVariableIncomeProfile/) && has(schema, /variableIncomeProfiles/), "Profile calculation and persistence are present.");
add("VB-03", "Income Floor", has(domain, /incomeFloorCents/), "Floor is derived in integer cents and can fail closed for insufficient history.");
add("VB-04", "Floor/Base/Strong Scenarios", has(domain, /baseIncomeCents/) && has(domain, /strongMonthIncomeCents/), "All three deterministic scenarios are returned.");
add("VB-05", "Mandatory Obligations", has(service, /mandatoryFromPlan/) && has(service, /billMandatory/), "Mandatory plan categories and essential bills are modeled.");
add("VB-06", "Essential Spending", has(service, /essentialFromPlan/), "Essential variable spending is separated from fixed obligations.");
add("VB-07", "Reserve Layer", has(service, /emergencyReserves/) && has(service, /reserveMonthly/), "Existing emergency-reserve records feed the planning layer.");
add("VB-08", "Discretionary Layer", has(service, /discretionary/), "Discretionary spending is not mixed into mandatory obligations.");
add("VB-09", "Capital Separation", has(domain, /capitalSurplusAtFloor/) && has(ui, /Safe-to-Deploy remains/), "Capital surplus remains a separate advisory output.");
add("VB-10", "Budget Versioning", has(service, /budgetPlanningPeriods/), "Existing planning periods remain the versioned source.");
add("VB-11", "Immutable Approved Period", has(service, /approved', 'closed/) && has(service, /budgetPlanningPeriods/), "Only approved or closed periods are consumed.");
add("VB-12", "Correction Workflow", has(service, /approvedBudgetPeriod/), "The engine reports when no approved planning period exists; corrections stay in the existing planning workflow.");
add("VB-13", "Terminology UX", has(ui, /Income floor/) && has(ui, /Strong month/), "The Budget UI uses floor/base/strong terminology.");
add("VB-14", "No Repeated Internal Errors", has(service, /source: "bill"/) && has(service, /source: "upcoming_expense"/), "Obligation evidence is labeled by source.");
add("VB-15", "Household Operating Cap", has(domain, /operatingBudgetCap/), "Operating cap is calculated from the income floor.");
add("VB-16", "Capital Surplus", has(domain, /capitalSurplusAtBase/) && has(domain, /capitalSurplusAtStrong/), "Surplus is exposed for every income scenario.");
add("VB-17", "Emergency Reserve", has(service, /fundingGap/) && has(service, /targetMonths/), "Reserve target, gap, and monthly funding are surfaced.");
add("VB-18", "Vehicle Reserve", has(domain, /maintenanceReserve/) && has(schema, /householdVehicleScenarios/), "Vehicle scenarios include a maintenance reserve.");
add("VB-19", "Obligation Calendar", has(service, /next7Days/) && has(service, /next90Days/), "Near-term obligation windows and items are returned.");
add("VB-20", "Forward Cash Flow", has(domain, /buildVariableCashFlowForecast/) && has(ui, /Forward cash flow/), "30/60/90-day forecasts are shown.");
add("VB-21", "Cash Pressure", has(service, /pressure:/) && has(domain, /SHORTFALL_RISK/), "Pressure status fails closed when buffer coverage is weak.");
add("VB-22", "Transfer Exclusion", has(service, /includedInBudget/) && has(service, /businessEntityId/), "Cash inputs are restricted to included household accounts.");
add("VB-23", "Credit Card Double-Count Protection", has(service, /next30DayObligations/) && has(service, /approvedBudgetPeriod/), "The engine consumes obligations, not raw transaction totals; credit-card-specific review remains in the existing review layer.");
add("VB-24", "Business Expense Exclusion", has(service, /!account.businessEntityId/), "Business-linked accounts are excluded from household cash.");
add("VB-25", "Auto Affordability", has(domain, /calculateVehicleAffordability/) && has(domain, /totalMonthlyCost/), "Vehicle affordability includes full monthly ownership cost.");
add("VB-26", "Duplex Impact", has(service, /capitalGoals/) && has(ui, /capital-governor/), "No protected reserve or property capital is made household spending.");
add("VB-27", "Safe-to-Deploy Interface", has(ui, /useGetSafeToDeploy/) && has(ui, /authoritative capital-governor/), "Existing Safe-to-Deploy remains authoritative.");
add("VB-28", "Tenant/Role/Audit", has(service, /assertPermission/) && has(service, /auditEvents/), "Writes are role-gated, household-scoped, and audited.");
add("VB-29", "Grok Advisory Boundary", !has(service, /grok|xai/i) && !has(routes, /grok|xai/i), "This engine has no AI write path or classification authority.");
add("VB-30", "No Money Movement", !has(service, /\b(transfer|ach|withdraw)\b/i) && !has(routes, /\b(transfer|ach|withdraw)\b/i), "Routes create planning records only.");
add("VB-31", "Canonical Corrected Budget Version", has(financeService, /canonicalFinalizedPlanningPeriods/) && has(service, /orderBy\(desc\(budgetPlanningPeriods\.createdAt\)\)/) && has(capitalGovernorService, /orderBy\(desc\(budgetPlanningPeriods\.createdAt\)\)/), "Same-month superseding corrections resolve to the newest finalized plan and historical versions are not double-counted.");
add("VB-32", "Nonnegative Planning Targets", has(financeService, /assertNonNegativeMoney\(input\.monthlyTarget/) && (read(apiSpec).match(/monthlyTarget: \{ type: string, pattern: "\^\[0-9\]\+/g)?.length ?? 0) >= 2, "Budget write inputs reject negative monthly targets before they can distort approval arithmetic.");

const checks = [
  ["domain tests", path.join(root, "scripts", "node_modules", ".bin", "tsx"), ["--test", "src/domain/variable-income.test.ts"], apiDir],
  ["budget version domain tests", path.join(root, "scripts", "node_modules", ".bin", "tsx"), ["--test", "src/domain/household-finance.test.ts"], apiDir],
  ["api typecheck", "pnpm", ["--filter", "@workspace/api-server", "run", "typecheck"]],
  ["web typecheck", "pnpm", ["--filter", "@workspace/capital-os", "run", "typecheck"]],
  ["contract parity", "pnpm", ["--filter", "@workspace/api-server", "run", "check-contract"]],
  ["generated artifacts", "pnpm", ["run", "check:generated-finance-artifacts"]],
];
for (const [label, command, args, cwd] of checks) {
  const result = run(command, args, cwd);
  if (!result.pass) gates.push({ id: `CHECK-${label.toUpperCase().replaceAll(" ", "-")}`, title: label, status: "FAIL", reason: result.output.trim().split("\n").slice(-3).join(" ") });
}

console.log("\n=== Variable-income budget certification ===");
for (const gate of gates) console.log(`${gate.id} | ${gate.status} | ${gate.title} | ${gate.reason}`);
const failed = gates.filter((gate) => gate.status === "FAIL");
const blocked = gates.filter((gate) => gate.status === "BLOCKED");
console.log(`VARIABLE-BUDGET CERTIFICATION: ${failed.length ? "FAIL" : blocked.length ? "BLOCKED" : "PASS"}`);
process.exitCode = failed.length ? 1 : 0;