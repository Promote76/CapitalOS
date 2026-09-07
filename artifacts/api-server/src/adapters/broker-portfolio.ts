/**
 * Read-only brokerage boundary.
 *
 * This module intentionally contains no order, transfer, withdrawal, ACH,
 * journaling, wire, margin, or options-permission methods. Provider adapters
 * return normalized observations only; persistence and advisory consumers must
 * make their own authorization decisions.
 */

export const brokerFreshnessStates = ["CURRENT", "AGING", "STALE", "UNKNOWN"] as const;
export type BrokerFreshness = (typeof brokerFreshnessStates)[number];

export const brokerHealthStatuses = [
  "CONNECTED",
  "REFRESHING",
  "STALE",
  "ACTION_REQUIRED",
  "DISCONNECTED",
] as const;
export type BrokerHealthStatus = (typeof brokerHealthStatuses)[number];

export const brokerReconciliationStatuses = [
  "MATCHED",
  "MINOR_VARIANCE",
  "UNRESOLVED",
  "CRITICAL_MISMATCH",
] as const;
export type BrokerReconciliationStatus = (typeof brokerReconciliationStatuses)[number];

export const brokerTransactionClasses = [
  "trade",
  "income",
  "fee",
  "transfer",
  "corporate_action",
  "unknown",
] as const;
export type BrokerTransactionClass = (typeof brokerTransactionClasses)[number];

export type UnknownValue = string | "UNKNOWN";

export type BrokerProviderContext = {
  credentialRef: string;
};

export type BrokerAccount = {
  id: string;
  householdId: string;
  provider: string;
  /** Internal provider mapping only. Never pass to Grok or the browser. */
  providerAccountReference: string;
  accountType: string;
  displayName: string;
  status: string;
  currency: string;
  cashBalance: UnknownValue;
  buyingPower: UnknownValue;
  marginEnabled: boolean | "UNKNOWN";
  lastSyncedAt: string | null;
  dataFreshness: BrokerFreshness;
};

export type BrokerBalance = {
  accountId: string;
  cashBalance: UnknownValue;
  buyingPower: UnknownValue;
  providerTimestamp: string | null;
  receivedAt: string;
  dataFreshness: BrokerFreshness;
};

export type BrokerPosition = {
  accountId: string;
  householdId: string;
  symbol: string;
  assetType: string;
  quantity: UnknownValue;
  averageCost: UnknownValue;
  costBasis: UnknownValue;
  marketPrice: UnknownValue;
  marketValue: UnknownValue;
  unrealizedGainLoss: UnknownValue;
  realizedGainLoss: UnknownValue;
  portfolioWeight: UnknownValue;
  providerTimestamp: string | null;
  receivedAt: string;
  dataFreshness: BrokerFreshness;
};

export type BrokerOrder = {
  accountId: string;
  orderIdReference: string;
  symbol: string;
  side: string;
  orderType: string;
  quantity: UnknownValue;
  limitPrice: UnknownValue;
  stopPrice: UnknownValue;
  status: string;
  submittedAt: string | null;
  filledAt: string | null;
  filledQuantity: UnknownValue;
  averageFillPrice: UnknownValue;
  providerTimestamp: string | null;
  receivedAt: string;
  dataFreshness: BrokerFreshness;
};

export type BrokerTransaction = {
  accountId: string;
  transactionIdReference: string;
  symbol: string | null;
  transactionClass: BrokerTransactionClass;
  amount: UnknownValue;
  quantity: UnknownValue;
  description: string;
  transactionTimestamp: string | null;
  providerTimestamp: string | null;
  receivedAt: string;
  dataFreshness: BrokerFreshness;
};

export type BrokerInvestmentTransaction = BrokerTransaction & {
  transactionClass: Exclude<BrokerTransactionClass, "transfer">;
};

export type BrokerQuote = {
  symbol: string;
  assetType: string;
  marketPrice: UnknownValue;
  providerTimestamp: string | null;
  receivedAt: string;
  dataFreshness: BrokerFreshness;
};

export type BrokerMarketClock = {
  marketOpen: boolean | "UNKNOWN";
  providerTimestamp: string | null;
  receivedAt: string;
  dataFreshness: BrokerFreshness;
};

