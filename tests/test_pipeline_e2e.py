import json
import tempfile
import unittest
from pathlib import Path

from scripts.generate_transactions import generate_transactions
from src.aggregation.suspicious_store import SuspiciousTransactionStore
from src.pipeline.events import EventStream
from src.pipeline.run_pipeline import FraudPipeline, PipelineConfig
from src.tools.suspicious_transactions_tool import SuspiciousTransactionsTool


class PipelineE2ETests(unittest.TestCase):
    def test_pipeline_processes_100_transactions_in_5_batches(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            input_file = root / "generated.json"
            suspicious_file = root / "suspicious.json"
            events_file = root / "events.jsonl"

            input_file.write_text(json.dumps(generate_transactions()), encoding="utf-8")
            store = SuspiciousTransactionStore(suspicious_file)
            tool = SuspiciousTransactionsTool(store)
            events = EventStream(events_file)

            config = PipelineConfig(
                input_file=str(input_file),
                suspicious_file=str(suspicious_file),
                batch_size=20,
                max_workers=5,
            )

            result = FraudPipeline(config=config, suspicious_tool=tool, events=events).run()

            self.assertEqual(result["total_transactions"], 100)
            self.assertEqual(result["batch_count"], 5)
            self.assertGreater(result["suspicious_count"], 0)

            persisted = json.loads(suspicious_file.read_text(encoding="utf-8"))
            self.assertEqual(len(persisted), result["tool_result"]["total"])


if __name__ == "__main__":
    unittest.main()
