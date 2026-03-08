# Tool Call Registry

Source of truth for all tool calls used in this project.

## Rules
- Keep only tool call entries in this file.
- Do not document agents here.
- Update this file whenever a tool call is added, removed, renamed, or payload changes.

## Tool Call Inventory

| Tool Name | Purpose | Called By | Input Schema (Summary) | Output Schema (Summary) | Telemetry Fields | Failure Handling | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| suspiciousTransactions | Append/read suspicious transaction state | Case Consolidator | transaction list with `{id, reason}` | updated state summary | `tool`, `record_count`, `written`, `total` | retry once, then warning | active |
| uiEventStream | Push monitoring events to UI | Pipeline / UI bridge | event payload with batch/agent/tool status | event appended to stream | `tool`, `purpose`, `status` | retry once, then warning | active |

## Change Log

| Date | Change | Updated By |
| --- | --- | --- |
| 2026-03-07 | Initial registry template created | Copilot |
| 2026-03-07 | Updated statuses and telemetry mapping to implemented flow | Copilot |
