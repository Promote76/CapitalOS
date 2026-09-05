import fs from "node:fs";
import path from "node:path";

const routeExpression = /router\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g;

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(entryPath);
    return entry.name.endsWith(".ts") ? [entryPath] : [];
  });
}

function routeKey(route) {
  return `${route.method} ${route.path}`;
}

/**
 * The route source files are the authoritative inventory. Consumers must use
 * this function rather than maintaining a second route list or count.
 */
export function discoverTenantRouteInventory(workspaceRoot) {
  const routesDir = path.join(workspaceRoot, "artifacts/api-server/src/routes");
  const routes = [];
  for (const file of walk(routesDir)) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(routeExpression)) {
      routes.push({
        method: match[1].toUpperCase(),
        path: match[2],
      });
    }
  }

  const duplicateRoutes = routes
    .map(routeKey)
    .filter((key, index, keys) => keys.indexOf(key) !== index);
  if (duplicateRoutes.length > 0) {
    throw new Error(`Duplicate tenant route registrations: ${[...new Set(duplicateRoutes)].join(", ")}`);
  }

  return routes.sort((left, right) => routeKey(left).localeCompare(routeKey(right)));
}

export function normalizeTenantRoute(route) {
  return route.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function assertDocumentedCount(document, documentPath, expectedCount, patterns) {
  const observedCounts = patterns.flatMap((pattern) => {
    const match = document.match(pattern);
    return match ? [Number(match[1])] : [];
  });
  if (observedCounts.length !== patterns.length) {
    throw new Error(
      `Tenant route evidence is missing a freshness count in ${documentPath}; ` +
      `expected ${expectedCount} route/method pairs. Add or regenerate the route-count evidence.`,
    );
  }
  const staleCounts = observedCounts.filter((count) => count !== expectedCount);
  if (staleCounts.length > 0) {
    throw new Error(
      `Tenant route evidence is stale in ${documentPath}; ` +
      `documented ${[...new Set(staleCounts)].join(", ")} route/method pairs but the authoritative ` +
      `inventory contains ${expectedCount}. Refresh the certification evidence.`,
    );
  }
}

export function assertTenantRouteEvidenceFresh(workspaceRoot, expectedCount) {
  const matrixPath = path.join(workspaceRoot, "docs/TENANT_ISOLATION_ROUTE_MATRIX.md");
  const evidencePath = path.join(workspaceRoot, "docs/PRODUCTION_CANDIDATE_EVIDENCE_INDEX.md");
  const matrix = fs.readFileSync(matrixPath, "utf8");
  const evidence = fs.readFileSync(evidencePath, "utf8");

  assertDocumentedCount(matrix, matrixPath, expectedCount, [
    /<!-- tenant-route-inventory: (\d+) -->/,
    /\*\*Inventory result:\*\* (\d+) Express route\/method pairs/,
    /full (\d+)-route\s+preflight/,
    /exactly (\d+) route\/method pairs/,
  ]);
  assertDocumentedCount(evidence, evidencePath, expectedCount, [
    /<!-- tenant-route-inventory: (\d+) -->/,
    /All (\d+) route\/method pairs/,
    /included the (\d+)-route tenant preflight/,
  ]);
}