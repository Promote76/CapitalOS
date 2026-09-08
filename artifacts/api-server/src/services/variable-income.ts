import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  budgetPlanningCategorySnapshots,
  budgetPlanningPeriods,
  emergencyReserves,
  financeBills,
  financialAccounts,
  goals,
  upcomingExpenses,
  variableIncomeProfiles,
  verifiedHouseholdIncomeEvents,
  householdVehicleScenarios,
} from "@workspace/db/schema";
import type { Actor } from "./capital-os";
import { assertPermission, GovernanceError } from "../domain/governance";
import {
  buildVariableCashFlowForecast,
  calculateHouseholdBudgetConstraints,
  calculateVariableIncomeProfile,
  calculateVehicleAffordability,
  type VariableIncomePolicy,
} from "../domain/variable-income";
import { centsToMoney, parseMoneyToCents } from "../domain/finance";
import { auditEvents } from "@workspace/db/schema";

const today = () => new Date().toISOString().slice(0, 10);
const money = (value: string | number | null | undefined) => centsToMoney(parseMoneyToCents(String(value ?? "0")));
const cents = (value: string | number | null | undefined) => parseMoneyToCents(String(value ?? "0"));
const addDays = (value: string, days: number) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

function profileResponse(profile: ReturnType<typeof calculateVariableIncomeProfile>, calculationDate?: string) {
  return {
    calculationDate: calculationDate ?? today(),
    currentMonthVerifiedIncome: centsToMoney(profile.currentMonthVerifiedIncomeCents),
    trailing4WeekIncome: centsToMoney(profile.trailing4WeekIncomeCents),
    trailing8WeekIncome: centsToMoney(profile.trailing8WeekIncomeCents),
    trailing13WeekIncome: centsToMoney(profile.trailing13WeekIncomeCents),
    trailing3MonthIncome: centsToMoney(profile.trailing3MonthIncomeCents),
    trailing6MonthIncome: centsToMoney(profile.trailing6MonthIncomeCents),
    highestRecentMonth: centsToMoney(profile.highestRecentMonthCents),
    lowestRecentMonth: centsToMoney(profile.lowestRecentMonthCents),
    medianRecentMonth: centsToMoney(profile.medianRecentMonthCents),
    incomeFloor: centsToMoney(profile.incomeFloorCents),
    baseIncome: centsToMoney(profile.baseIncomeCents),
    strongMonthIncome: centsToMoney(profile.strongMonthIncomeCents),
    incomeVolatility: profile.incomeVolatility,
    sourceCount: profile.sourceCount,
    sourceFreshness: profile.sourceFreshness,
    policy: profile.policy,
    confidenceStatus: profile.confidenceStatus,
    recentMonthCount: profile.recentMonthCount,
  };
}

function vehicleResponse(row: typeof householdVehicleScenarios.$inferSelect) {
  const { householdId: _householdId, createdBy: _createdBy, ...response } = row;
  return {
    ...response,
    paymentSource: response.paymentSource as "USER_PROVIDED" | "DERIVED_FROM_APR_TERM" | "NOT_CALCULATED",
    currentOperatingCost: response.currentOperatingCost,
    newOperatingCost: response.newOperatingCost,
    cashBufferImpact: response.cashBufferImpact,
    emergencyReserveImpact: response.emergencyReserveImpact,
    duplexContributionImpact: response.duplexContributionImpact,
    horizonImpact: {
      days30: response.totalMonthlyCost,
      days60: centsToMoney(cents(response.totalMonthlyCost) * 2),
      days90: centsToMoney(cents(response.totalMonthlyCost) * 3),
    },
    planningOnly: true,
    liabilityCreated: false,
    status: response.affordabilityStatus,
  };
}

