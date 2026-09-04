import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrations = path.join(root, "lib/db/migrations");
const api = path.join(root, "artifacts/api-server");
const tsx = path.join(root, "scripts/node_modules/.bin/tsx");
const role = "capital_os_observability";
const database = "capital_os_observability";
const gates = Array.from(
  { length: 25 },
  (_, index) => `OB-${String(index + 1).padStart(2, "0")}`,
);
const evidenceDir = path.join(root, "docs/certification/observability-runs");
let evidence;

function safe(value = "") {
  return String(value)
    .replace(/postgres(?:ql)?:\/\/[^\s"'`<>]+/gi, "[REDACTED_POSTGRES_URL]")
    .replace(
      /(DATABASE_URL|CAPITAL_OS_CERTIFICATION_DB_URL)=\S+/g,
      "$1=[REDACTED]",
    );
}

function record(value = "") {
  const output = safe(value);
  process.stdout.write(output.endsWith("\n") ? output : `${output}\n`);
  evidence?.write(output.endsWith("\n") ? output : `${output}\n`);
}

function run(command, args, label, options = {}) {
  record(`\n=== ${label} ===`);
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: options.env ?? process.env,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.stdout) record(result.stdout);
  if (result.stderr) record(result.stderr);
  if (result.error) record(`${label} could not start: ${result.error.message}`);
  return result.status ?? 1;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string")
        return reject(new Error("No disposable PostgreSQL port"));
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

async function main() {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const stamp = new Date()
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[:.]/g, "-");
  const evidencePath = path.join(evidenceDir, `observability-${stamp}.log`);
  evidence = fs.createWriteStream(evidencePath, { flags: "wx" });
  record("Capital OS observability certification");
  record(`Started: ${new Date().toISOString()}`);
  record("Target: disposable local PostgreSQL plus attached Slack connector");
  let cluster;
  let started = false;
  let status = 1;
  let teardown = 0;
  try {
    if (!fs.existsSync(tsx))
      throw new Error("Workspace TypeScript runner is missing");
    const testFile = path.join(
      api,
      "src/integration/observability-certification.test.ts",
    );
    if (!fs.existsSync(testFile))
      throw new Error("Observability certification test is missing");
    cluster = fs.mkdtempSync(
      path.join(os.tmpdir(), "capital-os-observability-"),
    );
    const port = await freePort();
    if (
      run(
        "initdb",
        [
          "--no-locale",
          "--encoding=UTF8",
          "--auth=trust",
          "--username",
          role,
          cluster,
        ],
        "Create disposable PostgreSQL cluster",
      ) !== 0
    )
      return 1;
    const postgresLog = path.join(cluster, "postgres.log");
    if (
      run(
        "pg_ctl",
        [
          "-D",
          cluster,
          "-o",
          `-h 127.0.0.1 -p ${port} -k ${cluster}`,
          "-w",
          "-l",
          postgresLog,
          "start",
        ],
        "Start disposable PostgreSQL cluster",
      ) !== 0
    )
      return 1;
    started = true;
    if (
      run(
        "createdb",
        [
          "--host",
          "127.0.0.1",
          "--port",
          String(port),
          "--username",
          role,
          database,
        ],
        "Create disposable certification database",
      ) !== 0
    )
      return 1;
    for (const migration of fs
      .readdirSync(migrations)
      .filter((file) => file.endsWith(".sql"))
      .sort()) {
      if (
        run(
          "psql",
          [
            "--no-psqlrc",
            "--host",
            "127.0.0.1",
            "--port",
            String(port),
            "--username",
            role,
            "--dbname",
            database,
            "--set",
            "ON_ERROR_STOP=1",
            "--file",
            path.join(migrations, migration),
          ],
          `Apply ${migration}`,
        ) !== 0
      )
        return 1;
    }
    const databaseUrl = `postgresql://${role}@127.0.0.1:${port}/${database}`;
    status = run(
      tsx,
      ["--test", "src/integration/observability-certification.test.ts"],
      "Run OB-01 through OB-25",
      {
        cwd: api,
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          CAPITAL_OS_CERTIFICATION_DB_URL: databaseUrl,
          CAPITAL_OS_CERTIFICATION_MODE: "1",
          CAPITAL_OS_RUN_OBSERVABILITY_CERTIFICATION: "1",
          CAPITAL_OS_ALERT_DELIVERY_MODE: "real",
          NODE_ENV: "test",
        },
      },
    );
    if (status !== 0) return status;
    record("\nObservability certification matrix:");
    for (const gate of gates) record(`PASS ${gate}`);
    record(
      `\nObservability certification: PASS (${gates.length}/${gates.length} gates)`,
    );
    status = 0;
    return 0;
  } catch (error) {
    record(
      `Certification setup failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    return 1;
  } finally {
    if (started)
      teardown ||= run(
        "pg_ctl",
        ["-D", cluster, "-m", "fast", "-w", "stop"],
        "Stop disposable PostgreSQL cluster",
      );
    if (cluster) {
      try {
        fs.rmSync(cluster, { recursive: true, force: true });
      } catch {
        teardown ||= 1;
      }
    }
    record(
      teardown === 0
        ? "Certification teardown completed."
        : "Certification teardown failed.",
    );
    record(`Evidence: ${path.relative(root, evidencePath)}`);
    evidence?.end();
    if (status !== 0 || teardown !== 0)
      process.exitCode = status || teardown || 1;
  }
}

await main();
