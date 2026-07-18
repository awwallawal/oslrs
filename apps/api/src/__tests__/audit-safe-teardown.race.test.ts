/**
 * Deterministic proof for the Story 13-32 audit-teardown fix.
 *
 * WHY THIS EXISTS
 * A burn-in can only SAMPLE the concurrent schedule that used to red the suite
 * (`audit_logs_actor_id_users_id_fk`, SQLSTATE 23503). It cannot prove the race
 * absent. This test instead SCRIPTS the worst-case interleaving with two real
 * connections and drives it off actual row locks, so the "block" is enforced by
 * Postgres — not by timing — and the assertions are deterministic.
 *
 * THE INVARIANT UNDER TEST
 * `purgeUsersWithAuditDrain` takes `SELECT ... FROM users ... FOR UPDATE` as its
 * first statement. Inserting an `audit_logs` row that references a user forces
 * the inserter to take `FOR KEY SHARE` on that users row (FK enforcement), and
 * `FOR UPDATE` conflicts with `FOR KEY SHARE`. Therefore, for the whole teardown
 * transaction, no new referencing row can be created for the locked users — so
 * `DELETE users` cannot hit 23503.
 *
 * Two schedules are pinned:
 *   1. an audit INSERT already in flight (holding KEY SHARE) BEFORE the purge
 *      locks → the purge blocks, then completes cleanly once the insert commits;
 *   2. a NEW audit INSERT attempted WHILE the purge holds FOR UPDATE → the
 *      insert blocks, and after the user is deleted it fails with 23503 (the
 *      fire-and-forget path that is swallowed in production) — i.e. no orphan
 *      referencing row can ever slip in.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, db } from '../db/index.js';
import { users, roles, auditLogs } from '../db/schema/index.js';
import { eq, inArray } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { purgeUsersWithAuditDrain, withAuditLogsMutable } from './helpers/audit-safe-teardown.js';

type Client = Awaited<ReturnType<typeof pool.connect>>;

/**
 * True when `p` is still pending after `ms`. Because the wait here is enforced
 * by a real row lock (not a timer), ANY positive threshold is sound: the promise
 * physically cannot settle while the lock is held, so a false positive is
 * impossible. If the premise (FOR UPDATE blocks the insert) were ever wrong, the
 * promise would settle early and this returns false — failing the test loudly.
 */
async function isPendingAfter(p: Promise<unknown>, ms: number): Promise<boolean> {
  const PENDING = Symbol('pending');
  const timer = new Promise<typeof PENDING>((resolve) => setTimeout(() => resolve(PENDING), ms));
  const settled = p.then(
    () => 'settled' as const,
    () => 'settled' as const,
  );
  return (await Promise.race([settled, timer])) === PENDING;
}

const INSERT_AUDIT = `INSERT INTO audit_logs (id, actor_id, action, hash) VALUES ($1, $2, $3, $4)`;

