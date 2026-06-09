import { describe, it, expect } from 'vitest';
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

  // --- remuneration (payment read paths; getEligibleStaff joins users+roles) ---
  it('RemunerationService.getPaymentBatches runs', async () => {
    await expect(RemunerationService.getPaymentBatches({ limit: 5 })).resolves.toBeTruthy();
  });

  it('RemunerationService.getEligibleStaff runs (users ↔ roles join)', async () => {
    await expect(RemunerationService.getEligibleStaff()).resolves.toBeTruthy();
  });
});