export type BrokerProviderHealth = {
  provider: string;
  state: "disabled" | "not_configured" | "ready" | "error";
  status: BrokerHealthStatus;
  lastSuccessfulSync: string | null;
  lastErrorCode: string | null;
  message: string;
  readOnly: true;
  tradingEnabled: false;
};

export type BrokerPortfolioProvider = {
  readonly provider: string;
  readonly readOnly: true;
  getAccounts(context: BrokerProviderContext): Promise<BrokerAccount[]>;
  getBalances(context: BrokerProviderContext): Promise<BrokerBalance[]>;
  getPositions(context: BrokerProviderContext): Promise<BrokerPosition[]>;
  getOrders(context: BrokerProviderContext): Promise<BrokerOrder[]>;
  getTransactions(context: BrokerProviderContext): Promise<BrokerTransaction[]>;
  getInvestmentTransactions(context: BrokerProviderContext): Promise<BrokerInvestmentTransaction[]>;
  getQuotes(context: BrokerProviderContext, symbols: string[]): Promise<BrokerQuote[]>;
  getMarketClock(context: BrokerProviderContext): Promise<BrokerMarketClock>;
  getProviderHealth(): Promise<BrokerProviderHealth>;
};

export type BrokerProviderErrorCode =
  | "PROVIDER_DISABLED"
  | "NOT_CONFIGURED"
  | "UNAUTHENTICATED"
  | "INVALID_RESPONSE"
  | "UPSTREAM_ERROR";

export class BrokerProviderError extends Error {
  public readonly code: BrokerProviderErrorCode;

  constructor(code: BrokerProviderErrorCode, message: string) {
    super(message);
    this.name = "BrokerProviderError";
    this.code = code;
  }
}

export type SchwabFeatureStatus = {
  readOnlyEnabled: boolean;
  tradingEnabled: false;
  provider: "schwab";
  connection: "not_configured" | "configured";
};

export function schwabFeatureStatus(env: NodeJS.ProcessEnv = process.env): SchwabFeatureStatus {
  const readOnlyEnabled = env.SCHWAB_READ_ONLY_ENABLED === "true";
  return {
    readOnlyEnabled,
    tradingEnabled: false,
    provider: "schwab",
    connection: readOnlyEnabled ? "configured" : "not_configured",
  };
}

function requireCredential(context: BrokerProviderContext) {
  if (!context.credentialRef.trim()) {
    throw new BrokerProviderError("NOT_CONFIGURED", "The read-only broker credential reference is not configured");
  }
}

/**
 * The live connector is intentionally not registered until an approved
 * server-side Schwab connection exists and SR-01 through SR-20 are rerun.
 * This class is still useful now: it makes every disabled path explicit and
 * prevents consumers from reaching for a generic SDK with write methods.
 */
export class SchwabReadOnlyProvider implements BrokerPortfolioProvider {
  readonly provider = "schwab";
  readonly readOnly = true as const;

  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  async getProviderHealth(): Promise<BrokerProviderHealth> {
    const status = schwabFeatureStatus(this.env);
    return {
      provider: "schwab",
      state: status.readOnlyEnabled ? "not_configured" : "disabled",
      status: status.readOnlyEnabled ? "ACTION_REQUIRED" : "DISCONNECTED",
      lastSuccessfulSync: null,
      lastErrorCode: status.readOnlyEnabled ? "NOT_CONFIGURED" : "PROVIDER_DISABLED",
      message: status.readOnlyEnabled
        ? "Schwab read-only is enabled but no approved provider connection is attached."
        : "Schwab read-only is disabled until an approved provider connection and certification exist.",
      readOnly: true,
      tradingEnabled: false,
    };
  }

  private unavailable(context: BrokerProviderContext): never {
    const status = schwabFeatureStatus(this.env);
    if (!status.readOnlyEnabled) {
      throw new BrokerProviderError(
        "PROVIDER_DISABLED",
        "Schwab read-only provider is disabled; no provider request was made",
      );
    }
    requireCredential(context);
    throw new BrokerProviderError(
      "NOT_CONFIGURED",
      "Schwab read-only provider is enabled but its approved connector is not attached",
    );
  }

