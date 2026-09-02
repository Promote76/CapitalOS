import { centsToMoney, parseMoneyToCents } from "./finance.ts";

export type BusinessCapitalInput = {
  revenue: Array<{ amount: string; category?: string }>;
  expenses: Array<{ amount: string; classification?: string }>;
  distributions: Array<{ amount: string; status: string }>;
  businessCash: string;
  businessLiabilities?: string;
  reserveTarget: string;
  taxReserve: string;
  safetyBuffer: string;
  ownershipPercentage: string;
};

export function calculateBusinessCapital(input: BusinessCapitalInput) {
  const revenueCents = input.revenue
    .filter((item) => !["owner_contribution", "intercompany_transfer"].includes(item.category ?? ""))
    .reduce((sum, item) => sum + parseMoneyToCents(item.amount), 0);
  const expenseCents = input.expenses
    .filter((item) => item.classification !== "owner_distribution")
    .reduce((sum, item) => sum + parseMoneyToCents(item.amount), 0);
  const distributionCents = input.distributions
    .filter((item) => !["rejected", "cancelled"].includes(item.status))
    .reduce((sum, item) => sum + parseMoneyToCents(item.amount), 0);
  const businessCashCents = parseMoneyToCents(input.businessCash);
  const liabilitiesCents = parseMoneyToCents(input.businessLiabilities ?? "0");
  const reserveFloorCents =
    parseMoneyToCents(input.reserveTarget) +
    parseMoneyToCents(input.taxReserve) +
    parseMoneyToCents(input.safetyBuffer);
  const safeToDistributeCents = Math.max(0, businessCashCents - reserveFloorCents - distributionCents);
  const ownershipBasisPoints = Math.round(Number(input.ownershipPercentage) * 1_000);
  const ownedEquityCents = Math.round(Math.max(0, businessCashCents - liabilitiesCents) * ownershipBasisPoints / 100_000);

  return {
    revenueCents,
    expenseCents,
    profitCents: revenueCents - expenseCents,
    distributionCents,
    reserveFloorCents,
    safeToDistributeCents,
    ownedEquityCents,
  };
}

export function assertDistributionWithinReserve(amount: string, safeToDistributeCents: number) {
  const amountCents = parseMoneyToCents(amount);
  if (amountCents <= 0) throw new Error("Distribution amount must be positive");
  if (amountCents > safeToDistributeCents) {
    throw new Error(`Distribution exceeds the business reserve floor; maximum reviewable amount is ${centsToMoney(safeToDistributeCents)}`);
  }
}

export function calculateBusinessHealth(input: {
  profitCents: number;
  revenueCents: number;
  reserveCoverageMonths: number;
  concentrationPercent: number;
}) {
  const margin = input.revenueCents > 0 ? input.profitCents / input.revenueCents : 0;
  const score =
    45 +
    Math.min(20, Math.max(-20, margin * 50)) +
    Math.min(25, input.reserveCoverageMonths * 6) -
    Math.max(0, input.concentrationPercent - 50) * 0.3;
  return Math.max(0, Math.min(100, Math.round(score)));
}