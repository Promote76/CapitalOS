import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = process.env.CAPITAL_OS_RESTORE_VERIFY_MANIFEST;
const target = process.env.CAPITAL_OS_RESTORE_VERIFY_TARGET;
const approved = process.env.CAPITAL_OS_RESTORE_VERIFY_APPROVED === "1";

console.log("Future restore verifier scaffold");
console.log("This command does not restore data and cannot certify provider-managed backups.");

if (!manifest || !target || !approved) {
  console.error("NOT CERTIFIED: provide a disposable target, a verification manifest, and explicit approval before implementing the provider-specific verifier.");
  process.exitCode = 2;
} else if (!path.isAbsolute(manifest) && !fs.existsSync(path.join(rootDir, manifest))) {
  console.error("NOT CERTIFIED: the verification manifest does not exist.");
  process.exitCode = 2;
} else {
  console.log("Inputs are present for a future provider-specific verifier; no restore was attempted.");
  process.exitCode = 2;
}