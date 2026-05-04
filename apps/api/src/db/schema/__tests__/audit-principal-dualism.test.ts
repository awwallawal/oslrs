import { describe, it, expect, afterAll } from 'vitest';
import { sql, inArray } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../../index.js';
import { apiConsumers } from '../api-consumers.js';
import { createApiConsumer } from '../../../test/factories/api-consumer.factory.js';

/**
 * Story 9-11 — DB-level constraint tests for the schema down payment.
 *
 * Verifies the migrate-audit-principal-dualism-init.ts contract holds at the
 * database layer:
 *   1. Principal-exclusive CHECK on audit_logs rejects mixed-principal writes
 *      (actor_id AND consumer_id both set simultaneously).
 *   2. api_consumers status CHECK rejects values outside the enum.
 *   3. api_consumers organisation_type CHECK rejects values outside the enum.
 *   4. Valid api_consumers rows insert successfully (positive path).
 *   5. Valid consumer-principal audit_logs rows insert successfully (rolled
 *      back via transaction; audit_logs has an append-only trigger from Story
 *      6-1 that blocks DELETE — transaction rollback bypasses the trigger
 *      since the trigger fires only on committed mutations).
 *
 * These tests speak to the live local Postgres (DATABASE_URL). They follow
 * the project's integration-test pattern (beforeAll/afterAll, never
 * beforeEach/afterEach) per MEMORY.md "Key Patterns".
 *
 * Error-shape note: Drizzle 0.45 wraps the underlying pg error so the
 * "Failed query: ... params: ..." message does NOT include the original
 * Postgres SQLSTATE / constraint name in `.message`. The original error is
 * at `.cause`. The pattern below mirrors `respondents.constraints.test.ts`:
 * extract `err.code ?? err.cause?.code` and check for `'23514'`
 * (check_violation SQLSTATE).
 */

interface UnwrappedDbError {
  code?: string;
  cause?: { code?: string; constraint?: string };
  message?: string;
}

function classifyError(err: unknown) {
  const e = err as UnwrappedDbError;
  return {
    code: e.code ?? e.cause?.code,
    constraint: e.cause?.constraint,
    message: e.message ?? '',
  };
}

class TestRollback extends Error {
  constructor() {
    super('intentional test rollback');
    this.name = 'TestRollback';
  }
}

