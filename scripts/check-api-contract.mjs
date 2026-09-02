import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routesDir = path.join(rootDir, "artifacts/api-server/src/routes");
const specPath = path.join(rootDir, "lib/api-spec/openapi.yaml");
const methods = new Set(["get", "post", "put", "patch", "delete"]);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(entryPath) : entry.name.endsWith(".ts") ? [entryPath] : [];
  });
}

function normalizeRoute(route) {
  return route.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

const sourceRoutes = new Set();
for (const file of walk(routesDir)) {
  const source = fs.readFileSync(file, "utf8");
  const expression = /router\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g;
  for (const match of source.matchAll(expression)) sourceRoutes.add(`${match[1]} ${normalizeRoute(match[2])}`);
}

const specRoutes = new Set();
const lines = fs.readFileSync(specPath, "utf8").split(/\r?\n/);
let currentPath;
for (const line of lines) {
  const pathMatch = line.match(/^  (\/[^:]+):\s*$/);
  if (pathMatch) {
    currentPath = pathMatch[1];
    continue;
  }
  const methodMatch = line.match(/^    (get|post|put|patch|delete):\s*$/);
  if (methodMatch && currentPath) specRoutes.add(`${methodMatch[1]} ${currentPath}`);
}

const missingFromSpec = [...sourceRoutes].filter((route) => !specRoutes.has(route)).sort();
const missingFromSource = [...specRoutes].filter((route) => !sourceRoutes.has(route)).sort();
assert.deepEqual(missingFromSpec, [], `Routes missing from OpenAPI: ${missingFromSpec.join(", ")}`);
assert.deepEqual(missingFromSource, [], `OpenAPI routes missing from Express: ${missingFromSource.join(", ")}`);
console.log(`API contract parity passed: ${sourceRoutes.size} route/methods`);