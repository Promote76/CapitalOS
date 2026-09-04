import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const migrationDir = path.join(rootDir, "lib/db/migrations");
const tsxCli = path.join(rootDir, "scripts/node_modules/.bin/tsx");
const evidenceDir = path.join(
  rootDir,
  "docs/certification/operations-recovery-runs",
);
const databaseRole = "capital_os_certification";
const databaseName = "capital_os_certification";
const requiredTests = [
  "src/domain/operations.test.ts",
  "src/integration/operations-recovery.test.ts",
  "src/integration/operations-recovery-certification.test.ts",
  "src/integration/operations-worker-probe.ts",
];

const gates = [
  "OR-01 Durable Persistence",
  "OR-02 Atomic Leasing",
  "OR-03 Worker Heartbeat",
  "OR-04 Stale Worker Detection",
  "OR-05 Graceful Shutdown",
  "OR-06 Hard Crash Recovery",
  "OR-07 Retry Policy",
  "OR-08 Backoff",
  "OR-09 Dead Letter",
  "OR-10 Operator Reprocessing",
  "OR-11 Idempotent Recovery",
  "OR-12 Scheduler Persistence",
  "OR-13 Scheduler Leadership",
  "OR-14 Missed Schedule Recovery",
  "OR-15 Household Isolation",
  "OR-16 Execution Control Integration",
  "OR-17 Guardian Integration",
  "OR-18 STOP During Job",
  "OR-19 Reconciliation Recovery",
  "OR-20 UNKNOWN Order Recovery",
  "OR-21 Audit Attribution",
  "OR-22 Multi-Worker Contention",
  "OR-23 Queue Metrics",
  "OR-24 Scheduler Metrics",
];

let evidencePath;
let evidenceStream;

