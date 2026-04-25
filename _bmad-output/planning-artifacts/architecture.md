---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - docs/homepage_structure.md
  - docs/questionnaire_schema.md
workflowType: 'architecture'
project_name: 'oslr_cl'
user_name: 'Awwal'
date: '2026-01-02'
lastStep: 8
scaleTarget: '1M records over 12 months'
staffing: '99 Enumerators + 33 Supervisors'
hostingProvider: 'Hetzner Cloud'
idStrategy: 'UUIDv7'
status: 'complete'
validationStatus: 'READY FOR IMPLEMENTATION - PRD v7.9 ALIGNED'
completedAt: '2026-01-04'
lastUpdated: '2026-02-06'
prdVersion: 'v8.0'
v75Updates: 'Data Routing Matrix, Live Selfie Spec, Terminology Fix, Marketplace Security'
v79Updates: 'Epic 2.5 Role-Based Dashboards - ADR-016 updated with strict route isolation pattern, RBAC matrix, code splitting benefits'
v80Updates: 'SCP-2026-02-05-001: ODK Central removed, native form system replaces. ADR-001/002/004/005/007/008/009/010 amended. Database, infrastructure, and data flow sections updated.'
v82Updates: 'SCP-2026-04-22: Multi-source registry + API governance + security hardening + field-survey UX. New Decisions 1.5 / 2.4–2.8 / 3.4 / 5.3–5.5. ADR-013 amended (Tailscale operator access). ADR-015 rewritten (single 5-step wizard + magic-link primary). New ADR-018 (multi-source registry / pending-NIN). New ADR-019 (API consumer auth model). New ADR-020 (Tailscale access architecture). Pattern Categories 5 + 7 extended.'
prdVersionLatest: 'V8.2'
lastRevision: '2026-04-25'
---

# OSLSR Architecture Decision Document

**Project:** Oyo State Labour & Skills Registry (OSLSR)
**PRD Version:** V8.2 (amended 2026-04-23 per SCP-2026-04-22)
**Date:** 2026-01-04 (initial); last revised 2026-04-25
**Architect:** Awwal (with Claude Code facilitation); 2026-04-25 revision by Winston (architect agent)

> **Amendment (2026-02-06) — SCP-2026-02-05-001:** ODK Central has been removed from the architecture. The native form system (JSONB schemas, skip-logic engine, Form Builder UI, one-question-per-screen renderer) replaces all ODK/Enketo functionality. Infrastructure reduced from 6 containers to 4, from 2 PostgreSQL databases to 1. ADRs amended inline below.

> **Amendment (2026-04-25) — SCP-2026-04-22:** Multi-source registry, API governance, security hardening, and field-survey UX readiness landed against PRD V8.2. New Decision 1.5 documents the nullable-NIN + provenance schema (Story 11-1). New Decisions 2.4–2.8 add the `apiKeyAuth` middleware, magic-link primary, SMS-OTP-as-infrastructure, Tailscale operator access, and ambiguous-auth rejection. New Decision 3.4 establishes the `/api/v1/partner/*` namespace and scope taxonomy. New Decisions 5.3–5.5 capture audit-log principal dualism, per-consumer rate-limit metrics, and pending-NIN observability events. Three new ADRs: **ADR-018** (multi-source registry + pending-NIN), **ADR-019** (API consumer auth), **ADR-020** (Tailscale access architecture — as-deployed 2026-04-23). ADR-013 gains a Tailscale subsection; ADR-015 is rewritten end-to-end (Google OAuth retired; magic-link primary; pending-NIN path). Pattern Category 5 extends with consumer cache keys, principal-tagged Pino events, and the audit-log discriminated-union write helper. Pattern Category 7 extends with operator-SSH access requirements, API token storage, per-consumer Redis rate-limit keying, and timing-safe comparison. See `_bmad-output/planning-artifacts/sprint-change-proposal-2026-04-22.md` §2.3 Architecture subsection for the full SCP scope.

---

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**

The OSLSR system comprises 21 functional requirements organized around five core capabilities:

1. **Consent & Privacy Management (FR1-FR5):** Two-stage consent workflow embedded in native survey forms, NIN-based identity verification with global uniqueness enforcement, paper collection strategy for inclusion
2. **User Management & Provisioning (FR6-FR8):** Bulk CSV import for 132+ field staff, role-based onboarding with profile completion (NIN validation, live selfie, bank details), LGA-locking for field staff
3. **Data Collection & Sync (FR9-FR11):** Offline-first PWA via native form renderer with IndexedDB sync, pause/resume capability, in-app staff communication
4. **Oversight & Quality Control (FR12-FR16):** Real-time supervisor dashboards, context-aware fraud detection with configurable thresholds (cluster/speed/pattern), verification assessor audit queue, immutable audit trails, government official read-only oversight with full PII access
5. **Public Marketplace (FR17-FR21):** Anonymous skills profiles with optional enrichment, authenticated searcher contact logging, high-volume keyboard-optimized data entry interface for paper digitization

**Non-Functional Requirements:**

Critical NFRs driving architectural decisions:

- **Performance (NFR1):** 250ms p95 API response, 2.5s LCP on 4G, 60s offline sync for 20 surveys
- **Scalability (NFR2):** Unlimited technical capacity with baseline 200 staff (132 field + 68 back-office), monitoring alerts at 120/180 field staff, ~1,000 concurrent public users
- **Availability (NFR3):** 99.5% SLA on single VPS (3.65hr/month max downtime), offline-first design (IndexedDB drafts survive server outages), comprehensive backup strategy (daily DB to S3, 7-year retention, monthly restore drills), 6-hour VPS snapshots with 1-hour RTO
- **Security & Compliance (NFR4):** NDPA-aligned data minimization (NIN only, no BVN), 7-year retention, logically isolated marketplace (read-only replica for performance and security separation), defense-in-depth (Redis rate limiting, honeypots, CSP, IP throttling with specific thresholds per endpoint), role conflict prevention, AES-256 encryption at rest/TLS 1.2+ in transit
- **Usability (NFR5):** WCAG 2.1 AA compliance, legacy device support (Android 8.0+ / Chrome 80+)
- **Operations (NFR6):** Portainer for visual management, GitHub Actions CI/CD, staging environment validation
- **Advanced Security (NFR8):** Database-level unique constraints for race condition defense, ACID transactions for multi-step operations, append-only audit logs with DB permissions/triggers, strict CSP for anti-XSS

**Scale & Complexity:**

- **Primary domain:** Full-stack government registry system (React PWA frontend + Node.js/Express API + Native Form System + PostgreSQL)
- **Complexity level:** High/Enterprise
- **Estimated architectural components:** 12+ major components (Auth service, User management, Native form engine, Submission ingestion pipeline, Fraud detection engine, Dashboard service, Marketplace service, Data entry interface, Audit logging, Backup orchestrator, Rate limiting middleware, Notification service)
- **Data volume projections:** 200 staff accounts, potentially 100,000+ respondent records across 33 LGAs, skills marketplace profiles
- **Integration complexity:** S3-compatible storage, AWS SES for notifications. _(Simplified per SCP-2026-02-05-001: ODK Central removed, all form management is internal.)_

### Technical Constraints & Dependencies

**Hard Constraints:**

1. **Infrastructure:** Single self-hosted Linux VPS (NDPA data residency - data must remain in Nigeria), Docker Compose deployment, no cloud-hosted services for core data
2. ~~**ODK Central:** Self-hosted containerized instance~~ **REMOVED (SCP-2026-02-05-001).** Native form system replaces ODK Central entirely.
3. **Technology Stack (Locked per PRD):**
   - Node.js 20 LTS
   - PostgreSQL 15
   - Redis 7
   - React with Tailwind CSS + shadcn/ui
   - BullMQ for job queue
   - **Technical Note - BullMQ vs RabbitMQ:** BullMQ is sufficient for this modular monolith architecture because: (1) All job producers and consumers run in the same Node.js process (submission ingestion, fraud detection, email/SMS queues, backup jobs), (2) Redis provides adequate persistence for job durability with AOF enabled, (3) Current scale (200 staff, 1K concurrent users) doesn't require distributed message routing. **RabbitMQ would be needed if:** (a) Migrating to microservices with polyglot services (Python fraud ML service, Go analytics engine), (b) Complex routing topologies (topic exchanges, fanout patterns across multiple consumers), (c) Strict message delivery guarantees beyond BullMQ's Redis-backed durability. For this project, BullMQ's simplicity (single Redis dependency) outweighs RabbitMQ's feature richness.
4. **Integration Pattern:** Custom App is single source of truth for all data including form definitions, submissions, and user management
5. **Browser Support:** Must support Android 8.0+ running Chrome 80+ (legacy devices in field)
6. **Form Management:** Native Form Builder UI for creating/editing JSONB form schemas; one-time XLSForm migration for existing questionnaire

**Key Dependencies:**

- S3-compatible object storage (DigitalOcean Spaces or AWS S3) for backups
- AWS SES (or equivalent) for email/SMS with cost circuit breaker ($50/day max)
- Verhoeff algorithm for NIN validation (client-side and server-side)
- ~~ODK Central API, Enketo forms, ODK webhook~~ **REMOVED (SCP-2026-02-05-001)**

**Architectural Boundaries:**

- Native form renderer handles all form display; drafts stored in IndexedDB with position tracking
- Marketplace queries must use read-only database replica (logically isolated from operational database)
- Field staff accounts are LGA-locked; back-office roles have state-wide access

### Key Architectural Decisions

**ADR-001: Custom Modular Monolith Architecture Pattern**
- **Decision:** Custom Node.js App with native form system as a self-contained modular monolith
- **Amendment (SCP-2026-02-05-001):** Originally "Custom App + Self-hosted ODK Central". ODK Central was removed due to persistent Enketo connectivity issues blocking pilot timeline. Native form system now provides full team control with no external dependencies.
- **Rationale:** Balances government procurement constraints (single VPS), data residency (NDPA), and full team control over form management
- **Trade-offs:**
  - ✅ Reduced operational complexity (4 containers vs 6+)
  - ✅ Data sovereignty (Nigerian infrastructure)
  - ✅ Lower hosting costs (~6GB RAM vs ~8GB)
  - ✅ No external dependency for form rendering/collection
  - ❌ Vertical scaling only (sufficient for baseline 200 staff + 1K concurrent users)
- **Alternatives Considered:**
  - **Cloud ODK:** Rejected due to NDPA data residency requirements (Nigerian data must remain in-country)
  - **Full Microservices:** Rejected as overkill for 1K concurrent users; increases operational complexity 3-4x without scaling benefit at current scale
  - ~~**Build Custom Survey Engine (No ODK):** Previously rejected~~ **NOW ADOPTED (SCP-2026-02-05-001):** Native form system built with JSONB schemas, skip-logic engine, Form Builder UI, and one-question-per-screen renderer. Enketo connectivity issues made ODK integration unreliable for pilot timeline.
  - **SaaS Form Builders (Typeform, Google Forms, Kobo Toolbox):** Rejected due to NDPA compliance, offline requirements, and lack of integration control

**~~ADR-002: Integration Boundary Management~~** — SUPERSEDED
- ~~**Decision:** All ODK integration through abstraction layer in Custom App~~
- **SUPERSEDED (SCP-2026-02-05-001):** ODK Central removed. The `services/odk-integration/` module has been deleted. Form management is now a native service within the Custom App (`services/form-management/`).

**ADR-003: Fraud Detection Engine Design**
- **Decision:** Rule-based engine with pluggable heuristics and database-stored configuration
- **Architecture:**
  ```
  FraudEngine
    ├── HeuristicRegistry (pluggable rules)
    ├── ConfigService (DB-backed thresholds)
    └── ScoringAggregator (combines signals)
  ```
- **Rationale:** Runtime threshold adjustment without deployment, enables A/B testing of rules
- **Pilot Tuning Strategy:** Dashboard showing threshold hit rates during 2-week pilot. Target: 2-5% submissions flagged for manual review (40% = too aggressive, 0.5% = too lenient)
- **Trade-offs:**
  - ✅ Admin can tune without developer intervention
  - ✅ Each heuristic independently testable
  - ✅ Can disable problematic rules in production
  - ❌ More complex than hardcoded rules initially

**ADR-004: Offline Data Responsibility Model**
- **Decision:** Browser (IndexedDB) owns draft state; Server validates on submission
- **Amendment (SCP-2026-02-05-001):** Originally "Enketo/IndexedDB". Now uses native form renderer with IndexedDB for offline storage.
- **Boundaries:**
  - Client: Draft storage in IndexedDB (with question position tracking), form validation, submission queue
  - Server: Authoritative record, fraud detection, NIN uniqueness
- **Rationale:** Native form renderer uses IndexedDB for offline-first data persistence
- **Critical Note:** User-initiated cache clear is unrecoverable - enumerator training must emphasize this. IndexedDB persists across browser crashes but NOT across cache clears or device resets.
- **Trade-offs:**
  - ✅ Full control over offline sync protocol
  - ✅ IndexedDB is browser-native and well-supported
  - ❌ Cannot enforce NIN uniqueness until online (mitigated by idempotency)

**ADR-005: Degraded Mode Strategy**
- **Decision:** Offline-first design with IndexedDB draft persistence; VPS failure = full offline with honest engineering approach
- **Amendment (SCP-2026-02-05-001):** Originally relied on "ODK survives Custom App crashes". With single application stack, degraded mode = offline-first IndexedDB storage on enumerator devices.
- **Mitigation:**
  - Train enumerators for 7-day device-only operation (drafts persist in IndexedDB)
  - 6-hour VPS snapshots with 1-hour RTO
  - Dashboard displays "OFFLINE MODE" banner when server unreachable
  - Pending submissions queue in IndexedDB syncs automatically on reconnect
- **Rationale:** Realistic expectations - single VPS cannot provide true HA
- **Trade-offs:**
  - ✅ Honest expectations set
  - ✅ Focus on data durability (backups + IndexedDB) over high availability
  - ❌ No failover during VPS outages

**ADR-006: Defense-in-Depth Security Architecture**
- **Decision:** Layered security model with independent, testable controls
- **Layers:**
  0. **Infrastructure Perimeter:** DigitalOcean Cloud Firewall (network-edge, Docker-bypass-proof), Docker localhost binding (127.0.0.1:PORT:PORT for all non-public services), Redis AUTH (--requirepass), strong database credentials
  1. **Edge:** Rate limiting (Redis, IP-based)
  2. **Application:** CAPTCHA challenges (hCaptcha)
  3. **Data:** Read-only replica (prevents direct data access)
  4. **Audit:** Comprehensive logging (immutable append-only)
- **Rationale:** No single point of failure; each layer independently verifiable
- **Trade-offs:**
  - ✅ Resilient to bypass of any single control
  - ✅ Each layer unit-testable
  - ❌ More moving parts to maintain

**ADR-007: Database Strategy** _(Amended)_
- **Decision:** Single PostgreSQL database on same VPS (app_db)
- **Amendment (SCP-2026-02-05-001):** Originally "Two PostgreSQL databases (app_db + odk_db)". With ODK Central removed, single database holds all data.
- **Source of Truth Matrix:**
  - Form definitions → app_db (JSONB, versioned, immutable per version)
  - Raw submissions → app_db (immutable once submitted)
  - Marketplace profiles → app_db (derived, revocable)
- **Rationale:** Single database simplifies operations, backups, and data integrity. Marketplace isolation achieved via read-only replica.
- **Trade-offs:**
  - ✅ Single backup process
  - ✅ Foreign key constraints across all data
  - ✅ Simplified operations and monitoring
  - ❌ Marketplace read-only replica needed for performance isolation

**ADR-008: Emergency Data Sync Control**
- **Decision:** Explicit 'Upload Now' button on Enumerator Dashboard forcing IndexedDB → App API sync with progress feedback
- **Amendment (SCP-2026-02-05-001):** Sync target changed from ODK Central to Custom App submission API.
- **Rationale:** Addresses cache management risk during 7-day offline periods - enumerators need safe way to clear device storage
- **Implementation:** Button only enables cache clearing when upload queue is empty, preventing data loss
- **Trade-offs:**
  - ✅ Safe cache management for storage-constrained devices
  - ✅ User-controlled sync timing
  - ❌ Additional UI complexity

**~~ADR-009: Webhook Failure Detection & Recovery~~** — SUPERSEDED
- ~~**Decision:** Automated health check job detecting submission ID gaps between ODK Central and app_db~~
- **SUPERSEDED (SCP-2026-02-05-001):** ODK Central removed. Submission pipeline is now direct (native form renderer → App API). Offline submissions queue in IndexedDB and sync idempotently on reconnect. The `/admin/submission-health` page monitors sync status and failed submissions.

