from __future__ import annotations

import argparse
from pathlib import Path

from src.aggregation.suspicious_store import SuspiciousTransactionStore
from src.pipeline.events import EventStream
from src.pipeline.run_pipeline import FraudPipeline, PipelineConfig
from src.tools.suspicious_transactions_tool import SuspiciousTransactionsTool


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the FraudDetectionPS6 pipeline")
    parser.add_argument("--input", default="data/generatedTransactions.json", help="Input JSON file path")
    parser.add_argument("--output", default="data/suspiciousTransactions.json", help="Suspicious output JSON file path")
    parser.add_argument("--batch-size", type=int, default=20)
    parser.add_argument("--workers", type=int, default=5)
    parser.add_argument("--events", default="output/events.jsonl", help="Optional events output file")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    config = PipelineConfig(
        input_file=args.input,
        suspicious_file=args.output,
        batch_size=args.batch_size,
        max_workers=args.workers,
    )

    store = SuspiciousTransactionStore(config.suspicious_file)
    tool = SuspiciousTransactionsTool(store)
    events = EventStream(Path(args.events))

    pipeline = FraudPipeline(config=config, suspicious_tool=tool, events=events)
    result = pipeline.run()
    print(result)


if __name__ == "__main__":
    main()
