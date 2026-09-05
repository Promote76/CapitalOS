export type TenantRoute = {
  method: string;
  path: string;
};

export function discoverTenantRouteInventory(workspaceRoot: string): TenantRoute[];
export function normalizeTenantRoute(route: string): string;
export function assertTenantRouteEvidenceFresh(workspaceRoot: string, expectedCount: number): void;