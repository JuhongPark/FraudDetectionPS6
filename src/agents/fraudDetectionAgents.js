/**
 * Fraud Detection Agents using @openai/agents framework
 */

const { Agent } = require("@openai/agents");
const { OpenAI } = require("openai");
require("dotenv").config();

const {
  analyzeTransactionPatternsTool,
  suspiciousTransactionsTool,
  uiEventStreamTool
} = require("../tools/tools");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const MODEL = process.env.OPENAI_MODEL || "gpt-4-turbo";

/**
 * SignalMiner Agent: Broad detection phase
 * Identifies potential fraud candidates with high recall
 */
async function createSignalMinerAgent(eventEmitter) {
  const agent = new Agent({
    model: MODEL,
    name: "SignalMiner",
    instructions: `You are a fraud detection specialist (Signal Miner). 
Your job is to identify ANY potentially suspicious transaction patterns.
Be inclusive - flag uncertainties rather than ignore them.
Focus on: unusually high amounts, risky merchants/channels, unusual locations.
Return a list of transaction IDs that warrant further investigation.`,
    tools: [analyzeTransactionPatternsTool],
  });
  
  // Attach event emitter for monitoring
  agent._eventEmitter = eventEmitter;
  return agent;
}

/**
 * EvidenceAuditor Agent: Strict validation phase
 * Validates fraud candidates with high precision
 */
async function createEvidenceAuditorAgent(eventEmitter) {
  const agent = new Agent({
    model: MODEL,
    name: "EvidenceAuditor",
    instructions: `You are a fraud detection specialist (Evidence Auditor).
Your job is to verify suspicious transactions and confirm only clear fraud cases.
Be conservative - only return transactions with strong evidence of fraud.
Focus on: extreme amounts, multiple red flags, high-risk combinations.
Return only transaction IDs that are definitely fraudulent.`,
    tools: [analyzeTransactionPatternsTool],
  });
  
  // Attach event emitter for monitoring
  agent._eventEmitter = eventEmitter;
  return agent;
}

/**
 * Execute SignalMiner agent on a batch
 */
async function signalMinerAgent(batch, batchId, eventEmitter) {
  try {
    eventEmitter.emit("agent_call_started", {
      timestamp: new Date(),
      agent: "SignalMiner",
      batch_id: batchId,
      batch_size: batch.length
    });

    const agent = await createSignalMinerAgent(eventEmitter);
    
    // Prepare batch data for the agent
    const prompt = `Analyze this batch of ${batch.length} transactions and identify potential fraud candidates.
Return the IDs of suspicious transactions.

Transactions:
${JSON.stringify(batch, null, 2)}`;

    // Call the agent
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: agent.instructions
        },
        {
          role: "user",
          content: prompt
        }
      ]
    });

    const content = response.choices[0].message.content;
    const candidates = parseAgentResponse(content, batch);

    eventEmitter.emit("agent_call_finished", {
      timestamp: new Date(),
      agent: "SignalMiner",
      batch_id: batchId,
      candidates_found: candidates.length,
      result: candidates
    });

    return candidates;
  } catch (error) {
    console.error("SignalMiner error:", error.message);
    eventEmitter.emit("agent_call_finished", {
      agent: "SignalMiner",
      batch_id: batchId,
      error: error.message,
      using_fallback: true
    });
    return fallbackSignalMiner(batch);
  }
}

/**
 * Execute EvidenceAuditor agent on candidates
 */
async function evidenceAuditorAgent(batch, candidates, batchId, eventEmitter) {
  try {
    eventEmitter.emit("agent_call_started", {
      timestamp: new Date(),
      agent: "EvidenceAuditor",
      batch_id: batchId,
      candidates_to_verify: candidates.length
    });

    const agent = await createEvidenceAuditorAgent(eventEmitter);
    
    // Get full transaction objects for verification
    const candidateTxns = batch.filter(t => candidates.some(c => c.id === t.id));
    
    const prompt = `Verify these ${candidates.length} suspected fraudulent transactions.
Only confirm transactions that show CLEAR fraud indicators.
Return ONLY the IDs of highly suspicious transactions you can confirm.

Suspects:
${JSON.stringify(candidateTxns, null, 2)}`;

    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: agent.instructions
        },
        {
          role: "user",
          content: prompt
        }
      ]
    });

    const content = response.choices[0].message.content;
    const confirmed = parseAgentResponse(content, batch);

    eventEmitter.emit("agent_call_finished", {
      timestamp: new Date(),
      agent: "EvidenceAuditor",
      batch_id: batchId,
      confirmed_fraud: confirmed.length,
      result: confirmed
    });

    return confirmed;
  } catch (error) {
    console.error("EvidenceAuditor error:", error.message);
    eventEmitter.emit("agent_call_finished", {
      agent: "EvidenceAuditor",
      batch_id: batchId,
      error: error.message,
      using_fallback: true
    });
    return fallbackEvidenceAuditor(batch, candidates);
  }
}

/**
 * Fallback: Rule-based Signal Miner
 */
function fallbackSignalMiner(batch) {
  const candidates = [];
  
  for (const txn of batch) {
    const reasons = [];
    const amount = parseFloat(txn.amount);
    const merchant = String(txn.merchant).toLowerCase();
    const location = String(txn.location).toLowerCase();
    const channel = String(txn.channel).toLowerCase();

    if (amount >= 3000) reasons.push(`high amount (${amount.toFixed(2)})`);
    if (["crypto", "luxury", "exchange", "gift"].some(k => merchant.includes(k)))
      reasons.push(`high-risk merchant`);
    if (["unknown", "vpn", "lagos", "offshore"].some(k => location.includes(k)))
      reasons.push(`risky location`);
    if (["card_not_present", "online_transfer"].includes(channel) && amount >= 1200)
      reasons.push(`high-risk channel + high amount`);

    if (reasons.length > 0) {
      candidates.push({ id: txn.id, reason: reasons.join("; ") });
    }
  }
  
  return candidates;
}

/**
 * Fallback: Rule-based Evidence Auditor
 */
function fallbackEvidenceAuditor(batch, candidates) {
  const confirmed = [];
  const txnMap = new Map(batch.map(t => [t.id, t]));

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
      confirmed.push({ id: txn.id, reason: `crypto merchant + high amount` });
    } else if (merchant.includes("luxury") && (location.includes("lagos") || location.includes("unknown"))) {
      confirmed.push({ id: txn.id, reason: `luxury + unusual location` });
    } else if (["card_not_present", "online_transfer"].includes(channel) && amount >= 3500) {
      confirmed.push({ id: txn.id, reason: `high-risk channel + large amount` });
    }
  }
  
  return confirmed;
}

/**
 * Parse agent response to extract transaction IDs
 */
function parseAgentResponse(content, batch) {
  const idPattern = /\b[tT]\d+\b/g;
  const matches = content.match(idPattern) || [];
  
  const uniqueIds = [...new Set(matches)];
  const batchIds = new Set(batch.map(t => t.id));
  
  const results = [];
  for (const id of uniqueIds) {
    if (batchIds.has(id)) {
      results.push({ id, reason: "LLM detected" });
    }
  }
  
  // If no IDs found, try to extract from JSON
  if (results.length === 0) {
    try {
      const jsonMatch = content.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (typeof item === "string" && batchIds.has(item)) {
              results.push({ id: item, reason: "LLM detected" });
            } else if (item.id && batchIds.has(item.id)) {
              results.push(item);
            }
          }
        }
      }
    } catch (e) {
      // Continue with regex matches
    }
  }
  
  return results;
}

module.exports = {
  signalMinerAgent,
  evidenceAuditorAgent
};
