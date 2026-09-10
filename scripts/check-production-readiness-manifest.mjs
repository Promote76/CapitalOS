import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { computeRc1ReleaseIdentity } from "./lib/rc1-release-identity.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "docs/production-readiness-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const isAncestor = (commit) =>
  spawnSync("git", ["merge-base", "--is-ancestor", commit, "HEAD"], {
    cwd: root,
    stdio: "ignore",
  }).status === 0;
if (manifest.schemaVersion !== 2 || manifest.releaseCandidate !== "RC1") throw new Error("Unsupported or missing RC1 manifest schema.");
if (manifest.posture !== "IN_HOUSE_ONLY") throw new Error("Manifest posture must remain IN_HOUSE_ONLY.");
if (manifest.claims?.workspaceBuild !== "CERTIFIED_ISOLATED") throw new Error("Workspace build must have exact isolated certification.");
for (const name of ["authenticatedProductionFlows", "externalProviderFlows", "destructiveMigrationRestore"]) {
  if (manifest.claims?.[name] !== "NOT_CERTIFIED") throw new Error(`Uncertified production claim is not permitted: ${name}`);
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
  if (![
    "IMPLEMENTATION_VERIFIED",
    "NOT_CERTIFIED",
    "CERTIFIED_ISOLATED",
    "CERTIFIED_BLOCKED_NO_APPROVED_DESTINATION",
    "BLOCKED_NO_APPROVED_DESTINATION",
    "NOT_RUN",
  ].includes(status)) {
    throw new Error(`Critical flow is missing a truthful RC1 status: ${flow}`);
  }
}
const identity = computeRc1ReleaseIdentity(root);
if (
  identity.sourceSha256 !== manifest.build.inputSha256 ||
  identity.inputCount !== manifest.build.inputCount
) {
  throw new Error("Production-readiness manifest is stale; regenerate it from the exact build inputs.");
}
const evidencePath = path.join(root, manifest.certification?.evidence ?? "");
const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
if (
  evidence.source?.sourceSha256 !== identity.sourceSha256 ||
  evidence.source?.baseCommit !== manifest.build.baseCommit ||
  !isAncestor(evidence.source?.baseCommit)
) {
  throw new Error(
    "RC1 evidence is not bound to this exact implementation or its certified base commit is not an ancestor of HEAD.",
  );
}
if (
  evidence.routeInventory?.current !== evidence.routeInventory?.executed ||
  evidence.routeInventory?.result !== "PASS"
) {
  throw new Error("Current route inventory was not executed by the RC1 certification.");
}
for (const result of Object.values(evidence.archive ?? {})) {
  if (result !== "PASS") throw new Error("Audit archive certification is incomplete.");
}
for (const result of Object.values(evidence.operations ?? {})) {
  if (result !== "PASS") throw new Error("Operations runtime certification is incomplete.");
}
if (
  evidence.observability?.approvedDestinationConfigured !== false ||
  evidence.observability?.externalDelivery !== "BLOCKED_NO_APPROVED_DESTINATION"
) {
  throw new Error("Missing approved observability destination must remain an explicit blocker.");
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