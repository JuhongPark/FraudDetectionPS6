/**
 * Fraud Detection Agents using @openai/agents framework
 */

const { Agent, run } = require("@openai/agents");
require("dotenv").config();

const {
  analyzeTransactionPatternsTool,
  geoVelocityCheckTool,
  riskScoreTool,
  runGeoVelocityCheck,
  runRiskScore,
} = require("../tools/tools");

const MODEL = process.env.OPENAI_MODEL || "gpt-5.4";
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

async function runWithRetry(agent, prompt, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await run(agent, prompt);
    } catch (error) {
      if (attempt < retries && isTransient(error)) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
}

function isTransient(error) {
  const msg = String(error.message || "").toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("rate limit") ||
    msg.includes("429") ||
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused")
  );
}

function createSignalMinerAgent() {
  return new Agent({
    model: MODEL,
    name: "SignalMinerAgent",
    instructions: `You are a fraud detection specialist (Signal Miner).
Always call the analyze_transaction_patterns tool exactly once with analysis_type="broad_detection".
Then return ONLY JSON: {"candidates":[{"id":"...","reason":"..."}]}.`,
    tools: [analyzeTransactionPatternsTool],
  });
}

function createEvidenceAuditorAgent() {
  return new Agent({
    model: MODEL,
    name: "EvidenceAuditorAgent",
    instructions: `You are a fraud detection specialist (Evidence Auditor).
Always call the analyze_transaction_patterns tool exactly once with analysis_type="precision_validation".
Then return ONLY JSON: {"confirmed":[{"id":"...","reason":"..."}]}.`,
    tools: [analyzeTransactionPatternsTool],
  });
}

function createPatternProfilerAgent() {
  return new Agent({
    model: MODEL,
    name: "PatternProfilerAgent",
    instructions: `You are a fraud pattern profiler.
Always call geoVelocityCheckTool exactly once.
Return ONLY JSON: {"profiled":[{"id":"...","geo_risk":0,"signals":["..."]}]}.`,
    tools: [geoVelocityCheckTool],
  });
}

function createRiskScorerAgent() {
  return new Agent({
    model: MODEL,
    name: "RiskScorerAgent",
    instructions: `You are a fraud risk scorer.
Always call riskScoreTool exactly once.
Return ONLY JSON: {"scored":[{"id":"...","risk_score":0,"priority":"low|medium|high"}]}.`,
    tools: [riskScoreTool],
  });
}

async function signalMinerAgent(batch, batchId, eventEmitter) {
  try {
    eventEmitter.emit("agent_call_started", {
      timestamp: new Date(),
      agent: "Signal Miner Agent",
      batch_id: batchId,
      batch_size: batch.length,
      activity: "Analyzing full batch for broad fraud candidates",
    });

    const agent = createSignalMinerAgent();
    const prompt = `Analyze this batch of ${batch.length} transactions.
Use tool input: {"transactions": [...], "analysis_type": "broad_detection"}
Transactions:\n${JSON.stringify(batch, null, 2)}`;

    const result = await runWithRetry(agent, prompt);
    emitAgentToolTelemetry(result, "Signal Miner Agent", batchId, eventEmitter);
    const candidates = extractRecords(result.finalOutput, batch, "candidates");

    eventEmitter.emit("agent_call_finished", {
      timestamp: new Date(),
      agent: "Signal Miner Agent",
      batch_id: batchId,
      candidates: candidates.length,
      result: candidates,
      activity: "Broad candidate scan completed",
    });

    return candidates;
  } catch (error) {
    console.error("SignalMiner error:", error.message);
    eventEmitter.emit("agent_call_finished", {
      agent: "Signal Miner Agent",
      batch_id: batchId,
      error: error.message,
      using_fallback: true,
    });
    return fallbackSignalMiner(batch);
  }
}

async function evidenceAuditorAgent(batch, candidates, batchId, eventEmitter) {
  try {
    eventEmitter.emit("agent_call_started", {
      timestamp: new Date(),
      agent: "Evidence Auditor Agent",
      batch_id: batchId,
      candidates_to_verify: candidates.length,
      activity: "Validating candidates with strict fraud criteria",
    });

    const agent = createEvidenceAuditorAgent();
    const candidateTxns = batch.filter((t) => candidates.some((c) => c.id === t.id));

    const prompt = `Validate these ${candidateTxns.length} transactions.
Use tool input: {"transactions": [...], "analysis_type": "precision_validation"}
Transactions:\n${JSON.stringify(candidateTxns, null, 2)}`;

    const result = await runWithRetry(agent, prompt);
    emitAgentToolTelemetry(result, "Evidence Auditor Agent", batchId, eventEmitter);
    const confirmed = extractRecords(result.finalOutput, batch, "confirmed");

    eventEmitter.emit("agent_call_finished", {
      timestamp: new Date(),
      agent: "Evidence Auditor Agent",
      batch_id: batchId,
      confirmed: confirmed.length,
      result: confirmed,
      activity: "Strict validation completed",
    });

    return confirmed;
  } catch (error) {
    console.error("EvidenceAuditor error:", error.message);
    eventEmitter.emit("agent_call_finished", {
      agent: "Evidence Auditor Agent",
      batch_id: batchId,
      error: error.message,
      using_fallback: true,
    });
    return fallbackEvidenceAuditor(batch, candidates);
  }
}

