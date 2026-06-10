import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../../db/index.js';
import { users } from '../../db/schema/users.js';
import { roles } from '../../db/schema/roles.js';
import { lgas } from '../../db/schema/lgas.js';
import { teamAssignments } from '../../db/schema/team-assignments.js';
import { submissions } from '../../db/schema/submissions.js';
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
  it.each(prodMethods)('ProductivityService.%s runs against the real schema (empty/ambient path)', async (_name, run) => {
    await expect(run()).resolves.toBeTruthy();
  });

  // Seed a full graph (lga → supervisor + enumerator → team_assignment → submission)
  // so the productivity aggregations execute their DATA-DEPENDENT branches — the
  // live-today submission count + snapshot lookups + supervisor-team resolution
  // that the empty-DB path (above) skips. Confirms those queries run against the
  // real schema with rows present, not just the zero-row early returns.
  describe('with a seeded LGA + supervisor + enumerator + submission (populated branches)', () => {
    const lgaId = uuidv7();
    const supervisorId = uuidv7();
    const enumeratorId = uuidv7();
    const assignmentId = uuidv7();
    const submissionId = uuidv7();
    const TAG = '_ops_smoke_prod_';

    // Roles are shared reference data. Create idempotently (conflict-safe so
    // parallel real-DB test files don't race on the unique `name`) and NEVER
    // delete in cleanup — deleting a role another parallel test's user still
    // references would violate the users.role_id FK.
    async function ensureRole(name: string): Promise<string> {
      await db.insert(roles).values({ id: uuidv7(), name, description: `${TAG}role` }).onConflictDoNothing();
      const [row] = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, name)).limit(1);
      return row.id;
    }

    beforeAll(async () => {
      await db.insert(lgas).values({ id: lgaId, name: `${TAG}${lgaId}`, code: `${TAG}${lgaId}` });
      const enumRoleId = await ensureRole('enumerator');
      const supRoleId = await ensureRole('supervisor');
      await db.insert(users).values([
        { id: supervisorId, email: `${TAG}sup_${supervisorId}@example.com`, fullName: 'Smoke Supervisor', roleId: supRoleId, lgaId, status: 'active' },
        { id: enumeratorId, email: `${TAG}enum_${enumeratorId}@example.com`, fullName: 'Smoke Enumerator', roleId: enumRoleId, lgaId, status: 'active' },
      ]);
      await db.insert(teamAssignments).values({ id: assignmentId, supervisorId, enumeratorId, lgaId }); // unassignedAt NULL = active
      await db.insert(submissions).values({
        id: submissionId,
        submissionUid: `${TAG}${submissionId}`,
        questionnaireFormId: 'smoke-form',
        submitterId: enumeratorId,
        enumeratorId,
        rawData: { gender: 'female' },
        completionTimeSeconds: 200,
        submittedAt: new Date(),
        source: 'webapp',
      });
    });

    afterAll(async () => {
      await db.delete(submissions).where(eq(submissions.id, submissionId));
      await db.delete(teamAssignments).where(eq(teamAssignments.id, assignmentId));
      await db.delete(users).where(inArray(users.id, [supervisorId, enumeratorId]));
      await db.delete(lgas).where(eq(lgas.id, lgaId));
      // Intentionally do NOT delete roles (shared reference data — see ensureRole).
    });

    it('getAllStaffProductivity includes the seeded staff (live-count + snapshot branches execute)', async () => {
      const result = await ProductivityService.getAllStaffProductivity({ period: 'today', lgaIds: [lgaId] });
      expect(result.rows.some((r) => r.id === enumeratorId)).toBe(true);
      expect(result.totalItems).toBeGreaterThanOrEqual(2);
    });

    it("getTeamProductivity resolves the supervisor's enumerator (populated team branch)", async () => {
      const result = await ProductivityService.getTeamProductivity(supervisorId, { period: 'today' });
      expect(result.rows.some((r) => r.id === enumeratorId)).toBe(true);
    });

    it('getLgaSummary includes the seeded LGA', async () => {
      const result = await ProductivityService.getLgaSummary({ period: 'today', lgaId });
      expect(result.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('getLgaComparison includes the seeded LGA', async () => {
      const result = await ProductivityService.getLgaComparison({ period: 'today', lgaIds: [lgaId] });
      expect(result.rows.length).toBeGreaterThanOrEqual(1);
    });
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

    beforeAll(async () => {
      // A user to own the chain (recordedBy / createdBy / userId / openedBy).
      // users.role_id is a real FK; users.lga_id is nullable so no lga needed.
      // Role created idempotently + never deleted (shared reference data; deleting
      // one a parallel test references would break the users.role_id FK).
      await db.insert(roles).values({ id: uuidv7(), name: 'enumerator', description: `${TAG}role` }).onConflictDoNothing();
      const [{ id: roleId }] = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, 'enumerator')).limit(1);
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
      // Intentionally do NOT delete the role (shared reference data).
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
