import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const checks = [
  ["FDI-01 Private storage policy", () => existsSync(resolve(root, "docs/FINANCIAL_DOCUMENT_TYPE_POLICY.md"))],
  ["FDI-02 Deterministic detector", () => existsSync(resolve(root, "artifacts/api-server/src/services/financial-document-type-detector.ts"))],
  ["FDI-03 Mismatch warning contract", () => existsSync(resolve(root, "lib/api-zod/src/generated/types/financialDocumentTypeDecisionInput.ts"))],
  ["FDI-04 Explicit override route", () => existsSync(resolve(root, "artifacts/api-server/src/routes/financial-documents.ts"))],
  ["FDI-05 Audited reclassification model", () => existsSync(resolve(root, "lib/db/migrations/0037_zippy_plazm.sql"))],
  ["FDI-06 Immutable source policy", () => existsSync(resolve(root, "docs/FINANCIAL_DOCUMENT_RECLASSIFICATION.md"))],
  ["FDI-12 Canonical identity model", () => existsSync(resolve(root, "docs/FINANCIAL_DOCUMENT_DUPLICATE_VERSION_POLICY.md"))],
  ["FDI-13 P&L period policy", () => existsSync(resolve(root, "docs/P_AND_L_PERIOD_INTEGRITY.md"))],
  ["FDI-22 Verified income boundary", () => existsSync(resolve(root, "docs/BUSINESS_INCOME_SOURCE_AUTHORITY.md"))],
  ["FDI-30 production execution gate", () => existsSync(resolve(root, "docs/certification/FINANCIAL_DOCUMENT_INTEGRITY_CERTIFICATION_2026-09-08.md"))],
];

let passed = 0;
for (const [name, check] of checks) {
  const ok = check();
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (ok) passed += 1;
}

const commands = [
  ["typecheck", "pnpm", ["--filter", "@workspace/api-server", "run", "typecheck"]],
  ["detector tests", resolve(root, "scripts/node_modules/.bin/tsx"), ["--test", resolve(root, "artifacts/api-server/src/services/financial-document-type-detector.test.ts")]],
  ["generated artifacts", "pnpm", ["run", "check:generated-finance-artifacts"]],
];
for (const [name, command, args] of commands) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", env: process.env });
  const ok = result.status === 0;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (ok) passed += 1;
}

console.log(`Financial document integrity checks: ${passed}/${checks.length + commands.length}`);
process.exit(passed === checks.length + commands.length ? 0 : 1);