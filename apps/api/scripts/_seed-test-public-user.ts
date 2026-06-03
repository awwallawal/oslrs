/**
 * Seed (or remove) ONE disposable `public_user` for Story 9-16 magic-link login UAT.
 *
 * WHY: you cannot test magic-link login as a staff/super_admin (the channel is
 * public-only — the service rejects non-public roles). And no production runtime
 * path mints `public_user` rows anymore (wizard makes respondents, not users).
 * So a real end-to-end UAT needs a `public_user` with an inbox you control. This
 * creates exactly one, flagged `is_seeded = true` so it is trivially disposable.
 *
 * The account is PASSWORDLESS by design (`password_hash = NULL`): that is the
 * purest test of magic-link login AND it exercises the 9-16 forward-compat path
 * (loginByMagicLinkToken deliberately has no `passwordHash IS NOT NULL` gate).
 *
 * UAT flow once seeded:
 *   1. Go to /login → "Send me a sign-in link" → enter the seeded email.
 *   2. Open the email (Resend → ImprovMX → your inbox), click the link.
 *   3. On the landing page, click "Continue to sign-in".
 *   4. Expect to land on /dashboard as a public user. That is the review→done signal.
 *
 * SAFETY: writes are gated behind --confirm. Without it, the script prints what
 * it WOULD do and exits 0 (dry-run). Removal is gated behind --remove --confirm.
 *
 * Usage (on the VPS over Tailscale):
 *   tsx scripts/_seed-test-public-user.ts                       # dry-run (default email)
 *   tsx scripts/_seed-test-public-user.ts --confirm             # create akannilawal@gmail.com
 *   tsx scripts/_seed-test-public-user.ts --email you+t@x.com --confirm
 *   tsx scripts/_seed-test-public-user.ts --remove --confirm    # tear it down afterwards
 *   tsx scripts/_seed-test-public-user.ts --help
 *
 * Removal semantics: deletes the account's magic-link tokens, then HARD-deletes
 * the user row IF it never logged in. If the account has audit_logs history
 * (it logged in at least once), the row is SOFT-removed (status='deactivated')
 * instead — audit_logs.actor_id → users.id is NO-ACTION, and the hash-chain
 * forensic trail must not be broken by a cascade delete. Either way the account
 * can no longer sign in.
 *
 * Exit codes: 0 — action completed (or dry-run); 1 — error / prerequisite missing.
 */
import { db } from '../src/db/index.js';
import { users, roles, magicLinkTokens, auditLogs } from '../src/db/schema/index.js';
import { and, eq } from 'drizzle-orm';
import pino from 'pino';

const logger = pino({ name: 'seed-test-public-user' });

const DEFAULT_EMAIL = 'akannilawal@gmail.com';
const FULL_NAME = 'Magic-Link UAT (9-16, disposable)';

const KNOWN_FLAGS: ReadonlySet<string> = new Set(['email', 'confirm', 'remove', 'help']);

interface Args {
  email: string;
  confirm: boolean;
  remove: boolean;
}

export function parseArgs(argv: string[]): Args {
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    if (!KNOWN_FLAGS.has(key)) throw new Error(`Unknown flag --${key}. Run with --help.`);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  const email = typeof flags.email === 'string' ? flags.email.toLowerCase().trim() : DEFAULT_EMAIL;
  return { email, confirm: flags.confirm === true, remove: flags.remove === true };
}

const HELP = `Seed/remove a disposable public_user for Story 9-16 magic-link UAT.

  --email <addr>   Target email (default ${DEFAULT_EMAIL})
  --confirm        Actually perform the write (without it: dry-run)
  --remove         Tear down the seeded account instead of creating it
  --help           Show this message

Examples:
  tsx scripts/_seed-test-public-user.ts                    # dry-run create
  tsx scripts/_seed-test-public-user.ts --confirm          # create
  tsx scripts/_seed-test-public-user.ts --remove --confirm # remove
`;

async function getPublicRoleId(): Promise<string> {
  const role = await db.query.roles.findFirst({ where: eq(roles.name, 'public_user') });
  if (!role) throw new Error("roles row 'public_user' not found — DB not seeded with base roles?");
  return role.id;
}