async function patternProfilerAgent(batch, candidates, batchId, eventEmitter) {
  try {
    eventEmitter.emit("agent_call_started", {
      timestamp: new Date(),
      agent: "Pattern Profiler Agent",
      batch_id: batchId,
      candidates_to_profile: candidates.length,
      activity: "Profiling geo/channel anomaly signals for candidates",
    });

    const agent = createPatternProfilerAgent();
    const prompt = `Profile these candidates with geo and channel signals.
Use tool input: {"batch":[...], "candidates":[...]}
Batch:\n${JSON.stringify(batch, null, 2)}
Candidates:\n${JSON.stringify(candidates, null, 2)}`;
    const result = await runWithRetry(agent, prompt);
    emitAgentToolTelemetry(result, "Pattern Profiler Agent", batchId, eventEmitter);
    const profiledFromLlm = extractArray(result.finalOutput, "profiled");
    const profiled = profiledFromLlm
      ? mergeById(candidates, profiledFromLlm)
      : (await runGeoVelocityCheck({ batch, candidates })).profiled;

    eventEmitter.emit("agent_call_finished", {
      timestamp: new Date(),
      agent: "Pattern Profiler Agent",
      batch_id: batchId,
      profiled: profiled.length,
      activity: "Candidate profiling completed",
    });
    return profiled;
  } catch (error) {
    eventEmitter.emit("agent_call_finished", {
      agent: "Pattern Profiler Agent",
      batch_id: batchId,
      error: error.message,
      using_fallback: true,
    });
    return (await runGeoVelocityCheck({ batch, candidates })).profiled;
  }
}

async function riskScorerAgent(batch, profiled, batchId, eventEmitter) {
  try {
    eventEmitter.emit("agent_call_started", {
      timestamp: new Date(),
      agent: "Risk Scorer Agent",
      batch_id: batchId,
      records_to_score: profiled.length,
      activity: "Scoring candidate risk and assigning priority",
    });

    const agent = createRiskScorerAgent();
    const prompt = `Score these profiled records.
Use tool input: {"profiled":[...]}
Profiled:\n${JSON.stringify(profiled, null, 2)}`;
    const result = await runWithRetry(agent, prompt);
    emitAgentToolTelemetry(result, "Risk Scorer Agent", batchId, eventEmitter);
    const scoredFromLlm = extractArray(result.finalOutput, "scored");
    const scored = scoredFromLlm
      ? mergeById(profiled, scoredFromLlm)
      : (await runRiskScore({ profiled })).scored;

    eventEmitter.emit("agent_call_finished", {
      timestamp: new Date(),
      agent: "Risk Scorer Agent",
      batch_id: batchId,
      scored: scored.length,
      activity: "Risk scoring completed",
    });
    return scored;
  } catch (error) {
    eventEmitter.emit("agent_call_finished", {
      agent: "Risk Scorer Agent",
      batch_id: batchId,
      error: error.message,
      using_fallback: true,
    });
    return (await runRiskScore({ profiled })).scored;
  }
}

function extractRecords(finalOutput, batch, key) {
  const raw = typeof finalOutput === "string" ? finalOutput : JSON.stringify(finalOutput || {});
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.[key])) {
      return filterToBatch(parsed[key], batch);
    }
  } catch (_err) {
    // Fallback below.
  }
  return parseAgentResponse(raw, batch);
}

function extractArray(finalOutput, key) {
  const raw = typeof finalOutput === "string" ? finalOutput : JSON.stringify(finalOutput || {});
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.[key]) ? parsed[key] : null;
  } catch (_err) {
    return null;
  }
}

function mergeById(baseRecords, enrichedRecords) {
  const byId = new Map((baseRecords || []).map((r) => [r.id, r]));
  for (const item of enrichedRecords || []) {
    if (!item || !item.id) continue;
    byId.set(item.id, { ...(byId.get(item.id) || {}), ...item });
  }
  return Array.from(byId.values());
}

function filterToBatch(records, batch) {
  const batchIds = new Set(batch.map((t) => t.id));
  const dedup = new Map();

  for (const item of records) {
    const id = item?.id;
    if (!id || !batchIds.has(id)) continue;
    dedup.set(id, { id, reason: item.reason || "LLM detected" });
  }

  return Array.from(dedup.values());
}

