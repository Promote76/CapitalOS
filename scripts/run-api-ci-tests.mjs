import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiRoot = path.join(root, "artifacts/api-server");
const tsx = path.join(root, "scripts/node_modules/.bin/tsx");

const groups = ["domain", "middleware", "integration", "services"];
const dedicatedHarnessTests = new Set([
  "src/integration/rc1-readiness-certification.test.ts",
]);

const files = groups
  .flatMap((group) => {
    const dir = path.join(apiRoot, "src", group);
    return fs.readdirSync(dir)
      .filter((name) => name.endsWith(".test.ts"))
      .map((name) => `src/${group}/${name}`);
  })
  .filter((file) => !dedicatedHarnessTests.has(file))
  .sort();

if (!files.length) {
  console.error("No API CI tests were discovered.");
  process.exit(1);
}

console.log(`API CI suite: ${files.length} test files`);
for (const file of dedicatedHarnessTests) {
  console.log(`Dedicated certification harness (not baseline CI): ${file}`);
}

const result = spawnSync(
  tsx,
  ["--test", "--test-concurrency=1", ...files],
  {
    cwd: apiRoot,
    env: process.env,
    stdio: "inherit",
  },
);

process.exit(result.status ?? 1);
