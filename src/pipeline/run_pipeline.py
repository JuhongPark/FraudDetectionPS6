from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List

from src.chunking.chunker import chunk_transactions
from src.detection.detector import DetectionContext, EvidenceAuditor, SignalMiner
from src.pipeline.events import EventStream
from src.tools.suspicious_transactions_tool import SuspiciousTransactionsTool
from src.tools.ui_event_stream_tool import UIEventStreamTool


@dataclass
class PipelineConfig:
    input_file: str = "data/generatedTransactions.json"
    suspicious_file: str = "data/suspiciousTransactions.json"
    batch_size: int = 20
    max_workers: int = 5


class FraudPipeline:
    def __init__(self, config: PipelineConfig, suspicious_tool: SuspiciousTransactionsTool, events: EventStream) -> None:
        self.config = config
        self.suspicious_tool = suspicious_tool
        self.events = events
        self.ui_tool = UIEventStreamTool(events)
        self.signal_miner = SignalMiner()
        self.evidence_auditor = EvidenceAuditor()

    def run(self) -> Dict[str, object]:
        txns = self._load_transactions(self.config.input_file)
        batches = chunk_transactions(txns, self.config.batch_size)

        self.events.emit("tool_call_started", {"tool": self.ui_tool.name, "purpose": "monitoring stream"})
        self.ui_tool.publish(
            "pipeline_started",
            {"total_transactions": len(txns), "batch_count": len(batches), "batch_size": self.config.batch_size},
        )

        confirmed_all: List[Dict[str, str]] = []
        with ThreadPoolExecutor(max_workers=self.config.max_workers) as executor:
            futures = [executor.submit(self._process_batch, idx, batch) for idx, batch in enumerate(batches, start=1)]
            for future in as_completed(futures):
                confirmed_all.extend(future.result())

        self.events.emit("tool_call_started", {"tool": self.suspicious_tool.name, "record_count": len(confirmed_all)})
        tool_result = self.suspicious_tool.execute(confirmed_all)
        self.events.emit("tool_call_finished", {"tool": self.suspicious_tool.name, **tool_result})

        self.ui_tool.publish(
            "pipeline_finished",
            {
                "total_transactions": len(txns),
                "batch_count": len(batches),
                "suspicious_count": len(confirmed_all),
            },
        )
        self.events.emit("tool_call_finished", {"tool": self.ui_tool.name, "status": "ok"})

        return {
            "total_transactions": len(txns),
            "batch_count": len(batches),
            "suspicious_count": len(confirmed_all),
            "tool_result": tool_result,
        }

    def _process_batch(self, index: int, batch: List[Dict[str, object]]) -> List[Dict[str, str]]:
        batch_id = f"batch-{index}"
        context = DetectionContext(batch_id=batch_id)

        self.ui_tool.publish("batch_started", {"batch_id": batch_id, "size": len(batch)})

        self.ui_tool.publish("agent_call_started", {"agent": "Signal Miner", "batch_id": batch_id})
        candidates = self.signal_miner.detect(batch, context)
        self.ui_tool.publish(
            "agent_call_finished",
            {"agent": "Signal Miner", "batch_id": batch_id, "candidates": len(candidates)},
        )

        self.ui_tool.publish("agent_call_started", {"agent": "Evidence Auditor", "batch_id": batch_id})
        confirmed = self.evidence_auditor.validate(batch, candidates, context)
        self.ui_tool.publish(
            "agent_call_finished",
            {"agent": "Evidence Auditor", "batch_id": batch_id, "confirmed": len(confirmed)},
        )

        for item in confirmed:
            self.ui_tool.publish("suspicious_found", {"batch_id": batch_id, **item})

        self.ui_tool.publish("batch_finished", {"batch_id": batch_id, "confirmed": len(confirmed)})
        return confirmed

    @staticmethod
    def _load_transactions(path: str | Path) -> List[Dict[str, object]]:
        content = Path(path).read_text(encoding="utf-8")
        data = json.loads(content)
        if not isinstance(data, list):
            raise ValueError("input dataset must be a JSON array")
        return data
