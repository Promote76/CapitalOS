import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateBuyBoxMatch,
  calculateCashToClose,
  calculateDealAnalysis,
  calculatePropertyGovernor,
  calculatePropertyReadiness,
  calculateStressScenario,
  reviewPropertyIntelligence,
} from "./property-underwriting.ts";

test("deal analysis stays in cents and separates owner housing from rental cash flow", () => {
  const result = calculateDealAnalysis({
    purchasePriceCents: 40000000,
    downPaymentPercent: 0.05,
    annualInterestRate: 0.07,
    termYears: 30,
    annualTaxesCents: 600000,
    monthlyInsuranceCents: 20000,
    monthlyHoaCents: 0,
    monthlyRentCents: 240000,
    rentalUnitCount: 1,
    totalUnitCount: 2,
    vacancyRate: 0.05,
    maintenanceRate: 0.05,
    managementRate: 0.08,
    monthlyUtilitiesCents: 0,
    monthlyRepairsCents: 10000,
    monthlyOtherExpenseCents: 0,
    monthlyMortgageInsuranceCents: 0,
  });
  assert.equal(result.downPaymentCents, 2000000);
  assert.ok(result.principalInterestCents > 0);
  assert.ok(result.ownerEffectiveHousingCostCents < result.monthlyHousingCostCents);
  assert.equal(Number.isInteger(result.monthlyCashFlowCents), true);
});

test("cash to close sums only non-negative integer cents", () => {
  assert.equal(calculateCashToClose({
    downPaymentCents: 100000,
    earnestMoneyCents: 5000,
    inspectionCents: 0,
    appraisalCents: 65000,
    loanFeesCents: 120000,
    originationFeesCents: -1,
    titleFeesCents: 180000,
    recordingFeesCents: 25000,
    prepaidTaxesCents: 50000,
    prepaidInsuranceCents: 50000,
    escrowsCents: 0,
    immediateRepairsCents: 200000,
    movingCostsCents: 0,
    initialReservesCents: 500000,
    emergencyBufferCents: 300000,
    otherClosingCostsCents: 0,
  }), 1595000);
});

test("buy box scoring shows transparent failures", () => {
  const result = calculateBuyBoxMatch({
    purchasePriceCents: 60000000,
    minPriceCents: 40000000,
    maxPriceCents: 56000000,
    bedroomsPerUnit: 2,
    minBedroomsPerUnit: 2,
    estimatedRentCents: 180000,
    minEstimatedRentCents: 220000,
    repairsCents: 1000000,
    maxRepairsCents: 3500000,
    monthlyCashFlowCents: -10000,
    minCashFlowCents: 0,
    dscr: 0.9,
    minDscr: 1.15,
    market: "Southside",
    targetMarkets: ["Northside"],
    excludedMarkets: [],
    annualTaxesCents: 900000,
    taxCeilingCents: 900000,
    insuranceCents: 300000,
    insuranceCeilingCents: 300000,
  });
  assert.ok(result.score <= 50);
  assert.ok(result.failures.length >= 4);
});

test("governor blocks a liquidity floor breach and cannot be overridden by AI", () => {
  const result = calculatePropertyGovernor({
    cashAfterClosingCents: -1,
    emergencyReserveAfterCents: 200000,
    minimumEmergencyReserveCents: 300000,
    monthlyCashFlowAfterCents: -100,
    minimumFreeCashFlowCents: 0,
    cashUsedPercent: 81,
    maximumCashUsedPercent: 70,
    stressPasses: false,
  });
  assert.equal(result.status, "blocked");
  assert.equal(result.aiOverrideAllowed, false);
  assert.equal(result.reasons.length, 5);
});

test("readiness uses weighted factors and names the weakest next action", () => {
  const result = calculatePropertyReadiness([
    { key: "reserve", label: "Reserve", score: 80, weight: 2, reason: "Keep reserve pace." },
    { key: "documents", label: "Documents", score: 30, weight: 1, reason: "Collect income documents." },
  ]);
  assert.equal(result.score, 63);
  assert.equal(result.status, "Search Ready");
  assert.equal(result.nextAction, "Collect income documents.");
});

test("downside stress test distinguishes review from failure", () => {
  const result = calculateStressScenario({
    baselineMonthlyCashFlowCents: 100000,
    baselineEmergencyReserveCents: 1000000,
    monthlyIncomeCents: 800000,
    monthlyRentCents: 240000,
    monthlyExpensesCents: 500000,
    rentChange: 0.2,
    vacancyMonths: 2,
    repairCents: 500000,
    insuranceChange: 0.15,
    incomeChange: 0.1,
  });
  assert.ok(["pass", "review", "fail"].includes(result.result));
  assert.equal(Number.isInteger(result.monthlyCashFlowCents), true);
});

test("property intelligence keeps stale or unverified evidence subordinate to deterministic buy-box hard stops", () => {
  const result = reviewPropertyIntelligence({
    sourceKind: "third_party_property",
    sourcePriority: 8,
    dataFreshness: "unknown",
    liveAvailability: "unverified",
    parcelReconciliation: "unknown",
    buyBoxFailures: ["The projected monthly cash flow is below the buy-box floor."],
  });
  assert.equal(result.deterministicBuyBoxAuthoritative, true);
  assert.equal(result.purchaseAuthority, false);
  assert.equal(result.hardStops.length, 4);
  assert.ok(result.hardStops.includes("The projected monthly cash flow is below the buy-box floor."));
});