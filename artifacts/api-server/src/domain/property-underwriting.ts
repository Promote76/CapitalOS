type Factor = { key: string; label: string; score: number; weight: number; reason: string };

export type DealAnalysisInput = {
  purchasePriceCents: number;
  downPaymentPercent: number;
  annualInterestRate: number;
  termYears: number;
  annualTaxesCents: number;
  monthlyInsuranceCents: number;
  monthlyHoaCents: number;
  monthlyRentCents: number;
  rentalUnitCount: number;
  totalUnitCount: number;
  vacancyRate: number;
  maintenanceRate: number;
  managementRate: number;
  monthlyUtilitiesCents: number;
  monthlyRepairsCents: number;
  monthlyOtherExpenseCents: number;
  monthlyMortgageInsuranceCents: number;
};

function rounded(value: number) {
  return Math.max(0, Math.round(value));
}

export function calculateMortgagePaymentCents(principalCents: number, annualRate: number, termYears: number) {
  if (principalCents <= 0 || termYears <= 0) return 0;
  const months = termYears * 12;
  const monthlyRate = annualRate / 12;
  if (monthlyRate === 0) return Math.round(principalCents / months);
  return rounded(principalCents * (monthlyRate * (1 + monthlyRate) ** months) / ((1 + monthlyRate) ** months - 1));
}

export function calculateDealAnalysis(input: DealAnalysisInput) {
  const downPaymentCents = rounded(input.purchasePriceCents * input.downPaymentPercent);
  const loanAmountCents = Math.max(0, input.purchasePriceCents - downPaymentCents);
  const principalInterestCents = calculateMortgagePaymentCents(loanAmountCents, input.annualInterestRate, input.termYears);
  const propertyTaxesCents = rounded(input.annualTaxesCents / 12);
  const grossRentCents = Math.max(0, input.monthlyRentCents);
  const vacancyReserveCents = rounded(grossRentCents * input.vacancyRate);
  const maintenanceReserveCents = rounded(grossRentCents * input.maintenanceRate);
  const managementExpenseCents = rounded(grossRentCents * input.managementRate);
  const operatingExpensesCents = propertyTaxesCents + input.monthlyInsuranceCents + input.monthlyHoaCents
    + vacancyReserveCents + maintenanceReserveCents + managementExpenseCents + input.monthlyUtilitiesCents
    + input.monthlyRepairsCents + input.monthlyOtherExpenseCents;
  const netRentalContributionCents = Math.max(0, grossRentCents - operatingExpensesCents);
  const monthlyHousingCostCents = principalInterestCents + propertyTaxesCents + input.monthlyInsuranceCents
    + input.monthlyHoaCents + input.monthlyMortgageInsuranceCents + input.monthlyUtilitiesCents;
  const rentalIncomeForHouseHackCents = input.totalUnitCount > 0
    ? rounded(grossRentCents * Math.min(1, input.rentalUnitCount / input.totalUnitCount))
    : 0;
  const ownerEffectiveHousingCostCents = Math.max(0, monthlyHousingCostCents - rentalIncomeForHouseHackCents);
  const monthlyCashFlowCents = netRentalContributionCents - principalInterestCents - input.monthlyMortgageInsuranceCents;
  const annualCashFlowCents = monthlyCashFlowCents * 12;
  const noiCents = Math.max(0, grossRentCents - operatingExpensesCents + principalInterestCents + input.monthlyMortgageInsuranceCents);
  const capRate = input.purchasePriceCents > 0 ? Number(((noiCents * 12 / input.purchasePriceCents) * 100).toFixed(2)) : 0;
  const cashInvestedCents = Math.max(1, downPaymentCents);
  const cashOnCashReturn = Number(((annualCashFlowCents / cashInvestedCents) * 100).toFixed(2));
  const dscr = principalInterestCents + input.monthlyMortgageInsuranceCents > 0
    ? Number((netRentalContributionCents / (principalInterestCents + input.monthlyMortgageInsuranceCents)).toFixed(2))
    : 0;
  const breakEvenOccupancy = grossRentCents > 0
    ? Number((((monthlyHousingCostCents + maintenanceReserveCents + managementExpenseCents + input.monthlyOtherExpenseCents) / grossRentCents) * 100).toFixed(1))
    : 100;
  return {
    downPaymentCents,
    loanAmountCents,
    principalInterestCents,
    monthlyHousingCostCents,
    grossRentCents,
    netRentalContributionCents,
    ownerEffectiveHousingCostCents,
    monthlyCashFlowCents,
    annualCashFlowCents,
    noiCents,
    capRate,
    cashOnCashReturn,
    dscr,
    breakEvenOccupancy,
    reserves: {
      vacancyCents: vacancyReserveCents,
      maintenanceCents: maintenanceReserveCents,
      managementCents: managementExpenseCents,
    },
  };
}

