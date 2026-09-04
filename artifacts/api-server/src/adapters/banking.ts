export type BankingProvider = "manual" | "csv_import" | "plaid";

export type ImportedBankTransaction = {
  externalId?: string;
  transactionDate: string;
  description: string;
  amount: string;
  merchant?: string;
};

export type ProviderAccountSnapshot = {
  providerAccountId: string;
  name: string;
  accountType: string;
  currentBalance: string;
  availableBalance?: string;
};

export type ProviderTransactionSnapshot = {
  providerTransactionId: string;
  providerAccountId: string;
  transactionDate: string;
  description: string;
  amount: string;
  merchant?: string;
  pending?: boolean;
  reviewHint?: "needs_review" | "possible_duplicate" | "possible_transfer" | "possible_business" | "possible_property";
};

export type BankSyncSnapshot = {
  providerAsOf: string;
  cursor?: string;
  accounts: ProviderAccountSnapshot[];
  transactions: ProviderTransactionSnapshot[];
  removedTransactionIds?: string[];
};

export type BankWebhookNotification = {
  eventId: string;
  providerConnectionRef: string;
};

export type BankingProviderErrorCode = "OUTAGE" | "RATE_LIMITED" | "UNAUTHENTICATED" | "INVALID_RESPONSE";

export class BankingProviderError extends Error {
  public readonly code: BankingProviderErrorCode;

  constructor(
    code: BankingProviderErrorCode,
    message: string,
  ) {
    super(message);
    this.code = code;
    this.name = "BankingProviderError";
  }
}

export interface ReadOnlyBankingProvider {
  readonly provider: string;
  readonly readOnly: true;
  readonly delivery: "polling" | "webhook" | "polling_and_webhook";
  /**
   * Cursors are committed by the service only after the complete snapshot is
   * applied atomically. Providers must therefore tolerate the same cursor being
   * supplied again after an interruption or credential reauthorization.
   */
  sync(input: { credentialRef: string; cursor?: string }): Promise<BankSyncSnapshot>;
  reauthorize?(input: { credentialRef: string; replacementCredentialRef: string }): Promise<void>;
  verifyWebhook?(input: {
    headers: Record<string, string | string[] | undefined>;
    body: Buffer;
  }): Promise<BankWebhookNotification>;
}

export interface BankingAdapter {
  readonly provider: BankingProvider;
  readonly readOnly: true;
  readonly enabled: boolean;
  importTransactions(input: string | ImportedBankTransaction[]): ImportedBankTransaction[];
}

function parseCsv(input: string): ImportedBankTransaction[] {
  const rows = input.trim().split(/\r?\n/);
  if (rows.length < 2) return [];
  const parseLine = (line: string) => {
    const values: string[] = [];
    let value = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === '"') {
        if (quoted && line[index + 1] === '"') {
          value += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (character === "," && !quoted) {
        values.push(value.trim());
        value = "";
      } else {
        value += character;
      }
    }
    if (quoted) throw new Error("CSV contains an unterminated quoted field");
    values.push(value.trim());
    return values;
  };
  const headers = parseLine(rows[0]).map((header) => header.toLowerCase());
  if (!headers.length || headers.some((header) => !header)) throw new Error("CSV header contains an empty column");
  return rows.slice(1).filter(Boolean).map((row) => {
    const values = parseLine(row);
    if (values.length !== headers.length) throw new Error("CSV row does not have the same number of columns as the header");
    const record = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    return {
      externalId: record.id || record.externalid || record.external_id || undefined,
      transactionDate: record.date || record.transactiondate || record.transaction_date,
      description: record.description || record.name || "Imported transaction",
      amount: record.amount,
      merchant: record.merchant || record.payee || undefined,
    };
  });
}

export const manualBankingAdapter: BankingAdapter = {
  provider: "manual",
  readOnly: true,
  enabled: true,
  importTransactions: (input) => Array.isArray(input) ? input : parseCsv(input),
};

export const csvImportBankingAdapter: BankingAdapter = {
  provider: "csv_import",
  readOnly: true,
  enabled: true,
  importTransactions: (input) => Array.isArray(input) ? input : parseCsv(input),
};

export const plaidBankingAdapter: BankingAdapter = {
  provider: "plaid",
  readOnly: true,
  enabled: false,
  importTransactions: () => {
    throw new Error("Plaid banking adapter is disabled until an approved provider connection is configured.");
  },
};

const readOnlyProviders = new Map<string, ReadOnlyBankingProvider>();

export function registerReadOnlyBankingProvider(provider: ReadOnlyBankingProvider) {
  if (!provider.readOnly) throw new Error("Banking providers must be read-only");
  if (provider.delivery !== "polling" && provider.delivery !== "webhook" && provider.delivery !== "polling_and_webhook") {
    throw new Error("Banking providers must declare polling or webhook delivery");
  }
  readOnlyProviders.set(provider.provider, provider);
}

export function unregisterReadOnlyBankingProvider(provider: string) {
  readOnlyProviders.delete(provider);
}

export function getReadOnlyBankingProvider(provider: string) {
  return readOnlyProviders.get(provider);
}

export const bankingAdapters = {
  manual: manualBankingAdapter,
  csv_import: csvImportBankingAdapter,
  plaid: plaidBankingAdapter,
} as const;

export function getBankingStatus() {
  return {
    readOnly: true,
    credentialsStored: false,
    transfersEnabled: false,
    billPayEnabled: false,
    adapters: Object.values(bankingAdapters).map((adapter) => ({
      provider: adapter.provider,
      enabled: adapter.enabled,
      readOnly: adapter.readOnly,
    })),
    message: "Capital OS can read, import, and organize household finance data. Provider credentials are server-side only, and no bank action or money movement is available.",
  };
}