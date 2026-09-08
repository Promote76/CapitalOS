import { and, eq } from "drizzle-orm";
import {
  businessEntities,
  businessReserves,
  db,
  financialAccounts,
  householdMembers,
  users,
} from "@workspace/db";

export async function setupBusinessIncomeBrowserFixture(externalAuthId: string, runId: string) {
  const [identity] = await db.select({
    userId: users.id,
    householdId: householdMembers.householdId,
  }).from(users).innerJoin(householdMembers, and(
    eq(householdMembers.userId, users.id),
    eq(householdMembers.active, true),
  )).where(and(eq(users.externalAuthId, externalAuthId), eq(users.status, "active")));
  if (!identity) throw new Error(`Expected an active household membership for ${externalAuthId}`);
  const [business] = await db.insert(businessEntities).values({
    householdId: identity.householdId,
    legalName: `Browser business ${runId}`,
    displayName: `Browser business ${runId}`,
    createdBy: identity.userId,
  }).returning({ id: businessEntities.id });
  await db.insert(financialAccounts).values({
    householdId: identity.householdId,
    institution: "Business browser fixture bank",
    nickname: `Read-only business cash ${runId}`,
    accountType: "business_checking",
    currentBalance: "1000.00",
    availableBalance: "1000.00",
    businessEntityId: business.id,
    connectionStatus: "manual",
    dataSource: "manual",
  });
  await db.insert(businessReserves).values({
    householdId: identity.householdId,
    businessId: business.id,
    targetMethod: "fixed",
    targetAmount: "5000.00",
    taxReserve: "0.00",
    safetyBuffer: "0.00",
    updatedBy: identity.userId,
  });
  return { ...identity, businessId: business.id };
}

export async function cleanupBusinessIncomeBrowserFixture(runId: string) {
  const businesses = await db.select({ id: businessEntities.id }).from(businessEntities)
    .where(eq(businessEntities.displayName, `Browser business ${runId}`));
  for (const business of businesses) {
    await db.delete(businessEntities).where(eq(businessEntities.id, business.id));
  }
}