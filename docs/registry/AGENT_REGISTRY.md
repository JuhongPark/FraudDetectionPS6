# Agent Registry

Source of truth for all active agents used in this project.

## Rules
- Keep only agent entries in this file.
- Do not document tool calls here.
- Update this file whenever an agent is added, removed, or its role changes.

## Agent Inventory

| Agent Name | Role | Trigger Condition | Inputs | Outputs | UI Panel Field Mapping | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Signal Miner | Detect suspicious candidates from each batch | Batch received (size=20) | Batch transactions | Candidate suspicious records | `agent.name`, `agent.state`, `agent.startedAt`, `agent.endedAt` | Detection | planned |
| Evidence Auditor | Validate candidate records using transaction evidence | Candidate list available | Batch + candidate records | Confirmed suspicious records | `agent.name`, `agent.state`, `agent.resultSummary` | Detection | planned |
| Monitoring Quality Validator | Review visual clarity of monitoring UX on each iteration | UI/telemetry change merged | UI state + telemetry samples | Pass/fail + prioritized improvements | `agent.name`, `agent.state`, `agent.decision` | UI | planned |

## Change Log

| Date | Change | Updated By |
| --- | --- | --- |
| 2026-03-07 | Initial registry template created | Copilot |
