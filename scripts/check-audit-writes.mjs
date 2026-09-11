import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "artifacts/api-server/src");
const allowed = new Set([
  path.join(source, "services/audit.ts"),
  path.join(source, "services/audit-backfill.ts"),
]);
const violations = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (file.endsWith(".ts") && !file.endsWith(".test.ts") && !allowed.has(file)) {
      const text = fs.readFileSync(file, "utf8");
      if (/\.insert\(\s*audit(?:Events|EventArchive)\s*\)/.test(text)) violations.push(path.relative(root, file));
      for (const [index, line] of text.split("\n").entries()) {
        if (/\bappendAuditEvents?\s*\(/.test(line) && !line.includes("import ")
          && !/\bawait\s+appendAuditEvents?\s*\(/.test(line)
          && !/\breturn\s+appendAuditEvents?\s*\(/.test(line)) {
          violations.push(`${path.relative(root, file)}:${index + 1}: unawaited audit append`);
        }
      }
    }
  }
}
walk(source);
if (violations.length) {
  console.error(`Direct audit writes are forbidden outside services/audit.ts:\n${violations.join("\n")}`);
  process.exit(1);
}
console.log("Audit write boundary check passed.");