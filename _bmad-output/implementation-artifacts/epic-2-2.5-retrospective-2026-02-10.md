# Combined Retrospective: Epic 2 + Epic 2.5

**Date:** 2026-02-10
**Facilitator:** Bob (Scrum Master)
**Format:** Three-Act Structure (The Journey, The Pivot, The Rebuild)
**Participants:** Full BMAD Team + Awwal (Project Lead)

---

## Executive Summary

This combined retrospective covers Epic 2 (Questionnaire Management & Native Form System) and Epic 2.5 (Role-Based Dashboards & Feature Integration) as a single narrative arc. The two epics are reviewed together because:

1. Epic 2.5 was born from Epic 2's retrospective decision to scaffold dashboards before Epic 3
2. The Sprint Change Proposal SCP-2026-02-05-001 (ODK removal) straddled both epics
3. The course correction fundamentally changed the trajectory of both epics

**Key Decision:** The team pivoted from ODK Central/Enketo integration to a native form system mid-stream, superseding 5 stories and creating 4 replacements. The pivot was driven by persistent Enketo preview failures that posed unacceptable field deployment risk.

---

## Team Participants

| Name | Role |
|------|------|
| Awwal | Project Lead |
| Alice | Product Owner |
| Bob | Scrum Master (Facilitator) |
| Charlie | Senior Developer |
| Dana | QA Engineer |
| Elena | Junior Developer |
| Winston | Architect |

---

## Combined Metrics

| Metric | Epic 2 (Original) | Epic 2 (Post-SCP) | Epic 2.5 | Combined |
|--------|-------------------|-------------------|----------|----------|
| Stories | 6 | 5 active (5 superseded) | 8 | 13 active + 5 superseded |
| Completion | 6/6 then 5 superseded | 5/5 | 8/8 | **13/13 (100%)** |
| Code Review Issues | ~30 | ~38 | ~60 | **~128 total** |
| HIGH Severity | ~10 | ~15 | ~13 | **~38** |
| Tests at End | -- | 1,162+ | 957 web + 326 API | **~1,283+ total** |
| Regressions | 0 | 0 | 0 | **0** |
| Calendar Days | 5 (Epic 2 original) | 2 (post-SCP) | 11 | ~18 total |

### Course Correction Impact

- Stories superseded: 5 (2.2-2.6)
- Estimated wasted effort: ~6-7 dev days
- New stories created: 4 (2.7-2.10)
- Infrastructure simplified: 6 containers → 4, 2 databases → 1
- Monthly cost savings: $12-24/month ($144-288/year)

---

## Act 1: The Journey - What Survived, What Was Lost

### ODK Work Assessment

| Story | Status | Salvaged? |
|-------|--------|-----------|
| 2.1 XLSForm Upload | **RETAINED** | Yes - parser feeds Story 2.9 migration |
| 2.2 ODK Form Deployment | **SUPERSEDED** | No - all removed |
| 2.3 ODK App User Provisioning | **SUPERSEDED** | Partial - BullMQ patterns reused |
| 2.4 Encrypted Token Management | **SUPERSEDED** | Partial - crypto utils in packages/utils |
| 2.5 ODK Sync Health Monitoring | **SUPERSEDED** | Partial - submissions table schema retained |
| 2.6 ODK Mock Server | **SUPERSEDED** | No - all removed |

### What Was Salvaged

- Story 2.1's XLSForm parser directly consumed by Story 2.9 migration script
- BullMQ queue/worker patterns from Stories 2.3 and 2.5 became infrastructure templates
- Submissions table schema from Story 2.5 retained for Story 3.4
- Crypto utilities in `packages/utils` available for future use
- Architectural learnings (circuit breaker, idempotent processing) inform future design

### Post-Correction Stories (2.7-2.10)

The native form replacement stories were notably faster and cleaner:

- Story 2.7 (Types): ~0.5 days
- Story 2.8 (Skip Logic + Services): ~1 day
- Story 2.9 (Migration Script): ~1 day
- Story 2.10 (Form Builder UI): ~1.5 days

Code review severity profile shifted from subtle integration bugs (ODK phase) to structural/pattern issues (native phase), reflecting the simpler architecture.

### Code Review Severity Shift

| Phase | Characteristic Bugs |
|-------|-------------------|
| ODK (2.1-2.6) | Auto-deprecation logic bug, content-type detection, tamper test targeting wrong bytes, email not queued |
| Native (2.7-2.10) | Missing `db.transaction()` (3x), missing confirmation dialogs (3x), column name mismatch |

---

## Act 2: The Pivot - SCP-2026-02-05-001 Critical Analysis

