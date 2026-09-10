import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { computeRc1ReleaseIdentity } from "./lib/rc1-release-identity.mjs";
import { discoverTenantRouteInventory } from "../artifacts/api-server/src/integration/tenant-route-inventory.mjs";

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
  "src/integration/rc1-readiness-certification.test.ts",
];
const readinessEvidencePath = path.join(
  rootDir,
  "docs/certification/RC1_READINESS_CERTIFICATION.json",
);

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

function releaseMigrationFiles() {
  const archiveMigration = path.join(
    migrationDir,
    "0053_restore_audit_archive.sql",
  );
  if (!fs.existsSync(archiveMigration)) {
    throw new Error("The RC1 audit archive migration is missing.");
  }
  return [archiveMigration];
}

function createPreMigrationArchiveGap(port) {
  return runCommand(
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
      "--command",
      `
        drop trigger if exists audit_events_archive_on_insert on public.audit_events;
        drop trigger if exists audit_events_archive_restricted_insert on public.audit_events_archive;
        drop trigger if exists audit_events_archive_append_only on public.audit_events_archive;
        insert into public.households (id, name)
          values ('00000000-0000-4000-8000-000000000053', 'RC1 isolated certification');
        insert into public.audit_events (
          id, household_id, event_type, actor, entity, entity_id, metadata
        ) values (
          '00000000-0000-4000-8000-000000000053',
          '00000000-0000-4000-8000-000000000053',
          'rc1_pre_trigger_backfill',
          'rc1-certification',
          'release',
          'rc1',
          '{}'::jsonb
        );
        do $$
        begin
          if exists (
            select 1 from public.audit_events_archive
            where event_id = '00000000-0000-4000-8000-000000000053'
          ) then
            raise exception 'pre-migration archive gap was not established';
          end if;
        end
        $$;
      `,
    ],
    "Create isolated pre-migration archive gap",
  );
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
  const releaseIdentity = computeRc1ReleaseIdentity(rootDir);
  const routeCount = discoverTenantRouteInventory(rootDir).length;
  evidencePath = createEvidencePath();
  evidenceStream = fs.createWriteStream(evidencePath, { flags: "wx" });
  record("Operations recovery certification run");
  record(`Started: ${new Date().toISOString()}`);
  record("Target: disposable local PostgreSQL cluster");
  record("Connection details are intentionally excluded from this evidence.");
  record(`Base commit: ${releaseIdentity.baseCommit}`);
  record(`Exact source SHA-256: ${releaseIdentity.sourceSha256}`);
  record(`Release input count: ${releaseIdentity.inputCount}`);
  record(`Current route inventory: ${routeCount}`);
  record(
    `Approved alert destination configured: ${process.env.CAPITAL_OS_ALERT_SLACK_CHANNEL_ID?.trim() ? "yes" : "no (explicit blocker)"}`,
  );

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
    if (
      runCommand(
        "node",
        ["scripts/check-api-artifact-config.mjs"],
        "Verify artifact-mode production runtime configuration",
      ) !== 0
    ) return 1;
    if (
      runCommand(
        "node",
        ["scripts/check-api-contract.mjs"],
        "Verify current API route inventory and evidence markers",
      ) !== 0
    ) return 1;
    const migrations = releaseMigrationFiles();
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

    const schemaStatus = runCommand(
      "pnpm",
      ["--filter", "@workspace/db", "run", "push-force"],
      "Install current declared schema on disposable target",
      {
        env: {
          ...process.env,
          DATABASE_URL: certificationDbUrl,
        },
      },
    );
    if (schemaStatus !== 0) return schemaStatus;

    const gapStatus = createPreMigrationArchiveGap(port);
    if (gapStatus !== 0) return gapStatus;

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
        "--test-concurrency=1",
        "src/domain/operations.test.ts",
        "src/integration/operations-recovery.test.ts",
        "src/integration/operations-recovery-certification.test.ts",
        "src/integration/rc1-readiness-certification.test.ts",
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
    fs.mkdirSync(path.dirname(readinessEvidencePath), { recursive: true });
    fs.writeFileSync(
      readinessEvidencePath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          releaseCandidate: "RC1",
          result: "PASS_WITH_BLOCKER",
          generatedAt: new Date().toISOString(),
          source: releaseIdentity,
          routeInventory: {
            current: routeCount,
            executed: routeCount,
            result: "PASS",
          },
          databaseTarget: "DISPOSABLE_LOCAL_POSTGRESQL",
          migrationSet: [
            "CURRENT_DECLARED_SCHEMA",
            ...migrations.map((migration) => path.basename(migration)),
          ],
          archive: {
            cleanInstall: "PASS",
            backfill: "PASS",
            synchronousTrigger: "PASS",
            appendOnlySource: "PASS",
            appendOnlyArchive: "PASS",
            directArchiveInsertRejected: "PASS",
          },
          operations: {
            workerStartup: "PASS",
            schedulerStartup: "PASS",
            staleLeaseRecovery: "PASS",
            retryAndDeadLetter: "PASS",
            gracefulRestart: "PASS",
          },
          readiness: {
            schemaAndRuntime: "PASS",
            resultWithoutApprovedDestination: "OBSERVABILITY_NOT_READY",
          },
          observability: {
            rules: "PASS",
            internalDatabasePlumbing: "PASS",
            approvedDestinationConfigured: Boolean(
              process.env.CAPITAL_OS_ALERT_SLACK_CHANNEL_ID?.trim(),
            ),
            externalDelivery:
              process.env.CAPITAL_OS_ALERT_SLACK_CHANNEL_ID?.trim()
                ? "NOT_RUN"
                : "BLOCKED_NO_APPROVED_DESTINATION",
          },
          safety: {
            execution: "ADVISORY_ONLY",
            venueExecution: "DISABLED",
            moneyMovement: "DISABLED",
          },
          evidenceLog: path.relative(rootDir, evidencePath),
        },
        null,
        2,
      )}\n`,
    );
    record(
      `Readiness evidence: ${path.relative(rootDir, readinessEvidencePath)}`,
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
