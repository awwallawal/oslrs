/**
 * Worker registration and lifecycle management
 *
 * Import this module to start all BullMQ workers.
 */

import { importWorker } from './import.worker.js';
import { emailWorker, closeEmailWorker } from './email.worker.js';
import { webhookIngestionWorker } from './webhook-ingestion.worker.js';
import { fraudDetectionWorker } from './fraud-detection.worker.js';
import { productivitySnapshotWorker } from './productivity-snapshot.worker.js';
import { scheduleNightlySnapshot } from '../queues/productivity-snapshot.queue.js';
import pino from 'pino';

const logger = pino({ name: 'workers' });

// Re-export workers for direct access
export { importWorker } from './import.worker.js';
export { emailWorker, closeEmailWorker } from './email.worker.js';
export { webhookIngestionWorker } from './webhook-ingestion.worker.js';
export { fraudDetectionWorker } from './fraud-detection.worker.js';
export { productivitySnapshotWorker } from './productivity-snapshot.worker.js';

/**
 * Initialize all workers
 * Workers are auto-started when imported (via new Worker() at module load)
 * This function logs their status and ensures they're running.
 */
export async function initializeWorkers(): Promise<void> {
  // Workers are already created when imported above
  // Just log that they're ready
  logger.info({
    event: 'workers.initialized',
    workers: ['import', 'email', 'webhook-ingestion', 'fraud-detection', 'productivity-snapshot'],
    importWorkerRunning: importWorker.isRunning(),
    emailWorkerRunning: emailWorker.isRunning(),
    webhookIngestionWorkerRunning: webhookIngestionWorker.isRunning(),
    fraudDetectionWorkerRunning: fraudDetectionWorker.isRunning(),
    productivitySnapshotWorkerRunning: productivitySnapshotWorker?.isRunning() ?? false,
  });

  // Schedule nightly productivity snapshot
  await scheduleNightlySnapshot();
}

/**
 * Gracefully close all workers
 */
export async function closeAllWorkers(): Promise<void> {
  logger.info({ event: 'workers.closing' });

  await Promise.all([
    importWorker.close(),
    closeEmailWorker(),
    webhookIngestionWorker.close(),
    fraudDetectionWorker.close(),
    productivitySnapshotWorker?.close(),
  ]);

  logger.info({ event: 'workers.closed' });
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info({ event: 'workers.sigterm_received' });
  await closeAllWorkers();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info({ event: 'workers.sigint_received' });
  await closeAllWorkers();
  process.exit(0);
});
