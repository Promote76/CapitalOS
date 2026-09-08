import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeReviewQueueItem, queueItemDestination, reviewQueueTypes } from './documents-queue';

test('only canonical review queue discriminators are normalized', () => {
  for (const type of reviewQueueTypes) {
    assert.equal(normalizeReviewQueueItem({ type, id: 'item-1', status: 'OPEN' })?.type, type);
  }
  assert.equal(normalizeReviewQueueItem({ type: 'transaction', id: 'item-1', status: 'OPEN' }), undefined);
});

test('specialized items route without a mutation surface', () => {
  const settlement = normalizeReviewQueueItem({ type: 'settlement', id: 'item-1', status: 'OPEN' });
  const budget = normalizeReviewQueueItem({ type: 'pending_budget_transaction', id: 'item-2', status: 'OPEN' });
  assert.deepEqual(settlement && queueItemDestination(settlement), { href: '/business', label: 'Review in Business' });
  assert.deepEqual(budget && queueItemDestination(budget), { href: '/transactions', label: 'Review in Transactions' });
});