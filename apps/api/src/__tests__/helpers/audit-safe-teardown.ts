/**
 * Race-free, deadlock-free integration-test teardown for fixtures that touch the
 * append-only `audit_logs` table (Story 13-30; generalised + made deadlock-safe
 * and superuser-independent in 13-32).
 *
 * TWO PROBLEMS THIS SOLVES
 *  A. The FK race (SQLSTATE 23503). Audit writes are fire-and-forget by design
 *     (the 9-26 lesson: comms/audit must never sink a request), so a request
 *     RESOLVES before its `audit_logs.actor_id = <user>` INSERT commits. An
 *     `afterAll` that deletes those users can then hit
 *     `audit_logs_actor_id_users_id_fk`. Closed by taking `FOR UPDATE` on the
 *     users FIRST (see purgeUsersWithAuditDrain): that conflicts with the
 *     `FOR KEY SHARE` a concurrent audit-insert must take on the users row, so no
 *     new referencing row can appear for those users during the tx.
 *  B. The teardown deadlock (SQLSTATE 40P01). Deleting `audit_logs` rows requires
 *     getting past the append-only `BEFORE UPDATE OR DELETE` trigger, and the only
 *     owner-privilege way is `ALTER TABLE ... DISABLE TRIGGER`, which takes a
 *     strong, self-conflicting table lock (`ShareRowExclusiveLock` on PG 13+).
 *     Two teardowns doing that concurrently DEADLOCK (both wait for
 *     ShareRowExclusiveLock on audit_logs, each blocked by the other). Closed by
 *     a `pg_advisory_xact_lock` that serialises all audit
 *     teardowns (only one holds the table lock at a time) + a bounded retry for
 *     the narrow teardown-vs-insert window.
 *
 * WHY NOT `session_replication_role='replica'`? It is lock-free but needs a
 * SUPERUSER role AND disables FK enforcement (so cascade/SET-NULL on a deleted
 * user's other children would silently not fire). The advisory + DISABLE TRIGGER
 * approach needs only table OWNERSHIP (every test DB here — `user` locally,
 * `test_user` in CI — owns its schema) and keeps FK enforcement ON, so cascades
 * work. It is the single path used everywhere.
 *
 * The product FK and the audit-immutability trigger are UNTOUCHED — only the test
 * teardown transaction is corrected. Verified: 240/240 concurrent teardowns with
 * zero errors + a deterministic 2-connection race test (audit-safe-teardown.race.test.ts).
 *
 * HONEST GUARANTEE (13-32 review L3): the *original* 23503 was never reproduced,
 * so what is proven is (a) the FK-invariant BY CONSTRUCTION for the locked users
 * and (b) deadlock-safety of the serialised `DISABLE TRIGGER` — NOT full
 * determinism. The residual is a low-probability empirical one: sustained
 * parallel audit-write pressure could in principle exhaust the bounded retry
 * (`maxAttempts`), re-surfacing the flake class under 40P01/23503. Burn-in, not
 * a proof-of-absence.
 */
import { db } from '../../db/index.js';
import { auditLogs, users } from '../../db/schema/index.js';
import { inArray, sql } from 'drizzle-orm';

/** The transaction handle drizzle passes to a `db.transaction` callback. */
export type AuditTeardownTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Stable, arbitrary key so ALL audit teardowns (this helper + any caller of
// withAuditLogsMutable) serialise on the same advisory lock.
const AUDIT_TEARDOWN_ADVISORY_KEY = 429_142;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Unwrap the pg error code through drizzle's wrapper (`.cause`). */
function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}

/** Retryable teardown error: deadlock (40P01) or the FK race (23503). */
function isRetryableTeardownError(err: unknown): boolean {
  const c = pgCode(err);
  if (c === '40P01' || c === '23503') return true;
  const msg = String((err as { message?: string })?.message ?? err);
  return msg.includes('40P01') || msg.includes('23503') || msg.includes('deadlock');
}

/**
 * Run `body(tx)` in a transaction where `audit_logs` is deletable (the
 * append-only trigger is disabled) WITHOUT the deadlock the table-wide ACCESS
 * EXCLUSIVE lock would otherwise cause under concurrent teardowns.
 *
 * Serialised across all callers via one advisory lock; bounded-retried on
 * deadlock/FK-race (the in-flight audit-write set is finite in an `afterAll`, so
 * it converges). FK enforcement stays ON, so any cascade/SET-NULL on rows `body`
 * deletes still fires. `body` must be idempotent (it may run more than once) —
 * plain deletes are.
 *
 * Use this in an integration `afterAll` for ANY cleanup that deletes `audit_logs`
 * rows (by actor OR target). For the common "delete these users + their audit
 * trail" case, prefer {@link purgeUsersWithAuditDrain}.
 */
export async function withAuditLogsMutable(
  body: (tx: AuditTeardownTx) => Promise<void>,
  maxAttempts = 5,
): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await db.transaction(async (tx) => {
        // Serialise teardowns: no two hold the DISABLE-TRIGGER table lock
        // (ShareRowExclusiveLock, self-conflicting) at once, so the
        // teardown-vs-teardown deadlock cannot form. Held until commit. No
        // privilege required.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${AUDIT_TEARDOWN_ADVISORY_KEY})`);
        await tx.execute(
          sql`DO $$ BEGIN ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_immutable; EXCEPTION WHEN undefined_object THEN NULL; END $$`,
        );
        await body(tx);
        await tx.execute(
          sql`DO $$ BEGIN ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_immutable; EXCEPTION WHEN undefined_object THEN NULL; END $$`,
        );
      });
      return;
    } catch (err) {
      // Narrow window: a fire-and-forget insert holding RowExclusive(audit_logs)
      // and wanting KEY SHARE(user) can deadlock our FOR UPDATE(user) +
      // DISABLE-TRIGGER lock request; Postgres kills one tx. Retry — the
      // in-flight set drains, so this converges.
      if (!isRetryableTeardownError(err) || attempt === maxAttempts) throw err;
      await sleep(20 * attempt);
    }
  }
}

/**
 * Delete the given test users and their audit trail without a teardown FK race
 * or a `DISABLE TRIGGER` deadlock. Safe no-op when no ids are given; idempotent.
 *
 * Use in an integration test's `afterAll` in place of a hand-rolled
 * "disable trigger -> delete audit_logs by actor -> delete users" block whenever
 * the test performed a real login/logout/re-auth (or any action that fires a
 * fire-and-forget audit write) as one of the users being deleted.
 *
 * Child rows with a RESTRICT/NO ACTION FK to `users` must still be deleted by the
 * caller BEFORE calling this; cascade / SET-NULL children are handled by the FK
 * actions on the users delete (FK enforcement stays on).
 */
export async function purgeUsersWithAuditDrain(
  userIds: Array<string | undefined | null>,
): Promise<void> {
  const ids = userIds.filter((id): id is string => Boolean(id));
  if (ids.length === 0) return;

  await withAuditLogsMutable(async (tx) => {
    // Parent lock FIRST — conflicts with the FOR KEY SHARE a concurrent audit
    // insert takes on the referenced users row, so no new audit_logs row can
    // reference these users for the rest of the tx (closes the 23503 window).
    await tx.select({ id: users.id }).from(users).where(inArray(users.id, ids)).for('update');
    await tx.delete(auditLogs).where(inArray(auditLogs.actorId, ids));
    await tx.delete(users).where(inArray(users.id, ids));
  });
}
