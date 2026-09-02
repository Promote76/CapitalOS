import type { NextFunction, Request, Response } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { and, asc, eq } from "drizzle-orm";
import { db, householdMembers, users } from "@workspace/db";
import { ensureSeedData } from "../services/seed";
import type { Actor } from "../services/capital-os";
import {
  permissions as rolePermissions,
  type HouseholdRole,
} from "../domain/governance";
import {
  activeSecurityContext,
  runWithSecurityContext,
  type RequestSecurityContext,
} from "./request-scope";

const roles = new Set<HouseholdRole>(["owner", "partner", "viewer", "advisor"]);

export type ResolvedClerkIdentity = {
  externalAuthId: string;
  userId: string;
  email: string;
  displayName: string;
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
    })
    .from(users)
    .where(eq(users.externalAuthId, externalAuthId))
    .limit(1);

  if (existing) {
    return {
      externalAuthId,
      userId: existing.id,
      email: existing.email,
      displayName: existing.displayName,
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
  };
}

async function authenticatedContext(req: Request): Promise<RequestSecurityContext | null> {
  const identity = await resolveClerkIdentity(req);
  if (!identity) return null;

  const [membership] = await db
    .select({
      householdId: householdMembers.householdId,
      role: householdMembers.role,
      permissions: householdMembers.permissions,
    })
    .from(householdMembers)
    .where(and(eq(householdMembers.userId, identity.userId), eq(householdMembers.active, true)))
    .orderBy(asc(householdMembers.createdAt))
    .limit(1);

  if (!membership) {
    return null;
  }

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

function setLocals(res: Response, context: RequestSecurityContext) {
  const actor: Actor = {
    role: context.role,
    userId: context.userId,
    source: context.source,
  };
  res.locals.actor = actor;
  res.locals.householdId = context.householdId;
  res.locals.securityContext = context;
}

export async function requestContext(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = await authenticatedContext(req);
    if (auth) {
      setLocals(res, auth);
      runWithSecurityContext(auth, next);
      return;
    }

    const clerkAuth = getAuth(req);
    if (clerkAuth.userId) {
      res.status(403).json({
        code: "HOUSEHOLD_MEMBERSHIP_REQUIRED",
        message: "Your authenticated account is not a member of a Capital OS household.",
      });
      return;
    }

    if (process.env.NODE_ENV === "production") {
      res.status(401).json({
        code: "AUTHENTICATION_REQUIRED",
        message: "Sign in is required to access Capital OS financial data.",
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