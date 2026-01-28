/**
 * MSW Handlers for ODK Central API Simulation
 *
 * These handlers simulate the ODK Central REST API for integration testing.
 * All endpoints match the real ODK Central API documented at:
 * https://docs.getodk.org/central-api-form-management/
 *
 * @module msw/handlers
 */

import { http, HttpResponse } from 'msw';
import { mockServerState, type MockForm } from './server-state.js';

const ODK_BASE_URL = 'https://odk.example.com';

/**
 * POST /v1/sessions - Authenticate and obtain session token
 *
 * ODK Central uses session-based authentication. This endpoint accepts
 * email + password and returns a bearer token for subsequent requests.
 *
 * Success (200): Returns OdkSessionResponse with token, createdAt, expiresAt
 * Failure (401): Returns OdkErrorResponse for invalid credentials
 */
const sessionsHandler = http.post(`${ODK_BASE_URL}/v1/sessions`, async ({ request }) => {
  // Log the request for assertion purposes
  const body = await request.json() as { email?: string; password?: string };
  mockServerState.logRequest({
    method: 'POST',
    path: '/v1/sessions',
    headers: Object.fromEntries(request.headers.entries()),
    body,
  });

  // Check for configured error injection
  const injectedError = mockServerState.consumeNextError();
  if (injectedError) {
    return HttpResponse.json(
      { code: injectedError.code, message: injectedError.message },
      { status: injectedError.status }
    );
  }

  // Validate credentials
  const validCredentials = mockServerState.getValidCredentials();
  if (body.email !== validCredentials.email || body.password !== validCredentials.password) {
    return HttpResponse.json(
      { code: 401.2, message: 'Could not authenticate with the provided credentials.' },
      { status: 401 }
    );
  }

  // Return successful session response
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

  return HttpResponse.json({
    token: mockServerState.generateSessionToken(),
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });
});

/**
 * POST /v1/projects/:projectId/forms - First-time form publish
 *
 * Creates a new form in ODK Central. If query param publish=true, the form
 * is immediately published. Otherwise, it's created as a draft.
 *
 * Success (200): Returns OdkFormResponse with xmlFormId, projectId, publishedAt
 * Conflict (409): Form with same xmlFormId already exists (triggers version-update flow)
 */
const createFormHandler = http.post(
  `${ODK_BASE_URL}/v1/projects/:projectId/forms`,
  async ({ request, params }) => {
    const projectId = parseInt(params.projectId as string, 10);
    const url = new URL(request.url);
    const shouldPublish = url.searchParams.get('publish') === 'true';
    const contentType = request.headers.get('content-type') || '';

    // Validate Content-Type header (catches content-type detection bugs)
    const isXlsx = contentType.includes('spreadsheetml') || contentType.includes('openxmlformats');
    const isXml = contentType === 'application/xml' || contentType === 'text/xml';

    if (!isXlsx && !isXml) {
      mockServerState.logRequest({
        method: 'POST',
        path: `/v1/projects/${projectId}/forms`,
        headers: Object.fromEntries(request.headers.entries()),
        body: '[binary]',
        contentTypeWarning: `Unexpected Content-Type: ${contentType}`,
      });
    }

    // Extract xmlFormId from headers sent by the real service
    // Priority: X-XlsForm-FormId-Fallback (sent by deployFormToOdk) > Content-Disposition filename > auto-generated
    const formIdFallback = request.headers.get('x-xlsform-formid-fallback');
    const contentDisposition = request.headers.get('content-disposition');
    const filenameMatch = contentDisposition?.match(/filename="?([^";\s]+)"?/i);
    const filenameFormId = filenameMatch?.[1]?.replace(/\.(xlsx|xml)$/i, '');
    const xmlFormId = formIdFallback || filenameFormId || `form_${Date.now()}`;

    mockServerState.logRequest({
      method: 'POST',
      path: `/v1/projects/${projectId}/forms`,
      headers: Object.fromEntries(request.headers.entries()),
      body: '[binary]',
      query: Object.fromEntries(url.searchParams.entries()),
    });

    // Check for configured error injection
    const injectedError = mockServerState.consumeNextError();
    if (injectedError) {
      return HttpResponse.json(
        { code: injectedError.code, message: injectedError.message },
        { status: injectedError.status }
      );
    }

    // Check if form already exists (return 409 for version-update flow)
    if (mockServerState.formExists(xmlFormId)) {
      return HttpResponse.json(
        {
          code: 409.3,
          message: 'A resource already exists with xmlFormId value(s) of ' + xmlFormId,
          details: { xmlFormId },
        },
        { status: 409 }
      );
    }

    // Create new form
    const now = new Date();
    const formResponse = {
      xmlFormId,
      projectId,
      name: xmlFormId,
      version: '1.0.0',
      state: shouldPublish ? 'open' : 'draft',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      ...(shouldPublish && { publishedAt: now.toISOString() }),
    };

    // Store form in state
    mockServerState.addForm(xmlFormId, formResponse);

    return HttpResponse.json(formResponse);
  }
);

/**
 * POST /v1/projects/:projectId/forms/:xmlFormId/draft - Upload draft version
 *
 * Uploads a new version of an existing form as a draft. This is the first step
 * of the version-update flow (triggered when first-time publish returns 409).
 *
 * Success (200): Draft uploaded successfully
 * Not Found (404): Form doesn't exist
 */
