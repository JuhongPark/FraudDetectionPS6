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
  const fakePatternProfiler = async (_batch, candidates) =>
    candidates.map((x) => ({ ...x, geo_risk: 10, signals: ['test_signal'] }));
  const fakeRiskScorer = async (_batch, profiled) =>
    profiled.map((x) => ({ ...x, risk_score: 55, priority: 'medium' }));
  const fakeEvidence = async (_batch, candidates) => candidates.map((x) => ({ id: x.id, reason: 'confirmed' }));

  const pipeline = new FraudPipeline(
    { inputFile, suspiciousFile, batchSize: 20, maxWorkers: 5 },
    {
      signalMinerAgent: fakeSignalMiner,
      patternProfilerAgent: fakePatternProfiler,
      riskScorerAgent: fakeRiskScorer,
      evidenceAuditorAgent: fakeEvidence,
    }
  );

  const events = {
    batch_started: 0,
    batch_finished: 0,
    suspicious_tool_call_finished: 0,
    ui_stream_tool_call_finished: 0,
  };
  pipeline.on('batch_started', () => { events.batch_started += 1; });
  pipeline.on('batch_finished', () => { events.batch_finished += 1; });
  pipeline.on('tool_call_finished', (event) => {
    if (event.tool === 'suspiciousTransactions') {
      events.suspicious_tool_call_finished += 1;
    }
    if (event.tool === 'ui_event_stream') {
      events.ui_stream_tool_call_finished += 1;
    }
  });

  const result = await pipeline.run();
  const suspicious = JSON.parse(fs.readFileSync(suspiciousFile, 'utf-8'));

  assert.equal(result.total_transactions, 100);
  assert.equal(result.batch_count, 5);
  assert.equal(events.batch_started, 5);
  assert.equal(events.batch_finished, 5);
  assert.equal(events.suspicious_tool_call_finished, 5);
  assert.equal(events.ui_stream_tool_call_finished, 5);
  assert.equal(suspicious.length, 5);
});

test('pipeline still executes all tools even when no suspicious records are confirmed', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fraud-pipeline-empty-'));
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

  const fakeSignalMiner = async () => [];
  const fakePatternProfiler = async () => [];
  const fakeRiskScorer = async () => [];
  const fakeEvidence = async () => [];

  const pipeline = new FraudPipeline(
    { inputFile, suspiciousFile, batchSize: 20, maxWorkers: 5 },
    {
      signalMinerAgent: fakeSignalMiner,
      patternProfilerAgent: fakePatternProfiler,
      riskScorerAgent: fakeRiskScorer,
      evidenceAuditorAgent: fakeEvidence,
    }
  );

  const events = {
    suspicious_tool_call_finished: 0,
    ui_stream_tool_call_finished: 0,
  };
  pipeline.on('tool_call_finished', (event) => {
    if (event.tool === 'suspiciousTransactions') {
      events.suspicious_tool_call_finished += 1;
    }
    if (event.tool === 'ui_event_stream') {
      events.ui_stream_tool_call_finished += 1;
    }
  });

  const result = await pipeline.run();
  const suspicious = JSON.parse(fs.readFileSync(suspiciousFile, 'utf-8'));

  assert.equal(result.total_transactions, 100);
  assert.equal(result.batch_count, 5);
  assert.equal(result.suspicious_count, 0);
  assert.equal(events.suspicious_tool_call_finished, 5);
  assert.equal(events.ui_stream_tool_call_finished, 5);
  assert.equal(suspicious.length, 0);
});
