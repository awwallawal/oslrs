/**
 * Form Controller Tests
 * Story 3.1: Tests for form rendering endpoints
 * Story 3.3: Tests for submission endpoint
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { FormController } from '../form.controller.js';
import { NativeFormService } from '../../services/native-form.service.js';
import { queueSubmissionForIngestion } from '../../queues/webhook-ingestion.queue.js';
import { AppError } from '@oslsr/utils';

vi.mock('../../services/native-form.service.js');
vi.mock('../../queues/webhook-ingestion.queue.js');

describe('FormController', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

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
        source: 'webapp',
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
  });
});
