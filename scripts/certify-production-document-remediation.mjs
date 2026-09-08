import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const report = resolve(root, "docs/certification/PRODUCTION_DOCUMENT_REMEDIATION_CERTIFICATION_2026-09-08.md");
const migration = resolve(root, "lib/db/migrations/0037_zippy_plazm.sql");
const reportText = existsSync(report) ? readFileSync(report, "utf8") : "";
const migrationPresent = existsSync(migration);
const schemaApplied = reportText.includes("APPLIED via managed Publish") && reportText.includes("SCHEMA PARITY:\nPASS");
const businessLinkBlocked = reportText.includes("BUSINESS_ENTITY_LINK_REQUIRED");

console.log(`PDR-01/PDR-02 source verification evidence: ${existsSync(report) && migrationPresent ? "PASS" : "FAIL"}`);
console.log(`PDR-03 managed production schema parity: ${schemaApplied ? "PASS" : "BLOCKED — post-Publish production evidence is missing"}`);
console.log(`PDR-19 business linkage: ${businessLinkBlocked ? "BLOCKED — BUSINESS_ENTITY_LINK_REQUIRED" : "REQUIRES AUTHENTICATED PRODUCTION CHECK"}`);
console.log("PRODUCTION DOCUMENT REMEDIATION: BLOCKED");
console.log("No production mutation was attempted. Link the correct existing trucking BusinessEntity, then rerun the authenticated remediation workflow independently for both P&Ls.");
process.exit(2);