**ADR-010: Database Technology Selection for Custom App**
- **Decision:** Use PostgreSQL 15 for Custom App database (app_db)
- **Alternatives Considered:** MongoDB for document flexibility and JSON-native storage
- **Rationale:**
  - NFR8.1 requires database-level UNIQUE constraints for race condition defense (MongoDB's uniqueness weaker in distributed mode)
  - NFR8.2 requires ACID transactions (PostgreSQL more mature)
  - Operational simplicity: single PostgreSQL database for all application data
  - Fraud detection queries (JOINs, PostGIS geospatial) proven in PostgreSQL
  - RBAC and audit trails naturally relational
  - PostgreSQL JSONB provides schema flexibility where needed without sacrificing guarantees
  - Scale target (200K records) doesn't require MongoDB's sharding capabilities
- **Trade-offs:**
  - ✅ Stronger consistency guarantees
  - ✅ Simpler operations (one DB technology)
  - ✅ Better query tooling (EXPLAIN ANALYZE)
  - ✅ Efficient backups (pg_dump)
  - ❌ Schema migrations require downtime (mitigated by JSONB for flexible fields)

### Cross-Cutting Concerns Identified

**Security & Compliance:**
- Role-Based Access Control (RBAC) with 7 distinct roles and field vs back-office distinction
- NDPA compliance (data minimization, retention, consent management)
- Immutable audit logging for all user actions and data modifications
- PII access controls (back-office only for individual records)
- Defense-in-depth bot protection (rate limiting, CAPTCHA, honeypots, device fingerprinting)
- Database-level race condition prevention (unique constraints, ACID transactions)
- **NIN Uniqueness Race Condition Defense:** Database UNIQUE constraint on `respondents.nin` prevents simultaneous submissions across all sources (Enumerator survey, Public Self-Registration, Paper Entry), with friendly error message showing original registration date/source

**Data Integrity:**
- Context-aware fraud detection engine (GPS clustering, speed runs, straight-lining patterns)
- Configurable threshold system (admin-adjustable via UI)
- Global NIN uniqueness enforcement across all submission sources
- Verhoeff checksum validation for NIN fields (catches transcription errors, not identity verification)
- **Offline Fraud Mitigation:** Multi-layer defense including fraud detection on ingestion, supervisor verification, device-to-enumerator mapping tracking, state-level assessor audit, immutable forensic trail for collusion detection

**Offline Capability:**
- Progressive Web App (PWA) with service worker caching
- Persistent storage permission with warning banners for unsent data
- 7-day offline operation capability for field enumerators
- Idempotent submission ingestion with offline queue and automatic sync on reconnect
- Emergency sync control with safe cache management (ADR-008)

**Monitoring & Observability:**
- System health dashboard for Super Admin
- Staff capacity alerts (120/180 thresholds)
- Submission sync health monitoring via `/admin/submission-health` dashboard
- Failed submission detection with validation error logging
- Backup integrity validation (monthly restore drills)

**Performance:**
- Optimistic UI updates with skeleton screens (not spinners)
- BullMQ job queue for async processing (ingestion, notifications, exports)
- Read-only database replica for marketplace to isolate from collection workload
- Sidecar Redis for rate limiting and caching

**Disaster Recovery:**
- Single-database backup strategy (app_db to S3 daily)
- VPS snapshots every 6 hours with 1-hour RTO
- Point-in-Time Restore (PITR) capability up to 24 hours back
- **VPS Hardware Failure Mitigation:** Acknowledges single-VPS risk, 6-hour snapshots, daily S3 dumps, 1-hour RTO, 7-day enumerator offline training (rejects multi-region HA as out of scope)

**Marketplace Security:**
- **Scraping Defense Architecture:** Five-layer bot protection (IP rate limiting, device fingerprinting, progressive CAPTCHA, pagination limits max 100 profiles, honeypot fields). Anonymous profiles contain no PII without authentication.
- **Profile Edit Token Security:** 32-char random tokens, single-use, 90-day expiry, 3-request/day rate limit per NIN. SMS interception worst-case: fraudulent marketplace profile only, no survey data access.

## Starter Template Evaluation

### Primary Technology Domain

**Full-Stack Government Registry System** requiring custom modular monolith architecture with React PWA frontend, Node.js/Express backend, PostgreSQL database, and native form system.

### Starter Options Considered

**Evaluated Templates:**
1. **Connected Repo Starter** - Full-stack Turborepo with React + Node.js + PostgreSQL ([GitHub](https://github.com/teziapp/connected-repo-starter))
2. **Lightxxo's Vite React Template** - React + Vite + Tailwind + shadcn/ui starter ([GitHub](https://github.com/Lightxxo/vite-react-typescript-tailwind-shadcn-template))
3. **bitDaft's Express Boilerplate** - Node.js + Express + PostgreSQL + BullMQ ([GitHub](https://github.com/bitDaft/nodejs-express-boilerplate))

### Selected Approach: Custom Manual Initialization

**Rationale for Manual Setup:**
- **Unique Modular Architecture:** Custom App with native form system (ADR-001) and single PostgreSQL database (ADR-007) doesn't map to existing starters
- **Native Form Engine:** Requires custom form management with JSONB schemas, skip-logic engine, and Form Builder UI not found in standard boilerplates
- **Specific Docker Compose Orchestration:** Multi-container setup (Custom App + PostgreSQL + Redis + Nginx) requires custom configuration
- **NDPA Compliance:** Self-hosted constraints and data residency needs demand tailored setup
- **10 ADRs Already Defined:** Architectural decisions already made; starters would introduce conflicting opinions

**Project Structure:**
```
oslsr/
├── apps/
│   ├── web/          # React PWA (Vite + Tailwind + shadcn/ui)
│   └── api/          # Node.js/Express API
├── packages/
│   ├── types/        # Shared TypeScript types
│   ├── utils/        # Shared utilities (Verhoeff, validation)
│   └── config/       # Shared configuration
├── docker/
│   ├── docker-compose.yml    # Custom App + PostgreSQL + Redis + Nginx
│   ├── Dockerfile.api
│   └── Dockerfile.web
└── package.json      # Monorepo root with pnpm workspaces
```

**Initialization Commands:**

```bash
# 1. Initialize Monorepo Root
mkdir oslsr && cd oslsr
pnpm init
# Add workspaces to package.json

# 2. Frontend (React + Vite + Tailwind + shadcn/ui)
mkdir -p apps/web && cd apps/web
pnpm create vite@latest . -- --template react-ts
pnpm install -D tailwindcss postcss autoprefixer
pnpx tailwindcss init -p
pnpx shadcn@latest init
cd ../..

# 3. Backend (Node.js + Express + PostgreSQL + BullMQ)
mkdir -p apps/api && cd apps/api
pnpm init
pnpm add express pg bullmq ioredis dotenv helmet cors
pnpm add -D typescript @types/node @types/express tsx nodemon
npx tsc --init
cd ../..

# 4. Shared Packages
mkdir -p packages/{types,utils,config}
cd packages/types && pnpm init && cd ../..
cd packages/utils && pnpm init && cd ../..
cd packages/config && pnpm init && cd ../..

```

**Architectural Decisions Provided by Manual Setup:**

**Language & Runtime:**
- TypeScript 5.x across all workspaces with strict configuration
- Node.js 20 LTS with ES modules (`"type": "module"`)
- Shared TypeScript configurations via `packages/types`

**Styling Solution:**
- Tailwind CSS v4 for utility-first styling
- shadcn/ui components (accessible, customizable, Radix UI primitives)
- CSS variables for theming (dark mode support per NFR5.1)

**Build Tooling:**
- **Frontend:** Vite 6.x with React plugin (fast HMR, code splitting, tree shaking)
- **Backend:** tsx for development, tsc for production builds
- **Docker:** Multi-stage builds with Node 20 Alpine base images
- **Monorepo:** pnpm workspaces for efficient dependency management

**Testing Framework:**
- **Frontend:** Vitest (Vite-native, fast unit tests) + React Testing Library
- **Backend:** Jest with supertest for API integration tests
- **E2E:** Playwright for cross-browser testing (per PRD)
- **Load Testing:** k6 for performance validation (NFR1)

**Code Organization:**
- **Monorepo Pattern:** Workspace-based with `apps/`, `packages/`, `services/` separation
- **Native Forms:** Form management services within `apps/api/src/services/` (skip-logic engine, form CRUD, validation)
- **Shared Concerns:** `packages/utils/` for Verhoeff validation, fraud heuristics, common helpers
- **Type Safety:** `packages/types/` for shared interfaces (User, Respondent, Survey, etc.)

**Development Experience:**
- Hot module replacement (Vite for React, nodemon for Express)
- TypeScript path aliases (`@oslsr/types`, `@oslsr/utils`, `@oslsr/config`)
- ESLint + Prettier with shared configuration
- Docker Compose for local development (mirrors production stack)
- VS Code settings for consistent formatting

**Note:** Project initialization using these commands will be Story 1.1 in the implementation phase.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- Database layer (Drizzle ORM + PostgreSQL)
- Authentication system (Hybrid JWT + Redis blacklist)
- React version (18.3 over 19 for stability)
- Hosting provider (Hetzner Cloud for cost efficiency)

**Important Decisions (Shape Architecture):**
- API design patterns (REST with OpenAPI documentation)
- State management (TanStack Query + Zustand)
- Form handling (React Hook Form + Zod)
- Observability (Pino logging, lightweight metrics)

**Deferred Decisions (Post-MVP):**
- Advanced monitoring (full Grafana dashboards - start with lightweight metrics)
- Self-hosted error tracking (Sentry - start with log-based tracking)
- Table partitioning (only needed after 1M+ records)

---

### Data Architecture

**Decision 1.1: ORM/Query Builder**
- **Choice:** Drizzle ORM
- **Version:** Latest stable (1.x)
- **Rationale:**
  - TypeScript-first with excellent type inference (zero runtime overhead)
  - SQL-like syntax provides control for complex fraud detection queries (ADR-003)
  - Lightweight (~50KB) aligns with single-VPS constraints
  - Better performance than Prisma for JOIN-heavy queries
- **Affects:** All database operations, Story 1.2 (Database Schema)

**Decision 1.2: Data Validation**
- **Choice:** Zod
- **Version:** 3.x
- **Rationale:**
  - Single source of truth for validation + TypeScript types
  - Shared between React forms and API endpoints (monorepo benefit)
  - Verhoeff NIN validation as custom Zod refinement
  - Composable schemas reduce duplication
- **Affects:** All API endpoints, form validation, webhook ingestion

**Decision 1.3: Database Migrations**
- **Choice:** Drizzle Kit (ORM-native migrations)
- **Rationale:**
  - Auto-generated from schema changes (faster iteration)
  - Type safety maintained automatically
  - Can drop to raw SQL for complex changes when needed
- **Affects:** Story 1.2 (Database Schema), all schema evolution

**Decision 1.4: Caching Strategy**
- **Choice:** ioredis directly (no abstraction layer)
- **Rationale:**
  - Redis already required for BullMQ (ADR-003) - no new dependency
  - Simple use cases: rate limiting, session blacklist, fraud scoring cache
  - Marketplace read-replica (ADR-007) reduces need for aggressive caching
- **Affects:** Rate limiting middleware, authentication blacklist, fraud detection

**Decision 1.5: Multi-Source Registry Schema (SCP-2026-04-22)**
- **Choice:** Extend `respondents` with nullable `nin`, explicit `status` column, provenance columns, and new tables `import_batches`, `api_consumers`, `api_keys`, `api_key_scopes`; extend `audit_logs` with `consumer_id`.
- **See:** ADR-018 (schema decision rationale), ADR-019 (API consumer auth), Story 11-1 (migration authoring).
- **Affects:** FR21 (scoped), FR24, FR25, NFR8.1, NFR10; Stories 11-1 / 11-2 / 9-11 / 10-1.

#### Respondents Table — Amended Shape (Story 11-1)

| Column | Type | Nullable | Constraint / Index | Purpose |
|---|---|---|---|---|
| `nin` | `TEXT` | **YES** (amended from NOT NULL) | `respondents_nin_unique_when_present` — `UNIQUE INDEX ON respondents(nin) WHERE nin IS NOT NULL` | Preserves FR21 dedupe for NIN-present records; allows `pending_nin_capture` / `imported_unverified` rows |
| `status` | `TEXT` | NO — default `'active'` | `CHECK (status IN ('active', 'pending_nin_capture', 'nin_unavailable', 'imported_unverified'))` + `idx_respondents_status` | Realises FR28; values typed in Drizzle via `respondentStatusTypes` array, enforced at DB via CHECK for defence-in-depth |
| `source` | `TEXT` | NO | existing `idx_respondents_source` (drops / recreates with extended enum) | Values extended from `['enumerator','public','clerk']` to `['enumerator','public','clerk','imported_itf_supa','imported_other']` — `respondentSourceTypes` array in Drizzle |
| `external_reference_id` | `TEXT` | YES | none direct | External system identifier (e.g. SUPA `ADM NO`); indexed on join via `import_batch_id` |
| `import_batch_id` | `UUID` | YES | FK → `import_batches(id) ON DELETE SET NULL`; `idx_respondents_import_batch` (partial, WHERE NOT NULL) | Links imported rows to their ingest batch — partial index keeps the index small since most rows have no batch |
| `imported_at` | `TIMESTAMPTZ` | YES | none | Ingest timestamp; NULL for field-surveyed rows |

**Composite indexes added in Story 11-1 (Akintola-risk mitigation, AC#11):**

- `respondents(source, created_at)` — registry filter + time-window listing
- `respondents(lga_id, source)` — supervisor / assessor LGA-scoped-by-source
- `respondents(status, source)` — pending-NIN follow-up lists + status-scoped reporting
- `respondents(status, created_at)` — stale-pending-NIN queue for supervisor review

**Partial-index rationale:** chosen over `UNIQUE NULLS NOT DISTINCT` (PG 15+) because (a) production Postgres major version is not pinned at 15+, (b) partial-index pattern is more portable and self-documenting, and (c) the service layer in `SubmissionProcessingService.findOrCreateRespondent` branches on NIN presence regardless, so the DB boundary and service semantics align. Reference: ADR-018 §Options.

**Drizzle-kit constraint reminder (per MEMORY.md):** schema files under `apps/api/src/db/schema/*.ts` **MUST NOT** import from `@oslsr/types` because drizzle-kit runs compiled JS and `@oslsr/types` exposes no `dist/`. Inline the enum constants (`respondentStatusTypes`, `respondentSourceTypes`) locally in each schema file. This is a project-wide invariant that predates this amendment; Story 11-1 preserves it.

#### New Table — `import_batches` (Story 11-1)

Provenance capture for secondary-data ingestion (Epic 11). One row per successful ingest batch; rollback flips `status` to `rolled_back` within the 14-day window.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | `UUID` | NO | Primary key (UUIDv7 per Pattern Category 1) |
| `source` | `TEXT` | NO | Matches `respondents.source` enum values (`imported_itf_supa`, `imported_other`) |
| `source_description` | `TEXT` | YES | Free-text description of the source for admin UI clarity |
| `original_filename` | `TEXT` | NO | Audit / provenance |
| `file_hash` | `TEXT` | NO — `UNIQUE` | SHA-256 hex of uploaded bytes; prevents accidental duplicate uploads |
| `file_size_bytes` | `INTEGER` | NO | Quota / audit |
| `parser_used` | `TEXT` | NO | `'pdf_tabular'`, `'csv'`, `'xlsx'` |
| `rows_parsed` / `rows_inserted` / `rows_matched_existing` / `rows_skipped` / `rows_failed` | `INTEGER` | NO — default 0 | Outcome telemetry, surfaced in Story 11-3 admin UI |
| `failure_report` | `JSONB` | YES | Per-row failure reasons for admin download / retry |
| `lawful_basis` | `TEXT` | NO | NDPA category (e.g. `'ndpa_6_1_e'`, `'ndpa_6_1_f'`); mandatory for DPIA alignment |
| `lawful_basis_note` | `TEXT` | YES | Free-text justification captured at upload |
| `uploaded_by` | `UUID` | NO | FK → `users(id)` |
| `uploaded_at` | `TIMESTAMPTZ` | NO — default `now()` | |
| `status` | `TEXT` | NO — default `'active'` | `'active'` \| `'rolled_back'` |

Indexes: `idx_import_batches_source`, `idx_import_batches_status`, `idx_import_batches_uploaded_by`.

#### New Tables — API Consumer Authentication (Epic 10, Story 10-1)

Three tables (+ one `audit_logs` extension) realise FR24 + NFR10. Full schema lands in Story 10-1; ADR-019 captures the decision rationale.

**`api_consumers`** — one row per partner organisation (ITF-SUPA, NBS, NIMC, future MDAs).

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | UUIDv7 |
| `name` | `TEXT` NOT NULL | Display name for admin UI |
| `organisation_type` | `TEXT` NOT NULL | e.g. `'federal_mda'`, `'state_mda'`, `'research_institution'` |
| `contact_email` | `TEXT` NOT NULL | Primary technical contact |
| `dsa_document_url` | `TEXT` | S3 pointer to signed Data-Sharing Agreement (Story 10-5); **required** before any key with `submissions:read_pii` is provisioned |
| `status` | `TEXT` NOT NULL DEFAULT `'active'` | `'active'` \| `'suspended'` \| `'terminated'` |
| `created_at` / `updated_at` | `TIMESTAMPTZ` | |

**`api_keys`** — one row per issued key (rotation creates new rows; superseded keys live during the 7-day overlap with `revoked_at` set on emergency rotation).

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | UUIDv7 |
| `consumer_id` | `UUID` NOT NULL | FK → `api_consumers(id)` ON DELETE CASCADE |
| `name` | `TEXT` NOT NULL | Human label e.g. `'itf-supa-prod-2026-04'` |
| `token_hash` | `TEXT` NOT NULL UNIQUE | **SHA-256 hash of plaintext**; plaintext is shown exactly once at provisioning and is never persisted |
| `token_prefix` | `TEXT` NOT NULL | First 8 chars for admin UI identification (full token not retrievable) |
| `allowed_ip_cidrs` | `TEXT[]` | NULL ⇒ all IPs; non-NULL ⇒ middleware rejects non-matching source IP |
| `issued_at` | `TIMESTAMPTZ` NOT NULL DEFAULT `now()` | |
| `rotates_at` | `TIMESTAMPTZ` NOT NULL | `issued_at + 180 days` by default |
| `supersedes_key_id` | `UUID` | FK → `api_keys(id)` NULL; populated during 7-day overlap |
| `revoked_at` | `TIMESTAMPTZ` | Set on emergency / manual revocation; middleware rejects after this timestamp |
| `last_used_at` | `TIMESTAMPTZ` | Observability / anomaly detection |

**`api_key_scopes`** — per-key per-scope join table with LGA-scoping and time-bounded grants.

| Column | Type | Notes |
|---|---|---|
| `api_key_id` | `UUID` NOT NULL | FK → `api_keys(id)` ON DELETE CASCADE |
| `scope` | `TEXT` NOT NULL | One of `aggregated_stats:read`, `marketplace:read_public`, `registry:verify_nin`, `submissions:read_aggregated`, `submissions:read_pii` |
| `allowed_lga_ids` | `UUID[]` | NULL ⇒ all LGAs; non-NULL ⇒ middleware filters query results to listed LGAs |
| `granted_at` | `TIMESTAMPTZ` NOT NULL DEFAULT `now()` | |
| `expires_at` | `TIMESTAMPTZ` | Per-scope expiry (independent of key rotation); NULL ⇒ never |
| Primary key | `(api_key_id, scope)` | |

**`audit_logs` extension (Story 9-11 / Story 10-6 prerequisite):**

- Add nullable `consumer_id UUID` FK → `api_consumers(id)`.
- Add CHECK constraint enforcing **principal exclusivity**:
  ```sql
  CHECK (
    (user_id IS NOT NULL AND consumer_id IS NULL)
    OR (user_id IS NULL AND consumer_id IS NOT NULL)
    OR (user_id IS NULL AND consumer_id IS NULL)    -- system events
  )
  ```
  Every logged event is attributed to **exactly one** principal (human actor, machine consumer, or system), never both. This is enforced at the service layer (Pattern Category 5 update, below) AND at the DB layer — defence in depth against service-layer regressions.
- Composite indexes `audit_logs(actor_id, created_at)`, `audit_logs(consumer_id, created_at)`, `audit_logs(target_resource, target_id, created_at)`, `audit_logs(action, created_at)` are added in **Story 9-11** (Admin Audit Log Viewer), not in Story 11-1, because 9-11 validates them against the 1M-row seeded dataset.

---

### Data Routing & Ownership Matrix

**Purpose:** This section provides a comprehensive explanation of what data resides in the database, the ownership boundaries, and the data flow rules that govern the system. This addresses PRD v8.0 data routing clarifications.

#### Single Database Rationale (ADR-007 Amended per SCP-2026-02-05-001)

OSLSR uses a **single PostgreSQL database** (`app_db`) on one VPS:

> Previously the architecture had two databases (app_db + odk_db). ODK Central was removed per SCP-2026-02-05-001; all data now resides in a single database.

- **Simplified Operations**: One database to back up, monitor, and maintain
- **Performance Isolation**: Marketplace queries use a logical read-only replica, isolating public traffic from operational workload
- **Data Integrity**: Submissions are immutable rows with version-controlled JSONB form schema references
- **NDPA Compliance**: Database resides on Nigerian VPS (no data leaves the country)
- **Foreign Key Integrity**: All data in one database enables referential integrity across forms, submissions, and users

#### Application Database (app_db) Stores

| Data Type | Description | Source | Authoritative |
|-----------|-------------|--------|---------------|
| **Form Definitions** | JSONB schemas with sections, questions, skip logic, choice lists | Form Builder UI / one-time XLSForm migration | App DB (versioned, immutable per version) |
| **Form Version History** | Draft → Published → Archived lifecycle | Form Builder UI | App DB |
| **User Accounts** | Staff & Public User credentials, roles, RBAC | Super Admin bulk import, Public self-registration | App DB |
| **LGA Assignments** | Field Staff hard-locked to LGAs | Bulk CSV import | App DB |
| **Staff Profile Data** | NIN, bank details, live selfie, next of kin | Staff profile completion (Story 1.2) | App DB |
| **Survey Submissions** | JSONB responses with GPS, timestamps, device info | Native form renderer → submission API | App DB (immutable once submitted) |
| **Fraud Detection Scores** | GPS cluster, speed run, straight-lining flags | Fraud Engine (ADR-003) during ingestion | App DB |
| **Marketplace Profiles** | Anonymous skills profiles (consent-based) | Extraction from ingested records (Story 7.1) | App DB |
| **Audit Logs** | All user actions, system events (immutable) | All API endpoints | App DB (append-only) |
| **Payment Records** | Staff remuneration, tranches, disputes | Super Admin bulk recording (Story 6.7) | App DB (append-only) |
| **Communication** | Supervisor ↔ Enumerator messages | In-app messaging (Story 3.4) | App DB |

**Critical Notes:**
- **Drafts are client-side only** (IndexedDB) until submitted (Supervisors cannot see drafts per Story 3.3)
- **Form definitions are versioned** — published forms are immutable; new versions create new records

#### Data Flow Rules

**Rule 1: Form Management**
```
Super Admin → Form Builder UI (create/edit JSONB schema)
  → App API (POST /api/v1/forms)
  → app_db (form_definitions table, status: draft)
  → Super Admin publishes form
  → app_db (form_definitions.status: published, version incremented)
```

**Rule 2: Survey Submission (Primary Flow)**
```
Enumerator → Native Form Renderer (one-question-per-screen, browser PWA)
  → Browser IndexedDB (draft storage with question position tracking)
  → Submit → App API (POST /api/v1/submissions)
  → BullMQ Queue (idempotent processing, dedup by submission UUID)
  → Ingestion Worker
  → app_db (survey_responses record created)
  → Fraud Detection Worker (ADR-003)
  → app_db (fraud_scores updated)
```

**Rule 3: Offline Submission Sync**
```
Enumerator (offline) → Native Form Renderer
  → Browser IndexedDB (queued submissions)
  → On reconnect: IndexedDB queue → App API (same submission endpoint)
  → Idempotent processing (duplicate submission UUIDs rejected gracefully)
```

**Rule 4: Marketplace Profile Creation**
```
Ingestion Worker (after respondent created)
  → Check consent_marketplace field from submission
  → IF consent = "yes":
       Extract (profession, LGA, experience_level)
       → app_db (marketplace_profiles table)
       → Read-Only Replica (logical isolation)
       → Public Marketplace API (/api/v1/marketplace/search)
```

**Rule 5: Dashboard Reporting**
```
Government Official Dashboard
  → Custom App API (/api/v1/reports/*)
  → app_db (aggregate queries on survey_responses)
  → Results cached in Redis (15-minute TTL)
```

**Rule 6: Authentication**
```
All Login Flows (Staff & Public)
  → Custom App handles authentication
  → app_db (users table verification)
  → JWT issued (15-minute access token)
```

**Rule 7: Partner API Request (Epic 10, per SCP-2026-04-22)**
```
Partner Consumer (ITF-SUPA, NBS, NIMC, …)
  → HTTPS request to /api/v1/partner/* with Authorization: Bearer <token>
  → Middleware: apiKeyAuth
      • extract token, SHA-256 hash, lookup in api_keys by token_hash
      • reject on revoked_at ≤ now(); reject on missing
      • timing-safe comparison via crypto.timingSafeEqual
      • check allowed_ip_cidrs (if non-NULL) against req.ip
  → Middleware: requireScope(scope)
      • lookup api_key_scopes WHERE api_key_id + scope
      • reject on missing; reject on expires_at ≤ now()
      • attach allowed_lga_ids to req.scopeContext for downstream query scoping
  → Middleware: per-consumer rate limit (Redis, Story 10-2)
      • key: `ratelimit:consumer:${consumer_id}:${scope}:${minute}`
      • atomic INCR + EXPIRE; reject on threshold exceeded
  → Controller: apply allowed_lga_ids filter to underlying query
  → audit_logs INSERT { actor_id: NULL, consumer_id, action, target_resource, target_id, principal_exclusive CHECK }
  → Response: JSON via standard { code, message, data } envelope (Pattern Category 4)
```

**Rule 8: Import Batch Lifecycle (Epic 11, per SCP-2026-04-22)**
```
Super Admin → Admin Import UI (Story 11-3)
  → POST /api/v1/admin/imports/dry-run  (multipart upload)
      • file SHA-256 hashed; reject if file_hash already in import_batches
      • ImportService parses via parser_used (pdf_tabular | csv | xlsx)
      • per-row decision preview: { insert | match_existing_auto_skip | fail, reason }
      • email/phone match ⇒ auto-skip (per Awwal decision, SCP §4.1 Story 11-2)
      • respond with preview JSON + required lawful_basis selection
  → POST /api/v1/admin/imports/confirm  (with lawful_basis)
      • db.transaction:
          INSERT import_batches (file_hash UNIQUE, lawful_basis, …)
          INSERT respondents (source='imported_*', status='imported_unverified',
                              external_reference_id, import_batch_id, imported_at, nin=NULL or value)
      • audit_logs INSERT for batch creation
  → Admin reviews batch in Story 11-3 UI; can trigger rollback within 14 days
  → POST /api/v1/admin/imports/:id/rollback
      • db.transaction: UPDATE import_batches SET status='rolled_back'
      • SOFT delete associated respondents (status flip, not DELETE — audit trail preserved)
      • audit_logs INSERT for rollback with rationale
```

**Rule 9: Magic-Link Email Authentication (Story 9-12, per SCP-2026-04-22)**
```
Public User → Wizard Step 5 (Optional Auth Setup)
  → POST /api/v1/auth/public/magic-link { email }
      • MagicLinkService: generate token (32 bytes, base64url), TTL 15 minutes
      • Hash token at rest (SHA-256 in magic_link_tokens table); email carries plaintext once
      • AWS SES send with deep link: https://…/auth/magic?token=<plaintext>
  → User clicks email link
  → GET /auth/magic?token=<plaintext>
      • Controller: SHA-256 hash token, lookup magic_link_tokens, validate not-expired + not-used
      • On valid: issue standard JWT (Rule 6), mark token used_at=now(), session cookie set
      • Resume wizard at saved step OR redirect to authenticated dashboard
  → Password fallback: standard public login (Rule 6) remains available for users who set one at wizard completion
  → SMS OTP path: infrastructure built (route handler, provider adapter, audit wiring) but feature-flagged OFF
      via settings.auth.sms_otp_enabled = false (Super Admin toggle; budget-gated until Nigerian SMS provider lands)
```

#### Architectural Boundaries

**MUST DO:**
- ✅ Submission ingestion must be idempotent (submission UUID uniqueness check)
- ✅ Marketplace queries use read-only replica connection
- ✅ Fraud detection runs on submitted records in app_db
- ✅ Form definitions are immutable once published (new version required for changes)

**MUST NOT DO:**
- ❌ Marketplace API cannot modify any data (read-only replica)
- ❌ Frontend cannot bypass API to access database directly
- ❌ Published form definitions cannot be modified (only new versions)

#### Performance Implications

**Ingestion Latency (Submission → Dashboard Visibility):**
- **Target**: <5 seconds (p95) for submission to appear in Supervisor dashboard
- **Measured**: API receipt (~0.5s) + BullMQ processing (2-3s) + Redis cache invalidation (0.5s)
- **Bottleneck**: Fraud detection geospatial queries (mitigated by PostGIS spatial indexes)

**Marketplace Query Performance:**
- **Target**: <250ms (p95) per NFR1.1
- **Achieved**: Read-only replica eliminates lock contention from write operations
- **Benefit**: Public marketplace traffic spikes (TV campaigns) cannot slow enumerator data collection

**Read-Only Replica Implementation:**
```typescript
// apps/api/src/db/replica.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

export const replicaPool = new Pool({
  connectionString: process.env.DATABASE_URL_REPLICA,  // Same DB, different user
  max: 5,  // Lower pool size for read-only queries
});

export const replicaDb = drizzle(replicaPool);

// Usage in marketplace API
router.get('/search', async (req, res) => {
  const results = await replicaDb.query.marketplaceProfiles.findMany({
    where: eq(marketplaceProfiles.profession, req.query.profession)
  });
  res.json(results);
});
```

**PostgreSQL Role Setup:**
```sql
-- Create read-only role
CREATE ROLE marketplace_readonly WITH LOGIN PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE app_db TO marketplace_readonly;
GRANT USAGE ON SCHEMA public TO marketplace_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO marketplace_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO marketplace_readonly;

-- Prevent writes
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM marketplace_readonly;
```

#### Terminology Clarification (PRD v7.5 Update)

**"Logically Isolated Read Replica" (NOT "Air-Gapped"):**

The marketplace database is **NOT physically air-gapped**. It uses a **read-only PostgreSQL connection** to the same `app_db` database, providing:
- **Logical Separation**: Marketplace code cannot write/update/delete data
- **Performance Isolation**: Heavy public search queries don't lock tables for data collection
- **Security Boundary**: Separate API endpoints with stricter rate limiting

**What it is:**
- Same PostgreSQL server, different connection string with `READ ONLY` role
- `SELECT` queries allowed, `INSERT`/`UPDATE`/`DELETE` blocked at database level
- Connection pooling isolated (marketplace pool separate from API pool)

**What it is NOT:**
- Physically separate server (true air-gap impossible on single VPS)
- Network-isolated (both connections go through same localhost)
- Cryptographically separated (encryption at rest applies to whole disk)

---

### Authentication & Security

**Decision 2.1: Authentication Method**
- **Choice:** Hybrid (JWT + Redis blacklist)
- **Rationale:**
  - JWT works offline for enumerators (ADR-004) - 7-day offline capability critical
  - Blacklist enables immediate revocation (security: terminate compromised staff)
  - Blacklist stored in Redis (small dataset, fast lookups)
  - Refresh token rotation for added security
- **Implementation:**
  - Access tokens: 15-minute expiry
  - Refresh tokens: 7-day expiry (stored in httpOnly cookie)
  - Blacklist: Token JTI (JWT ID) added to Redis SET on logout/revocation
- **Affects:** Story 2.1 (Authentication System), all protected endpoints

**Decision 2.2: Password Hashing**
- **Choice:** bcrypt
- **Version:** 5.x
- **Rationale:**
  - Industry standard, battle-tested at scale
  - Government systems favor conservative choices
  - Performance sufficient for 132 staff accounts
  - 10-12 salt rounds balances security vs performance
- **Affects:** Story 2.1 (User Registration/Login)

**Decision 2.3: API Security Middleware**
- **Choice:** Helmet + CORS + express-rate-limit
- **Rationale:**
  - Helmet sets secure HTTP headers (CSP per NFR8, HSTS, noSniff)
  - CORS configured for SPA + API separation
  - express-rate-limit integrates with Redis (ADR-006 defense-in-depth)
- **Configuration:**
  - Rate limits: 30 req/min per IP (marketplace), 100 req/min (authenticated API)
  - CSP: strict-dynamic, no unsafe-inline
- **Affects:** All API endpoints, Story 2.2 (Security Middleware)

**Decision 2.4: API Consumer Authentication — `apiKeyAuth` Middleware (Epic 10, SCP-2026-04-22)**

- **Choice:** Bearer-token scoped API keys, SHA-256-hashed at rest, enforced via a dedicated `apiKeyAuth` middleware on the `/api/v1/partner/*` router; separate from the JWT middleware that protects human-user routes.
- **See:** ADR-019 (decision rationale), FR24, NFR10.
- **Implementation:**
  - **Token extraction:** `Authorization: Bearer <token>` header only. Query-string tokens rejected (leak via access logs).
  - **Token lookup:** compute SHA-256 of submitted token, look up `api_keys.token_hash` via equality (index-backed). If not found → `401 API_KEY_INVALID`. Timing-safe via constant-time DB index probe (not string compare) plus `crypto.timingSafeEqual` on the returned hash before admitting the request — prevents oracle attacks that distinguish "wrong key" from "valid key, wrong scope".
  - **Revocation check:** reject if `revoked_at IS NOT NULL AND revoked_at ≤ now()` → `401 API_KEY_REVOKED`.
  - **Expiry check:** reject if `rotates_at ≤ now()` AND no successor within the 7-day overlap window → `401 API_KEY_EXPIRED`. During the overlap window, both old and new keys validate; lookup on the old key's hash still succeeds and is audit-logged with `meta.rollover_window = true`.
  - **IP allowlist:** if `allowed_ip_cidrs IS NOT NULL`, reject if `req.ip` (behind trusted proxy headers, per ADR-013 reverse proxy stance) does not match any CIDR → `403 IP_NOT_ALLOWED`.
  - **Request attribution:** attach `req.consumer = { id, name, organisation_type }` and `req.apiKey = { id, scopes: [] }` to the request context.
- **Scope enforcement via `requireScope(scope)` helper** applied per-route:
  - Lookup `api_key_scopes` WHERE `api_key_id = req.apiKey.id AND scope = <requested>`.
  - Reject if missing → `403 SCOPE_INSUFFICIENT`.
  - Reject if `expires_at IS NOT NULL AND expires_at ≤ now()` → `403 SCOPE_EXPIRED`.
  - Attach `req.scopeContext = { allowed_lga_ids }` for downstream query-level filtering.
- **Error taxonomy (aligned with existing `{ code, message, details? }` envelope, Pattern Category 4):**
  - `401 API_KEY_MISSING` — no Authorization header or non-Bearer type
  - `401 API_KEY_INVALID` — hash not found
  - `401 API_KEY_REVOKED` — revoked_at in the past
  - `401 API_KEY_EXPIRED` — rotation window exceeded with no successor
  - `403 IP_NOT_ALLOWED` — source IP outside allowlist
  - `403 SCOPE_INSUFFICIENT` — key does not hold requested scope
  - `403 SCOPE_EXPIRED` — scope grant past `expires_at`
  - `400 AMBIGUOUS_AUTH` — request carries **both** a JWT (cookie or header) and an API key; never valid; prevents accidental privilege blending
  - `429 RATE_LIMITED` — per-consumer per-scope Redis bucket exceeded (emitted by Story 10-2 middleware, downstream of `apiKeyAuth`)
- **Observability:** every partner request logged to Pino with `consumer_id`, `api_key_id`, `scope`, `latency_ms`, `outcome`. Audit-log write is mandatory (see Pattern Category 5 update, below). `last_used_at` updated asynchronously (non-blocking UPDATE) to avoid write-amplification on the hot path.
- **Affects:** Story 10-1 (Consumer Auth), Story 10-2 (Rate Limit), Story 10-3 (Admin UI), Story 10-6 (Audit Dashboard).

**Decision 2.5: Magic-Link Email Authentication (Story 9-12, primary for public users)**

- **Choice:** One-time, single-use, short-TTL magic-link tokens delivered via AWS SES; primary authentication channel for public users entering the wizard or resuming a saved session.
- **See:** ADR-015 (rewritten below), FR27.
- **Implementation:**
  - **Token generation:** 32 random bytes (`crypto.randomBytes(32)`) base64url-encoded.
  - **Storage:** `magic_link_tokens` table — `{ id UUID, user_id | public_user_id, token_hash TEXT (SHA-256), purpose TEXT ('wizard_resume' | 'login' | 'pending_nin_complete'), expires_at TIMESTAMPTZ, used_at TIMESTAMPTZ NULL, created_at }`. Plaintext is never persisted.
  - **TTL:** 15 minutes for login; 72 hours for `pending_nin_complete` (allowing field respondents to complete from a remembered email later).
  - **Single-use enforcement:** `used_at` set atomically on first redemption; second redemption attempts rejected with `MAGIC_LINK_ALREADY_USED`.
  - **Rate limit:** max 3 requests per email per hour (existing NFR4.4 password-reset budget; same quota pool).
  - **Deep link:** `https://<host>/auth/magic?token=<plaintext>&purpose=<purpose>`; controller hashes, validates, issues standard JWT per Decision 2.1, and redirects to wizard saved-step OR dashboard depending on purpose.
- **Interaction with JWT:** magic-link redemption issues the same JWT + refresh-token pair as password login. Downstream session semantics identical (15-min access, 7-day refresh, blacklist on logout).
- **Affects:** Story 9-12 (Public Wizard), ADR-015 (rewrite).

**Decision 2.6: SMS OTP Authentication — Infrastructure-Only / Budget-Gated**

- **Choice:** Build the full code path (route handler, provider adapter interface, audit wiring, rate limiting) but ship with the feature flag `settings.auth.sms_otp_enabled = false` until a Nigerian SMS provider contract lands.
- **Rationale:** field-survey UX research flagged SMS as the single most frustrating point of failure in Nigerian contexts (network, cost, deliverability). Magic-link email (Decision 2.5) is the primary channel. SMS OTP is built once and toggled later — avoids a second integration sprint post-launch.
- **Implementation:**
  - `SmsProviderAdapter` interface with one implementation: `NoopSmsProvider` that logs + rejects with `SMS_OTP_DISABLED`.
  - When the flag flips ON (Super Admin action, audit-logged), the provider resolver switches to `TermiiProvider` / `AfricasTalkingProvider` (one, not both; TBD at provider-selection time) and the full code path activates with no deploys required.
  - No partner-API scope depends on SMS OTP.
- **Affects:** Story 9-12 (infrastructure scaffolding).

**Decision 2.7: Operator SSH Access — Tailscale Overlay (As-Deployed 2026-04-23)**

- **Choice:** Tailscale overlay network as the sole primary SSH access path; DigitalOcean web/recovery console as break-glass; public-internet SSH disabled at both firewall and sshd.
- **See:** NFR9, ADR-020 (full decision rationale), Story 9-9 Change Log entry 2026-04-23, `docs/emergency-recovery-runbook.md`.
- **Implementation (as-deployed):**
  - DigitalOcean Cloud Firewall rule: SSH (22/tcp) source = `100.64.0.0/10` (Tailscale CGNAT range) only. Public `0.0.0.0/0` removed.
  - Tailnet members: VPS `oslsr-home-app` @ `100.93.100.28`; operator laptop `desktop-qe4lplq` @ `100.113.78.101`; both signed in under `lawalkolade@gmail.com` Free tier.
  - `sshd_config` main + drop-ins (`50-cloud-init.conf`, `60-cloudimg-settings.conf`) consistently set: `PasswordAuthentication no`, `PermitRootLogin prohibit-password`, `PubkeyAuthentication yes`.
  - `/root/.ssh/authorized_keys`: two keys — `github-actions-deploy` (CI; DO NOT REMOVE) and `awwallawal@gmail.com` (operator personal).
  - fail2ban installed + enabled (default config: maxretry 5, bantime 10m, sshd jail) as defence-in-depth against any authenticated-user compromise.
- **Break-glass path order (documented in runbook):** Tailscale SSH → Tailscale IP direct → Tailscale daemon restart → DO Web Console → DO Recovery Console → DO Snapshot restore → DO Support ticket.
- **Operational note:** public-IP SSH returns `Connection timed out` (firewall); key-disabled SSH returns `Permission denied (publickey)` (sshd). Both are the intended states.
- **Quarterly drill:** recovery runbook §6.1 requires exercising each break-glass path at least once per quarter, logged in the Change Log.
- **Affects:** NFR9, Story 9-9 Tailscale subtask (delivered), all future operator access.

**Decision 2.8: Ambiguous-Auth Rejection**

- **Choice:** requests that carry **both** a JWT (cookie or Authorization header) **and** a `Bearer <api_key>` token MUST be rejected with `400 AMBIGUOUS_AUTH` before any controller runs.
- **Rationale:** prevents accidental privilege blending where a human user's session token and a partner consumer's API key coexist on the same request (possible in developer environments mixing browser cookies and manual header testing). Distinct principals, distinct pipelines, no merge.
- **Implementation:** a lightweight pre-middleware on `/api/v1/partner/*` that 400s on co-presence. The JWT middleware on non-partner routes already ignores `Authorization: Bearer <api_key>`-shaped tokens (different decode failure), so the rejection is one-sided (partner side).
- **Affects:** Story 10-1.

---

### Marketplace Security Architecture (3-Route Model)

**Purpose:** This section defines the security model for the public skills marketplace, clarifying authentication requirements, rate limiting, and bot protection strategies across three distinct routes (PRD Story 7.3, 7.4).

#### Route Structure & Authentication Requirements

**PRD Story 7.3 specifies three marketplace routes with different security postures:**

| Route | Purpose | Authentication | Rate Limiting | Data Exposed |
|-------|---------|---------------|---------------|--------------|
| `/marketplace` | Static landing page | ❌ None | 100 req/min/IP | Metadata only (counts, stats) |
| `/marketplace/search` | Dynamic search | ❌ None | 30 req/min/IP + CAPTCHA after 10 queries | Anonymous profiles (profession, LGA, experience) |
| `/marketplace/profile/:id` | Full profile view | ✅ **Required** | 50 contacts/24hr/user + device fingerprint | Name + Phone (if enriched consent given) |

#### Security Architecture Diagram

```
Public User (No Account)
  ↓
  GET /marketplace/search?profession=Plumber&lga=Ibadan
  ↓
[Rate Limiter: 30 req/min/IP]
  ↓
[CAPTCHA Challenge: If >10 queries in 5min]
  ↓
[Read-Only Replica Connection]
  ↓
  SELECT profession, lga, experience_level
  FROM marketplace_profiles
  WHERE consent_marketplace = true
  ↓
  Response: [{ id: "abc123", profession: "Plumber", lga: "Ibadan", experience: "3-5 years" }]
  (NO name, NO phone, NO NIN)

───────────────────────────────────────────────────────────────

Authenticated Searcher (Registered Account)
  ↓
  GET /marketplace/profile/abc123
  ↓
[JWT Authentication Check]
  ↓
[Device Fingerprinting (FingerprintJS)]
  ↓
[Rate Limiter: 50 contacts/24hr/user+device]
  ↓
[Read-Only Replica Connection]
  ↓
  SELECT * FROM marketplace_profiles WHERE id = 'abc123' AND consent_enriched = true
  ↓
[Audit Log: INSERT INTO contact_views (searcher_id, worker_id, timestamp, ip, device_fingerprint)]
  ↓
  Response: {
    id: "abc123",
    profession: "Plumber",
    lga: "Ibadan",
    experience: "3-5 years",
    name: "John Doe",           ← ONLY if consent_enriched = true
    phone: "+234 801 234 5678"  ← ONLY if consent_enriched = true
  }
```

#### Implementation: Authentication Middleware

```typescript
// apps/api/src/middleware/marketplace-auth.ts
import { verifyJWT } from '@/lib/jwt';
import { redis } from '@/lib/redis';

export async function requireAuthForProfile(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      code: 'AUTH_REQUIRED',
      message: 'You must log in to view full contact details',
      redirectTo: '/auth/login?returnTo=' + encodeURIComponent(req.originalUrl)
    });
  }

  try {
    const payload = verifyJWT(token);
    req.user = payload;

    // Check daily contact view limit (NFR4.4: 50 contacts/24hr)
    const deviceFingerprint = req.headers['x-device-fingerprint'];
    if (!deviceFingerprint) {
      return res.status(400).json({
        code: 'DEVICE_FINGERPRINT_REQUIRED',
        message: 'Device fingerprinting required for security'
      });
    }

    const rateLimitKey = `contact_views:${payload.userId}:${deviceFingerprint}`;
    const viewCount = parseInt(await redis.get(rateLimitKey) || '0');

    if (viewCount >= 50) {
      const ttl = await redis.ttl(rateLimitKey);
      return res.status(429).json({
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Daily contact view limit reached (50 per 24 hours)',
        retryAfter: ttl
      });
    }

    next();
  } catch (error) {
    return res.status(401).json({
      code: 'INVALID_TOKEN',
      message: 'Authentication token is invalid or expired'
    });
  }
}

// Usage in marketplace routes
router.get('/marketplace/profile/:id', requireAuthForProfile, async (req, res) => {
  const profile = await replicaDb.query.marketplaceProfiles.findFirst({
    where: and(
      eq(marketplaceProfiles.id, req.params.id),
      eq(marketplaceProfiles.consentEnriched, true)  // Only show contact if consent given
    )
  });

  if (!profile) {
    return res.status(404).json({
      code: 'PROFILE_NOT_FOUND',
      message: 'Profile not found or contact details not available'
    });
  }

  // Log contact view (immutable audit trail per NFR8.3)
  await db.insert(contactViews).values({
    id: uuidv7(),
    searcherId: req.user.userId,
    workerId: profile.id,
    ipAddress: req.ip,
    deviceFingerprint: req.headers['x-device-fingerprint'],
    timestamp: new Date()
  });

  // Increment rate limit counter
  const rateLimitKey = `contact_views:${req.user.userId}:${req.headers['x-device-fingerprint']}`;
  await redis.incr(rateLimitKey);
  await redis.expire(rateLimitKey, 86400);  // 24 hours

  res.json(profile);  // Includes name + phone
});
```

#### Bot Protection (Defense-in-Depth per ADR-006)

**Layer 1: IP Rate Limiting** (30 req/min)
- Blocks aggressive scrapers
- Implemented via express-rate-limit + Redis
- Per-IP tracking with sliding window

**Layer 2: Progressive CAPTCHA** (After 10 searches in 5min)
- hCaptcha integration (GDPR-compliant alternative to Google reCAPTCHA)
- Only triggered after suspicious behavior detected
- Solves challenges cached for 1 hour per IP

**Layer 3: Device Fingerprinting** (FingerprintJS)
- Tracks users across IP changes (VPN/proxy circumvention)
- Required for contact view rate limiting
- Fingerprint stored in audit logs for forensics

**Layer 4: Honeypot Fields** (Hidden form inputs)
- Invisible fields that bots auto-fill
- Instant 403 Forbidden if filled
- No false positives (invisible to humans)

**Layer 5: Pagination Limits** (Max 100 profiles per query)
- Prevents bulk export via repeated searches
- Enforced at database query level
- Cursor-based pagination (not offset-based to prevent scraping loops)

**Layer 6: Authentication for Contact Details**
- Scrapers must create traceable accounts
- Account creation requires email verification
- Suspicious account creation patterns flagged (10+ accounts from same IP in 1 hour)

#### Why Search Doesn't Require Auth (Trade-off Justification)

**Benefits:**
- **SEO**: Google indexes marketplace (drives organic traffic for job seekers)
- **User Friction**: No login wall = higher adoption rate
- **Public Good**: Anonymous browsing helps employers discover talent

**Mitigations:**
- Anonymous profiles contain **zero PII** (profession, LGA, experience only)
- Rate limiting prevents bulk scraping (30 req/min = max 43,200 profiles/day per IP)
- CAPTCHA after 10 queries breaks automation
- High-value data (contact details) requires authentication + audit trail

**Rationale (PRD Alignment):**
- PRD Story 7.3: "Static Landing Page (SEO optimized)"
- PRD Story 7.4: "register and log in to view the full contact details"
- PRD NFR4.4: "Profile Views (Contact Reveal): 50 contacts per authenticated user per 24 hours"

#### Database Schema

```typescript
// apps/api/src/db/schema/marketplace.ts
export const marketplaceProfiles = pgTable('marketplace_profiles', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  respondentId: uuid('respondent_id').references(() => respondents.id),

  // Anonymous fields (always visible)
  profession: text('profession').notNull(),
  lga: text('lga').notNull(),
  experienceLevel: text('experience_level'),  // "0-1 years", "3-5 years", etc.

  // Enriched fields (requires consentEnriched = true)
  name: text('name'),
  phone: text('phone'),
  bio: text('bio'),
  portfolioUrl: text('portfolio_url'),

  // Consent tracking
  consentMarketplace: boolean('consent_marketplace').default(false),  // Anonymous profile
  consentEnriched: boolean('consent_enriched').default(false),        // Contact details

  // Timestamps
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const contactViews = pgTable('contact_views', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  searcherId: uuid('searcher_id').notNull(),  // Who viewed
  workerId: uuid('worker_id').notNull(),      // Whose profile was viewed
  ipAddress: text('ip_address'),
  deviceFingerprint: text('device_fingerprint'),
  timestamp: timestamp('timestamp').defaultNow(),
});
```

#### Performance Considerations

**Read-Only Replica Benefits:**
- Marketplace queries **never block** data collection writes
- Separate connection pool (max 5 connections vs 20 for main API)
- Public traffic spikes (TV campaigns) isolated from operational systems

**Caching Strategy:**
- Search results cached in Redis (5-minute TTL)
- Cache key: `marketplace:search:${JSON.stringify(queryParams)}`
- Invalidated when new profiles created (BullMQ job on ingestion)

**Query Optimization:**
- PostgreSQL full-text search with GIN index on profession + LGA
- Fuzzy matching via pg_trgm extension (handles typos)
- Pagination via cursor (last seen ID) not offset (prevents scraping loops)

---

### API Design & Documentation

**Decision 3.1: API Documentation**
- **Choice:** OpenAPI/Swagger
- **Version:** OpenAPI 3.1
- **Rationale:**
  - Industry standard for government integrations
  - Auto-generated interactive docs (useful for back-office staff testing)
  - Can generate client SDKs if needed (future government integrations)
  - zod-to-openapi package auto-generates spec from Zod schemas
- **Affects:** All API endpoints, Story 1.3 (API Documentation Setup)

**Decision 3.2: Error Handling Strategy**
- **Choice:** Centralized error handler with error codes
- **Rationale:**
  - Consistent error responses across all endpoints
  - i18n-ready (English primary, Yoruba planned per PRD)
  - Fraud detection errors need detailed explanations (ADR-003)
  - Client needs structured errors for offline retry logic (ADR-004)
- **Format:**
  ```json
  {
    "code": "NIN_DUPLICATE",
    "message": "This individual was already registered on 2026-01-15 via enumerator_survey",
    "details": {
      "nin": "12345678901",
      "originalSubmissionDate": "2026-01-15",
      "originalSource": "enumerator_survey"
    }
  }
  ```
- **Affects:** All error handling, Story 2.3 (Error Handling Middleware)

**Decision 3.3: API Versioning**
- **Choice:** URL versioning (`/api/v1/...`)
- **Rationale:**
  - Government systems may need legacy API support for years
  - Clear deprecation path for future changes
  - Simple to implement and discover (no header inspection)
  - Future-proof for 7-year data retention requirement (NDPA)
- **Affects:** All API routes, URL structure

**Decision 3.4: Partner API Namespace (Epic 10, SCP-2026-04-22)**

- **Choice:** Third-party MDA consumers are served from a distinct namespace `/api/v1/partner/*`, mounted under the same app server as existing human-user routes, but protected by `apiKeyAuth` (Decision 2.4) and carrying a parallel OpenAPI spec surfaced at `/developers` (Story 10-4).
- **See:** FR24, ADR-019.
- **Scope taxonomy (initial release — additional scopes require PRD amendment):**

  | Scope | Purpose | Data Surface | Defaults |
  |---|---|---|---|
  | `aggregated_stats:read` | Ministry-level aggregate counts and time-series | Counts by LGA, source, profession — no PII | Rate limit: 60 req/min per consumer; adjustable in Story 10-3 |
  | `marketplace:read_public` | Public marketplace profile read (same surface as unauthenticated `/marketplace/search`) | Anonymous profiles (profession, LGA, experience) | Rate limit: 120 req/min |
  | `registry:verify_nin` | "Does this NIN exist in the registry?" boolean lookup | Returns `{ exists: bool, registered_at: ISO8601, source: enum }` — no PII beyond registration timestamp and source | Rate limit: 300 req/min; excludes `pending_nin_capture` / `imported_unverified` rows per FR28 downstream-exclusion clause |
  | `submissions:read_aggregated` | Aggregated submission counts and derivations for research partners | Counts, histograms, distributions — NO row-level data | Rate limit: 30 req/min |
  | `submissions:read_pii` | **Sensitive** — row-level respondent data including PII | Full respondent records (including phone, NIN if present) | Rate limit: 20 req/min; **provisioning gated on signed DSA (Story 10-5) AND two-person Ministry ICT approval per FR24** |

- **Response envelope consistency:** all partner endpoints emit the standard `{ code, message, data }` pattern per Pattern Category 4 — no separate envelope. Error codes follow Decision 2.4 taxonomy.
- **Rate-limit strategy:** per-consumer per-scope, Redis-backed via Story 10-2. Key format: `ratelimit:consumer:{consumer_id}:{scope}:{YYYY-MM-DDTHH:MM}` with atomic `INCR` + `EXPIRE 70` (slight overhang past the minute bucket to absorb clock drift). Quotas (daily / monthly) are separate Redis keys and evaluated after the per-minute check.
- **LGA-scoping enforcement:** when `api_key_scopes.allowed_lga_ids` is non-NULL, the controller **MUST** apply the filter to the underlying query before returning results. This is enforced via a service-layer guard (`enforceLgaScope(req, query)`) that wraps the Drizzle query builder; partner-route controllers that skip this guard fail a static lint check (Story 10-1 adds the lint rule). Defence in depth: Story 10-2 additionally audit-logs every partner query with `applied_lga_filter` metadata.
- **DSA precondition (FR24):** the admin UI (Story 10-3) must block scope assignment of `submissions:read_pii` unless `api_consumers.dsa_document_url IS NOT NULL`. Enforced at both UI and service layer (defence in depth). Violation attempts are audit-logged with principal = super-admin actor, event = `api_key.pii_scope_rejected_no_dsa`.
- **Versioning for partner namespace:** follows the same `/api/v1/` convention. A future breaking-change bump to `/api/v1_partner_v2/` is reserved but not needed for MVP; additive changes (new scopes, new response fields) ship under v1 with OpenAPI changelog entries in `/developers`.
- **Affects:** Stories 10-1, 10-2, 10-3, 10-4, 10-6.

---

### Frontend Architecture

**Decision 4.1: React Version**
- **Choice:** React 18.3 (NOT React 19)
- **Rationale:**
  - React 19 has critical security vulnerabilities (CVEs 55182, 55184, 67779, 55183)
  - React 19 broke update stability for many developers
  - React 18.3 is the bridge version (includes React 19 compatibility warnings)
  - OSLSR doesn't need React Server Components (separate API architecture)
  - Battle-tested stability for government 7-year lifecycle
  - All chosen libraries (TanStack Query, React Hook Form, shadcn/ui) work perfectly with React 18
- **Affects:** All frontend code, Story 1.1 (Frontend Initialization)

**Decision 4.2: State Management**
- **Choice:** TanStack Query + Zustand
- **Rationale:**
  - TanStack Query handles server state (perfect for offline PWA per ADR-004)
  - Automatic caching, background refetch, optimistic updates (NFR1.4)
  - Zustand for UI state (dashboard filters, form wizards, temporary UI flags)
  - Clear separation: server data vs UI state
  - Lightweight combined footprint (~15KB)
- **Affects:** All data fetching, Story 3.1 (State Management Setup)

**Decision 4.3: Form Handling**
- **Choice:** React Hook Form + Zod
- **Rationale:**
  - Uncontrolled forms minimize re-renders (performance critical for data entry clerk - hundreds of records/day)
  - Zod integration provides validation reuse with backend (single source of truth)
  - shadcn/ui has built-in React Hook Form examples
  - Excellent DX with TypeScript
- **Affects:** All forms, Story 3.2 (Form Components)
- **Amendment (2026-02-14, Story 3.6):** The native form renderer (FormFillerPage, Story 3.1) and the clerk data entry interface (ClerkDataEntryPage, Story 3.6) use controlled `useState<Record<string, unknown>>` instead of React Hook Form. Rationale: (1) Dynamic form schemas built from server-defined `FlattenedQuestion[]` require runtime Zod schema generation with circular dependencies between `watch()` → skip logic → visible questions → schema rebuilds; (2) The existing `QuestionRenderer` component tree uses a `value`/`onChange` controlled pattern — migrating to RHF `Controller` wrappers adds complexity without functional benefit at the current field count (~20-30 fields); (3) Performance difference is negligible on desktop browsers at this scale. RHF + Zod remains the standard for static forms (auth, settings). A unified migration is tracked as tech-debt Story TD-4.1 in Epic 4.

**Decision 4.4: Data Fetching**
- **Choice:** TanStack Query
- **Rationale:**
  - Matches state management choice (Decision 4.2)
  - Offline mode critical (ADR-004) - TanStack Query handles service worker integration
  - Optimistic UI (NFR1.4) built-in
  - Automatic retry with exponential backoff (matches webhook retry strategy ADR-009)
- **Affects:** All API calls, Story 3.3 (Data Fetching Layer)

**Decision 4.5: Routing**
- **Choice:** React Router v7
- **Rationale:**
  - Industry standard, most developers familiar (easier hiring/onboarding)
  - Battle-tested for government systems
  - v7 has improved data loading (matches TanStack Query patterns)
  - PWA service worker handles offline routing (not router's responsibility)
- **Affects:** All navigation, Story 3.4 (Routing Setup)

---

### Media Handling Architecture

**Purpose:** This section defines the technical implementation for capturing, validating, and processing live selfies that serve dual purposes: identity verification and ID card portraits (PRD Story 1.2, 2.4).

#### Live Selfie Implementation (Dual-Purpose Photo)

**Requirements (PRD v7.5):**
- Single photo serves **TWO purposes**: (1) Identity verification, (2) ID card portrait
- **Liveness detection** required to prevent photo-of-photo fraud
- **Auto-crop and format** to meet ID card portrait specifications
- Capture using device camera with guidance UI

**Technical Architecture:**

```
User Device → Live Camera Feed → Liveness Detection (Client) → Capture → Upload
  → Server-Side Liveness Verification → Auto-Crop for ID Card → Store (S3)
  → Database (original URL + cropped URL)
```

#### 1. Frontend Capture Component (Web-Based Liveness Detection)

**Technology Choice:**
- **face-api.js**: TensorFlow.js-based face detection (browser-native, works offline)
- **File Size**: ~2MB models (cached in service worker)
- **Performance**: ~100-200ms detection on modern phones

**Implementation:**

```typescript
// apps/web/src/features/staff-onboarding/components/LiveSelfieCapture.tsx
import { useRef, useState } from 'react';
import * as faceapi from 'face-api.js';

export function LiveSelfieCapture() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [detectionResult, setDetectionResult] = useState<{
    passed: boolean;
    confidence: number;
    guidance?: string;
  }>();

  // 1. Load face detection models (cached)
  useEffect(() => {
    const loadModels = async () => {
      await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
      await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
    };
    loadModels();
  }, []);

  // 2. Start webcam stream
  const startCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',  // Front camera
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  };

  // 3. Real-time face detection loop (guidance feedback)
  useEffect(() => {
    const detectFace = async () => {
      if (!videoRef.current) return;

      const detection = await faceapi.detectSingleFace(
        videoRef.current,
        new faceapi.TinyFaceDetectorOptions()
      );

      if (!detection) {
        setDetectionResult({
          passed: false,
          confidence: 0,
          guidance: 'No face detected - please position your face in the frame'
        });
      } else {
        // Calculate face coverage
        const faceArea = detection.box.width * detection.box.height;
        const videoArea = videoRef.current.videoWidth * videoRef.current.videoHeight;
        const coverage = faceArea / videoArea;

        if (coverage < 0.15) {
          setDetectionResult({
            passed: false,
            confidence: detection.score,
            guidance: 'Face too small - move closer to camera'
          });
        } else if (coverage > 0.50) {
          setDetectionResult({
            passed: false,
            confidence: detection.score,
            guidance: 'Face too large - move back from camera'
          });
        } else {
          setDetectionResult({
            passed: true,
            confidence: detection.score,
            guidance: 'Perfect! Ready to capture'
          });
        }
      }

      // Repeat detection every 500ms
      setTimeout(detectFace, 500);
    };

    detectFace();
  }, []);

  // 4. Capture photo
  const capturePhoto = async () => {
    if (!detectionResult?.passed) {
      toast.error('Please follow the guidance before capturing');
      return;
    }

    const canvas = canvasRef.current!;
    const video = videoRef.current!;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);

    const blob = await new Promise<Blob>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', 0.95)
    );

    // Upload to server
    await uploadSelfie(blob);
  };

  return (
    <div className="relative">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full rounded-lg"
      />
      <canvas ref={canvasRef} className="hidden" />

      {/* Overlay guidance */}
      <div className="absolute top-4 left-4 right-4 bg-black/70 text-white p-3 rounded">
        {detectionResult?.guidance}
        <div className="text-sm text-green-400">
          Confidence: {(detectionResult?.confidence * 100).toFixed(0)}%
        </div>
      </div>

      <Button
        onClick={capturePhoto}
        disabled={!detectionResult?.passed}
        className="mt-4"
      >
        Capture Photo
      </Button>
    </div>
  );
}
```

#### 2. Server-Side Processing (Auto-Crop + Advanced Verification)

**Technology Choice:**
- **sharp**: High-performance image processing (Node.js native)
- **AWS Rekognition** (optional): Advanced liveness detection (detects photo-of-photo)
- **Cost**: $0.001 per image (Rekognition) - ~$200 for 200 staff

**Implementation:**

```typescript
// apps/api/src/services/photo-processing.service.ts
import sharp from 'sharp';
import { RekognitionClient, DetectFacesCommand } from '@aws-sdk/client-rekognition';

const rekognition = new RekognitionClient({ region: 'us-east-1' });

export async function processLiveSelfie(imageBuffer: Buffer): Promise<{
  originalUrl: string;
  idCardUrl: string;
  livenessScore: number;
}> {
  // 1. Server-side liveness verification (optional but recommended)
  const rekognitionResult = await rekognition.send(new DetectFacesCommand({
    Image: { Bytes: imageBuffer },
    Attributes: ['ALL']
  }));

  const face = rekognitionResult.FaceDetails?.[0];
  if (!face) {
    throw new Error('No face detected in uploaded photo');
  }

  // Check for photo-of-photo indicators
  if (face.Quality?.Sharpness && face.Quality.Sharpness < 50) {
    throw new Error('Photo quality too low - appears to be a screenshot or print');
  }

  // 2. Get image metadata
  const metadata = await sharp(imageBuffer).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error('Invalid image format');
  }

  // 3. Upload original to S3 (full resolution for audit trail)
  const originalUrl = await uploadToS3(
    imageBuffer,
    `staff-photos/original/${uuidv7()}.jpg`
  );

  // 4. Auto-crop for ID card portrait (3:4 ratio, passport-style)
  const boundingBox = face.BoundingBox!;
  const faceLeft = boundingBox.Left! * metadata.width;
  const faceTop = boundingBox.Top! * metadata.height;
  const faceWidth = boundingBox.Width! * metadata.width;
  const faceHeight = boundingBox.Height! * metadata.height;

  // Add padding around face (20% margin on each side)
  const margin = 0.2;
  const cropLeft = Math.max(0, faceLeft - faceWidth * margin);
  const cropTop = Math.max(0, faceTop - faceHeight * margin * 1.5);  // Extra top margin for forehead
  const cropWidth = faceWidth * (1 + 2 * margin);
  const cropHeight = cropWidth * 1.33;  // 3:4 ratio (passport photo standard)

  const idCardBuffer = await sharp(imageBuffer)
    .extract({
      left: Math.round(cropLeft),
      top: Math.round(cropTop),
      width: Math.round(cropWidth),
      height: Math.round(cropHeight)
    })
    .resize(400, 533, { fit: 'cover', position: 'top' })  // Standard ID card size
    .jpeg({ quality: 95, mozjpeg: true })  // High quality for printing
    .toBuffer();

  const idCardUrl = await uploadToS3(
    idCardBuffer,
    `staff-photos/id-card/${uuidv7()}.jpg`
  );

  return {
    originalUrl,
    idCardUrl,
    livenessScore: face.Confidence! / 100
  };
}
```

#### 3. Database Schema

```typescript
// apps/api/src/db/schema/users.ts
export const users = pgTable('users', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),

  // Live Selfie URLs
  liveSelfieOriginal: text('live_selfie_original'),      // Original capture (1280x720)
  liveSelfieIdCard: text('live_selfie_id_card'),         // Auto-cropped (400x533)
  livenessScore: real('liveness_score'),                  // 0.0-1.0 confidence
  liveSelfieVerifiedAt: timestamp('live_selfie_verified_at'),  // Manual review timestamp

  // ... other fields
});
```

#### 4. ID Card Generation (Story 2.4)

```typescript
// apps/api/src/services/id-card-generator.service.ts
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

export async function generateIDCard(userId: string): Promise<Buffer> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId)
  });

  if (!user.liveSelfieIdCard) {
    throw new Error('ID card photo not available - complete profile first');
  }

  const doc = new PDFDocument({ size: [243, 153] });  // CR80 card size (3.375" x 2.125")
  const buffers: Buffer[] = [];
  doc.on('data', buffers.push.bind(buffers));

  // ===== FRONT OF CARD =====
  doc.image(user.liveSelfieIdCard, 10, 10, { width: 80, height: 107 });  // Uses auto-cropped photo
  doc.fontSize(14).font('Helvetica-Bold').text(user.fullName, 100, 20);
  doc.fontSize(11).font('Helvetica').text(user.role, 100, 40);
  doc.fontSize(9).text(`LGA: ${user.assignedLga}`, 100, 60);
  doc.fontSize(8).text(`ID: ${user.id.slice(0, 8)}`, 100, 75);

  // Oyo State logo (if available)
  // doc.image('assets/oyo-state-logo.png', 100, 90, { width: 40 });

  // ===== BACK OF CARD =====
  doc.addPage();

  // QR Code for public verification
  const qrCodeBuffer = await QRCode.toBuffer(
    `https://oslsr.gov.ng/verify-staff/${user.id}`,
    { width: 150, margin: 1 }
  );
  doc.image(qrCodeBuffer, 47, 20, { width: 150, height: 150 });

  doc.fontSize(8).text('Scan to verify authenticity', 50, 175, { align: 'center' });

  doc.end();

  return Buffer.concat(await new Promise(resolve => {
    doc.on('end', () => resolve(buffers));
  }));
}
```

#### Trade-offs & Design Decisions

**Why Single Photo Works:**
- Original resolution (1280x720) captures sufficient detail for both purposes
- Auto-crop extracts passport-style portrait (400x533) from detected face
- Original retained for audit trail (proves liveness context)
- Reduces user friction (no separate "upload passport photo" step)

**Liveness Detection Strategy:**
- **Client-Side (face-api.js)**: Immediate feedback, works offline, prevents obvious fraud
- **Server-Side (AWS Rekognition)**: Robust detection of sophisticated attacks (photo-of-photo, deepfakes)
- **Hybrid Approach**: Client for UX, server for security

**Security Considerations:**
- Photo-of-photo attacks mitigated by sharpness/quality checks
- Face positioning requirements prevent pre-recorded videos
- Liveness score logged for audit (low scores flagged for manual review)
- S3 URLs signed with 1-hour expiry (prevents public scraping)
- Original + cropped versions stored separately (audit trail + print quality)

**Performance:**
- Client-side detection: ~100-200ms per frame (acceptable for real-time guidance)
- Server-side processing: ~500ms (sharp) + ~300ms (Rekognition) = ~800ms total
- Auto-crop deterministic (no manual cropping needed)

**Fallback for Non-Camera Devices:**
- For desktop users without webcam: Allow file upload with stricter server-side checks
- Require higher liveness score threshold for uploaded files

---

### Observability

**Decision 5.1: Logging**
- **Choice:** Pino
- **Version:** 9.x
- **Rationale:**
  - Fastest Node.js logger (performance matters for NFR1.1: 250ms p95)
  - Structured JSON logging (easy to parse for alerts and analysis)
  - BullMQ uses Pino internally (consistency across stack)
  - Low memory overhead on single VPS

**What is Pino & How It Works:**

Pino is a **structured logger** that writes events as JSON instead of plain text.

**Traditional Console Logging:**
```javascript
console.log('User logged in: ' + userId + ' from ' + ipAddress);
// Output: "User logged in: 12345 from 192.168.1.1"
// ❌ Hard to search, no context, unstructured
```

**Pino Structured Logging:**
```javascript
logger.info({
  event: 'user_login',
  userId: 12345,
  ipAddress: '192.168.1.1',
  userRole: 'enumerator',
  lga: 'Ibadan North'
});
// Output (JSON):
{
  "level": 30,
  "time": 1735920000000,
  "event": "user_login",
  "userId": 12345,
  "ipAddress": "192.168.1.1",
  "userRole": "enumerator",
  "lga": "Ibadan North"
}
// ✅ Searchable, structured, machine-readable
```

**Why Structured Logging for OSLSR:**

1. **Fraud Detection Forensics:** Search logs for suspicious patterns
   ```javascript
   logger.warn({
     event: 'fraud_detected',
     heuristic: 'gps_cluster',
     enumeratorId: 'EN001',
     submissionCount: 15,
     radiusMeters: 50,
     fraudScore: 0.82
   });
   ```

2. **NDPA Audit Trail:** Every PII access logged immutably
   ```javascript
   logger.info({
     event: 'pii_access',
     userId: 'VO001',
     action: 'view_respondent_details',
     respondentNin: '12345678901',
     reason: 'verification_review'
   });
   ```

3. **Performance Monitoring:** Track API response times
   ```javascript
   logger.info({
     event: 'api_request',
     method: 'POST',
     path: '/api/v1/submissions',
     duration: 234,  // milliseconds
     statusCode: 200
   });
   ```

**Log Levels:**
- `logger.trace()` - Very detailed debugging (rarely used)
- `logger.debug()` - Debugging information
- `logger.info()` - Normal operations (most common)
- `logger.warn()` - Warning signs (e.g., high queue lag)
- `logger.error()` - Errors needing attention
- `logger.fatal()` - Application crash

**Where Logs Go:**
- Development: Pretty-printed to console
- Production: JSON files in `/var/log/oslsr/app.log`
- Critical errors: Trigger email alerts to Super Admin

**Affects:** All services, Story 4.1 (Logging Infrastructure)

---

**Decision 5.2: Error Tracking**
- **Choice:** Log-based error tracking initially (upgrade to self-hosted Sentry post-pilot)
- **Rationale:**
  - Sentry SaaS violates NDPA data residency (sends errors to US servers)
  - Self-hosted Sentry adds 4+ containers to single VPS (too heavy for MVP)
  - Log-based approach: Pino errors + email alerts sufficient for pilot
  - Revisit self-hosted Sentry after pilot if error volume >100/day

**What is Error Tracking:**

Error tracking catches application crashes and bugs, then:
1. **Notifies you** immediately (email/SMS)
2. **Provides context** (stack trace, user info, request data)
3. **Groups similar errors** (100 NIN_DUPLICATE errors = 1 issue, not 100)

**Log-Based Error Tracking Implementation:**

Instead of separate service, parse logs intelligently:

```javascript
// Catch and log all errors with rich context
export const errorHandler = (err, req, res, next) => {
  logger.error({
    event: 'api_error',
    errorType: err.name,
    errorMessage: err.message,
    errorStack: err.stack,
    requestMethod: req.method,
    requestPath: req.path,
    userId: req.user?.id,
    userRole: req.user?.role,
    requestBody: sanitize(req.body)  // No passwords
  });

  // Alert on critical errors
  if (err.statusCode === 500 || err.name === 'DatabaseConnectionError') {
    sendEmail({
      to: process.env.SUPER_ADMIN_EMAIL,
      subject: `[OSLSR CRITICAL] ${err.name}`,
      body: `Error: ${err.message}\nPath: ${req.path}\nUser: ${req.user?.id}`
    });
  }

  res.status(err.statusCode || 500).json({
    code: err.code || 'INTERNAL_ERROR',
    message: err.userMessage || 'An error occurred'
  });
};
```

**Simple Log Analysis Script:**
```javascript
// scripts/analyzeErrors.js - Run daily
const logs = readFileSync('/var/log/oslsr/app.log', 'utf-8')
  .split('\n')
  .filter(Boolean)
  .map(line => JSON.parse(line))
  .filter(log => log.event === 'api_error');

// Group by error type
const errorCounts = logs.reduce((acc, log) => {
  acc[log.errorType] = (acc[log.errorType] || 0) + 1;
  return acc;
}, {});

console.log('Errors in last 24 hours:', errorCounts);
// Output: { 'NIN_DUPLICATE': 3, 'ValidationError': 12, 'SubmissionTimeout': 1 }
```

**When to Upgrade to Self-Hosted Sentry:**
- Error volume >100/day
- Need better error grouping (automatically clusters similar errors)
- Need user impact tracking ("How many users affected by this bug?")

**Affects:** Error handling middleware, Story 4.2 (Error Tracking Setup)

---

**Decision 5.3: Monitoring & Metrics**
- **Choice:** Lightweight metrics (prom-client + simple dashboard)
- **Rationale:**
  - Full Prometheus + Grafana too heavy for single VPS during pilot
  - Lightweight prom-client exports Prometheus-compatible metrics
  - Simple HTML dashboard with Chart.js sufficient for Super Admin
  - Can upgrade to full Grafana post-pilot if needed

**What are Metrics:**

Metrics are **numbers that change over time** showing system health.

Think of car dashboard:
- **Speed** = API response time (250ms target per NFR1.1)
- **Fuel gauge** = Database connection pool usage
- **Engine temp** = CPU usage

**Key Metrics for OSLSR:**

1. **API Response Time (NFR1.1 target: 250ms p95)**
   ```javascript
   const httpRequestDuration = new promClient.Histogram({
     name: 'http_request_duration_ms',
     help: 'Duration of HTTP requests in ms',
     labelNames: ['method', 'route', 'status_code'],
     buckets: [50, 100, 250, 500, 1000, 2500, 5000]
   });

   // Record in middleware
   res.on('finish', () => {
     httpRequestDuration
       .labels(req.method, req.route.path, res.statusCode)
       .observe(Date.now() - start);
   });
   ```

2. **Fraud Detection Hit Rate (ADR-003)**
   ```javascript
   const fraudDetectionCounter = new promClient.Counter({
     name: 'fraud_detections_total',
     help: 'Total fraud detections by heuristic',
     labelNames: ['heuristic', 'severity']
   });

   // Record when fraud detected
   if (fraudResult.flagged) {
     fraudDetectionCounter
       .labels(fraudResult.heuristic, fraudResult.severity)
       .inc();
   }
   ```

3. **Webhook Ingestion Lag (ADR-009)**
   ```javascript
   const webhookLagGauge = new promClient.Gauge({
     name: 'webhook_ingestion_lag_seconds',
     help: 'Time between form submission and ingestion processing'
   });

   const lagSeconds = (Date.now() - submission.submissionDate) / 1000;
   webhookLagGauge.set(lagSeconds);

   if (lagSeconds > 60) {
     logger.warn({ event: 'webhook_lag_high', lagSeconds });
   }
   ```

**Simple Dashboard (HTML + Chart.js):**

Expose metrics at `/api/metrics` endpoint:
```javascript
router.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

Super Admin dashboard polls every 30 seconds, updates charts:
```html
<h2>API Response Time (p95) - Target: 250ms</h2>
<canvas id="responseTimeChart"></canvas>
<p id="p95Value" class="text-lg">Current: 187ms ✅</p>

<h2>Fraud Detections (Last 24 Hours)</h2>
<canvas id="fraudChart"></canvas>
<!-- Shows bar chart: GPS Cluster: 23, Speed Run: 5, Straight-lining: 2 -->
```

**What Metrics Tell You:**

| Metric | What It Means | Action When High |
|--------|---------------|------------------|
| `http_request_duration_ms{p95}` | 95% of API calls complete in X ms | If >250ms: Add database indexes, optimize queries |
| `fraud_detections_total{heuristic="gps_cluster"}` | GPS clustering frauds detected | If spike: Check thresholds or real fraud wave |
| `submission_ingestion_lag_seconds` | Delay between form submission and ingestion | If >60s: Scale BullMQ workers, check queue backlog |
| `db_connection_pool_active` | Database connections in use | If near max: Connection leak or need scaling |

**Real Example:**

During pilot, you notice p95 response time is 450ms (target: 250ms).

Check metrics breakdown:
```
fraud_detection_duration_ms{heuristic="gps_cluster", p95} = 380ms  ❌ TOO SLOW
fraud_detection_duration_ms{heuristic="speed_run", p95} = 20ms    ✅ GOOD
```

Solution: Add spatial index to PostgreSQL
```sql
CREATE INDEX idx_gps ON submissions USING GIST (gps_location);
```

Metrics now show: `fraud_detection_duration_ms{p95} = 45ms` ✅

**Affects:** System monitoring, Story 4.3 (Metrics Infrastructure)

---

**Decision 5.4: Audit-Log Principal Dualism (SCP-2026-04-22)**

After the Epic 10 partner-API lands, audit-log events originate from one of three distinct principal classes, and the observability surface must reflect this cleanly — confusion here directly translates to compliance ambiguity.

- **Principal classes:**
  - **Human actor** — `user_id IS NOT NULL` (staff or public user), `consumer_id IS NULL`
  - **Machine consumer** — `consumer_id IS NOT NULL` (partner API), `user_id IS NULL`
  - **System event** — both NULL (scheduled jobs, startup events, bulk migrations)
- **DB-layer enforcement (Decision 1.5):** CHECK constraint on `audit_logs` guarantees exactly one of these three shapes per row — impossible for a single event to claim both a human and a consumer principal.
- **Service-layer enforcement (Pattern Category 5 update, below):** every `auditLog.create()` call takes a discriminated union `{ kind: 'user'; user_id } | { kind: 'consumer'; consumer_id } | { kind: 'system' }`; TypeScript narrowing rejects mixed-principal writes at compile time. This is defence in depth against a future service that forgets the CHECK constraint exists.
- **Read-side rendering (Story 9-11 Admin Audit Log Viewer):** the list UI shows a **Principal** column with an icon + name resolving to `users.full_name` OR `api_consumers.name` OR the literal `"System"`; filters support either principal class. The composite indexes required to keep the viewer at <500ms p95 are declared in Decision 1.5 and merged in Story 9-11.
- **Per-consumer activity dashboard (Story 10-6):** a scoped view over `audit_logs` filtered by `consumer_id`, rendering request-volume time-series, scope-usage breakdown, rate-limit-rejection rate, and last-used timestamp per key. Built on the same primitives as 9-11 — 10-6 is a consumer-specific preset of the 9-11 viewer, not a parallel stack.

**Decision 5.5: Per-Consumer Rate-Limit Metrics (Redis + Pino)**

- **Redis counters (authoritative for enforcement, Story 10-2):** key format `ratelimit:consumer:{consumer_id}:{scope}:{YYYY-MM-DDTHH:MM}`, atomic `INCR` + `EXPIRE 70`, reject on threshold exceeded. Daily / monthly quotas as separate keys with longer TTLs.
- **Pino events (for observability, all stories):** every partner request emits a single `api_partner_request` structured event with `{ consumer_id, consumer_name, api_key_id, scope, status_code, latency_ms, allowed_lga_filter?, rate_limit_outcome }`. Critically, these are **never** mixed with human-user request logs — Pino's `child()` logger in `apiKeyAuth` produces events tagged `principal_kind: 'consumer'` to simplify downstream parsing.
- **Health-digest fold-in (Story 6-2 email digest):** partner-API p95 latency, rate-limit-rejection-rate, and DSA-precondition-violation attempts appear in the daily digest once Epic 10 ships. The existing `MIN_SAMPLES_FOR_P95 = 50` guard (see Change Log 2026-04-12 entry in Story 9-9) applies to the partner-API p95 as well; no false Critical alerts on a cold consumer.

**Decision 5.6: Magic-Link + Pending-NIN Observability Events**

New Pino event classes with structured schemas:

| Event | Fields | Emitted by |
|---|---|---|
| `magic_link.issued` | `{ purpose, public_user_id?, email_sha256, ttl_minutes }` — email is hashed in the log to reduce PII leakage surface | `MagicLinkService` |
| `magic_link.redeemed` | `{ purpose, public_user_id, age_seconds, session_id }` | Controller |
| `magic_link.rejected` | `{ reason: 'expired'\|'used'\|'not_found', purpose, email_sha256? }` | Controller |
| `respondent.pending_nin_capture_created` | `{ respondent_id, source, lga_id, channel }` | `SubmissionProcessingService` |
| `respondent.pending_nin_capture_completed` | `{ respondent_id, age_days, channel }` | Story 9-12 completion endpoint |
| `respondent.status_stale_transition` | `{ respondent_id, from: 'pending_nin_capture', to: 'nin_unavailable', age_days }` | Scheduled job (Story 9-12) |

Health-digest additions: pending-NIN backlog size per LGA, median age of pending-NIN records, 30-day-stale transition count. Supervisor dashboards (Story 4-x) consume the same events for per-LGA pending-NIN follow-up lists.

---

### ADR-011: Scale Target, Minimal Media & Infrastructure

**Decision:** Target 1M records over 12 months, minimal media attachments, Hetzner Cloud infrastructure

**Corrected Staffing:**
- **Month 1:** 99 Enumerators + 33 Supervisors (132 total staff, 1 Supervisor + 3 Enumerators per LGA)
- **Collection Rate:** 2,475 submissions/day (74,250 records Month 1 = 7.4% of target)
- **Months 2-12:** Public portal + data entry clerks (925,750 records = 92.6% of target)

**Load Characteristics:**
- **Field Enumeration Peak (Month 1):** 2,475/day = 0.03 subs/sec average
- **Mass Media Campaign Spikes (4-6 weeks across year):** 20,000/day = 0.55 subs/sec peak
- **Normal Days:** 500-2,000/day = 0.006-0.02 subs/sec
- **Performance Requirement:** Maintain NFR1.1 (250ms p95) at all load levels

**Storage Requirements (Minimal Media):**
- **No NIN card images** collected (privacy concerns per PRD)
- **Staff photos only:** 132 × 500KB = 66MB
- **Website images:** ~50 × 200KB = 10MB
- **Total media:** 76MB (vs original 200GB estimate = 99.96% reduction!)
- **Year 1 Database:** 36GB (respondent profiles, submissions, audit logs)
- **Year 1 Total Storage:** 62GB (vs original 460GB estimate = 87% reduction)

**Infrastructure Decision: Hetzner Cloud (Germany Datacenter)**

**Month 1 (Field Enumeration):**
- **Server:** Hetzner CX31 (4 vCPU, 8GB RAM, 80GB NVMe SSD)
- **Cost:** €4.49/month ≈ $5
- **Headroom:** 100x (handles 0.03 subs/sec, capacity 3+ subs/sec)

**Months 2-12 (Public Portal + Mass Media Campaigns):**
- **Server:** Hetzner CX43 (8 vCPU, 16GB RAM, 160GB NVMe SSD)
- **Cost:** €10/month ≈ $11
- **Headroom:** 73x (handles 0.55 subs/sec peak, capacity 40 subs/sec)

**Backup Storage:**
- Hetzner Object Storage: 250GB (overkill given 62GB actual usage)
- Cost: €3/month ≈ $3.50

**Year 1 Total Cost:**
- VPS: $5 (Month 1) + $11 × 11 (Months 2-12) = $126
- Object Storage: $3.50 × 12 = $42
- **TOTAL: $168/year**

**Alternatives Considered & Rejected:**

| Provider | Configuration | Year 1 Cost | Why Rejected |
|----------|--------------|-------------|--------------|
| **DigitalOcean** | Premium AMD 16GB | $1,152 | 7x more expensive ($1,152 vs $168) |
| **AWS EC2** | t3.xlarge | $1,200+ | 8x more expensive, complex pricing |
| **Azure** | B4ms | $1,400+ | 9x more expensive, overkill for single VPS |

**Hetzner vs DigitalOcean Comparison:**

| Feature | Hetzner CX43 ($11/mo) | DigitalOcean Premium AMD ($96/mo) | Winner |
|---------|----------------------|-----------------------------------|--------|
| vCPU | 8 dedicated | 8 dedicated | Tie ⚖️ |
| RAM | 16GB | 16GB | Tie ⚖️ |
| Storage | 160GB NVMe | 200GB NVMe | DO (slight) |
| Traffic | 20TB | 6TB | **Hetzner 🏆** |
| Network | 20 Gbps | 2 Gbps | **Hetzner 🏆** |
| **Monthly Cost** | **$11** | **$96** | **Hetzner 🏆 (87% cheaper)** |
| Global Regions | 5 (EU, US, Asia) | 14+ worldwide | DO 🏆 |
| Managed Services | Basic | DB, K8s, Monitoring | DO 🏆 |
| Nigeria Latency | ~180ms (Germany) | ~150ms (London) | DO (slight) |

**Performance Validation:**

System handles 0.55 subs/sec peak (mass media campaign) with **73x headroom**:

| Component | Capacity (CX43) | Peak Load | Headroom |
|-----------|----------------|-----------|----------|
| Express API | 10,000 req/sec | 0.55 req/sec | 18,182x |
| PostgreSQL | 5,000 writes/sec | 0.55 writes/sec | 9,091x |
| Redis/BullMQ | 100,000 ops/sec | 0.55 ops/sec | 181,818x |
| **Fraud Detection** (4 workers) | **40 checks/sec** | **0.55 checks/sec** | **73x** ✅ |

Fraud detection is the bottleneck, but still 73x over-provisioned. NFR1.1 (250ms p95) easily met.

**Rationale for Hetzner:**
1. **86% cost savings** vs DigitalOcean ($168 vs $1,212 Year 1)
2. **Dedicated vCPU** (not shared, predictable performance)
3. **20TB traffic included** (will never hit limits at 0.55 subs/sec)
4. **NDPA compliant** (EU datacenter, data residency in Germany acceptable)
5. **Simple pricing** (no surprise charges, hourly billing available)
6. **More than sufficient performance** (73x headroom during peak campaigns)

**3-Year Total Cost of Ownership:**

| Year | Hetzner | DigitalOcean | Savings |
|------|---------|--------------|---------|
| Year 1 (Campaign) | $168 | $1,212 | $1,044 (86%) |
| Year 2 (Maintenance) | $60 | $672 | $612 (91%) |
| Year 3 (Maintenance) | $60 | $672 | $612 (91%) |
| **3-Year Total** | **$288** | **$2,556** | **$2,268 (89%)** |

Savings of $2,268 over 3 years = enough to hire a junior developer for 2 months in Nigeria!

**Trade-offs:**
- ✅ 86% cost savings enables government budget approval
- ✅ Dedicated compute (no noisy neighbors affecting fraud detection performance)
- ✅ 160GB included storage (no separate volumes needed, reduces complexity)
- ✅ 73x performance headroom (system never stressed, even during TV campaigns)
- ❌ Fewer global regions (5 vs 14) - acceptable for Nigeria-focused deployment
- ❌ No managed database services (must self-manage PostgreSQL) - acceptable given MERN experience
- ❌ Community support only (no 24/7 phone support) - acceptable for government project with internal IT

**High Availability Enhancement: Floating IP**

To mitigate Single Point of Failure (SPOF) risk identified in project critique, implement **Hetzner Floating IP**:

- **Feature:** Static IP address that can be instantly remapped to backup VPS instance
- **Cost:** €1.19/month (~$1.30/month, $15.60/year)
- **Benefit:** Reduces Recovery Time Objective (RTO) from 1 hour to <5 minutes by eliminating DNS propagation delay
- **Implementation:**
  - Primary VPS (CX43) assigned Floating IP as public address
  - Backup VPS snapshot restored to new instance in case of hardware failure
  - Floating IP remapped to new instance via Hetzner Cloud Console API (30 seconds)
  - Application restart + health check (2-3 minutes)
  - Total downtime: 3-5 minutes vs 60 minutes without Floating IP
- **Updated Year 1 Cost:** $168 + $15.60 = $183.60/year (still 86% cheaper than DigitalOcean)

**Disaster Recovery Procedure:**
1. Detect VPS failure (monitoring alerts after 2 missed health checks)
2. Create new CX43 instance from most recent snapshot (6-hour backup window)
3. Remap Floating IP to new instance via `hcloud floating-ip assign <floating-ip-id> <new-server-id>`
4. Verify health endpoint responds (apps/api/health returning 200 OK)
5. Notify Super Admin of recovery completion
6. Accept data loss window: Maximum 6 hours of server data (offline drafts safe on enumerator devices in IndexedDB)

**Affects:** Infrastructure planning, budget approval, Story 1.4 (Production Deployment), disaster recovery procedures

### ADR-012: Marketplace Search Strategy (PostgreSQL Full-Text Search)

**Decision:** Implement marketplace search using PostgreSQL Full-Text Search with pre-computed tsvector column, NOT real-time trigram calculations

**Context:**
- Marketplace profiles require searchable fields: Profession, Skills, LGA, Experience Level
- Target performance: Sub-250ms search response time (NFR1.1 requirement)
- Expected dataset: 1M profiles at Year 1, 30% marketplace consent rate = 300K searchable profiles
- Concurrent searches: Up to 30 queries/minute (NFR4.4 rate limit)

**Implementation Approach:**

**Database Schema Addition:**
```sql
-- Add to marketplace_profiles table
ALTER TABLE marketplace_profiles
ADD COLUMN search_vector tsvector;

-- Create GIN index for fast full-text search
CREATE INDEX idx_marketplace_search_vector
ON marketplace_profiles
USING GIN(search_vector);

-- Trigger to auto-update search_vector on INSERT/UPDATE
CREATE OR REPLACE FUNCTION update_marketplace_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.profession, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.skills, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.lga_name, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.experience_level, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER marketplace_search_vector_update
BEFORE INSERT OR UPDATE ON marketplace_profiles
FOR EACH ROW
EXECUTE FUNCTION update_marketplace_search_vector();
```

**Search Query Pattern:**
```typescript
// apps/api/src/features/marketplace/marketplace.service.ts
async searchProfiles(query: string, filters: SearchFilters): Promise<Profile[]> {
  const searchQuery = db
    .select()
    .from(marketplaceProfiles)
    .where(
      sql`search_vector @@ plainto_tsquery('english', ${query})`
    )
    .orderBy(
      sql`ts_rank(search_vector, plainto_tsquery('english', ${query})) DESC`
    )
    .limit(50);

  return await searchQuery;
}
```

**Ranking Weights:**
- **A (Weight 1.0):** Profession (highest relevance - exact match most important)
- **B (Weight 0.4):** Skills (secondary relevance - keyword matching)
- **C (Weight 0.2):** LGA (location filter, lower text relevance)
- **D (Weight 0.1):** Experience Level (enum filter, minimal text relevance)

**Performance Characteristics:**
- **Index Size:** ~30MB for 300K profiles (tsvector + GIN index)
- **Search Latency:** 20-80ms for typical queries (well under 250ms target)
- **Index Update:** Trigger-based, adds <5ms to INSERT/UPDATE operations
- **Maintenance:** VACUUM ANALYZE weekly to optimize GIN index

**Alternatives Considered:**

| Approach | Pros | Cons | Decision |
|----------|------|------|----------|
| **PostgreSQL tsvector (CHOSEN)** | ✅ Sub-250ms performance<br>✅ No external dependencies<br>✅ Trigger-based auto-update<br>✅ Battle-tested pattern | ❌ No typo-tolerance<br>❌ Limited relevance tuning | ✅ **ADOPT** |
| **Real-time Trigram** | ✅ Simple implementation | ❌ Slow at scale (500ms+)<br>❌ CPU-intensive | ❌ REJECT |
| **Meilisearch** | ✅ Excellent typo-tolerance<br>✅ Advanced relevance | ❌ Additional 512MB RAM<br>❌ Extra service to manage<br>❌ Sync complexity | ❌ REJECT (overkill) |
| **Elasticsearch** | ✅ Industry standard | ❌ 2GB RAM minimum<br>❌ Complex deployment<br>❌ Massive overkill | ❌ REJECT |

**Rationale:**
1. **Performance:** tsvector with GIN index provides 20-80ms search latency (12x better than 250ms target)
2. **Simplicity:** No external search service required, reduces operational complexity
3. **Cost Efficiency:** Zero additional infrastructure cost (uses existing PostgreSQL)
4. **Maintenance:** Trigger-based updates require zero application logic changes
5. **Scale Appropriate:** 300K profiles well within PostgreSQL FTS capacity (proven to 10M+ records)

**Trade-offs:**
- ✅ Sub-250ms performance guaranteed at target scale
- ✅ Zero infrastructure overhead (no Meilisearch/Elasticsearch)
- ✅ Auto-updating via triggers (no sync drift risk)
- ❌ No typo-tolerance ("elctrician" won't match "electrician") - acceptable for government registry
- ❌ Limited relevance tuning vs Meilisearch - acceptable given simple search needs

**Future Enhancement (Phase 2):**
If typo-tolerance becomes critical user feedback, consider hybrid approach:
1. Primary search: PostgreSQL tsvector (fast, exact matches)
2. Fallback: pg_trgm trigram similarity for "Did you mean?" suggestions
3. Cost: No additional infrastructure, 50-100ms additional latency only on zero-results queries

**Affects:** Epic 7 (Marketplace), Story 7.1 (Marketplace Profile Creation), Story 7.4 (Public Search Interface), database migrations

---

### ADR-013: Reverse Proxy & Traffic Monitoring Infrastructure

**Decision:** Use NGINX as the single entry point reverse proxy for all traffic routing, SSL termination, and edge-level rate limiting. Implement self-hosted privacy-respecting analytics (Plausible or Umami) for traffic monitoring.

**Context:**
- **Challenge 1:** Application on single VPS (Custom App on port 3000) requires a production-grade entry point with SSL termination
- **Challenge 2:** SSL/TLS certificates need centralized management (Let's Encrypt)
- **Challenge 3:** Rate limiting must occur at edge before hitting application servers
- **Challenge 4:** Static assets (React build) need efficient serving
- **Challenge 5:** Traffic analytics required for marketplace adoption insights
- **Challenge 6:** NDPA compliance prohibits sending Nigerian citizen data to US servers (Google Analytics concern)

**Architecture Diagram:**

```
Internet Traffic (HTTPS Port 443)
  ↓
[NGINX Reverse Proxy] (Single Entry Point)
  │
  ├─ SSL/TLS Termination (Let's Encrypt auto-renewal)
  ├─ Rate Limiting (Redis-backed, per NFR4.4)
  ├─ Security Headers (CSP, HSTS, X-Frame-Options)
  ├─ Static Asset Caching (React build, images)
  ├─ WebSocket Proxying (for real-time features)
  │
  ├─────────────────────────────────────────────────────┐
  │                                                       │
  ↓ (Domain/Path Routing)                               ↓
  │                                                       │
  ├─ oslsr.gov.ng/*
  ├─ oslsr.gov.ng/api/*
  ├─ oslsr.gov.ng/marketplace/*
  │
  ↓
[Custom App Container]
  - React SPA (served as static via Nginx)
  - Express API :3000
  - BullMQ Workers
  - Native Form Renderer
  - PostgreSQL (app_db)
  - Redis :6379

  ↓ (Analytics Tracking - Privacy-Respecting)

[Plausible/Umami Container] :8000
  - Self-hosted analytics
  - No cookies, GDPR/NDPA compliant
  - Tracks: page views, referrers, devices
  - Data stays in Nigeria
```

#### NGINX Configuration Architecture

**Primary Configuration File: `/etc/nginx/sites-available/oslsr.conf`**

```nginx
# Upstream definitions
upstream custom_app {
    server custom-app:3000;
    keepalive 32;
}

# Rate limiting zones (Redis-backed via lua-resty-redis)
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/m;
limit_req_zone $binary_remote_addr zone=marketplace_limit:10m rate=30r/m;
limit_req_zone $binary_remote_addr zone=login_limit:10m rate=5r/m;

# Main server block - Custom App + Marketplace
server {
    listen 443 ssl http2;
    server_name oslsr.gov.ng;

    # SSL Configuration (Let's Encrypt via Certbot)
    ssl_certificate /etc/letsencrypt/live/oslsr.gov.ng/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/oslsr.gov.ng/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security Headers (Defense-in-Depth per ADR-006)
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' plausible.oslsr.gov.ng; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' plausible.oslsr.gov.ng; frame-ancestors 'self';" always;

    # React SPA (Static Assets) - Serve directly from NGINX
    location / {
        root /var/www/oslsr/dist;
        try_files $uri $uri/ /index.html;

        # Caching strategy
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }

        # HTML files - no caching (SPA routing)
        location ~* \.html$ {
            expires -1;
            add_header Cache-Control "no-cache, no-store, must-revalidate";
        }
    }

    # API Routes - Proxy to Custom App
    location /api/ {
        limit_req zone=api_limit burst=20 nodelay;

        proxy_pass http://custom_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts (support long-running fraud detection queries)
        proxy_connect_timeout 10s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Authentication endpoints - Stricter rate limiting
    location /api/v1/auth/login {
        limit_req zone=login_limit burst=3 nodelay;
        proxy_pass http://custom_app;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Marketplace - Public facing with aggressive rate limiting
    location /marketplace/ {
        limit_req zone=marketplace_limit burst=10 nodelay;
        proxy_pass http://custom_app;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket support (for potential real-time features)
    location /ws/ {
        proxy_pass http://custom_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;  # 24 hours for long-lived connections
    }
}

# HTTP to HTTPS redirect
server {
    listen 80;
    server_name oslsr.gov.ng;
    return 301 https://$server_name$request_uri;
}
```

#### Docker Compose Integration

**Updated `docker-compose.yml` with NGINX:**

```yaml
version: '3.8'

services:
  # NGINX Reverse Proxy (Single Entry Point)
  nginx:
    image: nginx:1.25-alpine
    container_name: oslsr-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/sites-available:/etc/nginx/sites-available:ro
      - ./nginx/ssl:/etc/letsencrypt:ro  # Let's Encrypt certificates
      - ./apps/web/dist:/var/www/oslsr/dist:ro  # React build
    depends_on:
      - custom-app
    networks:
      - oslsr-network
    restart: unless-stopped

  # Custom App (API + Workers)
  custom-app:
    build: ./apps/api
    container_name: oslsr-custom-app
    expose:
      - "3000"  # Not published to host, only accessible via nginx
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis
    networks:
      - oslsr-network
    restart: unless-stopped

  # PostgreSQL (Application Database)
  postgres:
    image: postgis/postgis:15-3.4-alpine
    container_name: oslsr-postgres
    expose:
      - "5432"
    environment:
      - POSTGRES_DB=app_db
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - oslsr-network
    restart: unless-stopped

  # Redis (BullMQ + Rate Limiting)
  redis:
    image: redis:7-alpine
    container_name: oslsr-redis
    expose:
      - "6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes
    networks:
      - oslsr-network
    restart: unless-stopped

  # Plausible Analytics (Self-Hosted, Privacy-Respecting)
  plausible:
    image: plausible/analytics:latest
    container_name: oslsr-plausible
    expose:
      - "8000"
    environment:
      - BASE_URL=https://plausible.oslsr.gov.ng
      - SECRET_KEY_BASE=${PLAUSIBLE_SECRET}
      - DATABASE_URL=postgres://postgres:${PLAUSIBLE_DB_PASSWORD}@plausible-db:5432/plausible_db
      - CLICKHOUSE_DATABASE_URL=http://plausible-clickhouse:8123/plausible_events_db
    depends_on:
      - plausible-db
      - plausible-clickhouse
    networks:
      - oslsr-network
    restart: unless-stopped

  plausible-db:
    image: postgres:15-alpine
    container_name: oslsr-plausible-db
    expose:
      - "5432"
    environment:
      - POSTGRES_DB=plausible_db
      - POSTGRES_PASSWORD=${PLAUSIBLE_DB_PASSWORD}
    volumes:
      - plausible-db-data:/var/lib/postgresql/data
    networks:
      - oslsr-network
    restart: unless-stopped

  plausible-clickhouse:
    image: clickhouse/clickhouse-server:23-alpine
    container_name: oslsr-plausible-clickhouse
    expose:
      - "8123"
    volumes:
      - plausible-clickhouse-data:/var/lib/clickhouse
    networks:
      - oslsr-network
    restart: unless-stopped

volumes:
  postgres-data:
  redis-data:
  plausible-db-data:
  plausible-clickhouse-data:

networks:
  oslsr-network:
    driver: bridge
```

#### Analytics Strategy: Privacy-Respecting Self-Hosted Solution

**Decision: Plausible Analytics (Self-Hosted) over Google Analytics**

**Why NOT Google Analytics:**
- ❌ **NDPA Violation Risk:** Google Analytics sends data to US servers (violates Nigerian data residency requirements)
- ❌ **GDPR/Cookie Concerns:** Requires cookie consent banners (user friction)
- ❌ **Data Ownership:** Google owns the analytics data
- ❌ **Privacy Concerns:** Tracks Nigerian citizens across websites
- ❌ **Government Scrutiny:** Using US surveillance-linked tools raises questions

**Self-Hosted Alternatives Comparison:**

| Feature | Plausible | Umami | Matomo | Google Analytics |
|---------|-----------|-------|--------|------------------|
| **Self-Hosted** | ✅ Yes | ✅ Yes | ✅ Yes | ❌ Cloud only |
| **NDPA Compliant** | ✅ Data stays in Nigeria | ✅ Data stays in Nigeria | ✅ Data stays in Nigeria | ❌ Data goes to US |
| **Cookie-Free** | ✅ Yes | ✅ Yes | ❌ No (requires consent) | ❌ No |
| **Lightweight** | ✅ ~1KB script | ✅ ~2KB script | ❌ ~20KB script | ❌ ~50KB script |
| **Resource Usage** | Low (PostgreSQL + ClickHouse) | Very Low (PostgreSQL only) | High (MySQL + Redis) | N/A |
| **Dashboard UX** | ✅ Excellent | ✅ Good | ⚠️ Complex | ✅ Excellent |
| **Cost** | Free (self-hosted) | Free (self-hosted) | Free (self-hosted) | Free (cloud) |
| **Decision** | ✅ **RECOMMENDED** | ✅ Alternative | ❌ Too heavy | ❌ REJECTED |

**Recommended: Plausible Analytics (Self-Hosted)**

**What Plausible Tracks (Privacy-Respecting):**
- ✅ Page views (`/marketplace`, `/marketplace/profile/123`)
- ✅ Referrers (where traffic came from - organic search, direct, social)
- ✅ Device types (desktop, mobile, tablet)
- ✅ Browser types (Chrome, Safari, Firefox)
- ✅ Operating systems (Android, iOS, Windows)
- ✅ Geographic data (Country, State - aggregated, no IP storage)
- ✅ Goals/Events (e.g., "Profile Contact Viewed", "Registration Completed")

**What Plausible Does NOT Track:**
- ❌ No cookies or persistent identifiers
- ❌ No cross-site tracking
- ❌ No personal data (names, emails, NINs)
- ❌ No IP address storage (hashed for daily uniqueness only)
- ❌ No device fingerprinting

**Integration in React App:**

```typescript
// apps/web/src/lib/analytics.ts
export function initAnalytics() {
  // Only load in production
  if (import.meta.env.MODE !== 'production') return;

  const script = document.createElement('script');
  script.defer = true;
  script.dataset.domain = 'oslsr.gov.ng';
  script.src = 'https://plausible.oslsr.gov.ng/js/script.js';
  document.head.appendChild(script);
}

// Track custom events
export function trackEvent(eventName: string, props?: Record<string, string>) {
  if (window.plausible) {
    window.plausible(eventName, { props });
  }
}

// Usage examples
trackEvent('Profile Contact Viewed', {
  profession: 'Plumber',
  lga: 'Ibadan North'
});

trackEvent('Registration Completed', {
  userType: 'Public User'
});
```

**Key Metrics Dashboard (Plausible UI):**
- **Marketplace Adoption:** Daily unique visitors to `/marketplace/*`
- **Top Skills Searched:** Most popular professions searched
- **Geographic Distribution:** Which LGAs generate most marketplace traffic
- **Conversion Funnel:** `/marketplace` → `/marketplace/search` → `/marketplace/profile/:id` → Contact reveal
- **Device Breakdown:** Mobile vs desktop usage (informs UX priorities)
- **Referrer Sources:** Organic search vs direct vs social media campaigns

#### Benefits of NGINX + Self-Hosted Analytics Architecture

**NGINX Reverse Proxy Benefits:**
- ✅ **Single Entry Point:** Unified SSL/TLS termination for all services
- ✅ **Edge Rate Limiting:** Blocks bad traffic before it reaches applications
- ✅ **Static Asset Performance:** NGINX serves React build 10x faster than Node.js
- ✅ **Security Headers:** CSP, HSTS, X-Frame-Options applied uniformly
- ✅ **WebSocket Support:** Ready for real-time features (future enhancements)
- ✅ **Load Balancing Ready:** Can add multiple Custom App instances if needed
- ✅ **Centralized Logging:** All HTTP requests logged in one place

**Self-Hosted Analytics Benefits:**
- ✅ **NDPA Compliance:** All data remains on Nigerian VPS
- ✅ **No Cookie Banners:** Simplifies UI, no user consent popups needed
- ✅ **Data Ownership:** Government owns 100% of analytics data
- ✅ **Privacy-First:** No tracking of individual citizens across sites
- ✅ **Lightweight:** <1KB script doesn't slow down page loads
- ✅ **Transparent:** Open-source, auditable code

#### Resource Impact

**NGINX:**
- **CPU:** Minimal (~2-5% on Hetzner CX43)
- **RAM:** ~10MB
- **Disk:** <50MB

**Plausible Analytics:**
- **CPU:** ~5-10% during peak traffic
- **RAM:** ~200MB (PostgreSQL) + ~150MB (ClickHouse) = 350MB total
- **Disk:** ~500MB/year for 1M page views

**Total Infrastructure Impact:**
- Previous: Custom App + ODK Central = ~8GB RAM used; now ~6GB with ODK removed (SCP-2026-02-05-001)
- New: + NGINX (10MB) + Plausible (350MB) = ~6.4GB RAM used
- **Remaining Headroom:** Hetzner CX43 has 16GB RAM → 9.6GB free (60% headroom)

#### Alternatives Considered & Rejected

| Approach | Pros | Cons | Decision |
|----------|------|------|----------|
| **NGINX + Plausible (CHOSEN)** | ✅ NDPA compliant<br>✅ Privacy-respecting<br>✅ Self-hosted | ❌ Additional 350MB RAM<br>❌ Requires maintenance | ✅ **ADOPT** |
| **Google Analytics** | ✅ Free<br>✅ Feature-rich | ❌ NDPA violation<br>❌ Privacy concerns<br>❌ Cookie consent needed | ❌ REJECT |
| **No Reverse Proxy (Direct Ports)** | ✅ Simpler initially | ❌ No unified SSL<br>❌ No edge rate limiting<br>❌ Manual port management | ❌ REJECT |
| **Traefik Instead of NGINX** | ✅ Auto SSL (Let's Encrypt)<br>✅ Docker-native | ❌ More complex config<br>❌ Higher resource usage<br>❌ Team less familiar | ❌ REJECT (prefer NGINX simplicity) |
| **Umami Analytics** | ✅ Lighter than Plausible<br>✅ NDPA compliant | ❌ Less feature-rich dashboard<br>❌ Smaller community | ⚠️ Acceptable alternative |

**Trade-offs:**
- ✅ NDPA compliance guaranteed (data never leaves Nigeria)
- ✅ No cookie consent popups (better UX, lower bounce rate)
- ✅ Government owns analytics data (no vendor lock-in)
- ✅ Unified traffic management via NGINX
- ✅ Future-proof for horizontal scaling
- ❌ Additional 350MB RAM for Plausible (acceptable - 60% headroom remains)
- ❌ Need to maintain analytics server (mitigated by Docker Compose automation)

**Rationale:**
1. **NDPA Compliance:** Self-hosted analytics ensures Nigerian citizen data never leaves the country
2. **Privacy-First:** Cookie-free tracking respects user privacy while providing necessary insights
3. **Infrastructure Control:** NGINX provides unified entry point for all services on single VPS
4. **Performance:** Edge-level rate limiting and static asset caching improve response times
5. **Security:** Centralized SSL termination and security headers strengthen defense-in-depth
6. **Operational Simplicity:** Docker Compose manages all services (no manual port juggling)

**Affects:** All HTTP traffic routing, SSL certificate management, rate limiting implementation, traffic analytics dashboards, Story 1.1 (Infrastructure Setup), Story 4.4 (Analytics Integration)

#### Tailscale Operator Access (Appended per SCP-2026-04-22)

**Status:** Deployed 2026-04-23 as a Story 9-9 subtask. Recorded in the Story 9-9 Change Log entry of the same date; full decision rationale in **ADR-020** (below).

**Separation of concerns — public traffic vs operator traffic:**

| Concern | Layer | Trust boundary | Traffic class |
|---|---|---|---|
| Public HTTP(S) — web, API, marketplace | NGINX @ VPS (this ADR) + Cloudflare WAF (domain-gated, future) | Untrusted internet → TLS → nginx → app | Client → Server |
| Partner API HTTP(S) | NGINX @ VPS (same stack) with `apiKeyAuth` on `/api/v1/partner/*` | Authenticated partner consumers → TLS → nginx → app | Machine → Server |
| Operator SSH | **Tailscale overlay** (ADR-020) | Tailscale-authenticated device → CGNAT → sshd | Operator → Server |

These three traffic classes flow through **different layers** and are governed by **different access controls**. This ADR-013 decision (reverse proxy for public traffic) is unchanged by the Tailscale addition — nginx still terminates TLS for web/API/marketplace traffic regardless of whether the operator is connected via Tailscale, and Cloudflare (when the `oslrs.com` domain lands) fronts only the public traffic class.

**Why Tailscale does not touch the nginx layer:**

1. Nginx serves browsers, Android PWAs, and partner consumer backends — all of which come from arbitrary public IPs and cannot be inside our tailnet.
2. Tailscale protects the *control plane* (SSH, Portainer if re-exposed, direct database access via localhost tunnels). It does not protect the *data plane* (public HTTPS).
3. The DigitalOcean Cloud Firewall already restricts SSH (22/tcp) to the `100.64.0.0/10` CGNAT range; nginx (80/tcp, 443/tcp) remains open to the world because it needs to be.

**What operators gain:**

- SSH no longer reachable from the public internet (closes the attack surface that drove the 2026-04-20 incident).
- Laptop, phone (future), and any future secondary operator device can share the same trust boundary via Tailscale ACLs.
- DO Web Console and DO Recovery Console remain as documented break-glass paths (see `docs/emergency-recovery-runbook.md`).

**What operators must not do:**

- **Do NOT** add a Tailscale subnet-router exposing the VPS's private network to the tailnet if it would expose services that are currently only bound to `127.0.0.1` — that would promote localhost-only services (Redis, Postgres, Portainer) into the tailnet broadcast domain unintentionally. Bind-address stays `127.0.0.1` for those services; operators that need them use `ssh -L` tunnels.
- **Do NOT** treat Tailscale as a substitute for TLS on public traffic; the public surface still needs Let's Encrypt + CSP + HSTS + Cloudflare-when-available, per this ADR.

**Cross-references:** NFR9, ADR-020 (full decision), Story 9-9 (Change Log 2026-04-23 — as-deployed state), `docs/emergency-recovery-runbook.md` (quarterly drill).

---

### ADR-014: Monorepo Testing & Quality Assurance Strategy

**Decision:** Implement a strictly orchestrated, multi-layer testing pipeline using Vitest and Turbo, enforced via custom decorators.

**Context:**
- **NFR3 (Reliability):** 99.5% SLA requires "water-tight" regression prevention.
- **NFR4 (Security):** Critical checks (NIN Uniqueness, Fraud logic) must never be bypassed.
- **Scale:** Monorepo structure requires intelligent caching to prevent CI slowness.

**The "Ironclad" Pipeline Layers:**
1.  **Golden Path (Blocking):** Critical business flows (e.g., "User Signup + NIN Verification"). Failure = Immediate Stop.
2.  **Security (Blocking):** Adversarial tests (Rate limiting, Auth bypass, SQLi attempts).
3.  **Contract (Blocking):** API Schema validation (OpenAPI vs Implementation).
4.  **UI/Performance (Non-Blocking):** Visual regression and SLA timing checks.

**Technical Implementation:**
- **Tooling:** Vitest (Runner) + Turbo (Orchestrator).
- **Abstractions:** `packages/testing` workspace hosts shared logic.
- **Decorators:** Custom `@TestTag('GoldenPath')` and `@SLA(seconds)` decorators to enforce categorization in code.
- **Visualization:** Auto-generated Mermaid.js pipeline diagrams for CI visibility.

**Trade-offs:**
- ✅ Guarantees critical paths are always tested before deploy.
- ✅ Turbo caching prevents re-running unchanged tests.
- ❌ Initial setup complexity (custom reporters/decorators).

---

### ADR-015: Public User Registration & Authentication Strategy

**Status:** Rewritten 2026-04-24 per SCP-2026-04-22. The original ADR-015 (Google OAuth primary + Hybrid Magic-Link/OTP fallback) is superseded — its decision context (Epic 1 retrospective, 2026-01-22) predates the field-survey UX research that drove the SCP. The original decision is preserved verbatim in §"Superseded — Original ADR-015 (2026-01-22)" at the bottom of this section for traceability.

**Decision (2026-04-24):** Public registration is delivered as a **single 5-step wizard** with **email magic-link as the primary authentication channel** and **password as the optional fallback**. SMS OTP infrastructure is built but feature-flagged off (budget-gated). Google OAuth is removed from the MVP. Records may be saved with `status = pending_nin_capture` if the respondent does not have their NIN at submission time, with a `*346#` USSD retrieval hint surfaced at the input.

**Context:**

The original ADR-015 (Google OAuth primary, Hybrid Magic-Link/OTP fallback) was authored in January 2026 against an assumed urban-tech-savvy public user. Field-survey UX research conducted between February and April 2026 surfaced four blocking realities that invalidated the original assumption set:

1. **The 4-hop flow (register → verify email → login → fill form) had a measured drop-off >50%** at the second hop in cognitive walkthroughs with non-technical respondents. Each navigation between distinct screens compounded the abandonment risk.
2. **Google OAuth adoption among Nigerian non-technical users is low**, and the "Continue with Google" affordance was misread as a Google-government partnership claim — a NDPA / consent confound. Removing it eliminates both adoption tax and confusion vector.
3. **NIN-at-submission-time is field-impractical** for a non-trivial fraction of respondents (NIN cards forgotten / lost / not yet issued). The original "NIN required at registration" gate either dropped these respondents entirely or pushed enumerators into making up data — both unacceptable. The `pending_nin_capture` status model (FR28, Story 11-1) replaces the gate with a deferred-capture path.
4. **SMS deliverability and cost in Nigeria** make SMS OTP a worse primary channel than email for users with smartphones, while offering nothing to users without them. Building the infrastructure once and toggling it on later (when a Nigerian SMS provider contract lands) is cheaper than launching with SMS-OTP-as-primary and discovering deliverability issues post-pilot.

**Decision (2026-04-24) in detail:**

#### Wizard structure (5 steps, single page with progress indicator)

1. **Step 1 — Welcome & consent (NDPA-compliant)**
   - State purpose, data uses, retention, rights (per Story 1.5.3 `/about/privacy` text, restated in plain language)
   - Two-stage consent capture: marketplace inclusion (FR2 stage 1) + enriched contact-share (FR2 stage 2)
   - Trust badges at the bottom: ministry seal, NDPA data-protection statement, "your data stays in Nigeria"
   - **Cannot proceed without consent acknowledgement on stage 1; stage 2 is optional**
2. **Step 2 — Identity & contact basics**
   - Full name, phone (Nigerian format), LGA (autocomplete from 33 Oyo LGAs)
   - DOB picker (year-month-day or "I don't know" → declines wizard exit gently with manual-assist info)
3. **Step 3 — NIN (with deferred-capture branch)**
   - NIN input field with inline `NinHelpHint` component (shared across enumerator form, public wizard, clerk entry — per Story 9-12)
   - Hint copy: *"Don't know your NIN? Dial **\*346#** on any phone linked to your NIMC record."*
   - "I don't have my NIN right now" toggle → on activation, NIN field is greyed out and the wizard sets `respondent.status = 'pending_nin_capture'` on submit; trust copy reassures the respondent that completion is possible later via emailed reminder
   - When NIN is provided: client-side Modulus 11 validation; pre-submission duplicate check via `POST /api/v1/forms/check-nin` (per FR21); duplicates surface with the original-registration-date message and the wizard offers "this might be a mistake — start over" or "I am the same person — contact support"
4. **Step 4 — Survey content (skills, experience, employer/worker pathway)**
   - Renders the published native form schema for the public-survey form (per `respondentSourceTypes` value `'public'`)
   - Same one-question-per-screen renderer used by enumerators, but mounted inside the wizard chrome
5. **Step 5 — Optional auth setup**
   - "Save your registration so you can come back" — email field (pre-populated from step 2 if collected there)
   - Two affordances: **"Email me a magic link"** (primary CTA) + **"Set a password instead"** (secondary)
   - "Skip for now" exits the wizard with a one-time confirmation email containing a magic link (TTL 72h) for resume-and-complete

#### Magic-link as primary (Decision 2.5 in Authentication & Security)

- 32-byte token, base64url-encoded, hashed at rest (SHA-256), TTL 15 minutes for login flows / 72 hours for `pending_nin_complete` and `wizard_resume` purposes.
- Single-use enforcement via `used_at`.
- Rate limit: 3 requests per email per hour (shares the existing NFR4.4 password-reset budget pool).
- Email content: short, action-oriented; uses AWS SES via the existing `EmailService`.
- The previous "Hybrid Email Verification" (magic link + 6-digit OTP in the same email) is **discontinued**. The justification was edge-case email-filter failure; the SCP-driven trust-badge / single-CTA aesthetic prefers a single primary action over choice paralysis. Users who cannot redeem a magic link can use password fallback (set at step 5) or supervisor-mediated assistance.

#### SMS OTP as infrastructure-only (Decision 2.6 in Authentication & Security)

- The full code path exists (route, provider adapter interface, audit wiring, rate limit) — but the resolver returns a `NoopSmsProvider` while `settings.auth.sms_otp_enabled = false`.
- When the flag flips on (Super Admin action, audit-logged), a real provider is wired in and the path activates without a redeploy.
- **No partner-API scope (Epic 10) or wizard step depends on SMS OTP.** It is an additive channel for the future, not a current dependency.

#### Pending-NIN status model interaction (Story 11-1)

- The wizard sets `respondents.status` from the discriminated union `{ active | pending_nin_capture | nin_unavailable }` based on NIN presence at submit. `imported_unverified` is reserved for Epic 11 imports and is never set by the wizard.
- A `pending_nin_capture` row triggers the FR28 reminder cadence (email at T+2d / T+7d / T+14d; transition to `nin_unavailable` at T+30d entering supervisor-review queue). The reminder email contains a magic link with `purpose = 'pending_nin_complete'` that resumes the respondent at step 3.
- All `pending_nin_capture` and `nin_unavailable` rows are **excluded** from NIN-keyed pipelines per FR28: fraud-detection NIN dedupe, marketplace enrichment requiring NIN, and the `registry:verify_nin` partner scope (Decision 3.4) all skip them. The exclusion is enforced at the service layer with Drizzle query predicates that include `status = 'active'`; tests in Story 11-1 verify the predicate is present on every NIN-derived query.

#### Migration note — backwards compatibility

- **Existing `public_users` accounts continue to work unchanged.** They retain their password, can still log in via the existing `/auth/public/login` endpoint, and can opt into magic-link by requesting one from the login page. No forced re-registration, no data migration.
- **Existing public-user respondent rows stay `status = 'active'` with their captured NIN.** No back-fill of the `status` column for these rows beyond the migration default of `'active'`.
- **The Google OAuth route handler is retired.** Existing tests that exercise it are removed; the Google OAuth client credentials are revoked in the Google Cloud Console as part of the Story 9-12 implementation. If a future regression unintentionally invokes the route, it returns `404 Not Found` (the route is unmounted, not stubbed).
- **The Hybrid Magic-Link/OTP email template is removed.** The new magic-link-only template ships in the same email-service codebase and reuses the same SES sending infrastructure.

#### Trade-offs

- ✅ Single page = single mental model = lower drop-off
- ✅ Trust badges visible at every step (SUPA-inspired) build NDPA confidence
- ✅ Pending-NIN path keeps respondents in the funnel who would otherwise drop off
- ✅ SMS-OTP-deferred avoids a launch-time integration that we cannot afford and may not need
- ✅ Single-CTA auth setup avoids choice paralysis at the highest-drop-off step
- ❌ Existing `public_users` and Google OAuth users are a small parallel cohort during the transition period — supportable, not free
- ❌ Magic-link-only loses the "OTP-in-same-email" hedge for corporate-email filters; mitigated by password fallback and 72h TTL on resume tokens
- ❌ The wizard renderer is a net-new frontend surface (Story 9-12) — implementation cost is real but bounded

#### Affects

- Story 1.8 (Public User Self-Registration) — superseded for new users; existing accounts retained per migration note
- Story 3.6 (Public Homepage & Self-Registration) — wizard replaces multi-step flow
- Story 9-12 (Public Wizard + Pending-NIN + NinHelpHint + Magic-Link Email) — primary delivery story
- Story 11-1 (Multi-Source Registry Schema Foundation) — provides the `status` enum the wizard branches on

#### Cross-references

- **PRD V8.2:** FR5 (softened), FR21 (scoped), FR27 (wizard), FR28 (deferred NIN)
- **Architecture:** Decision 1.5 (schema), Decision 2.5 (magic-link), Decision 2.6 (SMS OTP infra-only)
- **ADR-018** (multi-source registry / pending-NIN) — companion decision

---

#### Superseded — Original ADR-015 (2026-01-22)

> The text below is preserved verbatim from the Epic 1 retrospective decision for audit traceability. **It is no longer in force.** Implementations must follow the rewritten ADR-015 above. Any future revival of Google OAuth requires a new SCP and a fresh ADR.

> **Decision:** Implement Google OAuth as primary registration method for public users, with email registration fallback using Hybrid Email Verification (Magic Link + OTP in same email).
>
> **Context:**
> - Public users need low-friction registration to maximize adoption
> - Email verification is required but should not create unnecessary barriers
> - Google OAuth provides pre-verified email addresses at no cost
> - Traditional Magic Link OR OTP approaches each have edge-case failures
>
> **Google OAuth (Primary Registration):** "Continue with Google" button prominently displayed on registration page; OAuth 2.0 with Google Identity Services; pre-verified email; NIN still required after Google auth.
>
> **Email Registration (Fallback):** Hybrid Email Verification pattern — single email containing both a magic link (primary CTA) and a 6-digit OTP (fallback for corporate-email-filter cases), both single-use, both 15-minute expiry, rate-limited to 3 emails per hour per address.
>
> **Affected (now retired):** Story 1.8 (Public User Self-Registration) original spec, Story 3.6 (Public Homepage & Self-Registration) original spec.

---

### ADR-016: Layout Architecture (PublicLayout vs DashboardLayout)

**Decision:** Implement two distinct layout systems: PublicLayout for static website pages and DashboardLayout for authenticated role-based interfaces.

**Context:**
- Static website (homepage, about, registration) needs public-facing design with marketing focus
- Authenticated dashboards need role-specific navigation, data-dense layouts
- Users should experience clear visual transition when entering "the app"
- Auth pages (login, register, forgot-password) need minimal navigation

**Layout Separation:**

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PUBLIC LAYOUT                                 │
│  (Homepage, About, Public Marketplace Landing, Auth Pages)           │
├─────────────────────────────────────────────────────────────────────┤
│  Header: Logo + "Staff Login" + "Public Register" + "Marketplace"    │
│  ─────────────────────────────────────────────────────────────────── │
│                                                                      │
│  [PAGE CONTENT - Marketing focused]                                  │
│                                                                      │
│  ─────────────────────────────────────────────────────────────────── │
│  Footer: About | Contact | Privacy Policy | NDPA Compliance          │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                       DASHBOARD LAYOUT                               │
│  (All authenticated views - Enumerator, Supervisor, Admin, etc.)    │
├─────────────────────────────────────────────────────────────────────┤
│  Header: Logo + Role Badge + Notifications + Profile Menu + Logout   │
│  ┌──────────┬───────────────────────────────────────────────────────│
│  │ Sidebar  │                                                        │
│  │ ──────── │  [DASHBOARD CONTENT - Data focused]                    │
│  │ Dashboard│                                                        │
│  │ Surveys  │                                                        │
│  │ Team     │                                                        │
│  │ Reports  │                                                        │
│  │ Settings │                                                        │
│  └──────────┴───────────────────────────────────────────────────────│
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        AUTH PAGES LAYOUT                             │
│  (Login, Register, Forgot Password, Email Verification)             │
├─────────────────────────────────────────────────────────────────────┤
│  [← Back to Homepage]  (Simple link, no full header)                │
│  ─────────────────────────────────────────────────────────────────── │
│                                                                      │
│              ┌─────────────────────────┐                             │
│              │     AUTH CARD           │                             │
│              │     (Login Form)        │                             │
│              └─────────────────────────┘                             │
│                                                                      │
│  ─────────────────────────────────────────────────────────────────── │
│  (No footer - minimal chrome)                                        │
└─────────────────────────────────────────────────────────────────────┘
```

**Implementation:**
```typescript
// apps/web/src/layouts/PublicLayout.tsx
export function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <PublicHeader />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}

// apps/web/src/layouts/DashboardLayout.tsx
export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return (
    <div className="min-h-screen flex">
      <DashboardSidebar role={user.role} />
      <div className="flex-1 flex flex-col">
        <DashboardHeader user={user} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}

// apps/web/src/layouts/AuthLayout.tsx
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-50">
      <Link to="/" className="mb-8 text-primary-600 hover:underline">
        ← Back to Homepage
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
```

**Route Organization (Updated for Epic 2.5 - Strict Role Isolation):**
```typescript
// apps/web/src/routes.tsx
const routes = [
  // Public routes - use PublicLayout
  { path: '/', element: <PublicLayout><HomePage /></PublicLayout> },
  { path: '/about', element: <PublicLayout><AboutPage /></PublicLayout> },
  { path: '/marketplace', element: <PublicLayout><MarketplaceLanding /></PublicLayout> },

  // Auth routes - use AuthLayout (minimal)
  { path: '/login', element: <AuthLayout><LoginPage /></AuthLayout> },
  { path: '/register', element: <AuthLayout><RegisterPage /></AuthLayout> },
  { path: '/forgot-password', element: <AuthLayout><ForgotPasswordPage /></AuthLayout> },
  { path: '/verify-email', element: <AuthLayout><VerifyEmailPage /></AuthLayout> },

  // Dashboard routes - ROLE-SPECIFIC with strict isolation (Epic 2.5)
  // Each role can ONLY access their own dashboard routes
  { path: '/dashboard/super-admin/*', element: <ProtectedRoute allowedRoles={['super_admin']}><DashboardLayout><SuperAdminRoutes /></DashboardLayout></ProtectedRoute> },
  { path: '/dashboard/supervisor/*', element: <ProtectedRoute allowedRoles={['supervisor']}><DashboardLayout><SupervisorRoutes /></DashboardLayout></ProtectedRoute> },
  { path: '/dashboard/enumerator/*', element: <ProtectedRoute allowedRoles={['enumerator']}><DashboardLayout><EnumeratorRoutes /></DashboardLayout></ProtectedRoute> },
  { path: '/dashboard/data-entry/*', element: <ProtectedRoute allowedRoles={['data_entry_clerk']}><DashboardLayout><DataEntryRoutes /></DashboardLayout></ProtectedRoute> },
  { path: '/dashboard/assessor/*', element: <ProtectedRoute allowedRoles={['verification_assessor']}><DashboardLayout><AssessorRoutes /></DashboardLayout></ProtectedRoute> },
  { path: '/dashboard/official/*', element: <ProtectedRoute allowedRoles={['government_official']}><DashboardLayout><OfficialRoutes /></DashboardLayout></ProtectedRoute> },
  { path: '/dashboard/public/*', element: <ProtectedRoute allowedRoles={['public_user']}><DashboardLayout><PublicUserRoutes /></DashboardLayout></ProtectedRoute> },

  // Redirect /dashboard to role-specific dashboard based on user.role
  { path: '/dashboard', element: <DashboardRedirect /> },
];
```

**Epic 2.5 Security Model (Strict Route Isolation):**

**RBAC Matrix:**
| Route Pattern | super_admin | supervisor | enumerator | data_entry | assessor | official | public_user |
|--------------|:-----------:|:----------:|:----------:|:----------:|:--------:|:--------:|:-----------:|
| `/dashboard/super-admin/*` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/dashboard/supervisor/*` | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/dashboard/enumerator/*` | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `/dashboard/data-entry/*` | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `/dashboard/assessor/*` | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| `/dashboard/official/*` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `/dashboard/public/*` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

**Why Strict Isolation (NOT Super Admin access to all routes):**
- **Security:** Prevents watering hole attacks where compromising one role's route exposes Super Admin
- **Attack Surface:** If attacker breaches `/dashboard/enumerator/*`, they cannot exploit Super Admin visiting that route
- **360° Visibility:** Super Admin gets full system view via aggregated widgets on `/dashboard/super-admin/*` (staff lists, form management, submission health, system stats)
- **View-As Feature:** Deferred to Story 6-7 (Epic 6) where audit infrastructure exists for proper tracking

**Key Principles:**
1. **Clear Visual Separation:** Users know when they're on public website vs inside the app
2. **Role-Specific Navigation:** Dashboard sidebar shows only relevant menu items per role
3. **Auth Pages Focused:** Login/Register pages have minimal distraction (no full header/footer)
4. **Strict Route Isolation:** Each role can ONLY access their own dashboard routes (Epic 2.5)
5. **Code Splitting:** `/dashboard/{role}` pattern enables lazy loading per role (~30KB each vs 200KB bundle)

**Trade-offs:**
- ✅ Clear user experience separation between public website and application
- ✅ Role-specific dashboards feel like dedicated tools
- ✅ Auth pages are focused and distraction-free
- ✅ Easier to maintain separate design systems
- ✅ Strict route isolation prevents cross-role attacks
- ✅ Code splitting improves performance
- ❌ Users don't see website navigation while in dashboard
- ❌ May need "Return to Website" link in dashboard
- ❌ Super Admin needs aggregated widgets instead of visiting other routes

**Affects:** All frontend pages, Story 1.9 (Global UI Patterns), Story 3.6 (Public Homepage), **Epic 2.5 (Role-Based Dashboards)**

---

### ADR-017: Database Seeding Strategy (Hybrid Approach)

**Decision:** Implement a hybrid database seeding approach with environment-aware scripts for development vs production.

**Context:**
- Development needs quick, repeatable test data with hardcoded credentials
- Staging/Production needs secure Super Admin creation from environment variables
- Seed data should be removable without affecting real data
- CI/CD needs deterministic seed for integration tests

**Seeding Commands:**

```bash
# Development (local) - includes test users with known passwords
pnpm db:seed:dev

# Staging/Production - Super Admin from environment variables only
pnpm db:seed --admin-from-env

# Reset database (drops all data, re-runs migrations + seed)
pnpm db:reset

# Remove only seeded data (keeps real data)
pnpm db:seed:clean
```

**Implementation:**

**1. Seed Data Identification (is_seeded flag):**
```typescript
// apps/api/src/db/schema/users.ts
export const users = pgTable('users', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  email: text('email').unique().notNull(),
  // ... other fields
  isSeeded: boolean('is_seeded').default(false),  // Identifies seed data
  createdAt: timestamp('created_at').defaultNow(),
});
```

**2. Development Seed Script:**
```typescript
// apps/api/src/db/seeds/dev.seed.ts
export async function seedDevelopment() {
  console.log('🌱 Seeding development database...');

  // 33 LGAs (always needed)
  await seedLGAs();

  // Test Super Admin (hardcoded for dev convenience)
  await db.insert(users).values({
    email: 'admin@dev.local',
    passwordHash: await hashPassword('admin123'),  // Known password for dev
    role: 'super_admin',
    isSeeded: true,
    firstName: 'Dev',
    lastName: 'Admin'
  });

  // Test Enumerator (for field testing)
  await db.insert(users).values({
    email: 'enumerator@dev.local',
    passwordHash: await hashPassword('enum123'),
    role: 'enumerator',
    assignedLgaId: 'ibadan-north',
    isSeeded: true,
    firstName: 'Test',
    lastName: 'Enumerator'
  });

  // Add more test users as needed...
  console.log('✅ Development seed complete');
}
```

**3. Production Seed Script:**
```typescript
// apps/api/src/db/seeds/prod.seed.ts
export async function seedProduction() {
  console.log('🌱 Seeding production database...');

  // 33 LGAs (always needed, not marked as seeded)
  await seedLGAs();

  // Super Admin from environment variables only
  const adminEmail = process.env.SUPER_ADMIN_EMAIL;
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    throw new Error('SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD required for production seed');
  }

  await db.insert(users).values({
    email: adminEmail,
    passwordHash: await hashPassword(adminPassword),
    role: 'super_admin',
    isSeeded: false,  // Real account, not seed data
    firstName: 'System',
    lastName: 'Administrator'
  });

  console.log('✅ Production seed complete');
}
```

**4. Seed Cleanup Script:**
```typescript
// apps/api/src/db/seeds/clean.seed.ts
export async function cleanSeededData() {
  console.log('🧹 Removing seeded data...');

  // Delete all records marked as seeded
  await db.delete(users).where(eq(users.isSeeded, true));
  await db.delete(submissions).where(eq(submissions.isSeeded, true));
  // ... other tables

  console.log('✅ Seeded data removed (real data preserved)');
}
```

**Seed Data Removal Options:**

| Method | Use Case | Command |
|--------|----------|---------|
| `is_seeded` flag cleanup | Remove test data, keep real | `pnpm db:seed:clean` |
| Full database reset | Fresh start (dev/staging) | `pnpm db:reset` |
| Manual SQL | Surgical removal | `DELETE FROM users WHERE is_seeded = true` |
| Timestamp-based | Remove data before date | `DELETE FROM users WHERE created_at < 'YYYY-MM-DD'` |

**Trade-offs:**
- ✅ Development is fast (known passwords, no env setup needed)
- ✅ Production is secure (credentials from environment)
- ✅ Seed data is identifiable and removable
- ✅ CI can use deterministic seed for tests
- ❌ Additional `is_seeded` column in tables
- ❌ Must remember to set `isSeeded: true` for test data

**Affects:** Story 1.2 (Database Schema), Developer workflow, CI/CD pipeline

---

### ADR-018: Multi-Source Registry & Pending-NIN Status Model

**Decision:** Extend the existing `respondents` table with a nullable `nin` column (gated by a partial UNIQUE index) and an explicit `status` enum, rather than (a) keeping `nin NOT NULL` and forcing every multi-source ingest to invent placeholder NINs, or (b) creating a separate `external_beneficiaries` table parallel to `respondents`.

**Status:** Adopted 2026-04-22 (SCP-2026-04-22). Realised by Story 11-1 schema migration.

**Context:**

Two distinct pressures arrived at the schema layer in the same week:

1. **Field friction (FR5 / FR28):** non-trivial fraction of in-person respondents do not have their NIN at submission time (forgotten, lost, NIMC issuance delay). The hard `nin NOT NULL` constraint forced enumerators to either drop the respondent or invent a value. Both unacceptable.
2. **Secondary-data ingestion (FR25 / Epic 11):** the ITF-SUPA Oyo public-artisan PDF carries 759KB of records with redacted phones, no NINs, email typos, and missing LGAs. The Ministry needs these records inside our registry as **acknowledged-but-low-trust** data, not parallel to it.

Both pressures had the same root cause: NIN-presence was being conflated with respondent-existence. They are different concepts.

**Options considered:**

| Option | Approach | Rejected because |
|---|---|---|
| **B1** — keep `nin NOT NULL`, add a separate `external_beneficiaries` table for NIN-absent records | Two parallel registries with cross-table joins for analytics | Cross-table joins double the surface for every report, the marketplace, the dashboard; analytics consistently asks "all respondents" not "all field respondents", and a UNION view is operationally heavier than the partial-UNIQUE pattern |
| **B2** — extend `respondents`: nullable NIN + partial UNIQUE + `status` enum + provenance columns (**SELECTED**) | Single canonical registry; FR21 enforced at the DB boundary when NIN is present; status discriminator carries semantics | (none — selected) |
| **B3** — keep `nin NOT NULL`, generate placeholder NINs for absent records (e.g. `'PENDING-{uuid}'`) | Breaks the NIN format invariant (Modulus 11 validation); pollutes audit logs with synthetic identifiers; no path back to a real NIN later that doesn't require row updates and audit-trail rewrites | Synthetic NINs are a bug factory and would have to be filtered out of every NIN-keyed query forever |

**Decision details (B2):**

- `respondents.nin TEXT NULL` with `CREATE UNIQUE INDEX respondents_nin_unique_when_present ON respondents(nin) WHERE nin IS NOT NULL`. Rows with NIN keep FR21 dedupe at the DB boundary; rows without NIN do not collide.
- `respondents.status TEXT NOT NULL DEFAULT 'active'` with `CHECK (status IN ('active', 'pending_nin_capture', 'nin_unavailable', 'imported_unverified'))`. Drizzle exports `respondentStatusTypes` array + `RespondentStatus` type; CHECK is the DB-level second layer.
- `respondents.source` enum extended to `['enumerator', 'public', 'clerk', 'imported_itf_supa', 'imported_other']`. Existing values preserved unchanged.
- Provenance columns `external_reference_id`, `import_batch_id`, `imported_at`. New `import_batches` table captures lawful basis per batch (mandatory for DPIA), file-hash dedupe, parse outcome stats, and rollback status.

**Consequences:**

- **Service layer must status-gate.** Fraud detection, marketplace enrichment, and the partner `registry:verify_nin` scope MUST exclude `pending_nin_capture` and `imported_unverified` rows. Story 11-1 wraps the existing NIN dedupe in a NIN-presence conditional; downstream stories carry the status-filter forward into their queries. Tests in 11-1 verify the predicate is present on every NIN-derived query.
- **DPIA update required.** The new lawful-basis-per-batch column on `import_batches` is the data-protection surface for secondary ingestion; Iris updates Baseline Report Appendix H + drafts standalone D1 to reflect both pending-NIN and imported processing activities.
- **Right-to-erasure surface widens.** PRD V8.2 §"Right to Erasure" adds an alternative verification path (phone + DOB + LGA + magic-link or supervisor attestation) for NIN-absent records. The audit trail on erasure now records which verification path was used.
- **Postgres-version portability.** Partial unique index works on PG ≥ 9.6 (effectively forever). `UNIQUE NULLS NOT DISTINCT` (PG 15+) was rejected because production version is not pinned at 15+ and the partial-index pattern is more self-documenting.
- **Drizzle-kit constraint preserved.** Schema files do NOT import from `@oslsr/types`; enum constants inlined locally per the project-wide invariant in MEMORY.md.

**Cross-references:** FR21 (scoped), FR28 (deferred-NIN), Epic 11 (multi-source registry), Story 9-12 (public wizard consumption), Story 11-1 (schema migration), Decision 1.5 (architecture data model), Decision 5.6 (observability events).

---

### ADR-019: API Consumer Authentication Model

**Decision:** Authenticate Epic 10 partner-API consumers via **scoped opaque API keys**, stored as SHA-256 hashes at rest, with per-key LGA scoping, IP allowlisting, time-bounded scope grants, and a 180-day rotation cadence with 7-day overlap. Reject OAuth2 client-credentials and mTLS for the MVP.

**Status:** Adopted 2026-04-22 (SCP-2026-04-22). Realised by Story 10-1.

**Context:**

The OSLSR partner API surface (FR24) serves 3–10 expected MDA consumers (ITF-SUPA, NBS, NIMC, future integrations) with five initial scopes ranging from aggregated counts to row-level PII. Three forces shape the auth choice:

1. **Consumer-side ergonomics.** Federal MDA backend integrations are written by small teams that prefer the simplest possible client model. The shorter the integration-guide section, the higher the on-time delivery rate.
2. **Operator-side simplicity.** The OSLSR team is solo-dev / small-team during the implementation window and Ministry-ICT-handed-off post-Transfer. Authentication infrastructure that requires a separate identity-provider deployment (Keycloak, Auth0) is dead weight at this scale.
3. **Audit and revocation discipline.** The audit log already exists (Epic 6); we need a principal type that fits cleanly into the existing infrastructure (per ADR-018 / Decision 5.4) without inventing a parallel auth subsystem.

**Options considered:**

| Option | Approach | Outcome |
|---|---|---|
| **Scoped API keys** (SELECTED) | Bearer token; SHA-256 hash at rest; per-key scopes, LGA filter, IP allowlist; 180-day rotation with 7-day overlap | Simplest consumer integration; smallest operator footprint; fits cleanly into existing audit-log principal model |
| **OAuth2 client-credentials grant** | Consumer registers, exchanges client_id+client_secret for short-lived access tokens, refreshes periodically | Adds an `/oauth/token` endpoint, JWKS rotation, and refresh logic for negligible MVP benefit. Door open for a future amendment if a partner formally requires it |
| **mTLS** | Mutual-TLS with consumer-issued client certificates | Best-in-class but worst DX for MDA partner teams; PKI overhead (CA, CRL, certificate rotation) is unsustainable at our team size; rejected for MVP |

**Decision details:**

- Tokens are 256-bit random (32 bytes from `crypto.randomBytes`), base64url-encoded, displayed exactly once at provisioning, persisted only as SHA-256 hashes (`api_keys.token_hash UNIQUE`).
- Per-key controls: `allowed_ip_cidrs TEXT[]` (NULL ⇒ all IPs); `api_key_scopes` join table with `(api_key_id, scope)` primary key, optional per-scope `expires_at`, optional per-scope `allowed_lga_ids UUID[]`.
- Rotation: default 180-day cadence (`rotates_at = issued_at + 180d`); 7-day overlap window where superseded and successor keys both validate (tracked via `supersedes_key_id`); emergency rotation invalidates immediately (`revoked_at = now()`) with no overlap and is audit-logged with `meta.reason = 'emergency_rotation'`.
- Authentication errors taxonomy from Decision 2.4: `API_KEY_MISSING`, `API_KEY_INVALID`, `API_KEY_REVOKED`, `API_KEY_EXPIRED`, `IP_NOT_ALLOWED`, `SCOPE_INSUFFICIENT`, `SCOPE_EXPIRED`, `AMBIGUOUS_AUTH`, `RATE_LIMITED`.
- Per-consumer per-scope rate limiting via Redis (Story 10-2) keyed by `ratelimit:consumer:{id}:{scope}:{minute}` with atomic `INCR + EXPIRE`. Daily and monthly quotas as parallel keys.
- Provisioning policy for the `submissions:read_pii` scope: requires (a) signed Data-Sharing Agreement (Story 10-5) on file (`api_consumers.dsa_document_url IS NOT NULL`) and (b) two-person Ministry-ICT approval workflow (post-Transfer). Enforced at both UI and service layers per Decision 3.4.

**Consequences:**

- **DSA precondition is load-bearing.** Story 10-5 (legal artefact) is on the critical path for Epic 10 PII-scope release; without it, no `submissions:read_pii` key may be provisioned and Epic 10's most sensitive scope is dark.
- **Audit-log viewer (Story 9-11) is a hard prerequisite for PII scope release.** Even with DSA on file, partner-API access to PII without a working audit-read surface is a NDPA hole. FR26 calls this out explicitly; ADR-018 / Decision 5.4 makes the principal-exclusive audit shape possible.
- **OAuth2 door is closed but not locked.** A future partner that mandates OAuth2 client-credentials triggers a new SCP and a follow-on ADR. The api_consumers / api_keys schema can co-exist with an OAuth2 layer; the `apiKeyAuth` middleware would simply be one of two auth mechanisms on the partner namespace.
- **mTLS door is closed and locked.** Reviving mTLS would require a new ADR with a documented partner mandate; the operational complexity is high enough that we should not slip back into it without explicit evidence.
- **Ambiguous-auth rejection (Decision 2.8) is part of the contract.** Requests with both JWT and API key get `400 AMBIGUOUS_AUTH`; this prevents accidental privilege blending in developer environments and codifies the principal-exclusive boundary at the request layer.

**Cross-references:** FR24, NFR10, Epic 10 (all stories), Story 9-11 (audit viewer prerequisite), Story 10-5 (DSA), ADR-018 (audit principal model), Decision 2.4 (apiKeyAuth middleware), Decision 3.4 (partner namespace).

---

### ADR-020: Tailscale Operator-Access Architecture

**Decision:** Production VPS SSH access is delivered via a **Tailscale overlay network**; the DigitalOcean Cloud Firewall restricts SSH (22/tcp) to the Tailscale CGNAT range (`100.64.0.0/10`); DO Web Console + DO Recovery Console are documented break-glass paths; fail2ban runs as defence-in-depth. Cloudflare Zero Trust Tunnel and self-hosted WireGuard were rejected. Public-internet SSH is closed.

**Status:** Adopted 2026-04-22 (SCP-2026-04-22). **Deployed 2026-04-23** as the Story 9-9 P0 subtask. This ADR documents the as-deployed state, not a forward proposal — the change-log entry in Story 9-9 (2026-04-23) is the implementation evidence.

**Context:**

Monday 2026-04-20 11:04 UTC, the production VPS sustained a distributed SSH brute-force attack from 14+ IPs (`2.57.122.x`, `144.31.234.20`, `92.118.39.x`, `45.227.254.170`, `172.93.100.236`, `43.128.106.113`, `118.194.234.8`, `103.189.235.33`, `213.209.159.231`, `2.57.121.25`, `45.148.10.50`, `64.89.160.135`) hammering port 22 with usernames `root`, `ubuntu`, `oyotradeministry`, `test`, `user`, `hadi`, `amssys`. CPU hit 100%; memory 82%. The Story 6-2 monitoring alert fired as designed, but detection-to-response latency was 19 hours.

The pre-existing Story 9-9 backlog task only contemplated Cloudflare WAF/CDN — and Cloudflare is **domain-gated** on the `oslrs.com` purchase, which has not yet happened. SSH brute-force at the IP layer was outside the scope of any in-flight protection. The SCP-2026-04-22 expanded Story 9-9 scope to put SSH lockdown at the top of the priority order; this ADR captures the resulting decision.

**Options considered:**

| Option | Approach | Outcome |
|---|---|---|
| **Tailscale overlay** (SELECTED) | Tailscale daemon on VPS + operator devices; CGNAT range firewall rule; sshd hardened; fail2ban defence-in-depth | Lowest operator overhead; rotating-ISP-IP tolerance built in; works on Free tier for our team size |
| **Cloudflare Zero Trust Tunnel** | Cloudflared daemon on VPS; access policies in Cloudflare dashboard | Viable alternative if Cloudflare WAF (when domain lands) makes vendor consolidation attractive; deferred for now to keep operator path independent of domain availability |
| **Self-hosted WireGuard** | WireGuard endpoint on VPS; manual peer config per device | Rejected — overkill for a 1-operator-3-device scenario; key rotation discipline is manual; no equivalent of Tailscale's MagicDNS or tailnet ACLs |
| **DO Console only (no overlay)** | Use only DigitalOcean Web Console + Recovery Console for all operator access | Rejected for daily ops — DO Console suffers ISP/WebSocket filtering and is clunky for routine tasks; retained as break-glass only |

**Decision details (as-deployed 2026-04-23):**

- **Tailnet members:** VPS `oslsr-home-app` @ `100.93.100.28`; operator laptop `desktop-qe4lplq` @ `100.113.78.101`. Both signed in to `lawalkolade@gmail.com` (Free tier, 100-device cap, well within OSLSR scale).
- **DO Cloud Firewall:** OSLRS firewall SSH (22/tcp) source narrowed from `0.0.0.0/0` + `::/0` to `100.64.0.0/10` (Tailscale CGNAT range). Public-internet SSH is unreachable.
- **sshd configuration:** main file `/etc/ssh/sshd_config` plus drop-ins `/etc/ssh/sshd_config.d/50-cloud-init.conf` and `/etc/ssh/sshd_config.d/60-cloudimg-settings.conf` consistently set `PasswordAuthentication no`, `PermitRootLogin prohibit-password`, `PubkeyAuthentication yes`. Drop-in consistency matters: a single `PasswordAuthentication yes` in any drop-in overrides the main file; all three locations were aligned.
- **`/root/.ssh/authorized_keys`:** two keys — line 1 `github-actions-deploy` (CI deployment key; **DO NOT REMOVE** or deploys break), line 2 `awwallawal@gmail.com` (operator personal `id_ed25519`).
- **Operator laptop SSH config:** `C:\Users\DELL\.ssh\config` with `Host oslsr-home-app` block, `IdentityFile ~/.ssh/id_ed25519`, `IdentitiesOnly yes` (prevents the SSH agent from offering every available key, which would tip off attackers to held key types in the agent).
- **fail2ban:** installed and enabled with the default sshd jail (maxretry 5, bantime 10m). At Tailscale-only access this is mostly insurance against authenticated-user compromise rather than against external brute-force, but the cost is negligible.
- **Verification (post-deployment):** (a) public-IP SSH attempts return `Connection timed out` (firewall); (b) key-disabled SSH returns `Permission denied (publickey)` (sshd); (c) Tailscale-routed SSH returns immediate login with no password prompt. All three are the intended states.
- **Break-glass path order** (documented in `docs/emergency-recovery-runbook.md` panic-start block): Tailscale SSH → Tailscale IP direct → Tailscale daemon restart on laptop → DO Web Console → DO Recovery Console → DO Snapshot restore → DO Support ticket.
- **Quarterly drill:** runbook §6.1 mandates exercising each break-glass path at least once per quarter, with the result logged in the runbook Change Log. First drill due by 2026-07-23.

**Consequences:**

- **Operator workflow changes by one command.** `ssh root@oyotradeministry.com.ng` no longer works; `ssh root@oslsr-home-app` does. Documented in runbook §1.1.
- **CI deploy keys are unchanged.** `github-actions-deploy` continues to authenticate over SSH. GitHub Actions runners reach the VPS over the **public IP** (`appleboy/ssh-action` in `.github/workflows/ci-cd.yml`); they are not on the tailnet. The `100.64.0.0/10`-only rule applied between 2026-04-23 14:30 UTC and 2026-04-25 (firewall amendment, see below) would have blocked GH Actions runners — but no CI deploy was attempted in that window (last run was commit `36ccfbb` on 2026-04-20), so production deploys never broke. **Resolution (2026-04-25):** the SSH firewall rule was widened back to include `0.0.0.0/0` + `::/0` alongside `100.64.0.0/10`. Public-IP SSH attempts are now reachable to sshd, but sshd is hardened (`PasswordAuthentication no`, `PermitRootLogin prohibit-password`, key-only) and fail2ban handles repeat-offender IPs. The firewall is therefore **defence-in-depth**, not the primary control. The primary control remains sshd-level key authentication. **Long-term resolution (Story 9-9 follow-up subtask):** move CI to a self-hosted GitHub Actions runner inside the tailnet, then remove `0.0.0.0/0` again. Tracked in `_bmad-output/implementation-artifacts/9-9-infrastructure-security-hardening.md` File List "Follow-up items".
- **Phone and secondary operator devices are not yet on the tailnet.** This is a single-point-of-failure risk: if the operator laptop is unavailable, only DO Console paths work. Adding phone + secondary laptop is logged as a runbook §6.1 follow-up item.
- **DO Web Console is SSH-based, not hypervisor-out-of-band.** Empirical finding 2026-04-25: when the SSH firewall rule was `100.64.0.0/10`-only, DO Console timed out. When `0.0.0.0/0` was re-added, Console immediately worked. The `droplet-agent` (DOTTY) logs (`SSH Manager Initialized... sshd_port:[22]`) reveal that DO Console connects via SSH from DO's own infrastructure IP ranges (e.g. `162.243.0.0/16` observed in journal entries). This means Console availability is a function of the SSH firewall posture, not of WebSocket filtering / browser / network as initially theorised. **Implication for the Story 9-9 follow-up self-hosted-runner option:** if the firewall is re-narrowed, it must additionally permit DO's published IP ranges (`https://digitalocean.com/geo/google.csv` or DO API) for Console to remain a break-glass path; otherwise Console becomes unavailable as part of the trade-off. DO Recovery Console may share the same SSH-port dependency — verification pending in the next quarterly drill.
- **Tailscale Free-tier TOS.** The Free tier covers up to 100 devices and 3 users; OSLSR is well inside both. If Ministry adopts Tailscale post-Transfer for a larger team, an upgrade to Personal Pro or Business is required. No code changes needed.
- **Cloudflare ZT door open.** If Cloudflare WAF lands later and Ministry prefers a single vendor for both public-traffic protection and operator access, swapping Tailscale for Cloudflare Zero Trust Tunnel is a configuration change, not an architectural one.

**Cross-references:** NFR9, Story 9-9 Change Log entry 2026-04-23, `docs/emergency-recovery-runbook.md`, ADR-013 §"Tailscale Operator Access" subsection.

---

## Operational Procedures

_This section defines field operational protocols that complement technical architecture to ensure system success in real-world deployment conditions._

### Supervisor Hotspot Protocol (Deep Rural Connectivity)

**Purpose:** Mitigate "last mile" connectivity issues in deep rural areas where enumerators cannot access cellular data for 7+ days.

**Problem Statement:**
- Technical architecture guarantees 7-day offline capability (ADR-004: IndexedDB persistence, service workers)
- VPS infrastructure provides 99.5% uptime (NFR3.1)
- However: If enumerators in remote LGAs remain offline beyond 7 days, device storage constraints may force cache clearing, risking data loss
- Application cannot solve connectivity infrastructure gaps in rural Nigeria

**Operational Solution:**

**Weekly Sync Meeting Protocol:**

1. **Frequency:** Every 7 days (before device storage risk threshold)
2. **Location:** LGA Supervisor's office or central meeting point with reliable connectivity
3. **Participants:** Supervisor + assigned Enumerators (3 per LGA)
4. **Duration:** 30-60 minutes
5. **Equipment Required:**
   - Supervisor's smartphone with mobile data plan (provided by project)
   - WiFi hotspot capability enabled
   - Backup: Portable WiFi router with data SIM card

**Procedure Steps:**

**Day 1-6: Normal Field Collection**
- Enumerators work offline across assigned wards
- Surveys saved to IndexedDB, sync queue grows
- Dashboard displays gamified sync status: "📤 Daily Goal: 0/10 ⏳ 15 queued (offline)"

**Day 7: Sync Meeting**

1. **Setup (Supervisor):**
   - Enable mobile hotspot: Network name "OSLSR-Sync-[LGA-Name]", WPA2 password
   - Verify internet connectivity: Open OSLSR dashboard, confirm "✓ Synced" status
   - Position centrally for optimal signal coverage (3-5 meters radius)

2. **Enumerator Connection:**
   - Arrive at meeting location with charged devices (>50% battery)
   - Connect to Supervisor's hotspot: Settings → WiFi → "OSLSR-Sync-[LGA-Name]"
   - Open OSLSR PWA (should be "Add to Home Screen" icon)
   - Application auto-detects connectivity, initiates background sync

3. **Sync Progress Monitoring:**
   - Enumerators see: "Uploading 3 of 15... 20%" with real-time progress
   - Supervisor dashboard shows: "3 enumerators syncing... Total: 45 submissions queued"
   - Typical sync time: 2-5 minutes for 15 surveys (text-only, minimal media)
   - **Critical:** Enumerators must keep PWA open and device unlocked during sync

4. **Verification:**
   - Enumerators confirm: "🎯 Daily Goal Complete! 15/15 Uploaded ✅"
   - Supervisor verifies submissions appear in Custom App dashboard
   - Each enumerator reports: "All surveys synced. Storage cleared safely."

5. **Issue Resolution:**
   - **Sync Failure:** Supervisor checks individual submission errors, documents for IT support
   - **Partial Sync:** Note which submissions failed, prioritize retry
   - **Device Issues:** Use backup supervisor phone as alternative sync point

**Smart Sync Strategy (Phase 2 Enhancement):**

**Problem:** Mobile hotspot uses metered cellular data. Uploading 45 submissions with high-resolution photos could consume 500MB+ data (expensive for government budget).

**Solution (Future Implementation):**
- Application detects metered connection via `NetworkInformation API` (`connection.type === 'cellular'`)
- Prioritizes text data sync (NIN, responses, GPS coordinates) = ~2KB per submission
- Defers media attachments (profile photos, form scans) until WiFi detected
- Dashboard shows: "📤 Text synced ✅ Media pending WiFi (45 photos queued)"

**Implementation:**
```typescript
// apps/web/src/services/sync.service.ts
async function prioritizeSync() {
  const connection = (navigator as any).connection;
  const isMetered = connection?.type === 'cellular' ||
                    connection?.saveData === true;

  if (isMetered) {
    // Sync text data only (high priority)
    await syncQueue.processTextData();
    // Defer media to WiFi
    await syncQueue.deferMediaUploads();
  } else {
    // Sync everything
    await syncQueue.processAll();
  }
}
```

**Cost Efficiency:**
- Text-only sync: 45 submissions × 2KB = 90KB (~₦0.50 data cost)
- Full media sync: 45 submissions × 10MB = 450MB (~₦500 data cost if no WiFi)
- Savings: 99.9% data reduction by deferring media to WiFi

**Training Requirements:**

**Supervisor Training (1 hour):**
- Mobile hotspot setup and troubleshooting
- Sync meeting facilitation
- Dashboard verification procedures
- Issue escalation protocols

**Enumerator Training (30 minutes):**
- WiFi connection procedure
- Sync progress monitoring
- Storage safety guidelines ("Don't clear cache until synced ✓")
- Offline operation best practices

**Escalation Path:**

| Issue | Resolution | Escalation Timeline |
|-------|-----------|---------------------|
| Single enumerator sync failure | Document error, retry with Supervisor's device | Same day |
| Multiple enumerator failures | Network connectivity issue, reschedule for Day 8 | Next day |
| Supervisor hotspot unavailable | Use backup WiFi router, or nearest LGA with connectivity | Within 24 hours |
| Persistent sync failures (3+ days) | IT support dispatched to LGA with diagnostic tools | 48 hours |

**Success Metrics:**

- ✅ 95% of enumerators sync successfully at weekly meeting (5% tolerance for network/device issues)
- ✅ Zero data loss incidents due to cache clearing (100% success rate)
- ✅ Average sync time <5 minutes per enumerator
- ✅ Supervisor hotspot data usage <100MB per meeting (text-only prioritization)

**Affects:** Field operations training, supervisor onboarding, enumerator handbook, Story 2.3 (Enumerator Dashboard), Story 2.5 (Offline Sync Logic)

---

## Implementation Patterns & Consistency Rules

_This section defines concrete patterns that AI agents must follow to prevent conflicts, naming inconsistencies, and architectural drift during implementation. These patterns are derived from the 11 ADRs above and represent the "single source of truth" for code generation._

### Pattern Category 1: Database ID Strategy (UUIDv7)

**Decision:** Use **UUIDv7** for all primary keys and foreign keys across the entire system.

**Rationale:**
1. **Time-ordered sorting** - Unlike UUIDv4 (random), UUIDv7 maintains insertion order for better database index performance
2. **Offline-first compatible** - Enumerators working 7 days offline (ADR-004) can generate IDs client-side without centralized sequence coordination
3. **Globally unique** - Works across distributed systems (future-proof if system scales horizontally)
4. **Privacy benefit** - Non-sequential IDs don't leak record counts (vs auto-increment revealing "you're the 12,345th registrant")
5. **Better for PostgreSQL B-tree indexes** - Time-ordered UUIDs reduce index fragmentation vs random UUIDv4

**Implementation:**

**Backend (Drizzle ORM Schema):**
```typescript
// packages/types/src/schema/respondents.ts
import { pgTable, uuid, timestamp, text } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

export const respondents = pgTable('respondents', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),  // UUIDv7 default
  nin: text('nin').unique().notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// Foreign key example
export const submissions = pgTable('submissions', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  enumeratorId: uuid('enumerator_id').notNull()
    .references(() => users.id),  // UUID FK
  respondentId: uuid('respondent_id').notNull()
    .references(() => respondents.id),
  formId: uuid('form_id').notNull()
    .references(() => forms.id),
  submittedAt: timestamp('submitted_at').defaultNow()
});
```

**Frontend (Client-Side ID Generation for Offline):**
```typescript
// apps/web/src/utils/offlineSync.ts
import { uuidv7 } from 'uuidv7';

// Generate ID client-side for offline draft
const draftSubmission = {
  id: uuidv7(),  // Generate before submission
  enumeratorId: currentUser.id,
  formData: {...},
  status: 'pending_sync'
};

// When submitting to server, include pre-generated ID
await submitToServer(draftSubmission);
```

**API Response Format:**
```json
{
  "data": {
    "id": "018e5f2a-1234-7890-abcd-1234567890ab",
    "nin": "12345678901",
    "firstName": "Adewale",
    "lastName": "Johnson"
  }
}
```

**CRITICAL RULES:**
- ✅ **ALWAYS** use `uuid('column_name')` in Drizzle schemas (NOT `serial()`, `integer()`, or `bigint()` for IDs)
- ✅ **ALWAYS** use `.$defaultFn(() => uuidv7())` for primary keys
- ✅ **ALWAYS** use `uuid('{table}_id')` for foreign key columns (e.g., `enumerator_id`, `respondent_id`)
- ✅ **ALWAYS** import from `'uuidv7'` package (NOT `'uuid'` package which defaults to v4)
- ❌ **NEVER** use auto-increment sequences (`serial`, `IDENTITY`)
- ❌ **NEVER** use UUIDv4 (`uuid.v4()`) or other UUID versions
- ❌ **NEVER** use numeric IDs for any entity primary keys

**Package Installation:**
```bash
pnpm add uuidv7  # Backend and frontend
```

**Migration Example:**
```sql
-- migrations/0001_initial_schema.sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- Enable UUID support

CREATE TABLE respondents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),  -- PostgreSQL function
  nin TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  enumerator_id UUID NOT NULL REFERENCES users(id),
  respondent_id UUID NOT NULL REFERENCES respondents(id),
  submitted_at TIMESTAMP DEFAULT NOW()
);
```

**Affects:** All database schemas, API responses, frontend state management, offline sync logic

---

### Pattern Category 2: Naming Conventions

**Database (PostgreSQL):**
- ✅ **Tables:** snake_case, plural nouns (`respondents`, `submissions`, `fraud_detections`)
- ✅ **Columns:** snake_case (`first_name`, `enumerator_id`, `gps_latitude`)
- ✅ **Primary Keys:** Always `id` (UUID, not composite)
- ✅ **Foreign Keys:** `{referenced_table_singular}_id` (e.g., `enumerator_id` references `users.id`)
- ✅ **Indexes:** `idx_{table}_{column(s)}` (e.g., `idx_submissions_enumerator_id`)
- ✅ **Unique Constraints:** `uq_{table}_{column}` (e.g., `uq_respondents_nin`)
- ❌ **NEVER** use camelCase in database (`firstName` ❌, `first_name` ✅)

**API Endpoints:**
- ✅ **Base Path:** `/api/v1/` (URL versioning per Decision 3.3)
- ✅ **Resource Names:** Plural nouns, kebab-case (`/users`, `/fraud-detections`)
- ✅ **Query Parameters:** camelCase (`?lgaId=ib-north&startDate=2026-01-01`)
- ✅ **Path Parameters:** camelCase (`:userId`, `:submissionId`)
- ❌ **NEVER** use verbs in endpoints (`/getUsers` ❌, `/users` ✅)

**Examples:**
```
GET    /api/v1/respondents?lgaId=ib-north&page=1
POST   /api/v1/submissions
GET    /api/v1/users/:userId/submissions
PATCH  /api/v1/fraud-detections/:detectionId/review
DELETE /api/v1/sessions  # Logout
```

**Code (TypeScript):**
- ✅ **Components:** PascalCase (`EnumeratorDashboard`, `FraudAlertCard`)
- ✅ **Functions:** camelCase (`validateNin`, `calculateFraudScore`)
- ✅ **Constants:** SCREAMING_SNAKE_CASE (`MAX_RETRY_ATTEMPTS`, `FRAUD_THRESHOLD_GPS`)
- ✅ **Interfaces/Types:** PascalCase with descriptive names (`User`, `FraudDetectionResult`)
- ✅ **Enums:** PascalCase keys, SCREAMING_SNAKE_CASE values
  ```typescript
  enum UserRole {
    SUPER_ADMIN = 'SUPER_ADMIN',
    ENUMERATOR = 'ENUMERATOR',
    SUPERVISOR = 'SUPERVISOR'
  }
  ```
- ✅ **Files:** kebab-case (`fraud-detection.service.ts`, `enumerator-dashboard.tsx`)

**Environment Variables:**
- ✅ **Prefix by domain:** `DB_`, `REDIS_`, `AWS_`, `FRAUD_`
- ✅ **SCREAMING_SNAKE_CASE** (`DB_HOST`, `REDIS_PORT`, `AWS_SES_REGION`)
- ✅ **Boolean flags:** `FEATURE_` prefix (`FEATURE_FRAUD_DETECTION_ENABLED`)

---

### Pattern Category 3: Project Structure Patterns

**Monorepo Organization:**
```
oslsr/
├── apps/
│   ├── web/              # React PWA
│   │   ├── src/
│   │   │   ├── features/         # Feature-based (NOT pages/)
│   │   │   │   ├── auth/
│   │   │   │   │   ├── components/
│   │   │   │   │   ├── hooks/
│   │   │   │   │   ├── api/
│   │   │   │   │   └── types.ts
│   │   │   │   ├── enumerator-dashboard/
│   │   │   │   ├── fraud-review/
│   │   │   │   └── marketplace/
│   │   │   ├── components/       # Shared components
│   │   │   ├── hooks/            # Shared hooks
│   │   │   ├── lib/              # Utilities
│   │   │   └── App.tsx
│   │   └── package.json
│   └── api/              # Node.js/Express API
│       ├── src/
│       │   ├── routes/           # Express routers
│       │   │   ├── v1/
│       │   │   │   ├── auth.routes.ts
│       │   │   │   ├── users.routes.ts
│       │   │   │   └── submissions.routes.ts
│       │   ├── services/         # Business logic
│       │   │   ├── auth.service.ts
│       │   │   ├── fraud-detection.service.ts
│       │   │   └── form-management.service.ts
│       │   ├── middleware/       # Express middleware
│       │   ├── db/               # Drizzle schema + migrations
│       │   │   ├── schema/
│       │   │   └── migrations/
│       │   ├── jobs/             # BullMQ workers
│       │   └── server.ts
│       └── package.json
├── packages/
│   ├── types/            # Shared TypeScript types
│   ├── utils/            # Shared utilities
│   └── config/           # Shared configuration
├── docker/
│   ├── docker-compose.yml
│   ├── Dockerfile.api
│   └── Dockerfile.web
└── package.json          # Monorepo root
```

**Test Location Patterns:**

**Frontend (Co-located):**
```
features/auth/
├── components/
│   ├── LoginForm.tsx
│   └── LoginForm.test.tsx        # ✅ Co-located
├── hooks/
│   ├── useAuth.ts
│   └── useAuth.test.ts           # ✅ Co-located
```

**Backend (Separate __tests__):**
```
src/
├── services/
│   ├── fraud-detection.service.ts
│   └── __tests__/
│       └── fraud-detection.service.test.ts  # ✅ Separate folder
```

**Rationale:** Frontend tests often need test fixtures (mocks, factories); co-location keeps them close. Backend tests benefit from isolated `__tests__/` folders for cleaner service directories.

---

### Pattern Category 4: API Response Format Patterns

**Success Response (Data + Metadata):**
```typescript
// Standard success response
interface ApiResponse<T> {
  data: T;
  meta?: {
    pagination?: {
      page: number;
      pageSize: number;
      totalPages: number;
      totalItems: number;
    };
    timestamp?: string;  // ISO 8601
  };
}

// Example
{
  "data": [
    {
      "id": "018e5f2a-1234-7890-abcd-1234567890ab",
      "firstName": "Adewale",
      "lastName": "Johnson",
      "lga": "Ibadan North"
    }
  ],
  "meta": {
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "totalPages": 50,
      "totalItems": 1000
    },
    "timestamp": "2026-01-03T14:30:00.000Z"
  }
}
```

**Error Response (Code + Message + Details):**
```typescript
interface ApiError {
  code: string;           // Machine-readable error code
  message: string;        // Human-readable message
  details?: Record<string, any>;  // Optional context
}

// Example: NIN duplicate
{
  "code": "NIN_DUPLICATE",
  "message": "This individual was already registered on 2026-01-15 via enumerator_survey",
  "details": {
    "nin": "12345678901",
    "originalSubmissionDate": "2026-01-15T10:30:00.000Z",
    "originalSource": "enumerator_survey",
    "originalSubmissionId": "018e5f1a-abcd-7890-1234-567890abcdef"
  }
}

// Example: Validation error
{
  "code": "VALIDATION_ERROR",
  "message": "Invalid form data",
  "details": {
    "fields": {
      "nin": "NIN must be exactly 11 digits",
      "dateOfBirth": "Date of birth cannot be in the future"
    }
  }
}
```

**Date/Time Format:**
- ✅ **ALWAYS** use ISO 8601 strings in API responses (`2026-01-03T14:30:00.000Z`)
- ✅ **ALWAYS** store as `TIMESTAMP` in PostgreSQL (UTC timezone)
- ✅ **Frontend formatting:** Use `Intl.DateTimeFormat` or `date-fns` for display
- ❌ **NEVER** use Unix timestamps in API (hard to debug, timezone errors)
- ❌ **NEVER** store local time without timezone offset

---

### Pattern Category 5: Communication Patterns (Logging, Jobs, Cache Keys)

**Pino Structured Log Events:**

Pattern: `{domain}.{action}` (lowercase, underscores)

```typescript
// ✅ Good patterns
logger.info({ event: 'user.login', userId, role, lga });
logger.warn({ event: 'fraud.detected', heuristic: 'gps_cluster', score: 0.85 });
logger.error({ event: 'submission.ingestion.failed', submissionId, error: err.message });
logger.info({ event: 'marketplace.search', query, resultsCount, searcherId });
logger.debug({ event: 'cache.hit', key: 'fraud_thresholds', ttl: 3600 });

// ❌ Bad patterns
logger.info('User logged in');  // Unstructured
logger.warn({ msg: 'Fraud detected' });  // No event field
logger.error({ event: 'ERROR' });  // Too generic
```

**BullMQ Job Names:**

Pattern: `{domain}-{action}` (kebab-case)

```typescript
// ✅ Good patterns
await queue.add('webhook-ingestion', { submissionId });
await queue.add('fraud-detection', { submissionId });
await queue.add('email-notification', { userId, template: 'welcome' });
await queue.add('marketplace-export', { format: 'csv' });
await queue.add('backup-database', { target: 'app_db' });

// ❌ Bad patterns
await queue.add('process', { data });  // Too generic
await queue.add('FRAUD_CHECK', { id });  // SCREAMING_SNAKE_CASE (wrong)
await queue.add('send_email', { to });  // snake_case (wrong)
```

**TanStack Query Keys:**

Pattern: `[domain, ...identifiers, ...filters]` (array-based hierarchy)

```typescript
// ✅ Good patterns
['users', userId]                          // Single user
['users', userId, 'submissions']           // User's submissions
['respondents', { lgaId, page: 1 }]        // Filtered respondents
['fraud-detections', 'pending']            // Pending fraud reviews
['marketplace', 'profiles', { skills }]    // Marketplace search

// ❌ Bad patterns
['getUser', userId]                        // Verb prefix (wrong)
['user-' + userId]                         // String concatenation (wrong)
[{ userId }]                               // Missing domain (wrong)
```

**Redis Cache Keys:**

Pattern: `{domain}:{identifier}:{subresource}` (colon-separated)

```typescript
// ✅ Good patterns
`fraud:thresholds:gps_cluster`             // Fraud detection threshold
`session:blacklist:${tokenJti}`            // JWT blacklist
`rate_limit:ip:${ipAddress}`               // Rate limiting
`marketplace:profile:${respondentId}`      // Cached profile

// ❌ Bad patterns
`fraud_thresholds`                         // No domain prefix
`sessionBlacklist-${tokenJti}`             // Mixed separators
`${ipAddress}_rate_limit`                  // No domain prefix
```

**Per-Consumer Rate-Limit Cache Keys (Epic 10, SCP-2026-04-22):**

Partner-API rate-limit and quota counters share the cache-key conventions above with one additional rule: **principal kind is always part of the key prefix** so that consumer counters never collide with user-IP counters.

```typescript
// ✅ Per-consumer per-scope per-minute bucket (Story 10-2)
`ratelimit:consumer:${consumer_id}:${scope}:${YYYY-MM-DDTHH:MM}`

// ✅ Per-consumer daily / monthly quota
`quota:consumer:${consumer_id}:${scope}:daily:${YYYY-MM-DD}`
`quota:consumer:${consumer_id}:${scope}:monthly:${YYYY-MM}`

// ❌ Never share namespace with user-IP rate limits
`rate_limit:${consumer_id}`                // Ambiguous — is this a user IP or a consumer?
```

TTL convention: per-minute buckets `EXPIRE 70` (slight overhang absorbs clock drift); daily quotas `EXPIRE 90000` (~25h); monthly quotas `EXPIRE 2764800` (~32d). All counters use atomic `INCR` then `EXPIRE` (or `INCR` + initial `SETEX` if first write) — no read-modify-write.

**Pino Event Naming — Principal-Tagged for Audit-Friendly Parsing (SCP-2026-04-22):**

Every Pino event in service code MUST carry a `principal_kind` field set to one of `'user' | 'consumer' | 'system'` (matches the `audit_logs` principal-exclusive CHECK from Decision 1.5 / Decision 5.4). This lets log aggregation distinguish human-actor events from machine-consumer events without parsing the rest of the payload.

```typescript
// ✅ Human actor event (Pattern Category 5 baseline + new principal_kind tag)
logger.info({
  event: 'user_login',
  principal_kind: 'user',
  user_id: req.user.id,
  // …
});

// ✅ Machine consumer event (new event class, Story 10-1)
logger.info({
  event: 'api_partner_request',
  principal_kind: 'consumer',
  consumer_id: req.consumer.id,
  api_key_id: req.apiKey.id,
  scope: req.scopeContext.scope,
  applied_lga_filter: req.scopeContext.allowed_lga_ids ?? null,
  status_code: res.statusCode,
  latency_ms,
  rate_limit_outcome: 'within' | 'rejected',
});

// ✅ System event (scheduled jobs, startup, migrations)
logger.info({
  event: 'pending_nin_reminder_dispatched',
  principal_kind: 'system',
  reminder_window: 'T+2d',
  cohort_size: 47,
});

// ❌ Never omit principal_kind on a service-emitted event — log parsers depend on it
logger.info({ event: 'user_login', user_id: req.user.id });
```

**Audit-log write helper — discriminated union signature (SCP-2026-04-22):**

The `auditLog.create()` service helper takes a discriminated union to make it impossible to write a row that violates the principal-exclusive CHECK constraint:

```typescript
type AuditPrincipal =
  | { kind: 'user'; user_id: string }
  | { kind: 'consumer'; consumer_id: string }
  | { kind: 'system' };

interface AuditLogCreateInput {
  principal: AuditPrincipal;
  action: string;
  target_resource: string;
  target_id: string;
  meta?: Record<string, unknown>;
}

// At call sites: TypeScript narrowing rejects mixed-principal writes at compile time
await auditLog.create({
  principal: { kind: 'consumer', consumer_id: req.consumer.id },
  action: 'partner_query',
  target_resource: 'respondents',
  target_id: '<aggregated>',
  meta: { scope: 'aggregated_stats:read', applied_lga_filter: req.scopeContext.allowed_lga_ids },
});
```

The DB CHECK constraint (Decision 1.5) is the second layer — it catches the case where a future contributor bypasses the helper and writes to `audit_logs` directly. Defence in depth: types reject one shape, the database rejects another, and they agree on what is valid.

---

### Pattern Category 6: Process Patterns (Loading, Errors, Retries)

**Loading States (Skeleton Screens, NOT Spinners):**

```typescript
// ✅ Good: Skeleton screen
function EnumeratorDashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: fetchDashboardStats
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />  {/* Stats card skeleton */}
        <Skeleton className="h-64 w-full" />  {/* Chart skeleton */}
      </div>
    );
  }

  return <DashboardContent stats={stats} />;
}

// ❌ Bad: Spinner (generic, no layout preservation)
if (isLoading) return <Spinner />;
```

**Rationale:** Skeleton screens preserve layout, reduce perceived loading time (NFR1.2: 2.5s LCP), provide better UX for data entry clerks processing hundreds of records/day.

**Error Handling (Centralized AppError Class):**

```typescript
// packages/utils/src/errors.ts
export class AppError extends Error {
  constructor(
    public code: string,
    public message: string,
    public statusCode: number = 500,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// Usage in service
if (existingRespondent) {
  throw new AppError(
    'NIN_DUPLICATE',
    `This individual was already registered on ${existingRespondent.createdAt}`,
    409,  // HTTP 409 Conflict
    {
      nin: existingRespondent.nin,
      originalSubmissionId: existingRespondent.id,
      originalSubmissionDate: existingRespondent.createdAt
    }
  );
}

// Centralized Express error handler
app.use((err, req, res, next) => {
  if (err instanceof AppError) {
    logger.warn({ event: 'api.error', code: err.code, path: req.path });
    return res.status(err.statusCode).json({
      code: err.code,
      message: err.message,
      details: err.details
    });
  }

  // Unknown error
  logger.error({ event: 'api.error.unknown', error: err.message, stack: err.stack });
  res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred'
  });
});
```

**Retry Logic (Exponential Backoff with TanStack Query):**

```typescript
// Frontend: Automatic retry for failed API calls
const { data, error } = useQuery({
  queryKey: ['submissions', submissionId],
  queryFn: () => fetchSubmission(submissionId),
  retry: 3,                    // Retry failed requests 3 times
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  // Retry delays: 1s, 2s, 4s (max 30s)
  networkMode: 'offlineFirst'  // Use cache if offline (ADR-004)
});

// Backend: BullMQ job retry configuration
queue.add('webhook-ingestion', { submissionId }, {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 5000  // 5s, 10s, 20s, 40s, 80s (max 5 retries)
  }
});
```

**Optimistic Updates (TanStack Query Mutations):**

```typescript
// Update respondent profile optimistically
const mutation = useMutation({
  mutationFn: updateRespondent,
  onMutate: async (newData) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['respondents', respondentId] });

    // Snapshot previous value
    const previousRespondent = queryClient.getQueryData(['respondents', respondentId]);

    // Optimistically update UI
    queryClient.setQueryData(['respondents', respondentId], newData);

    return { previousRespondent };
  },
  onError: (err, newData, context) => {
    // Rollback on error
    queryClient.setQueryData(
      ['respondents', respondentId],
      context.previousRespondent
    );
  },
  onSettled: () => {
    // Refetch to sync with server
    queryClient.invalidateQueries({ queryKey: ['respondents', respondentId] });
  }
});
```

---

### Pattern Category 7: Security Patterns

**Input Validation (Zod Schemas):**

```typescript
// Shared schema (packages/types/src/validation/respondent.ts)
import { z } from 'zod';
import { verhoeffCheck } from '@oslsr/utils';

