import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedisClient as getFactoryRedisClient } from '../lib/redis.js';
// Story 13-70 FR3 — `buildLoginRateLimitKey` is the ONE per-email key builder. Not a second hasher.
import {
  buildLoginRateLimitKey,
  isTestMode,
  shouldSkipRateLimit,
  refusedByAnotherLimiter,
  REFUSED_BY_WIZARD_DRAFT_RATE_LIMIT,
  REFUSED_BY_WIZARD_DRAFT_EMAIL_RATE_LIMIT,
} from './login-rate-limit.js';
// Story 13-46 (AC3) — a lost DRAFT looks like a user who "just didn't finish", so this refusal
// counts toward the same turn-away signal as the submit limiter's.
import { recordRegistration429 } from './registration-burst.js';
import pino from 'pino';
import { RATE_LIMIT_PREFIXES } from '../lib/rate-limit-prefixes.js';

const logger = pino({ name: 'wizard-draft-rate-limit' });

const getRedisClient = () => {
  if (isTestMode()) return null;
  return getFactoryRedisClient();
};

/** Shared by both draft limiters so an operator comparing ceilings compares like with like. */
export const WIZARD_DRAFT_WINDOW_MS = 15 * 60 * 1000;

/**
 * PER-IP ceiling — a crude flood-stop only. ⚠️ RAISED 120 → 1,200 BY STORY 13-46 (AC4).
 *
 * WHY THE OLD VALUE HAD TO GO. The 120 was chosen (MR-11, 2026-05-11) with an explicit assumption
 * written beside it: *"Shared NATs (~5 wizards concurrently) stay well inside budget"*. Do the
 * arithmetic that comment invites: 2-second-debounced autosave produces 20-60 saves per session, so
 * 120 ÷ 20-60 is exhausted by roughly **2 to 6 concurrent wizard sessions behind one carrier IP**.
 * Nigerian carriers use CGNAT — that one IP is thousands of subscribers — and a state-wide radio
 * jingle across 11 stations invalidates "~5 concurrent" by construction.
 *
 * This limiter FAILS FIRST and FAILS SILENTLY, which is what makes it more dangerous than the
 * submit limiter: a refused submit produces an error a citizen can report (and one did, on
 * 2026-08-07). A refused autosave just loses the draft, and a lost draft is indistinguishable from
 * a person who lost interest. Nobody reports it; it looks like funnel drop-off.
 *
 * DERIVATION of 1,200: (assumed ~20 concurrent wizard sessions behind one carrier gateway at jingle
 * peak) × (60 saves per session) = 1,200 per 15 min ≈ 80/min.
 * ⚠️ THE 20 IS STILL AN ASSUMPTION. What IS measured (prod, 2026-08-21, AC7):
 * `wizard_draft.rate_limit_exceeded` has fired **zero** times across the full retained log window
 * (2026-08-07 → 2026-08-21). That is NOT evidence the old 120 was safe — daily volume in that window
 * was 1-8 submissions, so the limiter was never under load and the assumption its own comment made
 * ("~5 wizards concurrently per shared NAT") was never tested. It only tells us the raise costs
 * nothing today.
 *
 * FAILS TOWARD: accepting draft-write load from a script. That is the cheap direction — a draft
 * write costs one JSONB row on an endpoint that mints no register records and sends no email,
 * whereas the other direction silently destroys a real citizen's half-finished registration.
 *
 * REOPEN TRIGGER: `wizard_draft.rate_limit_exceeded` appears at all in a jingle window (it should
 * now be effectively unreachable for humans), or draft-table write volume becomes a DB concern.
 */
export const WIZARD_DRAFT_IP_MAX = 1_200;

/**
 * PER-EMAIL ceiling — the control that actually matches the threat, mirroring the 2026-08-07
 * submit-limiter fix. Abuse is one actor hammering; CGNAT makes IP a poor proxy for "one actor",
 * and the draft payload always carries the address the draft belongs to.
 *
 * ⚠️ WHY BOTH DIMENSIONS, NOT JUST THIS ONE. MR-11's original objection to per-email keying was
 * correct and still is: an attacker flooding with random addresses gets a fresh bucket per address.
 * So the per-IP ceiling above stays as the flood-stop and this is the real control — exactly the
 * two-layer arrangement `POST /wizard` already uses.
 *
 * DERIVATION of 300: a 2s debounce is at most ~450 saves in a 15-minute window for someone typing
 * continuously; the observed band is 20-60 per session. 300 sits far above the real band and below
 * the theoretical ceiling, so a human cannot reach it in normal use.
 *
 * FAILS TOWARD: letting one address autosave more than a human plausibly would. Cheap, per above.
 */
