/**
 * Operator-gated smoke test for the enumerator submission path.
 *
 * Fires N concurrent synthetic submissions through `POST /api/v1/forms/submissions`
 * as a real enumerator user (signed JWT via TokenService), then verifies each
 * resulting `submissions` + `respondents` + `audit_logs` row landed correctly.
 *
 * Purpose: scale-test the enumerator code path before field deployment. At time
 * of authoring (2026-05-31), only ONE production enumerator submission has
 * exercised this path — empirically clean (0 hemorrhage), but sample-size-1.
 * Operator plans to push 50+ enumerators to field this week; this script
 * catches scale-1-to-scale-N surprises while they're cheap.
 *
 * Synthetic data discipline:
 *   - NIN starts with `99999...` (real NIMC NINs don't; safe collision-free)
 *   - email is `smoketest-<timestamp>-<n>@oslsr-test.invalid` (RFC 6761 reserved)
 *   - phone uses the +234800-test-prefix pattern (E.164 valid but obviously synthetic)
 *   - fullName: `Smoke Test Enumerator #<n>` (clearly synthetic)
 *
 * Cleanup discipline:
 *   - Default --cleanup deletes synthetic submissions + respondents POST-VERIFY
 *   - audit_logs entries are PRESERVED (hash-chain integrity + forensic trail)
 *   - --no-cleanup leaves rows for manual inspection
 *
 * Usage:
 *   tsx scripts/_enumerator-path-smoke-test.ts --help
 *   tsx scripts/_enumerator-path-smoke-test.ts --dry-run --count 5
 *   tsx scripts/_enumerator-path-smoke-test.ts --confirm-i-am-not-dry-running --count 5
 *   tsx scripts/_enumerator-path-smoke-test.ts --confirm-i-am-not-dry-running --count 10 --enumerator-id <uuid>
 *
 * Exit codes:
 *   0 — all submissions landed + verified
 *   1 — config error, prerequisite failure, or any verification failure
 */
import os from 'node:os';
import { uuidv7 } from 'uuidv7';
import { db } from '../src/db/index.js';
import { users, roles, respondents, submissions, auditLogs } from '../src/db/schema/index.js';
import { TokenService } from '../src/services/token.service.js';
import { and, eq, inArray, sql } from 'drizzle-orm';
import pino from 'pino';

const logger = pino({ name: 'enumerator-smoke-test' });

const KNOWN_FLAGS: ReadonlySet<string> = new Set([
  'dry-run',
  'confirm-i-am-not-dry-running',
  'count',
  'target-host',
  'enumerator-id',
  'no-cleanup',
  'help',
]);

const HELP_TEXT = `Usage: tsx scripts/_enumerator-path-smoke-test.ts [options]

Options:
  --dry-run                         Mandatory first invocation; prints payload structure, no POSTs
  --confirm-i-am-not-dry-running    Required for live run
  --count <N>                       Number of concurrent submissions (default 5, max 20)
  --target-host <url>               API base URL (default http://localhost:3000)
  --enumerator-id <uuid>            Override enumerator user (default: first active enumerator)
  --no-cleanup                      Skip post-verify cleanup of synthetic rows
  --help                            Show this message and exit

Synthetic data convention:
  NIN starts with 99999 (real NINs never do)
  email uses .invalid TLD (RFC 6761 reserved)
  fullName is "Smoke Test Enumerator #<n>"

Cleanup deletes synthetic submissions + respondents but PRESERVES audit_logs
entries (chain integrity + forensic trail of the smoke test itself).
`;

interface Args {
  dryRun: boolean;
  confirmLive: boolean;
  count: number;
  targetHost: string;
  enumeratorId: string | null;
  cleanup: boolean;
}

