/**
 * Story 13-70 FR2 — THE ONE PLACE A RATE-LIMIT KEYSPACE IS NAMED.
 *
 * WHY THIS EXISTS
 * ---------------
 * `rate-limit-redis` stores each count at `${prefix}${key}`, so two limiters whose prefix + key can
 * spell the same string are ONE counter incremented by two budgets. That is not a hypothetical:
 * `passwordResetCompletionRateLimit` sat at prefix `rl:password-reset-complete:` and falls back to
 * the key `ip:<addr>`, so it wrote `rl:password-reset-complete:ip:<addr>` — byte for byte the key
 * `passwordResetCompletionIpFloodLimit` writes at prefix `rl:password-reset-complete:ip:`. A
 * 20-per-token budget and a 300-per-IP flood ceiling shared one counter on every request that
 * carried no token, and `POST /auth/reset-password` takes its token from the BODY, which a
 * malformed request can omit.
 *
 * ⚠️ `activationRateLimit` has the IDENTICAL SHAPE and was LATENT, not live — corrected by the
 * adversarial review on 2026-09-20, because the story recorded both as live. Its two routes are
 * `/activate/:token` and `/activate/:token/validate`, so express cannot match them without a token
 * and the IP fallback is unreachable. The distinction is worth keeping: one of these pairs was
 * costing real users a budget and one was a hazard waiting for a refactor, and a record that
 * flattens the two teaches the wrong lesson about how the class is found.
 *
 * ⛔ THE INVARIANT: **no prefix may be a proper prefix of another, and no two may be equal.** It is
 * asserted below AT MODULE LOAD, not only in a test. The values are frozen literals, so the check
 * cannot pass in CI and fail in production — if it throws, it throws on every machine, immediately,
 * with the offending pair named. A test can be deleted or skipped; this cannot.
 *
 * ⚠️ ADDING A LIMITER? Add its prefix HERE and reference it from the limiter. Do not write an
 * `'rl:…'` literal at the limiter site — `rate-limit-prefix-disjointness.test.ts` scans the whole of
 * `apps/api/src` and fails if one appears outside this file. That scan exists because the obvious
 * version of it (look for `prefix:`) missed two of the fourteen files: `import-rate-limit.ts` passes
 * the prefix as a factory argument, `wizard-draft-rate-limit.ts` through a `store(prefix)` helper,
 * and `registration-status.service.ts` is not middleware at all.
 *
 * ⛔ AND THE SCAN MISSED THREE MORE, found by the adversarial review of Story 13-70 (2026-09-20):
 * it matched SINGLE-QUOTED literals only, so three keyspaces written as TEMPLATE literals — across
 * four sites — were invisible to it and were never registered: `rl:reveal:user:` and
 * `rl:reveal:device:` (`middleware/reveal-rate-limit.ts`, three lines from `REVEAL_GLOBAL`, which
 * WAS registered) and `rl:edit-token:` (`services/marketplace-edit.service.ts`, a 3/day/NIN budget,
 * written twice). The census said 31 where the tree held 34, so the module-load invariant below was
 * guaranteeing 31 of 34. That is
 * [[pattern-census-counts-sites-not-callers]] a second time, in the fix written to close it — the
 * first version counted the sites a `prefix:` grep reached, this one counted the sites a
 * single-quote regex reached. The scan now covers `'`, `"` and backticks, stopping at `${`.
 *
 * ⚠️ CHANGING ONE IS A DEPLOY EVENT, not a rename. Counters under the old prefix are orphaned and
 * age out on their own TTL, so whoever was mid-window gets their budget handed back once.
 */

