import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type RequestHandler } from 'express';
import request from 'supertest';

/**
 * Story 13-70 **R7** — "a refusal is not a request" (PRD NFR4.4.d) on the FOUR ROUTE FAMILIES THAT
 * ARE NOT LOGIN, opened by the adversarial review on 2026-09-20 and closed the same day.
 *
 * ⛔ WHY THIS FILE EXISTS. FR1 and R3 made the clause true on `/auth/staff/login`,
 * `/auth/public/login`, `/auth/login/mfa` and `/auth/login/mfa-backup`, and the PRD was then flipped
 * to "IMPLEMENTED". The clause is route-general — *any other limiter on the same route* — and four
 * more pairs had the identical shape the login pair had, with no skip predicate on any of them:
 *
 *   `/auth/activate/:token`       activationIpFloodLimit (300/IP)   → activationRateLimit (20/token)
 *   `/auth/reset-password`        …CompletionIpFloodLimit (300/IP)  → …CompletionRateLimit (20/token)
 *   `/registration/wizard`        registrationRateLimit (50/IP)     → registrationEmailRateLimit (3/email)
 *   `/registration/draft`         wizardDraftRateLimit (1200/IP)    → wizardDraftEmailRateLimit (300/email)
 *
 * The registration one is residual A1's own incident on another route: a citizen who spends their
 * 3-per-email budget and retries used to charge their own 429s to the 50-per-IP ceiling their whole
 * Opera Mini / CGNAT gateway shares. Every incident in this family has been a legitimate person.
 *
 * ⛔ BOTH DIRECTIONS, ALWAYS, AND BY COUNTER VALUE. A `store.decrement()` that silently no-ops is
 * indistinguishable from a working skip [[pattern-ship-a-fix-that-never-fires]], and "the request
 * was served" is consistent with both. So a probe sits directly BEHIND each ceiling in the REAL
 * route stack and records `req.rateLimit.used`. Each family asserts that the ceiling does NOT
 * advance on a downstream 429 **and DOES advance on an ordinary served request** — one direction
 * alone would license a predicate that disarms the ceiling entirely
 * [[pattern-a-clean-result-must-prove-it-measured]].
 *
 * ⛔ THE STACKS ARE READ FROM THE REAL ROUTERS, not re-typed (the M4 lesson from 13-68). Only the
 * controller is replaced. Reorder a route and this file follows.
 *
 * ⚠️ SCOPE, stated rather than assumed — the same limit `login-rate-limit.binding.test.ts` carries:
 * in test mode every limiter is built with the IN-MEMORY store, so this proves the PREDICATE WIRING
 * and exercises `MemoryStore.decrement()`, never `rate-limit-redis@4`'s. That half is residual R2,
 * and R7 inherits it — the post-deploy read in R2's procedure should cover a registration refusal
 * as well as a login one.
 */

const warn = vi.hoisted(() => vi.fn());
vi.mock('pino', () => {
  const logger: Record<string, unknown> = {
    warn, info: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), fatal: vi.fn(), level: 'info',
  };
  logger.child = () => logger;
  return { default: () => logger };
});

/**
 * Story 13-46's burst breaker is mocked inert. It is fire-and-forget instrumentation that reaches
 * for Redis, and this file is about what the COUNTERS do; leaving it live would make the test
 * depend on infrastructure to prove a predicate. ⭐ Its own behaviour under R7 is stated in
 * `login-rate-limit.ts`: `recordRegistration429` fires from each `handler`, so every refusal that
 * happens is still counted — the ceiling simply refuses less often, and for better reasons.
 */
vi.mock('../registration-burst.js', () => ({
  recordRegistration429: vi.fn(),
  registrationBurstWatch: ((_req, _res, next) => next()) as RequestHandler,
}));

const { shouldSkipRateLimit } = await import('../login-rate-limit.js');
const { default: authRouter } = await import('../../routes/auth.routes.js');
const { default: registrationRouter } = await import('../../routes/registration.routes.js');

type RouterLike = {
  stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: RequestHandler }> } }>;
};

/** Every middleware the real router mounts on `path`+`method`, minus the final controller. */
function productionMiddleware(router: unknown, path: string, method: string): RequestHandler[] {
  const layer = (router as RouterLike).stack.find((l) => l.route?.path === path && l.route?.methods[method]);
  if (!layer?.route) throw new Error(`no ${method.toUpperCase()} ${path}`);
  return layer.route.stack.slice(0, -1).map((s) => s.handle);
}