export async function getVariableBudgetIntelligence(actor: Actor, asOf = today()) {
  assertPermission(actor.role, "read");
  const monthStart = `${asOf.slice(0, 7)}-01`;
  const [events, bills, upcoming, accounts, reserveRows, goalsRows, periods, vehicles] = await Promise.all([
    db.select().from(verifiedHouseholdIncomeEvents)
      .where(and(eq(verifiedHouseholdIncomeEvents.householdId, actor.householdId), eq(verifiedHouseholdIncomeEvents.verificationStatus, "verified")))
      .orderBy(desc(verifiedHouseholdIncomeEvents.incomeDate)),
    db.select().from(financeBills).where(and(eq(financeBills.householdId, actor.householdId), eq(financeBills.active, true))).orderBy(asc(financeBills.dueDate)),
    db.select().from(upcomingExpenses).where(and(eq(upcomingExpenses.householdId, actor.householdId), eq(upcomingExpenses.active, true))).orderBy(asc(upcomingExpenses.expectedDate)),
    db.select().from(financialAccounts).where(and(eq(financialAccounts.householdId, actor.householdId), eq(financialAccounts.includedInBudget, true))),
    db.select().from(emergencyReserves).where(eq(emergencyReserves.householdId, actor.householdId)).limit(1),
    db.select().from(goals).where(eq(goals.householdId, actor.householdId)),
    db.select().from(budgetPlanningPeriods).where(and(eq(budgetPlanningPeriods.householdId, actor.householdId), eq(budgetPlanningPeriods.month, monthStart), sql`${budgetPlanningPeriods.status} in ('approved', 'closed')`)).limit(1),
    db.select().from(householdVehicleScenarios).where(and(eq(householdVehicleScenarios.householdId, actor.householdId), eq(householdVehicleScenarios.active, true))).orderBy(desc(householdVehicleScenarios.createdAt)),
  ]);
  const [period] = periods;
  const profile = calculateVariableIncomeProfile(events.map((event) => ({
    incomeDate: event.incomeDate,
    amount: event.amount,
    verificationStatus: event.verificationStatus,
  })), asOf);
  const [reserve] = reserveRows;
  const categories = period
    ? await db.select().from(budgetPlanningCategorySnapshots).where(and(eq(budgetPlanningCategorySnapshots.periodId, period.id), eq(budgetPlanningCategorySnapshots.archived, false)))
    : [];
  const monthlyTarget = (predicate: (category: typeof categories[number]) => boolean) =>
    categories.filter(predicate).reduce((sum, category) => sum + cents(category.monthlyTarget), 0);
  const mandatoryFromPlan = monthlyTarget((category) => category.essentialStatus === "essential" && ["fixed_expense", "debt_payment"].includes(category.categoryType));
  const essentialFromPlan = monthlyTarget((category) => category.essentialStatus === "essential" && category.categoryType === "variable_essential");
  const discretionary = monthlyTarget((category) => category.categoryType === "variable_discretionary" || category.essentialStatus === "discretionary");
  const billMandatory = bills.filter((bill) => bill.essential).reduce((sum, bill) => sum + cents(bill.expectedAmount), 0);
  const mandatory = mandatoryFromPlan || billMandatory;
  const essential = essentialFromPlan;
  const reserveConfigured = Boolean(reserve && reserve.targetMonths > 0 && cents(reserve.essentialMonthlyExpenses) > 0);
  const reserveTarget = reserveConfigured ? cents(reserve?.essentialMonthlyExpenses) * (reserve?.targetMonths ?? 0) : 0;
  const reserveGap = reserveConfigured ? Math.max(0, reserveTarget - cents(reserve?.currentAmount)) : 0;
  const reserveMonthly = reserveConfigured ? Math.ceil(reserveGap / (reserve?.targetMonths ?? 1)) : 0;
  const currentCash = accounts
    .filter((account) => ["checking", "savings", "money_market"].includes(account.accountType) && !account.businessEntityId && !account.protected)
    .reduce((sum, account) => sum + cents(account.availableBalance ?? account.currentBalance), 0);
  const capitalGoals = goalsRows.filter((goal) => goal.status !== "completed").reduce((sum, goal) => sum + cents(goal.weeklyContribution) * 4, 0);
  const obligationsFor = (days: number) => bills.filter((bill) => bill.dueDate >= asOf && bill.dueDate <= addDays(asOf, days)).reduce((sum, bill) => sum + cents(bill.expectedAmount), 0)
    + upcoming.filter((expense) => expense.required && expense.expectedDate >= asOf && expense.expectedDate <= addDays(asOf, days)).reduce((sum, expense) => sum + Math.max(0, cents(expense.estimatedAmount) - cents(expense.fundedAmount)), 0);
  const next30 = obligationsFor(30);
  const cashBuffer = Math.ceil((mandatory + essential) * 14 / 30);
  const constraints = calculateHouseholdBudgetConstraints({
    incomeFloor: centsToMoney(profile.incomeFloorCents),
    baseIncome: centsToMoney(profile.baseIncomeCents),
    strongIncome: centsToMoney(profile.strongMonthIncomeCents),
    mandatoryObligations: centsToMoney(mandatory),
    essentialVariableCosts: centsToMoney(essential),
    reserveRequirements: centsToMoney(reserveMonthly),
    discretionarySpending: centsToMoney(discretionary),
    currentCash: centsToMoney(currentCash),
    cashBuffer: centsToMoney(cashBuffer),
    capitalGoals: centsToMoney(capitalGoals),
    next30DayObligations: centsToMoney(next30),
  });
  const forecastComplete = Boolean(period && currentCash >= 0 && profile.confidenceStatus !== "INSUFFICIENT_HISTORY" && reserveConfigured);
  const forecast = [7, 14, 30, 60, 90].flatMap((days) => ([
    ["FLOOR", profile.incomeFloorCents],
    ["BASE", profile.baseIncomeCents],
    ["STRONG", profile.strongMonthIncomeCents],
  ] as const).map(([scenario, monthlyIncome]) => buildVariableCashFlowForecast({
    scenario,
    scenarioIncome: centsToMoney(Math.round(monthlyIncome * days / 30)),
    openingCash: centsToMoney(currentCash),
    obligations: centsToMoney(obligationsFor(days)),
    essentialSpending: centsToMoney(Math.round(essential * days / 30)),
    reserveContributions: centsToMoney(Math.round(reserveMonthly * days / 30)),
    discretionaryAllowance: centsToMoney(Math.round(discretionary * days / 30)),
    approvedCapitalContributions: centsToMoney(Math.round(capitalGoals * days / 30)),
    cashBuffer: centsToMoney(cashBuffer),
    days,
    requiredInputsComplete: forecastComplete,
  })));
  const scenariosIdentical = profile.incomeFloorCents === profile.baseIncomeCents && profile.baseIncomeCents === profile.strongMonthIncomeCents;
  return {
    asOf,
    source: {
      verifiedIncomeEventCount: events.length,
      approvedBudgetPeriod: period ? period.month : null,
      incomeAuthority: "VerifiedHouseholdIncomeEvent",
      planningStatus: period ? "APPROVED_PLAN" : "INCOMPLETE_DATA",
      forecastReadiness: forecastComplete ? "READY" : "INCOMPLETE",
    },
    incomeProfile: profileResponse(profile, asOf),
    constraints,
    obligations: {
      next7Days: money(obligationsFor(7)),
      next14Days: money(obligationsFor(14)),
      next30Days: money(next30),
      next60Days: money(obligationsFor(60)),
      next90Days: money(obligationsFor(90)),
      items: [...bills.filter((bill) => bill.dueDate >= asOf && bill.dueDate <= addDays(asOf, 90)).map((bill) => ({ name: bill.billName, dueDate: bill.dueDate, amount: money(bill.expectedAmount), required: bill.essential, source: "bill" })), ...upcoming.filter((expense) => expense.required && expense.expectedDate >= asOf && expense.expectedDate <= addDays(asOf, 90)).map((expense) => ({ name: expense.name, dueDate: expense.expectedDate, amount: money(Math.max(0, cents(expense.estimatedAmount) - cents(expense.fundedAmount))), required: expense.required, source: "upcoming_expense" }))],
    },
    reserve: {
      targetMonths: reserveConfigured ? reserve?.targetMonths ?? 0 : 0,
      target: reserveConfigured ? money(reserveTarget) : "NOT_CALCULATED",
      current: reserveConfigured ? money(reserve?.currentAmount) : "NOT_CALCULATED",
      fundingGap: reserveConfigured ? money(reserveGap) : "NOT_CALCULATED",
      monthlyFunding: reserveConfigured ? money(reserveMonthly) : "NOT_CALCULATED",
      status: !reserve ? "NOT_CONFIGURED" : !reserveConfigured ? "INCOMPLETE" : reserveGap > 0 ? "UNDERFUNDED" : reserveTarget === 0 ? "ZERO_REQUIRED" : "FUNDED",
    },
    cash: {
      current: money(currentCash),
      buffer: money(cashBuffer),
      coverage: constraints.obligationCoverage,
      pressure: constraints.status === "SHORTFALL_RISK" ? "HIGH" : constraints.status === "TIGHT" ? "MODERATE" : constraints.status === "INCOMPLETE_DATA" ? "UNKNOWN" : "LOW",
    },
    forecast,
    forecastExplanation: scenariosIdentical
      ? "Floor, base, and strong paths are identical because the verified-income scenario inputs are equal."
      : "Scenario paths use distinct verified-income floor, base, and strong inputs, prorated deterministically by forecast window.",
    vehicleScenarios: vehicles.map(vehicleResponse),
  };
}

