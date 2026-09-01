import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  accounts,
  aiRecommendations,
  allocationRules,
  auditEvents,
  goals,
  contributions,
  householdMembers,
  householdSettings,
  households,
  ledgerEntries,
  ledgerTransactions,
  propertyGoals,
  propertyMilestones,
  riskStates,
  strategyPerformance,
  strategyVersions,
  strategies,
  users,
} from "@workspace/db";

const DEMO_HOUSEHOLD_NAME = "Morgan household";

export type SeedContext = {
  householdId: string;
  ownerId: string;
  goalId: string;
  duplexAccountId: string;
  capitalOsAccountId: string;
  opportunityAccountId: string;
  treasuryAccountId: string;
  allocationRuleId: string;
  propertyGoalId: string;
  strategyId: string;
  strategyCapitalAccountId: string;
  recommendationId: string;
  riskStateId: string;
};

let seedContext: SeedContext | undefined;

export async function ensureSeedData(): Promise<SeedContext> {
  if (seedContext) return seedContext;

  const existingHousehold = await db
    .select({ id: households.id })
    .from(households)
    .where(eq(households.name, DEMO_HOUSEHOLD_NAME))
    .limit(1);
  if (existingHousehold[0]) {
    const ownerMember = await db
      .select({ userId: householdMembers.userId })
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, existingHousehold[0].id),
          eq(householdMembers.role, "owner"),
        ),
      )
      .limit(1);
    const householdAccounts = await db
      .select({ id: accounts.id, accountType: accounts.accountType })
      .from(accounts)
      .where(eq(accounts.householdId, existingHousehold[0].id));
    const primaryGoal = await db
      .select({ id: goals.id })
      .from(goals)
      .where(eq(goals.householdId, existingHousehold[0].id))
      .limit(1);
    const propertyGoal = await db
      .select({ id: propertyGoals.id })
      .from(propertyGoals)
      .where(eq(propertyGoals.householdId, existingHousehold[0].id))
      .limit(1);
    const rule = await db
      .select({ id: allocationRules.id })
      .from(allocationRules)
      .where(eq(allocationRules.householdId, existingHousehold[0].id))
      .limit(1);
    const strategy = await db
      .select({ id: strategies.id })
      .from(strategies)
      .where(eq(strategies.householdId, existingHousehold[0].id))
      .limit(1);
    const recommendation = await db
      .select({ id: aiRecommendations.id })
      .from(aiRecommendations)
      .where(eq(aiRecommendations.householdId, existingHousehold[0].id))
      .limit(1);
    const risk = await db
      .select({ id: riskStates.id })
      .from(riskStates)
      .where(eq(riskStates.householdId, existingHousehold[0].id))
      .limit(1);
    const findAccount = (type: string) => householdAccounts.find((item) => item.accountType === type)?.id;
    if (
      ownerMember[0] &&
      primaryGoal[0] &&
      propertyGoal[0] &&
      rule[0] &&
      strategy[0] &&
      recommendation[0] &&
      risk[0] &&
      findAccount("duplex_reserve") &&
      findAccount("active_capital") &&
      findAccount("opportunity_reserve") &&
      findAccount("treasury")
    ) {
      let strategyCapitalAccountId = findAccount("strategy_capital");
      if (!strategyCapitalAccountId) {
        const [strategyCapital] = await db
          .insert(accounts)
          .values({
            householdId: existingHousehold[0].id,
            name: "Strategy Capital",
            accountType: "strategy_capital",
            balance: "0.00",
            protected: false,
            riskClass: "experimental",
          })
          .returning({ id: accounts.id });
        strategyCapitalAccountId = strategyCapital.id;
      }
      seedContext = {
        householdId: existingHousehold[0].id,
        ownerId: ownerMember[0].userId,
        goalId: primaryGoal[0].id,
        duplexAccountId: findAccount("duplex_reserve")!,
        capitalOsAccountId: findAccount("active_capital")!,
        opportunityAccountId: findAccount("opportunity_reserve")!,
        strategyCapitalAccountId,
        treasuryAccountId: findAccount("treasury")!,
        allocationRuleId: rule[0].id,
        propertyGoalId: propertyGoal[0].id,
        strategyId: strategy[0].id,
        recommendationId: recommendation[0].id,
        riskStateId: risk[0].id,
      };
      return seedContext;
    }
  }

  const result = await db.transaction(async (tx) => {
    const [owner] = await tx
      .insert(users)
      .values({ displayName: "Alex Morgan", email: "alex@capitalos.local" })
      .returning({ id: users.id });
    const [household] = await tx
      .insert(households)
      .values({ name: DEMO_HOUSEHOLD_NAME, timezone: "America/Chicago" })
      .returning({ id: households.id });
    await tx.insert(householdMembers).values({
      householdId: household.id,
      userId: owner.id,
      role: "owner",
      permissions: ["read", "contribute", "transfer", "allocate", "approve", "manage_risk"],
    });
    await tx.insert(householdSettings).values({
      householdId: household.id,
      aiAdvisoryOnly: true,
      blockchainEnabled: false,
      emergencyStopActive: false,
    });

    const [treasury] = await tx
      .insert(accounts)
      .values({
        householdId: household.id,
        name: "Capital OS Treasury",
        accountType: "treasury",
        balance: "-56280.00",
        protected: false,
        riskClass: "conservative",
      })
      .returning({ id: accounts.id });
    const [duplex] = await tx
      .insert(accounts)
      .values({
        householdId: household.id,
        name: "Duplex Reserve",
        accountType: "duplex_reserve",
        balance: "48260.00",
        protected: true,
        riskClass: "protected",
      })
      .returning({ id: accounts.id });
    const [active] = await tx
      .insert(accounts)
      .values({
        householdId: household.id,
        name: "Capital OS",
        accountType: "active_capital",
        balance: "1180.00",
        protected: false,
        riskClass: "conservative",
      })
      .returning({ id: accounts.id });
    const [opportunity] = await tx
      .insert(accounts)
      .values({
        householdId: household.id,
        name: "Opportunity Reserve",
        accountType: "opportunity_reserve",
        balance: "6840.00",
        protected: false,
        riskClass: "conservative",
      })
      .returning({ id: accounts.id });
    const [strategyCapital] = await tx
      .insert(accounts)
      .values({
        householdId: household.id,
        name: "Strategy Capital",
        accountType: "strategy_capital",
        balance: "0.00",
        protected: false,
        riskClass: "experimental",
      })
      .returning({ id: accounts.id });

    const [goal] = await tx
      .insert(goals)
      .values({
        householdId: household.id,
        name: "First Duplex Acquisition",
        targetAmount: "120000.00",
        currentAmount: "48260.00",
        protectedAmount: "48260.00",
        weeklyContribution: "200.00",
        startDate: "2024-10-14",
        targetDate: "2027-06-30",
        priority: "critical",
        status: "active",
      })
      .returning({ id: goals.id });
    const [rule] = await tx
      .insert(allocationRules)
      .values({
        householdId: household.id,
        totalWeekly: "250.00",
        duplexReserve: "200.00",
        capitalOs: "25.00",
        opportunityReserve: "25.00",
        createdBy: owner.id,
      })
      .returning({ id: allocationRules.id });

    const [property] = await tx
      .insert(propertyGoals)
      .values({
        householdId: household.id,
        name: "Two-family, close to home",
        targetMarket: "Northside / transit",
        targetBudget: "560000.00",
        estimatedDownPayment: "120000.00",
        estimatedClosingCosts: "15000.00",
        readinessScore: "79.00",
        targetDate: "2027-06-30",
      })
      .returning({ id: propertyGoals.id });
    const milestones = [
      ["Down Payment Fund", "complete", "82.00", "$48,260 / $120k", "Fund is on the planned pace", "Review contribution pace"],
      ["Closing Cost Reserve", "complete", "46.00", "$6,840 / $15k", "Separate reserve is building", "Keep $25 weekly split"],
      ["Credit Readiness", "complete", "100.00", "762 score", "Annual report reviewed", "Confirm annual report"],
      ["Market Selection", "current", "72.00", "Northside", "Preferred neighborhoods narrowed", "Compare 3 neighborhoods"],
      ["Financing Readiness", "future", "45.00", "Lender conversation", "Income documents are next", "Collect income docs"],
      ["Property Search", "future", "25.00", "Criteria set", "Search is intentionally paused", "Wait for right listing"],
      ["Offer Readiness", "future", "10.00", "Not started", "Checklist is not yet active", "Draft offer checklist"],
      ["Acquisition", "future", "0.00", "Target Jun 2027", "Protected reserve remains the gate", "Protect closing reserve"],
    ] as const;
    await tx.insert(propertyMilestones).values(
      milestones.map(([name, status, progress, target, currentState, nextAction], index) => ({
        propertyGoalId: property.id,
        name,
        status,
        progress,
        target,
        currentState,
        nextAction,
        sortOrder: String(index + 1),
      })),
    );

    const [strategy] = await tx
      .insert(strategies)
      .values({
        householdId: household.id,
        name: "Duplex first",
        strategyType: "core_plan",
        stage: "paper",
        allocation: "0.00",
        confidenceScore: "78.00",
        riskLevel: "low",
        runtimeDays: "0",
        enabled: false,
      })
      .returning({ id: strategies.id });
    await tx.insert(strategyVersions).values({
      strategyId: strategy.id,
      version: "1.0",
      configuration: { purpose: "protected duplex acquisition plan" },
    });
    await tx.insert(strategyPerformance).values({
      strategyId: strategy.id,
      observations: "120",
      fills: "0",
      runtimeHours: "0",
      expectancy: "0",
      drawdown: "0",
      reconciliationAccuracy: "1.00000",
      criticalErrorCount: "0",
    });
    const [risk] = await tx
      .insert(riskStates)
      .values({
        householdId: household.id,
        state: "normal",
        maxActiveCapital: "5000.00",
        maxStrategyAllocation: "500.00",
        maxWeeklyRisk: "0.0100",
        maxDrawdown: "0.0500",
        minimumCashReserve: "3000.00",
        protectedCapitalLocked: true,
        emergencyStopActive: false,
      })
      .returning({ id: riskStates.id });
    const [recommendation] = await tx
      .insert(aiRecommendations)
      .values({
        householdId: household.id,
        recommendation: "Keep the duplex reserve untouched",
        rationale: "Reserve pace is already aligned with the June 2027 window.",
        expectedBenefit: "More confidence when the right property appears.",
        riskImpact: "Lower exposure to accidental strategy allocation.",
        affectedGoalId: goal.id,
        affectedCapital: "Duplex Reserve",
        evidence: ["contribution consistency", "liquidity review", "protected-capital threshold"],
        confidence: "78.00",
        status: "proposed",
      })
      .returning({ id: aiRecommendations.id });

    const openingAccounts = [
      [duplex.id, "48260.00"],
      [active.id, "1180.00"],
      [opportunity.id, "6840.00"],
    ] as const;
    for (const [destinationAccountId, amount] of openingAccounts) {
      const [transaction] = await tx
        .insert(ledgerTransactions)
        .values({
          householdId: household.id,
          sourceAccountId: treasury.id,
          destinationAccountId,
          amount,
          category: "contribution",
          status: "completed",
          createdBy: owner.id,
          metadata: { seed: true, description: "Opening capital" },
        })
        .returning({ id: ledgerTransactions.id });
      await tx.insert(ledgerEntries).values([
        { transactionId: transaction.id, accountId: treasury.id, debit: amount, credit: "0.00" },
        { transactionId: transaction.id, accountId: destinationAccountId, debit: "0.00", credit: amount },
      ]);
    }

    await tx.insert(contributions).values(
      ["2024-10-04", "2024-10-11", "2024-10-18"].map((createdAt, index) => ({
        householdId: household.id,
        goalId: goal.id,
        allocationRuleId: rule.id,
        amount: "250.00",
        status: "completed" as const,
        idempotencyKey: `seed-week-${index + 1}`,
        createdBy: owner.id,
        createdAt: new Date(`${createdAt}T12:00:00.000Z`),
        metadata: { seed: true },
      })),
    );
    await tx.insert(auditEvents).values([
      {
        householdId: household.id,
        eventType: "household_initialized",
        actor: owner.id,
        entity: "household",
        entityId: household.id,
        reason: "Seeded development household",
        metadata: { seed: true },
      },
      {
        householdId: household.id,
        eventType: "allocation_rule_created",
        actor: owner.id,
        entity: "allocation_rule",
        entityId: rule.id,
        afterState: { totalWeekly: "250.00", duplexReserve: "200.00", capitalOs: "25.00", opportunityReserve: "25.00" },
        reason: "Default weekly rhythm",
        metadata: { seed: true },
      },
      {
        householdId: household.id,
        eventType: "risk_state_initialized",
        actor: owner.id,
        entity: "risk_state",
        entityId: risk.id,
        afterState: { protectedCapitalLocked: true, state: "normal" },
        reason: "Capital Governor defaults",
        metadata: { seed: true },
      },
    ]);

    return {
      householdId: household.id,
      ownerId: owner.id,
      goalId: goal.id,
      duplexAccountId: duplex.id,
      capitalOsAccountId: active.id,
      opportunityAccountId: opportunity.id,
      strategyCapitalAccountId: strategyCapital.id,
      treasuryAccountId: treasury.id,
      allocationRuleId: rule.id,
      propertyGoalId: property.id,
      strategyId: strategy.id,
      recommendationId: recommendation.id,
      riskStateId: risk.id,
    };
  });

  seedContext = result;
  return result;
}