# Tool Call Registry

Source of truth for tool definitions and tool-call telemetry used in this project.

## Technology Stack
- Framework: `@openai/agents@0.5.4`
- Tool API shape in code: `tool({ name, description, parameters, strict, execute })`
- Tool definitions location: `src/tools/tools.js`

## Rules
- Keep only tool entries in this file.
- Do not document agent inventory here.
- Update this file whenever a tool is added, removed, renamed, or event payload changes.

## Tool Inventory

| Tool Name | Location | Called By | Purpose | Input | Output | Telemetry |
| --- | --- | --- | --- | --- | --- | --- |
| `analyze_transaction_patterns` | `src/tools/tools.js` | Signal Miner Agent, Evidence Auditor Agent (via agent SDK) | Broad/precision fraud pattern analysis | `{transactions, analysis_type}` | `{candidates}` or `{confirmed}` | `tool_call_started/finished` (`source=agent_sdk`) |
| `geoVelocityCheckTool` | `src/tools/tools.js` | Pattern Profiler Agent (via agent SDK), fallback direct function | Geo/channel enrichment | `{batch, candidates}` | `{profiled}` | `tool_call_started/finished` (`source=agent_sdk`) |
| `riskScoreTool` | `src/tools/tools.js` | Risk Scorer Agent (via agent SDK), fallback direct function | Risk scoring and priority | `{profiled}` | `{scored}` | `tool_call_started/finished` (`source=agent_sdk`) |
| `ui_event_stream` | `src/tools/tools.js` | `FraudPipeline.processBatch()` | Emit UI heartbeat event | `{event_type, payload}` | `{status, event}` | `tool_call_started`, `tool_call_finished`, `tool_executed` |
| `batchIntegrityAuditTool` | `src/tools/tools.js` | `FraudPipeline.processBatch()` | Verify ID lineage consistency | `{batch, candidates, profiled, scored, confirmed}` | `{audit}` | `tool_call_started`, `tool_call_finished`, `tool_executed` |
| `decisionExplainabilityTool` | `src/tools/tools.js` | `FraudPipeline.processBatch()` | Build compact explanations | `{confirmed, scored}` | `{explanations}` | `tool_call_started`, `tool_call_finished`, `tool_executed` |
| `suspiciousTransactions` | `src/tools/tools.js` | `FraudPipeline.processBatch()` | Persist suspicious rows to file | `{transactions, output_file}` | `{tool, written, total}` | `tool_call_started`, `tool_call_finished`, `tool_executed` |

## Telemetry Payloads (Pipeline-managed Tools)

### `tool_call_started`
- Common: `batch_id`, `tool`, `tool_label`, `activity`
- `suspiciousTransactions`: includes `record_count`

### `tool_call_finished`
- Common: `batch_id`, `tool`, `tool_label`, `activity`
- `ui_event_stream`: includes `status`
- `batchIntegrityAuditTool`: includes `chain_consistent`
- `decisionExplainabilityTool`: includes `explanation_count`
- `suspiciousTransactions`: includes `written`, `total`

### `tool_call_started` / `tool_call_finished` (Agent SDK emitted)
- Common: `timestamp`, `batch_id`, `source: "agent_sdk"`, `agent`, `tool`, `tool_label`, `call_id`, `activity`

## Call Graph

`FraudPipeline.run()`
-> `processBatch(batch)`
-> `Signal Miner Agent` -> `analyze_transaction_patterns`
-> `Pattern Profiler Agent` -> `geoVelocityCheckTool`
-> `Risk Scorer Agent` -> `riskScoreTool`
-> `Evidence Auditor Agent` -> `analyze_transaction_patterns`
-> `batchIntegrityAuditTool`
-> `decisionExplainabilityTool`
-> `suspiciousTransactions` (writes `data/suspiciousTransactions.json`)

## Change Log

| Date | Change |
| --- | --- |
| 2026-03-12 | Synced tool API shape (`parameters/execute`) and telemetry fields to runtime |
