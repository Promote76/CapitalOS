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
  });
  assert.equal(result.totalMonthlyCost, "925.00");
  assert.equal(result.status, "CAPITAL_GOAL_IMPACT");
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