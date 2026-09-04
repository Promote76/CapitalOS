import assert from 'node:assert/strict';
import test from 'node:test';
import { bankConnectionAccess } from './bank-connection-access.ts';

test('keeps household recovery actions available when the provider is disabled', () => {
  assert.deepEqual(bankConnectionAccess(false, true), {
    canCreate: false,
    canMatch: false,
    canSync: false,
    canExport: true,
    canRevoke: true,
    canDelete: true,
  });
});

test('keeps export and deletion available after consent is revoked', () => {
  assert.deepEqual(bankConnectionAccess(false, false), {
    canCreate: false,
    canMatch: false,
    canSync: false,
    canExport: true,
    canRevoke: false,
    canDelete: true,
  });
});