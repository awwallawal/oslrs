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

/**
 * Story 13-70 FR1 — reading the FLOOD CEILING's COUNTER VALUE, not "was the request served".
 *
 * "It was served" is consistent with a working decrement AND with one that silently no-ops, so these
 * harnesses read the ceiling's own count instead. `floodProbe` sits directly BEHIND
 * `loginIpFloodLimit` in the real stack and records `req.rateLimit.used` — the number the ceiling's
 * store returned for THIS request, before any downstream limiter has run. A decrement performed by
 * the PREVIOUS request's `finish` listener therefore shows up as a count that does not advance.
 * `markerProbe` is mounted ahead of everything and records `res.locals.rateLimitRefusedBy` as the
 * response finishes, which is the marker itself rather than its effect.
 *
 * ⛔ SCOPE, stated rather than assumed: the store here is the IN-MEMORY one (see the file header),
 * so this proves the PREDICATE WIRING and exercises `MemoryStore.decrement()` — never
 * `rate-limit-redis@4`'s, which is what runs in production. That half is residual R2 of Story 13-70.
 */
const floodUsed: number[] = [];
const refusedBy: Array<string | undefined> = [];

const floodProbe: RequestHandler = (req, _res, next) => {
  floodUsed.push((req as unknown as { rateLimit?: { used?: number } }).rateLimit?.used ?? -1);
  next();
};
const markerProbe: RequestHandler = (_req, res, next) => {
  res.on('finish', () => refusedBy.push(res.locals.rateLimitRefusedBy));
  next();
};

/** `/staff/login` exactly as production mounts it, with the two probes spliced around the ceiling. */
const probedStack = makeApp(markerProbe, staffLoginStack[0]!, floodProbe, ...staffLoginStack.slice(1));
/** `/login/mfa` likewise — it carries the same four, then `mfaRateLimit` mounted LAST. */
const probedMfaStack = makeApp(markerProbe, mfaLoginStack[0]!, floodProbe, ...mfaLoginStack.slice(1));

/**
 * The decrement runs in a `finish` listener — on the SERVER, after the client's response has ended —
 * so a bare `await request(...)` can return before the counter has moved. Every counter-reading test
 * drives its requests through here so the listener has run before the next request increments.
 */
