import assert from "node:assert/strict";
import test from "node:test";
import { assessTaxLienCandidate } from "./real-estate-intelligence";

const baseCandidate = {
  sourceKind: "official_county",
  parcelId: "FL-123-ABC",
  officialParcelId: "FL 123 ABC",
  certificateNumber: "CERT-77",
  officialCertificateNumber: "CERT 77",
  redemptionStatus: "closed",
  liveAvailability: "verified",
  sourceFreshness: "current",
  estimatedTotalExposureCents: 12_000_00,
  householdSafeToDeployCents: 100_000_00,
  requiredReserveFloorCents: 50_000_00,
  estimatedPropertyValueCents: 250_000_00,
};

test("a fully reconciled current Florida record remains human review required", () => {
  const assessment = assessTaxLienCandidate(baseCandidate);
  assert.deepEqual(assessment, {
    reconciliationStatus: "reconciled",
    reserveStatus: "within_floor",
    reviewStatus: "review_required",
    hardStops: [],
  });
});

test("missing official identity, redemption, and freshness fail closed", () => {
  const assessment = assessTaxLienCandidate({
    ...baseCandidate,
    sourceKind: "user_supplied",
    officialParcelId: undefined,
    officialCertificateNumber: undefined,
    redemptionStatus: "unknown",
    liveAvailability: "unknown",
    sourceFreshness: "unknown",
  });
  assert.equal(assessment.reviewStatus, "blocked");
  assert.equal(assessment.reconciliationStatus, "unresolved");
  assert.equal(assessment.reserveStatus, "within_floor");
  assert.equal(assessment.hardStops.length, 5);
});

test("conflicting parcel or certificate identity is a hard stop", () => {
  const assessment = assessTaxLienCandidate({
    ...baseCandidate,
    officialCertificateNumber: "CERT-99",
  });
  assert.equal(assessment.reconciliationStatus, "mismatch");
  assert.equal(assessment.reviewStatus, "blocked");
  assert.match(assessment.hardStops.join(" "), /conflicts/);
});

test("reserve breach never becomes an acquisition recommendation", () => {
  const assessment = assessTaxLienCandidate({
    ...baseCandidate,
    householdSafeToDeployCents: 20_000_00,
    requiredReserveFloorCents: 15_000_00,
    estimatedTotalExposureCents: 10_000_00,
  });
  assert.equal(assessment.reserveStatus, "breaches_floor");
  assert.equal(assessment.reviewStatus, "blocked");
  assert.match(assessment.hardStops.join(" "), /reserve floor/);
});