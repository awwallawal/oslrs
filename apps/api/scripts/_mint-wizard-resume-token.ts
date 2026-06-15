/**
 * TEST-ONLY — mint a `wizard_resume` magic-link token for a given email.
 *
 * WHY THIS EXISTS (Story 9-57 / AI-Review M1):
 * The wizard's cross-device resume + autosave-across-reload e2e tests
 * (AC5.2a / AC5.2b) need a VALID `wizard_resume` token to drive
 * `GET /registration/draft?token=…`. Tokens are random bytes whose SHA-256
 * hash is all that's persisted — the plaintext lives exactly once, in the
 * email (`magic-link.service.ts`). So an e2e run cannot "know" a token without
 * either an email sink or a minting affordance.
 *
 * DESIGN — zero production attack surface:
 * This is a STANDALONE SCRIPT, never imported by `app.ts`/the router, so it
 * adds NO HTTP route to the running server (unlike a `/test/*` endpoint, which
 * every future security review would have to re-confirm is gated). It calls the
 * REAL `MagicLinkService.issueToken`, so it exercises the genuine issuance path
 * (same hash, same schema, same TTL) and fails LOUD if those internals change.
 * It is invoked by the Playwright `wizard-resume-setup` project (see
 * `apps/web/e2e/wizard-resume.setup.ts`), mirroring the `auth-setup` pattern.
 *
 * SAFETY: refuses to run under NODE_ENV=production (defence-in-depth — there is
 * no legitimate reason to mint test tokens against a prod database).
 *
 * CONTRACT: prints exactly one machine-readable line to STDOUT, prefixed with
 * the `MINT_RESULT=` sentinel followed by JSON — `MINT_RESULT={"email",...}`.
 * The sentinel makes the caller robust to pino's own stdout logging (the
 * magic-link service logs `magic_link.issued` to stdout); the setup project
 * extracts the single `MINT_RESULT=` line and ignores everything else.
 *
 * Usage:
 *   tsx scripts/_mint-wizard-resume-token.ts --email someone@example.test
 *   tsx scripts/_mint-wizard-resume-token.ts --email x@y.test --purpose wizard_resume
 */
import { pool } from '../src/db/index.js';
import { MagicLinkService } from '../src/services/magic-link.service.js';
import type { MagicLinkPurpose } from '../src/db/schema/index.js';

interface Args {
  email?: string;
  purpose: MagicLinkPurpose;
}

export function parseArgs(argv: string[]): Args {
  const args: Args = { purpose: 'wizard_resume' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--email') args.email = argv[++i];
    else if (a === '--purpose') args.purpose = argv[++i] as MagicLinkPurpose;
    else if (a === '--help' || a === '-h') args.email = undefined;
  }
  return args;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('[mint-wizard-resume] REFUSING to run under NODE_ENV=production.');
    process.exit(2);
  }

  const args = parseArgs(process.argv.slice(2));
  if (!args.email) {
    console.error('Usage: tsx scripts/_mint-wizard-resume-token.ts --email <email> [--purpose wizard_resume]');
    process.exit(1);
  }

  const { tokenPlaintext, expiresAt, id } = await MagicLinkService.issueToken({
    email: args.email,
    purpose: args.purpose,
  });

  console.error(
    `[mint-wizard-resume] issued ${args.purpose} token id=${id} for ${args.email} (expires ${expiresAt.toISOString()})`,
  );

  // Sentinel-prefixed result line — machine-parsed by the Playwright setup
  // project, robust to any other stdout noise (e.g. pino's issued-event log).
  process.stdout.write(
    'MINT_RESULT=' +
      JSON.stringify({ email: args.email, token: tokenPlaintext, expiresAt: expiresAt.toISOString() }) +
      '\n',
  );
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[mint-wizard-resume] FAILED:', err);
    try {
      await pool.end();
    } catch {
      /* ignore */
    }
    process.exit(1);
  });
