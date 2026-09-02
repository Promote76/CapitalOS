import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertSafeAutomationAction, calculateOperationsHealth } from "./operations.ts";

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
});