describe('purgeUsersWithAuditDrain — deterministic FK-race schedules (13-32)', () => {
  let roleId: string;
  const cleanupUserIds: string[] = [];

  beforeAll(async () => {
    await db
      .insert(roles)
      .values([{ name: 'super_admin', description: 'Super Administrator' }])
      .onConflictDoNothing();
    const role = await db.query.roles.findFirst({ where: eq(roles.name, 'super_admin') });
    roleId = role!.id;
  });

  afterAll(async () => {
    // Belt-and-suspenders: purge anything a mid-test failure left behind. The
    // helper is idempotent and a no-op for already-deleted ids.
    if (cleanupUserIds.length) await purgeUsersWithAuditDrain(cleanupUserIds);
  });

  async function makeUser(tag: string): Promise<string> {
    const [u] = await db
      .insert(users)
      .values({
        email: `race-${tag}-${uuidv7()}@example.com`,
        fullName: `Race ${tag}`,
        roleId,
        status: 'active',
        passwordHash: null,
      })
      .returning();
    cleanupUserIds.push(u.id);
    return u.id;
  }

  function forget(id: string): void {
    const i = cleanupUserIds.indexOf(id);
    if (i >= 0) cleanupUserIds.splice(i, 1);
  }

  it('SCHEDULE 1 — an in-flight referencing insert blocks the purge, which then completes with no 23503', async () => {
    const userId = await makeUser('inflight');
    const blocker: Client = await pool.connect();

    try {
      // conn B: open a tx, insert an audit_logs row referencing userId, and HOLD
      // it uncommitted. FK enforcement now holds FOR KEY SHARE on users(userId) —
      // exactly the state that used to let a row slip between the old helper's
      // `DELETE audit_logs` and `DELETE users`.
      await blocker.query('BEGIN');
      await blocker.query(INSERT_AUDIT, [uuidv7(), userId, 'test.race.inflight', 'deadbeef']);

      // conn A: run the REAL teardown helper. Its opening `SELECT ... FOR UPDATE`
      // conflicts with B's FOR KEY SHARE, so it MUST block — it cannot possibly
      // succeed while B holds the lock.
      const purge = purgeUsersWithAuditDrain([userId]);
      expect(await isPendingAfter(purge, 750)).toBe(true);

      // Advance the schedule: commit B. The referencing row is now committed.
      await blocker.query('COMMIT');

      // A unblocks: acquires FOR UPDATE, `DELETE audit_logs` sweeps the
      // now-committed row, `DELETE users` is clean. No 23503.
      await expect(purge).resolves.toBeUndefined();
      forget(userId);
    } finally {
      blocker.release();
    }

    // End state: user gone, no orphan audit rows reference it.
    expect(await db.select().from(users).where(eq(users.id, userId))).toHaveLength(0);
    expect(await db.select().from(auditLogs).where(eq(auditLogs.actorId, userId))).toHaveLength(0);
  });

  it('SCHEDULE 2 — while the parent row is FOR UPDATE-locked, a new referencing insert cannot slip in', async () => {
    const userId = await makeUser('newinsert');
    // conn A reproduces the helper's opening lock and holds it (we cannot pause
    // mid-helper), so we can drive conn B against a known in-transaction lock.
    const holder: Client = await pool.connect();
    const inserter: Client = await pool.connect();

    try {
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);

      // conn B: attempt a NEW audit_logs insert referencing userId. It needs
      // FOR KEY SHARE on users(userId) → blocked by A's FOR UPDATE.
      const insert = inserter.query(INSERT_AUDIT, [uuidv7(), userId, 'test.race.newinsert', 'deadbeef']);
      expect(await isPendingAfter(insert, 750)).toBe(true);

      // A deletes the (locked) user and commits. No audit rows exist for it yet
      // (B is still blocked), so no trigger dance is needed here.
      await holder.query('DELETE FROM users WHERE id = $1', [userId]);
      await holder.query('COMMIT');
      forget(userId);

      // B unblocks and its insert now FK-fails: the user is gone. In production
      // this is the swallowed fire-and-forget path; here we assert the DB refused
      // to create an orphan referencing row.
      await expect(insert).rejects.toMatchObject({ code: '23503' });
    } finally {
      inserter.release();
      holder.release();
    }

    expect(await db.select().from(users).where(eq(users.id, userId))).toHaveLength(0);
  });
});

/**
 * The shared `withAuditLogsMutable` primitive — used by purgeUsersWithAuditDrain
 * AND by inline teardowns that delete `audit_logs` rows other than by actor
 * (e.g. by target). Proves it deletes past the append-only trigger and stays
 * deadlock-free under concurrent teardowns.
 */
describe('withAuditLogsMutable — shared audit-trail teardown primitive', () => {
  let roleId: string;
  const cleanupUserIds: string[] = [];

  beforeAll(async () => {
    await db.insert(roles).values([{ name: 'super_admin', description: 'Super Administrator' }]).onConflictDoNothing();
    roleId = (await db.query.roles.findFirst({ where: eq(roles.name, 'super_admin') }))!.id;
  });
  afterAll(async () => {
    if (cleanupUserIds.length) await purgeUsersWithAuditDrain(cleanupUserIds);
  });
  async function makeUser(): Promise<string> {
    const [u] = await db
      .insert(users)
      .values({ email: `wal-${uuidv7()}@example.com`, fullName: 'WAL', roleId, status: 'active', passwordHash: null })
      .returning();
    cleanupUserIds.push(u.id);
    return u.id;
  }

  it('deletes audit_logs rows (here: by target) through the append-only trigger', async () => {
    const userId = await makeUser();
    const targetId = uuidv7();
    await db.insert(auditLogs).values([
      { actorId: userId, action: 'test.wal.a', targetId, hash: 'h1' },
      { actorId: userId, action: 'test.wal.b', targetId, hash: 'h2' },
    ]);
    await withAuditLogsMutable(async (tx) => {
      await tx.delete(auditLogs).where(eq(auditLogs.targetId, targetId));
    });
    expect(await db.select().from(auditLogs).where(eq(auditLogs.targetId, targetId))).toHaveLength(0);
  });

  it('is deadlock-free under concurrent teardowns racing fire-and-forget inserts', async () => {
    const ids = await Promise.all(Array.from({ length: 6 }, () => makeUser()));
    // each cohort fires fire-and-forget audit inserts, then tears down (via the
    // users helper, which is built on withAuditLogsMutable) — all concurrently.
    const results = await Promise.allSettled(
      ids.map(async (id) => {
        for (let n = 0; n < 6; n++) db.insert(auditLogs).values({ actorId: id, action: 'test.wal.conc', hash: 'h' }).catch(() => {});
        await purgeUsersWithAuditDrain([id]);
      }),
    );
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    for (const id of ids) {
      const i = cleanupUserIds.indexOf(id);
      if (i >= 0) cleanupUserIds.splice(i, 1);
    }
    expect(await db.select().from(users).where(inArray(users.id, ids))).toHaveLength(0);
  });
});
