import { and, eq, sql } from "drizzle-orm";
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
  buyBoxes,
  propertyCandidates,
  propertyReadinessSnapshots,
  financingScenarios,
  preapprovalRecords,
  targetMarkets,
  propertyDocuments,
  riskStates,
  incomeSources,
  recurringTransactions,
  strategyPerformance,
  strategyVersions,
  strategies,
  treasuryBuckets,
  treasuryPolicies,
  users,
  upcomingExpenses,
} from "@workspace/db";
import { activeSecurityContext } from "../middleware/request-scope";

const DEMO_HOUSEHOLD_NAME = "Morgan household";

export async function isDemoHousehold(householdId: string): Promise<boolean> {
  const [household] = await db
    .select({ name: households.name })
    .from(households)
    .where(eq(households.id, householdId))
    .limit(1);
  return household?.name === DEMO_HOUSEHOLD_NAME;
}

async function ensureTreasurySeed(householdId: string, ownerId: string, fixtureMode: boolean) {
  const [existingPolicy] = await db
    .select({ id: treasuryPolicies.id })
    .from(treasuryPolicies)
    .where(eq(treasuryPolicies.householdId, householdId))
    .limit(1);
  if (!existingPolicy) {
    await db.insert(treasuryPolicies).values({
      householdId,
      minimumOperatingCash: fixtureMode ? "2000.00" : "0.00",
      emergencyTargetMonths: fixtureMode ? 6 : 0,
      minimumWeeklyDuplexContribution: fixtureMode ? "200.00" : "0.00",
      maximumStrategyPercent: fixtureMode ? "15" : "0",
      maximumSingleStrategyPercent: fixtureMode ? "5" : "0",
      maximumSingleVenuePercent: fixtureMode ? "5" : "0",
      maximumIlliquidPercent: fixtureMode ? "20" : "0",
      maximumActivePercent: fixtureMode ? "30" : "0",
      autoScale: false,
      hierarchy: fixtureMode ? [
        "Required household obligations",
        "Minimum operating cash",
        "Emergency reserve",
        "Protected Duplex reserve",
        "Closing cost reserve",
        "Opportunity reserve",
        "Treasury / liquid yield",
        "Validated strategy capital",
      ] : [],
      updatedBy: ownerId,
    });
  }

  if (!fixtureMode) {
    const remediatedPolicy = await db
      .update(treasuryPolicies)
      .set({
        minimumOperatingCash: "0.00",
        emergencyTargetMonths: 0,
        minimumWeeklyDuplexContribution: "0.00",
        maximumStrategyPercent: "0",
        maximumSingleStrategyPercent: "0",
        maximumSingleVenuePercent: "0",
        maximumIlliquidPercent: "0",
        maximumActivePercent: "0",
        hierarchy: [],
        updatedAt: new Date(),
        updatedBy: ownerId,
      })
      .where(and(
        eq(treasuryPolicies.householdId, householdId),
        eq(treasuryPolicies.minimumOperatingCash, "2000.00"),
        eq(treasuryPolicies.emergencyTargetMonths, 6),
        eq(treasuryPolicies.minimumWeeklyDuplexContribution, "200.00"),
      ))
      .returning({ id: treasuryPolicies.id });

    const fingerprints = [
      ["Household Operating Cash", "OPERATING", "3000.00", "3500.00"],
      ["Emergency Reserve", "EMERGENCY", "18000.00", "12000.00"],
      ["Duplex Reserve", "PROTECTED_GOAL", "120000.00", "0.00"],
      ["Closing Cost Reserve", "PROPERTY", "20000.00", "0.00"],
      ["Opportunity Reserve", "OPPORTUNITY", "10000.00", "0.00"],
      ["Treasury Reserve", "TREASURY", "15000.00", "0.00"],
      ["Capital OS Strategy Capital", "STRATEGY", "5000.00", "0.00"],
      ["Property Acquisition Capital", "PROPERTY", "135000.00", "0.00"],
      ["Future 4-Plex Reserve", "LONG_TERM", "0.00", "0.00"],
    ] as const;
    const removedBucketIds: string[] = [];
    for (const [name, bucketType, targetAmount, currentBalance] of fingerprints) {
      const removed = await db
        .delete(treasuryBuckets)
        .where(and(
          eq(treasuryBuckets.householdId, householdId),
          eq(treasuryBuckets.name, name),
          eq(treasuryBuckets.bucketType, bucketType),
          eq(treasuryBuckets.targetAmount, targetAmount),
          eq(treasuryBuckets.currentBalance, currentBalance),
        ))
        .returning({ id: treasuryBuckets.id });
      removedBucketIds.push(...removed.map(({ id }) => id));
    }
    if (remediatedPolicy.length > 0 || removedBucketIds.length > 0) {
      await db.insert(auditEvents).values({
        householdId,
        eventType: "authenticated_household_demo_data_removed",
        actor: ownerId,
        entity: "household",
        entityId: householdId,
        reason: "Removed untouched sample Treasury values from an authenticated household.",
        metadata: {
          policyNeutralized: remediatedPolicy.length > 0,
          treasuryBucketsRemoved: removedBucketIds.length,
        },
      });
    }
    return;
  }

  const existingBuckets = await db
    .select({
      id: treasuryBuckets.id,
      bucketType: treasuryBuckets.bucketType,
      currentBalance: treasuryBuckets.currentBalance,
    })
    .from(treasuryBuckets)
    .where(eq(treasuryBuckets.householdId, householdId))
    .limit(20);
  if (existingBuckets.length > 0) {
    for (const bucket of existingBuckets) {
      if (bucket.bucketType === "TREASURY" && Number(bucket.currentBalance) < 0) {
        await db
          .update(treasuryBuckets)
          .set({ currentBalance: "0.00", updatedAt: new Date() })
          .where(eq(treasuryBuckets.id, bucket.id));
      }
    }
    return;
  }

  const internalAccounts = await db
    .select({
      accountType: accounts.accountType,
      balance: accounts.balance,
    })
    .from(accounts)
    .where(eq(accounts.householdId, householdId));
  const accountBalance = (type: string) =>
    internalAccounts.find((account) => account.accountType === type)?.balance ?? "0.00";

  await db.insert(treasuryBuckets).values([
    {
      householdId,
      name: "Household Operating Cash",
      bucketType: "OPERATING",
      priority: 1,
      targetAmount: "3000.00",
      minimumAmount: "2000.00",
      maximumAmount: "10000.00",
      currentBalance: "3500.00",
      protected: false,
      liquid: true,
      liquidityClass: "IMMEDIATE",
      riskClass: "conservative",
      withdrawalPolicy: "Household obligations and recurring bills only.",
      fundingRule: "Fund before all discretionary allocations.",
    },
    {
      householdId,
      name: "Emergency Reserve",
      bucketType: "EMERGENCY",
      priority: 2,
      targetAmount: "18000.00",
      minimumAmount: "18000.00",
      maximumAmount: "36000.00",
      currentBalance: "12000.00",
      protected: true,
      liquid: true,
      liquidityClass: "ONE_TO_THREE_DAYS",
      riskClass: "protected",
      withdrawalPolicy: "Emergency expense only; human review required.",
      fundingRule: "Restore to six months of essential expenses.",
    },
    {
      householdId,
      name: "Duplex Reserve",
      bucketType: "PROTECTED_GOAL",
      priority: 3,
      targetAmount: "120000.00",
      minimumAmount: "0.00",
      maximumAmount: "250000.00",
      currentBalance: accountBalance("duplex_reserve"),
      protected: true,
      liquid: true,
      liquidityClass: "SEVEN_TO_THIRTY_DAYS",
      riskClass: "protected",
      withdrawalPolicy: "First duplex acquisition only.",
      fundingRule: "Minimum $200 weekly contribution.",
    },
    {
      householdId,
      name: "Closing Cost Reserve",
      bucketType: "PROPERTY",
      priority: 4,
      targetAmount: "20000.00",
      minimumAmount: "11500.00",
      maximumAmount: "30000.00",
      currentBalance: "0.00",
      protected: true,
      liquid: true,
      liquidityClass: "SEVEN_TO_THIRTY_DAYS",
      riskClass: "protected",
      withdrawalPolicy: "Inspection, appraisal, closing, prepaids, escrows, moving, and repairs.",
      fundingRule: "Fund before strategy increases when a property is active.",
    },
    {
      householdId,
      name: "Opportunity Reserve",
      bucketType: "OPPORTUNITY",
      priority: 5,
      targetAmount: "10000.00",
      minimumAmount: "2500.00",
      maximumAmount: "25000.00",
      currentBalance: accountBalance("opportunity_reserve"),
      protected: false,
      liquid: true,
      liquidityClass: "ONE_TO_THREE_DAYS",
      riskClass: "conservative",
      withdrawalPolicy: "Short-term strategic needs after protected priorities.",
      fundingRule: "Fund after the Duplex contribution.",
    },
    {
      householdId,
      name: "Treasury Reserve",
      bucketType: "TREASURY",
      priority: 6,
      targetAmount: "15000.00",
      minimumAmount: "0.00",
      maximumAmount: "50000.00",
      currentBalance: accountBalance("treasury"),
      protected: false,
      liquid: true,
      liquidityClass: "ONE_TO_THREE_DAYS",
      riskClass: "conservative",
      withdrawalPolicy: "Approved low-risk liquid instruments only.",
      fundingRule: "Receive surplus after reserves and goal commitments.",
    },
    {
      householdId,
      name: "Capital OS Strategy Capital",
      bucketType: "STRATEGY",
      priority: 7,
      targetAmount: "5000.00",
      minimumAmount: "0.00",
      maximumAmount: "15000.00",
      currentBalance: accountBalance("active_capital"),
      protected: false,
      liquid: true,
      liquidityClass: "SEVEN_TO_THIRTY_DAYS",
      riskClass: "experimental",
      withdrawalPolicy: "Graduated strategy and Micro-Live approval required.",
      fundingRule: "Last funded in the contribution waterfall.",
    },
    {
      householdId,
      name: "Property Acquisition Capital",
      bucketType: "PROPERTY",
      priority: 8,
      targetAmount: "135000.00",
      minimumAmount: "0.00",
      maximumAmount: "300000.00",
      currentBalance: "0.00",
      protected: true,
      liquid: true,
      liquidityClass: "SEVEN_TO_THIRTY_DAYS",
      riskClass: "protected",
      withdrawalPolicy: "Approved property closing only.",
      fundingRule: "Follow the active property goal and cash-to-close plan.",
    },
    {
      householdId,
      name: "Future 4-Plex Reserve",
      bucketType: "LONG_TERM",
      priority: 9,
      targetAmount: "0.00",
      minimumAmount: "0.00",
      maximumAmount: "500000.00",
      currentBalance: "0.00",
      protected: false,
      liquid: false,
      liquidityClass: "ILLIQUID",
      riskClass: "moderate",
      withdrawalPolicy: "Future goal review only.",
      fundingRule: "No funding until the first duplex goal is complete.",
    },
  ]);
}

