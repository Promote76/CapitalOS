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

  async connect() {}
  async disconnect() {}
  async healthCheck() {
    return { status: "HEALTHY" as const, lastExchangeTimestamp: new Date().toISOString(), lastReceiveTimestamp: new Date().toISOString(), sequence: 1 };
  }
  async getOrderBook(_marketId: string) { return { bid: 99.99, ask: 100.01, depth: 1000 }; }
  async getBalances() { return [{ asset: "USD", available: 20, committed: 0 }]; }
  async getPositions() { return []; }
  async getOpenOrders() { return []; }
  async getRecentFills() { return []; }
  async placeOrder(_order: OrderRequest): Promise<VenueOrder> {
    throw new Error("Simulated adapter does not transmit orders; use live rehearsal instead");
  }
  async cancelOrder(externalOrderId: string): Promise<VenueOrder> {
    return { externalOrderId, clientOrderId: "rehearsal", marketId: "rehearsal", state: "CANCELLED", quantity: 0, filledQuantity: 0 };
  }
  async cancelAllOrders() {}
  async getOrder(_externalOrderId: string) { return null; }
}