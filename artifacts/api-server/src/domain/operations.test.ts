import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertSafeAutomationAction, calculateOperationsHealth, classifyOperationsFailure, operationsBackoffMs, isSafeOperationsJobKind } from "./operations.ts";
import {
  AUDIT_ARCHIVE_DESTINATION,
  AUDIT_RETENTION_DAYS,
  RELIABILITY_ALERTS,
  RELIABILITY_ALERT_OWNER,
  RELIABILITY_ALERT_THRESHOLDS,
  RELIABILITY_METRICS,
  readReliabilityConfiguration,
  reliabilityEvent,
} from "./reliability.ts";

describe("operations safety", () => {
  it("classifies failures and bounds retry backoff", () => {
    assert.equal(classifyOperationsFailure(new Error("network timeout")), "TRANSIENT");
    assert.equal(classifyOperationsFailure(new Error("invalid payload")), "PERMANENT");
    assert.equal(classifyOperationsFailure(new Error("opaque")), "UNKNOWN");
    assert.equal(operationsBackoffMs(20), 60_000);
  });
  it("allows only advisory worker kinds", () => {
    assert.equal(isSafeOperationsJobKind("SAFE_AUTOMATION"), true);
    assert.equal(isSafeOperationsJobKind("MICRO_LIVE_ORDER"), false);
  });
  it("blocks automation actions that would control capital or security", () => {
    assert.throws(() => assertSafeAutomationAction("transfer_money"), /not permitted/);
    assert.throws(() => assertSafeAutomationAction("enable_live_trading"), /not permitted/);
  });

  it("allows safe prepare-only automation actions", () => {
    assert.doesNotThrow(() => assertSafeAutomationAction("create_task"));
    assert.doesNotThrow(() => assertSafeAutomationAction("send_notification"));
  });

  it("keeps operations health bounded", () => {
    assert.equal(
      calculateOperationsHealth({
        overdueTasks: 0,
        pendingApprovals: 2,
        criticalAlerts: 0,
        automationFailures: 0,
      }),
      96,
    );
    assert.equal(
      calculateOperationsHealth({
        overdueTasks: 99,
        pendingApprovals: 99,
        criticalAlerts: 99,
        automationFailures: 99,
      }),
      0,
    );
  });

  it("defines provider-neutral reliability signals with fail-closed responses", () => {
    assert.ok(RELIABILITY_METRICS.includes("operations.job_dead_lettered"));
    const alert = RELIABILITY_ALERTS.find((item) => item.metric === "micro_live.reconciliation_failure");
    assert.equal(alert?.severity, "CRITICAL");
    assert.match(alert?.response ?? "", /stop/i);
    const event = reliabilityEvent({
      metric: "idempotency.conflict",
      severity: "HIGH",
      message: "Replay rejected",
    });
    assert.equal(event.householdId, null);
    assert.deepEqual(event.metadata, {});
  });

  it("requires explicit non-production ownership and records the shared controls", () => {
    const configuration = readReliabilityConfiguration({
      NODE_ENV: "test",
      CAPITAL_OS_TRUSTED_PROXY: "10.0.0.0/8",
      CAPITAL_OS_RELIABILITY_OWNER: "internal-reliability",
    });
    assert.equal(configuration.rateLimitStore, "postgres");
    assert.equal(configuration.auditArchiveDestination, AUDIT_ARCHIVE_DESTINATION);
    assert.equal(configuration.auditRetentionDays, AUDIT_RETENTION_DAYS);
    assert.equal(RELIABILITY_ALERT_OWNER, "reliability-operator");
    assert.deepEqual(RELIABILITY_ALERT_THRESHOLDS["rate_limit.unavailable"], {
      threshold: 1,
      windowMinutes: 1,
    });
    assert.throws(
      () => readReliabilityConfiguration({ NODE_ENV: "test", CAPITAL_OS_TRUSTED_PROXY: "10.0.0.0/8" }),
      /CAPITAL_OS_RELIABILITY_OWNER/,
    );
    assert.throws(
      () => readReliabilityConfiguration({
        NODE_ENV: "test",
        CAPITAL_OS_TRUSTED_PROXY: "10.0.0.0/8",
        CAPITAL_OS_RELIABILITY_OWNER: "internal-reliability",
        CAPITAL_OS_AUDIT_RETENTION_DAYS: "30",
      }),
      /at least 365/,
    );
    assert.throws(
      () => readReliabilityConfiguration({ NODE_ENV: "production" }),
      /CAPITAL_OS_TRUSTED_PROXY/,
    );
    assert.doesNotThrow(() => readReliabilityConfiguration({
      NODE_ENV: "production",
      CAPITAL_OS_TRUSTED_PROXY: "10.0.0.0/8",
      CAPITAL_OS_RATE_LIMIT_STORE: "postgres",
      CAPITAL_OS_AUDIT_RETENTION_DAYS: "2555",
      CAPITAL_OS_AUDIT_ARCHIVE_DESTINATION: AUDIT_ARCHIVE_DESTINATION,
      CAPITAL_OS_RELIABILITY_OWNER: "internal-reliability",
    }));
  });
});