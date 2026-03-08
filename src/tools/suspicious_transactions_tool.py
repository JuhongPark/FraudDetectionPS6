from __future__ import annotations

from typing import Dict, List

from src.aggregation.suspicious_store import SuspiciousTransactionStore

SuspiciousRecord = Dict[str, str]


class SuspiciousTransactionsTool:
    """Tool wrapper used by the pipeline to persist suspicious records."""

    name = "suspiciousTransactions"

    def __init__(self, store: SuspiciousTransactionStore) -> None:
        self.store = store

    def execute(self, records: List[SuspiciousRecord]) -> Dict[str, object]:
        merged = self.store.append_many(records)
        return {
            "written": len(records),
            "total": len(merged),
        }
