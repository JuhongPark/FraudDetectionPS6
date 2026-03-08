# Tool Call Registry

Source of truth for all tool definitions and calls used in this project.
Uses @openai/agents framework Tool system with OpenAI API backend.

## Technology Stack
- **Framework**: @openai/agents@0.5.4
- **Tool Implementation**: Custom tool objects with input_schema and fn()
- **Tool Location**: `src/tools/tools.js`

## Rules
- Keep only tool entries in this file.
- Do not document agents here (see AGENT_REGISTRY.md)
- Update this file whenever a tool is added, removed, renamed, or payload changes
- All tools follow @openai/agents Tool object specification

## Tool Inventory

| Tool Name | Location | Purpose | Called By | Input Schema | Output Schema | Telemetry Events | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| analyze_transaction_patterns | `src/tools/tools.js` | Pattern analysis for fraud detection | SignalMiner, EvidenceAuditor | transactions[], analysis_type | candidates[] \| confirmed[] | agent_call_started, agent_call_finished | active |
| suspiciousTransactions | `src/tools/tools.js` | Persist suspicious transactions to file | fraudPipeline.processBatch() | transactions[] | {written, total} | tool_call_started, tool_call_finished, tool_executed | active |
| ui_event_stream | `src/tools/tools.js` | Stream events to UI dashboard | EventEmitter | event_type, payload | {status, event} | Various events | active |

## Tool Definitions

### analyze_transaction_patterns
```javascript
{
  name: "analyze_transaction_patterns",
  description: "Analyze transaction data to find suspicious patterns",
  input_schema: {
    type: "object",
    properties: {
      transactions: { type: "array", items: { type: "object" } },
      analysis_type: { type: "string", enum: ["broad_detection", "precision_validation"] }
    }
  },
  fn: async (input) => { /* pattern analysis logic */ }
}
```

- **Inputs**: Array of transactions + analysis type
- **Outputs**: {candidates: [{id, reason}]} for broad OR {confirmed: [{id, reason}]} for strict
- **Called By**: SignalMiner (broad), EvidenceAuditor (strict)
- **Error Handling**: Throws to trigger agent fallback

### suspiciousTransactions
```javascript
{
  name: "suspiciousTransactions",
  description: "Store and persist suspicious transactions",
  input_schema: {
    type: "object",
    properties: {
      transactions: { type: "array", items: { type: "object" } }
    }
  },
  fn: async (input, eventEmitter) => { /* file write logic */ }
}
```

- **Inputs**: Array of {id, reason} transactions
- **Outputs**: {tool, written, total}
- **Called By**: fraudPipeline.processBatch()
- **File**: `data/suspiciousTransactions.json` (deduplicated)
- **Events**: tool_call_started, tool_call_finished, tool_executed

### ui_event_stream
```javascript
{
  name: "ui_event_stream",
  description: "Stream events to the monitoring UI",
  input_schema: {
    type: "object",
    properties: {
      event_type: { type: "string" },
      payload: { type: "object" }
    }
  },
  fn: async (input, eventEmitter) => { /* event emission logic */ }
}
```

- **Inputs**: event_type + payload object
- **Outputs**: {status, event}
- **Called By**: Pipeline event handlers
- **Events**: Dynamic per event_type (agent_call_started, batch_finished, etc.)

## Call Graph

```
FraudPipeline.run()
  └─> processBatch(batch, index)
      ├─> signalMinerAgent()
      │   └─> analyze_transaction_patterns(broad)
      ├─> evidenceAuditorAgent()
      │   └─> analyze_transaction_patterns(strict)
      └─> suspiciousTransactionsTool.fn()
          └─> [WRITE] data/suspiciousTransactions.json
```

## Change Log

| Date | Change | Updated By |
| --- | --- | --- |
| 2026-03-07 | Initial registry template created | Copilot |
| 2026-03-08 | Migrated to Node.js with @openai/agents Tool framework | Copilot |
| 2026-03-08 | Added tool definitions, call graph, and @openai/agents structure | Copilot |
