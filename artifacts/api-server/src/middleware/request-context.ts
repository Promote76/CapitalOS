import type { NextFunction, Request, Response } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { reverificationError } from "@clerk/shared/authorization-errors";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, householdMembers, households, users } from "@workspace/db";
import { appendAuditEvent } from "../services/audit";
import { ensureSeedData } from "../services/seed";
import type { Actor } from "../services/capital-os";
import {
  permissions as rolePermissions,
  type HouseholdRole,
  GovernanceError,
} from "../domain/governance";
import {
  activeSecurityContext,
  runWithSecurityContext,
  type RequestSecurityContext,
} from "./request-scope";
import { hasProviderReverification } from "./reverification";

const roles = new Set<HouseholdRole>(["owner", "partner", "viewer", "advisor"]);
/**
 * The active household is deliberately request-scoped rather than inferred
 * from a client-side route.  A Clerk session can belong to more than one
 * household, so callers must send this value once selection is required.
 */
export const ACTIVE_HOUSEHOLD_HEADER = "X-Capital-OS-Household-Id";

export function requestedHouseholdId(req: Request) {
  return req.header(ACTIVE_HOUSEHOLD_HEADER) ?? req.header("X-Household-Id") ?? null;
}

export class HouseholdSelectionRequired extends Error {
  readonly code = "HOUSEHOLD_SELECTION_REQUIRED";
  constructor() {
    super("Select a Capital OS household before accessing workspace data.");
    this.name = "HouseholdSelectionRequired";
  }
}

export function selectActiveMembership<T extends { householdId: string }>(
  memberships: T[],
  selectedHouseholdId: string | null,
): T {
  if (memberships.length > 1 && !selectedHouseholdId) throw new HouseholdSelectionRequired();
  const selected = memberships.length === 1
    ? memberships[0]
    : memberships.find((membership) => membership.householdId === selectedHouseholdId);
  if (!selected) {
    throw new GovernanceError(
      "FORBIDDEN",
      "Your authenticated account is not a member of the selected Capital OS household.",
    );
  }
  return selected;
}

function requiresRecentAuthentication(req: Request) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return false;
  const path = req.path;
  return path === "/household/privacy" ||
    path === "/allocations" ||
    path === "/transfers" ||
    path === "/risk/emergency-stop" ||
    path.startsWith("/recommendations/") ||
    path.startsWith("/operations/tasks/") ||
    path === "/operations/audit-backfill" ||
    path.startsWith("/operations/approvals/") ||
    path.includes("/treasury/requests/") ||
    path.startsWith("/business/distributions") ||
    path.startsWith("/micro-live/") ||
    path.startsWith("/execution-control/") ||
    path.startsWith("/financial-transactions/") ||
    path === "/financial-documents/reset" ||
    /^\/financial-documents\/[0-9a-fA-F-]{36}\/delete-evidence$/.test(path) ||
    /^\/budget-planning-periods\/[0-9a-fA-F-]{36}\/(approve|close)$/.test(path) ||
    path.startsWith("/financing") ||
    path.startsWith("/family-office/proposals/") ||
    path.startsWith("/family-office/shadow/") ||
    path.startsWith("/family-office/tax-liens") ||
    (path.startsWith("/integrations/schwab/") && path !== "/integrations/schwab/oauth/callback");
}

export type ResolvedClerkIdentity = {
  externalAuthId: string;
  userId: string;
  email: string;
  displayName: string;
  status: string;
};

