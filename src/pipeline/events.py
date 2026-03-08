from __future__ import annotations

import json
import threading
import time
from collections import deque
from pathlib import Path
from typing import Deque, Dict, List


class EventStream:
    """Thread-safe event buffer used by API/UI polling."""

    def __init__(self, output_file: str | Path | None = None, max_events: int = 1000) -> None:
        self._events: Deque[Dict[str, object]] = deque(maxlen=max_events)
        self._lock = threading.Lock()
        self._seq = 0
        self.output_file = Path(output_file) if output_file else None
        if self.output_file:
            self.output_file.parent.mkdir(parents=True, exist_ok=True)
            self.output_file.write_text("", encoding="utf-8")

    def emit(self, event_type: str, payload: Dict[str, object]) -> Dict[str, object]:
        with self._lock:
            self._seq += 1
            event = {
                "id": self._seq,
                "ts": time.time(),
                "type": event_type,
                "payload": payload,
            }
            self._events.append(event)
            if self.output_file:
                with self.output_file.open("a", encoding="utf-8") as fh:
                    fh.write(json.dumps(event) + "\n")
            return event

    def snapshot(self) -> List[Dict[str, object]]:
        with self._lock:
            return list(self._events)
