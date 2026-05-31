# Story 9.32: Public-user account-settings page + NDPA data-subject rights

Status: ready-for-dev (POST-LAUNCH — NOT on critical path; ships when bandwidth allows)

<!--
Authored 2026-05-31 by Bob (SM) via canonical *create-story --yolo workflow,
on the same session as the Story 9-18 Part F amendment + Story 9-30 follow-up
work. Carved out of the original Story 9-18 monolithic "Option B (defer
auth-choice to post-registration)" framing.

ORIGIN: Story 9-18 AC#C3 retires the auth-choice fieldset from the wizard
(magic-link as universal default). The "Option B" branch of that decision
needed somewhere for users to OPT IN to password as an alternative auth
method post-registration. Putting that opt-in inside 9-18 grew that story's
scope significantly — the public-user dashboard at `/dashboard/public/*` is
mostly skeletal today; adding a "Login methods" section requires building
out a chunk of profile UI that doesn't exist yet. Splitting it out preserves
9-18's 8-12-day estimate AND co-locates the opt-in with other natural-fit
concerns (NDPA data-subject rights, profile view, account deletion).

SCOPE FRAMING: Public-user account self-service page. Three concerns:
  1. Login methods (Option B opt-in — add a password, magic-link stays default)
  2. NDPA data-subject rights (Article 12 — right of access; Article 17 —
     right to erasure; Article 20 — data portability)
  3. Profile view (read-only display of what we hold)

PRIORITY POSITION: Off the critical path locked 2026-05-31. Story 9-16 →
9-17 → 9-18 ship first; field deployment + Cohort A/B blasts follow; 9-32
ships afterward when capacity allows. NOT field-survey-blocking.

DEFERRED-FRIENDLY: This story can sit in `ready-for-dev` for weeks without
operational consequence. The wizard works perfectly without it (magic-link
is the universal default for public users). The NDPA-rights surface is
a strong recommendation but not strictly required for launch; the Operations
Manual + DSA template (Story 10-5) handle most of the compliance posture.
-->

## Story

As a **registered public user (post-wizard)**,
I want **a private account-settings page where I can (a) optionally add a password as an alternative to magic-link, (b) view what data we hold about me, and (c) exercise my NDPA data-subject rights (access / erasure / portability)**,
So that **the wizard stays minimal at registration time (magic-link by default), power users who prefer passwords have an opt-in path, and the platform meets the NDPA self-service expectations for data subjects without operator intervention for every routine request**.

## Background — why this story exists

### The "Option B" thread from 9-18 AC#C3

