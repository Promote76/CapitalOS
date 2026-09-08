import assert from "node:assert/strict";
import test from "node:test";
import {
  buildVariableCashFlowForecast,
  calculateHouseholdBudgetConstraints,
  calculateVariableIncomeProfile,
  calculateVehicleAffordability,
} from "./variable-income.ts";

const events = [
  { incomeDate: "2026-04-15", amount: "3000.00", verificationStatus: "verified" },
  { incomeDate: "2026-05-15", amount: "3750.00", verificationStatus: "verified" },
  { incomeDate: "2026-06-15", amount: "4500.00", verificationStatus: "verified" },
  { incomeDate: "2026-07-15", amount: "3000.00", verificationStatus: "verified" },
  { incomeDate: "2026-08-15", amount: "3750.00", verificationStatus: "verified" },
  { incomeDate: "2026-09-05", amount: "4500.00", verificationStatus: "verified" },
  { incomeDate: "2026-09-06", amount: "9000.00", verificationStatus: "projected" },
];

test("variable income profile uses verified events only and derives floor/base/strong", () => {
  const profile = calculateVariableIncomeProfile(events, "2026-09-07");
  assert.equal(profile.currentMonthVerifiedIncomeCents, 450000);
  assert.equal(profile.incomeFloorCents, 300000);
  assert.equal(profile.baseIncomeCents, 375000);
  assert.equal(profile.strongMonthIncomeCents, 450000);
  assert.equal(profile.confidenceStatus, "SUPPORTED");
});

test("insufficient verified history never fabricates an income floor", () => {
  const profile = calculateVariableIncomeProfile([{ incomeDate: "2026-09-01", amount: "4500.00", verificationStatus: "verified" }], "2026-09-07");
  assert.equal(profile.incomeFloorCents, 0);
  assert.equal(profile.confidenceStatus, "INSUFFICIENT_HISTORY");
});

test("household constraints keep capital surplus separate from operating spend", () => {
  const result = calculateHouseholdBudgetConstraints({
    incomeFloor: "3000.00",
    baseIncome: "3750.00",
    strongIncome: "4500.00",
    mandatoryObligations: "900.00",
    essentialVariableCosts: "700.00",
    reserveRequirements: "200.00",
    discretionarySpending: "300.00",
    currentCash: "1600.00",
    cashBuffer: "600.00",
    capitalGoals: "400.00",
    next30DayObligations: "900.00",
  });
  assert.equal(result.operatingBudgetCap, "1200.00");
  assert.equal(result.capitalSurplusAtFloor, "900.00");
});

test("vehicle scenario includes full ownership cost and detects goal impact", () => {
  const result = calculateVehicleAffordability({
    incomeFloor: "3000.00",
    currentOperatingBudget: "1800.00",
    currentCapitalSurplus: "500.00",
    monthlyPayment: "400.00",
    insurance: "300.00",
    fuel: "150.00",
    maintenanceReserve: "75.00",
    registrationReserve: "0.00",
    parkingTolls: "0.00",
    otherMonthlyCost: "0.00",
    currentVehicleOperatingCost: "0.00",
    cashBuffer: "0.00",
    emergencyReserveGap: "0.00",
    duplexContribution: "0.00",
  });
  assert.equal(result.totalMonthlyCost, "925.00");
  assert.equal(result.status, "CAPITAL_GOAL_IMPACT");
  assert.equal(result.missingInputs.length, 0);
});

test("cash-flow forecast fails closed into shortfall risk below buffer", () => {
  const result = buildVariableCashFlowForecast({
    scenarioIncome: "3000.00",
    openingCash: "1600.00",
    obligations: "900.00",
    essentialSpending: "700.00",
    reserveContributions: "200.00",
    approvedCapitalContributions: "0.00",
    cashBuffer: "600.00",
    days: 30,
  });
  assert.equal(result.endingProjectedCash, "2800.00");
  assert.equal(result.status, "HEALTHY");
});

test("forecast emits all five windows and fails closed without planning inputs", () => {
  for (const days of [7, 14, 30, 60, 90]) {
    const result = buildVariableCashFlowForecast({ days, requiredInputsComplete: false });
    assert.equal(result.status, "INSUFFICIENT_DATA");
    assert.equal(result.endingCash, "NOT_CALCULATED");
    assert.equal(result.pressure, "INCOMPLETE");
    assert.match(result.explanation, /NOT CALCULATED/);
  }
});

