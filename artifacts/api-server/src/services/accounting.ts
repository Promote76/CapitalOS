import { and, desc, eq, sql } from "drizzle-orm";
import { db, financeCategories, financeSnapshots, financeTransactions, financialAccounts, ledgerEntries, ledgerTransactions } from "@workspace/db";
import { canViewFinancialBalance } from "../domain/household-finance";
import { calculateNetWorth, calculateNetWorthAttribution, ledgerDebitsEqualCredits, reconcileCrossViewTotals, summarizeCashFlow } from "../domain/accounting";
import type { Actor } from "./capital-os";

const cents = (value: string | number | null | undefined) => {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
};

const money = (value: number) => (value / 100).toFixed(2);
const dateOnly = (value: Date | string | null | undefined) => value instanceof Date ? value.toISOString().slice(0, 10) : value ?? null;

const liabilityTypes = new Set(["credit_card", "loan", "mortgage"]);
const liquidTypes = new Set(["checking", "savings", "money_market", "treasury", "opportunity_reserve", "protected_duplex"]);
const investedTypes = new Set(["brokerage", "retirement", "crypto"]);

function categoryName(category: { id: string; name: string } | undefined) {
  return category?.name ?? "Uncategorized";
}

export async function getAccountingOverview(actor: Actor) {
  const householdId = actor.householdId;
  const [accountRows, transactions, categories, snapshots, ledgerRows] = await Promise.all([
    db.select().from(financialAccounts).where(eq(financialAccounts.householdId, householdId)),
    db.select().from(financeTransactions).where(eq(financeTransactions.householdId, householdId)),
    db.select({ id: financeCategories.id, name: financeCategories.name, categoryType: financeCategories.categoryType }).from(financeCategories).where(eq(financeCategories.householdId, householdId)),
    db.select().from(financeSnapshots).where(eq(financeSnapshots.householdId, householdId)).orderBy(desc(financeSnapshots.snapshotDate)).limit(24),
    db.select({ transactionId: ledgerTransactions.id, debit: ledgerEntries.debit, credit: ledgerEntries.credit })
      .from(ledgerTransactions)
      .innerJoin(ledgerEntries, eq(ledgerEntries.transactionId, ledgerTransactions.id))
       .where(and(
         eq(ledgerTransactions.householdId, householdId),
         sql`coalesce(${ledgerTransactions.metadata}->>'executionOnly', 'false') <> 'true'`,
       )),
  ]);

  const visibleRows = accountRows.filter((account) => account.includedInNetWorth && canViewFinancialBalance(actor.role, account.protected));
  const assetRows = visibleRows
    .filter((account) => !liabilityTypes.has(account.accountType) && cents(account.currentBalance) > 0)
    .map((account) => ({
      name: account.nickname,
      category: account.accountType,
      institution: account.institution,
      amount: money(cents(account.currentBalance)),
      valueStatus: account.dataSource === "manual" ? "user_entered" : "imported",
      valuationDate: dateOnly(account.lastSuccessfulSync ?? account.lastSync ?? account.updatedAt),
      protected: account.protected,
    }));
  const liabilityRows = visibleRows
    .filter((account) => liabilityTypes.has(account.accountType) && (cents(account.currentBalance) !== 0 || account.accountType !== "credit_card"))
    .map((account) => ({
      name: account.nickname,
      category: account.accountType,
      institution: account.institution,
      amount: money(Math.abs(cents(account.currentBalance))),
      interestRate: null,
      monthlyPayment: null,
      maturity: null,
    }));

  const totalAssets = assetRows.reduce((sum, row) => sum + cents(row.amount), 0);
  const totalLiabilities = liabilityRows.reduce((sum, row) => sum + cents(row.amount), 0);
  const netWorth = calculateNetWorth(totalAssets, totalLiabilities);
  const liquidAssets = visibleRows
    .filter((account) => liquidTypes.has(account.accountType) && cents(account.currentBalance) > 0)
    .reduce((sum, account) => sum + cents(account.currentBalance), 0);
  const protectedCapital = visibleRows
    .filter((account) => account.protected || account.accountType === "protected_duplex")
    .reduce((sum, account) => sum + Math.max(0, cents(account.currentBalance)), 0);
  const investedCapital = visibleRows
    .filter((account) => investedTypes.has(account.accountType))
    .reduce((sum, account) => sum + Math.max(0, cents(account.currentBalance)), 0);
  const businessEquity = visibleRows
    .filter((account) => account.accountType === "business_checking")
    .reduce((sum, account) => sum + Math.max(0, cents(account.currentBalance)), 0);

  const period = [...transactions.map((row) => row.transactionDate), ...snapshots.map((row) => row.snapshotDate)].sort().at(-1) ?? new Date().toISOString().slice(0, 10);
  const periodPrefix = period.slice(0, 7);
  const periodTransactions = transactions.filter((transaction) => transaction.transactionDate.startsWith(periodPrefix));
  const byCategory = new Map(categories.map((category) => [category.id, category]));
  const cashFlowSummary = summarizeCashFlow(periodTransactions.map((transaction) => {
    const categoryType = byCategory.get(transaction.categoryId ?? "")?.categoryType;
    const kind = categoryType === "income"
      ? "income"
      : categoryType === "transfer" || transaction.transferGroupId
        ? "transfer"
        : categoryType === "savings" || categoryType === "investment"
          ? "contribution"
          : categoryType === "debt_payment"
            ? "debt_payment"
            : "expense";
    return { amountCents: cents(transaction.amount), kind };
  }));
  const income = cashFlowSummary.incomeCents;
  const expenses = cashFlowSummary.expensesCents;
  const contributions = cashFlowSummary.contributionsCents;
  const debtReduction = cashFlowSummary.debtReductionCents;
  const netCashFlow = cashFlowSummary.netCashFlowCents;
  const snapshot = snapshots.find((row) => row.snapshotDate.startsWith(periodPrefix));
  const uncategorized = periodTransactions.filter((transaction) => !transaction.categoryId || transaction.reviewStatus !== "approved").length;
  const staleAccounts = visibleRows.filter((account) => {
    const date = account.lastSuccessfulSync ?? account.lastSync;
    return !date || Date.now() - date.getTime() > 1000 * 60 * 60 * 24 * 45;
  }).length;

  const ledgerTotals = new Map<string, { debit: number; credit: number }>();
  for (const row of ledgerRows) {
    const total = ledgerTotals.get(row.transactionId) ?? { debit: 0, credit: 0 };
    total.debit += cents(row.debit);
    total.credit += cents(row.credit);
    ledgerTotals.set(row.transactionId, total);
  }
  const ledgerBalanced = ledgerDebitsEqualCredits(
    Array.from(ledgerTotals.values()).map((total) => ({ debitCents: total.debit, creditCents: total.credit })),
  );
  const crossView = reconcileCrossViewTotals({
    accountingAssetsCents: totalAssets,
    accountingLiabilitiesCents: totalLiabilities,
    accountingNetWorthCents: netWorth,
  });
  const dataConfidence = Math.max(0, Math.min(100, 94 - uncategorized * 3 - staleAccounts * 4 - (ledgerBalanced ? 0 : 20)));
  const previousSnapshot = snapshots.find((row) => row.snapshotDate < period);
  const ytdSnapshots = snapshots.filter((row) => row.snapshotDate.slice(0, 4) === period.slice(0, 4));
  const snapshotNetChange = snapshot ? cents(snapshot.netCashFlow) : netCashFlow;
  const monthChange = snapshotNetChange || netCashFlow;
  const investmentGrowth = 0;
  const attribution = calculateNetWorthAttribution({
    netWorthChangeCents: monthChange,
    capitalContributedCents: contributions,
    investmentGrowthCents: investmentGrowth,
    debtReductionCents: debtReduction,
  });

  const accountAsOf = visibleRows.map((account) => account.lastSuccessfulSync ?? account.lastSync).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0];
  return {
    asOf: dateOnly(accountAsOf ?? snapshot?.createdAt) ?? period,
    period: { label: periodPrefix, start: `${periodPrefix}-01`, end: period },
    disclaimer: "Internal planning and recordkeeping view only. This is not tax, legal, accounting, or investment advice.",
    netWorth: {
      totalAssets: money(totalAssets),
      totalLiabilities: money(totalLiabilities),
      netWorth: money(netWorth),
      liquidNetWorth: money(liquidAssets - totalLiabilities),
      protectedCapital: money(protectedCapital),
      investedCapital: money(investedCapital),
      realEstateEquity: "0.00",
      businessEquity: money(businessEquity),
      cashTreasury: money(liquidAssets),
    },
    change: {
      month: money(monthChange),
      yearToDate: money(ytdSnapshots.reduce((sum, row) => sum + cents(row.netCashFlow), 0) || netCashFlow),
      capitalContributed: money(contributions),
      investmentGrowth: money(investmentGrowth),
      debtReduction: money(debtReduction),
      other: money(attribution.otherCents),
      reconciles: attribution.reconciles,
    },
    balanceSheet: {
      assets: assetRows,
      liabilities: liabilityRows,
      totalAssets: money(totalAssets),
      totalLiabilities: money(totalLiabilities),
      netWorth: money(netWorth),
      comparison: { previousPeriod: previousSnapshot ? money(netWorth - cents(previousSnapshot.netCashFlow)) : null, quarterEnd: null, yearEnd: null },
    },
    capitalStatement: {
      beginningCapital: money(Math.max(0, totalAssets - monthChange)),
      householdContributions: money(contributions),
      withdrawals: "0.00",
      realizedGainsLosses: "0.00",
      unrealizedGainsLosses: money(investmentGrowth),
      income: money(income),
      fees: "0.00",
      endingCapital: money(totalAssets),
    },
    incomeStatement: {
      income: [{ category: "Employment / contract income", amount: money(income) }],
      expenses: [{ category: "Household and other expenses", amount: money(expenses) }],
      totalIncome: money(income),
      totalExpenses: money(expenses),
      netCashIncome: money(income - expenses),
      taxableIncomeDisclaimer: "Accounting income is not taxable income. Review tax treatment with a qualified professional.",
    },
    cashFlow: {
      operating: money(income - Math.max(0, expenses - contributions)),
      investing: money(-contributions),
      financing: money(-debtReduction),
      transfers: "0.00",
      netCashFlow: money(netCashFlow),
    },
    metrics: {
      savingsRate: income > 0 ? Number(((contributions / income) * 100).toFixed(1)) : 0,
      debtToAssetRatio: totalAssets > 0 ? Number(((totalLiabilities / totalAssets) * 100).toFixed(1)) : 0,
      debtToNetWorth: netWorth > 0 ? Number(((totalLiabilities / netWorth) * 100).toFixed(1)) : 0,
      liquidAssets: money(liquidAssets),
      essentialMonths: 0,
      protectedLiquidity: money(protectedCapital),
      unrestrictedLiquidity: money(Math.max(0, liquidAssets - protectedCapital)),
      returnOnCapital: 0,
    },
    reconciliation: {
      ledgerBalanced,
      accountsIncluded: visibleRows.length,
      uncategorizedTransactions: uncategorized,
      staleAccounts,
      status: ledgerBalanced && uncategorized === 0 ? "RECONCILED" : "REVIEW_REQUIRED",
      crossView: {
        status: crossView.status,
        accountingNetWorth: money(crossView.accounting.netWorthCents),
        separateScopes: crossView.separateScopes.map((scope) => ({
          scope: scope.scope,
          amount: money(scope.amountCents),
          status: scope.status,
        })),
        note: crossView.note,
      },
    },
    confidence: {
      score: dataConfidence,
      bankSyncFreshness: Math.max(0, 100 - staleAccounts * 20),
      ledgerReconciliation: ledgerBalanced ? 100 : 0,
      categorization: Math.max(0, 100 - uncategorized * 10),
      valuationFreshness: 100,
      label: dataConfidence >= 90 ? "High confidence" : dataConfidence >= 75 ? "Review recommended" : "Limited confidence",
    },
    taxYear: {
      year: Number(period.slice(0, 4)),
      documentsCollected: 0,
      missingDocuments: ["Broker statement", "Mortgage interest statement", "Bank interest statement"],
      realizedGainsLosses: "0.00",
      reviewStatus: "SUPPORT_ONLY",
      disclaimer: "Internal planning estimate only. Tax treatment may vary. Review with a qualified tax professional.",
    },
    accounts: visibleRows.map((account) => ({
      id: account.id,
      name: account.nickname,
      institution: account.institution,
      accountType: account.accountType,
      balance: canViewFinancialBalance(actor.role, account.protected) ? account.currentBalance : null,
      includedInNetWorth: account.includedInNetWorth,
      protected: account.protected,
      dataSource: account.dataSource,
      lastSync: dateOnly(account.lastSuccessfulSync ?? account.lastSync),
      restricted: !canViewFinancialBalance(actor.role, account.protected),
    })),
  };
}