import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertSafeAutomationAction, calculateOperationsHealth } from "./operations.ts";
import { RELIABILITY_ALERTS, RELIABILITY_METRICS, reliabilityEvent } from "./reliability.ts";

describe("operations safety", () => {
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
});