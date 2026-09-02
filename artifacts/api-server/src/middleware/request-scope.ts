import { AsyncLocalStorage } from "node:async_hooks";
import type { HouseholdRole } from "../domain/governance";

export type AuthStrength = "clerk_session" | "development_seed" | "test_seed" | "test_database";

export type RequestSecurityContext = {
  userId: string;
  householdId: string;
  role: HouseholdRole;
  permissions: string[];
  authStrength: AuthStrength;
  source: "clerk-session" | "development-seed" | "test-seed" | "test-database";
};

const storage = new AsyncLocalStorage<RequestSecurityContext>();

export function runWithSecurityContext<T>(
  context: RequestSecurityContext,
  callback: () => T,
): T {
  return storage.run(context, callback);
}

export function activeSecurityContext(): RequestSecurityContext | undefined {
  return storage.getStore();
}