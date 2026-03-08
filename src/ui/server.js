const express = require("express");
const path = require("path");
const fs = require("fs");
const { FraudPipeline } = require("../pipeline/fraudPipeline");
const { generateTransactions } = require("../scripts/generateTransactions");

const app = express();
const port = 8000;

// Configuration
const config = {
  inputFile: path.join(__dirname, "../../data/generatedTransactions.json"),
  suspiciousFile: path.join(__dirname, "../../data/suspiciousTransactions.json"),
  batchSize: 20,
  maxWorkers: 5,
};

// Ensure data directory exists
fs.mkdirSync(path.dirname(config.inputFile), { recursive: true });

// State management
let appState = {
  running: false,
  events: [],
  lastResult: null,
};

// Initialize pipeline
const pipeline = new FraudPipeline(config);

// Collect events
pipeline.on("pipeline_started", (data) => {
  appState.events.push({
    id: appState.events.length,
    ts: Date.now() / 1000,
    type: "batch_started",
    payload: { batch_id: "pipeline", ...data },
  });
});

pipeline.on("batch_started", (data) => {
  appState.events.push({
    id: appState.events.length,
    ts: Date.now() / 1000,
    type: "batch_started",
    payload: data,
  });
});

pipeline.on("agent_call_started", (data) => {
  appState.events.push({
    id: appState.events.length,
    ts: Date.now() / 1000,
    type: "agent_call_started",
    payload: data,
  });
});

pipeline.on("agent_call_finished", (data) => {
  appState.events.push({
    id: appState.events.length,
    ts: Date.now() / 1000,
    type: "agent_call_finished",
    payload: data,
  });
});

pipeline.on("suspicious_found", (data) => {
  appState.events.push({
    id: appState.events.length,
    ts: Date.now() / 1000,
    type: "suspicious_found",
    payload: data,
  });
});

pipeline.on("batch_finished", (data) => {
  appState.events.push({
    id: appState.events.length,
    ts: Date.now() / 1000,
    type: "batch_finished",
    payload: data,
  });
});

pipeline.on("pipeline_finished", (data) => {
  appState.events.push({
    id: appState.events.length,
    ts: Date.now() / 1000,
    type: "pipeline_finished",
    payload: data,
  });
  appState.running = false;
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "../ui")));

// Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../ui/index.html"));
});

app.get("/api/status", (req, res) => {
  const batchFinished = appState.events.filter(
    (e) => e.type === "batch_finished"
  ).length;
  const suspicious = fs.existsSync(config.suspiciousFile)
    ? JSON.parse(fs.readFileSync(config.suspiciousFile, "utf-8"))
    : [];

  res.json({
    running: appState.running,
    summary: {
      batch_started: appState.events.filter((e) => e.type === "batch_started")
        .length,
      batch_finished: batchFinished,
      suspicious_found: suspicious.length,
    },
    agent_events: appState.events.filter((e) =>
      e.type.startsWith("agent_call_")
    ),
    batch_events: appState.events.filter((e) => e.type.startsWith("batch_")),
    tool_events: [],
    suspicious: suspicious,
    last_result: appState.lastResult,
  });
});

app.post("/api/run", async (req, res) => {
  if (appState.running) {
    return res.status(409).json({ error: "Pipeline already running" });
  }

  appState.running = true;
  appState.events = [];

  // Generate transactions
  const transactions = generateTransactions(100);
  fs.writeFileSync(config.inputFile, JSON.stringify(transactions, null, 2));

  res.json({ started: true });

  // Run pipeline asynchronously
  pipeline.run().then((result) => {
    appState.lastResult = result;
  });
});

// Start server
app.listen(port, () => {
  console.log(`\n🚀 Fraud Detection Monitor`);
  console.log(`📊 http://127.0.0.1:${port}`);
  console.log(`🔗 API: http://127.0.0.1:${port}/api/status\n`);
});

module.exports = { app, config, appState };
