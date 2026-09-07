export const taxLienSourceKinds = [
  "official_county",
  "official_state",
  "licensed_provider",
  "user_supplied",
  "model_inference",
] as const;

export const taxLienRedemptionStatuses = ["unknown", "open", "closed", "disputed"] as const;
export const taxLienAvailabilityStatuses = ["unknown", "stale", "verified", "unavailable"] as const;

export type TaxLienAssessment = {
  reconciliationStatus: "reconciled" | "unresolved" | "mismatch";
  reserveStatus: "within_floor" | "breaches_floor" | "unknown";
  reviewStatus: "research" | "review_required" | "blocked";
  hardStops: string[];
};

function normalized(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function assessTaxLienCandidate(input: {
  sourceKind: string;
  parcelId: string;
  officialParcelId?: string | null;
  certificateNumber: string;
  officialCertificateNumber?: string | null;
  redemptionStatus: string;
  liveAvailability: string;
  sourceFreshness: string;
  estimatedTotalExposureCents: number;
  householdSafeToDeployCents: number;
  requiredReserveFloorCents: number;
  estimatedPropertyValueCents: number;
}): TaxLienAssessment {
  const hardStops: string[] = [];
  const parcel = normalized(input.parcelId);
  const officialParcel = normalized(input.officialParcelId);
  const certificate = normalized(input.certificateNumber);
  const officialCertificate = normalized(input.officialCertificateNumber);
  const parcelMatches = Boolean(parcel && officialParcel && parcel === officialParcel);
  const certificateMatches = Boolean(certificate && officialCertificate && certificate === officialCertificate);
  const parcelConflict = Boolean(officialParcel && parcel && parcel !== officialParcel);
  const certificateConflict = Boolean(officialCertificate && certificate && certificate !== officialCertificate);
  const reconciliationStatus = parcelConflict || certificateConflict
    ? "mismatch"
    : parcelMatches && certificateMatches
      ? "reconciled"
      : "unresolved";

  if (!["official_county", "official_state"].includes(input.sourceKind)) {
    hardStops.push("Official county or state source is not recorded.");
  }
  if (reconciliationStatus === "mismatch") {
    hardStops.push("Parcel or certificate identity conflicts with the recorded official source.");
  } else if (reconciliationStatus !== "reconciled") {
    hardStops.push("Parcel and certificate identities have not been reconciled to an official source.");
  }
  if (input.redemptionStatus === "unknown") {
    hardStops.push("Redemption status is unknown.");
  } else if (input.redemptionStatus !== "closed") {
    hardStops.push("Redemption remains open or disputed; no purchase assumption is permitted.");
  }
  if (input.liveAvailability !== "verified") {
    hardStops.push("Live certificate availability is not verified.");
  }
  if (input.sourceFreshness !== "current") {
    hardStops.push("Source freshness is stale or unknown.");
  }
  if (!Number.isFinite(input.estimatedPropertyValueCents) || input.estimatedPropertyValueCents <= 0) {
    hardStops.push("Property value is unavailable.");
  }

  const requiredCapital = input.estimatedTotalExposureCents + input.requiredReserveFloorCents;
  const reserveStatus = Number.isFinite(input.householdSafeToDeployCents) && Number.isFinite(input.estimatedTotalExposureCents)
    ? input.householdSafeToDeployCents >= requiredCapital ? "within_floor" : "breaches_floor"
    : "unknown";
  if (reserveStatus === "breaches_floor") {
    hardStops.push("Estimated exposure would breach the household reserve floor.");
  } else if (reserveStatus === "unknown") {
    hardStops.push("Household reserve capacity is unknown.");
  }

  return {
    reconciliationStatus,
    reserveStatus,
    reviewStatus: hardStops.length ? "blocked" : "review_required",
    hardStops,
  };
}

export function realEstateGuardrails() {
  return [
    "Deterministic Capital OS underwriting, buy-box hard stops, stress tests, and the Property Capital Governor remain authoritative.",
    "Tax-lien records are research candidates only; no bidding, purchase, deed filing, lender application, or capital commitment is available.",
    "Official county or state sources take priority; provider or model output cannot repair unresolved parcel, certificate, redemption, or availability evidence.",
    "A clean assessment is still human review required, not an approval or qualification.",
  ];
}