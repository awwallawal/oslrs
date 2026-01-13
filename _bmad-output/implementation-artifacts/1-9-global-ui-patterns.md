# Story 1.9: Global UI Patterns (Battle-Hardened UX)

**ID:** 1.9
**Epic:** Epic 1: Foundation, Secure Access & Staff Onboarding
**Status:** ready-for-dev
**Priority:** Medium

## 1. User Story

As a Developer,
I want to implement optimistic UI updates, skeleton screens, and error boundaries,
So that the application feels "World Class" and responsive even on slow government networks.

## 2. Acceptance Criteria (BDD)

### Scenario 1: Skeleton Screens - Initial Data Loading
**Given** any page that fetches data on mount (dashboards, lists, profiles)
**When** the data is loading
**Then** the system should display animated "Shimmer" skeleton screens (not spinners)
**And** the skeleton should match the layout of the expected content
**And** the skeleton should be visible for at least 200ms to prevent flash.

### Scenario 2: Skeleton Screens - Component Library
**Given** the shared component library
**When** I need a loading state for a specific UI element
**Then** I should have access to reusable skeleton components:
  - `SkeletonText` (single line, configurable width)
  - `SkeletonCard` (card-shaped placeholder)
  - `SkeletonAvatar` (circular placeholder for images)
  - `SkeletonTable` (table rows placeholder)
  - `SkeletonForm` (form fields placeholder)

### Scenario 3: Optimistic UI - Button Feedback
**Given** any action button (e.g., "Save", "Verify", "Submit", "Delete")
**When** the user clicks the button
**Then** the button should react instantly (disable + show loading indicator)
**And** the UI should optimistically update to reflect the expected outcome
**And** if the server request fails, the UI should revert and show a Toast error.

### Scenario 4: Optimistic UI - List Operations
**Given** a list of items (e.g., staff list, submissions list)
**When** the user performs an action (delete, update status)
**Then** the item should immediately reflect the change in the UI
**And** a background API call should be made
**And** on failure, the item should revert to its previous state with an error Toast.

### Scenario 5: Optimistic UI - Form Submissions
**Given** any form (registration, profile update, settings)
**When** the user submits the form
**Then** the submit button should show a loading state immediately
**And** success feedback should appear optimistically
**And** on failure, the form should be re-enabled with error messages displayed.

### Scenario 6: Error Boundaries - Component Crash
**Given** a React component encounters an unexpected runtime error
**When** the error occurs during rendering
**Then** the Error Boundary should catch the error
**And** display a user-friendly fallback UI: "Something went wrong. Please refresh the page."
**And** provide a "Try Again" button to reset the component state
**And** log the error to the console with component stack trace.

### Scenario 7: Error Boundaries - Page-Level Protection
**Given** the main application routes
**When** any page-level component crashes
**Then** only that page should show the error fallback
**And** the navigation and header should remain functional
**And** the user should be able to navigate to other pages.

### Scenario 8: Error Boundaries - Feature-Level Protection
**Given** complex feature components (e.g., LiveSelfieCapture, IDCardDownload)
**When** the feature component crashes
**Then** only that feature should show the error fallback
**And** the rest of the page should remain functional
**And** the error should be logged for debugging.

### Scenario 9: Toast Notifications - Error States
**Given** an optimistic update fails
**When** the server returns an error
**Then** the system should display a Toast notification with:
  - Error icon (red)
  - Brief error message (user-friendly, not technical)
  - Auto-dismiss after 5 seconds
  - Manual dismiss option

### Scenario 10: Toast Notifications - Success States
**Given** an action completes successfully
**When** the server confirms the operation
**Then** the system should display a Toast notification with:
  - Success icon (green)
  - Brief success message
  - Auto-dismiss after 3 seconds

### Scenario 11: Loading States - Page Transitions
**Given** the user navigates between pages
**When** the new page is loading
**Then** a subtle loading indicator should appear (top progress bar or skeleton)
**And** the previous page content should remain visible until new content is ready
**And** there should be no blank white screens during transitions.

## 3. Developer Context

### Technical Requirements
- **Runtime:** React 18.3.1 (NOT React 19)
- **UI Library:** shadcn/ui components
- **Animation:** Tailwind CSS animations for shimmer effect
- **State Management:** TanStack Query for optimistic updates
- **Toast Library:** shadcn/ui Toast or Sonner
- **Error Tracking:** Console logging (future: integrate with error tracking service)

