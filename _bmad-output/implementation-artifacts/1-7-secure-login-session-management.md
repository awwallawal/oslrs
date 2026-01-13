# Story 1.7: Secure Login & Session Management

**ID:** 1.7
**Epic:** Epic 1: Foundation, Secure Access & Staff Onboarding
**Status:** ready-for-dev
**Priority:** High

## 1. User Story

As a User (Staff or Public),
I want to securely log into the application with unique credentials and maintain an active session,
So that I can access my designated features and my identity is verified for all actions.

## 2. Acceptance Criteria (BDD)

### Scenario 1: Staff Login Success
**Given** I am a provisioned staff member with valid credentials
**When** I navigate to `/login` and select "Staff Login"
**And** I enter my email/username and password
**And** I complete the hCaptcha challenge
**Then** I should be authenticated and redirected to my role-appropriate dashboard
**And** I should receive a 15-minute JWT access token
**And** a 7-day refresh token should be stored in an httpOnly cookie.

### Scenario 2: Public User Login Success
**Given** I am a registered public user (e.g., employer seeking marketplace access)
**When** I navigate to `/login` and select "Public Login"
**And** I enter my credentials and complete CAPTCHA
**Then** I should be authenticated via `POST /api/v1/auth/public/login`
**And** I should be redirected to the public-facing dashboard/marketplace.

### Scenario 3: Failed Login - Invalid Credentials
**Given** I am on the login page
**When** I enter incorrect credentials
**Then** I should see a generic error message: "Invalid email or password"
**And** the system should NOT reveal whether the email exists
**And** the failed attempt should be logged with `event: 'auth.login_failed'`.

### Scenario 4: Rate Limiting on Failed Attempts
**Given** I have failed to login 5 times within 15 minutes from the same IP
**When** I attempt a 6th login
**Then** I should receive an error: "Too many login attempts. Please try again later."
**And** the response should return HTTP 429
**And** after 10 failed attempts, my IP should be blocked for 30 minutes.

### Scenario 5: Session Expiry - Inactivity
**Given** I am logged in with an active session
**When** I remain inactive for 8 hours
**Then** my session should be invalidated
**And** I should be redirected to the login page on my next action
**And** I should see a message: "Session expired due to inactivity."

### Scenario 6: Session Expiry - Absolute Timeout
**Given** I am logged in and actively using the application
**When** 24 hours have passed since my initial login
**Then** my session should be forcibly expired regardless of activity
**And** I must re-authenticate to continue.

### Scenario 7: Single Active Session Enforcement
**Given** I am logged in on Device A
**When** I log in on Device B with the same credentials
**Then** my session on Device A should be automatically invalidated
**And** Device A should show "You have been logged out due to a new login on another device."

### Scenario 8: Logout and Token Invalidation
**Given** I am logged in with a valid session
**When** I click "Logout"
**Then** my JWT's JTI should be added to the Redis blacklist
**And** my refresh token cookie should be cleared
**And** I should be redirected to the login page
**And** any subsequent API calls with the old token should return HTTP 401.

### Scenario 9: CAPTCHA Protection
**Given** I am on the login page (staff or public)
**When** I attempt to submit the form without completing hCaptcha
**Then** the submit button should remain disabled
**And** I should see a prompt to complete the CAPTCHA verification.

### Scenario 10: Remember Me Option
**Given** I am on the login page
**When** I check the "Remember Me" checkbox before logging in
**And** I successfully authenticate
**Then** my session should be extended to 30 days instead of 24 hours
**And** I should remain logged in across browser restarts
**But** when I attempt sensitive actions (profile edit, payment disputes, password change)
**Then** I should be prompted to re-enter my password before proceeding.

### Scenario 11: Password Reset Request
**Given** I am on the login page and have forgotten my password
**When** I click "Forgot Password" and enter my registered email
**And** I complete the CAPTCHA challenge
**Then** I should see a message: "If this email exists, a reset link has been sent"
**And** the system should NOT reveal whether the email exists
**And** I should receive a password reset email with a time-limited token (1 hour expiry)
**And** the system should enforce a rate limit of 3 reset requests per email per hour.

### Scenario 12: Password Reset Completion
**Given** I have received a password reset email
**When** I click the reset link within 1 hour
**And** I enter a new password meeting complexity requirements
**Then** my password should be updated
**And** all my existing sessions should be invalidated
**And** I should be redirected to the login page with a success message
**And** the reset token should be marked as used (single-use).

