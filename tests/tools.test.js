const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { writeSuspiciousTransactions } = require('../src/tools/tools');

test('writeSuspiciousTransactions deduplicates by id', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fraud-tools-'));
  const outputFile = path.join(tmpDir, 'suspicious.json');
  fs.writeFileSync(outputFile, JSON.stringify([{ id: 't1', reason: 'old' }], null, 2));

  const result = await writeSuspiciousTransactions({
    output_file: outputFile,
    transactions: [
      { id: 't1', reason: 'new' },
      { id: 't2', reason: 'new2' },
    ],
  });

  const stored = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));

  assert.equal(result.tool, 'suspiciousTransactions');
  assert.equal(result.written, 2);
  assert.equal(result.total, 2);
  assert.equal(stored.length, 2);
  assert.equal(stored.find((x) => x.id === 't1').reason, 'new');
});
