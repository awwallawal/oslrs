# Story 1.6: ID Card Generation & Public Verification

**ID:** 1.6
**Epic:** Epic 1: Foundation, Secure Access & Staff Onboarding
**Status:** done
**Priority:** Medium

## 1. User Story
As a Staff Member,
I want to download a printable ID card with a verification QR code,
So that I can prove my legitimacy to respondents in the field.

## 2. Acceptance Criteria (BDD)

### Scenario 1: Accessing ID Card Download
**Given** I have a verified staff profile with a completed live selfie
**When** I visit my profile/dashboard
**Then** I should see a "Download ID Card" button.

### Scenario 2: PDF Generation
**Given** I click the "Download ID Card" button
**When** the system processes the request
**Then** it should generate a PDF (Front & Back) containing:
    - My Full Name and Role
    - My auto-cropped ID photo (from Story 1.5)
    - My assigned LGA
    - A unique QR code on the back
**And** the browser should trigger a download of the PDF file.

### Scenario 3: Public Verification
**Given** a citizen scans the QR code on my physical ID card
**When** they are directed to the public verification URL (`/verify-staff/:id`)
**Then** they should see a page with:
    - Official Oyo State Branding
    - My Name and Photo
    - My Current Status (e.g., "Verified Active")
    - A green checkmark indicating authenticity.

### Scenario 4: Security & Data Minimization
**Given** the public verification page
**When** it is accessed by anyone
**Then** it MUST NOT expose sensitive PII such as:
    - National Identity Number (NIN)
    - Bank Details
    - Home Address
    - Phone Number (unless explicitly required for verification).

## 3. Developer Context

### Technical Requirements
*   **Backend Library:** `pdfkit` for PDF generation (Node.js).
*   **QR Code Library:** `qrcode` for generating QR codes as data URLs/streams.
*   **Backend Service:** `apps/api/src/services/id-card.service.ts`.
*   **Frontend Routes:**
    - `/verify-staff/:id` (Publicly accessible).
*   **Frontend Component:** `apps/web/src/features/onboarding/components/IDCardDownload.tsx`.
*   **API Routes:**
    - `GET /api/v1/users/id-card`: Authenticated route to download the current user's ID card.
    - `GET /api/v1/users/verify/:id`: Public route to get verification details for a staff member.

### Implementation Guardrails
*   **PDF Specs:** CR80 card size (3.375" x 2.125"). Front and Back.
*   **Performance:** Cache the generated PDF or generate on-the-fly (if < 250ms). Given it's a one-time download, on-the-fly is acceptable if optimized.
*   **Accessibility:** Verification page must be mobile-optimized for field scans.
*   **Verification URL:** The QR code should encode the absolute URL to the public verification page.

## 4. Architecture Compliance
*   **ADR-011:** Minimal Media. Uses the auto-cropped 400x533 photo.
*   **Security:** Public verification endpoint must be rate-limited to prevent scraping.
*   **Data Routing:** Verification data pulled from `app_db`.

## 5. Previous Story Intelligence (Story 1.5)
*   **Photo Context:** The `users` table already has `live_selfie_id_card_url`.
*   **Service Pattern:** Follow the pattern established in `PhotoProcessingService`.

## 6. Testing Requirements
*   **Unit Test:** `id-card.service.ts` - Verify PDF contains expected fields and QR code is valid.
*   **Integration Test:** `GET /api/v1/users/verify/:id` returns correct public data and handles invalid IDs.
*   **Frontend Test:** Verify "Download ID Card" button presence and public verification page layout.

## 7. Implementation Tasks
- [x] **Backend Service**
    - [x] Create `IDCardService` using `pdfkit`
    - [x] Implement PDF layout (Front & Back) with Oyo branding
    - [x] Integrate `qrcode` generation into PDF
- [x] **API Endpoint**
    - [x] Add `GET /api/v1/users/id-card` to `user.routes.ts`
    - [x] Add `GET /api/v1/users/verify/:id` public endpoint
- [x] **Frontend Component**
    - [x] Create `IDCardDownload` button component
    - [x] Implement `VerificationPage.tsx` at `/verify-staff/:id`