async function ensurePropertyUnderwritingSeed(householdId: string, propertyGoalId: string) {
  const [buyBox] = await db.select({ id: buyBoxes.id }).from(buyBoxes).where(eq(buyBoxes.householdId, householdId)).limit(1);
  if (!buyBox) {
    await db.insert(buyBoxes).values({
      householdId,
      propertyType: "duplex",
      ownerOccupied: true,
      purchasePriceMinimum: "180000.00",
      purchasePriceMaximum: "560000.00",
      targetCashToClose: "135000.00",
      minimumBedroomsPerUnit: "2",
      minimumBathroomsPerUnit: "1",
      minimumEstimatedRent: "2200.00",
      maximumEstimatedRehabilitation: "35000.00",
      minimumCashFlow: "0.00",
      maximumMonthlyHousingCost: "2600.00",
      minimumDscrEstimate: "1.15",
      maximumPropertyAge: "100",
      minimumPropertyCondition: "fair",
      targetMarkets: ["Northside / transit"],
      excludedMarkets: [],
      truckParkingProximity: "Within 15 minutes",
      neighborhoodRequirements: "Independent entrances, stable block, transit access",
      propertyTaxCeiling: "9000.00",
      insuranceCostCeiling: "3000.00",
      minimumReadinessScore: "60",
    });
  }
  const [candidate] = await db.select({ id: propertyCandidates.id }).from(propertyCandidates).where(eq(propertyCandidates.propertyGoalId, propertyGoalId)).limit(1);
  let candidateId = candidate?.id;
  if (!candidate) {
    const [createdCandidate] = await db.insert(propertyCandidates).values({
      propertyGoalId,
      addressLabel: "Example watchlist duplex · Northside",
      city: "Chicago",
      state: "IL",
      zip: "60647",
      market: "Northside / transit",
      propertyType: "duplex",
      units: "2",
      bedrooms: "4",
      bathrooms: "2.0",
      askingPrice: "465000.00",
      estimatedMarketValue: "470000.00",
      annualPropertyTaxes: "7200.00",
      insurance: "2400.00",
      hoa: "0.00",
      estimatedRent: "2600.00",
      currentRents: "2400.00",
      vacancyAssumption: "0.05",
      repairs: "18000.00",
      immediateRepairs: "8000.00",
      deferredMaintenance: "10000.00",
      squareFootage: "2400",
      yearBuilt: "1928",
      listingSource: "Manual research",
      dateDiscovered: "2026-08-28",
      lastReviewed: "2026-08-31",
      status: "watchlist",
      readinessStatus: "needs_data",
      riskLevel: "moderate",
      notes: "Illustrative watchlist record. Verify all listing, rent, tax, insurance, and repair assumptions.",
      nextAction: "Confirm rent comparables and request an insurance quote.",
    }).returning({ id: propertyCandidates.id });
    candidateId = createdCandidate.id;
  }
  const [snapshot] = await db.select({ id: propertyReadinessSnapshots.id }).from(propertyReadinessSnapshots).where(eq(propertyReadinessSnapshots.propertyGoalId, propertyGoalId)).limit(1);
  if (!snapshot) {
    await db.insert(propertyReadinessSnapshots).values({
      householdId,
      propertyGoalId,
      score: "66.00",
      status: "Preparing",
      factors: { downPayment: 40, closingCosts: 80, emergencyReserve: 80, incomeStability: 80, cashFlow: 80, savingsConsistency: 84, debtObligations: 82, creditReadiness: 76, documentReadiness: 45, marketResearch: 72, buyBoxCompletion: 91, propertyPipeline: 25 },
      nextAction: "Collect income and reserve documents before lender conversations.",
    });
  }
  const [scenario] = await db.select({ id: financingScenarios.id }).from(financingScenarios).where(eq(financingScenarios.householdId, householdId)).limit(1);
  if (!scenario && candidateId) {
    await db.insert(financingScenarios).values([
      {
        householdId,
        propertyCandidateId: candidateId,
        name: "Conventional · 5% down",
        loanType: "conventional",
        purchasePrice: "465000.00",
        downPaymentPercent: "0.0500",
        interestRate: "0.0700",
        termYears: "30",
        mortgageInsurance: "250.00",
        loanFees: "1200.00",
        closingCosts: "11000.00",
        initialReserves: "8000.00",
        loanAmount: "441750.00",
        monthlyPrincipalInterest: "2938.97",
        estimatedMonthlyHousingCost: "3988.97",
      },
      {
        householdId,
        propertyCandidateId: candidateId,
        name: "FHA-style planning case · 3.5% down",
        loanType: "FHA-style estimate",
        purchasePrice: "465000.00",
        downPaymentPercent: "0.0350",
        interestRate: "0.0725",
        termYears: "30",
        mortgageInsurance: "365.00",
        loanFees: "1600.00",
        closingCosts: "11500.00",
        initialReserves: "8000.00",
        loanAmount: "448725.00",
        monthlyPrincipalInterest: "3050.00",
        estimatedMonthlyHousingCost: "4285.00",
      },
      {
        householdId,
        propertyCandidateId: candidateId,
        name: "Conservative · 10% down",
        loanType: "conventional",
        purchasePrice: "465000.00",
        downPaymentPercent: "0.1000",
        interestRate: "0.0675",
        termYears: "30",
        mortgageInsurance: "0.00",
        loanFees: "1000.00",
        closingCosts: "10500.00",
        initialReserves: "8000.00",
        loanAmount: "418500.00",
        monthlyPrincipalInterest: "2718.00",
        estimatedMonthlyHousingCost: "3668.00",
      },
    ]);
  }
  const [preapproval] = await db.select({ id: preapprovalRecords.id }).from(preapprovalRecords).where(eq(preapprovalRecords.householdId, householdId)).limit(1);
  if (!preapproval) {
    await db.insert(preapprovalRecords).values({
      householdId,
      provider: "Local lender conversation",
      status: "research",
      notes: "Not an approval or qualification. Use this tracker to prepare questions and documents.",
      documentsNeeded: "Pay stubs, tax returns, statements, ID, reserve history",
    });
  }
  const [market] = await db.select({ id: targetMarkets.id }).from(targetMarkets).where(eq(targetMarkets.householdId, householdId)).limit(1);
  if (!market) {
    await db.insert(targetMarkets).values([
      { householdId, name: "Northside / transit", score: "78.00", medianPrice: "465000.00", rentYield: "0.067", notes: "Strong fit for commute, independent entrances, and house-hack research." },
      { householdId, name: "Near West / neighborhood retail", score: "71.00", medianPrice: "510000.00", rentYield: "0.061", notes: "Higher entry price; compare taxes and insurance carefully." },
      { householdId, name: "Southwest / larger lots", score: "64.00", medianPrice: "395000.00", rentYield: "0.073", notes: "More space and parking; verify commute, block stability, and deferred maintenance." },
    ]);
  }
  const [document] = await db.select({ id: propertyDocuments.id }).from(propertyDocuments).where(eq(propertyDocuments.propertyGoalId, propertyGoalId)).limit(1);
  if (!document) {
    await db.insert(propertyDocuments).values([
      { propertyGoalId, name: "Income documentation", metadata: { status: "needed", private: true, description: "Recent pay stubs and tax returns" } },
      { propertyGoalId, name: "Reserve history", metadata: { status: "needed", private: true, description: "Statements showing protected reserve history" } },
      { propertyGoalId, name: "Insurance estimate", metadata: { status: "needed", private: true, description: "Property-specific quote before offer review" } },
    ]);
  }
}

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
const tenantContexts = new Map<string, SeedContext>();