test("vehicle scenario never turns missing recurring costs into meaningful zeroes", () => {
  const result = calculateVehicleAffordability({
    incomeFloor: "3000.00",
    currentOperatingBudget: "1800.00",
    currentCapitalSurplus: "500.00",
    monthlyPayment: "400.00",
    insurance: "300.00",
    fuel: "150.00",
    maintenanceReserve: "75.00",
  });
  assert.equal(result.status, "INSUFFICIENT_DATA");
  assert.equal(result.totalMonthlyCost, "NOT_CALCULATED");
  assert.equal(result.newFloorSurplus, "NOT_CALCULATED");
  assert.ok(result.missingInputs.includes("registrationReserve"));
});

test("vehicle scenario fails closed when emergency reserve evidence is unavailable", () => {
  const result = calculateVehicleAffordability({
    incomeFloor: "3000.00",
    currentOperatingBudget: "1800.00",
    currentCapitalSurplus: "1200.00",
    monthlyPayment: "400.00",
    insurance: "150.00",
    fuel: "100.00",
    maintenanceReserve: "50.00",
    registrationReserve: "25.00",
    parkingTolls: "0.00",
    otherMonthlyCost: "0.00",
    currentVehicleOperatingCost: "0.00",
    cashBuffer: "800.00",
    emergencyReserveGap: "NOT_CALCULATED",
    duplexContribution: "400.00",
  });
  assert.equal(result.status, "INSUFFICIENT_DATA");
  assert.equal(result.emergencyReserveImpact, "NOT_CALCULATED");
  assert.ok(result.missingInputs.includes("emergency reserve gap"));
});

test("forecast exposes every input exactly once in its calculation rows", () => {
  const result = buildVariableCashFlowForecast({
    scenario: "FLOOR",
    scenarioIncome: "700.00",
    openingCash: "1600.00",
    obligations: "300.00",
    essentialSpending: "200.00",
    reserveContributions: "100.00",
    discretionaryAllowance: "50.00",
    approvedCapitalContributions: "75.00",
    cashBuffer: "600.00",
    days: 7,
  });
  assert.deepEqual(result.calculationRows.map((row) => row.key), [
    "opening_cash", "scenario_income", "mandatory_outflows", "essential_allowance",
    "reserve_funding", "discretionary_allowance", "capital_contributions",
  ]);
  assert.equal(result.endingCash, "1575.00");
});

test("incomplete forecast names readiness evidence even when numeric placeholders are supplied", () => {
  const result = buildVariableCashFlowForecast({
    scenario: "FLOOR",
    scenarioIncome: "0.00",
    openingCash: "0.00",
    obligations: "0.00",
    essentialSpending: "0.00",
    reserveContributions: "0.00",
    approvedCapitalContributions: "0.00",
    days: 7,
    requiredInputsComplete: false,
    missingEvidence: ["approved budget plan", "adequate verified income history", "configured emergency reserve"],
  });
  assert.deepEqual(result.missingInputs, ["approved budget plan", "adequate verified income history", "configured emergency reserve"]);
  assert.equal(result.calculationRows.length, 7);
  assert.match(result.explanation, /approved budget plan/);
});

test("money regression values remain exact cents through constraints and vehicle output", () => {
  const constraints = calculateHouseholdBudgetConstraints({
    incomeFloor: "1735.00", baseIncome: "1735.00", strongIncome: "1735.00",
    mandatoryObligations: "78.00", essentialVariableCosts: "900.00", reserveRequirements: "0.00",
    discretionarySpending: "0.00", currentCash: "1735.00", cashBuffer: "0.00",
    capitalGoals: "0.00", next30DayObligations: "900.00",
  });
  assert.equal(constraints.mandatoryObligations, "78.00");
  assert.equal(constraints.essentialVariableCosts, "900.00");
  assert.equal(constraints.currentCash, "1735.00");
  assert.equal(constraints.cashBuffer, "0.00");
  const vehicle = calculateVehicleAffordability({
    incomeFloor: "1735.00", currentOperatingBudget: "978.00", currentCapitalSurplus: "757.00",
    vehiclePrice: "900.00", downPayment: "78.00", estimatedApr: "0", loanTermMonths: 1,
    insurance: "0.00", fuel: "0.00", maintenanceReserve: "0.00", registrationReserve: "0.00",
    parkingTolls: "0.00", otherMonthlyCost: "0.00",
    currentVehicleOperatingCost: "0.00", cashBuffer: "0.00", emergencyReserveGap: "0.00", duplexContribution: "0.00",
  });
  assert.equal(vehicle.loanAmount, "822.00");
  assert.equal(vehicle.monthlyPayment, "822.00");
});