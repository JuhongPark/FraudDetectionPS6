function generateTransactions(total = 100) {
  const merchants = [
    "Local Grocery",
    "Coffee Hub",
    "City Electronics",
    "Metro Transit",
    "Book Nook",
    "Lunch Box",
    "Home Supply",
    "Pharma Plus",
  ];
  const locations = ["Boston, MA", "Cambridge, MA", "Providence, RI", "Hartford, CT"];
  const channels = ["debit_card", "mobile_wallet", "chip_card", "tap_to_pay"];

  const start = new Date("2026-03-01T08:00:00Z");
  const records = [];

  for (let i = 0; i < total; i++) {
    const batchIdx = Math.floor(i / 20);
    const txnTime = new Date(start.getTime() + i * 8 * 60 * 1000);
    
    let txn = {
      id: `txn_${2000 + i}`,
      accountId: `acc_${String((i % 12) + 1).padStart(3, '0')}`,
      timestamp: txnTime.toISOString().replace('Z', 'Z'),
      amount: +(15 + (i % 10) * 11.25).toFixed(2),
      currency: "USD",
      merchant: merchants[i % merchants.length],
      category: "general",
      channel: channels[i % channels.length],
      location: locations[i % locations.length],
      deviceId: `dev_${1000 + (i % 30)}`,
    };

    // Seed suspicious transactions in every batch
    if ((i % 20) === 4 || (i % 20) === 11 || (i % 20) === 17) {
      txn.amount = 4200 + (batchIdx * 900) + ((i % 3) * 250);
      txn.merchant = (i % 20) !== 17 ? "CryptoFast Exchange" : "Luxury Timepieces Intl";
      txn.channel = (i % 2) === 0 ? "online_transfer" : "card_not_present";
      txn.location = (i % 20) !== 17 ? "Unknown VPN" : "Lagos, NG";
      txn.category = "financial_services";
    }

    records.push(txn);
  }

  return records;
}

module.exports = { generateTransactions };