export function parseArgs(argv: string[]): Args {
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    if (!KNOWN_FLAGS.has(key)) {
      throw new Error(`Unknown flag --${key}. Run with --help.`);
    }
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }

  const countRaw = flags.count;
  const count = typeof countRaw === 'string' ? Number(countRaw) : 5;
  if (!Number.isFinite(count) || count < 1 || count > 20) {
    throw new Error(`--count must be 1-20 (got ${String(countRaw)})`);
  }

  return {
    dryRun: flags['dry-run'] === true,
    confirmLive: flags['confirm-i-am-not-dry-running'] === true,
    count,
    targetHost: typeof flags['target-host'] === 'string' ? flags['target-host'] : 'http://localhost:3000',
    enumeratorId: typeof flags['enumerator-id'] === 'string' ? flags['enumerator-id'] : null,
    cleanup: flags['no-cleanup'] !== true,
  };
}

/**
 * Computes the 11th-digit Modulus-11 checksum for a 10-digit prefix.
 * Weights: 10, 9, 8, 7, 6, 5, 4, 3, 2, 1 (per Nigerian NIN spec).
 */
export function modulus11Checksum(tenDigits: string): number {
  if (!/^\d{10}$/.test(tenDigits)) {
    throw new Error('modulus11Checksum requires exactly 10 digits');
  }
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += Number(tenDigits[i]) * (10 - i);
  }
  const remainder = sum % 11;
  return remainder === 10 ? 0 : remainder;
}

/**
 * Synthetic NIN: 99999 + 5-digit sequence + checksum.
 * Real NIMC NINs do not start with 99999, so collision risk is zero.
 */
export function generateSyntheticNin(seq: number): string {
  const seqPadded = String(seq).padStart(5, '0');
  const prefix = `99999${seqPadded}`;
  const check = modulus11Checksum(prefix);
  return `${prefix}${check}`;
}

interface SyntheticPayload {
  submissionId: string;
  nin: string;
  email: string;
  phone: string;
  fullName: string;
  formData: {
    submissionId: string;
    formId: string;
    responses: Record<string, unknown>;
    submittedAt: string;
    gpsLatitude: number;
    gpsLongitude: number;
    completionTimeSeconds: number;
  };
}

function buildPayload(seq: number, formId: string, lgaId: string | null, runStamp: number): SyntheticPayload {
  const submissionId = uuidv7();
  const nin = generateSyntheticNin(seq);
  const email = `smoketest-${runStamp}-${seq}@oslsr-test.invalid`;
  const phone = `+23480000${String(runStamp % 10000).padStart(4, '0')}`.slice(0, 14) +
    String(seq).padStart(2, '0');
  const fullName = `Smoke Test Enumerator #${seq}`;

  return {
    submissionId,
    nin,
    email,
    phone,
    fullName,
    formData: {
      submissionId,
      formId,
      responses: {
        nin,
        fullName,
        firstName: 'Smoke',
        lastName: `Test${seq}`,
        dateOfBirth: '1990-01-15',
        gender: 'male',
        phone,
        email,
        lgaId: lgaId ?? 'atiba',
        consentMarketplace: true,
        consentEnriched: false,
      },
      submittedAt: new Date().toISOString(),
      gpsLatitude: 7.39,
      gpsLongitude: 3.89,
      completionTimeSeconds: 120,
    },
  };
}

async function findEnumerator(override: string | null): Promise<{ id: string; email: string; lgaId: string | null }> {
  if (override) {
    const u = await db.query.users.findFirst({
      where: eq(users.id, override),
      columns: { id: true, email: true, lgaId: true },
    });
    if (!u) throw new Error(`--enumerator-id ${override} not found in users table`);
    return u;
  }
  const rows = await db
    .select({ id: users.id, email: users.email, lgaId: users.lgaId })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(and(eq(roles.name, 'enumerator'), eq(users.status, 'active')))
    .limit(1);
  if (rows.length === 0) {
    throw new Error('No active enumerator user found. Create one via /staff invite UI first, OR pass --enumerator-id <uuid>.');
  }
  return rows[0];
}

