const test = require('node:test');
const assert = require('node:assert/strict');

const { chunkTransactions } = require('../src/pipeline/fraudPipeline');

test('chunkTransactions splits 100 items into 5 batches of 20', () => {
  const input = Array.from({ length: 100 }, (_, i) => ({ id: `t${i + 1}` }));
  const chunks = chunkTransactions(input, 20);

  assert.equal(chunks.length, 5);
  assert.deepEqual(chunks.map((c) => c.length), [20, 20, 20, 20, 20]);
});
