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

export type IndependentVenueReview = {
  reference: string;
  reviewerId: string;
  reviewedAt: string;
  expiresAt: string;
};

export type ExecutionAccountBinding = {
  venueId: string;
  accountId: string;
  capitalClass: "micro_live";
  householdCapitalAccessible: false;
  protectedCapitalAccessible: false;
  allowedAssets: string[];
};

export type VenueTransport = {
  connect(input: { credential: string; accountId: string }): Promise<void>;
  disconnect(): Promise<void>;
  healthCheck(): Promise<{ status: VenueHealth; lastExchangeTimestamp: string | null; lastReceiveTimestamp: string | null; sequence: number | null }>;
  getOrderBook(marketId: string): Promise<{ bid: number; ask: number; depth: number }>;
  getBalances(): Promise<VenueBalance[]>;
  getPositions(): Promise<VenuePosition[]>;
  getOpenOrders(): Promise<VenueOrder[]>;
  getRecentFills(): Promise<VenueFill[]>;
  placeOrder(order: OrderRequest): Promise<VenueOrder>;
  cancelOrder(externalOrderId: string): Promise<VenueOrder>;
  cancelAllOrders(): Promise<void>;
  getOrder(externalOrderId: string): Promise<VenueOrder | null>;
};

export type ServerConfiguredVenueAdapterOptions = {
  name: string;
  capabilities: VenueCapability;
  account: ExecutionAccountBinding;
  allowedMarkets: string[];
  credentialsReference: string;
  resolveCredential: (credentialsReference: string) => Promise<string>;
  transport: VenueTransport;
};

const credentialReferencePattern = /^secret:\/\/capital-os\/venues\/[A-Za-z0-9_-]{8,128}$/;
const reviewReferencePattern = /^review:\/\/capital-os\/(security|jurisdiction)\/[A-Za-z0-9_-]{8,128}$/;

export function isServerCredentialReference(value: unknown): value is string {
  return typeof value === "string" &&
    value.length <= 160 &&
    credentialReferencePattern.test(value);
}

export function isIndependentReviewReference(value: unknown, kind: "security" | "jurisdiction"): value is string {
  return typeof value === "string" &&
    value.length <= 160 &&
    value.startsWith(`review://capital-os/${kind}/`) &&
    reviewReferencePattern.test(value);
}

function assertAccountBoundary(account: ExecutionAccountBinding) {
  if (
    !account.venueId.trim() ||
    !account.accountId.trim() ||
    account.capitalClass !== "micro_live" ||
    account.householdCapitalAccessible !== false ||
    account.protectedCapitalAccessible !== false ||
    account.allowedAssets.length === 0 ||
    account.allowedAssets.some((asset) => !asset.trim())
  ) {
    throw new Error("Venue adapter requires an isolated Micro-Live execution account");
  }
}

function assertCapabilityBoundary(capabilities: VenueCapability) {
  if (
    !capabilities.spot ||
    capabilities.derivative ||
    capabilities.predictionMarket ||
    capabilities.onChain ||
    !capabilities.clientOrderIds ||
    !capabilities.balanceApi ||
    !capabilities.positionApi
  ) {
    throw new Error("Venue adapter capabilities are outside the reviewed Micro-Live boundary");
  }
}

/**
 * Concrete provider adapter boundary. A provider-specific transport is
 * injected by server code after review; the browser and request body never
 * provide credentials or an account. The default application registers no
 * transport, so this class cannot connect to a real venue by itself.
 */
export class ServerConfiguredVenueAdapter implements VenueAdapter {
  readonly name: string;
  readonly capabilities: VenueCapability;
  readonly account: ExecutionAccountBinding;
  readonly allowedMarkets: readonly string[];

  private connected = false;
  private readonly options: ServerConfiguredVenueAdapterOptions;

  constructor(options: ServerConfiguredVenueAdapterOptions) {
    this.options = options;
    if (!isServerCredentialReference(options.credentialsReference)) {
      throw new Error("Venue credentials must be an opaque server-side reference");
    }
    assertAccountBoundary(options.account);
    assertCapabilityBoundary(options.capabilities);
    if (options.allowedMarkets.length === 0 || options.allowedMarkets.some((market) => !market.trim())) {
      throw new Error("Venue adapter requires an explicit market allowlist");
    }
    this.name = options.name;
    this.capabilities = { ...options.capabilities };
    this.account = { ...options.account, allowedAssets: [...options.account.allowedAssets] };
    this.allowedMarkets = [...options.allowedMarkets];
  }

  private assertConnected() {
    if (!this.connected) throw new Error("Venue adapter is not connected");
  }

  private assertMarket(marketId: string) {
    if (!this.allowedMarkets.includes(marketId)) {
      throw new Error("Market is not allowlisted for this venue adapter");
    }
  }

  private assertVenueResponseMarkets<T extends { marketId: string }>(items: T[]): T[] {
    for (const item of items) this.assertMarket(item.marketId);
    return items.map((item) => ({ ...item }));
  }

  async connect() {
    const credential = await this.options.resolveCredential(this.options.credentialsReference);
    if (!credential || typeof credential !== "string") {
      throw new Error("Server-side venue credential could not be resolved");
    }
    await this.options.transport.connect({ credential, accountId: this.account.accountId });
    this.connected = true;
  }

  async disconnect() {
    if (this.connected) await this.options.transport.disconnect();
    this.connected = false;
  }

