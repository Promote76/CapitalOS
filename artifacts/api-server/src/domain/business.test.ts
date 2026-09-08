import assert from "node:assert/strict";
import test from "node:test";
import { assertDistributionWithinReserve, calculateBusinessCapital } from "./business.ts";
import { isCompatibleInternalTruckingBusiness } from "../services/business.ts";

test("owner contributions and intercompany transfers are not business revenue", () => {
  const result = calculateBusinessCapital({
    revenue: [
      { amount: "5000.00", category: "operating" },
      { amount: "1000.00", category: "owner_contribution" },
      { amount: "250.00", category: "intercompany_transfer" },
    ],
    expenses: [],
    distributions: [],
    businessCash: "5000.00",
    reserveTarget: "0.00",
    taxReserve: "0.00",
    safetyBuffer: "0.00",
    ownershipPercentage: "100",
  });
  assert.equal(result.revenueCents, 500_000);
});

test("owner distributions are not ordinary business expenses", () => {
  const result = calculateBusinessCapital({
    revenue: [{ amount: "5000.00" }],
    expenses: [{ amount: "1000.00", classification: "business" }, { amount: "700.00", classification: "owner_distribution" }],
    distributions: [{ amount: "700.00", status: "proposed" }],
    businessCash: "5000.00",
    reserveTarget: "0.00",
    taxReserve: "0.00",
    safetyBuffer: "0.00",
    ownershipPercentage: "100",
  });
  assert.equal(result.expenseCents, 100_000);
  assert.equal(result.distributionCents, 70_000);
});

test("reserve floors prevent excessive distributions", () => {
  const result = calculateBusinessCapital({
    revenue: [],
    expenses: [],
    distributions: [],
    businessCash: "10000.00",
    reserveTarget: "6000.00",
    taxReserve: "1000.00",
    safetyBuffer: "500.00",
    ownershipPercentage: "100",
  });
  assert.equal(result.safeToDistributeCents, 250_000);
  assert.throws(() => assertDistributionWithinReserve("2500.01", result.safeToDistributeCents));
});

test("ownership percentage affects equity without adding revenue or household cash", () => {
  const result = calculateBusinessCapital({
    revenue: [],
    expenses: [],
    distributions: [],
    businessCash: "10000.00",
    businessLiabilities: "2000.00",
    reserveTarget: "0.00",
    taxReserve: "0.00",
    safetyBuffer: "0.00",
    ownershipPercentage: "37.5",
  });
  assert.equal(result.ownedEquityCents, 300_000);
  assert.equal(result.revenueCents, 0);
});

test("compatible trucking matching requires both trucking context and contractor evidence", () => {
  const base = {
    legalName: "Reviewed operation",
    entityType: "independent_contractor",
    notes: null,
  };
  assert.equal(isCompatibleInternalTruckingBusiness({ ...base, displayName: "Stevens Transport", industry: "Trucking" }), true);
  assert.equal(isCompatibleInternalTruckingBusiness({ ...base, displayName: "Stevens Transport", industry: "Logistics", notes: "Independent contractor" }), true);
  assert.equal(isCompatibleInternalTruckingBusiness({ ...base, entityType: "corporation", displayName: "Family consulting", industry: "Consulting", notes: "Independent contractor" }), false);
  assert.equal(isCompatibleInternalTruckingBusiness({ ...base, entityType: "corporation", displayName: "Trucking company", industry: "Freight", notes: "Corporation" }), false);
});