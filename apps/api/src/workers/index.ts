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
import { backupWorker, closeBackupWorker } from './backup.worker.js';
import { scheduleNightlySnapshot } from '../queues/productivity-snapshot.queue.js';
import { scheduleDailyBackup } from '../queues/backup.queue.js';
import { MonitoringService } from '../services/monitoring.service.js';
import { AlertService } from '../services/alert.service.js';
import pino from 'pino';

const logger = pino({ name: 'workers' });

// Re-export workers for direct access
export { importWorker } from './import.worker.js';
export { emailWorker, closeEmailWorker } from './email.worker.js';
export { webhookIngestionWorker } from './webhook-ingestion.worker.js';
export { fraudDetectionWorker } from './fraud-detection.worker.js';
export { productivitySnapshotWorker } from './productivity-snapshot.worker.js';
export { backupWorker } from './backup.worker.js';

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
    workers: ['import', 'email', 'webhook-ingestion', 'fraud-detection', 'productivity-snapshot', 'database-backup'],
    importWorkerRunning: importWorker.isRunning(),
    emailWorkerRunning: emailWorker.isRunning(),
    webhookIngestionWorkerRunning: webhookIngestionWorker.isRunning(),
    fraudDetectionWorkerRunning: fraudDetectionWorker.isRunning(),
    productivitySnapshotWorkerRunning: productivitySnapshotWorker?.isRunning() ?? false,
    backupWorkerRunning: backupWorker?.isRunning() ?? false,
  });

  // Schedule nightly productivity snapshot
  await scheduleNightlySnapshot();

  // Schedule daily backup
  await scheduleDailyBackup();

  // Start monitoring alert scheduler (every 30 seconds)
  startMonitoringScheduler();
}

let monitoringInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Starts periodic health check evaluation for alerting.
 * Calls MonitoringService.getSystemHealth() and passes results to AlertService.evaluateAlerts().
 * Runs every 30 seconds via setInterval (MVP approach — no persistence needed for monitoring).
 */
function startMonitoringScheduler(): void {
  if (monitoringInterval) return; // Prevent duplicate schedulers

  const INTERVAL_MS = 30_000; // 30 seconds
  monitoringInterval = setInterval(async () => {
    try {
      const health = await MonitoringService.getSystemHealth();
      await AlertService.evaluateAlerts(health);
    } catch (err) {
      logger.error({
        event: 'monitoring.scheduler_error',
        error: (err as Error).message,
      });
    }
  }, INTERVAL_MS);

  // Don't prevent Node.js from exiting due to this interval
  monitoringInterval.unref();

  logger.info({ event: 'monitoring.scheduler_started', intervalMs: INTERVAL_MS });
}

/**
 * Gracefully close all workers
 */
export async function closeAllWorkers(): Promise<void> {
  logger.info({ event: 'workers.closing' });

  // Stop monitoring scheduler
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
  }

  await Promise.all([
    importWorker.close(),
    closeEmailWorker(),
    webhookIngestionWorker.close(),
    fraudDetectionWorker.close(),
    productivitySnapshotWorker?.close(),
    closeBackupWorker(),
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