async function doSeed(email: string, confirm: boolean) {
  const roleId = await getPublicRoleId();
  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });

  if (existing) {
    console.log(`\nAccount ${email} already exists (id ${existing.id}, status ${existing.status}, seeded ${existing.isSeeded}).`);
    if (!confirm) {
      console.log('Dry-run: would ensure role=public_user + status=active. Re-run with --confirm.\n');
      return 0;
    }
    await db
      .update(users)
      .set({ roleId, status: 'active', updatedAt: new Date() })
      .where(eq(users.id, existing.id));
    console.log('Updated → role=public_user, status=active. Ready for magic-link UAT.\n');
    logger.info({ event: 'seed_public_user.updated', email, userId: existing.id });
    return 0;
  }

  if (!confirm) {
    console.log(`\nDry-run: would CREATE passwordless public_user:`);
    console.log(`  email     ${email}`);
    console.log(`  fullName  ${FULL_NAME}`);
    console.log(`  role      public_user`);
    console.log(`  status    active`);
    console.log(`  password  (none — magic-link only)`);
    console.log(`  isSeeded  true (disposable)`);
    console.log('\nRe-run with --confirm to create.\n');
    return 0;
  }

  const [created] = await db
    .insert(users)
    .values({
      email,
      passwordHash: null, // passwordless — magic-link only; exercises 9-16 forward-compat
      fullName: FULL_NAME,
      roleId,
      status: 'active',
      isSeeded: true,
    })
    .returning({ id: users.id });

  console.log(`\n✅ Created passwordless public_user ${email} (id ${created.id}).`);
  console.log('   Now run the UAT: /login → "Send me a sign-in link" → check inbox → Confirm → /dashboard.\n');
  logger.info({ event: 'seed_public_user.created', email, userId: created.id });
  return 0;
}

async function doRemove(email: string, confirm: boolean) {
  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!existing) {
    console.log(`\nNo account ${email} found — nothing to remove.\n`);
    return 0;
  }
  if (!existing.isSeeded) {
    throw new Error(`Refusing to remove ${email}: is_seeded is FALSE (not a disposable UAT account). Manual action required.`);
  }

  if (!confirm) {
    console.log(`\nDry-run: would remove seeded account ${email} (id ${existing.id}) + its magic-link tokens.`);
    console.log('Re-run with --remove --confirm.\n');
    return 0;
  }

  // 1. Always clear the account's magic-link tokens (keyed by email; userId null).
  await db.delete(magicLinkTokens).where(eq(magicLinkTokens.email, email));

  // 2. Hard-delete only if no audit history references the user (never logged in).
  //    audit_logs.actor_id → users.id is NO-ACTION: a delete would FK-block, and
  //    we must NOT break the forensic hash-chain. Soft-deactivate in that case.
  const auditRefs = await db
    .select({ id: auditLogs.id })
    .from(auditLogs)
    .where(eq(auditLogs.actorId, existing.id))
    .limit(1);

  if (auditRefs.length === 0) {
    await db.delete(users).where(and(eq(users.id, existing.id), eq(users.isSeeded, true)));
    console.log(`\n✅ Hard-deleted seeded account ${email} (no audit history).\n`);
    logger.info({ event: 'seed_public_user.removed_hard', email, userId: existing.id });
  } else {
    await db
      .update(users)
      .set({ status: 'deactivated', updatedAt: new Date() })
      .where(eq(users.id, existing.id));
    console.log(`\n✅ Soft-removed ${email}: status=deactivated (audit history preserved — cannot sign in).\n`);
    logger.info({ event: 'seed_public_user.removed_soft', email, userId: existing.id });
  }
  return 0;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help')) {
    console.log(HELP);
    process.exit(0);
  }
  const args = parseArgs(argv);
  const code = args.remove ? await doRemove(args.email, args.confirm) : await doSeed(args.email, args.confirm);
  process.exit(code);
}

if (!process.env.VITEST) {
  main().catch((err) => {
    logger.error({ event: 'seed_public_user.fatal', error: (err as Error).message });
    console.error(`FATAL: ${(err as Error).message}`);
    process.exit(1);
  });
}
