# Next Steps (Reference)

This file is a working reference for follow-up improvements.
It is intentionally separate from `README.md`.

## Priority
1. Spec-lineage polish
- Optionally route UI update signaling through `suspiciousTransactions` tool path directly so wording matches spec literally.

2. Monitoring UX refinements
- Add per-tool filters in timeline (`agent_sdk`, `pipeline tool`, failures only).
- Add compact mode for batch cards to improve scan speed when many batches exist.

3. Validation depth
- Add an integration test that boots server, runs `/api/run`, and verifies all expected agent/tool events appear in `/api/status`.
- Add a regression test for `agent_sdk` tool-call start/finish pairing by `call_id`.

4. Operational robustness
- Add bounded event retention policy (currently slice-based only at response time).
- Add simple retry policy for transient OpenAI API failures with capped attempts.

5. Documentation sync
- Keep `docs/registry/AGENT_REGISTRY.md` and `docs/registry/TOOLCALL_REGISTRY.md` updated whenever runtime behavior changes.
- Keep this file trimmed; move completed items to changelog/commit history.
