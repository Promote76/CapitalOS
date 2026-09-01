import { and, desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  buyBoxes,
  cashToCloseEstimates,
  financingScenarios,
  goals,
  propertyCandidates,
  propertyGoals,
  propertyReadinessSnapshots,
  propertyStressTests,
} from "@workspace/db";
import { centsToMoney, parseMoneyToCents } from "../domain/finance";
import {
  calculateBuyBoxMatch,
  calculateCashToClose,
  calculateDealAnalysis,
  calculatePropertyGovernor,
  calculatePropertyReadiness,
  calculateStressScenario,
} from "../domain/property-underwriting";
import { assertPermission, GovernanceError } from "../domain/governance";
import { getCashFlow } from "./household-finance";
import { ensureSeedData } from "./seed";
import type { Actor } from "./capital-os";

const moneyCents = (value: string | null | undefined) => parseMoneyToCents(value ?? "0");
const money = (value: number) => centsToMoney(Math.round(value));

function defaultBuyBoxValues(householdId: string) {
  return {
    householdId,
    propertyType: "duplex",
    ownerOccupied: true,
    purchasePriceMinimum: "180000.00",
    purchasePriceMaximum: "560000.00",
    targetCashToClose: "135000.00",
    minimumBedroomsPerUnit: "2",
    minimumBathroomsPerUnit: "1",
    minimumEstimatedRent: "2200.00",
    maximumEstimatedRehabilitation: "35000.00",
    minimumCashFlow: "0.00",
    maximumMonthlyHousingCost: "2600.00",
    minimumDscrEstimate: "1.15",
    maximumPropertyAge: "100",
    minimumPropertyCondition: "fair",
    targetMarkets: ["Northside / transit"],
    excludedMarkets: [],
    truckParkingProximity: "Within 15 minutes",
    neighborhoodRequirements: "Independent entrances, stable block, transit access",
    propertyTaxCeiling: "9000.00",
    insuranceCostCeiling: "3000.00",
    minimumReadinessScore: "60",
  };
}

async function getIds() {
  return ensureSeedData();
}