export async function resolveClerkIdentity(req: Request): Promise<ResolvedClerkIdentity | null> {
  const auth = getAuth(req);
  const externalAuthId = auth.userId;
  if (!externalAuthId) return null;

  const [existing] = await db
    .select({
      id: users.id,
      externalAuthId: users.externalAuthId,
      email: users.email,
      displayName: users.displayName,
      status: users.status,
    })
    .from(users)
    .where(eq(users.externalAuthId, externalAuthId))
    .limit(1);

  if (existing) {
    if (existing.status !== "active") {
      throw new GovernanceError("FORBIDDEN", "This Capital OS account is inactive.");
    }
    return {
      externalAuthId,
      userId: existing.id,
      email: existing.email,
      displayName: existing.displayName,
      status: existing.status,
    };
  }

  const clerkUser = await clerkClient.users.getUser(externalAuthId);
  const email =
    clerkUser.primaryEmailAddress?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress ??
    `${externalAuthId}@clerk.local`;
  const displayName =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ").trim() ||
    clerkUser.username ||
    email;

  const [created] = await db
    .insert(users)
    .values({
      externalAuthId,
      email,
      displayName,
      status: "active",
    })
    .onConflictDoUpdate({
      target: users.externalAuthId,
      set: { email, displayName, updatedAt: new Date() },
    })
    .returning({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
    });

  return {
    externalAuthId,
    userId: created.id,
    email: created.email,
    displayName: created.displayName,
    status: "active",
  };
}

async function authenticatedContext(req: Request): Promise<RequestSecurityContext | null> {
  const identity = await resolveClerkIdentity(req);
  if (!identity) return null;

  const memberships = await db
    .select({
      householdId: householdMembers.householdId,
      role: householdMembers.role,
      permissions: householdMembers.permissions,
    })
    .from(householdMembers)
    .where(and(eq(householdMembers.userId, identity.userId), eq(householdMembers.active, true)))
    .orderBy(asc(householdMembers.createdAt));

  let membership = memberships.length === 1 ? memberships[0] : undefined;
  if (memberships.length > 1) {
    const selectedHouseholdId = requestedHouseholdId(req);
    membership = selectActiveMembership(memberships, selectedHouseholdId);
  }

  membership = membership ?? await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`household-provision:${identity.userId}`}))`);
    const raceSafeMemberships = await tx
      .select({
        householdId: householdMembers.householdId,
        role: householdMembers.role,
        permissions: householdMembers.permissions,
      })
      .from(householdMembers)
      .where(and(eq(householdMembers.userId, identity.userId), eq(householdMembers.active, true)))
      .orderBy(asc(householdMembers.createdAt))
      .limit(2);
    if (raceSafeMemberships.length > 1) {
      const selectedHouseholdId = requestedHouseholdId(req);
      return selectActiveMembership(raceSafeMemberships, selectedHouseholdId);
    }
    const raceSafeMembership = raceSafeMemberships[0];
    if (raceSafeMembership) return raceSafeMembership;

    const [household] = await tx.insert(households).values({
      name: `${identity.displayName}'s household`,
      timezone: "America/Chicago",
    }).returning({ id: households.id });
    const permissions = Array.from(rolePermissions.owner);
    await tx.insert(householdMembers).values({
      householdId: household.id,
      userId: identity.userId,
      role: "owner",
      permissions,
    });
    await appendAuditEvent({
      householdId: household.id,
      eventType: "household_initialized",
      actor: identity.userId,
      entity: "household",
      entityId: household.id,
      reason: "Provisioned authenticated household",
      metadata: { source: "clerk-sign-in", seeded: false },
    }, tx);
    return { householdId: household.id, role: "owner" as const, permissions };
  });

  const permissions = membership.permissions.length
    ? membership.permissions
    : Array.from(rolePermissions[membership.role]);

  return {
    userId: identity.userId,
    householdId: membership.householdId,
    role: membership.role,
    permissions,
    authStrength: "clerk_session",
    source: "clerk-session",
  };
}

async function testDatabaseContext(req: Request): Promise<RequestSecurityContext | null> {
  if (process.env.NODE_ENV !== "test" || process.env.CAPITAL_OS_TEST_CONTEXT !== "1") return null;
  const userId = req.header("X-Test-User-Id");
  const householdId = req.header("X-Test-Household-Id");
  if (!userId || !householdId) return null;
  const [membership] = await db
    .select({
      householdId: householdMembers.householdId,
      role: householdMembers.role,
      permissions: householdMembers.permissions,
    })
    .from(householdMembers)
    .innerJoin(users, eq(users.id, householdMembers.userId))
    .where(and(
      eq(householdMembers.userId, userId),
      eq(householdMembers.householdId, householdId),
      eq(householdMembers.active, true),
      eq(users.status, "active"),
    ))
    .limit(1);
  if (!membership) return null;
  return {
    userId,
    householdId: membership.householdId,
    role: membership.role,
    permissions: membership.permissions.length ? membership.permissions : Array.from(rolePermissions[membership.role]),
    authStrength: "test_database",
    source: "test-database",
  };
}

