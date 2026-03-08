from __future__ import annotations

import json
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Dict, List

from src.aggregation.suspicious_store import SuspiciousTransactionStore
from src.pipeline.events import EventStream
from src.pipeline.run_pipeline import FraudPipeline, PipelineConfig
from src.tools.suspicious_transactions_tool import SuspiciousTransactionsTool

ROOT = Path(__file__).resolve().parents[2]
INDEX_FILE = ROOT / "src" / "ui" / "index.html"


class AppState:
    def __init__(self) -> None:
        self.config = PipelineConfig(
            input_file=str(ROOT / "data" / "generatedTransactions.json"),
            suspicious_file=str(ROOT / "data" / "suspiciousTransactions.json"),
            batch_size=20,
            max_workers=5,
        )
        self.store = SuspiciousTransactionStore(self.config.suspicious_file)
        self.events = EventStream(ROOT / "output" / "events.jsonl")
        self.tool = SuspiciousTransactionsTool(self.store)
        self.pipeline = FraudPipeline(self.config, self.tool, self.events)
        self._run_lock = threading.Lock()
        self._running = False
        self._last_result: Dict[str, object] = {}

    def status(self) -> Dict[str, object]:
        events = self.events.snapshot()
        return {
            "running": self._running,
            "summary": self._build_summary(events),
            "agent_events": [e for e in events if e["type"].startswith("agent_call_")],
            "tool_events": [e for e in events if e["type"].startswith("tool_call_")],
            "batch_events": [e for e in events if e["type"].startswith("batch_")],
            "suspicious": self.store.read_all(),
            "last_result": self._last_result,
        }

    def trigger_run(self) -> bool:
        with self._run_lock:
            if self._running:
                return False
            self._running = True
            thread = threading.Thread(target=self._run_pipeline, daemon=True)
            thread.start()
            return True

    def _run_pipeline(self) -> None:
        try:
            self._last_result = self.pipeline.run()
        finally:
            self._running = False

    @staticmethod
    def _build_summary(events: List[Dict[str, object]]) -> Dict[str, int]:
        started = 0
        finished = 0
        suspicious = 0
        for event in events:
            if event["type"] == "batch_started":
                started += 1
            elif event["type"] == "batch_finished":
                finished += 1
            elif event["type"] == "suspicious_found":
                suspicious += 1
        return {
            "batch_started": started,
            "batch_finished": finished,
            "suspicious_found": suspicious,
        }


APP_STATE = AppState()


class MonitoringHandler(BaseHTTPRequestHandler):
    def _json(self, payload: Dict[str, object], status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/":
            body = INDEX_FILE.read_bytes()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if self.path == "/api/status":
            self._json(APP_STATE.status())
            return

        self._json({"error": "not found"}, HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:  # noqa: N802
        if self.path == "/api/run":
            started = APP_STATE.trigger_run()
            if started:
                self._json({"started": True}, HTTPStatus.ACCEPTED)
            else:
                self._json({"started": False, "reason": "pipeline already running"}, HTTPStatus.CONFLICT)
            return

        self._json({"error": "not found"}, HTTPStatus.NOT_FOUND)


def run_server(host: str = "127.0.0.1", port: int = 8000) -> None:
    server = ThreadingHTTPServer((host, port), MonitoringHandler)
    print(f"Monitoring UI: http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run_server()
