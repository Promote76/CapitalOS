import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const openGates = [];
let cleanMigrationExecuted = false;

function run(label, command, args, extraEnv = {}) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
  });
  if (result.status !== 0) {
    failures.push(`${label} exited with ${result.status ?? "a signal"}`);
  }
}

run("OpenAPI / React Query / Zod generation", "pnpm", ["--filter", "@workspace/api-spec", "run", "codegen"]);
run("Workspace typechecks", "pnpm", ["run", "typecheck"]);
run("API production build", "pnpm", ["--filter", "@workspace/api-server", "run", "build"]);
run("Frontend production build", "pnpm", ["--filter", "@workspace/capital-os", "run", "build"], {
  PORT: process.env.PORT ?? "5000",
  BASE_PATH: process.env.BASE_PATH ?? "/capital-os",
});
run("Default API tests", "pnpm", ["--filter", "@workspace/api-server", "test"]);
run("Express / OpenAPI route parity", "pnpm", ["--filter", "@workspace/api-server", "run", "check-contract"]);

const certificationDbUrl = process.env.CAPITAL_OS_CERTIFICATION_DB_URL;
if (!certificationDbUrl) {
  openGates.push("Dedicated certification PostgreSQL URL is not configured");
} else if (certificationDbUrl === process.env.DATABASE_URL) {
  failures.push("CAPITAL_OS_CERTIFICATION_DB_URL must not equal the shared DATABASE_URL");
} else {
  if (process.env.CAPITAL_OS_CERTIFICATION_ALLOW_RESET === "1") {
    cleanMigrationExecuted = true;
    run("Clean isolated migration baseline", "pnpm", ["run", "certify:migrations"], {
      CAPITAL_OS_CERTIFICATION_DB_URL: certificationDbUrl,
    });
  } else {
    openGates.push("Clean migration requires CAPITAL_OS_CERTIFICATION_ALLOW_RESET=1");
  }
  const pnpmStore = path.join(rootDir, "node_modules", ".pnpm");
  const tsxPackage = fs.readdirSync(pnpmStore).find((entry) => entry.startsWith("tsx@"));
  const tsxCli = tsxPackage && path.join(pnpmStore, tsxPackage, "node_modules", "tsx", "dist", "cli.mjs");
  if (!tsxCli || !fs.existsSync(tsxCli)) {
    failures.push("The workspace TypeScript runner is unavailable for the HTTP fixture");
  } else {
    run("Database-backed HTTP certification fixture", "node", [
      tsxCli,
      "--test",
      "artifacts/api-server/src/integration/p0-http.test.ts",
    ], {
      DATABASE_URL: certificationDbUrl,
      NODE_ENV: "test",
      CAPITAL_OS_TEST_CONTEXT: "1",
      CAPITAL_OS_RUN_INTEGRATION: "1",
      CAPITAL_OS_ALLOWED_ORIGIN: process.env.CAPITAL_OS_ALLOWED_ORIGIN ?? "http://capitalos.test",
    });
  }
}

if (!cleanMigrationExecuted) {
  openGates.push("Clean-database migration execution is not configured in this workspace");
}
openGates.push(
  "Existing-schema upgrade execution is not configured in this workspace",
  "Managed PostgreSQL backup and isolated restore evidence is not available",
  "Authenticated browser E2E credentials and execution environment are not available",
  "Production Clerk step-up provider configuration is not verified",
);

console.log("\n=== Certification result ===");
if (failures.length) {
  console.error("FAILED:");
  for (const failure of failures) console.error(`- ${failure}`);
}
if (openGates.length) {
  console.error("OPEN GATES:");
  for (const gate of openGates) console.error(`- ${gate}`);
}

if (failures.length) process.exitCode = 1;
else if (openGates.length) process.exitCode = 2;
else console.log("PRODUCTION CANDIDATE checks passed.");