  async getAccounts(context: BrokerProviderContext) {
    return this.unavailable(context);
  }

  async getBalances(context: BrokerProviderContext) {
    return this.unavailable(context);
  }

  async getPositions(context: BrokerProviderContext) {
    return this.unavailable(context);
  }

  async getOrders(context: BrokerProviderContext) {
    return this.unavailable(context);
  }

  async getTransactions(context: BrokerProviderContext) {
    return this.unavailable(context);
  }

  async getInvestmentTransactions(context: BrokerProviderContext) {
    return this.unavailable(context);
  }

  async getQuotes(context: BrokerProviderContext, _symbols: string[]) {
    return this.unavailable(context);
  }

  async getMarketClock(context: BrokerProviderContext) {
    return this.unavailable(context);
  }
}

export function brokerFreshness(
  providerTimestamp: string | null | undefined,
  receivedAt: string | Date,
  now = new Date(),
): BrokerFreshness {
  if (!providerTimestamp) return "UNKNOWN";
  const received = receivedAt instanceof Date ? receivedAt : new Date(receivedAt);
  const provider = new Date(providerTimestamp);
  if (Number.isNaN(received.getTime()) || Number.isNaN(provider.getTime())) return "UNKNOWN";
  const ageMs = Math.max(0, now.getTime() - Math.min(received.getTime(), provider.getTime()));
  if (ageMs <= 15 * 60 * 1000) return "CURRENT";
  if (ageMs <= 24 * 60 * 60 * 1000) return "AGING";
  return "STALE";
}

export type BrokerPortfolioSnapshot = {
  accounts: BrokerAccount[];
  balances: BrokerBalance[];
  positions: BrokerPosition[];
  orders: BrokerOrder[];
  transactions: BrokerTransaction[];
  investmentTransactions: BrokerInvestmentTransaction[];
  asOf: string;
  dataFreshness: BrokerFreshness;
  reconciliationStatus: BrokerReconciliationStatus;
};

export type BrokerReconciliationResult = {
  status: BrokerReconciliationStatus;
  requiresReview: boolean;
  mismatchCount: number;
  mismatches: string[];
  advisoryOnly: true;
};

function comparable(value: unknown): string {
  return value === null || value === undefined ? "UNKNOWN" : String(value);
}

function compareCollections<T>(
  label: string,
  left: T[],
  right: T[],
  key: (value: T) => string,
  fields: Array<keyof T>,
  mismatches: string[],
) {
  const leftByKey = new Map(left.map((value) => [key(value), value]));
  const rightByKey = new Map(right.map((value) => [key(value), value]));
  const keys = new Set([...leftByKey.keys(), ...rightByKey.keys()]);
  for (const itemKey of keys) {
    const leftValue = leftByKey.get(itemKey);
    const rightValue = rightByKey.get(itemKey);
    if (!leftValue || !rightValue) {
      mismatches.push(`${label}:${itemKey}:missing`);
      continue;
    }
    for (const field of fields) {
      if (comparable(leftValue[field]) !== comparable(rightValue[field])) {
        mismatches.push(`${label}:${itemKey}:${String(field)}`);
      }
    }
  }
}

export function reconcileBrokerPortfolio(
  providerSnapshot: BrokerPortfolioSnapshot,
  storedSnapshot: BrokerPortfolioSnapshot,
): BrokerReconciliationResult {
  const mismatches: string[] = [];
  compareCollections("account", providerSnapshot.accounts, storedSnapshot.accounts, (value) => value.id, [
    "accountType",
    "status",
    "currency",
    "cashBalance",
    "buyingPower",
    "marginEnabled",
  ], mismatches);
  compareCollections("position", providerSnapshot.positions, storedSnapshot.positions, (value) => `${value.accountId}:${value.symbol}`, [
    "quantity",
    "costBasis",
    "marketValue",
  ], mismatches);
  compareCollections("order", providerSnapshot.orders, storedSnapshot.orders, (value) => value.orderIdReference, [
    "status",
    "filledQuantity",
    "averageFillPrice",
  ], mismatches);
  compareCollections("transaction", providerSnapshot.transactions, storedSnapshot.transactions, (value) => value.transactionIdReference, [
    "transactionClass",
    "amount",
    "quantity",
  ], mismatches);

  const status: BrokerReconciliationStatus = mismatches.length === 0
    ? "MATCHED"
    : mismatches.some((mismatch) => mismatch.endsWith(":missing") || mismatch.includes(":quantity") || mismatch.includes(":cashBalance"))
      ? "CRITICAL_MISMATCH"
      : "MINOR_VARIANCE";
  return {
    status,
    requiresReview: status !== "MATCHED",
    mismatchCount: mismatches.length,
    mismatches,
    advisoryOnly: true,
  };
}

