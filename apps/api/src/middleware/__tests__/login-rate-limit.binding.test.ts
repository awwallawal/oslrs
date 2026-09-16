import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { type RequestHandler, type ErrorRequestHandler } from 'express';
import request from 'supertest';

/**
 * Story 13-68 — do the login limiters BIND, on the axis they claim, in the order production mounts them?
 *
 * `login-rate-limit-key.test.ts` proves the key builder. This file proves the WIRING: that the real
 * middleware refuses on the right key at the right count — and, just as important, ALLOWS everything below
 * it. A guard test that only proves "blocked at N+1" licenses a fix that blocks everyone, so every limit is
 * asserted in both directions.
 *
 * ⛔ THE STACK IS READ FROM THE REAL ROUTER, not re-typed here (adversarial review 2026-09-16, M4). The first
 * version of this file hand-built "the production order" without `verifyCaptcha` and with the captcha skipped,
 * and so could not see that the per-email budget was spendable by requests with no captcha (H1) or that one
 * person's refused retries were charged to their whole proxy (M1). Every middleware before the controller on
 * `/staff/login` and `/login/mfa` is mounted here exactly as `auth.routes.ts` declares it — reorder the route and
 * this file follows. Only the controller is replaced, by a stub that answers 200 / 401 from the body.
 *
 * HOW THE LIMITERS AND THE CAPTCHA RUN HERE. In test mode each limiter is built with the in-memory store and
 * `skip: shouldSkipRateLimit`, which returns true — every limiter a no-op, every "allowed" assertion hollow.
 * `store` and `validate` are fixed at import, but `skip` is evaluated PER REQUEST, so the env is stubbed to
 * PRODUCTION after import. That also makes `verifyCaptcha` enforce (development mode skips it); its hCaptcha
 * call is answered by a stubbed `fetch` that accepts exactly one token. The sentinel tests fail if either
 * stubbing stops taking effect.
 *
 * The in-memory stores are module singletons shared by every test in this file, so each test uses its own IP
 * (via X-Forwarded-For + trust proxy) and its own emails.
 */

const warn = vi.hoisted(() => vi.fn());
vi.mock('pino', () => {
  // auth.routes.ts imports the whole controller/service graph, so the logger must tolerate any call shape.
  const logger: Record<string, unknown> = { warn, info: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), fatal: vi.fn(), level: 'info' };
  logger.child = () => logger;
  return { default: () => logger };
});

const {
  loginRateLimit,
  loginIpFloodLimit,
  strictLoginRateLimit,
  shouldSkipRateLimit,
} = await import('../login-rate-limit.js');
const { verifyCaptcha } = await import('../captcha.js');
const { default: authRouter } = await import('../../routes/auth.routes.js');

const PASSWORD_OK = 'correct-password';
const CAPTCHA_OK = 'valid-captcha';

type RouterLike = { stack: Array<{ route?: { path: string; stack: Array<{ handle: RequestHandler }> } }> };

/** Every middleware the real router mounts on `path`, minus the final controller. */
function productionMiddleware(path: string): RequestHandler[] {
  const layer = (authRouter as unknown as RouterLike).stack.find((l) => l.route?.path === path);
  if (!layer?.route) throw new Error(`no route ${path}`);
  return layer.route.stack.slice(0, -1).map((s) => s.handle);
}

// Same shape app.ts's error handler produces for an AppError (verifyCaptcha passes it to next()).
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  res.status(err.statusCode ?? 500).json({ code: err.code });
};

function makeApp(...middleware: RequestHandler[]) {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json());
  app.post('/login', ...middleware, (req, res) => {
    if (req.body?.password === PASSWORD_OK) {
      res.status(200).json({ data: { ok: true } });
    } else {
      res.status(401).json({ code: 'AUTH_INVALID_CREDENTIALS' });
    }
  });
  app.use(errorHandler);
  return app;
}