function fallbackSignalMiner(batch) {
  const candidates = [];

  for (const txn of batch) {
    const reasons = [];
    const amount = parseFloat(txn.amount);
    const merchant = String(txn.merchant).toLowerCase();
    const location = String(txn.location).toLowerCase();
    const channel = String(txn.channel).toLowerCase();

    if (amount >= 3000) reasons.push(`high amount (${amount.toFixed(2)})`);
    if (["crypto", "luxury", "exchange", "gift"].some((k) => merchant.includes(k))) {
      reasons.push("high-risk merchant");
    }
    if (["unknown", "vpn", "lagos", "offshore"].some((k) => location.includes(k))) {
      reasons.push("risky location");
    }
    if (["card_not_present", "online_transfer"].includes(channel) && amount >= 1200) {
      reasons.push("high-risk channel + high amount");
    }

    if (reasons.length > 0) {
      candidates.push({ id: txn.id, reason: reasons.join("; ") });
    }
  }

  return candidates;
}

function fallbackEvidenceAuditor(batch, candidates) {
  const confirmed = [];
  const txnMap = new Map(batch.map((t) => [t.id, t]));

  for (const candidate of candidates) {
    const txn = txnMap.get(candidate.id);
    if (!txn) continue;

    const amount = parseFloat(txn.amount);
    const merchant = String(txn.merchant).toLowerCase();
    const location = String(txn.location).toLowerCase();
    const channel = String(txn.channel).toLowerCase();

    if (amount >= 7000) {
      confirmed.push({ id: txn.id, reason: `very high amount (${amount.toFixed(2)})` });
    } else if (merchant.includes("crypto") && amount >= 2000) {
      confirmed.push({ id: txn.id, reason: "crypto merchant + high amount" });
    } else if (merchant.includes("luxury") && (location.includes("lagos") || location.includes("unknown"))) {
      confirmed.push({ id: txn.id, reason: "luxury + unusual location" });
    } else if (["card_not_present", "online_transfer"].includes(channel) && amount >= 3500) {
      confirmed.push({ id: txn.id, reason: "high-risk channel + large amount" });
    }
  }

  return confirmed;
}

function parseAgentResponse(content, batch) {
  const idPattern = /\b[tT]\d+\b/g;
  const matches = content.match(idPattern) || [];

  const uniqueIds = [...new Set(matches)];
  const batchIds = new Set(batch.map((t) => t.id));

  return uniqueIds
    .filter((id) => batchIds.has(id))
    .map((id) => ({ id, reason: "LLM detected" }));
}

function emitAgentToolTelemetry(result, agentLabel, batchId, eventEmitter) {
  if (!eventEmitter || !result || !Array.isArray(result.newItems)) return;
  const pendingCallIdsByTool = new Map();

  for (const item of result.newItems) {
    if (!item || !item.type) continue;
    const raw = item.rawItem || {};
    const toolName = item.name || raw.name || raw.tool_name || "unknown_tool";
    const toolLabel = `${toolName} Tool`;

    if (item.type === "tool_call_item") {
      const callId = item.callId || raw.call_id || raw.id || `${batchId}:${toolName}:start`;
      const pending = pendingCallIdsByTool.get(toolName) || [];
      pending.push(callId);
      pendingCallIdsByTool.set(toolName, pending);
      eventEmitter.emit("tool_call_started", {
        timestamp: new Date(),
        batch_id: batchId,
        source: "agent_sdk",
        agent: agentLabel,
        tool: toolName,
        tool_label: toolLabel,
        call_id: callId,
        activity: `${agentLabel} is calling ${toolLabel}`,
      });
    }

    if (item.type === "tool_call_output_item") {
      const pending = pendingCallIdsByTool.get(toolName) || [];
      const callId = item.callId || raw.call_id || raw.id || pending.shift() || `${batchId}:${toolName}:done`;
      pendingCallIdsByTool.set(toolName, pending);
      eventEmitter.emit("tool_call_finished", {
        timestamp: new Date(),
        batch_id: batchId,
        source: "agent_sdk",
        agent: agentLabel,
        tool: toolName,
        tool_label: toolLabel,
        call_id: callId,
        activity: `${toolLabel} returned to ${agentLabel}`,
      });
    }
  }
}

module.exports = {
  createSignalMinerAgent,
  createEvidenceAuditorAgent,
  createPatternProfilerAgent,
  createRiskScorerAgent,
  signalMinerAgent,
  patternProfilerAgent,
  riskScorerAgent,
  evidenceAuditorAgent,
  emitAgentToolTelemetry,
};
