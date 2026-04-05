# Story 9.1: Profile Page — Fix /auth/me & Editable Profile

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **registered user** (any role),
I want to **view my complete profile after page refresh and edit my personal details**,
so that **my information stays accurate and I don't see a broken name after session restore**.

## Acceptance Criteria

1. **AC#1 — /auth/me returns full profile:** `GET /auth/me` returns `fullName`, `phone`, `status`, `lgaId`, `createdAt` in addition to existing fields (`id`, `email`, `role`, `rememberMe`). After page refresh, the profile page and sidebar display the user's real name (not empty string or email prefix).

2. **AC#2 — Profile page read view:** Profile page displays: avatar (initials), full name, email, phone, role (sentence case via `getRoleDisplayName()`), assigned LGA/ward (resolved name, not UUID), account status (from DB, not hardcoded), member since date, selfie photo (if available). Non-editable fields are visually distinct (greyed/disabled).

3. **AC#3 — Profile edit form:** Clicking "Edit Profile" toggles the page into edit mode. Editable fields: `fullName`, `phone`, `homeAddress`, `nextOfKinName`, `nextOfKinPhone`, `bankName`, `accountNumber`, `accountName`. Cancel returns to view mode without changes.

4. **AC#4 — PATCH /users/profile endpoint:** `PATCH /api/v1/users/profile` accepts partial updates for the editable fields. Validates input with Zod schema. Returns updated user data. Rejects empty `fullName`. 401 for unauthenticated, 400 for validation errors, 409 for duplicate phone.

5. **AC#5 — Validation:** Phone: 11 digits (Nigerian format). Account number: exactly 10 digits. Bank name: from predefined list (reuse `NIGERIAN_BANKS` from activation wizard). All other text fields: min 2 chars. Client-side validation matches server-side schema.

6. **AC#6 — Success feedback & sync:** On successful save: success toast "Profile updated successfully", form returns to view mode, AuthContext user state refreshed (re-fetch `/auth/me`). No page reload required.

7. **AC#7 — Audit logging:** Every profile update logged via `AuditService.logAction()` with action `user.profile_updated`, capturing which fields changed, actor ID, IP address.

8. **AC#8 — Tests:** Backend: unit tests for service (validation, partial updates, duplicate phone, audit logging). Route tests for PATCH endpoint (401, 400, 409, 200). Frontend: ProfilePage view mode rendering, edit mode toggle, form validation, mutation success/error states.

## Tasks / Subtasks

