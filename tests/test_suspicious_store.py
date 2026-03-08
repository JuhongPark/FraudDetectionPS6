import json
import tempfile
import unittest
from pathlib import Path

from src.aggregation.suspicious_store import SuspiciousTransactionStore


class SuspiciousStoreTests(unittest.TestCase):
    def test_append_many_deduplicates_by_id(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            file_path = Path(temp_dir) / "suspicious.json"
            store = SuspiciousTransactionStore(file_path)

            store.append_many([{"id": "a", "reason": "first"}, {"id": "b", "reason": "second"}])
            merged = store.append_many([{"id": "a", "reason": "updated"}])

            self.assertEqual(len(merged), 2)
            self.assertEqual({item["id"] for item in merged}, {"a", "b"})
            payload = json.loads(file_path.read_text(encoding="utf-8"))
            self.assertEqual(payload[0]["reason"], "updated")


if __name__ == "__main__":
    unittest.main()
