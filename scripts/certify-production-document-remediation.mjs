import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const report = resolve(root, "docs/certification/PRODUCTION_DOCUMENT_REMEDIATION_CERTIFICATION_2026-09-08.md");
const migration = resolve(root, "lib/db/migrations/0037_zippy_plazm.sql");

console.log(`PDR-01/PDR-02 source verification evidence: ${existsSync(report) ? "PASS" : "FAIL"}`);
console.log(`PDR-30 managed production evidence: ${existsSync(migration) ? "BLOCKED — migration must be applied through Publish" : "FAIL — migration artifact missing"}`);
console.log("PRODUCTION DOCUMENT REMEDIATION: BLOCKED");
console.log("No production mutation was attempted. Publish the current app, then rerun the authenticated production evidence workflow.");
process.exit(2);