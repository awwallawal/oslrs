/**
 * Story 9-63 (Task 7 / AC6) — shared active-super-admin recipient resolver with
 * a reserved/undeliverable-domain filter.
 *
 * Before this story TWO identical `getActiveSuperAdminEmails` implementations
 * existed (`alert.service.ts` + `backup.worker.ts`). On 2026-06-21 a seeded
 * `backoffice-activate-*@example.com` super_admin received every broadcast and
 * HARD-BOUNCED an IANA-reserved domain → Resend reputation/suspension hazard.
 *
 * This single util replaces both copies AND filters out undeliverable recipients
 * (reserved domains + known test-account local-part prefixes) BEFORE any send,
 * so a stray test admin can never again bleed the prod quota or bounce.
 */
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, roles } from '../db/schema/index.js';
import { isUndeliverableRecipient } from './notification-category.js';
import pino from 'pino';

const logger = pino({ name: 'super-admin-recipients' });

/**
 * True iff the address can never deliver (reserved domain) or is a known
 * test-fixture account that must never receive a real send. For super_admin
 * recipients a missing `@` is treated as malformed (drop); the shared
 * `isUndeliverableRecipient` keeps reserved-domain + test-prefix logic in one
 * place (`notification-category.ts`) so the meter abuse signal and this filter
 * never drift.
 */
export function isUndeliverableEmail(email: string): boolean {
  const lower = (email || '').trim().toLowerCase();
  if (!lower.includes('@')) return true; // malformed → drop
  return isUndeliverableRecipient(lower);
}

/**
 * Resolve the set of ACTIVE super_admin email addresses that are SAFE to send to
 * (undeliverable/reserved-domain recipients filtered out). Fail-safe: on a DB
 * error returns `[]` (matches the prior per-copy behaviour — never throw into a
 * send path).
 */
export async function getActiveSuperAdminEmails(): Promise<string[]> {
  try {
    const result = await db
      .select({ email: users.email })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(and(eq(roles.name, 'super_admin'), eq(users.status, 'active')));

    const all = result.map((r) => r.email);
    const deliverable = all.filter((e) => !isUndeliverableEmail(e));

    const dropped = all.length - deliverable.length;
    if (dropped > 0) {
      logger.warn({
        event: 'super_admin_recipients.undeliverable_filtered',
        dropped,
        kept: deliverable.length,
      });
    }

    return deliverable;
  } catch (err) {
    logger.error({ event: 'super_admin_recipients.query_failed', error: (err as Error).message });
    return [];
  }
}
