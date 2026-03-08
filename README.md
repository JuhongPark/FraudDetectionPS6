# FraudDetection PS-6

Node.js fraud-detection demo using `@openai/agents`.

## What It Does
- Generates 100 demo transactions
- Splits into 5 batches of 20
- Runs four agents per batch (`Signal Miner` -> `Pattern Profiler` -> `Risk Scorer` -> `Evidence Auditor`)
- Executes all registered batch-check tools every batch (even when no suspicious records are found)
- Persists suspicious results to `data/suspiciousTransactions.json`
- Shows batch/agent/tool activity in a monitoring UI

## Agent/Tool Flow
- Agents:
  - `Signal Miner Agent`
  - `Pattern Profiler Agent`
  - `Risk Scorer Agent`
  - `Evidence Auditor Agent`
- Tools:
  - `analyze_transaction_patterns`
  - `geoVelocityCheckTool`
  - `riskScoreTool`
  - `batchIntegrityAuditTool`
  - `decisionExplainabilityTool`
  - `ui_event_stream`
  - `suspiciousTransactions`

## Requirements
- Node.js 22+
- OpenAI API key

## Setup
1. Install dependencies:
```bash
npm install
```

2. Create env file:
```bash
cp .env.example .env
```

3. Set values in `.env`:
```bash
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-5.4
# Optional
HOST=127.0.0.1
PORT=8000
```
4. **Note**: `.env` is excluded from version control (see `.gitignore`) for security, so API secrets are not committed. Only `.env.example` is committed.

## Run
1. Start server:
```bash
npm start
```
2. Open `http://127.0.0.1:8000`
3. Click `Run Pipeline`

If `8000` is already in use:
- set `PORT` in `.env`, or
- run `PORT=8001 npm start`

## Test
```bash
npm test
```

## Key Paths
- Spec: `docs/spec/SPEC.md`
- UI server: `src/ui/server.js`
- Pipeline: `src/pipeline/fraudPipeline.js`
- Agents: `src/agents/fraudDetectionAgents.js`
- Tools: `src/tools/tools.js`
