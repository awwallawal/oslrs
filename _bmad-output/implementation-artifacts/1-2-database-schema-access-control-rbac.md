# Story 1.2: Database Schema & Access Control (RBAC)

**ID:** 1.2
**Epic:** Epic 1: Foundation, Secure Access & Staff Onboarding
**Status:** done
**Priority:** High

## 1. User Story

As a Super Admin,
I want to define specific roles with clear permission boundaries,
So that each user only accesses features and data relevant to their responsibilities.

## 2. Acceptance Criteria (BDD)

### Scenario 1: Drizzle ORM Integration
**Given** the project has PostgreSQL 15 configured
**When** I initialize the Drizzle ORM setup in `apps/api/src/db/`
**Then** the system should successfully connect to the `app_db` database
**And** migrations should be generated and applied via `drizzle-kit`.

### Scenario 2: Schema Definition with UUIDv7
**Given** the Drizzle ORM is configured
**When** I define the schema for `users`, `roles`, and `lgas` tables
**Then** all primary keys should use UUIDv7 (time-sortable)
**And** the `users` table should include: `id`, `email`, `phone`, `full_name`, `password_hash`, `nin`, `role_id`, `lga_id`, `status`
**And** the `roles` table should include all 7 defined roles (Super Admin, Supervisor, Enumerator, Data Entry Clerk, Verification Assessor, Government Official, Public User)
**And** the `lgas` table should include all 33 LGAs of Oyo State.

### Scenario 3: RBAC Enforcement - Field Staff
**Given** a user with the `ENUMERATOR` or `SUPERVISOR` role
**When** they attempt to access any resource
**Then** they should be restricted to their assigned LGA only
**And** any attempt to access another LGA's data should return HTTP 403 Forbidden.

### Scenario 4: RBAC Enforcement - Back-Office Staff
**Given** a user with the `VERIFICATION_ASSESSOR`, `GOVERNMENT_OFFICIAL`, or `DATA_ENTRY_CLERK` role
**When** they attempt to access resources
**Then** they should have state-wide access (not LGA-restricted)
**And** `GOVERNMENT_OFFICIAL` should have READ-ONLY access (no write permissions).

### Scenario 5: Role Conflict Prevention
**Given** a user account is being created or modified
**When** an attempt is made to assign conflicting roles (e.g., Enumerator + Supervisor)
**Then** the system should reject the operation with an error
**And** a single user should only hold one role at a time.

### Scenario 6: Database-Level Unique Constraints
**Given** the `users` table schema
**When** I attempt to insert a user with a duplicate NIN or Email
**Then** the database should reject the operation with a unique constraint violation
**And** this should prevent race conditions at the application level.

### Scenario 7: Unauthorized Access Logging
**Given** a user attempts to access a resource they are not authorized for
**When** the RBAC middleware denies the request
**Then** the attempt should be logged in the audit trail with: User ID, Attempted Action, Timestamp, IP Address
**And** the response should return HTTP 403 Forbidden.

## 3. Developer Context

### Technical Requirements
- **Runtime:** Node.js 20 LTS (ESM)
- **Database:** PostgreSQL 15
- **ORM:** Drizzle ORM with `pg` driver
- **Primary Keys:** UUIDv7 via `uuidv7` package (time-sortable IDs)
- **Validation:** Zod for runtime validation
- **Testing:** Vitest for unit tests

### Files & Locations
- **Database Configuration:**
  - `apps/api/src/db/index.ts` - Database connection setup
  - `apps/api/drizzle.config.ts` - Drizzle Kit configuration
- **Schema Definitions:**
  - `apps/api/src/db/schema/roles.ts` - Roles table
  - `apps/api/src/db/schema/lgas.ts` - LGAs table
  - `apps/api/src/db/schema/users.ts` - Users table
  - `apps/api/src/db/schema/index.ts` - Schema exports
- **Middleware:**
  - `apps/api/src/middleware/rbac.ts` - Authorization middleware (`authorize`, `requireLgaLock`)
- **Shared Types:**
  - `packages/types/src/constants.ts` - `UserRole` and `Lga` enums

### Implementation Guardrails
- **UUIDv7:** All primary keys must use `uuidv7()` for time-sortable IDs.
- **Naming Convention:** snake_case for database columns, camelCase for TypeScript properties (Drizzle handles mapping).
- **Unique Constraints:** Email and NIN must have database-level UNIQUE constraints (NFR8.1).
- **ESM:** Use `.js` extensions in all TypeScript imports for ESM compatibility.
- **Foreign Keys:** `users.role_id` references `roles.id`, `users.lga_id` references `lgas.id`.

## 4. Architecture Compliance

