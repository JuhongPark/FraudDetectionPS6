# Agent Registry

Source of truth for all active agents used in this project.

## Technology Stack
- Runtime: Node.js (CommonJS)
- Framework: `@openai/agents@0.5.4`
- Agent runner: `run(agent, prompt)` from `@openai/agents`
- Default model: `gpt-5.4` (`OPENAI_MODEL` override supported)

## Rules
- Keep only agent entries in this file.
- Do not document tool-only implementation details here.
- Update this file whenever an agent is added, removed, renamed, or event payload changes.

## Agent Inventory

| Runtime Label (`payload.agent`) | Constructor Name | Location | Role | Trigger | Inputs | Outputs | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Signal Miner Agent | `SignalMinerAgent` | `src/agents/fraudDetectionAgents.js` | Broad candidate detection | `processBatch()` start | Batch transactions | `{id, reason}[]` candidates | active |
| Pattern Profiler Agent | `PatternProfilerAgent` | `src/agents/fraudDetectionAgents.js` | Candidate enrichment (geo/channel signals) | Signal Miner result | Batch + candidates | Profiled candidate rows | active |
| Risk Scorer Agent | `RiskScorerAgent` | `src/agents/fraudDetectionAgents.js` | Risk score and priority assignment | Pattern Profiler result | Profiled rows | Scored rows (`risk_score`, `priority`) | active |
| Evidence Auditor Agent | `EvidenceAuditorAgent` | `src/agents/fraudDetectionAgents.js` | Precision confirmation | Risk Scorer result | Batch + scored rows | `{id, reason}[]` confirmed | active |

## Event Payloads (Current Runtime)

### `agent_call_started`
- Common fields: `timestamp`, `agent`, `batch_id`, `activity`
- Agent-specific fields:
  - Signal Miner Agent: `batch_size`
  - Pattern Profiler Agent: `candidates_to_profile`
  - Risk Scorer Agent: `records_to_score`
  - Evidence Auditor Agent: `candidates_to_verify`

### `agent_call_finished`
- Common fields: `timestamp` (success path), `agent`, `batch_id`
- Success fields:
  - Signal Miner Agent: `candidates`, `result`, `activity`
  - Pattern Profiler Agent: `profiled`, `activity`
  - Risk Scorer Agent: `scored`, `activity`
  - Evidence Auditor Agent: `confirmed`, `result`, `activity`
- Error fields (fallback path): `error`, `using_fallback: true`

## Change Log

| Date | Change |
| --- | --- |
| 2026-03-12 | Synced registry names and payload fields to runtime implementation |