### Files & Locations
- **Skeleton Components:**
  - `apps/web/src/components/ui/skeleton.tsx` - Base skeleton (shadcn/ui)
  - `apps/web/src/components/skeletons/SkeletonText.tsx`
  - `apps/web/src/components/skeletons/SkeletonCard.tsx`
  - `apps/web/src/components/skeletons/SkeletonAvatar.tsx`
  - `apps/web/src/components/skeletons/SkeletonTable.tsx`
  - `apps/web/src/components/skeletons/SkeletonForm.tsx`
  - `apps/web/src/components/skeletons/index.tsx` - Barrel export
- **Error Boundary:**
  - `apps/web/src/components/ErrorBoundary.tsx` - Main error boundary
  - `apps/web/src/components/ErrorFallback.tsx` - Fallback UI component
- **Toast:**
  - `apps/web/src/components/ui/toast.tsx` - Toast component (shadcn/ui)
  - `apps/web/src/components/ui/toaster.tsx` - Toast provider
  - `apps/web/src/hooks/useToast.ts` - Toast hook
- **Optimistic Updates:**
  - `apps/web/src/hooks/useOptimisticMutation.ts` - Wrapper for TanStack Query mutations
- **Integration:**
  - `apps/web/src/App.tsx` - Add ErrorBoundary wrapper and Toaster
  - `apps/web/src/main.tsx` - Ensure providers are set up

### Implementation Guardrails
- **Skeleton Timing:** Show skeletons for minimum 200ms to prevent flash (use `setTimeout` or CSS delay).
- **Optimistic Rollback:** Always implement proper rollback logic for failed mutations.
- **Error Messages:** Never show technical error messages to users (e.g., stack traces, error codes).
- **Accessibility:** Skeleton screens should have `aria-busy="true"` and `aria-label="Loading"`.
- **Performance:** Skeleton animations should use CSS transforms (GPU-accelerated), not JavaScript.
- **Toast Stacking:** Limit to 3 toasts visible at once; older toasts should be dismissed.

## 4. Architecture Compliance

