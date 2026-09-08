import { and, eq } from "drizzle-orm";
import {
  auditEventArchive,
  auditEvents,
  db,
  householdMembers,
  households,
  users,
} from "@workspace/db";

export async function setupCapitalGovernorBrowserFixture(externalAuthId: string, email: string) {
  const identities = await db
    .select({
      userId: users.id,
      householdId: householdMembers.householdId,
      email: users.email,
    })
    .from(users)
    .innerJoin(householdMembers, and(
      eq(householdMembers.userId, users.id),
      eq(householdMembers.active, true),
    ))
    .where(and(
      eq(users.externalAuthId, externalAuthId),
      eq(users.email, email),
      eq(users.status, "active"),
    ));

  if (identities.length !== 1) {
    throw new Error(`Expected exactly one active household membership for disposable identity ${externalAuthId}`);
  }
  return identities[0];
}

export async function cleanupCapitalGovernorBrowserFixture(externalAuthId: string, email: string) {
  if (!email.includes("+capital-governor-")) {
    throw new Error("Refusing to purge a non-disposable Capital Governor browser identity");
  }

  const [identity] = await db
    .select({ userId: users.id, email: users.email })
    .from(users)
    .where(and(
      eq(users.externalAuthId, externalAuthId),
      eq(users.email, email),
    ))
    .limit(1);
  if (!identity) return { removed: false };

  const memberships = await db
    .select({ householdId: householdMembers.householdId })
    .from(householdMembers)
    .where(eq(householdMembers.userId, identity.userId));
  if (memberships.length > 1) {
    throw new Error("Refusing to purge a disposable identity with multiple household memberships");
  }

  await db.transaction(async (tx) => {
    if (memberships[0]) {
      await tx.delete(auditEventArchive).where(eq(auditEventArchive.householdId, memberships[0].householdId));
      await tx.delete(auditEvents).where(eq(auditEvents.householdId, memberships[0].householdId));
      await tx.delete(householdMembers).where(eq(householdMembers.householdId, memberships[0].householdId));
      await tx.delete(households).where(eq(households.id, memberships[0].householdId));
    }
    await tx.delete(users).where(eq(users.id, identity.userId));
  });
  return { removed: true };
}