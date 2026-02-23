/**
 * Form Controller Tests
 * Story 3.1: Tests for form rendering endpoints
 * Story 3.3: Tests for submission endpoint
 * Story 3.7: Tests for NIN check and submission status endpoints
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { FormController } from '../form.controller.js';
import { NativeFormService } from '../../services/native-form.service.js';
import { queueSubmissionForIngestion } from '../../queues/webhook-ingestion.queue.js';
import { AppError } from '@oslsr/utils';

const mockFindFirstRespondent = vi.fn();
const mockFindFirstUser = vi.fn();
const mockFindManySubmissions = vi.fn();

vi.mock('../../services/native-form.service.js');
vi.mock('../../queues/webhook-ingestion.queue.js');
vi.mock('../../db/index.js', () => ({
  db: {
    query: {
      respondents: { findFirst: (...args: unknown[]) => mockFindFirstRespondent(...args) },
      users: { findFirst: (...args: unknown[]) => mockFindFirstUser(...args) },
      submissions: { findMany: (...args: unknown[]) => mockFindManySubmissions(...args) },
    },
  },
}));
vi.mock('@oslsr/utils/src/validation', () => ({
  modulus11Check: (nin: string) => {
    // Known valid NINs for testing
    const validNins = ['61961438053', '21647846180'];
    return validNins.includes(nin);
  },
}));

describe('FormController', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();

    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnThis();

    mockRes = {
      json: jsonMock,
      status: statusMock,
    };

    mockNext = vi.fn();

    mockReq = {
      query: {},
      params: {},
      body: {},
      user: { sub: 'user-123', role: 'enumerator' },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('listPublishedForms', () => {
    it('returns published forms list', async () => {
      const mockForms = [
        {
          id: 'form-uuid-1',
          formId: 'survey-v1',
          title: 'Labour Survey',
          version: '1.0.0',
          status: 'published',
          publishedAt: '2026-02-10T00:00:00.000Z',
        },
        {
          id: 'form-uuid-2',
          formId: 'skills-v1',
          title: 'Skills Assessment',
          version: '2.0.0',
          status: 'published',
          publishedAt: '2026-02-11T00:00:00.000Z',
        },
      ];

      vi.mocked(NativeFormService.listPublished).mockResolvedValue(mockForms);

      await FormController.listPublishedForms(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(NativeFormService.listPublished).toHaveBeenCalledOnce();
      expect(jsonMock).toHaveBeenCalledWith({ data: mockForms });
    });

    it('returns empty array when no published forms', async () => {
      vi.mocked(NativeFormService.listPublished).mockResolvedValue([]);

      await FormController.listPublishedForms(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(jsonMock).toHaveBeenCalledWith({ data: [] });
    });

    it('calls next on error', async () => {
      const error = new Error('Database error');
      vi.mocked(NativeFormService.listPublished).mockRejectedValue(error);

      await FormController.listPublishedForms(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('getFormForRender', () => {
    const mockSchema = {
      id: 'form-uuid-1',
      title: 'Labour Survey',
      version: '1.0.0',
      status: 'published' as const,
      sections: [],
      choiceLists: {},
      createdAt: '2026-02-10T00:00:00.000Z',
    };

    const mockFlattened = {
      formId: 'form-uuid-1',
      title: 'Labour Survey',
      version: '1.0.0',
      questions: [],
      choiceLists: {},
    };

    it('returns flattened form for rendering', async () => {
      mockReq.params = { id: 'form-uuid-1' };

      vi.mocked(NativeFormService.getPublishedFormSchema).mockResolvedValue(mockSchema);
      vi.mocked(NativeFormService.flattenForRender).mockReturnValue(mockFlattened);

      await FormController.getFormForRender(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(NativeFormService.getPublishedFormSchema).toHaveBeenCalledWith('form-uuid-1');
      expect(NativeFormService.flattenForRender).toHaveBeenCalledWith(mockSchema);
      expect(jsonMock).toHaveBeenCalledWith({ data: mockFlattened });
    });

    it('returns 404 when form not found', async () => {
      mockReq.params = { id: 'nonexistent-id' };

      const notFoundError = new AppError('FORM_NOT_FOUND', 'Form not found', 404);
      vi.mocked(NativeFormService.getPublishedFormSchema).mockRejectedValue(notFoundError);

      await FormController.getFormForRender(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(notFoundError);
      const passedError = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(passedError.statusCode).toBe(404);
      expect(passedError.code).toBe('FORM_NOT_FOUND');
    });

    it('returns 403 when form is not published', async () => {
      mockReq.params = { id: 'form-uuid-1' };

      const notPublishedError = new AppError('FORM_NOT_PUBLISHED', 'Form is not available for data collection', 403);
      vi.mocked(NativeFormService.getPublishedFormSchema).mockRejectedValue(notPublishedError);

      await FormController.getFormForRender(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(notPublishedError);
      const passedError = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(passedError.statusCode).toBe(403);
      expect(passedError.code).toBe('FORM_NOT_PUBLISHED');
    });

    it('calls next on unexpected error', async () => {
      mockReq.params = { id: 'form-uuid-1' };

      const error = new Error('Unexpected error');
      vi.mocked(NativeFormService.getPublishedFormSchema).mockRejectedValue(error);

      await FormController.getFormForRender(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('submitForm', () => {
    const validBody = {
      submissionId: '01924a5e-7c1a-7b2d-8f3e-4a5b6c7d8e9f',
      formId: '01924a5e-1111-7b2d-8f3e-4a5b6c7d8e9f',
      formVersion: '1.0.0',
      responses: { q1: 'answer1', q2: 42 },
      submittedAt: '2026-02-13T10:00:00.000Z',
    };

    it('returns 201 with queued status on valid submission', async () => {
      mockReq.body = validBody;
      mockReq.user = { sub: 'user-123', role: 'enumerator' };

      vi.mocked(queueSubmissionForIngestion).mockResolvedValue('job-abc');

      await FormController.submitForm(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(queueSubmissionForIngestion).toHaveBeenCalledWith({
        source: 'enumerator',
        submissionUid: validBody.submissionId,
        questionnaireFormId: validBody.formId,
        submitterId: 'user-123',
        submittedAt: validBody.submittedAt,
        rawData: validBody.responses,
      });
      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith({
        data: { id: 'job-abc', status: 'queued' },
      });
    });

    it('returns 200 with duplicate status when submission already exists', async () => {
      mockReq.body = validBody;
      mockReq.user = { sub: 'user-123', role: 'enumerator' };

      vi.mocked(queueSubmissionForIngestion).mockResolvedValue(null);

      await FormController.submitForm(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({
        data: { id: null, status: 'duplicate' },
      });
    });

    it('returns validation error for missing required fields', async () => {
      mockReq.body = { submissionId: 'not-a-uuid' };
      mockReq.user = { sub: 'user-123', role: 'enumerator' };

      await FormController.submitForm(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      const passedError = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(passedError.statusCode).toBe(400);
    });

    it('accepts and forwards optional GPS coordinates in rawData', async () => {
      mockReq.body = {
        ...validBody,
        gpsLatitude: 7.3775,
        gpsLongitude: 3.9470,
      };
      mockReq.user = { sub: 'user-123', role: 'enumerator' };

      vi.mocked(queueSubmissionForIngestion).mockResolvedValue('job-xyz');

      await FormController.submitForm(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(statusMock).toHaveBeenCalledWith(201);
      expect(queueSubmissionForIngestion).toHaveBeenCalledWith(
        expect.objectContaining({
          rawData: expect.objectContaining({
            q1: 'answer1',
            q2: 42,
            _gpsLatitude: 7.3775,
            _gpsLongitude: 3.9470,
          }),
        })
      );
    });

    it('calls next on queue error', async () => {
      mockReq.body = validBody;
      mockReq.user = { sub: 'user-123', role: 'enumerator' };

      const queueError = new Error('Redis down');
      vi.mocked(queueSubmissionForIngestion).mockRejectedValue(queueError);

      await FormController.submitForm(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(queueError);
    });

    it('sets source to "enumerator" for enumerator role', async () => {
      mockReq.body = validBody;
      mockReq.user = { sub: 'user-123', role: 'enumerator' };

      vi.mocked(queueSubmissionForIngestion).mockResolvedValue('job-abc');

      await FormController.submitForm(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(queueSubmissionForIngestion).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'enumerator' })
      );
    });

    it('sets source to "public" for public_user role', async () => {
      mockReq.body = validBody;
      mockReq.user = { sub: 'user-456', role: 'public_user' };

      vi.mocked(queueSubmissionForIngestion).mockResolvedValue('job-def');

      await FormController.submitForm(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(queueSubmissionForIngestion).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'public' })
      );
    });

    it('sets source to "clerk" for data_entry_clerk role', async () => {
      mockReq.body = validBody;
      mockReq.user = { sub: 'user-789', role: 'data_entry_clerk' };

      vi.mocked(queueSubmissionForIngestion).mockResolvedValue('job-ghi');

      await FormController.submitForm(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(queueSubmissionForIngestion).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'clerk' })
      );
    });

    it('defaults source to "webapp" for unknown roles', async () => {
      mockReq.body = validBody;
      mockReq.user = { sub: 'user-000', role: 'super_admin' };

      vi.mocked(queueSubmissionForIngestion).mockResolvedValue('job-jkl');

      await FormController.submitForm(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(queueSubmissionForIngestion).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'webapp' })
      );
    });
  });

  describe('getSubmissionSource', () => {
    it('maps public_user to "public"', () => {
      expect(FormController.getSubmissionSource('public_user')).toBe('public');
    });

    it('maps enumerator to "enumerator"', () => {
      expect(FormController.getSubmissionSource('enumerator')).toBe('enumerator');
    });

    it('maps data_entry_clerk to "clerk"', () => {
      expect(FormController.getSubmissionSource('data_entry_clerk')).toBe('clerk');
    });

    it('returns "webapp" for undefined role', () => {
      expect(FormController.getSubmissionSource(undefined)).toBe('webapp');
    });

    it('returns "webapp" for unknown role', () => {
      expect(FormController.getSubmissionSource('super_admin')).toBe('webapp');
    });
  });

  describe('checkNin (AC 3.7.3)', () => {
    it('returns available: true when NIN is not registered', async () => {
      mockReq.body = { nin: '61961438053' };
      mockFindFirstRespondent.mockResolvedValue(null);
      mockFindFirstUser.mockResolvedValue(null);

      await FormController.checkNin(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(jsonMock).toHaveBeenCalledWith({
        data: { available: true },
      });
    });

    it('returns available: false with reason "respondent" when NIN exists in respondents', async () => {
      mockReq.body = { nin: '61961438053' };
      mockFindFirstRespondent.mockResolvedValue({
        createdAt: new Date('2026-02-10T14:30:00.000Z'),
      });

      await FormController.checkNin(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(jsonMock).toHaveBeenCalledWith({
        data: {
          available: false,
          reason: 'respondent',
          registeredAt: '2026-02-10T14:30:00.000Z',
        },
      });
      // Should NOT check users table when found in respondents
      expect(mockFindFirstUser).not.toHaveBeenCalled();
    });

    it('returns available: false with reason "staff" when NIN exists in users (no date exposed)', async () => {
      mockReq.body = { nin: '61961438053' };
      mockFindFirstRespondent.mockResolvedValue(null);
      mockFindFirstUser.mockResolvedValue({ id: 'staff-user-001' });

      await FormController.checkNin(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(jsonMock).toHaveBeenCalledWith({
        data: { available: false, reason: 'staff' },
      });
    });

    it('returns 422 for invalid NIN format (fails Modulus 11)', async () => {
      mockReq.body = { nin: '12345678901' }; // Invalid checksum

      await FormController.checkNin(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(statusMock).toHaveBeenCalledWith(422);
      expect(jsonMock).toHaveBeenCalledWith({
        error: { code: 'INVALID_NIN_FORMAT', message: 'NIN failed Modulus 11 checksum validation' },
      });
    });

    it('returns validation error for non-11-digit input', async () => {
      mockReq.body = { nin: '123' };

      await FormController.checkNin(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      const passedError = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(passedError.statusCode).toBe(400);
    });

    it('calls next on database error', async () => {
      mockReq.body = { nin: '61961438053' };
      mockFindFirstRespondent.mockRejectedValue(new Error('DB connection lost'));

      await FormController.checkNin(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('getSubmissionStatuses (AC 3.7.6)', () => {
    it('returns statuses for valid UIDs belonging to the user', async () => {
      mockReq.query = { uids: 'uid-1,uid-2' };
      mockReq.user = { sub: 'user-123', role: 'enumerator' };
      mockFindManySubmissions.mockResolvedValue([
        { submissionUid: 'uid-1', processed: true, processingError: null },
        { submissionUid: 'uid-2', processed: true, processingError: 'NIN_DUPLICATE: ...' },
      ]);

      await FormController.getSubmissionStatuses(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(jsonMock).toHaveBeenCalledWith({
        data: {
          'uid-1': { processed: true, processingError: null },
          'uid-2': { processed: true, processingError: 'NIN_DUPLICATE: ...' },
        },
      });
    });

    it('returns 400 for empty UIDs', async () => {
      mockReq.query = { uids: '' };
      mockReq.user = { sub: 'user-123', role: 'enumerator' };

      await FormController.getSubmissionStatuses(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      const passedError = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(passedError.statusCode).toBe(400);
      expect(passedError.code).toBe('INVALID_UIDS');
    });

    it('returns 400 when more than 50 UIDs provided', async () => {
      const tooManyUids = Array.from({ length: 51 }, (_, i) => `uid-${i}`).join(',');
      mockReq.query = { uids: tooManyUids };
      mockReq.user = { sub: 'user-123', role: 'enumerator' };

      await FormController.getSubmissionStatuses(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      const passedError = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(passedError.code).toBe('INVALID_UIDS');
    });

    it('returns empty data for UIDs belonging to other users', async () => {
      mockReq.query = { uids: 'uid-other' };
      mockReq.user = { sub: 'user-123', role: 'enumerator' };
      mockFindManySubmissions.mockResolvedValue([]); // No matching submissions

      await FormController.getSubmissionStatuses(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(jsonMock).toHaveBeenCalledWith({ data: {} });
    });

    it('returns 401 when user is not authenticated (AC 3.7.6)', async () => {
      mockReq.query = { uids: 'uid-1' };
      mockReq.user = undefined;

      await FormController.getSubmissionStatuses(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      const passedError = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(passedError.statusCode).toBe(401);
      expect(passedError.code).toBe('AUTH_REQUIRED');
    });
  });
});
