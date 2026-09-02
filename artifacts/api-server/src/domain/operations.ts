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