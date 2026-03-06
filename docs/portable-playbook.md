# Portable Development Playbook

> **Purpose:** Transferable process patterns, architecture decisions, implementation rules, infrastructure recipes, and operational lessons from 6 epics (23+ weeks) of TypeScript/Node.js/React development.
>
> **Audience:** Developer or team starting a new full-stack TypeScript project on VPS infrastructure.
>
> **What's transferable vs project-specific:** This playbook extracts universally applicable patterns. Domain-specific logic (questionnaires, fraud algorithms, role definitions) is excluded. Where examples are needed, project-specific values are replaced with `YOUR_DOMAIN`, `@your-org/*`, `YOUR_VPS_IP`, etc.
>
> **Source:** Consolidated from 4 epic retrospectives, 1,692-line project-context, 4,371-line architecture doc, 678-line infrastructure playbook, and 20+ supporting documents.
>
> **When to use each section:**
>
> | Your phase | Read these sections |
> |-----------|-------------------|
> | **Starting a project** — choosing stack, making architecture decisions | §1 Process Patterns, §2 Architecture Framework, §3 Tech Stack |
> | **Writing code** — implementing features, establishing conventions | §4 Implementation Rules, §8 Testing Strategy |
> | **Setting up infrastructure** — provisioning VPS, configuring CI/CD | §5 Infrastructure Setup, §6 CI/CD Pipeline, §7 Pitfalls |
> | **Operating in production** — debugging deployment issues, monitoring | §7 Pitfalls, §5.10 Daily Operations, §6.3 Pre-Deploy Check |
> | **Running a retrospective** — after an epic or milestone | §9 Retrospective Practices, §1 Process Patterns |
> | **Onboarding a new developer** — full end-to-end read | All sections in order |

---

## Table of Contents

