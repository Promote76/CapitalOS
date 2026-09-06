import { useReverification } from "@clerk/react";

export function isClerkReverificationHint(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const error = value as { clerk_error?: { type?: unknown; reason?: unknown } };
  return (
    error.clerk_error?.type === "forbidden" &&
    error.clerk_error.reason === "reverification-error"
  );
}

export function useProviderProtectedAction<Args extends unknown[], Result>(
  action: (...args: Args) => Promise<Result>,
) {
  return useReverification(async (...args: Args) => {
    try {
      return await action(...args);
    } catch (error) {
      // Generated API clients keep non-2xx JSON in ApiError.data. Clerk's
      // hook needs its standardized hint returned so it can challenge and
      // retry the exact original action.
      const data =
        error && typeof error === "object" && "data" in error
          ? (error as { data?: unknown }).data
          : error;
      if (isClerkReverificationHint(data)) return data as Result;
      throw error;
    }
  });
}