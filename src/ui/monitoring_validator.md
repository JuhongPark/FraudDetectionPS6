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
