import assert from "node:assert/strict";
import test from "node:test";
import { assertRc1ObservabilityReadiness } from "./lib/rc1-observability-readiness.mjs";

function createEvidence(approvedDestinationConfigured, externalDelivery) {
  return {
    readiness: {
      resultWithoutApprovedDestination: "OBSERVABILITY_NOT_READY",
    },
    observability: {
      approvedDestinationConfigured,
      externalDelivery,
    },
  };
}

function createManifest(externalDelivery) {
  return {
    criticalFlows: {
      applicationReadiness: "CERTIFIED_BLOCKED_NO_APPROVED_DESTINATION",
      observabilityIncidentDelivery: externalDelivery,
    },
  };
}

test("accepts a configured destination when external delivery has not been run", () => {
  assert.doesNotThrow(() =>
    assertRc1ObservabilityReadiness(
      createManifest("NOT_RUN"),
      createEvidence(true, "NOT_RUN"),
    ),
  );
});

test("accepts a missing destination only when delivery and readiness are blocked", () => {
  assert.doesNotThrow(() =>
    assertRc1ObservabilityReadiness(
      createManifest("BLOCKED_NO_APPROVED_DESTINATION"),
      createEvidence(false, "BLOCKED_NO_APPROVED_DESTINATION"),
    ),
  );
});

test("rejects mismatched destination and external-delivery states", () => {
  assert.throws(
    () =>
      assertRc1ObservabilityReadiness(
        createManifest("BLOCKED_NO_APPROVED_DESTINATION"),
        createEvidence(true, "BLOCKED_NO_APPROVED_DESTINATION"),
      ),
    /Missing approved observability destination must remain an explicit blocker/,
  );
  assert.throws(
    () =>
      assertRc1ObservabilityReadiness(
        createManifest("NOT_RUN"),
        createEvidence(false, "NOT_RUN"),
      ),
    /Missing approved observability destination must remain an explicit blocker/,
  );
});

test("rejects missing or non-blocking readiness evidence", () => {
  const blockedManifest = createManifest("NOT_RUN");
  const configuredEvidence = createEvidence(true, "NOT_RUN");

  assert.throws(
    () =>
      assertRc1ObservabilityReadiness(blockedManifest, {
        ...configuredEvidence,
        readiness: undefined,
      }),
    /Missing approved observability destination must remain an explicit blocker/,
  );
  assert.throws(
    () =>
      assertRc1ObservabilityReadiness(blockedManifest, {
        ...configuredEvidence,
        readiness: { resultWithoutApprovedDestination: "READY" },
      }),
    /Missing approved observability destination must remain an explicit blocker/,
  );
  assert.throws(
    () =>
      assertRc1ObservabilityReadiness(
        {
          criticalFlows: {
            ...blockedManifest.criticalFlows,
            applicationReadiness: "IMPLEMENTATION_VERIFIED",
          },
        },
        configuredEvidence,
      ),
    /Missing approved observability destination must remain an explicit blocker/,
  );
});

test("rejects a manifest delivery status that differs from its evidence", () => {
  assert.throws(
    () =>
      assertRc1ObservabilityReadiness(
        createManifest("BLOCKED_NO_APPROVED_DESTINATION"),
        createEvidence(true, "NOT_RUN"),
      ),
    /Missing approved observability destination must remain an explicit blocker/,
  );
});