async function fetchActiveFormId(targetHost: string): Promise<string> {
  const res = await fetch(`${targetHost}/api/v1/forms/public-active`);
  if (!res.ok) {
    throw new Error(`Could not fetch active form: HTTP ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { data?: { id?: string } };
  const formId = json.data?.id;
  if (!formId) throw new Error(`Active form response missing data.id: ${JSON.stringify(json)}`);
  return formId;
}

async function fireSubmission(
  targetHost: string,
  jwt: string,
  payload: SyntheticPayload,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(`${targetHost}/api/v1/forms/submissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload.formData),
  });
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = await res.text();
  }
  return { ok: res.ok, status: res.status, body };
}

interface VerifyResult {
  submissionUid: string;
  submissionRowFound: boolean;
  respondentRowFound: boolean;
  rawDataNonEmpty: boolean;
  auditRowFound: boolean;
}

async function verifySubmission(submissionUid: string): Promise<VerifyResult> {
  const subRow = await db.query.submissions.findFirst({
    where: eq(submissions.submissionUid, submissionUid),
  });

  if (!subRow) {
    return { submissionUid, submissionRowFound: false, respondentRowFound: false, rawDataNonEmpty: false, auditRowFound: false };
  }

  const respondentRowFound = subRow.respondentId !== null;
  const rawDataNonEmpty = subRow.rawData !== null && Object.keys(subRow.rawData as Record<string, unknown>).length > 0;

  const auditMatches = await db
    .select({ id: auditLogs.id })
    .from(auditLogs)
    .where(eq(auditLogs.targetId, subRow.id))
    .limit(1);

  return {
    submissionUid,
    submissionRowFound: true,
    respondentRowFound,
    rawDataNonEmpty,
    auditRowFound: auditMatches.length > 0,
  };
}

