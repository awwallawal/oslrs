import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env BEFORE importing app to ensure env vars are available
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Now import app after env is loaded
const { app, logger } = await import('./app.js');

const port = process.env.PORT || 3000;

// Expose raw http.Server for transport attachment (Socket.io)
const server = http.createServer(app);

if (process.env.NODE_ENV !== 'test') {
  // Initialize realtime transport before listening
  const { initializeRealtime } = await import('./realtime/index.js');
  const { FraudConfigService } = await import('./services/fraud-config.service.js');
  const { closeAllConnections } = await import('./lib/redis.js');
  initializeRealtime(server);

  // Ensure fraud thresholds exist on boot (self-heal if table was wiped).
  FraudConfigService.getActiveThresholds().catch((error) => {
    logger.warn({
      event: 'fraud.thresholds.bootstrap.failed',
      error: error instanceof Error ? error.message : String(error),
    });
  });

  server.listen(port, () => {
    logger.info({ event: 'server_start', port });
  });

  // Graceful shutdown — close Redis connections on SIGTERM/SIGINT
  const shutdown = async () => {
    logger.info({ event: 'server.shutdown' });
    await closeAllConnections();
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

export { server };
