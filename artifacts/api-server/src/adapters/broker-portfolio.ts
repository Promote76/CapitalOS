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
  householdId?: string;
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
  totalValue?: UnknownValue;
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
  dayChange?: UnknownValue;
  dayChangePercent?: UnknownValue;
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
  eventType?: string;
  currency?: string | null;
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

  constructor(
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly observe?: (path: string) => Promise<unknown>,
  ) {}

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

  private client(context: BrokerProviderContext) {
    const status = schwabFeatureStatus(this.env);
    if (!status.readOnlyEnabled) {
      throw new BrokerProviderError(
        "PROVIDER_DISABLED",
        "Schwab read-only provider is disabled; no provider request was made",
      );
    }
    requireCredential(context);
    if (!this.observe) throw new BrokerProviderError("NOT_CONFIGURED", "Schwab read-only observation client is not attached");
    return this.observe;
  }

  async getAccounts(context: BrokerProviderContext) {
    const raw = await this.client(context)(`/trader/v1/accounts/${encodeURIComponent(context.credentialRef)}?fields=positions`);
    const account = raw && typeof raw === "object" ? (raw as Record<string, unknown>).securitiesAccount : null;
    return normalizeSchwabAccounts(context.householdId ?? "UNKNOWN", account && typeof account === "object" ? { ...(account as Record<string, unknown>), hashValue: context.credentialRef } : null);
  }

  async getBalances(context: BrokerProviderContext) {
    const raw = await this.client(context)(`/trader/v1/accounts/${encodeURIComponent(context.credentialRef)}`);
    const account = raw && typeof raw === "object" ? (raw as Record<string, unknown>).securitiesAccount as Record<string, unknown> | undefined : undefined;
    return normalizeSchwabBalances(context.credentialRef, account?.currentBalances);
  }

  async getPositions(context: BrokerProviderContext) {
    const raw = await this.client(context)(`/trader/v1/accounts/${encodeURIComponent(context.credentialRef)}?fields=positions`);
    const account = raw && typeof raw === "object" ? (raw as Record<string, unknown>).securitiesAccount as Record<string, unknown> | undefined : undefined;
    return normalizeSchwabPositions(context.householdId ?? "UNKNOWN", context.credentialRef, account?.positions);
  }

  async getOrders(context: BrokerProviderContext) {
    const window = schwabHistoryWindow();
    const query = new URLSearchParams({ maxResults: "300", fromEnteredTime: window.from, toEnteredTime: window.to }).toString();
    return normalizeSchwabOrders(context.credentialRef, await this.client(context)(`/trader/v1/accounts/${encodeURIComponent(context.credentialRef)}/orders?${query}`));
  }

  async getTransactions(context: BrokerProviderContext) {
    const window = schwabHistoryWindow();
    const query = new URLSearchParams({ startDate: window.from, endDate: window.to, types: schwabTransactionTypes }).toString();
    return normalizeSchwabTransactions(context.credentialRef, await this.client(context)(`/trader/v1/accounts/${encodeURIComponent(context.credentialRef)}/transactions?${query}`));
  }

  async getInvestmentTransactions(context: BrokerProviderContext) {
    const window = schwabHistoryWindow();
    const query = new URLSearchParams({ startDate: window.from, endDate: window.to, types: schwabTransactionTypes }).toString();
    return normalizeSchwabInvestmentTransactions(context.credentialRef, await this.client(context)(`/trader/v1/accounts/${encodeURIComponent(context.credentialRef)}/transactions?${query}`));
  }

  async getQuotes(context: BrokerProviderContext, symbols: string[]) {
    const client = this.client(context);
    if (!symbols.length) return [];
    return normalizeSchwabQuotes(await client(`/marketdata/v1/quotes?symbols=${encodeURIComponent(symbols.slice(0, 500).join(","))}`));
  }

  async getMarketClock(context: BrokerProviderContext) {
    return normalizeSchwabMarketClock(await this.client(context)(`/marketdata/v1/markets?markets=equity&date=${new Date().toISOString().slice(0, 10)}`));
  }
}

