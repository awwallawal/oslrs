import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NativeFormSchema } from '@oslsr/types';

// ── Hoisted mocks ────────────────────────────────────────────────────

const mockExecute = vi.fn();

vi.mock('../../db/index.js', () => ({
  db: {
    execute: (...args: unknown[]) => mockExecute(...args),
  },
}));

// Import after mocks
const { ExportQueryService } = await import('../export-query.service.js');
const { buildColumnsFromFormSchema, flattenRawDataRow, buildChoiceMaps } = await import('../export-query.service.js');

// ── Test data ─────────────────────────────────────────────────────────

const mockRow = {
  first_name: 'Adewale',
  last_name: 'Johnson',
  nin: '61961438053',
  phone_number: '+2348012345678',
  date_of_birth: '1990-05-15',
  lga_name: 'Ibadan North',
  source: 'enumerator',
  consent_marketplace: true,
  consent_enriched: false,
  registered_at: new Date('2026-01-15T10:00:00.000Z'),
  total_submissions: 2,
  fraud_score: '45.50',
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
  consent_marketplace: false,
  consent_enriched: false,
  registered_at: new Date('2026-02-01T14:30:00.000Z'),
  total_submissions: 1,
  fraud_score: null,
  fraud_severity: 'clean',
  verification_status: null,
};

// ── Tests ─────────────────────────────────────────────────────────────

