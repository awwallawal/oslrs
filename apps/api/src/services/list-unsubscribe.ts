import pino from 'pino';
import type { NotificationCategory } from './notification-category.js';
import { signUnsubscribeToken } from './unsubscribe-token.js';

const logger = pino({ name: 'list-unsubscribe' });

/**
 * Story 13-13 (AC3) — the MARKETING categories. ONLY these carry the `List-Unsubscribe` headers;
 * transactional + ops/alert mail (magic-links, password resets, registration-status, NIN reminders,
 * health digests, staff invites, backup reports …) is non-unsubscribable by construction — you don't
 * unsubscribe from a login link or a critical alert.
 *
 * This set is the gate for the whole feature: a category NOT listed here gets NO header, so the
 * unsubscribe inlet is structurally unreachable from transactional mail.
 */
export const MARKETING_CATEGORIES: ReadonlySet<NotificationCategory> = new Set<NotificationCategory>([
  'reengagement-blast',
  'supplemental-survey',
  'thankyou-referral',
]);

export function isMarketingCategory(category?: NotificationCategory): boolean {
  return category !== undefined && MARKETING_CATEGORIES.has(category);
}

/** Support mailbox offered as the `mailto:` unsubscribe option (a monitored inbox, not the no-reply sender). */
const SUPPORT_UNSUBSCRIBE_MAILTO = process.env.UNSUBSCRIBE_MAILTO || 'support@oyoskills.com';

/**
 * Base origin for the one-click https link. In prod nginx proxies /api/* on the same origin.
 *
 * Returns `null` when PUBLIC_APP_URL is unset IN PRODUCTION (code-review AI-3): shipping a
 * List-Unsubscribe header pointing at the dev `http://localhost:5173` fallback would give every
 * marketing recipient a DEAD one-click link (provider POSTs to localhost → no suppression ever
 * recorded), silently breaking one-click compliance. The caller treats null as fail-soft (send
 * WITHOUT the header + warn), mirroring the missing-secret path. In dev/test the localhost fallback
 * is harmless and kept.
 */
function appUrl(): string | null {
  const configured = process.env.PUBLIC_APP_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') return null;
  return 'http://localhost:5173';
}

/**
 * Story 13-13 (AC3/AC4) — build the `List-Unsubscribe` + `List-Unsubscribe-Post` headers for a
 * marketing send to `recipientEmail`, or `undefined` for any non-marketing category (caller attaches
 * nothing). The https link carries a signed per-recipient token so the endpoint can suppress exactly
 * that address (AC6); the mailto is a human fallback.
 *
 * `List-Unsubscribe-Post: List-Unsubscribe=One-Click` opts the https URL into RFC 8058 one-click,
 * which mail clients honour with a background POST (no body needed — the token is in the query).
 */
export function buildListUnsubscribeHeaders(
  category: NotificationCategory | undefined,
  recipientEmail: string,
): Record<string, string> | undefined {
  if (!isMarketingCategory(category)) return undefined;

  // FAIL-SOFT: a missing/broken UNSUBSCRIBE_SECRET must NEVER take down a marketing send. If we
  // can't sign a token we ship the email WITHOUT the header (degraded deliverability hygiene, not a
  // dropped send) and warn loudly so the operator sets the secret (Dev Notes / SEC-3 lesson).
  let token: string;
  try {
    token = signUnsubscribeToken(recipientEmail);
  } catch (err) {
    logger.warn({
      event: 'list_unsubscribe.token_unavailable',
      category,
      reason: err instanceof Error ? err.message : String(err),
      note: 'sending WITHOUT List-Unsubscribe header — set UNSUBSCRIBE_SECRET',
    });
    return undefined;
  }
  const base = appUrl();
  if (!base) {
    // FAIL-SOFT (AI-3): PUBLIC_APP_URL unset in production — a localhost one-click link is worse than
    // none (dead link → broken compliance), so ship without the header + warn the operator.
    logger.warn({
      event: 'list_unsubscribe.public_app_url_unavailable',
      category,
      note: 'sending WITHOUT List-Unsubscribe header — set PUBLIC_APP_URL',
    });
    return undefined;
  }
  const httpsUrl = `${base}/api/v1/unsubscribe?token=${encodeURIComponent(token)}`;
  return {
    'List-Unsubscribe': `<mailto:${SUPPORT_UNSUBSCRIBE_MAILTO}?subject=unsubscribe>, <${httpsUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}
