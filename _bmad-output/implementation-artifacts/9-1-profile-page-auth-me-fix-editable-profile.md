# Story 9.1: Profile Page — Fix /auth/me & Editable Profile

Status: ready-for-dev

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

- [ ] Task 1: Fix /auth/me endpoint (AC: #1)
  - [ ] 1.1 In `auth.controller.ts`, query DB for full user record by `req.user.sub` (use `db.select()` from users table)
  - [ ] 1.2 Return additional fields: `fullName`, `phone`, `status`, `lgaId`, `createdAt`
  - [ ] 1.3 Update `AuthContext.tsx` session restore (`restoreSession`) to populate `fullName` and `status` from `/auth/me` response
  - [ ] 1.4 Update `AuthUser` interface in `packages/types/src/auth.ts` if needed (already has `fullName` and `status`)
  - [ ] 1.5 Update `getCurrentUser()` in `auth.api.ts` to map the new fields

- [ ] Task 2: Create profile update schema (AC: #4, #5)
  - [ ] 2.1 Add `updateProfileSchema` to `packages/types/src/validation/profile.ts`
  - [ ] 2.2 Fields: `fullName` (string, min 1), `phone` (string, 11 digits, optional), `homeAddress` (string, min 5, optional), `nextOfKinName` (string, min 2, optional), `nextOfKinPhone` (string, min 10, optional), `bankName` (string, min 2, optional), `accountNumber` (string, 10 digits, optional), `accountName` (string, min 2, optional)
  - [ ] 2.3 Export `UpdateProfilePayload` type via `z.infer`
  - [ ] 2.4 Re-export from `packages/types/src/index.ts`

- [ ] Task 3: Create PATCH /users/profile endpoint (AC: #4, #7)
  - [ ] 3.1 Add `updateProfile` method to `user.controller.ts` — validate with `updateProfileSchema.safeParse(req.body)`, delegate to service
  - [ ] 3.2 Create `apps/api/src/services/user.service.ts` with `updateProfile(userId, data)` method
  - [ ] 3.3 In service: use `db.transaction()` with `SELECT FOR UPDATE` to prevent TOCTOU race on phone uniqueness
  - [ ] 3.4 In service: check phone uniqueness if phone is being updated (exclude current user)
  - [ ] 3.5 In service: call `AuditService.logAction()` with changed fields diff
  - [ ] 3.6 Add `PATCH /profile` route to `user.routes.ts` (behind `authenticate` middleware)
  - [ ] 3.7 Register route in `apps/api/src/routes/index.ts` if not already under `/users`

- [ ] Task 4: Build profile page view mode (AC: #2)
  - [ ] 4.1 Create `apps/web/src/features/dashboard/api/profile.api.ts` — `fetchProfile()` (can reuse `/auth/me`) and `updateProfile(data)` API functions
  - [ ] 4.2 Create `apps/web/src/features/dashboard/hooks/useProfile.ts` — `useUpdateProfile()` mutation hook with TanStack Query, toast feedback, cache invalidation
  - [ ] 4.3 Rewrite `ProfilePage.tsx` view mode: display all fields from AC#2, resolve LGA name (use existing LGA data or add to `/auth/me` response), show selfie if `liveSelfieOriginalUrl` exists, remove hardcoded "Active" status, remove placeholder text

- [ ] Task 5: Build profile edit form (AC: #3, #5, #6)
  - [ ] 5.1 Add edit mode state toggle to `ProfilePage.tsx` (view/edit via `useState`)
  - [ ] 5.2 Build inline edit form following activation wizard field patterns (same input styling, error display)
  - [ ] 5.3 Reuse `NIGERIAN_BANKS` constant from `apps/web/src/features/auth/components/activation-wizard/steps/BankDetailsStep.tsx` — extract to shared location if not already shared
  - [ ] 5.4 Client-side Zod validation matching server schema
  - [ ] 5.5 On save: call `useUpdateProfile().mutate()`, on success: toast + exit edit mode + re-sync AuthContext
  - [ ] 5.6 Re-sync AuthContext after save: call `getCurrentUser()` or refetch `/auth/me` to update sidebar/header name display

- [ ] Task 6: Tests (AC: #8)
  - [ ] 6.1 Backend: `apps/api/src/services/__tests__/user.service.test.ts` — partial update, phone uniqueness rejection, audit logging call, empty fullName rejection
  - [ ] 6.2 Backend: `apps/api/src/routes/__tests__/user.routes.test.ts` — PATCH /profile: 200 success, 401 unauthenticated, 400 validation errors, 409 duplicate phone
  - [ ] 6.3 Backend: test `/auth/me` returns new fields (update existing auth route tests)
  - [ ] 6.4 Frontend: ProfilePage renders all fields in view mode, edit button toggles form, form validation errors display, successful mutation returns to view mode with toast

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

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### Change Log

### File List
