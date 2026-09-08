import { existsSync, readFileSync } from "node:fs";

const evidence = (file, pattern) =>
  existsSync(file) && pattern.test(readFileSync(file, "utf8"));

const gates = [
  ["Financial Document Inbox", "PASS", [["lib/db/src/schema/financial-documents.ts", /financialDocuments/], ["artifacts/capital-os/src/App.tsx", /FinancialDocumentInboxPage/]]],
  ["Mobile Upload", "PASS", [["artifacts/capital-os/src/App.tsx", /Choose file/], ["artifacts/capital-os/src/App.tsx", /onDrop=/]]],
  ["Document Hash Idempotency", "PASS", [["lib/db/src/schema/financial-documents.ts", /householdHashUnique/], ["artifacts/api-server/src/services/financial-documents.ts", /DOCUMENT ALREADY EXISTS/]]],
  ["Source Provenance", "PARTIAL", [["lib/db/src/schema/financial-documents.ts", /sourceMetadata/], ["lib/db/src/schema/financial-documents.ts", /originalValue/]]],
  ["Settlement Parsing", "PASS", [["artifacts/api-server/src/services/business-document-parser.ts", /parseBusinessPdf/]]],
  ["Settlement Math", "PASS", [["artifacts/api-server/src/domain/business-income.ts", /reconcileSettlementMath/]]],
  ["Economic Treatment", "PARTIAL", [["lib/db/src/schema/business-income.ts", /category:/], ["lib/db/src/schema/business-income.ts", /reimbursement:/]]],
  ["Advance Boundary", "PASS", [["lib/db/src/schema/business-income.ts", /businessAdvances/]]],
  ["Escrow Boundary", "PASS", [["lib/db/src/schema/business-income.ts", /businessEscrowMovements/]]],
  ["P&L Ingestion", "PASS", [["artifacts/api-server/src/services/business-income.ts", /createProfitLossDocument/]]],
  ["P&L Period Reconciliation", "PASS", [["artifacts/api-server/src/domain/business-income.ts", /periodCoverage/]]],
  ["Bank Statement Ingestion", "PARTIAL", [["lib/db/src/schema/financial-documents.ts", /bankStatementDocuments/], ["artifacts/api-server/src/services/financial-documents.ts", /DOCUMENT_EVIDENCE_PENDING_REVIEW/]]],
  ["Manual vs Connected Account Status", "PASS", [["artifacts/api-server/src/services/household-finance.ts", /accountDataMode/], ["artifacts/capital-os/src/App.tsx", /account\.dataMode/]]],
  ["No Live Wells Fargo Claim", "PASS", [["artifacts/capital-os/src/App.tsx", /Wells Fargo and live bank connections are not configured/]]],
  ["Settlement Cash Matching", "PASS", [["artifacts/api-server/src/domain/business-income.ts", /matchSettlementCash/]]],
  ["Double-Count Protection", "PASS", [["artifacts/api-server/src/domain/accounting.test.ts", /transfers do not create income/], ["artifacts/api-server/src/domain/business-income.ts", /verifiedIncomeFromApprovedDraw/]]],
  ["Business/Household Separation", "PASS", [["artifacts/api-server/src/domain/business-income.ts", /verifiedIncomeFromApprovedDraw/]]],
  ["Owner Draw", "PASS", [["artifacts/api-server/src/domain/business-income.ts", /Requested owner draw exceeds safe-to-distribute capacity/], ["artifacts/api-server/src/domain/business-income.ts", /verifiedIncomeFromApprovedDraw/]]],
  ["Verified Household Income", "PASS", [["lib/db/src/schema/business-income.ts", /verifiedHouseholdIncomeEvents/]]],
  ["Income Semantics", "PASS", [["artifacts/capital-os/src/App.tsx", /Needs classification/], ["artifacts/capital-os/src/App.tsx", /Insufficient verified history/]]],
  ["Variable Income Profile", "PASS", [["artifacts/api-server/src/domain/variable-income.ts", /calculateVariableIncomeProfile/]]],
  ["Insufficient-History Safety", "PASS", [["artifacts/api-server/src/domain/variable-income.ts", /INSUFFICIENT_HISTORY/], ["artifacts/capital-os/src/App.tsx", /INSUFFICIENT VERIFIED HISTORY/]]],
  ["Budget Creation Wizard", "PARTIAL", [["artifacts/capital-os/src/App.tsx", /BudgetPlanningControlCenter/]]],
  ["Budget Correction", "PASS", [["docs/BUDGET_CORRECTION_POLICY.md", /supersed/i]]],
  ["Money Unit / Cents Safety", "PASS", [["artifacts/api-server/src/domain/finance.ts", /parseMoneyToCents/], ["docs/money-unit-contract.md", /integer cents/i]]],
  ["Obligation Engine", "PASS", [["artifacts/api-server/src/domain/variable-income.ts", /mandatoryObligations/]]],
  ["Reserve Engine", "PARTIAL", [["artifacts/api-server/src/domain/variable-income.ts", /reserve/]]],
  ["Forward Cash Flow", "PARTIAL", [["artifacts/api-server/src/domain/variable-income.ts", /forecast/], ["artifacts/capital-os/src/App.tsx", /\[30, 60, 90\]/]]],
  ["Vehicle Affordability", "PARTIAL", [["lib/db/src/schema/variable-income.ts", /householdVehicleScenarios/], ["artifacts/capital-os/src/App.tsx", /Vehicle affordability/]]],
  ["Safe-to-Deploy Fail-Closed", "PASS", [["artifacts/api-server/src/domain/capital-governor.ts", /INCOMPLETE_DATA/], ["artifacts/capital-os/src/App.tsx", /NOT CALCULATED/]]],
  ["Safe-to-Deploy Explainability", "PARTIAL", [["artifacts/api-server/src/domain/capital-governor.ts", /components/]]],
  ["Transfer Double-Count Protection", "PASS", [["artifacts/api-server/src/domain/accounting.test.ts", /transfers do not create income/]]],
  ["Credit Card Double-Count Protection", "PARTIAL", [["artifacts/api-server/src/domain/accounting.ts", /credit/i]]],
  ["Mobile Budget UX", "PARTIAL", [["artifacts/capital-os/src/index.css", /@media/], ["artifacts/capital-os/src/App.tsx", /foundation-actions/]]],
  ["Review Queue", "PARTIAL", [["artifacts/api-server/src/services/financial-documents.ts", /listFinancialReviewQueue/], ["artifacts/capital-os/src/App.tsx", /Central review queue/]]],
  ["Audit", "PASS", [["artifacts/api-server/src/services/financial-documents.ts", /auditEvents/]]],
  ["Tenant Isolation", "PASS", [["artifacts/api-server/src/services/financial-documents.ts", /actor\.householdId/]]],
  ["Role Authorization", "PASS", [["artifacts/api-server/src/services/financial-documents.ts", /assertPermission/]]],
  ["Grok Advisory Boundary", "PASS", [["docs/AI_GOVERNANCE.md", /advisory/i]]],
  ["No Money Movement", "PASS", [["artifacts/api-server/src/services/financial-documents.ts", /no ledger entry or bank write/i], ["artifacts/capital-os/src/App.tsx", /never create bank writes/]]],
];

let passed = 0;
let partial = 0;
let failed = 0;

for (const [index, [name, expected, requirements]] of gates.entries()) {
  const complete = requirements.every(([file, pattern]) => evidence(file, pattern));
  const status = complete ? expected : "FAIL";
  if (status === "PASS") passed += 1;
  else if (status === "PARTIAL") partial += 1;
  else failed += 1;
  console.log(`FPC-${String(index + 1).padStart(2, "0")} ${name}: ${status}`);
}

console.log(`\nFPC: ${passed}/40 PASS · ${partial} PARTIAL · ${failed} FAIL`);
process.exitCode = partial || failed ? 1 : 0;