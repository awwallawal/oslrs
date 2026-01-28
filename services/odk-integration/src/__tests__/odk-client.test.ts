import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getOdkConfig,
  isOdkAvailable,
  clearOdkSession,
  odkRequest,
  handleOdkError,
  requireOdkConfig,
} from '../odk-client.js';
import { AppError } from '@oslsr/utils';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Store original env
const originalEnv = { ...process.env };

describe('ODK Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearOdkSession();
    // Reset env to test defaults
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getOdkConfig', () => {
    it('should return null when no ODK vars are set', () => {
      delete process.env.ODK_CENTRAL_URL;
      delete process.env.ODK_ADMIN_EMAIL;
      delete process.env.ODK_ADMIN_PASSWORD;
      delete process.env.ODK_PROJECT_ID;

      const config = getOdkConfig();
      expect(config).toBeNull();
    });

    it('should return config when all ODK vars are valid', () => {
      process.env.ODK_CENTRAL_URL = 'https://odk.example.com';
      process.env.ODK_ADMIN_EMAIL = 'admin@example.com';
      process.env.ODK_ADMIN_PASSWORD = 'secret123';
      process.env.ODK_PROJECT_ID = '1';

      const config = getOdkConfig();
      expect(config).not.toBeNull();
      expect(config!.ODK_CENTRAL_URL).toBe('https://odk.example.com');
      expect(config!.ODK_ADMIN_EMAIL).toBe('admin@example.com');
      expect(config!.ODK_PROJECT_ID).toBe(1);
    });

    it('should throw when partial ODK vars are set', () => {
      process.env.ODK_CENTRAL_URL = 'https://odk.example.com';
      // Missing other vars

      expect(() => getOdkConfig()).toThrow('Invalid ODK configuration');
    });

    it('should strip trailing slash from URL', () => {
      process.env.ODK_CENTRAL_URL = 'https://odk.example.com/';
      process.env.ODK_ADMIN_EMAIL = 'admin@example.com';
      process.env.ODK_ADMIN_PASSWORD = 'secret123';
      process.env.ODK_PROJECT_ID = '1';

      const config = getOdkConfig();
      expect(config!.ODK_CENTRAL_URL).toBe('https://odk.example.com');
    });
  });

  describe('isOdkAvailable', () => {
    it('should return false when ODK is not configured', () => {
      delete process.env.ODK_CENTRAL_URL;
      expect(isOdkAvailable()).toBe(false);
    });

    it('should return true when ODK is configured', () => {
      process.env.ODK_CENTRAL_URL = 'https://odk.example.com';
      process.env.ODK_ADMIN_EMAIL = 'admin@example.com';
      process.env.ODK_ADMIN_PASSWORD = 'secret123';
      process.env.ODK_PROJECT_ID = '1';

      expect(isOdkAvailable()).toBe(true);
    });
  });

  describe('requireOdkConfig', () => {
    it('should throw ODK_UNAVAILABLE when not configured', () => {
      delete process.env.ODK_CENTRAL_URL;

      expect(() => requireOdkConfig()).toThrow(AppError);
      try {
        requireOdkConfig();
      } catch (e) {
        expect((e as AppError).code).toBe('ODK_UNAVAILABLE');
        expect((e as AppError).statusCode).toBe(503);
      }
    });
  });

  describe('odkRequest - session management', () => {
    const validConfig = {
      ODK_CENTRAL_URL: 'https://odk.example.com',
      ODK_ADMIN_EMAIL: 'admin@example.com',
      ODK_ADMIN_PASSWORD: 'secret123',
      ODK_PROJECT_ID: 1,
    };

    beforeEach(() => {
      process.env.ODK_CENTRAL_URL = validConfig.ODK_CENTRAL_URL;
      process.env.ODK_ADMIN_EMAIL = validConfig.ODK_ADMIN_EMAIL;
      process.env.ODK_ADMIN_PASSWORD = validConfig.ODK_ADMIN_PASSWORD;
      process.env.ODK_PROJECT_ID = String(validConfig.ODK_PROJECT_ID);
    });

    it('should obtain session token on first request', async () => {
      // Mock session creation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          token: 'test-token-123',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          createdAt: new Date().toISOString(),
        }),
      });

      // Mock actual request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'test' }),
      });

      const config = getOdkConfig()!;
      const response = await odkRequest(config, 'GET', '/v1/projects');

      expect(response.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Verify session call
      expect(mockFetch).toHaveBeenNthCalledWith(1, 'https://odk.example.com/v1/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@example.com',
          password: 'secret123',
        }),
      });

      // Verify request includes auth header
      const requestCall = mockFetch.mock.calls[1];
      expect(requestCall[1].headers.Authorization).toBe('Bearer test-token-123');
    });

    it('should reuse cached token for subsequent requests', async () => {
      // First request - session + actual request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          token: 'cached-token',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          createdAt: new Date().toISOString(),
        }),
      });
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const config = getOdkConfig()!;
      await odkRequest(config, 'GET', '/v1/projects');

      // Clear mock calls
      mockFetch.mockClear();

      // Second request - should reuse token (no session call)
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await odkRequest(config, 'GET', '/v1/projects/1');

      // Only one call (the actual request, no session refresh)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should refresh token on 401 response', async () => {
      // Initial session
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          token: 'old-token',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          createdAt: new Date().toISOString(),
        }),
      });

      // First request returns 401
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

      // Token refresh
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          token: 'new-token',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          createdAt: new Date().toISOString(),
        }),
      });

      // Retry with new token
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const config = getOdkConfig()!;
      const response = await odkRequest(config, 'GET', '/v1/projects');

      expect(response.ok).toBe(true);
      // 4 calls: initial session, 401 request, token refresh, retry
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('should throw ODK_AUTH_FAILED on session creation failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Invalid credentials'),
      });

      const config = getOdkConfig()!;

      await expect(odkRequest(config, 'GET', '/v1/projects')).rejects.toThrow(AppError);

      try {
        await odkRequest(config, 'GET', '/v1/projects');
      } catch (e) {
        expect((e as AppError).code).toBe('ODK_AUTH_FAILED');
      }
    });
  });

  describe('handleOdkError', () => {
    it('should map 401/403 to ODK_AUTH_FAILED', () => {
      const response = { status: 401 } as Response;

      expect(() => handleOdkError(response, 'Unauthorized')).toThrow(AppError);

      try {
        handleOdkError(response, 'Unauthorized');
      } catch (e) {
        expect((e as AppError).code).toBe('ODK_AUTH_FAILED');
        expect((e as AppError).statusCode).toBe(401);
      }
    });

    it('should map 404 to ODK_PROJECT_NOT_FOUND', () => {
      const response = { status: 404 } as Response;

      try {
        handleOdkError(response, 'Not found');
      } catch (e) {
        expect((e as AppError).code).toBe('ODK_PROJECT_NOT_FOUND');
        expect((e as AppError).statusCode).toBe(404);
      }
    });

    it('should map 409 to ODK_FORM_EXISTS', () => {
      const response = { status: 409 } as Response;

      try {
        handleOdkError(response, 'Conflict');
      } catch (e) {
        expect((e as AppError).code).toBe('ODK_FORM_EXISTS');
        expect((e as AppError).statusCode).toBe(409);
      }
    });

    it('should map 5xx to ODK_DEPLOYMENT_FAILED with 502', () => {
      const response = { status: 500 } as Response;

      try {
        handleOdkError(response, 'Server error');
      } catch (e) {
        expect((e as AppError).code).toBe('ODK_DEPLOYMENT_FAILED');
        expect((e as AppError).statusCode).toBe(502);
      }
    });
  });

  describe('odkRequest - request options', () => {
    const validConfig = {
      ODK_CENTRAL_URL: 'https://odk.example.com',
      ODK_ADMIN_EMAIL: 'admin@example.com',
      ODK_ADMIN_PASSWORD: 'secret123',
      ODK_PROJECT_ID: 1,
    };

    beforeEach(() => {
      process.env.ODK_CENTRAL_URL = validConfig.ODK_CENTRAL_URL;
      process.env.ODK_ADMIN_EMAIL = validConfig.ODK_ADMIN_EMAIL;
      process.env.ODK_ADMIN_PASSWORD = validConfig.ODK_ADMIN_PASSWORD;
      process.env.ODK_PROJECT_ID = String(validConfig.ODK_PROJECT_ID);

      // Pre-populate session
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          token: 'test-token',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          createdAt: new Date().toISOString(),
        }),
      });
    });

    it('should send JSON body with correct content type', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const config = getOdkConfig()!;
      await odkRequest(config, 'POST', '/v1/projects', {
        body: { name: 'Test Project' },
      });

      const requestCall = mockFetch.mock.calls[1];
      expect(requestCall[1].headers['Content-Type']).toBe('application/json');
      expect(requestCall[1].body).toBe(JSON.stringify({ name: 'Test Project' }));
    });

    it('should send custom content type for binary uploads', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const config = getOdkConfig()!;
      const buffer = Buffer.from('test data');

      await odkRequest(config, 'POST', '/v1/projects/1/forms', {
        body: buffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const requestCall = mockFetch.mock.calls[1];
      expect(requestCall[1].headers['Content-Type']).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
    });
  });
});
