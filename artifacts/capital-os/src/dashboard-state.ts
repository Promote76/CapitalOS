type MoneyValue = string | number | null | undefined;

export type DashboardDataState = 'loading' | 'unavailable' | 'empty' | 'ready';

function hasNonZeroMoney(values: MoneyValue[]) {
  return values.some((value) => {
    if (value === null || value === undefined || value === 'REDACTED') return false;
    const amount = Number(value);
    return Number.isFinite(amount) && Math.abs(amount) > 0;
  });
}

export function hasPersistedFinancialData(snapshot: {
  goal?: { currentAmount?: MoneyValue; protectedAmount?: MoneyValue };
  allocation?: {
    totalWeekly?: MoneyValue;
    duplexReserve?: MoneyValue;
    capitalOs?: MoneyValue;
    opportunityReserve?: MoneyValue;
  };
  portfolio?: {
    totalCapital?: MoneyValue;
    protectedCapital?: MoneyValue;
    activeCapital?: MoneyValue;
    cashReserve?: MoneyValue;
  };
  accounts?: Array<{ balance?: MoneyValue }>;
}) {
  return hasNonZeroMoney([
    snapshot.goal?.currentAmount,
    snapshot.goal?.protectedAmount,
    snapshot.allocation?.totalWeekly,
    snapshot.allocation?.duplexReserve,
    snapshot.allocation?.capitalOs,
    snapshot.allocation?.opportunityReserve,
    snapshot.portfolio?.totalCapital,
    snapshot.portfolio?.protectedCapital,
    snapshot.portfolio?.activeCapital,
    snapshot.portfolio?.cashReserve,
    ...(snapshot.accounts ?? []).map((account) => account.balance),
  ]);
}

export function dashboardDataState(
  snapshot: Parameters<typeof hasPersistedFinancialData>[0] | undefined,
  isLoading: boolean,
  isError: boolean,
): DashboardDataState {
  if (isLoading) return 'loading';
  if (isError || !snapshot) return 'unavailable';
  return hasPersistedFinancialData(snapshot) ? 'ready' : 'empty';
}