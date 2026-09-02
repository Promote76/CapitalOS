import { centsToMoney, parseMoneyToCents } from "./finance.ts";

export type TreasuryBucketInput = {
  id: string;
  name: string;
  bucketType: string;
  priority: number;
  targetAmount: string;
  minimumAmount: string;
  maximumAmount: string;
  currentBalance: string;
  protected: boolean;
  liquid: boolean;
  liquidityClass: string;
  riskClass: string;
  withdrawalPolicy: string;
  fundingRule: string;
};

export type TreasuryPolicyInput = {
  minimumOperatingCash: string;
  emergencyTargetMonths: number;
  minimumWeeklyDuplexContribution: string;
  maximumStrategyPercent: string;
  maximumSingleStrategyPercent: string;
  maximumSingleVenuePercent: string;
  maximumIlliquidPercent: string;
  maximumActivePercent: string;
  autoScale: boolean;
  version: string;
};

const moneyCents = (value: string | number | null | undefined) =>
  typeof value === "number" ? Math.round(value) : parseMoneyToCents(value ?? "0");

function percent(numerator: number, denominator: number) {
  return denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(1)) : 0;
}

function coverage(currentCents: number, monthlyCents: number) {
  return monthlyCents > 0 ? Number((currentCents / monthlyCents).toFixed(1)) : 0;
}

