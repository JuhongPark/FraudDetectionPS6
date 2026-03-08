const fs = require("fs");
const path = require("path");
const { EventEmitter } = require("events");
const { signalMinerAgent, evidenceAuditorAgent } = require("../agents/fraudDetectionAgents");
const { suspiciousTransactionsTool } = require("../tools/tools");

function chunkTransactions(transactions, batchSize = 20) {
  const batches = [];
  for (let i = 0; i < transactions.length; i += batchSize) {
    batches.push(transactions.slice(i, i + batchSize));
  }
  return batches;
}

class FraudPipeline {
  constructor(config) {
    this.config = config;
    this.eventEmitter = new EventEmitter();
    this.suspiciousTransactions = [];
  }

  on(event, listener) {
    this.eventEmitter.on(event, listener);
  }

  async run() {
    const startTime = Date.now();
    
    // Load transactions
    const transactions = JSON.parse(
      fs.readFileSync(this.config.inputFile, "utf-8")
    );
    
    // Clear suspicious accumulator
    fs.writeFileSync(this.config.suspiciousFile, JSON.stringify([]));
    
    const batches = chunkTransactions(transactions, this.config.batchSize);

    this.eventEmitter.emit("pipeline_started", {
      total_transactions: transactions.length,
      batch_count: batches.length,
      batch_size: this.config.batchSize,
    });

    const confirmedAll = [];

    // Process batches in parallel
    const promises = batches.map((batch, index) =>
      this.processBatch(batch, index + 1)
    );
    
    const results = await Promise.all(promises);
    results.forEach((batchResults) => {
      confirmedAll.push(...batchResults);
    });

    // Write suspicious transactions
    fs.writeFileSync(
      this.config.suspiciousFile,
      JSON.stringify(confirmedAll, null, 2)
    );

    this.eventEmitter.emit("pipeline_finished", {
      total_transactions: transactions.length,
      batch_count: batches.length,
      suspicious_count: confirmedAll.length,
    });

    const elapsed = Date.now() - startTime;
    console.log(
      `✓ Pipeline completed in ${(elapsed / 1000).toFixed(1)}s`
    );
    console.log(`  - Total: ${transactions.length} transactions`);
    console.log(`  - Batches: ${batches.length}`);
    console.log(`  - Suspicious: ${confirmedAll.length}`);

    return {
      total_transactions: transactions.length,
      batch_count: batches.length,
      suspicious_count: confirmedAll.length,
    };
  }

  async processBatch(batch, batchIndex) {
    const batchId = `batch-${batchIndex}`;

    this.eventEmitter.emit("batch_started", {
      batch_id: batchId,
      size: batch.length,
    });

    try {
      // Run Signal Miner
      const candidates = await signalMinerAgent(
        batch,
        batchId,
        this.eventEmitter
      );

      // Run Evidence Auditor
      const confirmed = await evidenceAuditorAgent(
        batch,
        candidates,
        batchId,
        this.eventEmitter
      );

      // Emit suspicious transactions via Tool
      if (confirmed.length > 0) {
        const toolResult = await suspiciousTransactionsTool.fn(
          { transactions: confirmed },
          this.eventEmitter
        );
        
        this.eventEmitter.emit("tool_executed", {
          batch_id: batchId,
          tool: "suspiciousTransactions",
          written: toolResult.written,
          total: toolResult.total
        });
      }

      // Also emit individual events for UI
      for (const item of confirmed) {
        this.eventEmitter.emit("suspicious_found", {
          batch_id: batchId,
          ...item,
        });
      }

      this.eventEmitter.emit("batch_finished", {
        batch_id: batchId,
        confirmed: confirmed.length,
      });

      return confirmed;
    } catch (error) {
      console.error(`Batch ${batchId} error:`, error);
      this.eventEmitter.emit("batch_failed", {
        batch_id: batchId,
        error: error.message,
      });
      return [];
    }
  }
}

module.exports = { FraudPipeline, chunkTransactions };