const schwabTransactionTypes = "TRADE,RECEIVE_AND_DELIVER,DIVIDEND_OR_INTEREST,ACH_RECEIPT,ACH_DISBURSEMENT,CASH_RECEIPT,CASH_DISBURSEMENT,ELECTRONIC_FUND,WIRE,ADVISOR_FEE,JOURNAL,MEMORANDUM,MARGIN_CALL,MONEY_MARKET,SMA_ADJUSTMENT";
const schwabHistoryWindow = (now = new Date()) => ({
  from: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString(),
  to: now.toISOString(),
});

/**
 * Normalizers deliberately accept only provider response data and emit the
 * broker read models. They do not retain response payloads, account numbers,
 * or credentials, and are intentionally separate from any write-capable SDK.
 */
const observed = () => new Date().toISOString();
const value = (input: unknown): UnknownValue => typeof input === "string" || typeof input === "number" ? String(input) : "UNKNOWN";
const timestampValue = (input: unknown): string | null => {
  if (typeof input === "number" && Number.isFinite(input)) {
    const date = new Date(input);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return typeof input === "string" && !Number.isNaN(Date.parse(input)) ? input : null;
};
const associatedTransactionItem = (...collections: unknown[]): Record<string, unknown> | null => {
  const items = collections.flatMap((collection) => Array.isArray(collection) ? collection : collection && typeof collection === "object" ? [collection] : []);
  const records = items.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
  return records.find((item) => {
    const instrument = item.instrument && typeof item.instrument === "object" ? item.instrument as Record<string, unknown> : null;
    return typeof instrument?.symbol === "string" && !/^CURRENCY_[A-Z]{3}$/i.test(instrument.symbol);
  }) ?? records[0] ?? null;
};
const nestedSymbol = (...collections: unknown[]): string | null => {
  const item = associatedTransactionItem(...collections);
  const instrument = item?.instrument && typeof item.instrument === "object" ? item.instrument as Record<string, unknown> : null;
  const symbol = typeof instrument?.symbol === "string" ? instrument.symbol : null;
  return symbol && !/^CURRENCY_[A-Z]{3}$/i.test(symbol) ? symbol : null;
};

export function normalizeSchwabAccounts(householdId: string, raw: unknown): BrokerAccount[] {
  const accounts = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
      ? [(raw as Record<string, unknown>).securitiesAccount ?? raw]
      : [];
  return accounts.filter((item): item is Record<string, unknown> => !!item && typeof item === "object").map((item) => {
    const now = observed(); const providerTimestamp = timestampValue(item.updatedAt);
    return {
      id: typeof item.hashValue === "string" ? item.hashValue : "UNKNOWN",
      householdId, provider: "schwab", providerAccountReference: cryptoSafeReference(item.hashValue),
      accountType: typeof item.type === "string" ? item.type : "UNKNOWN", displayName: typeof item.nickname === "string" ? item.nickname : "Schwab account",
      status: typeof item.status === "string" ? item.status : "UNKNOWN", currency: "USD",
      totalValue: value((item.currentBalances as Record<string, unknown> | undefined)?.liquidationValue),
      cashBalance: value((item.currentBalances as Record<string, unknown> | undefined)?.cashBalance),
      buyingPower: value((item.currentBalances as Record<string, unknown> | undefined)?.buyingPower),
      marginEnabled: typeof item.isMarginEnabled === "boolean" ? item.isMarginEnabled : "UNKNOWN" as const,
      lastSyncedAt: now, dataFreshness: brokerFreshness(providerTimestamp, now),
    };
  }).filter((item) => item.id !== "UNKNOWN");
}
function cryptoSafeReference(input: unknown): string {
  // An opaque provider hash is acceptable; never synthesize or expose an account number.
  return (typeof input === "string" && input.length > 0) || (typeof input === "number" && Number.isFinite(input)) ? String(input) : "UNKNOWN";
}
export function normalizeSchwabPositions(householdId: string, accountId: string, raw: unknown): BrokerPosition[] {
  const positions = Array.isArray(raw) ? raw : [];
  return positions.filter((p): p is Record<string, unknown> => !!p && typeof p === "object").map((p) => {
    const now = observed(); const instrument = p.instrument as Record<string, unknown> | undefined;
    const timestamp = timestampValue(p.settlementDate);
    const longQuantity = typeof p.longQuantity === "number" ? p.longQuantity : 0;
    const shortQuantity = typeof p.shortQuantity === "number" ? p.shortQuantity : 0;
    const netQuantity = longQuantity - shortQuantity;
    const assetType = typeof instrument?.assetType === "string" ? instrument.assetType : "UNKNOWN";
    const requiresMultiplier = /OPTION|FUTURE/i.test(assetType);
    const multiplier = typeof instrument?.multiplier === "number" && instrument.multiplier > 0
      ? instrument.multiplier
      : requiresMultiplier
        ? null
        : 1;
    const openProfitLoss = typeof p.longOpenProfitLoss === "number" || typeof p.shortOpenProfitLoss === "number"
      ? (typeof p.longOpenProfitLoss === "number" ? p.longOpenProfitLoss : 0) + (typeof p.shortOpenProfitLoss === "number" ? p.shortOpenProfitLoss : 0)
      : null;
    const costBasis = typeof p.marketValue === "number" && openProfitLoss !== null ? p.marketValue - openProfitLoss : null;
    return { accountId, householdId, symbol: typeof instrument?.symbol === "string" ? instrument.symbol : "UNKNOWN", assetType,
      quantity: String(netQuantity), averageCost: value(p.averagePrice), costBasis: costBasis === null ? "UNKNOWN" : String(costBasis), marketPrice: typeof p.marketValue === "number" && netQuantity !== 0 && multiplier !== null ? String(p.marketValue / (netQuantity * multiplier)) : "UNKNOWN", marketValue: value(p.marketValue), dayChange: value(p.currentDayProfitLoss), dayChangePercent: value(p.currentDayProfitLossPercentage), unrealizedGainLoss: openProfitLoss === null ? "UNKNOWN" : String(openProfitLoss), realizedGainLoss: "UNKNOWN", portfolioWeight: "UNKNOWN", providerTimestamp: timestamp, receivedAt: now, dataFreshness: brokerFreshness(timestamp, now) };
  });
}
export function normalizeSchwabBalances(accountId: string, raw: unknown): BrokerBalance[] {
  const b = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}; const now = observed(); const stamp = timestampValue(b.updatedAt);
  return [{ accountId, cashBalance: value(b.cashBalance), buyingPower: value(b.buyingPower), providerTimestamp: stamp, receivedAt: now, dataFreshness: brokerFreshness(stamp, now) }];
}
export function normalizeSchwabOrders(accountId: string, raw: unknown): BrokerOrder[] {
  return (Array.isArray(raw) ? raw : []).filter((x): x is Record<string, unknown> => !!x && typeof x === "object").map((x) => { const now = observed(); const stamp = timestampValue(x.closeTime ?? x.enteredTime); const firstLeg = Array.isArray(x.orderLegCollection) && x.orderLegCollection[0] && typeof x.orderLegCollection[0] === "object" ? x.orderLegCollection[0] as Record<string, unknown> : null; return { accountId, orderIdReference: cryptoSafeReference(x.orderId), symbol: nestedSymbol(x.orderLegCollection) ?? "UNKNOWN", side: typeof firstLeg?.instruction === "string" ? firstLeg.instruction : "UNKNOWN", orderType: typeof x.orderType === "string" ? x.orderType : "UNKNOWN", quantity: value(x.quantity), limitPrice: value(x.price), stopPrice: value(x.stopPrice), status: typeof x.status === "string" ? x.status : "UNKNOWN", submittedAt: timestampValue(x.enteredTime), filledAt: timestampValue(x.closeTime), filledQuantity: value(x.filledQuantity), averageFillPrice: value(x.price), providerTimestamp: stamp, receivedAt: now, dataFreshness: brokerFreshness(stamp, now) }; });
}
export function normalizeSchwabTransactions(accountId: string, raw: unknown): BrokerTransaction[] {
  return (Array.isArray(raw) ? raw : []).filter((x): x is Record<string, unknown> => !!x && typeof x === "object").map((x) => {
    const now = observed();
    const stamp = timestampValue(x.time);
    const providerType = typeof x.type === "string" ? x.type.toUpperCase() : "UNKNOWN";
    const transactionClass: BrokerTransactionClass = providerType.includes("TRADE")
      ? "trade"
      : providerType.includes("FEE")
        ? "fee"
        : providerType.includes("DIVIDEND") || providerType.includes("INTEREST")
          ? "income"
          : /ACH|CASH_|ELECTRONIC_FUND|WIRE_|JOURNAL|RECEIVE_AND_DELIVER|TRANSFER/.test(providerType)
            ? "transfer"
            : "unknown";
    const associatedItem = associatedTransactionItem(x.transactionItem, x.transactionItems, x.transferItems);
    const explicitCurrency = typeof x.currency === "string"
      ? x.currency
      : typeof x.currencyType === "string"
        ? x.currencyType
        : null;
    return {
      accountId,
      transactionIdReference: cryptoSafeReference(x.activityId ?? x.transactionId),
      symbol: nestedSymbol(x.transactionItem, x.transactionItems, x.transferItems),
      transactionClass,
      eventType: providerType,
      currency: explicitCurrency,
      amount: value(x.netAmount),
      quantity: value(associatedItem?.quantity ?? associatedItem?.amount),
      description: typeof x.description === "string" ? x.description : providerType === "UNKNOWN" ? "Unclassified broker event" : providerType.replaceAll("_", " ").toLowerCase(),
      transactionTimestamp: stamp,
      providerTimestamp: stamp,
      receivedAt: now,
      dataFreshness: brokerFreshness(stamp, now),
    };
  });
}
export function normalizeSchwabInvestmentTransactions(accountId: string, raw: unknown): BrokerInvestmentTransaction[] {
  return normalizeSchwabTransactions(accountId, raw).filter((item): item is BrokerInvestmentTransaction => item.transactionClass !== "transfer");
}
export function normalizeSchwabQuotes(raw: unknown): BrokerQuote[] {
  const records = raw && typeof raw === "object" ? Object.values(raw as Record<string, unknown>) : [];
  return records.filter((x): x is Record<string, unknown> => !!x && typeof x === "object").map((x) => { const now = observed(); const quote = x.quote as Record<string, unknown> | undefined; const stamp = timestampValue(quote?.quoteTime); return { symbol: typeof x.symbol === "string" ? x.symbol : "UNKNOWN", assetType: typeof x.assetMainType === "string" ? x.assetMainType : "UNKNOWN", marketPrice: value(quote?.lastPrice), providerTimestamp: stamp, receivedAt: now, dataFreshness: brokerFreshness(stamp, now) }; });
}
export function normalizeSchwabMarketClock(raw: unknown): BrokerMarketClock {
  const root = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const equity = root.equity && typeof root.equity === "object" ? root.equity as Record<string, unknown> : root;
  const nestedProduct = typeof equity.isOpen === "boolean"
    ? null
    : Object.values(equity).find((candidate): candidate is Record<string, unknown> => !!candidate && typeof candidate === "object");
  const valueRaw = nestedProduct ?? equity;
  const now = observed();
  const sessionHours = valueRaw.sessionHours && typeof valueRaw.sessionHours === "object" ? valueRaw.sessionHours as Record<string, unknown> : {};
  const regular = Array.isArray(sessionHours.regularMarket) ? sessionHours.regularMarket[0] as Record<string, unknown> | undefined : undefined;
  const stamp = timestampValue(valueRaw.datetime ?? regular?.start);
  return { marketOpen: typeof valueRaw.isOpen === "boolean" ? valueRaw.isOpen : "UNKNOWN", providerTimestamp: stamp, receivedAt: now, dataFreshness: brokerFreshness(stamp, now) };
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