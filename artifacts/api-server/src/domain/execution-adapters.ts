import type { OrderState } from "./execution-oms";

export type VenueHealth = "HEALTHY" | "DEGRADED" | "STALE" | "FAILED";
export type VenueCapability = {
  spot: boolean;
  derivative: boolean;
  predictionMarket: boolean;
  onChain: boolean;
  makerOrders: boolean;
  marketOrders: boolean;
  postOnly: boolean;
  reduceOnly: boolean;
  clientOrderIds: boolean;
  bulkCancel: boolean;
  positionApi: boolean;
  balanceApi: boolean;
};

export type VenueBalance = { asset: string; available: number; committed: number };
export type VenuePosition = { marketId: string; quantity: number; averagePrice: number };
export type VenueOrder = { externalOrderId: string; clientOrderId: string; marketId: string; state: OrderState; quantity: number; filledQuantity: number };
export type VenueFill = { externalFillId: string; externalOrderId: string; marketId: string; quantity: number; price: number; fee: number; timestamp: string };
export type OrderRequest = { clientOrderId: string; marketId: string; side: "buy" | "sell"; orderType: "limit" | "market"; quantity: number; price?: number; postOnly?: boolean };
export type RehearsalVenueSnapshot = {
  health?: VenueHealth;
  balances?: VenueBalance[];
  positions?: VenuePosition[];
  openOrders?: Array<VenueOrder & { price?: number; reservedNotionalCents?: number }>;
  recentFills?: VenueFill[];
  orderBook?: { bid: number; ask: number; depth: number };
};

export interface MarketDataAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  healthCheck(): Promise<{ status: VenueHealth; lastExchangeTimestamp: string | null; lastReceiveTimestamp: string | null; sequence: number | null }>;
  getOrderBook(marketId: string): Promise<{ bid: number; ask: number; depth: number }>;
}

export interface TradingAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  healthCheck(): Promise<{ status: VenueHealth }>;
  getBalances(): Promise<VenueBalance[]>;
  getPositions(): Promise<VenuePosition[]>;
  getOpenOrders(): Promise<VenueOrder[]>;
  getRecentFills(): Promise<VenueFill[]>;
  placeOrder(order: OrderRequest): Promise<VenueOrder>;
  cancelOrder(externalOrderId: string): Promise<VenueOrder>;
  cancelAllOrders(): Promise<void>;
  getOrder(externalOrderId: string): Promise<VenueOrder | null>;
}

export type VenueAdapter = MarketDataAdapter & TradingAdapter;

export type VenueApprovalInput = {
  adapterType: string;
  integrationApproved: boolean;
  credentialsReference?: string | null;
  jurisdictionConfirmed: boolean;
  termsReviewed: boolean;
  marketPermissions: string[];
  withdrawalReviewed: boolean;
  withdrawalDisabled: boolean;
};

/**
 * A real adapter is not eligible merely because it implements the trading
 * interface. Approval is an explicit, auditable operation and simulated or
 * provider-neutral placeholders can never satisfy it.
 */
export function evaluateVenueApproval(input: VenueApprovalInput) {
  const checks = [
    {
      name: "Explicit real venue integration approved",
      passed: input.adapterType !== "simulated" &&
        input.adapterType !== "provider-neutral" &&
        input.integrationApproved,
    },
    {
      name: "Server-side credential reference configured",
      passed: Boolean(input.credentialsReference?.trim()),
    },
    {
      name: "Jurisdiction and account eligibility confirmed",
      passed: input.jurisdictionConfirmed,
    },
    {
      name: "Venue terms reviewed",
      passed: input.termsReviewed,
    },
    {
      name: "Market permissions recorded",
      passed: input.marketPermissions.length > 0 &&
        input.marketPermissions.every((market) => market.trim().length > 0),
    },
    {
      name: "Withdrawal permissions reviewed",
      passed: input.withdrawalReviewed,
    },
    {
      name: "Withdrawals disabled for the execution account",
      passed: input.withdrawalDisabled,
    },
  ];
  const approved = checks.every((check) => check.passed);
  return {
    approved,
    status: approved ? "APPROVED_FOR_MICRO_LIVE" as const : "NOT_APPROVED" as const,
    checks,
    note: "Venue approval never grants access to household or protected capital.",
  };
}

/**
 * Rehearsal adapter. It intentionally refuses to transmit orders so an
 * environment cannot accidentally turn a preview into a trading venue.
 */
export class SimulatedVenueAdapter implements VenueAdapter {
  readonly name = "Simulated venue adapter";
  readonly capabilities: VenueCapability = {
    spot: true, derivative: false, predictionMarket: false, onChain: false,
    makerOrders: true, marketOrders: true, postOnly: true, reduceOnly: true,
    clientOrderIds: true, bulkCancel: true, positionApi: true, balanceApi: true,
  };

  private health: VenueHealth;
  private balances: VenueBalance[];
  private positions: VenuePosition[];
  private openOrders: Array<VenueOrder & { price?: number; reservedNotionalCents?: number }>;
  private recentFills: VenueFill[];
  private orderBook: { bid: number; ask: number; depth: number };

  constructor(snapshot: RehearsalVenueSnapshot = {}) {
    this.health = snapshot.health ?? "HEALTHY";
    this.balances = snapshot.balances ? [...snapshot.balances] : [{ asset: "USD", available: 20, committed: 0 }];
    this.positions = snapshot.positions ? [...snapshot.positions] : [];
    this.openOrders = snapshot.openOrders ? [...snapshot.openOrders] : [];
    this.recentFills = snapshot.recentFills ? [...snapshot.recentFills] : [];
    this.orderBook = snapshot.orderBook ?? { bid: 99.99, ask: 100.01, depth: 1000 };
  }

  async connect() {}
  async disconnect() {}
  async healthCheck() {
    return { status: this.health, lastExchangeTimestamp: new Date().toISOString(), lastReceiveTimestamp: new Date().toISOString(), sequence: 1 };
  }
  async getOrderBook(_marketId: string) { return { ...this.orderBook }; }
  async getBalances() { return this.balances.map((balance) => ({ ...balance })); }
  async getPositions() { return this.positions.map((position) => ({ ...position })); }
  async getOpenOrders() { return this.openOrders.map((order) => ({ ...order })); }
  async getRecentFills() { return this.recentFills.map((fill) => ({ ...fill })); }

  /**
   * These controls only seed venue-authoritative rehearsal state. They never
   * call a venue and are intentionally separate from the trading methods.
   */
  setHealth(health: VenueHealth) {
    this.health = health;
  }

  seedOrder(order: VenueOrder & { price?: number; reservedNotionalCents?: number }) {
    this.openOrders.push({ ...order });
  }

  seedFill(fill: VenueFill) {
    this.recentFills.push({ ...fill });
  }

  async restart() {
    await this.disconnect();
    await this.connect();
  }

  async placeOrder(_order: OrderRequest): Promise<VenueOrder> {
    throw new Error("Simulated adapter does not transmit orders; use live rehearsal instead");
  }
  async cancelOrder(_externalOrderId: string): Promise<VenueOrder> {
    throw new Error("Simulated adapter does not transmit cancellations; use live rehearsal instead");
  }
  async cancelAllOrders() {
    throw new Error("Simulated adapter does not transmit cancellations; use live rehearsal instead");
  }
  async getOrder(externalOrderId: string) {
    const order = this.openOrders.find((candidate) => candidate.externalOrderId === externalOrderId);
    return order ? { ...order } : null;
  }
}