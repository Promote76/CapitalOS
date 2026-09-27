export function assertRc1ObservabilityReadiness(manifest, evidence) {
  const destinationConfigured = evidence.observability?.approvedDestinationConfigured;
  const externalDelivery = evidence.observability?.externalDelivery;
  const missingDestinationIsExplicitlyBlocked =
    evidence.readiness?.resultWithoutApprovedDestination === "OBSERVABILITY_NOT_READY" &&
    manifest.criticalFlows?.applicationReadiness === "CERTIFIED_BLOCKED_NO_APPROVED_DESTINATION";
  const externalDeliveryStatusIsTruthful =
    (destinationConfigured === false &&
      externalDelivery === "BLOCKED_NO_APPROVED_DESTINATION") ||
    (destinationConfigured === true && externalDelivery === "NOT_RUN");

  if (
    !missingDestinationIsExplicitlyBlocked ||
    !externalDeliveryStatusIsTruthful ||
    manifest.criticalFlows?.observabilityIncidentDelivery !== externalDelivery
  ) {
    throw new Error("Missing approved observability destination must remain an explicit blocker.");
  }
}