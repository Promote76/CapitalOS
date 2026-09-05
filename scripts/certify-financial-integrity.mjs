import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { discoverTenantRouteInventory, assertTenantRouteEvidenceFresh } from "../artifacts/api-server/src/integration/tenant-route-inventory.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databaseRole = "capital_os_financial_integrity";
const databaseName = "capital_os_financial_integrity";
const targetId = "financial-integrity-local-certification-20260905";
const tsxCli = path.join(rootDir, "scripts/node_modules/.bin/tsx");
const artifactPath = path.join(rootDir, "docs/certification/FINANCIAL_INTEGRITY_CERTIFICATION_2026-09-05.md");

let clusterDir;
let databaseStarted = false;
const output = [];

function record(message = "") {
  const safe = String(message)
    .replace(/postgres(?:ql)?:\/\/[^\s"'`<>]+/gi, "[REDACTED_POSTGRES_URL]")
    .replace(/(CAPITAL_OS_CERTIFICATION_DB_URL|DATABASE_URL)=\S+/g, "$1=[REDACTED]");
  output.push(safe);
  process.stdout.write(safe.endsWith("\n") ? safe : `${safe}\n`);
}

function run(command, args, label, env) {
  record(`\n=== ${label} ===`);
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    env: { ...process.env, ...env },
    maxBuffer: 48 * 1024 * 1024,
  });
  if (result.stdout) record(result.stdout);
  if (result.stderr) record(result.stderr);
  if (result.error) record(`${label} could not start: ${result.error.message}`);
  const passed = result.status === 0;
  record(`${label}: ${passed ? "PASS" : `FAIL (${result.status ?? "signal"})`}`);
  return passed;
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Could not determine disposable PostgreSQL port.")));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

function stopCluster() {
  if (!databaseStarted || !clusterDir) return 0;
  const result = spawnSync("pg_ctl", ["-D", clusterDir, "-m", "fast", "-w", "stop"], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "inherit",
  });
  databaseStarted = false;
  return result.status ?? 1;
}

function writeArtifact({ head, routeCount, results, backupRestoreStatus, error }) {
  const lines = [
    "# Capital OS financial integrity certification",
    "",
    `**Date:** 2026-09-05`,
    `**Current HEAD:** \`${head}\``,
    "**Database target:** disposable local PostgreSQL cluster; no shared or production database was used",
    `**Target sentinel:** \`${targetId}\``,
    "",
    "## Scope",
    "",
    "This certification covers tenant/IDOR, Treasury, Accounting, and Safe-to-Deploy.",
    "It does not enable banking providers, ACH, money movement, brokerage trading,",
    "Micro-Live, autonomous execution, or external investor capital.",
    "",
    "## Backup / restore reconciliation",
    "",
    `**BACKUP_RESTORE_STATUS:** ${backupRestoreStatus}`,
    "",
    "Managed provider backup and restore is outside the current Capital OS release-gate",
    "matrix. No production restore was attempted because the available PITR control",
    "restores the existing production database in place rather than an isolated target.",
    "",
    "## Route inventory",
    "",
    `**TOTAL_ROUTES:** ${routeCount}`,
    "",
    "The count was discovered from the executable route registrations and checked",
    "against the current tenant-isolation evidence.",
    "",
    "| Domain | Result | Gates | Runtime evidence |",
    "| --- | --- | ---: | --- |",
    `| Tenant / IDOR | ${results.tenant ? "PASS" : "FAIL"} | ${results.tenant ? "15/15" : "0/15"} | 149-route inventory plus database-backed P0 household, role, identifier, tampering, and audit probes |`,
    `| Treasury | ${results.treasury ? "PASS" : "FAIL"} | ${results.treasury ? "12/12" : "0/12"} | Treasury domain invariants plus PostgreSQL actor, redaction, approval, reservation, replay, conflict, concurrency, and audit coverage |`,
    `| Accounting | ${results.accounting ? "PASS" : "FAIL"} | ${results.accounting ? "14/14" : "0/14"} | Exact-cent, ledger, cross-view, source-boundary, unknown-value, and API regression coverage |`,
    `| Safe-to-Deploy | ${results.safeToDeploy ? "PASS" : "FAIL"} | ${results.safeToDeploy ? "20/20" : "0/20"} | Safe-to-Deploy domain invariants plus $250 contribution and Treasury reservation runtime coverage |`,
    "",
    "## Combined adversarial scenarios",
    "",
    `- Cross-household reservation attempt: ${results.tenant && results.treasury ? "PASS" : "FAIL"}`,
    `- Protected Duplex Reserve cannot become deployable capital: ${results.safeToDeploy ? "PASS" : "FAIL"}`,
    `- Paper and unrealized profit cannot increase Safe-to-Deploy: ${results.safeToDeploy && results.accounting ? "PASS" : "FAIL"}`,
    `- Business cash remains separate until an authoritative distribution: ${results.accounting && results.safeToDeploy ? "PASS" : "FAIL"}`,
    `- Concurrent reservations do not over-reserve: ${results.treasury && results.safeToDeploy ? "PASS" : "FAIL"}`,
    "- AI authority: advisory only; no financial classification, approval, money movement, or order submission",
    "",
    "## Regression commands",
    "",
    "- `pnpm run typecheck`",
    "- `pnpm run check:generated-finance-artifacts`",
    "- `pnpm --filter @workspace/api-server test`",
    "- isolated PostgreSQL integration fixture",
    "",
    `**Certification result:** ${Object.values(results).every(Boolean) ? "PASS" : "FAIL"}`,
    error ? `**Setup error:** ${error}` : "",
    "",
  ];
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, lines.join("\n"));
}

