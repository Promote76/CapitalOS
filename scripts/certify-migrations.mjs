import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databaseUrl = process.env.CAPITAL_OS_CERTIFICATION_DB_URL;
const migrationPath = path.join(rootDir, "lib/db/migrations/0000_previous_kang.sql");
const historicalSchemaPath = path.join(rootDir, "docs/certification/HISTORICAL_SCHEMA_2026-09-01.sql");

if (!databaseUrl) {
  console.error("BLOCKED: set CAPITAL_OS_CERTIFICATION_DB_URL to a disposable isolated PostgreSQL database.");
  process.exit(2);
}
if (databaseUrl === process.env.DATABASE_URL) {
  console.error("REFUSED: certification database must not be the shared DATABASE_URL.");
  process.exit(1);
}
if (process.env.CAPITAL_OS_CERTIFICATION_ALLOW_RESET !== "1") {
  console.error("BLOCKED: set CAPITAL_OS_CERTIFICATION_ALLOW_RESET=1 to reset only the dedicated certification database.");
  process.exit(2);
}

function psql(args, label) {
  console.log(`=== ${label} ===`);
  const result = spawnSync("psql", ["--no-psqlrc", "--dbname", databaseUrl, "--set", "ON_ERROR_STOP=1", ...args], {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    console.error(`${label} failed.`);
    process.exit(result.status ?? 1);
  }
}

if (!fs.existsSync(migrationPath)) {
  console.error(`Missing migration artifact: ${path.relative(rootDir, migrationPath)}`);
  process.exit(1);
}
if (!fs.existsSync(historicalSchemaPath)) {
  console.error(`Missing historical schema artifact: ${path.relative(rootDir, historicalSchemaPath)}`);
  process.exit(1);
}

psql(["--command", "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"], "Reset isolated certification schema");
psql(["--file", migrationPath], "Apply generated baseline migration");
psql([
  "--command",
  "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('capital_users', 'households', 'household_members', 'capital_accounts', 'ledger_transactions', 'ledger_entries') ORDER BY table_name;",
], "Verify certification baseline tables");
console.log(`Historical schema artifact is available at ${path.relative(rootDir, historicalSchemaPath)}.`);
console.log("Clean migration baseline passed. Existing-schema upgrade and rollback/forward-fix execution remain separate gates.");