export type CashToCloseInput = Record<
  "downPaymentCents" | "earnestMoneyCents" | "inspectionCents" | "appraisalCents" | "loanFeesCents"
  | "originationFeesCents" | "titleFeesCents" | "recordingFeesCents" | "prepaidTaxesCents"
  | "prepaidInsuranceCents" | "escrowsCents" | "immediateRepairsCents" | "movingCostsCents"
  | "initialReservesCents" | "emergencyBufferCents" | "otherClosingCostsCents",
  number
>;

export function calculateCashToClose(input: CashToCloseInput) {
  return Object.values(input).reduce((total, value) => total + Math.max(0, Math.round(value)), 0);
}

export function classifyReadinessScore(score: number) {
  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  if (bounded < 40) return { score: bounded, status: "Foundation Stage" };
  if (bounded < 60) return { score: bounded, status: "Preparing" };
  if (bounded < 75) return { score: bounded, status: "Search Ready" };
  if (bounded < 85) return { score: bounded, status: "Financing Ready" };
  if (bounded < 95) return { score: bounded, status: "Offer Ready" };
  return { score: bounded, status: "Acquisition Ready" };
}

export function calculatePropertyReadiness(factors: Factor[]) {
  const totalWeight = factors.reduce((sum, factor) => sum + factor.weight, 0);
  const score = totalWeight === 0 ? 0 : factors.reduce((sum, factor) => sum + Math.max(0, Math.min(100, factor.score)) * factor.weight, 0) / totalWeight;
  const classified = classifyReadinessScore(score);
  const weakest = [...factors].sort((a, b) => a.score - b.score)[0];
  return { ...classified, factors, nextAction: weakest?.reason ?? "Complete the acquisition checklist." };
}

export type BuyBoxInput = {
  purchasePriceCents: number;
  minPriceCents: number;
  maxPriceCents: number;
  bedroomsPerUnit: number;
  minBedroomsPerUnit: number;
  estimatedRentCents: number;
  minEstimatedRentCents: number;
  repairsCents: number;
  maxRepairsCents: number;
  monthlyCashFlowCents: number;
  minCashFlowCents: number;
  dscr: number;
  minDscr: number;
  market: string;
  targetMarkets: string[];
  excludedMarkets: string[];
  annualTaxesCents: number;
  taxCeilingCents: number;
  insuranceCents: number;
  insuranceCeilingCents: number;
};

