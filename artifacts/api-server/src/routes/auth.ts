import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { and, asc, eq } from "drizzle-orm";
import { db, householdMembers, households, householdSettings, auditEvents } from "@workspace/db";
import { OnboardHouseholdBody } from "@workspace/api-zod";
import { asyncRoute } from "../middleware/errors";
import { resolveClerkIdentity } from "../middleware/request-context";

const router: IRouter = Router();

async function requireClerkIdentity(req: Parameters<typeof getAuth>[0]) {
  const auth = getAuth(req);
  if (!auth.userId) return null;
  return resolveClerkIdentity(req);
}

router.get("/auth/me", asyncRoute(async (req, res) => {
  const identity = await requireClerkIdentity(req);
  if (!identity) {
    res.status(401).json({ code: "AUTHENTICATION_REQUIRED", message: "Sign in is required.", correlationId: res.locals.correlationId });
    return;
  }

  const memberships = await db
    .select({
      id: householdMembers.id,
      householdId: householdMembers.householdId,
      role: householdMembers.role,
      permissions: householdMembers.permissions,
      active: householdMembers.active,
      householdName: households.name,
      timezone: households.timezone,
    })
    .from(householdMembers)
    .innerJoin(households, eq(households.id, householdMembers.householdId))
    .where(eq(householdMembers.userId, identity.userId))
    .orderBy(asc(householdMembers.createdAt));

  res.json({
    user: {
      id: identity.userId,
      externalAuthId: identity.externalAuthId,
      email: identity.email,
      displayName: identity.displayName,
    },
    memberships,
    authStrength: "clerk_session",
  });
}));

router.post("/auth/onboard", asyncRoute(async (req, res) => {
  const identity = await requireClerkIdentity(req);
  if (!identity) {
    res.status(401).json({ code: "AUTHENTICATION_REQUIRED", message: "Sign in is required.", correlationId: res.locals.correlationId });
    return;
  }
  const input = OnboardHouseholdBody.parse(req.body);
  const existing = await db
    .select({ id: householdMembers.id })
    .from(householdMembers)
    .where(and(eq(householdMembers.userId, identity.userId), eq(householdMembers.active, true)))
    .limit(1);
  if (existing[0]) {
    res.status(409).json({ code: "HOUSEHOLD_ALREADY_EXISTS", message: "This user already belongs to an active household.", correlationId: res.locals.correlationId });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [household] = await tx
      .insert(households)
      .values({ name: input.name, timezone: input.timezone })
      .returning({ id: households.id, name: households.name, timezone: households.timezone });
    await tx.insert(householdMembers).values({
      householdId: household.id,
      userId: identity.userId,
      role: "owner",
      permissions: ["read", "contribute", "transfer", "allocate", "approve", "manage_risk"],
      active: true,
    });
    await tx.insert(householdSettings).values({
      householdId: household.id,
      aiAdvisoryOnly: true,
      blockchainEnabled: false,
      emergencyStopActive: false,
      settings: {
        onboarding: "complete",
        bankConnection: "manual_only_until_user_initiates",
        liveExecution: "disabled",
      },
    });
    await tx.insert(auditEvents).values({
      householdId: household.id,
      eventType: "household_onboarded",
      actor: identity.userId,
      entity: "household",
      entityId: household.id,
      reason: "Authenticated user completed household onboarding",
      metadata: { source: "clerk_session" },
    });
    return household;
  });

  res.status(201).json({
    household: result,
    role: "owner",
    message: "Household created with conservative, non-executing defaults.",
  });
}));

export default router;