### What Triggered It

ODK Central's Enketo web form renderer could not preview uploaded questionnaires. The issue persisted across:
- The actual OSLRS master questionnaire
- A minimal test form created specifically to isolate the issue
- Multiple debugging sessions including server diagnostics, container restarts, and stack rebuilds

Third-party XLSForm parsers (getodk.org/xlsform) successfully parsed and previewed the same forms.

### The Decision Logic (Awwal's Reasoning)

> "If we moved ahead and in the field similar issue occurred, then it becomes firefighting issues during data collection. So I thought it would be better to create a native form and bring everything in house."

### Team Critical Analysis

**What was defensible:**
- Field reliability over dev velocity is the correct priority for a government data collection system
- Eliminating an uncontrollable external dependency reduces operational risk
- The native system is architecturally simpler (no external API, no BullMQ for ODK, no encryption for tokens, no Redis for health tracking)

**What should have been different:**
- **Bottom-up validation was wrong.** We built 6 stories of ODK infrastructure before testing the critical user path (form preview). A spike story on Day 1 would have caught the Enketo issue and saved 6-7 dev days.
- **Root cause is unknown.** We don't know if the Enketo failure was a fundamental defect or a deployment/configuration issue. We chose to stop debugging (valid strategic decision) but should be honest it was a strategic retreat, not a proven impossibility.

### The Preview Gap (Critical Discovery)

**Irony identified during retrospective:** The pivot was triggered by inability to preview forms in ODK Central. The current native Form Builder's "Preview" tab shows JSON structure and a field summary table - NOT a visual preview of how the form looks to end users.

| What Exists | What It Shows |
|-------------|--------------|
| Form Builder "Preview" tab | JSON + field summary table (developer view) |
| `GET /api/v1/questionnaires/:id/preview` | Backend endpoint with flattened data (exists) |
| Skip logic evaluator in `@oslsr/utils` | Shared package for client-side use (exists) |
| Visual form preview for admin | **DOES NOT EXIST** |

**Resolution:** Story 3.1 (Native Form Renderer) will be updated to include an admin preview requirement. The form renderer component will be reusable in read-only sandbox mode from the Form Builder.

---

## Act 3: The Rebuild - Epic 2.5 Execution

### Velocity Pattern

| Story | Days | Complexity | Notes |
|-------|------|-----------|-------|
| 2.5-1 Layout Architecture | 1 | HIGH | Established all patterns |
| 2.5-2 Super Admin Questionnaires | 2 | HIGH | 6 bug fixes on Feb 5 |
| **2.5-3 Staff Management** | **6+** | **EXTREME** | **30 tasks, 3 review rounds, scope creep** |
| 2.5-4 Supervisor | 1 | Low | Pattern reuse |
| 2.5-5 Enumerator | 1 | Low | Same day as 2.5-4 |
| 2.5-6 Clerk | 1 | Low | Pattern reuse |
| 2.5-7 Assessor + Official | 1 | Medium | Same day as 2.5-6, role name bug fix |
| 2.5-8 Public User + RBAC | 1 | Low | Final dashboard |

**Key insight:** The foundational investment in Story 2.5-1 enabled 5 dashboard shells (2.5-4 through 2.5-8) in 3 calendar days at a pace of 2 stories/day.

### Story 2.5-3 Scope Explosion

Story 2.5-3 consumed more than half the epic's effort:
- Started as "Staff Management page"
- Absorbed activation wizard (Tasks 19-29, scope creep from Story 1-4)
- Absorbed ID card redesign (Task 30)
- Required 3 code review rounds (16 findings)
- Standardized API response format across 16 endpoints in 5 controllers
- Fixed JWT `sub` vs `id` mismatches across multiple controllers

**Lesson:** If a story exceeds 15 tasks, split it immediately.

### Recurring Code Review Patterns

1. **AlertDialogCancel missing** - Modals shipped without Cancel button (2.5-5, 2.5-6)
2. **Skeleton/content shape mismatch** - Skeleton grids didn't match actual card layouts (2.5-6, 2.5-7)
3. **Fragile test selectors** - Tests used `.lucide-*` CSS classes, Tailwind utilities, `data-slot` attributes (2.5-7, 2.5-8). #1 recurring finding.
4. **Tab navigation test depth** - Tests checked `tabindex` but not actual focus traversal (2.5-6, 2.5-7)
5. **Role name mismatch** - Frontend short names (`clerk`, `assessor`, `official`) didn't match database full names (`data_entry_clerk`, `verification_assessor`, `government_official`). Latent bug from 2.5-1, not caught until 2.5-7. 53 RBAC tests passed because they encoded the same wrong assumption.

