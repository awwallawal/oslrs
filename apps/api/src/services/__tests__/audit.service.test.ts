import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks (available inside vi.mock) ───────────────────────────

const { mockInsertValues, mockCatch, mockTxInsertValues, mockWarn } = vi.hoisted(() => ({
  mockInsertValues: vi.fn(),
  mockCatch: vi.fn(),
  mockTxInsertValues: vi.fn(),
  mockWarn: vi.fn(),
}));

vi.mock('../../db/index.js', () => ({
  db: {
    insert: () => ({
      values: (vals: any) => {
        mockInsertValues(vals);
        return { catch: mockCatch };
      },
    }),
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

import { AuditService, PII_ACTIONS } from '../audit.service.js';

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

function createMockTx(): any {
  return {
    insert: () => ({
      values: (vals: any) => {
        mockTxInsertValues(vals);
        return Promise.resolve();
      },
    }),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('AuditService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('PII_ACTIONS constants', () => {
    it('should define all expected PII action constants', () => {
      expect(PII_ACTIONS.VIEW_RECORD).toBe('pii.view_record');
      expect(PII_ACTIONS.VIEW_LIST).toBe('pii.view_list');
      expect(PII_ACTIONS.EXPORT_CSV).toBe('pii.export_csv');
      expect(PII_ACTIONS.EXPORT_PDF).toBe('pii.export_pdf');
      expect(PII_ACTIONS.SEARCH_PII).toBe('pii.search');
    });

    it('should have exactly 5 action types', () => {
      expect(Object.keys(PII_ACTIONS)).toHaveLength(5);
    });
  });

  describe('logPiiAccess (fire-and-forget)', () => {
    it('should insert audit log with correct fields from request', () => {
      const req = createMockRequest();
      AuditService.logPiiAccess(req, PII_ACTIONS.VIEW_RECORD, 'respondent', 'target-uuid-001', {
        fieldsAccessed: ['name', 'nin', 'phone'],
      });

      expect(mockInsertValues).toHaveBeenCalledWith({
        id: 'mock-uuid-v7',
        actorId: 'actor-uuid-001',
        action: 'pii.view_record',
        targetResource: 'respondent',
        targetId: 'target-uuid-001',
        details: {
          fieldsAccessed: ['name', 'nin', 'phone'],
          actorRole: 'super_admin',
        },
        ipAddress: '192.168.1.100',
        userAgent: 'TestBrowser/1.0',
      });
    });

    it('should capture IP and user agent from request', () => {
      const req = createMockRequest({
        ip: '10.0.0.42',
        headers: { 'user-agent': 'MobileApp/2.3' },
      });
      AuditService.logPiiAccess(req, PII_ACTIONS.VIEW_LIST, 'respondent_list', null);

      const calledWith = mockInsertValues.mock.calls[0][0];
      expect(calledWith.ipAddress).toBe('10.0.0.42');
      expect(calledWith.userAgent).toBe('MobileApp/2.3');
    });

    it('should handle null targetId for list views', () => {
      const req = createMockRequest();
      AuditService.logPiiAccess(req, PII_ACTIONS.VIEW_LIST, 'respondent_list', null, {
        filters: { lgaId: 'ib-north' },
        page: 1,
        pageSize: 25,
      });

      const calledWith = mockInsertValues.mock.calls[0][0];
      expect(calledWith.targetId).toBeNull();
      expect(calledWith.details).toEqual({
        filters: { lgaId: 'ib-north' },
        page: 1,
        pageSize: 25,
        actorRole: 'super_admin',
      });
    });

    it('should register a .catch handler for error resilience', () => {
      const req = createMockRequest();
      AuditService.logPiiAccess(req, PII_ACTIONS.VIEW_RECORD, 'respondent', 'target-001');

      expect(mockCatch).toHaveBeenCalledOnce();
      expect(typeof mockCatch.mock.calls[0][0]).toBe('function');
    });

    it('should not throw when fire-and-forget catch handler is invoked', () => {
      const req = createMockRequest();
      AuditService.logPiiAccess(req, PII_ACTIONS.VIEW_RECORD, 'respondent', 'target-001');

      const catchHandler = mockCatch.mock.calls[0][0];
      expect(() => catchHandler(new Error('DB connection lost'))).not.toThrow();
      expect(mockWarn).toHaveBeenCalledOnce();
    });

    it('should fall back to socket.remoteAddress when req.ip is undefined', () => {
      const req = createMockRequest({ ip: undefined });
      AuditService.logPiiAccess(req, PII_ACTIONS.SEARCH_PII, 'respondent', null);

      const calledWith = mockInsertValues.mock.calls[0][0];
      expect(calledWith.ipAddress).toBe('127.0.0.1');
    });

    it('should log PII export action with format details', () => {
      const req = createMockRequest();
      AuditService.logPiiAccess(req, PII_ACTIONS.EXPORT_CSV, 'respondent_export', null, {
        filters: { lgaId: 'ib-south' },
        recordCount: 150,
        format: 'csv',
      });

      const calledWith = mockInsertValues.mock.calls[0][0];
      expect(calledWith.action).toBe('pii.export_csv');
      expect(calledWith.targetResource).toBe('respondent_export');
      expect(calledWith.details.format).toBe('csv');
      expect(calledWith.details.recordCount).toBe(150);
    });
  });

  describe('logPiiAccessTx (transactional)', () => {
    it('should insert audit log within transaction', async () => {
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

      expect(mockTxInsertValues).toHaveBeenCalledWith({
        id: 'mock-uuid-v7',
        actorId: 'actor-uuid-002',
        action: 'pii.export_pdf',
        targetResource: 'respondent_export',
        targetId: null,
        details: { recordCount: 50, format: 'pdf', actorRole: 'super_admin' },
        ipAddress: '10.0.0.1',
        userAgent: 'AdminBrowser/1.0',
      });
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
  });
});
