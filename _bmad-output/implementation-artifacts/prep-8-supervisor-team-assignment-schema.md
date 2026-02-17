# Story prep-8: Supervisor Team Assignment Schema

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Developer,
I want an explicit supervisor-enumerator team assignment schema in the database,
so that Story 4.1 can query team rosters by direct assignment rather than relying solely on LGA co-location.

## Acceptance Criteria

**AC1 - Team Assignments Table**
**Given** the existing Drizzle schema
**When** the migration runs
**Then** a `team_assignments` table exists with:
- `id` (UUID v7 PK)
- `supervisor_id` (UUID FK → users.id, NOT NULL)
- `enumerator_id` (UUID FK → users.id, NOT NULL)
- `lga_id` (UUID FK → lgas.id, NOT NULL — denormalized for query performance)
- `assigned_at` (TIMESTAMPTZ, default now)
- `unassigned_at` (TIMESTAMPTZ, nullable — NULL means active)
- `is_seeded` (BOOLEAN, default false, NOT NULL — consistent with project ADR-017 pattern)
- `created_at`, `updated_at` (TIMESTAMPTZ, default now)

**AC2 - Indexes & Constraints**
**Given** the table is created
**Then** indexes exist on: `supervisor_id`, `enumerator_id`, `lga_id`
**And** a partial unique index on `enumerator_id WHERE unassigned_at IS NULL` prevents double-assignment of active enumerators while preserving reassignment history.

**AC3 - Drizzle Relations**
**Given** the Drizzle relations file
**When** the schema changes are applied
**Then** `teamAssignmentsRelations` has:
- `one` relation to `users` as `supervisor` (supervisorId → users.id, `relationName: 'supervisorAssignments'`)
- `one` relation to `users` as `enumerator` (enumeratorId → users.id, `relationName: 'enumeratorAssignments'`)
- `one` relation to `lgas` (lgaId → lgas.id)
**And** `usersRelations` includes `many` teamAssignments with matching `relationName` on both sides:
- `supervisedTeamMembers: many(teamAssignments, { relationName: 'supervisorAssignments' })`
- `enumeratorAssignments: many(teamAssignments, { relationName: 'enumeratorAssignments' })`
> **Critical:** Both `supervisorId` and `enumeratorId` reference `users.id`. Without `relationName` on both sides, Drizzle throws an ambiguous relation error at runtime. No existing schema has this pattern — this is the first dual-FK to the same table.

