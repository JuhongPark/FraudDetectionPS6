const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { EventEmitter } = require('node:events');
const {
  writeSuspiciousTransactions,
  runBatchIntegrityAudit,
  runDecisionExplainability,
} = require('../src/tools/tools');
const { emitAgentToolTelemetry } = require('../src/agents/fraudDetectionAgents');

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

test('emitAgentToolTelemetry pairs tool_call_started and tool_call_finished by call_id', () => {
  const ee = new EventEmitter();
  const started = [];
  const finished = [];
  ee.on('tool_call_started', (d) => started.push(d));
  ee.on('tool_call_finished', (d) => finished.push(d));

  const fakeResult = {
    newItems: [
      { type: 'tool_call_item', callId: 'call_abc', name: 'analyze_transaction_patterns', rawItem: {} },
      { type: 'tool_call_output_item', callId: 'call_abc', name: 'analyze_transaction_patterns', rawItem: {} },
    ],
  };

  emitAgentToolTelemetry(fakeResult, 'TestAgent', 'batch-1', ee);

  assert.equal(started.length, 1, 'expected 1 tool_call_started');
  assert.equal(finished.length, 1, 'expected 1 tool_call_finished');
  assert.equal(started[0].call_id, 'call_abc');
  assert.equal(finished[0].call_id, 'call_abc');
  assert.equal(started[0].call_id, finished[0].call_id, 'call_id must match between start and finish');
  assert.equal(started[0].source, 'agent_sdk');
  assert.equal(finished[0].source, 'agent_sdk');
});

test('emitAgentToolTelemetry pairs multiple tool calls correctly', () => {
  const ee = new EventEmitter();
  const started = [];
  const finished = [];
  ee.on('tool_call_started', (d) => started.push(d));
  ee.on('tool_call_finished', (d) => finished.push(d));

  const fakeResult = {
    newItems: [
      { type: 'tool_call_item', callId: 'call_1', name: 'toolA', rawItem: {} },
      { type: 'tool_call_item', callId: 'call_2', name: 'toolA', rawItem: {} },
      { type: 'tool_call_output_item', callId: 'call_1', name: 'toolA', rawItem: {} },
      { type: 'tool_call_output_item', callId: 'call_2', name: 'toolA', rawItem: {} },
    ],
  };

  emitAgentToolTelemetry(fakeResult, 'TestAgent', 'batch-2', ee);

  assert.equal(started.length, 2);
  assert.equal(finished.length, 2);
  assert.equal(finished[0].call_id, 'call_1');
  assert.equal(finished[1].call_id, 'call_2');
});
