import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppError } from '@oslsr/utils';

// Mock the odk-client module
vi.mock('../odk-client.js', () => ({
  requireOdkConfig: vi.fn(),
  odkRequest: vi.fn(),
  handleOdkError: vi.fn(),
}));

import {
  deployFormToOdk,
  logOrphanedDeployment,
} from '../odk-form.service.js';
import { requireOdkConfig, odkRequest, handleOdkError } from '../odk-client.js';

const mockRequireOdkConfig = vi.mocked(requireOdkConfig);
const mockOdkRequest = vi.mocked(odkRequest);
const mockHandleOdkError = vi.mocked(handleOdkError);

describe('ODK Form Service', () => {
  const mockConfig = {
    ODK_CENTRAL_URL: 'https://odk.example.com',
    ODK_ADMIN_EMAIL: 'admin@example.com',
    ODK_ADMIN_PASSWORD: 'secret123',
    ODK_PROJECT_ID: 1,
  };

  const testFile = {
    buffer: Buffer.from('test xlsx content'),
    fileName: 'test_form.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOdkConfig.mockReturnValue(mockConfig);
  });

  describe('deployFormToOdk', () => {
    describe('first-time publish flow', () => {
      it('should successfully deploy a new form to ODK Central', async () => {
        // Mock successful first-time publish response
        mockOdkRequest.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            xmlFormId: 'test_form',
            projectId: 1,
            name: 'Test Form',
            version: '1.0.0',
            state: 'open',
            createdAt: '2026-01-28T10:00:00Z',
            updatedAt: '2026-01-28T10:00:00Z',
            publishedAt: '2026-01-28T10:00:00Z',
          }),
        } as Response);

        const result = await deployFormToOdk(
          testFile.buffer,
          testFile.fileName,
          testFile.mimeType
        );

        expect(result).toEqual({
          xmlFormId: 'test_form',
          projectId: 1,
          publishedAt: '2026-01-28T10:00:00Z',
          isVersionUpdate: false,
        });

        // Verify the request was made with correct parameters
        expect(mockOdkRequest).toHaveBeenCalledWith(
          mockConfig,
          'POST',
          '/v1/projects/1/forms?publish=true&ignoreWarnings=true',
          expect.objectContaining({
            body: testFile.buffer,
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          })
        );
      });

      it('should handle XML file uploads with correct content type', async () => {
        mockOdkRequest.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            xmlFormId: 'test_form_xml',
            projectId: 1,
            publishedAt: '2026-01-28T10:00:00Z',
          }),
        } as Response);

        await deployFormToOdk(
          Buffer.from('<xml>test</xml>'),
          'test_form.xml',
          'application/xml'
        );

        expect(mockOdkRequest).toHaveBeenCalledWith(
          mockConfig,
          'POST',
          expect.any(String),
          expect.objectContaining({
            contentType: 'application/xml',
          })
        );
      });

      it('should generate publishedAt timestamp if not returned by ODK', async () => {
        mockOdkRequest.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            xmlFormId: 'test_form',
            projectId: 1,
            // No publishedAt in response
          }),
        } as Response);

        const result = await deployFormToOdk(
          testFile.buffer,
          testFile.fileName,
          testFile.mimeType
        );

        expect(result.publishedAt).toBeDefined();
        expect(new Date(result.publishedAt).getTime()).toBeGreaterThan(0);
      });
    });

    describe('version update flow (409 handling)', () => {
      it('should switch to version update flow when form already exists (409)', async () => {
        // First request returns 409 (form exists)
        mockOdkRequest.mockResolvedValueOnce({
          ok: false,
          status: 409,
          json: () => Promise.resolve({
            message: 'Form already exists',
            details: { xmlFormId: 'existing_form' },
          }),
        } as Response);

        // Draft upload succeeds
        mockOdkRequest.mockResolvedValueOnce({
          ok: true,
          status: 200,
        } as Response);

        // Draft publish succeeds
        mockOdkRequest.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            xmlFormId: 'existing_form',
            projectId: 1,
            publishedAt: '2026-01-28T11:00:00Z',
          }),
        } as Response);

        const result = await deployFormToOdk(
          testFile.buffer,
          testFile.fileName,
          testFile.mimeType
        );

        expect(result.isVersionUpdate).toBe(true);
        expect(result.xmlFormId).toBe('existing_form');

        // Verify draft upload was called
        expect(mockOdkRequest).toHaveBeenCalledWith(
          mockConfig,
          'POST',
          '/v1/projects/1/forms/existing_form/draft',
          expect.any(Object)
        );

        // Verify draft publish was called
        expect(mockOdkRequest).toHaveBeenCalledWith(
          mockConfig,
          'POST',
          '/v1/projects/1/forms/existing_form/draft/publish',
          expect.any(Object)
        );
      });

      it('should extract xmlFormId from filename if not in 409 error details', async () => {
        // 409 without xmlFormId in details
        mockOdkRequest.mockResolvedValueOnce({
          ok: false,
          status: 409,
          json: () => Promise.resolve({ message: 'Form already exists' }),
        } as Response);

        // Draft upload
        mockOdkRequest.mockResolvedValueOnce({
          ok: true,
          status: 200,
        } as Response);

        // Draft publish
        mockOdkRequest.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            xmlFormId: 'test_form',
            projectId: 1,
            publishedAt: '2026-01-28T11:00:00Z',
          }),
        } as Response);

        const result = await deployFormToOdk(
          testFile.buffer,
          'my_custom_form.xlsx', // Should extract 'my_custom_form'
          testFile.mimeType
        );

        expect(result.isVersionUpdate).toBe(true);

        // Should use filename-based ID for draft endpoint
        expect(mockOdkRequest).toHaveBeenCalledWith(
          mockConfig,
          'POST',
          '/v1/projects/1/forms/my_custom_form/draft',
          expect.any(Object)
        );
      });

      it('should URL-encode xmlFormId in draft endpoints', async () => {
        mockOdkRequest.mockResolvedValueOnce({
          ok: false,
          status: 409,
          json: () => Promise.resolve({
            details: { xmlFormId: 'form with spaces' },
          }),
        } as Response);

        mockOdkRequest.mockResolvedValueOnce({
          ok: true,
          status: 200,
        } as Response);

        mockOdkRequest.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            xmlFormId: 'form with spaces',
            projectId: 1,
            publishedAt: '2026-01-28T11:00:00Z',
          }),
        } as Response);

        await deployFormToOdk(testFile.buffer, testFile.fileName, testFile.mimeType);

        // Verify URL encoding
        expect(mockOdkRequest).toHaveBeenCalledWith(
          mockConfig,
          'POST',
          '/v1/projects/1/forms/form%20with%20spaces/draft',
          expect.any(Object)
        );
      });
    });

    describe('error handling', () => {
      it('should throw ODK_UNAVAILABLE when config is missing', async () => {
        mockRequireOdkConfig.mockImplementation(() => {
          throw new AppError(
            'ODK_UNAVAILABLE',
            'ODK Central integration is not configured',
            503
          );
        });

        await expect(
          deployFormToOdk(testFile.buffer, testFile.fileName, testFile.mimeType)
        ).rejects.toThrow(AppError);

        await expect(
          deployFormToOdk(testFile.buffer, testFile.fileName, testFile.mimeType)
        ).rejects.toMatchObject({ code: 'ODK_UNAVAILABLE' });
      });

      it('should throw ODK_DEPLOYMENT_FAILED on non-409 error', async () => {
        mockOdkRequest.mockResolvedValueOnce({
          ok: false,
          status: 400,
          text: () => Promise.resolve('Invalid form format'),
        } as Response);

        await expect(
          deployFormToOdk(testFile.buffer, testFile.fileName, testFile.mimeType)
        ).rejects.toThrow(AppError);

        await expect(
          deployFormToOdk(testFile.buffer, testFile.fileName, testFile.mimeType)
        ).rejects.toMatchObject({ code: 'ODK_DEPLOYMENT_FAILED' });
      });

      it('should throw ODK_DEPLOYMENT_FAILED on network error', async () => {
        mockOdkRequest.mockRejectedValueOnce(new Error('Network timeout'));

        await expect(
          deployFormToOdk(testFile.buffer, testFile.fileName, testFile.mimeType)
        ).rejects.toThrow(AppError);
      });

      it('should call handleOdkError when draft upload fails in version update flow', async () => {
        // First request returns 409
        mockOdkRequest.mockResolvedValueOnce({
          ok: false,
          status: 409,
          json: () => Promise.resolve({
            details: { xmlFormId: 'existing_form' },
          }),
        } as Response);

        // Draft upload fails
        const failedResponse = {
          ok: false,
          status: 500,
          text: () => Promise.resolve('Internal server error'),
        } as Response;
        mockOdkRequest.mockResolvedValueOnce(failedResponse);

        mockHandleOdkError.mockImplementation(() => {
          throw new AppError('ODK_DEPLOYMENT_FAILED', 'Draft upload failed', 502);
        });

        await expect(
          deployFormToOdk(testFile.buffer, testFile.fileName, testFile.mimeType)
        ).rejects.toThrow(AppError);

        expect(mockHandleOdkError).toHaveBeenCalledWith(
          failedResponse,
          'Internal server error',
          expect.objectContaining({ xmlFormId: 'existing_form', stage: 'draft_upload' })
        );
      });

      it('should call handleOdkError when draft publish fails in version update flow', async () => {
        // First request returns 409
        mockOdkRequest.mockResolvedValueOnce({
          ok: false,
          status: 409,
          json: () => Promise.resolve({
            details: { xmlFormId: 'existing_form' },
          }),
        } as Response);

        // Draft upload succeeds
        mockOdkRequest.mockResolvedValueOnce({
          ok: true,
          status: 200,
        } as Response);

        // Draft publish fails
        const failedResponse = {
          ok: false,
          status: 400,
          text: () => Promise.resolve('Version conflict'),
        } as Response;
        mockOdkRequest.mockResolvedValueOnce(failedResponse);

        mockHandleOdkError.mockImplementation(() => {
          throw new AppError('ODK_DEPLOYMENT_FAILED', 'Publish failed', 400);
        });

        await expect(
          deployFormToOdk(testFile.buffer, testFile.fileName, testFile.mimeType)
        ).rejects.toThrow(AppError);

        expect(mockHandleOdkError).toHaveBeenCalledWith(
          failedResponse,
          'Version conflict',
          expect.objectContaining({ xmlFormId: 'existing_form', stage: 'draft_publish' })
        );
      });
    });
  });

  describe('logOrphanedDeployment', () => {
    it('should log orphaned deployment with all required fields', () => {
      // Spy on console/logger - in real implementation this uses Pino
      // Since logger is internal, we just verify the function doesn't throw
      const error = new Error('Database connection failed');

      expect(() => {
        logOrphanedDeployment('test_form', 1, 'form-uuid-123', error);
      }).not.toThrow();
    });

    it('should include error stack trace in log', () => {
      const error = new Error('Transaction failed');
      error.stack = 'Error: Transaction failed\n    at test.ts:1:1';

      // Function should handle error with stack without throwing
      expect(() => {
        logOrphanedDeployment('orphaned_form', 1, 'uuid-456', error);
      }).not.toThrow();
    });
  });

  describe('filename to formId extraction', () => {
    it('should strip .xlsx extension from filename', async () => {
      mockOdkRequest.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ message: 'exists' }),
      } as Response);

      mockOdkRequest.mockResolvedValueOnce({ ok: true, status: 200 } as Response);
      mockOdkRequest.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          xmlFormId: 'oslsr_master_v3',
          projectId: 1,
          publishedAt: '2026-01-28T12:00:00Z',
        }),
      } as Response);

      await deployFormToOdk(
        testFile.buffer,
        'oslsr_master_v3.xlsx',
        testFile.mimeType
      );

      expect(mockOdkRequest).toHaveBeenCalledWith(
        mockConfig,
        'POST',
        '/v1/projects/1/forms/oslsr_master_v3/draft',
        expect.any(Object)
      );
    });

    it('should strip .xml extension from filename', async () => {
      mockOdkRequest.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ message: 'exists' }),
      } as Response);

      mockOdkRequest.mockResolvedValueOnce({ ok: true, status: 200 } as Response);
      mockOdkRequest.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          xmlFormId: 'survey_form',
          projectId: 1,
          publishedAt: '2026-01-28T12:00:00Z',
        }),
      } as Response);

      await deployFormToOdk(
        Buffer.from('<xml/>'),
        'survey_form.xml',
        'application/xml'
      );

      expect(mockOdkRequest).toHaveBeenCalledWith(
        mockConfig,
        'POST',
        '/v1/projects/1/forms/survey_form/draft',
        expect.any(Object)
      );
    });
  });
});
