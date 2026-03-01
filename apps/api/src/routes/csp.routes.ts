/**
 * CSP Violation Report Routes
 *
 * Receives Content-Security-Policy violation reports from browsers.
 * No authentication required — browsers send reports automatically.
 * Rate-limited to prevent abuse.
 *
 * Created in Story SEC-2.
 */

import express, { Router, type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import pino from 'pino';

const logger = pino({
  name: 'csp-report',
  level: process.env.NODE_ENV === 'test' ? 'silent' : (process.env.LOG_LEVEL || 'info'),
});

const router = Router();

// Parse JSON for CSP report content types (scoped to this router)
router.use(express.json({ type: ['application/json', 'application/csp-report', 'application/reports+json'] }));

// Rate limit: 10 reports/minute/IP
const cspRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { status: 'error', code: 'RATE_LIMIT_EXCEEDED', message: 'Too many CSP reports' },
  handler: (_req, res, _next, options) => {
    res.status(options.statusCode).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/csp-report', cspRateLimit, (req: Request, res: Response) => {
  const body = req.body;

  // Validate body exists and is an object/array
  if (!body || (typeof body !== 'object')) {
    res.status(400).json({ status: 'error', message: 'Invalid CSP report body' });
    return;
  }

  // Legacy CSP format: { "csp-report": { ... } }
  const cspReport = body['csp-report'];
  if (cspReport) {
    logger.warn({
      event: 'csp_violation',
      documentUri: cspReport['document-uri'],
      violatedDirective: cspReport['violated-directive'],
      blockedUri: cspReport['blocked-uri'],
      sourceFile: cspReport['source-file'],
      lineNumber: cspReport['line-number'],
    });
    res.status(204).end();
    return;
  }

  // Reporting API v2 format: [{ type: "csp-violation", body: { ... } }]
  if (Array.isArray(body)) {
    for (const report of body) {
      const reportBody = report.body || report;
      logger.warn({
        event: 'csp_violation',
        documentUri: reportBody.documentURL || reportBody['document-uri'],
        violatedDirective: reportBody.violatedDirective || reportBody['violated-directive'],
        blockedUri: reportBody.blockedURL || reportBody['blocked-uri'],
        sourceFile: reportBody.sourceFile || reportBody['source-file'],
        lineNumber: reportBody.lineNumber || reportBody['line-number'],
      });
    }
    res.status(204).end();
    return;
  }

  // Unrecognized format — still accept to avoid browser retry loops
  logger.warn({ event: 'csp_violation_unknown_format', body });
  res.status(204).end();
});

// Handle JSON parse errors within this router — returns 400 instead of falling through to global 500 handler
router.use((err: Error & { type?: string }, _req: Request, res: Response, next: NextFunction) => {
  if (err.type === 'entity.parse.failed') {
    res.status(400).json({ status: 'error', message: 'Invalid CSP report body' });
    return;
  }
  next(err);
});

export default router;