### Scenario 13: Password Reset - Expired/Invalid Token
**Given** I have a password reset link
**When** I click the link after 1 hour has passed OR the token has already been used
**Then** I should see an error: "This reset link has expired or is invalid"
**And** I should be prompted to request a new reset link.

## 3. Developer Context

### Technical Requirements
- **Runtime:** Node.js 20 LTS
- **Authentication Library:** `jsonwebtoken` for JWT generation/verification
- **Password Hashing:** `bcrypt` (10-12 rounds, configurable via env `BCRYPT_ROUNDS`)
- **Session Store:** Redis 7 (via `ioredis`) for token blacklist and session tracking
- **Rate Limiting:** `express-rate-limit` with `rate-limit-redis` store
- **CAPTCHA:** hCaptcha (`@hcaptcha/react-hcaptcha` for frontend, server-side verification via hCaptcha API)
- **Email Service:** AWS SES (or equivalent) for password reset emails
- **Token Configuration:**
  - Access Token: 15 minutes expiry
  - Refresh Token: 7 days expiry (httpOnly cookie)
  - Session Inactivity: 8 hours
  - Absolute Session: 24 hours (default) / 30 days (with Remember Me)
  - Password Reset Token: 1 hour expiry (single-use)

### Files & Locations
- **Backend Services:**
  - `apps/api/src/services/auth.service.ts` - Core authentication logic
  - `apps/api/src/services/token.service.ts` - JWT generation, refresh, blacklist
  - `apps/api/src/services/session.service.ts` - Session tracking, single-session enforcement
  - `apps/api/src/services/password-reset.service.ts` - Password reset token generation and validation
  - `apps/api/src/services/email.service.ts` - Email sending via AWS SES
- **Backend Controllers:**
  - `apps/api/src/controllers/auth.controller.ts` - Login/logout/password-reset handlers
- **Backend Routes:**
  - `apps/api/src/routes/auth.routes.ts` - Auth endpoint definitions
- **Backend Middleware:**
  - `apps/api/src/middleware/auth.middleware.ts` - JWT verification + blacklist check
  - `apps/api/src/middleware/rate-limit.middleware.ts` - Login rate limiting (extend from Story 1.6)
  - `apps/api/src/middleware/captcha.middleware.ts` - hCaptcha verification
  - `apps/api/src/middleware/sensitive-action.middleware.ts` - Re-auth for sensitive actions (Remember Me)
- **Frontend Components:**
  - `apps/web/src/features/auth/pages/LoginPage.tsx` - Unified login page
  - `apps/web/src/features/auth/pages/ForgotPasswordPage.tsx` - Password reset request
  - `apps/web/src/features/auth/pages/ResetPasswordPage.tsx` - New password entry
  - `apps/web/src/features/auth/components/LoginForm.tsx` - Form with staff/public toggle + Remember Me
  - `apps/web/src/features/auth/components/CaptchaWidget.tsx` - hCaptcha wrapper
  - `apps/web/src/features/auth/components/ReAuthModal.tsx` - Re-authentication modal for sensitive actions
  - `apps/web/src/features/auth/context/AuthContext.tsx` - Auth state management
  - `apps/web/src/features/auth/hooks/useAuth.ts` - Auth hook with TanStack Query
- **Shared Types:**
  - `packages/types/src/auth.ts` - Login request/response types
  - `packages/types/src/validation/auth.ts` - Zod schemas for auth

### Implementation Guardrails
- **Cookie Security:** All auth cookies MUST use `httpOnly: true`, `secure: true` (in production), `sameSite: 'strict'`.
- **Password Timing:** Use constant-time comparison to prevent timing attacks.
- **Error Messages:** Never reveal whether an email exists in the system (prevent enumeration).
- **Redis Keys:** Follow pattern `session:{userId}:current` for active session, `jwt:blacklist:{jti}` for revoked tokens, `password_reset:{token}` for reset tokens.
- **JWT Payload:** Include `jti` (unique ID), `sub` (userId), `role`, `lgaId` (for field staff), `iat`, `exp`, `rememberMe` (boolean).
- **Logging:** Log all auth events with structured Pino logging (`auth.login_success`, `auth.login_failed`, `auth.logout`, `auth.session_invalidated`, `auth.password_reset_requested`, `auth.password_reset_completed`).
- **Password Reset Security:**
  - Tokens must be cryptographically random (32 bytes, base64url encoded)
  - Tokens must be single-use (marked as used after successful reset)
  - All existing sessions MUST be invalidated after password change
  - Rate limit: 3 reset requests per email per hour (NFR4.4)
