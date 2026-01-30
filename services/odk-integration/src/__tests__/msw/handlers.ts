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
 * GET /v1/users/current - Connectivity check (Story 2-5)
 *
 * Lightweight endpoint to verify ODK Central is reachable and authenticated.
 * Per ADR-009: Used for health monitoring.
 *
 * Success (200): Returns current user info
 * Failure (401): Invalid/expired session
 */
const getCurrentUserHandler = http.get(
  `${ODK_BASE_URL}/v1/users/current`,
  async ({ request }) => {
    mockServerState.logRequest({
      method: 'GET',
      path: '/v1/users/current',
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

    // Check connectivity simulation
    if (!mockServerState.isConnectivityEnabled()) {
      return HttpResponse.json(
        { code: 503, message: 'Service unavailable' },
        { status: 503 }
      );
    }

    // Return mock user
    return HttpResponse.json({
      id: 1,
      type: 'user',
      displayName: 'Admin User',
      email: 'admin@example.com',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  }
);

/**
 * GET /v1/projects/:projectId/forms - List forms (Story 2-5)
 *
 * Returns all forms in a project. Used for health monitoring to
 * aggregate submission counts across forms.
 *
 * Success (200): Returns array of OdkFormInfo
 */
const listFormsHandler = http.get(
  `${ODK_BASE_URL}/v1/projects/:projectId/forms`,
  async ({ request, params }) => {
    const projectId = parseInt(params.projectId as string, 10);

    mockServerState.logRequest({
      method: 'GET',
      path: `/v1/projects/${projectId}/forms`,
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

    // Return all forms for this project
    const forms = mockServerState.getFormsForProject(projectId);
    return HttpResponse.json(forms);
  }
);

/**
 * GET /v1/projects/:projectId/forms/:xmlFormId/submissions - List submissions (Story 2-5)
 *
 * Returns submissions for a specific form. Supports OData query params:
 * - $count=true to include total count
 * - $top=N to limit results
 * - $skip=N for pagination
 * - $filter=... for filtering (supports __system/submissionDate gt 'date')
 *
 * Used for health monitoring submission gap detection and backfill.
 *
 * Success (200): Returns OData response with submissions and @odata.count
 */
const listSubmissionsHandler = http.get(
  `${ODK_BASE_URL}/v1/projects/:projectId/forms/:xmlFormId/submissions`,
  async ({ request, params }) => {
    const projectId = parseInt(params.projectId as string, 10);
    const xmlFormId = decodeURIComponent(params.xmlFormId as string);
    const url = new URL(request.url);
    const includeCount = url.searchParams.get('$count') === 'true';
    const top = parseInt(url.searchParams.get('$top') || '250', 10);
    const skip = parseInt(url.searchParams.get('$skip') || '0', 10);
    const filter = url.searchParams.get('$filter');

    mockServerState.logRequest({
      method: 'GET',
      path: `/v1/projects/${projectId}/forms/${xmlFormId}/submissions`,
      headers: Object.fromEntries(request.headers.entries()),
      body: null,
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

    // Try to get explicitly set submissions first
    let submissions = mockServerState.getSubmissions(xmlFormId);
    let totalCount: number;

    // If explicit submissions were set, use those
    if (submissions.length > 0) {
      totalCount = submissions.length;
    } else {
      // Otherwise generate based on stored count
      totalCount = mockServerState.getSubmissionCount(xmlFormId);
      if (top > 0) {
        const startIndex = skip;
        const endIndex = Math.min(skip + top, totalCount);
        for (let i = startIndex; i < endIndex; i++) {
          submissions.push({
            instanceId: `submission-${xmlFormId}-${i}`,
            submitterId: 1,
            createdAt: new Date(Date.now() - i * 60000).toISOString(),
            updatedAt: new Date(Date.now() - i * 60000).toISOString(),
          });
        }
      }
    }

    // Apply filter if present (supports __system/submissionDate gt 'date')
    if (filter) {
      const dateMatch = filter.match(/__system\/submissionDate gt '([^']+)'/);
      if (dateMatch) {
        const afterDate = new Date(dateMatch[1]).getTime();
        submissions = submissions.filter(
          (sub) => new Date(sub.createdAt).getTime() > afterDate
        );
        // Recalculate count after filtering
        totalCount = submissions.length;
      }
    }

    // Apply pagination
    const paginatedSubmissions = submissions.slice(skip, skip + top);

    // Return OData-style response
    const response: Record<string, unknown> = {
      value: paginatedSubmissions,
    };

    if (includeCount) {
      response['@odata.count'] = totalCount;
    }

    return HttpResponse.json(response);
  }
);

/**
 * PATCH /v1/projects/:projectId/forms/:xmlFormId - Update form (Story 2-5)
 *
 * Updates form properties including state. Used for unpublishing forms.
 *
 * ODK Central form states:
 * - 'open': Accepting submissions (published)
 * - 'closing': No new submissions, existing data accessible (unpublished)
 * - 'closed': Archived, no access
 *
 * Success (200): Returns updated form info
 * Failure (404): Form not found
 */
const updateFormHandler = http.patch(
  `${ODK_BASE_URL}/v1/projects/:projectId/forms/:xmlFormId`,
  async ({ request, params }) => {
    const projectId = parseInt(params.projectId as string, 10);
    const xmlFormId = decodeURIComponent(params.xmlFormId as string);
    const body = await request.json() as { state?: string };

    mockServerState.logRequest({
      method: 'PATCH',
      path: `/v1/projects/${projectId}/forms/${xmlFormId}`,
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

    // Check if form exists
    const existingForm = mockServerState.getForm(xmlFormId);
    if (!existingForm) {
      return HttpResponse.json(
        { code: 404.1, message: 'Form not found' },
        { status: 404 }
      );
    }

    // Update form state
    const now = new Date();
    const updatedForm: MockForm = {
      ...existingForm,
      state: body.state || existingForm.state,
      updatedAt: now.toISOString(),
    };

    mockServerState.updateForm(xmlFormId, updatedForm);

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
  getCurrentUserHandler,
  listFormsHandler,
  listSubmissionsHandler,
  createFormHandler,
  uploadDraftHandler,
  publishDraftHandler,
  updateFormHandler,
  createAppUserHandler,
];

export { ODK_BASE_URL };
