export type AllocationCents = {
  total: number;
  duplexReserve: number;
  capitalOs: number;
  opportunityReserve: number;
};

export type GoalMetrics = {
  progressPercent: number;
  amountRemainingCents: number;
  weeksRemaining: number;
  requiredWeeklyContributionCents: number;
  projectedCompletionWeeks: number | null;
  status: "on_track" | "behind" | "ahead" | "completed";
};

export type AllocationImpact = {
  current: AllocationCents;
  proposed: AllocationCents;
  totalMatches: boolean;
  duplexWeeklyChangeCents: number;
  projectedDelayWeeks: number;
  protectedSavingsChangeCents: number;
  activeCapitalChangeCents: number;
  propertyReadinessImpact: "improves" | "unchanged" | "slows";
};

export function parseMoneyToCents(value: string | number): number {
  const normalized = typeof value === "number" ? value.toFixed(2) : value.trim();
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Money must be a decimal value with at most two places");
  }
  const [whole, fraction = ""] = normalized.split(".");
  const sign = whole.startsWith("-") ? -1 : 1;
  const absoluteWhole = whole.replace("-", "");
  return sign * (Number(absoluteWhole) * 100 + Number(fraction.padEnd(2, "0")));
}

export function centsToMoney(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

export function centsToNumber(cents: number): number {
  return Number(centsToMoney(cents));
}

export function normalizeAllocation(input: Omit<AllocationCents, "total">): AllocationCents {
  const total = input.duplexReserve + input.capitalOs + input.opportunityReserve;
  return { ...input, total };
}

export function calculateGoalMetrics(input: {
  targetAmountCents: number;
  currentAmountCents: number;
  weeklyContributionCents: number;
  weeksRemaining: number;
}): GoalMetrics {
  const amountRemainingCents = Math.max(input.targetAmountCents - input.currentAmountCents, 0);
  const progressPercent =
    input.targetAmountCents === 0
      ? 0
      : Math.min(100, (input.currentAmountCents / input.targetAmountCents) * 100);
  const requiredWeeklyContributionCents =
    input.weeksRemaining > 0
      ? Math.ceil(amountRemainingCents / input.weeksRemaining)
      : amountRemainingCents;
  const projectedCompletionWeeks =
    amountRemainingCents === 0
      ? 0
      : input.weeklyContributionCents > 0
        ? Math.ceil(amountRemainingCents / input.weeklyContributionCents)
        : null;
  const status =
    progressPercent >= 100
      ? "completed"
      : projectedCompletionWeeks === null
        ? "behind"
        : projectedCompletionWeeks <= input.weeksRemaining
          ? projectedCompletionWeeks < input.weeksRemaining
            ? "ahead"
            : "on_track"
          : "behind";

  return {
    progressPercent: Number(progressPercent.toFixed(2)),
    amountRemainingCents,
    weeksRemaining: Math.max(input.weeksRemaining, 0),
    requiredWeeklyContributionCents,
    projectedCompletionWeeks,
    status,
  };
}

export function calculateAllocationImpact(
  current: AllocationCents,
  proposedInput: Omit<AllocationCents, "total">,
  goal: { amountRemainingCents: number; currentDuplexWeeklyCents: number },
): AllocationImpact {
  const proposed = normalizeAllocation(proposedInput);
  const duplexWeeklyChangeCents = proposed.duplexReserve - current.duplexReserve;
  const protectedSavingsChangeCents = duplexWeeklyChangeCents * 52;
  const activeCapitalChangeCents =
    proposed.capitalOs +
    proposed.opportunityReserve -
    (current.capitalOs + current.opportunityReserve);
  const projectedDelayWeeks =
    proposed.duplexReserve > 0 && duplexWeeklyChangeCents < 0
      ? Math.max(
          0,
          Math.ceil(goal.amountRemainingCents / proposed.duplexReserve) -
            Math.ceil(goal.amountRemainingCents / goal.currentDuplexWeeklyCents),
        )
      : 0;

  return {
    current,
    proposed,
    totalMatches: proposed.total === current.total,
    duplexWeeklyChangeCents,
    projectedDelayWeeks,
    protectedSavingsChangeCents,
    activeCapitalChangeCents,
    propertyReadinessImpact:
      duplexWeeklyChangeCents > 0
        ? "improves"
        : duplexWeeklyChangeCents < 0
          ? "slows"
          : "unchanged",
  };
}

export function allocationToRecord(allocation: AllocationCents) {
  return {
    totalWeekly: centsToMoney(allocation.total),
    duplexReserve: centsToMoney(allocation.duplexReserve),
    capitalOs: centsToMoney(allocation.capitalOs),
    opportunityReserve: centsToMoney(allocation.opportunityReserve),
  };
}