**AC4 - Assignment Resolution Service**
**Given** a supervisor user record
**When** the assignment resolution service is called
**Then** it returns enumerator IDs from `team_assignments` WHERE `supervisor_id = ?` AND `unassigned_at IS NULL`
**And** if no assignment records exist, it falls back to LGA-scoped query (users with the enumerator role sharing the supervisor's `lga_id`)
**And** the fallback path logs a warning: `event: 'team.assignment.lga_fallback'`.

**AC5 - Role Validation Guards**
**Given** an assignment creation request
**When** `supervisor_id` is not a user with the supervisor role OR `enumerator_id` is not a user with the enumerator role
**Then** an AppError is thrown (400, `INVALID_ROLE_ASSIGNMENT`).

**AC6 - Dev Seed Data**
**Given** `pnpm db:seed:dev` runs
**When** seed data includes test supervisor and enumerator accounts
**Then** the test supervisor is assigned to the test enumerator(s) in the `team_assignments` table
**And** seed records have `is_seeded = true` (removable via `db:seed:clean`, consistent with ADR-017 pattern used across all seeded tables).

**AC7 - Tests**
**Given** implementation is complete
**When** test suites run
**Then** schema migration applies cleanly (integration or manual verification)
**And** assignment resolution service tests cover: direct assignment lookup, LGA fallback, empty results, role validation
**And** no existing tests regress.

## Tasks / Subtasks

- [x] Task 1: Create Drizzle schema (AC: 1, 2)
  - [x] 1.1: Create `apps/api/src/db/schema/team-assignments.ts` with `teamAssignments` table definition, UUIDv7 PK, FKs, indexes, `is_seeded` column, and partial unique index on `enumerator_id WHERE unassigned_at IS NULL`
  - [x] 1.2: Export from `apps/api/src/db/schema/index.ts`
  - [x] 1.3: Add Drizzle relations in `apps/api/src/db/schema/relations.ts` — MUST use `relationName` on both sides of each user FK to avoid ambiguous relation error (e.g., `relationName: 'supervisorAssignments'` and `relationName: 'enumeratorAssignments'`). Add matching `many` entries to `usersRelations`. See AC3 for exact pattern.

- [x] Task 2: Create SQL migration (AC: 1, 2)
  - [x] 2.1: Generate migration via `drizzle-kit generate` (file will be `apps/api/drizzle/0005_<generated_suffix>.sql`) or write manually as `0005_create_team_assignments.sql`
  - [x] 2.2: Verify migration applies cleanly on fresh DB (`pnpm db:push` or `pnpm db:migrate`)

- [x] Task 3: Assignment resolution service (AC: 4, 5)
  - [x] 3.1: Create `apps/api/src/services/team-assignment.service.ts` with:
    - `getEnumeratorIdsForSupervisor(supervisorId: string): Promise<string[]>` — query `team_assignments` for active records, fall back to LGA-scoped if empty
    - `createAssignment(supervisorId, enumeratorId, lgaId): Promise<TeamAssignment>` — with role validation
    - `removeAssignment(assignmentId): Promise<void>` — set `unassigned_at = now()`
  - [x] 3.2: Use structured Pino logging for fallback path (`event: 'team.assignment.lga_fallback'`)
  - [x] 3.3: Validate roles before insert — supervisor must have `supervisor` role, enumerator must have `enumerator` role. Note: `users` has `roleId` (UUID FK → `roles.id`), NOT a text role field. Query must join `users` + `roles` (e.g., `db.query.users.findFirst({ where: eq(users.id, supervisorId), with: { role: true } })`) and check `user.role.name`.

- [x] Task 4: Dev seed data (AC: 6)
  - [x] 4.1: Update `apps/api/src/db/seeds/` — add 2 additional dev enumerator accounts (`enumerator2@dev.local`, `enumerator3@dev.local`) to `ibadan_north` LGA in `seedDevelopmentUsers()`, then create team assignment records linking all 3 enumerators to `supervisor@dev.local`. Architecture specifies 3 enumerators per supervisor per LGA — testing with only 1 won't exercise the roster properly.
  - [x] 4.2: Update `cleanSeededData()` in `apps/api/src/db/seeds/index.ts` — add `db.delete(teamAssignments).where(eq(teamAssignments.isSeeded, true))` BEFORE the existing `users` delete (line ~254). `team_assignments` has FKs to `users.id` with no cascade — deleting users first will fail with a FK constraint error.

- [x] Task 5: Tests (AC: 7)
  - [x] 5.1: Create `apps/api/src/services/__tests__/team-assignment.service.test.ts`
  - [x] 5.2: Test cases: direct assignment returns correct IDs, LGA fallback when no assignments (filters by enumerator role), empty results when no matches, role validation rejects invalid roles, removeAssignment soft-deletes, partial unique index prevents double-assignment of active enumerators, reassignment succeeds after prior assignment is soft-deleted
  - [x] 5.3: Run full suite (`pnpm test`) — zero regressions

### Review Follow-ups (AI) — Code Review 2026-02-17

- [x] [AI-Review][HIGH] H1: Add missing test cases for partial unique index (duplicate active assignment) and reassignment after soft-delete — Task 5.2 claimed complete but 2 scenarios were absent [team-assignment.service.test.ts]
- [x] [AI-Review][HIGH] H2: LGA fallback returns deactivated/suspended enumerators — add `inArray(users.status, ['active', 'verified'])` to fallback WHERE clause [team-assignment.service.ts:52-61]
- [x] [AI-Review][HIGH] H3: `createAssignment` doesn't handle duplicate active assignment gracefully — wrap insert in try/catch, convert PG 23505 to `AppError('ENUMERATOR_ALREADY_ASSIGNED', ..., 409)` [team-assignment.service.ts:109-117]
- [x] [AI-Review][MEDIUM] M1: Direct assignment path doesn't verify enumerator account is still active — add `with: { enumerator: true }` and filter by active/verified status [team-assignment.service.ts:28-37]
- [x] [AI-Review][MEDIUM] M2: Test mocks share functions across tables — separate into `mockTeamAssignmentsFindMany`, `mockUsersFindFirst`, `mockUsersFindMany` for query intent verification [team-assignment.service.test.ts:11-36]
- [x] [AI-Review][MEDIUM] M3: `removeAssignment` doesn't check if already soft-deleted — add `isNull(teamAssignments.unassignedAt)` to WHERE clause, update error message to "Active assignment not found" [team-assignment.service.ts:133-149]
- [x] [AI-Review][LOW] L1: Non-null assertion `supervisor.lgaId!` in seed — replace with explicit null check and early return [seeds/index.ts:267]
- [ ] [AI-Review][LOW] L2: `_bmad-output/planning-artifacts/epics.md` modified in git but not documented in story File List — likely from sprint planning, not this story. Verify and commit separately if needed.

## Dev Notes

### Story Foundation

- **Source:** Epic 3 Retrospective (`_bmad-output/implementation-artifacts/epic-3-retro-2026-02-14.md`) identified prep-8 as HIGH priority: "Verify/create DB schema for supervisor → enumerator team relationships (Story 4.1)."
- **Blocks:** Story 4.1 (Supervisor Team Dashboard) — Task 1.1 explicitly says: "Confirm whether dedicated supervisor-enumerator assignment schema exists; if absent, add schema and migration."
- **Architecture:** Staffing model is 1 Supervisor + 3 Enumerators per LGA (33 LGAs, 132 total field staff).

### Current State

- **No `team_assignments` table exists.** All supervisor queries currently use LGA-based filtering (`users WHERE role='enumerator' AND lga_id = supervisor.lgaId`).
- Supervisor controller (`apps/api/src/controllers/supervisor.controller.ts`) has two endpoints:
  - `GET /api/v1/supervisor/team-overview` — counts enumerators by status in supervisor's LGA
  - `GET /api/v1/supervisor/pending-alerts` — counts unprocessed/failed submissions in supervisor's LGA
- Frontend `SupervisorTeamPage.tsx` is placeholder: "No enumerators assigned yet."

### Schema Design Decisions

- **Partial unique index on `enumerator_id`:** One enumerator can have only one *active* supervisor. Implemented as `UNIQUE WHERE unassigned_at IS NULL` so that reassignment history is preserved (soft-deleted rows don't block new assignments). Architecture says 3 enumerators per supervisor — this is enforced by assignment logic, not schema (a supervisor CAN have more than 3 in edge cases).
- **Denormalized `lga_id`:** Both supervisor and enumerator already have `lga_id` on `users`. The denormalized column on `team_assignments` avoids a join when querying assignments by geography and serves as a consistency check.
- **Soft delete via `unassigned_at`:** Supports audit trail. Active assignments have `unassigned_at IS NULL`.
- **Drizzle relations use `many` on both sides of the user relation.** The partial unique index only constrains *active* records. An enumerator with reassignment history will have multiple rows. Using Drizzle `one` would silently drop history. To get the single active assignment, use a `WHERE unassigned_at IS NULL` filter in queries, not the relation definition.
- **LGA fallback:** The resolution service falls back to LGA co-location when no explicit assignments exist. This ensures backward compatibility with existing supervisor endpoints and allows gradual adoption.

### Existing Schema Patterns to Follow

```typescript
// UUIDv7 PK pattern (from users.ts, submissions.ts, etc.)
id: uuid('id').primaryKey().$defaultFn(() => uuidv7())

// FK pattern
supervisorId: uuid('supervisor_id').notNull().references(() => users.id)

// Timestamp pattern
createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()

// Index pattern (from submissions.ts)
supervisorIdIdx: index('idx_team_assignments_supervisor_id').on(table.supervisorId)

// Partial unique index pattern (active-only constraint)
activeEnumeratorIdx: uniqueIndex('idx_team_assignments_active_enumerator')
  .on(table.enumeratorId)
  .where(sql`unassigned_at IS NULL`)

// Seed flag pattern (from users.ts, ADR-017)
isSeeded: boolean('is_seeded').default(false).notNull()

// Dual-FK relationName pattern (NEW — no existing precedent in codebase)
// teamAssignments side:
export const teamAssignmentsRelations = relations(teamAssignments, ({ one }) => ({
  supervisor: one(users, {
    fields: [teamAssignments.supervisorId],
    references: [users.id],
    relationName: 'supervisorAssignments',
  }),
  enumerator: one(users, {
    fields: [teamAssignments.enumeratorId],
    references: [users.id],
    relationName: 'enumeratorAssignments',
  }),
  lga: one(lgas, {
    fields: [teamAssignments.lgaId],
    references: [lgas.id],
  }),
}));
// users side (add to existing usersRelations):
supervisedTeamMembers: many(teamAssignments, { relationName: 'supervisorAssignments' }),
enumeratorAssignments: many(teamAssignments, { relationName: 'enumeratorAssignments' }),
```

- **ESM imports:** All relative imports in `apps/api/src/` MUST use `.js` extension (e.g., `import { users } from './users.js'`)
- **Naming:** Table name `team_assignments` (plural snake_case), columns snake_case, TypeScript fields camelCase
- **Migration numbering:** Next is `0005` (after existing 0000-0004)

### Do NOT

- Do NOT modify existing supervisor controller endpoints — they continue to work with LGA-based filtering. Story 4.1 will integrate the assignment resolution service.
- Do NOT add API endpoints for assignment CRUD in this story — admin assignment management UI is out of scope. Assignments are created programmatically (seed + future admin story).
- Do NOT use `serial()` or `integer()` for IDs — UUIDv7 only.
- Do NOT use `import { v4 } from 'uuid'` — use `import { uuidv7 } from 'uuidv7'`.

### Suggested File Touch Points

**Create:**
- `apps/api/src/db/schema/team-assignments.ts`
- `apps/api/drizzle/0005_<generated_or_manual>.sql` (name varies if using `drizzle-kit generate`)
- `apps/api/src/services/team-assignment.service.ts`
- `apps/api/src/services/__tests__/team-assignment.service.test.ts`

**Modify:**
- `apps/api/src/db/schema/index.ts` — add export
- `apps/api/src/db/schema/relations.ts` — add teamAssignment relations
- `apps/api/src/db/seeds/` — add team assignment seed data

### Project Structure Notes

- Schema file goes in `apps/api/src/db/schema/team-assignments.ts` alongside existing schema files (users.ts, roles.ts, lgas.ts, etc.)
- Service goes in `apps/api/src/services/team-assignment.service.ts`
- Tests go in `apps/api/src/services/__tests__/team-assignment.service.test.ts`
- Migration goes in `apps/api/drizzle/0005_<suffix>.sql` (next in sequence after 0004)

### References

- [Source: _bmad-output/implementation-artifacts/epic-3-retro-2026-02-14.md#Action-Items — prep-8]
- [Source: _bmad-output/implementation-artifacts/4-1-supervisor-team-dashboard.md — Task 1.1, 1.2]
- [Source: _bmad-output/planning-artifacts/epics.md#Story-4.1]
- [Source: _bmad-output/planning-artifacts/architecture.md — Staffing: 99 Enumerators + 33 Supervisors, 1 per LGA]
- [Source: _bmad-output/project-context.md#Critical-Implementation-Rules — UUIDv7, naming, ESM]
- [Source: apps/api/src/db/schema/users.ts — existing schema pattern]
- [Source: apps/api/src/db/schema/submissions.ts — index pattern]
- [Source: apps/api/src/controllers/supervisor.controller.ts — current LGA-based queries]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Story drafted from: epics.md, architecture.md, project-context.md, epic-3-retro-2026-02-14.md, Story 4-1 file, existing DB schema files, supervisor controller/routes/hooks/pages.
- Codebase analysis confirmed: no team_assignments table exists, all supervisor queries use LGA filtering.

### Completion Notes List

- Story generated as `ready-for-dev` with schema, service, seed, and test guardrails.
- Includes LGA fallback strategy for backward compatibility with existing supervisor endpoints.
- Scoped to schema + service only — no API endpoints or admin UI (those belong to Story 4.1 and future admin stories).
- PM validation (2026-02-17): Added `relationName` requirement for dual-user FKs (M1), FK-safe seed cleanup ordering (M2), corrected enumerator relation to `many` for history support (M3), specified `users` → `roles` join for role validation (L1), added 2 more enumerator seed accounts for realistic testing (L2).
- Code review (2026-02-17): 8 findings (3H, 3M, 2L). All HIGH and MEDIUM auto-fixed. Service now filters inactive users in both direct and fallback paths, handles duplicate assignment constraint gracefully (409), guards removeAssignment against already-deleted records. Tests improved: separated per-table mocks, added 3 new cases (inactive filter, duplicate assignment, reassignment). Total tests: 15 (was 12). L2 (epics.md) left for separate verification.

### File List

**Created:**
- `apps/api/src/db/schema/team-assignments.ts` — table definition, indexes, partial unique, type exports
- `apps/api/drizzle/0005_create_team_assignments.sql` — DDL migration
- `apps/api/src/services/team-assignment.service.ts` — assignment resolution + CRUD + role validation + duplicate guard
- `apps/api/src/services/__tests__/team-assignment.service.test.ts` — 15 unit tests (table-specific mocks)

**Modified:**
- `apps/api/src/db/schema/index.ts` — added team-assignments export
- `apps/api/src/db/schema/relations.ts` — teamAssignmentsRelations + usersRelations many-side entries
- `apps/api/src/db/seeds/index.ts` — 2 new enumerator accounts, seedTeamAssignments(), FK-safe cleanup order, explicit lgaId null check

**Tracking:**
- `_bmad-output/implementation-artifacts/prep-8-supervisor-team-assignment-schema.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
