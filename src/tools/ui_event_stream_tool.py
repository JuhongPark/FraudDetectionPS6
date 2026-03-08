from __future__ import annotations

from typing import Dict

from src.pipeline.events import EventStream


class UIEventStreamTool:
    """Tool wrapper for publishing monitoring events to the UI stream."""

    name = "uiEventStream"

    def __init__(self, stream: EventStream) -> None:
        self.stream = stream

    def publish(self, event_type: str, payload: Dict[str, object]) -> None:
        self.stream.emit(event_type, payload)