1. [Team Process Patterns](#1-team-process-patterns)
2. [Architecture Decision Framework](#2-architecture-decision-framework)
3. [Technology Stack Decisions](#3-technology-stack-decisions)
4. [Implementation Rules & Anti-Patterns](#4-implementation-rules--anti-patterns)
5. [Infrastructure Setup](#5-infrastructure-setup)
6. [CI/CD Pipeline](#6-cicd-pipeline)
7. [Operational Pitfalls & Solutions](#7-operational-pitfalls--solutions)
8. [Testing & Quality Strategy](#8-testing--quality-strategy)
9. [Retrospective Practices](#9-retrospective-practices)
10. [Appendix: Scripts & Tooling Reference](#10-appendix-scripts--tooling-reference)

---

## 1. Team Process Patterns

_Validated across 4+ consecutive epics. These are the highest-leverage process innovations for shipping quality software._

### 1.1 Spike-First Research

**Pattern:** Before implementing any story that touches a new domain, technology, or integration, run a research spike as a prep task. The spike produces a design document with validated schema, algorithm choices, and architecture decisions.

**Why it works:**
- Zero rework for 4 consecutive epics when spikes were used
- Spike decisions held through implementation without architectural surprises
- Example: A WebSocket library spike (weighted scoring: Socket.io 4.80/5.00) produced zero-rework implementation for the most complex story in the epic
- Example: A fraud detection domain research spike produced complete schemas, types, and 27 seed records — all consumed directly by the implementation story

**When to spike:**
- New external integrations (payment gateways, OAuth providers, real-time messaging)
- New algorithmic domains (fraud detection, search ranking, geospatial clustering)
- Infrastructure decisions (offline storage, backup orchestration, monitoring)
- Performance-critical queries (validate at target scale before implementing)

**When NOT to spike:**
- CRUD operations on established patterns
- UI components following existing design system
- Bug fixes with clear root cause

**Spike output template:**
```markdown
# Spike: [Topic]
## Decision: [What we chose]
## Alternatives Evaluated: [What we rejected and why]
## Schema/Types: [Drizzle schema, TypeScript types, Zod schemas]
## Performance Validation: [Benchmarks at target scale]
## Implementation Notes: [Gotchas discovered during research]
```

_Source: Epic 3-6 retrospectives. "Spike-first is the team's most valuable and validated process innovation." (Epic 4 retro)_

---

### 1.2 Prep-as-Force-Multipliers

**Pattern:** Each epic starts with a prep phase of 5-11 tasks that build reusable infrastructure consumed by multiple stories. Prep tasks are story-shaped (concrete deliverables with acceptance criteria), not open-ended improvements.

**Why it works:**
- Prep tasks complete at 100% (story-shaped work)
- Each prep task feeds 1-5 downstream stories
- Example: An AuditService prep task was consumed by 5 stories in the same epic
- Example: An ExportService prep task was consumed by 2 stories
- Eliminates debt and uncertainty before the epic starts, enabling clean execution

**Prep task categories:**
| Category | Example | Priority |
|----------|---------|----------|
| Bug fixes from previous retro | Fix race condition on export page | HIGH |
| Research spikes | WebSocket library evaluation | HIGH |
| Schema/service foundations | Audit logging service | HIGH |
| Technical debt | ESLint rule enforcement | MEDIUM |
| Developer tooling | E2E test expansion | NICE-TO-HAVE |

**Anti-pattern:** Open-ended process improvements ("update coding standards", "improve test coverage") slip consistently. Frame improvements as concrete, deliverable, story-shaped tasks instead.

_Source: Epic 3-6 retrospectives. "Prep tasks served as force multipliers — every spike fed directly into story implementation." (Epic 6 retro)_

---

### 1.3 Three-Layer Quality Model

**Pattern:** Quality assurance operates through three independent layers, each catching different categories of issues.

| Layer | What It Catches | Who Does It | Automation |
|-------|----------------|-------------|------------|
| **Layer 1: Automated Tests** | Code bugs, regressions, type errors | CI pipeline | Fully automated |
| **Layer 2: Adversarial Code Review** | Architecture gaps, security holes, missing tests, anti-patterns | Fresh-context reviewer (different LLM or person) | Semi-automated |
| **Layer 3: Human UAT** | Integration issues, UX gaps, deployment problems, data visibility | Project lead / product owner on live system | Manual |

**Why all three layers are needed:**
- Layer 1 alone missed a critical form-completion bug that 1,602 tests didn't catch
- Layer 2 alone missed placeholder pages, email quota issues, and padding inconsistencies
- Layer 3 found security audit needs, missing features, and operational issues that no automated test could detect
- Bugs surfacing at Layer 3 is expected, not failure — the fix cycle is the contract

**Layer 2 specifics (Adversarial Code Review):**
- Fresh context is critical — use a different LLM or reviewer than implemented the code
- Must find 3-10 specific issues per story (never "looks good")
- ~94% fix rate standard across 4 epics (167 findings in final epic)
- Findings categorized: Critical, High, Medium, Low
- All Critical and High must be fixed before story completion

_Source: All 4 retrospectives. "Layer 3 human UAT by the context-holder is irreplaceable." (Epic 6 retro)_

---

### 1.4 Story-Shaped Improvements

**Pattern:** Frame all process changes as concrete, deliverable tasks with acceptance criteria — not aspirational standards. Story-shaped work completes at 100%; open-ended process commitments slip.

**Evidence:**
- Bug fixes (story-shaped): 100% completion across 4 epics
- Prep tasks (story-shaped): 100% completion across 4 epics
- Process standards ("add X to all stories"): ~40% completion — carried across multiple retros without resolution
- A CI/CD template extraction was carried across 4 consecutive retrospectives as an open-ended item. When reframed as a concrete "Portable Playbook" deliverable, it completed in one cycle.

**How to apply:**
- BAD: "We should always write 403 tests" → carried 4 retros without structural enforcement
- GOOD: "Create audit script that checks 403 test coverage per endpoint" → completed in 1 cycle
- BAD: "Improve test coverage" → vague, never done
- GOOD: "Write 14 Playwright tests for fraud UI, messaging, supervisor dashboard" → completed in 1 cycle

_Source: Epic 5-6 retrospectives. "Story-shaped work completes at 100%; open-ended process commitments drift." (Epic 6 retro)_

---

### 1.5 Adversarial Code Review Process

**Pattern:** Every story receives a structured adversarial review after implementation, before marking as done.

**Process:**
1. Developer marks story as "review" status
2. Reviewer loads story file + changed files with fresh context
3. Reviewer must find 3-10 specific issues (minimum — never "looks good")
4. Issues categorized by severity: Critical, High, Medium, Low
5. Developer addresses all Critical/High, most Medium, documents Low deferrals
6. Second review round if Critical issues found

**What the review catches (real examples):**
- Security holes: draft forms exposed via render endpoint, anti-enumeration leaks
- Unimplemented features: tasks marked done but code not written (5 occurrences in one epic)
- Missing tests: service tests marked complete with zero test files
- Race conditions: TOCTOU vulnerabilities in state transitions
- Dead code: unused middleware, stale imports

**Key rule:** Use a **different** LLM or reviewer than the one that implemented the story. Fresh context catches what familiarity blinds.

_Source: All 4 retrospectives. 590+ total findings across 4 epics, ~94-97% fix rate._

---

### 1.6 Commit History as Retro Input

**Pattern:** Story files capture the destination; commit trails capture the journey — false starts, CI failures, incident response. Use commit history as a supplementary retro input.

**Implementation:** Selective, anomaly-driven summary tool (not raw log dump):
- Group commits by story key
- Flag anomalies: high commit counts, `fix:` clusters, CI failure patterns
- Surface incidents invisible in story files (e.g., crash-restart loops only visible in commits)

**When to use:** Retrospectives, post-incident reviews, process improvement analysis.

_Source: Epic 6 retrospective. Proposed after discovering a CORS_ORIGIN crash loop was invisible in the story file but fully documented in commit history._

---

## 2. Architecture Decision Framework

### 2.1 ADR (Architecture Decision Record) Template

Document every significant architecture decision. Decisions have longer shelf life than code — they explain WHY the system is built the way it is.

```markdown
# ADR-NNN: [Title]

**Status:** [Proposed | Accepted | Amended | Superseded]
**Date:** YYYY-MM-DD
**Amended:** YYYY-MM-DD — [reason for amendment]

## Context
[What problem are we solving? What constraints exist?]

## Decision
[What we chose to do]

## Alternatives Considered
[What we rejected and why]

## Consequences
[What trade-offs we accept]

## Amendment Trail
- YYYY-MM-DD: [What changed and why]
```

**Key practices:**
- Number ADRs sequentially (ADR-001, ADR-002, ...)
- Never delete an ADR — mark as "Superseded by ADR-NNN" instead
- Include an amendment trail for decisions that evolve (e.g., removing a dependency)
- Reference ADR numbers in code comments, story files, and retro documents

### 2.2 Decision Criteria Framework

When evaluating technology choices, use weighted scoring:

| Criterion | Weight | Example Evaluation |
|-----------|--------|-------------------|
| Fits existing stack | 30% | Does it work with Node.js/TypeScript/pnpm? |
| Operational simplicity | 25% | Can it run on a single VPS? |
| Community/maintenance | 20% | Active development, good docs, npm downloads? |
| Performance at target scale | 15% | Meets SLA at expected load? |
| Cost | 10% | Hosting, licensing, operational overhead? |

_Source: Architecture.md ADR framework. Used for Socket.io selection (4.80/5.00 weighted score) and PostgreSQL vs MongoDB evaluation._

---

## 3. Technology Stack Decisions

_These are generalizable decisions with rationale. Adapt versions and specifics to your project._

### 3.1 Modular Monolith (Not Microservices)

**When to choose:** Single VPS deployment, small team (1-5 devs), budget constraints, data residency requirements.

**Rationale:**
- Eliminates inter-service network latency, service discovery, distributed tracing
- Single deployment unit — simpler CI/CD, monitoring, debugging
- Transaction boundaries stay within one process
- Scale vertically first (upgrade VPS) — cheaper and simpler than horizontal scaling
- Migrate to microservices later IF and WHEN scale demands it (premature distribution is the #1 architecture mistake for small teams)

### 3.2 PostgreSQL (Not MongoDB)

**When to choose:** Systems requiring strict data consistency, complex queries, ACID transactions, or UNIQUE constraint enforcement.

**Rationale:**
- **Race condition defense:** Database-level UNIQUE constraints are reliable. MongoDB's uniqueness is weaker in distributed mode.
- **ACID transactions:** Mature, proven implementation
- **Complex queries:** JOINs, CTEs, window functions, PostGIS for geospatial
- **Schema flexibility:** JSONB provides document-like storage without sacrificing guarantees
- **Full-text search:** tsvector + GIN index is sufficient for 300K-10M records without external search engines
- **Scale target:** If your scale is under 10M records, you almost certainly don't need MongoDB sharding

### 3.3 Redis (Sidecar, Not Cluster)

**When to choose:** Rate limiting, job queues (BullMQ), JWT blacklist, short-lived caching — on a single VPS.

**Rationale:**
- Single instance is sufficient for 1K concurrent users
- BullMQ requires Redis — using it for caching and rate limiting too avoids adding another dependency
- NOT a primary data store — all durable data in PostgreSQL

### 3.4 BullMQ (Not RabbitMQ)

**When to choose:** All job producers/consumers in the same Node.js process (modular monolith).

**Rationale:**
- Simpler than RabbitMQ for single-process architectures
- Redis persistence is adequate for job durability at this scale
- Built-in retry with exponential backoff, concurrency control, rate limiting
- Consider RabbitMQ if: microservices with polyglot consumers, complex routing topologies, strict message delivery guarantees

### 3.5 Drizzle ORM (Type-Safe, SQL-Like)

**When to choose:** TypeScript projects that want ORM convenience with SQL-level control.

**Rationale:**
- ~50KB bundle (vs Prisma's megabytes)
- SQL-like syntax — no query abstraction that hides what the database actually does
- Schema-as-code with migration generation
- Type-safe queries derived from schema definitions

### 3.6 Frontend Stack

| Choice | Why | Not |
|--------|-----|-----|
| React 18.x | Battle-tested stability, ecosystem | Prefer latest stable LTS; avoid freshly-released majors until ecosystem catches up |
| Vite | Fast HMR, ESM-native | Webpack (slow), CRA (deprecated) |
| Tailwind CSS | Utility-first, design system friendly | CSS modules (too verbose for rapid development) |
| shadcn/ui | Accessible Radix primitives, copy-paste ownership | Material-UI (opinionated, heavy), Chakra (less accessible) |
| TanStack Query | Server state management with caching | Redux (wrong abstraction for server state) |
| Zustand | UI-only state, minimal boilerplate | Redux (overkill for UI state) |
| React Hook Form + Zod | Validation shared between frontend/backend | Formik (heavier, less TypeScript integration) |

### 3.7 Infrastructure Stack

| Choice | Why |
|--------|-----|
| NGINX | Reverse proxy, SSL termination, static asset serving, rate limiting |
| Let's Encrypt + Certbot | Free, auto-renewing SSL certificates |
| PM2 | Node.js process management with auto-restart, cluster mode |
| Docker Compose | PostgreSQL + Redis containers (not the app itself — PM2 manages the Node process) |
| Portainer | Container management GUI (optional but useful for non-DevOps teams) |

_Source: Architecture.md ADRs 001, 007, 010, 011, 012, 013. Infrastructure playbook._

---

## 4. Implementation Rules & Anti-Patterns

### 4.1 Database ID Strategy: UUIDv7

**Rule:** All primary keys and foreign keys MUST use UUIDv7.

**Why UUIDv7 (not auto-increment, not UUIDv4):**
- **Time-ordered:** Better B-tree index performance than random UUIDv4
- **Offline-compatible:** Clients can generate IDs without server coordination
- **Privacy:** Non-sequential IDs don't leak record counts
- **Globally unique:** No central coordinator needed

```typescript
import { pgTable, uuid, timestamp } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

export const records = pgTable('records', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  createdAt: timestamp('created_at').defaultNow(),
});
```

**Forbidden:** `serial('id')`, `integer('id')`, UUIDv4 (`uuid` package).

### 4.2 Naming Conventions Bridge

| Context | Convention | Example |
|---------|-----------|---------|
| Database tables/columns | `snake_case` | `first_name`, `created_at` |
| API endpoints | `/kebab-case` | `/api/v1/user-profiles` |
| API query params | `camelCase` | `?lgaId=north&startDate=2026-01-01` |
| API response JSON | `camelCase` | `{ "firstName": "...", "lastName": "..." }` |
| TypeScript types/interfaces | `PascalCase` | `UserProfile`, `SearchResult` |
| TypeScript functions | `camelCase` | `validateInput()`, `fetchResults()` |
| TypeScript constants | `SCREAMING_SNAKE_CASE` | `MAX_RETRY_ATTEMPTS` |
| Files | `kebab-case` | `user-profile.service.ts` |
| Environment variables | `SCREAMING_SNAKE_CASE` | `DATABASE_URL`, `JWT_SECRET` |

### 4.3 Structured Error Responses (AppError Class)

**Rule:** Never throw raw `Error` objects. Always use a structured `AppError` class.

```typescript
export class AppError extends Error {
  constructor(
    public code: string,        // Machine-readable: 'VALIDATION_ERROR', 'NOT_FOUND'
    public message: string,     // Human-readable description
    public statusCode: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// Usage
throw new AppError('DUPLICATE_RECORD', 'A record with this ID already exists', 409, {
  existingId: record.id,
});
```

**Centralized error handler:**
```typescript
app.use((err, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      code: err.code,
      message: err.message,
      details: err.details,
    });
  }
  // Unknown errors — never expose stack traces
  res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
  });
});
```

### 4.4 Loading States: Skeleton Screens, Not Spinners

**Rule:** Use content-shaped skeleton screens to preserve layout during loading.

**Why:** Skeleton screens reduce perceived loading time, prevent Cumulative Layout Shift (CLS), and provide better UX for data-heavy applications.

```typescript
// CORRECT
if (isLoading) {
  return <SkeletonTable rows={5} columns={4} />;
}

// WRONG
if (isLoading) return <Spinner />;
```

### 4.5 State Management Split

**Rule:** Server state in TanStack Query, UI-only state in Zustand. Never mix.

```typescript
// CORRECT: Server data via TanStack Query
const { data: users } = useQuery({
  queryKey: ['users', filters],
  queryFn: () => fetchUsers(filters),
});

// CORRECT: UI-only state via Zustand
const useSidebarStore = create((set) => ({
  isCollapsed: false,
  toggle: () => set((s) => ({ isCollapsed: !s.isCollapsed })),
}));

// WRONG: Server data in Zustand
const useUsersStore = create((set) => ({
  users: [],  // This belongs in TanStack Query
}));
```

**TanStack Query key pattern:** `[domain, ...identifiers, ...filters]`

```typescript
['users', userId]                         // Single user
['users', userId, 'submissions']          // User's submissions
['records', { status: 'pending', page }]  // Filtered list
```

### 4.6 Form Validation: Single Source of Truth

**Rule:** Share Zod schemas between frontend and backend via a shared types package.

```typescript
// packages/types/src/validation/record.ts
export const createRecordSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().regex(/^\+\d{10,15}$/),
});

// Backend: import and validate
const validated = createRecordSchema.parse(req.body);

// Frontend: import and use with React Hook Form
const form = useForm({ resolver: zodResolver(createRecordSchema) });
```

### 4.7 Structured Logging (Pino)

**Rule:** Use structured JSON logging with event naming pattern `{domain}.{action}`.

```typescript
// CORRECT
logger.info({ event: 'user.login', userId, role });
logger.warn({ event: 'rate_limit.exceeded', ip, endpoint });
logger.error({ event: 'submission.failed', submissionId, error: err.message });

// WRONG
console.log('User logged in: ' + userId);       // Unstructured
logger.info('User logged in');                   // No event field
logger.error({ event: 'ERROR' });                // Too generic
```

### 4.8 API Response Format

**Standard success response:**
```json
{
  "data": { ... },
  "meta": {
    "pagination": {
      "pageSize": 20,
      "hasNextPage": true,
      "nextCursor": "2026-01-01T00:00:00.000Z|018e5f2a...",
      "totalItems": 150
    }
  }
}
```

**Standard error response:**
```json
{
  "code": "VALIDATION_ERROR",
  "message": "Invalid search parameters",
  "details": { "field": "email", "issue": "Invalid email format" }
}
```

**Date/time format:** Always ISO 8601 in APIs (`2026-01-03T14:30:00.000Z`). Always store as `TIMESTAMP` in PostgreSQL (UTC). Never use Unix timestamps (hard to debug).

### 4.9 ESM Import Convention (Backend)

**Rule:** TypeScript ESM modules require `.js` extensions in relative imports.

```typescript
// CORRECT — .js extension for relative imports
import { db } from '../db/index.js';
import { users } from '../db/schema/index.js';

// WRONG — will fail at runtime with "Cannot find module"
import { db } from '../db/index';

// Workspace imports work without extension
import { AppError } from '@your-org/utils';
```

**Why:** Node.js ESM loader does NOT auto-resolve extensions like CommonJS did. TypeScript does NOT rewrite import paths during compilation.

### 4.10 BullMQ Job Patterns

**Job naming:** `{domain}-{action}` (kebab-case)
```typescript
await queue.add('email-notification', { userId, template: 'welcome' });
await queue.add('data-export', { format: 'csv', filters });
```

**Retry configuration:** Exponential backoff
```typescript
queue.add('submission-ingestion', { submissionId }, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },  // 5s, 10s, 20s
});
```

### 4.11 Redis Cache Key Pattern

**Format:** `{domain}:{identifier}:{subresource}`

```typescript
`session:blacklist:${tokenJti}`
`rate_limit:ip:${ipAddress}`
`cache:profile:${profileId}`
```

### 4.12 Race Condition Anti-Patterns

Five recurring race condition patterns — consult this list before implementing any check-then-act, query-before-render, or state transition logic.

**Pattern 1: TanStack Query Default Data**
```typescript
// WRONG — crashes when data is undefined during initial render
const items = data.items.map(...)

// CORRECT — default empty array
const items = data?.items ?? [];
// Or destructure with default:
const { data: items = [] } = useQuery(...)
```

**Pattern 2: NavLink Exact Matching**
```typescript
// WRONG — /settings highlights for /settings/profile too
<NavLink to="/settings">Settings</NavLink>

// CORRECT — use end={true} for exact matching
<NavLink to="/settings" end={true}>Settings</NavLink>
```

**Pattern 3: TOCTOU in Database Operations**
```typescript
// WRONG — race condition between check and act
const count = await db.select().from(admins).where(eq(admins.active, true));
if (count.length <= 1) throw new Error('Cannot delete last admin');
await db.delete(admins).where(eq(admins.id, targetId));

// CORRECT — check inside transaction with row locking
await db.transaction(async (tx) => {
  const admins = await tx.select().from(users)
    .where(eq(users.role, 'admin'))
    .for('update');  // Lock rows
  if (admins.length <= 1) throw new AppError('LAST_ADMIN', '...', 400);
  await tx.delete(users).where(eq(users.id, targetId));
});
```

**Pattern 4: Governance Guards**
- Count checks (e.g., "is this the last admin?") MUST be inside the same transaction as the mutation
- Use `SELECT FOR UPDATE` to prevent concurrent modifications

**Pattern 5: State Machine Transitions**
- State transitions (e.g., `pending` → `approved`) must check current state inside a transaction
- Reject invalid transitions at the database level

_Source: project-context.md "Race Condition Anti-Patterns" section. 5 documented patterns with real file references across 4 epics._

### 4.13 Frontend Feature Directory Structure

**Feature-based organization (not page-based):**
```
apps/web/src/features/
  marketplace/
    api/
      marketplace.api.ts
    hooks/
      useMarketplace.ts
    components/
      SearchBar.tsx
      ResultsGrid.tsx
    pages/
      MarketplaceSearchPage.tsx
    __tests__/
      MarketplaceSearchPage.test.tsx
```

### 4.14 Layout Components: Content Padding Ownership

**Rule:** Layout wrapper components (e.g., `DashboardLayout`) provide structure (sidebar, header, navigation) but NOT content padding. Every page must add its own padding (e.g., `p-6`) to its outermost wrapper div. This prevents layout shifts and gives pages control over full-bleed content.

```typescript
// Every dashboard page:
<div className="p-6 space-y-6">
  <h1>Page Title</h1>
  {/* content */}
</div>
```

_Source: project-context.md. This was a recurring bug across multiple epics._

### 4.15 Email Queue Backpressure

**Anti-pattern:** Sending individual transactional emails for every event (e.g., one email per submission, per status change, per alert). At scale, this exhausts your email provider's quota — a 411-message storm in a single day can burn through monthly limits on starter plans.

**Solution — Digest batching + quota awareness:**

```typescript
// WRONG — one email per event
worker.on('submission.created', async (job) => {
  await emailService.send({ to: supervisor, subject: 'New submission', ... });
});

// CORRECT — batch into periodic digests
// Accumulate events, send digest every N minutes or N events
await queue.add('email-digest', { recipientId: supervisor.id }, {
  repeat: { every: 15 * 60 * 1000 },  // Every 15 minutes
  jobId: `digest-${supervisor.id}`,     // Deduplicate per recipient
});

// In the digest worker:
// 1. Query all unsent notifications for this recipient
// 2. Group by type (submissions, alerts, status changes)
// 3. Send ONE email with all updates
// 4. Mark notifications as sent
```

**Backpressure principles:**
1. **Monitor provider quotas** — Track daily/monthly send counts against your plan limits
2. **Batch by default** — Individual emails only for time-critical events (password resets, 2FA codes)
3. **Degrade gracefully** — When approaching quota limits, increase digest intervals rather than dropping messages
4. **Log send counts** — `logger.info({ event: 'email.digest_sent', recipientId, messageCount, dailyTotal })`

**When this matters:** Any project using a transactional email provider (Resend, SendGrid, Postmark) with event-driven notifications. Starter plans typically cap at 100-1,000 emails/day.

_Source: Epic 6 retrospective. A 411-message email storm during production UAT exhausted the daily quota, leading to the backpressure implementation (prep-7)._

---

## 5. Infrastructure Setup

_Adapt all domain names, IP addresses, package names, and credentials to your project._

### 5.1 VPS Provisioning

**Provider:** DigitalOcean, Hetzner, or equivalent VPS provider.

```bash
# SSH into droplet
ssh root@YOUR_VPS_IP

# System update + essentials
apt update && apt upgrade -y
apt install -y curl wget git vim htop ufw

# Firewall
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 9443/tcp    # Portainer (optional)
ufw enable
```

### 5.2 Install Docker

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
```

### 5.3 Install Node.js 20 + pnpm + PM2

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g pnpm pm2
```

### 5.4 Install NGINX + Certbot

```bash
apt install -y nginx certbot
```

### 5.5 SSL Certificate (Let's Encrypt)

```bash
systemctl stop nginx
certbot certonly --standalone -d yourdomain.example.com -d www.yourdomain.example.com
certbot renew --dry-run
systemctl start nginx
```

### 5.6 Database Services (Docker)

```bash
# PostgreSQL 15
docker run -d --name app-postgres \
  -p 5432:5432 \
  -e POSTGRES_DB=app_db \
  -e POSTGRES_USER=app_user \
  -e POSTGRES_PASSWORD=STRONG_PASSWORD_HERE \
  -v postgres_data:/var/lib/postgresql/data \
  --restart=always \
  postgres:15-alpine

# Redis 7
docker run -d --name app-redis \
  -p 6379:6379 \
  -v redis_data:/data \
  --restart=always \
  redis:7-alpine
```

### 5.7 NGINX Configuration

```nginx
# /etc/nginx/sites-available/app
# HTTP -> HTTPS redirect
server {
    listen 80;
    server_name yourdomain.example.com www.yourdomain.example.com;
    return 301 https://$server_name$request_uri;
}

# Main HTTPS server
server {
    listen 443 ssl;
    server_name yourdomain.example.com www.yourdomain.example.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.example.com/privkey.pem;

    # Frontend — serve static React build
    root /var/www/app;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;  # SPA routing fallback
    }

    # API reverse proxy
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket proxy (if using Socket.IO)
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
    gzip_min_length 1000;
}
```

```bash
ln -s /etc/nginx/sites-available/app /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx
```

### 5.8 Content Security Policy (Two-Layer)

**Architecture:** NGINX serves the SPA HTML, Express serves API responses. Both need CSP headers.

| Layer | Serves | CSP Source |
|-------|--------|------------|
| NGINX | SPA `index.html`, static assets | `add_header` directive |
| Express (Helmet) | API JSON responses | `helmet({ contentSecurityPolicy })` |

**`style-src 'unsafe-inline'` is typically required** because:
- Radix UI (react-style-singleton) injects `<style>` tags for scroll locking
- Chart libraries (Recharts) render SVG with inline styles
- Third-party widgets (hCaptcha, Google Identity) inject inline styles

This is an accepted tradeoff — inline styles cannot execute code (unlike inline scripts).

**Rollout strategy:** Start with `Content-Security-Policy-Report-Only` for 2 weeks, monitoring violations at a report endpoint. Switch to enforcing only after zero violations confirmed.

### 5.9 Deploy Application

```bash
cd ~
git clone https://github.com/YOUR_ORG/your-project.git
cd your-project
pnpm install

# Environment
cp .env.example .env
# Edit .env with production values

# Database
pnpm --filter @your-org/api db:push

# Build frontend (VITE_ vars are build-time only!)
VITE_API_URL=https://yourdomain.example.com/api/v1 pnpm --filter @your-org/web build

# Deploy frontend
mkdir -p /var/www/app
cp -r apps/web/dist/* /var/www/app/
chown -R www-data:www-data /var/www/app

# Start API with PM2
pm2 start "npx tsx src/index.ts" --name app-api --cwd ~/your-project/apps/api
pm2 save
pm2 startup
```

**Critical:** `VITE_API_URL` must be set at build time. Vite replaces `import.meta.env.VITE_*` during build, not at runtime. Without it, the frontend bakes in `http://localhost:3000` and all API calls fail with CORS errors in production.

### 5.10 Daily Operations

```bash
# Check status
pm2 status
docker ps
sudo systemctl status nginx

# View logs
pm2 logs app-api --lines 50
docker logs app-postgres
sudo tail -f /var/log/nginx/error.log

# Restart services
pm2 restart app-api
sudo systemctl restart nginx
docker restart app-postgres app-redis

# Manual redeploy
cd ~/your-project
git pull origin main
pnpm install
pnpm --filter @your-org/api db:push
VITE_API_URL=https://yourdomain.example.com/api/v1 pnpm --filter @your-org/web build
sudo cp -r apps/web/dist/* /var/www/app/
pm2 restart app-api
```

_Source: infrastructure-cicd-playbook.md (678 lines). All domain/IP values replaced with placeholders._

---

## 6. CI/CD Pipeline

### 6.1 Pipeline Architecture

```
Push to main (or PR)
        |
[lint-and-build]    pnpm install -> lint -> build -> upload artifacts
        |
        +-- triggers parallel jobs:
        |
[test-unit]  [test-api]  [test-web]  [test-e2e]  [lighthouse]
(utils)      (Postgres   (no deps)   (Playwright) (perf audit)
             + Redis)
        |
   [dashboard]    merge results -> HTML report -> GitHub summary
        |
     [deploy]     SSH -> git pull -> build -> copy -> pm2 restart
                  (main branch only, after tests pass)
```

### 6.2 What CI Checks

| Check | Tool | Purpose |
|-------|------|---------|
| TypeScript strict | `pnpm build` (tsc) | No type errors |
| ESLint | `pnpm lint` | Code style, test selector rules |
| Unit tests | Vitest (utils, testing) | Package-level tests |
| API tests | Vitest + Postgres + Redis | Integration tests with real DB |
| Web tests | Vitest + jsdom | Component + hook tests |
| E2E tests | Playwright | Browser automation (non-blocking) |
| Performance | Lighthouse CI | Performance, accessibility, SEO |
| DB migrations | `db:push:force` | Non-interactive schema push |
| Dependency audit | `pnpm audit` | Known CVE detection |

### 6.3 Pre-Deploy Env Var Check

**Prevents crash-restart loops** when code requires an env var not set on the VPS.

**How it works:**
1. CI extracts the latest check script and app entry point from `origin/main` on VPS
2. Runs the check script against the VPS `.env` file
3. If any required var is missing → deploy **aborts** (app is never restarted)
4. If all required vars present → deploy proceeds normally

**Adding a new required env var:**
1. Add the var name to the `requiredProdVars` array in your app entry point
2. **Before deploying:** SSH to VPS and add the var to `~/your-project/.env`
3. Deploy — the pre-deploy check validates the new var

**Critical rule:** Always set the var on VPS `.env` BEFORE deploying code that requires it.

### 6.4 Key CI Optimizations

1. **Turbo Remote Cache** — skip rebuilt packages
2. **Parallel matrix** — unit tests run in parallel per package
3. **PR change detection** — only test packages affected by the PR
4. **Artifact sharing** — build once, test in parallel jobs
5. **Concurrency cancellation** — cancel in-progress runs for same branch

### 6.5 GitHub Secrets Required

| Secret | Value | Purpose |
|--------|-------|---------|
| `VPS_HOST` | VPS IP address | SSH target |
| `VPS_USERNAME` | `root` | SSH user |
| `SSH_PRIVATE_KEY` | Private key content | SSH auth |

_Source: infrastructure-cicd-playbook.md Parts 6, 7. Turbo configuration, GitHub Actions workflow._

---

## 7. Operational Pitfalls & Solutions

_16 pitfalls discovered during 6 epics of development and deployment. Each one cost real debugging time._

| # | Pitfall | Cause | Solution |
|---|---------|-------|----------|
| 1 | Portainer admin timeout | 5-minute lockout on first access | `docker restart portainer`, then immediately create admin account |
| 2 | SSH refused after reboot | Server still booting | Wait 1-2 min, or use provider's web console |
| 3 | NGINX 403 on `/root/` files | `www-data` user can't read `/root/` | Serve from `/var/www/app/` instead |
| 4 | API `.ts` extension error | Node.js can't run `.ts` directly | Use `pm2 start "npx tsx src/index.ts"` |
| 5 | Leading spaces in `.env` | nano paste artifact | `sed -i 's/^ VAR/VAR/' .env` to fix |
| 6 | `db:push` hangs in CI | drizzle-kit 0.21.x interactive prompt | Create `db:push:force` wrapper that auto-approves |
| 7 | Drizzle schema import fails | `@your-org/types` has no `dist/` | Inline enum constants in schema files with comments noting canonical source |
| 8 | `column "X" does not exist` after deploy | CI deploy didn't run `db:push` | Add `db:push` to deploy step before build |
| 9 | Frontend calls `localhost:3000` in production | `VITE_API_URL` not set at build time | Pass `VITE_API_URL=https://yourdomain.example.com/api/v1` as inline env var during `pnpm build` |
| 10 | Env var name mismatch | `.env` has `SECRET` but code expects `SECRET_KEY` | Audit `.env.example` against actual code references |
| 11 | Seed command values corrupted | Multi-line `\` shell commands on VPS terminals insert whitespace | Always use single-line inline env vars for seed commands |
| 12 | WebSocket `wss://` connection refused | NGINX missing `/socket.io/` proxy block | Add `location /socket.io/` with `Connection "upgrade"` header |
| 13 | Command not found at repo root | Script defined in workspace, not root `package.json` | Use `pnpm --filter @your-org/api <script>` |
| 14 | `tsx -e` top-level await fails | esbuild CJS output doesn't support top-level await | Wrap in async IIFE or write to temp `.ts` file |
| 15 | PM2 crash-restart loop after deploy | New code requires env var not set on VPS | Pre-deploy check now catches this automatically |
| 16 | CORS_ORIGIN production crash loop | Added env var to required list, deployed without setting on VPS | Pre-deploy env var safety gate prevents this category of issue |

### Pitfall Prevention Principles

1. **`VITE_*` vars are build-time:** Vite inlines them during build. If not set at build time, the production build has wrong values forever (until rebuilt).
2. **Env var changes require deployment coordination:** Code changes adding required env vars must be set on the server BEFORE deploying the code.
3. **`db:push` before build:** Schema changes in code without running migrations on the server cause runtime column-not-found errors.
4. **Schema files are special:** Drizzle-kit runs compiled JavaScript. Shared types packages that point `main` to `src/index.ts` (no `dist/`) will fail when imported by schema files.
5. **Single-line commands on VPS:** Multi-line shell commands with `\` continuations corrupt values on some VPS terminals (whitespace injection at line wraps).

_Source: infrastructure-cicd-playbook.md Part 8. Each pitfall discovered during real deployment._

---

## 8. Testing & Quality Strategy

### 8.1 Test Framework Configuration

- **Framework:** Vitest with thread pool (`pool: 'threads'`)
- **API tests:** Node environment, extended timeouts (15s for hooks and tests)
- **Web tests:** jsdom environment
- **Run all tests:** `pnpm test` (Turbo routes to each package with correct config)
- **NEVER run web tests from root:** `pnpm vitest run` from root picks up wrong config. Use `pnpm --filter @your-org/web test`.

### 8.2 Test Organization

**Backend:** Separate `__tests__/` folders
```
services/
  user.service.ts
  __tests__/
    user.service.test.ts
```

**Frontend:** Co-located tests
```
features/auth/
  components/
    LoginForm.tsx
    LoginForm.test.tsx
```

### 8.3 Five-Stage Test Pipeline

| Stage | Purpose | CI Blocking? |
|-------|---------|-------------|
| GoldenPath | Core functional tests (happy path) | Yes |
| Security | Auth, authorization, rate limiting | Yes |
| Contract | API schema validation | Yes |
| UI | Component rendering tests | No |
| Performance | Load, timing, SLA tests | No |

Auto-detected by filename pattern: `security.*.test.ts` → Security, `*.performance.test.ts` → Performance, etc.

### 8.4 403 Authorization Test Standard

**Every protected endpoint must have tests verifying unauthorized roles receive 403.**

```typescript
// Canonical pattern: test all rejected roles
const rejectedRoles = ['viewer', 'editor', 'guest'];
it.each(rejectedRoles)('should return 403 for %s role', async (role) => {
  const token = generateToken({ role });
  const res = await request(app)
    .get('/api/v1/admin/reports')
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(403);
});
```

**Enforce structurally:** Create an audit script that checks coverage per endpoint, not a standard that depends on individual memory.

**Meta-principle — Structural enforcement > individual memory:** Standards that rely on developers remembering to do something will slip. Standards enforced by tooling (lint rules, audit scripts, CI gates) hold. This was the single most-carried lesson across 4 consecutive retrospectives: a "write 403 tests" agreement was carried without resolution until replaced by an automated audit script that completed in one cycle.

### 8.5 Critical Testing Gotchas

**`hookTimeout` must match `testTimeout`:**
```typescript
// vitest.config.ts — both must be set explicitly
test: {
  testTimeout: 15000,
  hookTimeout: 15000,  // Defaults to 10s independently!
}
```

**CPU-intensive operations in `beforeAll`:** bcrypt hashing with 12 salt rounds takes 200-500ms per call (can spike to 2s+ under parallel thread pool load). Set explicit hook timeouts.

**Integration tests (real DB):** Use `beforeAll`/`afterAll`, not `beforeEach`/`afterEach`. Clean up test data in `afterAll`. Use unique identifiers (uuidv7, Date.now) to avoid collisions across parallel threads.

**Mock patterns:**
```typescript
// Service mocking (controllers)
vi.mock('../../services/user.service.js');
vi.mocked(UserService.findById).mockResolvedValue(mockUser);

// Hoisted mocks (hooks)
const { mockFn } = vi.hoisted(() => ({ mockFn: vi.fn() }));
vi.mock('../../lib/some-module', () => ({ someExport: mockFn }));
```

### 8.6 Rate Limiting Test Pattern

Rate limiters should be skipped in test mode to avoid flaky tests:
```typescript
const isTestEnv = process.env.NODE_ENV === 'test';

export const apiRateLimit = rateLimit({
  store: isTestEnv ? undefined : new RedisStore({ /* ... */ }),
  // ...
});
```

_Source: testing-conventions.md, project-context.md, Epic 3-6 retrospectives._

---

## 9. Retrospective Practices

### 9.1 When to Run Retrospectives

After every epic completion. An epic typically spans 5-15 stories (1-3 weeks).

### 9.2 Retrospective Structure

```markdown
# Epic N Retrospective: [Title]

## Delivery Metrics
- Stories completed, tasks delivered, code review findings, fix rate, test growth

## Previous Retro Follow-Through
- Track every action item from the previous retro with status

## Successes
- What went well (with evidence)

## Challenges
- What went wrong (with root cause analysis)

## Bugs Discovered During Retrospective
- Production bugs found during UAT/review

## Key Insights
- Patterns and learnings (limit to 3-6 most impactful)

## Action Items
- Bug fixes (HIGH priority, story-shaped)
- Process improvements (framed as concrete deliverables)
- Technical debt items
- Team agreements (new rules from this retro)

## Prep Tasks for Next Epic
- Concrete tasks with priority and description
```

### 9.3 Follow-Through Tracking

**Track previous retro action items with status in every retro:**

| Item | Status | Evidence |
|------|--------|----------|
| Fix export race condition | Done | prep-1, 5 tests added |
| Story sizing (max 12 tasks) | Applied | No story exceeded 12 tasks |
| CI/CD template extraction | Not Addressed | Carried to next retro |

**Pattern observed:** Story-shaped items (bug fixes, prep tasks) complete at 100%. Open-ended items (standards, checklists) complete at ~40%.

### 9.4 Team Agreements

Carry team agreements forward across retros with explicit status:

```markdown
| # | Agreement | Status |
|---|-----------|--------|
| A1 | Every AlertDialog must include Cancel button | Carried |
| A2 | Skeleton loading layouts match content shape | Carried |
| A3 | Tests use text/data-testid/ARIA — never CSS classes | Carried + ESLint enforcement |
| A4 | Stories exceeding 12 tasks get split | Carried |
| A5 | External integrations start with spike | Carried |
| A6 | Post-deployment smoke test | New |
```

### 9.5 Commit History as Retro Input

Supplement story files with git log analysis:
- Group commits by story key
- Flag anomalies: high commit counts (complexity indicator), `fix:` clusters (hidden problems)
- Surface incidents invisible in story files

### 9.6 Context Continuity Across Sessions

**Problem:** Institutional knowledge from long development sessions is lost when starting fresh.

**Solution:** Externalized context artifacts that transfer accumulated wisdom:
1. **Sprint status file** — living state tracker for all stories
2. **Context brief** — session reassembly guide (read these files in this order)
3. **Auto-memory** — key patterns persisted across sessions
4. **Retrospective documents** — historical decisions and lessons

**Context brief template:**
```markdown
# Team Context Brief

## Quick Context Load
Read these files in order:
1. Sprint status: [path] — current state
2. Latest retro: [path] — decisions and action items
3. Project context: [path] — coding patterns and rules

## Key Project Facts
- Tech stack, deployment, current state, test count

## Team Process Patterns
- [List the 5-6 core patterns]

## Critical Deployment Notes
- [List the gotchas]
```

_Source: Epic 3-6 retrospectives, team-context-brief.md._

---

## 10. Appendix: Scripts & Tooling Reference

### 10.1 Database Seeding (Hybrid Dev/Prod)

```bash
# Development — hardcoded test credentials, known passwords
pnpm --filter @your-org/api db:seed:dev

# Production — Initial admin from environment variables
ADMIN_EMAIL=admin@yourdomain.com ADMIN_PASSWORD=Str0ngP4ss ADMIN_NAME="Admin" \
  pnpm --filter @your-org/api db:seed --admin-from-env

# Clean seeded data (preserves real data via `is_seeded` flag)
pnpm --filter @your-org/api db:seed:clean
```

**Key:** All seed data MUST have `is_seeded: true` flag for surgical removal.

### 10.2 Docker Compose for Local Dev

```bash
pnpm services:up       # Start Postgres + Redis
pnpm services:down     # Stop services
pnpm services:logs     # View logs
```

### 10.3 Local Development Quick Start

```bash
git clone https://github.com/YOUR_ORG/your-project.git && cd your-project
pnpm install
pnpm services:up                           # Start Docker services
cp .env.example .env                       # Configure local env
pnpm --filter @your-org/api db:push        # Push schema
pnpm --filter @your-org/api db:seed:dev    # Seed test data
pnpm dev                                   # Start API + Web dev servers
# Web: http://localhost:5173
# API: http://localhost:3000
```

### 10.4 SSH Key Generation

```bash
ssh-keygen -t ed25519 -C "your-email@example.com"
cat ~/.ssh/id_ed25519.pub  # Copy to VPS provider
```

### 10.5 Cost Reference (Single VPS)

| Service | Monthly Cost |
|---------|-------------|
| VPS (2-4GB RAM) | $6-24 |
| Object Storage (S3-compatible) | $5 |
| VPS Backups (optional) | ~$5 |
| **Total** | **$16-34/mo** |

Sufficient for: 200 staff users, 1K concurrent public users, 1M records/year.

### 10.6 Adapting This Playbook

1. **Replace domain** — NGINX config, certbot, `.env`
2. **Replace repo URL** — git clone, GitHub Actions
3. **Replace secrets** — JWT, DB password, API keys
4. **Keep the stack** — Node 20 + pnpm + PostgreSQL 15 + Redis 7 + NGINX + PM2
5. **Keep the CI/CD structure** — lint -> build -> test (parallel) -> deploy
6. **Keep the process patterns** — spike-first, prep-as-force-multipliers, three-layer quality, story-shaped improvements

---

## Cross-References to Source Documents

| Section | OSLRS Source Document |
|---------|---------------------|
| Process Patterns | `epic-3-retro-2026-02-14.md`, `epic-4-retro-2026-02-20.md`, `epic-5-retro-2026-02-24.md`, `epic-6-retro-2026-03-04.md` |
| Architecture Decisions | `_bmad-output/planning-artifacts/architecture.md` (17 ADRs) |
| Implementation Rules | `_bmad-output/project-context.md` (1,692 lines, 15 critical rules) |
| Infrastructure Setup | `docs/infrastructure-cicd-playbook.md` (678 lines, 16 pitfalls) |
| Testing Conventions | `docs/testing-conventions.md` (175 lines) |
| Context Brief Pattern | `docs/team-context-brief.md` (66 lines) |
| Deployment Safety | `scripts/check-env.sh`, `apps/api/src/app.ts` (requiredProdVars) |

---

_Generated: 2026-03-06_
_Source project: 6 epics, 23+ weeks, 80+ stories, 3,123 tests, 590+ code review findings_
_Playbook version: 1.0_
