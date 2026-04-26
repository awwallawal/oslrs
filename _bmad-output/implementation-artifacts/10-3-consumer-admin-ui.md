# Story 10.3: Consumer Admin UI

Status: ready-for-dev

<!--
Created 2026-04-25 by Bob (SM) per SCP-2026-04-22 §A.5.

Frontend 3-tab wizard for super-admin to provision/edit/inspect API consumers. Uses Sally's ApiConsumerScopeEditor + LawfulBasisSelector components.

Sources:
  • PRD V8.3 FR24
  • Architecture Decision 3.4 + ADR-019 (DSA precondition for read_pii)
  • UX Custom Components #16 ApiConsumerScopeEditor + #17 LawfulBasisSelector + Journey 7 (API Consumer Provisioning) + Rate Limiting UX Patterns 1-3 (quota visibility surface)
  • Epics.md §Story 10.3

Depends on Story 10-1 (service layer) + Story 10-2 (quota state).
-->

## Story

As a **Super Admin onboarding a new partner-API consumer**,
I want **a 3-tab UI (Identity → Access → Permissions) with dry-run summary modal before any DB write, token-displayed-once screen with copy-to-clipboard + browser-back warning, and a per-consumer activity drawer showing quota usage**,
so that **I can provision a fully-scoped consumer in <5 minutes without psql, with the DSA precondition for `submissions:read_pii` enforced at the UI layer (defence in depth alongside service layer), and the once-displayed-token has a copy-prompt friction sufficient to prevent accidental token loss**.

## Acceptance Criteria

1. **AC#1 — Sidebar nav item API Consumers:** Add to `apps/web/src/features/dashboard/config/sidebarConfig.ts` per Sally's Navigation Patterns spec. Placement: before Verification Queue. Super-admin only. Icon: Lucide `Server` or `Users` (Sally to confirm in implementation pass).

2. **AC#2 — Routes:**
   - `/dashboard/admin/consumers` — list view (default landing)
   - `/dashboard/admin/consumers/new` — 3-tab create wizard
   - `/dashboard/admin/consumers/:id` — detail page (edit + activity drawer + key history)
   - `/dashboard/admin/consumers/:id/keys/:keyId` — key detail (rotation, revocation actions)
   - All super-admin gated via existing role-isolated route pattern