function setLocals(res: Response, context: RequestSecurityContext) {
  const actor: Actor = {
    role: context.role,
    userId: context.userId,
    householdId: context.householdId,
    permissions: context.permissions,
    source: context.source,
  };
  res.locals.actor = actor;
  res.locals.householdId = context.householdId;
  res.locals.securityContext = context;
}

export async function requestContext(req: Request, res: Response, next: NextFunction) {
  try {
    // OAuth callbacks have no browser session requirement: state is the sole,
    // persisted, single-use household+actor binding checked by the callback.
    if (req.path === "/integrations/schwab/oauth/callback") { next(); return; }
    const auth = await authenticatedContext(req) ?? await testDatabaseContext(req);
    if (auth) {
      if (requiresRecentAuthentication(req) && !hasProviderReverification(req, auth)) {
        if (auth.authStrength === "clerk_session") {
          res.status(403).json(reverificationError("strict"));
          return;
        }
        res.status(403).json({
          code: "STEP_UP_REQUIRED",
          message: "A test-only step-up marker is required by the isolated fixture.",
          correlationId: res.locals.correlationId,
        });
        return;
      }
      setLocals(res, auth);
      runWithSecurityContext(auth, next);
      return;
    }

    if (
      process.env.NODE_ENV === "test" &&
      req.header("X-Test-User-Id") &&
      req.header("X-Test-Household-Id")
    ) {
      res.status(403).json({
        code: "HOUSEHOLD_MEMBERSHIP_REQUIRED",
        message: "Your authenticated account is not a member of the selected Capital OS household.",
        correlationId: res.locals.correlationId,
      });
      return;
    }

    const clerkAuth = getAuth(req);
    if (clerkAuth.userId) {
      res.status(403).json({
        code: "HOUSEHOLD_MEMBERSHIP_REQUIRED",
        message: "Your authenticated account is not a member of a Capital OS household.",
        correlationId: res.locals.correlationId,
      });
      return;
    }

    if (process.env.NODE_ENV === "production") {
      res.status(401).json({
        code: "AUTHENTICATION_REQUIRED",
        message: "Sign in is required to access Capital OS financial data.",
        correlationId: res.locals.correlationId,
      });
      return;
    }

    const seed = await ensureSeedData();
    const requestedRole = req.header("X-Household-Role") as HouseholdRole | undefined;
    const role =
      process.env.NODE_ENV === "test" && requestedRole && roles.has(requestedRole)
        ? requestedRole
        : "owner";
    const fallbackContext: RequestSecurityContext = {
      userId: seed.ownerId,
      householdId: seed.householdId,
      role,
      permissions: Array.from(rolePermissions[role]),
      authStrength: process.env.NODE_ENV === "test" ? "test_seed" : "development_seed",
      source: process.env.NODE_ENV === "test" ? "test-seed" : "development-seed",
    };
    setLocals(res, fallbackContext);
    runWithSecurityContext(fallbackContext, next);
  } catch (error) {
    if (error instanceof HouseholdSelectionRequired) {
      res.status(409).json({
        code: error.code,
        message: error.message,
        correlationId: res.locals.correlationId,
      });
      return;
    }
    next(error);
  }
}

export function actorFrom(res: Response): Actor {
  const actor = res.locals.actor as Actor | undefined;
  if (!actor) throw new Error("Request actor context is missing");
  return actor;
}

export function securityContextFrom(res: Response): RequestSecurityContext {
  const context = res.locals.securityContext as RequestSecurityContext | undefined;
  if (!context) throw new Error("Request security context is missing");
  return context;
}

export function currentSecurityContext(): RequestSecurityContext | undefined {
  return activeSecurityContext();
}