export const WIZARD_DRAFT_EMAIL_MAX = 300;

/**
 * The key logic, extracted so it can be TESTED — the same reason
 * `buildRegistrationEmailRateLimitKey` is a separate exported function.
 *
 * Reads the address from the PUT body or the GET query (both endpoints share the limiter), and
 * falls back to the IP so a payload omitting the address cannot bypass the limiter entirely.
 *
 * ⚠️ `ipKeyGenerator` collapses an IPv6 address to its `/56` prefix. Without it a single IPv6
 * subscriber — who is normally handed a whole prefix — mints a fresh bucket per request by rotating
 * their own low bits. The library's `ERR_ERL_KEY_GEN_IPV6` validator is a `toString()` grep over
 * this function's SOURCE looking for `req.ip` without the helper, so it is a lint on spelling, not
 * on behaviour: the unit test asserting two addresses in one /56 collapse to ONE key is the guard.
 */
export function buildWizardDraftRateLimitKey(
  body: { email?: unknown } | undefined,
  query: { email?: unknown } | undefined,
  ip: string | undefined,
): string {
  // ⛔ Story 13-70 FR3 — DELEGATES to the shipped login key builder; it does not re-implement it.
  // This used to return `e:${email}` — the ADDRESS ITSELF as the Redis key, on an unauthenticated
  // endpoint whose body is unvalidated here and capped only by the 1 MB body limit. The shared
  // builder answers `e:<sha256>`: a fixed 64 hex characters, and no plaintext address in the Redis
  // that BullMQ and the sessions share. The `ipKeyGenerator` fallback is the same call it always
  // was, so the /56 collapse tests below still red if it is removed.
  return buildLoginRateLimitKey(readDraftEmail(body, query), ip);
}

/** The normalised address this request is for, or null when it carries none. */
export function readDraftEmail(
  body: { email?: unknown } | undefined,
  query: { email?: unknown } | undefined,
): string | null {
  const email = body?.email ?? query?.email;
  if (typeof email === 'string' && email.trim()) return email.trim().toLowerCase();
  return null;
}

const store = (prefix: string) =>
  isTestMode()
    ? undefined
    : new RedisStore({
        // @ts-expect-error - Known type mismatch with ioredis
        sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
        prefix,
      });

const draftLimitMessage = {
  status: 'error',
  code: 'WIZARD_DRAFT_RATE_LIMIT_EXCEEDED',
  message: 'Too many draft updates from this network. Please slow down and try again.',
};

/**
 * Rate limiter for `PUT/GET /api/v1/registration/draft` — Story 9-12 Task 4.4 server-side wizard
 * draft auto-save + hydration endpoints. Per-IP flood-stop; see `WIZARD_DRAFT_IP_MAX`.
 */
