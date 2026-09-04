import type { ExecutionControlState } from "@workspace/db";

export const EXECUTION_CONTROL_STATES = [
  "DISABLED",
  "MICRO_LIVE_ELIGIBLE",
  "MICRO_LIVE_ARMED",
  "MICRO_LIVE_ACTIVE",
  "SAFE_MODE",
  "STOP",
  "EVACUATE",
  "LOCKED",
] as const;

export type { ExecutionControlState };

const transitions: Record<ExecutionControlState, readonly ExecutionControlState[]> = {
  DISABLED: ["MICRO_LIVE_ELIGIBLE", "SAFE_MODE", "STOP"],
  MICRO_LIVE_ELIGIBLE: ["MICRO_LIVE_ARMED", "SAFE_MODE", "STOP"],
  MICRO_LIVE_ARMED: ["MICRO_LIVE_ACTIVE", "SAFE_MODE", "STOP", "EVACUATE"],
  MICRO_LIVE_ACTIVE: ["SAFE_MODE", "STOP", "EVACUATE"],
  SAFE_MODE: ["STOP", "DISABLED"],
  STOP: ["LOCKED", "DISABLED"],
  EVACUATE: ["LOCKED", "STOP"],
  LOCKED: ["DISABLED"],
};

export function isExecutionControlState(value: string): value is ExecutionControlState {
  return (EXECUTION_CONTROL_STATES as readonly string[]).includes(value);
}

export function allowedExecutionTransitions(state: ExecutionControlState): ExecutionControlState[] {
  return [...transitions[state]];
}

export function canTransitionExecutionState(
  from: ExecutionControlState,
  to: ExecutionControlState,
): boolean {
  return from === to || transitions[from].includes(to);
}

export function executionStateAllowsNewOrder(state: ExecutionControlState): boolean {
  return state === "MICRO_LIVE_ACTIVE";
}

export function executionStateIsSafetyLock(state: ExecutionControlState): boolean {
  return state === "SAFE_MODE" || state === "STOP" || state === "EVACUATE" || state === "LOCKED";
}