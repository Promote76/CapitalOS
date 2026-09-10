import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(
  root,
  "artifacts/api-server/.replit-artifact/artifact.toml",
);
const config = fs.readFileSync(configPath, "utf8");
const productionRun = config.split("[services.production.run.env]")[1]?.split(
  "[services.production.health.startup]",
)[0];

assert.ok(productionRun, "API artifact production runtime env is missing.");
assert.match(
  productionRun,
  /^OPERATIONS_WORKER_ENABLED = "1"$/m,
  "Artifact production runtime must enable the Operations worker.",
);
assert.match(
  productionRun,
  /^OPERATIONS_SCHEDULER_ENABLED = "1"$/m,
  "Artifact production runtime must enable the Operations scheduler.",
);
assert.match(
  config,
  /\[services\.production\.health\.startup\]\s+path = "\/api\/health\/live"/m,
  "Artifact startup health must use process liveness; operational readiness remains a separate fail-closed endpoint.",
);
assert.doesNotMatch(
  config,
  /\b(?:db:push|push-force|drizzle-kit|psql)\b/,
  "Artifact build and startup must never mutate the production schema.",
);
console.log("API artifact production runtime configuration passed.");