export async function recalculateVariableIncomeProfile(actor: Actor, input: { calculationDate?: string; policy?: VariableIncomePolicy; approvedFloor?: string }) {
  assertPermission(actor.role, "contribute");
  const calculationDate = input.calculationDate ?? today();
  const events = await db.select().from(verifiedHouseholdIncomeEvents)
    .where(and(eq(verifiedHouseholdIncomeEvents.householdId, actor.householdId), eq(verifiedHouseholdIncomeEvents.verificationStatus, "verified")));
  const profile = calculateVariableIncomeProfile(events, calculationDate, input.policy, input.approvedFloor);
  const [row] = await db.insert(variableIncomeProfiles).values({
    householdId: actor.householdId,
    calculationDate,
    currentMonthVerifiedIncome: centsToMoney(profile.currentMonthVerifiedIncomeCents),
    trailing4WeekIncome: centsToMoney(profile.trailing4WeekIncomeCents),
    trailing8WeekIncome: centsToMoney(profile.trailing8WeekIncomeCents),
    trailing13WeekIncome: centsToMoney(profile.trailing13WeekIncomeCents),
    trailing3MonthIncome: centsToMoney(profile.trailing3MonthIncomeCents),
    trailing6MonthIncome: centsToMoney(profile.trailing6MonthIncomeCents),
    highestRecentMonth: centsToMoney(profile.highestRecentMonthCents),
    lowestRecentMonth: centsToMoney(profile.lowestRecentMonthCents),
    medianRecentMonth: centsToMoney(profile.medianRecentMonthCents),
    incomeFloor: centsToMoney(profile.incomeFloorCents),
    baseIncome: centsToMoney(profile.baseIncomeCents),
    strongMonthIncome: centsToMoney(profile.strongMonthIncomeCents),
    incomeVolatility: profile.incomeVolatility.toFixed(2),
    sourceCount: String(profile.sourceCount),
    sourceFreshness: profile.sourceFreshness,
    policy: profile.policy,
    confidenceStatus: profile.confidenceStatus,
  }).onConflictDoUpdate({
    target: [variableIncomeProfiles.householdId, variableIncomeProfiles.calculationDate],
    set: {
      currentMonthVerifiedIncome: centsToMoney(profile.currentMonthVerifiedIncomeCents),
      trailing4WeekIncome: centsToMoney(profile.trailing4WeekIncomeCents),
      trailing8WeekIncome: centsToMoney(profile.trailing8WeekIncomeCents),
      trailing13WeekIncome: centsToMoney(profile.trailing13WeekIncomeCents),
      trailing3MonthIncome: centsToMoney(profile.trailing3MonthIncomeCents),
      trailing6MonthIncome: centsToMoney(profile.trailing6MonthIncomeCents),
      highestRecentMonth: centsToMoney(profile.highestRecentMonthCents),
      lowestRecentMonth: centsToMoney(profile.lowestRecentMonthCents),
      medianRecentMonth: centsToMoney(profile.medianRecentMonthCents),
      incomeFloor: centsToMoney(profile.incomeFloorCents),
      baseIncome: centsToMoney(profile.baseIncomeCents),
      strongMonthIncome: centsToMoney(profile.strongMonthIncomeCents),
      incomeVolatility: profile.incomeVolatility.toFixed(2),
      sourceCount: String(profile.sourceCount),
      sourceFreshness: profile.sourceFreshness,
      policy: profile.policy,
      confidenceStatus: profile.confidenceStatus,
      updatedAt: new Date(),
    },
  }).returning();
  await db.insert(auditEvents).values({
    householdId: actor.householdId,
    eventType: "variable_income_profile_recalculated",
    actor: actor.userId,
    entity: "variable_income_profile",
    entityId: row.id,
    reason: "Deterministic verified-income profile recalculated",
    metadata: { calculationDate, policy: profile.policy, confidenceStatus: profile.confidenceStatus },
  });
  return { ...profileResponse(profile, calculationDate), id: row.id, createdAt: row.createdAt, updatedAt: row.updatedAt };
}

