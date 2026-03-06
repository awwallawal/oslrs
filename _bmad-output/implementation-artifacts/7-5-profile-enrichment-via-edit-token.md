# Story 7.5: Profile Enrichment via Edit Token

Status: ready-for-dev

## Story

As a **Skilled Worker**,
I want to improve my marketplace visibility by adding a bio and portfolio,
So that I am more attractive to potential employers.

## Context

This is the fifth story of Epic 7: Public Skills Marketplace & Search Security. It allows workers who have marketplace profiles to enrich them with a bio and portfolio URL, authenticated via a one-time SMS token — no password or account required.

**Prerequisites:**
- **Story 7-1 (marketplace data extraction worker)** — provides `marketplace_profiles` table with `bio`, `portfolioUrl`, `editToken`, and `editTokenExpiresAt` columns.
- **Story 7-3 (anonymous profile & verified badges)** — provides profile detail page where the edit flow can be initiated.

**Architecture context:** The architecture (line 274) specifies: "32-char random tokens, single-use, 90-day expiry, 3-request/day rate limit per NIN. SMS interception worst-case: fraudulent marketplace profile only, no survey data access." This is an acceptable residual risk — edit tokens can only modify bio and portfolio URL, not survey data or PII.

**SMS infrastructure:** No SMS service exists in the codebase yet. This story creates the SMS service following the `EmailService` provider pattern. The SMS provider choice (Termii, Africa's Talking, AWS SNS, etc.) depends on Nigerian telco compatibility and should be decided during prep-5 spike or implementation.

**Flow overview:**
1. Worker visits a public "Edit Your Profile" page
2. Worker enters their phone number
3. System finds the marketplace profile via respondent phone → generates 32-char token → sends SMS with edit link
4. Worker clicks link → lands on edit page with token pre-filled from URL
5. Worker edits bio (150 chars max) and portfolio URL → submits
6. Token consumed (single-use), profile updated

## Acceptance Criteria

1. **Given** a worker with an existing marketplace profile, **when** they enter their phone number on the edit request page and pass the CAPTCHA, **then** the system generates a secure 32-character token, stores it on the profile with a 90-day expiry, and sends an SMS containing the edit link to their phone.
2. **Given** the edit token request, **when** the same NIN has already requested 3 tokens in the past 24 hours, **then** the server returns 429 with a rate limit message.
3. **Given** the edit token request, **when** no marketplace profile exists for the phone number provided, **then** the server returns a generic success message (do NOT reveal whether the phone number exists — prevents enumeration).
4. **Given** a valid edit token in a URL, **when** the worker navigates to the edit page, **then** the system validates the token and renders an edit form pre-populated with the current bio and portfolio URL (if any).
5. **Given** an expired or already-used edit token, **when** the worker navigates to the edit page, **then** the system shows "This link has expired or has already been used" with an option to request a new token.
6. **Given** the edit form, **when** the worker submits a bio (max 150 characters) and portfolio URL (valid URL format), **then** the profile is updated, the token is consumed (set to null), and the worker sees a success confirmation.
7. **Given** the edit form, **when** the bio exceeds 150 characters or the portfolio URL is invalid, **then** validation errors are shown without consuming the token.
8. **Given** the existing test suite, **when** all tests run, **then** comprehensive tests cover: token generation, SMS sending (mocked), token validation, profile update, token expiry, token consumption (single-use), rate limiting, phone enumeration prevention, and zero regressions.

## Tasks / Subtasks

- [ ] Task 1: Create SMS service infrastructure (AC: #1)
  - [ ] 1.1 Create `apps/api/src/services/sms.service.ts` following the `email.service.ts` provider pattern:
    - `SMSService` static class with `initialize()`, `send(to, message)`, `isEnabled()`
    - `SMSProvider` interface: `{ send(to: string, message: string): Promise<SMSResult> }`
    - `SMSResult`: `{ success: boolean; error?: string; messageId?: string }`
    - Provider implementations:
      - `MockSMSProvider` — logs to console/Pino, stores in memory (for dev/test)
      - `HttpSMSProvider` — generic HTTP-based provider (configurable URL, auth headers, body template)
    - Configuration from env: `SMS_PROVIDER` (mock/http), `SMS_API_URL`, `SMS_API_KEY`, `SMS_SENDER_ID`
  - [ ] 1.2 **Provider abstraction:** Don't hardcode a specific SMS vendor. Use a generic HTTP provider pattern so the specific vendor (Termii, Africa's Talking, etc.) can be configured via env vars without code changes.
  - [ ] 1.3 Initialize in `apps/api/src/index.ts` alongside EmailService initialization
  - [ ] 1.4 Add env vars to `apps/api/.env.example` and update prep-2's env var safety script if applicable
  - [ ] 1.5 **Test mode:** In `NODE_ENV=test`, use MockSMSProvider automatically (same pattern as EmailService mock)

- [ ] Task 2: Create edit token service (AC: #1, #2, #3, #5)
  - [ ] 2.1 Create `apps/api/src/services/marketplace-edit.service.ts`:
    - `requestEditToken(phoneNumber: string, ipAddress: string): Promise<{ status: 'success' | 'rate_limited' | 'not_found' }>`
    - **Always returns 'success'** to the controller — even when no profile found (prevents phone enumeration). Only send SMS when profile exists.
  - [ ] 2.2 Token generation: `crypto.randomBytes(16).toString('hex')` → 32-character hex string (matches architecture spec "32-char random tokens")
  - [ ] 2.3 Token storage: Update `marketplace_profiles` row:
    ```typescript
    await db.update(marketplaceProfiles)
      .set({
        editToken: hashedToken,  // Store hashed, not plaintext (see 2.4)
        editTokenExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
        updatedAt: new Date(),
      })
      .where(eq(marketplaceProfiles.id, profile.id));
    ```
  - [ ] 2.4 **Token hashing:** Store `SHA-256(token)` in the database, not the plaintext token. Send the plaintext token via SMS. On validation, hash the incoming token and compare. This follows security best practices (same as password reset tokens should be hashed).
  - [ ] 2.5 Phone → profile resolution:
    ```typescript
    // Find respondent by phone number
    const [respondent] = await db.select({ id: respondents.id, nin: respondents.nin })
      .from(respondents)
      .where(eq(respondents.phoneNumber, phoneNumber))
      .limit(1);
    // Find marketplace profile by respondentId
    const [profile] = await db.select()
      .from(marketplaceProfiles)
      .where(eq(marketplaceProfiles.respondentId, respondent.id))
      .limit(1);
    ```
  - [ ] 2.6 Rate limit check (3/day per NIN): Use Redis counter `rl:edit-token:${nin}` with 24h TTL
    ```typescript
    const key = `rl:edit-token:${respondent.nin}`;
    const count = parseInt(await redis.get(key) || '0');
    if (count >= 3) return { status: 'rate_limited' };
    await redis.incr(key);
    await redis.expire(key, 86400); // 24 hours
    ```
  - [ ] 2.7 SMS message: `"Your OSLRS marketplace profile edit link: https://${DOMAIN}/marketplace/edit/${token} — This link expires in 90 days and can only be used once."`
  - [ ] 2.8 `validateEditToken(token: string): Promise<{ status: 'valid' | 'expired' | 'invalid'; profile?: MarketplaceProfileEditView }>`
    - Hash incoming token, query `marketplace_profiles` WHERE `edit_token = hashedToken`
    - Check `editTokenExpiresAt > NOW()`
    - Return current bio, portfolioUrl for form pre-population
  - [ ] 2.9 `applyProfileEdit(token: string, bio: string | null, portfolioUrl: string | null): Promise<{ status: 'success' | 'expired' | 'invalid' }>`
    - Validate token (same as 2.8)
    - Update bio and portfolioUrl
    - **Consume token:** set `editToken = null`, `editTokenExpiresAt = null`
    - The tsvector trigger (Story 7-1) will NOT auto-update for bio changes since bio isn't in the search vector. This is fine — bio is displayed but not searched.

- [ ] Task 3: Create edit token controller (AC: #1, #3, #4, #5, #6, #7)
  - [ ] 3.1 In `apps/api/src/controllers/marketplace.controller.ts`, add three methods:
  - [ ] 3.2 `requestEditToken(req, res, next)`:
    - Zod validate: `{ phoneNumber: z.string().min(10).max(15) }`
    - Call `MarketplaceEditService.requestEditToken(phoneNumber, req.ip)`
    - **Always return 200** with generic message: `"If a marketplace profile exists for this phone number, an SMS with an edit link has been sent."` (prevents enumeration)
    - If rate_limited → return 429
  - [ ] 3.3 `validateEditToken(req, res, next)`:
    - Extract `token` from `req.params`
    - Call `MarketplaceEditService.validateEditToken(token)`
    - If valid → return 200 with `{ data: { valid: true, bio, portfolioUrl } }`
    - If expired/invalid → return 200 with `{ data: { valid: false, reason: 'expired' | 'invalid' } }`
  - [ ] 3.4 `applyProfileEdit(req, res, next)`:
    - Zod validate body:
      ```typescript
      const profileEditSchema = z.object({
        editToken: z.string().length(32),
        bio: z.string().max(150, 'Bio must be 150 characters or less').nullable().optional(),
        portfolioUrl: z.string().url('Invalid URL format').max(500).nullable().optional(),
      });
      ```
    - Call `MarketplaceEditService.applyProfileEdit(token, bio, portfolioUrl)`
    - If success → return 200 with `{ data: { message: 'Profile updated successfully' } }`
    - If expired → return 410 with `{ code: 'TOKEN_EXPIRED', message: 'This edit link has expired. Please request a new one.' }`
    - If invalid → return 404 with `{ code: 'NOT_FOUND', message: 'Invalid edit link.' }`

- [ ] Task 4: Add edit token routes with CAPTCHA + rate limiting (AC: #1, #2)
  - [ ] 4.1 In `apps/api/src/routes/marketplace.routes.ts`, add:
    ```typescript
    import { verifyCaptcha } from '../middleware/captcha.js';

    // POST /api/v1/marketplace/request-edit-token — public, CAPTCHA required
    router.post('/request-edit-token',
      editTokenRequestRateLimit,   // IP-based rate limit (10/hour/IP)
      verifyCaptcha,               // hCaptcha required
      MarketplaceController.requestEditToken
    );

    // GET /api/v1/marketplace/edit/:token — public, validate token
    router.get('/edit/:token',
      MarketplaceController.validateEditToken
    );

    // PUT /api/v1/marketplace/edit — public, apply edit with token
    router.put('/edit',
      MarketplaceController.applyProfileEdit
    );
    ```
  - [ ] 4.2 Create `editTokenRequestRateLimit` in `apps/api/src/middleware/marketplace-rate-limit.ts`:
    - 10 req/hour/IP (prevents brute-force phone enumeration)
    - Redis key prefix: `rl:marketplace:edit-token-request:`
    - Follow existing rate limit pattern
  - [ ] 4.3 **No authentication on any of these routes** — the edit token IS the authentication. Workers may not have OSLRS accounts.
  - [ ] 4.4 **CAPTCHA on token request only** — not on validate or apply. The token itself is the auth for validate/apply.

- [ ] Task 5: Add edit token types (AC: #6, #7)
  - [ ] 5.1 In `packages/types/src/marketplace.ts`, add:
    ```typescript
    export interface ProfileEditTokenRequest {
      phoneNumber: string;
      captchaToken: string;
    }

    export interface ProfileEditPayload {
      editToken: string;
      bio?: string | null;
      portfolioUrl?: string | null;
    }

    export interface MarketplaceProfileEditView {
      bio: string | null;
      portfolioUrl: string | null;
    }
    ```
  - [ ] 5.2 Export from `packages/types/src/index.ts`

- [ ] Task 6: Create frontend "Request Edit Token" page (AC: #1, #3)
  - [ ] 6.1 Create `apps/web/src/features/marketplace/pages/MarketplaceEditRequestPage.tsx`:
    - Simple form with: phone number input + hCaptcha widget + "Send Edit Link" button
    - On submit: POST to `/marketplace/request-edit-token` with `{ phoneNumber, captchaToken }`
    - Success: show "If a marketplace profile exists for this phone number, you'll receive an SMS with an edit link shortly."
    - Rate limited (429): show "Too many requests. Please try again later."
    - Page title: "Edit Your Marketplace Profile"
    - Subtitle: "Enter the phone number used during registration. We'll send you a one-time edit link via SMS."
  - [ ] 6.2 Phone number input with basic formatting/validation (Nigerian phone format: +234... or 0...)

- [ ] Task 7: Create frontend "Edit Profile" page (AC: #4, #5, #6, #7)
  - [ ] 7.1 Create `apps/web/src/features/marketplace/pages/MarketplaceEditPage.tsx`:
    - Extract `token` from URL params: `/marketplace/edit/:token`
    - On mount: call `GET /marketplace/edit/:token` to validate token and get current bio/portfolioUrl
    - **If valid:** render edit form pre-populated with current values
    - **If expired/invalid:** render "This link has expired or has already been used" with a link to request a new token
  - [ ] 7.2 Edit form fields:
    - **Bio**: `<textarea>` with character counter (0/150), placeholder "Tell employers about your skills and experience..."
    - **Portfolio URL**: `<input type="url">` with placeholder "https://your-portfolio.com"
    - "Save Changes" button
  - [ ] 7.3 On submit: PUT to `/marketplace/edit` with `{ editToken, bio, portfolioUrl }`
    - Success: show "Your profile has been updated!" with a link to view the profile
    - Token expired (410): show expiry message with link to request new token
    - Validation error (400): show field-level errors without consuming token
  - [ ] 7.4 **Character counter for bio:** Live counter below textarea showing `${bio.length}/150`, red when approaching limit

- [ ] Task 8: Create frontend API client and hooks (AC: #1, #4, #6)
  - [ ] 8.1 In `apps/web/src/features/marketplace/api/marketplace.api.ts`, add:
    ```typescript
    export async function requestEditToken(phoneNumber: string, captchaToken: string): Promise<{ message: string }> {
      const response = await apiClient('/marketplace/request-edit-token', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber, captchaToken }),
      });
      return response.data;
    }

    export async function validateEditToken(token: string): Promise<{ valid: boolean; bio?: string; portfolioUrl?: string; reason?: string }> {
      const response = await apiClient(`/marketplace/edit/${token}`);
      return response.data;
    }

    export async function submitProfileEdit(editToken: string, bio: string | null, portfolioUrl: string | null): Promise<{ message: string }> {
      const response = await apiClient('/marketplace/edit', {
        method: 'PUT',
        body: JSON.stringify({ editToken, bio, portfolioUrl }),
      });
      return response.data;
    }
    ```
  - [ ] 8.2 In `apps/web/src/features/marketplace/hooks/useMarketplace.ts`, add:
    ```typescript
    export function useValidateEditToken(token: string) {
      return useQuery({
        queryKey: marketplaceKeys.editToken(token),
        queryFn: () => validateEditToken(token),
        enabled: !!token,
        retry: false,  // Don't retry — token state is deterministic
      });
    }

    export function useSubmitProfileEdit() {
      return useMutation({
        mutationFn: ({ editToken, bio, portfolioUrl }: ProfileEditPayload) =>
          submitProfileEdit(editToken, bio, portfolioUrl),
      });
    }
    ```
  - [ ] 8.3 Add to `marketplaceKeys`:
    ```typescript
    editToken: (token: string) => [...marketplaceKeys.all, 'editToken', token] as const,
    ```

- [ ] Task 9: Wire frontend routes (AC: #4, #6)
  - [ ] 9.1 In `apps/web/src/App.tsx`, add routes under the marketplace path (inside `<PublicLayout>`):
    ```typescript
    const MarketplaceEditRequestPage = lazy(() => import('./features/marketplace/pages/MarketplaceEditRequestPage'));
    const MarketplaceEditPage = lazy(() => import('./features/marketplace/pages/MarketplaceEditPage'));
    // ...
    <Route path="marketplace">
      {/* ... existing search and profile routes */}
      <Route path="edit-request" element={<Suspense><MarketplaceEditRequestPage /></Suspense>} />
      <Route path="edit/:token" element={<Suspense><MarketplaceEditPage /></Suspense>} />
    </Route>
    ```
  - [ ] 9.2 On the profile detail page (Story 7-3), add a subtle "Is this your profile?" link at the bottom that navigates to `/marketplace/edit-request`
  - [ ] 9.3 All edit routes are public — no `<ProtectedRoute>` wrapper

- [ ] Task 10: Write backend tests (AC: #8)
  - [ ] 10.1 Create `apps/api/src/services/__tests__/marketplace-edit.service.test.ts`:
    - Token generation: produces 32-char hex string
    - Token hashing: stored hash matches SHA-256 of plaintext
    - Token validation: valid token returns profile edit view
    - Token expiry: expired token returns 'expired'
    - Token consumption: after edit, token set to null
    - Token single-use: second use of same token returns 'invalid'
    - Phone resolution: finds profile via respondent phone number
    - Phone not found: returns 'success' (no SMS sent, no error)
    - Rate limit: 4th request in 24h blocked
    - SMS send: mock provider called with correct phone and message
  - [ ] 10.2 Add to `apps/api/src/controllers/__tests__/marketplace.controller.test.ts`:
    - Request edit token: valid phone + CAPTCHA → 200 with generic message
    - Request edit token: no CAPTCHA → 400
    - Request edit token: rate limited → 429
    - Validate edit token: valid → 200 with { valid: true, bio, portfolioUrl }
    - Validate edit token: expired → 200 with { valid: false, reason: 'expired' }
    - Validate edit token: invalid → 200 with { valid: false, reason: 'invalid' }
    - Apply edit: valid token + valid data → 200
    - Apply edit: bio > 150 chars → 400 validation error
    - Apply edit: invalid URL → 400 validation error
    - Apply edit: consumed token → 404
  - [ ] 10.3 Create `apps/api/src/services/__tests__/sms.service.test.ts`:
    - MockSMSProvider: send returns success, message stored in memory
    - SMSService.send: delegates to configured provider
    - SMSService disabled: returns early without sending
  - [ ] 10.4 `pnpm test` — all tests pass, zero regressions

- [ ] Task 11: Write frontend tests (AC: #8)
  - [ ] 11.1 Create `apps/web/src/features/marketplace/__tests__/MarketplaceEditRequestPage.test.tsx`:
    - Renders phone input and CAPTCHA
    - Submit sends POST request
    - Shows success message after submit
    - Shows rate limit message on 429
  - [ ] 11.2 Create `apps/web/src/features/marketplace/__tests__/MarketplaceEditPage.test.tsx`:
    - Valid token: renders edit form with pre-populated fields
    - Expired token: shows expiry message
    - Bio character counter updates live
    - Bio > 150 chars: validation error
    - Portfolio URL invalid: validation error
    - Successful submit: shows success confirmation
  - [ ] 11.3 `cd apps/web && pnpm vitest run` — all web tests pass

## Dev Notes

### Edit Token Flow Architecture

```
Worker visits /marketplace/edit-request
  ↓
Enters phone number + solves CAPTCHA
  ↓
POST /api/v1/marketplace/request-edit-token
  ├── Rate limit check: 10/hour/IP (middleware)
  ├── CAPTCHA verify (middleware)
  ├── Find respondent by phoneNumber
  ├── Find marketplace_profiles by respondentId
  ├── Rate limit check: 3/day/NIN (Redis)
  ├── Generate 32-char hex token
  ├── Store SHA-256(token) on profile + 90-day expiry
  ├── Send SMS with edit link to worker's phone
  └── Return 200 "If profile exists, SMS sent" (always 200)

Worker clicks SMS link → /marketplace/edit/:token
  ↓
GET /api/v1/marketplace/edit/:token
  ├── Hash incoming token → SHA-256
  ├── Find profile WHERE edit_token = hash
  ├── Check editTokenExpiresAt > NOW()
  └── Return { valid: true, bio, portfolioUrl } or { valid: false }

Worker edits bio + portfolio URL → submits
  ↓
PUT /api/v1/marketplace/edit
  ├── Validate { editToken, bio (≤150), portfolioUrl (URL) }
  ├── Hash token → find profile → check expiry
  ├── Update bio, portfolioUrl
  ├── Consume token: editToken = null, editTokenExpiresAt = null
  └── Return 200 "Profile updated"
```

### Token Security: Hash Before Storage

Store `SHA-256(token)` in the database, not plaintext. This follows the password reset best practice:

```typescript
import { createHash } from 'crypto';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Generate
const token = randomBytes(16).toString('hex'); // 32 hex chars
const hashedToken = hashToken(token);

// Store hashedToken in DB, send token via SMS

// Validate
const incomingHash = hashToken(incomingToken);
// Compare: WHERE edit_token = incomingHash
```

If the database is compromised, attackers cannot reconstruct tokens from hashes.

### Token Generation Pattern (Follow password-reset.service.ts)

```typescript
import { randomBytes } from 'crypto';

// password-reset.service.ts:44-46 pattern:
private static generateSecureToken(): string {
  return randomBytes(32).toString('base64url');
}

// For marketplace edit token (32 hex chars per architecture spec):
function generateEditToken(): string {
  return randomBytes(16).toString('hex'); // 16 bytes = 32 hex chars
}
```

### Phone Number → Profile Resolution

Workers identify themselves by phone number. The lookup chain:
1. `respondents` table: `WHERE phone_number = phoneNumber` → get `respondent.id`
2. `marketplace_profiles` table: `WHERE respondent_id = respondent.id` → get profile

**Edge cases:**
- Phone number not found → return generic success (prevent enumeration)
- Respondent found but no marketplace profile → return generic success (no SMS sent)
- Multiple respondents with same phone → use the first one (phone should be unique in practice, but the schema doesn't enforce it)

### Rate Limiting: 3/Day per NIN (Redis)

The architecture specifies "3-request/day rate limit per NIN." Use Redis with TTL:

```typescript
const nin = respondent.nin;
const key = `rl:edit-token:${nin}`;
const count = parseInt(await redis.get(key) || '0');
if (count >= 3) {
  return { status: 'rate_limited' };
}
await redis.incr(key);
if (count === 0) {
  await redis.expire(key, 86400); // 24h TTL only set on first request
}
```

**Why NIN not phone?** A worker could register with multiple phone numbers but has only one NIN. Rate limiting by NIN prevents abuse via phone number rotation.

**Important:** The NIN-based rate limit is checked AFTER phone → respondent resolution. If the phone number doesn't match any respondent, the rate limit doesn't apply (and no SMS is sent).

### SMS Service Pattern (Follow EmailService)

```typescript
// apps/api/src/services/sms.service.ts
interface SMSProvider {
  send(to: string, message: string): Promise<SMSResult>;
}

interface SMSResult {
  success: boolean;
  error?: string;
  messageId?: string;
}

class MockSMSProvider implements SMSProvider {
  public sentMessages: Array<{ to: string; message: string }> = [];
  async send(to: string, message: string): Promise<SMSResult> {
    this.sentMessages.push({ to, message });
    logger.info({ event: 'sms.mock_sent', to, message: message.substring(0, 50) });
    return { success: true, messageId: `mock-${Date.now()}` };
  }
}

class HttpSMSProvider implements SMSProvider {
  // Generic HTTP provider — configurable for any SMS API
  async send(to: string, message: string): Promise<SMSResult> {
    const response = await fetch(process.env.SMS_API_URL!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SMS_API_KEY}`,
      },
      body: JSON.stringify({
        to,
        from: process.env.SMS_SENDER_ID || 'OSLRS',
        sms: message,
      }),
    });
    // ... handle response
  }
}
```

### ENV Vars for SMS

New env vars required:
- `SMS_PROVIDER` — `mock` (default for dev/test) or `http`
- `SMS_API_URL` — HTTP endpoint for SMS API (only for `http` provider)
- `SMS_API_KEY` — API key for SMS provider
- `SMS_SENDER_ID` — Sender ID displayed on SMS (e.g., "OSLRS")

Add to `apps/api/.env.example`. Update prep-2's deployment env var safety script to check these on production.

### Phone Enumeration Prevention

The token request endpoint ALWAYS returns 200 with the same generic message, regardless of whether:
- The phone number was found
- A marketplace profile exists
- The token was generated and SMS sent
- The NIN rate limit was hit (exception: return 429 only if we can check)

**Wait — NIN rate limit requires finding the respondent first.** If the phone isn't found, we can't check NIN rate limit. This is fine — no respondent means no profile means no SMS, and the IP rate limit (10/hour) prevents brute-forcing phone numbers.

If the phone IS found but rate limited, we MUST return 429 (otherwise the worker doesn't know why they're not receiving SMS). This is an acceptable trade-off — it confirms the phone number exists, but only after 3 real requests, and the IP rate limit prevents mass enumeration.

### CAPTCHA for Token Request

Architecture and prep-5 both specify CAPTCHA for edit token requests. Use the existing `verifyCaptcha` middleware. The frontend includes the `HCaptcha` component on the request form.

### Frontend Edit Form — Character Counter Pattern

```typescript
const [bio, setBio] = useState(initialBio || '');

<div className="relative">
  <textarea
    value={bio}
    onChange={(e) => setBio(e.target.value.slice(0, 150))}
    maxLength={150}
    rows={4}
    placeholder="Tell employers about your skills and experience..."
    className="w-full p-3 border rounded-lg"
  />
  <span className={`absolute bottom-2 right-2 text-xs ${bio.length > 140 ? 'text-red-500' : 'text-neutral-400'}`}>
    {bio.length}/150
  </span>
</div>
```

### What This Story Does NOT Include (Future Stories/Scope)

| Feature | Why Not Here |
|---------|-------------|
| Profile photo upload | Out of Epic 7 scope |
| Skills/profession editing | Survey data only — not editable via token |
| Contact reveal | Story 7-4 |
| Device fingerprinting | Story 7-6 |
| SMS vendor selection | Deferred to implementation — generic HTTP provider used |
| Multi-language SMS | Future enhancement |
| SMS delivery tracking/retry | Future enhancement — fire-and-forget for MVP |

### Project Structure Notes

**New files:**
- `apps/api/src/services/sms.service.ts` — SMS service with provider pattern
- `apps/api/src/services/marketplace-edit.service.ts` — Edit token business logic
- `apps/web/src/features/marketplace/pages/MarketplaceEditRequestPage.tsx` — Token request form
- `apps/web/src/features/marketplace/pages/MarketplaceEditPage.tsx` — Profile edit form
- `apps/api/src/services/__tests__/sms.service.test.ts`
- `apps/api/src/services/__tests__/marketplace-edit.service.test.ts`
- `apps/web/src/features/marketplace/__tests__/MarketplaceEditRequestPage.test.tsx`
- `apps/web/src/features/marketplace/__tests__/MarketplaceEditPage.test.tsx`

**Modified files:**
- `apps/api/src/controllers/marketplace.controller.ts` — Add requestEditToken, validateEditToken, applyProfileEdit methods
- `apps/api/src/routes/marketplace.routes.ts` — Add POST /request-edit-token, GET /edit/:token, PUT /edit
- `apps/api/src/middleware/marketplace-rate-limit.ts` — Add editTokenRequestRateLimit
- `apps/api/src/controllers/__tests__/marketplace.controller.test.ts` — Add edit token controller tests
- `packages/types/src/marketplace.ts` — Add ProfileEditTokenRequest, ProfileEditPayload, MarketplaceProfileEditView
- `apps/web/src/features/marketplace/api/marketplace.api.ts` — Add requestEditToken, validateEditToken, submitProfileEdit
- `apps/web/src/features/marketplace/hooks/useMarketplace.ts` — Add useValidateEditToken, useSubmitProfileEdit
- `apps/web/src/App.tsx` — Add /marketplace/edit-request and /marketplace/edit/:token routes
- `apps/web/src/features/marketplace/pages/MarketplaceProfilePage.tsx` — Add "Is this your profile?" link
- `apps/api/.env.example` — Add SMS_PROVIDER, SMS_API_URL, SMS_API_KEY, SMS_SENDER_ID

### Anti-Patterns to Avoid

- **Do NOT store plaintext edit tokens in the database** — store SHA-256 hash. Send plaintext via SMS only.
- **Do NOT reveal whether a phone number exists** — always return 200 with generic message on token request. This prevents phone number enumeration.
- **Do NOT allow editing profession, LGA, or experience level** — these come from survey data and can only change via new survey submission + extraction worker.
- **Do NOT allow editing with an expired or used token** — tokens are single-use and expire after 90 days.
- **Do NOT skip CAPTCHA on the token request endpoint** — it's the primary defense against automated token request abuse.
- **Do NOT hardcode an SMS vendor** — use the generic HTTP provider pattern so vendors can be swapped via env vars.
- **Do NOT import from `@oslsr/types` in schema files** — drizzle-kit constraint.
- **Do NOT add authentication to edit routes** — the edit token IS the authentication. Workers may not have OSLRS accounts.
- **Do NOT return different error codes for "profile not found" vs "consent not given" vs "phone not registered"** — all should look identical to prevent enumeration.

### References

- [Source: epics.md:2002-2013] — Story 7.5 acceptance criteria
- [Source: architecture.md:274] — Edit token security: 32-char, single-use, 90-day, 3/day/NIN
- [Source: architecture.md:863-887] — marketplace_profiles schema with bio, portfolioUrl, editToken columns
- [Source: architecture.md:93-94] — SMS infrastructure: "AWS SES or equivalent"
- [Source: prep-4-marketplace-data-model-spike.md:36-43] — Edit token schema design
- [Source: prep-5-public-route-security-spike.md:57,65] — Edit token rate limit (3/day/NIN), CAPTCHA always required
- [Source: 7-1-marketplace-data-extraction-worker.md:41-44] — Schema columns: bio, portfolioUrl, editToken, editTokenExpiresAt
- [Source: password-reset.service.ts:44-46] — Token generation pattern (randomBytes)
- [Source: password-reset.service.ts:154-173] — Token storage pattern (Redis + DB)
- [Source: auth.controller.ts:299-347] — Token validation + consumption endpoint pattern
- [Source: auth.routes.ts:88-98] — Token-based route pattern (GET validate, POST consume)
- [Source: password-reset-rate-limit.ts] — Rate limiting pattern for token endpoints
- [Source: email.service.ts] — Provider pattern for notification services
- [Source: middleware/captcha.ts] — verifyCaptcha middleware
- [Source: features/auth/components/HCaptcha.tsx] — Frontend hCaptcha component
- [Source: packages/types/src/email.ts:71,97,123] — z.string().url() validation pattern

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