describe('ExportQueryService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
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
        consentMarketplace: 'Yes',
        consentEnriched: 'No',
        registeredAt: '2026-01-15',
        totalSubmissions: '2',
        fraudScore: '45.5',
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

  describe('getSubmissionExportData', () => {
    const mockSubmissionRow = {
      nin: '61961438053',
      surname: 'Johnson',
      first_name: 'Adewale',
      lga_name: 'Ibadan North',
      source: 'enumerator',
      submitted_at: new Date('2026-01-15T10:00:00.000Z'),
      enumerator_name: 'Jane Doe',
      completion_time_seconds: 120,
      gps_latitude: 7.3776,
      gps_longitude: 3.9470,
      fraud_score: '45.50',
      fraud_severity: 'medium',
      verification_status: 'confirmed_fraud',
      raw_data: { employment_status: 'employed', main_occupation: 'carpentry' },
    };

    it('returns submission-level data with rawData', async () => {
      mockExecute.mockResolvedValue({ rows: [mockSubmissionRow] });

      const result = await ExportQueryService.getSubmissionExportData({ formId: 'test-form-id' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual({
        nin: '61961438053',
        surname: 'Johnson',
        firstName: 'Adewale',
        lgaName: 'Ibadan North',
        source: 'enumerator',
        submissionDate: '2026-01-15',
        enumeratorName: 'Jane Doe',
        completionTimeSeconds: '120',
        gpsLatitude: '7.3776',
        gpsLongitude: '3.947',
        fraudScore: '45.5',
        fraudSeverity: 'medium',
        verificationStatus: 'confirmed_fraud',
        rawData: { employment_status: 'employed', main_occupation: 'carpentry' },
      });
    });

    it('includes formId in WHERE clause', async () => {
      mockExecute.mockResolvedValue({ rows: [] });

      await ExportQueryService.getSubmissionExportData({ formId: 'abc-123' });

      const sqlObj = mockExecute.mock.calls[0][0];
      const queryResult = sqlObj.toQuery({ escapeName: (n: string) => `"${n}"`, escapeParam: (_: unknown, idx: number) => `$${idx + 1}` });
      expect(queryResult.sql).toContain('s.questionnaire_form_id =');
      expect(queryResult.params).toContain('abc-123');
    });

    it('applies additional filters alongside formId', async () => {
      mockExecute.mockResolvedValue({ rows: [] });

      await ExportQueryService.getSubmissionExportData({
        formId: 'abc-123',
        lgaId: 'ibadan-north',
        severity: 'high',
      });

      const sqlObj = mockExecute.mock.calls[0][0];
      const queryResult = sqlObj.toQuery({ escapeName: (n: string) => `"${n}"`, escapeParam: (_: unknown, idx: number) => `$${idx + 1}` });
      expect(queryResult.sql).toContain('s.questionnaire_form_id =');
      expect(queryResult.sql).toContain('r.lga_id =');
      expect(queryResult.sql).toContain('fd.severity =');
    });

    it('handles null rawData', async () => {
      mockExecute.mockResolvedValue({ rows: [{ ...mockSubmissionRow, raw_data: null }] });

      const result = await ExportQueryService.getSubmissionExportData({ formId: 'test-form-id' });

      expect(result.data[0].rawData).toEqual({});
    });
  });

  describe('getSubmissionFilteredCount', () => {
    it('returns count with formId filter', async () => {
      mockExecute.mockResolvedValue({ rows: [{ count: '25' }] });

      const count = await ExportQueryService.getSubmissionFilteredCount({ formId: 'test-form-id' });

      expect(count).toBe(25);
      const sqlObj = mockExecute.mock.calls[0][0];
      const queryResult = sqlObj.toQuery({ escapeName: (n: string) => `"${n}"`, escapeParam: (_: unknown, idx: number) => `$${idx + 1}` });
      expect(queryResult.sql).toContain('s.questionnaire_form_id =');
    });
  });
});

// ── Pure function tests (buildColumnsFromFormSchema, flattenRawDataRow) ──

const mockSchema: NativeFormSchema = {
  id: 'test-form',
  title: 'Test Form',
  version: '1.0.0',
  status: 'published',
  createdAt: '2026-01-01',
  sections: [
    {
      id: 'section-1',
      title: 'Demographics',
      questions: [
        { id: 'q1', type: 'text', name: 'full_name', label: 'Full Name', required: true },
        { id: 'q2', type: 'number', name: 'age', label: 'Age', required: false },
        { id: 'q3', type: 'note', name: 'note_1', label: 'Please answer carefully', required: false },
        { id: 'q4', type: 'select_one', name: 'employment_status', label: 'Employment Status', required: true, choices: 'employment_choices' },
      ],
    },
    {
      id: 'section-2',
      title: 'Skills',
      questions: [
        { id: 'q5', type: 'select_multiple', name: 'skills_possessed', label: 'Skills Possessed', required: false, choices: 'skill_choices' },
        { id: 'q6', type: 'geopoint', name: 'location', label: 'GPS Location', required: false },
        { id: 'q7', type: 'date', name: 'training_date', label: 'Training Completion Date', required: false },
      ],
    },
  ],
  choiceLists: {
    employment_choices: [
      { label: 'Wage Earner (Government/Public Sector)', value: 'wage_public' },
      { label: 'Self-Employed', value: 'self_employed' },
      { label: 'Unemployed', value: 'unemployed' },
    ],
    skill_choices: [
      { label: 'Carpentry/Woodwork', value: 'carpentry' },
      { label: 'Plumbing', value: 'plumbing' },
      { label: 'Welding & Fabrication', value: 'welding' },
      { label: 'Tailoring', value: 'tailoring' },
    ],
  },
};

describe('buildColumnsFromFormSchema', () => {
  it('builds columns from form schema in section order', () => {
    const columns = buildColumnsFromFormSchema(mockSchema);

    // 7 questions - 2 skipped (note + geopoint) = 5 exportable columns
    expect(columns).toHaveLength(5);
  });

  it('skips note question types', () => {
    const columns = buildColumnsFromFormSchema(mockSchema);

    const names = columns.map((c) => c.key);
    expect(names).not.toContain('note_1');
  });

  it('skips geopoint question types', () => {
    const columns = buildColumnsFromFormSchema(mockSchema);

    const names = columns.map((c) => c.key);
    expect(names).not.toContain('location');
  });

  it('uses question label as column header', () => {
    const columns = buildColumnsFromFormSchema(mockSchema);

    expect(columns[0].header).toBe('Full Name');
    expect(columns[0].key).toBe('full_name');
  });

  it('preserves section ordering', () => {
    const columns = buildColumnsFromFormSchema(mockSchema);
    const keys = columns.map((c) => c.key);

    expect(keys).toEqual([
      'full_name',
      'age',
      'employment_status',
      'skills_possessed',
      'training_date',
    ]);
  });
});

describe('flattenRawDataRow', () => {
  it('maps select_one coded value to label', () => {
    const rawData = { employment_status: 'wage_public' };
    const result = flattenRawDataRow(rawData, mockSchema);

    expect(result.employment_status).toBe('Wage Earner (Government/Public Sector)');
  });

  it('maps select_multiple space-delimited codes to semicolon-delimited labels', () => {
    const rawData = { skills_possessed: 'carpentry plumbing welding' };
    const result = flattenRawDataRow(rawData, mockSchema);

    expect(result.skills_possessed).toBe('Carpentry/Woodwork; Plumbing; Welding & Fabrication');
  });

  it('passes through text values unchanged', () => {
    const rawData = { full_name: 'Adewale Johnson' };
    const result = flattenRawDataRow(rawData, mockSchema);

    expect(result.full_name).toBe('Adewale Johnson');
  });

  it('passes through number values as string', () => {
    const rawData = { age: 35 };
    const result = flattenRawDataRow(rawData, mockSchema);

    expect(result.age).toBe('35');
  });

  it('passes through date values as string', () => {
    const rawData = { training_date: '2026-06-15' };
    const result = flattenRawDataRow(rawData, mockSchema);

    expect(result.training_date).toBe('2026-06-15');
  });

  it('returns empty string for missing rawData keys', () => {
    const rawData = { full_name: 'Test' }; // no age, employment_status, skills, training_date
    const result = flattenRawDataRow(rawData, mockSchema);

    expect(result.age).toBe('');
    expect(result.employment_status).toBe('');
    expect(result.skills_possessed).toBe('');
    expect(result.training_date).toBe('');
  });

  it('returns empty string for null values', () => {
    const rawData = { full_name: null, age: null };
    const result = flattenRawDataRow(rawData as Record<string, unknown>, mockSchema);

    expect(result.full_name).toBe('');
    expect(result.age).toBe('');
  });

  it('falls back to raw value for unknown choice code', () => {
    const rawData = { employment_status: 'unknown_code' };
    const result = flattenRawDataRow(rawData, mockSchema);

    expect(result.employment_status).toBe('unknown_code');
  });

  it('falls back to raw codes for unknown select_multiple codes', () => {
    const rawData = { skills_possessed: 'carpentry unknown_skill' };
    const result = flattenRawDataRow(rawData, mockSchema);

    expect(result.skills_possessed).toBe('Carpentry/Woodwork; unknown_skill');
  });

  it('does not include note or geopoint fields in output', () => {
    const rawData = { note_1: 'should not appear', location: '7.3 3.9' };
    const result = flattenRawDataRow(rawData, mockSchema);

    expect(result).not.toHaveProperty('note_1');
    expect(result).not.toHaveProperty('location');
  });

  it('accepts pre-built choiceMaps for O(1) lookups', () => {
    const maps = buildChoiceMaps(mockSchema);
    const rawData = { employment_status: 'wage_public', skills_possessed: 'carpentry plumbing' };
    const result = flattenRawDataRow(rawData, mockSchema, maps);

    expect(result.employment_status).toBe('Wage Earner (Government/Public Sector)');
    expect(result.skills_possessed).toBe('Carpentry/Woodwork; Plumbing');
  });
});

describe('buildChoiceMaps', () => {
  it('builds Maps from choiceLists for O(1) lookup', () => {
    const maps = buildChoiceMaps(mockSchema);

    expect(maps.size).toBe(2);
    expect(maps.get('employment_choices')?.get('wage_public')).toBe('Wage Earner (Government/Public Sector)');
    expect(maps.get('skill_choices')?.get('carpentry')).toBe('Carpentry/Woodwork');
  });

  it('returns empty Map for schema with no choiceLists', () => {
    const emptySchema: NativeFormSchema = { ...mockSchema, choiceLists: {} };
    const maps = buildChoiceMaps(emptySchema);

    expect(maps.size).toBe(0);
  });
});