export async function createVehicleScenario(actor: Actor, input: {
  name: string;
  vehiclePrice?: string;
  downPayment?: string;
  loanAmount?: string;
  estimatedApr?: string;
  loanTermMonths?: number;
    monthlyPayment?: string;
    insurance: string;
    fuel: string;
    maintenanceReserve: string;
    registrationReserve?: string;
    parkingTolls?: string;
    otherMonthlyCost?: string;
  notes?: string;
}) {
  assertPermission(actor.role, "contribute");
  const intelligence = await getVariableBudgetIntelligence(actor);
  const affordability = calculateVehicleAffordability({
    incomeFloor: intelligence.incomeProfile.incomeFloor,
    currentOperatingBudget: intelligence.constraints.operatingBudgetCap ?? undefined,
    currentCapitalSurplus: intelligence.constraints.capitalSurplusAtFloor,
    monthlyPayment: input.monthlyPayment,
    insurance: input.insurance,
    fuel: input.fuel,
    maintenanceReserve: input.maintenanceReserve,
    registrationReserve: input.registrationReserve ?? "0.00",
    parkingTolls: input.parkingTolls ?? "0.00",
    otherMonthlyCost: input.otherMonthlyCost ?? "0.00",
    vehiclePrice: input.vehiclePrice,
    downPayment: input.downPayment,
    loanAmount: input.loanAmount,
    estimatedApr: input.estimatedApr,
    loanTermMonths: input.loanTermMonths,
    currentVehicleOperatingCost: "0.00",
    cashBuffer: intelligence.cash.buffer,
    emergencyReserveGap: intelligence.reserve.fundingGap === "NOT_CALCULATED" ? undefined : intelligence.reserve.fundingGap,
    duplexContribution: intelligence.constraints.capitalGoals,
  });
  const [row] = await db.insert(householdVehicleScenarios).values({
    householdId: actor.householdId,
    name: input.name,
    vehiclePrice: money(input.vehiclePrice),
    downPayment: money(input.downPayment),
    loanAmount: affordability.loanAmount ?? money(input.loanAmount),
    estimatedApr: input.estimatedApr ?? "0",
    loanTermMonths: String(input.loanTermMonths ?? 0),
    monthlyPayment: affordability.monthlyPayment ?? money(input.monthlyPayment),
    paymentSource: affordability.paymentSource,
    insurance: money(input.insurance),
    fuel: money(input.fuel),
    maintenanceReserve: money(input.maintenanceReserve),
    registrationReserve: money(input.registrationReserve),
    parkingTolls: money(input.parkingTolls),
    otherMonthlyCost: money(input.otherMonthlyCost),
    totalMonthlyCost: affordability.totalMonthlyCost,
    currentOperatingCost: affordability.currentOperatingCost,
    newOperatingCost: affordability.newOperatingCost,
    cashBufferImpact: affordability.cashBufferImpact,
    emergencyReserveImpact: affordability.emergencyReserveImpact,
    duplexContributionImpact: affordability.duplexContributionImpact,
    affordabilityStatus: affordability.status,
    notes: input.notes,
    createdBy: actor.userId,
  }).returning();
  await db.insert(auditEvents).values({
    householdId: actor.householdId,
    eventType: "household_vehicle_scenario_created",
    actor: actor.userId,
    entity: "household_vehicle_scenario",
    entityId: row.id,
    reason: "Planning-only vehicle affordability scenario created",
    metadata: { affordabilityStatus: affordability.status, totalMonthlyCost: affordability.totalMonthlyCost },
  });
  return { ...vehicleResponse(row), ...affordability };
}