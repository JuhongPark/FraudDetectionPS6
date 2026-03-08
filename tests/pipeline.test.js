const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { FraudPipeline } = require('../src/pipeline/fraudPipeline');

test('pipeline processes 100 records into 5 parallel batches and writes suspicious output', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fraud-pipeline-'));
  const inputFile = path.join(tmpDir, 'input.json');
  const suspiciousFile = path.join(tmpDir, 'suspicious.json');

  const txns = Array.from({ length: 100 }, (_, i) => ({
    id: `t${i + 1}`,
    amount: 10 + i,
    merchant: 'm',
    location: 'us',
    channel: 'pos',
  }));
  fs.writeFileSync(inputFile, JSON.stringify(txns, null, 2));

  const fakeSignalMiner = async (batch) => batch.slice(0, 1).map((x) => ({ id: x.id, reason: 'candidate' }));
  const fakeEvidence = async (_batch, candidates) => candidates.map((x) => ({ id: x.id, reason: 'confirmed' }));

  const pipeline = new FraudPipeline(
    { inputFile, suspiciousFile, batchSize: 20, maxWorkers: 5 },
    {
      signalMinerAgent: fakeSignalMiner,
      evidenceAuditorAgent: fakeEvidence,
    }
  );

  const events = { batch_started: 0, batch_finished: 0, tool_call_finished: 0 };
  pipeline.on('batch_started', () => { events.batch_started += 1; });
  pipeline.on('batch_finished', () => { events.batch_finished += 1; });
  pipeline.on('tool_call_finished', () => { events.tool_call_finished += 1; });

  const result = await pipeline.run();
  const suspicious = JSON.parse(fs.readFileSync(suspiciousFile, 'utf-8'));

  assert.equal(result.total_transactions, 100);
  assert.equal(result.batch_count, 5);
  assert.equal(events.batch_started, 5);
  assert.equal(events.batch_finished, 5);
  assert.equal(events.tool_call_finished, 5);
  assert.equal(suspicious.length, 5);
});