export const wizardDraftRateLimit = rateLimit({
  // Story 13-70 FR2 — was `rl:wizard-draft:`, a proper prefix of `rl:wizard-draft:email:` below.
  // Latent rather than live (this limiter keys on the bare IP, which can never spell `email:…`), but
  // the property AC4 pins is structural: no prefix may be a proper prefix of another, so that no
  // future key SHAPE can turn a latent pair into the activation one.
  store: store(RATE_LIMIT_PREFIXES.WIZARD_DRAFT_IP),
  windowMs: WIZARD_DRAFT_WINDOW_MS,
  max: WIZARD_DRAFT_IP_MAX,
  // ⛔ Story 13-70 R7 — A REFUSAL IS NOT A REQUEST (PRD NFR4.4.d), the same rule the login ceiling
  // got in FR1. `wizardDraftEmailRateLimit` is mounted behind this one and stamps
  // `res.locals.rateLimitRefusedBy` before answering 429; this ceiling hands its own increment back
  // for those requests, so a person who exhausts their own 300-per-email budget and keeps retrying no
  // longer spends the shared per-IP budget on refusals they caused for themselves.
  // `requestWasSuccessful` ALONE IS DEAD CODE — express-rate-limit consults it only when a skip flag
  // is set (8.3.0 dist: `if (config.skipFailedRequests || config.skipSuccessfulRequests)`), which is
  // why `skipFailedRequests` is here; it decrements when the predicate is FALSE, i.e. exactly when
  // another limiter stamped. ⚠️ It also registers `close`/`error` listeners, so an ABORTED request is
  // no longer counted here — Story 13-70 **R4**, open and dated, now covering four more ceilings.
  skipFailedRequests: true,
  requestWasSuccessful: (_req, res) => !refusedByAnotherLimiter(res, REFUSED_BY_WIZARD_DRAFT_RATE_LIMIT),
  message: draftLimitMessage,
  handler: (req, res, next, options) => {
    // Story 13-70 R7 — this ceiling stamps too, even though it is mounted FIRST and nothing ahead of
    // it reads the flag. The rule is uniform on purpose (R3): every limiter declares itself, so a
    // limiter inserted ahead of this one inherits the behaviour instead of silently not having it.
    res.locals.rateLimitRefusedBy = REFUSED_BY_WIZARD_DRAFT_RATE_LIMIT;
    logger.warn({
      event: 'wizard_draft.rate_limit_exceeded',
      ip: req.ip,
      dimension: 'ip',
    });
    recordRegistration429('draft'); // Story 13-46 (AC3 / review A12)
    res.status(429).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
  // realIpMiddleware canonicalises req.ip before this runs, per the same
  // discipline as `magicLinkRateLimit` / `reauthRateLimit`.
  validate: isTestMode() ? false : { xForwardedForHeader: false },
  skip: shouldSkipRateLimit,
});

/**
 * Story 13-46 (AC4) — per-EMAIL draft limiter. Mounted AFTER the per-IP flood-stop on the same
 * routes, so the cheap check runs first (same ordering as `POST /wizard`).
 */
export const wizardDraftEmailRateLimit = rateLimit({
  store: store(RATE_LIMIT_PREFIXES.WIZARD_DRAFT_EMAIL),
  windowMs: WIZARD_DRAFT_WINDOW_MS,
  max: WIZARD_DRAFT_EMAIL_MAX,
  // Destructured, not `req.ip` — see the note on the builder.
  keyGenerator: ({ body, query, ip }) =>
    buildWizardDraftRateLimitKey(
      body as { email?: unknown } | undefined,
      query as { email?: unknown } | undefined,
      ip,
    ),
  message: draftLimitMessage,
  handler: (req, res, next, options) => {
    // Story 13-70 R7 — tell the ceiling mounted ahead of this one that the response is a REFUSAL,
    // not a request. Set before the response is written, because the ceiling reads it from a
    // `finish` listener. ⚠️ This limiter needs no predicate of its own: it is mounted LAST on every
    // route it appears on, so no other limiter's 429 can reach its counter. Mount one behind it and
    // that stops being true — see the R7 block in `login-rate-limit.ts`.
    res.locals.rateLimitRefusedBy = REFUSED_BY_WIZARD_DRAFT_EMAIL_RATE_LIMIT;
    logger.warn({
      event: 'wizard_draft.rate_limit_exceeded',
      ip: req.ip,
      // A5/M2 — this limiter now only RUNS when an address is present, so the dimension it reports
      // is the dimension it actually keyed on. It previously logged 'email' even when the key had
      // fallen back to the IP, which is the one field an operator would use to diagnose it.
      dimension: 'email',
    });
    recordRegistration429('draft'); // Story 13-46 (AC3 / review A12)
    res.status(429).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: isTestMode() ? false : { xForwardedForHeader: false },
  /**
   * Story 13-46 (review A5 / finding M2) — SKIP ENTIRELY WHEN THERE IS NO ADDRESS TO KEY ON.
   *
   * ⚠️ THE BUG: on an address-less request the key fell back to `ip:`, at a ceiling of 300 —
   * FOUR TIMES TIGHTER than the 1,200 per-IP flood-stop mounted immediately before it. So the
   * limiter meant to be the permissive, precise control silently became the binding, blunt one.
   * `GET /draft` is token-only on the magic-link resume path, so resume hydration for an entire
   * carrier gateway shared a 300/15min bucket — and 300 was derived as a PER-PERSON ceiling, never
   * a per-gateway one.
   *
   * This is the identical mechanism the story explicitly and correctly refused for the supplemental
   * route; it rode in silently here, on the limiter the story itself calls the one that "fails FIRST
   * and SILENTLY". The per-IP flood-stop already covers the address-less case.
   */
  skip: (req) =>
    shouldSkipRateLimit() ||
    readDraftEmail(
      req.body as { email?: unknown } | undefined,
      req.query as { email?: unknown } | undefined,
    ) === null,
});