export function calculateTreasuryMetrics(input: {
  buckets: TreasuryBucketInput[];
  policy: TreasuryPolicyInput;
  safeToDeploy: string;
  essentialMonthlyExpenses: string;
  weeklyDuplexContribution: string;
  reservationsCents?: number;
}) {
  const current = input.buckets.reduce((sum, bucket) => sum + moneyCents(bucket.currentBalance), 0);
  const protectedCapital = input.buckets
    .filter((bucket) => bucket.protected)
    .reduce((sum, bucket) => sum + moneyCents(bucket.currentBalance), 0);
  const liquidCapital = input.buckets
    .filter((bucket) => bucket.liquid)
    .reduce((sum, bucket) => sum + moneyCents(bucket.currentBalance), 0);
  const strategyCapital = input.buckets
    .filter((bucket) => bucket.bucketType === "STRATEGY")
    .reduce((sum, bucket) => sum + moneyCents(bucket.currentBalance), 0);
  const eligibleCapital = Math.max(0, liquidCapital - protectedCapital - (input.reservationsCents ?? 0));
  const emergency = input.buckets.find((bucket) => bucket.bucketType === "EMERGENCY");
  const duplex = input.buckets.find((bucket) => bucket.bucketType === "PROTECTED_GOAL");
  const operating = input.buckets.find((bucket) => bucket.bucketType === "OPERATING");
  const emergencyCents = moneyCents(emergency?.currentBalance);
  const essentialMonthlyCents = moneyCents(input.essentialMonthlyExpenses);
  const safeToDeployCents = Math.max(0, moneyCents(input.safeToDeploy));
  const emergencyTargetCents = essentialMonthlyCents * input.policy.emergencyTargetMonths;
  const emergencyGapCents = Math.max(0, emergencyTargetCents - emergencyCents);
  const operatingMinimumCents = moneyCents(input.policy.minimumOperatingCash);
  const operatingGapCents = Math.max(0, operatingMinimumCents - moneyCents(operating?.currentBalance));
  const duplexMinimumCents = moneyCents(input.policy.minimumWeeklyDuplexContribution);
  const weeklyDuplexCents = moneyCents(input.weeklyDuplexContribution);
  const activePercent = percent(strategyCapital, Math.max(current, 1));
  const utilization = percent(strategyCapital, Math.max(eligibleCapital + strategyCapital, 1));
  const emergencyCoverage = coverage(emergencyCents, essentialMonthlyCents);
  const liquidityCoverage = coverage(liquidCapital, essentialMonthlyCents);
  const goalBalance = moneyCents(duplex?.currentBalance);
  const goalTarget = moneyCents(duplex?.targetAmount);
  const deployability = Math.max(0, Math.min(100, Math.round((safeToDeployCents / Math.max(liquidCapital, 1)) * 100)));

  let defenseState = "NORMAL";
  if (operatingGapCents > 0 || emergencyCents === 0) defenseState = "CRITICAL";
  else if (safeToDeployCents === 0 || emergencyGapCents > 0) defenseState = "DEFENSIVE";
  else if (activePercent > Number(input.policy.maximumActivePercent)) defenseState = "CAUTION";

  const health = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (Math.min(100, operatingMinimumCents === 0 ? 100 : (moneyCents(operating?.currentBalance) / operatingMinimumCents) * 100) +
          Math.min(100, input.policy.emergencyTargetMonths === 0 ? 100 : (emergencyCoverage / input.policy.emergencyTargetMonths) * 100) +
          Math.min(100, goalTarget === 0 ? 100 : (goalBalance / goalTarget) * 100) +
          Math.min(100, liquidityCoverage * 20) +
          Math.max(0, 100 - Math.max(0, activePercent - Number(input.policy.maximumActivePercent)))) /
          5,
      ),
    ),
  );

  const alerts = [
    ...(operatingGapCents > 0 ? [`Operating cash is ${centsToMoney(operatingGapCents)} below its floor.`] : []),
    ...(emergencyGapCents > 0 ? [`Emergency reserve needs ${centsToMoney(emergencyGapCents)} to reach policy.`] : []),
    ...(weeklyDuplexCents < duplexMinimumCents ? ["The current weekly Duplex contribution is below policy minimum."] : []),
    ...(activePercent > Number(input.policy.maximumActivePercent) ? ["Active strategy capital exceeds the policy band."] : []),
    ...(input.reservationsCents && input.reservationsCents > 0 ? [`${centsToMoney(input.reservationsCents)} is reserved and unavailable for deployment.`] : []),
  ];

  const ladderClasses = ["IMMEDIATE", "ONE_TO_THREE_DAYS", "THREE_TO_SEVEN_DAYS", "SEVEN_TO_THIRTY_DAYS", "ILLIQUID"];
  const liquidityLadder = ladderClasses.map((liquidityClass) => {
    const amount = input.buckets
      .filter((bucket) => bucket.liquidityClass === liquidityClass)
      .reduce((sum, bucket) => sum + moneyCents(bucket.currentBalance), 0);
    return { liquidityClass, amount: centsToMoney(amount), percent: percent(amount, Math.max(current, 1)) };
  });

  const stressTests = [
    { name: "Income -20%", incomeChangePercent: -20, unexpectedExpense: 0, strategyLossPercent: 0 },
    { name: "Income -40%", incomeChangePercent: -40, unexpectedExpense: 0, strategyLossPercent: 0 },
    { name: "$2,500 unexpected expense", incomeChangePercent: 0, unexpectedExpense: 250000, strategyLossPercent: 0 },
    { name: "$5,000 unexpected expense", incomeChangePercent: 0, unexpectedExpense: 500000, strategyLossPercent: 0 },
    { name: "Combined liquidity shock", incomeChangePercent: -25, unexpectedExpense: 500000, strategyLossPercent: 100 },
  ].map((scenario) => {
    const incomeShock = Math.round(Math.max(0, essentialMonthlyCents) * Math.abs(scenario.incomeChangePercent) / 100);
    const strategyLoss = Math.round(strategyCapital * scenario.strategyLossPercent / 100);
    const remainingLiquid = Math.max(0, liquidCapital - scenario.unexpectedExpense - incomeShock - strategyLoss);
    const remainingEmergency = Math.max(0, emergencyCents - scenario.unexpectedExpense - incomeShock);
    return {
      name: scenario.name,
      remainingLiquid: centsToMoney(remainingLiquid),
      remainingReserves: centsToMoney(remainingEmergency),
      liquidityMonths: coverage(remainingLiquid, essentialMonthlyCents),
      duplexProtected: scenario.strategyLossPercent === 100 || remainingEmergency >= emergencyCents,
      safeToDeploy: centsToMoney(Math.max(0, safeToDeployCents - scenario.unexpectedExpense - incomeShock)),
      status: remainingEmergency >= emergencyTargetCents ? "Protected" : remainingEmergency > 0 ? "Review" : "Critical",
    };
  });

  return {
    totals: {
      totalCapital: centsToMoney(current),
      protectedCapital: centsToMoney(protectedCapital),
      liquidReserve: centsToMoney(liquidCapital),
      duplexCapital: centsToMoney(goalBalance),
      opportunityCapital: centsToMoney(
        input.buckets.filter((bucket) => bucket.bucketType === "OPPORTUNITY").reduce((sum, bucket) => sum + moneyCents(bucket.currentBalance), 0),
      ),
      treasuryCapital: centsToMoney(
        input.buckets.filter((bucket) => bucket.bucketType === "TREASURY").reduce((sum, bucket) => sum + moneyCents(bucket.currentBalance), 0),
      ),
      activeStrategyCapital: centsToMoney(strategyCapital),
      safeToDeploy: centsToMoney(safeToDeployCents),
    },
    health: {
      score: health,
      state: defenseState,
      deployability,
      utilization,
      activeCapitalPercent: activePercent,
      liquidityCoverage,
      emergencyCoverage,
      duplexProgressPercent: percent(goalBalance, Math.max(goalTarget, 1)),
      cashDrag: centsToMoney(Math.max(0, liquidCapital - protectedCapital - safeToDeployCents)),
    },
    policy: {
      ...input.policy,
      minimumOperatingCash: input.policy.minimumOperatingCash,
      emergencyTarget: centsToMoney(emergencyTargetCents),
    },
    liquidityLadder,
    stressTests,
    alerts,
    nextAction:
      operatingGapCents > 0
        ? "Restore the operating cash floor before any discretionary allocation."
        : emergencyGapCents > 0
          ? "Direct new surplus to the Emergency Reserve until policy coverage is restored."
          : weeklyDuplexCents < duplexMinimumCents
            ? "Restore the minimum weekly Duplex contribution before adding strategy capital."
            : safeToDeployCents > 0
              ? "Review eligible surplus against the Treasury hierarchy; no automatic movement is authorized."
              : "Hold current allocations and protect liquidity.",
  };
}

export function allocationDecision(input: {
  requestedAmountCents: number;
  safeToDeployCents: number;
  currentStrategyCents: number;
  totalLiquidCents: number;
  maxStrategyPercent: number;
  protectedCapitalLocked: boolean;
}) {
  const maximumByPolicy = Math.floor((input.totalLiquidCents * input.maxStrategyPercent) / 100);
  const maximumAllowed = Math.max(0, Math.min(input.safeToDeployCents, maximumByPolicy - input.currentStrategyCents));
  const approved = !input.protectedCapitalLocked && input.requestedAmountCents <= maximumAllowed;
  return {
    approved,
    maximumAllowedCents: maximumAllowed,
    reason: input.protectedCapitalLocked
      ? "Protected capital remains locked; this request cannot bypass the Capital Governor."
      : approved
        ? "Request is within current Safe-to-Deploy and strategy-capacity limits."
        : "Request exceeds current deployable room or the strategy-capital policy maximum.",
  };
}