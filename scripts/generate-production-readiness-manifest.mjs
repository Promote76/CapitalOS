import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "docs/production-readiness-manifest.json");
const inputs = [
  "package.json",
  "pnpm-lock.yaml",
  "artifacts/api-server/package.json",
  "artifacts/api-server/src/services/bank-statement-parser.ts",
  "artifacts/api-server/src/services/business-document-parser.ts",
];
const hash = crypto.createHash("sha256");
for (const file of inputs) {
  hash.update(file);
  hash.update(fs.readFileSync(path.join(root, file)));
}

const manifest = {
  schemaVersion: 1,
  generatedBy: "scripts/generate-production-readiness-manifest.mjs",
  build: {
    id: process.env.BUILD_ID ?? process.env.GIT_COMMIT ?? "local-uncommitted",
    inputSha256: hash.digest("hex"),
    inputs,
  },
  releaseCandidate: "RC1",
  posture: "IN_HOUSE_ONLY",
  claims: {
    workspaceBuild: "NOT_CERTIFIED",
    authenticatedProductionFlows: "NOT_CERTIFIED",
    externalProviderFlows: "NOT_CERTIFIED",
    destructiveMigrationRestore: "NOT_CERTIFIED",
  },
  criticalFlows: {
    operationsWorkerRecovery: "IMPLEMENTATION_VERIFIED",
    operationsScheduler: "IMPLEMENTATION_VERIFIED",
    auditArchiveDelivery: "NOT_CERTIFIED",
    observabilityIncidentDelivery: "NOT_CERTIFIED",
    applicationReadiness: "IMPLEMENTATION_VERIFIED",
    researchErrorContracts: "IMPLEMENTATION_VERIFIED",
    schwabMarketDataReadOnlyRetry: "IMPLEMENTATION_VERIFIED",
    runtimeDependencyAudit: "IMPLEMENTATION_VERIFIED",
    activeHouseholdSelection: "IMPLEMENTATION_VERIFIED",
    authenticatedProductionBrowser: "NOT_CERTIFIED",
    mobileAuthenticatedLayouts: "NOT_CERTIFIED",
    productionMigrationRestore: "NOT_CERTIFIED",
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