export type GrokPortfolioResearchSnapshot = {
  accounts: Array<{
    accountType: string;
    displayName: string;
    currency: string;
    cashBalance: UnknownValue;
    buyingPower: UnknownValue;
    dataFreshness: BrokerFreshness;
  }>;
  positions: Array<{
    symbol: string;
    assetType: string;
    quantity: UnknownValue;
    costBasis: UnknownValue;
    marketValue: UnknownValue;
    unrealizedGainLoss: UnknownValue;
    realizedGainLoss: UnknownValue;
    portfolioWeight: UnknownValue;
    dataFreshness: BrokerFreshness;
  }>;
  dataFreshness: BrokerFreshness;
  reconciliationStatus: BrokerReconciliationStatus;
  advisoryOnly: true;
  executionDisabled: true;
};

function leastFreshness(values: BrokerFreshness[]): BrokerFreshness {
  if (values.includes("UNKNOWN")) return "UNKNOWN";
  if (values.includes("STALE")) return "STALE";
  if (values.includes("AGING")) return "AGING";
  return "CURRENT";
}

/**
 * The only portfolio shape that may cross into Grok. Provider references,
 * household ids, credential refs, routing data, and write capabilities are
 * intentionally not representable in this return type.
 */
export function getGrokPortfolioResearchSnapshot(
  snapshot: BrokerPortfolioSnapshot,
): GrokPortfolioResearchSnapshot {
  const freshness = [
    ...snapshot.accounts.map((account) => account.dataFreshness),
    ...snapshot.positions.map((position) => position.dataFreshness),
  ];
  return {
    accounts: snapshot.accounts.map((account) => ({
      accountType: account.accountType,
      displayName: account.displayName,
      currency: account.currency,
      cashBalance: account.cashBalance,
      buyingPower: account.buyingPower,
      dataFreshness: account.dataFreshness,
    })),
    positions: snapshot.positions.map((position) => ({
      symbol: position.symbol,
      assetType: position.assetType,
      quantity: position.quantity,
      costBasis: position.costBasis,
      marketValue: position.marketValue,
      unrealizedGainLoss: position.unrealizedGainLoss,
      realizedGainLoss: position.realizedGainLoss,
      portfolioWeight: position.portfolioWeight,
      dataFreshness: position.dataFreshness,
    })),
    dataFreshness: leastFreshness(freshness),
    reconciliationStatus: snapshot.reconciliationStatus,
    advisoryOnly: true,
    executionDisabled: true,
  };
}

export type ShadowBrokerBaseline = {
  source: "broker_read_only_snapshot";
  asOf: string;
  positions: Array<Pick<BrokerPosition, "symbol" | "assetType" | "quantity" | "marketValue" | "portfolioWeight">>;
  independent: true;
  executionDisabled: true;
  humanReviewRequired: true;
};

export function initializeShadowBrokerBaseline(snapshot: BrokerPortfolioSnapshot): ShadowBrokerBaseline {
  return {
    source: "broker_read_only_snapshot",
    asOf: snapshot.asOf,
    positions: snapshot.positions.map((position) => ({
      symbol: position.symbol,
      assetType: position.assetType,
      quantity: position.quantity,
      marketValue: position.marketValue,
      portfolioWeight: position.portfolioWeight,
    })),
    independent: true,
    executionDisabled: true,
    humanReviewRequired: true,
  };
}