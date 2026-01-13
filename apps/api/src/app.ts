import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pino from 'pino';
import dotenv from 'dotenv';
import routes from './routes/index.js';
import { AppError } from '@oslsr/utils';

dotenv.config();

export const logger = pino({
  level: process.env.NODE_ENV === 'test' ? 'silent' : (process.env.LOG_LEVEL || 'info'),
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: { colorize: true }
  } : undefined
});

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  logger.info({ event: 'health_check' });
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ message: 'OSLSR API is running' });
});

// Mount routes
app.use('/api/v1', routes);

// Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof AppError) {
    logger.warn({ event: 'api.error', code: err.code, path: req.path });
    return res.status(err.statusCode).json({
      status: 'error',
      code: err.code,
      message: err.message,
      details: err.details
    });
  }

  // Unknown error
  logger.error({ event: 'api.error.unknown', error: err.message, stack: err.stack });
  res.status(500).json({
    status: 'error',
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred'
  });
});
