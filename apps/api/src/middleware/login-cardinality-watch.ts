/**
 * Story 13-68 R2b (built 2026-10-15) — Redis + Express wiring for the login cardinality monitor.
 * The rule and the decision path are in `lib/login-cardinality.ts`.
 *
 * MOUNTED LAST on the two password-login routes, immediately before the controller, so the only
 * requests it ever sees are ones every limiter and the captcha let through. The limiter marker is
 * still checked on the response, because the account-lock 429 comes from the controller and a
 * limiter's 429 must never be mistaken for it.
 *
 * ⚠️ OBSERVABILITY NEVER SITS IN FRONT OF A LOGIN (the registration-burst rule): it calls `next()`
 * first and does all its work after the response has finished, fire-and-forget with its own catch.
 * A slow or unreachable Redis costs the person logging in nothing.
 */
import type { Request, Response, NextFunction } from 'express';
import pino from 'pino';
import { getRedisClient } from '../lib/redis.js';
import { sendTelegramMessage } from '../services/alerting/telegram-channel.js';
import {
  LOGIN_CARDINALITY,
  classifyLoginResponse,
  normaliseLoginEmail,
  observeLoginOutcome,
  type CardinalityStore,
} from '../lib/login-cardinality.js';
import { isTestMode } from './login-rate-limit.js';

const logger = pino({ name: 'login-cardinality-watch' });

/** `mon:login-card:<ip>:<YYYY-MM-DDTHH>` + `:emails` (HyperLogLog) / `:counts` (hash) / `:alerted`. */
const KEY_PREFIX = 'mon:login-card:';

export function createRedisCardinalityStore(): CardinalityStore {
  const redis = getRedisClient();
  return {
    async record(ip, hour, email, outcome) {
      const base = `${KEY_PREFIX}${ip}:${hour}`;
      const ttl = LOGIN_CARDINALITY.bucketTtlSeconds;
      const res = await redis
        .multi()
        .pfadd(`${base}:emails`, email)
        .hincrby(`${base}:counts`, outcome === 'failure' ? 'failures' : 'successes', 1)
        .expire(`${base}:emails`, ttl)
        .expire(`${base}:counts`, ttl)
        .pfcount(`${base}:emails`)
        .hgetall(`${base}:counts`)
        .exec();
      const distinct = Number(res?.[4]?.[1] ?? 0);
      const counts = (res?.[5]?.[1] ?? {}) as Record<string, string>;
      return {
        distinctEmails: distinct,
        failures: Number(counts.failures ?? 0),
        successes: Number(counts.successes ?? 0),
      };
    },
    async claimAlert(ip, hour) {
      const set = await redis.set(`${KEY_PREFIX}${ip}:${hour}:alerted`, '1', 'EX', LOGIN_CARDINALITY.bucketTtlSeconds, 'NX');
      return set === 'OK';
    },
  };
}

let store: CardinalityStore | null = null;

/** Test seam: the binding tests inject an in-memory store and a recording `send`. */
let deps: { store: () => CardinalityStore | null; send: (text: string) => Promise<boolean> } = {
  store: () => {
    if (isTestMode()) return null;
    store ??= createRedisCardinalityStore();
    return store;
  },
  send: (text) => sendTelegramMessage(text),
};

export function __setLoginCardinalityDepsForTest(next: typeof deps): void {
  deps = next;
}

export function loginCardinalityWatch(req: Request, res: Response, next: NextFunction): void {
  res.on('finish', () => {
    const outcome = classifyLoginResponse(res.statusCode, res.locals.rateLimitRefusedBy);
    if (outcome === 'ignore') return;
    const email = normaliseLoginEmail((req.body as { email?: unknown } | undefined)?.email);
    const ip = req.ip;
    const s = deps.store();
    if (!email || !ip || !s) return;
    observeLoginOutcome({ store: s, send: deps.send }, { ip, email, outcome })
      .then(({ counts, alerted }) => {
        if (alerted) logger.warn({ event: 'auth.login_cardinality_alert', ip, ...counts });
      })
      .catch((err: Error) => logger.warn({ event: 'auth.login_cardinality_watch_failed', error: err.message }));
  });
  next();
}