const staffLoginStack = productionMiddleware('/staff/login');
const mfaLoginStack = productionMiddleware('/login/mfa');

/** `/staff/login` exactly as production mounts it (and `/public/login`, asserted identical below). */
const fullStack = makeApp(...staffLoginStack);
/** `/login/mfa` exactly as production mounts it — the body carries no email. */
const mfaStack = makeApp(...mfaLoginStack);
/**
 * Each IP ceiling ALONE, so each limiter's own threshold is provable without the other in the way. The full
 * stack is then asserted separately for the properties that only exist in combination.
 */
const strictOnly = makeApp(strictLoginRateLimit);
const floodOnly = makeApp(loginIpFloodLimit);

function attempt(
  app: express.Express,
  ip: string,
  email: unknown,
  password = 'wrong',
  // null = send NO captcha token. (Not `undefined`: that would silently take the default and send a valid one.)
  captchaToken: string | null = CAPTCHA_OK,
) {
  return request(app).post('/login').set('X-Forwarded-For', ip).send({ email, password, captchaToken: captchaToken ?? undefined });
}

/** Fire `n` requests sequentially (the memory store's counter is per request, order matters). */
async function repeat(n: number, fn: (i: number) => Promise<{ status: number }>) {
  const statuses: number[] = [];
  for (let i = 0; i < n; i++) statuses.push((await fn(i)).status);
  return statuses;
}

function warnedWith(event: string) {
  return warn.mock.calls.map((c) => c[0]).filter((o) => o?.event === event);
}