- [x] Task 1: Fix /auth/me endpoint (AC: #1)
  - [x] 1.1 In `auth.controller.ts`, query DB for full user record by `req.user.sub` (use `db.select()` from users table)
  - [x] 1.2 Return additional fields: `fullName`, `phone`, `status`, `lgaId`, `createdAt`
  - [x] 1.3 Update `AuthContext.tsx` session restore (`restoreSession`) to populate `fullName` and `status` from `/auth/me` response
  - [x] 1.4 Update `AuthUser` interface in `packages/types/src/auth.ts` if needed (already has `fullName` and `status`)
  - [x] 1.5 Update `getCurrentUser()` in `auth.api.ts` to map the new fields

- [x] Task 2: Create profile update schema (AC: #4, #5)
  - [x] 2.1 Add `updateProfileSchema` to `packages/types/src/validation/profile.ts`
  - [x] 2.2 Fields: `fullName` (string, min 1), `phone` (string, 11 digits, optional), `homeAddress` (string, min 5, optional), `nextOfKinName` (string, min 2, optional), `nextOfKinPhone` (string, min 10, optional), `bankName` (string, min 2, optional), `accountNumber` (string, 10 digits, optional), `accountName` (string, min 2, optional)
  - [x] 2.3 Export `UpdateProfilePayload` type via `z.infer`
  - [x] 2.4 Re-export from `packages/types/src/index.ts`

- [x] Task 3: Create PATCH /users/profile endpoint (AC: #4, #7)
  - [x] 3.1 Add `updateProfile` method to `user.controller.ts` — validate with `updateProfileSchema.safeParse(req.body)`, delegate to service
  - [x] 3.2 Create `apps/api/src/services/user.service.ts` with `updateProfile(userId, data)` method
  - [x] 3.3 In service: use `db.transaction()` with `SELECT FOR UPDATE` to prevent TOCTOU race on phone uniqueness
  - [x] 3.4 In service: check phone uniqueness if phone is being updated (exclude current user)
  - [x] 3.5 In service: call `AuditService.logAction()` with changed fields diff
  - [x] 3.6 Add `PATCH /profile` route to `user.routes.ts` (behind `authenticate` middleware)
  - [x] 3.7 Register route in `apps/api/src/routes/index.ts` if not already under `/users`

- [x] Task 4: Build profile page view mode (AC: #2)
  - [x] 4.1 Create `apps/web/src/features/dashboard/api/profile.api.ts` — `fetchProfile()` (can reuse `/auth/me`) and `updateProfile(data)` API functions
  - [x] 4.2 Create `apps/web/src/features/dashboard/hooks/useProfile.ts` — `useUpdateProfile()` mutation hook with TanStack Query, toast feedback, cache invalidation
  - [x] 4.3 Rewrite `ProfilePage.tsx` view mode: display all fields from AC#2, resolve LGA name (use existing LGA data or add to `/auth/me` response), show selfie if `liveSelfieOriginalUrl` exists, remove hardcoded "Active" status, remove placeholder text

- [x] Task 5: Build profile edit form (AC: #3, #5, #6)
  - [x] 5.1 Add edit mode state toggle to `ProfilePage.tsx` (view/edit via `useState`)
  - [x] 5.2 Build inline edit form following activation wizard field patterns (same input styling, error display)
  - [x] 5.3 Reuse `NIGERIAN_BANKS` constant from `apps/web/src/features/auth/components/activation-wizard/steps/BankDetailsStep.tsx` — extract to shared location if not already shared
  - [x] 5.4 Client-side Zod validation matching server schema
  - [x] 5.5 On save: call `useUpdateProfile().mutate()`, on success: toast + exit edit mode + re-sync AuthContext
  - [x] 5.6 Re-sync AuthContext after save: call `getCurrentUser()` or refetch `/auth/me` to update sidebar/header name display

- [x] Task 6: Tests (AC: #8)
  - [x] 6.1 Backend: `apps/api/src/services/__tests__/user.service.test.ts` — partial update, phone uniqueness rejection, audit logging call, empty fullName rejection
  - [x] 6.2 Backend: `apps/api/src/__tests__/user.profile.test.ts` — GET+PATCH /profile: 200 success, 401 unauthenticated, 400 validation errors, 409 duplicate phone, audit log
  - [x] 6.3 Backend: test `/auth/me` returns new fields (updated existing auth.login.test.ts)
  - [x] 6.4 Frontend: ProfilePage renders all fields in view mode, edit button toggles form, form validation errors display, successful mutation returns to view mode with toast

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] H1: Broken selfie on profile page — `liveSelfieOriginalUrl` is an S3 key, not a URL. `getProfile` controller now resolves via `photoService.getSignedUrl()` [user.controller.ts:161]
- [x] [AI-Review][HIGH] H2: `updateProfile` in `profile.api.ts` declared `Promise<UserProfile>` but PATCH returns a subset. Added accurate `UpdateProfileResponse` type [profile.api.ts:28]
- [x] [AI-Review][MEDIUM] M1: Undocumented `AssessorReviewActions.tsx` change (replaced `useEffect+setTimeout` focus hack with Radix `onOpenAutoFocus`). Added to File List.
- [x] [AI-Review][MEDIUM] M2: `fullName` accepted whitespace-only values (`" "`). Added `.trim()` to Zod schema [profile.ts:66]
- [x] [AI-Review][MEDIUM] M3: Server accepted empty payload `{}` — pointless DB write + audit entry. Added `.refine()` requiring at least one field [profile.ts:73]
- [x] [AI-Review][MEDIUM] M4: No rate limiting on `PATCH /users/profile`. Added `profileUpdateRateLimit` (10/min per user) [rate-limit.ts, user.routes.ts:25]
- [x] [AI-Review][LOW] L1: Dead `updateProfileSchema` mock in `ProfilePage.test.tsx` — ProfilePage doesn't import it. Removed [ProfilePage.test.tsx:39]
- [x] [AI-Review][MEDIUM] M5: `refreshUser` added to `AuthContextValue` but 6 test files' mock objects missing it — TS2741 errors in DashboardRedirect, rbac-routes, PublicUserRbac, DashboardLayout, MobileNav, SmartCta tests. Added `refreshUser: vi.fn()` to all 10 mock instances.

## Dev Notes

### Critical Bug Context

The `/auth/me` endpoint (`auth.controller.ts:433-454`) currently returns ONLY JWT payload fields:
```typescript
res.json({
  data: {
    id: req.user.sub,
    email: req.user.email,
    role: req.user.role,
    lgaId: req.user.lgaId,
    rememberMe: req.user.rememberMe,
  },
});
```
This means after page refresh, `fullName` is empty string in AuthContext (`AuthContext.tsx:476`). The fix requires a DB query in the `/auth/me` handler to fetch the actual user record.

### Key Existing Code

| Component | File | Notes |
|-----------|------|-------|
| `/auth/me` handler | `apps/api/src/controllers/auth.controller.ts:433-454` | Needs DB query added |
| Session restore | `apps/web/src/features/auth/context/AuthContext.tsx:460-491` | Maps `/auth/me` response to AuthUser |
| `getCurrentUser()` | `apps/web/src/features/auth/api/auth.api.ts` | Frontend caller for `/auth/me` |
| AuthUser type | `packages/types/src/auth.ts:43-51` | Already has `fullName`, `status` fields |
| User DB schema | `apps/api/src/db/schema/users.ts` | Full column definitions |
| User routes | `apps/api/src/routes/user.routes.ts` | Has selfie + id-card + verify routes |
| User controller | `apps/api/src/controllers/user.controller.ts` | Has uploadSelfie, downloadIDCard, verifyStaff |
| Profile validation | `packages/types/src/validation/profile.ts` | Has `activationSchema` — reuse field validators |
| Bank list | `apps/web/src/features/auth/components/activation-wizard/steps/BankDetailsStep.tsx` | `NIGERIAN_BANKS` grouped by category |
| Activation wizard | `apps/web/src/features/auth/components/activation-wizard/` | Reference for form field styling patterns |

### No user.service.ts exists

There is no `apps/api/src/services/user.service.ts`. You must create it. Follow the pattern from `staff.service.ts` or `marketplace.service.ts`:
- Import `db` from `../db/index.js`
- Import `users` table from `../db/schema/users.js`
- Import `eq`, `ne`, `and` from `drizzle-orm`
- Use `db.transaction()` for updates with uniqueness checks
- Use `SELECT FOR UPDATE` pattern for TOCTOU prevention (see `apps/api/src/services/marketplace.service.ts` for reference)

### Race Condition Pattern (MANDATORY)

Phone uniqueness check MUST use transaction + `FOR UPDATE`:
```typescript
await db.transaction(async (tx) => {
  // Lock row
  const [existing] = await tx.select().from(users).where(eq(users.id, userId)).for('update');
  // Check phone uniqueness (exclude self)
  if (data.phone) {
    const [duplicate] = await tx.select({ id: users.id }).from(users)
      .where(and(eq(users.phone, data.phone), ne(users.id, userId)));
    if (duplicate) throw new AppError('DUPLICATE_PHONE', 'Phone number already in use', 409);
  }
  // Update
  await tx.update(users).set({ ...data, updatedAt: new Date() }).where(eq(users.id, userId));
});
```

### Audit Logging Pattern

Use fire-and-forget mode (non-blocking):
```typescript
import { AuditService } from './audit.service.js';

AuditService.logAction({
  actorId: userId,
  action: 'user.profile_updated',
  targetType: 'user',
  targetId: userId,
  details: { changedFields: Object.keys(data) },
  ipAddress: req.ip,
  userAgent: req.get('user-agent'),
});
```

### Frontend Patterns to Follow

**Mutation hook** — follow `useStaff.ts` pattern:
```typescript
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  return useMutation({
    mutationFn: (data: UpdateProfilePayload) => updateProfile(data),
    onSuccess: () => {
      success({ message: 'Profile updated successfully' });
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
    onError: (err: Error & { code?: string }) => {
      showError({ message: err.message || 'Failed to update profile' });
    },
  });
}
```

**Form field styling** — follow activation wizard `BankDetailsStep.tsx` pattern with:
- `className="w-full px-4 py-3 rounded-lg border transition-colors"`
- Error state: `border-error-600 focus-visible:ring-error-600`
- Normal state: `border-neutral-300 focus-visible:ring-primary-500`
- Disabled: `disabled:bg-neutral-100 disabled:cursor-not-allowed`

**API client** — follow `staff.api.ts` pattern using `apiClient`:
```typescript
export async function updateProfile(data: UpdateProfilePayload) {
  return apiClient('/users/profile', { method: 'PATCH', body: JSON.stringify(data) });
}
```

### Fields NOT Editable by User

These are admin-controlled and must be displayed read-only: `role`, `email`, `status`, `nin`, `dateOfBirth`, `lgaId`, `roleId`. Do NOT include these in the update schema or edit form.

### AuthContext Re-sync After Edit

After a successful profile update, the user's name in the sidebar/header must update without page reload. Options:
1. **Preferred:** Invalidate the auth query key so `/auth/me` is refetched, which flows through `AuthContext`
2. **Alternative:** Directly update `AuthContext` state with the PATCH response data

Check how `AuthContext` exposes its setter. If it uses `useReducer`, dispatch an update action. If `useState`, call the setter. The current `restoreSession()` flow in `AuthContext.tsx:460-491` calls `getCurrentUser()` — after the PATCH, re-calling this would refresh the displayed name.

### Project Structure Notes

- Backend files go in existing directories: `controllers/`, `services/`, `routes/`
- No new frontend feature folder needed — profile lives in `apps/web/src/features/dashboard/`
- API client + hooks in `dashboard/api/` and `dashboard/hooks/` subdirs
- Shared validation schema in `packages/types/src/validation/profile.ts` (already exists, extend it)
- Do NOT create a separate `features/profile/` folder — the profile page is part of the dashboard feature

### References

- [Source: `_bmad-output/implementation-artifacts/polish-and-migration-plan-2026-03-14.md` — Section 1]
- [Source: `apps/api/src/controllers/auth.controller.ts:433-454` — current /auth/me handler]
- [Source: `apps/web/src/features/auth/context/AuthContext.tsx:460-491` — session restore]
- [Source: `packages/types/src/auth.ts:43-51` — AuthUser interface]
- [Source: `apps/api/src/db/schema/users.ts` — full user schema]
- [Source: `packages/types/src/validation/profile.ts` — existing activation schema]
- [Source: `apps/web/src/features/staff/hooks/useStaff.ts` — mutation hook pattern]
- [Source: `apps/api/src/services/marketplace.service.ts` — SELECT FOR UPDATE pattern]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- RED phase confirmed: `/auth/me` test failed on missing `fullName` (expected)
- GREEN phase confirmed: all 15 auth.login tests pass after DB query added
- Service unit tests: 4/4 pass
- Integration tests: 10/10 pass (GET+PATCH /users/profile)
- Frontend tests: 17/17 pass (ProfilePage view/edit/loading/error)

### Completion Notes List

- **Task 1**: Fixed `/auth/me` to query DB for full user record instead of returning only JWT payload fields. AuthContext session restore now populates `fullName` and `status` from actual DB data.
- **Task 2**: Added `updateProfileSchema` with Zod validation (8 optional fields, phone 11-digit Nigerian format, account number 10-digit).
- **Task 3**: Created `UserService.updateProfile()` with TOCTOU-safe phone uniqueness via `SELECT FOR UPDATE` in transaction. PATCH endpoint with audit logging.
- **Task 4**: Rewrote ProfilePage with proper view mode showing all AC#2 fields including resolved LGA name, status badge, member since date, selfie support. Created dedicated `GET /users/profile` endpoint, `profile.api.ts`, and `useProfile` hook.
- **Task 5**: Built `ProfileEditForm` component with React Hook Form + Zod resolver. Extracted NIGERIAN_BANKS to shared `constants/nigerian-banks.ts`. Added `refreshUser()` to AuthContext for sidebar/header name sync after edit.
- **Task 6**: 31 total new tests — 4 service unit, 10 integration (GET+PATCH), 17 frontend (view/edit/loading/error states).

### Change Log

- Story 9.1 implementation — Fix /auth/me & editable profile (Date: 2026-04-05)
- Code review fixes — 8 issues (2H 5M 1L): selfie signed URL, return type, trim+refine validation, rate limiter, dead mock, File List update, refreshUser mock fixes (Date: 2026-04-05)

### File List

**New files:**
- `apps/api/src/services/user.service.ts` — UserService with getProfile + updateProfile
- `apps/api/src/services/__tests__/user.service.test.ts` — 4 unit tests
- `apps/api/src/__tests__/user.profile.test.ts` — 10 integration tests
- `apps/web/src/features/dashboard/api/profile.api.ts` — fetchProfile + updateProfile API
- `apps/web/src/features/dashboard/hooks/useProfile.ts` — useProfile + useUpdateProfile hooks
- `apps/web/src/features/dashboard/components/ProfileEditForm.tsx` — edit form with Zod validation
- `apps/web/src/features/dashboard/pages/__tests__/ProfilePage.test.tsx` — 17 frontend tests
- `apps/web/src/constants/nigerian-banks.ts` — shared bank list (extracted from BankDetailsStep)

**Modified files:**
- `apps/api/src/controllers/auth.controller.ts` — /auth/me queries DB for full user record
- `apps/api/src/controllers/user.controller.ts` — added getProfile + updateProfile methods
- `apps/api/src/routes/user.routes.ts` — added GET+PATCH /profile routes
- `apps/web/src/features/auth/api/auth.api.ts` — getCurrentUser returns full profile fields
- `apps/web/src/features/auth/context/AuthContext.tsx` — session restore uses real fullName/status, added refreshUser()
- `apps/web/src/features/dashboard/pages/ProfilePage.tsx` — full rewrite with view/edit modes
- `apps/web/src/features/auth/components/activation-wizard/steps/BankDetailsStep.tsx` — imports from shared banks constant
- `packages/types/src/validation/profile.ts` — added updateProfileSchema + UpdateProfilePayload
- `apps/api/src/__tests__/auth.login.test.ts` — updated /auth/me test to verify new fields
- `apps/web/src/features/dashboard/components/AssessorReviewActions.tsx` — replaced fragile useEffect+setTimeout focus pattern with Radix onOpenAutoFocus callback (unrelated cleanup, bundled)
- `apps/api/src/middleware/rate-limit.ts` — added profileUpdateRateLimit (10/min per user, code review fix M4)
- `apps/web/src/features/dashboard/__tests__/DashboardRedirect.test.tsx` — added refreshUser mock (code review fix M5)
- `apps/web/src/features/dashboard/__tests__/rbac-routes.test.tsx` — added refreshUser mock (code review fix M5)
- `apps/web/src/features/dashboard/pages/__tests__/PublicUserRbac.test.tsx` — added refreshUser mock (code review fix M5)
- `apps/web/src/layouts/__tests__/DashboardLayout.test.tsx` — added refreshUser mock (code review fix M5)
- `apps/web/src/layouts/components/MobileNav.test.tsx` — added refreshUser mock (code review fix M5)
- `apps/web/src/layouts/components/SmartCta.test.tsx` — added refreshUser mock (code review fix M5)
