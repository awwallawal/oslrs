/**
 * Story 9-13 AC#5b — deploy-time MFA grace notification.
 *
 * Sends a one-shot "MFA enrollment required by <date>" email to every
 * super_admin who has `mfa_enabled = false` and is currently inside the grace
 * window (i.e. `mfa_grace_until > NOW()`). Idempotent — running this twice in
 * the same window simply re-sends the reminder; harmless.
 *
 * Run as part of the deploy pipeline AFTER the migration applies:
 *   pnpm --filter @oslsr/api exec tsx scripts/notify-mfa-grace.ts
 *
 * Exit codes:
 *   0  — at least one notification sent (or no eligible users).
 *   1  — email service disabled or DB error.
 */
import { db } from '../src/db/index.js';
import { users, roles } from '../src/db/schema/index.js';
import { eq, and, gt, sql } from 'drizzle-orm';
import { EmailService } from '../src/services/email.service.js';
import pino from 'pino';

const logger = pino({ name: 'notify-mfa-grace' });

const APP_URL = process.env.PUBLIC_APP_URL || 'http://localhost:5173';
const ENROLLMENT_URL = `${APP_URL}/dashboard/super-admin/security/mfa`;
const BRAND = '#9C1E23';

function buildEmail(fullName: string, graceUntilIso: string) {
  const deadline = new Date(graceUntilIso).toUTCString();
  const subject = `MFA enrollment required by ${deadline}`;
  const text = `Hi ${fullName},

For security, super_admin accounts on OSLRS must now enrol in TOTP-based
multi-factor authentication. Please complete enrollment before:

  ${deadline}

After this deadline, login will redirect you to a forced-enrollment page
until you complete setup. To enrol now, sign in and visit:

  ${ENROLLMENT_URL}

You will scan a QR code with an authenticator app (Google Authenticator,
Authy, 1Password, Bitwarden, etc.), then save 8 single-use backup codes.

If you have any questions, reply to this email.

— OSLRS Security`;

  const html = `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px;">
  <h2 style="color:${BRAND};margin:0 0 16px;">MFA enrollment required</h2>
  <p>Hi <strong>${fullName}</strong>,</p>
  <p>For security, super_admin accounts on OSLRS must now enrol in TOTP-based multi-factor authentication.</p>
  <p style="background:#fff8e6;border-left:4px solid #d97706;padding:12px 16px;margin:16px 0;">
    Please complete enrollment before: <strong>${deadline}</strong>
  </p>
  <p>After this deadline, login will redirect you to a forced-enrollment page until you complete setup.</p>
  <p style="margin:24px 0;">
    <a href="${ENROLLMENT_URL}" style="display:inline-block;background:${BRAND};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Enrol now</a>
  </p>
  <p style="color:#555;font-size:14px;">You will scan a QR code with an authenticator app (Google Authenticator, Authy, 1Password, Bitwarden), then save 8 single-use backup codes.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
  <p style="color:#777;font-size:12px;">— OSLRS Security</p>
</body></html>`;

  return { subject, text, html };
}

async function main() {
  if (!EmailService.isEnabled()) {
    logger.error({ event: 'mfa_grace.email_service_disabled' });
    process.exit(1);
  }

  const targets = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      mfaGraceUntil: users.mfaGraceUntil,
    })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(
      and(
        eq(roles.name, 'super_admin'),
        eq(users.status, 'active'),
        eq(users.mfaEnabled, false),
        gt(users.mfaGraceUntil, sql`NOW()`),
      ),
    );

  logger.info({ event: 'mfa_grace.targets', count: targets.length });

  let sent = 0;
  let failed = 0;
  for (const user of targets) {
    if (!user.mfaGraceUntil) continue;
    const email = buildEmail(user.fullName, user.mfaGraceUntil.toISOString());
    const result = await EmailService.sendGenericEmail({
      to: user.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    if (result.success) {
      sent++;
      logger.info({ event: 'mfa_grace.sent', userId: user.id, email: user.email });
    } else {
      failed++;
      logger.error({ event: 'mfa_grace.failed', userId: user.id, error: result.error });
    }
  }

  logger.info({ event: 'mfa_grace.summary', sent, failed, total: targets.length });
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  logger.error({ event: 'mfa_grace.unhandled', error: (err as Error).message });
  process.exit(1);
});
