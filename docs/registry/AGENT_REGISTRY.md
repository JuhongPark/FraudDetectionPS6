# Agent Registry

Source of truth for all active agents used in this project.
Using @openai/agents framework with OpenAI chat API backend.

## Technology Stack
- **Runtime**: Node.js (JavaScript/CommonJS)
- **Framework**: @openai/agents@0.5.4
- **API**: @openai/agents `run()` orchestration
- **Model**: gpt-5.3 (configurable via OPENAI_MODEL env var)

## Rules
- Keep only agent entries in this file.
- Do not document tool calls here.
- Update this file whenever an agent is added, removed, or its role changes.
- All agents use Agent class from @openai/agents framework

## Agent Inventory

| Agent Name | Location | Framework | Role | Trigger Condition | Inputs | Outputs | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SignalMiner | `src/agents/fraudDetectionAgents.js` | @openai/agents Agent | Broad fraud detection | Batch received (size=20) | Batch transactions (JSON) | Array of {id, reason} candidates | active |
| EvidenceAuditor | `src/agents/fraudDetectionAgents.js` | @openai/agents Agent | Strict fraud validation | Candidate list available | Batch + candidate records | Array of {id, reason} confirmed | active |

## Agent Creation Details

### SignalMiner
```javascript
const agent = new Agent({
  model: "gpt-5.3",
  name: "SignalMiner",
  instructions: "Identify ANY suspicious transaction patterns...",
  tools: [analyzeTransactionPatternsTool]
});
```

- **Behavior**: Inclusive detection, high recall, flagged uncertainties
- **Tool**: analyzeTransactionPatternsTool with analysis_type="broad_detection"
- **Fallback**: Rule-based fallbackSignalMiner() when API fails
- **Events Emitted**:
  - `agent_call_started` ({agent, batch_id, batch_size})
  - `agent_call_finished` ({agent, batch_id, candidates_found, result})

### EvidenceAuditor
```javascript
const agent = new Agent({
  model: "gpt-5.3",
  name: "EvidenceAuditor",
  instructions: "Verify suspended transactions with strong evidence...",
  tools: [analyzeTransactionPatternsTool]
});
```

- **Behavior**: Conservative validation, high precision, confirmed fraud only
- **Tool**: analyzeTransactionPatternsTool with analysis_type="precision_validation"
- **Fallback**: Rule-based fallbackEvidenceAuditor() when API fails
- **Events Emitted**:
  - `agent_call_started` ({agent, batch_id, candidates_to_verify})
  - `agent_call_finished` ({agent, batch_id, confirmed_fraud, result})

## Change Log

| Date | Change | Updated By |
| --- | --- | --- |
| 2026-03-07 | Initial registry template created | Copilot |
| 2026-03-08 | Migrated to Node.js/JavaScript with @openai/agents | Copilot |
| 2026-03-08 | Added Agent class references and tool configuration | Copilot |