/** Readings of the CEILING's own counter, taken by a probe mounted directly behind it. */
let ceilingUsed: number[] = [];
let refusedBy: Array<string | undefined> = [];

const ceilingProbe: RequestHandler = (req, _res, next) => {
  ceilingUsed.push((req as unknown as { rateLimit?: { used?: number } }).rateLimit?.used ?? -1);
  next();
};
const markerProbe: RequestHandler = (_req, res, next) => {
  res.on('finish', () => refusedBy.push(res.locals.rateLimitRefusedBy));
  next();
};

/**
 * The decrement runs in a `finish` listener, on the server, after the client's response has ended,
 * so a bare `await request(...)` can return before the counter has moved.
 */
async function repeatSettled(n: number, fn: (i: number) => Promise<{ status: number }>) {
  const statuses: number[] = [];
  for (let i = 0; i < n; i++) {
    statuses.push((await fn(i)).status);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return statuses;
}

/** The real stack for a route, with the two probes spliced around the ceiling and a stub controller. */
function makeApp(method: 'post' | 'put', path: string, middleware: RequestHandler[]) {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json());
  app[method](path, markerProbe, middleware[0]!, ceilingProbe, ...middleware.slice(1), (_req, res) => {
    res.status(200).json({ data: { ok: true } });
  });
  return app;
}

const activateApp = makeApp('post', '/activate/:token', productionMiddleware(authRouter, '/activate/:token', 'post'));
const resetApp = makeApp('post', '/reset-password', productionMiddleware(authRouter, '/reset-password', 'post'));
const wizardApp = makeApp('post', '/wizard', productionMiddleware(registrationRouter, '/wizard', 'post'));
const draftApp = makeApp('put', '/draft', productionMiddleware(registrationRouter, '/draft', 'put'));

/**
 * In test mode every limiter is built with `skip: shouldSkipRateLimit`, which returns true — every
 * limiter a no-op and every assertion below hollow. `skip` is evaluated PER REQUEST, so the env is
 * stubbed to production after import. The sentinel test fails if that ever stops taking effect
 * [[pattern-test-that-passes-over-a-hole]].
 */
const realEnv = { NODE_ENV: process.env.NODE_ENV, VITEST: process.env.VITEST, E2E: process.env.E2E };
beforeEach(() => {
  process.env.NODE_ENV = 'production';
  delete process.env.VITEST;
  delete process.env.E2E;
  ceilingUsed = [];
  refusedBy = [];
  warn.mockClear();
  return () => {
    process.env.NODE_ENV = realEnv.NODE_ENV;
    if (realEnv.VITEST !== undefined) process.env.VITEST = realEnv.VITEST;
    if (realEnv.E2E !== undefined) process.env.E2E = realEnv.E2E;
  };
});