async function getOrCreateBuyBox(householdId: string) {
  const [existing] = await db.select().from(buyBoxes).where(eq(buyBoxes.householdId, householdId)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(buyBoxes).values(defaultBuyBoxValues(householdId)).returning();
  return created;
}

function readinessFromFinance(goal: typeof goals.$inferSelect | undefined, cashFlow: Awaited<ReturnType<typeof getCashFlow>>) {
  const target = moneyCents(goal?.targetAmount);
  const current = moneyCents(goal?.currentAmount);
  const downPaymentReadiness = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const reserveReadiness = Math.min(100, (cashFlow.reserve.monthsCovered / Math.max(1, cashFlow.reserve.targetMonths)) * 100);
  const cashFlowScore = Number(cashFlow.savingsRate) >= 15 ? 100 : Number(cashFlow.savingsRate) >= 10 ? 80 : Number(cashFlow.savingsRate) >= 5 ? 60 : 35;
  return calculatePropertyReadiness([
    { key: "downPayment", label: "Down payment readiness", score: downPaymentReadiness, weight: 2, reason: "Keep building the protected Duplex Reserve toward the cash requirement." },
    { key: "closingCosts", label: "Closing cost readiness", score: reserveReadiness, weight: 1, reason: "Build a separate closing-cost reserve before property search accelerates." },
    { key: "emergencyReserve", label: "Emergency reserve", score: reserveReadiness, weight: 2, reason: "Maintain the emergency reserve floor before committing acquisition capital." },
    { key: "incomeStability", label: "Income stability", score: 80, weight: 1, reason: "Confirm recurring income and pay-date evidence." },
    { key: "cashFlow", label: "Household cash flow", score: cashFlowScore, weight: 2, reason: "Improve monthly free cash flow before adding a housing obligation." },
    { key: "savingsConsistency", label: "Savings consistency", score: 84, weight: 1, reason: "Keep the $250 weekly contribution rhythm intact." },
    { key: "debtObligations", label: "Debt obligations", score: 82, weight: 1, reason: "Keep debt service visible in every financing scenario." },
    { key: "creditReadiness", label: "Credit readiness", score: 76, weight: 1, reason: "Refresh credit documentation before lender conversations." },
    { key: "documentReadiness", label: "Document readiness", score: 45, weight: 1, reason: "Collect income, reserve, and asset documentation." },
    { key: "marketResearch", label: "Market research", score: 72, weight: 1, reason: "Compare at least three target neighborhoods." },
    { key: "buyBoxCompletion", label: "Buy box completion", score: 91, weight: 1, reason: "Keep the target property standards explicit." },
    { key: "propertyPipeline", label: "Property pipeline", score: 25, weight: 1, reason: "Add and research candidate properties before making an offer." },
  ]);
}

function dealResponse(candidate: typeof propertyCandidates.$inferSelect, box: typeof buyBoxes.$inferSelect) {
  const analysis = calculateDealAnalysis({
    purchasePriceCents: moneyCents(candidate.askingPrice),
    downPaymentPercent: 0.05,
    annualInterestRate: 0.07,
    termYears: 30,
    annualTaxesCents: moneyCents(candidate.annualPropertyTaxes),
    monthlyInsuranceCents: Math.round(moneyCents(candidate.insurance) / 12),
    monthlyHoaCents: Math.round(moneyCents(candidate.hoa) / 12),
    monthlyRentCents: moneyCents(candidate.estimatedRent),
    rentalUnitCount: 1,
    totalUnitCount: Number(candidate.units),
    vacancyRate: Number(candidate.vacancyAssumption),
    maintenanceRate: 0.05,
    managementRate: 0.08,
    monthlyUtilitiesCents: 0,
    monthlyRepairsCents: Math.round(moneyCents(candidate.repairs) / 12),
    monthlyOtherExpenseCents: 0,
    monthlyMortgageInsuranceCents: 0,
  });
  const buyBox = calculateBuyBoxMatch({
    purchasePriceCents: moneyCents(candidate.askingPrice),
    minPriceCents: moneyCents(box.purchasePriceMinimum),
    maxPriceCents: moneyCents(box.purchasePriceMaximum),
    bedroomsPerUnit: Number(candidate.bedrooms) / Math.max(1, Number(candidate.units)),
    minBedroomsPerUnit: Number(box.minimumBedroomsPerUnit),
    estimatedRentCents: moneyCents(candidate.estimatedRent),
    minEstimatedRentCents: moneyCents(box.minimumEstimatedRent),
    repairsCents: moneyCents(candidate.repairs),
    maxRepairsCents: moneyCents(box.maximumEstimatedRehabilitation),
    monthlyCashFlowCents: analysis.monthlyCashFlowCents,
    minCashFlowCents: moneyCents(box.minimumCashFlow),
    dscr: analysis.dscr,
    minDscr: Number(box.minimumDscrEstimate),
    market: candidate.market ?? "",
    targetMarkets: box.targetMarkets ?? [],
    excludedMarkets: box.excludedMarkets ?? [],
    annualTaxesCents: moneyCents(candidate.annualPropertyTaxes),
    taxCeilingCents: moneyCents(box.propertyTaxCeiling),
    insuranceCents: moneyCents(candidate.insurance),
    insuranceCeilingCents: moneyCents(box.insuranceCostCeiling),
  });
  return {
    analysis: {
      downPayment: money(analysis.downPaymentCents),
      loanAmount: money(analysis.loanAmountCents),
      principalInterest: money(analysis.principalInterestCents),
      monthlyHousingCost: money(analysis.monthlyHousingCostCents),
      grossRent: money(analysis.grossRentCents),
      netRentalContribution: money(analysis.netRentalContributionCents),
      ownerEffectiveHousingCost: money(analysis.ownerEffectiveHousingCostCents),
      monthlyCashFlow: money(analysis.monthlyCashFlowCents),
      annualCashFlow: money(analysis.annualCashFlowCents),
      noi: money(analysis.noiCents),
      capRate: analysis.capRate,
      cashOnCashReturn: analysis.cashOnCashReturn,
      dscr: analysis.dscr,
      breakEvenOccupancy: analysis.breakEvenOccupancy,
      reserves: {
        vacancy: money(analysis.reserves.vacancyCents),
        maintenance: money(analysis.reserves.maintenanceCents),
        management: money(analysis.reserves.managementCents),
      },
    },
    buyBox,
  };
}

export async function getPropertyUnderwriting() {
  const ids = await getIds();
  const [property, goal, box, candidates, scenarios, cashClose, stressTests, readiness] = await Promise.all([
    db.select().from(propertyGoals).where(eq(propertyGoals.id, ids.propertyGoalId)).limit(1),
    db.select().from(goals).where(eq(goals.id, ids.goalId)).limit(1),
    getOrCreateBuyBox(ids.householdId),
    db.select().from(propertyCandidates).where(eq(propertyCandidates.propertyGoalId, ids.propertyGoalId)).orderBy(desc(propertyCandidates.updatedAt)),
    db.select().from(financingScenarios).where(eq(financingScenarios.householdId, ids.householdId)).orderBy(desc(financingScenarios.createdAt)),
    db.select().from(cashToCloseEstimates).where(eq(cashToCloseEstimates.householdId, ids.householdId)).orderBy(desc(cashToCloseEstimates.createdAt)),
    db.select().from(propertyStressTests).where(eq(propertyStressTests.householdId, ids.householdId)).orderBy(desc(propertyStressTests.createdAt)),
    db.select().from(propertyReadinessSnapshots).where(eq(propertyReadinessSnapshots.propertyGoalId, ids.propertyGoalId)).orderBy(desc(propertyReadinessSnapshots.createdAt)).limit(1),
  ]);
  if (!property[0]) throw new GovernanceError("INVALID_STATE", "Property goal was not found");
  const cashFlow = await getCashFlow();
  const propertyReadiness = readiness[0]
    ? { score: Number(readiness[0].score), status: readiness[0].status, factors: [], nextAction: readiness[0].nextAction }
    : readinessFromFinance(goal[0], cashFlow);
  return {
    propertyGoal: {
      id: property[0].id,
      name: property[0].name,
      targetMarket: property[0].targetMarket ?? "Not selected",
      targetBudget: property[0].targetBudget,
      targetCashToClose: box.targetCashToClose,
      targetDate: property[0].targetDate,
      readiness: propertyReadiness,
    },
    buyBox: box,
    candidates: candidates.map((candidate) => ({
      ...candidate,
      deal: dealResponse(candidate, box),
    })),
    financingScenarios: scenarios,
    cashToClose: cashClose,
    stressTests,
    nextAction: propertyReadiness.nextAction,
    dataConfidence: cashFlow.confidenceScore,
    household: {
      emergencyReserve: cashFlow.reserve.currentAmount,
      emergencyReserveMonths: cashFlow.reserve.monthsCovered,
      freeCashFlow: cashFlow.freeCashFlow,
      safeToDeploy: cashFlow.safeToDeploy,
    },
  };
}

export async function updateBuyBox(actor: Actor, input: Partial<typeof buyBoxes.$inferInsert>) {
  assertPermission(actor.role, "manage_risk");
  const ids = await getIds();
  const existing = await getOrCreateBuyBox(ids.householdId);
  const [updated] = await db.update(buyBoxes).set({ ...input, updatedAt: new Date() }).where(eq(buyBoxes.id, existing.id)).returning();
  return updated;
}

export async function createPropertyCandidate(actor: Actor, input: typeof propertyCandidates.$inferInsert) {
  assertPermission(actor.role, "manage_risk");
  const ids = await getIds();
  if (input.propertyGoalId !== ids.propertyGoalId) throw new GovernanceError("INVALID_STATE", "Property goal was not found");
  const [candidate] = await db.insert(propertyCandidates).values(input).returning();
  return candidate;
}

export async function analyzePropertyCandidate(actor: Actor, candidateId: string) {
  assertPermission(actor.role, "read");
  const ids = await getIds();
  const [candidate] = await db.select().from(propertyCandidates).where(and(eq(propertyCandidates.id, candidateId), eq(propertyCandidates.propertyGoalId, ids.propertyGoalId))).limit(1);
  if (!candidate) throw new GovernanceError("INVALID_STATE", "Property candidate was not found");
  const box = await getOrCreateBuyBox(ids.householdId);
  const result = dealResponse(candidate, box);
  const cashToCloseInput = {
    downPaymentCents: moneyCents(candidate.downPayment ?? result.analysis.downPayment),
    earnestMoneyCents: 1000 * 100,
    inspectionCents: 500 * 100,
    appraisalCents: 650 * 100,
    loanFeesCents: 1200 * 100,
    originationFeesCents: 0,
    titleFeesCents: 1800 * 100,
    recordingFeesCents: 250 * 100,
    prepaidTaxesCents: Math.round(moneyCents(candidate.annualPropertyTaxes) / 12 * 3),
    prepaidInsuranceCents: Math.round(moneyCents(candidate.insurance) / 12 * 3),
    escrowsCents: 1000 * 100,
    immediateRepairsCents: moneyCents(candidate.immediateRepairs ?? candidate.repairs),
    movingCostsCents: 1500 * 100,
    initialReservesCents: 5000 * 100,
    emergencyBufferCents: 3000 * 100,
    otherClosingCostsCents: 1000 * 100,
  };
  const totalCashToClose = calculateCashToClose(cashToCloseInput);
  const [cashClose] = await db.insert(cashToCloseEstimates).values({
    householdId: ids.householdId,
    propertyCandidateId: candidate.id,
    downPayment: money(cashToCloseInput.downPaymentCents),
    earnestMoney: money(cashToCloseInput.earnestMoneyCents),
    inspection: money(cashToCloseInput.inspectionCents),
    appraisal: money(cashToCloseInput.appraisalCents),
    loanFees: money(cashToCloseInput.loanFeesCents),
    originationFees: money(cashToCloseInput.originationFeesCents),
    titleFees: money(cashToCloseInput.titleFeesCents),
    recordingFees: money(cashToCloseInput.recordingFeesCents),
    prepaidTaxes: money(cashToCloseInput.prepaidTaxesCents),
    prepaidInsurance: money(cashToCloseInput.prepaidInsuranceCents),
    escrows: money(cashToCloseInput.escrowsCents),
    immediateRepairs: money(cashToCloseInput.immediateRepairsCents),
    movingCosts: money(cashToCloseInput.movingCostsCents),
    initialReserves: money(cashToCloseInput.initialReservesCents),
    emergencyBuffer: money(cashToCloseInput.emergencyBufferCents),
    otherClosingCosts: money(cashToCloseInput.otherClosingCostsCents),
    estimatedCashToClose: money(totalCashToClose),
  }).returning();
  const finance = await getCashFlow();
  const availableCents = moneyCents(finance.reserve.currentAmount);
  const governor = calculatePropertyGovernor({
    cashAfterClosingCents: availableCents - totalCashToClose,
    emergencyReserveAfterCents: moneyCents(finance.reserve.currentAmount) - totalCashToClose,
    minimumEmergencyReserveCents: moneyCents(finance.reserve.essentialMonthlyExpenses) * 3,
    monthlyCashFlowAfterCents: moneyCents(result.analysis.monthlyCashFlow) + moneyCents(finance.metrics.freeCashFlow),
    minimumFreeCashFlowCents: 0,
    cashUsedPercent: availableCents > 0 ? (totalCashToClose / availableCents) * 100 : 100,
    maximumCashUsedPercent: 70,
    stressPasses: true,
  });
  const stress = calculateStressScenario({
    baselineMonthlyCashFlowCents: moneyCents(result.analysis.monthlyCashFlow),
    baselineEmergencyReserveCents: moneyCents(finance.reserve.currentAmount),
    monthlyIncomeCents: moneyCents(finance.metrics.grossInflow),
    monthlyRentCents: moneyCents(result.analysis.grossRent),
    monthlyExpensesCents: moneyCents(finance.reserve.essentialMonthlyExpenses),
    rentChange: 0.2,
    vacancyMonths: 2,
    repairCents: 5000 * 100,
    insuranceChange: 0.15,
    incomeChange: 0.1,
  });
  await db.insert(propertyStressTests).values({
    householdId: ids.householdId,
    propertyCandidateId: candidate.id,
    name: "Combined downside scenario",
    assumptions: { rentChange: 0.2, vacancyMonths: 2, repairCents: 500000, insuranceChange: 0.15, incomeChange: 0.1 },
    monthlyCashFlow: money(stress.monthlyCashFlowCents),
    emergencyReserveRemaining: money(stress.emergencyReserveRemainingCents),
    monthsUntilLiquidityBreach: stress.monthsUntilLiquidityBreach?.toFixed(2),
    result: stress.result,
  });
  await db.update(propertyCandidates).set({
    downPayment: result.analysis.downPayment,
    financingEstimate: result.analysis.loanAmount,
    cashRequired: cashClose.estimatedCashToClose,
    projectedCashFlow: result.analysis.monthlyCashFlow,
    buyBoxScore: String(result.buyBox.score),
    dealQualityScore: String(Math.round((result.buyBox.score + Math.min(100, Math.max(0, result.analysis.cashOnCashReturn * 10)) + (stress.result === "pass" ? 100 : stress.result === "review" ? 60 : 20)) / 3)),
    dataConfidence: "68.00",
    readinessStatus: governor.status,
    riskLevel: governor.status === "blocked" ? "high" : "moderate",
    nextAction: governor.reasons[0] ?? "Review the deal with an authorized lender and property professional.",
    updatedAt: new Date(),
  }).where(eq(propertyCandidates.id, candidate.id));
  return { candidateId: candidate.id, deal: result, cashToClose: cashClose, stress, governor };
}