- **Remember Me Security:**
  - Extended sessions (30 days) require re-authentication for sensitive actions
  - Sensitive actions: profile edit, payment disputes, password change, bank details update
  - Re-auth modal must appear before sensitive action proceeds

## 4. Architecture Compliance

- **ADR-006 (Defense-in-Depth):** Implements layered security with rate limiting + CAPTCHA + JWT blacklist.
- **Decision 2.1 (Authentication Method):** Hybrid JWT + Redis blacklist for immediate revocation capability.
- **Decision 2.2 (Password Storage):** bcrypt with 10-12 rounds (configurable, balances security vs. performance).
- **Decision 3.2 (Error Codes):** Uses standardized AppError codes:
  - `AUTH_INVALID_CREDENTIALS` (401)
  - `AUTH_RATE_LIMIT_EXCEEDED` (429)
  - `AUTH_SESSION_EXPIRED` (401)
  - `AUTH_TOKEN_REVOKED` (401)
  - `AUTH_CAPTCHA_FAILED` (400)
  - `AUTH_RESET_TOKEN_EXPIRED` (400)
  - `AUTH_RESET_TOKEN_INVALID` (400)
  - `AUTH_RESET_RATE_LIMITED` (429)
  - `AUTH_REAUTH_REQUIRED` (403) - For sensitive actions with Remember Me
- **NFR4.4 Compliance:** Rate limiting thresholds:
  - Login: 5 attempts/15min per IP, 30-min block after 10
  - Password Reset: 3 requests/hour per email
- **Project Context:** Follows all patterns from `project-context.md` including UUIDv7 for session IDs, camelCase API responses, snake_case database columns.

## 5. Previous Story Intelligence

### From Story 1.6 (ID Card Generation)
- **Rate Limiting Middleware:** `apps/api/src/middleware/rate-limit.ts` already exists with Redis store configuration. Extend this for login-specific limits.
- **Dependencies:** `express-rate-limit` and `rate-limit-redis` are already installed.

### From Story 1.5 (Live Selfie)
- **Auth Middleware:** `apps/api/src/middleware/auth.ts` was created with basic JWT verification. This story will enhance it with blacklist checking and session validation.
- **User Schema:** `users` table exists with `id` (UUIDv7), `email`, `password_hash`, `role_id`, `lga_id` columns.

### From Story 1.2 (Database Schema)
- **Users Table:** May need to add `last_login_at`, `current_session_id`, `failed_login_attempts`, `locked_until` columns for session management.
- **Sessions Table:** Consider creating a dedicated `sessions` table or use Redis-only approach.

### From Story 1.4 (Staff Activation)
- **User Context:** Staff members are already provisioned with email and temporary password. This story handles the actual login flow.

## 6. Testing Requirements

### Unit Tests
- `auth.service.test.ts`:
  - Password verification with bcrypt
  - Token generation with correct payload
  - Token blacklist operations
  - Remember Me flag handling
- `session.service.test.ts`:
  - Single session enforcement logic
  - Session expiry calculations (8h vs 24h vs 30d)
- `password-reset.service.test.ts`:
  - Token generation (cryptographically random)
  - Token validation and expiry
  - Single-use token enforcement
  - Rate limiting logic

### Integration Tests
- `auth.routes.test.ts`:
  - `POST /api/v1/auth/staff/login` - success and failure cases
  - `POST /api/v1/auth/public/login` - success and failure cases
  - `POST /api/v1/auth/logout` - token invalidation
  - `POST /api/v1/auth/refresh` - token refresh flow
  - `POST /api/v1/auth/forgot-password` - password reset request
  - `POST /api/v1/auth/reset-password` - password reset completion
  - Rate limiting triggers after 5 failed attempts
  - Password reset rate limiting (3/hour per email)
  - CAPTCHA validation (mock hCaptcha API)
  - Remember Me extends session to 30 days

### Frontend Tests
- `LoginPage.test.tsx`:
  - Staff/Public toggle switches form behavior
  - Remember Me checkbox persists preference
  - CAPTCHA widget renders and blocks submission when incomplete
  - Error messages display correctly
  - Successful login redirects appropriately
- `ForgotPasswordPage.test.tsx`:
  - Form submission triggers reset email
  - Error handling for invalid states
- `ResetPasswordPage.test.tsx`:
  - Token validation on page load
  - Password complexity validation
  - Success/error state handling
- `ReAuthModal.test.tsx`:
  - Modal appears for sensitive actions
  - Successful re-auth allows action to proceed
  - Failed re-auth blocks action
