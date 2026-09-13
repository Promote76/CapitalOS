import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');

test('refetched vehicle scenarios render their explanation and missing inputs', () => {
  assert.match(appSource, /\{scenario\.explanation\}/);
  assert.match(appSource, /scenario\.missingInputs\.length > 0/);
  assert.match(appSource, /Missing inputs: \{scenario\.missingInputs\.join/);
});
