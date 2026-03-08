const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  writeSuspiciousTransactions,
  runBatchIntegrityAudit,
  runDecisionExplainability,
} = require('../src/tools/tools');

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

test('runBatchIntegrityAudit validates lineage consistency', async () => {
  const batch = [{ id: 't1' }, { id: 't2' }];
  const candidates = [{ id: 't1' }];
  const profiled = [{ id: 't1' }];
  const scored = [{ id: 't1', risk_score: 70, priority: 'high' }];
  const confirmed = [{ id: 't1', reason: 'ok' }];

  const result = await runBatchIntegrityAudit({
    batch,
    candidates,
    profiled,
    scored,
    confirmed,
  });

  assert.equal(result.audit.chain_consistent, true);
  assert.equal(result.audit.confirmed_count, 1);
});

test('runDecisionExplainability returns explanation rows', async () => {
  const result = await runDecisionExplainability({
    confirmed: [{ id: 't1', reason: 'high amount' }],
    scored: [{ id: 't1', risk_score: 82, priority: 'high' }],
  });

  assert.equal(result.explanations.length, 1);
  assert.equal(result.explanations[0].id, 't1');
  assert.equal(result.explanations[0].priority, 'high');
});
