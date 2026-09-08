import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const date = "2026-09-08";
const certificationDir = path.join(root, "docs", "certification");
const artifactPath = path.join(certificationDir, `DOCUMENT_BUDGET_BRIDGE_CERTIFICATION_${date}.md`);
const logPath = path.join(certificationDir, "logs", `DOCUMENT_BUDGET_BRIDGE_CERTIFICATION_${date}.log`);
const apiDir = path.join(root, "artifacts", "api-server");
const tsx = path.join(root, "scripts", "node_modules", ".bin", "tsx");
const log = [];

function record(message = "") {
  const safe = String(message)
    .replace(/postgres(?:ql)?:\/\/[^\s"'`<>]+/gi, "[REDACTED_POSTGRES_URL]")
    .replace(/(DATABASE_URL|CAPITAL_OS_CERTIFICATION_DB_URL)=\S+/g, "$1=[REDACTED]");
  log.push(safe);
  process.stdout.write(safe.endsWith("\n") ? safe : `${safe}\n`);
}

function read(relative) {
  const file = path.join(root, relative);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function evidence(requirements) {
  return requirements.every(([file, pattern]) => pattern.test(read(file)));
}

function run(label, command, args, cwd = root, env = {}) {
  record(`\n=== ${label} ===`);
  record(`$ ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
    maxBuffer: 24 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (output) record(output);
  if (result.error) record(`${label} could not start: ${result.error.message}`);
  const status = result.status === 0 ? "PASS" : "FAIL";
  record(`${label}: ${status}${result.status === null ? " (signal)" : result.status === undefined ? "" : ` (${result.status})`}`);
  return { label, command: `$ ${[command, ...args].join(" ")}`, status, output };
}

const service = "artifacts/api-server/src/services/financial-documents.ts";
const schema = "lib/db/src/schema/financial-documents.ts";
const routes = "artifacts/api-server/src/routes/financial-documents.ts";
const domain = "artifacts/api-server/src/domain/document-budget-bridge.ts";
const domainTest = "artifacts/api-server/src/domain/document-budget-bridge.test.ts";
const integrationTest = "artifacts/api-server/src/integration/document-budget-bridge.test.ts";
const finance = "artifacts/api-server/src/domain/finance.ts";
const budgetService = "artifacts/api-server/src/services/household-finance.ts";
const rowUi = "artifacts/capital-os/src/pages/TransactionEvidenceRow.tsx";
const documentsUi = "artifacts/capital-os/src/pages/documents.tsx";

const definitions = [
  ["DBB-01", "Category Suggestion", [[schema, /suggestedCategoryId/], [domainTest, /explicit human-decision states/]], false],
  ["DBB-02", "Category Household Scope", [[service, /Category must be active and belong to this household/], [integrationTest, /foreign category/]], true],
  ["DBB-03", "Evidence vs Inclusion Separation", [[service, /reviewFinancialDocument/], [integrationTest, /deliberately separate from financial inclusion/]], true],
  ["DBB-04", "Match Before Create", [[service, /previewBankStatementTransactionMatch/], [service, /ONE_HIGH_CONFIDENCE_MATCH/]], true],
  ["DBB-05", "Duplicate Detection", [[service, /MULTIPLE_CANDIDATES/], [integrationTest, /MULTIPLE_CANDIDATES/]], true],
  ["DBB-06", "Row Fingerprint Idempotency", [[domain, /statementRowFingerprint/], [schema, /householdFingerprintUnique/], [domainTest, /not amount-only/]], false],
  ["DBB-07", "Explicit Import", [[routes, /:transactionId\/import/], [service, /importBankStatementTransaction/]], true],
  ["DBB-08", "Link Existing", [[routes, /:transactionId\/link/], [service, /linkBankStatementTransaction/]], true],
  ["DBB-09", "Exactly-One Official Transaction", [[schema, /householdRowUnique/], [integrationTest, /cannot create another official row/]], true],
  ["DBB-10", "Transfer Exclusion", [[service, /NOT_APPLICABLE_TRANSFER/], [integrationTest, /TRANSFER/]], true],
  ["DBB-11", "Settlement Double-Count Protection", [[service, /NOT_APPLICABLE_SETTLEMENT/], [integrationTest, /SETTLEMENT_LINK/]], true],
  ["DBB-12", "Business/Household Boundary", [[service, /economicClassification/], [integrationTest, /BUSINESS/]], true],
  ["DBB-13", "No Automatic Verified Income", [[integrationTest, /verifiedHouseholdIncomeEvents/], [documentsUi, /does not automatically post transactions/]], true],
  ["DBB-14", "Budget Actual Population", [[budgetService, /getBudgetPlanningCategoryContributionDetail/], [integrationTest, /includedActual/]], true],
  ["DBB-15", "Planned Target Immutability", [[integrationTest, /monthlyTarget/], [rowUi, /actuals, not the planned target/]], true],
  ["DBB-16", "Pending Evidence Display", [[documentsUi, /Advisory impact only/], [rowUi, /Approve or reclassify.*before financial inclusion/]], true],
  ["DBB-17", "Accounting Integration", [[rowUi, /getGetAccountingOverviewQueryKey/], [integrationTest, /sourceDocumentId/]], true],
  ["DBB-18", "Cash Flow Refresh", [[rowUi, /getGetVariableBudgetIntelligenceQueryKey/], [documentsUi, /getGetVariableBudgetIntelligenceQueryKey/]], true],
  ["DBB-19", "Forecast Refresh", [[rowUi, /getGetVariableBudgetIntelligenceQueryKey/], [integrationTest, /REVERSED/]], true],
  ["DBB-20", "Capital Governor Refresh", [[rowUi, /getGetCapitalGovernorV2QueryKey/], [documentsUi, /getGetCapitalGovernorV2QueryKey/]], true],
  ["DBB-21", "Reversal Workflow", [[routes, /:transactionId\/reverse/], [schema, /statementFinancialReversals/], [integrationTest, /reverseBankStatementTransactionImport/]], true],
  ["DBB-22", "Correction Workflow", [[service, /SOURCE_OFFICIAL_MISMATCH/], [routes, /inclusion\/reconcile/]], true],
  ["DBB-23", "Parent Rejection Safety", [[service, /PARENT_REJECTED/], [integrationTest, /source later rejected/]], true],
  ["DBB-24", "Exact-Cent Math", [[finance, /parseMoneyToCents/], [finance, /centsToMoney/], [integrationTest, /900\.00/]], true],
  ["DBB-25", "Tenant Isolation", [[service, /actor\.householdId/], [integrationTest, /foreign account/]], true],
  ["DBB-26", "Role Authorization", [[service, /assertPermission\(actor\.role, "approve"\)/], [integrationTest, /role: "viewer"/]], true],
  ["DBB-27", "Atomicity", [[service, /db\.transaction/], [integrationTest, /rolls back the official row/]], true],
  ["DBB-28", "Concurrency", [[service, /pg_advisory_xact_lock/], [schema, /householdRowUnique/], [integrationTest, /Simultaneous first import/]], true],
  ["DBB-29", "Audit", [[service, /statement_financial_imported/], [service, /statement_financial_reversed/], [integrationTest, /auditEvents/]], true],
  ["DBB-30", "Authenticated Browser Journey", [[rowUi, /Confirm import as new/], [rowUi, /Link evidence only/], [rowUi, /Reverse import/]], "browser"],
];

function tail(output) {
  return output.trim().split("\n").slice(-6).join(" ").replace(/\|/g, "\\|") || "No output.";
}

function writeArtifacts(gates, checks, integration, browser) {
  const status = gates.every((gate) => gate.status === "PASS") && checks.every((check) => check.status === "PASS") ? "PASS" : "BLOCKED";
  const lines = [
    "# Document-to-Budget Bridge certification",
    "",
    `**Date:** ${date}`,
    `**Command:** \`pnpm run certify:document-budget-bridge\``,
    `**Run log:** \`docs/certification/logs/DOCUMENT_BUDGET_BRIDGE_CERTIFICATION_${date}.log\``,
    "",
    "## Evidence policy",
    "",
    "A gate is PASS only when its executable static contract evidence and required test evidence pass. Database integration is never accepted when skipped. The authenticated browser journey is never inferred from source code; it must be executed with `CAPITAL_OS_RUN_BROWSER=1` and a dedicated browser fixture.",
    "",
    "## Commands executed",
    "",
    ...checks.map((check) => `- ${check.command} — **${check.status}**${check.status === "FAIL" ? `: ${tail(check.output)}` : ""}`),
    `- Integration fixture: \`${tsx} --test src/integration/document-budget-bridge.test.ts\` — **${integration.status}**: ${integration.reason}`,
    `- Authenticated browser fixture — **${browser.status}**: ${browser.reason}`,
    "",
    "## Gate results",
    "",
    "| Gate | Result | Evidence |",
    "| --- | --- | --- |",
    ...gates.map((gate) => `| ${gate.id} ${gate.title} | **${gate.status}** | ${gate.reason} |`),
    "",
    `## Certification result: **${status}**`,
    "",
    "A BLOCKED result is not a pass. Resolve the listed database/browser fixture blockers and rerun the command to produce release evidence.",
    "",
  ];
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(logPath, `${log.join("\n")}\n`);
  fs.writeFileSync(artifactPath, lines.join("\n"));
}

const checks = [
  run("Focused document bridge domain tests", tsx, ["--test", "src/domain/document-budget-bridge.test.ts"], apiDir),
  run("API typecheck", "pnpm", ["--filter", "@workspace/api-server", "run", "typecheck"]),
  run("Web typecheck", "pnpm", ["--filter", "@workspace/capital-os", "run", "typecheck"]),
  run("API contract parity", "pnpm", ["--filter", "@workspace/api-server", "run", "check-contract"]),
  run("Generated finance artifact freshness", "pnpm", ["run", "check:generated-finance-artifacts"]),
];

let integration;
if (process.env.CAPITAL_OS_RUN_INTEGRATION === "1") {
  const result = run("Database-backed document bridge integration fixture", tsx, ["--test", "src/integration/document-budget-bridge.test.ts"], apiDir);
  integration = { status: result.status, reason: result.status === "PASS" ? "Executed without skip." : tail(result.output) };
} else {
  integration = { status: "BLOCKED", reason: "CAPITAL_OS_RUN_INTEGRATION=1 was not supplied; the fixture would skip, and skipped integration evidence is not accepted." };
  record(`\nDatabase-backed document bridge integration fixture: BLOCKED — ${integration.reason}`);
}

let browser;
const browserSpec = path.join(apiDir, "src", "browser", "document-budget-bridge-certification.spec.ts");
if (process.env.CAPITAL_OS_RUN_BROWSER !== "1") {
  browser = { status: "BLOCKED", reason: "CAPITAL_OS_RUN_BROWSER=1 was not supplied; authenticated browser evidence was not attempted." };
} else if (!fs.existsSync(browserSpec)) {
  browser = { status: "BLOCKED", reason: "No dedicated authenticated browser fixture exists at artifacts/api-server/src/browser/document-budget-bridge-certification.spec.ts." };
} else {
  const result = run("Authenticated document bridge browser journey", "pnpm", ["--filter", "@workspace/api-server", "run", "certify:document-budget-bridge"], apiDir);
  browser = { status: result.status, reason: result.status === "PASS" ? "Executed authenticated browser fixture." : tail(result.output) };
}
record(`Authenticated document bridge browser journey: ${browser.status} — ${browser.reason}`);

const purePassed = checks[0].status === "PASS";
const gates = definitions.map(([id, title, requirements, dynamic]) => {
  const staticPass = evidence(requirements);
  if (!staticPass) return { id, title, status: "FAIL", reason: "Focused static contract assertion failed." };
  if (dynamic === "browser") return { id, title, status: browser.status, reason: browser.reason };
  if (dynamic && integration.status !== "PASS") return { id, title, status: integration.status, reason: integration.reason };
  if (!dynamic && !purePassed) return { id, title, status: "FAIL", reason: "Focused pure domain suite failed." };
  return { id, title, status: "PASS", reason: dynamic ? "Static contract plus executed database fixture." : "Static contract plus executed pure domain suite." };
});

record("\n=== Document-to-Budget Bridge certification ===");
for (const gate of gates) record(`${gate.id} | ${gate.status} | ${gate.title} | ${gate.reason}`);
const passCount = gates.filter((gate) => gate.status === "PASS").length;
const result = gates.every((gate) => gate.status === "PASS") && checks.every((check) => check.status === "PASS") ? "PASS" : "BLOCKED";
record(`DOCUMENT-BUDGET-BRIDGE CERTIFICATION: ${result} (${passCount}/30 PASS)`);
writeArtifacts(gates, checks, integration, browser);
record(`Evidence: ${path.relative(root, artifactPath)}`);
record(`Run log: ${path.relative(root, logPath)}`);
if (result !== "PASS") process.exitCode = 1;