import type { FinancialReviewQueueItemsItem as GeneratedReviewQueueItem } from '@workspace/api-client-react';

export const reviewQueueTypes = [
  'financial_document',
  'bank_statement_transaction',
  'settlement',
  'profit_loss',
  'settlement_math_variance',
  'profit_loss_mismatch',
  'settlement_deposit_match',
  'settlement_economic_treatment',
  'advance_recovery',
  'escrow_classification',
  'verified_income',
  'pending_budget_transaction',
] as const;

export type ReviewQueueType = typeof reviewQueueTypes[number];

type ReviewQueueItemBase = {
  id: string;
  status: string;
  description?: string;
  sourceFileName?: string;
  reason?: string;
  counterparty?: string;
  direction?: string;
};

/** A closed representation of the API review-queue discriminator. */
export type ReviewQueueItem = {
  [Type in ReviewQueueType]: ReviewQueueItemBase & { type: Type };
}[ReviewQueueType];

export function isReviewQueueType(value: string): value is ReviewQueueType {
  return (reviewQueueTypes as readonly string[]).includes(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * The currently generated API queue item allows additional properties. Normalize
 * it at the UI boundary so an unexpected discriminator remains non-actionable.
 */
export function normalizeReviewQueueItem(item: GeneratedReviewQueueItem): ReviewQueueItem | undefined {
  const type = readString(item.type);
  const id = readString(item.id);
  if (!type || !id || !isReviewQueueType(type)) return undefined;

  return {
    type,
    id,
    status: readString(item.status) ?? 'OPEN',
    description: readString(item.description),
    sourceFileName: readString(item.sourceFileName),
    reason: readString(item.reason),
    counterparty: readString(item.counterparty),
    direction: readString(item.direction),
  } as ReviewQueueItem;
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled review queue type: ${String(value)}`);
}

export function queueItemTitle(item: ReviewQueueItem): string {
  return item.description || item.sourceFileName || item.reason || item.counterparty || item.direction || item.type.replaceAll('_', ' ');
}

export function queueItemDetail(item: ReviewQueueItem): string | undefined {
  switch (item.type) {
    case 'financial_document':
      return item.sourceFileName ? 'Financial document evidence' : undefined;
    case 'bank_statement_transaction':
      return 'Bank statement evidence — review only; no bank write.';
    case 'settlement':
    case 'profit_loss':
      return 'Business income source document';
    case 'settlement_math_variance':
    case 'profit_loss_mismatch':
    case 'settlement_deposit_match':
    case 'settlement_economic_treatment':
    case 'advance_recovery':
    case 'escrow_classification':
    case 'verified_income':
      return item.reason || 'Specialized business income review required.';
    case 'pending_budget_transaction':
      return 'Pending transaction requires budget review.';
    default:
      return assertNever(item);
  }
}

export function queueItemDestination(item: ReviewQueueItem): { href: string; label: string } | undefined {
  switch (item.type) {
    case 'financial_document':
    case 'bank_statement_transaction':
      return undefined;
    case 'settlement':
    case 'profit_loss':
    case 'settlement_math_variance':
    case 'profit_loss_mismatch':
    case 'settlement_deposit_match':
    case 'settlement_economic_treatment':
    case 'advance_recovery':
    case 'escrow_classification':
    case 'verified_income':
      return { href: '/business', label: 'Review in Business' };
    case 'pending_budget_transaction':
      return { href: '/transactions', label: 'Review in Transactions' };
    default:
      return assertNever(item);
  }
}