describe('13-70 R7 — a refusal is not a request, on the four non-login families', () => {
  it('SENTINEL: the limiters are actually enforcing here', () => {
    expect(shouldSkipRateLimit()).toBe(false);
  });

  /**
   * ⭐ THE REGISTRATION CASE IS THE ONE TO READ. 3 per email, 50 per IP. A citizen submits, is
   * refused on the fourth, and keeps pressing the button — which is what people do. Before R7 every
   * one of those refusals was charged to the 50 their whole carrier gateway shares.
   */
  it('registration: a 429 from the per-email limiter is not counted by the per-IP ceiling', async () => {
    const ip = '10.77.1.1';
    const body = { email: 'r7-wizard@gmail.com', fullName: 'A B' };
    const send = () => request(wizardApp).post('/wizard').set('X-Forwarded-For', ip).send(body);

    const statuses = await repeatSettled(7, send);
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
    expect(statuses.slice(3)).toEqual([429, 429, 429, 429]);

    // DIRECTION 1 — an ordinary served request MUST advance the ceiling.
    expect(ceilingUsed.slice(0, 3)).toEqual([1, 2, 3]);
    // DIRECTION 2 — the person's own refusals do not. Without the decrement this reads [4,5,6,7].
    expect(ceilingUsed.slice(3)).toEqual([4, 4, 4, 4]);
    expect(refusedBy.slice(3)).toEqual(Array(4).fill('registrationEmailRateLimit'));
  });

  it('activation: a 429 from the per-token limiter is not counted by the per-IP ceiling', async () => {
    const ip = '10.77.2.1';
    const send = () => request(activateApp).post('/activate/tok-r7-aaaa').set('X-Forwarded-For', ip).send({});

    const statuses = await repeatSettled(23, send);
    expect(statuses.slice(0, 20)).toEqual(Array(20).fill(200));
    expect(statuses.slice(20)).toEqual([429, 429, 429]);

    expect(ceilingUsed.slice(0, 20)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(ceilingUsed.slice(20)).toEqual([21, 21, 21]);
    expect(refusedBy.slice(20)).toEqual(Array(3).fill('activationRateLimit'));
  });

  it('password reset: a 429 from the per-token limiter is not counted by the per-IP ceiling', async () => {
    const ip = '10.77.3.1';
    const send = () =>
      request(resetApp).post('/reset-password').set('X-Forwarded-For', ip)
        .send({ token: 'tok-r7-reset', password: 'x' });

    const statuses = await repeatSettled(23, send);
    expect(statuses.slice(0, 20)).toEqual(Array(20).fill(200));
    expect(statuses.slice(20)).toEqual([429, 429, 429]);

    expect(ceilingUsed.slice(0, 20)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(ceilingUsed.slice(20)).toEqual([21, 21, 21]);
    expect(refusedBy.slice(20)).toEqual(Array(3).fill('passwordResetCompletionRateLimit'));
  });

  /**
   * The draft pair, at its real budgets: 300 per email inside 1,200 per IP. A dropping mobile
   * connection re-saving a draft is this cohort's normal condition, which is why the per-IP figure
   * is so high — and exactly why charging it for the per-email limiter's refusals mattered.
   */
  it('wizard draft: a 429 from the per-email limiter is not counted by the per-IP ceiling', async () => {
    const ip = '10.77.4.1';
    const send = () =>
      request(draftApp).put('/draft').set('X-Forwarded-For', ip)
        .send({ email: 'r7-draft@gmail.com', data: {} });

    const statuses = await repeatSettled(303, send);
    expect(statuses.slice(0, 300)).toEqual(Array(300).fill(200));
    expect(statuses.slice(300)).toEqual([429, 429, 429]);

    expect(ceilingUsed.slice(0, 300)).toEqual(Array.from({ length: 300 }, (_, i) => i + 1));
    expect(ceilingUsed.slice(300)).toEqual([301, 301, 301]);
    expect(refusedBy.slice(300)).toEqual(Array(3).fill('wizardDraftEmailRateLimit'));
  });

  /**
   * ⛔ THE CEILING STILL COUNTS ITS OWN REFUSALS — the self-skip trap that made Option A wrong on
   * the login routes, asserted here so the four new predicates cannot drift into it. The marker
   * carries a NAME, so each limiter ignores every refusal but its own.
   */
  it('a ceiling still counts its OWN 429s, so `attempts` keeps meaning requests from this IP', async () => {
    const ip = '10.77.5.1';
    // 50 distinct addresses, so the per-email limiter never binds and the ceiling is what refuses.
    const statuses = await repeatSettled(53, (i) =>
      request(wizardApp).post('/wizard').set('X-Forwarded-For', ip)
        .send({ email: `r7-own-${i}@gmail.com`, fullName: 'A B' }));

    expect(statuses.slice(0, 50)).toEqual(Array(50).fill(200));
    expect(statuses.slice(50)).toEqual([429, 429, 429]);

    // The probe sits BEHIND the ceiling, so requests the CEILING itself refuses never reach it.
    expect(ceilingUsed).toHaveLength(50);
    expect(refusedBy.slice(50)).toEqual(Array(3).fill('registrationRateLimit'));

    // Nothing stamped a DIFFERENT limiter's name, so nothing was handed back: the count keeps
    // climbing past `max`. Under a status filter it would pin at 51 forever.
    const attempts = warn.mock.calls
      .map((c) => c[0] as { event?: string; attempts?: number })
      .filter((o) => o?.event === 'registration.rate_limit_exceeded')
      .map((o) => o.attempts);
    expect(attempts).toEqual([51, 52, 53]);
  });
});
