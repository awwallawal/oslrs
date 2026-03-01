import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pino from 'pino';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import routes from './routes/index.js';
import cspRoutes from './routes/csp.routes.js';
import { AppError } from '@oslsr/utils';
import { metricsMiddleware } from './middleware/metrics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Environment validation - fail fast on misconfiguration
const validateEnvironment = () => {
  const nodeEnv = process.env.NODE_ENV;

  // Warn if NODE_ENV is not set
  if (!nodeEnv) {
    console.error('[SECURITY] NODE_ENV is not set. Defaulting to "development".');
    console.error('[SECURITY] In production, always set NODE_ENV=production');
    process.env.NODE_ENV = 'development';
  }

  // Validate production requirements
  if (nodeEnv === 'production') {
    const requiredProdVars = [
      'JWT_SECRET',
      'REFRESH_TOKEN_SECRET',
      'DATABASE_URL',
      'HCAPTCHA_SECRET_KEY',
      'CORS_ORIGIN',
    ];

    const missing = requiredProdVars.filter(v => !process.env[v]);
    if (missing.length > 0) {
      console.error(`[SECURITY] Missing required production environment variables: ${missing.join(', ')}`);
      process.exit(1);
    }

    // Warn about weak secrets in production
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
      console.error('[SECURITY] JWT_SECRET is too short. Use at least 32 characters in production.');
      process.exit(1);
    }
  }
};

validateEnvironment();

// Initialize BullMQ workers (email, import) - only in non-test mode
// Dynamic import prevents worker modules from creating Redis connections during tests
if (process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true') {
  const { initializeWorkers } = await import('./workers/index.js');
  initializeWorkers();
}

export const logger = pino({
  level: process.env.NODE_ENV === 'test' ? 'silent' : (process.env.LOG_LEVEL || 'info'),
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: { colorize: true }
  } : undefined
});

export const app = express();

// Trust first proxy (NGINX) — required for accurate IP-based rate limiting (SEC-2 review fix)
app.set('trust proxy', 1);

// CSP violation report endpoint — registered BEFORE helmet so it's never blocked by CSP enforcement
app.use('/api/v1', cspRoutes);

// CSP configuration — report-only mode for initial deployment (SEC-2)
const isProduction = process.env.NODE_ENV === 'production';
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
const wsUrl = isProduction
  ? corsOrigin.replace(/^https?:\/\//, 'wss://')
  : 'ws://localhost:3000';

app.use(helmet({
  contentSecurityPolicy: {
    reportOnly: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "https://accounts.google.com",
        "https://hcaptcha.com",
        "https://*.hcaptcha.com",
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://fonts.googleapis.com",
        "https://hcaptcha.com",
        "https://*.hcaptcha.com",
      ],
      imgSrc: [
        "'self'",
        "data:",
        "blob:",
        "https://*.tile.openstreetmap.org",
        "https://*.digitaloceanspaces.com",
      ],
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com",
      ],
      connectSrc: [
        "'self'",
        wsUrl,
        "https://accounts.google.com",
        "https://hcaptcha.com",
        "https://*.hcaptcha.com",
        "https://cdn.jsdelivr.net",
      ],
      frameSrc: [
        "https://accounts.google.com",
        "https://hcaptcha.com",
        "https://*.hcaptcha.com",
      ],
      workerSrc: ["'self'", "blob:"],
      mediaSrc: ["'self'", "blob:", "mediastream:"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      reportUri: ["/api/v1/csp-report"],
      reportTo: "csp-endpoint",
      ...(isProduction ? { upgradeInsecureRequests: [] } : {}),
    },
  },
}));

// Reporting-Endpoints header for modern Reporting API (SEC-2)
app.use((_req, res, next) => {
  res.setHeader('Reporting-Endpoints', 'csp-endpoint="/api/v1/csp-report"');
  next();
});
app.use(cors({
  origin: corsOrigin,
  credentials: true, // Allow cookies to be sent with requests
}));
app.use(cookieParser());
app.use(express.json());
app.use(metricsMiddleware);

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
app.use((err: Error & { code?: string; statusCode?: number; details?: unknown }, req: express.Request, res: express.Response, _next: express.NextFunction) => {
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