- `AuthContext.test.tsx`:
  - Auth state persists across page reloads
  - Logout clears state
  - Remember Me flag is preserved

### E2E Tests (Playwright)
- Complete login flow for staff user
- Login with Remember Me enabled
- Session timeout behavior (8h, 24h, 30d)
- Multi-device session invalidation
- Password reset complete flow (request → email → reset → login)
- Sensitive action re-authentication flow

## 7. Implementation Tasks

- [ ] **Database Schema Updates**
  - [ ] Add `last_login_at` column to `users` table
  - [ ] Add `current_session_id` column to `users` table
  - [ ] Add `password_reset_token` and `password_reset_expires_at` columns
  - [ ] Add `failed_login_attempts` and `locked_until` columns (or use Redis)
  - [ ] Create Drizzle migration

- [ ] **Backend Services**
  - [ ] Create `TokenService` in `apps/api/src/services/token.service.ts`
    - [ ] JWT generation with JTI
    - [ ] Refresh token logic
    - [ ] Redis blacklist operations (`addToBlacklist`, `isBlacklisted`)
    - [ ] Remember Me flag handling (30-day vs 24-hour expiry)
  - [ ] Create `SessionService` in `apps/api/src/services/session.service.ts`
    - [ ] Track active session per user in Redis
    - [ ] Invalidate previous sessions on new login
    - [ ] Check session validity (inactivity + absolute timeout)
    - [ ] Support 30-day sessions for Remember Me
  - [ ] Create `AuthService` in `apps/api/src/services/auth.service.ts`
    - [ ] `loginStaff(email, password, captchaToken, rememberMe)`
    - [ ] `loginPublic(email, password, captchaToken, rememberMe)`
    - [ ] `logout(userId, tokenJti)`
    - [ ] `refreshToken(refreshToken)`
    - [ ] `reAuthenticate(userId, password)` - For sensitive actions
  - [ ] Create `PasswordResetService` in `apps/api/src/services/password-reset.service.ts`
    - [ ] `requestReset(email)` - Generate token, send email
    - [ ] `validateToken(token)` - Check expiry and usage
    - [ ] `resetPassword(token, newPassword)` - Update password, invalidate sessions
  - [ ] Create `EmailService` in `apps/api/src/services/email.service.ts`
    - [ ] AWS SES integration
    - [ ] Password reset email template

- [ ] **Backend Middleware**
  - [ ] Enhance `auth.middleware.ts` with blacklist check
  - [ ] Create `captcha.middleware.ts` for hCaptcha server verification
  - [ ] Create `login-rate-limit.middleware.ts` (5 attempts/15min, block at 10)
  - [ ] Create `password-reset-rate-limit.middleware.ts` (3 requests/hour per email)
  - [ ] Create `sensitive-action.middleware.ts` for re-auth on Remember Me sessions

- [ ] **Backend Routes & Controllers**
  - [ ] Create `POST /api/v1/auth/staff/login`
  - [ ] Create `POST /api/v1/auth/public/login`
  - [ ] Create `POST /api/v1/auth/logout`
  - [ ] Create `POST /api/v1/auth/refresh`
  - [ ] Create `POST /api/v1/auth/forgot-password`
  - [ ] Create `POST /api/v1/auth/reset-password`
  - [ ] Create `POST /api/v1/auth/reauth` - For sensitive action confirmation
  - [ ] Wire routes in `auth.routes.ts`

- [ ] **Frontend - Auth Context**
  - [ ] Create `AuthContext.tsx` with TanStack Query
  - [ ] Implement `useAuth` hook (`login`, `logout`, `refreshToken`, `isAuthenticated`, `reAuth`)
  - [ ] Handle token refresh on 401 responses
  - [ ] Track Remember Me state

- [ ] **Frontend - Login Page**
  - [ ] Create `LoginPage.tsx` at `/login`
  - [ ] Create `LoginForm.tsx` with staff/public toggle + Remember Me checkbox
  - [ ] Create `CaptchaWidget.tsx` wrapper for hCaptcha
  - [ ] Implement form validation with React Hook Form + Zod
  - [ ] Add loading states and error handling
  - [ ] Add "Forgot Password" link

- [ ] **Frontend - Password Reset**
  - [ ] Create `ForgotPasswordPage.tsx` at `/forgot-password`
  - [ ] Create `ResetPasswordPage.tsx` at `/reset-password/:token`
  - [ ] Implement password complexity validation
  - [ ] Handle token expiry/invalid states

