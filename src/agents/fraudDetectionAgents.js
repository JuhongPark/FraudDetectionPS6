const OpenAI = require("openai");
const dotenv = require("dotenv");

dotenv.config();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Tool definitions for agents
const tools = [
  {
    name: "analyze_transaction_patterns",
    description: "Analyze transaction data to find suspicious patterns",
    input_schema: {
      type: "object",
      properties: {
        transactions: {
          type: "array",
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
  },
];

// Signal Miner Agent - Broad fraud detection
async function signalMinerAgent(batch, batchId, eventEmitter) {
  const prompt = `Analyze these ${batch.length} transactions for potential fraud indicators. 
Be BROAD in identifying candidates - we want high recall. Return ONLY a valid JSON object (no markdown, no extra text):

Transactions:
${batch
  .map(
    (t) =>
      `ID:${t.id} | Amount:${t.amount} | Merchant:${t.merchant} | Location:${t.location} | Channel:${t.channel}`
  )
  .join("\n")}

Return this exact JSON structure:
{
  "candidates": [
    {"id": "txn_2000", "reason": "reason 1"},
    {"id": "txn_2001", "reason": "reason 2"}
  ]
}`;

  try {
    eventEmitter.emit("agent_call_started", {
      agent: "Signal Miner",
      batch_id: batchId,
    });

    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-5.3",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });

    const content = response.choices[0].message.content;
    const result = JSON.parse(content);
    const candidates = result.candidates || [];

    eventEmitter.emit("agent_call_finished", {
      agent: "Signal Miner",
      batch_id: batchId,
      candidates: candidates.length,
    });

    return candidates;
  } catch (error) {
    console.warn(`Signal Miner error: ${error.message}, using fallback`);
    eventEmitter.emit("agent_call_finished", {
      agent: "Signal Miner",
      batch_id: batchId,
      candidates: 0,
    });
    return fallbackSignalMiner(batch);
  }
}

// Evidence Auditor Agent - Strict fraud validation
async function evidenceAuditorAgent(batch, candidates, batchId, eventEmitter) {
  if (candidates.length === 0) return [];

  const index = Object.fromEntries(batch.map((t) => [t.id, t]));
  const candidateTxns = candidates
    .map((c) => index[c.id])
    .filter((t) => t);

  if (candidateTxns.length === 0) return [];

  const prompt = `Validate these ${candidateTxns.length} suspected fraudulent transactions. 
Be STRICT - only confirm ones with strong fraud signals. Return ONLY a valid JSON object (no markdown, no extra text):

Suspected Transactions:
${candidateTxns
  .map(
    (t) =>
      `ID:${t.id} | Amount:${t.amount} | Merchant:${t.merchant} | Location:${t.location} | Channel:${t.channel}`
  )
  .join("\n")}

Return this exact JSON structure:
{
  "confirmed": [
    {"id": "txn_2004", "reason": "confirmed: reason 1"},
    {"id": "txn_2011", "reason": "confirmed: reason 2"}
  ]
}`;

  try {
    eventEmitter.emit("agent_call_started", {
      agent: "Evidence Auditor",
      batch_id: batchId,
    });

    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-5.3",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
    });

    const content = response.choices[0].message.content;
    const result = JSON.parse(content);
    const confirmed = result.confirmed || [];

    eventEmitter.emit("agent_call_finished", {
      agent: "Evidence Auditor",
      batch_id: batchId,
      confirmed: confirmed.length,
    });

    return confirmed;
  } catch (error) {
    console.warn(`Evidence Auditor error: ${error.message}, using fallback`);
    eventEmitter.emit("agent_call_finished", {
      agent: "Evidence Auditor",
      batch_id: batchId,
      confirmed: 0,
    });
    return fallbackEvidenceAuditor(index, candidates);
  }
}

// Fallback rule-based Signal Miner
function fallbackSignalMiner(batch) {
  const candidates = [];
  for (const txn of batch) {
    const reasons = [];
    const amount = parseFloat(txn.amount);
    const merchant = String(txn.merchant).toLowerCase();
    const location = String(txn.location).toLowerCase();
    const channel = String(txn.channel).toLowerCase();

    if (amount >= 3000) reasons.push(`high amount (${amount.toFixed(2)})`);
    if (
      ["crypto", "luxury", "exchange", "gift"].some((k) => merchant.includes(k))
    )
      reasons.push(`high-risk merchant (${txn.merchant})`);
    if (
      ["unknown", "vpn", "lagos", "offshore"].some((k) => location.includes(k))
    )
      reasons.push(`risky location (${txn.location})`);
    if (["card_not_present", "online_transfer"].includes(channel) && amount >= 1200)
      reasons.push(`high-risk channel (${channel}) with elevated amount`);

    if (reasons.length > 0) {
      candidates.push({ id: txn.id, reason: reasons.join("; ") });
    }
  }
  return candidates;
}

// Fallback rule-based Evidence Auditor
function fallbackEvidenceAuditor(index, candidates) {
  const confirmed = [];
  for (const candidate of candidates) {
    const txn = index[candidate.id];
    if (!txn) continue;

    const amount = parseFloat(txn.amount);
    const merchant = String(txn.merchant).toLowerCase();
    const location = String(txn.location).toLowerCase();
    const channel = String(txn.channel).toLowerCase();

    let reason = null;
    if (amount >= 7000) {
      reason = `confirmed: very high amount (${amount.toFixed(2)})`;
    } else if ("crypto" in merchant && amount >= 2000) {
      reason = `confirmed: crypto merchant + high amount (${amount.toFixed(2)})`;
    } else if (
      merchant.includes("luxury") &&
      (location.includes("lagos") || location.includes("unknown"))
    ) {
      reason = "confirmed: luxury + unusual location";
    } else if (
      ["card_not_present", "online_transfer"].includes(channel) &&
      amount >= 3500
    ) {
      reason = "confirmed: high-risk channel with large amount";
    }

    if (reason) {
      confirmed.push({ id: candidate.id, reason });
    }
  }
  return confirmed;
}

module.exports = {
  signalMinerAgent,
  evidenceAuditorAgent,
};
