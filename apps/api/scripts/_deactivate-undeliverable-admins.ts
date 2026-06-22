/**
 * Stop-the-bleed: deactivate active super_admins whose email can never deliver.
 *
 * WHY: alert.service.ts:402 + backup.worker.ts:199 broadcast every health alert
 * and backup notice to ALL active super_admins. A leaked test admin
 * (`backoffice-activate-…@example.com`) therefore receives every broadcast and
 * HARD-BOUNCES an IANA-reserved domain → Resend bounce-rate damage → suspension.
 *
 * Deactivation (not deletion) is the safe immediate fix: getActiveSuperAdminEmails
 * filters status='active', so flipping to 'inactive' removes the address from BOTH
 * broadcast queries at once — no deploy, no FK risk, reversible.
 *
 * Dry-run by default. Apply with --confirm.
 *
 *   ssh root@oslsr-home-app && cd /root/oslrs
 *   pnpm --filter @oslsr/api tsx scripts/_deactivate-undeliverable-admins.ts            # preview
 *   pnpm --filter @oslsr/api tsx scripts/_deactivate-undeliverable-admins.ts --confirm  # apply
 */
import { db, pool } from '../src/db/index.js';
import { users, roles } from '../src/db/schema/index.js';
import { and, eq, like } from 'drizzle-orm';
import { AuditService } from '../src/services/audit.service.js';

/** Domains / prefixes that can never deliver → bounce-reputation hazards. */
const UNDELIVERABLE_DOMAINS = ['example.com', 'example.org', 'example.net', 'test', 'invalid', 'localhost'];
/** Test-account local-part prefixes seen leaking into prod (superset of cleanup-test-users.ts). */
const TEST_PREFIXES = ['backoffice-activate-', 'activate-', 'perf-', 'nin-test-', 'expiry-', 'test-', 'bulk-', 'import-'];

function isUndeliverable(email: string): boolean {
  const lower = email.toLowerCase();
  const domain = (lower.split('@')[1] || '');
  const domainHit = UNDELIVERABLE_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
  const prefixHit = TEST_PREFIXES.some((p) => lower.startsWith(p));
  return domainHit || prefixHit;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain || local.length <= 2) return email;
  return `${local.slice(0, 1)}***@${domain}`;
}

async function main(): Promise<void> {
  const confirm = process.argv.includes('--confirm');

  const activeSuperAdmins = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(and(eq(roles.name, 'super_admin'), eq(users.status, 'active')));

  const targets = activeSuperAdmins.filter((u) => isUndeliverable(u.email));
  const survivors = activeSuperAdmins.length - targets.length;

  console.log(`\n  Active super_admins: ${activeSuperAdmins.length}`);
  console.log(`  Undeliverable (deactivation targets): ${targets.length}`);
  for (const t of targets) console.log(`    - ${maskEmail(t.email)}  [${t.id}]`);

  if (targets.length === 0) {
    console.log('\n  ✅ Nothing to do — every active super_admin has a deliverable address.\n');
    await pool.end();
    return;
  }

  // Lockout guard — never strip the last real admin.
  if (survivors < 1) {
    console.error('\n  ⛔ ABORT: deactivating these would leave ZERO deliverable super_admins. ' +
      'Create/verify a real super_admin first, then re-run.\n');
    await pool.end();
    process.exit(1);
  }

  if (!confirm) {
    console.log(`\n  DRY RUN — ${targets.length} admin(s) would be deactivated (${survivors} deliverable admin(s) remain).`);
    console.log('  Re-run with --confirm to apply.\n');
    await pool.end();
    return;
  }

  for (const t of targets) {
    await db.update(users).set({ status: 'inactive' }).where(eq(users.id, t.id));
    await AuditService.logAction({
      action: 'admin.deactivated_undeliverable',
      targetResource: 'users',
      targetId: t.id,
      actorId: null,
      details: { email: t.email, reason: 'undeliverable_recipient_resend_reputation_guard' },
    });
    console.log(`  ✔ Deactivated ${maskEmail(t.email)}`);
  }
  console.log(`\n  ✅ Done — ${targets.length} undeliverable super_admin(s) deactivated. Bounce source removed.\n`);
  await pool.end();
}

main().catch((err) => {
  console.error('Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
