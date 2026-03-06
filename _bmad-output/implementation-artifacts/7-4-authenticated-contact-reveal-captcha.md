# Story 7.4: Authenticated Contact Reveal & CAPTCHA

Status: ready-for-dev

## Story

As a **Public Searcher**,
I want to see the contact details of a skilled worker,
So that I can hire them for a job.

## Context

This is the fourth story of Epic 7: Public Skills Marketplace & Search Security. It implements the **contact reveal flow** — the authenticated, CAPTCHA-protected mechanism through which employers can see a worker's name and phone number. This is the transition from anonymous browsing (Stories 7-2, 7-3) to identified contact, gated by authentication, CAPTCHA, and the worker's `consent_enriched` flag.

**Prerequisites:**
- **Story 7-1 (marketplace data extraction worker)** — provides `marketplace_profiles` table with `respondentId` FK and `consentEnriched` flag.
- **Story 7-2 (public marketplace search interface)** — provides marketplace route structure, controller, service, and rate limiting middleware.
- **Story 7-3 (anonymous profile & verified badges)** — provides profile detail page with the placeholder "Reveal Contact" button that this story activates.
- **prep-5 (public route security spike)** must be completed — provides CAPTCHA trigger conditions, rate limiting design for contact reveal, and input validation strategy.

**Architecture context:** The architecture document (lines 668-808) specifies a three-tier data access model:
1. `/marketplace/search` — public, no auth, anonymous profiles only
2. `/marketplace/profiles/:id` — public, no auth, anonymous detail (Story 7-3)
3. `/marketplace/profiles/:id/reveal` — **authenticated + CAPTCHA**, reveals PII if consent given (THIS STORY)

**Security design:** Contact reveal is the highest-value operation in the marketplace — it exposes PII (name, phone). The architecture specifies: Layer 6 (authentication for contact details) + Layer 2 (CAPTCHA) + rate limiting + immutable audit logging.

**Scope split with Story 7-6:** This story implements the core reveal feature with basic rate limiting via SQL count on `contact_reveals`. Story 7-6 adds Redis-accelerated rate limiting, device fingerprinting, enhanced monitoring, and admin analytics.

## Acceptance Criteria

1. **Given** an authenticated user on the profile detail page, **when** they click "Reveal Contact Details" and pass the CAPTCHA, **then** the system calls `POST /api/v1/marketplace/profiles/:id/reveal` with the CAPTCHA token and returns the worker's first name, last name, and phone number.
2. **Given** the reveal endpoint, **when** the user is NOT authenticated (no valid JWT), **then** the server returns 401 with `{ code: 'AUTH_REQUIRED', message: 'You must log in to view contact details' }`.
3. **Given** the reveal endpoint, **when** the CAPTCHA token is missing or invalid, **then** the server returns 400 with `{ code: 'AUTH_CAPTCHA_FAILED' }`.
4. **Given** the reveal endpoint, **when** the worker has `consent_enriched = false`, **then** the server returns 404 with `{ code: 'NOT_FOUND', message: 'Profile not found or contact details not available' }` — deliberately vague to avoid exposing which profiles have opted out.
5. **Given** the reveal endpoint, **when** a successful reveal occurs, **then** the system inserts a row into the `contact_reveals` table logging: viewer user ID, profile ID, IP address, and timestamp.
6. **Given** the reveal endpoint, **when** the authenticated user has already revealed 50 contacts in the past 24 hours, **then** the server returns 429 with `{ code: 'REVEAL_LIMIT_EXCEEDED', message: 'Daily contact reveal limit reached (50 per 24 hours)', retryAfter: <seconds_until_reset> }`.
7. **Given** the frontend profile page, **when** an authenticated user clicks "Reveal Contact Details", **then** an hCaptcha challenge appears, and upon solving it, the reveal API is called and the PII is displayed inline on the profile page.
8. **Given** the frontend profile page, **when** the user is NOT authenticated and clicks "Sign in to Reveal Contact", **then** they are navigated to `/login` with `state: { from: '/marketplace/profile/:id' }` (React Router location state, NOT a query param — see LoginPage.tsx:20-21).
9. **Given** the existing test suite, **when** all tests run, **then** comprehensive tests cover: reveal happy path, auth required, CAPTCHA required, consent gate, 50/24h rate limit, audit logging, and zero regressions.

