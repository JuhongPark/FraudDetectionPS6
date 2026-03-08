# Monitoring Quality Validator

This validator evaluates whether the monitoring experience is operationally useful.

## Decision
- `PASS`: monitoring visibility is clear and actionable.
- `FAIL`: operator cannot confidently understand current system state from UI.

## Scoring Rubric (0-2 each, max 10)
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

## Required Checks (Every Iteration)
- Agent panel shows call transitions with timestamps.
- Tool panel shows call transitions with outcomes.
- Suspicious transactions appear shortly after confirmation.
- Batch status is visible from start to completion.
- Improvement recommendation is documented after each review.

## Review Template
- Date:
- Reviewer:
- Result: PASS / FAIL
- Score (0-10):
- Gaps Found:
- Priority Improvements:
- Next Review Date:
