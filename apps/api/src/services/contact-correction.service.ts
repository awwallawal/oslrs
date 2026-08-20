/**
 * Story 13-51 (AC2.1, AC2.5, AC2.7, AC2.8) — THE one place that corrects a respondent's mistyped
 * contact address and lifts the bounce-suppression it caused.
 *
 * WHY IT IS A SERVICE AND NOT TWO SCRIPTS
 * ---------------------------------------
 * `scripts/correct-respondent-contact-email.ts` (2026-08-06) and the operator UI added by 13-51
 * do the same job for the same reason, and 13-4 AC4.6 is the named precedent for what happens
 * when that logic is copied instead of shared: the two copies of the skip-logic diverged and the
 * divergence was found in production. **Neither caller keeps a private copy of the refusal, the
 * suppression delete, or the audit write.**
 *
 * It takes the `tx` rather than opening its own, so the caller owns the transaction boundary and
 * `logActionTx` — the AWAITABLE sibling — stays inside it. `logAction` is fire-and-forget and a
 * script that exits loses the last row of every batch (13-49 R11).
 *
 * ⛔ IT WRITES EVERY CONTACT SOURCE, NOT `submissions` ALONE — 13-51 AC2.7
 * ------------------------------------------------------------------------
 * The 2026-08-06 script updated `submissions.raw_data->>'email'` and `wizard_drafts.email` only.
 * `respondent-contact.service.ts` resolves an address from THREE sources in a fixed priority, and
 * its own measurement records **45 respondents reachable ONLY via `magic_link_tokens`**. For
 * every one of those people the old correction wrote nothing the resolver would ever read,
 * reported success, and left them exactly as unreachable — [[pattern-ship-a-fix-that-never-fires]]
 * living inside the fix for it. So this updates:
 *
 *   - `submissions.raw_data->>'email'`   (priority 1)
 *   - `magic_link_tokens.email`          (priority 2 — the source the old path missed)
 *   - `users.email`                      (priority 3 — this is a LOGIN IDENTITY; see below)
 *   - `wizard_drafts.email`              (not a resolver source, but it re-seeds one)
 *
 * ✅ AND IT DELIBERATELY DOES NOT TOUCH `campaign_sends`. That ledger records what was actually
 * sent where, and the bounced message really did go to the typo. Correcting a CONTACT RECORD is
 * right; rewriting SEND HISTORY would be falsifying it. The read-back must not treat it as a
 * source either.
 *
 * ⚠️ `users.email` IS A CREDENTIAL. Magic-link is the auth path for public users, so the address
 * IS the login identity. Correcting it is the difference between a citizen who can get back in
 * and one who cannot — but it is also why the clash refusal below is not a nicety.
 *
 * ⚠️ READ-BACK, NOT REPORTED SUCCESS. After the writes it re-resolves the address through the
 * canonical resolver, in the same transaction, and THROWS if the answer is not the new address —
 * [[pattern-a-record-about-the-work-is-not-the-work]], the same discipline
 * `_ops-contact-remediation.ts:175-180` already applies by hand.
 */
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { AuditService, AUDIT_ACTIONS, AUDIT_TARGETS } from './audit.service.js';
import { resolveRespondentContactEmailWith } from './respondent-contact.service.js';
import { toCanonicalEmail } from '../lib/canonical-email.js';

type DbTransaction = Parameters<Parameters<(typeof db)['transaction']>[0]>[0];

/** The contact stores this service is willing to rewrite. `campaign_sends` is NOT one of them. */
export type CorrectableSource = 'submissions' | 'magic_link_tokens' | 'users' | 'wizard_drafts';

export interface CorrectContactEmailInput {
  respondentId: string;
  /** The corrected address. Canonicalised before use — the caller need not pre-normalise. */
  to: string;
  /** The acting user. A CLI passes null; **the UI must not** (13-51 AC2.2). */
  actorId: string | null;
  /** Why this correction is justified. Lands in the audit row and is not optional. */
  reason: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface CorrectContactEmailResult {
  respondentId: string;
  referenceCode: string | null;
  correctedTo: string;
  /** Every distinct stale address found across the contact sources. */
  correctedFrom: string[];
  /** Row counts actually written, per source — "which ones it touched" (AC2.7). */
  sourcesTouched: Record<CorrectableSource, number>;
  /** Addresses whose suppression rows were deleted (the stale ones plus the target). */
  suppressionsLifted: string[];
  /** True when the data was already correct — the audit row is then RETROSPECTIVE. */
  retrospective: boolean;
  /** What the canonical resolver returns after the write. Asserted, not assumed. */
  resolvedAfter: string | null;
}

/**
 * The address already belongs to somebody else. Never silently reassign one (AC2.3) — and NAME
 * the owner (AC2.8), because "address in use" gives an operator nothing to act on.
 */
export class ContactAddressClashError extends Error {
  constructor(
    public readonly attemptedAddress: string,
    public readonly ownerReferenceCode: string | null,
    public readonly ownerKind: 'respondent' | 'user_account',
  ) {
    super(
      `Refusing: ${attemptedAddress} already belongs to ${
        ownerReferenceCode ?? `another ${ownerKind === 'user_account' ? 'account' : 'respondent'}`
      }.`,
    );
    this.name = 'ContactAddressClashError';
  }
}

/** The respondent id does not exist. */
export class RespondentNotFoundError extends Error {
  constructor(public readonly respondentId: string) {
    super(`No respondent with id ${respondentId}.`);
    this.name = 'RespondentNotFoundError';
  }
}

/**
 * The write went in but the canonical resolver still does not return the new address. Loud, and
 * inside the transaction, so the caller's rollback undoes a correction that did not take.
 */
export class ContactCorrectionReadBackError extends Error {
  constructor(
    public readonly expected: string,
    public readonly actual: string | null,
  ) {
    super(
      `READ-BACK MISMATCH — after the correction the canonical resolver returns ` +
        `${actual === null ? '(no address)' : actual}, not ${expected}.`,
    );
    this.name = 'ContactCorrectionReadBackError';
  }
}

/** A plausible-address gate. Deliberately the shape the 2026-08-06 script already refused on. */
export function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export class ContactCorrectionRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContactCorrectionRefusedError';
  }
}