  async healthCheck() {
    this.assertConnected();
    return this.options.transport.healthCheck();
  }

  async getOrderBook(marketId: string) {
    this.assertConnected();
    this.assertMarket(marketId);
    return this.options.transport.getOrderBook(marketId);
  }

  async getBalances() {
    this.assertConnected();
    const balances = await this.options.transport.getBalances();
    const allowedAssets = new Set(this.account.allowedAssets);
    if (balances.some((balance) => !allowedAssets.has(balance.asset))) {
      throw new Error("Venue returned an asset outside the reviewed execution-account allowlist");
    }
    return balances.map((balance) => ({ ...balance }));
  }

  async getPositions() {
    this.assertConnected();
    return this.assertVenueResponseMarkets(await this.options.transport.getPositions());
  }

  async getOpenOrders() {
    this.assertConnected();
    return this.assertVenueResponseMarkets(await this.options.transport.getOpenOrders());
  }

  async getRecentFills() {
    this.assertConnected();
    return this.assertVenueResponseMarkets(await this.options.transport.getRecentFills());
  }

  async placeOrder(order: OrderRequest) {
    this.assertConnected();
    this.assertMarket(order.marketId);
    if (order.orderType === "market" && !this.capabilities.marketOrders) {
      throw new Error("Market orders are not supported by this venue adapter");
    }
    if (order.orderType === "limit" && !this.capabilities.makerOrders) {
      throw new Error("Limit orders are not supported by this venue adapter");
    }
    if (order.postOnly && !this.capabilities.postOnly) {
      throw new Error("Post-only orders are not supported by this venue adapter");
    }
    if (!Number.isFinite(order.quantity) || order.quantity <= 0) {
      throw new Error("Order quantity must be positive");
    }
    const created = await this.options.transport.placeOrder({ ...order });
    this.assertMarket(created.marketId);
    return { ...created };
  }

  async cancelOrder(externalOrderId: string) {
    this.assertConnected();
    const cancelled = await this.options.transport.cancelOrder(externalOrderId);
    this.assertMarket(cancelled.marketId);
    return { ...cancelled };
  }

  async cancelAllOrders() {
    this.assertConnected();
    return this.options.transport.cancelAllOrders();
  }

  async getOrder(externalOrderId: string) {
    this.assertConnected();
    const order = await this.options.transport.getOrder(externalOrderId);
    if (!order) return null;
    this.assertMarket(order.marketId);
    return { ...order };
  }
}

export type ReviewedVenueAdapterRegistration = {
  adapterType: string;
  reviewReference: string;
  create: (options: ServerConfiguredVenueAdapterOptions) => VenueAdapter;
};

const reviewedVenueAdapterRegistry = new Map<string, ReviewedVenueAdapterRegistration>();

/**
 * This registry is intentionally empty in the application. A real provider
 * must be added in a separately reviewed deployment change, not by changing a
 * database adapterType or posting an approval request.
 */
export function registerReviewedVenueAdapter(registration: ReviewedVenueAdapterRegistration) {
  if (
    !registration.adapterType.trim() ||
    registration.adapterType === "simulated" ||
    registration.adapterType === "provider-neutral" ||
    !isIndependentReviewReference(registration.reviewReference, "security")
  ) {
    throw new Error("Venue adapter registration requires an independent security review");
  }
  reviewedVenueAdapterRegistry.set(registration.adapterType, registration);
}

export function isReviewedVenueAdapterRegistered(adapterType: string): boolean {
  return reviewedVenueAdapterRegistry.has(adapterType);
}

export function createReviewedVenueAdapter(
  adapterType: string,
  options: ServerConfiguredVenueAdapterOptions,
): VenueAdapter {
  const registration = reviewedVenueAdapterRegistry.get(adapterType);
  if (!registration) throw new Error("Venue adapter is not registered by the server");
  return registration.create(options);
}

export type VenueApprovalInput = {
  adapterType: string;
  integrationApproved: boolean;
  adapterRegistered?: boolean;
  credentialsReference?: string | null;
  jurisdictionConfirmed: boolean;
  termsReviewed: boolean;
  marketPermissions: string[];
  withdrawalReviewed: boolean;
  withdrawalDisabled: boolean;
  securityReview?: IndependentVenueReview | null;
  jurisdictionReview?: IndependentVenueReview | null;
  approvingActorId?: string;
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
        input.integrationApproved &&
        input.adapterRegistered === true,
    },
    {
      name: "Server-side credential reference configured",
      passed: isServerCredentialReference(input.credentialsReference),
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
    {
      name: "Independent security review is current",
      passed: Boolean(input.securityReview) &&
        new Date(input.securityReview?.expiresAt ?? 0).getTime() > Date.now() &&
        input.securityReview?.reviewerId !== input.approvingActorId,
    },
    {
      name: "Independent jurisdiction review is current",
      passed: Boolean(input.jurisdictionReview) &&
        new Date(input.jurisdictionReview?.expiresAt ?? 0).getTime() > Date.now() &&
        input.jurisdictionReview?.reviewerId !== input.approvingActorId,
    },
    {
      name: "Security and jurisdiction reviewers are distinct",
      passed: Boolean(input.securityReview && input.jurisdictionReview) &&
        input.securityReview?.reviewerId !== input.jurisdictionReview?.reviewerId,
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