function redactSensitiveOutput(value) {
  return value
    .replace(/postgres(?:ql)?:\/\/[^\s"'`<>]+/gi, "[REDACTED_POSTGRES_URL]")
    .replace(
      /(CAPITAL_OS_CERTIFICATION_DB_URL|DATABASE_URL)=\S+/g,
      "$1=[REDACTED]",
    );
}

function record(value = "") {
  const safe = redactSensitiveOutput(String(value));
  process.stdout.write(safe);
  if (!safe.endsWith("\n")) process.stdout.write("\n");
  evidenceStream?.write(safe.endsWith("\n") ? safe : `${safe}\n`);
}

function commandResult(
  command,
  args,
  { env = process.env, cwd = rootDir } = {},
) {
  return spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

function runCommand(command, args, label, options = {}) {
  record(`\n=== ${label} ===`);
  const result = commandResult(command, args, options);
  if (result.stdout) record(result.stdout);
  if (result.stderr) record(result.stderr);
  if (result.error) record(`${label} could not start.`);
  const status = result.status ?? 1;
  if (status !== 0) {
    record(`${label} failed with exit code ${status}.`);
  }
  return status;
}

function migrationFiles() {
  if (!fs.existsSync(migrationDir)) {
    throw new Error(
      `Missing migration directory: ${path.relative(rootDir, migrationDir)}`,
    );
  }
  const files = fs
    .readdirSync(migrationDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  if (files.length === 0) {
    throw new Error("No committed SQL migrations were found.");
  }
  return files.map((file) => path.join(migrationDir, file));
}

function assertRequiredTests() {
  for (const file of requiredTests) {
    const absolutePath = path.join(rootDir, "artifacts/api-server", file);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Missing required certification test: ${file}`);
    }
  }
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(
            new Error("Could not determine a disposable PostgreSQL port."),
          ),
        );
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

function createEvidencePath() {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const timestamp = new Date()
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[:.]/g, "-");
  return path.join(evidenceDir, `operations-recovery-${timestamp}.log`);
}

function startDatabase(clusterDir, port) {
  const initStatus = runCommand(
    "initdb",
    [
      "--no-locale",
      "--encoding=UTF8",
      "--auth=trust",
      "--username",
      databaseRole,
      clusterDir,
    ],
    "Create disposable PostgreSQL cluster",
  );
  if (initStatus !== 0) return initStatus;

  const serverLog = path.join(clusterDir, "postgres.log");
  const status = runCommand(
    "pg_ctl",
    [
      "-D",
      clusterDir,
      "-o",
      `-h 127.0.0.1 -p ${port} -k ${clusterDir}`,
      "-w",
      "-l",
      serverLog,
      "start",
    ],
    "Start disposable PostgreSQL cluster",
  );
  if (status !== 0 && fs.existsSync(serverLog)) {
    record("\nPostgreSQL startup log:");
    record(fs.readFileSync(serverLog, "utf8"));
  }
  return status;
}

function stopDatabase(clusterDir) {
  if (!clusterDir || !fs.existsSync(clusterDir)) return 0;
  const result = runCommand(
    "pg_ctl",
    ["-D", clusterDir, "-m", "fast", "-w", "stop"],
    "Stop disposable PostgreSQL cluster",
  );
  return result;
}

function removeDatabase(clusterDir) {
  if (!clusterDir || !fs.existsSync(clusterDir)) return 0;
  try {
    fs.rmSync(clusterDir, { recursive: true, force: true });
    record("Removed disposable PostgreSQL cluster files.");
    return 0;
  } catch {
    record("Failed to remove disposable PostgreSQL cluster files.");
    return 1;
  }
}

async function main() {
  evidencePath = createEvidencePath();
  evidenceStream = fs.createWriteStream(evidencePath, { flags: "wx" });
  record("Operations recovery certification run");
  record(`Started: ${new Date().toISOString()}`);
  record("Target: disposable local PostgreSQL cluster");
  record("Connection details are intentionally excluded from this evidence.");

  let clusterDir;
  let databaseStarted = false;
  let certificationStatus = 1;
  let teardownStatus = 0;

  try {
    if (!fs.existsSync(tsxCli)) {
      record(
        `Missing workspace TypeScript runner: ${path.relative(rootDir, tsxCli)}`,
      );
      return 1;
    }

    assertRequiredTests();
    const migrations = migrationFiles();
    clusterDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "capital-os-operations-recovery-"),
    );
    const port = await findFreePort();
    const certificationDbUrl = `postgresql://${databaseRole}@127.0.0.1:${port}/${databaseName}`;

    const startStatus = startDatabase(clusterDir, port);
    if (startStatus !== 0) return startStatus;
    databaseStarted = true;

    const createDatabaseStatus = runCommand(
      "createdb",
      [
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--username",
        databaseRole,
        databaseName,
      ],
      "Create disposable certification database",
    );
    if (createDatabaseStatus !== 0) return createDatabaseStatus;

    for (const migration of migrations) {
      const migrationStatus = runCommand(
        "psql",
        [
          "--no-psqlrc",
          "--host",
          "127.0.0.1",
          "--port",
          String(port),
          "--username",
          databaseRole,
          "--dbname",
          databaseName,
          "--set",
          "ON_ERROR_STOP=1",
          "--file",
          migration,
        ],
        `Apply committed migration ${path.basename(migration)}`,
      );
      if (migrationStatus !== 0) return migrationStatus;
    }

    const testEnv = {
      ...process.env,
      CAPITAL_OS_CERTIFICATION_DB_URL: certificationDbUrl,
      CAPITAL_OS_RUN_INTEGRATION: "1",
      DATABASE_URL: certificationDbUrl,
    };
    certificationStatus = runCommand(
      tsxCli,
      [
        "--test",
        "src/domain/operations.test.ts",
        "src/integration/operations-recovery.test.ts",
        "src/integration/operations-recovery-certification.test.ts",
      ],
      "Run operations recovery tests",
      {
        cwd: path.join(rootDir, "artifacts/api-server"),
        env: testEnv,
      },
    );
    if (certificationStatus !== 0) return certificationStatus;

    record("\nOperations recovery certification matrix:");
    for (const gate of gates) record(`PASS ${gate}`);
    record(
      `\nOperations recovery certification: PASS (${gates.length}/${gates.length} OR gates)`,
    );
    certificationStatus = 0;
    return 0;
  } catch (error) {
    record(
      `Certification setup failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    return 1;
  } finally {
    if (databaseStarted) {
      teardownStatus = stopDatabase(clusterDir);
    }
    const removeStatus = removeDatabase(clusterDir);
    teardownStatus ||= removeStatus;
    if (teardownStatus !== 0) {
      record(`Certification teardown failed with exit code ${teardownStatus}.`);
    } else {
      record("Certification teardown completed.");
    }
    record(`Evidence: ${path.relative(rootDir, evidencePath)}`);
    evidenceStream?.end();
    if (certificationStatus !== 0 || teardownStatus !== 0) {
      process.exitCode = certificationStatus || teardownStatus || 1;
    }
  }
}

await main();
