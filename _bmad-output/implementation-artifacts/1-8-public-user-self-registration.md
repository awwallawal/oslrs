# Story 1.8: Public User Self-Registration

**ID:** 1.8
**Epic:** Epic 1: Foundation, Secure Access & Staff Onboarding
**Status:** ready-for-dev
**Priority:** High

## 1. User Story

As a Public User (employer, recruiter, or citizen),
I want to self-register via the public homepage with my NIN,
So that I can access the Skills Marketplace and submit surveys.

## 2. Acceptance Criteria (BDD)

### Scenario 1: Accessing Registration Page
**Given** I am an unauthenticated visitor on the homepage
**When** I click "Public Register" or navigate to `/register`
**Then** I should see a registration form requesting:
  - Full Name
  - Email Address
  - Phone Number (Nigerian format)
  - National Identity Number (NIN)
  - Password (with confirmation)
**And** I should see a link to "Staff Login" for existing staff members.

### Scenario 2: NIN Validation (Verhoeff Checksum)
**Given** I am on the registration form
**When** I enter an 11-digit NIN
**Then** the system should validate it using the Verhoeff checksum algorithm (client-side)
**And** if the checksum fails, I should see an error: "Invalid NIN format"
**And** the submit button should remain disabled until the NIN is valid.

### Scenario 3: NIN Uniqueness Check
**Given** I have entered a valid NIN that passes Verhoeff validation
**When** I submit the registration form
**Then** the system should check if the NIN already exists in the database
**And** if it exists, I should see an error: "This NIN is already registered. Please login instead."
**And** the error should NOT reveal when the NIN was registered (prevent enumeration).

### Scenario 4: Email Uniqueness Check
**Given** I am submitting the registration form
**When** I enter an email that already exists in the system
**Then** I should see a generic error: "Registration failed. Please check your details."
**And** the system should NOT reveal that the email exists (prevent enumeration)
**And** the system should send an email to the existing address: "Someone attempted to register with your email."

### Scenario 5: CAPTCHA Protection
**Given** I am on the registration form
**When** I attempt to submit without completing hCaptcha
**Then** the submit button should remain disabled
**And** I should see a prompt to complete the CAPTCHA verification.

### Scenario 6: Successful Registration
**Given** I have entered valid, unique data and completed CAPTCHA
**When** I submit the registration form
**Then** the system should:
  - Create a new user record with role `PUBLIC_USER` and status `pending_verification`
  - Hash my password using bcrypt (10-12 rounds)
  - Generate a unique email verification token (32 bytes, 24-hour expiry)
  - Send a verification email with a confirmation link
**And** I should see a success message: "Registration successful! Please check your email to verify your account."

### Scenario 7: Email Verification
**Given** I have received a verification email
**When** I click the verification link within 24 hours
**Then** the system should:
  - Validate the token
  - Update my status from `pending_verification` to `active`
  - Invalidate the verification token (single-use)
**And** I should be redirected to the login page with a success message: "Email verified! You can now log in."

### Scenario 8: Email Verification - Expired Token
**Given** I have a verification link
**When** I click the link after 24 hours have passed
**Then** I should see an error: "This verification link has expired."
**And** I should see an option to "Resend verification email."

### Scenario 9: Resend Verification Email
**Given** I am a registered user with `pending_verification` status
**When** I request a new verification email
**Then** the system should generate a new token and send a new email
**And** the previous token should be invalidated
**And** the system should enforce a rate limit of 3 resend requests per email per hour.

### Scenario 10: Rate Limiting on Registration
**Given** I am on the registration page
**When** 5 registration attempts have been made from my IP in 15 minutes
**Then** I should receive an error: "Too many registration attempts. Please try again later."
**And** the response should return HTTP 429.

## 3. Developer Context

### Technical Requirements
- **Runtime:** Node.js 20 LTS
- **Database:** PostgreSQL 15 via Drizzle ORM
- **Password Hashing:** bcrypt (10-12 rounds, configurable via `BCRYPT_ROUNDS`)
- **NIN Validation:** Verhoeff checksum (reuse from Story 1.4)
- **CAPTCHA:** hCaptcha (`@hcaptcha/react-hcaptcha` frontend, server-side verification)
- **Email Service:** AWS SES (or equivalent) for verification emails
- **Token Generation:** `crypto.randomBytes(32).toString('hex')` for verification tokens
- **Token Expiry:** 24 hours for email verification

### Files & Locations
- **Backend Services:**
  - `apps/api/src/services/registration.service.ts` - Registration logic
  - `apps/api/src/services/email.service.ts` - Email sending (extend from Story 1.7)
- **Backend Controllers:**
  - `apps/api/src/controllers/registration.controller.ts` - Registration handlers
- **Backend Routes:**
  - `apps/api/src/routes/registration.routes.ts` - Registration endpoint definitions
