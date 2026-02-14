# Story 3.1: Native Form Renderer & Dashboard

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an Enumerator,
I want to fill out surveys using a native form interface,
So that I can collect data efficiently in the field.

## Dependencies

- Epic 2 Stories 2.7-2.10 (Native Form System) — Complete
- Story 3.0 (Google OAuth & Enhanced Public Registration) — In Review
- prep-5 (Service Worker & IndexedDB Spike) — Complete (offline-db.ts, Dexie schema)
- prep-8 (Update Story 3.1 ACs) — Complete (admin preview mode added)

**Blocks:** Story 3.2 (PWA Service Worker), Story 3.3 (Offline Queue & Sync), Story 3.5 (Public Survey Access), Story 3.6 (Clerk Data Entry)

## Acceptance Criteria

### AC3.1.1: Form Renderer Loading & Navigation

**Given** an authenticated session,
**When** I click "Start Survey",
**Then** the native form renderer loads with one-question-per-screen navigation, dual-layer progress indicator (horizontal bar showing overall fill percentage, section dot indicators showing completed/active/pending sections, and "Question X of Y · Section Z of N" text), and Next/Back buttons.

### AC3.1.2: Question Type Support

**Given** the form schema,
**When** rendering questions,
**Then** all types are supported: text, number, date, select_one, select_multiple, geopoint, note.

### AC3.1.3: Skip Logic

**Given** a question with `showWhen` condition,
**When** the condition is not met,
**Then** the question is skipped automatically.

### AC3.1.4: Geopoint Capture

**Given** a geopoint question,
**When** the user captures location,
**Then** GPS coordinates are stored with accuracy indicator.

### AC3.1.5: Marketplace Consent First

**Given** a form schema with a marketplace consent question,
**When** the form renderer loads,
**Then** the `consent_marketplace` question must be displayed as the first mandatory field before any other questions.

### AC3.1.6: Super Admin Preview Mode

**Given** a Super Admin navigating to `/dashboard/super-admin/questionnaires/:formId/preview`,
**When** the page loads,
**Then** `FormFillerPage` renders in read-only sandbox mode (`mode='preview'`) with one-question-per-screen navigation, progress indicator, and skip logic — but submit is disabled, no data is persisted, and a "Preview Mode" banner is displayed. `FormFillerPage` accepts a `mode` prop (`'fill' | 'preview'`) defaulting to `'fill'` for normal data collection; existing ACs (3.1.1–3.1.5) describe `fill` mode behavior.

### AC3.1.7: Live Preview Button in Form Builder

**Given** the Form Builder interface,
**When** a Super Admin views a form,
**Then** a "Live Preview" button is available on the existing Preview tab (alongside the schema summary and field table) that navigates to `/dashboard/super-admin/questionnaires/:formId/preview`, launching the form renderer in preview mode.

## Tasks / Subtasks

- [x] Task 1: Backend — Authenticated form access endpoints (AC: 1, 2)
  - [x] 1.1: Create `apps/api/src/routes/form.routes.ts` with `authenticate` middleware (no role restriction — any authenticated user can access published forms)
  - [x] 1.2: Create `apps/api/src/controllers/form.controller.ts` with `listPublishedForms` and `getFormForRender` handlers
  - [x] 1.3: `GET /api/v1/forms/published` — returns published questionnaires (`[{ id, formId, title, version, status, publishedAt }]`)
  - [x] 1.4: `GET /api/v1/forms/:id/render` — calls `NativeFormService.flattenForRender()`, returns `FlattenedForm`
  - [x] 1.5: Register routes in `apps/api/src/routes/index.ts`
  - [x] 1.6: Tests in `apps/api/src/controllers/__tests__/form.controller.test.ts` (4+ tests: list published, render form, 401 unauthenticated, 404 not found)

- [x] Task 2: Frontend API & React Query hooks (AC: 1)
  - [x] 2.1: Create `apps/web/src/features/forms/api/form.api.ts` with `fetchPublishedForms()` and `fetchFormForRender(formId)`
  - [x] 2.2: Create `apps/web/src/features/forms/hooks/useForms.ts` with `usePublishedForms()` and `useFormSchema(formId)`
  - [x] 2.3: Query keys: `['forms', 'published']` and `['forms', 'render', formId]`

