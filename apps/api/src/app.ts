import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pino from 'pino';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import routes from './routes/index.js';
import { AppError } from '@oslsr/utils';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const logger = pino({
  level: process.env.NODE_ENV === 'test' ? 'silent' : (process.env.LOG_LEVEL || 'info'),
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: { colorize: true }
  } : undefined
});

export const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true, // Allow cookies to be sent with requests
}));
app.use(cookieParser());
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
