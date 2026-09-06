import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
const unsignedPattern = '[0-9]+([.][0-9]{1,2})?';
const signedPattern = '-?[0-9]+([.][0-9]{1,2})?';

const inputPattern = (testId: string) => {
  const testIdIndex = appSource.indexOf(`data-testid="${testId}"`);
  assert.notEqual(testIdIndex, -1, `Expected ${testId} money input`);
  const inputStart = appSource.lastIndexOf('<input', testIdIndex);
  const inputEnd = appSource.indexOf('/>', testIdIndex);
  assert.notEqual(inputStart, -1, `Expected ${testId} opening input tag`);
  assert.notEqual(inputEnd, -1, `Expected ${testId} closing input tag`);
  const input = appSource.slice(inputStart, inputEnd + 2);
  return input.match(/pattern="([^"]+)"/)?.[1];
};

test('remaining unsigned money forms use the browser-safe decimal pattern', () => {
  for (const testId of [
    'input-bill-amount',
    'input-upcoming-expense-amount',
    'input-upcoming-expense-funded',
    'input-income-amount',
    'input-intelligence-scenario',
  ]) {
    assert.equal(inputPattern(testId), unsignedPattern, testId);
  }
});

test('incident review uses the browser-safe signed decimal pattern', () => {
  assert.equal(inputPattern('input-incident-review-capital-impact'), signedPattern);
});

test('money patterns accept whole dollars and cents while rejecting malformed precision', () => {
  const unsigned = new RegExp(`^(?:${unsignedPattern})$`);
  const signed = new RegExp(`^(?:${signedPattern})$`);

  for (const value of ['0', '12', '0.01', '12.3', '12.34']) assert.equal(unsigned.test(value), true, value);
  for (const value of ['', '.01', '12.', '12.345', '1,000', '-0.01', 'abc']) assert.equal(unsigned.test(value), false, value);
  for (const value of ['0', '0.01', '-0.01', '-12.34']) assert.equal(signed.test(value), true, value);
  for (const value of ['-.01', '-12.', '-12.345', '--1', '1.2.3']) assert.equal(signed.test(value), false, value);
});
