import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const failures = [];

const forbiddenPaths = [
  "attached_assets",
  "screenshots",
  ".agents/memory",
];

for (const relative of forbiddenPaths) {
  if (existsSync(resolve(root, relative))) {
    failures.push(`forbidden public-repository artifact path is present: ${relative}`);
  }
}

const logDir = resolve(root, "docs/certification/logs");
if (existsSync(logDir) && readdirSync(logDir).some((name) => !name.startsWith("."))) {
  failures.push("generated certification logs must not be committed under docs/certification/logs");
}

const productionFiles = [
  "scripts/certify-production-document-remediation.mjs",
  "artifacts/api-server/src/browser/production-document-remediation-certification.spec.ts",
];

for (const relative of productionFiles) {
  const content = readFileSync(resolve(root, relative), "utf8");
  if (/CAPITAL_OS_PRODUCTION_HOUSEHOLD_ID\s*\?\?\s*["'][0-9a-f-]{36}["']/i.test(content)) {
    failures.push(`${relative} contains a hard-coded production household fallback`);
  }
  if (/CAPITAL_OS_PRODUCTION_DOCUMENT_IDS\s*\?\?[\s\S]{0,120}["'][0-9a-f-]{36}/i.test(content)) {
    failures.push(`${relative} contains hard-coded production document identifiers`);
  }
}

function walk(directory) {
  if (!existsSync(directory)) return [];
  const entries = [];
  for (const name of readdirSync(directory)) {
    const path = resolve(directory, name);
    const stat = statSync(path);
    if (stat.isDirectory()) entries.push(...walk(path));
    else entries.push(path);
  }
  return entries;
}

for (const path of [...walk(resolve(root, "docs/certification")), ...walk(resolve(root, "docs/completion"))]) {
  if (!/\.(md|txt|json)$/i.test(path)) continue;
  const content = readFileSync(path, "utf8");
  if (/\/objects\/uploads\/[0-9a-f-]{36}/i.test(content)) {
    failures.push(`${path.slice(root.length + 1)} exposes a private object identifier`);
  }
  if (/CAPITAL_OS_PRODUCTION_HOUSEHOLD_ID\s*=\s*[0-9a-f-]{36}/i.test(content)) {
    failures.push(`${path.slice(root.length + 1)} exposes a production household identifier`);
  }
  if (/CAPITAL_OS_PRODUCTION_DOCUMENT_IDS\s*=\s*[0-9a-f-]{36}/i.test(content)) {
    failures.push(`${path.slice(root.length + 1)} exposes production document identifiers`);
  }
  if (/FUQC\s+P&L/i.test(content)) {
    failures.push(`${path.slice(root.length + 1)} exposes a production financial-document filename`);
  }
}

if (failures.length) {
  console.error("Public repository hygiene check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Public repository hygiene check: PASS");
