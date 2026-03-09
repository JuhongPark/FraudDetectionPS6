const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    }).on("error", reject);
  });
}

function httpPost(url) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: "POST", headers: { "Content-Type": "application/json" } }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    });
    req.on("error", reject);
    req.end();
  });
}

function waitForCondition(fn, timeoutMs = 10000, intervalMs = 200) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = async () => {
      try {
        const result = await fn();
        if (result) return resolve(result);
      } catch (_) { /* retry */ }
      if (Date.now() - start > timeoutMs) return reject(new Error("Timed out waiting for condition"));
      setTimeout(check, intervalMs);
    };
    check();
  });
}

test("server E2E: /api/run triggers pipeline and /api/status reports all events", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fraud-server-"));
  const inputFile = path.join(tmpDir, "input.json");
  const suspiciousFile = path.join(tmpDir, "suspicious.json");

  // Override config and create a server with fake agents for fast execution
  const { FraudPipeline } = require("../src/pipeline/fraudPipeline");
  const { generateTransactions } = require("../src/scripts/generateTransactions");
  const express = require("express");

  const config = { inputFile, suspiciousFile, batchSize: 20, maxWorkers: 5 };

  const fakeSignalMiner = async (batch, batchId, ee) => {
    ee.emit("agent_call_started", { agent: "Signal Miner Agent", batch_id: batchId });
    const candidates = batch.slice(0, 1).map((x) => ({ id: x.id, reason: "candidate" }));
    ee.emit("agent_call_finished", { agent: "Signal Miner Agent", batch_id: batchId, candidates: candidates.length });
    return candidates;
  };
  const fakeProfiler = async (_b, c, batchId, ee) => {
    ee.emit("agent_call_started", { agent: "Pattern Profiler Agent", batch_id: batchId });
    const profiled = c.map((x) => ({ ...x, geo_risk: 10, signals: ["s"] }));
    ee.emit("agent_call_finished", { agent: "Pattern Profiler Agent", batch_id: batchId, profiled: profiled.length });
    return profiled;
  };
  const fakeScorer = async (_b, p, batchId, ee) => {
    ee.emit("agent_call_started", { agent: "Risk Scorer Agent", batch_id: batchId });
    const scored = p.map((x) => ({ ...x, risk_score: 55, priority: "medium" }));
    ee.emit("agent_call_finished", { agent: "Risk Scorer Agent", batch_id: batchId, scored: scored.length });
    return scored;
  };
  const fakeAuditor = async (_b, c, batchId, ee) => {
    ee.emit("agent_call_started", { agent: "Evidence Auditor Agent", batch_id: batchId });
    const confirmed = c.map((x) => ({ id: x.id, reason: "confirmed" }));
    ee.emit("agent_call_finished", { agent: "Evidence Auditor Agent", batch_id: batchId, confirmed: confirmed.length });
    return confirmed;
  };

  const pipeline = new FraudPipeline(config, {
    signalMinerAgent: fakeSignalMiner,
    patternProfilerAgent: fakeProfiler,
    riskScorerAgent: fakeScorer,
    evidenceAuditorAgent: fakeAuditor,
  });

  const MAX_EVENTS = 500;
  const appState = { running: false, events: [], lastResult: null };

  function pushEvent(type, payload) {
    appState.events.push({ id: appState.events.length, ts: Date.now() / 1000, type, payload });
    if (appState.events.length > MAX_EVENTS) {
      appState.events = appState.events.slice(-MAX_EVENTS);
    }
  }

  pipeline.on("pipeline_started", (d) => pushEvent("pipeline_started", { batch_id: "pipeline", ...d }));
  pipeline.on("batch_started", (d) => pushEvent("batch_started", d));
  pipeline.on("agent_call_started", (d) => pushEvent("agent_call_started", d));
  pipeline.on("agent_call_finished", (d) => pushEvent("agent_call_finished", d));
  pipeline.on("suspicious_found", (d) => pushEvent("suspicious_found", d));
  pipeline.on("batch_finished", (d) => pushEvent("batch_finished", d));
  pipeline.on("batch_failed", (d) => pushEvent("batch_failed", d));
  pipeline.on("tool_call_started", (d) => pushEvent("tool_call_started", d));
  pipeline.on("tool_call_finished", (d) => pushEvent("tool_call_finished", d));
  pipeline.on("tool_executed", (d) => pushEvent("tool_executed", d));
  pipeline.on("pipeline_finished", (d) => { pushEvent("pipeline_finished", d); appState.running = false; });

  const app = express();
  app.use(express.json());

  app.get("/api/status", (_req, res) => {
    const suspicious = fs.existsSync(suspiciousFile)
      ? JSON.parse(fs.readFileSync(suspiciousFile, "utf-8"))
      : [];
    res.json({
      running: appState.running,
      summary: {
        batch_started: appState.events.filter((e) => e.type === "batch_started").length,
        batch_finished: appState.events.filter((e) => e.type === "batch_finished").length,
        suspicious_found: suspicious.length,
      },
      agent_events: appState.events.filter((e) => e.type.startsWith("agent_call_")),
      batch_events: appState.events.filter((e) => e.type.startsWith("batch_")),
      tool_events: appState.events.filter((e) => e.type.startsWith("tool_")),
      pipeline_events: appState.events.filter((e) => e.type.startsWith("pipeline_")),
      suspicious,
    });
  });

  app.post("/api/run", (_req, res) => {
    if (appState.running) return res.status(409).json({ error: "running" });
    appState.running = true;
    appState.events = [];
    const txns = generateTransactions(100);
    fs.writeFileSync(inputFile, JSON.stringify(txns, null, 2));
    res.json({ started: true });
    pipeline.run().then((result) => { appState.lastResult = result; });
  });

  // Start server on random port
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    // Trigger pipeline
    const runRes = await httpPost(`${baseUrl}/api/run`);
    assert.equal(runRes.status, 200);
    assert.equal(runRes.body.started, true);

    // Wait for pipeline to finish
    await waitForCondition(async () => {
      const s = await httpGet(`${baseUrl}/api/status`);
      return s.body.running === false && s.body.summary.batch_finished === 5;
    });

    const status = await httpGet(`${baseUrl}/api/status`);
    const data = status.body;

    // Verify batch events
    assert.equal(data.summary.batch_started, 5, "expected 5 batch_started");
    assert.equal(data.summary.batch_finished, 5, "expected 5 batch_finished");

    // Verify agent events exist (4 agents x 5 batches x 2 events = 40)
    assert.ok(data.agent_events.length >= 40, `expected >=40 agent events, got ${data.agent_events.length}`);

    // Verify tool events exist
    assert.ok(data.tool_events.length > 0, "expected tool events");

    // Verify suspicious transactions written
    assert.equal(data.suspicious.length, 5, "expected 5 suspicious transactions");

    // Verify pipeline events
    const pipelineStarted = data.pipeline_events.filter((e) => e.type === "pipeline_started");
    const pipelineFinished = data.pipeline_events.filter((e) => e.type === "pipeline_finished");
    assert.equal(pipelineStarted.length, 1, "expected 1 pipeline_started");
    assert.equal(pipelineFinished.length, 1, "expected 1 pipeline_finished");
  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