- [x] **Integration**
    - [x] Add verification route to `App.tsx`
    - [x] Add download button to Profile Completion or Dashboard
- [x] **Review Follow-ups (AI)**
    - [x] [AI-Review][High] Implemented rate limiting for public verification endpoint (30 req/min)
    - [x] [AI-Review][High] Added missing `express-rate-limit` and `rate-limit-redis` dependencies
    - [x] [AI-Review][Medium] Updated `.env.example` with `PUBLIC_APP_URL`
    - [x] [AI-Review][Medium] Fixed dead-end navigation in ProfileCompletionPage
    - [x] [AI-Review][Medium] Improved error handling in IDCardDownload component for auth failures

## 10. Senior Developer Review (AI)

**Review Date:** 2026-01-12
**Review Outcome:** Approve

### Action Items
- [x] **[High]** Implemented rate limiting for public verification endpoint (30 req/min)
- [x] **[High]** Added missing `express-rate-limit` and `rate-limit-redis` dependencies
- [x] **[Medium]** Updated `.env.example` with `PUBLIC_APP_URL`
- [x] **[Medium]** Fixed dead-end navigation in ProfileCompletionPage
- [x] **[Medium]** Improved error handling in IDCardDownload component for auth failures

### Severity Breakdown
- **High:** 2
- **Medium:** 3
- **Low:** 0

### Review Notes
Review identified critical missing security control (rate limiting) for the public endpoint, which was promptly implemented. Missing dependencies were added. Environment configuration and frontend navigation polish items were also addressed. The implementation now meets all requirements and security standards.
*   2026-01-12: Implemented rate limiting for public verification endpoint (30 req/min)
*   2026-01-12: Added missing `express-rate-limit` and `rate-limit-redis` dependencies
*   2026-01-12: Updated `.env.example` with `PUBLIC_APP_URL`
*   2026-01-12: Fixed dead-end navigation in ProfileCompletionPage
*   2026-01-12: Improved error handling in IDCardDownload component for auth failures

## 8. Dev Agent Record

### Agent Model Used
BMad Master (Gemini 2.0 Flash)

### Completion Notes List
*   Implemented `IDCardService` using `pdfkit` to generate CR80 standard ID cards with Oyo State branding.
*   Added `GET /api/v1/users/id-card` endpoint for downloading the generated PDF.
*   Added `GET /api/v1/users/verify/:id` public endpoint for verification scanning.
*   Implemented frontend `IDCardDownload` component with loading state and blob handling.
*   Implemented `VerificationPage` for public verification display with PII protection (only shows name, role, LGA, status, photo).
*   Added unit and integration tests for all new components and services.
*   Added `getPhotoBuffer` to `PhotoProcessingService` to support PDF generation.
*   Added DB relations for `users`, `roles`, `lgas` to support Drizzle queries.
*   Addressed code review findings - 5 items resolved (Date: 2026-01-12)
    *   Implemented rate limiting for public verification endpoint (30 req/min)
    *   Added missing `express-rate-limit` and `rate-limit-redis` dependencies
    *   Updated `.env.example` with `PUBLIC_APP_URL`
    *   Fixed dead-end navigation in ProfileCompletionPage
    *   Improved error handling in IDCardDownload component for auth failures

### File List
*   apps/api/src/services/id-card.service.ts
*   apps/api/src/services/photo-processing.service.ts
*   apps/api/src/controllers/user.controller.ts
*   apps/api/src/routes/user.routes.ts
*   apps/api/src/db/schema/relations.ts
*   apps/api/src/db/schema/index.ts
*   apps/web/src/features/onboarding/components/IDCardDownload.tsx
*   apps/web/src/features/onboarding/pages/VerificationPage.tsx
*   apps/web/src/App.tsx
*   apps/web/src/features/onboarding/pages/ProfileCompletionPage.tsx
*   apps/api/src/services/__tests__/id-card.service.test.ts
*   apps/api/src/__tests__/user.id-card.test.ts
*   apps/web/src/features/onboarding/components/__tests__/IDCardDownload.test.tsx
*   apps/web/src/features/onboarding/pages/__tests__/VerificationPage.test.tsx
*   apps/api/src/middleware/rate-limit.ts