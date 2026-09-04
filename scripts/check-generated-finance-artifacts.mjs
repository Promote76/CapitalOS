import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedPaths = [
  "lib/api-client-react/src/generated",
  "lib/api-zod/src/generated",
  "lib/db/migrations",
];
const snapshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "capital-os-generated-"));

function copyDirectory(source, destination) {
  if (fs.existsSync(source)) {
    fs.cpSync(source, destination, { recursive: true });
  }
}

function snapshotGeneratedOutput() {
  for (const relativePath of generatedPaths) {
    copyDirectory(path.join(rootDir, relativePath), path.join(snapshotDir, relativePath));
  }
}

function restoreGeneratedOutput() {
  for (const relativePath of generatedPaths) {
    const currentPath = path.join(rootDir, relativePath);
    const snapshotPath = path.join(snapshotDir, relativePath);
    fs.rmSync(currentPath, { recursive: true, force: true });
    copyDirectory(snapshotPath, currentPath);
  }
}

function run(label, command, args) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) {
    console.error(`Unable to start ${command}: ${result.error.message}`);
    return false;
  }
  return result.status === 0;
}

function listFiles(directory, rootDirectory = directory) {
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(entryPath, rootDirectory);
    return [path.relative(rootDirectory, entryPath)];
  });
}

function directoryContents(relativePath) {
  const directory = path.join(rootDir, relativePath);
  const files = listFiles(directory);
  return new Map(files.map((file) => {
    const filePath = path.join(directory, file);
    return [file, fs.readFileSync(filePath)];
  }));
}

function changedFiles(relativePath) {
  const before = new Map(
    listFiles(path.join(snapshotDir, relativePath)).map((file) => {
      const filePath = path.join(snapshotDir, relativePath, file);
      return [file, fs.readFileSync(filePath)];
    }),
  );
  const after = directoryContents(relativePath);
  const files = new Set([...before.keys(), ...after.keys()]);

  return [...files].filter((file) => {
    const beforeContents = before.get(file);
    const afterContents = after.get(file);
    return !beforeContents || !afterContents || !beforeContents.equals(afterContents);
  }).sort();
}

function printStaleArtifacts() {
  const staleArtifacts = new Map(
    generatedPaths.map((relativePath) => [relativePath, changedFiles(relativePath)]),
  );
  const hasStaleArtifacts = [...staleArtifacts.values()].some((files) => files.length > 0);

  if (!hasStaleArtifacts) {
    console.log("\nGenerated finance artifacts are fresh.");
    return true;
  }

  console.error("\nGenerated finance artifacts are stale:");
  for (const [relativePath, files] of staleArtifacts) {
    for (const file of files) console.error(`  - ${relativePath}/${file}`);
  }

  if ((staleArtifacts.get("lib/db/migrations") ?? []).length > 0) {
    console.error(
      "\nRegenerate database migrations with `pnpm --filter @workspace/db run generate`.",
    );
  }
  if (
    (staleArtifacts.get("lib/api-client-react/src/generated") ?? []).length > 0 ||
    (staleArtifacts.get("lib/api-zod/src/generated") ?? []).length > 0
  ) {
    console.error(
      "\nRegenerate API artifacts with `pnpm --filter @workspace/api-spec run codegen`.",
    );
  }
  console.error("Commit the generated files, then rerun this check.");
  return false;
}

snapshotGeneratedOutput();

let passed = false;
try {
  const declarationsGenerated = run("Database declaration generation", "pnpm", [
    "exec",
    "tsc",
    "--build",
    "--force",
  ]);
  const migrationsGenerated =
    declarationsGenerated &&
    run("Database migration generation", "pnpm", [
      "--filter",
      "@workspace/db",
      "run",
      "generate",
    ]);
  const apiArtifactsGenerated =
    migrationsGenerated &&
    run("OpenAPI client and validator generation", "pnpm", [
      "--filter",
      "@workspace/api-spec",
      "run",
      "codegen",
    ]);
  passed = apiArtifactsGenerated && printStaleArtifacts();
} finally {
  restoreGeneratedOutput();
  fs.rmSync(snapshotDir, { recursive: true, force: true });
}

process.exitCode = passed ? 0 : 1;