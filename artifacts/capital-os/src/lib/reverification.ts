import { useReverification } from "@clerk/react";

type ReverificationHint = {
  clerk_error: {
    type: "forbidden";
    reason: "reverification-error";
    metadata?: unknown;
  };
};

function directReverificationHint(value: unknown): ReverificationHint | null {
  if (!value || typeof value !== "object") return null;
  const error = value as { clerk_error?: { type?: unknown; reason?: unknown } };
  return error.clerk_error?.type === "forbidden" &&
    error.clerk_error.reason === "reverification-error"
    ? (value as ReverificationHint)
    : null;
}

export function extractClerkReverificationHint(value: unknown): ReverificationHint | null {
  const direct = directReverificationHint(value);
  if (direct) return direct;
  if (!value || typeof value !== "object") return null;

  const envelope = value as {
    data?: unknown;
    body?: unknown;
    error?: unknown;
    cause?: unknown;
  };
  for (const candidate of [envelope.data, envelope.body, envelope.error, envelope.cause]) {
    const hint = directReverificationHint(candidate);
    if (hint) return hint;
  }
  return null;
}

export function isClerkReverificationHint(value: unknown): boolean {
  return extractClerkReverificationHint(value) !== null;
}

export function useProviderProtectedAction<Args extends unknown[], Result>(
  action: (...args: Args) => Promise<Result>,
) {
  return useReverification(async (...args: Args) => {
    try {
      return await action(...args);
    } catch (error) {
      // Return only Clerk's exact standardized hint. The extractor also
      // tolerates generated-client and production middleware envelopes.
      const hint = extractClerkReverificationHint(error);
      if (hint) return hint as Result;
      throw error;
    }
  });
}