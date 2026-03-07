# Story 7.5: Profile Enrichment via Edit Token

Status: done

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

- [x] Task 1: Create SMS service infrastructure (AC: #1)
  - [x] 1.1 Created `apps/api/src/services/sms.service.ts` with SMSService, MockSMSProvider, HttpSMSProvider
  - [x] 1.2 Generic HTTP provider pattern — vendor-agnostic via env vars
  - [x] 1.3 Lazy-initialized (no explicit init in index.ts needed — follows singleton pattern)
  - [x] 1.4 Added SMS env vars to `.env.example` and updated `scripts/check-env.sh`
  - [x] 1.5 Auto-uses MockSMSProvider in NODE_ENV=test

- [x] Task 2: Create edit token service (AC: #1, #2, #3, #5)
  - [x] 2.1 Created `apps/api/src/services/marketplace-edit.service.ts` with requestEditToken, validateEditToken, applyProfileEdit
  - [x] 2.2 Token generation via `crypto.randomBytes(16).toString('hex')` (32 hex chars)
  - [x] 2.3 Token storage with 90-day expiry on marketplace_profiles row
  - [x] 2.4 SHA-256 token hashing — plaintext sent via SMS, hash stored in DB
  - [x] 2.5 Phone -> respondent -> marketplace_profiles resolution chain
  - [x] 2.6 Redis NIN rate limit (3/day) with 24h TTL
  - [x] 2.7 SMS message with edit link
  - [x] 2.8 validateEditToken returns valid/expired/invalid with profile data
  - [x] 2.9 applyProfileEdit uses db.transaction() for TOCTOU safety, consumes token on success

- [x] Task 3: Create edit token controller (AC: #1, #3, #4, #5, #6, #7)
  - [x] 3.1-3.4 Added requestEditToken, validateEditToken, applyProfileEdit to marketplace.controller.ts
  - [x] Zod schemas: editTokenRequestSchema, profileEditSchema with HEX_TOKEN_REGEX validation

- [x] Task 4: Add edit token routes with CAPTCHA + rate limiting (AC: #1, #2)
  - [x] 4.1 POST /request-edit-token (editTokenRequestRateLimit + verifyCaptcha), GET /edit/:token, PUT /edit
  - [x] 4.2 editTokenRequestRateLimit: 10/hour/IP with Redis store
  - [x] 4.3 No auth middleware — token IS the auth
  - [x] 4.4 CAPTCHA on token request only

- [x] Task 5: Add edit token types (AC: #6, #7)
  - [x] 5.1 Added ProfileEditTokenRequest, ProfileEditPayload, MarketplaceProfileEditView to packages/types/src/marketplace.ts
  - [x] 5.2 Already exported via barrel export

- [x] Task 6: Create frontend "Request Edit Token" page (AC: #1, #3)
  - [x] 6.1 Created MarketplaceEditRequestPage with phone input, CAPTCHA, success/error states
  - [x] 6.2 Phone validation (min 10 digits after stripping spaces)

- [x] Task 7: Create frontend "Edit Profile" page (AC: #4, #5, #6, #7)
  - [x] 7.1 Created MarketplaceEditPage with token validation on mount
  - [x] 7.2 Bio textarea (150 char max) + portfolio URL input
  - [x] 7.3 Submit flow with success/error/expired states
  - [x] 7.4 Live character counter, turns red at 140+, truncates at 150

- [x] Task 8: Create frontend API client and hooks (AC: #1, #4, #6)
  - [x] 8.1 Added requestEditToken, validateEditToken, submitProfileEdit to marketplace.api.ts
  - [x] 8.2 Added useValidateEditToken (query), useSubmitProfileEdit (mutation) hooks
  - [x] 8.3 Added editToken to marketplaceKeys

- [x] Task 9: Wire frontend routes (AC: #4, #6)
  - [x] 9.1 Lazy-loaded routes in App.tsx: /marketplace/edit-request and /marketplace/edit/:token
  - [x] 9.2 Added "Is this your profile? Edit it here." link with Pencil icon on profile detail page
  - [x] 9.3 All edit routes public — no ProtectedRoute wrapper

- [x] Task 10: Write backend tests (AC: #8)
  - [x] 10.1 sms.service.test.ts: 11 tests (MockSMSProvider, HttpSMSProvider, SMSService.send, disabled mode)
  - [x] 10.2 marketplace-edit.service.test.ts: 13 tests (requestEditToken, validateEditToken, applyProfileEdit, rate limiting, token hashing, TOCTOU transaction)
  - [x] 10.3 marketplace.controller.test.ts: 20+ new tests for edit token endpoints (request, validate, apply, rate limit, validation errors)
  - [x] 10.4 All 73 new backend tests pass, zero regressions (pre-existing integration test timeouts only)

- [x] Task 11: Write frontend tests (AC: #8)
  - [x] 11.1 MarketplaceEditRequestPage.test.tsx: 9 tests (render, phone validation, CAPTCHA flow, success/error states, phone stripping)
  - [x] 11.2 MarketplaceEditPage.test.tsx: 12 tests (loading, valid/expired/invalid tokens, bio counter, bio truncation, URL validation, submit, success, error, disabled state)
  - [x] 11.3 All 21 new frontend tests pass

## Review Follow-ups (AI)

- [x] [AI-Review][HIGH] TOCTOU race in `applyProfileEdit` — added `SELECT FOR UPDATE` row lock inside transaction [marketplace-edit.service.ts:180]
- [x] [AI-Review][HIGH] Redis rate limit race condition — replaced non-atomic GET-then-INCR with atomic INCR-first pattern [marketplace-edit.service.ts:79-86]
- [x] [AI-Review][HIGH] NIN null bypass — respondents without NIN now fall back to respondent ID-based rate limiting [marketplace-edit.service.ts:78]
- [x] [AI-Review][MEDIUM] Undocumented git changes — added 3 missing files to File List (auth.login.test.ts, registration.service.test.ts, MarketplaceProfilePage.test.tsx)
- [x] [AI-Review][MEDIUM] Frontend URL validation weaker than backend — replaced regex with `new URL()` parsing to align with Zod `.url()` [MarketplaceEditPage.tsx:49-56]
- [x] [AI-Review][MEDIUM] GET/PUT edit routes lacked rate limiting — added `editTokenUseRateLimit` (30/min/IP) middleware [marketplace.routes.ts:33,36]
- [x] [AI-Review][LOW] Story File List count mismatch — corrected from "11 modified" to "14 modified"
- [x] [AI-Review][LOW] Form state initialization via conditional setState in render — moved to `useEffect` [MarketplaceEditPage.tsx:23-29]

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
Claude Opus 4.6

### Debug Log References
- Redis mock `redis.get is not a function`: `vi.resetAllMocks()` clears `mockImplementation` on class constructor mocks. Fix: use `vi.clearAllMocks()` instead.
- `() => mockRedis is not a constructor`: Arrow functions can't be used with `new`. Fix: use `class { ... }` in vi.mock for ioredis.
- MarketplaceEditPage URL validation test: jsdom `<input type="url">` may not fire native validation in `onSubmit`. Fix: test mutation-not-called instead of checking error DOM element.

### Completion Notes List
- All 11 tasks implemented and tested
- 97 tests total after review: 76 backend (11 SMS + 14 edit service + 51 controller) + 21 frontend (9 edit request + 12 edit page)
- Zero regressions from story changes; pre-existing failures: 2 API integration test timeouts (need real DB), 2 MarketplaceProfilePage timeouts (lucide-react dynamic import)
- Added Pencil mock to MarketplaceProfilePage.test.tsx for consistency (pre-existing issue unrelated to this story)
- TOCTOU protection: applyProfileEdit wraps token lookup + consumption in db.transaction() with SELECT FOR UPDATE (fixed in review)
- Token hashing: SHA-256 stored in DB, plaintext sent via SMS only
- Code review (2026-03-07): 8 issues found and fixed (3 HIGH, 3 MEDIUM, 2 LOW). See "Review Follow-ups (AI)" section.

### Change Log

| Change | File | Reason |
|--------|------|--------|
| NEW | `apps/api/src/services/sms.service.ts` | SMS service with provider pattern (MockSMSProvider, HttpSMSProvider) |
| NEW | `apps/api/src/services/marketplace-edit.service.ts` | Edit token business logic (request, validate, apply) |
| NEW | `apps/web/src/features/marketplace/pages/MarketplaceEditRequestPage.tsx` | Phone + CAPTCHA form to request edit token |
| NEW | `apps/web/src/features/marketplace/pages/MarketplaceEditPage.tsx` | Token-validated profile edit form |
| NEW | `apps/api/src/services/__tests__/sms.service.test.ts` | 11 SMS service tests |
| NEW | `apps/api/src/services/__tests__/marketplace-edit.service.test.ts` | 13 edit service tests |
| NEW | `apps/web/src/features/marketplace/__tests__/MarketplaceEditRequestPage.test.tsx` | 9 edit request page tests |
| NEW | `apps/web/src/features/marketplace/__tests__/MarketplaceEditPage.test.tsx` | 12 edit page tests |
| MOD | `apps/api/src/controllers/marketplace.controller.ts` | Added requestEditToken, validateEditToken, applyProfileEdit methods |
| MOD | `apps/api/src/routes/marketplace.routes.ts` | Added POST /request-edit-token, GET /edit/:token, PUT /edit |
| MOD | `apps/api/src/middleware/marketplace-rate-limit.ts` | Added editTokenRequestRateLimit (10/hour/IP) |
| MOD | `apps/api/src/controllers/__tests__/marketplace.controller.test.ts` | 20+ new controller tests for edit endpoints |
| MOD | `packages/types/src/marketplace.ts` | Added ProfileEditTokenRequest, ProfileEditPayload, MarketplaceProfileEditView |
| MOD | `apps/web/src/features/marketplace/api/marketplace.api.ts` | Added requestEditToken, validateEditToken, submitProfileEdit |
| MOD | `apps/web/src/features/marketplace/hooks/useMarketplace.ts` | Added useValidateEditToken, useSubmitProfileEdit, editToken key |
| MOD | `apps/web/src/App.tsx` | Added lazy-loaded routes for edit-request and edit/:token |
| MOD | `apps/web/src/features/marketplace/pages/MarketplaceProfilePage.tsx` | Added "Is this your profile?" edit link |
| MOD | `apps/web/src/features/marketplace/__tests__/MarketplaceProfilePage.test.tsx` | Added Pencil mock |
| MOD | `.env.example` | Added SMS_PROVIDER, SMS_API_URL, SMS_API_KEY, SMS_SENDER_ID |
| MOD | `scripts/check-env.sh` | Added SMS optional group check |

### File List

**New files (8):**
- `apps/api/src/services/sms.service.ts`
- `apps/api/src/services/marketplace-edit.service.ts`
- `apps/web/src/features/marketplace/pages/MarketplaceEditRequestPage.tsx`
- `apps/web/src/features/marketplace/pages/MarketplaceEditPage.tsx`
- `apps/api/src/services/__tests__/sms.service.test.ts`
- `apps/api/src/services/__tests__/marketplace-edit.service.test.ts`
- `apps/web/src/features/marketplace/__tests__/MarketplaceEditRequestPage.test.tsx`
- `apps/web/src/features/marketplace/__tests__/MarketplaceEditPage.test.tsx`

**Modified files (14):**
- `apps/api/src/controllers/marketplace.controller.ts`
- `apps/api/src/routes/marketplace.routes.ts`
- `apps/api/src/middleware/marketplace-rate-limit.ts`
- `apps/api/src/controllers/__tests__/marketplace.controller.test.ts`
- `packages/types/src/marketplace.ts`
- `apps/web/src/features/marketplace/api/marketplace.api.ts`
- `apps/web/src/features/marketplace/hooks/useMarketplace.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/features/marketplace/pages/MarketplaceProfilePage.tsx`
- `apps/web/src/features/marketplace/__tests__/MarketplaceProfilePage.test.tsx`
- `apps/api/src/__tests__/auth.login.test.ts`
- `apps/api/src/services/__tests__/registration.service.test.ts`
- `.env.example`
- `scripts/check-env.sh`
