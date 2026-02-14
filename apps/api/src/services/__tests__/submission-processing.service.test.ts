import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NativeFormSchema } from '@oslsr/types';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockFindFirstSubmission = vi.fn();
const mockFindFirstForm = vi.fn();
const mockFindFirstRespondent = vi.fn();
const mockFindFirstUser = vi.fn();
const mockFindFirstRole = vi.fn();
const mockInsertRespondent = vi.fn();
const mockUpdateSubmissionSet = vi.fn();
const mockQueueFraudDetection = vi.fn();

vi.mock('../../db/index.js', () => ({
  db: {
    query: {
      submissions: { findFirst: (...args: unknown[]) => mockFindFirstSubmission(...args) },
      questionnaireForms: { findFirst: (...args: unknown[]) => mockFindFirstForm(...args) },
      respondents: { findFirst: (...args: unknown[]) => mockFindFirstRespondent(...args) },
      users: { findFirst: (...args: unknown[]) => mockFindFirstUser(...args) },
      roles: { findFirst: (...args: unknown[]) => mockFindFirstRole(...args) },
    },
    insert: (...args: unknown[]) => {
      mockInsertRespondent(...args);
      return {
        values: (val: unknown) => ({
          returning: () => [{ id: 'resp-001', ...val as Record<string, unknown> }],
        }),
      };
    },
    update: (...args: unknown[]) => {
      return {
        set: (val: unknown) => {
          mockUpdateSubmissionSet(val);
          return {
            where: () => Promise.resolve(),
          };
        },
      };
    },
  },
}));

vi.mock('../../queues/fraud-detection.queue.js', () => ({
  queueFraudDetection: (...args: unknown[]) => mockQueueFraudDetection(...args),
}));

vi.mock('uuidv7', () => ({
  uuidv7: () => 'mock-uuid-v7-001',
}));