3. **AC#3 — List view (`/dashboard/admin/consumers`):** Table with columns:
   - Name + organisation_type badge (icon)
   - Contact email
   - DSA on file? (✓ icon if `dsa_document_url IS NOT NULL`)
   - Active scopes count
   - Last activity (last `api_keys.last_used_at` across consumer's keys)
   - Status badge (active / suspended / terminated)
   - Actions: View / Edit / Suspend (super-admin only)
   - Sortable + paginated
   - Filter: status + has-PII-scope + organisation_type

4. **AC#4 — Create wizard (`/dashboard/admin/consumers/new`) — 3-tab using `WizardStepIndicator`:**

   **Tab 1 — Identity:**
   - Consumer name (required)
   - Organisation type (required dropdown: Federal MDA / State MDA / Research Institution / Other)
   - Primary technical contact email (required, with email-typo detection per prep-input-sanitisation-layer wiring + Sally's Form Pattern)
   - Description (optional, 500 chars)
   - DSA upload (optional at this step but **required before assigning `submissions:read_pii` in Tab 3** — drives Tab 3 enforcement):
     - File picker (PDF only, ≤5MB)
     - Uploaded file shown with name + uploaded date + Replace / Remove affordances
     - Server: stores in DigitalOcean Spaces; reference recorded in `api_consumers.dsa_document_url`
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
   - "Grant all scopes" / "Revoke all scopes" bulk affordances at the top (with confirmation modal per Sally's spec)

5. **AC#5 — Dry-run summary modal (per Sally's Journey 7 Step 4):**
   - On Save click (any tab — wizard supports save-from-any-tab if all tabs have valid data; otherwise prompts to complete missing tabs)
   - Modal pre-commit confirmation per Sally's wireframe
   - Lists every per-scope grant + rotation cadence + IP allowlist + DSA reference + lawful basis
   - Token-display warning: "The plaintext token will be displayed exactly once on the next screen. Make sure you have a way to copy it (clipboard, password manager) before you click Confirm."
   - Actions: [← Edit details] / [Confirm and Create]
   - On confirm: POST to provisioning endpoint per Story 10-1 service layer

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

7. **AC#7 — DSA precondition enforcement (UI layer + service layer per defence in depth):**
   - Tab 3 `ApiConsumerScopeEditor` for `submissions:read_pii`:
     - Checkbox disabled when `consumer.dsa_document_url IS NULL`
     - Warning block visible: per Sally's Component #16 spec — "⚠ This consumer has no DSA on file. You cannot enable this scope until a signed Data-Sharing Agreement is uploaded on the Identity tab. [Upload DSA →]" with inline link to switch to Tab 1
     - Attempting to check the disabled checkbox shows toast "Upload a signed DSA on the Identity tab to enable this scope"
   - Service layer (Story 10-1) ALSO enforces — UI gate alone is insufficient (a sufficiently determined admin could craft a request bypassing the UI). Defence in depth.

8. **AC#8 — Per-consumer activity drawer (`/dashboard/admin/consumers/:id`):**
   - Drawer or section with quota visibility per Sally's Pattern 2:
     - Per-scope row: progress bar showing daily quota usage with threshold colours (0-70% Success, 70-85% Warning, 85-100% Warning-700, 100% Error)
     - Resets at midnight UTC indicator
     - Click row → drawer with last 7 days sparkline + per-hour breakdown for today
   - Last 7 days request volume time-series (sparkline using Chart.js or recharts)
   - Recent rate-limit-rejection events (linked to Story 9-11 audit log filtered to this consumer if available)

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

## Dependencies

- **Story 10-1 (HARD)** — service layer (provisioning, rotation, scope management endpoints)
- **Story 10-2 (HARD)** — per-consumer rate-limit + quota visibility endpoint for AC#8 activity drawer
- **Story 10-5 (HARD for PII scope path)** — DSA template existence (the actual PDF file) is a Tab-1-upload prerequisite; without 10-5, admin has no DSA to upload
- **Story 9-12 `WizardStepIndicator` component** (preferred — for Tab navigation; Story 11-3 also depends on this)
- **prep-input-sanitisation-layer** (preferred — for Tab 1 email-typo detection)
- **Sally's Custom Components #16 + #17** — UI specs

**Unblocks:**
- Story 10-4 (Developer Portal) — admin UI for "request access" form approval reuses some patterns

## Field Readiness Certificate Impact

**Tier B / post-field.**

## Tasks / Subtasks

### Task 1 — Sidebar + routing (AC#1, AC#2)

1.1. Add API Consumers nav item to sidebarConfig.ts
1.2. Add routes
1.3. Auth guards

### Task 2 — List view (AC#3)

2.1. New page `apps/web/src/features/admin-consumers/pages/ConsumersListPage.tsx`
2.2. shadcn/ui DataTable with sortable columns + filters + pagination
2.3. TanStack Query hook `useConsumers`

### Task 3 — Create wizard shell (AC#4 outer)

3.1. New page `apps/web/src/features/admin-consumers/pages/ConsumerWizardPage.tsx`
3.2. WizardLayout reuse (from Story 9-12)
3.3. Tab navigation with Continue/Back; URL-routed tab number

### Task 4 — Tab 1 Identity (AC#4 Tab 1)

4.1. Form with name + org-type + email + description + DSA upload + lawful basis
4.2. Email-typo detection via prep-input-sanitisation
4.3. DSA upload component: file picker + S3 upload + reference storage
4.4. `LawfulBasisSelector` component (Sally #17)

### Task 5 — Tab 2 Access (AC#4 Tab 2)

5.1. Form with key name + rotation cadence + IP allowlist (multi-input with CIDR validation) + display read-only fields
5.2. CIDR validation utility

### Task 6 — Tab 3 Permissions + ApiConsumerScopeEditor (AC#4 Tab 3, AC#7)

6.1. `ApiConsumerScopeEditor` component (Sally #16) — author here if not pre-existing
6.2. Per-scope row with checkbox + expiry + LGA multi-select + DSA-required warning block
6.3. Bulk grant/revoke affordances with confirmation
6.4. DSA precondition gate per AC#7

### Task 7 — Dry-run summary modal (AC#5)

7.1. `DryRunSummaryModal` component
7.2. Renders per-scope grant + rotation + IP allowlist + DSA reference + lawful basis
7.3. Edit details / Confirm actions

### Task 8 — Token-displayed-once screen (AC#6)

8.1. `TokenDisplayPage` component
8.2. Plaintext display in monospace block
8.3. Copy-to-clipboard button
8.4. Warning copy + delivery guidance
8.5. Browser-back warning via `beforeunload` event
8.6. Clear plaintext from React state on unmount

### Task 9 — Edit consumer (AC#9)

9.1. Edit button on detail page → reuse wizard with pre-filled values
9.2. Diff calculation in dry-run summary
9.3. Scope-removal confirmation
9.4. Lawful-basis-change justification

### Task 10 — Suspend / Terminate (AC#10)

10.1. Suspend: `PATCH /api/v1/admin/consumers/:id` with `status: 'suspended'`
10.2. Terminate: `POST /api/v1/admin/consumers/:id/terminate` with reason — backend revokes all keys + audit-logs
10.3. Confirmation modals per AC#10

### Task 11 — Per-consumer activity drawer (AC#8)

11.1. Quota visibility component using Story 10-2 `GET /api/v1/partner/quota?consumer_id=X`
11.2. Per-scope progress bars with threshold colours
11.3. 7-day sparkline (recharts)
11.4. Recent rate-limit-rejection events (link to Story 9-11 audit viewer if available)

### Task 12 — Tests (AC#11) + sprint-status

12.1. Comprehensive tests
12.2. Update sprint-status.yaml

## Technical Notes

### Why dry-run summary modal vs immediate save

Per Sally's Journey 7: provisioning has long-lived, hard-to-undo consequences (a leaked PII-scope token can take time to detect and rotate). A friction step at the moment of creation is intentional protection. The dry-run modal makes the operator pause and read what they're about to do.

### Why token-displayed-once screen has explicit "I have copied" button (not just "Continue")

Naming the action ("I have copied the token") forces conscious acknowledgement. A bare "Continue" button can be clicked reflexively, leaving the operator without the token. The explicit phrasing is a UX honeypot for accidental clicks.

### Why DSA precondition is enforced at BOTH UI and service layers

UI gate (this story AC#7): admin can't even check the box, so won't accidentally try to provision PII without DSA.

Service gate (Story 10-1 AC#7): even if a determined admin bypasses the UI (e.g. by sending a hand-crafted curl request), the server rejects with `409 DSA_REQUIRED`.

This is defence in depth. Either layer alone is insufficient for NDPA-grade compliance posture.

### Why React state clears on unmount in token-display

Plaintext token in browser memory is a low-but-non-zero risk surface (memory dump, extension JS access). Clearing on unmount minimises the window. Belt + braces with the browser-back warning.

### Why per-scope grant has expiry as optional

Default: no expiry (scope active until consumer terminated). For sensitive scopes (PII) or short-term partnerships, admin can set explicit expiry per scope. Use case: "ITF-SUPA gets `submissions:read_pii` for 6 months while we negotiate full DSA renewal."

### Why CIDR validation client-side

Preventing the form from submitting invalid CIDR is a UX win (faster feedback). Server-side re-validates regardless. Use a published CIDR validator (`ip-cidr` npm or similar small lib).

### Why bulk grant/revoke requires confirmation

Per Sally's spec — destructive bulk actions need a friction step. "Revoke all scopes" is a one-click way to make a consumer's API calls suddenly fail; confirmation prevents the "oops".

## Risks

1. **DSA upload to S3 may fail.** AWS SES / DigitalOcean Spaces can reject large uploads or have quotas. Mitigation: client-side 5MB cap; server-side timeout handling with retry; failed uploads surface clear error.
2. **Token-display screen may be cached by browser.** If the operator clicks back and the page renders from cache showing the plaintext token, security risk. Mitigation: `Cache-Control: no-store, no-cache` headers on the token-display response; React-router state-only rendering (token not in URL).
3. **Per-consumer activity drawer queries may be slow.** Aggregating 7 days of audit_logs per consumer at scale could exceed 250ms. Mitigation: per Story 10-2 quota visibility endpoint is cacheable (30s); audit-log aggregations leverage Story 9-11 composite indexes.
4. **Lawful-basis change confusion.** If admin changes from `data_sharing_agreement` to `ndpa_6_1_e` (Public Interest), what happens to existing PII scope? Mitigation: AC#9 requires justification textarea on lawful-basis change; super-admin manually decides whether to also revoke PII scope (no auto-revoke — preserves admin agency).
5. **Suspend vs Terminate confusion.** Operator might "Suspend" expecting a hard-revoke. Mitigation: AC#10 confirmation modals explicitly contrast the two ("Suspend = reversible status flag; keys remain valid. Terminate = irreversible; all keys revoked.").

## Dev Agent Record

### Agent Model Used

_(Populated when story enters dev.)_

### Debug Log References

_(Populated during implementation.)_

### Completion Notes List

_(Populated during implementation.)_

### File List

**Created:**
- `apps/web/src/features/admin-consumers/pages/ConsumersListPage.tsx`
- `apps/web/src/features/admin-consumers/pages/ConsumerWizardPage.tsx`
- `apps/web/src/features/admin-consumers/pages/ConsumerDetailPage.tsx`
- `apps/web/src/features/admin-consumers/pages/TokenDisplayPage.tsx`
- `apps/web/src/features/admin-consumers/components/ApiConsumerScopeEditor.tsx` (per Sally #16)
- `apps/web/src/features/admin-consumers/components/LawfulBasisSelector.tsx` (per Sally #17 — shared with Story 11-3)
- `apps/web/src/features/admin-consumers/components/DryRunSummaryModal.tsx`
- `apps/web/src/features/admin-consumers/components/QuotaVisibilityDrawer.tsx`
- `apps/web/src/features/admin-consumers/components/IpAllowlistInput.tsx`
- `apps/web/src/features/admin-consumers/components/DsaUploadField.tsx`
- `apps/web/src/features/admin-consumers/api/consumers.ts` (TanStack Query hooks)
- Tests

**Modified:**
- `apps/web/src/features/dashboard/config/sidebarConfig.ts` — API Consumers nav
- TanStack Router config
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-04-25 | Story created by Bob (SM) per SCP-2026-04-22 §A.5. Status `ready-for-dev`. 11 ACs covering sidebar nav + 3-tab create wizard + dry-run summary modal + token-displayed-once with browser-back warning + DSA precondition UI gate + per-consumer activity drawer + edit/suspend/terminate flows + tests. Depends on Story 10-1 service + Story 10-2 quota + Story 10-5 DSA template. | Operator surface for Epic 10. Without it, consumer provisioning requires direct DB writes — unsafe + inauditable. |