### Test Coverage Growth

| Story | New Tests | Total Web Tests |
|-------|-----------|-----------------|
| 2.5-1 | 99 | 577 |
| 2.5-2 | 32 | 621 |
| 2.5-3 | ~200+ | 745 |
| 2.5-4 | 16 | 800 |
| 2.5-5 | 21 | 823 |
| 2.5-6 | 27 | 851 |
| 2.5-7 | 67 | 917 |
| 2.5-8 | 37 | 957 |

Web tests grew from 478 (pre-epic) to 957 (2x growth). Zero regressions throughout.

---

## Previous Retrospective Follow-Through

### Epic 1.5 Action Items

| Action Item | Status | Impact |
|-------------|--------|--------|
| Establish nested route structure in first story | ✅ Done | Story 2.5-1 set up all routes upfront |
| Document component reuse patterns | ⏳ Partial | Patterns established, docs not fully updated |
| Continue co-located test pattern | ✅ Done | Every story has co-located `__tests__/` |
| Add "Spec Compliance Check" milestone | ❌ Not Done | Role name mismatch might have been caught earlier |
| Add `eslint-plugin-jsx-a11y` | ❌ Not Done | Accessibility issues still caught manually |

### Epic 2 Action Items

| Action Item | Status | Impact |
|-------------|--------|--------|
| ~~Add Logout button to wireframes~~ | ✅ Done | Story 2.5-1 |
| Implement RBAC 7x7 route tests | ✅ Done | 53 tests in 2.5-1, expanded in 2.5-8 |
| Document ODK mock server setup | ❌ Irrelevant | ODK removed |
| Add migration best practices to architecture.md | ❌ Not Done | Migration pain continued in 2.7, 2.9 |
| Evaluate Playwright E2E setup | ❌ Not Done | Still at 0 E2E tests after 2 epics |
| Create dashboard component test patterns | ✅ Done | Established in 2.5-4, replicated through 2.5-8 |

**Follow-through rate:** 4/10 completed. 2 made irrelevant by pivot. 4 actionable items unaddressed, with at least 2 causing real pain.

---

## Quality Strategy Decision

The team agreed on a three-layer quality strategy going forward:

| Layer | What | Who | When | Catches |
|-------|------|-----|------|---------|
| **Unit/Integration** | Automated code tests | CI | Every commit | Regressions, logic errors |
| **E2E (Playwright)** | Automated browser tests | CI | Every PR | Integration failures, real DOM issues, RBAC in real browser |
| **UAT** | Human walks through features | Awwal | After each story | UX gaps, wrong assumptions, missing features |

**Key insight from Awwal:** Manual local testing surfaced the role name mismatch that 53 automated tests missed. Tests can only verify what the developer thought to check. UAT catches "the code does what we asked, but we asked for the wrong thing."

---

## Readiness Assessment

### Epic 2 + 2.5 Readiness

| Area | Status | Notes |
|------|--------|-------|
| Testing & Quality | ✅ Solid | 957 web + 326 API tests, 0 regressions. Form preview gap captured. |
| Deployment | ⚠️ Not pushed | Code not yet on remote. Staging deployment needed during prep phase. |
| Stakeholder Acceptance | ⚠️ Pending | No stakeholder demo yet. Staging deployment enables this. |
| Technical Health | ✅ Stable | Codebase feels stable. Concerns about offline persistence, load handling, and data flow integrity are Epic 3 problems. |
| ODK Cleanup | ⚠️ Needed | Story 2.5-2 still has dead ODK components. Standalone cleanup before Epic 3. |

### Concerns for Epic 3

1. **7-day offline data persistence** - Testable via Persistent Storage API + UAT, but literal 7-day test not possible in CI
2. **Traffic surge handling** - Pilot scale (132 staff) is safe. Load test baseline needed for confidence.
3. **End-to-end data flow** - Form → Database → Dashboards pipeline doesn't exist yet. E2E golden path test after Story 3.4 will prove this.

---

## Action Items

### Process Improvements

| # | Action | Owner | Deadline | Success Criteria |
|---|--------|-------|----------|-----------------|
| P1 | Spike-first for external integrations | Bob (SM) | Epic 3 planning | Mandatory step in story creation |
| P2 | Story sizing guardrails (split at 15 tasks) | Bob (SM) | Ongoing | Enforced during story creation |
| P3 | Structured UAT after each story | Awwal + Bob | Every story | UAT checklist, findings documented |
| P4 | Spec Compliance Check at mid-epic | Alice (PO) | Epic 3 midpoint | Check performed, findings documented |