async function cleanupSynthetic(submissionUids: string[]): Promise<{ deletedSubmissions: number; deletedRespondents: number }> {
  if (submissionUids.length === 0) return { deletedSubmissions: 0, deletedRespondents: 0 };

  const subRows = await db
    .select({ id: submissions.id, respondentId: submissions.respondentId })
    .from(submissions)
    .where(inArray(submissions.submissionUid, submissionUids));

  const respondentIds = subRows.map((r) => r.respondentId).filter((id): id is string => id !== null);
  const submissionIds = subRows.map((r) => r.id);

  const deletedSubs = submissionIds.length > 0
    ? await db.delete(submissions).where(inArray(submissions.id, submissionIds))
    : null;

  let deletedResps = 0;
  if (respondentIds.length > 0) {
    const ninFilter = sql`${respondents.nin} LIKE '99999%'`;
    await db
      .delete(respondents)
      .where(and(inArray(respondents.id, respondentIds), ninFilter));
    deletedResps = respondentIds.length;
  }

  void deletedSubs;
  return { deletedSubmissions: submissionIds.length, deletedRespondents: deletedResps };
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.length === 0) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const args = parseArgs(argv);

  if (!args.dryRun && !args.confirmLive) {
    console.error('ERROR: pass --dry-run (mandatory first) or --confirm-i-am-not-dry-running.');
    process.exit(1);
  }

  const enumerator = await findEnumerator(args.enumeratorId);
  logger.info({ event: 'enumerator_smoke.user_selected', userId: enumerator.id, email: enumerator.email });

  const formId = await fetchActiveFormId(args.targetHost);
  logger.info({ event: 'enumerator_smoke.form_resolved', formId });

  const runStamp = Date.now();
  const payloads = Array.from({ length: args.count }, (_, i) => buildPayload(i + 1, formId, enumerator.lgaId, runStamp));

  if (args.dryRun) {
    console.log(`\n[DRY-RUN] Would fire ${args.count} concurrent submissions as enumerator ${enumerator.email} (${enumerator.id})`);
    console.log(`  Target: ${args.targetHost}/api/v1/forms/submissions`);
    console.log(`  Form:   ${formId}`);
    console.log(`  Run stamp: ${runStamp}`);
    console.log('\n  Synthetic payload preview (n=1):');
    console.log(JSON.stringify(payloads[0], null, 2).replace(/^/gm, '    '));
    console.log(`\n  Cleanup mode: ${args.cleanup ? 'ENABLED' : 'DISABLED'}`);
    console.log('\n[DRY-RUN] Nothing sent. To run live, re-invoke with --confirm-i-am-not-dry-running.\n');
    process.exit(0);
  }

  const { token: jwt } = TokenService.generateAccessToken({
    id: enumerator.id,
    role: 'enumerator',
    lgaId: enumerator.lgaId ?? undefined,
    email: enumerator.email,
  } as Parameters<typeof TokenService.generateAccessToken>[0]);

  const operatorHost = os.hostname();
  logger.info({
    event: 'enumerator_smoke.firing',
    count: args.count,
    targetHost: args.targetHost,
    enumeratorId: enumerator.id,
    operatorHost,
  });

  const startedAt = Date.now();
  const postResults = await Promise.all(payloads.map((p) => fireSubmission(args.targetHost, jwt, p)));
  const postElapsedMs = Date.now() - startedAt;

  console.log(`\nPOST phase: ${args.count} concurrent submissions in ${postElapsedMs}ms\n`);
  postResults.forEach((r, i) => {
    const tag = r.ok ? '✅' : '❌';
    console.log(`  ${tag} #${i + 1} HTTP ${r.status} ${r.ok ? '' : JSON.stringify(r.body).slice(0, 120)}`);
  });

  const failedPosts = postResults.filter((r) => !r.ok).length;

  // Allow queue worker to drain
  const QUEUE_DRAIN_MS = 8000;
  console.log(`\nWaiting ${QUEUE_DRAIN_MS / 1000}s for queue worker to drain...\n`);
  await new Promise((resolve) => setTimeout(resolve, QUEUE_DRAIN_MS));

  const verifications = await Promise.all(payloads.map((p) => verifySubmission(p.submissionId)));
  console.log('Verification phase:\n');
  console.log('  ' + 'submission_uid'.padEnd(38) + '  sub  resp raw_data  audit');
  console.log('  ' + '-'.repeat(75));
  verifications.forEach((v) => {
    const flag = (ok: boolean) => (ok ? '✅' : '❌');
    console.log(
      `  ${v.submissionUid.padEnd(38)}  ${flag(v.submissionRowFound)}   ${flag(v.respondentRowFound)}    ${flag(v.rawDataNonEmpty)}        ${flag(v.auditRowFound)}`,
    );
  });

  const totalPass = verifications.filter(
    (v) => v.submissionRowFound && v.respondentRowFound && v.rawDataNonEmpty && v.auditRowFound,
  ).length;

  console.log(`\nSummary: ${totalPass}/${args.count} fully verified (POST failures: ${failedPosts})`);

  if (args.cleanup) {
    console.log('\nCleaning up synthetic rows...');
    const { deletedSubmissions, deletedRespondents } = await cleanupSynthetic(payloads.map((p) => p.submissionId));
    console.log(`  Deleted ${deletedSubmissions} submissions row(s), ${deletedRespondents} respondents row(s)`);
    console.log('  audit_logs entries PRESERVED (chain integrity + forensic trail)');
  } else {
    console.log('\n[--no-cleanup] Synthetic rows left in DB for manual inspection.');
  }

  const exitCode = totalPass === args.count && failedPosts === 0 ? 0 : 1;
  console.log(`\nExit code: ${exitCode}\n`);
  process.exit(exitCode);
}

// Only invoke main() when executed directly via tsx. Vitest sets VITEST=true.
if (!process.env.VITEST) {
  main().catch((err) => {
    logger.error({ event: 'enumerator_smoke.fatal', error: (err as Error).message });
    console.error(`FATAL: ${(err as Error).message}`);
    process.exit(1);
  });
}
