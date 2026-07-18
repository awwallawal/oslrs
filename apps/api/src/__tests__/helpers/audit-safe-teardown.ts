/**
 * Race-free integration-test teardown for fixtures that fire fire-and-forget
 * audit writes (Story 13-30).
 *
 * WHY THIS EXISTS
 * The audit path is fire-and-forget by design (the 9-26 lesson: comms/audit
 * must never sink a request). A request therefore RESOLVES before its
 * `AuditService.logAction` INSERT has committed — e.g. `auth.login_success`
 * (auth.service.ts) writes `audit_logs.actor_id = <the user>` after the HTTP
 * response is already sent. In an `afterAll` that deletes those test users, an
 * in-flight audit row can land AFTER we delete `audit_logs` but BEFORE we delete
 * `users`, so the users delete violates `audit_logs_actor_id_users_id_fk`
 * (Postgres 23503). Every assertion passed; only the cleanup throws. This
 * intermittently reddened CI and blocked deploys (run 29249011546, 2026-07-13;
 * again on the 13-28 re-push via user.profile.test.ts). `actor_id` is the sole
 * FK from `audit_logs` to `users` (`target_id` has no reference), so the race
 * exists only where a fire-and-forget write carries the deleted user as `actorId`.
 *
 * THE FIX (deterministic, not probabilistic)
 * Because NO HTTP requests run during `afterAll`, the set of in-flight audit
 * writes is finite and monotonically draining. We retry the
 * (delete audit_logs -> delete users) pair inside one transaction; the loop
 * returns ONLY on a clean delete, so it cannot exit while the FK race is still
 * live — the window is closed by construction, not merely narrowed. Once the
 * last straggling audit write has committed, the next attempt's audit delete
 * removes it and the users delete succeeds. A non-draining FK violation or any
 * other error escapes after the bounded attempts, by design (surfacing a real
 * problem instead of masking it).
 *
 * The product FK and the audit-immutability trigger are UNTOUCHED — only the
 * test teardown ORDERING is corrected (per AC1 guardrail).
 */
import { db } from '../../db/index.js';
import { auditLogs, users } from '../../db/schema/index.js';
import { inArray, sql } from 'drizzle-orm';

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * True when the error is the audit_logs -> users FK race this helper closes.
 * Matched by both the named constraint and the SQLSTATE so it survives a driver
 * that surfaces one but not the other.
 */
function isAuditActorFkRace(err: unknown): boolean {
  const e = err as { message?: string; code?: string; constraint?: string };
  if (e?.code === '23503' || e?.constraint === 'audit_logs_actor_id_users_id_fk') {
    return true;
  }
  const msg = String(e?.message ?? err);
  return msg.includes('audit_logs_actor_id_users_id_fk') || msg.includes('23503');
}

export interface PurgeUsersOptions {
  /** Max attempts before rethrowing the FK error (default 12; ~1.5s total backoff). */
  maxAttempts?: number;
}

/**
 * Delete the given test users and their audit trail without a teardown FK race.
 * Safe no-op when no ids are given; idempotent (re-running deletes nothing new).
 *
 * Use in an integration test's `afterAll` in place of the hand-rolled
 * "disable trigger -> delete audit_logs by actor -> delete users" block whenever
 * the test performed a real login/logout/re-auth (or any action that fires a
 * fire-and-forget audit write) as one of the users being deleted.
 *
 * Non-audit child rows that carry their OWN foreign key to `users`
 * (e.g. user_backup_codes) must still be deleted by the caller BEFORE calling
 * this; rows unrelated to the FK (magic_link_tokens, keyed by email) can be
 * cleaned up in any order.
 */
export async function purgeUsersWithAuditDrain(
  userIds: Array<string | undefined | null>,
  options: PurgeUsersOptions = {},
): Promise<void> {
  const ids = userIds.filter((id): id is string => Boolean(id));
  if (ids.length === 0) return;

  const maxAttempts = options.maxAttempts ?? 12;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await db.transaction(async (tx) => {
        await tx.execute(
          sql`DO $$ BEGIN ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_immutable; EXCEPTION WHEN undefined_object THEN NULL; END $$`,
        );
        await tx.delete(auditLogs).where(inArray(auditLogs.actorId, ids));
        await tx.delete(users).where(inArray(users.id, ids));
        await tx.execute(
          sql`DO $$ BEGIN ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_immutable; EXCEPTION WHEN undefined_object THEN NULL; END $$`,
        );
      });
      return; // clean delete — the window is closed for this run
    } catch (err) {
      if (!isAuditActorFkRace(err) || attempt === maxAttempts) throw err;
      // A straggling fire-and-forget audit write committed between our two
      // deletes. It is now visible and will be removed on the next attempt;
      // the in-flight set is finite (no requests run in afterAll), so this
      // converges. Brief, growing backoff to let the pool settle first.
      // NOTE: each retry re-runs the `DISABLE TRIGGER` above, which takes an
      // ACCESS EXCLUSIVE lock on audit_logs — so retries serialize teardowns
      // under parallel load. This only bites on the rare race path (attempt 1
      // is lock-cost-equivalent to the old inline block), so it's acceptable.
      await sleep(20 * attempt);
    }
  }
}
