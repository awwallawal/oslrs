import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';

// ── Hoisted mocks (available inside vi.mock) ───────────────────────────

const { mockInsertValues, mockTxInsertValues, mockWarn, mockDbExecute, mockTxExecute } = vi.hoisted(() => ({
  mockInsertValues: vi.fn(),
  mockTxInsertValues: vi.fn(),
  mockWarn: vi.fn(),
  mockDbExecute: vi.fn(),
  mockTxExecute: vi.fn(),
}));

vi.mock('../../db/index.js', () => ({
  db: {
    transaction: (fn: any) => {
      const tx = {
        execute: (...args: any[]) => mockTxExecute(...args),
        insert: () => ({
          values: (vals: any) => {
            mockInsertValues(vals);
            return Promise.resolve();
          },
        }),
      };
      return fn(tx);
    },
    execute: (...args: any[]) => mockDbExecute(...args),
  },
}));

vi.mock('../../db/schema/audit.js', () => ({
  auditLogs: { _table: 'audit_logs' },
}));

vi.mock('pino', () => ({
  default: () => ({
    info: vi.fn(),
    warn: mockWarn,
    error: vi.fn(),
  }),
}));

vi.mock('uuidv7', () => ({
  uuidv7: () => 'mock-uuid-v7',
}));

// ── Import SUT ─────────────────────────────────────────────────────────

import {
  AuditService,
  PII_ACTIONS,
  AUDIT_ACTIONS,
  GENESIS_HASH,
} from '../audit.service.js';

// ── Helpers ────────────────────────────────────────────────────────────

function createMockRequest(overrides: Record<string, any> = {}): any {
  return {
    ip: '192.168.1.100',
    headers: { 'user-agent': 'TestBrowser/1.0' },
    user: { sub: 'actor-uuid-001', role: 'super_admin' },
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
  };
}

function createMockTx(previousHash?: string): any {
  return {
    execute: vi.fn().mockResolvedValue({
      rows: previousHash ? [{ hash: previousHash }] : [],
    }),
    insert: () => ({
      values: (vals: any) => {
        mockTxInsertValues(vals);
        return Promise.resolve();
      },
    }),
  };
}

/** Flush microtask queue so fire-and-forget async completes */
const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

// ── Tests ──────────────────────────────────────────────────────────────

