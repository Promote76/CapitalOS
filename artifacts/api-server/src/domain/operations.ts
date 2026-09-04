import { GovernanceError } from "./governance.ts";

const restrictedActions = new Set([
  "transfer_money",
  "change_protected_capital",
  "increase_strategy_capital",
  "enable_live_trading",
  "change_owner",
  "disable_security",
  "submit_offer",
  "sign_contract",
]);

export function assertSafeAutomationAction(action: string): void {
  if (restrictedActions.has(action)) {
    throw new GovernanceError(
      "FORBIDDEN",
      `Automation action ${action} is not permitted without a separately authorized workflow`,
    );
  }
}

export function calculateOperationsHealth(input: {
  overdueTasks: number;
  pendingApprovals: number;
  criticalAlerts: number;
  automationFailures: number;
}): number {
  return Math.max(
    0,
    Math.min(
      100,
      100 -
        input.overdueTasks * 8 -
        input.pendingApprovals * 2 -
        input.criticalAlerts * 25 -
        input.automationFailures * 10,
    ),
  );
}

export type OperationFailureClass = "TRANSIENT" | "PERMANENT" | "UNKNOWN";
export function classifyOperationsFailure(error: unknown): OperationFailureClass {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (/invalid|unauthori|forbidden|payload|state/.test(message)) return "PERMANENT";
  if (/timeout|tempor|contention|network|unavailable/.test(message)) return "TRANSIENT";
  return "UNKNOWN";
}
export function operationsBackoffMs(attempt: number, base = 1000, cap = 60_000) {
  return Math.min(cap, base * 2 ** Math.max(0, attempt - 1));
}
export function isSafeOperationsJobKind(kind: string) {
  return ["SAFE_AUTOMATION", "ADVISORY", "RECONCILIATION"].includes(kind);
}