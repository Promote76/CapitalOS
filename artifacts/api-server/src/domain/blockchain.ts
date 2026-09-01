export type ContractReadRequest = {
  address: string;
  method: string;
  args?: readonly unknown[];
};

export type TransactionRequest = {
  to: string;
  data?: string;
  value?: string;
};

export type SimulationResult = {
  supported: false;
  reason: string;
};

export type TransactionResult = {
  submitted: false;
  reason: string;
};

export type TransactionStatus = {
  confirmed: false;
  reason: string;
};

export interface ChainAdapter {
  getChainId(): Promise<number>;
  getNativeBalance(address: string): Promise<string>;
  getTokenBalance(token: string, address: string): Promise<string>;
  readContract(request: ContractReadRequest): Promise<unknown>;
  simulateTransaction(request: TransactionRequest): Promise<SimulationResult>;
  submitTransaction(request: TransactionRequest): Promise<TransactionResult>;
  getTransactionStatus(hash: string): Promise<TransactionStatus>;
}

export class DisabledChainAdapter implements ChainAdapter {
  constructor(
    private readonly chainName: "arbitrum" | "base" | "ethereum",
    private readonly chainId: number,
  ) {}

  private disabled(): never {
    throw new Error(`Blockchain adapter for ${this.chainName} is disabled by policy`);
  }

  async getChainId(): Promise<number> {
    return this.chainId;
  }
  async getNativeBalance(_address: string): Promise<string> {
    return this.disabled();
  }
  async getTokenBalance(_token: string, _address: string): Promise<string> {
    return this.disabled();
  }
  async readContract(_request: ContractReadRequest): Promise<unknown> {
    return this.disabled();
  }
  async simulateTransaction(_request: TransactionRequest): Promise<SimulationResult> {
    return { supported: false, reason: "Transaction simulation is disabled until a chain is explicitly enabled" };
  }
  async submitTransaction(_request: TransactionRequest): Promise<TransactionResult> {
    return { submitted: false, reason: "Live blockchain transactions are disabled" };
  }
  async getTransactionStatus(_hash: string): Promise<TransactionStatus> {
    return { confirmed: false, reason: "Transaction status is unavailable while adapters are disabled" };
  }
}

export const chainAdapters = {
  arbitrum: new DisabledChainAdapter("arbitrum", 42161),
  base: new DisabledChainAdapter("base", 8453),
  ethereum: new DisabledChainAdapter("ethereum", 1),
};

export const futureCapitalVaultInterface = {
  enabled: false,
  preferredChain: "arbitrum",
  capabilities: [
    "deposit",
    "withdraw",
    "allocate",
    "deallocate",
    "pause",
    "unpause",
    "authorizeStrategy",
    "revokeStrategy",
    "setStrategyLimit",
    "setDailyLimit",
  ] as const,
};