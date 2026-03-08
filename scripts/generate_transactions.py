from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path


def generate_transactions(total: int = 100) -> list[dict[str, object]]:
    merchants = [
        "Local Grocery",
        "Coffee Hub",
        "City Electronics",
        "Metro Transit",
        "Book Nook",
        "Lunch Box",
        "Home Supply",
        "Pharma Plus",
    ]
    locations = ["Boston, MA", "Cambridge, MA", "Providence, RI", "Hartford, CT"]
    channels = ["debit_card", "mobile_wallet", "chip_card", "tap_to_pay"]

    start = datetime(2026, 3, 1, 8, 0, 0, tzinfo=timezone.utc)
    records: list[dict[str, object]] = []

    for i in range(total):
        batch_idx = i // 20
        txn = {
            "id": f"txn_{2000 + i}",
            "accountId": f"acc_{(i % 12) + 1:03d}",
            "timestamp": (start + timedelta(minutes=8 * i)).isoformat().replace("+00:00", "Z"),
            "amount": round(15 + (i % 10) * 11.25, 2),
            "currency": "USD",
            "merchant": merchants[i % len(merchants)],
            "category": "general",
            "channel": channels[i % len(channels)],
            "location": locations[i % len(locations)],
            "deviceId": f"dev_{1000 + i % 30}",
        }

        # Seed a few obvious suspicious transactions in every batch of 20.
        if i % 20 in {4, 11, 17}:
            txn["amount"] = 4200 + (batch_idx * 900) + (i % 3) * 250
            txn["merchant"] = "CryptoFast Exchange" if i % 20 != 17 else "Luxury Timepieces Intl"
            txn["channel"] = "online_transfer" if i % 2 == 0 else "card_not_present"
            txn["location"] = "Unknown VPN" if i % 20 != 17 else "Lagos, NG"
            txn["category"] = "financial_services"

        records.append(txn)

    return records


def main() -> None:
    output_file = Path("data/generatedTransactions.json")
    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_file.write_text(json.dumps(generate_transactions(), indent=2) + "\n", encoding="utf-8")
    print(f"Wrote 100 transactions to {output_file}")


if __name__ == "__main__":
    main()
