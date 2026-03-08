from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Dict, Iterable, List

SuspiciousRecord = Dict[str, str]


class SuspiciousTransactionStore:
    """Single-file suspicious transaction state manager with in-process locking."""

    def __init__(self, file_path: str | Path) -> None:
        self.file_path = Path(file_path)
        self._lock = threading.Lock()
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.file_path.exists() or self.file_path.read_text(encoding="utf-8").strip() == "":
            self.file_path.write_text("[]\n", encoding="utf-8")

    def read_all(self) -> List[SuspiciousRecord]:
        raw = self.file_path.read_text(encoding="utf-8").strip()
        if not raw:
            return []
        return json.loads(raw)

    def append_many(self, records: Iterable[SuspiciousRecord]) -> List[SuspiciousRecord]:
        with self._lock:
            current = self.read_all()
            by_id = {item["id"]: item for item in current}
            for record in records:
                by_id[record["id"]] = record

            merged = [by_id[key] for key in sorted(by_id.keys())]
            self.file_path.write_text(json.dumps(merged, indent=2) + "\n", encoding="utf-8")
            return merged