- [x] Task 3: Client-side skip logic utility (AC: 3)
  - [x] 3.1: Create `apps/web/src/features/forms/utils/skipLogic.ts`
  - [x] 3.2: Implement `evaluateShowWhen(showWhen: Condition | ConditionGroup, formData: Record<string, unknown>): boolean` — port logic from `apps/api/src/services/skip-logic.service.ts` (pure TS, no Node deps)
  - [x] 3.3: Implement `getVisibleQuestions(questions: FlattenedQuestion[], formData): FlattenedQuestion[]` — filter by showWhen + section showWhen
  - [x] 3.4: Implement `getNextVisibleIndex(questions, currentIndex, formData): number` and `getPrevVisibleIndex()`
  - [x] 3.5: Tests in `apps/web/src/features/forms/utils/__tests__/skipLogic.test.ts` (10+ tests covering all operators, AND/OR groups, section-level skip, edge cases)

- [x] Task 4: Question renderer components (AC: 2, 4)
  - [x] 4.1: Create `apps/web/src/features/forms/components/QuestionRenderer.tsx` — type dispatcher that renders appropriate input based on `question.type`
  - [x] 4.2: Create `TextQuestionInput.tsx` — text input with validation (minLength, maxLength, regex)
  - [x] 4.3: Create `NumberQuestionInput.tsx` — number input with validation (min, max, lessThanField)
  - [x] 4.4: Create `DateQuestionInput.tsx` — native date picker, stores ISO string
  - [x] 4.5: Create `SelectOneInput.tsx` — radio button group, 48px+ touch targets, choices from resolved choiceLists
  - [x] 4.6: Create `SelectMultipleInput.tsx` — checkbox group, 48px+ touch targets, stores string array
  - [x] 4.7: Create `GeopointInput.tsx` — Geolocation API capture button, shows lat/lon/accuracy, accuracy indicator, handles permission denial gracefully
  - [x] 4.8: Create `NoteDisplay.tsx` — read-only text display (no input), auto-advances or shows Continue
  - [x] 4.9: Tests for all renderers in `apps/web/src/features/forms/components/__tests__/` (8+ test files)

