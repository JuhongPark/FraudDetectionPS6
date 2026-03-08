from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List

Transaction = Dict[str, object]
SuspiciousRecord = Dict[str, str]


@dataclass
class DetectionContext:
    batch_id: str


class SignalMiner:
    """Find broad suspicious candidates (recall-oriented)."""

    HIGH_RISK_MERCHANT_KEYWORDS = (
        "crypto",
        "luxury",
        "exchange",
        "gift",
    )

    HIGH_RISK_LOCATION_KEYWORDS = (
        "unknown",
        "vpn",
        "lagos",
        "offshore",
    )

    def detect(self, batch: List[Transaction], context: DetectionContext) -> List[SuspiciousRecord]:
        candidates: List[SuspiciousRecord] = []
        for txn in batch:
            reasons = self._candidate_reasons(txn)
            if reasons:
                candidates.append(
                    {
                        "id": str(txn["id"]),
                        "reason": "; ".join(reasons),
                    }
                )
        return candidates

    def _candidate_reasons(self, txn: Transaction) -> List[str]:
        reasons: List[str] = []
        amount = float(txn.get("amount", 0.0))
        merchant = str(txn.get("merchant", "")).lower()
        location = str(txn.get("location", "")).lower()
        channel = str(txn.get("channel", "")).lower()

        if amount >= 3000:
            reasons.append(f"high amount ({amount:.2f})")

        if any(keyword in merchant for keyword in self.HIGH_RISK_MERCHANT_KEYWORDS):
            reasons.append(f"high-risk merchant ({txn.get('merchant', '')})")

        if any(keyword in location for keyword in self.HIGH_RISK_LOCATION_KEYWORDS):
            reasons.append(f"risky location ({txn.get('location', '')})")

        if channel in {"card_not_present", "online_transfer"} and amount >= 1200:
            reasons.append(f"high-risk channel ({channel}) with elevated amount")

        return reasons


class EvidenceAuditor:
    """Validate candidates against concrete transaction evidence (precision-oriented)."""

    def validate(self, batch: List[Transaction], candidates: List[SuspiciousRecord], context: DetectionContext) -> List[SuspiciousRecord]:
        index = {str(txn["id"]): txn for txn in batch}
        confirmed: List[SuspiciousRecord] = []

        for candidate in candidates:
            txn_id = candidate["id"]
            txn = index.get(txn_id)
            if not txn:
                continue

            reason = self._confirm_reason(txn)
            if reason:
                confirmed.append({"id": txn_id, "reason": reason})

        return confirmed

    def _confirm_reason(self, txn: Transaction) -> str | None:
        amount = float(txn.get("amount", 0.0))
        merchant = str(txn.get("merchant", "")).lower()
        location = str(txn.get("location", "")).lower()
        channel = str(txn.get("channel", "")).lower()

        if amount >= 7000:
            return f"confirmed: very high amount ({amount:.2f})"

        if "crypto" in merchant and amount >= 2000:
            return f"confirmed: crypto merchant + high amount ({amount:.2f})"

        if "luxury" in merchant and ("lagos" in location or "unknown" in location):
            return "confirmed: luxury + unusual location"

        if channel in {"card_not_present", "online_transfer"} and amount >= 3500:
            return "confirmed: high-risk channel with large amount"

        return None
