import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databaseRole = "capital_os_certification";
const databaseName = "capital_os_certification";
const targetId = "task49-local-certification-20260905";
const tsxCli = path.join(rootDir, "scripts/node_modules/.bin/tsx");
const evidenceDir = path.join(rootDir, "docs/certification/household-privacy-runs");

let evidenceStream;
let clusterDir;
let databaseStarted = false;

function redact(value) {
  return String(value)
    .replace(/postgres(?:ql)?:\/\/[^\s"'`<>]+/gi, "[REDACTED_POSTGRES_URL]")
    .replace(/(CAPITAL_OS_CERTIFICATION_DB_URL|DATABASE_URL)=\S+/g, "$1=[REDACTED]");
}

function record(value = "") {
  const safe = redact(value);
  process.stdout.write(safe);
  if (!safe.endsWith("\n")) process.stdout.write("\n");
  evidenceStream?.write(safe.endsWith("\n") ? safe : `${safe}\n`);
}

function run(command, args, label, extraEnv = {}) {
  record(`\n=== ${label} ===`);
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.stdout) record(result.stdout);
  if (result.stderr) record(result.stderr);
  if (result.error) record(`${label} could not start.`);
  const status = result.status ?? 1;
  if (status !== 0) record(`${label} failed with exit code ${status}.`);
  return status;
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Could not determine a disposable PostgreSQL port.")));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

function stopAndRemoveCluster() {
  let status = 0;
  if (databaseStarted) {
    status = run("pg_ctl", ["-D", clusterDir, "-m", "fast", "-w", "stop"], "Stop disposable PostgreSQL cluster");
  }
  if (clusterDir && fs.existsSync(clusterDir)) {
    try {
      fs.rmSync(clusterDir, { recursive: true, force: true });
      record("Removed disposable PostgreSQL cluster files.");
    } catch {
      record("Failed to remove disposable PostgreSQL cluster files.");
      status ||= 1;
    }
  }
  return status;
}

async function main() {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[:.]/g, "-");
  const evidencePath = path.join(evidenceDir, `household-privacy-${timestamp}.log`);
  evidenceStream = fs.createWriteStream(evidencePath, { flags: "wx" });
  record("Capital OS household privacy certification");
  record(`Started: ${new Date().toISOString()}`);
  record("Target: disposable local PostgreSQL cluster");
  record(`Target sentinel: ${targetId}`);
  record("Connection details are intentionally excluded from this evidence.");

  let certificationStatus = 1;
  let teardownStatus = 0;
  try {
    if (!fs.existsSync(tsxCli)) {
      record(`Missing workspace TypeScript runner: ${path.relative(rootDir, tsxCli)}`);
      return;
    }

    clusterDir = fs.mkdtempSync(path.join(os.tmpdir(), "capital-os-household-privacy-"));
    const port = await findFreePort();
    const databaseUrl = `postgresql://${databaseRole}@127.0.0.1:${port}/${databaseName}`;

    if (run(
      "initdb",
      ["--no-locale", "--encoding=UTF8", "--auth=trust", "--username", databaseRole, clusterDir],
      "Create disposable PostgreSQL cluster",
    ) !== 0) return;
    if (run(
      "pg_ctl",
      ["-D", clusterDir, "-o", `-h 127.0.0.1 -p ${port} -k ${clusterDir}`, "-w", "-l", path.join(clusterDir, "postgres.log"), "start"],
      "Start disposable PostgreSQL cluster",
    ) !== 0) return;
    databaseStarted = true;
    if (run(
      "createdb",
      ["--host", "127.0.0.1", "--port", String(port), "--username", databaseRole, databaseName],
      "Create disposable certification database",
    ) !== 0) return;
    if (run(
      "psql",
      [
        "--no-psqlrc",
        "--host", "127.0.0.1",
        "--port", String(port),
        "--username", databaseRole,
        "--dbname", databaseName,
        "--set", "ON_ERROR_STOP=1",
        "--command",
        "CREATE SCHEMA capital_os_certification; CREATE TABLE capital_os_certification.target_guard (target_id text PRIMARY KEY, active boolean NOT NULL DEFAULT true); INSERT INTO capital_os_certification.target_guard (target_id) VALUES ('task49-local-certification-20260905');",
      ],
      "Install disposable target sentinel",
    ) !== 0) return;

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
    if (run("node", ["scripts/certify-migrations.mjs"], "Run guarded isolated migration certification", certificationEnv) !== 0) return;
    const fixtureEnv = { ...certificationEnv, DATABASE_URL: databaseUrl };
    certificationStatus = run(
      tsxCli,
      ["--test", "artifacts/api-server/src/integration/p0-http.test.ts"],
      "Run P0-01, P0-05, P0-06, and P0-08 household privacy fixture",
      fixtureEnv,
    );
    if (certificationStatus === 0) {
      record("\nHousehold privacy certification: PASS");
      record("P0-01 PASS — every discovered route and applicable identifier/body probe completed without cross-household leakage.");
      record("P0-06 PASS — Owner, Partner, Advisor, Viewer, permission grant/revoke, membership transitions, selection, and tampering cases passed.");
      record("P0-08 PASS — permitted audit actors persisted and denied actions created no misleading audit row.");
    }
  } catch (error) {
    record(`Certification setup failed: ${error instanceof Error ? error.message : "unknown error"}`);
  } finally {
    teardownStatus = stopAndRemoveCluster();
    record(`Certification teardown ${teardownStatus === 0 ? "completed" : "failed"}.`);
    record(`Evidence: ${path.relative(rootDir, evidencePath)}`);
    evidenceStream?.end();
    if (certificationStatus !== 0 || teardownStatus !== 0) process.exitCode = certificationStatus || teardownStatus || 1;
  }
}

await main();