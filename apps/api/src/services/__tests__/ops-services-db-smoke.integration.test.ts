import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../../db/index.js';
import { users } from '../../db/schema/users.js';
import { roles } from '../../db/schema/roles.js';
import { paymentBatches, paymentRecords, paymentDisputes } from '../../db/schema/remuneration.js';
import { ProductivityService } from '../productivity.service.js';
import { RemunerationService } from '../remuneration.service.js';
import { listAuditLogs, getDistinctValues, searchPrincipals } from '../audit-log-viewer.service.js';

/**
 * Real-DB SMOKE for ops/payment/audit services — sibling to
 * analytics-db-smoke.integration.test.ts. Executes each service's read-path
 * queries against a live Postgres (CI `test-api` provides one; local Postgres
 * too), asserting they RESOLVE rather than throw. Catches the same class the
 * analytics 500s came from: a query that no longer matches the schema (renamed/
 * removed column, text↔uuid mismatch) — Postgres validates those at plan time,
 * so they throw even on zero rows.
 *
 * Coverage notes:
 *  - audit-log-viewer: raw `db.execute(sql)` (8 calls) — genuine drift risk.
 *  - productivity: pure Drizzle query builder (no raw SQL) — tsc already guards
 *    column refs, so the drift risk is low, but a real-DB run still validates the
 *    complex multi-join aggregations actually execute end-to-end.
 *  - remuneration: Drizzle query builder + 2 trivial `sql` fragments — low drift
 *    risk; smoked here per the "extend to ops services" request.
 *
 * Methods are called with global/empty-safe params — these aggregate across all
 * rows, so they execute (and return empty/zero) without seeded fixtures. Each is
 * its own assertion so a single failure pinpoints the offending query.
 */

describe('ops services — real-DB smoke (query ↔ schema parity)', () => {
  // --- audit-log-viewer (raw SQL — highest drift risk in this file) ---
  it('listAuditLogs runs (default principal types, last-24h window)', async () => {
    await expect(listAuditLogs({ limit: 5 })).resolves.toBeTruthy();
  });

  it('getDistinctValues runs for both whitelisted fields', async () => {
    await expect(getDistinctValues('action')).resolves.toBeInstanceOf(Array);
    await expect(getDistinctValues('target_resource')).resolves.toBeInstanceOf(Array);
  });

  it('searchPrincipals runs (joins users + api_consumers)', async () => {
    await expect(searchPrincipals('a')).resolves.toBeInstanceOf(Array);
  });

  // --- productivity (ORM joins across users/roles/lgas/submissions) ---
  const prodMethods: Array<[string, () => Promise<unknown>]> = [
    ['getTeamProductivity', () => ProductivityService.getTeamProductivity(null, { period: 'month' })],
    ['getAllStaffProductivity', () => ProductivityService.getAllStaffProductivity({ period: 'month' })],
    ['getLgaComparison', () => ProductivityService.getLgaComparison({ period: 'month' })],
    ['getLgaSummary', () => ProductivityService.getLgaSummary({ period: 'month' })],
  ];
  it.each(prodMethods)('ProductivityService.%s runs against the real schema', async (_name, run) => {
    await expect(run()).resolves.toBeTruthy();
  });

  // --- remuneration: GLOBAL read paths (run against ambient/empty data) ---
  it('RemunerationService.getPaymentBatches runs', async () => {
    await expect(RemunerationService.getPaymentBatches({ limit: 5 })).resolves.toBeTruthy();
  });

  it('RemunerationService.getEligibleStaff runs (users ↔ roles join)', async () => {
    await expect(RemunerationService.getEligibleStaff()).resolves.toBeTruthy();
  });

  // --- remuneration: DATA-DEPENDENT read paths ---
  // Seed a real payment chain (batch → record → dispute) so the read queries that
  // only do meaningful work when rows exist actually execute their joins/filters,
  // incl. the `reopen_count` column the dispute-reopen `sql` fragment relies on.
  describe('with a seeded payment batch + record + dispute', () => {
    const staffId = uuidv7();
    const batchId = uuidv7();
    const recordId = uuidv7();
    const disputeId = uuidv7();
    const TAG = '_ops_smoke_remun_';
    let createdRoleId: string | null = null;

    beforeAll(async () => {
      // A user to own the chain (recordedBy / createdBy / userId / openedBy).
      // users.role_id is a real FK; users.lga_id is nullable so no lga needed.
      const existing = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, 'enumerator')).limit(1);
      let roleId: string;
      if (existing.length) {
        roleId = existing[0].id;
      } else {
        roleId = uuidv7();
        await db.insert(roles).values({ id: roleId, name: 'enumerator', description: `${TAG}role` });
        createdRoleId = roleId;
      }
      await db.insert(users).values({
        id: staffId,
        email: `${TAG}${staffId}@example.com`,
        fullName: 'Ops Smoke Staff',
        roleId,
        status: 'active',
      });
      await db.insert(paymentBatches).values({
        id: batchId,
        trancheNumber: 999,
        trancheName: `${TAG}tranche`,
        staffCount: 1,
        totalAmount: 150000, // kobo
        recordedBy: staffId,
      });
      await db.insert(paymentRecords).values({
        id: recordId,
        batchId,
        userId: staffId,
        amount: 150000,
        createdBy: staffId,
        // effectiveUntil left NULL → "current" version (the default history filter)
      });
      await db.insert(paymentDisputes).values({
        id: disputeId,
        paymentRecordId: recordId,
        staffComment: `${TAG}disputed amount`,
        openedBy: staffId,
      });
    });

    afterAll(async () => {
      await db.delete(paymentDisputes).where(eq(paymentDisputes.id, disputeId));
      await db.delete(paymentRecords).where(eq(paymentRecords.id, recordId));
      await db.delete(paymentBatches).where(eq(paymentBatches.id, batchId));
      await db.delete(users).where(eq(users.id, staffId));
      if (createdRoleId) await db.delete(roles).where(inArray(roles.id, [createdRoleId]));
    });

    it('getBatchDetail returns the seeded batch (paymentBatches ↔ users join)', async () => {
      const batch = await RemunerationService.getBatchDetail(batchId);
      expect(batch).toBeTruthy();
      expect(batch?.id).toBe(batchId);
    });

    it('getStaffPaymentHistory returns the current record (effectiveUntil filter)', async () => {
      const history = await RemunerationService.getStaffPaymentHistory(staffId);
      expect(history).toBeTruthy();
      expect(history.data.some((r) => r.id === recordId)).toBe(true);
    });

    it('getDisputeByRecordId returns the dispute (exercises reopen_count + users join)', async () => {
      const dispute = await RemunerationService.getDisputeByRecordId(recordId);
      expect(dispute).toBeTruthy();
      expect(dispute?.id).toBe(disputeId);
      expect(dispute?.reopenCount).toBe(0);
    });

    it('getStaffDisputes returns the staff dispute', async () => {
      const result = await RemunerationService.getStaffDisputes(staffId);
      expect(result).toBeTruthy();
    });
  });
});
