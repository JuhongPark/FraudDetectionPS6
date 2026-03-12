# Monitoring Quality Validator

This validator evaluates whether the monitoring experience is operationally useful and visually comprehensible.

## Decision
- `PASS`: monitoring visibility is clear and actionable.
- `FAIL`: operator cannot confidently understand current system state from UI, or the visual design prevents fast comprehension.

## Scoring Rubric (0-2 each, max 14)
1. Agent visibility
- 0: agent calls not visible
- 1: partially visible without useful context
- 2: clear start/finish and batch linkage

2. Tool visibility
- 0: tool calls not visible
- 1: visible but missing outcomes
- 2: clear start/finish and outcomes

3. Batch lifecycle clarity
- 0: no batch progress
- 1: partial progress
- 2: start/finish state for all batches

4. Suspicious feed latency
- 0: delayed/non-updating
- 1: updates but irregularly
- 2: near-real-time updates while run is active

5. Operator comprehension
- 0: requires backend logs for diagnosis
- 1: limited understanding from UI
- 2: can identify current state and failures from UI alone

6. Visual hierarchy and clarity
- 0: key signals are visually buried or ambiguous
- 1: partially clear but inconsistent emphasis
- 2: priority/status/timeline are immediately scannable

7. Design quality for operations
- 0: cluttered or noisy; hard to read quickly
- 1: acceptable but still cognitively heavy
- 2: clear, balanced, and aesthetically coherent for repeated use

## Required Checks (Every Iteration)
- Agent panel shows call transitions with timestamps.
- Tool panel shows call transitions with outcomes.
- Suspicious transactions appear shortly after confirmation.
- Batch status is visible from start to completion.
- Visual emphasis reflects operational priority (failures and active runs are prominent).
- Typography, spacing, and color usage support quick scanning.
- Improvement recommendation is documented after each review.

## Review Template
- Date:
- Reviewer:
- Result: PASS / FAIL
- Score (0-14):
- Gaps Found:
- Priority Improvements:
- Next Review Date:

## Latest Review
- Date: 2026-03-08
- Reviewer: Juhong Park
- Result: FAIL
- Score (0-14): 10/14
- Gaps Found:
  - Tool start/finish transitions were not both visible in the batch cards.
  - Timeline with timestamps and failure context was missing.
  - Failure states were not strongly visible without reading logs.
- Priority Improvements:
  - Add tool lifecycle states (pending/running/completed/failed) to batch cards.
  - Add execution timeline with timestamped agent/tool/batch events.
  - Surface failure count and per-batch error messages in UI.
  - Add Node test suite for chunking, tool dedup, and pipeline flow.
- Next Review Date: 2026-03-08 (after improvement patch)

## Post-Improvement Review
- Date: 2026-03-08
- Reviewer: Juhong Park
- Result: PASS
- Score (0-14): 13/14
- Gaps Found:
  - Timeline is event-driven and readable, but can still benefit from filtering controls (agent/tool/failure).
- Priority Improvements:
  - Add timeline filters and severity toggles.
  - Add per-batch elapsed time metrics for faster bottleneck detection.
- Next Review Date: 2026-03-09

## Post-Filter/Metrics Review
- Date: 2026-03-08
- Reviewer: Juhong Park
- Result: PASS
- Score (0-14): 14/14
- Gaps Found:
  - None. Timeline filters (All/Agents/Tools/Failures) resolve the previous gap.
  - Per-batch elapsed time and processed count now visible in batch cards.
- Priority Improvements:
  - Consider compact mode for batch cards when scaling beyond 5 batches.
- Next Review Date: 2026-03-10

## Compact Mode Review
- Date: 2026-03-10
- Reviewer: Juhong Park
- Result: PASS
- Score (0-14): 14/14
- Gaps Found:
  - None in current 5-batch target scope.
- Priority Improvements:
  - Keep compact-mode default configurable if future datasets exceed current dashboard density.
- Next Review Date: 2026-03-11

## UI Visualization Review
- Date: 2026-03-11
- Reviewer: Juhong Park
- Result: PASS
- Score (0-14): 14/14
- Gaps Found:
  - None blocking operator comprehension in current 5-batch target scope.
- Priority Improvements:
  - Add optional websocket/SSE transport to reduce polling delay under higher event volume.
  - Add a small browser-level smoke test for timeline and risk-map rendering to prevent UI regressions.
- Next Review Date: 2026-03-12
