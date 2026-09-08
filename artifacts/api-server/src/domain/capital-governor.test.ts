import test from "node:test";
import assert from "node:assert/strict";
import { calculateCapitalGovernorV2, hasUnresolvedUploadedStatement } from "./capital-governor";

test("rejected uploaded statements are terminal while unresolved evidence blocks readiness", () => {
  assert.equal(hasUnresolvedUploadedStatement("REJECTED", "document_evidence_rejected", true), false);
  assert.equal(hasUnresolvedUploadedStatement("NEEDS_REVIEW", null, true), true);
  assert.equal(hasUnresolvedUploadedStatement("NEEDS_REVIEW", "document_evidence_pending_review", false), true);
  assert.equal(hasUnresolvedUploadedStatement("VERIFIED", "document_evidence_verified", false), false);
});

function input(overrides: Partial<Parameters<typeof calculateCapitalGovernorV2>[0]> = {}) {
  return {
    asOf: "2026-09-07",
    policyVersion: "2",
    householdCashCents: 100_000,
    availableBankCashCents: 100_000,
    unclassifiedCashCents: 0,
    pendingCashCents: 0,
    unreconciledCashCents: 0,
    businessCashCents: 50_000,
    next30DayObligationsCents: 10_000,
    essentialMonthlyCents: 8_000,
    operatingBufferCents: 5_000,
    reserveGaps: [
      { bucket: "EMERGENCY_RESERVE" as const, amountCents: 10_000, provenance: ["emergency_reserves"] },
      { bucket: "VEHICLE_RESERVE" as const, amountCents: 5_000, provenance: ["vehicle_policy"] },
    ],
    protectedCommitmentsCents: 2_000,
    encumbrancesCents: 3_000,
    forecastShortfallCents: 0,
    capitalGovernorLocked: false,
    dataReadiness: "READY" as const,
    freshnessDays: 1,
    duplicateSubtractionDetected: false,
    obligationsAreDisjoint: true,
    incomeFloorCents: 20_000,
    baseIncomeCents: 30_000,
    strongIncomeCents: 50_000,
    floorOperatingSurplusCents: 2_000,
    baseOperatingSurplusCents: 12_000,
    strongOperatingSurplusCents: 32_000,
    buckets: [{
      key: "DUPLEX_RESERVE",
      label: "Duplex Reserve",
      currentCents: 40_000,
      targetCents: 100_000,
      protected: true,
      liquid: false,
      physicalAccountIds: [],
      provenance: ["treasury_bucket:duplex"],
    }],
    maximumInvestmentPercent: 15,
    ...overrides,
  };
}

test("account cash is not safe-to-deploy", () => {
  const result = calculateCapitalGovernorV2(input());
  assert.equal(result.safeToDeploy, "650.00");
  assert.equal(result.rawSafeToDeploy, "650.00");
  assert.equal(result.components.find((component) => component.key === "eligible_household_cash")?.amount, "1000.00");
});

test("business cash is excluded and the exclusion is explainable", () => {
  const result = calculateCapitalGovernorV2(input({ businessCashCents: 1_000_000 }));
  assert.ok(result.reasonCodes.includes("BUSINESS_CASH_EXCLUDED"));
  assert.equal(result.safeToDeploy, "650.00");
  assert.equal(result.controls.businessCashExcluded, true);
  assert.equal(result.components.find((component) => component.key === "business_cash")?.subtractionGroup, "OUTSIDE_HOUSEHOLD_CALCULATION");
});

test("protected Duplex Reserve remains locked", () => {
  const result = calculateCapitalGovernorV2(input());
  assert.equal(result.controls.protectedDuplexReserveLocked, true);
  assert.equal(result.controls.moneyMovementAuthorized, false);
  assert.equal(result.controls.microLiveAuthorized, false);
});

test("reserve gaps are deducted once and allocated in waterfall order", () => {
  const result = calculateCapitalGovernorV2(input({ reserveGaps: [{ bucket: "EMERGENCY_RESERVE", amountCents: 20_000, provenance: ["emergency"] }] }));
  assert.equal(result.safeToDeploy, "600.00");
  assert.deepEqual(result.waterfall.allocations.map((row) => [row.bucket, row.amount]), [["EMERGENCY_RESERVE", "200.00"], ["INVESTMENT_CAPITAL", "150.00"]]);
});

test("forecast shortfall blocks deployment", () => {
  const result = calculateCapitalGovernorV2(input({ forecastShortfallCents: 1 }));
  assert.equal(result.status, "SHORTFALL_RISK");
  assert.equal(result.safeToDeploy, "0.00");
  assert.ok(result.reasonCodes.includes("DATA_READY") === false);
  assert.equal(result.rawSafeToDeploy, "650.00");
  assert.equal(result.components.find((component) => component.key === "forecast_shortfall")?.subtractionGroup, "DEPLOYMENT_GATES_NOT_SUBTRACTED");
});

test("stale or incomplete evidence fails closed", () => {
  const stale = calculateCapitalGovernorV2(input({ dataReadiness: "STALE" }));
  assert.equal(stale.status, "CONSERVATIVE");
  assert.ok(stale.reasonCodes.includes("DATA_STALE"));
  const incomplete = calculateCapitalGovernorV2(input({ dataReadiness: "INCOMPLETE_DATA" }));
  assert.equal(incomplete.status, "INCOMPLETE_DATA");
  assert.equal(incomplete.safeToDeploy, "NOT_CALCULATED");
  assert.equal(incomplete.dataReadiness.status, "BLOCKED_DATA_INCOMPLETE");
  assert.equal(incomplete.calculation.amountCalculated, false);
});

test("duplicate subtraction risk never produces a deployable result", () => {
  const result = calculateCapitalGovernorV2(input({ duplicateSubtractionDetected: true }));
  assert.equal(result.status, "INCOMPLETE_DATA");
  assert.equal(result.safeToDeploy, "NOT_CALCULATED");
  assert.ok(result.reasonCodes.includes("DUPLICATE_SUBTRACTION_RISK"));
});

test("household capital surplus is separate from Safe-to-Deploy", () => {
  const result = calculateCapitalGovernorV2(input({ floorOperatingSurplusCents: 80_000, baseOperatingSurplusCents: 90_000, strongOperatingSurplusCents: 100_000 }));
  assert.equal(result.householdCapitalSurplus.floor, "800.00");
  assert.equal(result.safeToDeploy, "650.00");
});

test("floor, base, and strong scenarios retain protective controls", () => {
  const result = calculateCapitalGovernorV2(input({ floorOperatingSurplusCents: -1_00 }));
  assert.equal(result.waterfall.scenarioBehavior.floor, "PROTECT_ONLY");
  assert.equal(result.waterfall.scenarioBehavior.base, "BALANCED");
  assert.equal(result.waterfall.scenarioBehavior.strong, "SURPLUS_AFTER_RESERVES");
});