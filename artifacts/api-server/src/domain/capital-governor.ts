import { centsToMoney, parseMoneyToCents } from "./finance.ts";

export const CAPITAL_WATERFALL_BUCKETS = [
  "EMERGENCY_RESERVE",
  "VEHICLE_RESERVE",
  "ANNUAL_OBLIGATION_RESERVE",
  "CAPITAL_OS_RESERVE",
  "OPPORTUNITY_RESERVE",
  "INVESTMENT_CAPITAL",
] as const;

export type CapitalWaterfallBucket = typeof CAPITAL_WATERFALL_BUCKETS[number];
export type CapitalGovernorStatus =
  | "READY"
  | "CONSERVATIVE"
  | "INCOMPLETE_DATA"
  | "SHORTFALL_RISK"
  | "LOCKED";

export type CapitalBucketInput = {
  key: string;
  label: string;
  currentCents: number;
  targetCents?: number;
  minimumCents?: number;
  protected: boolean;
  liquid: boolean;
  physicalAccountIds?: string[];
  provenance: string[];
};

export type CapitalGovernorInput = {
  asOf: string;
  policyVersion: string;
  householdCashCents: number;
  availableBankCashCents: number;
  unclassifiedCashCents: number;
  pendingCashCents: number;
  unreconciledCashCents: number;
  businessCashCents: number;
  next30DayObligationsCents: number;
  essentialMonthlyCents: number;
  operatingBufferCents: number;
  reserveGaps: Array<{ bucket: CapitalWaterfallBucket; amountCents: number; provenance: string[] }>;
  protectedCommitmentsCents: number;
  encumbrancesCents: number;
  forecastShortfallCents: number;
  capitalGovernorLocked: boolean;
  dataReadiness: "READY" | "INCOMPLETE_DATA" | "STALE" | "UNRECONCILED";
  freshnessDays: number | null;
  duplicateSubtractionDetected: boolean;
  obligationsAreDisjoint: boolean;
  incomeFloorCents: number;
  baseIncomeCents: number;
  strongIncomeCents: number;
  floorOperatingSurplusCents: number;
  baseOperatingSurplusCents: number;
  strongOperatingSurplusCents: number;
  buckets: CapitalBucketInput[];
  waterfallOrder?: CapitalWaterfallBucket[];
  maximumInvestmentPercent: number;
};

const cents = (value: string | number | null | undefined) =>
  typeof value === "number" ? Math.round(value) : parseMoneyToCents(value ?? "0");

function clampMoney(value: number) {
  return Math.max(0, Math.round(value));
}

function statusFor(input: CapitalGovernorInput, safeCents: number, reasons: string[]) {
  if (input.capitalGovernorLocked) return "LOCKED" as const;
  if (input.dataReadiness !== "READY") return input.dataReadiness === "STALE" ? "CONSERVATIVE" as const : "INCOMPLETE_DATA" as const;
  if (input.duplicateSubtractionDetected || !input.obligationsAreDisjoint) return "INCOMPLETE_DATA" as const;
  if (input.forecastShortfallCents > 0 || input.floorOperatingSurplusCents < 0) return "SHORTFALL_RISK" as const;
  if (reasons.length > 0 || safeCents === 0) return "CONSERVATIVE" as const;
  return "READY" as const;
}

function recommendationForStatus(status: CapitalGovernorStatus) {
  if (status === "LOCKED") return "Capital Governor is locked. No deployment recommendation is available.";
  if (status === "INCOMPLETE_DATA") return "Complete reviewed plan, reconciliation, and freshness requirements before treating surplus as deployable.";
  if (status === "SHORTFALL_RISK") return "Protect household operating continuity and restore the floor before any discretionary allocation.";
  if (status === "CONSERVATIVE") return "Use only the conservative surplus after all reserve gaps and encumbrances are covered.";
  return "Review the recommended waterfall allocations; no money movement is authorized.";
}

