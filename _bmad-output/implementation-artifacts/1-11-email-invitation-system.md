# Story 1.11: Email Invitation System

**ID:** 1.11
**Epic:** Epic 1: Foundation, Secure Access & Staff Onboarding
**Status:** backlog
**Priority:** Medium
**Dependencies:** Story 1.3 (invitation tokens exist)
**Email Provider:** Resend (verified 2026-01-24, domain: oyotradeministry.com.ng)

## 1. User Story
As a Super Admin,
I want provisioned staff to automatically receive an email with their activation link,
So that they can complete their profile without requiring manual link distribution.

## 2. Background

Story 1.3 implemented staff provisioning with invitation token generation. However, the actual email delivery was deferred because the email service (Resend/SendGrid) was not yet configured. Currently:

- **What exists:** Invitation tokens are generated and stored in the database
- **What's missing:** Email dispatch to users with the activation link
- **Current workaround:** Seeded users for testing; manual link distribution for production

## 3. Acceptance Criteria (BDD)

### Scenario 1: Email Sent on Manual Staff Creation
**Given** an authenticated Super Admin creates a new staff member
**When** the user record is successfully created with status 'invited'
**Then** the system should queue an email job via BullMQ
**And** the email should contain the activation link: `{BASE_URL}/activate/{invitation_token}`
**And** the email should include the user's name and role

### Scenario 2: Bulk Import Email Dispatch
**Given** a completed bulk import job
**When** new users are created with invitation tokens
**Then** the system should queue individual email jobs for each new user
**And** email dispatch should be rate-limited (configurable, default 10/second)
**And** the import job summary should include email queue status

### Scenario 3: Email Service Failure Handling
**Given** an email job fails to send
**When** the email service returns an error
**Then** the system should retry up to 3 times with exponential backoff
**And** log the failure in audit_logs after final failure
**And** NOT block the user from activating via direct link

### Scenario 4: Email Template Content
**Given** a staff invitation email
**When** rendered for delivery
**Then** it should include:
  - Oyo State branding/logo
  - Personalized greeting with full name
  - Role assignment information
  - Clear CTA button for activation
  - Link expiry notice (if applicable)
  - Support contact information

## 4. Developer Context

### Technical Constraints
*   **Email Provider:** Resend (confirmed, account created, domain verified)
*   **BullMQ Integration:** Leverage existing queue infrastructure from Story 1.3
*   **ESM Compliance:** Node.js 20 LTS with `.js` import extensions
*   **Environment Variables:** `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM_ADDRESS`

### Files & Locations
*   **Email Service:** Create `apps/api/src/services/email.service.ts`
*   **Email Templates:** Create `apps/api/src/templates/emails/` directory
*   **Queue Worker:** Extend or create `apps/api/src/workers/email.worker.ts`
*   **Configuration:** Update `.env.example` with email provider settings

### Implementation Guardrails
*   **Graceful Degradation:** If email service is not configured, log warning but don't fail provisioning
*   **Idempotency:** Don't send duplicate emails if job is retried after partial success
*   **Rate Limiting:** Respect email provider limits (Resend: 100/sec, SendGrid: varies)
*   **Testing Mode:** Support `EMAIL_PROVIDER=console` for development (logs to stdout)

## 5. Architecture Compliance
*   **ADR-007 (Database Separation):** Email queue metadata in `app_db`
*   **NFR8.3 (Audit Trails):** Log email dispatch attempts in audit_logs
*   **NFR4.7 (Security):** Never log full invitation URLs in plaintext audit logs

## 6. Testing Requirements
*   **Unit Tests:** Email service with mocked provider
*   **Integration Tests:** End-to-end flow from staff creation to email queue
*   **Manual Test:** Verify email rendering with actual provider in staging

## 7. Implementation Tasks
- [ ] **Email Service Setup**
    - [ ] Create email service abstraction supporting multiple providers
    - [ ] Implement Resend adapter (primary)
    - [ ] Implement console adapter (development fallback)
- [ ] **Email Templates**
    - [ ] Create `staff-invitation.html` template with Oyo branding
    - [ ] Create plain-text fallback version
- [ ] **Queue Integration**
    - [ ] Create `email.queue.ts` with job type definitions
    - [ ] Create `email.worker.ts` with retry logic
    - [ ] Add rate limiting configuration
- [ ] **Staff Service Integration**
    - [ ] Update `StaffService.createManual` to queue email
    - [ ] Update bulk import worker to queue emails after processing
- [ ] **Configuration**
    - [ ] Update `.env.example` with required variables
    - [ ] Add email provider validation on startup
- [ ] **Testing**
    - [ ] Unit tests for email service
    - [ ] Integration tests for staff provisioning flow
    - [ ] Manual verification in staging

## 8. Definition of Done
- [ ] Manual staff creation triggers invitation email
- [ ] Bulk import queues emails for all new users
- [ ] Email failures don't block user activation flow
- [ ] Audit logs capture email dispatch events
- [ ] Tests pass with >80% coverage on new code
- [ ] Code review approved

## 9. Notes

**Why this was deferred:** During Epic 1, the team prioritized getting the core provisioning flow working. Email service configuration (environment setup, provider account, DNS records for sending domain) was deferred to avoid blocking development progress.

**Current workarounds:**
1. Seeded users for testing (no email needed)
2. Manual activation link distribution for production users
3. Direct database access for development testing

**Recommended timing:** After Epic 2 when email service infrastructure is established, or when client requires production staff onboarding.

---
*Created: 2026-01-24*
*Source: Epic 1.5 Retrospective gap analysis*
