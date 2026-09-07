import { and, eq } from "drizzle-orm";
import {
  db,
  familyOfficeProposals,
  shadowOrderIntents,
  shadowPortfolios,
  taxLienCertificateCandidates,
  users,
  householdMembers,
} from "@workspace/db";

export async function setupFamilyOfficeBrowserFixture(externalAuthId: string, runId: string) {
  const [identity] = await db
    .select({ userId: users.id, householdId: householdMembers.householdId })
    .from(users)
    .innerJoin(householdMembers, and(
      eq(householdMembers.userId, users.id),
      eq(householdMembers.active, true),
    ))
    .where(and(eq(users.externalAuthId, externalAuthId), eq(users.status, "active")));
  if (!identity) throw new Error(`Expected an active household membership for ${externalAuthId}`);

  const [proposal] = await db.insert(familyOfficeProposals).values({
    householdId: identity.householdId,
    title: `Browser Shadow proposal ${runId}`,
    thesis: "A browser-only review fixture; no execution authority.",
    label: "REVIEW_CANDIDATE",
    analyticalDirection: "NEUTRAL",
    confidence: "42",
    facts: ["Browser fixture fact"],
    assumptions: ["Browser fixture assumption"],
    risks: ["Browser fixture risk"],
  }).returning({ id: familyOfficeProposals.id });
  const [portfolio] = await db.insert(shadowPortfolios).values({
    householdId: identity.householdId,
    name: `Browser Shadow portfolio ${runId}`,
    benchmark: "SPY",
    strategy: "Hypothetical browser review only",
  }).returning({ id: shadowPortfolios.id });
  if (!proposal?.id || !portfolio?.id) throw new Error("Could not create the Family Office browser fixture");
  return { ...identity, proposalId: proposal.id, portfolioId: portfolio.id };
}

export async function cleanupFamilyOfficeBrowserFixture(runId: string) {
  await db.transaction(async (tx) => {
    const proposals = await tx.select({ id: familyOfficeProposals.id })
      .from(familyOfficeProposals)
      .where(eq(familyOfficeProposals.title, `Browser Shadow proposal ${runId}`));
    const portfolios = await tx.select({ id: shadowPortfolios.id })
      .from(shadowPortfolios)
      .where(eq(shadowPortfolios.name, `Browser Shadow portfolio ${runId}`));
    for (const portfolio of portfolios) {
      await tx.delete(shadowOrderIntents).where(eq(shadowOrderIntents.shadowPortfolioId, portfolio.id));
    }
    for (const proposal of proposals) {
      await tx.delete(shadowOrderIntents).where(eq(shadowOrderIntents.proposalId, proposal.id));
    }
    for (const proposal of proposals) {
      await tx.delete(familyOfficeProposals).where(eq(familyOfficeProposals.id, proposal.id));
    }
    for (const portfolio of portfolios) {
      await tx.delete(shadowPortfolios).where(eq(shadowPortfolios.id, portfolio.id));
    }
    await tx.delete(taxLienCertificateCandidates).where(eq(taxLienCertificateCandidates.county, `Browser fixture ${runId}`));
  });
}