- **Backend Middleware:**
  - `apps/api/src/middleware/registration-rate-limit.middleware.ts` - Registration rate limiting
- **Frontend Pages:**
  - `apps/web/src/features/auth/pages/RegisterPage.tsx` - Registration form page
  - `apps/web/src/features/auth/pages/VerifyEmailPage.tsx` - Email verification handling
- **Frontend Components:**
  - `apps/web/src/features/auth/components/RegistrationForm.tsx` - Registration form
- **Shared Types:**
  - `packages/types/src/validation/registration.ts` - Zod schemas for registration

### Implementation Guardrails
- **Security:** Never reveal whether an email or NIN exists (prevent enumeration attacks).
- **Password Storage:** Use bcrypt with configurable rounds (10-12).
- **Token Security:** Verification tokens must be cryptographically random, single-use, and time-limited.
- **Rate Limiting:** 5 registration attempts per IP per 15 minutes.
- **Resend Limit:** 3 verification email resends per email per hour.
- **Database Constraints:** Rely on UNIQUE constraints for NIN and Email (NFR8.1).
- **Logging:** Log all registration events with structured Pino logging:
  - `auth.registration_started`
  - `auth.registration_success`
  - `auth.registration_failed` (with reason code, no PII)
  - `auth.email_verification_success`
  - `auth.email_verification_failed`

## 4. Architecture Compliance

- **ADR-006 (Defense-in-Depth):** Implements layered security with rate limiting + CAPTCHA + DB constraints.
- **Decision 2.2 (Password Storage):** bcrypt with 10-12 rounds.
- **Decision 3.2 (Error Codes):** Uses standardized AppError codes:
  - `REGISTRATION_NIN_INVALID` (400)
  - `REGISTRATION_NIN_EXISTS` (409) - returned as generic error to client
  - `REGISTRATION_EMAIL_EXISTS` (409) - returned as generic error to client
  - `REGISTRATION_RATE_LIMITED` (429)
  - `REGISTRATION_CAPTCHA_FAILED` (400)
  - `VERIFICATION_TOKEN_EXPIRED` (400)
  - `VERIFICATION_TOKEN_INVALID` (400)
  - `VERIFICATION_RESEND_RATE_LIMITED` (429)
- **NFR4.1 (Data Minimization):** Only NIN collected for identity verification (no BVN).
- **NFR8.1 (Race Condition Defense):** Database-level UNIQUE constraints on NIN and Email.
- **FR5 (Public NIN Registration):** Implements mandatory NIN verification for public users.

## 5. Previous Story Intelligence

### From Story 1.4 (Staff Activation)
- **Verhoeff Algorithm:** `packages/utils/src/validation.ts` contains `verhoeffCheck` utility. Reuse for NIN validation.
- **Profile Schema:** Similar validation patterns for NIN and user data.

### From Story 1.7 (Secure Login)
- **Email Service:** `apps/api/src/services/email.service.ts` - extend for verification emails.
- **CAPTCHA Middleware:** `apps/api/src/middleware/captcha.middleware.ts` - reuse for registration.
- **Auth Routes Pattern:** Follow the same route structure in `auth.routes.ts`.

### From Story 1.2 (Database Schema)
- **Users Table:** Already has `email` (unique), `nin` (unique), `status` enum. May need to add `email_verification_token` and `email_verification_expires_at` columns.
- **Roles Table:** `PUBLIC_USER` role already exists.

### From Story 1.3 (Staff Provisioning)
- **Token Generation:** `packages/utils/src/crypto.ts` contains `generateInvitationToken`. Similar pattern for verification tokens.

## 6. Testing Requirements

### Unit Tests
- `registration.service.test.ts`:
  - NIN validation (Verhoeff integration)
  - Email uniqueness check logic
  - Token generation and expiry
  - Password hashing
- `email.service.test.ts`:
  - Verification email template rendering
  - Email sending (mock AWS SES)

### Integration Tests
- `registration.routes.test.ts`:
  - `POST /api/v1/auth/register` - success case
  - `POST /api/v1/auth/register` - duplicate NIN (generic error)
  - `POST /api/v1/auth/register` - duplicate email (generic error)
  - `POST /api/v1/auth/register` - invalid NIN (Verhoeff fail)
  - `POST /api/v1/auth/register` - CAPTCHA failure
  - `POST /api/v1/auth/register` - rate limiting
  - `GET /api/v1/auth/verify-email/:token` - success
  - `GET /api/v1/auth/verify-email/:token` - expired token
  - `POST /api/v1/auth/resend-verification` - success
  - `POST /api/v1/auth/resend-verification` - rate limiting

### Frontend Tests
- `RegisterPage.test.tsx`:
  - Form validation (NIN, email, phone, password)
  - CAPTCHA widget integration
  - Error message display
  - Success state handling
- `VerifyEmailPage.test.tsx`:
  - Token validation on page load
  - Success/error state display
  - Resend verification flow