describe('login limiters — binding, real route stacks (Story 13-68)', () => {
  beforeEach(() => {
    warn.mockClear();
    vi.stubEnv('VITEST', '');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('E2E', '');
    vi.stubEnv('HCAPTCHA_SECRET_KEY', 'test-secret');
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: { body?: string }) => ({
      json: async () => ({ success: new URLSearchParams(init?.body ?? '').get('response') === CAPTCHA_OK }),
    })));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('sentinel: the limiters are NOT skipped in this file (otherwise every "allowed" below is hollow)', () => {
    expect(shouldSkipRateLimit()).toBe(false);
  });

  // Added at ADJUDICATION 2026-09-16. The sentinel below pins that the four login routes agree
  // with EACH OTHER; it does not pin WHICH order they agree on. Reordering all four identically -
  // exactly the mutation that reintroduces H1 and M1 - leaves them mutually equal and that sentinel
  // green. (The review's mutation table predicted 5 red for that mutation; the real number is 4.)
  // The behavioural tests below do catch it, but D1 ratified a specific ORDER, and a ratified order
  // needs an assertion that fails when it changes.
  it('ADJUDICATION D1: the ratified mount order is exactly flood -> captcha -> per-email -> strict', () => {
    const expected = [loginIpFloodLimit, verifyCaptcha, loginRateLimit, strictLoginRateLimit];
    for (const path of ['/staff/login', '/public/login']) {
      expect(productionMiddleware(path)).toEqual(expected);
    }
    // The MFA step-2 routes carry the same four, then mfaRateLimit.
    for (const path of ['/login/mfa', '/login/mfa-backup']) {
      expect(productionMiddleware(path).slice(0, 4)).toEqual(expected);
    }
  });

  it('sentinel: the captcha is ENFORCED in this file, and the stacks under test are the production stacks', async () => {
    expect(staffLoginStack).toContain(verifyCaptcha);
    expect(staffLoginStack).toEqual(productionMiddleware('/public/login'));
    expect(mfaLoginStack).toEqual(productionMiddleware('/login/mfa-backup'));
    expect((await attempt(fullStack, '10.0.0.1', 'sentinel@gmail.com', PASSWORD_OK, null)).status).toBe(400);
    expect((await attempt(fullStack, '10.0.0.1', 'sentinel@gmail.com', PASSWORD_OK, 'forged')).status).toBe(400);
    expect((await attempt(fullStack, '10.0.0.1', 'sentinel@gmail.com', PASSWORD_OK)).status).toBe(200);
  });

  describe('loginRateLimit — per EMAIL', () => {
    it('AC1 ⛔ two people behind ONE proxy IP get separate budgets', async () => {
      const ip = '141.0.12.87';
      const a = 'ac1-enumerator.a@gmail.com';
      const b = 'ac1-enumerator.b@gmail.com';

      // A: five failures are all answered by the route (401), the sixth is refused.
      expect(await repeat(5, () => attempt(fullStack, ip, a))).toEqual([401, 401, 401, 401, 401]);
      const refused = await attempt(fullStack, ip, a);
      expect(refused.status).toBe(429);
      expect(refused.body).toMatchObject({ code: 'AUTH_RATE_LIMIT_EXCEEDED' });
      expect(warnedWith('auth.rate_limit_exceeded')).toEqual([
        expect.objectContaining({ keyedBy: 'email' }),
      ]);

      // B, same proxy, same window: still reaches the route. Under the old per-IP key this was 429.
      expect((await attempt(fullStack, ip, b)).status).toBe(401);
      expect((await attempt(fullStack, ip, b, PASSWORD_OK)).status).toBe(200);
    });

    it('AC2 ⛔ one email from two IPs shares ONE budget (rotating IPs gains an attacker nothing)', async () => {
      const email = 'ac2-person@gmail.com';
      expect(await repeat(5, () => attempt(fullStack, '10.2.0.1', email))).toEqual([401, 401, 401, 401, 401]);
      expect((await attempt(fullStack, '10.2.0.2', email)).status).toBe(429);
    });

    it('AC3 normalises the email before keying — case and whitespace do not mint a new bucket, whatever the IP', async () => {
      // A different IP per variant, so an IP-keyed limiter could NOT pass this test (review M4).
      const variants = ['AC3-Person@Gmail.com', 'ac3-person@gmail.com', '  ac3-person@gmail.com  ', 'AC3-PERSON@GMAIL.COM', 'ac3-person@gmail.com'];
      expect(await repeat(5, (i) => attempt(fullStack, `10.3.0.${i + 1}`, variants[i]))).toEqual([401, 401, 401, 401, 401]);
      expect((await attempt(fullStack, '10.3.0.9', ' Ac3-Person@gmail.COM')).status).toBe(429);
    });

    it('AC4 falls back to the IP when the body has no email — the real /login/mfa stack', async () => {
      const ip = '10.4.0.1';
      const mfaBody = (from: string) =>
        request(mfaStack).post('/login').set('X-Forwarded-For', from).send({ mfaChallengeToken: 'x', code: '000000', captchaToken: CAPTCHA_OK });
      expect(await repeat(5, () => mfaBody(ip))).toEqual([401, 401, 401, 401, 401]);
      expect((await mfaBody(ip)).status).toBe(429);
      expect(warnedWith('auth.rate_limit_exceeded')).toEqual([expect.objectContaining({ keyedBy: 'ip' })]);
      // A different IP with no email is a different bucket.
      expect((await mfaBody('10.4.0.2')).status).toBe(401);
    });

    it('AC5 successful logins do NOT consume the budget (skipSuccessfulRequests)', async () => {
      const ip = '10.5.0.1';
      const email = 'ac5-person@gmail.com';
      expect(await repeat(10, () => attempt(fullStack, ip, email, PASSWORD_OK))).toEqual(Array(10).fill(200));
      // All five failures still available after ten successes.
      expect(await repeat(5, () => attempt(fullStack, ip, email))).toEqual([401, 401, 401, 401, 401]);
      expect((await attempt(fullStack, ip, email)).status).toBe(429);
    });

    it('AC9 never logs the raw email on a 429', async () => {
      const ip = '10.9.0.1';
      const email = 'ac9-private.person@gmail.com';
      await repeat(6, () => attempt(fullStack, ip, email));
      const logged = JSON.stringify(warn.mock.calls);
      expect(warnedWith('auth.rate_limit_exceeded')).toHaveLength(1);
      expect(logged).not.toContain('ac9-private.person');
    });

    // Review H1. The captcha must sit BEFORE the per-email budget, or anyone who knows an address can hold that
    // person's login shut without solving a single captcha.
    it('⛔ requests without a valid captcha never spend a person\'s budget — a stranger cannot lock someone out for free', async () => {
      const victim = 'h1-victim@gmail.com';
      const attacker = '203.0.113.9';
      expect(await repeat(5, () => attempt(fullStack, attacker, victim, 'x', null))).toEqual(Array(5).fill(400));
      expect(await repeat(5, () => attempt(fullStack, attacker, victim, 'x', 'forged'))).toEqual(Array(5).fill(400));

      // The victim, from their own network, logs in — and still has every one of their five failures.
      expect((await attempt(fullStack, '198.51.100.7', victim, PASSWORD_OK)).status).toBe(200);
      expect(await repeat(5, () => attempt(fullStack, '198.51.100.7', victim))).toEqual([401, 401, 401, 401, 401]);
      expect((await attempt(fullStack, '198.51.100.7', victim)).status).toBe(429);
    });
  });

  describe('loginIpFloodLimit — per IP, 100 / 15 min, ALL responses (the first layer; the only all-response login ceiling)', () => {
    it('AC6 alone: allows 100 requests from one IP, refuses the 101st — even when every email is different (the spray)', async () => {
      const ip = '10.6.0.1';
      const statuses = await repeat(100, (i) => attempt(floodOnly, ip, `ac6-spray-${i}@gmail.com`));
      expect(statuses.filter((s) => s === 429)).toHaveLength(0);

      const refused = await attempt(floodOnly, ip, 'ac6-spray-101@gmail.com');
      expect(refused.status).toBe(429);
      expect(refused.body).toMatchObject({ code: 'AUTH_RATE_LIMIT_EXCEEDED' });
      expect(warnedWith('auth.login_ip_flood_limit_exceeded')).toEqual([
        expect.objectContaining({ keyedBy: 'ip' }),
      ]);

      // Another IP is unaffected.
      expect((await attempt(floodOnly, '10.6.0.2', 'ac6-other@gmail.com')).status).toBe(401);
    });

    it('AC6 alone: counts successful logins too (a flood ceiling counts everything)', async () => {
      const ip = '10.6.1.1';
      const statuses = await repeat(101, (i) => attempt(floodOnly, ip, `ac6-ok-${i}@gmail.com`, PASSWORD_OK));
      expect(statuses.slice(0, 100)).toEqual(Array(100).fill(200));
      expect(statuses[100]).toBe(429);
    });

    // LOAD-BEARING. Strict counts failures only, so SUCCESSFUL request volume from one IP is bounded by nothing
    // but this ceiling. Remove it from the route and request 101 is served.
    it('AC6 load-bearing: through the production stack, 100 successful logins from one IP are served and the 101st is refused by the FLOOD ceiling', async () => {
      const ip = '10.6.2.1';
      const statuses = await repeat(100, (i) => attempt(fullStack, ip, `ac6-stack-${i}@gmail.com`, PASSWORD_OK));
      expect(statuses).toEqual(Array(100).fill(200));

      const refused = await attempt(fullStack, ip, 'ac6-stack-101@gmail.com', PASSWORD_OK);
      expect(refused.status).toBe(429);
      expect(warnedWith('auth.login_ip_flood_limit_exceeded')).toHaveLength(1);
      expect(warnedWith('auth.ip_blocked')).toHaveLength(0);
    });

    it('it counts the requests the captcha refuses, so the hCaptcha verification call is bounded per IP', async () => {
      const ip = '10.6.3.1';
      expect(await repeat(100, (i) => attempt(fullStack, ip, `flood-cap-${i}@gmail.com`, 'x', 'forged'))).toEqual(Array(100).fill(400));
      const refused = await attempt(fullStack, ip, 'flood-cap-ok@gmail.com', PASSWORD_OK);
      expect(refused.status).toBe(429);
      expect(warnedWith('auth.login_ip_flood_limit_exceeded')).toHaveLength(1);
    });
  });

  describe('strictLoginRateLimit — per IP, 60 FAILED / hour', () => {
    it('AC7 successes are free: 100 successful logins from one IP, then 60 failures still allowed, the 61st refused — 60 is PINNED here', async () => {
      const ip = '10.7.0.1';
      // In the old all-response mode request 61 was refused whether or not it succeeded.
      expect(await repeat(100, (i) => attempt(strictOnly, ip, `ac7-ok-${i}@gmail.com`, PASSWORD_OK))).toEqual(Array(100).fill(200));
      expect(await repeat(60, (i) => attempt(strictOnly, ip, `ac7-bad-${i}@gmail.com`))).toEqual(Array(60).fill(401));

      const refused = await attempt(strictOnly, ip, 'ac7-bad-61@gmail.com');
      expect(refused.status).toBe(429);
      expect(refused.body).toMatchObject({ code: 'AUTH_IP_BLOCKED' });
      // Failures only are counted now, so "excessive_failures" is TRUE again.
      expect(warnedWith('auth.ip_blocked')).toEqual([
        expect.objectContaining({ keyedBy: 'ip', reason: 'excessive_failures' }),
      ]);

      expect((await attempt(strictOnly, '10.7.0.2', 'ac7-other@gmail.com')).status).toBe(401);
    });

    it('AC7 a failure spray through the production stack is bounded at 60 per IP: request 61 is refused by strict', async () => {
      const ip = '10.7.1.1';
      const statuses = await repeat(61, (i) => attempt(fullStack, ip, `ac7-spray-${i}@gmail.com`));
      expect(statuses.slice(0, 60)).toEqual(Array(60).fill(401));
      expect(statuses[60]).toBe(429);
      expect(warnedWith('auth.ip_blocked')).toHaveLength(1);
    });

    // Review M1. 60 is derived as 3 strangers × 20 failures per person per hour. That holds only if what a person
    // SPENDS of the shared IP budget is capped by their own per-email allowance — i.e. only if their retries into
    // their own 429 are refused BEFORE strict counts them.
    it('⛔ one person\'s refused retries are not charged to their proxy: a stranger on the same IP still logs in', async () => {
      const ip = '10.7.2.1';
      const fumbler = 'm1-fumbler@gmail.com';
      const mine = await repeat(60, () => attempt(fullStack, ip, fumbler));
      expect(mine.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
      expect(mine.slice(5)).toEqual(Array(55).fill(429));
      expect(warnedWith('auth.ip_blocked')).toHaveLength(0);

      expect((await attempt(fullStack, ip, 'm1-stranger@gmail.com', PASSWORD_OK)).status).toBe(200);
      expect((await attempt(fullStack, ip, 'm1-stranger@gmail.com')).status).toBe(401);
    });

    it('captcha failures are not charged to strict either: 30 refused captchas, then the full 60 failures are still available', async () => {
      const ip = '10.7.3.1';
      expect(await repeat(30, (i) => attempt(fullStack, ip, `m1-cap-${i}@gmail.com`, 'x', null))).toEqual(Array(30).fill(400));
      expect(await repeat(60, (i) => attempt(fullStack, ip, `m1-real-${i}@gmail.com`))).toEqual(Array(60).fill(401));
      expect((await attempt(fullStack, ip, 'm1-real-61@gmail.com')).status).toBe(429);
      expect(warnedWith('auth.ip_blocked')).toHaveLength(1);
    });
  });
});
