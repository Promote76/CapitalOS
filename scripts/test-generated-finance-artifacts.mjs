import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const checkerPath = path.join(
  rootDir,
  "scripts/check-generated-finance-artifacts.mjs",
);
const schemaIndexPath = path.join(rootDir, "lib/db/src/schema/index.ts");
const fixturePath = path.join(
  rootDir,
  "lib/db/src/schema/generated-drift-fixture.ts",
);
const migrationsPath = path.join(rootDir, "lib/db/migrations");
const apiClientGeneratedPath = path.join(
  rootDir,
  "lib/api-client-react/src/generated",
);
const apiZodGeneratedPath = path.join(rootDir, "lib/api-zod/src/generated");
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
  assert.deepEqual(
    [...current.keys()].sort(),
    [...snapshot.keys()].sort(),
    `${label} file list changed`,
  );

  for (const [file, contents] of snapshot) {
    assert.ok(
      current.get(file)?.equals(contents),
      `${label} file changed: ${file}`,
    );
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

function runChecker(extraEnv = {}) {
  const result = spawnSync(process.execPath, [checkerPath], {
    cwd: rootDir,
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL:
        "postgresql://schema-drift-test@127.0.0.1:5432/schema_drift_test",
      ...extraEnv,
    },
  });

  if (result.error) throw result.error;
  return {
    status: result.status,
    output: `${result.stdout}\n${result.stderr}`,
  };
}

function createApiCodegenFailureFixture() {
  const pnpmPathResult = spawnSync("which", ["pnpm"], { encoding: "utf8" });
  assert.equal(
    pnpmPathResult.status,
    0,
    `could not locate pnpm:\n${pnpmPathResult.stderr}`,
  );

  const fixtureDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "capital-os-api-codegen-"),
  );
  const fixturePnpmPath = path.join(fixtureDirectory, "pnpm");
  const realPnpmPath = pnpmPathResult.stdout.trim();
  fs.writeFileSync(
    fixturePnpmPath,
    `#!/bin/sh
if [ "$1" = "--filter" ] && [ "$2" = "@workspace/api-spec" ] && [ "$3" = "run" ] && [ "$4" = "codegen" ]; then
  printf '%s\\n' 'api codegen failure fixture' > lib/api-client-react/src/generated/api.ts
  printf '%s\\n' 'api codegen failure fixture' > lib/api-zod/src/generated/api.ts
  exit 73
fi
exec ${JSON.stringify(realPnpmPath)} "$@"
`,
    { mode: 0o755 },
  );

  return {
    directory: fixtureDirectory,
    env: {
      PATH: `${fixtureDirectory}${path.delimiter}${process.env.PATH ?? ""}`,
    },
  };
}

const originalSchemaIndex = fs.readFileSync(schemaIndexPath, "utf8");
const migrationSnapshot = snapshotDirectory(migrationsPath);
const apiClientSnapshot = snapshotDirectory(apiClientGeneratedPath);
const apiZodSnapshot = snapshotDirectory(apiZodGeneratedPath);
let apiCodegenFailureFixture;

try {
  const cleanResult = runChecker();
  assert.equal(
    cleanResult.status,
    0,
    `clean checker run failed:\n${cleanResult.output}`,
  );
  assert.match(cleanResult.output, /Generated finance artifacts are fresh\./);
  assertDirectoryRestored(
    migrationSnapshot,
    migrationsPath,
    "clean migration output",
  );

  fs.writeFileSync(fixturePath, fixtureSource);
  fs.writeFileSync(
    schemaIndexPath,
    `${originalSchemaIndex}\n${fixtureExport}\n`,
  );

  const mismatchResult = runChecker();
  assert.notEqual(
    mismatchResult.status,
    0,
    "schema-to-migration mismatch unexpectedly passed",
  );
  assert.match(
    mismatchResult.output,
    /Regenerate database migrations with `pnpm --filter @workspace\/db run generate`\./,
  );
  assertDirectoryRestored(
    migrationSnapshot,
    migrationsPath,
    "mismatch migration output",
  );

  apiCodegenFailureFixture = createApiCodegenFailureFixture();
  const apiCodegenFailureResult = runChecker(apiCodegenFailureFixture.env);
  assert.notEqual(
    apiCodegenFailureResult.status,
    0,
    "API codegen failure unexpectedly passed",
  );
  assert.match(
    apiCodegenFailureResult.output,
    /Regenerate API artifacts with `pnpm --filter @workspace\/api-spec run codegen`\./,
  );
  assertDirectoryRestored(
    apiClientSnapshot,
    apiClientGeneratedPath,
    "failed API client output",
  );
  assertDirectoryRestored(
    apiZodSnapshot,
    apiZodGeneratedPath,
    "failed API validator output",
  );

  console.log("Generated finance artifact checker regression passed.");
} finally {
  fs.writeFileSync(schemaIndexPath, originalSchemaIndex);
  fs.rmSync(fixturePath, { force: true });
  restoreDirectory(migrationSnapshot, migrationsPath);
  if (apiCodegenFailureFixture) {
    fs.rmSync(apiCodegenFailureFixture.directory, {
      recursive: true,
      force: true,
    });
  }
}
