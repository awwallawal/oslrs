/**
 * Story 13-51 (code-review H2) — WHAT HAPPENS WHEN A HANDLER'S PROMISE REJECTS?
 *
 * ⛔ THE HOLE THIS FILLS. `GET /` had no try/catch and `POST /correct` ended with a bare
 * `throw err`. Express 4 does not forward an async handler's rejection to the error middleware,
 * this repo has no `express-async-errors` shim, and there is no `process.on('unhandledRejection')`
 * anywhere in `apps/api`. Measured against the real router before the fix: the request NEVER
 * RESPONDED — the client sat until its own deadline — and Node emitted an unhandled rejection,
 * which under the mode `node dist/index.js` runs in terminates the API process and takes every
 * other in-flight request with it. One failed query on an admin screen became an outage.
 *
 * ⚠️ THE ASSERTION IS "IT RESPONDED", NOT "IT DID NOT THROW". A handler that swallows the error
 * and hangs also does not throw. The failure mode was silence, so silence is what this must catch.
 * Revert either handler to a bare throw and the matching case times out and reds.
 */
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../middleware/auth.js', () => ({
  authenticate: vi.fn((req: express.Request & { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = { sub: '00000000-0000-0000-0000-000000000001', role: 'super_admin' };
    next();
  }),
}));
vi.mock('../../middleware/rbac.js', () => ({
  authorize: () => vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock('../../services/suppressed-contacts.service.js', () => ({
  listSuppressedContacts: async () => {
    throw new Error('simulated failure inside the read model');
  },
}));
vi.mock('../../services/contact-correction.service.js', async () => {
  const actual = await vi.importActual<typeof import('../../services/contact-correction.service.js')>(
    '../../services/contact-correction.service.js',
  );
  return {
    ...actual,
    correctRespondentContactEmail: async () => {
      throw new Error('simulated failure inside the correction service');
    },
  };
});

const routerModule = await import('../suppressed-contacts.routes.js');

/** The shape the real app has: a terminal error middleware after the routes. */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/admin/suppressed-contacts', routerModule.default);
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: 'handled', message: err.message });
  });
  return app;
}

describe('suppressed-contacts routes (13-51 H2) — an unexpected failure must not hang or crash', () => {
  it('RED-VERIFY (H2): GET / answers 500 through the error middleware instead of never replying', async () => {
    const rejections: unknown[] = [];
    const onRej = (e: unknown) => rejections.push(e);
    process.on('unhandledRejection', onRej);

    const res = await request(buildApp()).get('/admin/suppressed-contacts').timeout({ deadline: 5000 });

    await new Promise((r) => setTimeout(r, 100));
    process.off('unhandledRejection', onRej);

    expect(res.status).toBe(500);
    // The process-level assertion is the one that matters: an unhandled rejection here is fatal
    // in production, not merely untidy.
    expect(rejections).toHaveLength(0);
  });

  it('RED-VERIFY (H2): POST /correct routes an UNRECOGNISED error to the middleware, never re-throws', async () => {
    const rejections: unknown[] = [];
    const onRej = (e: unknown) => rejections.push(e);
    process.on('unhandledRejection', onRej);

    const res = await request(buildApp())
      .post('/admin/suppressed-contacts/correct')
      .send({
        respondentId: '00000000-0000-0000-0000-0000000000ff',
        to: 'someone@example.com',
        reason: 'review probe',
      })
      .timeout({ deadline: 5000 });

    await new Promise((r) => setTimeout(r, 100));
    process.off('unhandledRejection', onRej);

    expect(res.status).toBe(500);
    expect(rejections).toHaveLength(0);
  });
});
