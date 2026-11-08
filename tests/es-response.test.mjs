import test from 'node:test';
import assert from 'node:assert/strict';
import { assertCompleteEsResponse } from '../lib/engines.mjs';
test('F01: ES timeout/shard failure/approximate count cannot masquerade as exact successful search', () => {
  const complete = { timed_out: false, _shards: { failed: 0 }, hits: { total: { relation: 'eq' } } };
  assert.doesNotThrow(() => assertCompleteEsResponse(complete));
  assert.throws(() => assertCompleteEsResponse({ ...complete, timed_out: true }));
  assert.throws(() => assertCompleteEsResponse({ ...complete, _shards: { failed: 1 } }));
  assert.throws(() => assertCompleteEsResponse({ ...complete, hits: { total: { relation: 'gte' } } }));
});
