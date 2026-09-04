import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkerPath = path.join(rootDir, "scripts/check-generated-finance-artifacts.mjs");
const schemaIndexPath = path.join(rootDir, "lib/db/src/schema/index.ts");
const fixturePath = path.join(rootDir, "lib/db/src/schema/generated-drift-fixture.ts");
const migrationsPath = path.join(rootDir, "lib/db/migrations");
const fixtureExport = 'export * from "./generated-drift-fixture.ts";';
const fixtureSource = `import { pgTable, uuid } from "drizzle-orm/pg-core";

export const generatedDriftFixture = pgTable("generated_drift_fixture", {
  id: uuid("id").defaultRandom().primaryKey(),
});
`;

function listFiles(directory, rootDirectory = directory) {
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(entryPath, rootDirectory);
    return [path.relative(rootDirectory, entryPath)];
  });
}

function snapshotDirectory(directory) {
  return new Map(
    listFiles(directory).map((file) => {
      const filePath = path.join(directory, file);
      return [file, fs.readFileSync(filePath)];
    }),
  );
}

function assertDirectoryRestored(snapshot, directory, label) {
  const current = snapshotDirectory(directory);
  assert.deepEqual([...current.keys()].sort(), [...snapshot.keys()].sort(), `${label} file list changed`);

  for (const [file, contents] of snapshot) {
    assert.ok(current.get(file)?.equals(contents), `${label} file changed: ${file}`);
  }
}

function restoreDirectory(snapshot, directory) {
  fs.rmSync(directory, { recursive: true, force: true });
  fs.mkdirSync(directory, { recursive: true });
  for (const [file, contents] of snapshot) {
    const filePath = path.join(directory, file);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
  }
}

function runChecker() {
  const result = spawnSync(process.execPath, [checkerPath], {
    cwd: rootDir,
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: "postgresql://schema-drift-test@127.0.0.1:5432/schema_drift_test",
    },
  });

  if (result.error) throw result.error;
  return {
    status: result.status,
    output: `${result.stdout}\n${result.stderr}`,
  };
}

const originalSchemaIndex = fs.readFileSync(schemaIndexPath, "utf8");
const migrationSnapshot = snapshotDirectory(migrationsPath);

try {
  const cleanResult = runChecker();
  assert.equal(cleanResult.status, 0, `clean checker run failed:\n${cleanResult.output}`);
  assert.match(cleanResult.output, /Generated finance artifacts are fresh\./);
  assertDirectoryRestored(migrationSnapshot, migrationsPath, "clean migration output");

  fs.writeFileSync(fixturePath, fixtureSource);
  fs.writeFileSync(schemaIndexPath, `${originalSchemaIndex}\n${fixtureExport}\n`);

  const mismatchResult = runChecker();
  assert.notEqual(mismatchResult.status, 0, "schema-to-migration mismatch unexpectedly passed");
  assert.match(
    mismatchResult.output,
    /Regenerate database migrations with `pnpm --filter @workspace\/db run generate`\./,
  );
  assertDirectoryRestored(migrationSnapshot, migrationsPath, "mismatch migration output");

  console.log("Generated finance artifact checker regression passed.");
} finally {
  fs.writeFileSync(schemaIndexPath, originalSchemaIndex);
  fs.rmSync(fixturePath, { force: true });
  restoreDirectory(migrationSnapshot, migrationsPath);
}