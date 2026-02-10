# Portable Project Playbook

**Source:** OSLRS Project (2026-01-13 to 2026-02-10)
**Epics Completed:** 5 (Epic 1, 1.5, 2, 2.5 + SCP pivot)
**Stories Delivered:** 37
**Tests Written:** ~1,200+
**Author:** Distilled from 4 retrospectives, 1 course correction, and 37 story implementations

---

## Table of Contents

1. [Process Lessons](#1-process-lessons)
2. [Codebase Structure Patterns](#2-codebase-structure-patterns)
3. [Technical Patterns & Conventions](#3-technical-patterns--conventions)
4. [Testing Strategy](#4-testing-strategy)
5. [BMAD Workflow Patterns](#5-bmad-workflow-patterns)
6. [Anti-Patterns & Traps](#6-anti-patterns--traps)
7. [Decision Framework](#7-decision-framework)

---

## 1. Process Lessons

### 1.1 Spike-First Validation (Top Lesson)

**The Problem:** We integrated ODK Central (external dependency) bottom-up — building parser, deployment, provisioning, encryption, monitoring — then discovered the end-to-end preview didn't work. 5 stories superseded. Weeks of work abandoned.

**The Rule:** For ANY external integration or unfamiliar technology:
1. Build a **vertical spike first** — connect the full path end-to-end with throwaway code
2. Validate the critical user-facing capability (not just API connectivity)
3. Only THEN invest in production-quality implementation

**Application:**
- New payment gateway? Spike the full checkout flow before building the adapter layer
- New auth provider? Spike login-to-dashboard before building the middleware
- New file storage? Spike upload-to-display before building the service

### 1.2 Story Sizing Guardrails

**The Problem:** Story 2.5-3 (Staff Management) exploded from 13 to 21 tasks during implementation, requiring 2 code review rounds.

**The Rule:** If a story exceeds **15 tasks** during breakdown, split it before starting. The split cost is always less than the scope explosion cost.

**Signs a story needs splitting:**
- More than 3 new components needed
- Both API and frontend changes spanning multiple entities
- "And also..." keeps appearing during task breakdown

### 1.3 Pattern Investment: Foundational + Derivative Stories

**The Discovery:** Story 2.5-1 (Dashboard Layout Architecture) took longer but established reusable layout, routing, and guard patterns. Stories 2.5-4 through 2.5-8 then averaged **2 stories/day** by following the template.

**The Rule:** Deliberately sequence one "foundational" story that establishes patterns, then queue derivative stories that reuse them. The first story should:
- Create the shared layout/component
- Establish the routing pattern
- Write the first test as a template
- Document the pattern in comments

### 1.4 UAT Checkpoints (Not Just Dev Testing)

**The Problem:** 53 RBAC unit tests passed. 3 roles couldn't access their dashboards. The tests validated the guard logic in isolation but missed that ProtectedRoute wasn't wired correctly.

**The Rule:** Implement a three-layer quality strategy:
1. **Unit/Integration tests** — Developer writes, validates logic
2. **E2E tests** (Playwright) — Validates the wired-up system
3. **Structured UAT** — Product owner walks real flows, catches what automation misses

Schedule UAT after every 2-3 stories, not just at epic completion.

### 1.5 Previous Retro Follow-Through

**The Problem:** Epic 1 retro produced 10 action items. By Epic 2.5, only 4 were completed, 2 became irrelevant, and 4 were never addressed.

**The Rule:** Each retrospective must:
1. Review action items from the PREVIOUS retro first
2. Explicitly mark each as done, irrelevant, or carried forward
3. Carried items get assigned to specific upcoming stories

### 1.6 Code Review as Adversarial Process

**The Pattern:** Every story went through formal code review that found 3-13 issues. High-severity findings included security gaps, missing error handling, and test coverage holes. 100% pass rate means the reviews are working.

**The Rule:**
- Code review is NOT a rubber stamp — reviewer must find minimum 3 issues
- Use a fresh context (different session/model if using AI) for reviews
- Categorize findings: High (must fix), Medium (should fix), Low (nice to fix)
- All High + Medium must be resolved before merge

---

## 2. Codebase Structure Patterns

### 2.1 Monorepo Layout

```
project-root/
├── apps/
│   ├── api/                    # Express + Drizzle backend
│   │   └── src/
│   │       ├── controllers/    # Route handlers (thin — delegate to services)
│   │       ├── services/       # Business logic (testable, no req/res)
│   │       ├── routes/         # Express route definitions
│   │       ├── middleware/     # Auth guards, validation, error handling
│   │       ├── db/
│   │       │   ├── schema/    # Drizzle schema definitions
│   │       │   └── seeds/     # Dev + production seeding
│   │       ├── providers/     # External service clients (email, storage)
│   │       ├── queues/        # BullMQ job definitions
│   │       ├── workers/       # Background job processors
│   │       └── __tests__/     # Integration tests
│   │
│   └── web/                    # React + Vite + TanStack frontend
│       └── src/
│           ├── features/       # Feature-based organization (see 2.2)
│           ├── components/     # Shared UI components
│           ├── hooks/          # Shared hooks
│           ├── lib/            # Utilities, API client
│           └── test/           # Test setup, utilities
│
├── packages/
│   ├── types/                  # Shared TypeScript types (API contracts)
│   ├── utils/                  # Shared utilities (validation, formatting)
│   ├── config/                 # Shared configuration
│   └── testing/                # Test utilities, factories, helpers
│
├── _bmad/                      # BMAD framework (workflow engine)
├── _bmad-output/               # Generated artifacts (stories, retros, specs)
│   ├── implementation-artifacts/  # Stories, sprint status, retros
│   └── planning-artifacts/        # PRD, architecture, epics, SCPs
├── docs/                       # Project documentation
├── turbo.json                  # Turborepo pipeline config
├── pnpm-workspace.yaml         # Workspace definition
└── package.json                # Root scripts
```

### 2.2 Feature-Based Frontend Organization

Each feature gets its own directory with consistent subdirectories:

```
features/
├── auth/
│   ├── api/            # API call functions (fetch wrappers)
│   ├── hooks/          # TanStack Query hooks (useLogin, useLogout)
│   ├── components/     # Feature-specific components
│   └── pages/          # Route page components
│
├── staff/
│   ├── api/
│   ├── hooks/          # useStaff, useCreateStaff, useDeactivateStaff
│   ├── components/     # StaffTable, DeactivateDialog, InviteDialog
│   └── pages/          # StaffListPage, StaffDetailPage
│
├── dashboard/
│   ├── components/     # Shared dashboard widgets
│   ├── config/         # Role-to-route mapping, sidebar items
│   ├── pages/          # SuperAdminDashboard, EnumeratorDashboard, etc.
│   └── __tests__/      # Dashboard-specific tests
│
└── questionnaires/
    ├── api/
    ├── hooks/
    ├── components/     # FormBuilder, SectionEditor, PreviewTab
    └── pages/          # FormBuilderPage, FormListPage
```

**Key principle:** A feature directory is self-contained. If you delete the directory, only the route import breaks — nothing else in the app should fail.

### 2.3 Backend Layer Separation

```
Route → Controller → Service → Database
         (thin)      (logic)    (queries)
```

- **Routes:** Define URL patterns, attach middleware, delegate to controllers
- **Controllers:** Parse request, call service, format response. NO business logic.
- **Services:** All business logic. Receive plain objects, return plain objects. Testable without HTTP.
- **Database:** Drizzle schema + query helpers. Services call these directly.

```typescript
// routes/staff.routes.ts
router.post('/', authorize(['super_admin']), staffController.create);

// controllers/staff.controller.ts
async create(req: Request, res: Response) {
  const result = await staffService.createStaff(req.body);
  res.status(201).json({ data: result });
}

// services/staff.service.ts
async createStaff(input: CreateStaffInput): Promise<Staff> {
  // All validation and business logic here
  return db.insert(staff).values(validated).returning();
}
```

### 2.4 Database Seeding Strategy

Two modes for different environments:

```typescript
// Dev mode: pnpm db:seed --dev
// Creates test users for every role with predictable credentials
// admin@dev.local / admin123, supervisor@dev.local / super123, etc.
// All marked with isSeeded: true for cleanup

// Production mode: pnpm db:seed --admin-from-env
// Reads SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD from env vars
// Creates only the initial super admin account

// Cleanup: pnpm db:seed:clean
// Removes all records where isSeeded: true
```

---

## 3. Technical Patterns & Conventions

### 3.1 API Error Handling

Centralized error class with typed error codes:

```typescript
// Throw domain errors in services
throw new AppError('NOT_FOUND', 'Staff member not found');
throw new AppError('FORBIDDEN', 'Cannot access this resource');
throw new AppError('VALIDATION_ERROR', 'Email already in use');

// Error middleware maps to HTTP status codes automatically
// AppError('NOT_FOUND') → 404
// AppError('FORBIDDEN') → 403
// AppError('VALIDATION_ERROR') → 400
```

**Rule:** Never throw raw errors in services. Always use AppError with a typed code.

### 3.2 TanStack Query Mutations

Naming convention: `use<Action><Entity>`

```typescript
// hooks/useStaff.ts
export function useCreateStaff() {
  return useMutation({
    mutationFn: (data: CreateStaffInput) => staffApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast.success('Staff member created');
    },
  });
}

export function useDeactivateStaff() { /* ... */ }
export function useReactivateStaff() { /* ... */ }
```

### 3.3 Dialog Pattern

Confirmation dialogs use AlertDialog with color-themed buttons:

```
DeactivateDialog → Red confirm button (#DC2626)
ReactivateDialog → Green confirm button (#16A34A)
DeleteDialog     → Red confirm button (#DC2626)
ApproveDialog    → Green confirm button (#16A34A)
```

### 3.4 ID Generation

UUIDv7 for all primary keys — sortable by creation time, no sequential exposure:

```typescript
import { uuidv7 } from 'uuidv7';
const id = uuidv7(); // Monotonically increasing, time-based
```

### 3.5 Authentication Pattern

JWT + Redis hybrid:
- Short-lived JWTs (15 min) for stateless verification
- Redis session store for revocation capability
- Refresh tokens for seamless re-authentication
- `authorize()` middleware checks both JWT validity and Redis session

### 3.6 Shared Role Constants

**Hard-won lesson:** Frontend used short role names (`admin`), database used full names (`super_admin`). This caused 3 roles to fail at runtime despite passing unit tests.

```typescript
// packages/types/src/roles.ts — SINGLE SOURCE OF TRUTH
export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  SUPERVISOR: 'supervisor',
  ENUMERATOR: 'enumerator',
  DATA_ENTRY_CLERK: 'data_entry_clerk',
  ASSESSOR: 'assessor',
  OFFICIAL: 'official',
  PUBLIC_USER: 'public_user',
} as const;

// Both API and Web import from here — never hardcode role strings
```

### 3.7 Logging

Pino structured logging with request correlation:

```typescript
import { logger } from './lib/logger';

logger.info({ staffId, action: 'deactivate' }, 'Staff member deactivated');
logger.error({ err, submissionId }, 'Failed to process submission');
```

### 3.8 ESM Module System

The entire project uses ES Modules:
- `"type": "module"` in all package.json files
- Use `import`/`export`, never `require()`
- For `__dirname` equivalent: `fileURLToPath(import.meta.url)`
- For `__filename` equivalent: `fileURLToPath(import.meta.url)`

---

## 4. Testing Strategy

### 4.1 Test Architecture

```
packages/testing/          # Shared test utilities
├── factories/             # Test data factories
├── helpers/               # Common test helpers
└── setup/                 # Global test setup

apps/api/src/
├── __tests__/             # Integration tests (with DB)
├── services/__tests__/    # Service unit tests
└── controllers/__tests__/ # Controller tests (mocked services)

apps/web/src/
└── features/<name>/
    └── __tests__/         # Co-located with feature code
```

### 4.2 Test Naming Convention

```typescript
describe('StaffService', () => {
  describe('createStaff', () => {
    it('should create a staff member with valid input', async () => {});
    it('should throw VALIDATION_ERROR for duplicate email', async () => {});
    it('should enforce LGA lock for field roles', async () => {});
  });
});
```

### 4.3 Mock Pattern (Frontend)

```typescript
// The vi.hoisted + vi.mock pattern — use consistently
const mockNavigate = vi.hoisted(() => vi.fn());
const mockToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual('react-router-dom')),
  useNavigate: () => mockNavigate,
}));

vi.mock('@/lib/toast', () => ({ toast: mockToast }));
```

### 4.4 CI Pipeline (5 Stages)

```
1. Lint + Type Check    → Fast fail on obvious errors
2. Build                → Verify compilation
3. Unit Tests           → packages/utils, packages/testing (parallel)
4. Integration Tests    → apps/api (needs Postgres + Redis services)
5. Component Tests      → apps/web (parallel with API tests)
```

Target: **Under 5 minutes** total CI time.

### 4.5 Three-Layer Quality Strategy

| Layer | What | Who | When |
|-------|------|-----|------|
| Unit/Integration | Logic correctness, edge cases | Developer | Every story |
| E2E (Playwright) | Wired-up system flows | Developer + TEA | Every 2-3 stories |
| Structured UAT | Real user flows, UX gaps | Product Owner | After each epic |

**Key insight:** Unit tests passing does NOT mean the system works. The RBAC bug proved that 53 passing tests can coexist with 3 broken roles.

---

## 5. BMAD Workflow Patterns

### 5.1 What is BMAD

BMAD (BMM Agent-Driven) is a workflow framework for managing software projects with AI agents. Each agent has a specialized role (PM, Architect, Dev, Scrum Master, etc.) and workflows orchestrate their collaboration.

### 5.2 Key Workflows Used

| Workflow | When to Use | Output |
|----------|-------------|--------|
| `create-product-brief` | Project kickoff | Product brief document |
| `create-prd` | After brief approval | PRD with requirements |
| `create-architecture` | After PRD | Architecture decisions document |
| `create-ux-design` | After PRD (if UI exists) | UX specification |
| `create-epics-and-stories` | After architecture | Epics file with all stories |
| `sprint-planning` | Before implementation | sprint-status.yaml |
| `create-story` | Start of each story | Story file with ACs + tasks |
| `dev-story` | Implementation | Code + tests |
| `code-review` | After implementation | Review findings + fixes |
| `retrospective` | After epic completion | Retro document + action items |
| `correct-course` | When plans need changing | SCP document |

### 5.3 Sprint Status Tracking

```yaml
# sprint-status.yaml — Single source of truth for progress
development_status:
  epic-1: done
  1-1-story-slug: done
  1-2-story-slug: done
  epic-2: in-progress
  2-1-story-slug: done
  2-2-story-slug: in-progress
  2-3-story-slug: backlog
```

Status flow: `backlog → ready-for-dev → in-progress → review → done`

Special status: `superseded` — story replaced by course correction (code removed or never needed)

### 5.4 Story File Format

Each story lives in `_bmad-output/implementation-artifacts/` with:
- Acceptance criteria (numbered, testable)
- Task breakdown (checkboxes)
- Technical notes and dependencies
- Definition of done

### 5.5 Course Correction Process

When you need to change direction mid-sprint:
1. Write a **Sprint Change Proposal (SCP)** documenting: what changed, why, impact analysis, files affected
2. Get team review (or self-review for solo projects)
3. Mark affected stories as `superseded` in sprint-status.yaml
4. Add new stories to replace them
5. Reference the SCP in the retrospective

### 5.6 Retrospective Structure

What we found works:
1. **Review previous retro action items** first (accountability)
2. **Metrics:** stories completed, velocity, test counts, review pass rate
3. **What went well** — reinforce good patterns
4. **What could be improved** — honest assessment
5. **Decisions made** — document with context, options considered, rationale
6. **Action items** — prioritized, assigned to specific stories/owners
7. **Documents updated** — keep docs in sync

---

## 6. Anti-Patterns & Traps

### 6.1 Forbidden Practices (From Project Context)

| Anti-Pattern | Why | Do This Instead |
|--------------|-----|-----------------|
| `any` type | Defeats TypeScript's purpose | Use proper types or `unknown` |
| `console.log` in production | Unstructured, no levels | Use Pino logger |
| Raw SQL strings | SQL injection risk | Use Drizzle query builder |
| `npm` or `npx` | Wrong package manager | Always use `pnpm` |
| Hardcoded role strings | Frontend/backend mismatch | Import from `packages/types` |
| `git push --force` to main | Destroys history | Feature branches + PR |
| Skip code review | Misses 3-13 issues per story | Always review before merge |
| Bottom-up integration | Builds plumbing before validating the pipe works | Spike the full path first |

### 6.2 Common Traps

**Trap: "The tests pass so it works"**
Unit tests validate logic in isolation. They don't validate wiring. Always complement with integration/E2E tests.

**Trap: "Let me just add one more thing to this story"**
Scope creep is the #1 velocity killer. If it wasn't in the original ACs, it's a new story.

**Trap: "We'll clean that up later"**
Track tech debt explicitly. "Later" means "never" unless it's in a story file.

**Trap: "The external service works in their docs"**
Docs show the happy path. Spike the actual integration with your actual data. Our ODK Central docs said preview works — it didn't for any form we uploaded.

**Trap: "This is a simple story, no need to plan"**
Story 2.5-3 looked simple. Exploded to 21 tasks. Always do task breakdown before coding.

---

## 7. Decision Framework

### 7.1 When to Spike

Spike first if ANY of these are true:
- External API/service you haven't used before
- Technology the team hasn't shipped with before
- The user-facing result depends on something you can't test locally
- You're building an adapter/integration layer

### 7.2 When to Split a Story

Split if ANY of these are true:
- Task count exceeds 15
- Story touches more than 3 database tables
- Story requires both new API endpoints AND new UI pages
- Two developers could work on different halves independently

### 7.3 When to Course-Correct

Write an SCP if ANY of these are true:
- External dependency is fundamentally broken
- Technical approach proven unviable after spike
- Requirements changed significantly (not just refinement)
- Cost of continuing exceeds cost of pivoting

### 7.4 When to Escalate to UAT

Schedule UAT if ANY of these are true:
- New user-facing flow completed
- Role-based access changes deployed
- Data flows from input to display for the first time
- Third epic in a row without product owner verification

---

## Appendix: Quick-Start Checklist for New Projects

### Day 1: Foundation
- [ ] Initialize monorepo with pnpm workspaces + Turborepo
- [ ] Set up `packages/types` for shared contracts
- [ ] Set up `packages/utils` for shared utilities
- [ ] Configure ESLint + Prettier + TypeScript across all packages
- [ ] Set up Vitest with co-located test pattern
- [ ] Create CI pipeline (lint → build → test)
- [ ] Initialize BMAD (`_bmad/` + `_bmad-output/`)

### Day 2: Backend Skeleton
- [ ] Express app with error middleware
- [ ] Drizzle ORM + migration system
- [ ] AppError class with typed error codes
- [ ] Pino structured logging
- [ ] Health check endpoint
- [ ] First database migration (users table)
- [ ] Dev seed script with test users

### Day 3: Frontend Skeleton
- [ ] Vite + React + TanStack Router
- [ ] API client with auth interceptor
- [ ] Auth context + protected routes
- [ ] First feature directory (`features/auth/`)
- [ ] TanStack Query setup
- [ ] Component test setup with vitest + testing-library

### Day 4: Auth + RBAC
- [ ] JWT + refresh token flow
- [ ] `authorize()` middleware with role checking
- [ ] Login/logout pages
- [ ] Role-based route guards
- [ ] RBAC matrix tests (roles x routes)
- [ ] Seed script with test users for each role

### Day 5: BMAD Planning
- [ ] Product brief → PRD → Architecture → UX Design
- [ ] Epic + story breakdown
- [ ] Sprint status file
- [ ] First story ready for dev

---

*This playbook is a living document. Update it as you learn from each new project.*
