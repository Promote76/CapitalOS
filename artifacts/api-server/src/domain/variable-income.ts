import { centsToMoney, parseMoneyToCents } from "./finance.ts";

type VerifiedIncomeEvent = {
  incomeDate: string;
  amount: string;
  verificationStatus?: string | null;
};

const cents = (value: string | number | null | undefined) =>
  typeof value === "number" ? Math.round(value) : parseMoneyToCents(value ?? "0");

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const iso = (value: Date) => value.toISOString().slice(0, 10);
const addDays = (value: string, days: number) => {
  const result = day(value);
  result.setUTCDate(result.getUTCDate() + days);
  return iso(result);
};
const addMonths = (value: string, months: number) => {
  const result = day(value);
  result.setUTCMonth(result.getUTCMonth() + months);
  return iso(result);
};

function inRange(date: string, start: string, end: string) {
  return date >= start && date <= end;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function monthKey(date: string) {
  return date.slice(0, 7);
}

export type VariableIncomePolicy =
  | "CONSERVATIVE_MINIMUM"
  | "TRAILING_MEDIAN_DISCOUNTED"
  | "USER_APPROVED_FLOOR";

export function calculateVariableIncomeProfile(
  events: VerifiedIncomeEvent[],
  asOf: string,
  policy: VariableIncomePolicy = "TRAILING_MEDIAN_DISCOUNTED",
  approvedFloor?: string,
) {
  const verified = events
    .filter((event) => !event.verificationStatus || event.verificationStatus === "verified")
    .map((event) => ({ ...event, cents: cents(event.amount) }))
    .filter((event) => event.cents > 0 && event.incomeDate <= asOf);
  const monthTotals = new Map<string, number>();
  for (const event of verified) monthTotals.set(monthKey(event.incomeDate), (monthTotals.get(monthKey(event.incomeDate)) ?? 0) + event.cents);
  const recentMonths = [...monthTotals.entries()]
    .filter(([month]) => month >= addMonths(asOf, -6).slice(0, 7))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, amount]) => amount);
  const trailing = (days: number) => verified.filter((event) => inRange(event.incomeDate, addDays(asOf, -days + 1), asOf)).reduce((sum, event) => sum + event.cents, 0);
  const medianRecent = median(recentMonths);
  const floor = policy === "USER_APPROVED_FLOOR"
    ? cents(approvedFloor)
    : recentMonths.length < 3
      ? 0
      : policy === "CONSERVATIVE_MINIMUM"
        ? Math.min(...recentMonths)
        : Math.floor(medianRecent * 0.8);
  const base = medianRecent;
  const strong = recentMonths.length ? Math.max(...recentMonths) : 0;
  const mean = recentMonths.length ? recentMonths.reduce((sum, value) => sum + value, 0) / recentMonths.length : 0;
  const volatility = mean === 0 ? 0 : Number((Math.sqrt(recentMonths.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / Math.max(recentMonths.length, 1)) / mean * 100).toFixed(2));
  const confidenceStatus = recentMonths.length >= 6 ? "SUPPORTED" : recentMonths.length >= 3 ? "LIMITED_HISTORY" : policy === "USER_APPROVED_FLOOR" && floor > 0 ? "USER_APPROVED" : "INSUFFICIENT_HISTORY";
  return {
    currentMonthVerifiedIncomeCents: verified.filter((event) => monthKey(event.incomeDate) === monthKey(asOf)).reduce((sum, event) => sum + event.cents, 0),
    trailing4WeekIncomeCents: trailing(28),
    trailing8WeekIncomeCents: trailing(56),
    trailing13WeekIncomeCents: trailing(91),
    trailing3MonthIncomeCents: verified.filter((event) => inRange(event.incomeDate, addMonths(asOf, -3), asOf)).reduce((sum, event) => sum + event.cents, 0),
    trailing6MonthIncomeCents: verified.filter((event) => inRange(event.incomeDate, addMonths(asOf, -6), asOf)).reduce((sum, event) => sum + event.cents, 0),
    highestRecentMonthCents: strong,
    lowestRecentMonthCents: recentMonths.length ? Math.min(...recentMonths) : 0,
    medianRecentMonthCents: medianRecent,
    incomeFloorCents: floor,
    baseIncomeCents: base,
    strongMonthIncomeCents: strong,
    incomeVolatility: volatility,
    sourceCount: verified.length,
    sourceFreshness: verified[0]?.incomeDate ?? null,
    policy,
    confidenceStatus,
    recentMonthCount: recentMonths.length,
  };
}

