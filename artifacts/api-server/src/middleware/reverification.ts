import { getAuth } from "@clerk/express";
import type { Request } from "express";
import type { RequestSecurityContext } from "./request-scope";

export function hasProviderReverification(
  req: Request,
  context: Pick<RequestSecurityContext, "authStrength">,
  providerCheck: () => boolean = () => getAuth(req).has({ reverification: "strict" }),
) {
  if (context.authStrength === "test_database") {
    // This branch exists only for the isolated database fixture. It is not a
    // Clerk proof and must never be used as production or browser evidence.
    return req.header("X-Test-Step-Up") === "verified";
  }
  if (context.authStrength !== "clerk_session") return true;
  return providerCheck();
}