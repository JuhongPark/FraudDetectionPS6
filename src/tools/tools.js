/**
 * Tool definitions for Fraud Detection Pipeline
 * Using @openai/agents framework
 */

const fs = require("fs");
const path = require("path");
const { tool } = require("@openai/agents");

// Single-writer queue to prevent race conditions on file writes (PLAN §7)
let writeQueue = Promise.resolve();

async function analyzeTransactionPatterns(input) {
  const { transactions, analysis_type } = input;

  if (analysis_type === "broad_detection") {
    return findBroadCandidates(transactions);
  }
  if (analysis_type === "precision_validation") {
    return validateStrictly(transactions);
  }
  return { candidates: [] };
}

async function writeSuspiciousTransactions(input) {
  const { transactions, output_file } = input;
  const suspiciousFile = output_file
    ? path.resolve(output_file)
    : path.join(__dirname, "../../data/suspiciousTransactions.json");

  // Enqueue to single-writer queue (PLAN §7: avoid race conditions)
  const result = await new Promise((resolve, reject) => {
    writeQueue = writeQueue.then(() => {
      try {
        const existing = fs.existsSync(suspiciousFile)
          ? JSON.parse(fs.readFileSync(suspiciousFile, "utf-8"))
          : [];

        const all = [...existing, ...transactions];
        const deduped = Array.from(new Map(all.map((t) => [t.id, t])).values());

        fs.writeFileSync(suspiciousFile, JSON.stringify(deduped, null, 2));

        resolve({
          tool: "suspiciousTransactions",
          written: transactions.length,
          total: deduped.length,
        });
      } catch (err) {
        reject(err);
      }
    });
  });

  return result;
}

async function streamUiEvent(input, eventEmitter) {
  const { event_type, payload } = input;
  if (eventEmitter) {
    eventEmitter.emit(event_type, payload);
  }
  return { status: "ok", event: event_type };
}

async function runGeoVelocityCheck(input) {
  const { batch, candidates } = input;
  const idToTxn = new Map((batch || []).map((t) => [t.id, t]));
  const profiled = (candidates || []).map((c) => {
    const txn = idToTxn.get(c.id) || {};
    const amount = Number(txn.amount || 0);
    const location = String(txn.location || "").toLowerCase();
    const channel = String(txn.channel || "").toLowerCase();

    let geoRisk = 0;
    const signals = [];
    if (["lagos", "unknown", "vpn", "offshore"].some((k) => location.includes(k))) {
      geoRisk += 40;
      signals.push("geo_anomaly");
    }
    if (["card_not_present", "online_transfer"].includes(channel)) {
      geoRisk += 25;
      signals.push("remote_channel");
    }
    if (amount >= 3000) {
      geoRisk += 20;
      signals.push("large_amount");
    }

    return {
      ...c,
      geo_risk: Math.min(100, geoRisk),
      signals,
    };
  });

  return { profiled };
}

async function runRiskScore(input) {
  const { profiled } = input;
  const scored = (profiled || []).map((item) => {
    const signalWeight = Array.isArray(item.signals) ? item.signals.length * 10 : 0;
    const reasonWeight = item.reason ? Math.min(20, item.reason.length / 8) : 0;
    const geoWeight = Number(item.geo_risk || 0);
    const score = Math.min(100, Math.round(signalWeight + reasonWeight + geoWeight));
    return {
      ...item,
      risk_score: score,
      priority: score >= 70 ? "high" : score >= 45 ? "medium" : "low",
    };
  });

  return { scored };
}

async function runBatchIntegrityAudit(input) {
  const { batch, candidates, profiled, scored, confirmed } = input;
  const batchIds = new Set((batch || []).map((t) => t.id));
  const candidateIds = new Set((candidates || []).map((t) => t.id));
  const profiledIds = new Set((profiled || []).map((t) => t.id));
  const scoredIds = new Set((scored || []).map((t) => t.id));
  const confirmedIds = new Set((confirmed || []).map((t) => t.id));

  const subset = (small, large) => Array.from(small).every((id) => large.has(id));
  const chainOk =
    subset(candidateIds, batchIds) &&
    subset(profiledIds, candidateIds) &&
    subset(scoredIds, profiledIds) &&
    subset(confirmedIds, scoredIds);

  return {
    audit: {
      batch_count: batchIds.size,
      candidate_count: candidateIds.size,
      profiled_count: profiledIds.size,
      scored_count: scoredIds.size,
      confirmed_count: confirmedIds.size,
      chain_consistent: chainOk,
    },
  };
}

async function runDecisionExplainability(input) {
  const { confirmed, scored } = input;
  const scoreMap = new Map((scored || []).map((r) => [r.id, r]));
  const explanations = (confirmed || []).map((item) => {
    const scoreRow = scoreMap.get(item.id) || {};
    const score = Number(scoreRow.risk_score || 0);
    const priority = scoreRow.priority || "low";
    return {
      id: item.id,
      priority,
      risk_score: score,
      explanation: `${item.reason || "confirmed by rules"}; priority=${priority}; score=${score}`,
    };
  });
  return { explanations };
}

const analyzeTransactionPatternsTool = tool({
  name: "analyze_transaction_patterns",
  description: "Analyze transaction data to find suspicious patterns and return candidates",
  parameters: {
    type: "object",
    properties: {
      transactions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            amount: { type: "number" },
            merchant: { type: "string" },
            location: { type: "string" },
            channel: { type: "string" },
          },
        },
      },
      analysis_type: {
        type: "string",
        enum: ["broad_detection", "precision_validation"],
      },
    },
    required: ["transactions", "analysis_type"],
    additionalProperties: false,
  },
  strict: false,
  execute: analyzeTransactionPatterns,
});