Story 9-18 retires the auth-choice fieldset from Step 5 of the wizard (per Awwal's 2026-05-12 directive "the 5th step would be the message"). Three options were debated:

- **Option A** (hard retire): magic-link only, no password ever
- **Option B** (defer choice): magic-link at registration, password opt-in later via profile
- **Option C** (soft retire): default magic-link, "More options" disclosure shows password

Awwal picked **Option B on 2026-05-31**. Implementation split: 9-18 implements the wizard half (Option A on the wizard surface). **This story (9-32) implements the post-registration half** — the place where users can opt into password as alternative auth.

### NDPA self-service co-location

Nigeria Data Protection Act 2023 grants data subjects three rights that need self-service surfaces:
- **Article 12** — right of access (subject can see what data is held)
- **Article 17** — right to erasure (subject can request deletion)
- **Article 20** — right to data portability (subject can export their record)

These belong on a profile / account-settings page — same surface as the Option B opt-in. Co-locating them avoids three separate features and folds them into the operationally-mature "log in to your account" experience.

### Public-user dashboard is currently skeletal

Per memory: `/dashboard/public/*` route exists but is mostly placeholder. This story builds out the first real page in that namespace.

## Acceptance Criteria

### Part A — Account-settings page surface

1. **AC#A1 — New route `/dashboard/public/account-settings`** (or similar — exact path can be `/account` if shorter; defer to dev agent at impl time). Mounts under the existing `PublicUserRoutes` group with `<DashboardLayout>` and `<ProtectedRoute allowedRoles={['public_user']}>`.

2. **AC#A2 — Three-section layout** (vertical card stack, top-to-bottom): "Login methods" / "Your data" / "Privacy controls". Each section is a `<Card>` from the shadcn/ui component library matching the visual language of the Super Admin Settings landing page from `prep-settings-landing-and-feature-flags`.

3. **AC#A3 — Navigation entry**: PublicUserDashboard sidebar (or top-nav, depending on the current layout pattern at impl time) gains an "Account" / "Settings" entry linking to the new route.

### Part B — Login methods (the Option B opt-in)

4. **AC#B1 — "Login methods" section lists active methods**: a table or list showing what auth methods the current user has active. Two possible rows: "Magic-link via [email@domain]" (always present; magic-link is canonical), and "Password" (present only if the user has set one).

5. **AC#B2 — "Add a password" button** (visible only when the user does NOT have a password set). Opens a small dialog: requires the current user's email (auto-filled), new password (with strength meter — reuse the pattern from `LoginPage.tsx` password input if available, else implement basic length-and-complexity gate matching the existing PasswordResetService validators), confirm-password. Submit → calls `POST /api/v1/auth/public/add-password` (new endpoint) with the user's JWT auth header + the proposed password. Backend hashes via bcrypt and writes to `users.password_hash` (the column already exists for the legacy hybrid model). Existing magic-link flow continues to work alongside.

6. **AC#B3 — "Remove password" button** (visible only when the user HAS a password set). Confirmation dialog: "You'll only be able to log in via magic-link after this. Are you sure?" Submit → `DELETE /api/v1/auth/public/password` (new endpoint) → sets `users.password_hash = NULL`. Magic-link still works.

7. **AC#B4 — Rate-limiting** on both endpoints: 3/hour per user account (matches password-reset rate-limit posture). Reuse the rate-limit middleware infrastructure from Story 9-9 AC#4.

8. **AC#B5 — Audit-logged**: `OPERATOR_PASSWORD_ADDED` / `OPERATOR_PASSWORD_REMOVED` audit actions (NEW; audit-action count bumps appropriately). Actor is the user themselves; principal-exclusive CHECK satisfied via `user_id` set, `consumer_id` null.

### Part C — Data subject rights (NDPA Articles 12/17/20)

9. **AC#C1 — "Your data" section** (Article 12 — right of access): displays a read-only view of the user's `respondents` row data — given name, family name (post-9-18 Part F backfill), NIN status (full NIN masked: "12345-XXXXX-1"), DOB, phone, email, LGA, registration date, completion status, consent flags. NO submissions row data shown here (those are the questionnaire answers which the user already submitted — operator decides whether to expose them or keep them opaque per NDPA scope debate; defer to Iris in counsel review).

10. **AC#C2 — "Export my data" button** (Article 20 — data portability): clicking the button generates a JSON file of the user's `respondents` row + their `submissions` row (raw_data included) + the canonical NDPA disclosure header, and triggers a browser download. New endpoint `GET /api/v1/auth/public/data-export` returns the JSON. Rate-limited 1/day per user. Audit-logged via `OPERATOR_DATA_EXPORT_USER_INITIATED`.

11. **AC#C3 — "Delete my registration" button** (Article 17 — right to erasure): clicking opens a confirmation dialog with the canonical NDPA-conformant copy (operator + counsel to draft). Confirm → soft-deletes the `respondents` + `submissions` rows (sets `status = 'erased'`, retains PII for 30 days for fraud-window, then a scheduled job hard-deletes after the retention window). New endpoint `POST /api/v1/auth/public/erase-registration`. Rate-limited 1/lifetime (the user can only erase once — operator must restore manually if they re-register). Audit-logged via `OPERATOR_USER_ERASURE_REQUESTED`. NEW respondents.status enum value `'erased'`; migration required.

12. **AC#C4 — Erasure has consequences disclosure** in the confirmation dialog: "Your registration will be deleted. We'll keep your data in encrypted form for 30 days in case of a fraud-investigation request, then permanently delete. You can re-register but you'll lose your matched training programs and history. This action cannot be undone."

13. **AC#C5 — Operator-side counter-controls**: a Super Admin sidebar entry "Erasure Requests" showing pending erasures, with the option to delay/cancel for fraud-investigation reasons (NDPA Article 17(3) allows retention for "legal claims"). Out of THIS story's scope; tracked as a follow-up Story 9-33 candidate.

### Part D — Tests + accessibility + zero regression

14. **AC#D1 — Component tests** for AccountSettingsPage rendering, LoginMethodsSection (add/remove password flows), YourDataSection (read-only display), PrivacyControlsSection (export + erase flows). Mock the auth state for each test (logged-in public user). Target: ~20 component tests.

15. **AC#D2 — Backend endpoint tests** for `add-password`, `remove-password`, `data-export`, `erase-registration`. Each tests happy path + rate-limit + auth-required + audit-event emission. ~15 backend tests.

16. **AC#D3 — Accessibility audit**: WCAG 2.1 AA on all dialogs (focus traps, ESC dismiss, aria labels for password strength meter). Erasure dialog gets extra scrutiny — "destructive action" requires clear semantic markup.

17. **AC#D4 — E2E happy-paths** in Playwright: public user logs in via magic-link → visits /dashboard/public/account-settings → adds a password → logs out → logs in via password → succeeds. Second spec: data-export downloads a JSON file with the right shape.

18. **AC#D5 — Zero regression** on existing public-user flows: wizard registration, RegistrationCompletePage, MagicLinkLandingPage, public marketplace browsing — none of these surfaces change.

## Tasks / Subtasks

- [ ] **Task 1: Pre-impl counsel review (NDPA scope alignment)**
  - [ ] 1.1: Iris (legal persona) reviews the NDPA-rights AC set. Particularly: does "data export" include submissions.raw_data (questionnaire answers), or only the respondents row? Does erasure scope cover audit_logs (almost certainly NO — chain integrity), submissions only, or respondents + submissions?
  - [ ] 1.2: Confirm the 30-day retention window in AC#C3 is appropriate per Iris's read of NDPA + Section 6 fraud-investigation provisions.
  - [ ] 1.3: Document counsel decisions in this story's Dev Notes "Counsel Decision Log" subsection before any dev work.

- [ ] **Task 2: Account-settings page surface (AC: #A1, #A2, #A3)**
  - [ ] 2.1: New route + layout per AC#A1.
  - [ ] 2.2: Three-section card stack per AC#A2.
  - [ ] 2.3: Navigation entry per AC#A3.

- [ ] **Task 3: Login methods (Option B opt-in) (AC: #B1, #B2, #B3, #B4, #B5)**
  - [ ] 3.1: Backend — new endpoints `add-password` + `remove-password` with rate-limit + audit middleware + tests.
  - [ ] 3.2: Frontend — LoginMethodsSection component + add/remove dialogs + password strength meter.
  - [ ] 3.3: Audit-action enum additions (OPERATOR_PASSWORD_ADDED + OPERATOR_PASSWORD_REMOVED).

- [ ] **Task 4: NDPA rights — Your Data (AC: #C1)**
  - [ ] 4.1: YourDataSection component reading respondents row + masked-NIN renderer.

- [ ] **Task 5: NDPA rights — Export (AC: #C2)**
  - [ ] 5.1: Backend `GET /auth/public/data-export` endpoint with rate-limit + audit + JSON payload shape.
  - [ ] 5.2: Frontend download trigger + filename + browser handling.

- [ ] **Task 6: NDPA rights — Erasure (AC: #C3, #C4)**
  - [ ] 6.1: Schema migration: respondents.status enum + 'erased' value.
  - [ ] 6.2: Backend `POST /auth/public/erase-registration` endpoint + soft-delete logic + 30-day retention scheduled-deletion worker.
  - [ ] 6.3: Frontend erasure dialog + canonical disclosure copy (counsel-reviewed per Task 1).
  - [ ] 6.4: Audit event `OPERATOR_USER_ERASURE_REQUESTED`.

- [ ] **Task 7: Tests (AC: #D1, #D2, #D3, #D4, #D5)**
  - [ ] 7.1: Component tests per AC#D1.
  - [ ] 7.2: Backend endpoint tests per AC#D2.
  - [ ] 7.3: Accessibility audit per AC#D3.
  - [ ] 7.4: Playwright E2E specs per AC#D4.
  - [ ] 7.5: Regression smoke per AC#D5.

- [ ] **Task 8: Sprint-status + memory + handoff**
  - [ ] 8.1: Update sprint-status.yaml (this story → in-progress at dev start; → review at dev end).
  - [ ] 8.2: Update MEMORY.md to reflect Option B fully realized (wizard half via 9-18, profile half via this story).
  - [ ] 8.3: Flag Story 9-33 candidate (operator-side erasure-request counter-controls) for future authoring.

- [ ] **Task 9: Pre-merge review (BMAD code-review workflow on uncommitted tree)**
  - [ ] 9.1: Per project feedback "review-before-commit": run the canonical `/bmad:bmm:workflows:code-review` workflow on the uncommitted working tree before commit. Auto-fix findings per established discipline.

## Dev Notes

### Why 9-32 is OFF the critical path

The reframed 2026-05-31 sequencing locks the wizard-redesign-arc as 9-16 → 9-17 → 9-18 → field deployment + blasts → 9-32. The reasoning: 9-32 doesn't affect the wizard friction that empirically causes 81% of stalls (Steps 4-5). A user who registers via the wizard succeeds without ever needing 9-32. The opt-in to password + NDPA self-service are improvements, not blockers.

### Counsel-review timing

Task 1's counsel review SHOULD happen early but doesn't gate the wizard work. Iris can review the scope on a parallel track while 9-16/9-17/9-18 dev proceeds. By the time 9-32 dev starts, the counsel decisions should be in hand.

### NDPA Article 17 nuances

The "right to erasure" has carve-outs in NDPA Section 26: data may be retained for "legal claims" (Article 17(3)) and "compliance with legal obligations" (Article 17(1)(c)). The 30-day retention window in AC#C3 is intended to satisfy "legal claims" without violating the spirit of erasure. Iris validates the exact window length.

### Why not extend Story 9-22 (operator-db-audit) instead

Story 9-22 is operator-driven (super-admin manually modifying user records). 9-32 is USER-driven (data subject self-service). Different actor model, different audit principal (`user_id` for 9-32 events; `actor_id` for 9-22 events). Should NOT be conflated.

### Project Structure Notes

Aligns with feature-based frontend organization. New feature dir: `apps/web/src/features/account-settings/` with `pages/`, `components/`, `api/`, `hooks/` subdirs per the canonical convention.

### References

- [Source: _bmad-output/implementation-artifacts/9-18-wizard-nin-first-and-summary-save.md § "AC#C3 — Auth-choice retires"] — Option B decision origin
- [Source: _bmad-output/implementation-artifacts/prep-settings-landing-and-feature-flags.md] — admin settings landing pattern to mirror visually
- [Source: docs/legal/] — DSA template + SOP runbook (Story 10-5 outputs) — context for NDPA conformance posture

## Dev Agent Record

### Agent Model Used

(to be populated by dev-story)

### Counsel Decision Log

(to be populated by Task 1)

### Debug Log References

(to be populated)

### Completion Notes List

(to be populated)

### File List

(to be populated — expected new feature dir + ~3 new endpoints + 1 schema migration)

### Review Follow-ups (AI)

(to be populated post-code-review)
