/**
 * Worker registration and lifecycle management
 *
 * Import this module to start all BullMQ workers.
 */

import { importWorker } from './import.worker.js';
import { emailWorker, closeEmailWorker } from './email.worker.js';
import pino from 'pino';

const logger = pino({ name: 'workers' });

// Export workers for direct access if needed
export { importWorker } from './import.worker.js';
export { emailWorker, closeEmailWorker } from './email.worker.js';

/**
 * Initialize all workers
 */
export function initializeWorkers(): void {
  logger.info({
    event: 'workers.initialized',
    workers: ['import', 'email'],
  });
}

/**
 * Gracefully close all workers
 */
export async function closeAllWorkers(): Promise<void> {
  logger.info({ event: 'workers.closing' });

  await Promise.all([
    importWorker.close(),
    closeEmailWorker(),
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