vi.mock('pino', () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Import after mocks
import { SubmissionProcessingService, RESPONDENT_FIELD_MAP } from '../submission-processing.service.js';

// ── Test Helpers ───────────────────────────────────────────────────────────

function makeFormSchema(): NativeFormSchema {
  return {
    id: 'form-001',
    title: 'Test Survey',
    version: '1.0.0',
    status: 'published',
    sections: [
      {
        id: 'sect-1',
        title: 'Identity',
        questions: [
          { id: 'q1', type: 'text', name: 'nin', label: 'NIN', required: true },
          { id: 'q2', type: 'text', name: 'first_name', label: 'First Name', required: true },
          { id: 'q3', type: 'text', name: 'last_name', label: 'Last Name', required: true },
          { id: 'q4', type: 'text', name: 'date_of_birth', label: 'DOB', required: false },
          { id: 'q5', type: 'text', name: 'phone_number', label: 'Phone', required: false },
          { id: 'q6', type: 'text', name: 'lga_id', label: 'LGA', required: false },
          { id: 'q7', type: 'select_one', name: 'consent_marketplace', label: 'Marketplace?', required: false, choices: 'yes_no' },
          { id: 'q8', type: 'select_one', name: 'consent_enriched', label: 'Enriched?', required: false, choices: 'yes_no' },
        ],
      },
    ],
    choiceLists: { yes_no: [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }] },
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeSubmission(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-001',
    submissionUid: 'uid-001',
    questionnaireFormId: 'form-001',
    submitterId: 'user-001',
    source: 'webapp',
    processed: false,
    processedAt: null,
    processingError: null,
    gpsLatitude: 7.3775,
    gpsLongitude: 3.9470,
    rawData: {
      nin: '61961438053',
      first_name: 'Adewale',
      last_name: 'Johnson',
      date_of_birth: '1990-05-15',
      phone_number: '08012345678',
      lga_id: 'ibadan_north',
      consent_marketplace: 'yes',
      consent_enriched: 'no',
    },
    ...overrides,
  };
}

/** Mock user + role lookup for enumerator (+ cross-table NIN check returns null) */
function mockEnumeratorRole() {
  mockFindFirstUser.mockResolvedValueOnce({ roleId: 'role-enum' }); // determineSubmitterRole
  mockFindFirstUser.mockResolvedValueOnce(null); // cross-table NIN check (no staff match)
  mockFindFirstRole.mockResolvedValue({ name: 'enumerator' });
}

/** Mock user + role lookup for public_user (+ cross-table NIN check returns null) */
function mockPublicUserRole() {
  mockFindFirstUser.mockResolvedValueOnce({ roleId: 'role-pub' }); // determineSubmitterRole
  mockFindFirstUser.mockResolvedValueOnce(null); // cross-table NIN check (no staff match)
  mockFindFirstRole.mockResolvedValue({ name: 'public_user' });
}

/** Mock user + role lookup for data_entry_clerk (+ cross-table NIN check returns null) */
function mockClerkRole() {
  mockFindFirstUser.mockResolvedValueOnce({ roleId: 'role-clerk' }); // determineSubmitterRole
  mockFindFirstUser.mockResolvedValueOnce(null); // cross-table NIN check (no staff match)
  mockFindFirstRole.mockResolvedValue({ name: 'data_entry_clerk' });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('SubmissionProcessingService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('processSubmission', () => {
    it('should process a valid submission: create respondent, link submission, queue fraud', async () => {
      const submission = makeSubmission();
      mockFindFirstSubmission.mockResolvedValue(submission);
      mockFindFirstForm.mockResolvedValue({ formSchema: makeFormSchema() });
      mockFindFirstRespondent.mockResolvedValue(null); // New respondent
      mockEnumeratorRole();

      const result = await SubmissionProcessingService.processSubmission('sub-001');

      expect(result.action).toBe('processed');
      expect(result.respondentId).toBe('resp-001');
      expect(mockInsertRespondent).toHaveBeenCalled();
      expect(mockUpdateSubmissionSet).toHaveBeenCalled();
      expect(mockQueueFraudDetection).toHaveBeenCalled();
    });

    it('should skip already-processed submission (idempotent)', async () => {
      const submission = makeSubmission({ processed: true, processedAt: new Date() });
      mockFindFirstSubmission.mockResolvedValue(submission);

      const result = await SubmissionProcessingService.processSubmission('sub-001');

      expect(result.action).toBe('skipped');
      expect(mockFindFirstForm).not.toHaveBeenCalled();
      expect(mockInsertRespondent).not.toHaveBeenCalled();
      expect(mockUpdateSubmissionSet).not.toHaveBeenCalled();
    });

    it('should reject submission on duplicate NIN with original registration date (AC 3.7.1)', async () => {
      const registrationDate = new Date('2026-02-10T14:30:00.000Z');
      const submission = makeSubmission();
      mockFindFirstSubmission.mockResolvedValue(submission);
      mockFindFirstForm.mockResolvedValue({ formSchema: makeFormSchema() });
      mockFindFirstRespondent.mockResolvedValue({
        id: 'existing-resp',
        nin: '61961438053',
        source: 'enumerator',
        createdAt: registrationDate,
      });
      mockEnumeratorRole();

      await expect(
        SubmissionProcessingService.processSubmission('sub-001')
      ).rejects.toThrow('NIN_DUPLICATE');

      // DB update is handled by the worker, not processSubmission (single-write fix)
      expect(mockUpdateSubmissionSet).not.toHaveBeenCalled();
      expect(mockInsertRespondent).not.toHaveBeenCalled();
    });

    it('should throw permanent error when NIN is missing from rawData', async () => {
      const submission = makeSubmission({
        rawData: { first_name: 'NoNIN', last_name: 'Person' },
      });
      mockFindFirstSubmission.mockResolvedValue(submission);
      mockFindFirstForm.mockResolvedValue({ formSchema: makeFormSchema() });

      await expect(
        SubmissionProcessingService.processSubmission('sub-001')
      ).rejects.toThrow('NIN');
    });

    it('should throw permanent error when form schema is not found', async () => {
      const submission = makeSubmission();
      mockFindFirstSubmission.mockResolvedValue(submission);
      mockFindFirstForm.mockResolvedValue(null);

      await expect(
        SubmissionProcessingService.processSubmission('sub-001')
      ).rejects.toThrow('Form schema not found');
    });

    it('should throw when submission not found', async () => {
      mockFindFirstSubmission.mockResolvedValue(null);

      await expect(
        SubmissionProcessingService.processSubmission('sub-nonexistent')
      ).rejects.toThrow('Submission not found');
    });

    it('should set enumeratorId=submitterId when submitter role is enumerator', async () => {
      const submission = makeSubmission({ submitterId: 'user-enum-01' });
      mockFindFirstSubmission.mockResolvedValue(submission);
      mockFindFirstForm.mockResolvedValue({ formSchema: makeFormSchema() });
      mockFindFirstRespondent.mockResolvedValue(null);
      mockEnumeratorRole();

      await SubmissionProcessingService.processSubmission('sub-001');

      // Verify the update payload contains the correct enumeratorId
      expect(mockUpdateSubmissionSet).toHaveBeenCalledWith(
        expect.objectContaining({ enumeratorId: 'user-enum-01' })
      );
    });

    it('should set enumeratorId=null when submitter role is public_user', async () => {
      const submission = makeSubmission({ submitterId: 'user-pub-01' });
      mockFindFirstSubmission.mockResolvedValue(submission);
      mockFindFirstForm.mockResolvedValue({ formSchema: makeFormSchema() });
      mockFindFirstRespondent.mockResolvedValue(null);
      mockPublicUserRole();

      await SubmissionProcessingService.processSubmission('sub-001');

      // enumeratorId must be null for public_user
      expect(mockUpdateSubmissionSet).toHaveBeenCalledWith(
        expect.objectContaining({ enumeratorId: null })
      );
    });

    it('should set enumeratorId=null when submitter role is data_entry_clerk', async () => {
      const submission = makeSubmission({ submitterId: 'user-clerk-01' });
      mockFindFirstSubmission.mockResolvedValue(submission);
      mockFindFirstForm.mockResolvedValue({ formSchema: makeFormSchema() });
      mockFindFirstRespondent.mockResolvedValue(null);
      mockClerkRole();

      await SubmissionProcessingService.processSubmission('sub-001');

      // enumeratorId must be null for data_entry_clerk
      expect(mockUpdateSubmissionSet).toHaveBeenCalledWith(
        expect.objectContaining({ enumeratorId: null })
      );
    });

    it('should NOT queue fraud detection when GPS coordinates are missing', async () => {
      const submission = makeSubmission({ gpsLatitude: null, gpsLongitude: null });
      mockFindFirstSubmission.mockResolvedValue(submission);
      mockFindFirstForm.mockResolvedValue({ formSchema: makeFormSchema() });
      mockFindFirstRespondent.mockResolvedValue(null);
      mockEnumeratorRole();

      await SubmissionProcessingService.processSubmission('sub-001');

      expect(mockQueueFraudDetection).not.toHaveBeenCalled();
    });

    it('should reject with error containing original registration date and source (AC 3.7.1)', async () => {
      const registrationDate = new Date('2026-01-15T08:00:00.000Z');
      const submission = makeSubmission();
      mockFindFirstSubmission.mockResolvedValue(submission);
      mockFindFirstForm.mockResolvedValue({ formSchema: makeFormSchema() });
      mockFindFirstRespondent.mockResolvedValue({
        id: 'existing-resp',
        nin: '61961438053',
        source: 'public',
        createdAt: registrationDate,
      });
      mockEnumeratorRole();

      await expect(
        SubmissionProcessingService.processSubmission('sub-001')
      ).rejects.toThrow(
        'NIN_DUPLICATE: This individual was already registered on 2026-01-15T08:00:00.000Z via public'
      );

      expect(mockInsertRespondent).not.toHaveBeenCalled();
    });

    it('should reject on race condition (unique constraint violation) with NIN_DUPLICATE (AC 3.7.7)', async () => {
      const registrationDate = new Date('2026-02-12T10:00:00.000Z');
      const submission = makeSubmission();
      mockFindFirstSubmission.mockResolvedValue(submission);
      mockFindFirstForm.mockResolvedValue({ formSchema: makeFormSchema() });
      // First findFirst returns null (no existing respondent)
      mockFindFirstRespondent.mockResolvedValueOnce(null);
      mockEnumeratorRole();

      // Insert throws unique constraint violation (race condition)
      mockInsertRespondent.mockImplementationOnce(() => {
        throw Object.assign(new Error('unique constraint'), { code: '23505' });
      });

      // Retry findFirst returns the respondent created by the other process
      mockFindFirstRespondent.mockResolvedValueOnce({
        id: 'race-resp',
        nin: '61961438053',
        source: 'enumerator',
        createdAt: registrationDate,
      });

      await expect(
        SubmissionProcessingService.processSubmission('sub-001')
      ).rejects.toThrow('NIN_DUPLICATE');
    });

    it('should reject when NIN exists in users table (staff member) (AC 3.7.2)', async () => {
      const submission = makeSubmission();
      mockFindFirstSubmission.mockResolvedValue(submission);
      mockFindFirstForm.mockResolvedValue({ formSchema: makeFormSchema() });
      mockFindFirstRespondent.mockResolvedValue(null); // Not in respondents table
      // determineSubmitterRole: user by ID + role lookup
      mockFindFirstUser.mockResolvedValueOnce({ roleId: 'role-enum' });
      mockFindFirstRole.mockResolvedValue({ name: 'enumerator' });
      // Cross-table NIN check: NIN found in users table
      mockFindFirstUser.mockResolvedValueOnce({ id: 'staff-user-001' });

      await expect(
        SubmissionProcessingService.processSubmission('sub-001')
      ).rejects.toThrow('NIN_DUPLICATE_STAFF: This NIN belongs to a registered staff member');

      expect(mockInsertRespondent).not.toHaveBeenCalled();
    });

    it('should check respondents table before users table — respondents takes priority (AC 3.7.2)', async () => {
      const registrationDate = new Date('2026-02-10T14:30:00.000Z');
      const submission = makeSubmission();
      mockFindFirstSubmission.mockResolvedValue(submission);
      mockFindFirstForm.mockResolvedValue({ formSchema: makeFormSchema() });
      // NIN found in respondents table — takes priority
      mockFindFirstRespondent.mockResolvedValue({
        id: 'existing-resp',
        nin: '61961438053',
        source: 'enumerator',
        createdAt: registrationDate,
      });
      mockEnumeratorRole();

      await expect(
        SubmissionProcessingService.processSubmission('sub-001')
      ).rejects.toThrow('NIN_DUPLICATE:'); // NOT NIN_DUPLICATE_STAFF

      // Users table should NOT be checked for NIN (respondents check fires first)
      // determineSubmitterRole calls users.findFirst once (by ID), but the cross-table
      // check should never be reached because respondent check throws first
    });
  });

  describe('determineSubmitterRole', () => {
    it('should return "public" when submitterId is null', async () => {
      const result = await SubmissionProcessingService.determineSubmitterRole(null);
      expect(result).toBe('public');
    });

    it('should return "enumerator" for enumerator role', async () => {
      mockFindFirstUser.mockResolvedValue({ roleId: 'role-1' });
      mockFindFirstRole.mockResolvedValue({ name: 'enumerator' });

      const result = await SubmissionProcessingService.determineSubmitterRole('user-1');
      expect(result).toBe('enumerator');
    });

    it('should return "clerk" for data_entry_clerk role', async () => {
      mockFindFirstUser.mockResolvedValue({ roleId: 'role-2' });
      mockFindFirstRole.mockResolvedValue({ name: 'data_entry_clerk' });

      const result = await SubmissionProcessingService.determineSubmitterRole('user-2');
      expect(result).toBe('clerk');
    });

    it('should return "public" for public_user role', async () => {
      mockFindFirstUser.mockResolvedValue({ roleId: 'role-3' });
      mockFindFirstRole.mockResolvedValue({ name: 'public_user' });

      const result = await SubmissionProcessingService.determineSubmitterRole('user-3');
      expect(result).toBe('public');
    });

    it('should return "public" when user not found', async () => {
      mockFindFirstUser.mockResolvedValue(null);

      const result = await SubmissionProcessingService.determineSubmitterRole('user-unknown');
      expect(result).toBe('public');
    });

    it('should return "enumerator" for unmapped roles (supervisor, super_admin)', async () => {
      mockFindFirstUser.mockResolvedValue({ roleId: 'role-admin' });
      mockFindFirstRole.mockResolvedValue({ name: 'supervisor' });

      const result = await SubmissionProcessingService.determineSubmitterRole('user-admin');
      expect(result).toBe('enumerator');
    });
  });

  describe('extractRespondentData', () => {
    it('should extract all mapped fields from rawData', () => {
      const rawData = {
        nin: '61961438053',
        first_name: 'Adewale',
        last_name: 'Johnson',
        date_of_birth: '1990-05-15',
        phone_number: '08012345678',
        lga_id: 'ibadan_north',
        consent_marketplace: 'yes',
        consent_enriched: 'no',
      };

      const result = SubmissionProcessingService.extractRespondentData(rawData, makeFormSchema());

      expect(result.nin).toBe('61961438053');
      expect(result.firstName).toBe('Adewale');
      expect(result.lastName).toBe('Johnson');
      expect(result.dateOfBirth).toBe('1990-05-15');
      expect(result.phoneNumber).toBe('08012345678');
      expect(result.lgaId).toBe('ibadan_north');
      expect(result.consentMarketplace).toBe(true);
      expect(result.consentEnriched).toBe(false);
    });

    it('should support camelCase field names', () => {
      const rawData = {
        nin: '61961438053',
        firstName: 'Adewale',
        lastName: 'Johnson',
      };

      const result = SubmissionProcessingService.extractRespondentData(rawData, makeFormSchema());

      expect(result.nin).toBe('61961438053');
      expect(result.firstName).toBe('Adewale');
      expect(result.lastName).toBe('Johnson');
    });

    it('should throw PermanentProcessingError when NIN is missing', () => {
      const rawData = { first_name: 'NoNIN' };

      expect(() => {
        SubmissionProcessingService.extractRespondentData(rawData, makeFormSchema());
      }).toThrow('NIN');
    });

    it('should throw PermanentProcessingError when form schema has no NIN question (AC 3.4.8)', () => {
      const noNinSchema: NativeFormSchema = {
        ...makeFormSchema(),
        sections: [{
          id: 'sect-1',
          title: 'No NIN Section',
          questions: [
            { id: 'q1', type: 'text', name: 'full_name', label: 'Name', required: true },
          ],
        }],
      };
      const rawData = { nin: '61961438053' };

      expect(() => {
        SubmissionProcessingService.extractRespondentData(rawData, noNinSchema);
      }).toThrow('Form schema does not contain a NIN question');
    });

    it('should handle consent fields as boolean conversion', () => {
      const rawData = {
        nin: '61961438053',
        consent_marketplace: 'yes',
        consent_enriched: 'yes',
      };

      const result = SubmissionProcessingService.extractRespondentData(rawData, makeFormSchema());
      expect(result.consentMarketplace).toBe(true);
      expect(result.consentEnriched).toBe(true);
    });

    it('should handle missing optional fields gracefully', () => {
      const rawData = { nin: '61961438053' };

      const result = SubmissionProcessingService.extractRespondentData(rawData, makeFormSchema());

      expect(result.nin).toBe('61961438053');
      expect(result.firstName).toBeUndefined();
      expect(result.lastName).toBeUndefined();
      expect(result.consentMarketplace).toBe(false);
    });

    it('should work without formSchema (backwards compatible)', () => {
      const rawData = { nin: '61961438053' };

      const result = SubmissionProcessingService.extractRespondentData(rawData);

      expect(result.nin).toBe('61961438053');
    });
  });

  describe('RESPONDENT_FIELD_MAP', () => {
    it('should include all required field mappings', () => {
      expect(RESPONDENT_FIELD_MAP['nin']).toBe('nin');
      expect(RESPONDENT_FIELD_MAP['national_id']).toBe('nin');
      expect(RESPONDENT_FIELD_MAP['first_name']).toBe('firstName');
      expect(RESPONDENT_FIELD_MAP['firstName']).toBe('firstName');
      expect(RESPONDENT_FIELD_MAP['last_name']).toBe('lastName');
      expect(RESPONDENT_FIELD_MAP['lastName']).toBe('lastName');
      expect(RESPONDENT_FIELD_MAP['date_of_birth']).toBe('dateOfBirth');
      expect(RESPONDENT_FIELD_MAP['dob']).toBe('dateOfBirth');
      expect(RESPONDENT_FIELD_MAP['phone']).toBe('phoneNumber');
      expect(RESPONDENT_FIELD_MAP['phone_number']).toBe('phoneNumber');
      expect(RESPONDENT_FIELD_MAP['lga']).toBe('lgaId');
      expect(RESPONDENT_FIELD_MAP['lga_id']).toBe('lgaId');
      expect(RESPONDENT_FIELD_MAP['consent_marketplace']).toBe('consentMarketplace');
      expect(RESPONDENT_FIELD_MAP['consent_enriched']).toBe('consentEnriched');
    });
  });
});