- **PRD 1.4.1 (Skeleton Screens):** Animated shimmer skeletons for all initial data loading.
- **PRD 1.4.2 (Optimistic UI):** Instant button feedback with server-side revert on failure.
- **PRD 1.4.3 (Error Boundaries):** Graceful crash handling with user-friendly fallbacks.
- **UX Design Spec:** Tailwind v4 + shadcn/ui, consistent with Oyo State theme (#9C1E23).
- **NFR5.1 (WCAG 2.1 AA):** Skeleton screens and error states must be accessible.

## 5. Previous Story Intelligence

### From Story 1.5 (Live Selfie)
- **Skeleton Usage:** `LiveSelfieCapture` mentions skeleton loader while models load. Ensure it uses the global `SkeletonCard` component.
- **Error Handling:** Camera permission errors should use Toast notifications.

### From Story 1.4 (Staff Activation)
- **Form Pattern:** `ActivationForm` uses React Hook Form. Ensure submit button follows optimistic UI pattern.

### From Story 1.6 (ID Card)
- **Download Button:** `IDCardDownload` component should use optimistic UI for the download action.

### From Story 1.7 (Secure Login)
- **Login Form:** Should show loading state on submit, with error Toast for failed attempts.

### From Story 1.8 (Public Registration)
- **Registration Form:** Should follow optimistic UI pattern with proper error handling.

### General
- **TanStack Query:** Already installed and used across the app. Leverage `useMutation` with `onMutate`, `onError`, `onSettled` for optimistic updates.

## 6. Testing Requirements

### Unit Tests
- `ErrorBoundary.test.tsx`:
  - Catches errors in child components
  - Displays fallback UI
  - "Try Again" button resets state
  - Does not catch errors in event handlers (expected React behavior)
- `SkeletonText.test.tsx`, `SkeletonCard.test.tsx`, etc.:
  - Renders with correct dimensions
  - Has proper accessibility attributes
  - Animation is applied
- `useOptimisticMutation.test.ts`:
  - Optimistically updates cache
  - Rolls back on error
  - Calls success callback on success

### Integration Tests
- Error boundary wraps pages correctly
- Toast appears on mutation error
- Toast appears on mutation success
- Skeleton displays during data fetch

### Visual Regression Tests (Optional)
- Skeleton shimmer animation renders correctly
- Toast positioning and styling
- Error fallback UI appearance

## 7. Implementation Tasks

- [ ] **Skeleton Components**
  - [ ] Verify `skeleton.tsx` exists (shadcn/ui base)
  - [ ] Create `SkeletonText.tsx` with configurable width
  - [ ] Create `SkeletonCard.tsx` for card placeholders
  - [ ] Create `SkeletonAvatar.tsx` for circular image placeholders
  - [ ] Create `SkeletonTable.tsx` for table row placeholders
  - [ ] Create `SkeletonForm.tsx` for form field placeholders
  - [ ] Create `index.tsx` barrel export for all skeletons
  - [ ] Add shimmer animation CSS to global styles
  - [ ] Add accessibility attributes (`aria-busy`, `aria-label`)

- [ ] **Error Boundary**
  - [ ] Create `ErrorFallback.tsx` component with:
    - [ ] User-friendly error message
    - [ ] "Try Again" button
    - [ ] Optional "Go Home" link
    - [ ] Oyo State branding consistency
  - [ ] Create `ErrorBoundary.tsx` class component
    - [ ] Implement `componentDidCatch` for logging
    - [ ] Implement `getDerivedStateFromError` for state update
    - [ ] Add reset functionality via key prop or button
  - [ ] Wrap `App.tsx` routes with page-level ErrorBoundary
  - [ ] Add feature-level ErrorBoundary to complex components:
    - [ ] `LiveSelfieCapture`
    - [ ] `IDCardDownload`
    - [ ] `RegistrationForm`

- [ ] **Toast Notifications**
  - [ ] Install/verify shadcn/ui toast or Sonner
  - [ ] Create `Toaster` provider in `App.tsx`
  - [ ] Create `useToast` hook (if not exists)
  - [ ] Define toast variants: `success`, `error`, `warning`, `info`
  - [ ] Configure auto-dismiss timing (3s success, 5s error)
  - [ ] Limit visible toasts to 3

- [ ] **Optimistic UI Hook**
  - [ ] Create `useOptimisticMutation.ts` wrapper
    - [ ] Accept `mutationFn`, `onMutate` (optimistic update), `onError` (rollback)
    - [ ] Integrate with `useToast` for automatic notifications
    - [ ] Return loading state for button feedback

- [ ] **Integration - Update Existing Components**
  - [ ] Update `LoginForm.tsx` with optimistic submit
  - [ ] Update `RegistrationForm.tsx` with optimistic submit
  - [ ] Update `ActivationForm.tsx` with optimistic submit
  - [ ] Update `IDCardDownload.tsx` with optimistic feedback
  - [ ] Update `LiveSelfieCapture.tsx` to use `SkeletonCard` for loading
  - [ ] Add skeletons to any dashboard/list pages

- [ ] **Testing**
  - [ ] Write unit tests for `ErrorBoundary`
  - [ ] Write unit tests for skeleton components
  - [ ] Write unit tests for `useOptimisticMutation`
  - [ ] Write integration test for error boundary recovery

- [ ] **Documentation**
  - [ ] Update `project-context.md` with UI pattern guidelines
  - [ ] Document skeleton component usage examples
  - [ ] Document optimistic mutation pattern

## 8. Dev Agent Record

### Agent Model Used
<!-- To be filled during implementation -->

### Debug Log References
<!-- To be filled during implementation -->

### Completion Notes List
<!-- To be filled during implementation -->

### File List
**Skeleton Components:**
- `apps/web/src/components/ui/skeleton.tsx`
- `apps/web/src/components/skeletons/SkeletonText.tsx`
- `apps/web/src/components/skeletons/SkeletonCard.tsx`
- `apps/web/src/components/skeletons/SkeletonAvatar.tsx`
- `apps/web/src/components/skeletons/SkeletonTable.tsx`
- `apps/web/src/components/skeletons/SkeletonForm.tsx`
- `apps/web/src/components/skeletons/index.tsx`

**Error Boundary:**
- `apps/web/src/components/ErrorBoundary.tsx`
- `apps/web/src/components/ErrorFallback.tsx`

**Toast:**
- `apps/web/src/components/ui/toast.tsx`
- `apps/web/src/components/ui/toaster.tsx`
- `apps/web/src/hooks/useToast.ts`

**Optimistic Updates:**
- `apps/web/src/hooks/useOptimisticMutation.ts`

**Integration:**
- `apps/web/src/App.tsx` (modify)
- `apps/web/src/index.css` (add shimmer animation)

**Tests:**
- `apps/web/src/components/__tests__/ErrorBoundary.test.tsx`
- `apps/web/src/components/skeletons/__tests__/SkeletonText.test.tsx`
- `apps/web/src/hooks/__tests__/useOptimisticMutation.test.ts`

**Documentation:**
- `_bmad-output/project-context.md` (update)

## 9. References

- [PRD: Story 1.4 - Global UI Patterns](_bmad-output/planning-artifacts/prd.md)
- [UX Design: Micro-interactions](_bmad-output/planning-artifacts/ux-design-specification.md)
- [shadcn/ui Skeleton](https://ui.shadcn.com/docs/components/skeleton)
- [shadcn/ui Toast](https://ui.shadcn.com/docs/components/toast)
- [TanStack Query Optimistic Updates](https://tanstack.com/query/latest/docs/react/guides/optimistic-updates)
- [React Error Boundaries](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary)