export function calculateBuyBoxMatch(input: BuyBoxInput) {
  const checks = [
    { key: "purchasePrice", label: "Purchase price", pass: input.purchasePriceCents >= input.minPriceCents && input.purchasePriceCents <= input.maxPriceCents, reason: "Keep the asking price inside the configured target range." },
    { key: "bedrooms", label: "Bedrooms", pass: input.bedroomsPerUnit >= input.minBedroomsPerUnit, reason: "Confirm each unit meets the minimum bedroom requirement." },
    { key: "projectedRent", label: "Projected rent", pass: input.estimatedRentCents >= input.minEstimatedRentCents, reason: "Validate rent with comparable listings before advancing." },
    { key: "repairs", label: "Rehabilitation", pass: input.repairsCents <= input.maxRepairsCents, reason: "Get repair estimates before treating this as qualified." },
    { key: "cashFlow", label: "Estimated cash flow", pass: input.monthlyCashFlowCents >= input.minCashFlowCents, reason: "The projected monthly cash flow is below the buy-box floor." },
    { key: "dscr", label: "DSCR estimate", pass: input.dscr >= input.minDscr, reason: "The estimated debt coverage is below the configured floor." },
    { key: "market", label: "Target market", pass: input.targetMarkets.length === 0 || input.targetMarkets.includes(input.market), reason: "Add this market to the target list or keep researching it." },
    { key: "excludedMarket", label: "Excluded market", pass: !input.excludedMarkets.includes(input.market), reason: "This market is explicitly excluded from the buy box." },
    { key: "taxes", label: "Property taxes", pass: input.taxCeilingCents <= 0 || input.annualTaxesCents <= input.taxCeilingCents, reason: "Verify the tax history and reassessment risk." },
    { key: "insurance", label: "Insurance", pass: input.insuranceCeilingCents <= 0 || input.insuranceCents <= input.insuranceCeilingCents, reason: "Obtain an insurance quote before making an offer." },
  ];
  const score = Math.round((checks.filter((check) => check.pass).length / checks.length) * 100);
  return { score, checks: checks.map((check) => ({ ...check, result: check.pass ? "pass" : "review" })), failures: checks.filter((check) => !check.pass).map((check) => check.reason) };
}

export function calculatePropertyGovernor(input: {
  cashAfterClosingCents: number;
  emergencyReserveAfterCents: number;
  minimumEmergencyReserveCents: number;
  monthlyCashFlowAfterCents: number;
  minimumFreeCashFlowCents: number;
  cashUsedPercent: number;
  maximumCashUsedPercent: number;
  stressPasses: boolean;
}) {
  const reasons: string[] = [];
  if (input.cashAfterClosingCents < 0) reasons.push("Cash to close exceeds available eligible capital.");
  if (input.emergencyReserveAfterCents < input.minimumEmergencyReserveCents) reasons.push("Projected post-close emergency reserve falls below the required minimum.");
  if (input.monthlyCashFlowAfterCents < input.minimumFreeCashFlowCents) reasons.push("Projected monthly free cash flow is below the configured floor.");
  if (input.cashUsedPercent > input.maximumCashUsedPercent) reasons.push("The purchase uses too much liquid capital.");
  if (!input.stressPasses) reasons.push("The downside stress test does not pass.");
  return { status: reasons.length === 0 ? "approve_for_review" : "blocked", reasons, aiOverrideAllowed: false };
}

export function calculateStressScenario(input: {
  baselineMonthlyCashFlowCents: number;
  baselineEmergencyReserveCents: number;
  monthlyIncomeCents: number;
  monthlyRentCents: number;
  monthlyExpensesCents: number;
  rentChange: number;
  vacancyMonths: number;
  repairCents: number;
  insuranceChange: number;
  incomeChange: number;
}) {
  const adjustedIncome = input.monthlyIncomeCents * (1 - input.incomeChange);
  const adjustedRent = input.monthlyRentCents * (1 - input.rentChange) * Math.max(0, 1 - input.vacancyMonths / 12);
  const adjustedExpenses = input.monthlyExpensesCents + input.repairCents / 12;
  const monthlyCashFlowCents = Math.round(adjustedIncome + adjustedRent - adjustedExpenses * (1 + input.insuranceChange));
  const emergencyReserveRemainingCents = Math.round(input.baselineEmergencyReserveCents - input.repairCents - Math.max(0, -monthlyCashFlowCents) * 3);
  const monthsUntilLiquidityBreach = monthlyCashFlowCents >= 0 ? null : Number((Math.max(0, emergencyReserveRemainingCents / Math.abs(monthlyCashFlowCents))).toFixed(1));
  const result = emergencyReserveRemainingCents >= 0 && monthlyCashFlowCents >= -Math.round(input.monthlyExpensesCents * 0.25) ? "pass" : emergencyReserveRemainingCents >= 0 ? "review" : "fail";
  return { monthlyCashFlowCents, emergencyReserveRemainingCents, monthsUntilLiquidityBreach, result };
}