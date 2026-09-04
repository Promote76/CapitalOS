import assert from "node:assert/strict";
import test from "node:test";
import {
  allowedExecutionTransitions,
  canTransitionExecutionState,
  executionStateAllowsNewOrder,
  executionStateIsSafetyLock,
} from "./execution-control";

test("execution control starts fail-closed and only permits active state to reach OMS", () => {
  assert.deepEqual(allowedExecutionTransitions("DISABLED"), ["MICRO_LIVE_ELIGIBLE", "SAFE_MODE", "STOP"]);
  assert.equal(executionStateAllowsNewOrder("DISABLED"), false);
  assert.equal(executionStateAllowsNewOrder("MICRO_LIVE_ARMED"), false);
  assert.equal(executionStateAllowsNewOrder("MICRO_LIVE_ACTIVE"), true);
  assert.equal(executionStateIsSafetyLock("STOP"), true);
});

test("execution control transition matrix rejects skips and unsafe recovery", () => {
  assert.equal(canTransitionExecutionState("DISABLED", "STOP"), true);
  assert.equal(canTransitionExecutionState("MICRO_LIVE_ACTIVE", "EVACUATE"), true);
  assert.equal(canTransitionExecutionState("STOP", "MICRO_LIVE_ACTIVE"), false);
  assert.equal(canTransitionExecutionState("EVACUATE", "MICRO_LIVE_ACTIVE"), false);
  assert.equal(canTransitionExecutionState("LOCKED", "MICRO_LIVE_ARMED"), false);
  assert.equal(canTransitionExecutionState("SAFE_MODE", "DISABLED"), true);
});