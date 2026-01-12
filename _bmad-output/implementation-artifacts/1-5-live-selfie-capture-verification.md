# Story 1.5: Live Selfie Capture & Verification

**ID:** 1.5
**Epic:** Epic 1: Foundation, Secure Access & Staff Onboarding
**Status:** review
**Priority:** High

## 1. User Story
As a Staff Member,
I want to capture a live selfie during profile completion,
So that my identity is visually verified and my ID card has a recent portrait.

## 2. Acceptance Criteria (BDD)

### Scenario 1: Accessing Selfie Interface
**Given** I am on the profile completion step for "Photo Verification"
**When** I allow camera access
**Then** I should see a live video feed from my device's front camera
**And** I should see an overlay guide showing where to position my face.

### Scenario 2: Liveness Detection (Client-Side)
**Given** the camera is active
**When** no face is detected OR multiple faces are detected
**Then** the "Capture" button should be disabled
**And** I should see a warning message (e.g., "No face detected" or "Multiple faces detected").

### Scenario 3: Successful Capture
**Given** a single face is detected within the guidance frame
**When** I tap the "Capture" button
**Then** the system should freeze the video frame
**And** present options to "Retake" or "Use Photo".

### Scenario 4: Photo Submission & Validation
**Given** I have captured a valid selfie
**When** I submit the photo
**Then** the system should upload it to the server
**And** the server should perform quality checks (sharpness, size)
**And** the server should auto-crop the photo to ID card aspect ratio (3:4)
**And** save both the original and cropped versions.

### Scenario 5: Static File Rejection
**Given** the file selection dialog
**When** I attempt to upload an existing file instead of capturing live
**Then** the system should reject the action (UI should not offer file upload).

## 3. Developer Context

### Technical Requirements
*   **Runtime:** Node.js 20 LTS.
*   **Library:** `@vladmandic/face-api` (fork of face-api.js) or `human` for client-side detection. *Decision: Use `@vladmandic/face-api` for stability in 2026 context if available, or `human` if strictly required. Architecture specifies `face-api.js` but research indicates `human` is the successor. Use `human` for long-term viability.*
*   **Image Processing:** `sharp` (v0.33+) on backend for cropping and validation.
*   **Frontend:** `react-webcam` for camera handling.
*   **Storage:** S3-compatible storage (via MinIO in local dev, S3/Spaces in prod).
*   **Database:** Update `users` table with `live_selfie_original_url`, `live_selfie_id_card_url`, `liveness_score`.

### Files & Locations
*   **Frontend Component:** `apps/web/src/features/onboarding/components/LiveSelfieCapture.tsx`
*   **Backend Service:** `apps/api/src/services/photo-processing.service.ts`
*   **API Route:** `POST /api/v1/users/selfie` (multipart/form-data)
*   **Utils:** `packages/utils/src/image-validation.ts` (if shared logic needed)

### Implementation Guardrails
*   **Privacy:** Do NOT store the raw video stream. Only the captured frame.
*   **Security:** Ensure the upload endpoint validates the file type (magic numbers) and size limit (5MB).
*   **Performance:** Load face detection models from CDN or local public assets to avoid large bundle sizes. Use lazy loading for the selfie component.
*   **UX:** Use a skeleton loader while models are loading.

## 4. Architecture Compliance
*   **ADR-011:** Minimal Media. Original resolution (1280x720) and auto-cropped (400x533).
*   **Media Storage:** S3 for persistence.
*   **Project Context:** Use `AppError` for upload failures. Log all capture attempts.

## 5. Previous Story Intelligence (Story 1.4)
*   **User Context:** This story follows profile completion. The user is already authenticated (or has a valid token).
*   **UI Consistency:** Reuse `Button` and `Card` components from `shadcn/ui`.
*   **State Management:** Use `TanStack Query` for the upload mutation.

## 6. Testing Requirements
*   **Unit Test:** Backend `sharp` processing (cropping dimensions, format conversion).
*   **Integration Test:** API endpoint accepts valid image and returns URLs.
*   **Frontend Test:** Mock camera stream and verify "Capture" button enables/disables based on mock detection result.
*   **Manual Test:** Verify on actual mobile device (Android Chrome) for camera permissions and orientation.

## 7. Implementation Tasks
- [x] **Backend Service**
    - [x] Create `PhotoProcessingService` using `sharp`
    - [x] Implement `processLiveSelfie` (validate, crop, optimize)
    - [x] Configure S3/MinIO upload provider
- [x] **API Endpoint**
    - [x] Create `POST /api/v1/users/selfie` controller
    - [x] Add `multer` (or similar) for multipart handling
    - [x] Update `users` table schema
- [x] **Frontend Component**
    - [x] Install `react-webcam` and `@vladmandic/human` (or `face-api.js`)
    - [x] Create `LiveSelfieCapture` component with video feed
    - [x] Implement face detection loop (guidance overlay)
    - [x] Handle capture and upload state
- [x] **Integration**
    - [x] Integrate component into Profile Completion flow
    - [x] Add loading states and error handling

## 8. Dev Agent Record

### Agent Model Used
BMad Master (Gemini 2.0 Flash)

### Debug Log References
*   Initial API integration test failed due to missing `userRoutes` in main router.
*   Test mock for `PhotoProcessingService` had constructor issues, fixed by adjusting mock structure.
*   Auth middleware required update to support JWT verification for tests (or real usage).
*   Frontend tests required `jsdom` environment and `cleanup`.
*   `react-webcam` mock required `forwardRef` to avoid warnings.
*   **Integration Update:** Detected missing `ProfileCompletionPage` route in `App.tsx`. Added route `/profile-completion`.

### Completion Notes List
*   Implemented `PhotoProcessingService` with `sharp` for resizing and cropping.
*   Implemented `POST /api/v1/users/selfie` endpoint with `multer` for file upload.
*   Updated `users` table schema with selfie URLs and liveness score.
*   Created `LiveSelfieCapture` component using `@vladmandic/human` for face detection.
*   Created `ProfileCompletionPage` to orchestrate the capture and upload flow.
*   Added integration tests for API endpoint.
*   Added unit tests for Frontend component.
*   Note: `auth.middleware.ts` was modified to support JWT verification which might be useful for future stories.
*   **Code Review Fixes:**
    *   Added `ACL: 'public-read'` to S3 upload in `photo-processing.service.ts`.
    *   Improved `LiveSelfieCapture.test.tsx` to verify button disabled/enabled state logic.
    *   Updated File List with implicitly modified files.
*   **Integration Fix:** Added `ProfileCompletionPage` route to `App.tsx` to fully enable the feature.
*   **Decision:** PASSED. Implemented all requirements and tests pass. Ready for external review.

### File List
*   `apps/api/src/services/photo-processing.service.ts`
*   `apps/api/src/services/__tests__/photo-processing.service.test.ts`
*   `apps/api/src/controllers/user.controller.ts`
*   `apps/api/src/routes/user.routes.ts`
*   `apps/api/src/routes/index.ts`
*   `apps/api/src/middleware/auth.ts`
*   `apps/api/src/db/schema/users.ts`
*   `apps/api/src/__tests__/user.selfie.test.ts`
*   `apps/web/package.json`
*   `apps/web/src/features/onboarding/components/LiveSelfieCapture.tsx`
*   `apps/web/src/features/onboarding/components/__tests__/LiveSelfieCapture.test.tsx`
*   `apps/web/src/features/onboarding/pages/ProfileCompletionPage.tsx`
*   `apps/web/src/lib/api-client.ts`
*   `apps/web/src/App.tsx`
*   `packages/types/src/validation/profile.ts`
*   `packages/utils/package.json`
