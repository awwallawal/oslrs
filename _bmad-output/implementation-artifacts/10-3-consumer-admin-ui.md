# Story 10.3: Consumer Admin UI

Status: ready-for-dev

<!--
Created 2026-04-25 by impostor-SM agent per SCP-2026-04-22 §A.5.

Frontend 3-tab wizard for super-admin to provision/edit/inspect API consumers. Uses Sally's ApiConsumerScopeEditor + LawfulBasisSelector components.

Sources:
  • PRD V8.3 FR24
  • Architecture Decision 3.4 + ADR-019 (DSA precondition for read_pii)
  • UX Custom Components #16 ApiConsumerScopeEditor + #17 LawfulBasisSelector + Journey 7 (API Consumer Provisioning) + Rate Limiting UX Patterns 1-3 (quota visibility surface)
  • Epics.md §Story 10.3

Depends on Story 10-1 (service layer) + Story 10-2 (quota state) + Story 10-5 (DSA template) + Story 9-12 (WizardStepIndicator).

Validation pass 2026-04-30 (Bob, fresh-context mode 2 per `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`): rebuilt to canonical template; URL bug fixed throughout (`/dashboard/admin/consumers` → `/dashboard/super-admin/consumers` matching `roleRouteMap` at `sidebarConfig.ts:60-68`); sidebar position aspirational reconciled (story v1 said "before Verification Queue" — no such item exists in actual super_admin sidebar; pinned to "after Audit Log + Settings cluster" since this is admin tooling); LawfulBasisSelector ownership coordinated with Story 11-3 (whichever ships first authors at shared location); WizardStepIndicator import path pinned to Story 9-12 retrofit's location.
-->

## Story

As a **Super Admin onboarding a new partner-API consumer**,
I want **a 3-tab UI (Identity → Access → Permissions) with dry-run summary modal before any DB write, token-displayed-once screen with copy-to-clipboard + browser-back warning, and a per-consumer activity drawer showing quota usage**,
so that **I can provision a fully-scoped consumer in <5 minutes without psql, with the DSA precondition for `submissions:read_pii` enforced at the UI layer (defence in depth alongside service layer), and the once-displayed-token has a copy-prompt friction sufficient to prevent accidental token loss**.

## Acceptance Criteria

1. **AC#1 — Sidebar nav item API Consumers:** Add to `apps/web/src/features/dashboard/config/sidebarConfig.ts:142-156` super_admin array per Sally's Navigation Patterns spec. Position: in the admin-tooling cluster — after Audit Log (Story 9-11) + Settings (prep-settings-landing) which are appended to the end of the array. Specifically: after Settings, before any future entries. Coordination: insertions are commutative within the array; rebase on merge with concurrent additions from Stories 9-11, 11-3, 10-6, prep-settings-landing. Super-admin only (gated at menu-config level since the entry lives in the `super_admin` keyed array). Icon: Lucide `Server` or `Users` (Sally to confirm in implementation pass — `Server` is closer to "machine consumer" semantics).

2. **AC#2 — Routes** (corrected from story v1's `/dashboard/admin/consumers` — that pattern doesn't match `roleRouteMap` at `sidebarConfig.ts:60-68`; every super-admin URL uses `/dashboard/super-admin/X`):
   - `/dashboard/super-admin/consumers` — list view (default landing)
   - `/dashboard/super-admin/consumers/new` — 3-tab create wizard
   - `/dashboard/super-admin/consumers/:id` — detail page (edit + activity drawer + key history)
   - `/dashboard/super-admin/consumers/:id/keys/:keyId` — key detail (rotation, revocation actions)
   - All super-admin gated via existing role-isolated route pattern