describe('audit_logs principal-exclusive + api_consumers CHECK constraints (Story 9-11 schema down payment)', () => {
  const insertedConsumerIds: string[] = [];

  afterAll(async () => {
    if (insertedConsumerIds.length > 0) {
      await db
        .delete(apiConsumers)
        .where(inArray(apiConsumers.id, insertedConsumerIds));
    }
  });

  it('audit_logs CHECK rejects mixed-principal write (actor_id AND consumer_id both set)', async () => {
    const consumer = await createApiConsumer();
    insertedConsumerIds.push(consumer.id);

    // Need a valid users.id to FK against. Skip with diagnostic if dev DB has none.
    const usersResult = await db.execute(sql`SELECT id FROM users LIMIT 1`);
    if (usersResult.rows.length === 0) {
      console.warn(
        '[audit-principal-dualism.test] No users in DB; skipping mixed-principal CHECK test.'
      );
      return;
    }
    const userId = (usersResult.rows[0] as { id: string }).id;

    // Wrap in a transaction so even if the CHECK fails to fire (regression),
    // the row never commits — audit_logs append-only trigger would otherwise
    // force superuser cleanup.
    let threw = false;
    let codeAndMsg: ReturnType<typeof classifyError> = { code: undefined, constraint: undefined, message: '' };
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`
          INSERT INTO audit_logs (id, actor_id, consumer_id, action, created_at)
          VALUES (
            ${uuidv7()}::uuid,
            ${userId}::uuid,
            ${consumer.id}::uuid,
            'test.mixed_principal',
            now()
          )
        `);
        // CHECK regression guard — if INSERT didn't throw, force rollback so
        // we don't pollute audit_logs.
        throw new TestRollback();
      });
    } catch (err) {
      threw = true;
      codeAndMsg = classifyError(err);
    }

    expect(threw).toBe(true);
    // 23514 = check_violation. Constraint name available on Drizzle's wrapped
    // cause. Either signal proves the CHECK fired.
    const isCheckViolation =
      codeAndMsg.code === '23514' ||
      codeAndMsg.constraint === 'audit_logs_principal_exclusive_check' ||
      /audit_logs_principal_exclusive_check/.test(codeAndMsg.message);
    if (!isCheckViolation) {
      throw new Error(
        `Unexpected error shape — code=${codeAndMsg.code ?? 'none'} constraint=${codeAndMsg.constraint ?? 'none'} message=${codeAndMsg.message}`
      );
    }
    expect(isCheckViolation).toBe(true);
  });

  it('api_consumers CHECK rejects invalid status', async () => {
    let threw = false;
    let codeAndMsg: ReturnType<typeof classifyError> = { code: undefined, constraint: undefined, message: '' };
    try {
      await db.execute(sql`
        INSERT INTO api_consumers (id, name, organisation_type, contact_email, status)
        VALUES (
          ${uuidv7()}::uuid,
          'Invalid Status Test',
          'state_mda',
          'invalid-status@example.test',
          'archived'
        )
      `);
    } catch (err) {
      threw = true;
      codeAndMsg = classifyError(err);
    }

    expect(threw).toBe(true);
    const isCheckViolation =
      codeAndMsg.code === '23514' ||
      codeAndMsg.constraint === 'api_consumers_status_check' ||
      /api_consumers_status_check/.test(codeAndMsg.message);
    if (!isCheckViolation) {
      throw new Error(
        `Unexpected error shape — code=${codeAndMsg.code ?? 'none'} constraint=${codeAndMsg.constraint ?? 'none'} message=${codeAndMsg.message}`
      );
    }
    expect(isCheckViolation).toBe(true);
  });

  it('api_consumers CHECK rejects invalid organisation_type', async () => {
    let threw = false;
    let codeAndMsg: ReturnType<typeof classifyError> = { code: undefined, constraint: undefined, message: '' };
    try {
      await db.execute(sql`
        INSERT INTO api_consumers (id, name, organisation_type, contact_email, status)
        VALUES (
          ${uuidv7()}::uuid,
          'Invalid Org Test',
          'private_company',
          'invalid-org@example.test',
          'active'
        )
      `);
    } catch (err) {
      threw = true;
      codeAndMsg = classifyError(err);
    }

    expect(threw).toBe(true);
    const isCheckViolation =
      codeAndMsg.code === '23514' ||
      codeAndMsg.constraint === 'api_consumers_organisation_type_check' ||
      /api_consumers_organisation_type_check/.test(codeAndMsg.message);
    if (!isCheckViolation) {
      throw new Error(
        `Unexpected error shape — code=${codeAndMsg.code ?? 'none'} constraint=${codeAndMsg.constraint ?? 'none'} message=${codeAndMsg.message}`
      );
    }
    expect(isCheckViolation).toBe(true);
  });

  it('api_consumers accepts valid status + organisation_type combinations', async () => {
    const consumer = await createApiConsumer({
      name: 'Valid Test Consumer (federal_mda)',
      organisationType: 'federal_mda',
      status: 'active',
    });
    insertedConsumerIds.push(consumer.id);
    expect(consumer.id).toBeDefined();
    expect(consumer.organisationType).toBe('federal_mda');
    expect(consumer.status).toBe('active');
  });

  it('audit_logs accepts system-event principal (actor_id NULL, consumer_id NULL — Story 9-11 R2-F1)', async () => {
    // Regression guard for the principal-exclusive CHECK constraint's OR-semantics.
    // Architecture Decision 5.4 explicitly allows BOTH NULL (system events like
    // background-job audit emissions). If the constraint silently flips to
    // XOR — `(actor_id IS NULL AND consumer_id IS NOT NULL) OR (actor_id IS NOT NULL AND consumer_id IS NULL)` —
    // tests 1+5 would still pass while production background-job audits start
    // failing with check_violation. This test pins the OR-semantics down.
    let inserted = false;
    try {
      await db.transaction(async (tx) => {
        const auditId = uuidv7();
        await tx.execute(sql`
          INSERT INTO audit_logs (id, actor_id, consumer_id, action, created_at)
          VALUES (
            ${auditId}::uuid,
            NULL,
            NULL,
            'test.system_event',
            now()
          )
        `);
        const result = await tx.execute(sql`
          SELECT actor_id, consumer_id FROM audit_logs WHERE id = ${auditId}::uuid
        `);
        expect(result.rows.length).toBe(1);
        const row = result.rows[0] as { actor_id: string | null; consumer_id: string | null };
        expect(row.actor_id).toBeNull();
        expect(row.consumer_id).toBeNull();
        inserted = true;
        // Roll back so we never commit (avoids the append-only trigger blocking cleanup).
        throw new TestRollback();
      });
    } catch (err) {
      if (!(err instanceof TestRollback)) throw err;
    }
    expect(inserted).toBe(true);
  });

  it('audit_logs accepts consumer-only principal (actor_id NULL, consumer_id set)', async () => {
    const consumer = await createApiConsumer();
    insertedConsumerIds.push(consumer.id);

    // Use transaction rollback so the inserted audit row never commits — the
    // append-only trigger from Story 6-1 would otherwise block cleanup.
    let inserted = false;
    try {
      await db.transaction(async (tx) => {
        const auditId = uuidv7();
        await tx.execute(sql`
          INSERT INTO audit_logs (id, actor_id, consumer_id, action, created_at)
          VALUES (
            ${auditId}::uuid,
            NULL,
            ${consumer.id}::uuid,
            'test.consumer_principal_only',
            now()
          )
        `);
        // Verify the row landed inside the transaction.
        const result = await tx.execute(sql`
          SELECT actor_id, consumer_id FROM audit_logs WHERE id = ${auditId}::uuid
        `);
        expect(result.rows.length).toBe(1);
        const row = result.rows[0] as { actor_id: string | null; consumer_id: string };
        expect(row.actor_id).toBeNull();
        expect(row.consumer_id).toBe(consumer.id);
        inserted = true;
        // Roll back so we never commit (avoids the append-only trigger blocking cleanup).
        throw new TestRollback();
      });
    } catch (err) {
      if (!(err instanceof TestRollback)) throw err;
    }
    expect(inserted).toBe(true);
  });
});
