/**
 * Story 13-51 (AC1, AC2) — the operator surface for people the register has gone silent on, and
 * the one action that puts them back in touch.
 *
 * Mount path: `/api/v1/admin/suppressed-contacts/*` (mounted from admin.routes.ts).
 * Shape follows the 9-11 audit-log-viewer exemplar: router-level guard, handlers inline, no
 * controller file. `requireRole` does not exist in this repo — the middleware is `authorize`.
 *
 *   GET  /            — the list (three buckets, phone, ladder status, healthy twin)
 *   POST /correct     — correct one address + lift its suppression, in one audited action
 *
 * ⚠️ THE ROUTE OWNS NO CORRECTION LOGIC. Every rule — the clash refusal, the per-source rewrites,
 * the suppression delete, the audit row, the read-back — lives in `contact-correction.service.ts`,
 * which `scripts/correct-respondent-contact-email.ts` also calls. That is AC2.5, and it is
 * verified by BEHAVIOUR not by a census: delete the refusal inside the service and the ROUTE test
 * must red. If only the script's test reds, the extraction did not happen
 * ([[pattern-census-counts-sites-not-callers]]).
 *
 * ⛔ NO BULK ENDPOINT, DELIBERATELY. Six suppressions matter today and each deserves a human look.
 * A bulk tool would invite exactly the unreviewed sweep this story exists to prevent — and only
 * ONE of the three buckets is even a candidate for correction.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import pino from 'pino';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { UserRole } from '@oslsr/types';
import { db } from '../db/index.js';
import { listSuppressedContacts } from '../services/suppressed-contacts.service.js';
import {
  correctRespondentContactEmail,
  ContactAddressClashError,
  ContactCorrectionRefusedError,
  ContactCorrectionReadBackError,
  RespondentNotFoundError,
} from '../services/contact-correction.service.js';

const logger = pino({ name: 'suppressed-contacts-routes' });
const router = Router();

// All endpoints require an authenticated super-admin.
router.use(authenticate, authorize(UserRole.SUPER_ADMIN));

/*
 * ⛔ EVERY HANDLER BELOW TAKES `next` AND ROUTES ITS ERRORS THROUGH IT — code-review H2.
 *
 * Express 4 does NOT forward an async handler's rejection to the error middleware, this repo has
 * no `express-async-errors` shim, and there is no `process.on('unhandledRejection')` anywhere in
 * `apps/api`. So an un-caught rejection here did two things, both verified against the real
 * router: the request NEVER RESPONDED (the client sits until its own deadline), and Node emitted
 * an unhandled rejection — which, under the default mode `node dist/index.js` runs in, terminates
 * the API process and takes every other in-flight request with it. One failed query on an admin
 * screen became an outage.
 *
 * The audit-log-viewer exemplar this file follows already does it this way
 * (`audit-log-viewer.routes.ts:113`), and `admin.routes.ts` wraps whole bodies in try/catch. This
 * was the only route file in the repo that did neither.
 */
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await listSuppressedContacts();
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

const correctSchema = z.object({
  respondentId: z.string().uuid(),
  to: z.string().min(3).max(255),
  reason: z.string().min(1).max(1000),
});

router.post('/correct', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = correctSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid request', details: parsed.error.flatten() });
    return;
  }

  // AC2.2 — the script passes `actorId: null` because a CLI has no session principal.
  // THE UI MUST NOT. A correction the respondent did not ask for, and cannot be reached to
  // confirm, is exactly the intervention that has to name who made it.
  const actorId = (req as Request & { user?: { sub?: string } }).user?.sub ?? null;
  if (!actorId) {
    res.status(401).json({ error: 'no session principal' });
    return;
  }

  try {
    const result = await db.transaction((tx) =>
      correctRespondentContactEmail(tx, {
        respondentId: parsed.data.respondentId,
        to: parsed.data.to,
        actorId,
        reason: parsed.data.reason,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      }),
    );
    res.json({ data: result });
  } catch (err) {
    // AC2.3 / AC2.8 — never silently reassign an address, and SAY WHOSE IT IS. A generic
    // "address in use" gives an operator nothing to act on.
    if (err instanceof ContactAddressClashError) {
      res.status(409).json({
        error: err.message,
        ownerReferenceCode: err.ownerReferenceCode,
        ownerKind: err.ownerKind,
      });
      return;
    }
    if (err instanceof RespondentNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof ContactCorrectionRefusedError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof ContactCorrectionReadBackError) {
      // The transaction rolled back, so nothing was written — but this is a real defect and must
      // not be reported as a routine 400.
      logger.error({ event: 'contact_correction.read_back_mismatch', err: err.message });
      res.status(500).json({ error: err.message });
      return;
    }
    // Anything unrecognised goes to the error middleware — NEVER re-thrown out of an async
    // handler, which Express 4 turns into a hung request and a dead process (H2).
    next(err);
  }
});

export default router;
