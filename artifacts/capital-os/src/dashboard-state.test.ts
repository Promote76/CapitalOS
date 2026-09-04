import assert from 'node:assert/strict';
import test from 'node:test';
import { dashboardDataState, hasPersistedFinancialData } from './dashboard-state.ts';

const emptySnapshot = {
  goal: { currentAmount: '0.00', protectedAmount: '0.00' },
  allocation: { totalWeekly: '0.00', duplexReserve: '0.00', capitalOs: '0.00', opportunityReserve: '0.00' },
  portfolio: { totalCapital: '0.00', protectedCapital: '0.00', activeCapital: '0.00', cashReserve: '0.00' },
  accounts: [{ balance: '0.00' }],
};

test('classifies a new household as empty even when setup defaults exist', () => {
  assert.equal(hasPersistedFinancialData(emptySnapshot), false);
  assert.equal(dashboardDataState(emptySnapshot, false, false), 'empty');
});

test('classifies non-zero server balances as ready', () => {
  assert.equal(
    dashboardDataState({ ...emptySnapshot, portfolio: { ...emptySnapshot.portfolio, totalCapital: '125.00' } }, false, false),
    'ready',
  );
});

test('keeps loading and unavailable distinct from an empty response', () => {
  assert.equal(dashboardDataState(undefined, true, false), 'loading');
  assert.equal(dashboardDataState(undefined, false, true), 'unavailable');
  assert.equal(dashboardDataState(undefined, false, false), 'unavailable');
});