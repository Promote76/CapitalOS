import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertTenantRouteEvidenceFresh,
  discoverTenantRouteInventory,
  normalizeTenantRoute,
} from "../artifacts/api-server/src/integration/tenant-route-inventory.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const specPath = path.join(rootDir, "lib/api-spec/openapi.yaml");
const inventory = discoverTenantRouteInventory(rootDir);
const sourceRoutes = new Set(
  inventory.map((route) => `${route.method.toLowerCase()} ${normalizeTenantRoute(route.path)}`),
);

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
assertTenantRouteEvidenceFresh(rootDir, inventory.length);
console.log(`API contract parity and tenant evidence freshness passed: ${inventory.length} route/methods`);