export const ninSchema = z.string()
  .length(11, 'NIN must be exactly 11 digits')
  .regex(/^\d{11}$/, 'NIN must contain only digits')
  .refine(verhoeffCheck, 'Invalid NIN checksum');

export const createRespondentSchema = z.object({
  nin: ninSchema,
  firstName: z.string().min(2).max(50),
  lastName: z.string().min(2).max(50),
  dateOfBirth: z.string().datetime(),
  phoneNumber: z.string().regex(/^\+234\d{10}$/),
  lgaId: z.string().uuid()
});

// Backend validation middleware
import { createRespondentSchema } from '@oslsr/types/validation';

router.post('/respondents', async (req, res) => {
  const validated = createRespondentSchema.parse(req.body);  // Throws if invalid
  // ... proceed with validated data
});

// Frontend validation (same schema!)
import { createRespondentSchema } from '@oslsr/types/validation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

const form = useForm({
  resolver: zodResolver(createRespondentSchema)
});
```

**Authentication Middleware Pattern:**

```typescript
// middleware/authenticate.ts
export const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
  }

  // Check JWT blacklist (Redis)
  const isBlacklisted = await redis.sismember('jwt:blacklist', tokenJti);
  if (isBlacklisted) {
    throw new AppError('TOKEN_REVOKED', 'Token has been revoked', 401);
  }

  // Verify JWT
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  req.user = decoded;  // Attach user to request
  next();
};

