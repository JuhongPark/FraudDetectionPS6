from __future__ import annotations

from typing import Iterable, List, Sequence, TypeVar

T = TypeVar("T")


def chunk_transactions(transactions: Sequence[T] | Iterable[T], batch_size: int = 20) -> List[List[T]]:
    """Split transactions into fixed-size chunks.

    Returns a list of batches to simplify parallel fan-out orchestration.
    """
    if batch_size <= 0:
        raise ValueError("batch_size must be greater than 0")

    items = list(transactions)
    return [items[i : i + batch_size] for i in range(0, len(items), batch_size)]
