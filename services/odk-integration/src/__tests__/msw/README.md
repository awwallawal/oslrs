# MSW Mock ODK Central Server

Mock Service Worker (MSW) setup for testing `@oslsr/odk-integration` without a live ODK Central instance.

## Quick Start

```typescript
import { describe, it, expect } from 'vitest';
import {
  initMswForTest,
  mockServerState,
  ODK_BASE_URL,
} from './msw/index.js';
import { clearOdkSession } from '../odk-client.js';

// Initialize MSW for this test file
initMswForTest();

// Clear session cache between tests
beforeEach(() => {
  clearOdkSession();
});

describe('My ODK Integration Tests', () => {
  it('should deploy form successfully', async () => {
    // Your test code here
    // Fetch requests to ODK_BASE_URL will be intercepted
  });
});
```

## Features

### Simulated Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/sessions` | POST | Authentication - returns session token |
| `/v1/projects/:projectId/forms` | POST | First-time form publish |
| `/v1/projects/:projectId/forms/:xmlFormId/draft` | POST | Draft upload (version update) |
| `/v1/projects/:projectId/forms/:xmlFormId/draft/publish` | POST | Publish draft |

### Request Logging

All requests are logged for assertion:

```typescript
import { mockServerState } from './msw/index.js';

// After making requests
const requests = mockServerState.getRequests();
const sessionRequest = mockServerState.getRequestsByPath('/v1/sessions')[0];
const lastRequest = mockServerState.getLastRequest();

// Assert on request details
expect(sessionRequest.body).toEqual({
  email: 'admin@example.com',
  password: 'secret123',
});
expect(lastRequest.headers['authorization']).toMatch(/^Bearer /);
```

### Error Injection

Simulate failures for specific tests:

```typescript
import { mockServerState } from './msw/index.js';

// Next request will fail with 500
mockServerState.setNextError(500, 'INTERNAL_ERROR', 'Database unavailable');

// Or 401 for auth failure
mockServerState.setNextError(401, 401.2, 'Invalid credentials');

// Error is consumed after one use (subsequent requests succeed)
```

### Form State Management

Pre-register forms to trigger 409 (version update flow):

```typescript
import { mockServerState, server, http, HttpResponse, ODK_BASE_URL } from './msw/index.js';

// Option 1: Use server.use() to override handler (recommended for specific scenarios)
server.use(
  http.post(`${ODK_BASE_URL}/v1/projects/:projectId/forms`, async () => {
    return HttpResponse.json(
      { code: 409.3, details: { xmlFormId: 'my_form' } },
      { status: 409 }
    );
  })
);

// Option 2: Pre-register form (for draft/publish handlers)
mockServerState.preRegisterForm('my_form', 1);
```

### Custom Handler Overrides

Override handlers for specific test scenarios:

```typescript
import { server, http, HttpResponse, ODK_BASE_URL } from './msw/index.js';

test('handles timeout', async () => {
  server.use(
    http.post(`${ODK_BASE_URL}/v1/sessions`, async () => {
      // Simulate network error
      return HttpResponse.error();
    })
  );

  // Your test code - will get network error
});
```

## Request Inspector Utilities

More advanced request filtering:

```typescript
import {
  getRequests,
  getLastRequest,
  clearRequests,
  getRequestCount,
  expectRequest,
} from './msw/request-inspector.js';

// Filter by method
const postRequests = getRequests({ method: 'POST' });

// Filter by path pattern
const formRequests = getRequests({ pathPattern: /\/forms/ });

// Filter by header presence
const authRequests = getRequests({ hasHeader: 'authorization' });

// Assert specific request was made
expectRequest({
  method: 'POST',
  path: '/v1/sessions',
  bodyContains: { email: 'admin@example.com' },
});

// Clear requests mid-test
clearRequests();
const newRequests = getRequests(); // empty
```

## Configuration

### Default Credentials

The mock server accepts these credentials by default:

- Email: `admin@example.com`
- Password: `secret123`

To change:

```typescript
mockServerState.setValidCredentials('other@example.com', 'other_password');
```

### Base URL

All handlers are registered at `ODK_BASE_URL` (defaults to `https://odk.example.com`).

Set this in your test's `beforeEach`:

```typescript
beforeEach(() => {
  vi.stubEnv('ODK_CENTRAL_URL', ODK_BASE_URL);
});
```

## Architecture

```
msw/
├── index.ts          # Main exports, initMswForTest()
├── handlers.ts       # MSW request handlers for ODK Central API
├── server.ts         # MSW setupServer() instance
├── server-state.ts   # Shared state (forms, requests, errors)
├── request-inspector.ts  # Convenience utilities for assertions
├── setup.ts          # Vitest lifecycle hooks (deprecated - use initMswForTest)
└── README.md         # This file
```

## Extending for Future Stories

### Story 2-3: ODK App User Provisioning

Add handlers to `handlers.ts`:

```typescript
// GET /v1/projects/:projectId/app-users
const listAppUsersHandler = http.get(
  `${ODK_BASE_URL}/v1/projects/:projectId/app-users`,
  async ({ params }) => {
    // Implementation
  }
);

// Add to handlers array
export const handlers = [
  // ... existing handlers
  listAppUsersHandler,
];
```

### Story 2-4: Encrypted Token Management

Add token generation handlers:

```typescript
// POST /v1/projects/:projectId/app-users/:appUserId/token
const createAppUserTokenHandler = http.post(
  `${ODK_BASE_URL}/v1/projects/:projectId/app-users/:appUserId/token`,
  async () => {
    // Return QR code token
  }
);
```

## Troubleshooting

### Tests interfering with each other

Ensure you're calling `initMswForTest()` and `clearOdkSession()`:

```typescript
initMswForTest();  // Sets up beforeAll/afterEach/afterAll

beforeEach(() => {
  clearOdkSession();  // Clear cached auth token
});
```

### Unhandled request warnings

If you see "intercepted a request without a matching request handler", either:

1. Add a handler for that endpoint in `handlers.ts`
2. Or use `server.use()` to add a temporary handler for that test

### Handler not being called

Check:
1. URL matches exactly (including base URL)
2. HTTP method is correct
3. No other handler is matching first (MSW uses first match)