- [ ] **Frontend - Re-Authentication**
  - [ ] Create `ReAuthModal.tsx` component
  - [ ] Integrate with sensitive action flows (profile edit, payment disputes)
  - [ ] Create `useSensitiveAction` hook for wrapping protected operations

- [ ] **Frontend - Integration**
  - [ ] Add `/login` route to `App.tsx`
  - [ ] Add `/forgot-password` route to `App.tsx`
  - [ ] Add `/reset-password/:token` route to `App.tsx`
  - [ ] Implement `ProtectedRoute` component for auth-required pages
  - [ ] Add logout button to navigation/header

- [ ] **Testing**
  - [ ] Write unit tests for `TokenService`, `SessionService`, `PasswordResetService`
  - [ ] Write integration tests for auth endpoints (including password reset)
  - [ ] Write frontend tests for `LoginPage`, `ForgotPasswordPage`, `ResetPasswordPage`
  - [ ] Write frontend tests for `AuthContext` and `ReAuthModal`

## 8. Dev Agent Record

### Agent Model Used
<!-- To be filled during implementation -->

### Debug Log References
<!-- To be filled during implementation -->

### Completion Notes List
<!-- To be filled during implementation -->

### File List
**Backend Services:**
- `apps/api/src/services/auth.service.ts`
- `apps/api/src/services/token.service.ts`
- `apps/api/src/services/session.service.ts`
- `apps/api/src/services/password-reset.service.ts`
- `apps/api/src/services/email.service.ts`

**Backend Controllers & Routes:**
- `apps/api/src/controllers/auth.controller.ts`
- `apps/api/src/routes/auth.routes.ts`

**Backend Middleware:**
- `apps/api/src/middleware/auth.middleware.ts`
- `apps/api/src/middleware/captcha.middleware.ts`
- `apps/api/src/middleware/login-rate-limit.middleware.ts`
- `apps/api/src/middleware/password-reset-rate-limit.middleware.ts`
- `apps/api/src/middleware/sensitive-action.middleware.ts`

**Database:**
- `apps/api/src/db/schema/users.ts` (migration)
- `apps/api/drizzle/XXXX_auth_columns.sql` (generated migration)

**Backend Tests:**
- `apps/api/src/services/__tests__/auth.service.test.ts`
- `apps/api/src/services/__tests__/token.service.test.ts`
- `apps/api/src/services/__tests__/session.service.test.ts`
- `apps/api/src/services/__tests__/password-reset.service.test.ts`
- `apps/api/src/__tests__/auth.routes.test.ts`

**Frontend Pages:**
- `apps/web/src/features/auth/pages/LoginPage.tsx`
- `apps/web/src/features/auth/pages/ForgotPasswordPage.tsx`
- `apps/web/src/features/auth/pages/ResetPasswordPage.tsx`

**Frontend Components:**
- `apps/web/src/features/auth/components/LoginForm.tsx`
- `apps/web/src/features/auth/components/CaptchaWidget.tsx`
- `apps/web/src/features/auth/components/ReAuthModal.tsx`

**Frontend Context & Hooks:**
- `apps/web/src/features/auth/context/AuthContext.tsx`
- `apps/web/src/features/auth/hooks/useAuth.ts`
- `apps/web/src/features/auth/hooks/useSensitiveAction.ts`

**Frontend Tests:**
- `apps/web/src/features/auth/pages/__tests__/LoginPage.test.tsx`
- `apps/web/src/features/auth/pages/__tests__/ForgotPasswordPage.test.tsx`
- `apps/web/src/features/auth/pages/__tests__/ResetPasswordPage.test.tsx`
- `apps/web/src/features/auth/components/__tests__/ReAuthModal.test.tsx`
- `apps/web/src/features/auth/context/__tests__/AuthContext.test.tsx`

**Shared Types:**
- `packages/types/src/auth.ts`
- `packages/types/src/validation/auth.ts`

## 9. References

- [PRD: Epic 1 - Foundation & Secure Access](_bmad-output/planning-artifacts/prd.md)
- [Architecture: Decision 2.1 - Authentication Method](_bmad-output/planning-artifacts/architecture.md)
- [Architecture: Decision 2.2 - Password Storage](_bmad-output/planning-artifacts/architecture.md)
- [Architecture: ADR-006 - Defense in Depth](_bmad-output/planning-artifacts/architecture.md)
- [Project Context: Security Patterns](_bmad-output/project-context.md)
- [Homepage Structure: Routes](docs/homepage_structure.md)