## Tasks / Subtasks

- [ ] Task 1: Create `contact_reveals` schema (AC: #5, #6)
  - [ ] 1.1 Create `apps/api/src/db/schema/contact-reveals.ts`:
    ```typescript
    export const contactReveals = pgTable('contact_reveals', {
      id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
      viewerId: uuid('viewer_id').notNull(),        // authenticated user who viewed
      profileId: uuid('profile_id').notNull(),       // marketplace_profiles.id
      ipAddress: text('ip_address'),
      userAgent: text('user_agent'),
      createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    });
    ```
  - [ ] 1.2 Add index for rate limit query: btree on `(viewer_id, created_at DESC)` — enables efficient `COUNT WHERE viewer_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`
  - [ ] 1.3 Export from `apps/api/src/db/schema/index.ts`
  - [ ] 1.4 Run `pnpm --filter @oslsr/api db:push:force` to apply schema
  - [ ] 1.5 **Schema convention:** Do NOT import from `@oslsr/types` in schema files (drizzle-kit constraint). Do NOT add FK references to `marketplace_profiles` or `users` — the profile or user might be deleted in the future, and orphaned log entries are acceptable for audit purposes.

- [ ] Task 2: Create contact reveal service method (AC: #1, #4, #5, #6)
  - [ ] 2.1 In `apps/api/src/services/marketplace.service.ts` (created in Story 7-2), add a `revealContact(profileId: string, viewerId: string, ipAddress: string, userAgent: string)` method:
    1. Fetch marketplace profile by `id`
    2. If not found → return `{ status: 'not_found' }`
    3. Fetch respondent by `profile.respondentId` from `respondents` table
    4. If respondent not found → return `{ status: 'not_found' }` (data integrity issue, log warning)
    5. **Consent gate:** If `profile.consentEnriched !== true` → return `{ status: 'not_found' }` (deliberately same as missing — prevents enumeration of consent status)
    6. **Rate limit check:** Count rows in `contact_reveals` where `viewer_id = viewerId AND created_at > NOW() - INTERVAL '24 hours'`. If `>= 50` → return `{ status: 'rate_limited', retryAfter: <seconds> }`
    7. **Insert audit row:** Insert into `contact_reveals`: `{ viewerId, profileId, ipAddress, userAgent }`
    8. **Also log via AuditService:** `AuditService.logPiiAccess(req, 'pii.contact_reveal', 'marketplace_profiles', profileId, { viewerRole: user.role })` — fire-and-forget, immutable hash chain
    9. Return `{ status: 'success', data: { firstName: respondent.firstName, lastName: respondent.lastName, phoneNumber: respondent.phoneNumber } }`
  - [ ] 2.2 **PII JOIN pattern** (from `respondent.service.ts`):
    ```typescript
    // marketplace_profiles → respondents JOIN for PII
    const [profile] = await db.select({
      respondentId: marketplaceProfiles.respondentId,
      consentEnriched: marketplaceProfiles.consentEnriched,
    }).from(marketplaceProfiles).where(eq(marketplaceProfiles.id, profileId)).limit(1);

    const [respondent] = await db.select({
      firstName: respondents.firstName,
      lastName: respondents.lastName,
      phoneNumber: respondents.phoneNumber,
    }).from(respondents).where(eq(respondents.id, profile.respondentId)).limit(1);
    ```
  - [ ] 2.3 **Rate limit TTL calculation:** Query `MIN(created_at)` in the 24h window to calculate `retryAfter` seconds until the oldest reveal expires

- [ ] Task 3: Create contact reveal controller method (AC: #1, #2, #3, #4, #6)
  - [ ] 3.1 In `apps/api/src/controllers/marketplace.controller.ts` (created in Story 7-2), add a `revealContact(req, res, next)` static method:
    - Extract `id` from `req.params` (profile ID)
    - Validate UUID format
    - Get `req.user.sub` as viewer ID (guaranteed by `authenticate` middleware)
    - Get `req.ip` and `req.get('user-agent')`
    - Call `MarketplaceService.revealContact(id, userId, ip, userAgent)`
    - Map service result to HTTP response:
      - `not_found` → `throw new AppError('NOT_FOUND', 'Profile not found or contact details not available', 404)`
      - `rate_limited` → `res.status(429).json({ status: 'error', code: 'REVEAL_LIMIT_EXCEEDED', message: 'Daily contact reveal limit reached (50 per 24 hours)', retryAfter })`
      - `success` → `res.json({ data: { firstName, lastName, phoneNumber } })`
  - [ ] 3.2 The CAPTCHA token comes from `req.body.captchaToken` — the `verifyCaptcha` middleware handles validation before the controller runs. No CAPTCHA logic needed in the controller.

- [ ] Task 4: Add reveal route with auth + CAPTCHA middleware (AC: #1, #2, #3)
  - [ ] 4.1 In `apps/api/src/routes/marketplace.routes.ts` (created in Story 7-2), add:
    ```typescript
    import { authenticate } from '../middleware/auth.js';
    import { verifyCaptcha } from '../middleware/captcha.js';

    // POST /api/v1/marketplace/profiles/:id/reveal — authenticated + CAPTCHA
    router.post('/profiles/:id/reveal',
      authenticate,                    // Middleware 1: JWT required
      verifyCaptcha,                   // Middleware 2: hCaptcha required
      MarketplaceController.revealContact  // Handler
    );
    ```
  - [ ] 4.2 Middleware stack order: `authenticate` → `verifyCaptcha` → controller. Auth first so we know WHO is requesting before burning a CAPTCHA solve. This matches the `auth.routes.ts` pattern (lines 21-26).
  - [ ] 4.3 **No additional IP rate limiting for this route** beyond the 50/24h per-user check in the service. The `authenticate` middleware already rejects unauthenticated requests, and creating an account requires email verification (Layer 6 bot protection). Story 7-6 adds Redis-accelerated rate limiting if needed.

- [ ] Task 5: Add contact reveal types (AC: #1)
  - [ ] 5.1 In `packages/types/src/marketplace.ts`, add:
    ```typescript
    export interface ContactRevealResponse {
      firstName: string | null;
      lastName: string | null;
      phoneNumber: string | null;
    }

    export interface ContactRevealRequest {
      captchaToken: string;
    }
    ```
  - [ ] 5.2 Export from `packages/types/src/index.ts` (if not already)

- [ ] Task 6: Activate "Reveal Contact" button on profile page (AC: #7, #8)
  - [ ] 6.1 In `apps/web/src/features/marketplace/pages/MarketplaceProfilePage.tsx` (created in Story 7-3), replace the placeholder "Reveal Contact" button with the functional implementation:
    - **Unauthenticated user** (no token in `sessionStorage.getItem('oslsr_access_token')`):
      - Button text: "Sign in to Reveal Contact"
      - On click: `navigate('/login', { state: { from: `/marketplace/profile/${id}` } })` — uses React Router location state (LoginPage.tsx:20-21 reads `location.state.from`). Do NOT use `?returnTo=` query param — it's not supported.
    - **Authenticated user, not yet revealed**:
      - Button text: "Reveal Contact Details"
      - On click: show hCaptcha challenge
      - After CAPTCHA solve: call reveal API
    - **Authenticated user, already revealed (PII visible)**:
      - Show PII inline: first name, last name, phone number
      - Show "Contact Revealed" success indicator
  - [ ] 6.2 **State management for reveal flow:**
    ```typescript
    const [revealState, setRevealState] = useState<'idle' | 'captcha' | 'loading' | 'revealed' | 'error'>('idle');
    const [revealedContact, setRevealedContact] = useState<ContactRevealResponse | null>(null);
    const [captchaToken, setCaptchaToken] = useState('');
    ```
  - [ ] 6.3 **Reveal flow sequence:**
    1. User clicks "Reveal Contact Details" → `setRevealState('captcha')`
    2. hCaptcha widget appears → user solves → `setCaptchaToken(token)`, `setRevealState('loading')`
    3. Call `revealMarketplaceContact(id, captchaToken)` via mutation
    4. On success → `setRevealedContact(data)`, `setRevealState('revealed')`
    5. On 404 → show "Contact details not available for this worker" (consent_enriched=false)
    6. On 429 → show "You've reached the daily limit of 50 contact reveals. Please try again tomorrow."
    7. On error → show generic error, reset CAPTCHA

- [ ] Task 7: Create frontend reveal API client and mutation hook (AC: #7)
  - [ ] 7.1 In `apps/web/src/features/marketplace/api/marketplace.api.ts`, add:
    ```typescript
    export async function revealMarketplaceContact(
      profileId: string,
      captchaToken: string
    ): Promise<ContactRevealResponse> {
      const response = await apiClient(`/marketplace/profiles/${profileId}/reveal`, {
        method: 'POST',
        body: JSON.stringify({ captchaToken }),
      });
      return response.data;
    }
    ```
  - [ ] 7.2 In `apps/web/src/features/marketplace/hooks/useMarketplace.ts`, add a mutation hook:
    ```typescript
    export function useRevealContact() {
      const queryClient = useQueryClient();
      return useMutation({
        mutationFn: ({ profileId, captchaToken }: { profileId: string; captchaToken: string }) =>
          revealMarketplaceContact(profileId, captchaToken),
        onSuccess: (data, variables) => {
          // Optionally cache the revealed contact to avoid re-revealing
          queryClient.setQueryData(
            marketplaceKeys.revealedContact(variables.profileId),
            data
          );
        },
      });
    }
    ```
  - [ ] 7.3 Add to `marketplaceKeys`:
    ```typescript
    revealedContact: (profileId: string) => [...marketplaceKeys.all, 'revealed', profileId] as const,
    ```
  - [ ] 7.4 **Authentication required:** The POST to `/profiles/:id/reveal` requires a Bearer token. The existing `apiClient` attaches the token from sessionStorage when present. Ensure `getAuthHeaders()` returns the token for authenticated users.

- [ ] Task 8: Integrate hCaptcha into reveal flow (AC: #7)
  - [ ] 8.1 Import the existing `HCaptcha` component from `apps/web/src/features/auth/components/HCaptcha.tsx`
  - [ ] 8.2 On the profile page, when `revealState === 'captcha'`, render the hCaptcha widget:
    ```typescript
    {revealState === 'captcha' && (
      <div className="mt-4">
        <p className="text-sm text-neutral-600 mb-2">
          Please complete the verification to view contact details.
        </p>
        <HCaptcha
          onVerify={handleCaptchaVerify}
          onExpire={handleCaptchaExpire}
          onError={handleCaptchaError}
          error={captchaError}
          reset={captchaReset}
        />
      </div>
    )}
    ```
  - [ ] 8.3 **hCaptcha handlers:**
    - `onVerify`: set token → trigger reveal mutation
    - `onExpire`: reset state to 'idle', clear token
    - `onError`: show error, reset CAPTCHA
  - [ ] 8.4 **Test bypass:** In E2E/test mode (`VITE_E2E=true`), the HCaptcha component auto-verifies with 'test-captcha-bypass' token. The backend middleware also accepts this token in test mode.

- [ ] Task 9: Display revealed PII on profile page (AC: #1, #7)
  - [ ] 9.1 When `revealState === 'revealed'`, show the contact details section:
    ```typescript
    {revealState === 'revealed' && revealedContact && (
      <Card className="border-green-200 bg-green-50">
        <CardHeader>
          <CardTitle className="text-green-800 text-lg flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" /> Contact Details Revealed
          </CardTitle>
        </CardHeader>
        <CardContent>
          <InfoRow label="Name" value={`${revealedContact.firstName} ${revealedContact.lastName}`} />
          <InfoRow label="Phone" value={revealedContact.phoneNumber} />
        </CardContent>
      </Card>
    )}
    ```
  - [ ] 9.2 If `firstName` or `phoneNumber` is null (respondent data incomplete), show "Not provided" placeholder
  - [ ] 9.3 **Cache reveal result:** Once revealed, cache in TanStack Query so navigating away and back doesn't require re-reveal. Use `queryClient.setQueryData` in the mutation `onSuccess`.

- [ ] Task 10: Handle error states (AC: #4, #6, #7)
  - [ ] 10.1 **Consent not given (404):** Show "This worker has not opted in to share contact details." in an info card. Do NOT reveal that the profile exists — the wording should be neutral.
  - [ ] 10.2 **Rate limit exceeded (429):** Show "You've reached the daily limit of 50 contact reveals. Please try again tomorrow." with a countdown timer if `retryAfter` is provided.
  - [ ] 10.3 **CAPTCHA failed:** Reset CAPTCHA widget, show "Verification failed. Please try again."
  - [ ] 10.4 **Network error:** Show generic error with retry option.

- [ ] Task 11: Write backend tests (AC: #9)
  - [ ] 11.1 Add to `apps/api/src/controllers/__tests__/marketplace.controller.test.ts`:
    - **Reveal happy path:** authenticated user + valid CAPTCHA + consent_enriched=true → 200 with firstName, lastName, phoneNumber
    - **Auth required:** no Bearer token → 401 AUTH_REQUIRED
    - **CAPTCHA required:** no captchaToken in body → 400 AUTH_CAPTCHA_FAILED
    - **Consent gate:** consent_enriched=false → 404 NOT_FOUND (same as missing profile)
    - **Profile not found:** non-existent profile ID → 404 NOT_FOUND
    - **Rate limit:** 50 reveals already in 24h → 429 REVEAL_LIMIT_EXCEEDED with retryAfter
    - **Audit logging:** verify contact_reveals row inserted after successful reveal
    - **PII fields only:** verify response contains ONLY firstName, lastName, phoneNumber — no NIN, dateOfBirth, respondentId
    - **Invalid UUID:** malformed profile ID → 400 VALIDATION_ERROR
  - [ ] 11.2 Add to `apps/api/src/services/__tests__/marketplace.service.test.ts`:
    - `revealContact` happy path
    - `revealContact` consent gate
    - `revealContact` rate limit check (count query)
    - `revealContact` audit row insertion
  - [ ] 11.3 **403 authorization test:** The reveal endpoint uses `authenticate` (not `authorize`), so any authenticated role can reveal contacts. This is by design — public_user role is the primary consumer. If role restriction is needed, add `authorize(UserRole.PUBLIC_USER, UserRole.SUPER_ADMIN, ...)` and test rejected roles.
  - [ ] 11.4 `pnpm test` — all tests pass, zero regressions

- [ ] Task 12: Write frontend tests (AC: #9)
  - [ ] 12.1 Update `apps/web/src/features/marketplace/__tests__/MarketplaceProfilePage.test.tsx`:
    - Unauthenticated: "Sign in to Reveal Contact" button renders
    - Unauthenticated: clicking navigates to `/login` with `state.from` set to profile URL
    - Authenticated: "Reveal Contact Details" button renders
    - Authenticated: clicking shows hCaptcha widget
    - After CAPTCHA solve: loading state, then PII displayed
    - Consent not given (404): shows "not opted in" message
    - Rate limit (429): shows daily limit message
    - CAPTCHA error: resets widget
  - [ ] 12.2 `cd apps/web && pnpm vitest run` — all web tests pass

## Dev Notes

### Contact Reveal Endpoint Architecture

```
POST /api/v1/marketplace/profiles/:id/reveal
  ├── authenticate          (401 if no token)
  ├── verifyCaptcha         (400 if no/invalid CAPTCHA)
  └── MarketplaceController.revealContact
        ├── Validate UUID format
        ├── MarketplaceService.revealContact(profileId, userId, ip, ua)
        │     ├── Fetch marketplace_profiles by id
        │     ├── Fetch respondents by profile.respondentId
        │     ├── Check consent_enriched === true
        │     ├── Count contact_reveals in last 24h for viewer
        │     ├── Insert contact_reveals row
        │     ├── AuditService.logPiiAccess (fire-and-forget)
        │     └── Return { firstName, lastName, phoneNumber }
        └── Map service result to HTTP response
```

### Consent Gate: 404 vs 403

The architecture specifies returning **404 (not 403)** when `consent_enriched=false`. This is deliberate:
- A 403 would reveal that the profile exists but consent was denied → attacker can enumerate consented profiles
- A 404 makes it indistinguishable from a non-existent profile
- Error message: "Profile not found or contact details not available" (deliberately vague)

### Rate Limit: 50/User/24h via SQL Count

For this story, rate limiting uses a SQL count on the `contact_reveals` table:

```typescript
const [{ count }] = await db.select({ count: sql<number>`count(*)` })
  .from(contactReveals)
  .where(and(
    eq(contactReveals.viewerId, viewerId),
    gt(contactReveals.createdAt, sql`NOW() - INTERVAL '24 hours'`)
  ));

if (count >= 50) {
  // Calculate retryAfter: seconds until oldest reveal in window expires
  const [oldest] = await db.select({ createdAt: contactReveals.createdAt })
    .from(contactReveals)
    .where(and(
      eq(contactReveals.viewerId, viewerId),
      gt(contactReveals.createdAt, sql`NOW() - INTERVAL '24 hours'`)
    ))
    .orderBy(asc(contactReveals.createdAt))
    .limit(1);

  const retryAfter = Math.ceil((oldest.createdAt.getTime() + 86400000 - Date.now()) / 1000);
  return { status: 'rate_limited', retryAfter };
}
```

Story 7-6 may add Redis-accelerated rate limiting for performance at scale.

### Middleware Stack Pattern (Follow auth.routes.ts)

```typescript
// Existing pattern from auth.routes.ts lines 21-26:
router.post('/staff/login',
  strictLoginRateLimit,
  loginRateLimit,
  verifyCaptcha,
  AuthController.staffLogin
);

// Story 7-4 pattern:
router.post('/profiles/:id/reveal',
  authenticate,           // JWT required
  verifyCaptcha,         // hCaptcha required (expects req.body.captchaToken)
  MarketplaceController.revealContact
);
```

**Order matters:** `authenticate` before `verifyCaptcha` — we need to know WHO is making the request before consuming a CAPTCHA solve, and to avoid wasting CAPTCHA resources on unauthenticated requests.

### CAPTCHA Token in POST Body

The `verifyCaptcha` middleware (`middleware/captcha.ts`) expects `req.body.captchaToken`. The frontend must send:
```json
{
  "captchaToken": "hcaptcha-response-token-from-widget"
}
```

### PII Lives on `respondents`, Not `marketplace_profiles`

The `marketplace_profiles` table stores `respondentId` (FK) but NO PII fields. Names and phone numbers are on the `respondents` table. The reveal flow requires a JOIN:

```
marketplace_profiles.respondentId → respondents.id
```

From `respondents`:
- `firstName` (text, nullable)
- `lastName` (text, nullable)
- `phoneNumber` (text, nullable)

### Existing Audit Service Pattern

`AuditService.logPiiAccess()` (`services/audit.service.ts:135-174`) is fire-and-forget:
```typescript
AuditService.logPiiAccess(
  req as AuthenticatedRequest,
  'pii.contact_reveal',      // action
  'marketplace_profiles',     // targetResource
  profileId,                  // targetId
  { viewerRole: user.role }   // details
);
```

This uses the immutable hash-chain audit trail (SHA-256 linking). The `contact_reveals` table is a SEPARATE, simpler log specifically for rate-limit enforcement and analytics.

### Frontend hCaptcha Integration

The existing `HCaptcha` component (`features/auth/components/HCaptcha.tsx`) provides:
- `onVerify(token: string)` — called when user solves CAPTCHA
- `onExpire()` — called when token expires
- `onError(error: string)` — called on widget error
- `error` prop — display error message
- `reset` prop — trigger widget reset (toggle boolean)

E2E bypass: `VITE_E2E=true` auto-verifies with `'test-captcha-bypass'`. Backend also accepts this in test mode.

### Frontend Auth State Detection on Public Pages

From Story 7-3 user correction: use `sessionStorage.getItem('oslsr_access_token')` to detect auth state on public pages. Do NOT rely on `useAuth()` if it may throw or redirect for unauthenticated users on public routes.

```typescript
const isAuthenticated = !!sessionStorage.getItem('oslsr_access_token');
```

The login route is `/login` (App.tsx:445), NOT `/auth/public/login`.

### Return-to-Profile After Login

When an unauthenticated user clicks "Sign in to Reveal Contact", use React Router location state:
```typescript
navigate('/login', { state: { from: `/marketplace/profile/${id}` } })
```

The login flow uses `location.state.from` (set by `ProtectedRoute` or manually):
- `LoginPage.tsx:20-21`: `const from = state?.from || '/dashboard';` reads the return path
- `LoginPage.tsx:27`: passes `from` as `redirectTo` to `LoginForm`
- `useLogin.ts:121`: `navigate(redirectTo, { replace: true })` redirects after successful login

**Do NOT use `?returnTo=` query param** — the login page does not parse query parameters for redirect. Only `location.state.from` is supported.

### Scope Split: Story 7-4 vs 7-6

| Feature | Story 7-4 (This Story) | Story 7-6 |
|---------|----------------------|-----------|
| Reveal endpoint | Yes | No |
| Auth + CAPTCHA | Yes | No |
| `contact_reveals` table | Yes (create) | Extend (add device_fingerprint column) |
| 50/user/24h check | Yes (SQL count) | Redis-accelerated check |
| Device fingerprinting | No | Yes (FingerprintJS, x-device-fingerprint header) |
| Audit logging | Yes (AuditService + contact_reveals) | Enhanced analytics |
| Admin monitoring | No | Yes (dashboard, alerts) |
| Frontend reveal UI | Yes | No |

### What This Story Does NOT Include (Future Stories)

| Feature | Story | Why Not Here |
|---------|-------|-------------|
| Profile self-edit (bio, portfolio) | 7-5 | Edit token, SMS integration |
| Device fingerprinting | 7-6 | FingerprintJS library, additional complexity |
| Redis-accelerated rate limiting | 7-6 | SQL count is sufficient at current scale |
| Contact reveal admin dashboard | 7-6 | Monitoring and analytics |
| Progressive CAPTCHA escalation | 7-6 | Enterprise difficulty after repeated failures |

### Project Structure Notes

**New files:**
- `apps/api/src/db/schema/contact-reveals.ts` — contact_reveals table schema
- (Frontend files are modifications to existing Story 7-3 components)

**Modified files:**
- `apps/api/src/db/schema/index.ts` — Export contactReveals schema
- `apps/api/src/services/marketplace.service.ts` — Add `revealContact()` method
- `apps/api/src/controllers/marketplace.controller.ts` — Add `revealContact()` method
- `apps/api/src/routes/marketplace.routes.ts` — Add POST `/profiles/:id/reveal` route
- `packages/types/src/marketplace.ts` — Add `ContactRevealResponse`, `ContactRevealRequest`
- `apps/web/src/features/marketplace/pages/MarketplaceProfilePage.tsx` — Activate reveal button, add hCaptcha, show PII
- `apps/web/src/features/marketplace/api/marketplace.api.ts` — Add `revealMarketplaceContact()`
- `apps/web/src/features/marketplace/hooks/useMarketplace.ts` — Add `useRevealContact()` mutation, `marketplaceKeys.revealedContact`
- `apps/api/src/controllers/__tests__/marketplace.controller.test.ts` — Add reveal tests
- `apps/api/src/services/__tests__/marketplace.service.test.ts` — Add revealContact tests
- `apps/web/src/features/marketplace/__tests__/MarketplaceProfilePage.test.tsx` — Add reveal flow tests

### Anti-Patterns to Avoid

- **Do NOT return 403 when consent_enriched is false** — return 404 to prevent consent enumeration. The attacker should not know if the profile exists vs has no consent.
- **Do NOT expose `respondentId` in the reveal response** — only return `firstName`, `lastName`, `phoneNumber`.
- **Do NOT expose `consentEnriched` value in any public or reveal response** — this is internal state.
- **Do NOT skip the CAPTCHA** — it's always required for contact reveal per architecture spec and AC. No `optionalCaptcha` for this endpoint.
- **Do NOT implement device fingerprinting** — that's Story 7-6 scope. The `contact_reveals` table has an optional `device_fingerprint` column for 7-6 to populate.
- **Do NOT add `device_fingerprint` as a required header** — the architecture shows it, but Story 7-6 implements it. This story uses user ID + IP for rate limiting.
- **Do NOT cache revealed PII on the server** — each reveal should be a fresh query. Client-side caching via TanStack Query is fine for the session.
- **Do NOT allow re-reveal without counting** — every reveal POST increments the counter, even for the same profile. This matches the architecture spec ("50 contacts per 24 hours" not "50 unique contacts").

### References

- [Source: epics.md:1989-2001] — Story 7.4 acceptance criteria
- [Source: architecture.md:668-674] — Marketplace route security model (3-route table)
- [Source: architecture.md:730-808] — Contact reveal flow with code samples
- [Source: architecture.md:746-765] — 50/user/24h rate limit implementation
- [Source: architecture.md:811-841] — 6-layer bot protection strategy
- [Source: architecture.md:889-896] — contact_views table schema (adapted to contact_reveals)
- [Source: prep-5-public-route-security-spike.md:52-70] — Rate limiting architecture, CAPTCHA strategy
- [Source: 7-1-marketplace-data-extraction-worker.md] — marketplace_profiles schema, consentEnriched field
- [Source: 7-3-anonymous-profile-government-verified-badges.md] — Profile page with placeholder reveal button
- [Source: middleware/captcha.ts] — verifyCaptcha middleware (expects req.body.captchaToken)
- [Source: middleware/auth.ts:19-129] — authenticate middleware (populates req.user)
- [Source: services/audit.service.ts:135-174] — AuditService.logPiiAccess pattern
- [Source: db/schema/audit.ts:5-22] — Audit log schema with hash chain
- [Source: db/schema/respondents.ts:28-32] — consentEnriched, firstName, lastName, phoneNumber fields
- [Source: routes/auth.routes.ts:21-26] — Middleware stacking pattern: rateLimit + captcha + handler
- [Source: features/auth/components/HCaptcha.tsx] — hCaptcha component with onVerify/onExpire/onError
- [Source: features/auth/hooks/useLogin.ts:117-121] — Post-login redirect pattern

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