export const RATE_LIMIT_PREFIXES = {
  // --- auth: login (Story 13-68 identity axis, Story 13-70 FR2 disjointness) ---------------------
  /** Per-EMAIL burst budget. Was `rl:login:`, which `rl:login:strict:` nested inside. */
  LOGIN_BURST: 'rl:login:burst:',
  /** Per-IP flood ceiling. Deliberately NOT under `rl:login:` — the burst limiter's IP fallback key
   *  `ip:<addr>` would have collided with a `rl:login:ip:` prefix on every MFA step-2 request. */
  LOGIN_IP_FLOOD: 'rl:login-ip-flood:',
  /** Sustained per-IP failure ceiling. */
  LOGIN_STRICT: 'rl:login:strict:',
  REFRESH: 'rl:refresh:',
  MFA: 'rl:mfa:',
  MAGIC_LINK: 'rl:magic-link:',
  REAUTH: 'rl:reauth:',

  // --- auth: password reset ---------------------------------------------------------------------
  PASSWORD_RESET: 'rl:password-reset:',
  PASSWORD_RESET_COMPLETE_IP: 'rl:password-reset-complete:ip:',
  /** Was `rl:password-reset-complete:`, a LIVE collision with the row above. */
  PASSWORD_RESET_COMPLETE_TOKEN: 'rl:password-reset-complete:token:',

  // --- registration, activation and the public wizard -------------------------------------------
  /** Was `rl:register:`, a proper prefix of `REGISTER_EMAIL`. */
  REGISTER_IP: 'rl:register:ip:',
  REGISTER_EMAIL: 'rl:register:email:',
  ACTIVATION_IP: 'rl:activation:ip:',
  /** Was `rl:activation:`, which the row above nested inside. ⚠️ LATENT, not live — both routes are
   *  `/activate/:token`, so the IP fallback that would spell the collision is unreachable
   *  (corrected by the 13-70 review, 2026-09-20). */
  ACTIVATION_TOKEN: 'rl:activation:token:',
  REGISTRATION_STATUS: 'rl:registration-status:',
  /** Service-layer, not middleware — `registration-status.service.ts`. */
  REGSTATUS_EMAIL: 'rl:regstatus-email:',
  /** Was `rl:wizard-draft:`, a proper prefix of `WIZARD_DRAFT_EMAIL`. */
  WIZARD_DRAFT_IP: 'rl:wizard-draft:ip:',
  WIZARD_DRAFT_EMAIL: 'rl:wizard-draft:email:',

  // --- marketplace ------------------------------------------------------------------------------
  MARKETPLACE_PROFILE: 'rl:marketplace:profile:',
  MARKETPLACE_EDIT_TOKEN_REQUEST: 'rl:marketplace:edit-token-request:',
  MARKETPLACE_EDIT_TOKEN_USE: 'rl:marketplace:edit-token-use:',
  MARKETPLACE_REVEAL_STEP_UP: 'rl:marketplace:reveal-step-up:',
  MARKETPLACE_SEARCH: 'rl:marketplace:search:',
  /** ⚠️ A single shared KEY, not a prefix — the global contact-reveal budget. It is registered here
   *  anyway, because the invariant is about the KEYSPACE, and a prefix that swallowed this key would
   *  be just as wrong as one that swallowed another prefix. */
  REVEAL_GLOBAL: 'rl:reveal:global',
  /** Per-viewer contact-reveal budget, 50/24h. ⛔ Registered 2026-09-20 by the 13-70 review: it sits
   *  THREE LINES from `REVEAL_GLOBAL` in `reveal-rate-limit.ts` and was missed because it is built
   *  in a template literal, which the disjointness scan could not see. */
  REVEAL_USER: 'rl:reveal:user:',
  /** Per-device contact-reveal budget (ENFORCED, bar-raising — the fingerprint is client-supplied
   *  and rotatable). Same omission, same cause. */
  REVEAL_DEVICE: 'rl:reveal:device:',
  /** Marketplace edit-token request budget, 3/day, keyed on NIN — falling back to `rid:<uuid>` when
   *  the respondent has none. ⚠️ The `rid:` discriminator is a KEY SHAPE inside this one keyspace,
   *  NOT a second prefix: registering both would make `rl:edit-token:` a proper prefix of
   *  `rl:edit-token:rid:` and this module would refuse to boot. A NIN is eleven digits and can never
   *  spell `rid:`, so the two shapes cannot collide. Service-layer, not middleware. */
  EDIT_TOKEN: 'rl:edit-token:',

  // --- back-office ------------------------------------------------------------------------------
  MESSAGE: 'rl:message:',
  OPERATIONS_READ: 'rl:operations:read',
  SETTINGS_LIST: 'rl:settings:list',
  SETTINGS_WRITE: 'rl:settings:write',
  IMPORTS_DRY_RUN: 'rl:imports:dry-run:',
  IMPORTS_CONFIRM: 'rl:imports:confirm:',
  IMPORTS_ROLLBACK: 'rl:imports:rollback:',
} as const;

export type RateLimitPrefix = (typeof RATE_LIMIT_PREFIXES)[keyof typeof RATE_LIMIT_PREFIXES];

/**
 * The invariant, as a function so the test can assert it directly against a synthetic set rather
 * than only observing that this module happened to load.
 *
 * Returns the offending pairs; empty means the keyspaces are disjoint.
 */
export function findPrefixCollisions(prefixes: readonly string[]): string[] {
  const offenders: string[] = [];

  for (let i = 0; i < prefixes.length; i++) {
    for (let j = 0; j < prefixes.length; j++) {
      if (i === j) continue;
      const a = prefixes[i]!;
      const b = prefixes[j]!;
      if (a === b) {
        if (i < j) offenders.push(`${a} is registered twice`);
      } else if (b.startsWith(a)) {
        offenders.push(`${a} is a proper prefix of ${b}`);
      }
    }
  }

  return offenders;
}

const collisions = findPrefixCollisions(Object.values(RATE_LIMIT_PREFIXES));
if (collisions.length > 0) {
  throw new Error(
    'RATE_LIMIT_PREFIXES: two rate limiters would share a Redis counter.\n' +
      collisions.map((c) => `  - ${c}`).join('\n') +
      '\nrate-limit-redis stores each count at `${prefix}${key}`, so one budget would be charged for\n' +
      'another limiter\'s traffic. Give the shorter one a distinguishing segment (e.g. `:ip:`,\n' +
      '`:token:`, `:email:`) rather than shortening the longer one.',
  );
}