/**
 * Correct one respondent's contact address across every store that holds it, lift the
 * suppressions that address caused, and leave an audit row — all inside the caller's transaction.
 *
 * Idempotent and retrospective-safe: if the data is already correct it still writes the audit row
 * and reports `retrospective: true`. That is how the 2026-08-06 manual prod edit was brought back
 * onto the ledger, and it must keep working.
 */
export async function correctRespondentContactEmail(
  tx: DbTransaction,
  input: CorrectContactEmailInput,
): Promise<CorrectContactEmailResult> {
  const to = toCanonicalEmail(input.to);
  if (!isPlausibleEmail(to)) {
    throw new ContactCorrectionRefusedError(`Refusing: "${input.to}" is not a plausible email address.`);
  }
  if (!input.reason?.trim()) {
    throw new ContactCorrectionRefusedError('Refusing: a correction must state its reason (it is audited).');
  }

  const respondentRows = (await tx.execute(sql`
    SELECT r.id, r.reference_code, r.status, r.user_id
      FROM respondents r
     WHERE r.id = ${input.respondentId}
     LIMIT 1
  `)) as unknown as {
    rows: Array<{ id: string; reference_code: string | null; status: string; user_id: string | null }>;
  };
  const respondent = respondentRows.rows[0];
  if (!respondent) throw new RespondentNotFoundError(input.respondentId);

  // ---------------------------------------------------------------------------------------
  // THE REFUSAL (AC2.3 / AC2.8). Deleting this must red the ROUTE test, not only the script's —
  // that is how 13-51 proves the extraction actually happened ([[pattern-census-counts-sites-not-callers]]).
  // ---------------------------------------------------------------------------------------
  const clash = (await tx.execute(sql`
    SELECT reference_code, kind FROM (
      SELECT r.reference_code AS reference_code, 'respondent' AS kind
        FROM submissions s
        JOIN respondents r ON r.id = s.respondent_id
       WHERE lower(btrim(s.raw_data->>'email')) = ${to}
         AND r.id <> ${respondent.id}
         AND r.status <> 'rolled_back'
      UNION ALL
      SELECT r.reference_code, 'respondent'
        FROM magic_link_tokens m
        JOIN respondents r ON r.id = m.respondent_id
       WHERE lower(btrim(m.email)) = ${to}
         AND r.id <> ${respondent.id}
         AND r.status <> 'rolled_back'
      UNION ALL
      SELECT r.reference_code, 'respondent'
        FROM users u
        JOIN respondents r ON r.user_id = u.id
       WHERE lower(btrim(u.email)) = ${to}
         AND r.id <> ${respondent.id}
         AND r.status <> 'rolled_back'
      UNION ALL
      -- A users row with no respondent behind it is still an owner: the address is a LOGIN
      -- identity, and users.email is UNIQUE, so writing it would fail the constraint anyway.
      -- Refusing by name beats a 23505 the operator cannot read.
      SELECT NULL, 'user_account'
        FROM users u
       WHERE lower(btrim(u.email)) = ${to}
         AND (${respondent.user_id}::uuid IS NULL OR u.id <> ${respondent.user_id}::uuid)
         AND NOT EXISTS (SELECT 1 FROM respondents r2 WHERE r2.user_id = u.id AND r2.id = ${respondent.id})
    ) owners
    LIMIT 1
  `)) as unknown as { rows: Array<{ reference_code: string | null; kind: 'respondent' | 'user_account' }> };

  if (clash.rows.length > 0) {
    const owner = clash.rows[0]!;
    throw new ContactAddressClashError(to, owner.reference_code, owner.kind);
  }

  // ---------------------------------------------------------------------------------------
  // Gather the stale addresses from every source, so the suppression lift and the audit row
  // describe what was actually there rather than what `submissions` happened to hold.
  // ---------------------------------------------------------------------------------------
  const staleRows = (await tx.execute(sql`
    SELECT DISTINCT lower(btrim(email)) AS email FROM (
      SELECT s.raw_data->>'email' AS email
        FROM submissions s
       WHERE s.respondent_id = ${respondent.id}
      UNION ALL
      SELECT m.email FROM magic_link_tokens m WHERE m.respondent_id = ${respondent.id}
      UNION ALL
      SELECT u.email FROM users u WHERE u.id = ${respondent.user_id}::uuid
    ) sources
    WHERE btrim(coalesce(email, '')) <> ''
      AND lower(btrim(email)) <> ${to}
  `)) as unknown as { rows: Array<{ email: string }> };
  const stale = staleRows.rows.map((r) => r.email);

  const sourcesTouched: Record<CorrectableSource, number> = {
    submissions: 0,
    magic_link_tokens: 0,
    users: 0,
    wizard_drafts: 0,
  };

  for (const old of stale) {
    const sub = await tx.execute(sql`
      UPDATE submissions
         SET raw_data = jsonb_set(raw_data, '{email}', ${JSON.stringify(to)}::jsonb)
       WHERE respondent_id = ${respondent.id}
         AND lower(btrim(raw_data->>'email')) = ${old}
    `);
    sourcesTouched.submissions += rowCount(sub);

    const mlt = await tx.execute(sql`
      UPDATE magic_link_tokens
         SET email = ${to}
       WHERE respondent_id = ${respondent.id}
         AND lower(btrim(email)) = ${old}
    `);
    sourcesTouched.magic_link_tokens += rowCount(mlt);

    // `users.email` is the credential. Scoped to THIS respondent's account — never to every row
    // that happens to share the stale address.
    if (respondent.user_id) {
      const usr = await tx.execute(sql`
        UPDATE users
           SET email = ${to}, updated_at = now()
         WHERE id = ${respondent.user_id}::uuid
           AND lower(btrim(email)) = ${old}
      `);
      sourcesTouched.users += rowCount(usr);
    }

    // `wizard_drafts` is keyed BY EMAIL (no respondent_id), so it is matched on the address, as
    // the 2026-08-06 script did. `email` is UNIQUE here: if a draft already holds the corrected
    // address, rewriting the stale one would collide — so the stale draft is dropped instead of
    // renamed, which is what "the corrected address already has a draft" actually means.
    const draftClash = (await tx.execute(sql`
      SELECT 1 AS hit FROM wizard_drafts WHERE lower(btrim(email)) = ${to} LIMIT 1
    `)) as unknown as { rows: Array<{ hit: number }> };
    if (draftClash.rows.length > 0) {
      const del = await tx.execute(sql`DELETE FROM wizard_drafts WHERE lower(btrim(email)) = ${old}`);
      sourcesTouched.wizard_drafts += rowCount(del);
    } else {
      const draft = await tx.execute(sql`
        UPDATE wizard_drafts SET email = ${to} WHERE lower(btrim(email)) = ${old}
      `);
      sourcesTouched.wizard_drafts += rowCount(draft);
    }

    await tx.execute(sql`DELETE FROM email_suppressions WHERE lower(btrim(email)) = ${old}`);
  }

  // The corrected address must not itself be sitting on the suppression list — otherwise the
  // correction "succeeds" and the next blast still skips them.
  await tx.execute(sql`DELETE FROM email_suppressions WHERE lower(btrim(email)) = ${to}`);

  const suppressionsLifted = [...stale, to];
  const retrospective = stale.length === 0;

  await AuditService.logActionTx(tx, {
    actorId: input.actorId,
    action: AUDIT_ACTIONS.OPERATOR_RESPONDENT_EMAIL_CORRECTED,
    targetResource: AUDIT_TARGETS.RESPONDENT,
    targetId: respondent.id,
    details: {
      referenceCode: respondent.reference_code,
      correctedTo: to,
      correctedFrom: stale,
      sourcesTouched,
      suppressionsLifted,
      retrospective,
      reason: input.reason.trim(),
    },
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  // ---------------------------------------------------------------------------------------
  // READ IT BACK through the CANONICAL resolver, in this transaction. A correction that updated
  // a table the resolver does not read is the exact defect AC2.7 exists to kill, and only this
  // assertion can tell the two apart.
  // ---------------------------------------------------------------------------------------
  const after = await resolveRespondentContactEmailWith(tx, respondent.id);
  const resolvedAfter = after ? toCanonicalEmail(after.email) : null;
  if (resolvedAfter !== to) {
    throw new ContactCorrectionReadBackError(to, resolvedAfter);
  }

  return {
    respondentId: respondent.id,
    referenceCode: respondent.reference_code,
    correctedTo: to,
    correctedFrom: stale,
    sourcesTouched,
    suppressionsLifted,
    retrospective,
    resolvedAfter,
  };
}

/** drizzle's execute() returns a driver result whose row count key differs by driver. */
function rowCount(result: unknown): number {
  const r = result as { rowCount?: number | null; rowsAffected?: number | null };
  return r?.rowCount ?? r?.rowsAffected ?? 0;
}
