# Tool Call Registry

Source of truth for all tool calls used in this project.

## Rules
- Keep only tool call entries in this file.
- Do not document agents here.
- Update this file whenever a tool call is added, removed, renamed, or payload changes.

## Tool Call Inventory

| Tool Name | Purpose | Called By | Input Schema (Summary) | Output Schema (Summary) | Telemetry Fields | Failure Handling | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| suspiciousTransactions | Append/read suspicious transaction state | Case Consolidator | transaction list with `{id, reason}` | updated state summary | `tool.name`, `tool.state`, `tool.startedAt`, `tool.endedAt`, `tool.error` | retry once, then warning | planned |
| uiEventStream | Push monitoring events to UI | Pipeline / UI bridge | event payload with batch/agent/tool status | delivery ack | `tool.name`, `tool.state`, `tool.eventType`, `tool.latencyMs` | retry once, then warning | planned |

## Change Log

| Date | Change | Updated By |
| --- | --- | --- |
| 2026-03-07 | Initial registry template created | Copilot |