### Technical Debt

| # | Action | Owner | Priority |
|---|--------|-------|----------|
| T1 | ODK cleanup in Story 2.5-2 (remove dead components, wire Form Builder links) | Charlie (Dev) | CRITICAL - Before Epic 3 |
| T2 | DB migration workflow fix (resolve `db:push` interactive prompt issues) | Charlie (Dev) | HIGH - Prep phase |
| T3 | Shared role constants in `packages/types` (single source of truth) | Charlie (Dev) | HIGH - Prep phase |
| T4 | Test selector convention (text content, `data-testid`, ARIA roles only) | Dana (QA) | MEDIUM - Prep phase |
| T5 | fileBlob base64 → bytea (Story 2.1 debt) | Charlie (Dev) | LOW |
| T6 | `@oslsr/types` sub-path exports configuration | Charlie (Dev) | LOW |

### Epic 3 Preparation Tasks

| # | Task | Owner |
|---|------|-------|
| EP1 | ODK cleanup standalone task | Charlie (Dev) |
| EP2 | Update Story 3.1 ACs - add admin form preview (same FormFillerPage in read-only sandbox mode) | Bob (SM) |
| EP3 | Playwright framework setup + smoke tests + handholding guide for Awwal (including codegen) | Charlie (Dev) + Dana (QA) |
| EP4 | Service worker / IndexedDB research spike | Elena (Dev) |
| EP5 | DB migration workflow guide | Charlie (Dev) |
| EP6 | Load test script (k6/autocannon) for baseline performance metrics | Charlie (Dev) |
| EP7 | E2E golden path test spec (form → database → dashboard proof) | Dana (QA) + Alice (PO) |

### Team Agreements

| # | Agreement |
|---|-----------|
| A1 | Every AlertDialog modal must include an explicit Cancel button |
| A2 | Skeleton loading layouts must match the shape of actual content |
| A3 | Tests use text content, `data-testid`, and ARIA roles - never CSS classes or internal attributes |
| A4 | Stories exceeding 15 tasks get split at the next standup |
| A5 | External integration epics start with a spike story validating the critical user path |
| A6 | UAT after every story - Awwal walks through ACs, findings documented |

---

## Deployment Notes

### Staging Seed Strategy

- **Local dev:** `pnpm db:seed:dev` (7 test users with `@dev.local` emails)
- **Staging/Production:** `pnpm db:seed --admin-from-env` (reads `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, `SUPER_ADMIN_NAME` from environment)
- Dev seed users must NEVER be used on staging
- Additional staff provisioned via Staff Management UI (Story 2.5-3)
- Cleanup: `pnpm db:seed:clean` removes `isSeeded: true` records

### Staging User Management

- Staff Management UI for day-to-day user provisioning and deactivation
- SSH + Drizzle Studio (via tunnel) for direct DB access when needed
- `pnpm db:seed:clean` for removing test data

---

## Key Takeaways

1. **Validate the critical user path before building infrastructure.** Spike stories for external integrations.
2. **The pivot was defensible** but we don't know the root cause. We chose to stop debugging - honest framing matters.
3. **The form preview gap is real** - update Story 3.1 to include admin preview. Don't repeat the ODK mistake.
4. **Pattern investment compounds** - one heavy foundational story enabled 2 stories/day thereafter.
5. **Automated tests can be consistently wrong** - UAT catches what unit tests can't.
6. **Story sizing discipline prevents scope explosions** - split at 15 tasks.

---

## Next Steps

1. **Execute prep phase** (7 preparation tasks)
2. **Push to remote and deploy to staging**
3. **Begin Epic 3** with structured UAT after each story
4. **E2E golden path test** after Story 3.4 proves the full data flow
5. **Story 3.1 UAT milestone** - Awwal fills out the actual OSLRS questionnaire through both admin preview and enumerator renderer. This is the proof point for the entire pivot.

---

**Retrospective Approved By:**
- Alice (PO) - Product scope validated
- Winston (Architect) - Technical decisions sound
- Charlie (Dev) - Implementation ready
- Dana (QA) - Quality strategy agreed
- Elena (Dev) - Research spikes owned
- Bob (SM) - Process improvements captured
- Awwal (Project Lead) - Pivot critically examined, lessons accepted

**Next:** Execute prep phase, then begin Epic 3 Story 3.0 (Google OAuth & Enhanced Public Registration)

---

*Generated: 2026-02-10*
*Facilitator: Bob (Scrum Master)*
*Retrospective Workflow: bmad:bmm:workflows:retrospective (combined format)*