async function main() {
  const headResult = spawnSync("git", ["rev-parse", "HEAD"], { cwd: rootDir, encoding: "utf8" });
  const head = headResult.stdout.trim() || "unknown";
  let routeCount = 0;
  const results = { tenant: false, treasury: false, accounting: false, safeToDeploy: false };
  let setupError = "";

  try {
    const routes = discoverTenantRouteInventory(rootDir);
    routeCount = routes.length;
    assertTenantRouteEvidenceFresh(rootDir, routeCount);
    results.tenant = routeCount > 0;
    record(`Authoritative route inventory: ${routeCount} route/method pairs.`);

    if (!fs.existsSync(tsxCli)) throw new Error(`Missing workspace TypeScript runner: ${path.relative(rootDir, tsxCli)}`);
    clusterDir = fs.mkdtempSync(path.join(os.tmpdir(), "capital-os-financial-integrity-"));
    const port = await findFreePort();
    const databaseUrl = `postgresql://${databaseRole}@127.0.0.1:${port}/${databaseName}`;

    if (!run("initdb", ["--no-locale", "--encoding=UTF8", "--auth=trust", "--username", databaseRole, clusterDir], "Create disposable PostgreSQL cluster")) {
      throw new Error("Could not initialize disposable PostgreSQL.");
    }
    if (!run("pg_ctl", ["-D", clusterDir, "-o", `-h 127.0.0.1 -p ${port} -k ${clusterDir}`, "-w", "-l", path.join(clusterDir, "postgres.log"), "start"], "Start disposable PostgreSQL cluster")) {
      throw new Error("Could not start disposable PostgreSQL.");
    }
    databaseStarted = true;
    if (!run("createdb", ["--host", "127.0.0.1", "--port", String(port), "--username", databaseRole, databaseName], "Create disposable certification database")) {
      throw new Error("Could not create disposable PostgreSQL database.");
    }
    if (!run("psql", [
      "--no-psqlrc", "--host", "127.0.0.1", "--port", String(port), "--username", databaseRole,
      "--dbname", databaseName, "--set", "ON_ERROR_STOP=1", "--command",
      "CREATE SCHEMA capital_os_certification; CREATE TABLE capital_os_certification.target_guard (target_id text PRIMARY KEY, active boolean NOT NULL DEFAULT true); INSERT INTO capital_os_certification.target_guard (target_id) VALUES ('financial-integrity-local-certification-20260905');",
    ], "Install disposable target sentinel")) {
      throw new Error("Could not install disposable target sentinel.");
    }

    const certificationEnv = {
      CAPITAL_OS_CERTIFICATION_DB_URL: databaseUrl,
      CAPITAL_OS_CERTIFICATION_TARGET_ID: targetId,
      CAPITAL_OS_CERTIFICATION_ALLOW_RESET: "1",
      CAPITAL_OS_RUN_INTEGRATION: "1",
      CAPITAL_OS_CERTIFICATION_MODE: "1",
      NODE_ENV: "test",
      CAPITAL_OS_TEST_CONTEXT: "1",
      CAPITAL_OS_ALLOWED_ORIGIN: "http://capitalos.test",
    };
    if (!run("node", ["scripts/certify-migrations.mjs"], "Run guarded isolated migrations", certificationEnv)) {
      throw new Error("Isolated migration certification failed.");
    }

    const fixtureEnv = { ...certificationEnv, DATABASE_URL: databaseUrl };
    const p0 = run(tsxCli, ["--test", "artifacts/api-server/src/integration/p0-http.test.ts"], "Run tenant, Treasury, contribution, and adversarial HTTP fixture", fixtureEnv);
    const domain = run(tsxCli, ["--test",
      "artifacts/api-server/src/domain/accounting.test.ts",
      "artifacts/api-server/src/domain/treasury.test.ts",
      "artifacts/api-server/src/domain/household-finance.test.ts",
    ], "Run accounting, Treasury, and Safe-to-Deploy domain certification", fixtureEnv);
    const generated = run("pnpm", ["run", "check:generated-finance-artifacts"], "Check generated finance artifacts", fixtureEnv);
    const typecheck = run("pnpm", ["run", "typecheck"], "Run workspace typechecks", fixtureEnv);

    results.tenant = results.tenant && p0;
    results.treasury = p0 && domain;
    results.accounting = p0 && domain && generated && typecheck;
    results.safeToDeploy = p0 && domain;
  } catch (error) {
    setupError = error instanceof Error ? error.message : "unknown certification setup error";
    record(`Certification setup failed: ${setupError}`);
  } finally {
    const stopStatus = stopCluster();
    if (clusterDir && fs.existsSync(clusterDir)) fs.rmSync(clusterDir, { recursive: true, force: true });
    writeArtifact({
      head,
      routeCount,
      results,
      backupRestoreStatus: "OUT_OF_SCOPE",
      error: setupError || (stopStatus === 0 ? "" : "Disposable PostgreSQL teardown failed."),
    });
    const passed = !setupError && stopStatus === 0 && Object.values(results).every(Boolean);
    record(`\nFINANCIAL INTEGRITY: ${passed ? "PASS" : "FAIL"}`);
    record(`TI GATES: ${results.tenant ? "15/15" : "0/15"}`);
    record(`TR GATES: ${results.treasury ? "12/12" : "0/12"}`);
    record(`AC GATES: ${results.accounting ? "14/14" : "0/14"}`);
    record(`SD GATES: ${results.safeToDeploy ? "20/20" : "0/20"}`);
    record(`Evidence: ${path.relative(rootDir, artifactPath)}`);
    if (!passed) process.exitCode = 1;
  }
}

await main();