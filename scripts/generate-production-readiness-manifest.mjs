import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeRc1ReleaseIdentity } from "./lib/rc1-release-identity.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "docs/production-readiness-manifest.json");
const evidencePath = path.join(
  root,
  "docs/certification/RC1_READINESS_CERTIFICATION.json",
);
const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
const identity = computeRc1ReleaseIdentity(root);
if (evidence.source?.sourceSha256 !== identity.sourceSha256) {
  throw new Error(
    "RC1 certification does not match the exact current release inputs.",
  );
}

const manifest = {
  schemaVersion: 2,
  generatedBy: "scripts/generate-production-readiness-manifest.mjs",
  build: {
    id: `${identity.baseCommit}:${identity.sourceSha256.slice(0, 16)}`,
    baseCommit: identity.baseCommit,
    inputSha256: identity.sourceSha256,
    inputCount: identity.inputCount,
    inputs: identity.inputs,
  },
  releaseCandidate: "RC1",
  posture: "IN_HOUSE_ONLY",
  claims: {
    workspaceBuild: "CERTIFIED_ISOLATED",
    authenticatedProductionFlows: "NOT_CERTIFIED",
    externalProviderFlows: "NOT_CERTIFIED",
    destructiveMigrationRestore: "NOT_CERTIFIED",
  },
  criticalFlows: {
    operationsWorkerRecovery: "CERTIFIED_ISOLATED",
    operationsScheduler: "CERTIFIED_ISOLATED",
    auditArchiveDelivery: "CERTIFIED_ISOLATED",
    observabilityIncidentDelivery: evidence.observability.externalDelivery,
    applicationReadiness: "CERTIFIED_BLOCKED_NO_APPROVED_DESTINATION",
    researchErrorContracts: "IMPLEMENTATION_VERIFIED",
    schwabMarketDataReadOnlyRetry: "IMPLEMENTATION_VERIFIED",
    runtimeDependencyAudit: "IMPLEMENTATION_VERIFIED",
    activeHouseholdSelection: "IMPLEMENTATION_VERIFIED",
    authenticatedProductionBrowser: "NOT_CERTIFIED",
    mobileAuthenticatedLayouts: "NOT_CERTIFIED",
    productionMigrationRestore: "NOT_CERTIFIED",
  },
  certification: {
    evidence: path.relative(root, evidencePath),
    result: evidence.result,
    routeInventory: evidence.routeInventory,
    migrationSet: evidence.migrationSet,
    archive: evidence.archive,
    operations: evidence.operations,
    readiness: evidence.readiness,
    observability: evidence.observability,
    safety: evidence.safety,
  },
  parserBoundaries: {
    bankStatements: {
      parsed: ["application/pdf", "text/csv"],
      acceptedAsReviewEvidenceOnly: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
      maxInputBytes: 20971520,
      maxRows: 100000,
      pdfTimeoutMs: 15000,
      pdfOutputBytes: 52428800,
      behavior: "XLSX is never opened by the API in RC1. Ambiguous or malformed evidence remains pending human review.",
    },
    businessPdf: {
      maxInputBytes: 52428800,
      pdfTimeoutMs: 15000,
      pdfOutputBytes: 52428800,
      behavior: "Extraction failure or ambiguity is not authoritative.",
    },
  },
  dependencyReview: {
    directRuntimeParser: "CSV parser plus sandboxed pdftotext subprocess",
    isolatedDependencies: [
      "The vulnerable xlsx npm package is removed from the API runtime; XLSX remains review evidence only until a maintained parser is approved.",
    ],
  },
};
fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${path.relative(root, manifestPath)} for build ${manifest.build.id} (${manifest.build.inputSha256}).`);