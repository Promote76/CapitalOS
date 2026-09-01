import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  accounts,
  aiRecommendations,
  allocationRules,
  auditEvents,
  bankConnections,
  emergencyReserves,
  financeBills,
  financeCategories,
  financeSnapshots,
  financeTransactions,
  financialAccounts,
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
  incomeSources,
  recurringTransactions,
  strategyPerformance,
  strategyVersions,
  strategies,
  users,
  upcomingExpenses,
} from "@workspace/db";

const DEMO_HOUSEHOLD_NAME = "Morgan household";

async function ensureHouseholdFinanceSeed(householdId: string) {
  const existingAccount = await db
    .select({ id: financialAccounts.id })
    .from(financialAccounts)
    .where(eq(financialAccounts.householdId, householdId))
    .limit(1);
  if (existingAccount[0]) {
    const existingSnapshot = await db
      .select({ id: financeSnapshots.id })
      .from(financeSnapshots)
      .where(and(eq(financeSnapshots.householdId, householdId), eq(financeSnapshots.snapshotDate, "2026-08-31")))
      .limit(1);
    if (!existingSnapshot[0]) {
      await db.insert(financeSnapshots).values({
        householdId,
        snapshotDate: "2026-08-31",
        grossInflow: "8400.00",
        essentialOutflow: "3148.00",
        discretionaryOutflow: "403.00",
        debtService: "350.00",
        savingsContributions: "900.00",
        investmentContributions: "100.00",
        netCashFlow: "3499.00",
        freeCashFlow: "3499.00",
        safeToDeploy: "0.00",
        safeToDeployConfidence: "86.00",
        financialHealthScore: "83.00",
        budgetPerformance: { month: "August 2026", source: "seeded household ledger" },
      });
    }
    return;
  }

  await db.transaction(async (tx) => {
    const [connection] = await tx
      .insert(bankConnections)
      .values({
        householdId,
        provider: "manual",
        status: "manual",
        institutionName: "Manual household ledger",
      })
      .returning({ id: bankConnections.id });
    const [checking] = await tx.insert(financialAccounts).values({
      householdId,
      bankConnectionId: connection.id,
      institution: "Community checking",
      nickname: "Household checking",
      accountType: "checking",
      currentBalance: "5200.00",
      availableBalance: "5200.00",
      connectionStatus: "manual",
      dataSource: "manual",
      lastSync: new Date(),
      lastSuccessfulSync: new Date(),
    }).returning({ id: financialAccounts.id });
    const [savings] = await tx.insert(financialAccounts).values({
      householdId,
      bankConnectionId: connection.id,
      institution: "Community savings",
      nickname: "Emergency reserve",
      accountType: "savings",
      currentBalance: "6400.00",
      availableBalance: "6400.00",
      connectionStatus: "manual",
      dataSource: "manual",
      lastSync: new Date(),
      lastSuccessfulSync: new Date(),
    }).returning({ id: financialAccounts.id });
    const [card] = await tx.insert(financialAccounts).values({
      householdId,
      bankConnectionId: connection.id,
      institution: "Community credit union",
      nickname: "Everyday card",
      accountType: "credit_card",
      currentBalance: "-780.00",
      availableBalance: "4220.00",
      connectionStatus: "manual",
      dataSource: "manual",
      lastSync: new Date(),
      lastSuccessfulSync: new Date(),
    }).returning({ id: financialAccounts.id });

    const categoryRows = await tx.insert(financeCategories).values([
      { householdId, name: "Household income", categoryType: "income", essentialStatus: "essential", monthlyTarget: "8400.00", warningThreshold: "0.90" },
      { householdId, name: "Housing", categoryType: "fixed_expense", essentialStatus: "essential", monthlyTarget: "1800.00", warningThreshold: "1.05" },
      { householdId, name: "Food", categoryType: "variable_essential", essentialStatus: "essential", monthlyTarget: "600.00", warningThreshold: "1.05" },
      { householdId, name: "Transportation", categoryType: "variable_essential", essentialStatus: "essential", monthlyTarget: "420.00", warningThreshold: "1.05" },
      { householdId, name: "Utilities", categoryType: "fixed_expense", essentialStatus: "essential", monthlyTarget: "260.00", warningThreshold: "1.05" },
      { householdId, name: "Insurance", categoryType: "fixed_expense", essentialStatus: "essential", monthlyTarget: "320.00", warningThreshold: "1.05" },
      { householdId, name: "Debt payment", categoryType: "debt_payment", essentialStatus: "essential", monthlyTarget: "350.00", warningThreshold: "1.05" },
      { householdId, name: "Personal", categoryType: "variable_discretionary", essentialStatus: "discretionary", monthlyTarget: "300.00", warningThreshold: "1.10" },
      { householdId, name: "Entertainment", categoryType: "variable_discretionary", essentialStatus: "discretionary", monthlyTarget: "180.00", warningThreshold: "1.10" },
      { householdId, name: "Duplex Fund", categoryType: "savings", essentialStatus: "essential", monthlyTarget: "800.00", warningThreshold: "0.95" },
      { householdId, name: "Capital OS", categoryType: "investment", essentialStatus: "mixed", monthlyTarget: "100.00", warningThreshold: "0.95" },
      { householdId, name: "Opportunity Reserve", categoryType: "savings", essentialStatus: "mixed", monthlyTarget: "100.00", warningThreshold: "0.95" },
    ]).returning();
    const categoryId = (name: string) => categoryRows.find((category) => category.name === name)!.id;
    await tx.insert(financeTransactions).values([
      { householdId, accountId: checking.id, externalId: "seed-income-aug", transactionDate: "2026-08-01", description: "Household payroll", merchant: "Household income", originalAmount: "8400.00", amount: "8400.00", categoryId: categoryId("Household income"), dataSource: "manual", reviewStatus: "approved" },
      { householdId, accountId: checking.id, externalId: "seed-housing-aug", transactionDate: "2026-08-02", description: "Monthly housing payment", merchant: "Housing", originalAmount: "1800.00", amount: "-1800.00", categoryId: categoryId("Housing"), dataSource: "manual", reviewStatus: "approved" },
      { householdId, accountId: checking.id, externalId: "seed-food-aug", transactionDate: "2026-08-08", description: "Groceries and household goods", merchant: "Food", originalAmount: "472.00", amount: "-472.00", categoryId: categoryId("Food"), dataSource: "manual", reviewStatus: "approved" },
      { householdId, accountId: checking.id, externalId: "seed-transit-aug", transactionDate: "2026-08-10", description: "Fuel and transit", merchant: "Transportation", originalAmount: "312.00", amount: "-312.00", categoryId: categoryId("Transportation"), dataSource: "manual", reviewStatus: "approved" },
      { householdId, accountId: checking.id, externalId: "seed-utilities-aug", transactionDate: "2026-08-12", description: "Utilities", merchant: "Utilities", originalAmount: "244.00", amount: "-244.00", categoryId: categoryId("Utilities"), dataSource: "manual", reviewStatus: "approved" },
      { householdId, accountId: checking.id, externalId: "seed-insurance-aug", transactionDate: "2026-08-14", description: "Insurance premium", merchant: "Insurance", originalAmount: "320.00", amount: "-320.00", categoryId: categoryId("Insurance"), dataSource: "manual", reviewStatus: "approved" },
      { householdId, accountId: card.id, externalId: "seed-debt-aug", transactionDate: "2026-08-16", description: "Card payment", merchant: "Debt payment", originalAmount: "350.00", amount: "-350.00", categoryId: categoryId("Debt payment"), dataSource: "manual", reviewStatus: "approved" },
      { householdId, accountId: card.id, externalId: "seed-personal-aug", transactionDate: "2026-08-18", description: "Personal spending", merchant: "Personal", originalAmount: "265.00", amount: "-265.00", categoryId: categoryId("Personal"), dataSource: "manual", reviewStatus: "approved" },
      { householdId, accountId: card.id, externalId: "seed-entertainment-aug", transactionDate: "2026-08-20", description: "Streaming and dining", merchant: "Entertainment", originalAmount: "138.00", amount: "-138.00", categoryId: categoryId("Entertainment"), dataSource: "manual", reviewStatus: "approved" },
      { householdId, accountId: savings.id, externalId: "seed-duplex-aug", transactionDate: "2026-08-23", description: "Protected duplex contribution", merchant: "Duplex Fund", originalAmount: "800.00", amount: "-800.00", categoryId: categoryId("Duplex Fund"), dataSource: "manual", reviewStatus: "approved" },
      { householdId, accountId: savings.id, externalId: "seed-capital-aug", transactionDate: "2026-08-24", description: "Capital OS contribution", merchant: "Capital OS", originalAmount: "100.00", amount: "-100.00", categoryId: categoryId("Capital OS"), dataSource: "manual", reviewStatus: "approved" },
      { householdId, accountId: savings.id, externalId: "seed-opportunity-aug", transactionDate: "2026-08-25", description: "Opportunity reserve contribution", merchant: "Opportunity Reserve", originalAmount: "100.00", amount: "-100.00", categoryId: categoryId("Opportunity Reserve"), dataSource: "manual", reviewStatus: "approved" },
    ]);
    await tx.insert(recurringTransactions).values([
      { householdId, accountId: checking.id, categoryId: categoryId("Housing"), merchant: "Housing payment", expectedAmount: "1800.00", averageAmount: "1800.00", frequency: "monthly", nextExpectedDate: "2026-09-02", confidence: "0.98", essentialStatus: "essential", annualCost: "21600.00" },
      { householdId, accountId: checking.id, categoryId: categoryId("Insurance"), merchant: "Insurance premium", expectedAmount: "320.00", averageAmount: "320.00", frequency: "monthly", nextExpectedDate: "2026-09-14", confidence: "0.96", essentialStatus: "essential", annualCost: "3840.00" },
      { householdId, accountId: card.id, categoryId: categoryId("Entertainment"), merchant: "Streaming bundle", expectedAmount: "82.00", averageAmount: "82.00", frequency: "monthly", nextExpectedDate: "2026-09-20", confidence: "0.91", essentialStatus: "discretionary", annualCost: "984.00" },
      { householdId, accountId: savings.id, categoryId: categoryId("Duplex Fund"), merchant: "Weekly savings", expectedAmount: "200.00", averageAmount: "200.00", frequency: "weekly", nextExpectedDate: "2026-09-04", confidence: "0.99", essentialStatus: "essential", annualCost: "10400.00" },
    ]);
    await tx.insert(financeBills).values([
      { householdId, accountId: checking.id, billName: "Housing payment", dueDate: "2026-09-02", expectedAmount: "1800.00", status: "due_soon", essential: true, autoPay: true },
      { householdId, accountId: checking.id, billName: "Insurance premium", dueDate: "2026-09-14", expectedAmount: "320.00", status: "upcoming", essential: true, autoPay: true },
      { householdId, accountId: card.id, billName: "Credit card payment", dueDate: "2026-09-18", expectedAmount: "350.00", status: "estimated", essential: true, autoPay: false },
    ]);
    await tx.insert(upcomingExpenses).values([
      { householdId, name: "Vehicle repair buffer", estimatedAmount: "600.00", expectedDate: "2026-09-12", priority: "high", required: true, fundedAmount: "150.00" },
      { householdId, name: "Duplex inspection planning", estimatedAmount: "450.00", expectedDate: "2026-10-15", priority: "normal", required: true, fundedAmount: "0.00" },
    ]);
    await tx.insert(incomeSources).values({
      householdId,
      name: "Household payroll",
      sourceType: "employment",
      expectedMonthly: "8400.00",
      cadence: "monthly",
      nextPayDate: "2026-09-15",
    });
    await tx.insert(emergencyReserves).values({
      householdId,
      targetMonths: 3,
      essentialMonthlyExpenses: "3150.00",
      currentAmount: "6400.00",
    });
    await tx.insert(financeSnapshots).values({
      householdId,
      snapshotDate: "2026-08-31",
      grossInflow: "8400.00",
      essentialOutflow: "3148.00",
      discretionaryOutflow: "403.00",
      debtService: "350.00",
      savingsContributions: "900.00",
      investmentContributions: "100.00",
      netCashFlow: "3499.00",
      freeCashFlow: "3499.00",
      safeToDeploy: "0.00",
      safeToDeployConfidence: "86.00",
      financialHealthScore: "83.00",
      budgetPerformance: { month: "August 2026", source: "seeded household ledger" },
    });
  });
}

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
      await ensureHouseholdFinanceSeed(seedContext.householdId);
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
  await ensureHouseholdFinanceSeed(seedContext.householdId);
  return result;
}