async function repeatSettled(n: number, fn: (i: number) => Promise<{ status: number }>) {
  const statuses: number[] = [];
  for (let i = 0; i < n; i++) {
    statuses.push((await fn(i)).status);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return statuses;
}

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

  /**
   * Story 13-70 FR1 — "a refusal is not a request" (PRD NFR4.4.d).
   *
   * Every incident in this family was a legitimate person, never an attacker: one enumerator mistypes
   * a password five times, and under the old behaviour each of their OWN 429s was charged to the
   * per-IP ceiling their whole proxy shares. Five real attempts plus ninety-five refusals of those
   * attempts is a hundred, and the hundredth locks out everyone behind the same Opera Mini address.
   *
   * ⛔ Option B, ruled by Awwal at adjudication 2026-09-20: the limiters mounted BEHIND the ceiling
   * stamp `res.locals.rateLimitRefusedBy`, and only the ceiling reads it. The rejected Option A
   * (`res.statusCode !== 429`) would also have made the ceiling discount its OWN refusals, which
   * pins `attempts` at `max` and breaks the reopen trigger at `login-rate-limit.ts` exactly when it
   * fires. `verifyCaptcha` deliberately does NOT stamp — its 400 stays counted (AC2).
   */
  describe('FR1 — a refusal is not a request (Story 13-70, AC1/AC2/AC3)', () => {
    beforeEach(() => {
      floodUsed.length = 0;
      refusedBy.length = 0;
    });

  /**
   * ⛔ Story 13-70 R6 — WHAT FR1 COST, MEASURED AND PINNED RATHER THAN DISCOVERED LATER.
   *
   * The PRD's flood-ceiling divergence ruling (2026-09-17) lets login sit at 100/15min while its
   * Tier-1 peers sit at 300, on ONE stated justification: *being mounted ahead of the CAPTCHA, it
   * also bounds the external hCaptcha `siteverify` call and the bcrypt work behind it.*
   *
   * FR1 stopped the ceiling counting downstream 429s — and the mount order is
   * flood → verifyCaptcha → burst → strict, so a request the BURST limiter refuses has ALREADY
   * passed `verifyCaptcha` and already cost a siteverify call. The two halves of that justification
   * therefore moved in opposite directions, and this test records both:
   *
   *   • bcrypt — STRENGTHENED. A request refused by burst never reaches the controller, so it never
   *     reaches bcrypt. Those are exactly the requests that no longer consume the budget.
   *   • siteverify — WEAKENED, and this is the one to read. The ceiling no longer bounds it for a
   *     caller who presents a VALID captcha and is then refused downstream.
   *
   * ⚠️ SCOPE IT HONESTLY: the loop below sends a freshly-valid token every time, which is what the
   * stubbed hCaptcha accepts. In production a token is single-use, so a REUSED or forged one comes
   * back `success: false` → a 400 from `verifyCaptcha` → no marker → counted, which the second
   * assertion pins. The residual exposure is therefore "one solved captcha per unbounded siteverify
   * call", not "free". Whether that matters is exactly what the PRD's undone 2026-10-15 measurement
   * of hCaptcha's own per-IP limit would settle — hence R6 carries that date.
   */
  it('R6 the ceiling no longer bounds siteverify for a captcha-passing request refused downstream', async () => {
    const fetchMock = globalThis.fetch as unknown as { mock: { calls: unknown[] } };

    // (a) VALID captcha, refused by the per-email limiter: every request costs a siteverify call,
    //     and the ceiling does not advance past the sixth.
    const before = fetchMock.mock.calls.length;
    await repeatSettled(40, () => attempt(probedStack, '10.99.0.1', 'r6-valid@gmail.com'));
    expect(fetchMock.mock.calls.length - before).toBe(40);
    expect(Math.max(...floodUsed)).toBe(6);

    // (b) INVALID captcha: `verifyCaptcha` does not stamp, so these ARE counted and the ceiling
    //     still bounds them. This is the half of the justification that survives.
    floodUsed.length = 0;
    const beforeForged = fetchMock.mock.calls.length;
    await repeatSettled(40, (i) => attempt(probedStack, '10.99.1.1', `r6-forged-${i}@gmail.com`, 'x', 'forged'));
    expect(fetchMock.mock.calls.length - beforeForged).toBe(40);
    expect(Math.max(...floodUsed)).toBe(40);
  });

    it('AC3 ⛔ BOTH DIRECTIONS: the ceiling DOES count a genuine 401 and does NOT count a downstream 429', async () => {
      const ip = '10.70.1.1';
      const email = 'fr1-fumbler@gmail.com';

      const mine = await repeatSettled(8, () => attempt(probedStack, ip, email));
      // Five genuine failures reach the route...
      expect(mine.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
      // ...and the next three are refused by loginRateLimit, mounted behind the ceiling.
      expect(mine.slice(5)).toEqual([429, 429, 429]);
      expect(warnedWith('auth.rate_limit_exceeded')).toHaveLength(3);

      // DIRECTION 1 — a 401 MUST advance the count. A credential spray is a stream of 401s; a ceiling
      // that stopped counting them would be disarmed on the one axis that bounds a spray.
      expect(floodUsed.slice(0, 5)).toEqual([1, 2, 3, 4, 5]);
      // DIRECTION 2 — the person's own refusals do not. 6 is reached once and handed straight back,
      // three times over. Without the decrement this reads [6, 7, 8].
      expect(floodUsed.slice(5)).toEqual([6, 6, 6]);

      // The marker itself, not its effect: the three refusals name the limiter that emitted them.
      expect(refusedBy).toEqual([
        undefined, undefined, undefined, undefined, undefined,
        'loginRateLimit', 'loginRateLimit', 'loginRateLimit',
      ]);
    });

    it('AC2 a CAPTCHA 400 IS still counted — the ceiling is what bounds the hCaptcha siteverify call per IP', async () => {
      const ip = '10.70.2.1';
      expect(await repeatSettled(3, (i) => attempt(probedStack, ip, `fr1-cap-${i}@gmail.com`, 'x', 'forged')))
        .toEqual([400, 400, 400]);
      expect((await attempt(probedStack, ip, 'fr1-cap-ok@gmail.com')).status).toBe(401);

      // The fourth request sees 4, not 1 — verifyCaptcha does not stamp the marker.
      expect(floodUsed).toEqual([1, 2, 3, 4]);
      expect(refusedBy).toEqual([undefined, undefined, undefined, undefined]);
    });

    it('AC1 a 429 emitted by strictLoginRateLimit is not counted by the ceiling either', async () => {
      const ip = '10.70.3.1';
      // 60 failures, every one a different email, so the per-EMAIL limiter never binds and the
      // refusals below come from strict.
      const statuses = await repeatSettled(63, (i) => attempt(probedStack, ip, `fr1-spray-${i}@gmail.com`));
      expect(statuses.slice(0, 60)).toEqual(Array(60).fill(401));
      expect(statuses.slice(60)).toEqual([429, 429, 429]);
      expect(warnedWith('auth.ip_blocked')).toHaveLength(3);

      expect(floodUsed.slice(0, 60)).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
      expect(floodUsed.slice(60)).toEqual([61, 61, 61]);
      expect(refusedBy.slice(60)).toEqual([
        'strictLoginRateLimit', 'strictLoginRateLimit', 'strictLoginRateLimit',
      ]);
    });

    it('the ceiling still counts its OWN refusals — the self-skip trap Option A would have introduced', async () => {
      const ip = '10.70.4.1';
      // 100 successful logins fill the ceiling; the 101st is refused BY THE CEILING.
      expect(await repeatSettled(100, (i) => attempt(probedStack, ip, `fr1-own-${i}@gmail.com`, PASSWORD_OK)))
        .toEqual(Array(100).fill(200));
      expect(await repeatSettled(3, (i) => attempt(probedStack, ip, `fr1-own-x${i}@gmail.com`, PASSWORD_OK)))
        .toEqual([429, 429, 429]);

      // The probe sits BEHIND the ceiling, so a request the CEILING itself refuses never reaches it:
      // 100 probe readings, not 103. The count for those three is read from the log line instead —
      // which is `attempts`, the field R1's reopen trigger is written against.
      expect(floodUsed).toHaveLength(100);
      // It stamps its OWN name (the rule is uniform), and ignores only OTHER limiters' refusals —
      // which is exactly why its own three 429s below are still counted.
      expect(refusedBy.slice(100)).toEqual([
        'loginIpFloodLimit', 'loginIpFloodLimit', 'loginIpFloodLimit',
      ]);

      // Nothing stamped the marker, so nothing was given back: the count keeps climbing past `max`
      // and `attempts` keeps meaning "requests from this IP". Under the rejected Option A it would
      // pin at 101 forever, and a spray would be indistinguishable from eleven honest enumerators.
      expect(warnedWith('auth.login_ip_flood_limit_exceeded')).toEqual([
        expect.objectContaining({ keyedBy: 'ip', attempts: 101 }),
        expect.objectContaining({ attempts: 102 }),
        expect.objectContaining({ attempts: 103 }),
      ]);
    });

    /**
     * ⛔ Story 13-70 R3 — RULED AND FIXED (Awwal, 2026-09-20), after the FR1 pass measured it open.
     *
     * AC1 says a 429 from any login limiter is counted by no OTHER limiter on the route. AC3's
     * ruling gave the marker to the ceiling alone, reasoning that mount order covered the rest
     * ("strict never sees burst's refusal"). That is one direction of two. The mirror image was
     * live: `loginRateLimit` is mounted BEFORE `strictLoginRateLimit`, has already incremented when
     * strict answers 429, and its `skipSuccessfulRequests` decrements only on a 2xx.
     *
     * ⭐ WHAT THAT COST, MEASURED ON THIS EXACT SCENARIO BEFORE THE FIX: once strict's 60/IP/hour
     * was spent, an address that had **never been given a single login attempt on that IP** lost
     * its whole 5-failure budget to refusals it did not cause — the sixth request came back stamped
     * `loginRateLimit`. Behind a shared Opera Mini or CGNAT address that is one stranger's traffic
     * closing another stranger's account for the next fifteen minutes, which is this family's
     * defining incident shape.
     */
    it('R3 a 429 from strict does not spend the per-EMAIL budget of whoever happened to send it', async () => {
      const ip = '10.70.5.1';
      await repeatSettled(60, (i) => attempt(probedStack, ip, `fr1-r3-filler-${i}@gmail.com`));
      warn.mockClear();

      // An address that has NEVER been given a single login attempt on this IP.
      const untouched = 'fr1-r3-victim@gmail.com';
      expect(await repeatSettled(6, () => attempt(probedStack, ip, untouched)))
        .toEqual([429, 429, 429, 429, 429, 429]);

      // Every one of the six is STRICT's refusal. Before the fix the sixth read 'loginRateLimit',
      // because the first five had silently eaten this person's budget.
      expect(refusedBy.slice(60)).toEqual(Array(6).fill('strictLoginRateLimit'));
      expect(warnedWith('auth.ip_blocked')).toHaveLength(6);
      expect(warnedWith('auth.rate_limit_exceeded')).toHaveLength(0);

      // ...and the budget is still there: from a DIFFERENT IP, where strict is untouched, the same
      // address gets all five of its failures and is refused on the sixth.
      expect(await repeatSettled(5, () => attempt(probedStack, '10.70.6.1', untouched)))
        .toEqual([401, 401, 401, 401, 401]);
      expect((await attempt(probedStack, '10.70.6.1', untouched)).status).toBe(429);
    });

    /**
     * R3's other leg, and the one AC3's mount-order reasoning could not have covered at all:
     * `mfaRateLimit` is mounted LAST on the two MFA step-2 routes — behind all three login limiters
     * — so its 429 is observed by every one of them.
     */
    it('R3 a 429 from mfaRateLimit is counted by none of the three login limiters', async () => {
      const ip = '10.70.7.1';
      // ⚠️ SUCCESSFUL step-2 verifications, deliberately. `mfaRateLimit` is 10/IP/min counting ALL
      // responses, while the per-email limiter is 5 FAILED/15min — so on a stream of FAILURES the
      // burst limiter refuses at 6 and the MFA limiter is never reached at all. Only successes get
      // past the two failure-counting limiters and let the last one in the chain bind.
      const body = (from: string) =>
        request(probedMfaStack).post('/login').set('X-Forwarded-For', from)
          .send({ mfaChallengeToken: 'x', code: '000000', password: PASSWORD_OK, captchaToken: CAPTCHA_OK });

      const statuses = await repeatSettled(13, () => body(ip));
      expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
      expect(statuses.slice(10)).toEqual([429, 429, 429]);

      // The refusals are the MFA limiter's, and they say so by name.
      expect(refusedBy.slice(10)).toEqual(['mfaRateLimit', 'mfaRateLimit', 'mfaRateLimit']);
      expect(warnedWith('mfa.rate_limit_exceeded')).toHaveLength(3);
      expect(warnedWith('auth.login_ip_flood_limit_exceeded')).toHaveLength(0);
      expect(warnedWith('auth.ip_blocked')).toHaveLength(0);

      // ⛔ THE POINT: the flood ceiling counted the ten requests that reached the route and NONE of
      // the three the MFA limiter refused — 11, reached once and handed back, not 13. This is the
      // leg AC3's mount-order reasoning could not cover, because mfaRateLimit is mounted behind
      // ALL THREE login limiters.
      expect(floodUsed.slice(9)).toEqual([10, 11, 11, 11]);
    });

  });
});