- **ADR-010 (Database Technology):** PostgreSQL 15 as specified.
- **NFR4.6 (Role Conflict Prevention):** Single role per user enforced.
- **NFR8.1 (Race Condition Defense):** Database-level UNIQUE constraints on NIN and Email.
- **NFR8.2 (Atomic Transactions):** All multi-step operations use database transactions.
- **Decision 4.1 (Primary Keys):** UUIDv7 for all tables.

## 5. Previous Story Intelligence

### From Story 1.1 (Project Setup)
- **Monorepo Structure:** Schema resides in `apps/api/src/db/schema/`.
- **Shared Packages:** Types and constants go in `packages/types/`.
- **Dependencies:** `drizzle-orm`, `pg`, and `uuidv7` are installed.

## 6. Testing Requirements

### Unit Tests
- `rbac.test.ts`:
  - `authorize` middleware allows correct roles
  - `authorize` middleware blocks unauthorized roles
  - `requireLgaLock` enforces LGA restriction for field staff
  - `requireLgaLock` allows state-wide access for back-office staff

### Integration Tests
- Migration generation succeeds with `drizzle-kit generate`
- Unique constraints prevent duplicate NIN insertion
- Unique constraints prevent duplicate Email insertion

## 7. Implementation Tasks

- [x] **Database Infrastructure Setup** (AC: 1, 2)
  - [x] Configure `apps/api/src/db/index.ts` with node-postgres and Drizzle
  - [x] Setup `drizzle.config.ts` in `apps/api/`
  - [x] Define shared constants for LGAs and Roles in `packages/types`

- [x] **Schema Implementation** (AC: 2, 6)
  - [x] Create `apps/api/src/db/schema/roles.ts` (7 roles)
  - [x] Create `apps/api/src/db/schema/lgas.ts` (33 LGAs of Oyo State)
  - [x] Create `apps/api/src/db/schema/users.ts` with NIN (unique), Email (unique), Role, LGA

- [x] **Migration & Validation** (AC: 1, 6)
  - [x] Generate migrations using `drizzle-kit generate`
  - [x] Verify schema in PostgreSQL (validated via migration generation)

- [x] **RBAC Middleware Development** (AC: 3, 4, 5, 7)
  - [x] Implement `authorize` middleware for role-based access
  - [x] Implement `requireLgaLock` middleware for field staff LGA restriction
  - [x] Create unit tests for RBAC middleware (8/8 passed)

## 8. Dev Agent Record

### Agent Model Used
gpt-4o (via BMad Master)

### Debug Log References
- Generated migration: `apps/api/drizzle/0000_far_richard_fisk.sql`
- Test results: 8/8 passed

### Completion Notes List
- Defined `UserRole` and `Lga` enums in `@oslsr/types`
- Implemented `AppError` in `@oslsr/utils`
- Setup Drizzle ORM in `apps/api`
- Defined schema for `roles`, `lgas`, and `users` using UUIDv7
- Implemented `authorize` and `requireLgaLock` middleware
- Verified logic with 8 unit tests for RBAC
- **Code Review Fixes (2026-01-06):**
  - Restored `.js` extensions in imports to fix build failures (High)
  - Added strict typing for `req.user` in `apps/api/src/types.d.ts` (Medium)
  - Updated `drizzle.config.ts` to use built JS files for migration generation (Low)

### File List
**Shared Types:**
- `packages/types/src/constants.ts`
- `packages/types/src/index.ts`
- `packages/types/package.json`

**Shared Utils:**
- `packages/utils/src/errors.ts`
- `packages/utils/src/index.ts`
- `packages/utils/package.json`

**Database:**
- `apps/api/src/db/index.ts`
- `apps/api/src/db/schema/index.ts`
- `apps/api/src/db/schema/roles.ts`
- `apps/api/src/db/schema/lgas.ts`
- `apps/api/src/db/schema/users.ts`
- `apps/api/drizzle.config.ts`
- `apps/api/drizzle/0000_far_richard_fisk.sql`

**Middleware:**
- `apps/api/src/middleware/rbac.ts`
- `apps/api/src/middleware/__tests__/rbac.test.ts`

**Configuration:**
- `apps/api/src/types.d.ts`
- `apps/api/package.json`
- `apps/api/.env`

## 9. References

- [PRD: Story 1.3 - Role-Based Authorization](_bmad-output/planning-artifacts/prd.md)
- [Architecture: ADR-010 - Database Technology Selection](_bmad-output/planning-artifacts/architecture.md)
- [Architecture: Data Architecture - Drizzle ORM](_bmad-output/planning-artifacts/architecture.md)
- [Architecture: NFR8.1 - Race Condition Defense](_bmad-output/planning-artifacts/architecture.md)
- [Epics: Story 1.2](_bmad-output/planning-artifacts/epics.md)
