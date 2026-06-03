/**
 * Read-only audit of `public_user` accounts (Story 9-16 magic-link login UAT aid).
 *
 * WHY: magic-link login (`POST /auth/magic/login`) is PUBLIC-ONLY — it rejects
 * any non-`public_user` role. AND no production runtime path currently mints
 * `public_user` rows (legacy `/auth/public/register` + Google OAuth retired in
 * 9-12; the wizard creates `respondents`, not `users`). So the live audience for
 * magic-link login is the pre-9-12 legacy public_user cohort plus any seeded
 * accounts. This script tells you exactly who that is — i.e. who can actually
 * exercise the channel today.
 *
 * SAFE: read-only. No writes, no mutations. Run anytime, anywhere.
 *
 * Usage (on the VPS over Tailscale, where the DB is reachable on localhost):
 *   cd /var/www/oslsr && pnpm --filter @oslsr/api exec tsx scripts/_list-public-users.ts
 *   # or from the apps/api dir:
 *   tsx scripts/_list-public-users.ts
 *
 * Exit codes:
 *   0 — query ran (even if zero rows)
 *   1 — DB/connection error
 */
import { db } from '../src/db/index.js';
import { users, roles } from '../src/db/schema/index.js';
import { eq } from 'drizzle-orm';
import pino from 'pino';

const logger = pino({ name: 'list-public-users' });

async function main() {
  const rows = await db
    .select({
      email: users.email,
      status: users.status,
      authProvider: users.authProvider,
      mfaEnabled: users.mfaEnabled,
      hasPassword: users.passwordHash, // selected only to derive a boolean below
      isSeeded: users.isSeeded,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(eq(roles.name, 'public_user'));

  console.log(`\npublic_user accounts: ${rows.length}\n`);
  if (rows.length === 0) {
    console.log('  (none) — no account can use magic-link login until a public_user exists.');
    console.log('  Seed a disposable one with: tsx scripts/_seed-test-public-user.ts --confirm\n');
    process.exit(0);
  }

  // "Loginable" = status the account-state gate in loginByMagicLinkToken lets
  // through (NOT suspended/deactivated, NOT locked). active/verified pass.
  const loginableStatuses = new Set(['active', 'verified']);

  console.log(
    '  ' +
      'email'.padEnd(34) +
      'status'.padEnd(14) +
      'auth'.padEnd(9) +
      'mfa'.padEnd(5) +
      'pwd'.padEnd(5) +
      'seed'.padEnd(6) +
      'magic-link?',
  );
  console.log('  ' + '-'.repeat(92));
  for (const r of rows) {
    const canMagicLink = loginableStatuses.has(r.status) ? 'YES' : 'no (status gate)';
    console.log(
      '  ' +
        r.email.padEnd(34) +
        r.status.padEnd(14) +
        r.authProvider.padEnd(9) +
        (r.mfaEnabled ? 'on' : 'off').padEnd(5) +
        (r.hasPassword ? 'yes' : 'no').padEnd(5) +
        (r.isSeeded ? 'yes' : 'no').padEnd(6) +
        canMagicLink,
    );
  }

  const loginable = rows.filter((r) => loginableStatuses.has(r.status)).length;
  const googleOnly = rows.filter((r) => r.authProvider === 'google' && !r.hasPassword).length;
  console.log(
    `\n  ${loginable}/${rows.length} can sign in via magic-link today.` +
      (googleOnly > 0
        ? ` ${googleOnly} are legacy Google-only (passwordless) — magic-link is now their only path.`
        : ''),
  );
  console.log('');
  process.exit(0);
}

if (!process.env.VITEST) {
  main().catch((err) => {
    logger.error({ event: 'list_public_users.fatal', error: (err as Error).message });
    console.error(`FATAL: ${(err as Error).message}`);
    process.exit(1);
  });
}
