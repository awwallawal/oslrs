import { describe, it, expect, beforeEach } from 'vitest';
import express, { type RequestHandler } from 'express';
import request from 'supertest';
import {
  classifyLoginResponse,
  createMemoryCardinalityStore,
  observeLoginOutcome,
  shouldAlert,
  hourBucket,
} from '../../lib/login-cardinality.js';
import { loginCardinalityWatch, __setLoginCardinalityDepsForTest } from '../login-cardinality-watch.js';

const { default: authRouter } = await import('../../routes/auth.routes.js');

/**
 * Story 13-68 R2b (2026-10-15) — distinct-identifier cardinality monitor.
 * Rule: > 20 distinct emails from one IP in one hour, with > 80 % of its attempts failing → one alert.
 */
describe('13-68 R2b — the rule', () => {
  it('fires at 21 distinct emails, not 20 (the threshold is "more than 20")', () => {
    expect(shouldAlert({ distinctEmails: 20, failures: 20, successes: 0 })).toBe(false);
    expect(shouldAlert({ distinctEmails: 21, failures: 21, successes: 0 })).toBe(true);
  });

  it('needs MORE than 80 % failing: exactly 80 % is a crowd, not a spray', () => {
    expect(shouldAlert({ distinctEmails: 25, failures: 20, successes: 5 })).toBe(false); // 80 %
    expect(shouldAlert({ distinctEmails: 25, failures: 21, successes: 4 })).toBe(true); // 84 %
  });

  it('a shared proxy full of people who log in successfully never fires', () => {
    expect(shouldAlert({ distinctEmails: 60, failures: 10, successes: 50 })).toBe(false);
  });

  it('classifies only answers the controller gave', () => {
    expect(classifyLoginResponse(200, undefined)).toBe('success');
    expect(classifyLoginResponse(401, undefined)).toBe('failure');
    expect(classifyLoginResponse(403, undefined)).toBe('failure');
    expect(classifyLoginResponse(429, undefined)).toBe('failure'); // account lock, from the controller
    expect(classifyLoginResponse(429, 'strictLoginRateLimit')).toBe('ignore'); // a limiter's refusal
    expect(classifyLoginResponse(400, undefined)).toBe('ignore'); // captcha
    expect(classifyLoginResponse(500, undefined)).toBe('ignore');
  });

  it('buckets by UTC clock hour', () => {
    expect(hourBucket(new Date('2026-10-15T23:59:59.000Z'))).toBe('2026-10-15T23');
    expect(hourBucket(new Date('2026-10-16T00:00:00.000Z'))).toBe('2026-10-16T00');
  });

  it('alerts exactly ONCE per IP per hour, however long the spray continues', async () => {
    const store = createMemoryCardinalityStore();
    const sent: string[] = [];
    const deps = { store, send: async (t: string) => { sent.push(t); return true; }, now: () => new Date('2026-10-15T10:30:00Z') };
    const results = [];
    for (let i = 0; i < 40; i++) {
      results.push(await observeLoginOutcome(deps, { ip: '192.0.2.10', email: `spray-${i}@example.invalid`, outcome: 'failure' }));
    }
    expect(results.findIndex((r) => r.alerted)).toBe(20); // the 21st distinct email
    expect(sent).toHaveLength(1);
    // A different IP has its own bucket.
    for (let i = 0; i < 21; i++) {
      await observeLoginOutcome(deps, { ip: '192.0.2.11', email: `other-${i}@example.invalid`, outcome: 'failure' });
    }
    expect(sent).toHaveLength(2);
  });
});

describe('13-68 R2b — through HTTP, the middleware the routes mount', () => {
  const sent: string[] = [];
  beforeEach(() => {
    sent.length = 0;
    const store = createMemoryCardinalityStore();
    __setLoginCardinalityDepsForTest({ store: () => store, send: async (t) => { sent.push(t); return true; } });
  });

  // A limiter ahead of the watch would never call next(); this stub stamps and answers like one.
  const refuseLikeALimiter: RequestHandler = (req, res, next) => {
    if (req.headers['x-refuse'] === '1') {
      res.locals.rateLimitRefusedBy = 'strictLoginRateLimit';
      res.status(429).json({ code: 'AUTH_IP_BLOCKED' });
      return;
    }
    next();
  };

  function makeApp() {
    const app = express();
    app.set('trust proxy', true);
    app.use(express.json());
    app.post('/login', refuseLikeALimiter, loginCardinalityWatch, (req, res) => {
      if (req.body?.password === 'ok') res.status(200).json({ ok: true });
      else res.status(401).json({ code: 'AUTH_INVALID_CREDENTIALS' });
    });
    return app;
  }

  const attempt = (app: express.Express, ip: string, email: string, password = 'bad', refuse = false) =>
    request(app).post('/login').set('X-Forwarded-For', ip).set('x-refuse', refuse ? '1' : '0').send({ email, password });

  /** `finish` fires after supertest resolves; let the fire-and-forget observation settle. */
  const settle = () => new Promise((r) => setTimeout(r, 20));

  it('21 distinct emails failing from one IP pages the operator once, naming the IP and NOT the emails', async () => {
    const app = makeApp();
    for (let i = 0; i < 25; i++) await attempt(app, '203.0.113.9', `Victim-${i}@Example.com `);
    await settle();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('203.0.113.9');
    expect(sent[0]).toContain('21 distinct emails');
    expect(sent[0]).not.toMatch(/victim-\d+@example\.com/i);
  });

  it('a limiter refusal is NOT an attempt: 40 refused requests with distinct emails never page', async () => {
    const app = makeApp();
    for (let i = 0; i < 40; i++) await attempt(app, '203.0.113.20', `r-${i}@example.com`, 'bad', true);
    await settle();
    expect(sent).toHaveLength(0);
  });

  it('the same email retried 30 times is ONE identifier, not a spray', async () => {
    const app = makeApp();
    for (let i = 0; i < 30; i++) await attempt(app, '203.0.113.30', 'same@example.com');
    await settle();
    expect(sent).toHaveLength(0);
  });
});

describe('13-68 R2b — wiring: mounted LAST, before the controller, on both password-login routes', () => {
  type RouterLike = { stack: Array<{ route?: { path: string; stack: Array<{ handle: RequestHandler }> } }> };
  for (const path of ['/staff/login', '/public/login']) {
    it(`${path}`, () => {
      const layer = (authRouter as unknown as RouterLike).stack.find((l) => l.route?.path === path);
      const handles = layer!.route!.stack.map((s) => s.handle);
      expect(handles.at(-2)).toBe(loginCardinalityWatch);
    });
  }
});