// Role-based authorization
export const authorize = (...allowedRoles: UserRole[]) => {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      throw new AppError('FORBIDDEN', 'Insufficient permissions', 403);
    }
    next();
  };
};

// Usage
router.post('/fraud-detections/:id/review',
  authenticate,
  authorize(UserRole.VERIFICATION_ASSESSOR, UserRole.SUPER_ADMIN),
  reviewFraudDetection
);
```

**Rate Limiting Pattern:**

```typescript
// middleware/rate-limit.ts
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redis } from '../db/redis';

// Marketplace rate limit (ADR-006)
export const marketplaceRateLimit = rateLimit({
  store: new RedisStore({ client: redis }),
  windowMs: 60 * 1000,     // 1 minute
  max: 30,                 // 30 requests per minute per IP
  message: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Authenticated API rate limit
export const apiRateLimit = rateLimit({
  store: new RedisStore({ client: redis }),
  windowMs: 60 * 1000,
  max: 100,               // 100 requests per minute
  keyGenerator: (req) => req.user?.id || req.ip  // Per user, not per IP
});

// Usage
app.use('/api/v1/marketplace', marketplaceRateLimit);
app.use('/api/v1', authenticate, apiRateLimit);
```

**Redis Connection Factory Pattern:**

```
Redis Connection Pattern (SEC2-2):
- Singleton via getRedisClient() for rate limiters, services, caching
- Dedicated connection via createRedisConnection() for BullMQ queues/workers
- Centralized in apps/api/src/lib/redis.ts
- NEVER instantiate new Redis() directly outside lib/redis.ts
- All connections use REDIS_URL env var (supports AUTH via redis://:password@host:port)
```

**Infrastructure Security Requirements:**

```
Docker Port Binding:
- All Docker services MUST use 127.0.0.1:HOST_PORT:CONTAINER_PORT
- Docker bypasses UFW by writing directly to iptables
- DigitalOcean Cloud Firewall is the true perimeter (hypervisor-level)

Data Store Authentication:
- Redis MUST require AUTH (--requirepass) in all environments
- PostgreSQL MUST use strong, unique credentials per environment
- Connection strings with passwords MUST use REDIS_URL/DATABASE_URL env vars
- Passwords MUST be hex-only (openssl rand -hex 32) to avoid URL encoding issues
```

**Operator SSH Access (per NFR9, ADR-020):**

```
Production VPS SSH:
- Public-internet SSH (22/tcp from 0.0.0.0/0) MUST be closed at the DO Cloud Firewall
- SSH source MUST be restricted to Tailscale CGNAT range 100.64.0.0/10
- sshd_config: PasswordAuthentication no (main file + every drop-in)
- sshd_config: PermitRootLogin prohibit-password
- sshd_config: PubkeyAuthentication yes
- fail2ban MUST be enabled with the sshd jail
- DigitalOcean Web Console + Recovery Console retained as documented break-glass paths
- Quarterly recovery drill REQUIRED (per docs/emergency-recovery-runbook.md §6.1)
```

**API Consumer Token Storage (per NFR10, ADR-019, SCP-2026-04-22):**

API consumer tokens are stored exclusively as SHA-256 hashes; the plaintext is shown to the provisioning operator exactly once and is never persisted, recoverable, or logged.

```typescript
// ✅ Correct — generate, hash, persist hash, return plaintext to operator once
import { randomBytes, createHash } from 'crypto';

async function provisionApiKey(consumerId: string, name: string) {
  const plaintext = randomBytes(32).toString('base64url');  // 256 bits, URL-safe
  const tokenHash = createHash('sha256').update(plaintext).digest('hex');
  const tokenPrefix = plaintext.slice(0, 8);  // For admin UI identification only

  const [row] = await db.insert(apiKeys).values({
    consumerId,
    name,
    tokenHash,        // ← Persisted
    tokenPrefix,      // ← Persisted (8 chars, not enough to authenticate)
    issuedAt: new Date(),
    rotatesAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
  }).returning();

  return { id: row.id, plaintext };  // ← Plaintext returned to caller, ONCE
}

// ❌ NEVER store plaintext, even temporarily
await db.insert(apiKeys).values({ token: plaintext });  // catastrophic

// ❌ NEVER log plaintext
logger.info({ event: 'api_key_provisioned', token: plaintext });  // catastrophic

// ❌ NEVER return plaintext from a "get key details" endpoint — show prefix only
GET /api/v1/admin/consumers/:id/keys → returns tokenPrefix, never plaintext
```

**Per-Consumer Redis Rate-Limit Keying (per Story 10-2, ADR-019):**

Rate-limit Redis keys MUST include the consumer ID, the scope, and the time bucket. The principal namespace (`consumer:`) MUST be in the key prefix to prevent collisions with user-IP rate-limit keys.

```typescript
// ✅ Per-consumer per-scope per-minute bucket
const key = `ratelimit:consumer:${consumerId}:${scope}:${minuteBucket()}`;
const count = await redis.incr(key);
if (count === 1) await redis.expire(key, 70);  // 70s overhang absorbs clock drift
if (count > limitForScope(scope)) {
  throw new AppError('RATE_LIMITED', 'Per-consumer rate limit exceeded', 429);
}

// ❌ Wrong — collides with user-IP rate limits and loses scope dimension
const key = `rate_limit:${consumerId}`;

// ❌ Wrong — non-atomic; under contention will undercount
const count = await redis.get(key);
if (count > limit) throw …;
await redis.set(key, count + 1);
```

Daily and monthly quota counters use parallel keys (`quota:consumer:{id}:{scope}:daily:{YYYY-MM-DD}`, etc.) and are evaluated **after** the per-minute bucket — a request can be within-minute but over-day. The middleware order is: `apiKeyAuth` → `requireScope` → per-minute → daily → monthly → controller.

**Timing-Safe Comparison for Token Lookup (per Decision 2.4, ADR-019):**

Token lookup MUST use timing-safe comparison to prevent timing oracles that distinguish "wrong token" (fast index miss) from "valid token, wrong scope" (slower row fetch).

```typescript
// ✅ Hash submitted token, look up by indexed hash, then timing-safe compare
import { timingSafeEqual, createHash } from 'crypto';

async function authenticateApiKey(submittedToken: string) {
  const submittedHash = createHash('sha256').update(submittedToken).digest('hex');
  const row = await db.select().from(apiKeys).where(eq(apiKeys.tokenHash, submittedHash)).limit(1);

  if (!row.length) {
    // Don't short-circuit — perform a timingSafeEqual against a known-bad value to
    // normalise the response time of the "miss" path against the "hit" path.
    timingSafeEqual(Buffer.from(submittedHash), Buffer.from('0'.repeat(64)));
    throw new AppError('API_KEY_INVALID', '…', 401);
  }

  // Even on hit, do an explicit timingSafeEqual to cover any future codepath
  // that might compare hashes via string equality.
  if (!timingSafeEqual(Buffer.from(submittedHash), Buffer.from(row[0].tokenHash))) {
    throw new AppError('API_KEY_INVALID', '…', 401);
  }

  return row[0];
}

// ❌ Wrong — string equality leaks comparison time on long shared prefixes
if (submittedHash === row.tokenHash) { … }

// ❌ Wrong — no normalisation on miss path; "miss" returns faster than "hit, scope-fail"
if (!row) throw new AppError('API_KEY_INVALID', …);
```

The "normalise miss-path timing against hit-path timing" technique is what makes the difference between "not found" and "found but wrong scope" un-distinguishable to a timing attacker. It costs ~20µs per request — negligible for the partner-API's expected volume (≤300 req/min per consumer per scope, Decision 3.4).

---

### Critical Conflict Prevention Rules

**For AI Agents Implementing Stories:**

1. **IDs are ALWAYS UUIDv7** - Never create a table with `serial` or `integer` IDs
2. **Database columns are ALWAYS snake_case** - Never use camelCase in PostgreSQL
3. **API responses ALWAYS use camelCase** - Transform at API boundary (Drizzle → camelCase)
4. **Foreign keys ALWAYS reference UUID columns** - No composite keys, no integer references
5. **Logs ALWAYS use structured JSON** - Never use plain string logging
6. **Dates ALWAYS use ISO 8601 in APIs** - Never use Unix timestamps or local time strings
7. **Loading states ALWAYS use skeleton screens** - Never use generic spinners for data tables
8. **Errors ALWAYS use AppError class** - Never throw raw Error objects in services
9. **Tests are co-located for frontend** - Never create separate `__tests__/` folders in React features
10. **Tests are in `__tests__/` for backend** - Never co-locate backend tests with services

**Story File Cross-Reference:**
- Story 1.2 (Database Schema) MUST use UUIDv7 patterns from Pattern Category 1
- Story 2.1 (Authentication System) MUST use JWT + Redis patterns from Pattern Category 7
- Story 3.1 (State Management) MUST use TanStack Query key patterns from Pattern Category 5
- Story 4.1 (Logging Infrastructure) MUST use Pino event patterns from Pattern Category 5
- Story 5.x (Fraud Detection) MUST use structured error patterns from Pattern Category 6

**Affects:** All implementation stories, code review checklists, architectural compliance validation

---

## Project Structure & Boundaries

_This section defines the complete project directory structure and architectural boundaries, providing a concrete implementation roadmap for AI agents._

### Complete Project Directory Structure

```
oslsr/
├── README.md
├── package.json                    # Monorepo root with pnpm workspaces
├── pnpm-workspace.yaml             # pnpm workspace configuration
├── .gitignore
├── .env.example
├── .nvmrc                          # Node.js 20 LTS version lock
├── turbo.json                      # Turborepo build caching (optional)
│
├── .github/
│   └── workflows/
│       ├── ci.yml                  # Run tests, linting, type-check
│       ├── deploy-staging.yml      # Deploy to staging environment
│       └── deploy-production.yml   # Deploy to production
│
├── docker/
│   ├── docker-compose.yml          # Orchestrates: Custom App + PostgreSQL + Redis + Nginx
│   ├── docker-compose.dev.yml      # Development overrides
│   ├── Dockerfile.api              # Node.js API container
│   ├── Dockerfile.web              # Nginx + React build container
│   └── scripts/
│       ├── init-db.sh              # Database initialization
│       ├── backup.sh               # Manual backup script
│       └── restore.sh              # Manual restore script
│
├── apps/
│   ├── web/                        # React 18.3 PWA (Vite + Tailwind + shadcn/ui)
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.ts
│   │   ├── tsconfig.json
│   │   ├── postcss.config.js
│   │   ├── .env.local
│   │   ├── .env.example
│   │   ├── index.html
│   │   ├── public/
│   │   │   ├── manifest.json       # PWA manifest
│   │   │   ├── service-worker.js   # Offline capability (7-day support)
│   │   │   ├── robots.txt
│   │   │   └── assets/
│   │   │       ├── logos/
│   │   │       └── images/
│   │   │
│   │   └── src/
│   │       ├── App.tsx
│   │       ├── main.tsx
│   │       ├── vite-env.d.ts
│   │       │
│   │       ├── features/           # Feature-based organization (NOT pages/)
│   │       │   │
│   │       │   ├── auth/           # FR6-FR8: User Management & Provisioning
│   │       │   │   ├── components/
│   │       │   │   │   ├── LoginForm.tsx
│   │       │   │   │   ├── LoginForm.test.tsx
│   │       │   │   │   ├── OnboardingWizard.tsx
│   │       │   │   │   └── ProfileCompletion.tsx
│   │       │   │   ├── hooks/
│   │       │   │   │   ├── useAuth.ts
│   │       │   │   │   └── useAuth.test.ts
│   │       │   │   ├── api/
│   │       │   │   │   └── authApi.ts
│   │       │   │   └── types.ts
│   │       │   │
│   │       │   ├── enumerator-dashboard/  # FR9-FR11: Data Collection & Sync
│   │       │   │   ├── components/
│   │       │   │   │   ├── Dashboard.tsx
│   │       │   │   │   ├── StatsCard.tsx
│   │       │   │   │   ├── SubmissionList.tsx
│   │       │   │   │   ├── OfflineIndicator.tsx
│   │       │   │   │   └── UploadNowButton.tsx  # ADR-008: Emergency sync control
│   │       │   │   ├── hooks/
│   │       │   │   │   ├── useOfflineSync.ts
│   │       │   │   │   └── useSubmissions.ts
│   │       │   │   ├── api/
│   │       │   │   │   └── submissionsApi.ts
│   │       │   │   └── types.ts
│   │       │   │
│   │       │   ├── supervisor-dashboard/  # FR12-FR16: Oversight & Quality Control
│   │       │   │   ├── components/
│   │       │   │   │   ├── Dashboard.tsx
│   │       │   │   │   ├── EnumeratorPerformance.tsx
│   │       │   │   │   ├── FraudAlerts.tsx
│   │       │   │   │   └── RealTimeMap.tsx
│   │       │   │   ├── hooks/
│   │       │   │   │   └── useSupervisorStats.ts
│   │       │   │   └── api/
│   │       │   │       └── supervisorApi.ts
│   │       │   │
│   │       │   ├── fraud-review/  # FR14: Verification Assessor Queue
│   │       │   │   ├── components/
│   │       │   │   │   ├── FraudQueue.tsx
│   │       │   │   │   ├── SubmissionDetail.tsx
│   │       │   │   │   ├── FraudHeuristicBreakdown.tsx
│   │       │   │   │   └── ReviewActions.tsx
│   │       │   │   ├── hooks/
│   │       │   │   │   └── useFraudDetections.ts
│   │       │   │   └── api/
│   │       │   │       └── fraudApi.ts
│   │       │   │
│   │       │   ├── marketplace/   # FR17-FR21: Public Marketplace
│   │       │   │   ├── components/
│   │       │   │   │   ├── PublicSearch.tsx
│   │       │   │   │   ├── SkillsFilter.tsx
│   │       │   │   │   ├── AnonymousProfile.tsx
│   │       │   │   │   ├── ContactForm.tsx
│   │       │   │   │   └── CaptchaChallenge.tsx  # ADR-006: Bot protection
│   │       │   │   ├── hooks/
│   │       │   │   │   └── useMarketplaceSearch.ts
│   │       │   │   └── api/
│   │       │   │       └── marketplaceApi.ts
│   │       │   │
│   │       │   ├── data-entry/    # FR21: Paper Digitization Interface
│   │       │   │   ├── components/
│   │       │   │   │   ├── BulkEntryForm.tsx
│   │       │   │   │   ├── KeyboardShortcutsHelper.tsx
│   │       │   │   │   └── EntryProgressTracker.tsx
│   │       │   │   └── hooks/
│   │       │   │       └── useBulkEntry.ts
│   │       │   │
│   │       │   ├── admin/         # FR16: Super Admin Dashboard
│   │       │   │   ├── components/
│   │       │   │   │   ├── SystemHealth.tsx
│   │       │   │   │   ├── UserManagement.tsx
│   │       │   │   │   ├── BulkImport.tsx       # FR7: CSV bulk import
│   │       │   │   │   ├── FraudThresholds.tsx  # ADR-003: Config UI
│   │       │   │   │   ├── BackupStatus.tsx
│   │       │   │   │   └── MetricsDashboard.tsx # Decision 5.3: Lightweight metrics
│   │       │   │   └── api/
│   │       │   │       └── adminApi.ts
│   │       │   │
│   │       │   └── native-forms/   # FR9-FR11: Native Form Renderer
│   │       │       ├── components/
│   │       │       │   ├── FormRenderer.tsx      # One-question-per-screen renderer
│   │       │       │   ├── FormList.tsx
│   │       │       │   └── DraftManager.tsx     # ADR-004: IndexedDB draft management
│   │       │       └── hooks/
│   │       │           └── useNativeForm.ts
│   │       │
│   │       ├── components/         # Shared UI components
│   │       │   ├── ui/            # shadcn/ui base components
│   │       │   │   ├── button.tsx
│   │       │   │   ├── skeleton.tsx  # Pattern Category 6: Skeleton screens
│   │       │   │   ├── form.tsx
│   │       │   │   ├── input.tsx
│   │       │   │   └── ... (other shadcn components)
│   │       │   ├── layout/
│   │       │   │   ├── Header.tsx
│   │       │   │   ├── Sidebar.tsx
│   │       │   │   └── Footer.tsx
│   │       │   └── common/
│   │       │       ├── ErrorBoundary.tsx
│   │       │       ├── LoadingSkeleton.tsx
│   │       │       └── OfflineBanner.tsx
│   │       │
│   │       ├── hooks/              # Shared custom hooks
│   │       │   ├── useQueryClient.ts
│   │       │   ├── useErrorHandler.ts
│   │       │   └── useOfflineStatus.ts
│   │       │
│   │       ├── lib/                # Utilities and helpers
│   │       │   ├── api-client.ts   # Axios instance with interceptors
│   │       │   ├── query-client.ts # TanStack Query configuration
│   │       │   ├── store.ts        # Zustand store setup
│   │       │   └── utils.ts        # General utilities
│   │       │
│   │       ├── store/              # Zustand stores (UI state only)
│   │       │   ├── authStore.ts
│   │       │   ├── dashboardFiltersStore.ts
│   │       │   └── offlineSyncStore.ts
│   │       │
│   │       └── styles/
│   │           ├── globals.css
│   │           └── tailwind.css
│   │
│   └── api/                        # Node.js 20 LTS + Express API
│       ├── package.json
│       ├── tsconfig.json
│       ├── .env
│       ├── .env.example
│       ├── nodemon.json
│       │
│       └── src/
│           ├── server.ts           # Express app entry point
│           ├── app.ts              # Express app configuration
│           │
│           ├── config/             # Configuration management
│           │   ├── database.ts
│           │   ├── redis.ts
│           │   ├── forms.ts
│           │   ├── aws.ts
│           │   └── logger.ts       # Pino configuration
│           │
│           ├── routes/             # Express routers (API v1)
│           │   └── v1/
│           │       ├── index.ts
│           │       ├── auth.routes.ts          # FR6-FR8: Authentication
│           │       ├── users.routes.ts         # FR7: User management
│           │       ├── submissions.routes.ts   # FR10: Submission retrieval
│           │       ├── fraud-detections.routes.ts  # FR14: Fraud review
│           │       ├── marketplace.routes.ts   # FR17-FR20: Public marketplace
│           │       ├── data-entry.routes.ts    # FR21: Paper digitization
│           │       ├── dashboards.routes.ts    # FR12-FR13: Supervisor dashboards
│           │       ├── admin.routes.ts         # FR16: Super admin
│           │       ├── forms.routes.ts          # Native form management API
│           │       └── health.routes.ts        # Health check endpoint
│           │
│           ├── services/           # Business logic layer
│           │   ├── auth.service.ts             # Decision 2.1: JWT + Redis
│           │   ├── user.service.ts             # FR7: Bulk import, provisioning
│           │   ├── submission.service.ts       # Submission processing
│           │   ├── fraud-detection.service.ts  # ADR-003: Fraud engine
│           │   ├── marketplace.service.ts      # FR17-FR20: Profile management
│           │   ├── dashboard.service.ts        # FR12-FR13: Stats aggregation
│           │   ├── audit.service.ts            # NFR4: Immutable audit logs
│           │   ├── notification.service.ts     # Email/SMS via AWS SES
│           │   ├── backup.service.ts           # NFR3: Backup orchestration
│           │   └── __tests__/
│           │       ├── auth.service.test.ts
│           │       ├── fraud-detection.service.test.ts
│           │       └── ... (other service tests)
│           │
│           ├── middleware/         # Express middleware
│           │   ├── authenticate.ts             # Pattern Category 7: JWT auth
│           │   ├── authorize.ts                # Role-based authorization
│           │   ├── validate.ts                 # Zod validation middleware
│           │   ├── rate-limit.ts               # Pattern Category 7: Redis rate limiting
│           │   ├── error-handler.ts            # Pattern Category 6: Centralized errors
│           │   ├── logger.ts                   # Pino request logging
│           │   └── __tests__/
│           │       └── ... (middleware tests)
│           │
│           ├── db/                 # Database layer (Drizzle ORM)
│           │   ├── index.ts        # Database connection pool
│           │   ├── schema/
│           │   │   ├── users.ts                # Pattern Category 1: UUIDv7
│           │   │   ├── respondents.ts
│           │   │   ├── submissions.ts
│           │   │   ├── fraud-detections.ts
│           │   │   ├── marketplace-profiles.ts
│           │   │   ├── audit-logs.ts           # NFR4: Immutable logs
│           │   │   ├── fraud-thresholds.ts     # ADR-003: DB-backed config
│           │   │   └── index.ts
│           │   ├── migrations/
│           │   │   ├── 0001_initial_schema.sql
│           │   │   ├── 0002_add_fraud_tables.sql
│           │   │   └── ... (migration files)
│           │   ├── seeds/
│           │   │   ├── 01_lgas.ts              # 33 LGAs seed data
│           │   │   └── 02_fraud_thresholds.ts
│           │   └── replica.ts      # Read-only replica connection (marketplace)
│           │
│           ├── jobs/               # BullMQ job workers
│           │   ├── queues.ts       # Queue setup
│           │   ├── workers/
│           │   │   ├── submission-ingestion.worker.ts  # Submission processing pipeline
│           │   │   ├── fraud-detection.worker.ts     # ADR-003: Async fraud checks
│           │   │   ├── email-notification.worker.ts
│           │   │   ├── backup-database.worker.ts     # NFR3: Automated backups
│           │   │   └── marketplace-export.worker.ts
│           │   └── __tests__/
│           │       └── ... (worker tests)
│           │
│           ├── utils/              # Utility functions
│           │   ├── verhoeff.ts     # NIN checksum validation
│           │   ├── encryption.ts   # AES-256 encryption helpers
│           │   ├── date.ts         # Date formatting utilities
│           │   └── __tests__/
│           │       └── verhoeff.test.ts
│           │
│           └── types/              # TypeScript type definitions
│               ├── express.d.ts    # Express request extensions
│               ├── api.types.ts
│               └── models.types.ts
│
├── packages/
│   ├── types/                      # Shared TypeScript types
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── user.types.ts
│   │       ├── respondent.types.ts
│   │       ├── submission.types.ts
│   │       ├── fraud.types.ts
│   │       ├── marketplace.types.ts
│   │       └── validation/         # Shared Zod schemas
│   │           ├── index.ts
│   │           ├── respondent.schema.ts    # Pattern Category 7: Zod validation
│   │           ├── submission.schema.ts
│   │           └── marketplace.schema.ts
│   │
│   ├── utils/                      # Shared utilities
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── errors.ts           # Pattern Category 6: AppError class
│   │       ├── verhoeff.ts         # Shared NIN validation
│   │       ├── uuid.ts             # Pattern Category 1: UUIDv7 helpers
│   │       ├── date.ts
│   │       └── __tests__/
│   │           └── ... (utility tests)
│   │
│   └── config/                     # Shared configuration
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           ├── constants.ts        # System-wide constants
│           ├── lgas.ts             # 33 LGA definitions
│           ├── roles.ts            # 7 user roles
│           └── fraud-heuristics.ts # ADR-003: Heuristic definitions
│
├── scripts/                        # Build and deployment scripts
│   ├── seed-database.ts
│   ├── generate-types.ts
│   ├── backup-to-s3.sh
│   └── migrate-database.ts
│
├── docs/                           # Project documentation
│   ├── architecture.md             # This document!
│   ├── api-reference.md            # OpenAPI/Swagger docs
│   ├── deployment.md
│   ├── development.md
│   └── fraud-detection.md          # ADR-003: Heuristic documentation
│
└── tests/                          # E2E and integration tests
    ├── e2e/                        # Playwright E2E tests
    │   ├── auth.spec.ts
    │   ├── enumerator-flow.spec.ts
    │   ├── fraud-detection.spec.ts
    │   ├── marketplace.spec.ts
    │   └── fixtures/
    │       └── test-data.ts
    │
    └── integration/                # Cross-service integration tests
        ├── submission-pipeline.test.ts  # Test submission → ingestion → dashboard flow
        ├── fraud-pipeline.test.ts   # Test ingestion → fraud → dashboard
        └── marketplace-sync.test.ts # Test respondent → marketplace flow
```

### Architectural Boundaries

**API Boundaries:**

1. **External Public API** (`/api/v1/marketplace/*`)
   - Fully public, rate-limited (30 req/min per IP)
   - Read-only database replica (ADR-007)
   - Progressive CAPTCHA challenges (ADR-006)
   - No authentication required

2. **Internal Authenticated API** (`/api/v1/*`)
   - JWT authentication required (Decision 2.1)
   - Role-based authorization (7 roles: Super Admin, Enumerator, Supervisor, etc.)
   - Rate-limited (100 req/min per user)
   - Access to app_db

3. **Submission API** (`/api/v1/submissions`)
   - Receives form submissions from native form renderer (online and offline sync)
   - JWT authentication required
   - BullMQ job queue for async processing (idempotent by submission UUID)
   - Handles both online submissions and offline queue sync

**Component Boundaries:**

1. **Frontend Feature Isolation**
   - Each feature (`auth/`, `enumerator-dashboard/`, etc.) is self-contained
   - Communication via TanStack Query (Pattern Category 5)
   - Shared state via Zustand (UI state only, not server data)
   - No direct feature-to-feature imports (use shared `components/` or `hooks/`)

2. **Backend Service Layer**
   - Services (`services/*.service.ts`) contain all business logic
   - Routes (`routes/v1/*.routes.ts`) are thin controllers (validation + service calls)
   - Services never import routes or middleware directly
   - Services communicate via function calls (synchronous) or BullMQ jobs (asynchronous)

3. ~~**ODK Integration Abstraction** (ADR-002)~~ **REMOVED (SCP-2026-02-05-001)**
   - Form management is now a native service within the Custom App

**Service Boundaries:**

1. **Fraud Detection Pipeline**
   - **Trigger:** BullMQ job `fraud-detection` fired after submission ingestion
   - **Input:** Submission ID from app_db
   - **Processing:** `fraud-detection.service.ts` runs all heuristics (ADR-003)
   - **Output:** Fraud score + flagged heuristics written to `fraud_detections` table
   - **Notification:** If score > threshold, add to Verification Assessor queue

2. **Submission Ingestion Pipeline**
   - **Entry:** `/api/v1/submissions` receives POST from native form renderer
   - **Queue:** BullMQ job `submission-ingestion` (idempotent by submission UUID)
   - **Processing:** Validate JSONB response against form schema, insert into app_db (idempotent)
   - **Downstream:** Trigger `fraud-detection` job, update dashboard stats cache

3. **Marketplace Sync**
   - **Trigger:** After respondent created/updated in app_db
   - **Processing:** If consent given, create/update anonymous profile in `marketplace_profiles` table
   - **Read:** Marketplace API queries read-only replica (ADR-007)
   - **Privacy:** No NIN, address, or contact info in marketplace profiles

**Data Boundaries:**

1. **Single Database** (ADR-007 amended)
   - **app_db:** Source of truth for ALL data (users, form definitions, submissions, fraud, marketplace)
   - **Full referential integrity** via foreign keys across all tables
   - **Marketplace isolation:** Read-only replica for public queries

2. **Data Access Patterns**
   - **Drizzle ORM:** All queries go through `apps/api/src/db/schema/*`
   - **Connection pooling:** Max 20 connections per database
   - **Replica usage:** Marketplace queries use `db/replica.ts` (read-only)
   - **Transactions:** ACID transactions for multi-step operations (ADR-010)

3. **Caching Boundaries**
   - **Redis cache:** Fraud thresholds, rate limit counters, JWT blacklist
   - **TanStack Query cache:** Frontend API response caching (stale-while-revalidate)
   - **No shared cache between users** (user-specific data not cached globally)

### Requirements to Structure Mapping

**Functional Requirements → Frontend Features:**

| FR Category | Frontend Feature | Key Components |
|-------------|------------------|----------------|
| FR1-FR5: Consent & Privacy | `native-forms/` | FormRenderer, DraftManager |
| FR6-FR8: User Management | `auth/` | LoginForm, OnboardingWizard, ProfileCompletion |
| FR9-FR11: Data Collection | `enumerator-dashboard/` | Dashboard, SubmissionList, OfflineIndicator, UploadNowButton |
| FR12-FR13: Supervisor Oversight | `supervisor-dashboard/` | EnumeratorPerformance, FraudAlerts, RealTimeMap |
| FR14: Fraud Review | `fraud-review/` | FraudQueue, SubmissionDetail, FraudHeuristicBreakdown |
| FR16: Super Admin | `admin/` | SystemHealth, UserManagement, BulkImport, FraudThresholds |
| FR17-FR20: Marketplace | `marketplace/` | PublicSearch, SkillsFilter, AnonymousProfile, ContactForm |
| FR21: Paper Digitization | `data-entry/` | BulkEntryForm, KeyboardShortcutsHelper |

**Functional Requirements → Backend Services:**

| FR Category | Backend Service | Key Functions |
|-------------|-----------------|---------------|
| FR6-FR8: User Management | `user.service.ts`, `auth.service.ts` | Bulk CSV import, NIN validation, LGA-locking |
| FR9-FR11: Data Collection | `submission.service.ts`, `native-form.service.ts` | Native form rendering, IndexedDB sync, idempotent insert, submission retrieval |
| FR12-FR16: Oversight & Quality | `fraud-detection.service.ts`, `dashboard.service.ts`, `audit.service.ts` | Fraud heuristics, supervisor stats, verification queue, immutable audit logs |
| FR17-FR21: Marketplace | `marketplace.service.ts` | Anonymous profile creation, searcher contact logging, profile edit tokens |

**Architectural Decisions → Structure Mapping:**

| ADR | Location | Implementation |
|-----|----------|----------------|
| ADR-001: Custom Modular Monolith | `docker/docker-compose.yml` | Single VPS with Custom App + PostgreSQL + Redis containers |
| ~~ADR-002: ODK Abstraction~~ | ~~`services/odk-integration/`~~ | SUPERSEDED (SCP-2026-02-05-001) — form management is native |
| ADR-003: Fraud Detection | `apps/api/src/services/fraud-detection.service.ts`, `apps/api/src/jobs/workers/fraud-detection.worker.ts` | Pluggable heuristics + DB-backed thresholds |
| ADR-004: Offline Data | `apps/web/src/features/native-forms/`, `apps/web/public/service-worker.js` | Browser IndexedDB + PWA service worker |
| ADR-006: Defense-in-Depth | `apps/api/src/middleware/rate-limit.ts`, `apps/web/src/features/marketplace/components/CaptchaChallenge.tsx` | Layered security (rate limit + CAPTCHA + replica) |
| ADR-007: Single Database | `apps/api/src/db/`, `apps/api/src/db/replica.ts` | Single PostgreSQL with read-only replica for marketplace |
| ADR-008: Emergency Sync | `apps/web/src/features/enumerator-dashboard/components/UploadNowButton.tsx` | Explicit upload button with progress feedback |
| ~~ADR-009: Webhook Health~~ | ~~`apps/api/src/jobs/workers/webhook-health-check.worker.ts`~~ | SUPERSEDED (SCP-2026-02-05-001) — native submission pipeline |
| ADR-010: PostgreSQL | `apps/api/src/db/schema/*.ts` | Drizzle ORM with UNIQUE constraints + ACID transactions |
| ADR-011: Infrastructure | `docker/docker-compose.yml`, `scripts/backup-to-s3.sh` | Hetzner CX43 deployment, S3 backups |

### Integration Points

**Internal Communication:**

1. **Frontend ↔ Backend API**
   - Protocol: REST over HTTPS
   - Format: JSON with camelCase (API Response Pattern from Category 4)
   - Auth: JWT Bearer token in Authorization header
   - State: TanStack Query for server state, Zustand for UI state

2. **Backend Service ↔ Database**
   - Protocol: PostgreSQL wire protocol
   - ORM: Drizzle with TypeScript type safety
   - Transactions: ACID guarantees for multi-step operations
   - Pooling: Max 20 connections per database

3. **Backend Service ↔ Redis**
   - Protocol: Redis protocol via ioredis
   - Use cases: JWT blacklist, rate limiting, fraud threshold cache, BullMQ queue
   - Keys: Namespaced (Pattern Category 5: `fraud:thresholds:gps_cluster`)

4. **Backend ↔ BullMQ Workers**
   - Protocol: Redis-backed job queue
   - Job names: Kebab-case (Pattern Category 5: `submission-ingestion`)
   - Retry: Exponential backoff (5 attempts: 5s, 10s, 20s, 40s, 80s)
   - Concurrency: 4 workers for fraud detection

**External Integrations:**

1. ~~**Custom App ↔ ODK Central**~~ **REMOVED (SCP-2026-02-05-001)** — Form management is now native. No external integration needed for data collection.

2. **Custom App ↔ AWS S3 (Hetzner Object Storage)**
   - **Daily Backups:** Automated pg_dump uploads (NFR3)
   - **Media Sync:** Staff photos uploaded during onboarding
   - **Retention:** 7-year retention for NDPA compliance
   - **Recovery:** Monthly restore drills validate backups

3. **Custom App ↔ AWS SES**
   - **Notifications:** Email for critical errors, fraud alerts, password resets
   - **Cost Control:** Circuit breaker at $50/day
   - **Templates:** Plain text emails (no HTML for government simplicity)

**Data Flow:**

1. **Submission Collection Flow:**
   ```
   Enumerator → Native Form Renderer (Browser) → IndexedDB (Draft)
      ↓ (Online sync / background queue)
   Custom App API (`/api/v1/submissions`) → BullMQ (`submission-ingestion`)
      ↓
   Ingestion Worker → app_db (respondents, submissions)
      ↓ (Trigger)
   BullMQ (`fraud-detection`) → Fraud Engine
      ↓
   app_db (fraud_detections) → Verification Assessor Queue
   ```

2. **Marketplace Sync Flow:**
   ```
   Respondent Created (app_db) → Consent Check
      ↓ (If consent given)
   marketplace.service.ts → Create Anonymous Profile
      ↓
   app_db (marketplace_profiles) → Read-Only Replica
      ↓
   Public Marketplace API → React Frontend
   ```

3. **Dashboard Stats Flow:**
   ```
   Submission Inserted (app_db) → Trigger Stats Update
      ↓
   dashboard.service.ts → Aggregate Queries (Drizzle)
      ↓
   Redis Cache (15-minute TTL) → Supervisor Dashboard API
      ↓
   TanStack Query (Frontend) → React Components
   ```

### File Organization Patterns

**Configuration Files:**

- **Root configs:** `package.json`, `pnpm-workspace.yaml`, `.nvmrc` at monorepo root
- **App-specific configs:** `vite.config.ts` in `apps/web/`, `nodemon.json` in `apps/api/`
- **Environment vars:** `.env.example` committed, `.env` / `.env.local` gitignored
- **TypeScript:** Shared `tsconfig.base.json` at root, extended by workspace configs
- **Docker:** All container configs in `docker/` directory

**Source Organization:**

- **Frontend:** Feature-based (`features/auth/`, `features/marketplace/`), NOT page-based
- **Backend:** Layered architecture (`routes/` → `services/` → `db/`)
- **Shared code:** Monorepo packages (`packages/types/`, `packages/utils/`, `packages/config/`)
- **Native forms:** Form management services within `apps/api/src/services/` (no separate package)

**Test Organization:**

- **Frontend tests:** Co-located with components (`LoginForm.test.tsx` next to `LoginForm.tsx`)
- **Backend tests:** Separate `__tests__/` folders (`services/__tests__/auth.service.test.ts`)
- **E2E tests:** Top-level `tests/e2e/` directory (Playwright)
- **Integration tests:** Top-level `tests/integration/` (cross-service tests)

**Asset Organization:**

- **Static assets:** `apps/web/public/assets/` (logos, images)
- **PWA assets:** `apps/web/public/manifest.json`, `service-worker.js`
- **Staff photos:** Uploaded to S3, served via CDN (not committed to repo)
- **Documentation:** `docs/` at monorepo root (architecture, API reference)

### Development Workflow Integration

**Development Server Structure:**

```bash
# Terminal 1: Start API server with hot reload
cd apps/api
pnpm dev  # nodemon + tsx for TypeScript hot reload

# Terminal 2: Start frontend dev server
cd apps/web
pnpm dev  # Vite dev server with HMR on http://localhost:5173

# Terminal 3: Start BullMQ workers (optional for local testing)
cd apps/api
pnpm workers:dev  # Run fraud detection + webhook workers

# Terminal 4: Start Redis + PostgreSQL (Docker)
docker compose -f docker/docker-compose.dev.yml up
```

**Build Process Structure:**

```bash
# Build all workspaces in dependency order
pnpm build

# Build steps:
# 1. packages/types → Shared types compiled
# 2. packages/utils → Shared utilities compiled
# 3. packages/config → Shared config compiled
# 4. apps/api → Express API compiled to dist/
# 5. apps/web → Vite builds React to dist/ (HTML, CSS, JS)
```

**Deployment Structure:**

```bash
# Production deployment to Hetzner CX43
docker compose -f docker/docker-compose.yml up -d

# Containers:
# - oslsr-web (Nginx serving React build)
# - oslsr-api (Node.js Express API)
# - postgres (app_db)
# - redis (Cache + BullMQ)

# Automated backups via cron:
# - Daily pg_dump → S3 (apps/api/scripts/backup-to-s3.sh)
# - 6-hour VPS snapshots (Hetzner Cloud)
```

**Docker Compose Service Map:**

| Service | Port | Purpose | Data Volume |
|---------|------|---------|-------------|
| oslsr-web | 80, 443 | Nginx + React build | None (stateless) |
| oslsr-api | 3000 | Express API + BullMQ workers | Logs: `/var/log/oslsr/` |
| postgres | 5432 | Application database (app_db) | `/var/lib/postgresql/data` |
| redis | 6379 | Cache + Queue | `/data` |

**Monorepo Workspace Dependencies:**

```
apps/web
  └── depends on: packages/types, packages/utils

apps/api
  └── depends on: packages/types, packages/utils, packages/config

packages/utils
  └── depends on: packages/types

packages/config
  └── depends on: packages/types
```

**Affects:** All implementation stories, project initialization (Story 1.1), deployment automation, developer onboarding

---

## Architecture Validation Results

_This section provides comprehensive validation of the complete architecture for coherence, completeness, and implementation readiness._

### Validation Summary ✅

**Overall Status:** **READY FOR IMPLEMENTATION**

**PRD Version:** **v8.0** (Updated 2026-02-06)

**Confidence Level:** **HIGH (98%)**

**Validation Completed:** 2026-01-04

**PRD v7.5 Updates Incorporated:**
- ✅ **Data Routing Matrix**: Comprehensive explanation of single-database data ownership (what data goes where, data flow rules). _(Amended: ODK Central removed per SCP-2026-02-05-001)_
- ✅ **Live Selfie Technical Specification**: Dual-purpose photo implementation (identity verification + ID card portrait) with liveness detection, auto-crop, and security measures
- ✅ **Terminology Correction**: "Air-Gapped" → "Logically Isolated Read Replica" with accurate technical explanation
- ✅ **Marketplace Security Architecture**: 3-route model with authentication boundaries, rate limiting, and bot protection strategies

### Coherence Validation ✅

**Decision Compatibility:**

All technology choices work together without conflicts:

- ✅ React 18.3 + Vite 6.x, TanStack Query 5.x, React Router 7
- ✅ Node.js 20 LTS + Express + ES modules
- ✅ PostgreSQL 15 + Drizzle ORM 1.x + UUIDv7
- ✅ Redis 7 + BullMQ + ioredis
- ✅ Tailwind CSS v4 + shadcn/ui + Radix UI

**Pattern-Decision Alignment:** ✅ All 7 pattern categories support architectural decisions

**Structure-Architecture Alignment:** ✅ All 11 ADRs mapped to specific locations in project structure

### Requirements Coverage ✅

**Functional Requirements:** 21/21 FRs architecturally supported (100%)

**Non-Functional Requirements:** 23+/23+ NFRs architecturally supported (100%)

**Key Validations:**
- ✅ FR1-FR5 (Consent) → Native form renderer + NIN UNIQUE constraints
- ✅ FR6-FR8 (User Management) → Bulk CSV + LGA-locking
- ✅ FR9-FR11 (Data Collection) → Offline PWA + native form renderer + IndexedDB sync + emergency upload
- ✅ FR12-FR16 (Oversight) → Fraud detection + dashboards + audit logs
- ✅ FR17-FR21 (Marketplace) → Anonymous profiles + read replica + bot protection
- ✅ NFR1 (Performance 250ms p95) → 73x headroom validated
- ✅ NFR3 (99.5% SLA) → Honest degraded mode + 6-hour snapshots
- ✅ NFR4 (NDPA) → 7-year retention + immutable audit logs

### Implementation Readiness ✅

**Decision Completeness:** ✅ 17 decisions + 11 ADRs with versions specified

**Structure Completeness:** ✅ 230+ files/directories explicitly defined

**Pattern Completeness:** ✅ 7 categories + 10 critical conflict prevention rules + 15+ code examples

**AI Agent Readiness:** ✅ All potential conflicts addressed (ID strategy, naming, logging, errors, loading states)

### Gap Analysis Results

**Critical Gaps:** ✅ **ZERO**

**Important Gaps Resolved:**
- ✅ React 19 CVEs → Locked to React 18.3
- ✅ Storage overestimation → Corrected to 62GB (from 460GB)
- ✅ Timeline confusion → 1M records over 12 months (not 1 month)
- ✅ MongoDB vs PostgreSQL → ADR-010 confirmed PostgreSQL 15
- ✅ Infrastructure sizing → Hetzner CX43 validated ($168/year, 73x headroom)

**Post-MVP Enhancements (Not Blocking):**
- Self-hosted Sentry (if error volume >100/day)
- Full Grafana dashboards (if monitoring needs increase)
- Table partitioning (after 1M records)
- Multi-region HA (after Year 2)

### Architecture Strengths

1. **Comprehensive ADRs:** 11 ADRs with rationales, trade-offs, alternatives rejected
2. **UUIDv7 Strategy:** Time-ordered IDs solve offline + performance + privacy simultaneously
3. **FR Mapping:** Every feature/service mapped to specific functional requirements
4. **Defense-in-Depth:** 4 independent security layers
5. **Cost Optimization:** 86% savings ($168 vs $1,212/year) with performance validated
6. **Offline-First:** 7-day capability with emergency sync control
7. **MERN Transition Support:** Comprehensive explanations for user's background
8. **React 18.3 Stability:** Proactive CVE avoidance
9. **Fraud Detection Flexibility:** Runtime tuning without deployment
10. **Honest Engineering:** Realistic expectations (ADR-005 degraded mode)

### Implementation Handoff

**AI Agent Guidelines:**

1. **Follow decisions exactly:** React 18.3, UUIDv7, PostgreSQL 15, Drizzle ORM
2. **Apply patterns consistently:** snake_case DB, camelCase API, Pino logging, AppError class, skeleton screens
3. **Respect boundaries:** Frontend features self-contained, form management via native services only
4. **Refer to this document:** ADRs provide rationale, patterns prevent conflicts

**First Implementation Priority:**

```bash
# Story 1.1: Project Initialization
# 1. Create monorepo with pnpm workspaces
# 2. Initialize React 18.3 + Vite + Tailwind + shadcn/ui
# 3. Initialize Node.js 20 + Express + TypeScript
# 4. Create packages/{types,utils,config}
# See "Starter Template Evaluation" section for complete commands
```

**Quality Gates Passed:**
- ✅ All architectural decisions validated
- ✅ All patterns defined with examples
- ✅ All requirements mapped to structure
- ✅ No critical gaps remaining
- ✅ User corrections integrated

---

**ARCHITECTURE DOCUMENT STATUS:** ✅ **COMPLETE - READY FOR IMPLEMENTATION**

**Next Phase:** Epics & Stories Creation (BMM Phase 4: Implementation Planning)

**Handoff Date:** 2026-01-03

**Architect:** Awwal (with Claude Code facilitation)
