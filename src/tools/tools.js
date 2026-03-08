/**
 * Tool definitions for Fraud Detection Pipeline
 * Using @openai/agents framework
 */

// Tool for analyzing transaction patterns
const analyzeTransactionPatternsTool = {
  name: "analyze_transaction_patterns",
  description: "Analyze transaction data to find suspicious patterns and return candidates",
  input_schema: {
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
            channel: { type: "string" }
          }
        },
        description: "List of transactions to analyze",
      },
      analysis_type: {
        type: "string",
        enum: ["broad_detection", "precision_validation"],
        description: "Type of analysis: broad (Signal Miner) or strict (Evidence Auditor)",
      },
    },
    required: ["transactions", "analysis_type"],
  },
  fn: async (input) => {
    const { transactions, analysis_type } = input;
    
    if (analysis_type === "broad_detection") {
      // Signal Miner: broad detection
      return findBroadCandidates(transactions);
    } else if (analysis_type === "precision_validation") {
      // Evidence Auditor: strict validation
      return validateStrictly(transactions);
    }
    return { candidates: [] };
  }
};

// Tool for writing suspicious transactions
const suspiciousTransactionsTool = {
  name: "suspicious_transactions",
  description: "Store and persist suspicious transactions",
  input_schema: {
    type: "object",
    properties: {
      transactions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            reason: { type: "string" }
          }
        },
        description: "List of suspicious transactions to store",
      },
    },
    required: ["transactions"],
  },
  fn: async (input) => {
    const { transactions } = input;
    const fs = require("fs");
    const path = require("path");
    
    const suspiciousFile = path.join(__dirname, "../../data/suspiciousTransactions.json");
    const existing = JSON.parse(fs.readFileSync(suspiciousFile, "utf-8"));
    
    // Merge and deduplicate
    const all = [...existing, ...transactions];
    const deduped = Array.from(new Map(all.map(t => [t.id, t])).values());
    
    fs.writeFileSync(suspiciousFile, JSON.stringify(deduped, null, 2));
    
    return {
      tool: "suspiciousTransactions",
      written: transactions.length,
      total: deduped.length
    };
  }
};

// Tool for UI event streaming
const uiEventStreamTool = {
  name: "ui_event_stream",
  description: "Stream events to the monitoring UI",
  input_schema: {
    type: "object",
    properties: {
      event_type: {
        type: "string",
        description: "Type of event (batch_started, suspicious_found, etc)"
      },
      payload: {
        type: "object",
        description: "Event payload"
      }
    },
    required: ["event_type", "payload"],
  },
  fn: async (input, eventEmitter) => {
    const { event_type, payload } = input;
    if (eventEmitter) {
      eventEmitter.emit(event_type, payload);
    }
    return { status: "ok", event: event_type };
  }
};

// Helper functions
function findBroadCandidates(transactions) {
  const candidates = [];
  
  for (const txn of transactions) {
    const reasons = [];
    const amount = parseFloat(txn.amount);
    const merchant = String(txn.merchant).toLowerCase();
    const location = String(txn.location).toLowerCase();
    const channel = String(txn.channel).toLowerCase();

    if (amount >= 3000) reasons.push(`high amount (${amount.toFixed(2)})`);
    if (["crypto", "luxury", "exchange", "gift"].some(k => merchant.includes(k)))
      reasons.push(`high-risk merchant (${txn.merchant})`);
    if (["unknown", "vpn", "lagos", "offshore"].some(k => location.includes(k)))
      reasons.push(`risky location (${txn.location})`);
    if (["card_not_present", "online_transfer"].includes(channel) && amount >= 1200)
      reasons.push(`high-risk channel (${channel}) with elevated amount`);

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
  } else if (merchant.includes("crypto") && amount >= 2000) {
    return `confirmed: crypto merchant + high amount (${amount.toFixed(2)})`;
  } else if (
    merchant.includes("luxury") &&
    (location.includes("lagos") || location.includes("unknown"))
  ) {
    return "confirmed: luxury + unusual location";
  } else if (
    ["card_not_present", "online_transfer"].includes(channel) &&
    amount >= 3500
  ) {
    return "confirmed: high-risk channel with large amount";
  }
  
  return null;
}

module.exports = {
  analyzeTransactionPatternsTool,
  suspiciousTransactionsTool,
  uiEventStreamTool
};
