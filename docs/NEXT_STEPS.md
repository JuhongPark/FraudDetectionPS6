# Next Steps (Reference)

This file is a working reference for follow-up improvements.
It is intentionally separate from `README.md`.

## Completed (moved to commit history)
- ~~Spec-lineage polish: route through `suspiciousTransactions` Tool~~ (661ccf4)
- ~~Server E2E integration test~~ (b3a752d)
- ~~Bounded event retention policy~~ (b3a752d)
- ~~API retry policy for transient failures~~ (b3a752d)
- ~~Agent Registry: PatternProfiler/RiskScorer details~~ (b3a752d)
- ~~Timeline filters (agent/tool/failure)~~ (current)
- ~~Per-batch counters and elapsed time~~ (current)
- ~~call_id pairing regression test~~ (current)
- ~~Single-writer queue for file writes~~ (current)
- ~~Compact mode for batch cards to improve scan speed~~ (current)
- ~~Validation report and registry docs synced to runtime payloads~~ (current)

## Remaining Priority
1. Documentation sync (continuous)
- Keep `docs/registry/AGENT_REGISTRY.md` and `docs/registry/TOOLCALL_REGISTRY.md` updated whenever runtime behavior changes.
- Keep `docs/reports/VALIDATION_REPORT_UPDATED.md` aligned with current code (tool API shape, active agents, telemetry fields).

2. Scale-readiness
- If batch count increases beyond current demo scope, consider moving from polling to SSE/WebSocket for lower UI latency under high event volume.