export async function ensureTenantCore(
  householdId: string,
  ownerId: string,
  options: { fixtureMode?: boolean } = {},
): Promise<SeedContext> {
  const fixtureMode = options.fixtureMode ?? activeSecurityContext()?.authStrength !== "clerk_session";
  const cacheKey = `${householdId}:${fixtureMode ? "fixture" : "authenticated"}`;
  const cached = tenantContexts.get(cacheKey);
  if (cached) return cached;

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`tenant-core:${householdId}`}))`);

    const [settings] = await tx
      .select({ id: householdSettings.id })
      .from(householdSettings)
      .where(eq(householdSettings.householdId, householdId))
      .limit(1);
    if (!settings) {
      await tx.insert(householdSettings).values({
        householdId,
        aiAdvisoryOnly: true,
        blockchainEnabled: false,
        emergencyStopActive: false,
      });
    }

    const findOrCreateAccount = async (
      accountType: "duplex_reserve" | "active_capital" | "opportunity_reserve" | "treasury" | "strategy_capital",
      name: string,
      isProtected: boolean,
      riskClass: "protected" | "conservative" | "moderate" | "experimental",
    ) => {
      const [existing] = await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.householdId, householdId), eq(accounts.accountType, accountType)))
        .limit(1);
      if (existing) return existing.id;
      const [created] = await tx
        .insert(accounts)
        .values({
          householdId,
          name,
          accountType,
          balance: "0.00",
          protected: isProtected,
          riskClass,
        })
        .returning({ id: accounts.id });
      return created.id;
    };

    const duplexAccountId = await findOrCreateAccount("duplex_reserve", "Duplex Reserve", true, "protected");
    const capitalOsAccountId = await findOrCreateAccount("active_capital", "Capital OS", false, "conservative");
    const opportunityAccountId = await findOrCreateAccount("opportunity_reserve", "Opportunity Reserve", false, "conservative");
    const treasuryAccountId = await findOrCreateAccount("treasury", "Capital OS Treasury", false, "conservative");
    const strategyCapitalAccountId = await findOrCreateAccount("strategy_capital", "Strategy Capital", false, "experimental");

    if (!fixtureMode) {
      await tx.update(goals).set({
        name: "Set up your first goal",
        targetAmount: "0.00",
        currentAmount: "0.00",
        protectedAmount: "0.00",
        weeklyContribution: "0.00",
        priority: "normal",
        status: "draft",
        updatedAt: new Date(),
      }).where(and(
        eq(goals.householdId, householdId),
        eq(goals.name, "First Duplex Acquisition"),
        eq(goals.targetAmount, "120000.00"),
        eq(goals.weeklyContribution, "200.00"),
        eq(goals.currentAmount, "0.00"),
      ));
      await tx.update(allocationRules).set({
        totalWeekly: "0.00",
        duplexReserve: "0.00",
        capitalOs: "0.00",
        opportunityReserve: "0.00",
        updatedAt: new Date(),
      }).where(and(
        eq(allocationRules.householdId, householdId),
        eq(allocationRules.totalWeekly, "250.00"),
        eq(allocationRules.duplexReserve, "200.00"),
        eq(allocationRules.capitalOs, "25.00"),
        eq(allocationRules.opportunityReserve, "25.00"),
      ));
      await tx.update(propertyGoals).set({
        name: "Set up your property plan",
        updatedAt: new Date(),
      }).where(and(
        eq(propertyGoals.householdId, householdId),
        eq(propertyGoals.name, "First property plan"),
        eq(propertyGoals.targetBudget, "0.00"),
        eq(propertyGoals.estimatedDownPayment, "0.00"),
      ));
      await tx.update(strategies).set({
        name: "Set up your research plan",
        updatedAt: new Date(),
      }).where(and(
        eq(strategies.householdId, householdId),
        eq(strategies.name, "Research plan"),
        eq(strategies.allocation, "0.00"),
        eq(strategies.runtimeDays, "0"),
        eq(strategies.enabled, false),
      ));
      await tx.update(riskStates).set({
        maxActiveCapital: "0.00",
        maxStrategyAllocation: "0.00",
        maxWeeklyRisk: "0.0000",
        maxDrawdown: "0.0000",
        minimumCashReserve: "0.00",
        updatedAt: new Date(),
      }).where(and(
        eq(riskStates.householdId, householdId),
        eq(riskStates.maxActiveCapital, "5000.00"),
        eq(riskStates.maxStrategyAllocation, "500.00"),
        eq(riskStates.minimumCashReserve, "3000.00"),
      ));
    }

    const [existingGoal] = await tx
      .select({ id: goals.id })
      .from(goals)
      .where(eq(goals.householdId, householdId))
      .limit(1);
    const goalId =
      existingGoal?.id ??
      (await tx
        .insert(goals)
        .values({
          householdId,
          name: fixtureMode ? "First Duplex Acquisition" : "Set up your first goal",
          targetAmount: fixtureMode ? "120000.00" : "0.00",
          currentAmount: "0.00",
          protectedAmount: "0.00",
          weeklyContribution: fixtureMode ? "200.00" : "0.00",
          startDate: new Date().toISOString().slice(0, 10),
          targetDate: "2027-06-30",
          priority: fixtureMode ? "critical" : "normal",
          status: "draft",
        })
        .returning({ id: goals.id }))[0].id;

    const [existingRule] = await tx
      .select({ id: allocationRules.id })
      .from(allocationRules)
      .where(and(eq(allocationRules.householdId, householdId), eq(allocationRules.active, true)))
      .limit(1);
    const allocationRuleId =
      existingRule?.id ??
      (await tx
        .insert(allocationRules)
        .values({
          householdId,
          totalWeekly: fixtureMode ? "250.00" : "0.00",
          duplexReserve: fixtureMode ? "200.00" : "0.00",
          capitalOs: fixtureMode ? "25.00" : "0.00",
          opportunityReserve: fixtureMode ? "25.00" : "0.00",
          active: true,
          createdBy: ownerId,
        })
        .returning({ id: allocationRules.id }))[0].id;

    const [existingProperty] = await tx
      .select({ id: propertyGoals.id })
      .from(propertyGoals)
      .where(eq(propertyGoals.householdId, householdId))
      .limit(1);
    const propertyGoalId =
      existingProperty?.id ??
      (await tx
        .insert(propertyGoals)
        .values({
          householdId,
          name: fixtureMode ? "First property plan" : "Set up your property plan",
          targetMarket: "To be selected",
          targetBudget: "0.00",
          estimatedDownPayment: "0.00",
          estimatedClosingCosts: "0.00",
          readinessScore: "0.00",
          targetDate: "2027-06-30",
        })
        .returning({ id: propertyGoals.id }))[0].id;

    const [existingStrategy] = await tx
      .select({ id: strategies.id })
      .from(strategies)
      .where(eq(strategies.householdId, householdId))
      .limit(1);
    let strategyId = existingStrategy?.id;
    if (!strategyId) {
      const [created] = await tx
        .insert(strategies)
        .values({
          householdId,
          name: fixtureMode ? "Research plan" : "Set up your research plan",
          strategyType: "core_plan",
          stage: "research",
          allocation: "0.00",
          confidenceScore: "0.00",
          riskLevel: "low",
          runtimeDays: "0",
          enabled: false,
        })
        .returning({ id: strategies.id });
      strategyId = created.id;
      await tx.insert(strategyVersions).values({
        strategyId,
        version: "1.0",
        configuration: { purpose: "research-only until evidence is reviewed" },
      });
      await tx.insert(strategyPerformance).values({
        strategyId,
        observations: "0",
        fills: "0",
        runtimeHours: "0",
        expectancy: "0",
        drawdown: "0",
        reconciliationAccuracy: "0",
        criticalErrorCount: "0",
      });
    }

    const [existingRisk] = await tx
      .select({ id: riskStates.id })
      .from(riskStates)
      .where(eq(riskStates.householdId, householdId))
      .limit(1);
    const riskStateId =
      existingRisk?.id ??
      (await tx
        .insert(riskStates)
        .values({
          householdId,
          state: "normal",
          maxActiveCapital: fixtureMode ? "5000.00" : "0.00",
          maxStrategyAllocation: fixtureMode ? "500.00" : "0.00",
          maxWeeklyRisk: fixtureMode ? "0.0100" : "0.0000",
          maxDrawdown: fixtureMode ? "0.0500" : "0.0000",
          minimumCashReserve: fixtureMode ? "3000.00" : "0.00",
          protectedCapitalLocked: true,
          emergencyStopActive: false,
        })
        .returning({ id: riskStates.id }))[0].id;

    const [existingRecommendation] = await tx
      .select({ id: aiRecommendations.id })
      .from(aiRecommendations)
      .where(eq(aiRecommendations.householdId, householdId))
      .limit(1);
    const recommendationId =
      existingRecommendation?.id ??
      (await tx
        .insert(aiRecommendations)
        .values({
          householdId,
          recommendation: "Complete your household setup before making capital decisions",
          rationale: "New households begin with conservative defaults and no verified external accounts.",
          expectedBenefit: "Clearer financial context and safer future recommendations.",
          riskImpact: "No external or protected capital is assumed.",
          affectedGoalId: goalId,
          affectedCapital: "None",
          evidence: ["new household", "manual setup required"],
          confidence: "100.00",
          status: "proposed",
        })
        .returning({ id: aiRecommendations.id }))[0].id;

    return {
      householdId,
      ownerId,
      goalId,
      duplexAccountId,
      capitalOsAccountId,
      opportunityAccountId,
      strategyCapitalAccountId,
      treasuryAccountId,
      allocationRuleId,
      propertyGoalId,
      strategyId,
      recommendationId,
      riskStateId,
    };
  });

  tenantContexts.set(cacheKey, result);
  await ensureTreasurySeed(householdId, ownerId, fixtureMode);
  return result;
}

export async function ensureSeedData(): Promise<SeedContext> {
  const active = activeSecurityContext();
  if (active?.authStrength === "clerk_session" || active?.authStrength === "test_database") {
    return ensureTenantCore(active.householdId, active.userId);
  }
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
      await ensurePropertyUnderwritingSeed(seedContext.householdId, seedContext.propertyGoalId);
      await ensureTreasurySeed(seedContext.householdId, seedContext.ownerId, true);
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
  await ensurePropertyUnderwritingSeed(seedContext.householdId, seedContext.propertyGoalId);
  await ensureTreasurySeed(seedContext.householdId, seedContext.ownerId, true);
  return result;
}