export function calculateCapitalGovernorV2(input: CapitalGovernorInput) {
  const reasons: string[] = [];
  const reasonCodes: string[] = [];
  const accountCashCents = clampMoney(Math.min(input.householdCashCents, input.availableBankCashCents > 0 ? input.availableBankCashCents : input.householdCashCents));
  const eligibleCashCents = clampMoney(accountCashCents - input.unclassifiedCashCents - input.pendingCashCents - input.unreconciledCashCents);
  if (input.businessCashCents > 0) {
    reasons.push("Business operating, tax, maintenance, escrow, and other business cash is excluded from household deployable capital.");
    reasonCodes.push("BUSINESS_CASH_EXCLUDED");
  }
  if (input.unclassifiedCashCents > 0) reasonCodes.push("UNCLASSIFIED_CASH_EXCLUDED");
  if (input.pendingCashCents > 0) reasonCodes.push("PENDING_CASH_EXCLUDED");
  if (input.unreconciledCashCents > 0) {
    reasons.push("Unreconciled cash is excluded until the source can be trusted.");
    reasonCodes.push("UNRECONCILED_CASH");
  }
  if (input.dataReadiness !== "READY") {
    reasons.push("Required planning, source, or reconciliation evidence is not ready.");
    reasonCodes.push(`DATA_${input.dataReadiness}`);
  }
  if (input.freshnessDays !== null && input.freshnessDays > 3) {
    reasons.push("Financial evidence is stale; the result is conservative until refreshed.");
    reasonCodes.push("STALE_EVIDENCE");
  }
  if (input.duplicateSubtractionDetected || !input.obligationsAreDisjoint) {
    reasons.push("The input set could subtract the same obligation twice.");
    reasonCodes.push("DUPLICATE_SUBTRACTION_RISK");
  }
  if (input.capitalGovernorLocked) reasonCodes.push("CAPITAL_GOVERNOR_LOCKED");

  const reserveGapCents = input.reserveGaps.reduce((sum, gap) => sum + clampMoney(gap.amountCents), 0);
  const deductions = {
    next30DayObligations: clampMoney(input.next30DayObligationsCents),
    operatingBuffer: clampMoney(input.operatingBufferCents),
    reserveGaps: reserveGapCents,
    protectedCommitments: clampMoney(input.protectedCommitmentsCents),
    encumbrances: clampMoney(input.encumbrancesCents),
    forecastShortfall: clampMoney(input.forecastShortfallCents),
  };
  const rawCents = eligibleCashCents - Object.values(deductions).reduce((sum, value) => sum + value, 0);
  const safeCents = statusFor(input, rawCents, reasons) === "READY" || statusFor(input, rawCents, reasons) === "CONSERVATIVE"
    ? clampMoney(rawCents)
    : 0;
  const status = statusFor(input, safeCents, reasons);
  const amountCalculated = status !== "INCOMPLETE_DATA" && status !== "LOCKED";

  const order = input.waterfallOrder?.length ? input.waterfallOrder : [...CAPITAL_WATERFALL_BUCKETS];
  let remainingCents = safeCents;
  const allocationMap = new Map<string, number>();
  const gaps = new Map(input.reserveGaps.map((gap) => [gap.bucket, clampMoney(gap.amountCents)]));
  for (const bucket of order) {
    if (remainingCents <= 0) break;
    const requested = bucket === "INVESTMENT_CAPITAL"
      ? Math.floor((eligibleCashCents * Math.max(0, Math.min(input.maximumInvestmentPercent, 100))) / 100)
      : gaps.get(bucket) ?? 0;
    const amount = Math.min(remainingCents, Math.max(0, requested));
    if (amount > 0) allocationMap.set(bucket, amount);
    remainingCents -= amount;
  }
  const allocations = [...allocationMap.entries()].map(([bucket, amountCents]) => ({
    bucket,
    amount: centsToMoney(amountCents),
    amountCents,
    recommendedOnly: true as const,
    physicalMovementAuthorized: false as const,
    provenance: input.reserveGaps.find((gap) => gap.bucket === bucket)?.provenance ?? ["capital_governor_v2"],
  }));

  const bucketStatus = input.buckets.map((bucket) => {
    const target = Math.max(bucket.targetCents ?? 0, bucket.minimumCents ?? 0);
    const gap = Math.max(0, target - bucket.currentCents);
    return {
      key: bucket.key,
      label: bucket.label,
      current: centsToMoney(bucket.currentCents),
      target: centsToMoney(target),
      gap: centsToMoney(gap),
      protected: bucket.protected,
      liquid: bucket.liquid,
      physicalAccountIds: bucket.physicalAccountIds ?? [],
      provenance: bucket.provenance,
    };
  });

  const components = [
    { key: "eligible_household_cash", label: "Eligible household cash", amount: centsToMoney(eligibleCashCents), sign: "add", provenance: ["household_financial_accounts"] },
    { key: "next_30_day_obligations", label: "Next 30-day obligations", amount: centsToMoney(deductions.next30DayObligations), sign: "subtract", provenance: ["finance_bills", "upcoming_expenses"] },
    { key: "operating_buffer", label: "Household operating buffer", amount: centsToMoney(deductions.operatingBuffer), sign: "subtract", provenance: ["variable_income_profile", "approved_budget"] },
    { key: "reserve_gaps", label: "Reserve funding gaps", amount: centsToMoney(deductions.reserveGaps), sign: "subtract", provenance: input.reserveGaps.flatMap((gap) => gap.provenance) },
    { key: "protected_commitments", label: "Protected commitments", amount: centsToMoney(deductions.protectedCommitments), sign: "subtract", provenance: ["goals", "protected_capital_registry"] },
    { key: "encumbrances", label: "Capital encumbrances", amount: centsToMoney(deductions.encumbrances), sign: "subtract", provenance: ["capital_encumbrances"] },
    { key: "forecast_shortfall", label: "Forecast shortfall", amount: centsToMoney(deductions.forecastShortfall), sign: "subtract", provenance: ["variable_budget_forecast"] },
  ].map((component) => ({
    ...component,
    amount: amountCalculated ? component.amount : null,
    sourceReferences: component.provenance.map((reference) => ({ reference, sourceType: reference.split(":")[0] })),
    subtractionGroup: component.sign === "subtract" ? "SAFE_TO_DEPLOY_DEDUCTIONS" : "ELIGIBLE_CASH",
  }));

  return {
    version: "2.0",
    asOf: input.asOf,
    status,
    safeToDeploy: amountCalculated ? centsToMoney(safeCents) : "NOT_CALCULATED",
    rawSafeToDeploy: amountCalculated ? centsToMoney(clampMoney(rawCents)) : "NOT_CALCULATED",
    householdCapitalSurplus: {
       floor: amountCalculated ? centsToMoney(input.floorOperatingSurplusCents) : "NOT_CALCULATED",
       base: amountCalculated ? centsToMoney(input.baseOperatingSurplusCents) : "NOT_CALCULATED",
       strong: amountCalculated ? centsToMoney(input.strongOperatingSurplusCents) : "NOT_CALCULATED",
      source: "verified_income_minus_operating_costs_and_reserve_contributions",
    },
    dataReadiness: {
       status: amountCalculated ? input.dataReadiness : "BLOCKED_DATA_INCOMPLETE",
      freshnessDays: input.freshnessDays,
      failClosed: status === "INCOMPLETE_DATA" || status === "LOCKED",
    },
    calculation: {
      amountCalculated,
      blockedStatus: amountCalculated ? null : "BLOCKED_DATA_INCOMPLETE",
      requiredComponents: ["eligible_household_cash", "next_30_day_obligations", "operating_buffer", "reserve_gaps", "protected_commitments", "encumbrances", "forecast_shortfall"],
      doubleSubtraction: {
        detected: input.duplicateSubtractionDetected,
        obligationsAreDisjoint: input.obligationsAreDisjoint,
        method: "Each deduction is assigned once to SAFE_TO_DEPLOY_DEDUCTIONS; duplicate or non-disjoint inputs fail closed.",
      },
    },
    reasonCodes: [...new Set(reasonCodes)],
    reasons: [...new Set(reasons)],
    components,
    bucketStatus,
    waterfall: {
       availableForWaterfall: amountCalculated ? centsToMoney(safeCents) : "NOT_CALCULATED",
       unallocatedAfterRecommendations: amountCalculated ? centsToMoney(remainingCents) : "NOT_CALCULATED",
      allocations,
      scenarioBehavior: {
        floor: input.floorOperatingSurplusCents < 0 ? "PROTECT_ONLY" : "FLOOR_FIRST",
        base: "BALANCED",
        strong: "SURPLUS_AFTER_RESERVES",
      },
    },
    controls: {
      protectedDuplexReserveLocked: input.buckets.some((bucket) => bucket.key === "DUPLEX_RESERVE" && bucket.protected),
      businessCashExcluded: input.businessCashCents >= 0,
      moneyMovementAuthorized: false,
      microLiveAuthorized: false,
      strategyLabAuthority: false,
      manualOverride: false,
    },
  };
}

export function capitalGovernorMoney(value: string | number | null | undefined) {
  return centsToMoney(cents(value));
}