const suspiciousTransactionsTool = tool({
  name: "suspiciousTransactions",
  description: "Store and persist suspicious transactions",
  parameters: {
    type: "object",
    properties: {
      transactions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            reason: { type: "string" },
          },
        },
      },
      output_file: {
        type: "string",
      },
    },
    required: ["transactions"],
    additionalProperties: false,
  },
  strict: false,
  execute: writeSuspiciousTransactions,
});

const uiEventStreamTool = tool({
  name: "ui_event_stream",
  description: "Stream events to the monitoring UI",
  parameters: {
    type: "object",
    properties: {
      event_type: { type: "string" },
      payload: { type: "object" },
    },
    required: ["event_type", "payload"],
    additionalProperties: false,
  },
  strict: false,
  execute: async (input) => streamUiEvent(input),
});

const geoVelocityCheckTool = tool({
  name: "geoVelocityCheckTool",
  description: "Enrich suspicious candidates with geo and channel risk signals",
  parameters: {
    type: "object",
    properties: {
      batch: {
        type: "array",
        items: { type: "object" },
      },
      candidates: {
        type: "array",
        items: { type: "object" },
      },
    },
    required: ["batch", "candidates"],
    additionalProperties: false,
  },
  strict: false,
  execute: runGeoVelocityCheck,
});

const riskScoreTool = tool({
  name: "riskScoreTool",
  description: "Assign risk scores and priority levels to profiled candidates",
  parameters: {
    type: "object",
    properties: {
      profiled: {
        type: "array",
        items: { type: "object" },
      },
    },
    required: ["profiled"],
    additionalProperties: false,
  },
  strict: false,
  execute: runRiskScore,
});

const batchIntegrityAuditTool = tool({
  name: "batchIntegrityAuditTool",
  description: "Audit ID lineage and count consistency across batch processing stages",
  parameters: {
    type: "object",
    properties: {
      batch: { type: "array", items: { type: "object" } },
      candidates: { type: "array", items: { type: "object" } },
      profiled: { type: "array", items: { type: "object" } },
      scored: { type: "array", items: { type: "object" } },
      confirmed: { type: "array", items: { type: "object" } },
    },
    required: ["batch", "candidates", "profiled", "scored", "confirmed"],
    additionalProperties: false,
  },
  strict: false,
  execute: runBatchIntegrityAudit,
});

const decisionExplainabilityTool = tool({
  name: "decisionExplainabilityTool",
  description: "Generate compact explanations for confirmed suspicious decisions",
  parameters: {
    type: "object",
    properties: {
      confirmed: { type: "array", items: { type: "object" } },
      scored: { type: "array", items: { type: "object" } },
    },
    required: ["confirmed", "scored"],
    additionalProperties: false,
  },
  strict: false,
  execute: runDecisionExplainability,
});

function findBroadCandidates(transactions) {
  const candidates = [];

  for (const txn of transactions) {
    const reasons = [];
    const amount = parseFloat(txn.amount);
    const merchant = String(txn.merchant).toLowerCase();
    const location = String(txn.location).toLowerCase();
    const channel = String(txn.channel).toLowerCase();

    if (amount >= 3000) reasons.push(`high amount (${amount.toFixed(2)})`);
    if (["crypto", "luxury", "exchange", "gift"].some((k) => merchant.includes(k))) {
      reasons.push(`high-risk merchant (${txn.merchant})`);
    }
    if (["unknown", "vpn", "lagos", "offshore"].some((k) => location.includes(k))) {
      reasons.push(`risky location (${txn.location})`);
    }
    if (["card_not_present", "online_transfer"].includes(channel) && amount >= 1200) {
      reasons.push(`high-risk channel (${channel}) with elevated amount`);
    }

    if (reasons.length > 0) {
      candidates.push({ id: txn.id, reason: reasons.join("; ") });
    }
  }

  return { candidates };
}

function validateStrictly(candidates) {
  const confirmed = [];

  for (const candidate of candidates) {
    const reason = validateCandidate(candidate);
    if (reason) {
      confirmed.push({ id: candidate.id, reason });
    }
  }

  return { confirmed };
}

function validateCandidate(txn) {
  const amount = parseFloat(txn.amount);
  const merchant = String(txn.merchant).toLowerCase();
  const location = String(txn.location).toLowerCase();
  const channel = String(txn.channel).toLowerCase();

  if (amount >= 7000) {
    return `confirmed: very high amount (${amount.toFixed(2)})`;
  }
  if (merchant.includes("crypto") && amount >= 2000) {
    return `confirmed: crypto merchant + high amount (${amount.toFixed(2)})`;
  }
  if (merchant.includes("luxury") && (location.includes("lagos") || location.includes("unknown"))) {
    return "confirmed: luxury + unusual location";
  }
  if (["card_not_present", "online_transfer"].includes(channel) && amount >= 3500) {
    return "confirmed: high-risk channel with large amount";
  }

  return null;
}

module.exports = {
  analyzeTransactionPatterns,
  writeSuspiciousTransactions,
  streamUiEvent,
  runGeoVelocityCheck,
  runRiskScore,
  runBatchIntegrityAudit,
  runDecisionExplainability,
  analyzeTransactionPatternsTool,
  suspiciousTransactionsTool,
  uiEventStreamTool,
  geoVelocityCheckTool,
  riskScoreTool,
  batchIntegrityAuditTool,
  decisionExplainabilityTool,
};
