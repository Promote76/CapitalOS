export type HouseholdRole = "owner" | "partner" | "viewer" | "advisor";
import { activeSecurityContext } from "../middleware/request-scope.ts";

export const permissions: Record<HouseholdRole, Set<string>> = {
  owner: new Set(["read", "contribute", "transfer", "allocate", "approve", "manage_risk", "review_venue_security", "review_venue_jurisdiction"]),
  partner: new Set(["read", "contribute", "transfer", "allocate"]),
  advisor: new Set(["read", "recommend", "review_venue_security", "review_venue_jurisdiction"]),
  viewer: new Set(["read"]),
};

export function hasPermission(role: HouseholdRole, permission: string): boolean {
  const context = activeSecurityContext();
  if (context) return context.permissions.includes(permission);
  return permissions[role]?.has(permission) ?? false;
}

export function assertPermission(role: HouseholdRole, permission: string): void {
  if (!hasPermission(role, permission)) {
    throw new GovernanceError(
      "FORBIDDEN",
      `Role ${role} is not authorized to ${permission} household capital`,
    );
  }
}

export class GovernanceError extends Error {
  public readonly code: "FORBIDDEN" | "RISK_BLOCKED" | "INVALID_STATE" | "IDEMPOTENCY_CONFLICT";

  constructor(
    code: "FORBIDDEN" | "RISK_BLOCKED" | "INVALID_STATE" | "IDEMPOTENCY_CONFLICT",
    message: string,
  ) {
    super(message);
    this.code = code;
    this.name = "GovernanceError";
  }
}

export function assertAllocationAllowed(input: {
  proposedStrategyAllocationCents: number;
  activeCapitalCents: number;
  protectedCapitalCents: number;
  maxStrategyAllocationCents: number;
  maxActiveCapitalCents: number;
  protectedCapitalLocked: boolean;
  sourceAccountProtected: boolean;
}): void {
  if (input.sourceAccountProtected && input.protectedCapitalLocked) {
    throw new GovernanceError(
      "RISK_BLOCKED",
      "Protected capital is ring-fenced and cannot fund experimental strategies",
    );
  }
  if (input.proposedStrategyAllocationCents > input.maxStrategyAllocationCents) {
    throw new GovernanceError("RISK_BLOCKED", "Strategy allocation exceeds the Capital Governor limit");
  }
  if (input.activeCapitalCents + input.proposedStrategyAllocationCents > input.maxActiveCapitalCents) {
    throw new GovernanceError("RISK_BLOCKED", "Active capital would exceed the Capital Governor limit");
  }
  if (input.protectedCapitalCents < 0) {
    throw new GovernanceError("RISK_BLOCKED", "Protected capital cannot become negative");
  }
}

const stageOrder = ["research", "backtest", "shadow", "paper", "micro_live", "approved", "production"] as const;
export type StrategyStage = (typeof stageOrder)[number] | "paused" | "retired";

export function assertStrategyPromotion(input: {
  fromStage: StrategyStage;
  toStage: StrategyStage;
  authorizedOverride?: boolean;
  evidence: { minimumObservations: boolean; reconciliationAccurate: boolean; noCriticalErrors: boolean };
}): void {
  if (input.authorizedOverride) return;
  const fromIndex = stageOrder.indexOf(input.fromStage as (typeof stageOrder)[number]);
  const toIndex = stageOrder.indexOf(input.toStage as (typeof stageOrder)[number]);
  if (fromIndex < 0 || toIndex !== fromIndex + 1) {
    throw new GovernanceError("INVALID_STATE", "Strategies must graduate one stage at a time");
  }
  if (!input.evidence.minimumObservations || !input.evidence.reconciliationAccurate || !input.evidence.noCriticalErrors) {
    throw new GovernanceError("INVALID_STATE", "Promotion requires complete evidence and healthy reconciliation");
  }
}

export function assertAIActionAllowed(action: string): void {
  const forbidden = new Set([
    "move_money",
    "change_protected_capital",
    "override_risk",
    "enable_live_trading",
    "change_credentials",
    "deploy_contract",
  ]);
  if (forbidden.has(action)) {
    throw new GovernanceError("FORBIDDEN", "AI is advisory only and cannot perform capital-control actions");
  }
}