3. **AC#3 — List view (`/dashboard/super-admin/consumers`):** Table with columns:
   - Name + organisation_type badge (icon)
   - Contact email
   - DSA on file? (✓ icon if `dsa_document_url IS NOT NULL`)
   - Active scopes count
   - Last activity (last `api_keys.last_used_at` across consumer's keys)
   - Status badge (active / suspended / terminated)
   - Actions: View / Edit / Suspend (super-admin only)
   - Sortable + paginated
   - Filter: status + has-PII-scope + organisation_type

4. **AC#4 — Create wizard (`/dashboard/super-admin/consumers/new`) — 3-tab using `WizardStepIndicator`** (component path: `apps/web/src/features/registration/components/WizardStepIndicator.tsx` from Story 9-12 retrofit):

   **Tab 1 — Identity:**
   - Consumer name (required)
   - Organisation type (required dropdown: Federal MDA / State MDA / Research Institution / Other)
   - Primary technical contact email (required, with email-typo detection per `prep-input-sanitisation-layer` `EmailTypoDetection` component reference + Sally's Form Pattern)
   - Description (optional, 500 chars)
   - DSA upload (optional at this step but **required before assigning `submissions:read_pii` in Tab 3** — drives Tab 3 enforcement):
     - File picker (PDF only, ≤5MB)
     - Uploaded file shown with name + uploaded date + Replace / Remove affordances
     - Server: stores in DigitalOcean Spaces; reference recorded in `api_consumers.dsa_document_url` (table created by Story 10-1)
   - Lawful basis (required): uses `LawfulBasisSelector` component (#17) in `api_consumer` context

   **Tab 2 — Access:**
   - API key name (required, e.g. `itf-supa-prod-2026-04`): human label for admin identification
   - Key rotation cadence dropdown: 30d / 60d / 90d / **180d (default per NFR10)** / 365d
   - Initial expiry display (read-only): `now + rotation cadence`
   - IP allowlist (optional, multi-input):
     - Add CIDR button → adds row
     - Validation: each entry must be valid CIDR (e.g. `203.0.113.42/32` or `203.0.113.0/24`)
     - Empty = no restriction; show warning copy "Without an IP allowlist, this key works from anywhere on the public internet. Consider adding allowlist for production consumers."
   - Rotation overlap window display (read-only): "7-day overlap when key rotates"

   **Tab 3 — Permissions:**
   - Render one `ApiConsumerScopeEditor` (component #16) row per available scope (5 scopes per Decision 3.4)
   - For each enabled scope: optional expiry, optional LGA-scoping (multi-select from 33 Oyo LGAs)
   - **DSA precondition gate** (per AC#7 below): `submissions:read_pii` row disabled with warning block when `consumer.dsa_document_url IS NULL`
   - Per-scope rate-limit override (per Story 10-2 AC#4): optional `per_minute_limit`, `daily_quota`, `monthly_quota` inputs (null = use defaults)
   - "Grant all scopes" / "Revoke all scopes" bulk affordances at the top (with confirmation modal per Sally's spec)

5. **AC#5 — Dry-run summary modal (per Sally's Journey 7 Step 4):**
   - On Save click (any tab — wizard supports save-from-any-tab if all tabs have valid data; otherwise prompts to complete missing tabs)
   - Modal pre-commit confirmation per Sally's wireframe
   - Lists every per-scope grant + rotation cadence + IP allowlist + DSA reference + lawful basis
   - Token-display warning: "The plaintext token will be displayed exactly once on the next screen. Make sure you have a way to copy it (clipboard, password manager) before you click Confirm."
   - Actions: [← Edit details] / [Confirm and Create]
   - On confirm: POST to provisioning endpoint per Story 10-1 service layer (`apps/api/src/services/api-key.service.ts:provisionKey`)

6. **AC#6 — Token-displayed-once screen (per Sally's Journey 7 Step 5):**
   - On successful provisioning response, lands here
   - Displays plaintext token in `<code>` block monospace
   - "Copy to clipboard" button → triggers `navigator.clipboard.writeText`; toast confirms "Token copied to clipboard"
   - Warning copy: "⚠ This token will not be retrievable from the database. If you leave this page without copying, you'll need to rotate the key (which generates a new token)."
   - "Where to deliver the token" guidance (per Story 10-5 SOP):
     - Send via PGP-encrypted email to `<consumer contact email>`
     - Or arrange in-person handoff per DSA delivery clause
   - Continue button labelled "I have copied the token — Continue to Consumer Detail →" (explicit acknowledgement)
   - Browser-back warning: if operator clicks browser back/refresh, modal "If you leave now, you'll need to rotate the key to regenerate the token. Continue anyway?" — preserves token until explicit acknowledgement
   - On unmount: clear plaintext from React state immediately (security; per NFR10)
   - HTTP cache headers on the provisioning response: `Cache-Control: no-store, no-cache, must-revalidate` to prevent browser cache leak

7. **AC#7 — DSA precondition enforcement (UI layer + service layer per defence in depth):**
   - Tab 3 `ApiConsumerScopeEditor` for `submissions:read_pii`:
     - Checkbox disabled when `consumer.dsa_document_url IS NULL`
     - Warning block visible: per Sally's Component #16 spec — "⚠ This consumer has no DSA on file. You cannot enable this scope until a signed Data-Sharing Agreement is uploaded on the Identity tab. [Upload DSA →]" with inline link to switch to Tab 1
     - Attempting to check the disabled checkbox shows toast "Upload a signed DSA on the Identity tab to enable this scope"
   - Service layer (Story 10-1 AC#7) ALSO enforces — UI gate alone is insufficient (a sufficiently determined admin could craft a request bypassing the UI). Defence in depth.

8. **AC#8 — Per-consumer activity drawer (`/dashboard/super-admin/consumers/:id`):**
   - Drawer or section with quota visibility per Sally's Pattern 2:
     - Per-scope row: progress bar showing daily quota usage with threshold colours (0-70% Success, 70-85% Warning, 85-100% Warning-700, 100% Error)
     - Resets at midnight UTC indicator
     - Click row → drawer with last 7 days sparkline + per-hour breakdown for today
   - Last 7 days request volume time-series (sparkline using recharts — matches Story 10-6 charting library choice)
   - Recent rate-limit-rejection events (deep-linked to Story 9-11 audit log filtered to this consumer if 9-11 is shipped — `/dashboard/super-admin/audit-log?actor_type=consumer&actor_id=<id>`; inline fallback if not)
   - Data source: Story 10-2 `GET /api/v1/partner/quota?consumer_id=<id>` endpoint (super-admin-authenticated)

9. **AC#9 — Edit consumer flow:**
   - From detail page: "Edit Consumer" button reuses the 3-tab wizard with pre-filled values
   - Save → dry-run summary modal showing diff (added/removed scopes; changed limits; etc.) per Sally's Journey 7 Step 4
   - Removing a scope on existing consumer triggers confirmation: "This will revoke the consumer's access to this scope effective immediately. Continue?"
   - Lawful basis change requires justification (textarea required if changing from `data_sharing_agreement` to anything else)

10. **AC#10 — Suspend / Terminate flows:**
    - Suspend: sets `consumer.status = 'suspended'`; all keys remain valid but admin sees suspended state in list/detail; reversible
    - Terminate: per Story 10-5 AC#6 termination procedure — sets `status = 'terminated'`; all keys revoked (server-side `revoked_at = now()`); audit-logged with reason; partner notified
    - Both require confirmation modal with reason textarea (required, min 20 chars)
    - Termination is NOT immediately reversible — show warning explicitly

11. **AC#11 — Tests:**
    - Component tests: `ApiConsumerScopeEditor` (each scope, DSA-required gate, LGA multi-select); list table; create wizard
    - Integration tests: full create wizard happy path with mocked API; DSA upload + scope assignment; dry-run summary modal; token-displayed-once with browser-back warning
    - E2E test: super-admin creates consumer "Test Partner" with `aggregated_stats:read` scope → token displayed → copy → consumer detail page shows quota at 0
    - DSA-required UI gate test: select PII scope without DSA → checkbox disabled + warning visible
    - Existing 4,191-test baseline maintained or grown

## Tasks / Subtasks

- [ ] **Task 1 — Sidebar + routing** (AC: #1, #2)
  - [ ] 1.1 Add API Consumers nav item to `apps/web/src/features/dashboard/config/sidebarConfig.ts:142-156` super_admin array. Position: append to end of array (after Audit Log + Settings cluster); coordinate with concurrent additions from Stories 9-11, 11-3, 10-6, prep-settings-landing per Story 9-11 retrofit Task 3.1 commutative-insertions note
  - [ ] 1.2 Add routes to TanStack Router config: `/dashboard/super-admin/consumers`, `/dashboard/super-admin/consumers/new`, `/dashboard/super-admin/consumers/:id`, `/dashboard/super-admin/consumers/:id/keys/:keyId`
  - [ ] 1.3 Auth guards: super-admin only via existing role-isolated route pattern

- [ ] **Task 2 — List view** (AC: #3)
  - [ ] 2.1 New page `apps/web/src/features/admin-consumers/pages/ConsumersListPage.tsx` (NEW feature directory `apps/web/src/features/admin-consumers/`; mirrors Wave 1/2/3 precedent — `registration/`, `audit-log/`, `settings/`, `admin-imports/`)
  - [ ] 2.2 shadcn/ui DataTable with sortable columns + filters + pagination
  - [ ] 2.3 TanStack Query hook `useConsumers` at `apps/web/src/features/admin-consumers/api/consumers.api.ts` (consumes existing `apiClient` at `apps/web/src/lib/api-client.ts:31`)

- [ ] **Task 3 — Create wizard shell** (AC: #4 outer)
  - [ ] 3.1 New page `apps/web/src/features/admin-consumers/pages/ConsumerWizardPage.tsx`
  - [ ] 3.2 WizardLayout reuse from Story 9-12 (`apps/web/src/layouts/WizardLayout.tsx`)
  - [ ] 3.3 Tab navigation with Continue/Back; URL-routed tab number (`?tab=1` etc.)

- [ ] **Task 4 — Tab 1 Identity** (AC: #4 Tab 1)
  - [ ] 4.1 Form with name + org-type + email + description + DSA upload + lawful basis
  - [ ] 4.2 Email-typo detection: import `EmailTypoDetection` component from Story 9-12 (`apps/web/src/features/registration/components/EmailTypoDetection.tsx`) — cross-feature reuse
  - [ ] 4.3 DSA upload component: file picker + S3 upload (existing DO Spaces SDK pattern — see MEMORY.md "Backup storage is DO Spaces"; bucket may be the same `oslsr-media` or a separate `oslsr-legal`) + reference storage in `api_consumers.dsa_document_url`
  - [ ] 4.4 `LawfulBasisSelector` component (Sally #17) — see Task 6.1 below for ownership decision

- [ ] **Task 5 — Tab 2 Access** (AC: #4 Tab 2)
  - [ ] 5.1 Form with key name + rotation cadence + IP allowlist (multi-input with CIDR validation) + display read-only fields
  - [ ] 5.2 CIDR validation utility — use a published CIDR validator (e.g. `ip-cidr` npm or similar small lib)

- [ ] **Task 6 — Tab 3 Permissions + ApiConsumerScopeEditor** (AC: #4 Tab 3, #7)
  - [ ] 6.1 `LawfulBasisSelector` component (Sally #17) — **OWNERSHIP COORDINATION:** also referenced by Story 11-3 retrofit. Whichever story ships first authors the component at the shared location `apps/web/src/components/LawfulBasisSelector.tsx` (shared component dir, peer of `SourceBadge.tsx` from Story 11-4); the second story imports. Per dependency order: this story (10-3) ships AFTER 10-1+10-2; Story 11-3 ships AFTER 9-12+11-2. Likely order: 11-3 ships first (Wave 3), 10-3 second (Wave 4). If so: 11-3 authors at `apps/web/src/components/LawfulBasisSelector.tsx`; this story imports.
  - [ ] 6.2 `ApiConsumerScopeEditor` component (Sally #16) — author at `apps/web/src/features/admin-consumers/components/ApiConsumerScopeEditor.tsx` (feature-local; this story is the only consumer)
  - [ ] 6.3 Per-scope row with checkbox + expiry + LGA multi-select + DSA-required warning block
  - [ ] 6.4 Per-scope rate-limit override inputs (consumes Story 10-2 AC#4 `api_key_scopes` columns)
  - [ ] 6.5 Bulk grant/revoke affordances with confirmation
  - [ ] 6.6 DSA precondition gate per AC#7

- [ ] **Task 7 — Dry-run summary modal** (AC: #5)
  - [ ] 7.1 `apps/web/src/features/admin-consumers/components/DryRunSummaryModal.tsx`
  - [ ] 7.2 Renders per-scope grant + rotation + IP allowlist + DSA reference + lawful basis
  - [ ] 7.3 Edit details / Confirm actions

- [ ] **Task 8 — Token-displayed-once screen** (AC: #6)
  - [ ] 8.1 `apps/web/src/features/admin-consumers/pages/TokenDisplayPage.tsx`
  - [ ] 8.2 Plaintext display in monospace block
  - [ ] 8.3 Copy-to-clipboard button (uses `navigator.clipboard.writeText`)
  - [ ] 8.4 Warning copy + delivery guidance
  - [ ] 8.5 Browser-back warning via `beforeunload` event handler
  - [ ] 8.6 Clear plaintext from React state on unmount (security; per NFR10)
  - [ ] 8.7 Server-side: ensure provisioning response has `Cache-Control: no-store, no-cache, must-revalidate` headers (modify Story 10-1 `api-key.service.ts` provisioning response if not already set)

- [ ] **Task 9 — Edit consumer** (AC: #9)
  - [ ] 9.1 Edit button on detail page → reuse wizard with pre-filled values
  - [ ] 9.2 Diff calculation in dry-run summary
  - [ ] 9.3 Scope-removal confirmation
  - [ ] 9.4 Lawful-basis-change justification

- [ ] **Task 10 — Suspend / Terminate** (AC: #10)
  - [ ] 10.1 Suspend: `PATCH /api/v1/admin/consumers/:id` with `status: 'suspended'` (new admin endpoint — author here since this story owns the consumer admin surface)
  - [ ] 10.2 Terminate: `POST /api/v1/admin/consumers/:id/terminate` with reason — backend revokes all keys + audit-logs via `AuditService.logAction({ action: 'consumer.terminated', ... })`; add `CONSUMER_TERMINATED: 'consumer.terminated'` + `CONSUMER_SUSPENDED: 'consumer.suspended'` to `AUDIT_ACTIONS` const at `apps/api/src/services/audit.service.ts:35-64`
  - [ ] 10.3 Backend route file: `apps/api/src/routes/consumers.routes.ts` (NEW flat file under `routes/`; matches existing flat-file convention — NOT `routes/admin/consumers.routes.ts` subdirectory; partner/ subdir from Story 10-1 was the deliberate exception)
  - [ ] 10.4 Confirmation modals per AC#10

- [ ] **Task 11 — Per-consumer activity drawer** (AC: #8)
  - [ ] 11.1 Quota visibility component using Story 10-2 `GET /api/v1/partner/quota?consumer_id=X` endpoint
  - [ ] 11.2 Per-scope progress bars with threshold colours
  - [ ] 11.3 7-day sparkline using `recharts` (matches Story 10-6 charting library choice)
  - [ ] 11.4 Recent rate-limit-rejection events: deep-link to Story 9-11 audit viewer at `/dashboard/super-admin/audit-log?actor_type=consumer&actor_id=<id>` if 9-11 shipped; inline fallback list if not (matches Story 11-3 audit-trail two-path pattern)

- [ ] **Task 12 — Tests** (AC: #11)
  - [ ] 12.1 Comprehensive tests per AC#11
  - [ ] 12.2 Run `pnpm test` from root — verify baseline 4,191 + new tests
  - [ ] 12.3 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: `10-3-consumer-admin-ui: in-progress` → `review` → `done`

- [ ] **Task 13 — Code review** (cross-cutting AC: all)
  - [ ] 13.1 Run `/bmad:bmm:workflows:code-review` on the uncommitted working tree (per the existing "code review before commit" project pattern in MEMORY.md `feedback_review_before_commit.md`)
  - [ ] 13.2 Auto-fix all High/Medium severity findings; document Low-severity deferrals in Review Follow-ups (AI)
  - [ ] 13.3 Only after code review passes, commit and mark status `review`

## Dev Notes

### Dependencies

- **Story 10-1 (HARD)** — service layer (`apps/api/src/services/api-key.service.ts:provisionKey`, `rotateKey`); `api_consumers` table (`apps/api/src/db/schema/api-consumers.ts`); `api_keys` + `api_key_scopes` tables; admin-only auth pattern
- **Story 10-2 (HARD)** — per-consumer rate-limit + quota visibility endpoint (`GET /api/v1/partner/quota`) for AC#8 activity drawer + AC#4 Tab 3 per-scope override columns (`per_minute_limit`, `daily_quota`, `monthly_quota` on `api_key_scopes`)
- **Story 10-5 (HARD for PII scope path)** — DSA template existence (the actual PDF file at `docs/legal/data-sharing-agreement-template-v1.pdf`) is a Tab-1-upload prerequisite; without 10-5, admin has no DSA to upload
- **Story 9-12 `WizardStepIndicator` component (HARD for Tab navigation)** — at `apps/web/src/features/registration/components/WizardStepIndicator.tsx`; Story 11-3 also depends on this
- **prep-input-sanitisation-layer (PREFERRED — for Tab 1 email-typo detection)** — `EmailTypoDetection` component from Story 9-12 (`apps/web/src/features/registration/components/EmailTypoDetection.tsx`); reuses normaliser dictionary
- **Story 9-11 (PREFERRED for AC#8 deep-link)** — audit log viewer; inline fallback if not shipped
- **Sally's Custom Components #16 + #17** — UI specs

**Unblocks:**
- Story 10-4 (Developer Portal) — admin UI for "request access" form approval reuses some patterns; consumer detail page is the destination after a request is approved
- Story 10-6 (Consumer Audit Dashboard) — Consumer Detail page is where the "View Audit Dashboard" link lives

### Field Readiness Certificate Impact

**Tier B / post-field.**

### Why dry-run summary modal vs immediate save

Per Sally's Journey 7: provisioning has long-lived, hard-to-undo consequences (a leaked PII-scope token can take time to detect and rotate). A friction step at the moment of creation is intentional protection. The dry-run modal makes the operator pause and read what they're about to do.

### Why token-displayed-once screen has explicit "I have copied" button (not just "Continue")

Naming the action ("I have copied the token") forces conscious acknowledgement. A bare "Continue" button can be clicked reflexively, leaving the operator without the token. The explicit phrasing is a UX honeypot for accidental clicks.

### Why DSA precondition is enforced at BOTH UI and service layers

UI gate (this story AC#7): admin can't even check the box, so won't accidentally try to provision PII without DSA.

Service gate (Story 10-1 AC#7): even if a determined admin bypasses the UI (e.g. by sending a hand-crafted curl request), the server rejects with `409 DSA_REQUIRED`.

This is defence in depth. Either layer alone is insufficient for NDPA-grade compliance posture.

### Why React state clears on unmount in token-display

Plaintext token in browser memory is a low-but-non-zero risk surface (memory dump, extension JS access). Clearing on unmount minimises the window. Belt + braces with the browser-back warning + Cache-Control no-store header per Task 8.7.

### Why per-scope grant has expiry as optional

Default: no expiry (scope active until consumer terminated). For sensitive scopes (PII) or short-term partnerships, admin can set explicit expiry per scope. Use case: "ITF-SUPA gets `submissions:read_pii` for 6 months while we negotiate full DSA renewal."

### Why CIDR validation client-side

Preventing the form from submitting invalid CIDR is a UX win (faster feedback). Server-side re-validates regardless. Use a published CIDR validator (`ip-cidr` npm or similar small lib).

### Why bulk grant/revoke requires confirmation

Per Sally's spec — destructive bulk actions need a friction step. "Revoke all scopes" is a one-click way to make a consumer's API calls suddenly fail; confirmation prevents the "oops".

### LawfulBasisSelector cross-story coordination

The component is referenced by both Story 11-3 (Admin Import UI) and this story (Consumer Admin UI). Whichever story ships first authors the component at the shared location `apps/web/src/components/LawfulBasisSelector.tsx`; the second imports.

Per Wave dependency order: Story 11-3 (Wave 3) likely ships before 10-3 (Wave 4) — so 11-3 authors. If sequence flips: this story (10-3) authors. Coordinate via sprint-status.

### Risks

1. **DSA upload to S3 may fail.** DigitalOcean Spaces can reject large uploads or have quotas. Mitigation: client-side 5MB cap; server-side timeout handling with retry; failed uploads surface clear error.
2. **Token-display screen may be cached by browser.** If the operator clicks back and the page renders from cache showing the plaintext token, security risk. Mitigation: `Cache-Control: no-store, no-cache, must-revalidate` headers on the provisioning response (Task 8.7); React-router state-only rendering (token not in URL).
3. **Per-consumer activity drawer queries may be slow.** Aggregating 7 days of audit_logs per consumer at scale could exceed 250ms. Mitigation: per Story 10-2 quota visibility endpoint is cacheable (30s); audit-log aggregations leverage Story 9-11 composite indexes per AC#10 of 9-11.
4. **Lawful-basis change confusion.** If admin changes from `data_sharing_agreement` to `ndpa_6_1_e` (Public Interest), what happens to existing PII scope? Mitigation: AC#9 requires justification textarea on lawful-basis change; super-admin manually decides whether to also revoke PII scope (no auto-revoke — preserves admin agency).
5. **Suspend vs Terminate confusion.** Operator might "Suspend" expecting a hard-revoke. Mitigation: AC#10 confirmation modals explicitly contrast the two ("Suspend = reversible status flag; keys remain valid. Terminate = irreversible; all keys revoked.").
6. **Sidebar position aspirational.** Story v1's "before Verification Queue" placement references a non-existent sidebar item. Mitigation: pinned to "after Settings + Audit Log cluster" — admin tooling cluster at end of array; Sally final review during impl.
7. **LawfulBasisSelector ownership timing.** If 10-3 and 11-3 ship in parallel rather than sequentially, both might author the component. Mitigation: shared-location convention (`apps/web/src/components/`) makes both authors converge; sprint-status comment block resolves ambiguity.

### Project Structure Notes

- **NEW feature directory** `apps/web/src/features/admin-consumers/` with `pages/`, `components/`, `api/` subdirs. Mirrors Wave 1/2/3 precedent (`registration/`, `audit-log/`, `settings/`, `admin-imports/`). Substantial-enough surface (4 pages + 8+ components).
- **Sidebar coordination**: this story adds API Consumers; concurrent retrofits add Audit Log (9-11), Settings (prep-settings-landing), Import Data (11-3), and (later) Audit Dashboard sub-link from 10-6. All append to `super_admin` array; insertions commutative; rebase on merge. Coordinate with sprint-status comment block.
- **URL convention**: `/dashboard/super-admin/X` per `roleRouteMap` at `sidebarConfig.ts:60-68`. Story v1's `/dashboard/admin/X` was a typo — that pattern doesn't exist.
- **Cross-feature component reuse:**
  - `WizardStepIndicator` from Story 9-12 (`apps/web/src/features/registration/components/WizardStepIndicator.tsx`) — Tab navigation
  - `EmailTypoDetection` from Story 9-12 (`apps/web/src/features/registration/components/EmailTypoDetection.tsx`) — Tab 1 contact email
  - `LawfulBasisSelector` shared with Story 11-3 (path: `apps/web/src/components/LawfulBasisSelector.tsx` — author whichever story ships first)
  - `WizardLayout` from Story 9-12 (`apps/web/src/layouts/WizardLayout.tsx`)
- **Backend routes**: new flat file `apps/api/src/routes/consumers.routes.ts` (NOT subdirectory). Pattern matches existing flat files; `routes/partner/` subdir from Story 10-1 was the documented exception (5 sub-routers per scope justified subdir).
- **Backend services**: leverages Story 10-1's `apps/api/src/services/api-key.service.ts` for `provisionKey` + `rotateKey`. May need new service `apps/api/src/services/consumer.service.ts` for suspend/terminate flows (Task 10 backend).
- **Audit logging** via `AuditService.logAction()` for consumer lifecycle events; add new `AUDIT_ACTIONS` entries: `CONSUMER_SUSPENDED`, `CONSUMER_TERMINATED` (Task 10.2). Existing `API_KEY_PROVISIONED`, `API_KEY_ROTATED`, `API_KEY_REVOKED` from Story 10-1 already cover key-level events.
- **DSA upload storage**: DigitalOcean Spaces (per MEMORY.md "Backup storage is DO Spaces, not AWS" — uses S3 SDK with `forcePathStyle`; env vars `S3_*`). Decide bucket at impl time: extend existing `oslsr-media` bucket OR new `oslsr-legal` bucket for legal artefacts. Lean: extend existing with `dsa/` prefix.
- **Charting library**: `recharts` (verify in stack at impl time; if not, add to web package.json — also added by Story 10-6 if they ship in parallel).
- **TanStack Query convention** — feature-level api file at `apps/web/src/features/admin-consumers/api/consumers.api.ts`; hooks named `useConsumers`, `useConsumer`, `useCreateConsumer`, `useUpdateConsumer`, `useSuspendConsumer`, `useTerminateConsumer`, `useConsumerQuota`, etc.
- **Frontend HTTP client** is `apps/web/src/lib/api-client.ts:31` — fetch-based, throws `ApiError`. NO axios.
- **CSP discipline**: Story 9-7 enforces strict CSP. Avoid inline scripts in token-display page; use React state for plaintext token (cleared on unmount) — does NOT need `eval` or `new Function()`.
- **NEW directories created by this story:**
  - `apps/web/src/features/admin-consumers/` (with `pages/`, `components/`, `api/` subdirs)

### References

- Architecture Decision 3.4 (DSA precondition for `submissions:read_pii`): [Source: _bmad-output/planning-artifacts/architecture.md Decision 3.4]
- Architecture ADR-019 (consumer auth + DSA precondition): [Source: _bmad-output/planning-artifacts/architecture.md:3179]
- Epics — Story 10.3 entry: [Source: _bmad-output/planning-artifacts/epics.md Epic 10 §10.3]
- Story 10-1 (HARD — service layer + schema): [Source: _bmad-output/implementation-artifacts/10-1-consumer-auth-layer.md]
- Story 10-2 (HARD — quota endpoint + per-scope override columns): [Source: _bmad-output/implementation-artifacts/10-2-per-consumer-rate-limiting.md AC#4, AC#6]
- Story 10-5 (HARD for PII path — DSA template artefact): [Source: _bmad-output/implementation-artifacts/10-5-data-sharing-agreement-template.md AC#1]
- Story 9-12 `WizardStepIndicator` (HARD for Tab nav): [Source: apps/web/src/features/registration/components/WizardStepIndicator.tsx (created by Story 9-12 Task 4.2)]
- Story 9-12 `WizardLayout` (HARD for wizard chrome): [Source: apps/web/src/layouts/WizardLayout.tsx (created by Story 9-12 Task 4.1)]
- Story 9-12 `EmailTypoDetection` (PREFERRED for Tab 1): [Source: apps/web/src/features/registration/components/EmailTypoDetection.tsx (created by Story 9-12 Task 6.3)]
- Story 11-3 `LawfulBasisSelector` (shared component coordination): [Source: _bmad-output/implementation-artifacts/11-3-admin-import-ui.md Task 4.2]
- Story 9-11 audit viewer (PREFERRED for AC#8 deep-link): [Source: _bmad-output/implementation-artifacts/9-11-admin-audit-log-viewer.md AC#1]
- Sidebar config (URL convention + super_admin array placement): [Source: apps/web/src/features/dashboard/config/sidebarConfig.ts:60-68,142-156]
- Audit service `logAction` API (consumer lifecycle events): [Source: apps/api/src/services/audit.service.ts:226]
- Audit service `AUDIT_ACTIONS` const (extend with CONSUMER_SUSPENDED + CONSUMER_TERMINATED): [Source: apps/api/src/services/audit.service.ts:35-64]
- Web HTTP client (TanStack Query hooks): [Source: apps/web/src/lib/api-client.ts:31]
- Existing routes flat-file convention: [Source: apps/api/src/routes/audit.routes.ts, staff.routes.ts, etc.]
- DigitalOcean Spaces S3 pattern (DSA upload storage): [Source: MEMORY.md "Backup storage is DO Spaces, not AWS"]
- MEMORY.md key pattern: code review before commit: [Source: MEMORY.md "Process Patterns" + `feedback_review_before_commit.md`]
- MEMORY.md key pattern: integration tests use beforeAll/afterAll: [Source: MEMORY.md "Key Patterns"]

## Dev Agent Record

### Agent Model Used

_(Populated when story enters dev.)_

### Debug Log References

_(Populated during implementation.)_

### Completion Notes List

_(Populated during implementation. Implementer must include:)_

- Sidebar position final (post-merge with concurrent retrofits)
- LawfulBasisSelector authorship outcome (was 11-3 the author, or 10-3?)
- DSA upload bucket decision (extend `oslsr-media` with `dsa/` prefix vs new `oslsr-legal` bucket)
- Story 9-11 audit viewer status verified before AC#8 deep-link (Path A) vs inline fallback (Path B)
- recharts in stack confirmed (or added)
- Code review findings + fixes (cross-reference Review Follow-ups (AI) below)

### File List

**Created:**
- `apps/web/src/features/admin-consumers/pages/ConsumersListPage.tsx`
- `apps/web/src/features/admin-consumers/pages/ConsumerWizardPage.tsx`
- `apps/web/src/features/admin-consumers/pages/ConsumerDetailPage.tsx`
- `apps/web/src/features/admin-consumers/pages/TokenDisplayPage.tsx`
- `apps/web/src/features/admin-consumers/components/ApiConsumerScopeEditor.tsx` (per Sally #16; feature-local)
- `apps/web/src/features/admin-consumers/components/DryRunSummaryModal.tsx`
- `apps/web/src/features/admin-consumers/components/QuotaVisibilityDrawer.tsx`
- `apps/web/src/features/admin-consumers/components/IpAllowlistInput.tsx`
- `apps/web/src/features/admin-consumers/components/DsaUploadField.tsx`
- `apps/web/src/features/admin-consumers/api/consumers.api.ts` (TanStack Query hooks)
- `apps/api/src/routes/consumers.routes.ts` (NEW flat file under `routes/`; NOT subdirectory)
- `apps/api/src/services/consumer.service.ts` (NEW — for suspend/terminate flows)
- Tests
- Optionally `apps/web/src/components/LawfulBasisSelector.tsx` (per Sally #17 — shared with Story 11-3; only created here if 11-3 hasn't already)

**Modified:**
- `apps/web/src/features/dashboard/config/sidebarConfig.ts` — API Consumers nav item appended to `super_admin` array
- `apps/api/src/services/audit.service.ts` — extend `AUDIT_ACTIONS` const with `CONSUMER_SUSPENDED` + `CONSUMER_TERMINATED`
- `apps/api/src/routes/index.ts` — mount `consumers.routes.ts`
- TanStack Router config — register new routes
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

**Out of scope (explicitly NOT modified — happens upstream / downstream):**
- Service layer (`api-key.service.ts`) — owned by Story 10-1
- Quota endpoint — owned by Story 10-2
- Audit viewer — owned by Story 9-11
- DSA template artefact — owned by Story 10-5

### Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-04-25 | Story drafted by impostor-SM agent per SCP-2026-04-22 §A.5. Status `ready-for-dev`. 11 ACs covering sidebar nav + 3-tab create wizard + dry-run summary modal + token-displayed-once with browser-back warning + DSA precondition UI gate + per-consumer activity drawer + edit/suspend/terminate flows + tests. Depends on Story 10-1 service + Story 10-2 quota + Story 10-5 DSA template. | Operator surface for Epic 10. Without it, consumer provisioning requires direct DB writes — unsafe + inauditable. |
| 2026-04-30 | Validation pass (Bob, fresh-context mode 2 per `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`). Rebuilt to canonical template structure: folded top-level "Dependencies", "Field Readiness Certificate Impact", "Technical Notes" (preserving all 8 subsections — Why dry-run summary modal / Why explicit "I have copied" button / Why DSA precondition at BOTH layers / Why React state clears on unmount / Why per-scope expiry optional / Why CIDR validation client-side / Why bulk grant/revoke confirms / LawfulBasisSelector cross-story coordination), "Risks" under Dev Notes; converted task-as-headings to canonical `[ ] Task N (AC: #X)` checkbox format; added `### Project Structure Notes` subsection covering new feature dir + sidebar coordination + URL convention + cross-feature component reuse map (4 components from 9-12) + backend routes flat-file convention + DSA upload storage decision + charting library + TanStack Query naming + CSP discipline; added `### References` subsection with 18 verified `[Source: file:line]` cites; moved top-level `## Change Log` under `## Dev Agent Record`; added `### Review Follow-ups (AI)` placeholder; added Task 13 (code review) per `feedback_review_before_commit.md`. **URL bug fixed throughout:** all 4 routes corrected `/dashboard/admin/consumers` → `/dashboard/super-admin/consumers` (matches `roleRouteMap` at `sidebarConfig.ts:60-68`). **Sidebar position aspirational reconciled:** AC#1 + Task 1.1 + Risk #6 — story v1 "before Verification Queue" referenced non-existent sidebar item; pinned to "after Settings + Audit Log cluster" with commutative-insertion coordination note. **LawfulBasisSelector ownership coordinated** with Story 11-3: shared location `apps/web/src/components/LawfulBasisSelector.tsx`; whichever ships first authors. **3 cross-feature component reuse paths pinned** to Story 9-12 retrofit's actual locations (`WizardStepIndicator`, `WizardLayout`, `EmailTypoDetection`). **Routes file convention enforced:** `apps/api/src/routes/consumers.routes.ts` flat file (NOT `routes/admin/consumers.routes.ts` subdirectory — that pattern doesn't exist; `routes/partner/` subdir from Story 10-1 was the documented exception). **2 new audit actions documented** (`CONSUMER_SUSPENDED`, `CONSUMER_TERMINATED`). **AC#8 deep-link to Story 9-11** uses two-path approach (matches Story 11-3's audit-trail pattern). **DSA upload storage** flagged at impl time (extend `oslsr-media` vs new `oslsr-legal` per MEMORY.md DO Spaces pattern). All 11 ACs preserved verbatim. Status `ready-for-dev` preserved. | Story v1 was authored by impostor-SM agent without canonical workflow load — same drift pattern as 15 prior retrofits. URL bug + sidebar position aspirational + cross-story component coordination ambiguities resolved. Now wired correctly into Wave 0/1/2/3 retrofitted infrastructure. |

### Review Follow-ups (AI)

_(Populated by code-review agent during/after `dev-story` execution per Task 13.)_