### E2E Tests (Playwright)
- Complete registration flow (form → email → verification → login)
- Duplicate NIN rejection
- Rate limiting behavior

## 7. Implementation Tasks

- [ ] **Database Schema Updates**
  - [ ] Add `email_verification_token` column to `users` table
  - [ ] Add `email_verification_expires_at` column to `users` table
  - [ ] Create Drizzle migration

- [ ] **Backend Services**
  - [ ] Create `RegistrationService` in `apps/api/src/services/registration.service.ts`
    - [ ] `registerPublicUser(data)` - create user with pending_verification status
    - [ ] `verifyEmail(token)` - validate token and activate user
    - [ ] `resendVerificationEmail(email)` - generate new token and send email
  - [ ] Extend `EmailService` for verification email template
    - [ ] HTML email template with verification link
    - [ ] Plain text fallback

- [ ] **Backend Middleware**
  - [ ] Create `registration-rate-limit.middleware.ts` (5 attempts/15min per IP)
  - [ ] Create `resend-rate-limit.middleware.ts` (3 requests/hour per email)

- [ ] **Backend Routes & Controllers**
  - [ ] Create `POST /api/v1/auth/register`
  - [ ] Create `GET /api/v1/auth/verify-email/:token`
  - [ ] Create `POST /api/v1/auth/resend-verification`
  - [ ] Wire routes in `registration.routes.ts`

- [ ] **Frontend - Registration Page**
  - [ ] Create `RegisterPage.tsx` at `/register`
  - [ ] Create `RegistrationForm.tsx` with:
    - [ ] Full Name, Email, Phone, NIN, Password fields
    - [ ] Real-time NIN validation (Verhoeff)
    - [ ] hCaptcha integration
    - [ ] Form validation with React Hook Form + Zod
  - [ ] Add loading states and error handling

- [ ] **Frontend - Email Verification**
  - [ ] Create `VerifyEmailPage.tsx` at `/verify-email/:token`
  - [ ] Handle token validation on page load
  - [ ] Display success/error states
  - [ ] Add "Resend verification" button

- [ ] **Frontend - Integration**
  - [ ] Add `/register` route to `App.tsx`
  - [ ] Add `/verify-email/:token` route to `App.tsx`
  - [ ] Add "Register" link to homepage
  - [ ] Add "Register" link to login page

- [ ] **Testing**
  - [ ] Write unit tests for `RegistrationService`
  - [ ] Write integration tests for registration endpoints
  - [ ] Write frontend tests for `RegisterPage` and `VerifyEmailPage`

## 8. Dev Agent Record

### Agent Model Used
<!-- To be filled during implementation -->

### Debug Log References
<!-- To be filled during implementation -->

### Completion Notes List
<!-- To be filled during implementation -->

### File List
**Backend Services:**
- `apps/api/src/services/registration.service.ts`
- `apps/api/src/services/email.service.ts` (extend)

**Backend Controllers & Routes:**
- `apps/api/src/controllers/registration.controller.ts`
- `apps/api/src/routes/registration.routes.ts`

**Backend Middleware:**
- `apps/api/src/middleware/registration-rate-limit.middleware.ts`
- `apps/api/src/middleware/resend-rate-limit.middleware.ts`

**Database:**
- `apps/api/src/db/schema/users.ts` (add columns)
- `apps/api/drizzle/XXXX_email_verification.sql` (generated migration)

**Backend Tests:**
- `apps/api/src/services/__tests__/registration.service.test.ts`
- `apps/api/src/__tests__/registration.routes.test.ts`

**Frontend Pages:**
- `apps/web/src/features/auth/pages/RegisterPage.tsx`
- `apps/web/src/features/auth/pages/VerifyEmailPage.tsx`

**Frontend Components:**
- `apps/web/src/features/auth/components/RegistrationForm.tsx`

**Frontend Tests:**
- `apps/web/src/features/auth/pages/__tests__/RegisterPage.test.tsx`
- `apps/web/src/features/auth/pages/__tests__/VerifyEmailPage.test.tsx`

**Shared Types:**
- `packages/types/src/validation/registration.ts`

## 9. References

- [PRD: Story 1.2.6 - Public User Self-Registration](_bmad-output/planning-artifacts/prd.md)
- [PRD: FR5 - Public NIN Registration](_bmad-output/planning-artifacts/prd.md)
- [Architecture: Decision 2.2 - Password Storage](_bmad-output/planning-artifacts/architecture.md)
- [Architecture: ADR-006 - Defense in Depth](_bmad-output/planning-artifacts/architecture.md)
- [Architecture: NFR8.1 - Race Condition Defense](_bmad-output/planning-artifacts/architecture.md)
- [Project Context: Security Patterns](_bmad-output/project-context.md)
- [Homepage Structure: /register Route](docs/homepage_structure.md)
