/**
 * ODK Form Service Integration Tests (MSW-based)
 *
 * These tests use MSW to intercept real HTTP requests, providing more
 * realistic validation than the vi.fn() mock tests in odk-form.service.test.ts.
 *
 * Test coverage:
 * - AC3: First-time publish and error handling
 * - AC4: Version-update draft+publish flow
 * - AC6: Content-Type and Authorization header validation
 * - AC7: MSW integration
 * - AC8: Realistic HTTP-level testing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  initMswForTest,
  mockServerState,
  ODK_BASE_URL,
  server,
  http,
  HttpResponse,
} from './msw/index.js';
import { deployFormToOdk, logOrphanedDeployment } from '../odk-form.service.js';
import { clearOdkSession } from '../odk-client.js';

// Initialize MSW for this test file
initMswForTest();

// Mock environment variables for ODK config and clear session cache between tests
beforeEach(() => {
  vi.stubEnv('ODK_CENTRAL_URL', ODK_BASE_URL);
  vi.stubEnv('ODK_ADMIN_EMAIL', 'admin@example.com');
  vi.stubEnv('ODK_ADMIN_PASSWORD', 'secret123');
  vi.stubEnv('ODK_PROJECT_ID', '1');
  // Clear cached session token to ensure fresh auth for each test
  clearOdkSession();
});

describe('ODK Form Service - MSW Integration Tests', () => {
  const testXlsxBuffer = Buffer.from('fake xlsx content');
  const testXlsxMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const testXmlBuffer = Buffer.from('<xforms:model xmlns:xforms="http://www.w3.org/2002/xforms"/>');
  const testXmlMimeType = 'application/xml';

  describe('First-time Publish End-to-End (AC: 3, 7, 8)', () => {
    it('should complete first-time publish flow: session → form upload → response', async () => {
      const result = await deployFormToOdk(
        testXlsxBuffer,
        'new_survey.xlsx',
        testXlsxMimeType
      );

      // Verify result structure
      expect(result.xmlFormId).toBeDefined();
      expect(result.projectId).toBe(1);
      expect(result.publishedAt).toBeDefined();
      expect(result.isVersionUpdate).toBe(false);

      // Verify request sequence: session, then form upload
      const requests = mockServerState.getRequests();
      expect(requests.length).toBeGreaterThanOrEqual(2);

      const sessionRequest = requests.find(r => r.path === '/v1/sessions');
      expect(sessionRequest).toBeDefined();
      expect(sessionRequest?.body).toEqual({
        email: 'admin@example.com',
        password: 'secret123',
      });

      const formRequest = requests.find(r => r.path.includes('/v1/projects/1/forms'));
      expect(formRequest).toBeDefined();
      expect(formRequest?.method).toBe('POST');
    });
  });

  describe('Version-Update End-to-End (AC: 4, 7, 8)', () => {
    it('should complete version-update flow: session → 409 → draft → publish', async () => {
      const testFormId = 'existing_survey';

      // Override form create handler to return 409 (form exists)
      server.use(
        http.post(`${ODK_BASE_URL}/v1/projects/:projectId/forms`, async ({ request }) => {
          mockServerState.logRequest({
            method: 'POST',
            path: '/v1/projects/1/forms',
            headers: Object.fromEntries(request.headers.entries()),
            body: '[binary]',
          });

          return HttpResponse.json(
            {
              code: 409.3,
              message: `A resource already exists with xmlFormId value(s) of ${testFormId}`,
              details: { xmlFormId: testFormId },
            },
            { status: 409 }
          );
        })
      );

      // Pre-register form for draft handlers to find
      mockServerState.preRegisterForm(testFormId, 1);

      const result = await deployFormToOdk(
        testXlsxBuffer,
        `${testFormId}.xlsx`,
        testXlsxMimeType
      );

      // Verify result indicates version update
      expect(result.isVersionUpdate).toBe(true);
      expect(result.xmlFormId).toBe(testFormId);
      expect(result.publishedAt).toBeDefined();

      // Verify request sequence
      const requests = mockServerState.getRequests();

      // Should have: session, form create (409), draft upload, draft publish
      const formCreateRequest = requests.find(
        r => r.path.includes('/v1/projects/1/forms') && !r.path.includes('/draft')
      );
      expect(formCreateRequest).toBeDefined();

      const draftUploadRequest = requests.find(
        r => r.path.includes('/draft') && !r.path.includes('/publish')
      );
      expect(draftUploadRequest).toBeDefined();

      const draftPublishRequest = requests.find(
        r => r.path.includes('/draft/publish')
      );
      expect(draftPublishRequest).toBeDefined();
    });
  });

  describe('Content-Type Header Validation (AC: 6, Task 4.4)', () => {
    it('should send correct Content-Type header for xlsx files', async () => {
      await deployFormToOdk(
        testXlsxBuffer,
        'test.xlsx',
        testXlsxMimeType
      );

      const formRequest = mockServerState.getRequestsByPath('/v1/projects/1/forms')[0];
      expect(formRequest).toBeDefined();
      expect(formRequest.headers['content-type']).toBe(testXlsxMimeType);
    });

    it('should send correct Content-Type header for xml files', async () => {
      await deployFormToOdk(
        testXmlBuffer,
        'test.xml',
        testXmlMimeType
      );

      const formRequest = mockServerState.getRequestsByPath('/v1/projects/1/forms')[0];
      expect(formRequest).toBeDefined();
      expect(formRequest.headers['content-type']).toBe('application/xml');
    });

    it('should NOT incorrectly treat xlsx as xml (regression test for Story 2-2 bug)', async () => {
      // The bug was: mimeType.includes('xml') matched 'openxmlformats'
      // This test verifies the fix works
      await deployFormToOdk(
        testXlsxBuffer,
        'survey_v2.xlsx',
        testXlsxMimeType
      );

      const formRequest = mockServerState.getRequestsByPath('/v1/projects/1/forms')[0];
      expect(formRequest.headers['content-type']).not.toBe('application/xml');
      expect(formRequest.headers['content-type']).toContain('spreadsheetml');
    });
  });

  describe('Authorization Header Validation (AC: 6, Task 4.5)', () => {
    it('should include Authorization header on form requests', async () => {
      await deployFormToOdk(
        testXlsxBuffer,
        'auth_test.xlsx',
        testXlsxMimeType
      );

      const formRequest = mockServerState.getRequestsByPath('/v1/projects/1/forms')[0];
      expect(formRequest).toBeDefined();
      expect(formRequest.headers['authorization']).toBeDefined();
      expect(formRequest.headers['authorization']).toMatch(/^Bearer .+/);
    });

    it('should include Authorization header on draft upload', async () => {
      const testFormId = 'draft_auth_test';

      // Force 409 to trigger draft flow
      server.use(
        http.post(`${ODK_BASE_URL}/v1/projects/:projectId/forms`, async ({ request }) => {
          mockServerState.logRequest({
            method: 'POST',
            path: '/v1/projects/1/forms',
            headers: Object.fromEntries(request.headers.entries()),
            body: '[binary]',
          });
          return HttpResponse.json(
            { code: 409.3, message: 'exists', details: { xmlFormId: testFormId } },
            { status: 409 }
          );
        })
      );

      mockServerState.preRegisterForm(testFormId, 1);

      await deployFormToOdk(
        testXlsxBuffer,
        `${testFormId}.xlsx`,
        testXlsxMimeType
      );

      const draftRequest = mockServerState.getRequestsByPath('/draft')[0];
      expect(draftRequest).toBeDefined();
      expect(draftRequest.headers['authorization']).toBeDefined();
    });
  });

  describe('Error Handling (AC: 3, 5)', () => {
    it('should throw ODK_DEPLOYMENT_FAILED on 500 error', async () => {
      mockServerState.setNextError(500, 'INTERNAL_ERROR', 'Database unavailable');

      // Skip the session request error by setting it after first request
      server.use(
        http.post(`${ODK_BASE_URL}/v1/sessions`, async () => {
          return HttpResponse.json({
            token: 'test-token',
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          });
        })
      );

      // Now set error for form upload
      mockServerState.setNextError(500, 'INTERNAL_ERROR', 'Database unavailable');

      await expect(
        deployFormToOdk(testXlsxBuffer, 'error_test.xlsx', testXlsxMimeType)
      ).rejects.toThrow();
    });

    it('should throw ODK_AUTH_FAILED on 401 error', async () => {
      // Clear any cached session token by resetting state
      mockServerState.reset();

      // Override session handler to return 401
      server.use(
        http.post(`${ODK_BASE_URL}/v1/sessions`, async ({ request }) => {
          mockServerState.logRequest({
            method: 'POST',
            path: '/v1/sessions',
            headers: Object.fromEntries(request.headers.entries()),
            body: await request.json(),
          });
          return HttpResponse.json(
            { code: 401.2, message: 'Invalid credentials' },
            { status: 401 }
          );
        })
      );

      await expect(
        deployFormToOdk(testXlsxBuffer, 'auth_fail.xlsx', testXlsxMimeType)
      ).rejects.toMatchObject({ code: 'ODK_AUTH_FAILED' });
    });
  });

  describe('Network Failure Simulation (Task 4.7)', () => {
    it('should handle network errors gracefully', async () => {
      // Override to simulate network failure using MSW's error response
      server.use(
        http.post(`${ODK_BASE_URL}/v1/sessions`, async () => {
          // HttpResponse.error() simulates a network-level failure
          return HttpResponse.error();
        })
      );

      await expect(
        deployFormToOdk(testXlsxBuffer, 'network_fail.xlsx', testXlsxMimeType)
      ).rejects.toThrow();
    });
  });

  describe('Orphaned Deployment Logging (Task 4.6)', () => {
    it('should log orphaned deployment without throwing', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // This function should log but not throw
      expect(() => {
        logOrphanedDeployment(
          'orphaned_form',
          1,
          'uuid-123-456',
          new Error('DB transaction failed')
        );
      }).not.toThrow();

      consoleSpy.mockRestore();
    });
  });
});
