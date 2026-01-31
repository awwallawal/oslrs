# Epic 2 Retrospective: ODK Integration & Staff Onboarding

**Date:** 2026-01-31
**Facilitator:** Bob (Scrum Master)
**Participants:** Full BMAD Team (PM, Architect, Dev, TEA, UX Designer, SM)
**Epic Duration:** 5 days
**Stories Completed:** 6/6 (100%)

---

## Executive Summary

Epic 2 successfully delivered ODK Central integration and staff onboarding capabilities. The team achieved a velocity improvement of 27% over Epic 1, adding 540 tests to reach 991 total. Key outcomes include webhook-driven data sync, bulk staff invitation, and comprehensive fraud detection groundwork.

**Critical Decision:** The team unanimously agreed to insert **Epic 2.5 (Role-Based Dashboards)** before Epic 3, as dashboard infrastructure is a hard dependency for all subsequent epics.

---

## Metrics & Velocity

| Metric | Epic 1 | Epic 2 | Change |
|--------|--------|--------|--------|
| Stories | 5 | 6 | +1 |
| Duration | 5.5 days | 5 days | -0.5 days |
| Velocity | 1.1 days/story | 0.8 days/story | **+27%** |
| Tests Added | 451 | 540 | +89 |
| Total Tests | 451 | 991 | +120% |
| Code Review Pass Rate | 100% | 100% | Maintained |

### Velocity Drivers
1. **ODK Mock Server** - Enabled parallel frontend/backend development
2. **Established Patterns** - Reused Epic 1 authentication and API patterns
3. **Good Story Sequencing** - Infrastructure stories (2-1, 2-2) unblocked others
4. **Mature Test Framework** - `@oslsr/testing` package accelerated test writing

---

## What Went Well

### 1. ODK Integration Architecture
- **Webhook-first design** eliminated polling overhead
- **Idempotent submission processing** handles duplicates gracefully
- **Mock server pattern** (`services/odk-integration/mock`) enabled testing without live ODK Central
- **Circuit breaker pattern** for external service resilience

### 2. Staff Onboarding Flow
- **Bulk invitation via CSV** reduces admin overhead
- **Magic link activation** improves security (no password in email)
- **LGA lock enforcement** prevents unauthorized geographic access
- **ODK App User auto-provisioning** seamless mobile app setup

### 3. Testing Infrastructure
- **991 tests** provide strong regression safety
- **Parallel CI execution** keeps pipeline fast (~3-4 minutes)
- **Test dashboard** aggregates results across packages
- **Factory functions** in `@oslsr/testing` standardize test data

### 4. Team Collaboration
- **Party Mode retrospective** ensured all perspectives captured
- **Wireframe creation** during retro prevented Epic 2.5 blockers
- **Documentation updates** kept in sync with code changes

---

## What Could Be Improved

### 1. E2E Test Gap
- **Current State:** 0 E2E tests (Playwright/Cypress)
- **Risk:** Critical user flows untested end-to-end
- **Impact:** May miss integration issues between frontend and backend
- **Recommendation:** Add E2E setup in Epic 3 or dedicated testing story

### 2. Dashboard Test Coverage
- **Current State:** No route protection tests for role-based dashboards
- **Risk:** RBAC bypass vulnerabilities
- **Action:** Story 2.5-8 must include 7x7 route matrix tests

### 3. Frontend Velocity Unknown
- **Observation:** Epic 2 was backend-heavy; Epic 2.5 is frontend-heavy
- **Risk:** Velocity assumptions may not hold for UI work
- **Mitigation:** Wireframes created to reduce design ambiguity

### 4. Documentation Lag
- **Observation:** Some patterns discovered during development weren't documented
- **Action Items:** Document ODK mock server setup, migration best practices

---

## Technical Learnings

### 1. ODK Central Integration Patterns

```typescript
// Pattern: Webhook signature verification
const isValid = verifyOdkWebhookSignature(
  req.headers['x-odk-signature'],
  req.rawBody,
  process.env.ODK_WEBHOOK_SECRET
);

// Pattern: Idempotent submission processing
const existing = await db.submission.findUnique({
  where: { odkInstanceId: submission.instanceId }
});
if (existing) return existing; // Already processed
```

**Key Insight:** ODK Central webhooks can fire multiple times for the same submission. Always check for existing records before processing.

