# FraudDetectionPS6 Execution Plan

## 0. Non-Negotiable Rule (Spec-First)
- `docs/spec/SPEC.md` is the single source of truth for this project.
- All implementation, planning, and testing decisions must be traced back to `docs/spec/SPEC.md`.
- Any behavior, feature, or assumption not explicitly supported by `docs/spec/SPEC.md` must be treated as out of scope.
- Do not add speculative requirements or inferred features beyond the spec.
- Hallucination is strictly unacceptable for this project.
- If ambiguity appears, stop and resolve it against `docs/spec/SPEC.md` before proceeding.
- If a requested change conflicts with `docs/spec/SPEC.md`, prioritize the spec and document the conflict explicitly.

## 1. Goal
Build a demo fraud-detection pipeline that processes 100 transactions in 5 parallel batches (20 each), accumulates suspicious results into a single state file, and shows near-real-time monitoring in UI.

## 1.1 Critical Product Priority (Monitoring First)
- Visual monitoring of `Agent` and `Tool` calls is a first-class requirement, not an optional dashboard feature.
- The UI must make it clear what is happening at each step of batch execution.
- Suspicious transactions must appear in the UI in near real time as they are confirmed.
- If monitoring visibility is incomplete, the implementation is not considered done.

## 1.2 Monitoring Quality Validator (Continuous Improvement Gate)
- Add a dedicated validator role that evaluates whether Agent/Tool-call monitoring is visually clear and operationally useful.
- This validator must run on every improvement cycle before a change is accepted.
- The validator outputs:
	- pass/fail decision for monitoring quality
	- concrete gaps found in current UI/telemetry
	- prioritized next improvement actions
- No monitoring-related change is considered complete without validator sign-off.

## 1.3 Strict Registry Management (Agents vs Tool Calls)
- Maintain `Agent` usage and `Tool call` usage in separate registry documents.
- Agent and tool records must never be mixed in a single table.
- Every new or changed workflow must update both registries when applicable.
- Registry updates are required in the same change set as implementation updates.
- If a runtime event is visible in UI but missing from registry, treat it as a validation failure.

## 2. Scope
- Input dataset generation and loading (100 demo transactions)
- Chunking logic (size = 20)
- Parallel fraud detection workers (5 concurrent batch jobs)
- Suspicious transaction accumulator (`data/suspiciousTransactions.json`)
- Monitoring UI for agent/tool calls and suspicious outputs (mandatory)
- Basic tests for core pipeline behavior

## 3. Deliverables
- `scripts/generate_transactions.py`: generate demo input data with a few suspicious transactions per batch
- `src/chunking/`: batch split utility
- `src/detection/`: fraud detection logic (rule-based baseline + LLM hook interface)
- `src/pipeline/`: parallel orchestration and event emission
- `src/aggregation/`: append/read suspicious state file
- `src/tools/`: suspiciousTransactions tool interface
- `src/ui/`: monitoring UI and live suspicious feed
- `src/ui/monitoring_validator.md`: validator checklist and scoring rubric for monitoring quality
- `docs/registry/AGENT_REGISTRY.md`: canonical list of active agents, roles, and states
- `docs/registry/TOOLCALL_REGISTRY.md`: canonical list of tool calls, purposes, and telemetry fields
- `tests/`: unit tests for chunking/aggregation, integration test for end-to-end flow
- `docs/PLAN.md`: this execution plan

## 4. Implementation Phases

### Phase 1: Foundation
- Define transaction schema from `data/sampleData.json`
- Implement data generator for 100 transactions
- Ensure suspicious seed cases exist in each batch

### Phase 2: Core Pipeline
- Implement chunking: list -> chunks of 20
- Implement detection worker API: `detect_suspicious(batch) -> suspicious_records`
- Add parallel runner to execute all 5 batches concurrently
- Emit processing events (`batch_started`, `batch_finished`, `suspicious_found`)

### Phase 3: Aggregation State
- Implement accumulator write/read layer for `data/suspiciousTransactions.json`
- Enforce atomic append/update behavior to avoid race conditions
- Add deduplication key strategy (ex: `transactionId`)

### Phase 4: UI & Observability
- Build lightweight UI page to show:
	- Active/finished batch status
	- Agent call timeline (start, in-progress, done, failed)
	- Tool call timeline (tool name, start/end time, outcome)
	- Suspicious transaction list in near real time
	- Per-batch counters: total processed, suspicious confirmed
- Connect pipeline events to UI stream (polling or websocket)
- Prioritize observability clarity over visual complexity.
- Define a stable event payload contract so UI and pipeline stay synchronized.
- Apply Monitoring Quality Validator review after each UI/telemetry change and feed findings into the next iteration.
- Build UI sections from registry sources:
	- Agent Panel must map to `docs/registry/AGENT_REGISTRY.md`
	- Tool Call Panel must map to `docs/registry/TOOLCALL_REGISTRY.md`

### Phase 5: Validation
- Unit tests:
	- chunk count and size correctness
	- suspicious accumulator merge/dedup correctness
- Integration test:
	- 100 inputs -> 5 parallel batches -> suspicious file populated
- Manual run checklist for UI near-real-time updates
- Monitoring verification checklist:
	- Every batch has visible lifecycle state in UI
	- Agent and tool calls are visible with timestamps and outcomes
	- New suspicious entries appear in UI shortly after confirmation
- Monitoring Quality Validator checklist (every iteration):
	- Can an operator identify current system state within a few seconds?
	- Are Agent/Tool call transitions visually distinguishable (start, success, failure)?
	- Are delays and failures visible without inspecting backend logs?
	- Is the next UI improvement direction explicitly documented?
- Registry integrity checklist:
	- Agent panel events have matching entries in `AGENT_REGISTRY.md`
	- Tool panel events have matching entries in `TOOLCALL_REGISTRY.md`
	- No mixed category entries (agent item in tool registry or inverse)

## 5. Milestones
- M1: Data generator + chunking complete
- M2: Parallel detection + event stream complete
- M3: Accumulator state reliability complete
- M4: UI monitoring complete
- M5: Tests + demo run complete

## 6. Acceptance Criteria
- Exactly 100 demo transactions are processed
- Transactions are split into 5 batches of 20
- Batch processing runs concurrently (not sequential only)
- Suspicious transactions are accumulated into one file: `data/suspiciousTransactions.json`
- UI shows processing progress and suspicious records with low delay
- UI clearly visualizes agent calls and tool calls during execution
- Operator can understand "what is happening now" from UI without reading backend logs
- Monitoring Quality Validator approves the monitoring UX for the current iteration
- Agent and tool call inventories are maintained as separate up-to-date registries
- Core unit/integration tests pass

## 7. Risks and Mitigations
- Race conditions when writing suspicious state file
	- Mitigation: use file lock or single-writer queue
- Unclear suspicious labeling quality
	- Mitigation: start with deterministic rules, then add LLM-based scoring
- UI lag under frequent updates
	- Mitigation: throttle UI updates (e.g., 200-500ms cadence)

## 8. Suggested Next Implementation Order
1. `scripts/generate_transactions.py`
2. `src/chunking/chunker.py`
3. `src/detection/detector.py`
4. `src/aggregation/suspicious_store.py`
5. `src/pipeline/run_pipeline.py`
6. `src/ui/` minimal monitoring page
7. `tests/` and end-to-end verification

## 9. Iterative Improvement Loop (Required)
1. Implement monitoring/UI improvement.
2. Run Monitoring Quality Validator review.
3. Record failures and prioritized improvements.
4. Apply top-priority fixes.
5. Re-run validator until pass.
