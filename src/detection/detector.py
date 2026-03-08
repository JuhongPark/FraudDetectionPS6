from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Dict, List

import dotenv
from openai import OpenAI

# Load environment variables from .env
dotenv.load_dotenv()

Transaction = Dict[str, object]
SuspiciousRecord = Dict[str, str]


@dataclass
class DetectionContext:
    batch_id: str


def _get_openai_client() -> OpenAI:
    """Initialize OpenAI client from environment variables."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not found in environment. Set it in .env or as an environment variable.")
    return OpenAI(api_key=api_key)


def _get_model() -> str:
    """Get OpenAI model name from environment, with sensible default."""
    return os.getenv("OPENAI_MODEL", "gpt-5.3")


class SignalMiner:
    """Find broad suspicious candidates using OpenAI (recall-oriented)."""

    def __init__(self) -> None:
        self.client = _get_openai_client()

    def detect(self, batch: List[Transaction], context: DetectionContext) -> List[SuspiciousRecord]:
        """Send batch to OpenAI for broad suspicious candidate detection."""
        if not batch:
            return []

        txn_summaries = self._summarize_transactions(batch)
        prompt = f"""Analyze these {len(batch)} transactions for potential fraud indicators. 
Be BROAD in identifying candidates - we want high recall. Return JSON with suspicious transaction IDs and reasons.

Transactions:
{txn_summaries}

Return ONLY valid JSON (no markdown, no extra text):
{{
  "candidates": [
    {{"id": "txn_2000", "reason": "reason 1"}},
    {{"id": "txn_2001", "reason": "reason 2"}}
  ]
}}"""

        try:
            response = self.client.chat.completions.create(
                model=_get_model(),
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
            )
            content = response.choices[0].message.content
            # Extract JSON from response
            result = json.loads(content)
            return result.get("candidates", [])
        except json.JSONDecodeError:
            # Fallback to rule-based if JSON parsing fails
            return self._fallback_detect(batch)
        except Exception as e:
            print(f"Warning: OpenAI API error in SignalMiner: {e}")
            return self._fallback_detect(batch)

    def _summarize_transactions(self, batch: List[Transaction]) -> str:
        """Create a compact summary of transactions."""
        lines = []
        for txn in batch:
            line = (
                f"ID:{txn.get('id')} | Amount:{txn.get('amount')} | "
                f"Merchant:{txn.get('merchant')} | Location:{txn.get('location')} | "
                f"Channel:{txn.get('channel')}"
            )
            lines.append(line)
        return "\n".join(lines)

    def _fallback_detect(self, batch: List[Transaction]) -> List[SuspiciousRecord]:
        """Fallback rule-based detection if OpenAI fails."""
        candidates: List[SuspiciousRecord] = []
        for txn in batch:
            reasons = self._candidate_reasons(txn)
            if reasons:
                candidates.append({"id": str(txn["id"]), "reason": "; ".join(reasons)})
        return candidates

    def _candidate_reasons(self, txn: Transaction) -> List[str]:
        """Rule-based candidate detection."""
        reasons: List[str] = []
        amount = float(txn.get("amount", 0.0))
        merchant = str(txn.get("merchant", "")).lower()
        location = str(txn.get("location", "")).lower()
        channel = str(txn.get("channel", "")).lower()

        if amount >= 3000:
            reasons.append(f"high amount ({amount:.2f})")

        for keyword in ("crypto", "luxury", "exchange", "gift"):
            if keyword in merchant:
                reasons.append(f"high-risk merchant ({txn.get('merchant', '')})")
                break

        for keyword in ("unknown", "vpn", "lagos", "offshore"):
            if keyword in location:
                reasons.append(f"risky location ({txn.get('location', '')})")
                break

        if channel in {"card_not_present", "online_transfer"} and amount >= 1200:
            reasons.append(f"high-risk channel ({channel}) with elevated amount")

        return reasons


class EvidenceAuditor:
    """Validate candidates using OpenAI (precision-oriented)."""

    def __init__(self) -> None:
        self.client = _get_openai_client()

    def validate(self, batch: List[Transaction], candidates: List[SuspiciousRecord], context: DetectionContext) -> List[SuspiciousRecord]:
        """Use OpenAI to validate candidate transactions."""
        if not candidates:
            return []

        index = {str(txn["id"]): txn for txn in batch}
        candidate_txns = [index[c["id"]] for c in candidates if c["id"] in index]

        if not candidate_txns:
            return []

        txn_summaries = self._summarize_transactions(candidate_txns)
        prompt = f"""Validate these {len(candidate_txns)} suspected fraudulent transactions. 
Be STRICT - only confirm ones with strong fraud signals. Return JSON with confirmed IDs and concrete reasons.

Suspected Transactions:
{txn_summaries}

Return ONLY valid JSON (no markdown, no extra text):
{{
  "confirmed": [
    {{"id": "txn_2004", "reason": "confirmed: high amount + crypto merchant"}},
    {{"id": "txn_2011", "reason": "confirmed: card not present + unusual location"}}
  ]
}}"""

        try:
            response = self.client.chat.completions.create(
                model=_get_model(),
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
            )
            content = response.choices[0].message.content
            result = json.loads(content)
            return result.get("confirmed", [])
        except json.JSONDecodeError:
            # Fallback to rule-based if JSON parsing fails
            return self._fallback_validate(index, candidates)
        except Exception as e:
            print(f"Warning: OpenAI API error in EvidenceAuditor: {e}")
            return self._fallback_validate(index, candidates)

    def _summarize_transactions(self, batch: List[Transaction]) -> str:
        """Create a compact summary of transactions."""
        lines = []
        for txn in batch:
            line = (
                f"ID:{txn.get('id')} | Amount:{txn.get('amount')} | "
                f"Merchant:{txn.get('merchant')} | Location:{txn.get('location')} | "
                f"Channel:{txn.get('channel')}"
            )
            lines.append(line)
        return "\n".join(lines)

    def _fallback_validate(self, index: Dict[str, Transaction], candidates: List[SuspiciousRecord]) -> List[SuspiciousRecord]:
        """Fallback rule-based validation if OpenAI fails."""
        confirmed: List[SuspiciousRecord] = []
        for candidate in candidates:
            txn = index.get(candidate["id"])
            if txn:
                reason = self._confirm_reason(txn)
                if reason:
                    confirmed.append({"id": candidate["id"], "reason": reason})
        return confirmed

    def _confirm_reason(self, txn: Transaction) -> str | None:
        """Rule-based validation."""
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
