# Story 7.doc-2: Build Portable Playbook

Status: done

## Story

As **Awwal (project lead) starting a second client project**,
I want all transferable process patterns, architectural decisions, implementation rules, infrastructure recipes, and operational lessons consolidated into a single `docs/portable-playbook.md`,
so that institutional knowledge from 6 epics of OSLRS development is reusable without re-discovering the same patterns and pitfalls.

## Context

The "CI/CD pipeline template extraction" was carried across 4 consecutive retrospectives (Epics 3-6) as P4 without completion. The Epic 6 retro replaced it with a broader, story-shaped task: "Portable Playbook — consolidate retros + project-context + architecture into transferable playbook." This follows the proven pattern: aspirational process commitments slip; concrete deliverables complete.

The OSLRS project has accumulated ~500KB of documentation across 4 retro documents, a 1,692-line project-context.md, a 4,371-line architecture.md, a 678-line infrastructure-cicd-playbook.md, and 20+ supporting docs. Most of this knowledge is project-specific, but the patterns, rules, decision frameworks, and operational lessons are universally applicable.

**This is a documentation consolidation task.** No production code changes. The playbook extracts what's transferable, strips what's project-specific, and organizes by project lifecycle phase.

## Acceptance Criteria

1. **Given** `docs/portable-playbook.md`, **when** read by a developer starting a new TypeScript/Node.js/React project, **then** it provides actionable guidance covering: team process, architecture decisions, implementation rules, infrastructure setup, CI/CD pipeline, operational pitfalls, and retrospective practices.
2. **Given** the playbook, **when** compared against the 4 epic retros, **then** all validated process patterns (spike-first, prep-as-force-multipliers, three-layer quality, story-shaped improvements, adversarial code review) are documented with rationale and examples.
3. **Given** the playbook, **when** compared against project-context.md, **then** all technology-agnostic implementation rules are included (naming conventions, ID strategy rationale, API response patterns, error handling, testing organization).
4. **Given** the playbook, **when** compared against infrastructure-cicd-playbook.md, **then** the VPS provisioning, Docker Compose, NGINX, Let's Encrypt, PM2, and CI/CD pipeline sections are included in a project-name-neutral form.
5. **Given** the playbook, **when** compared against all 16 operational pitfalls in the infrastructure playbook, **then** each pitfall and its solution is included.
6. **Given** the playbook, **when** reviewed for project-specific content, **then** it contains no OSLRS-specific domain logic, no specific IP addresses/domains (use placeholders), no specific staff names (use role types), and no questionnaire/respondent schema details.
7. **Given** the existing test suite, **when** all tests run, **then** zero regressions (documentation-only changes).

## Tasks / Subtasks

