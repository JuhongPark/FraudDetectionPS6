# Source Modules

- `chunking/`: split incoming transactions into fixed-size batches
- `detection/`: evaluate suspicious patterns and model decisions
- `pipeline/`: dispatch batches in parallel and coordinate completion
- `aggregation/`: maintain suspicious transaction accumulator state
- `tools/`: exposed tool interfaces used by agents
- `ui/`: monitoring and live suspicious transaction display