export function calculateHouseholdBudgetConstraints(input: {
  incomeFloor: string;
  baseIncome: string;
  strongIncome: string;
  mandatoryObligations: string;
  essentialVariableCosts: string;
  reserveRequirements: string;
  discretionarySpending: string;
  currentCash: string;
  cashBuffer: string;
  capitalGoals: string;
  next30DayObligations: string;
}) {
  const floor = cents(input.incomeFloor);
  const base = cents(input.baseIncome);
  const strong = cents(input.strongIncome);
  const mandatory = cents(input.mandatoryObligations);
  const essential = cents(input.essentialVariableCosts);
  const reserves = cents(input.reserveRequirements);
  const discretionary = cents(input.discretionarySpending);
  const cash = cents(input.currentCash);
  const buffer = cents(input.cashBuffer);
  const capitalGoals = cents(input.capitalGoals);
  const next30 = cents(input.next30DayObligations);
  const operatingBudgetCap = Math.max(0, floor - mandatory - essential - reserves);
  const minimumViableOperatingCost = mandatory + essential + reserves;
  const optionalDiscretionaryAllowance = Math.max(0, operatingBudgetCap - discretionary);
  const capitalSurplusAtFloor = floor - mandatory - essential - reserves - discretionary;
  const capitalSurplusAtBase = base - mandatory - essential - reserves - discretionary;
  const capitalSurplusAtStrong = strong - mandatory - essential - reserves - discretionary;
  const obligationCoverage = next30 <= 0 ? 0 : Number((cash / next30).toFixed(2));
  const forecastShortfall = Math.max(0, next30 + buffer - cash);
  const status = !floor || !mandatory && !essential
    ? "INCOMPLETE_DATA"
    : capitalSurplusAtFloor < 0 || forecastShortfall > 0
      ? "SHORTFALL_RISK"
      : capitalSurplusAtFloor <= Math.round(floor * 0.1)
        ? "TIGHT"
        : "HEALTHY";
  return {
    verifiedIncome: centsToMoney(floor),
    incomeFloor: centsToMoney(floor),
    baseIncome: centsToMoney(base),
    strongIncome: centsToMoney(strong),
    mandatoryObligations: centsToMoney(mandatory),
    essentialVariableCosts: centsToMoney(essential),
    reserveRequirements: centsToMoney(reserves),
    discretionarySpending: centsToMoney(discretionary),
    currentCash: centsToMoney(cash),
    cashBuffer: centsToMoney(buffer),
    capitalGoals: centsToMoney(capitalGoals),
    next30DayObligations: centsToMoney(next30),
    operatingBudgetCap: centsToMoney(operatingBudgetCap),
    minimumViableOperatingCost: centsToMoney(minimumViableOperatingCost),
    optionalDiscretionaryAllowance: centsToMoney(optionalDiscretionaryAllowance),
    capitalSurplusAtFloor: centsToMoney(capitalSurplusAtFloor),
    capitalSurplusAtBase: centsToMoney(capitalSurplusAtBase),
    capitalSurplusAtStrong: centsToMoney(capitalSurplusAtStrong),
    forecastShortfall: centsToMoney(forecastShortfall),
    obligationCoverage,
    status,
  };
}

export function calculateVehicleAffordability(input: {
  incomeFloor: string;
  currentOperatingBudget: string;
  currentCapitalSurplus: string;
  monthlyPayment: string;
  insurance: string;
  fuel: string;
  maintenanceReserve: string;
  registrationReserve: string;
  parkingTolls: string;
  otherMonthlyCost: string;
}) {
  const total = [
    input.monthlyPayment,
    input.insurance,
    input.fuel,
    input.maintenanceReserve,
    input.registrationReserve,
    input.parkingTolls,
    input.otherMonthlyCost,
  ].reduce((sum, value) => sum + cents(value), 0);
  const floor = cents(input.incomeFloor);
  const operating = cents(input.currentOperatingBudget);
  const surplus = cents(input.currentCapitalSurplus);
  const newOperatingBudget = operating + total;
  const newFloorSurplus = floor - newOperatingBudget;
  const status = !floor || !total
    ? "INSUFFICIENT_DATA"
    : newFloorSurplus < 0
      ? "HOUSEHOLD_SHORTFALL_RISK"
      : total > surplus
        ? "CAPITAL_GOAL_IMPACT"
        : newFloorSurplus < Math.round(floor * 0.1)
          ? "AFFORDABLE_BUT_TIGHT"
          : "AFFORDABLE_WITH_BUFFER";
  return {
    totalMonthlyCost: centsToMoney(total),
    newOperatingBudget: centsToMoney(newOperatingBudget),
    newFloorSurplus: centsToMoney(newFloorSurplus),
    capitalSurplusImpact: centsToMoney(Math.max(0, total - Math.max(surplus, 0))),
    status,
  };
}

export function buildVariableCashFlowForecast(input: {
  scenarioIncome: string;
  openingCash: string;
  obligations: string;
  essentialSpending: string;
  reserveContributions: string;
  approvedCapitalContributions: string;
  cashBuffer: string;
  days: number;
}) {
  const ending = cents(input.openingCash) + cents(input.scenarioIncome) - cents(input.obligations) - cents(input.essentialSpending) - cents(input.reserveContributions) - cents(input.approvedCapitalContributions);
  const buffer = cents(input.cashBuffer);
  return {
    days: input.days,
    scenarioIncome: centsToMoney(cents(input.scenarioIncome)),
    openingCash: centsToMoney(cents(input.openingCash)),
    obligations: centsToMoney(cents(input.obligations)),
    essentialSpending: centsToMoney(cents(input.essentialSpending)),
    reserveContributions: centsToMoney(cents(input.reserveContributions)),
    approvedCapitalContributions: centsToMoney(cents(input.approvedCapitalContributions)),
    endingProjectedCash: centsToMoney(ending),
    bufferShortfall: centsToMoney(Math.max(0, buffer - ending)),
    status: ending < 0 ? "SHORTFALL" : ending < buffer ? "SHORTFALL_RISK" : ending < buffer * 1.25 ? "TIGHT" : "HEALTHY",
  };
}