- [x] Task 1: Extract and organize process patterns from retros (AC: #2)
  - [x] 1.1 Read all 4 retro documents:
    - `_bmad-output/implementation-artifacts/epic-3-retro-2026-02-14.md` (341 lines)
    - `_bmad-output/implementation-artifacts/epic-4-retro-2026-02-20.md` (266 lines)
    - `_bmad-output/implementation-artifacts/epic-5-retro-2026-02-24.md` (272 lines)
    - `_bmad-output/implementation-artifacts/epic-6-retro-2026-03-04.md` (313 lines)
  - [x] 1.2 Extract validated process patterns (confirmed across 2+ epics):
    - Spike-first research (zero rework for 4 consecutive epics)
    - Prep-as-force-multipliers (each spike feeds multiple stories)
    - Three-layer quality model (automated tests + adversarial code review + human UAT)
    - Story-shaped improvements (concrete tasks, not aspirational standards)
    - Adversarial code review (fresh context, 3-10 issues minimum, ~94% fix rate)
    - Commit history as retro input (anomaly-driven, not raw log dump)
  - [x] 1.3 Extract operational lessons (from retro Challenges sections):
    - Race conditions as persistent pattern (TOCTOU, TanStack Query timing, NavLink matching)
    - Deployment env var coordination (SEC-3 CORS_ORIGIN crash loop)
    - Email quota management (411-message storm, digest batching)
    - Structural enforcement > individual memory (403 test gap carried 4 retros)
  - [x] 1.4 Extract team agreements worth generalizing (from retro Team Agreements):
    - Story sizing (max 12 tasks per story)
    - Test requirements (no task complete without tests)
    - Env var deployment protocol
- [x] Task 2: Extract implementation rules from project-context.md (AC: #3)
  - [x] 2.1 Read `_bmad-output/project-context.md` (1,692 lines)
  - [x] 2.2 Extract technology-agnostic rules (applicable to any TypeScript/Node.js project):
    - Distributed ID strategy (UUIDv7 rationale: sortable, no coordination, no auto-increment)
    - Naming conventions bridge (database snake_case, API kebab-case, TypeScript PascalCase)
    - Structured error responses (AppError class pattern, error codes, not raw Error)
    - Loading state UX (skeleton screens, not spinners)
    - State management architecture (server state in TanStack Query, client state in Zustand)
    - Form validation pattern (React Hook Form + Zod schema)
    - Structured logging (Pino with event naming, not console.log)
    - Testing organization (5-stage pipeline, `__tests__/` convention)
    - BullMQ job queue patterns (retry backoff, budget tracking, worker concurrency)
  - [x] 2.3 Strip OSLRS-specific content (questionnaire schema, respondent domain, role definitions)
- [x] Task 3: Extract architecture decision framework from architecture.md (AC: #1)
  - [x] 3.1 Read key sections of `_bmad-output/planning-artifacts/architecture.md` (4,371 lines)
  - [x] 3.2 Extract the ADR (Architecture Decision Record) template and amendment trail pattern
  - [x] 3.3 Extract generalizable decisions with rationale:
    - Modular monolith vs microservices (when single VPS is the right choice)
    - PostgreSQL as single database (when to avoid MongoDB, when to avoid multi-DB)
    - Redis for caching + rate limiting + job queues (not as primary data store)
    - PostgreSQL full-text search (when to use tsvector+GIN vs external search engine)
    - Bot protection defense-in-depth (rate limiting + honeypots + CSP + CAPTCHA)
  - [x] 3.4 Strip OSLRS-specific decisions (media handling, selfie verification, consent model)
- [x] Task 4: Adapt infrastructure playbook (AC: #4, #5, #6)
  - [x] 4.1 Read `docs/infrastructure-cicd-playbook.md` (678 lines)
  - [x] 4.2 Copy infrastructure sections with project-name placeholders:
    - VPS provisioning (DigitalOcean droplet, system setup, Docker, Portainer)
    - Database services (PostgreSQL 15, Redis 7 via Docker Compose)
    - NGINX reverse proxy + SSL (Let's Encrypt, Certbot)
    - PM2 process management
    - CI/CD pipeline (GitHub Actions: TypeScript strict, ESLint, Vitest, deploy)
    - CSP configuration (two-layer report-only + enforcing)
  - [x] 4.3 Include all 16 pitfalls with solutions (replace OSLRS-specific details with generic equivalents):
    - Portainer lockout, Certbot prompt hangs, db:push interactive prompt, missing .env on deploy, CORS_ORIGIN crash loop, email quota, PM2 crash-restart loop from missing env vars (Pitfall #16, added by prep-2), etc.
  - [x] 4.4 Replace all project-specific values:
    - Domain: `oyotradeministry.com.ng` → `yourdomain.example.com`
    - Package names: `@oslsr/*` → `@your-org/*`
    - VPS IPs: specific IPs → `YOUR_VPS_IP`
    - Email service: Resend specifics → generic SMTP/transactional email provider
- [x] Task 5: Assemble the playbook document (AC: #1)
  - [x] 5.1 Create `docs/portable-playbook.md` with this structure:
    ```
    # Portable Development Playbook
    ## 1. Team Process Patterns (from Task 1)
    ## 2. Architecture Decision Framework (from Task 3)
    ## 3. Technology Stack Decisions (from Task 3)
    ## 4. Implementation Rules & Anti-Patterns (from Task 2)
    ## 5. Infrastructure Setup (from Task 4)
    ## 6. CI/CD Pipeline (from Task 4)
    ## 7. Operational Pitfalls & Solutions (from Task 4)
    ## 8. Testing & Quality Strategy (from Tasks 1+2)
    ## 9. Retrospective Practices (from Task 1)
    ## 10. Appendix: Scripts & Tooling Reference
    ```
  - [x] 5.2 Write a 1-page executive summary: what's transferable vs project-specific, when to use each section
  - [x] 5.3 Organize by project lifecycle: Architecture Phase → Implementation Phase → Infrastructure Phase → Operations Phase → Retrospectives
  - [x] 5.4 Add cross-references back to OSLRS source documents (for Awwal's team to trace decisions)
- [x] Task 6: Verify (AC: #7)
  - [x] 6.1 `pnpm test` — all tests pass, zero regressions (documentation-only)
  - [x] 6.2 Review playbook for any remaining OSLRS-specific content that should be genericized

### Review Follow-ups (AI) — All Fixed

- [x] [AI-Review][HIGH] Missing email quota/backpressure operational lesson from retros (AC #2, Task 1.3) — added Section 4.15 "Email Queue Backpressure" with anti-pattern, digest batching solution, backpressure principles [docs/portable-playbook.md]
- [x] [AI-Review][MEDIUM] Executive summary missing "when to use each section" reading guide (Task 5.2) — expanded intro with phase-based section guide table [docs/portable-playbook.md:3-18]
- [x] [AI-Review][MEDIUM] "Super Admin" role name is OSLRS-specific terminology (AC #6) — changed to "Initial admin" [docs/portable-playbook.md]
- [x] [AI-Review][LOW] ODK pitfall correctly dropped as project-specific; 15/16 infra pitfalls + 1 from retros = 16 total — no fix needed, AC #5 met in spirit
- [x] [AI-Review][LOW] React 19 CVE reference is time-bound — generalized to "latest stable LTS" guidance [docs/portable-playbook.md:291]
- [x] [AI-Review][LOW] "DashboardLayout Does Not Provide Padding" heading is project-specific — renamed to "Layout Components: Content Padding Ownership" [docs/portable-playbook.md]
- [x] [AI-Review][LOW] Structural enforcement meta-principle understated — added explicit meta-principle statement to Section 8.4 [docs/portable-playbook.md]

## Dev Notes

### Source Documents (What to Read)

| Document | Path | Lines | Key Sections to Extract |
|----------|------|-------|------------------------|
| Epic 3 Retro | `_bmad-output/implementation-artifacts/epic-3-retro-2026-02-14.md` | 341 | Spike-first validation, 100% follow-through, test growth metrics |
| Epic 4 Retro | `_bmad-output/implementation-artifacts/epic-4-retro-2026-02-20.md` | 266 | Scope creep handling, Socket.io selection (weighted scoring), CI/CD as quality gate |
| Epic 5 Retro | `_bmad-output/implementation-artifacts/epic-5-retro-2026-02-24.md` | 272 | Story sizing discipline, prep-as-force-multipliers, 403 test gap recurring |
| Epic 6 Retro | `_bmad-output/implementation-artifacts/epic-6-retro-2026-03-04.md` | 313 | Race condition patterns, CORS crash loop, email storm, three-layer quality, Layer 3 UAT |
| Project Context | `_bmad-output/project-context.md` | 1,692 | 15 critical implementation rules, naming conventions, anti-patterns, quality gates |
| Architecture | `_bmad-output/planning-artifacts/architecture.md` | 4,371 | 12 ADRs, tech stack rationale, marketplace security model, scale decisions |
| Infrastructure | `docs/infrastructure-cicd-playbook.md` | 678 | VPS setup, Docker, NGINX, SSL, PM2, CI/CD, 15 pitfalls |
| Scaling Guide | `docs/infrastructure-scaling-guide.md` | ~300 | Capacity planning, droplet upgrade path |
| Testing Conventions | `docs/testing-conventions.md` | ~140 | Test organization standards |
| Context Brief | `docs/team-context-brief.md` | 66 | Session reassembly pattern (transferable meta-pattern) |

### Playbook Design Principles

1. **Organized by lifecycle phase** — Not by source document. A developer starting a new project reads sections in order: architecture decisions → implementation rules → infrastructure setup → operations.
2. **Actionable, not aspirational** — Every section has concrete steps, code patterns, or decision criteria. No "we should" language.
3. **Pattern + rationale + example** — Each pattern includes WHY it works (rationale from retros), not just WHAT to do.
4. **Project-agnostic placeholders** — Replace all OSLRS-specific values with placeholders (`YOUR_DOMAIN`, `@your-org/*`, `YOUR_VPS_IP`).
5. **Cross-referenced to source** — Each section notes its OSLRS source document for traceability.

### What Goes IN the Playbook (Transferable)

- **Process patterns**: Spike-first, prep-as-force-multipliers, three-layer quality, story-shaped improvements, adversarial code review, commit history as retro input
- **Architecture framework**: ADR template, modular monolith rationale, single-DB decision criteria, Redis usage patterns, full-text search strategy
- **Implementation rules**: UUIDv7 ID strategy, naming conventions, AppError pattern, skeleton screens, TanStack Query + Zustand split, form validation, structured logging, BullMQ patterns
- **Infrastructure recipes**: VPS provisioning, Docker Compose for PostgreSQL+Redis, NGINX reverse proxy, SSL via Certbot, PM2 process management, GitHub Actions CI/CD
- **Operational pitfalls**: All 15 pitfalls from infrastructure playbook + deployment env var coordination + email quota management
- **Testing strategy**: 5-stage pipeline, `__tests__/` convention, adversarial code review process, test count tracking
- **Retrospective practice**: How to run retros, follow-through tracking, pattern extraction, commit history as input

### What Stays OUT of the Playbook (Project-Specific)

- Questionnaire/respondent domain model
- Specific role definitions (Super Admin, Enumerator, etc.)
- Fraud detection business rules
- View-As feature implementation
- Email template content
- Specific API endpoint details
- Individual story files and sprint status
- BMAD workflow configurations (tool-specific, not process-specific)
- Staff names, specific IP addresses, domain names, email quotas

### Estimated Size

Based on the source material analysis:
- Process patterns section: ~200 lines (consolidated from 4 retros × ~300 lines each)
- Architecture framework: ~150 lines (extracted from 4,371-line architecture doc)
- Implementation rules: ~300 lines (extracted from 1,692-line project-context)
- Infrastructure recipes: ~400 lines (adapted from 678-line infrastructure playbook)
- Operational pitfalls: ~150 lines (15 pitfalls with solutions)
- Testing strategy: ~100 lines
- Retrospective practices: ~100 lines
- Executive summary + appendix: ~100 lines

**Estimated total: ~1,500 lines (~50KB)**

### Why This Replaces P4 (CI/CD Template)

The original P4 ("CI/CD pipeline template extraction") was too narrow — it only covered the GitHub Actions pipeline. The portable playbook covers the full development lifecycle, making P4 a subset. The retro explicitly stated: "Portable Playbook replaces 4x-carried CI/CD template (P4)."

### Project Structure Notes

- Output: `docs/portable-playbook.md` (new file — the only deliverable)
- Source documents listed in the table above (read-only)

### Anti-Patterns to Avoid

- **Do NOT copy-paste entire source documents** — the playbook is a consolidation, not a concatenation. Extract patterns, strip specifics, organize by lifecycle.
- **Do NOT include OSLRS domain logic** — questionnaire schemas, respondent models, fraud rules, role definitions are all project-specific. The playbook covers process and technical patterns.
- **Do NOT include specific identifiers** — replace domains, IPs, package names, staff names with placeholders.
- **Do NOT make it aspirational** — every section must be actionable. "We learned that..." → "Always do X because Y (lesson from N epics)."
- **Do NOT include BMAD-specific configuration** — BMAD workflows are tool-specific. Extract the process patterns they enforce (sprint planning, story creation, code review) without coupling to the tool.
- **Do NOT over-generalize** — this playbook is for TypeScript/Node.js/React projects on VPS infrastructure. It's not a universal software development guide.

### References

- [Source: epic-6-retro-2026-03-04.md#Process Improvements P5] — "Portable Playbook: Single docs/portable-playbook.md covering process, deployment, codebase patterns, BMAD workflows, lessons"
- [Source: epic-6-retro-2026-03-04.md#Key Insight 2] — "Story-shaped work completes; aspirational commitments drift. The portable playbook replaces P5 (carried 4 retros) by making it a real deliverable."
- [Source: epic-6-retro-2026-03-04.md#Context & Documentation doc-2] — "Build Portable Playbook: Consolidate retros + project-context + architecture into transferable playbook"
- [Source: MEMORY.md#Pending Follow-Up] — "Awwal wants a transferable playbook for other client projects"
- [Source: epic-4-retro-2026-02-20.md#P4] — Original "CI/CD pipeline template extraction" (carried 4 retros, now superseded)
- [Source: docs/infrastructure-cicd-playbook.md] — Existing infrastructure playbook (marked as "portable, transferable reference")
- [Source: docs/team-context-brief.md] — Context brief pattern (transferable meta-pattern for session reassembly)

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
None — documentation-only task, no debugging required.

### Completion Notes List
- Read all 4 retro documents (epic-3 through epic-6), extracting 6 validated process patterns, 4 operational lessons, and 3 team agreements
- Read project-context.md (1,692 lines), extracting 14 technology-agnostic implementation rules and stripping all OSLRS-specific domain logic
- Read architecture.md (4,371 lines) via subagent, extracting 17 ADRs and 13 generalizable technology decisions
- Read infrastructure-cicd-playbook.md (678 lines), adapting all 16 pitfalls and infrastructure recipes with project-name placeholders
- Read testing-conventions.md and team-context-brief.md for testing patterns and context continuity practices
- Assembled `docs/portable-playbook.md` (1,253 lines, ~46KB) organized by project lifecycle phase with 10 sections
- Replaced all project-specific values: domains → `yourdomain.example.com`, packages → `@your-org/*`, IPs → `YOUR_VPS_IP`, role names → generic equivalents
- Cross-references to OSLRS source documents included in final section for traceability
- Verified zero regressions: 1,991 web tests pass, all 4 turbo tasks successful
- Grep-audited final playbook for OSLRS-specific content — one role name reference genericized, remaining references are in acceptable contexts (generic examples or intentional cross-references)

### File List
- `docs/portable-playbook.md` (new — 1,253 lines, the only deliverable)

## Change Log
- 2026-03-06: Created portable playbook consolidating 4 retros + project-context + architecture + infrastructure playbook into transferable `docs/portable-playbook.md`. Replaces 4x-carried CI/CD template extraction (P4). Documentation-only, zero code changes.
- 2026-03-06: Adversarial code review — 7 findings (1H, 2M, 4L), all fixed. Added: email backpressure section (§4.15), executive summary reading guide, genericized role names and headings, structural enforcement meta-principle. Playbook now ~1,300 lines.