### 2. Database Migration Gotchas

| Scenario | Wrong Approach | Correct Approach |
|----------|---------------|------------------|
| Column type change | Direct ALTER | Multi-step: add new → migrate data → drop old |
| Enum addition | Modify enum in-place | Add new value, deploy, then use |
| Existing column mapping | Rename in Prisma | Use `@map("original_name")` |

**Key Insight:** Always test migrations on a copy of production data before deploying.

### 3. Rate Limiter Extraction

Extracted to `@oslsr/utils` for cross-service reuse:

```typescript
import { createRateLimiter } from '@oslsr/utils';

// Per-endpoint configuration
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,                    // 5 attempts
  keyPrefix: 'auth:login:'   // Redis key prefix
});
```

**Key Insight:** Redis-backed rate limiting enables distributed enforcement across multiple API instances.

### 4. Mock Server Patterns

The ODK mock server (`services/odk-integration/mock`) provides:
- **Form listing** - Returns predefined form metadata
- **Submission webhook simulation** - Triggers webhook handlers
- **App user management** - Mimics ODK Central user provisioning
- **Configurable delays** - Tests timeout handling

**Key Insight:** Mock servers should be slightly slower than production to catch timing issues.

---

## Decisions Made

### Decision 1: Epic 2.5 Before Epic 3

**Context:** Epic 3 (Public Registration) requires role-specific dashboards that don't exist yet.

**Options Considered:**
1. Add dashboard scaffolding to Epic 3 stories (rejected: bloats scope)
2. Create Epic 2.5 for dashboard infrastructure (selected)
3. Build dashboards ad-hoc as needed (rejected: inconsistent UX)

**Decision:** Create Epic 2.5 with 8 stories covering all 7 role dashboards plus RBAC testing.

**Rationale:**
- Hard blockers: Enumerator, Data Entry, Public User dashboards needed for Epic 3
- Prevents scope creep in Epic 3 stories
- Ensures consistent dashboard architecture across all roles

### Decision 2: Wireframe Format (Excalidraw)

**Context:** Need visual dashboard specifications before Epic 2.5 implementation.

**Options Considered:**
1. Excalidraw JSON files (selected) - VS Code compatible, version controllable
2. Markdown ASCII diagrams - Limited visual fidelity
3. Widget specification tables - No spatial layout

**Decision:** Create 7 Excalidraw wireframes stored in `_bmad-output/wireframes/`.

**Rationale:**
- Opens directly in VS Code with Excalidraw extension
- JSON format enables version control and diff
- Visual layouts prevent implementation ambiguity

### Decision 3: RBAC Route Isolation Pattern

**Context:** Need to prevent users from accessing other roles' dashboards.

**Decision:** Strict route isolation with `/dashboard/{role}/*` pattern.

**Implementation:**
```typescript
// Middleware: dashboardGuard
if (user.role !== routeRole) {
  throw new AppError('FORBIDDEN', `${user.role} cannot access ${routeRole} dashboard`);
}
```

**Rationale:**
- Simple mental model: each role has exactly one dashboard
- No complex permission matrices for dashboard access
- Easy to test: 7 roles x 7 routes = 49 test cases

---

## Action Items

| Priority | Action | Owner | Target |
|----------|--------|-------|--------|
| ~~P0~~ | ~~Add Logout button to all dashboard wireframes~~ | ~~Story 2.5-1~~ | ✅ Done |
| P0 | Implement RBAC route protection tests (7x7 matrix) | Story 2.5-8 | Epic 2.5 |
| P1 | Document ODK mock server setup in project-context.md | Dev Team | Sprint 3 |
| P1 | Add migration best practices to architecture.md | Dev Team | Sprint 3 |
| P2 | Evaluate Playwright E2E setup | TEA | Epic 3 Planning |
| P2 | Create dashboard component test patterns | Dev Team | Epic 2.5 |

---

## Test Architecture Assessment

### Current Coverage

| Package | Test Files | Tests | Focus Area |
|---------|-----------|-------|------------|
| apps/api | 25 | 291 | Integration, services, middleware |
| apps/web | 49 | 478 | Components, hooks, utilities |
| packages/utils | 5 | ~100 | Rate limiting, validation |
| services/odk-integration | 10 | ~100 | Webhook processing, sync |
| packages/testing | 2 | ~22 | Test utilities themselves |
| **Total** | **91** | **~991** | |

