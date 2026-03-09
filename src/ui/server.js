const express = require("express");
const path = require("path");
const fs = require("fs");
const { FraudPipeline } = require("../pipeline/fraudPipeline");
const { generateTransactions } = require("../scripts/generateTransactions");

const app = express();
const port = Number(process.env.PORT || 8000);
const host = process.env.HOST || "127.0.0.1";

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
const MAX_EVENTS = 500;
let appState = {
  running: false,
  events: [],
  lastResult: null,
};

// Initialize pipeline
const pipeline = new FraudPipeline(config);

// Bounded event collector
function pushEvent(type, payload) {
  appState.events.push({
    id: appState.events.length,
    ts: Date.now() / 1000,
    type,
    payload,
  });
  if (appState.events.length > MAX_EVENTS) {
    appState.events = appState.events.slice(-MAX_EVENTS);
  }
}

// Collect events
pipeline.on("pipeline_started", (data) => pushEvent("pipeline_started", { batch_id: "pipeline", ...data }));
pipeline.on("batch_started", (data) => pushEvent("batch_started", data));
pipeline.on("agent_call_started", (data) => pushEvent("agent_call_started", data));
pipeline.on("agent_call_finished", (data) => pushEvent("agent_call_finished", data));
pipeline.on("suspicious_found", (data) => pushEvent("suspicious_found", data));
pipeline.on("batch_finished", (data) => pushEvent("batch_finished", data));
pipeline.on("batch_failed", (data) => pushEvent("batch_failed", data));
pipeline.on("tool_call_started", (data) => pushEvent("tool_call_started", data));
pipeline.on("tool_call_finished", (data) => pushEvent("tool_call_finished", data));
pipeline.on("tool_executed", (data) => pushEvent("tool_executed", data));
pipeline.on("pipeline_finished", (data) => {
  pushEvent("pipeline_finished", data);
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
  const failureCount = appState.events.filter(
    (e) =>
      e.type === "batch_failed" ||
      (e.type === "agent_call_finished" && e.payload && e.payload.error)
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
      failures: failureCount,
    },
    agent_events: appState.events.filter((e) =>
      e.type.startsWith("agent_call_")
    ),
    batch_events: appState.events.filter((e) => e.type.startsWith("batch_")),
    tool_events: appState.events.filter((e) => e.type.startsWith("tool_")),
    pipeline_events: appState.events.filter((e) => e.type.startsWith("pipeline_")),
    timeline_events: appState.events.slice(-150),
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

function startServer(initialPort) {
  let currentPort = initialPort;

  const tryListen = () => {
    const server = app.listen(currentPort, host, () => {
      console.log(`\n🚀 Fraud Detection Monitor`);
      console.log(`📊 http://${host}:${currentPort}`);
      console.log(`🔗 API: http://${host}:${currentPort}/api/status\n`);
    });

    server.on("error", (error) => {
      if (error.code === "EADDRINUSE" && !process.env.PORT) {
        currentPort += 1;
        console.warn(`Port in use, retrying on ${currentPort}...`);
        tryListen();
        return;
      }
      console.error("Server failed to start:", error.message);
      process.exit(1);
    });
  };

  tryListen();
}

startServer(port);

module.exports = { app, config, appState };
