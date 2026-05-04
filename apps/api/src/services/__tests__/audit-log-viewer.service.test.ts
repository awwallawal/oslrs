/**
 * Story 9-11 — Tests for audit-log-viewer.service.ts.
 *
 * Hybrid coverage:
 *   - Pure unit tests for the deterministic helpers (cursor encoding, filter
 *     signature, error classes).
 *   - Real-DB integration smoke for the query surface (filter SQL compiles
 *     and runs; principal autocomplete returns empty for non-matching query).
 *     These tests need no fixtures — they verify the SQL is valid and behaves
 *     correctly on no-result queries.
 *
 * The full filter-combinatorial coverage (with seeded fixtures) lands in T7
 * (the bench harness) which seeds 1M audit_logs rows and exercises all
 * filter shapes per AC#11 thresholds.
 */
import { describe, it, expect } from 'vitest';
import {
  encodeCursor,
  decodeCursor,
  ExportTooLargeError,
  listAuditLogs,
  searchPrincipals,
  getDistinctValues,
} from '../audit-log-viewer.service.js';

describe('encodeCursor / decodeCursor (pure)', () => {
  it('round-trips a (createdAt, id) tuple', () => {
    const ts = new Date('2026-05-03T10:30:45.123Z');
    const id = '019dee76-1234-7000-9000-abcdef012345';
    const encoded = encodeCursor(ts, id);
    const decoded = decodeCursor(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded!.ts.toISOString()).toBe(ts.toISOString());
    expect(decoded!.id).toBe(id);
  });

  it('decodeCursor returns null for undefined input', () => {
    expect(decodeCursor(undefined)).toBeNull();
  });

  it('decodeCursor returns null for malformed base64', () => {
    expect(decodeCursor('!!!not_base64!!!')).toBeNull();
  });

  it('decodeCursor returns null for valid base64 of non-JSON', () => {
    const garbage = Buffer.from('not json at all', 'utf8').toString('base64url');
    expect(decodeCursor(garbage)).toBeNull();
  });

  it('decodeCursor returns null for JSON missing required fields', () => {
    const partial = Buffer.from(JSON.stringify({ ts: '2026-01-01T00:00:00Z' }), 'utf8').toString('base64url');
    expect(decodeCursor(partial)).toBeNull();
  });

  it('decodeCursor returns null for invalid timestamp', () => {
    const badTs = Buffer.from(JSON.stringify({ ts: 'definitely-not-a-date', id: 'abc' }), 'utf8').toString('base64url');
    expect(decodeCursor(badTs)).toBeNull();
  });

  it('encoded cursor is URL-safe (no +, /, =)', () => {
    const ts = new Date('2026-05-03T10:30:45.123Z');
    const id = '019dee76-1234-7000-9000-abcdef012345';
    const encoded = encodeCursor(ts, id);
    expect(encoded).not.toMatch(/[+/=]/);
  });
});

describe('ExportTooLargeError', () => {
  it('exposes the count field and a descriptive message', () => {
    const err = new ExportTooLargeError(50_000);
    expect(err.count).toBe(50_000);
    expect(err.name).toBe('ExportTooLargeError');
    expect(err.message).toContain('50000');
    expect(err.message).toMatch(/cap/);
    expect(err).toBeInstanceOf(Error);
  });
});

describe('listAuditLogs (real DB integration)', () => {
  it('returns empty result for impossible date range', async () => {
    const result = await listAuditLogs({
      principalTypes: ['user', 'consumer', 'system'],
      from: '2099-01-01T00:00:00Z',
      to: '2099-01-02T00:00:00Z',
    });
    expect(result.rows).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  it('returns empty result when principalTypes is empty (caller short-circuit)', async () => {
    const result = await listAuditLogs({ principalTypes: [] });
    expect(result.rows).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  it('respects limit parameter shape (cursor null when results fit in one page)', async () => {
    // Force a tight limit; use a year-long window to exercise the LIMIT clause.
    const result = await listAuditLogs({
      principalTypes: ['system'],
      from: '2099-01-01T00:00:00Z',
      to: '2099-12-31T23:59:59Z',
      limit: 5,
    });
    // Empty because of impossible date — but the SQL ran without throwing,
    // proving the limit + cursor SQL composes correctly.
    expect(result.rows.length).toBeLessThanOrEqual(5);
    expect(result.nextCursor).toBeNull();
  });
});

describe('searchPrincipals (real DB integration)', () => {
  it('returns empty array for empty query', async () => {
    const result = await searchPrincipals('');
    expect(result).toEqual([]);
  });

  it('returns empty array for whitespace-only query', async () => {
    const result = await searchPrincipals('   ');
    expect(result).toEqual([]);
  });

  it('returns empty array for non-matching gibberish query', async () => {
    const result = await searchPrincipals('zzzzz_definitely_no_one_named_this_qqqqq');
    expect(result).toEqual([]);
  });

  it('clamps query length to 50 chars (no SQL error on long input)', async () => {
    const veryLong = 'a'.repeat(500);
    const result = await searchPrincipals(veryLong);
    // No assertion on result content (DB-state-dependent); just verify it ran.
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('getDistinctValues (real DB integration)', () => {
  it('returns an array for action field', async () => {
    const result = await getDistinctValues('action');
    expect(Array.isArray(result)).toBe(true);
    // Each value should be a string.
    for (const v of result) {
      expect(typeof v).toBe('string');
    }
  });

  it('returns an array for target_resource field', async () => {
    const result = await getDistinctValues('target_resource');
    expect(Array.isArray(result)).toBe(true);
  });
});