### RBAC Test Coverage

Current `rbac.test.ts` covers:
- `authorize()` middleware - 3 tests
- `requireLgaLock()` middleware - 4 tests
- Error codes: AUTH_REQUIRED, FORBIDDEN, LGA_ACCESS_DENIED, LGA_LOCK_REQUIRED

**Gap:** No tests for dashboard route protection (0/49 combinations tested).

### CI Pipeline Performance

| Stage | Duration | Parallelism |
|-------|----------|-------------|
| Lint + Build | ~60s | Sequential |
| Unit Tests | ~45s | 3-way parallel (utils, testing, odk) |
| API Tests | ~90s | With Postgres + Redis services |
| Web Tests | ~60s | Parallel with API |
| Dashboard | ~15s | Sequential merge |
| **Total** | **~3-4 min** | Optimized |

### E2E Strategy Recommendation

For Epic 2.5 and beyond, recommend:

1. **Smoke Tests** (P1)
   - Each role can log in and see their dashboard
   - Navigation works within dashboard
   - Logout functions correctly

2. **Critical Path Tests** (P2)
   - Enumerator: Start survey → Complete → Sync
   - Data Entry: View queue → Enter data → Submit
   - Supervisor: View fraud alert → Drill down

3. **Cross-Role Isolation Tests** (P1)
   - Verify 403 when accessing wrong dashboard
   - Verify redirect to correct dashboard after login

---

## Wireframes Created

All wireframes stored in `_bmad-output/wireframes/` in Excalidraw JSON format.

| Wireframe | Layout | Key Widgets | Target Story |
|-----------|--------|-------------|--------------|
| `dashboard-enumerator.excalidraw` | Mobile 375px | Start Survey CTA, Drafts, Sync Status, Messages | 2.5-5 |
| `dashboard-public-user.excalidraw` | Mobile 375px | Survey Status, Marketplace Profile, Support | 2.5-8 |
| `dashboard-data-entry.excalidraw` | Desktop 1280px | Queue Table, Keyboard Shortcuts, LGA Filter | 2.5-6 |
| `dashboard-supervisor.excalidraw` | Desktop BentoGrid | Fraud Heatmap, Team Status, Alert Tiles, Timeline | 2.5-3 |
| `dashboard-super-admin.excalidraw` | Desktop Tabbed | ODK Health, Questionnaires, Staff Management, Activity | 2.5-2 |
| `dashboard-assessor.excalidraw` | Desktop Split | Audit Queue, Evidence Panel, Approve/Reject | 2.5-4 |
| `dashboard-official.excalidraw` | Desktop Read-Only | Registration Stats, Trends Chart, LGA Breakdown, Export | 2.5-7 |

**Note:** All wireframes include Profile menu dropdown with Logout button in header.

---

## Documents Updated

| Document | Version | Changes |
|----------|---------|---------|
| `epics.md` | - | Added Epic 2.5 (8 stories), Story 6-7 sequence |
| `sprint-status.yaml` | - | Epic 2 marked done, Epic 2.5 in backlog |
| `prd.md` | 7.9 | Updated epic list, dashboard requirements |
| `project-context.md` | 1.5.0 | Route patterns, RBAC rules |
| `architecture.md` | - | ADR-016 RBAC Matrix added |

---

## Conclusion

Epic 2 was a successful sprint that delivered critical ODK integration capabilities while improving team velocity. The decision to insert Epic 2.5 before Epic 3 demonstrates mature sprint planning - addressing technical debt before it becomes a blocker.

Key success factors:
1. **Mock-driven development** enabled parallel work streams
2. **Strong test coverage** (991 tests) provides refactoring confidence
3. **Wireframe-first approach** prevents UI ambiguity in Epic 2.5
4. **Team collaboration** through Party Mode retrospective captured all perspectives

The team is well-positioned to begin Epic 2.5 with clear specifications, established patterns, and identified risks.

---

**Retrospective Approved By:**
- Penny (PM) - Product scope validated
- James (Architect) - Technical decisions sound
- Gideon (Dev) - Implementation ready
- Tunde (TEA) - Test strategy clear
- Sally (UX) - Wireframes complete
- Bob (SM) - Process followed

**Next:** Begin Epic 2.5 Story 2.5-1 (Dashboard Layout Architecture & Role Routing)
