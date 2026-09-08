import assert from "node:assert/strict";
import test from "node:test";
import { vehicleResponse } from "./variable-income";

test("refetched incomplete vehicle scenario preserves planning evidence reasons", () => {
  const row = {
    id: "00000000-0000-4000-8000-000000000001",
    householdId: "00000000-0000-4000-8000-000000000002",
    name: "Planning evidence missing",
    vehiclePrice: "25000.00",
    downPayment: "5000.00",
    loanAmount: "20000.00",
    estimatedApr: "6.0000",
    loanTermMonths: "60",
    monthlyPayment: "386.66",
    paymentSource: "DERIVED_FROM_APR_TERM",
    insurance: "150.00",
    fuel: "180.00",
    maintenanceReserve: "75.00",
    registrationReserve: "25.00",
    parkingTolls: "0.00",
    otherMonthlyCost: "0.00",
    totalMonthlyCost: "816.66",
    currentOperatingCost: "0.00",
    newOperatingCost: null,
    newOperatingBudget: null,
    newFloorSurplus: null,
    capitalSurplusImpact: null,
    missingInputs: ["verified income floor", "current operating budget", "current capital surplus", "emergency reserve gap"],
    cashBufferImpact: null,
    emergencyReserveImpact: null,
    duplexContributionImpact: null,
    affordabilityStatus: "INSUFFICIENT_DATA",
    notes: null,
    active: true,
    createdBy: "00000000-0000-4000-8000-000000000003",
    createdAt: new Date("2026-09-08T00:00:00.000Z"),
    updatedAt: new Date("2026-09-08T00:00:00.000Z"),
  } satisfies Parameters<typeof vehicleResponse>[0];

  const result = vehicleResponse(row);
  assert.deepEqual(result.missingInputs, ["verified income floor", "current operating budget", "current capital surplus", "emergency reserve gap"]);
  assert.equal(result.newOperatingBudget, "NOT_CALCULATED");
  assert.match(result.explanation, /verified income floor/);
});