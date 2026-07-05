/**
 * Story 13-16 (AC2/AC6) — backfill tests: converts UUID-shaped
 * `respondents.lga_id` values to the `lgas.code` slug, is idempotent
 * (re-run finds 0 convertible), leaves slug rows untouched, and leaves an
 * unmatched UUID as-is for manual review. Real-DB (app_test).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eq, inArray, and } from 'drizzle-orm';
import { db } from '../../src/db/index.js';
import { respondents, lgas, auditLogs } from '../../src/db/schema/index.js';
import { AUDIT_ACTIONS } from '../../src/services/audit.service.js';
import {
  parseArgs,
  fetchCandidates,
  runBackfill,
  writeBackupCsv,
  KNOWN_FLAGS,
} from '../migrate-lgaid-uuid-to-slug.js';

describe('migrate-lgaid-uuid-to-slug — parseArgs', () => {
  it('accepts --dry-run alone (preview default)', () => {
    const a = parseArgs(['--dry-run']);
    expect(a.dryRun).toBe(true);
    expect(a.apply).toBe(false);
    // Review L2 — the default backup dir is anchored to the API package root
    // (CWD-independent), so a repo-root invocation can't scatter backups.
    expect(path.isAbsolute(a.backupDir)).toBe(true);
    expect(path.basename(a.backupDir)).toBe('_ops-backups');
    expect(path.basename(path.dirname(a.backupDir))).toBe('api');
  });

  it('takes an explicit --backup-dir as given', () => {
    const a = parseArgs(['--dry-run', '--backup-dir', 'custom-backups']);
    expect(a.backupDir).toBe('custom-backups');
  });

  it('requires the confirm flag for live mode', () => {
    const a = parseArgs(['--apply']);
    expect(a.apply).toBe(true);
    expect(a.confirmLive).toBe(false);
  });

  it('rejects an unknown flag (typo defence)', () => {
    expect(() => parseArgs(['--dry-rn'])).toThrow(/Unknown flag/);
  });

  it('rejects a non-positive --max-rows', () => {
    expect(() => parseArgs(['--dry-run', '--max-rows', '0'])).toThrow(/max-rows/);
  });

  it('rejects a bare --max-rows instead of silently uncapping (review M1)', () => {
    // Trailing flag with no value…
    expect(() => parseArgs(['--dry-run', '--max-rows'])).toThrow(/max-rows requires/);
    // …and a value swallowed by the next flag.
    expect(() => parseArgs(['--max-rows', '--dry-run'])).toThrow(/max-rows requires/);
  });

  it('KNOWN_FLAGS carries backup-dir', () => {
    expect(KNOWN_FLAGS.has('backup-dir')).toBe(true);
  });
});

describe('migrate-lgaid-uuid-to-slug — backfill (real DB, Story 13-16 AC2)', () => {
  const stamp = Date.now();
  const slug = `lga-backfill-test-${stamp}`;
  const ORPHAN_UUID = '00000000-0000-7000-8000-00000000abcd';
  let lgaUuid: string;
  let uuidRowId: string;
  let slugRowId: string;
  let orphanRowId: string;
  let backupDir: string;

  beforeAll(async () => {
    backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lgaid-backfill-'));
    const [lga] = await db
      .insert(lgas)
      .values({ code: slug, name: `Backfill Test ${stamp}` })
      .returning({ id: lgas.id });
    lgaUuid = lga.id;

    const rows = await db
      .insert(respondents)
      .values([
        // The pre-13-16 public-wizard shape: lga_id = the lgas row UUID.
        { firstName: 'Uuid', phoneNumber: '+2348000000101', lgaId: lgaUuid, source: 'public' },
        // Already-canonical slug row — must be left untouched.
        { firstName: 'Slug', phoneNumber: '+2348000000102', lgaId: slug, source: 'enumerator' },
        // UUID with no lgas row — must be left as-is for manual review.
        { firstName: 'Orphan', phoneNumber: '+2348000000103', lgaId: ORPHAN_UUID, source: 'public' },
      ])
      .returning({ id: respondents.id });
    [uuidRowId, slugRowId, orphanRowId] = rows.map((r) => r.id);
  }, 30000);

  afterAll(async () => {
    const ids = [uuidRowId, slugRowId, orphanRowId].filter(Boolean);
    if (ids.length) {
      await db.delete(auditLogs).where(inArray(auditLogs.targetId, ids));
      await db.delete(respondents).where(inArray(respondents.id, ids));
    }
    await db.delete(lgas).where(eq(lgas.code, slug));
    fs.rmSync(backupDir, { recursive: true, force: true });
  }, 30000);

  it('selects only UUID-shaped rows, resolving the slug via lgas.id', async () => {
    const candidates = await fetchCandidates(null);
    const mine = candidates.filter((c) => [uuidRowId, slugRowId, orphanRowId].includes(c.id));
    expect(mine.map((c) => c.id).sort()).toEqual([uuidRowId, orphanRowId].sort());
    expect(mine.find((c) => c.id === uuidRowId)?.slug).toBe(slug);
    expect(mine.find((c) => c.id === orphanRowId)?.slug).toBeNull();
  });

  it('preview mode (live=false) counts but writes nothing', async () => {
    const summary = await runBackfill({ live: false, maxRows: null, backupDir });
    expect(summary.converted).toBeGreaterThanOrEqual(1);
    expect(summary.backupFile).toBeNull();
    const row = await db.query.respondents.findFirst({ where: eq(respondents.id, uuidRowId) });
    expect(row?.lgaId).toBe(lgaUuid); // untouched
  });

  it('live run converts UUID→slug, backs up pre-values, audits, and leaves the orphan', async () => {
    const summary = await runBackfill({ live: true, maxRows: null, backupDir });
    expect(summary.converted).toBeGreaterThanOrEqual(1);
    expect(summary.failed).toBe(0);
    expect(summary.unmatched).toBeGreaterThanOrEqual(1);

    // Converted row now holds the slug.
    const converted = await db.query.respondents.findFirst({ where: eq(respondents.id, uuidRowId) });
    expect(converted?.lgaId).toBe(slug);

    // Slug row untouched; orphan UUID left as-is (never nulled).
    const slugRow = await db.query.respondents.findFirst({ where: eq(respondents.id, slugRowId) });
    expect(slugRow?.lgaId).toBe(slug);
    const orphan = await db.query.respondents.findFirst({ where: eq(respondents.id, orphanRowId) });
    expect(orphan?.lgaId).toBe(ORPHAN_UUID);

    // CSV backup exists and carries the pre-value pair.
    expect(summary.backupFile).toBeTruthy();
    const csv = fs.readFileSync(summary.backupFile!, 'utf8');
    expect(csv).toContain('respondent_id,lga_id_pre,resolved_slug');
    expect(csv).toContain(`${uuidRowId},${lgaUuid},${slug}`);
    expect(csv).toContain(`${orphanRowId},${ORPHAN_UUID},`);

    // Per-row forensic audit trail.
    const audit = await db.query.auditLogs.findFirst({
      where: and(
        eq(auditLogs.targetId, uuidRowId),
        eq(auditLogs.action, AUDIT_ACTIONS.OPERATOR_LGA_ID_CANONICALIZED),
      ),
    });
    expect(audit).toBeTruthy();
    expect(audit?.details).toMatchObject({ lga_id_pre: lgaUuid, lga_id_post: slug });
  });

  it('is idempotent — a re-run finds no convertible candidate for the fixed row', async () => {
    const candidates = await fetchCandidates(null);
    const mine = candidates.filter((c) => [uuidRowId, slugRowId, orphanRowId].includes(c.id));
    // Only the orphan remains UUID-shaped, and it is unmatched (slug=null).
    expect(mine).toHaveLength(1);
    expect(mine[0].id).toBe(orphanRowId);
    expect(mine[0].slug).toBeNull();

    const summary = await runBackfill({ live: true, maxRows: null, backupDir });
    const orphan = await db.query.respondents.findFirst({ where: eq(respondents.id, orphanRowId) });
    expect(orphan?.lgaId).toBe(ORPHAN_UUID);
    expect(summary.failed).toBe(0);
  });

  it('writeBackupCsv escapes nothing exotic but round-trips the pairs', () => {
    const file = writeBackupCsv(backupDir, [
      { id: 'r1', lgaId: 'u1', slug: 's1' },
      { id: 'r2', lgaId: 'u2', slug: null },
    ]);
    const body = fs.readFileSync(file, 'utf8');
    expect(body.trim().split('\n')).toEqual([
      'respondent_id,lga_id_pre,resolved_slug',
      'r1,u1,s1',
      'r2,u2,',
    ]);
  });
});