describe('AuditService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default: no previous records (genesis case)
    mockTxExecute.mockResolvedValue({ rows: [] });
    mockDbExecute.mockResolvedValue({ rows: [{ cnt: '0' }] });
  });

  // ────────────────────────────────────────────────────────────────────
  // Task 5.2 / Task 7.10: PII_ACTIONS backward compatibility
  // ────────────────────────────────────────────────────────────────────

  describe('PII_ACTIONS constants', () => {
    it('should define all expected PII action constants', () => {
      expect(PII_ACTIONS.VIEW_RECORD).toBe('pii.view_record');
      expect(PII_ACTIONS.VIEW_LIST).toBe('pii.view_list');
      expect(PII_ACTIONS.EXPORT_CSV).toBe('pii.export_csv');
      expect(PII_ACTIONS.EXPORT_PDF).toBe('pii.export_pdf');
      expect(PII_ACTIONS.SEARCH_PII).toBe('pii.search');
    });

    it('should have exactly 7 action types', () => {
      expect(Object.keys(PII_ACTIONS)).toHaveLength(7);
    });

    it('should map to the same values as AUDIT_ACTIONS PII entries (backward compatible)', () => {
      expect(PII_ACTIONS.VIEW_RECORD).toBe(AUDIT_ACTIONS.PII_VIEW_RECORD);
      expect(PII_ACTIONS.VIEW_LIST).toBe(AUDIT_ACTIONS.PII_VIEW_LIST);
      expect(PII_ACTIONS.EXPORT_CSV).toBe(AUDIT_ACTIONS.PII_EXPORT_CSV);
      expect(PII_ACTIONS.EXPORT_PDF).toBe(AUDIT_ACTIONS.PII_EXPORT_PDF);
      expect(PII_ACTIONS.SEARCH_PII).toBe(AUDIT_ACTIONS.PII_SEARCH);
      expect(PII_ACTIONS.VIEW_PRODUCTIVITY).toBe(AUDIT_ACTIONS.PII_VIEW_PRODUCTIVITY);
      expect(PII_ACTIONS.EXPORT_PRODUCTIVITY).toBe(AUDIT_ACTIONS.PII_EXPORT_PRODUCTIVITY);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Task 7.11: AUDIT_ACTIONS contains all expected categories
  // ────────────────────────────────────────────────────────────────────

  describe('AUDIT_ACTIONS constants', () => {
    it('should contain PII access actions', () => {
      expect(AUDIT_ACTIONS.PII_VIEW_RECORD).toBe('pii.view_record');
      expect(AUDIT_ACTIONS.PII_VIEW_LIST).toBe('pii.view_list');
      expect(AUDIT_ACTIONS.PII_EXPORT_CSV).toBe('pii.export_csv');
      expect(AUDIT_ACTIONS.PII_EXPORT_PDF).toBe('pii.export_pdf');
      expect(AUDIT_ACTIONS.PII_SEARCH).toBe('pii.search');
      expect(AUDIT_ACTIONS.PII_VIEW_PRODUCTIVITY).toBe('pii.view_productivity');
      expect(AUDIT_ACTIONS.PII_EXPORT_PRODUCTIVITY).toBe('pii.export_productivity');
    });

    it('should contain data modification actions', () => {
      expect(AUDIT_ACTIONS.DATA_CREATE).toBe('data.create');
      expect(AUDIT_ACTIONS.DATA_UPDATE).toBe('data.update');
      expect(AUDIT_ACTIONS.DATA_DELETE).toBe('data.delete');
    });

    it('should contain authentication actions', () => {
      expect(AUDIT_ACTIONS.AUTH_LOGIN).toBe('auth.login');
      expect(AUDIT_ACTIONS.AUTH_LOGOUT).toBe('auth.logout');
      expect(AUDIT_ACTIONS.AUTH_PASSWORD_CHANGE).toBe('auth.password_change');
      expect(AUDIT_ACTIONS.AUTH_TOKEN_REFRESH).toBe('auth.token_refresh');
    });

    it('should contain admin actions', () => {
      expect(AUDIT_ACTIONS.ADMIN_USER_DEACTIVATE).toBe('admin.user_deactivate');
      expect(AUDIT_ACTIONS.ADMIN_USER_REACTIVATE).toBe('admin.user_reactivate');
      expect(AUDIT_ACTIONS.ADMIN_ROLE_CHANGE).toBe('admin.role_change');
      expect(AUDIT_ACTIONS.ADMIN_CONFIG_UPDATE).toBe('admin.config_update');
    });

    it('should contain system event actions', () => {
      expect(AUDIT_ACTIONS.SYSTEM_BACKUP).toBe('system.backup');
      expect(AUDIT_ACTIONS.SYSTEM_RESTORE).toBe('system.restore');
      expect(AUDIT_ACTIONS.SYSTEM_MIGRATION).toBe('system.migration');
    });

    it('should have 21 total action types across all categories', () => {
      expect(Object.keys(AUDIT_ACTIONS)).toHaveLength(21);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Task 7.8: Genesis hash
  // ────────────────────────────────────────────────────────────────────

  describe('GENESIS_HASH', () => {
    it('should be SHA-256 of "OSLRS-AUDIT-GENESIS-2026"', () => {
      const expected = createHash('sha256').update('OSLRS-AUDIT-GENESIS-2026').digest('hex');
      expect(GENESIS_HASH).toBe(expected);
    });

    it('should be a 64-character hex string', () => {
      expect(GENESIS_HASH).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Task 7.4, 7.5: computeHash
  // ────────────────────────────────────────────────────────────────────

  describe('computeHash', () => {
    const sampleDate = new Date('2026-02-25T12:00:00.000Z');

    it('should return consistent SHA-256 for same inputs (Task 7.4)', () => {
      const hash1 = AuditService.computeHash('id-1', 'pii.view_record', 'actor-1', sampleDate, { key: 'val' }, GENESIS_HASH);
      const hash2 = AuditService.computeHash('id-1', 'pii.view_record', 'actor-1', sampleDate, { key: 'val' }, GENESIS_HASH);
      expect(hash1).toBe(hash2);
    });

    it('should return different hash for different inputs (Task 7.5)', () => {
      const hash1 = AuditService.computeHash('id-1', 'pii.view_record', 'actor-1', sampleDate, {}, GENESIS_HASH);
      const hash2 = AuditService.computeHash('id-2', 'pii.view_record', 'actor-1', sampleDate, {}, GENESIS_HASH);
      expect(hash1).not.toBe(hash2);
    });

    it('should return a 64-character hex string', () => {
      const hash = AuditService.computeHash('id-1', 'test', null, sampleDate, null, GENESIS_HASH);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should use "SYSTEM" for null actorId', () => {
      const hashNull = AuditService.computeHash('id-1', 'test', null, sampleDate, {}, GENESIS_HASH);
      const hashSystem = AuditService.computeHash('id-1', 'test', 'SYSTEM', sampleDate, {}, GENESIS_HASH);
      // Null actorId maps to "SYSTEM" in the payload, so should NOT match "SYSTEM" as an actual actor string
      // because the payload construction differs: null → 'SYSTEM' vs 'SYSTEM' → 'SYSTEM'
      // Actually they should match since both resolve to 'SYSTEM' in the payload
      expect(hashNull).toBe(hashSystem);
    });

    it('should produce different hash when previousHash differs', () => {
      const hash1 = AuditService.computeHash('id-1', 'test', 'actor', sampleDate, {}, 'prev-hash-1');
      const hash2 = AuditService.computeHash('id-1', 'test', 'actor', sampleDate, {}, 'prev-hash-2');
      expect(hash1).not.toBe(hash2);
    });

    it('should use canonical JSON for details (sorted keys)', () => {
      const details1 = { zebra: 1, apple: 2 };
      const details2 = { apple: 2, zebra: 1 };
      const hash1 = AuditService.computeHash('id-1', 'test', 'actor', sampleDate, details1, GENESIS_HASH);
      const hash2 = AuditService.computeHash('id-1', 'test', 'actor', sampleDate, details2, GENESIS_HASH);
      expect(hash1).toBe(hash2);
    });

    it('should treat null/undefined details as empty object', () => {
      const hashNull = AuditService.computeHash('id-1', 'test', 'actor', sampleDate, null, GENESIS_HASH);
      const hashUndef = AuditService.computeHash('id-1', 'test', 'actor', sampleDate, undefined, GENESIS_HASH);
      expect(hashNull).toBe(hashUndef);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Existing: logPiiAccess (fire-and-forget) — adapted for transaction
  // ────────────────────────────────────────────────────────────────────

  describe('logPiiAccess (fire-and-forget)', () => {
    it('should insert audit log with correct fields from request', async () => {
      const req = createMockRequest();
      AuditService.logPiiAccess(req, PII_ACTIONS.VIEW_RECORD, 'respondent', 'target-uuid-001', {
        fieldsAccessed: ['name', 'nin', 'phone'],
      });

      await flushPromises();

      expect(mockInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'mock-uuid-v7',
          actorId: 'actor-uuid-001',
          action: 'pii.view_record',
          targetResource: 'respondent',
          targetId: 'target-uuid-001',
          ipAddress: '192.168.1.100',
          userAgent: 'TestBrowser/1.0',
        }),
      );
      // Verify hash fields are present
      const calledWith = mockInsertValues.mock.calls[0][0];
      expect(calledWith.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(calledWith.previousHash).toBe(GENESIS_HASH); // genesis case
      expect(calledWith.createdAt).toBeInstanceOf(Date);
    });

    it('should capture IP and user agent from request', async () => {
      const req = createMockRequest({
        ip: '10.0.0.42',
        headers: { 'user-agent': 'MobileApp/2.3' },
      });
      AuditService.logPiiAccess(req, PII_ACTIONS.VIEW_LIST, 'respondent_list', null);

      await flushPromises();

      const calledWith = mockInsertValues.mock.calls[0][0];
      expect(calledWith.ipAddress).toBe('10.0.0.42');
      expect(calledWith.userAgent).toBe('MobileApp/2.3');
    });

    it('should handle null targetId for list views', async () => {
      const req = createMockRequest();
      AuditService.logPiiAccess(req, PII_ACTIONS.VIEW_LIST, 'respondent_list', null, {
        filters: { lgaId: 'ib-north' },
        page: 1,
        pageSize: 25,
      });

      await flushPromises();

      const calledWith = mockInsertValues.mock.calls[0][0];
      expect(calledWith.targetId).toBeNull();
      expect(calledWith.details).toMatchObject({
        filters: { lgaId: 'ib-north' },
        page: 1,
        pageSize: 25,
        actorRole: 'super_admin',
      });
    });

    it('should not throw when fire-and-forget encounters an error', async () => {
      mockTxExecute.mockRejectedValueOnce(new Error('DB connection lost'));

      const req = createMockRequest();
      AuditService.logPiiAccess(req, PII_ACTIONS.VIEW_RECORD, 'respondent', 'target-001');

      await flushPromises();

      expect(mockWarn).toHaveBeenCalledOnce();
    });

    it('should fall back to socket.remoteAddress when req.ip is undefined', async () => {
      const req = createMockRequest({ ip: undefined });
      AuditService.logPiiAccess(req, PII_ACTIONS.SEARCH_PII, 'respondent', null);

      await flushPromises();

      const calledWith = mockInsertValues.mock.calls[0][0];
      expect(calledWith.ipAddress).toBe('127.0.0.1');
    });

    it('should log PII export action with format details', async () => {
      const req = createMockRequest();
      AuditService.logPiiAccess(req, PII_ACTIONS.EXPORT_CSV, 'respondent_export', null, {
        filters: { lgaId: 'ib-south' },
        recordCount: 150,
        format: 'csv',
      });

      await flushPromises();

      const calledWith = mockInsertValues.mock.calls[0][0];
      expect(calledWith.action).toBe('pii.export_csv');
      expect(calledWith.targetResource).toBe('respondent_export');
      expect(calledWith.details.format).toBe('csv');
      expect(calledWith.details.recordCount).toBe(150);
    });

    it('should use previous hash from existing records when available', async () => {
      const existingHash = 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd';
      mockTxExecute.mockResolvedValueOnce({ rows: [{ hash: existingHash }] });

      const req = createMockRequest();
      AuditService.logPiiAccess(req, PII_ACTIONS.VIEW_RECORD, 'respondent', 'target-001');

      await flushPromises();

      const calledWith = mockInsertValues.mock.calls[0][0];
      expect(calledWith.previousHash).toBe(existingHash);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Existing: logPiiAccessTx (transactional) — adapted for hash chain
  // ────────────────────────────────────────────────────────────────────

  describe('logPiiAccessTx (transactional)', () => {
    it('should insert audit log within transaction with hash', async () => {
      const tx = createMockTx();
      await AuditService.logPiiAccessTx(
        tx,
        'actor-uuid-002',
        PII_ACTIONS.EXPORT_PDF,
        'respondent_export',
        null,
        { recordCount: 50, format: 'pdf' },
        '10.0.0.1',
        'AdminBrowser/1.0',
        'super_admin',
      );

      expect(mockTxInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'mock-uuid-v7',
          actorId: 'actor-uuid-002',
          action: 'pii.export_pdf',
          targetResource: 'respondent_export',
          targetId: null,
          details: { recordCount: 50, format: 'pdf', actorRole: 'super_admin' },
          ipAddress: '10.0.0.1',
          userAgent: 'AdminBrowser/1.0',
        }),
      );
      // Verify hash chain fields
      const calledWith = mockTxInsertValues.mock.calls[0][0];
      expect(calledWith.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(calledWith.previousHash).toBe(GENESIS_HASH); // genesis case
      expect(calledWith.createdAt).toBeInstanceOf(Date);
    });

    it('should include actorRole in details when provided', async () => {
      const tx = createMockTx();
      await AuditService.logPiiAccessTx(
        tx,
        'actor-uuid-004',
        PII_ACTIONS.VIEW_RECORD,
        'respondent',
        'target-uuid-010',
        { fieldsAccessed: ['name', 'nin'] },
        '10.0.0.5',
        'Browser/3.0',
        'assessor',
      );

      const calledWith = mockTxInsertValues.mock.calls[0][0];
      expect(calledWith.details).toEqual({
        fieldsAccessed: ['name', 'nin'],
        actorRole: 'assessor',
      });
    });

    it('should use default values for optional ipAddress and userAgent', async () => {
      const tx = createMockTx();
      await AuditService.logPiiAccessTx(
        tx,
        'actor-uuid-003',
        PII_ACTIONS.VIEW_RECORD,
        'respondent',
        'target-uuid-005',
      );

      const calledWith = mockTxInsertValues.mock.calls[0][0];
      expect(calledWith.ipAddress).toBe('unknown');
      expect(calledWith.userAgent).toBe('unknown');
      expect(calledWith.details).toBeNull();
    });

    it('should propagate errors from transaction insert', async () => {
      const failingTx = {
        execute: vi.fn().mockResolvedValue({ rows: [] }),
        insert: () => ({
          values: () => Promise.reject(new Error('Transaction rollback')),
        }),
      };

      await expect(
        AuditService.logPiiAccessTx(
          failingTx as any,
          'actor-001',
          PII_ACTIONS.VIEW_RECORD,
          'respondent',
          'target-001',
        ),
      ).rejects.toThrow('Transaction rollback');
    });

    it('should use previous hash from existing records', async () => {
      const existingHash = 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd';
      const tx = createMockTx(existingHash);

      await AuditService.logPiiAccessTx(
        tx,
        'actor-uuid-005',
        PII_ACTIONS.VIEW_RECORD,
        'respondent',
        'target-uuid-020',
      );

      const calledWith = mockTxInsertValues.mock.calls[0][0];
      expect(calledWith.previousHash).toBe(existingHash);
    });

    it('should call tx.execute for hash chain serialization (FOR UPDATE)', async () => {
      const tx = createMockTx();
      await AuditService.logPiiAccessTx(
        tx,
        'actor-uuid-006',
        PII_ACTIONS.VIEW_LIST,
        'respondent_list',
        null,
      );

      expect(tx.execute).toHaveBeenCalledOnce();
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Task 7.6, 7.7: Hash chain verification
  // ────────────────────────────────────────────────────────────────────

  describe('verifyHashChain', () => {
    it('should return valid for empty audit log (Task 7.6)', async () => {
      mockDbExecute.mockResolvedValueOnce({ rows: [{ cnt: '0' }] });

      const result = await AuditService.verifyHashChain();
      expect(result).toEqual({ valid: true, totalRecords: 0, verified: 0 });
    });

    it('should verify a valid single-record chain (Task 7.6)', async () => {
      const createdAt = new Date('2026-02-25T12:00:00.000Z');
      const hash = AuditService.computeHash('rec-1', 'pii.view_record', 'actor-1', createdAt, { actorRole: 'super_admin' }, GENESIS_HASH);

      // First call: COUNT query
      mockDbExecute.mockResolvedValueOnce({ rows: [{ cnt: '1' }] });
      // Second call: SELECT records
      mockDbExecute.mockResolvedValueOnce({
        rows: [{
          id: 'rec-1',
          action: 'pii.view_record',
          actor_id: 'actor-1',
          created_at: createdAt.toISOString(),
          details: { actorRole: 'super_admin' },
          hash,
          previous_hash: null,
        }],
      });

      const result = await AuditService.verifyHashChain();
      expect(result).toEqual({ valid: true, totalRecords: 1, verified: 1 });
    });

    it('should verify a valid multi-record chain (Task 7.6)', async () => {
      const date1 = new Date('2026-02-25T12:00:00.000Z');
      const date2 = new Date('2026-02-25T12:01:00.000Z');
      const hash1 = AuditService.computeHash('rec-1', 'pii.view_record', 'actor-1', date1, {}, GENESIS_HASH);
      const hash2 = AuditService.computeHash('rec-2', 'pii.view_list', 'actor-2', date2, {}, hash1);

      mockDbExecute.mockResolvedValueOnce({ rows: [{ cnt: '2' }] });
      mockDbExecute.mockResolvedValueOnce({
        rows: [
          { id: 'rec-1', action: 'pii.view_record', actor_id: 'actor-1', created_at: date1.toISOString(), details: {}, hash: hash1, previous_hash: null },
          { id: 'rec-2', action: 'pii.view_list', actor_id: 'actor-2', created_at: date2.toISOString(), details: {}, hash: hash2, previous_hash: hash1 },
        ],
      });

      const result = await AuditService.verifyHashChain();
      expect(result).toEqual({ valid: true, totalRecords: 2, verified: 2 });
    });

    it('should detect a tampered record hash (Task 7.7)', async () => {
      const date1 = new Date('2026-02-25T12:00:00.000Z');
      const hash1 = AuditService.computeHash('rec-1', 'pii.view_record', 'actor-1', date1, {}, GENESIS_HASH);

      mockDbExecute.mockResolvedValueOnce({ rows: [{ cnt: '1' }] });
      mockDbExecute.mockResolvedValueOnce({
        rows: [{
          id: 'rec-1',
          action: 'pii.view_record',
          actor_id: 'actor-1',
          created_at: date1.toISOString(),
          details: {},
          hash: 'tampered-hash-value-does-not-match-computed-hash-at-all-000000',
          previous_hash: null,
        }],
      });

      const result = await AuditService.verifyHashChain();
      expect(result.valid).toBe(false);
      expect(result.firstTampered?.id).toBe('rec-1');
    });

    it('should detect a broken chain link (Task 7.7)', async () => {
      const date1 = new Date('2026-02-25T12:00:00.000Z');
      const date2 = new Date('2026-02-25T12:01:00.000Z');
      const hash1 = AuditService.computeHash('rec-1', 'pii.view_record', 'actor-1', date1, {}, GENESIS_HASH);
      // Record 2 has wrong previous_hash (should be hash1 but is something else)
      const wrongPrevHash = 'wrong-previous-hash-that-breaks-the-chain-aaaaaaaaaaaaaaaaaaaaaa';
      const hash2 = AuditService.computeHash('rec-2', 'pii.view_list', 'actor-2', date2, {}, wrongPrevHash);

      mockDbExecute.mockResolvedValueOnce({ rows: [{ cnt: '2' }] });
      mockDbExecute.mockResolvedValueOnce({
        rows: [
          { id: 'rec-1', action: 'pii.view_record', actor_id: 'actor-1', created_at: date1.toISOString(), details: {}, hash: hash1, previous_hash: null },
          { id: 'rec-2', action: 'pii.view_list', actor_id: 'actor-2', created_at: date2.toISOString(), details: {}, hash: hash2, previous_hash: wrongPrevHash },
        ],
      });

      const result = await AuditService.verifyHashChain();
      expect(result.valid).toBe(false);
      expect(result.firstTampered?.id).toBe('rec-2');
    });

    it('should support spot-check mode with limit parameter', async () => {
      const date1 = new Date('2026-02-25T12:00:00.000Z');
      const hash1 = AuditService.computeHash('rec-1', 'pii.view_record', 'actor-1', date1, {}, GENESIS_HASH);

      mockDbExecute.mockResolvedValueOnce({ rows: [{ cnt: '100' }] });
      mockDbExecute.mockResolvedValueOnce({
        rows: [{
          id: 'rec-1',
          action: 'pii.view_record',
          actor_id: 'actor-1',
          created_at: date1.toISOString(),
          details: {},
          hash: hash1,
          previous_hash: null,
        }],
      });

      const result = await AuditService.verifyHashChain({ limit: 10 });
      expect(result.valid).toBe(true);
      expect(result.totalRecords).toBe(100);
      expect(result.verified).toBe(1);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // getRecordCount
  // ────────────────────────────────────────────────────────────────────

  describe('getRecordCount', () => {
    it('should return the total count from database', async () => {
      mockDbExecute.mockResolvedValueOnce({ rows: [{ cnt: '42' }] });

      const count = await AuditService.getRecordCount();
      expect(count).toBe(42);
    });
  });
});
