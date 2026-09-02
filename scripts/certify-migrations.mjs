import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databaseUrl = process.env.CAPITAL_OS_CERTIFICATION_DB_URL;
const targetId = process.env.CAPITAL_OS_CERTIFICATION_TARGET_ID;
const migrationPath = path.join(rootDir, "lib/db/migrations/0000_previous_kang.sql");
const historicalSchemaPath = path.join(rootDir, "docs/certification/HISTORICAL_SCHEMA_2026-09-01.sql");

function canonicalTarget(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") return null;
    return `${parsed.hostname.toLowerCase()}:${parsed.port || "5432"}${parsed.pathname}`;
  } catch {
    return null;
  }
}

if (!databaseUrl) {
  console.error("BLOCKED: set CAPITAL_OS_CERTIFICATION_DB_URL to a disposable isolated PostgreSQL database.");
  process.exit(2);
}
const certificationTarget = canonicalTarget(databaseUrl);
if (!certificationTarget) {
  console.error("REFUSED: CAPITAL_OS_CERTIFICATION_DB_URL is not a valid PostgreSQL URL.");
  process.exit(1);
}
const sharedTarget = process.env.DATABASE_URL ? canonicalTarget(process.env.DATABASE_URL) : null;
if (sharedTarget && certificationTarget === sharedTarget) {
  console.error("REFUSED: certification database must not be the shared DATABASE_URL.");
  process.exit(1);
}
if (!targetId) {
  console.error("BLOCKED: CAPITAL_OS_CERTIFICATION_TARGET_ID is required and must match the disposable database sentinel.");
  process.exit(2);
}
if (!/^[A-Za-z0-9_-]{16,128}$/.test(targetId)) {
  console.error("REFUSED: CAPITAL_OS_CERTIFICATION_TARGET_ID must be a 16-128 character opaque identifier.");
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

const sentinel = spawnSync("psql", [
  "--no-psqlrc",
  "--dbname",
  databaseUrl,
  "--set",
  "ON_ERROR_STOP=1",
  "--tuples-only",
  "--no-align",
  "--command",
  "SELECT target_id FROM capital_os_certification.target_guard WHERE active IS TRUE LIMIT 1;",
], {
  cwd: rootDir,
  encoding: "utf8",
  env: process.env,
});
if (sentinel.status !== 0 || sentinel.stdout.trim() !== targetId) {
  console.error("REFUSED: the disposable certification target sentinel is missing or does not match.");
  process.exit(1);
}

if (!fs.existsSync(migrationPath)) {
  console.error(`Missing migration artifact: ${path.relative(rootDir, migrationPath)}`);
  process.exit(1);
}
if (!fs.existsSync(historicalSchemaPath)) {
  console.error(`Missing historical schema artifact: ${path.relative(rootDir, historicalSchemaPath)}`);
  process.exit(1);
}

psql([
  "--command",
  `DO $guard$
  DECLARE actual_target text;
  BEGIN
    SELECT target_id INTO actual_target
      FROM capital_os_certification.target_guard
      WHERE active IS TRUE
      LIMIT 1;
    IF actual_target IS DISTINCT FROM '${targetId}' THEN
      RAISE EXCEPTION 'certification target sentinel changed before reset';
    END IF;
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
  END
  $guard$;`,
], "Reset isolated certification schema");
psql(["--file", migrationPath], "Apply generated baseline migration");
psql([
  "--command",
  "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('capital_users', 'households', 'household_members', 'capital_accounts', 'ledger_transactions', 'ledger_entries') ORDER BY table_name;",
], "Verify certification baseline tables");
console.log(`Historical schema artifact is available at ${path.relative(rootDir, historicalSchemaPath)}.`);
console.log("Clean migration baseline passed. Existing-schema upgrade and rollback/forward-fix execution remain separate gates.");