const uploadDraftHandler = http.post(
  `${ODK_BASE_URL}/v1/projects/:projectId/forms/:xmlFormId/draft`,
  async ({ request, params }) => {
    const projectId = parseInt(params.projectId as string, 10);
    const xmlFormId = decodeURIComponent(params.xmlFormId as string);
    const contentType = request.headers.get('content-type') || '';

    mockServerState.logRequest({
      method: 'POST',
      path: `/v1/projects/${projectId}/forms/${xmlFormId}/draft`,
      headers: Object.fromEntries(request.headers.entries()),
      body: '[binary]',
    });

    // Check for configured error injection
    const injectedError = mockServerState.consumeNextError();
    if (injectedError) {
      return HttpResponse.json(
        { code: injectedError.code, message: injectedError.message },
        { status: injectedError.status }
      );
    }

    // Validate Content-Type header
    const isXlsx = contentType.includes('spreadsheetml') || contentType.includes('openxmlformats');
    const isXml = contentType === 'application/xml' || contentType === 'text/xml';

    if (!isXlsx && !isXml) {
      return HttpResponse.json(
        { code: 400.1, message: `Invalid Content-Type: ${contentType}` },
        { status: 400 }
      );
    }

    // Mark form as having a pending draft
    mockServerState.setFormDraft(xmlFormId, true);

    return new HttpResponse(null, { status: 200 });
  }
);

/**
 * POST /v1/projects/:projectId/forms/:xmlFormId/draft/publish - Publish draft
 *
 * Publishes a previously uploaded draft. This is the second step of the
 * version-update flow, completing the update process.
 *
 * Success (200): Returns OdkFormResponse with updated publishedAt
 * Bad Request (400): No draft exists to publish
 */
const publishDraftHandler = http.post(
  `${ODK_BASE_URL}/v1/projects/:projectId/forms/:xmlFormId/draft/publish`,
  async ({ request, params }) => {
    const projectId = parseInt(params.projectId as string, 10);
    const xmlFormId = decodeURIComponent(params.xmlFormId as string);

    mockServerState.logRequest({
      method: 'POST',
      path: `/v1/projects/${projectId}/forms/${xmlFormId}/draft/publish`,
      headers: Object.fromEntries(request.headers.entries()),
      body: null,
    });

    // Check for configured error injection
    const injectedError = mockServerState.consumeNextError();
    if (injectedError) {
      return HttpResponse.json(
        { code: injectedError.code, message: injectedError.message },
        { status: injectedError.status }
      );
    }

    // Check if form has a pending draft
    if (!mockServerState.hasFormDraft(xmlFormId)) {
      return HttpResponse.json(
        { code: 400.2, message: 'No draft to publish for this form.' },
        { status: 400 }
      );
    }

    // Publish the draft
    const now = new Date();
    const existingForm = mockServerState.getForm(xmlFormId);
    const updatedForm: MockForm = {
      xmlFormId,
      projectId,
      name: existingForm?.name || xmlFormId,
      version: existingForm?.version || '1.0.0',
      state: 'open',
      createdAt: existingForm?.createdAt || now.toISOString(),
      updatedAt: now.toISOString(),
      publishedAt: now.toISOString(),
    };

    mockServerState.updateForm(xmlFormId, updatedForm);
    mockServerState.setFormDraft(xmlFormId, false);

    return HttpResponse.json(updatedForm);
  }
);

/**
 * POST /v1/projects/:projectId/app-users - Create App User (field key)
 *
 * Creates a new App User for mobile/web data collection authentication.
 * Returns the token ONLY on creation - it cannot be retrieved later.
 *
 * Per Story 2-3: Used for field role staff (Enumerator, Supervisor) to
 * authenticate with Enketo for form submission.
 *
 * Success (200): Returns OdkAppUserApiResponse with id, type, displayName, token, createdAt
 * Failure (401): Invalid session token
 * Failure (404): Project not found
 */
const createAppUserHandler = http.post(
  `${ODK_BASE_URL}/v1/projects/:projectId/app-users`,
  async ({ request, params }) => {
    const projectId = parseInt(params.projectId as string, 10);
    const body = await request.json() as { displayName?: string };

    mockServerState.logRequest({
      method: 'POST',
      path: `/v1/projects/${projectId}/app-users`,
      headers: Object.fromEntries(request.headers.entries()),
      body,
    });

    // Check for configured error injection
    const injectedError = mockServerState.consumeNextError();
    if (injectedError) {
      return HttpResponse.json(
        { code: injectedError.code, message: injectedError.message },
        { status: injectedError.status }
      );
    }

    // Validate displayName
    if (!body.displayName || typeof body.displayName !== 'string') {
      return HttpResponse.json(
        { code: 400.1, message: 'displayName is required' },
        { status: 400 }
      );
    }

    // Create App User
    const appUser = mockServerState.createAppUser(projectId, body.displayName);

    // Return response matching ODK Central API
    return HttpResponse.json({
      id: appUser.id,
      type: appUser.type,
      displayName: appUser.displayName,
      token: appUser.token,
      createdAt: appUser.createdAt,
    });
  }
);

/**
 * All ODK Central API handlers for MSW
 *
 * Export as array for use with setupServer()
 */
export const handlers = [
  sessionsHandler,
  createFormHandler,
  uploadDraftHandler,
  publishDraftHandler,
  createAppUserHandler,
];

export { ODK_BASE_URL };
