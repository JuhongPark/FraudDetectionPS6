/**
 * Fraud Detection Agents using @openai/agents framework
 */

const { Agent, run } = require("@openai/agents");
require("dotenv").config();

const { analyzeTransactionPatternsTool } = require("../tools/tools");

const MODEL = process.env.OPENAI_MODEL || "gpt-5.4";

function createSignalMinerAgent() {
  return new Agent({
    model: MODEL,
    name: "SignalMiner",
    instructions: `You are a fraud detection specialist (Signal Miner).
Always call the analyze_transaction_patterns tool exactly once with analysis_type="broad_detection".
Then return ONLY JSON: {"candidates":[{"id":"...","reason":"..."}]}.`,
    tools: [analyzeTransactionPatternsTool],
  });
}

function createEvidenceAuditorAgent() {
  return new Agent({
    model: MODEL,
    name: "EvidenceAuditor",
    instructions: `You are a fraud detection specialist (Evidence Auditor).
Always call the analyze_transaction_patterns tool exactly once with analysis_type="precision_validation".
Then return ONLY JSON: {"confirmed":[{"id":"...","reason":"..."}]}.`,
    tools: [analyzeTransactionPatternsTool],
  });
}

async function signalMinerAgent(batch, batchId, eventEmitter) {
  try {
    eventEmitter.emit("agent_call_started", {
      timestamp: new Date(),
      agent: "Signal Miner",
      batch_id: batchId,
      batch_size: batch.length,
    });

    const agent = createSignalMinerAgent();
    const prompt = `Analyze this batch of ${batch.length} transactions.
Use tool input: {"transactions": [...], "analysis_type": "broad_detection"}
Transactions:\n${JSON.stringify(batch, null, 2)}`;

    const result = await run(agent, prompt);
    const candidates = extractRecords(result.finalOutput, batch, "candidates");

    eventEmitter.emit("agent_call_finished", {
      timestamp: new Date(),
      agent: "Signal Miner",
      batch_id: batchId,
      candidates: candidates.length,
      result: candidates,
    });

    return candidates;
  } catch (error) {
    console.error("SignalMiner error:", error.message);
    eventEmitter.emit("agent_call_finished", {
      agent: "Signal Miner",
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
      agent: "Evidence Auditor",
      batch_id: batchId,
      candidates_to_verify: candidates.length,
    });

    const agent = createEvidenceAuditorAgent();
    const candidateTxns = batch.filter((t) => candidates.some((c) => c.id === t.id));

    const prompt = `Validate these ${candidateTxns.length} transactions.
Use tool input: {"transactions": [...], "analysis_type": "precision_validation"}
Transactions:\n${JSON.stringify(candidateTxns, null, 2)}`;

    const result = await run(agent, prompt);
    const confirmed = extractRecords(result.finalOutput, batch, "confirmed");

    eventEmitter.emit("agent_call_finished", {
      timestamp: new Date(),
      agent: "Evidence Auditor",
      batch_id: batchId,
      confirmed: confirmed.length,
      result: confirmed,
    });

    return confirmed;
  } catch (error) {
    console.error("EvidenceAuditor error:", error.message);
    eventEmitter.emit("agent_call_finished", {
      agent: "Evidence Auditor",
      batch_id: batchId,
      error: error.message,
      using_fallback: true,
    });
    return fallbackEvidenceAuditor(batch, candidates);
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

module.exports = {
  createSignalMinerAgent,
  createEvidenceAuditorAgent,
  signalMinerAgent,
  evidenceAuditorAgent,
};
