import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ────────────────────────────────────────────────────

const mockExecute = vi.fn();

vi.mock('../../db/index.js', () => ({
  db: {
    execute: (...args: unknown[]) => mockExecute(...args),
  },
}));

// Import after mocks
const { ExportQueryService } = await import('../export-query.service.js');

// ── Test data ─────────────────────────────────────────────────────────

const mockRow = {
  first_name: 'Adewale',
  last_name: 'Johnson',
  nin: '61961438053',
  phone_number: '+2348012345678',
  date_of_birth: '1990-05-15',
  lga_name: 'Ibadan North',
  source: 'enumerator',
  registered_at: new Date('2026-01-15T10:00:00.000Z'),
  fraud_severity: 'medium',
  verification_status: 'confirmed_fraud',
};

const mockRow2 = {
  first_name: 'Bola',
  last_name: 'Ige',
  nin: '21647846180',
  phone_number: '+2348098765432',
  date_of_birth: '1985-03-20',
  lga_name: 'Ibadan South',
  source: 'public',
  registered_at: new Date('2026-02-01T14:30:00.000Z'),
  fraud_severity: 'clean',
  verification_status: null,
};

// ── Tests ─────────────────────────────────────────────────────────────

describe('ExportQueryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getRespondentExportData', () => {
    it('returns data with all columns populated', async () => {
      mockExecute.mockResolvedValue({ rows: [mockRow] });

      const result = await ExportQueryService.getRespondentExportData({});

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual({
        firstName: 'Adewale',
        lastName: 'Johnson',
        nin: '61961438053',
        phoneNumber: '+2348012345678',
        dateOfBirth: '1990-05-15',
        lgaName: 'Ibadan North',
        source: 'enumerator',
        registeredAt: '2026-01-15T10:00:00.000Z',
        fraudSeverity: 'medium',
        verificationStatus: 'confirmed_fraud',
      });
      expect(result.totalCount).toBe(1);
    });

    it('applies LGA filter correctly', async () => {
      mockExecute.mockResolvedValue({ rows: [mockRow] });

      await ExportQueryService.getRespondentExportData({ lgaId: 'ibadan-north' });

      expect(mockExecute).toHaveBeenCalledTimes(1);
      // Verify the SQL contains the LGA filter parameter
      const sqlObj = mockExecute.mock.calls[0][0];
      const queryResult = sqlObj.toQuery({ escapeName: (n: string) => `"${n}"`, escapeParam: (_: unknown, idx: number) => `$${idx + 1}` });
      expect(queryResult.sql).toContain('r.lga_id =');
      expect(queryResult.params).toContain('ibadan-north');
    });

    it('applies date range filter', async () => {
      mockExecute.mockResolvedValue({ rows: [] });

      await ExportQueryService.getRespondentExportData({
        dateFrom: '2026-01-01T00:00:00.000Z',
        dateTo: '2026-01-31T23:59:59.999Z',
      });

      expect(mockExecute).toHaveBeenCalledTimes(1);
      const sqlObj = mockExecute.mock.calls[0][0];
      const queryResult = sqlObj.toQuery({ escapeName: (n: string) => `"${n}"`, escapeParam: (_: unknown, idx: number) => `$${idx + 1}` });
      expect(queryResult.sql).toContain('r.created_at >=');
      expect(queryResult.sql).toContain('r.created_at <=');
      expect(queryResult.params).toContain('2026-01-01T00:00:00.000Z');
      expect(queryResult.params).toContain('2026-01-31T23:59:59.999Z');
    });

    it('applies source channel filter', async () => {
      mockExecute.mockResolvedValue({ rows: [mockRow2] });

      await ExportQueryService.getRespondentExportData({ source: 'public' });

      expect(mockExecute).toHaveBeenCalledTimes(1);
      const sqlObj = mockExecute.mock.calls[0][0];
      const queryResult = sqlObj.toQuery({ escapeName: (n: string) => `"${n}"`, escapeParam: (_: unknown, idx: number) => `$${idx + 1}` });
      expect(queryResult.sql).toContain('r.source =');
      expect(queryResult.params).toContain('public');
    });

    it('applies fraud severity filter', async () => {
      mockExecute.mockResolvedValue({ rows: [mockRow] });

      await ExportQueryService.getRespondentExportData({ severity: 'medium' });

      expect(mockExecute).toHaveBeenCalledTimes(1);
      const sqlObj = mockExecute.mock.calls[0][0];
      const queryResult = sqlObj.toQuery({ escapeName: (n: string) => `"${n}"`, escapeParam: (_: unknown, idx: number) => `$${idx + 1}` });
      expect(queryResult.sql).toContain('fd.severity =');
      expect(queryResult.params).toContain('medium');
    });

    it('applies verification status filter', async () => {
      mockExecute.mockResolvedValue({ rows: [mockRow] });

      await ExportQueryService.getRespondentExportData({ verificationStatus: 'confirmed_fraud' });

      expect(mockExecute).toHaveBeenCalledTimes(1);
      const sqlObj = mockExecute.mock.calls[0][0];
      const queryResult = sqlObj.toQuery({ escapeName: (n: string) => `"${n}"`, escapeParam: (_: unknown, idx: number) => `$${idx + 1}` });
      expect(queryResult.sql).toContain('fd.resolution =');
      expect(queryResult.params).toContain('confirmed_fraud');
    });

    it('handles empty result set', async () => {
      mockExecute.mockResolvedValue({ rows: [] });

      const result = await ExportQueryService.getRespondentExportData({ lgaId: 'nonexistent' });

      expect(result.data).toHaveLength(0);
      expect(result.totalCount).toBe(0);
    });

    it('maps null values to empty strings', async () => {
      const rowWithNulls = {
        first_name: null,
        last_name: null,
        nin: '61961438053',
        phone_number: null,
        date_of_birth: null,
        lga_name: null,
        source: 'enumerator',
        registered_at: new Date('2026-01-15T10:00:00.000Z'),
        fraud_severity: null,
        verification_status: null,
      };
      mockExecute.mockResolvedValue({ rows: [rowWithNulls] });

      const result = await ExportQueryService.getRespondentExportData({});

      expect(result.data[0].firstName).toBe('');
      expect(result.data[0].lastName).toBe('');
      expect(result.data[0].phoneNumber).toBe('');
      expect(result.data[0].dateOfBirth).toBe('');
      expect(result.data[0].lgaName).toBe('');
      expect(result.data[0].fraudSeverity).toBe('');
      expect(result.data[0].verificationStatus).toBe('');
    });
  });

  describe('getFilteredCount', () => {
    it('returns count for preview', async () => {
      mockExecute.mockResolvedValue({ rows: [{ count: '42' }] });

      const count = await ExportQueryService.getFilteredCount({});

      expect(count).toBe(42);
      expect(mockExecute).toHaveBeenCalledTimes(1);
    });

    it('returns 0 for empty result', async () => {
      mockExecute.mockResolvedValue({ rows: [{ count: '0' }] });

      const count = await ExportQueryService.getFilteredCount({ lgaId: 'nonexistent' });

      expect(count).toBe(0);
    });

    it('applies filters in count query', async () => {
      mockExecute.mockResolvedValue({ rows: [{ count: '5' }] });

      await ExportQueryService.getFilteredCount({ lgaId: 'ibadan-north', severity: 'high' });

      expect(mockExecute).toHaveBeenCalledTimes(1);
      const sqlObj = mockExecute.mock.calls[0][0];
      const queryResult = sqlObj.toQuery({ escapeName: (n: string) => `"${n}"`, escapeParam: (_: unknown, idx: number) => `$${idx + 1}` });
      expect(queryResult.sql).toContain('r.lga_id =');
      expect(queryResult.sql).toContain('fd.severity =');
      expect(queryResult.params).toContain('ibadan-north');
      expect(queryResult.params).toContain('high');
    });
  });
});
