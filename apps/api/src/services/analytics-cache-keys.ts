/**
 * Analytics Redis cache keys — the ONE place a cached-payload version is bumped.
 *
 * ⚠️ BUMP {@link ANALYTICS_CACHE_VERSION} WHENEVER A CACHED ANALYTICS PAYLOAD'S
 * SHAPE **OR VALUE** CHANGES.
 *
 * ⭐ WHY THIS MODULE EXISTS. `public-insights.service.ts` already carried this
 * rule in a comment above its own `:v2` key (Story 12-4), and it is worth
 * repeating in full because it names both failure modes:
 *
 *   "The cached JSON outlives the deploy by up to CACHE_TTL. A field that the
 *    TYPE declares as always-present but a cached pre-deploy payload lacks is a
 *    `undefined is not an object` on the PUBLIC page for that hour — and the
 *    hour after a deploy is exactly when someone is looking. Equally, a
 *    corrected FIGURE would otherwise stay hidden behind the stale entry while
 *    the correction is announced."
 *
 * That rule was written for ONE key and so was followed for one key. Story 12-6
 * changed the value of five more caches and the SHAPE of a sixth, and none of
 * them was versioned — because the discipline lived in a comment beside a
 * literal rather than in a shared constant. Hence this module: the version is a
 * single symbol every analytics cache composes, so bumping is one edit and
 * forgetting requires ignoring a name that says what it is for.
 *
 * ⚠️ Deploys do NOT flush Redis. The prod instance is a long-lived
 * `unless-stopped` container and the deploy chain never touches it, so a stale
 * entry survives the release that corrected it. The version suffix is the only
 * thing that retires it.
 *
 * ── Version history ─────────────────────────────────────────────────────────
 * v1 — implicit (unversioned keys), everything up to Story 12-5.
 * v2 — Story 12-6, 2026-08-21. Ten rate-bearing aggregates moved from the
 *      submission grain onto the canonical respondent-anchored read, so every
 *      cached figure below changed VALUE (the answer-bearing population 284 →
 *      272), and `ActivationStatusData.totalSubmissions` was renamed to
 *      `totalRespondents`, so the activation payload changed SHAPE. Without the
 *      bump: `/insights` would serve n=284 confidence intervals for an hour
 *      after the fix that narrowed them, the public page's key findings with
 *      it, and `getActivationStatus` would return a cached object whose
 *      `totalRespondents` is `undefined` — which the policy-brief gate then
 *      (correctly) refuses, 400ing a Ministry document on a register of 272.
 */

/** Bump on ANY cached-analytics shape or value change. See the header. */
export const ANALYTICS_CACHE_VERSION = 'v2';

/**
 * Compose a versioned analytics cache key.
 *
 * @param parts key segments, joined with `:` after the `analytics` namespace
 *   and before the version suffix.
 */
export function analyticsCacheKey(...parts: string[]): string {
  return `analytics:${parts.join(':')}:${ANALYTICS_CACHE_VERSION}`;
}

/**
 * The public key-findings bridge — WRITTEN by
 * `SurveyAnalyticsService.getInferentialInsights` and READ by
 * `PublicInsightsService.getPublicKeyFindings`.
 *
 * ⚠️ Two services share this literal, which is exactly why it lives here rather
 * than being typed twice. A version bump on the writer alone would leave the
 * reader looking at a key nothing writes — the public page would silently lose
 * its key findings instead of showing stale ones, which is quieter and worse.
 */
export const PUBLIC_KEY_FINDINGS_CACHE_KEY = analyticsCacheKey('public', 'key-findings');
