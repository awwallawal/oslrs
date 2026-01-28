/**
 * MSW Integration Tests
 *
 * Tests verifying the MSW mock ODK Central server works correctly.
 * These tests use real fetch calls intercepted by MSW (not vi.fn mocks).
 */

import { describe, it, expect } from 'vitest';
import {
  initMswForTest,
  mockServerState,
  ODK_BASE_URL,
} from './msw/index.js';

// Initialize MSW for this test file
initMswForTest();

describe('MSW ODK Central Mock Server', () => {
  describe('POST /v1/sessions - Authentication', () => {
    it('should return session token for valid credentials', async () => {
      const response = await fetch(`${ODK_BASE_URL}/v1/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@example.com',
          password: 'secret123',
        }),
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.token).toBeDefined();
      expect(data.createdAt).toBeDefined();
      expect(data.expiresAt).toBeDefined();
    });

    it('should return 401 for invalid credentials', async () => {
      const response = await fetch(`${ODK_BASE_URL}/v1/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'wrong@example.com',
          password: 'wrongpassword',
        }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.code).toBe(401.2);
    });

    it('should log requests for assertion', async () => {
      await fetch(`${ODK_BASE_URL}/v1/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@example.com',
          password: 'secret123',
        }),
      });

      const requests = mockServerState.getRequests();
      expect(requests).toHaveLength(1);
      expect(requests[0].method).toBe('POST');
      expect(requests[0].path).toBe('/v1/sessions');
      expect(requests[0].body).toEqual({
        email: 'admin@example.com',
        password: 'secret123',
      });
    });
  });

  describe('POST /v1/projects/:projectId/forms - First-time Publish', () => {
    it('should create new form successfully', async () => {
      const response = await fetch(
        `${ODK_BASE_URL}/v1/projects/1/forms?publish=true`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'X-XlsForm-FormId-Fallback': 'test_form',
          },
          body: Buffer.from('fake xlsx content'),
        }
      );

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.xmlFormId).toBe('test_form');
      expect(data.projectId).toBe(1);
      expect(data.state).toBe('open');
      expect(data.publishedAt).toBeDefined();
    });

    it('should return 409 when form already exists', async () => {
      // Pre-register a form
      mockServerState.preRegisterForm('existing_form', 1);

      const response = await fetch(
        `${ODK_BASE_URL}/v1/projects/1/forms?publish=true`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'X-XlsForm-FormId-Fallback': 'existing_form',
          },
          body: Buffer.from('fake xlsx content'),
        }
      );

      expect(response.ok).toBe(false);
      expect(response.status).toBe(409);

      const data = await response.json();
      expect(data.details.xmlFormId).toBe('existing_form');
    });
  });

  describe('Draft + Publish Flow (Version Update)', () => {
    it('should complete draft upload and publish flow', async () => {
      // Pre-register form to simulate existing form
      mockServerState.preRegisterForm('versioned_form', 1);

      // Step 1: Upload draft
      const draftResponse = await fetch(
        `${ODK_BASE_URL}/v1/projects/1/forms/versioned_form/draft`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
          body: Buffer.from('new version xlsx'),
        }
      );

      expect(draftResponse.ok).toBe(true);
      expect(draftResponse.status).toBe(200);

      // Step 2: Publish draft
      const publishResponse = await fetch(
        `${ODK_BASE_URL}/v1/projects/1/forms/versioned_form/draft/publish`,
        {
          method: 'POST',
        }
      );

      expect(publishResponse.ok).toBe(true);
      expect(publishResponse.status).toBe(200);

      const data = await publishResponse.json();
      expect(data.xmlFormId).toBe('versioned_form');
      expect(data.publishedAt).toBeDefined();
    });
  });

  describe('Error Injection (AC: 5)', () => {
    it('should inject configured error on next request', async () => {
      mockServerState.setNextError(500, 'INTERNAL_ERROR', 'Database unavailable');

      const response = await fetch(`${ODK_BASE_URL}/v1/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@example.com',
          password: 'secret123',
        }),
      });

      expect(response.status).toBe(500);

      const data = await response.json();
      expect(data.code).toBe('INTERNAL_ERROR');
      expect(data.message).toBe('Database unavailable');
    });

    it('should only inject error once (consume on use)', async () => {
      mockServerState.setNextError(503, 'SERVICE_UNAVAILABLE', 'Maintenance');

      // First request gets error
      const response1 = await fetch(`${ODK_BASE_URL}/v1/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@example.com', password: 'secret123' }),
      });
      expect(response1.status).toBe(503);

      // Second request succeeds
      const response2 = await fetch(`${ODK_BASE_URL}/v1/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@example.com', password: 'secret123' }),
      });
      expect(response2.status).toBe(200);
    });
  });

  describe('Request Inspection Utilities (AC: 6)', () => {
    it('should filter requests by path', async () => {
      // Make multiple requests
      await fetch(`${ODK_BASE_URL}/v1/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@example.com', password: 'secret123' }),
      });

      await fetch(`${ODK_BASE_URL}/v1/projects/1/forms?publish=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml' },
        body: '<xml/>',
      });

      const sessionRequests = mockServerState.getRequestsByPath('/v1/sessions');
      expect(sessionRequests).toHaveLength(1);

      const formRequests = mockServerState.getRequestsByPath('/v1/projects');
      expect(formRequests).toHaveLength(1);
    });

    it('should get last request', async () => {
      await fetch(`${ODK_BASE_URL}/v1/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@example.com', password: 'secret123' }),
      });

      await fetch(`${ODK_BASE_URL}/v1/projects/1/forms?publish=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml' },
        body: '<xml/>',
      });

      const lastRequest = mockServerState.getLastRequest();
      expect(lastRequest?.path).toContain('/v1/projects');
    });

    it('should clear requests', async () => {
      await fetch(`${ODK_BASE_URL}/v1/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@example.com', password: 'secret123' }),
      });

      expect(mockServerState.getRequests()).toHaveLength(1);

      mockServerState.clearRequests();

      expect(mockServerState.getRequests()).toHaveLength(0);
    });
  });
});