- [x] Task 5: FormFillerPage — core renderer (AC: 1, 2, 3, 5)
  - [x] 5.1: Create `apps/web/src/features/forms/pages/FormFillerPage.tsx` with props: `formId: string`, `mode: 'fill' | 'preview'` (default `'fill'`)
  - [x] 5.2: Fetch FlattenedForm via `useFormSchema(formId)` with skeleton loading state
  - [x] 5.3: State management: `currentIndex`, `formData`, `visibleQuestions` (recomputed on answer change)
  - [x] 5.4: Navigation: "Continue" button (Oyo Red #9C1E23) advances to next visible question, "Back" button navigates to previous visible question
  - [x] 5.5: Dual-layer progress: horizontal bar (fill%) + section dot indicators (completed/active/pending) + "Question X of Y • Section Z of N" text
  - [x] 5.6: Inline validation: validate current question before allowing advance, show error below field in red (#DC2626), green checkmark on valid
  - [x] 5.7: Marketplace consent enforcement: verify first question in form is consent, block progression if declined
  - [x] 5.8: Completion screen: "Survey saved!" with checkmark animation, navigate back to surveys list
  - [x] 5.9: Slide transitions between questions (slide-left on advance, slide-right on back, 0.3s CSS transition)
  - [x] 5.10: Tests in `apps/web/src/features/forms/pages/__tests__/FormFillerPage.test.tsx` (8+ tests)

- [x] Task 6: Draft persistence with IndexedDB (AC: 1)
  - [x] 6.1: Create `apps/web/src/features/forms/hooks/useDraftPersistence.ts` using existing Dexie schema from `apps/web/src/lib/offline-db.ts`
  - [x] 6.2: Auto-save: on each answer change, debounce 500ms, save `{ formData, questionPosition, status: 'in-progress' }` to `drafts` table
  - [x] 6.3: Resume: on FormFillerPage mount, check for existing draft by formId, restore formData and questionPosition
  - [x] 6.4: On form completion: update draft status to `'completed'`, add to `submissionQueue` table with status `'pending'`
  - [x] 6.5: Tests (mock Dexie, verify save/resume/complete flows)

- [x] Task 7: Preview mode & Form Builder integration (AC: 6, 7)
  - [x] 7.1: In FormFillerPage, when `mode='preview'`: show amber "Preview Mode — Data Not Saved" banner at top, disable draft persistence, replace completion action with "Exit Preview" button
  - [x] 7.2: Add route: `/dashboard/super-admin/questionnaires/:formId/preview` → `<FormFillerPage mode="preview" />`
  - [x] 7.3: Update `apps/web/src/features/questionnaires/components/PreviewTab.tsx` — add "Live Preview" button that navigates to the preview route (using form's DB record ID)
  - [x] 7.4: Tests for preview mode behavior and Form Builder integration

- [x] Task 8: Enumerator surveys page & navigation (AC: 1)
  - [x] 8.1: Rewrite `apps/web/src/features/dashboard/pages/EnumeratorSurveysPage.tsx` — replace placeholder with grid of published form cards (title, version, "Start Survey" button)
  - [x] 8.2: Handle empty state: "No surveys available yet. Contact your supervisor."
  - [x] 8.3: "Start Survey" → check for existing draft → if draft exists show "Resume" option, else navigate to `/dashboard/enumerator/survey/:formId`
  - [x] 8.4: Update `EnumeratorHome.tsx` "Start Survey" button → navigate to `/dashboard/enumerator/survey` (remove "Coming in Epic 3" modal)
  - [x] 8.5: Tests for surveys page

- [x] Task 9: Routing integration (AC: 1, 6, 7)
  - [x] 9.1: Add route `/dashboard/enumerator/survey/:formId` → lazy-loaded FormFillerPage (fill mode)
  - [x] 9.2: Add route `/dashboard/super-admin/questionnaires/:formId/preview` → lazy-loaded FormFillerPage (preview mode)
  - [x] 9.3: Verify ProtectedRoute guards work correctly for enumerator survey and super-admin preview routes

### Review Follow-ups (AI) — 2026-02-12

- [x] [AI-Review][CRITICAL] C1: Dev Agent Record empty — no File List, Change Log, Completion Notes [story file]
- [x] [AI-Review][CRITICAL] C2: `/api/v1/forms/:id/render` returns draft forms to any authenticated user — add published status check [apps/api/src/controllers/form.controller.ts:23]
- [x] [AI-Review][CRITICAL] C3: `useDraftPersistence` hook exists but NOT connected to FormFillerPage — no auto-save, no resume, no completion [apps/web/src/features/forms/pages/FormFillerPage.tsx]
- [x] [AI-Review][HIGH] H1: Navigation index mismatch — `currentIndex` is visible-array index but `getNextVisibleIndex`/`getPrevVisibleIndex` expect full-array index [apps/web/src/features/forms/pages/FormFillerPage.tsx:113]
- [x] [AI-Review][HIGH] H2: Section-level showWhen lost during flattening — `flattenForRender()` doesn't include section showWhen [apps/api/src/services/native-form.service.ts:361]
- [x] [AI-Review][HIGH] H3: Task 8.3 claims draft resume check on surveys page but none exists [apps/web/src/features/dashboard/pages/EnumeratorSurveysPage.tsx]
- [x] [AI-Review][HIGH] H4: `formVersion: parseInt(formVersion)` drops semver — "1.0.0" stored as `1` [apps/web/src/features/forms/hooks/useDraftPersistence.ts:91]
- [x] [AI-Review][MEDIUM] M1: Only 6 component test files vs claimed 8+ — missing SelectMultipleInput, DateQuestionInput tests
- [x] [AI-Review][MEDIUM] M2: Missing `index.ts` barrel export listed in File Structure
- [x] [AI-Review][MEDIUM] M3: Continue button visually disabled but no `disabled` attribute [apps/web/src/features/forms/pages/FormFillerPage.tsx:284]

## Dev Notes

### Architecture Compliance

**Form Rendering Data Flow:**
```
1. Enumerator navigates to /dashboard/enumerator/survey/:formId
2. FormFillerPage loads → calls GET /api/v1/forms/:id/render
3. Backend: NativeFormService.flattenForRender(schema) → FlattenedForm
4. Frontend receives FlattenedForm with flat question[] array + resolved choiceLists
5. Renderer displays one question at a time, evaluates skip logic on each answer change
6. Auto-saves to IndexedDB (drafts table) on each answer
7. On completion: saves to submissionQueue (pending status)
8. Server submission handled by Story 3.4 (BullMQ ingestion)
```

**Preview Data Flow (Super Admin):**
```
1. Super Admin clicks "Live Preview" in Form Builder PreviewTab
2. Navigates to /dashboard/super-admin/questionnaires/:formId/preview
3. FormFillerPage loads with mode='preview'
4. Same rendering as enumerator, but: no IndexedDB persistence, no submission, "Preview Mode" banner
5. Uses existing /api/v1/questionnaires/:id/preview endpoint (already super_admin authorized)
```

### Existing Code to Reuse (DO NOT reinvent)

| What | Where | How to Reuse |
|------|-------|-------------|
| NativeFormSchema types | `packages/types/src/native-form.ts` | Import all interfaces (Question, Section, Choice, Condition, etc.) |
| FlattenedForm/FlattenedQuestion | `apps/api/src/services/native-form.service.ts` (lines 13-33) | Match interfaces on frontend; backend already exports flattenForRender() |
| Zod validation schemas | `packages/types/src/validation/native-form.ts` | Use for runtime validation if needed |
| Skip logic evaluation | `apps/api/src/services/skip-logic.service.ts` | Port pure-TS logic to client-side utility (no Node deps) |
| IndexedDB schema (Dexie) | `apps/web/src/lib/offline-db.ts` | Use existing `drafts` and `submissionQueue` tables directly |
| useLiveQuery pattern | `apps/web/src/features/spike/SpikeOfflinePage.tsx` | Reference for Dexie reactive queries |
| Skeleton components | `apps/web/src/components/skeletons/` | Use SkeletonCard, SkeletonText for loading states |
| Toast hook | `apps/web/src/hooks/useToast.ts` | Use for save/error notifications |
| API client | `apps/web/src/lib/api-client.ts` | Use apiClient() for all API calls |
| ConditionBuilder | `apps/web/src/features/questionnaires/components/ConditionBuilder.tsx` | Reference for condition data structures (DO NOT reuse as component — it's an editor, not a renderer) |
| PreviewTab | `apps/web/src/features/questionnaires/components/PreviewTab.tsx` | Modify to add "Live Preview" button |
| EnumeratorHome | `apps/web/src/features/dashboard/pages/EnumeratorHome.tsx` | Update "Start Survey" to navigate instead of showing placeholder modal |
| EnumeratorSurveysPage | `apps/web/src/features/dashboard/pages/EnumeratorSurveysPage.tsx` | Rewrite with actual form list |

### TypeScript Interfaces (Critical Reference)

**FlattenedForm (returned by /forms/:id/render API):**
```typescript
interface FlattenedQuestion {
  id: string;
  type: QuestionType; // 'text' | 'number' | 'date' | 'select_one' | 'select_multiple' | 'note' | 'geopoint'
  name: string;       // Unique field identifier
  label: string;      // English display label
  labelYoruba?: string;
  required: boolean;
  sectionId: string;
  sectionTitle: string;
  choices?: Choice[];  // Resolved from choiceLists (NOT a key — actual Choice[])
  showWhen?: Condition | ConditionGroup;
  validation?: ValidationRule[];
}

interface FlattenedForm {
  formId: string;
  title: string;
  version: string;
  questions: FlattenedQuestion[];  // Flat array for one-question-per-screen
  choiceLists: Record<string, Choice[]>;
}
```

**Skip Logic Types:**
```typescript
type ConditionOperator = 'equals' | 'not_equals' | 'greater_than' | 'greater_or_equal'
  | 'less_than' | 'less_or_equal' | 'is_empty' | 'is_not_empty';

interface Condition { field: string; operator: ConditionOperator; value?: string | number; }
interface ConditionGroup { any?: Condition[]; all?: Condition[]; }
```

**IndexedDB Draft Schema (already in offline-db.ts):**
```typescript
interface Draft {
  id: string;              // UUIDv7
  formId: string;
  formVersion: number;
  responses: Record<string, unknown>;  // formData
  questionPosition: number;            // currentIndex for resume
  status: 'in-progress' | 'completed' | 'submitted';
  createdAt: string;
  updatedAt: string;
}
```

### Skip Logic Implementation Notes

**Operator evaluation (port from backend skip-logic.service.ts):**
| Operator | Behavior | Notes |
|----------|----------|-------|
| `equals` | Loose equality (`==`) | `age: 15, value: "15"` → true |
| `not_equals` | Loose inequality (`!=`) | |
| `greater_than` | Numeric `>` | NaN returns false |
| `greater_or_equal` | Numeric `>=` | |
| `less_than` | Numeric `<` | |
| `less_or_equal` | Numeric `<=` | |
| `is_empty` | `field == null \|\| field === ''` | No value param needed |
| `is_not_empty` | `field != null && field !== ''` | No value param needed |

**ConditionGroup evaluation:**
- `group.any` (OR): true if ANY condition is true
- `group.all` (AND): true if ALL conditions are true
- Discriminate Condition vs ConditionGroup by checking for `field` property (Condition) vs `any`/`all` (ConditionGroup)

**Visible question calculation:**
1. For each question, evaluate its `showWhen` against current `formData`
2. Also check the parent section's `showWhen` — if section is hidden, all its questions are hidden
3. A question is visible if: (no showWhen OR showWhen evaluates to true) AND (parent section is visible)
4. Recalculate visible questions on EVERY answer change

### Geopoint Implementation

**Geolocation API usage:**
```typescript
navigator.geolocation.getCurrentPosition(
  (position) => {
    // Store as formData[question.name]
    setValue({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
    });
  },
  (error) => {
    // Handle: PERMISSION_DENIED, POSITION_UNAVAILABLE, TIMEOUT
    // Show user-friendly message, allow manual entry or skip
  },
  { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
);
```

**Display format:** "9.0765° N, 5.5500° E (± 15m)" using JetBrains Mono font.

**Permission handling:** If denied, show banner "Location access denied. GPS data will not be recorded." Allow survey to continue without GPS (geopoint is not always required).

### Question Renderer Component Patterns

Each question renderer receives:
```typescript
interface QuestionRendererProps {
  question: FlattenedQuestion;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  disabled?: boolean; // true in preview mode
}
```

**Input sizing:**
- All interactive elements: minimum 48px height (WCAG touch target)
- Radio/checkbox: 24x24px indicator + 48px row height with label
- Font: Inter, 16px minimum (prevents iOS auto-zoom on focus)
- Focus ring: `ring-2 ring-[#9C1E23]/20 border-[#9C1E23]`

### UX Requirements Summary

**One-Question-Per-Screen:**
- Single question card centered with generous whitespace
- Max content width: 400px mobile, 600px desktop
- Background: #F9FAFB, card: white with 16px border-radius + subtle shadow

**Navigation Buttons:**
- "Continue" (primary): Oyo Red #9C1E23, white text, full-width mobile, 56px height mobile / 48px desktop
- "Back" (secondary): White bg, #E5E7EB border, #6B7280 text
- Side-by-side layout on desktop, stacked on mobile
- Disabled state: opacity 0.5, cursor not-allowed (when validation fails)

**Progress Indicators:**
- Horizontal bar: 4px height, full-width, fill color #9C1E23, bg #E5E7EB
- Section dots: 8px diameter, completed=#15803D, active=#9C1E23, pending=#E5E7EB
- Text: "Question X of Y • Section Z of N" (14px, #6B7280)

**Transitions:**
- Slide-left on advance, slide-right on back
- Duration: 0.3s, easing: cubic-bezier(0.4, 0, 0.2, 1)

**Validation UI:**
- Valid: green checkmark (#15803D) fades in 0.3s
- Error: red text (#DC2626) below field, border turns red
- Validate on "Continue" click, NOT on blur (one-question-per-screen, user should see error when trying to advance)

**Completion Animation:**
- Green checkmark scales in: 0.5x → 1.2x → 1x (0.6s spring)
- Text: "Survey saved! It will be uploaded when connected."
- Haptic feedback (if available): single vibration pulse

### File Structure (New Files)

```
apps/web/src/features/forms/
├── api/
│   └── form.api.ts                    # API functions for form rendering
├── components/
│   ├── QuestionRenderer.tsx           # Type dispatcher
│   ├── TextQuestionInput.tsx
│   ├── NumberQuestionInput.tsx
│   ├── DateQuestionInput.tsx
│   ├── SelectOneInput.tsx
│   ├── SelectMultipleInput.tsx
│   ├── GeopointInput.tsx
│   ├── NoteDisplay.tsx
│   ├── ProgressBar.tsx                # Horizontal progress bar + section dots
│   ├── PreviewBanner.tsx              # "Preview Mode" amber banner
│   └── __tests__/
│       ├── QuestionRenderer.test.tsx
│       ├── TextQuestionInput.test.tsx
│       ├── NumberQuestionInput.test.tsx
│       ├── SelectOneInput.test.tsx
│       ├── GeopointInput.test.tsx
│       └── ProgressBar.test.tsx
├── hooks/
│   ├── useForms.ts                    # React Query hooks
│   └── useDraftPersistence.ts         # IndexedDB auto-save/resume
├── pages/
│   ├── FormFillerPage.tsx             # Core one-question-per-screen renderer
│   └── __tests__/
│       └── FormFillerPage.test.tsx
├── utils/
│   ├── skipLogic.ts                   # Client-side skip logic evaluation
│   └── __tests__/
│       └── skipLogic.test.ts
└── index.ts

apps/api/src/
├── routes/
│   └── form.routes.ts                 # New: /api/v1/forms/* endpoints
├── controllers/
│   ├── form.controller.ts             # New: listPublishedForms, getFormForRender
│   └── __tests__/
│       └── form.controller.test.ts
```

**Modified Files:**
- `apps/web/src/App.tsx` — Add new routes (enumerator survey, super admin preview, public survey, clerk entry)
- `apps/web/src/features/dashboard/pages/EnumeratorHome.tsx` — Update "Start Survey" button to navigate
- `apps/web/src/features/dashboard/pages/EnumeratorSurveysPage.tsx` — Rewrite with published forms list
- `apps/web/src/features/questionnaires/components/PreviewTab.tsx` — Add "Live Preview" button
- `apps/api/src/routes/index.ts` — Register new form routes

### Testing Strategy

**Backend tests (4+ tests):**
- GET /forms/published → returns only published forms
- GET /forms/:id/render → returns FlattenedForm
- Unauthenticated request → 401
- Non-existent form → 404

**Skip logic tests (10+ tests):**
- Single condition: equals, not_equals, greater_than, etc.
- ConditionGroup with `any` (OR)
- ConditionGroup with `all` (AND)
- Section-level skip logic
- No showWhen → always visible
- Empty formData → is_empty true
- getNextVisibleIndex skips hidden questions
- getPrevVisibleIndex skips hidden questions
- Edge: all questions hidden
- Edge: first question hidden

**Question renderer tests (8+ test files):**
- Each renderer type renders correctly
- Value changes trigger onChange callback
- Validation errors display correctly
- Disabled state in preview mode
- Geopoint: permission handling, coordinate display

**FormFillerPage tests (8+ tests):**
- Loads form and displays first question
- Navigation: Continue advances, Back goes back
- Skip logic: hidden questions are skipped
- Progress indicators update correctly
- Validation prevents advance on invalid input
- Preview mode: banner visible, submit disabled
- Completion screen shows on final question
- Empty state: no form found

**Enumerator surveys page tests:**
- Published forms render as cards
- Empty state displays correctly
- Start Survey navigates to form filler

### Previous Story Intelligence

**From Story 3-0 (Google OAuth):**
- Auth context updated with `loginWithGoogle` — all auth patterns current
- Frontend auth features at `apps/web/src/features/auth/` — follow same structure for `features/forms/`
- Code review found 8 issues (2 Critical, 3 High) — expect thorough adversarial review
- Test baseline: 280 API tests, 971 web tests — new tests must not break existing

**From prep-5 (Offline PWA Spike):**
- `apps/web/src/lib/offline-db.ts` — Dexie schema ready with drafts, submissionQueue, formSchemaCache tables
- `apps/web/src/features/spike/SpikeOfflinePage.tsx` — reference for Dexie CRUD patterns
- Service worker shell registered in EnumeratorHome — does NOT interfere with form rendering
- `dexie` and `dexie-react-hooks` packages already installed

**From prep-8 (Update Story 3.1 ACs):**
- AC3.1.6 and AC3.1.7 added for preview mode
- Tasks 3.1.4-3.1.6 are non-blocking (implement after core renderer)
- Preview uses same FormFillerPage component with mode prop

**From Story 2.10 (Native Form Builder):**
- FormBuilderPage uses tabs (Settings, Sections, Choices, Preview)
- PreviewTab currently shows statistics + JSON — needs "Live Preview" button added
- Form Builder routes: `/dashboard/super-admin/questionnaires/builder/:formId`
- React Query hooks in `useQuestionnaires.ts` — useNativeFormSchema, etc.
- Native form API at `questionnaire.api.ts` — getNativeFormSchema, updateNativeFormSchema, etc.

### Git Intelligence

**Recent commit patterns:**
```
e548827 fix: remove invalid locale prop from GoogleLogin component
93eff32 fix: CI type errors — add loginWithGoogle to mock AuthContext
b33dcfd feat: Google OAuth & enhanced public registration (Story 3.0)
5cd1b5d docs: update Story 3.1 ACs for admin form preview (prep-8)
712f6bc feat: Service Worker & IndexedDB offline-first spike (prep-5)
```

**Relevant patterns from recent work:**
- Feature-based organization strictly followed (features/auth/, features/dashboard/, features/questionnaires/)
- Code review discipline: every story gets 3-10 finding adversarial review
- Tests are co-located in frontend (`__tests__/` in same directory or sibling)
- Backend tests in `__tests__/` subdirectory under services/controllers
- Lazy loading for all dashboard page routes

### Library & Framework Requirements

| Library | Status | Purpose |
|---------|--------|---------|
| `dexie` | Already installed (prep-5) | IndexedDB wrapper for draft persistence |
| `dexie-react-hooks` | Already installed (prep-5) | Reactive Dexie queries |
| `uuidv7` | Already installed | Generate draft IDs client-side |
| `@oslsr/types` | Workspace package | NativeFormSchema, FlattenedQuestion, Condition types |

**No new dependencies required.** All needed packages are already installed.

### Critical Guardrails

1. **DO NOT create a submission API endpoint** — that is Story 3.4. Form data goes to IndexedDB only.
2. **DO NOT implement Service Worker caching** — that is Story 3.2. Form loads via network.
3. **DO NOT implement background sync** — that is Story 3.3. Submissions stay in IndexedDB queue.
4. **DO NOT add clerk keyboard shortcuts** — that is Story 3.6. Clerk route is a placeholder only.
5. **Use existing Dexie schema** from `offline-db.ts` — do NOT create a new database or schema.
6. **Use Skeleton screens** for loading states — NEVER spinners (project-context.md rule #4).
7. **Use AppError pattern** for backend errors — NEVER raw `throw new Error()`.
8. **All IDs use UUIDv7** — NEVER auto-increment or UUIDv4.
9. **ESM imports with .js extension** in backend files — NEVER omit extension.
10. **Test selectors: text content, data-testid, ARIA roles ONLY** — NEVER CSS classes (team agreement A3).

### Project Structure Notes

- New `features/forms/` follows existing feature-based pattern alongside `features/questionnaires/` (builder) and `features/dashboard/` (shells)
- `features/forms/` is for the RENDERER (filling forms); `features/questionnaires/` is for the BUILDER (creating forms) — distinct concerns
- API wrapper functions in `api/form.api.ts` use the shared `apiClient` from `lib/api-client.ts`
- React Query hooks follow `use<Entity>` naming: `usePublishedForms`, `useFormSchema`
- All new routes lazy-loaded via `React.lazy()` in App.tsx

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.1]
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-001 (Native Form System)]
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-004 (Offline Data Model)]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Form Filling UX, Enumerator Dashboard]
- [Source: docs/project-context.md#Loading States, Error Handling, Testing Organization]
- [Source: apps/api/src/services/native-form.service.ts — FlattenedForm, flattenForRender()]
- [Source: apps/api/src/services/skip-logic.service.ts — evaluateCondition, evaluateConditionGroup]
- [Source: packages/types/src/native-form.ts — NativeFormSchema, Question, Section, Condition interfaces]
- [Source: apps/web/src/lib/offline-db.ts — Dexie schema with drafts, submissionQueue tables]
- [Source: apps/web/src/features/questionnaires/components/PreviewTab.tsx — existing preview tab to modify]
- [Source: apps/web/src/features/dashboard/pages/EnumeratorHome.tsx — "Start Survey" button to update]
- [Source: apps/web/src/features/dashboard/pages/EnumeratorSurveysPage.tsx — placeholder to rewrite]
- [Source: _bmad-output/implementation-artifacts/3-0-google-oauth-enhanced-public-registration.md — previous story patterns]
- [Source: docs/spike-offline-pwa.md — offline architecture decisions]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

- Code review conducted 2026-02-12: 10 findings (3 Critical, 4 High, 3 Medium), all resolved

### Completion Notes List

1. All 9 tasks and subtasks implemented and marked complete
2. Adversarial code review performed — 10 issues found and fixed in-session
3. Security fix: `/forms/:id/render` endpoint now enforces published status check (403 for drafts)
4. Navigation index mismatch fixed: `currentIndex` tracks full-array position, `visibleIndex` derived for display
5. Draft persistence fully wired: auto-save, resume on mount, completeDraft on submission
6. Section-level showWhen conditions preserved through flattening pipeline (backend + frontend)
7. formVersion stored as semver string (was truncated to integer via parseInt)
8. Surveys page shows "Resume Draft" for forms with in-progress IndexedDB drafts
9. Continue button has proper `disabled` attribute alongside visual styling
10. All 99+ tests passing (92 forms, 7 API controller, 7 surveys page)

### Change Log

| Date | Change | Files |
|------|--------|-------|
| 2026-02-12 | Initial implementation: Story 3.1 tasks 1-9 | All files below |
| 2026-02-12 | Code review fix C2: Add published status check to render endpoint | native-form.service.ts, form.controller.ts, form.controller.test.ts |
| 2026-02-12 | Code review fix C3+H1: Wire draft persistence, fix navigation indexing | FormFillerPage.tsx, FormFillerPage.test.tsx |
| 2026-02-12 | Code review fix H2: Add sectionShowWhen to FlattenedForm | native-form.service.ts, form.api.ts |
| 2026-02-12 | Code review fix H3: Add draft resume check to surveys page | EnumeratorSurveysPage.tsx, useForms.ts, EnumeratorSurveysPage.test.tsx |
| 2026-02-12 | Code review fix H4: Change formVersion from number to string | offline-db.ts, useDraftPersistence.ts |
| 2026-02-12 | Code review fix M1: Add missing test files | SelectMultipleInput.test.tsx, DateQuestionInput.test.tsx |
| 2026-02-12 | Code review fix M2: Add barrel export | forms/index.ts |
| 2026-02-12 | Code review fix M3: Add disabled attribute to Continue button | FormFillerPage.tsx |

### File List

**Backend (apps/api/src/)**
- `controllers/form.controller.ts` — NEW: FormController with listPublishedForms, getFormForRender
- `controllers/__tests__/form.controller.test.ts` — NEW: 7 tests for form controller
- `routes/form.routes.ts` — NEW: /forms/published, /forms/:id/render routes
- `routes/index.ts` — MODIFIED: Mount form routes
- `services/native-form.service.ts` — MODIFIED: Added getPublishedFormSchema, sectionShowWhen in flattenForRender

**Frontend Feature (apps/web/src/features/forms/)**
- `index.ts` — NEW: Barrel export
- `api/form.api.ts` — NEW: API types + fetchPublishedForms, fetchFormForRender
- `hooks/useForms.ts` — NEW: usePublishedForms, useFormSchema, useFormDrafts hooks
- `hooks/useDraftPersistence.ts` — NEW: IndexedDB draft auto-save/resume/complete hook
- `hooks/__tests__/useDraftPersistence.test.ts` — NEW: 4 tests
- `utils/skipLogic.ts` — NEW: getVisibleQuestions, getNextVisibleIndex, getPrevVisibleIndex
- `utils/__tests__/skipLogic.test.ts` — NEW: 25 tests
- `pages/FormFillerPage.tsx` — NEW: One-question-per-screen renderer with draft persistence
- `pages/__tests__/FormFillerPage.test.tsx` — NEW: 11 tests
- `components/QuestionRenderer.tsx` — NEW: Question type dispatcher
- `components/TextQuestionInput.tsx` — NEW: Text input
- `components/NumberQuestionInput.tsx` — NEW: Number input
- `components/DateQuestionInput.tsx` — NEW: Date input
- `components/SelectOneInput.tsx` — NEW: Radio group
- `components/SelectMultipleInput.tsx` — NEW: Checkbox group
- `components/GeopointInput.tsx` — NEW: Geolocation capture
- `components/NoteDisplay.tsx` — NEW: Read-only note display
- `components/ProgressBar.tsx` — NEW: Section-aware progress indicator
- `components/PreviewBanner.tsx` — NEW: Preview mode banner
- `components/__tests__/QuestionRenderer.test.tsx` — NEW: 8 tests
- `components/__tests__/TextQuestionInput.test.tsx` — NEW: 7 tests
- `components/__tests__/NumberQuestionInput.test.tsx` — NEW: 5 tests
- `components/__tests__/SelectOneInput.test.tsx` — NEW: 5 tests
- `components/__tests__/SelectMultipleInput.test.tsx` — NEW: 8 tests
- `components/__tests__/DateQuestionInput.test.tsx` — NEW: 9 tests
- `components/__tests__/GeopointInput.test.tsx` — NEW: 6 tests
- `components/__tests__/ProgressBar.test.tsx` — NEW: 4 tests

**Modified Existing Files (apps/web/src/)**
- `App.tsx` — MODIFIED: Added lazy routes for form filler and preview
- `lib/offline-db.ts` — MODIFIED: formVersion type changed from number to string
- `features/dashboard/pages/EnumeratorHome.tsx` — MODIFIED: Updated "Start Survey" button navigation
- `features/dashboard/pages/EnumeratorSurveysPage.tsx` — MODIFIED: Full rewrite with form cards + draft resume
- `features/dashboard/pages/__tests__/EnumeratorHome.test.tsx` — MODIFIED: Updated for new navigation
- `features/dashboard/pages/__tests__/EnumeratorSurveysPage.test.tsx` — MODIFIED: Updated with draft resume test
- `features/questionnaires/components/PreviewTab.tsx` — MODIFIED: Launch preview via FormFillerPage
- `features/questionnaires/components/__tests__/PreviewTab.test.tsx` — NEW: PreviewTab tests
- `features/questionnaires/pages/FormBuilderPage.tsx` — MODIFIED: Pass formId to PreviewTab
