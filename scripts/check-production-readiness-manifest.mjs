import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "docs/production-readiness-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (manifest.schemaVersion !== 1 || manifest.releaseCandidate !== "RC1") throw new Error("Unsupported or missing RC1 manifest schema.");
if (manifest.posture !== "IN_HOUSE_ONLY") throw new Error("Manifest posture must remain IN_HOUSE_ONLY.");
for (const [name, value] of Object.entries(manifest.claims ?? {})) {
  if (value !== "NOT_CERTIFIED") throw new Error(`Uncertified production claim is not permitted: ${name}=${value}`);
}
const requiredCriticalFlows = [
  "operationsWorkerRecovery",
  "operationsScheduler",
  "auditArchiveDelivery",
  "observabilityIncidentDelivery",
  "applicationReadiness",
  "researchErrorContracts",
  "schwabMarketDataReadOnlyRetry",
  "runtimeDependencyAudit",
  "activeHouseholdSelection",
  "authenticatedProductionBrowser",
  "mobileAuthenticatedLayouts",
  "productionMigrationRestore",
];
for (const flow of requiredCriticalFlows) {
  const status = manifest.criticalFlows?.[flow];
  if (!["IMPLEMENTATION_VERIFIED", "NOT_CERTIFIED"].includes(status)) {
    throw new Error(`Critical flow is missing a truthful RC1 status: ${flow}`);
  }
}
const hash = crypto.createHash("sha256");
for (const file of manifest.build.inputs) {
  hash.update(file);
  hash.update(fs.readFileSync(path.join(root, file)));
}
if (hash.digest("hex") !== manifest.build.inputSha256) {
  throw new Error("Production-readiness manifest is stale; regenerate it from the exact build inputs.");
}
if (manifest.parserBoundaries.bankStatements.maxInputBytes !== 20971520 ||
    manifest.parserBoundaries.bankStatements.maxRows !== 100000 ||
    manifest.parserBoundaries.businessPdf.maxInputBytes !== 52428800) {
  throw new Error("Parser resource limits are missing or unexpectedly relaxed.");
}
if ((manifest.parserBoundaries.bankStatements.parsed ?? []).includes("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")) {
  throw new Error("RC1 must not open XLSX evidence with a runtime parser.");
}
console.log(`Production-readiness manifest passed for ${manifest.build.id}.`);