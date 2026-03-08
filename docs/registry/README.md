# Registry Index

This folder enforces separated inventory management for monitoring.

## Files
- `AGENT_REGISTRY.md`: canonical list of agents and their roles.
- `TOOLCALL_REGISTRY.md`: canonical list of tool calls and their telemetry contract.

## Policy
- Never mix agent rows and tool call rows in the same registry.
- UI Agent panel must trace to `AGENT_REGISTRY.md`.
- UI Tool panel must trace to `TOOLCALL_REGISTRY.md`.
- Registry updates are mandatory when implementation changes behavior.
