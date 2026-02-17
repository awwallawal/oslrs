# Story prep.7: Fraud Detection Domain Research

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a development team,
I want validated fraud detection heuristics, threshold defaults, and a database schema design for the Fraud Signal Engine,
so that Story 4.3 (Fraud Engine Configurable Thresholds) and Story 4.4 (Flagged Submission Review) can implement a proven architecture with zero rework.

## Background & Context

- **Blocker for:** Story 4.3 (Fraud Engine Configurable Thresholds), Story 4.4 (Flagged Submission Review), Story 4.5 (Bulk Verification)
- **Epic 3 retrospective decision:** Fraud detection identified as a new domain requiring spike-first validation (Team Agreement A5)
- **Architecture:** ADR-003 defines Fraud Detection Engine Design — rule-based with pluggable heuristics, DB-backed configurable thresholds, runtime adjustment without deployment
- **Sizing:** 5 tasks, 15 subtasks — within A4 limit (no split needed)
- **Predecessor spikes:** prep-5 (Service Worker/IndexedDB) and prep-6 (Realtime Messaging) both delivered zero-rework implementations — follow that pattern
- **Current state:** BullMQ fraud-detection queue exists (stub worker returns `{ processed: false, reason: 'stub — Epic 4 scope' }`). GPS coordinates captured on submissions. No heuristic implementations, no fraud schema tables, no types/interfaces.
- **Pilot tuning target (ADR-003):** 2-5% of submissions flagged for manual review. 40% = too aggressive, 0.5% = too lenient.

## Acceptance Criteria

**AC prep.7.1 — Heuristic algorithm documentation**
**Given** OSLSR survey constraints (200 field enumerators, 6-section questionnaire, GPS capture, offline-first PWA)
**When** the spike documents fraud detection heuristics
**Then** the output includes algorithm definitions for GPS Clustering (DBSCAN + Haversine), Speed Run detection (median-ratio two-tier), and Straight-lining detection (PIR + entropy)
**And** each heuristic has: algorithm pseudocode, recommended default thresholds with rationale, false-positive mitigation strategy, and OSLSR-specific adaptations.

**AC prep.7.2 — Threshold schema design**
**Given** ADR-003's requirement for DB-backed configurable thresholds with runtime adjustment
**When** the spike produces a Drizzle ORM schema
**Then** the output includes `fraud_thresholds` table with temporal versioning (effective_from/effective_until, never UPDATE, always INSERT new version)
**And** `fraud_detections` table storing per-submission composite scores with component breakdowns and resolution workflow fields
**And** the schema uses UUIDv7 primary keys, snake_case column names, and references existing `users` and `submissions` tables.

**AC prep.7.3 — Composite scoring model**
**Given** multiple independent heuristic signals
**When** the spike defines a scoring model
**Then** the output includes a weighted additive score (0-100) with component weights (GPS=25, Speed=25, Straight-lining=20, Duplicate=20, Timing=10)
**And** severity levels: clean (0-24), low (25-49), medium (50-69), high (70-84), critical (85-100)
**And** severity-to-action mapping for supervisor workflow.

**AC prep.7.4 — TypeScript types and interfaces**
**Given** the heuristic definitions and schema design
**When** the spike produces shared types
**Then** the output includes types in `packages/types/src/fraud.ts`: FraudHeuristic, FraudThresholdConfig, FraudDetectionResult, FraudSeverity, FraudComponentScore, HeuristicCategory
**And** Zod validation schemas for threshold configuration in `packages/types/src/validation/fraud.ts`
**And** all types are exported from `packages/types/src/index.ts`.

**AC prep.7.5 — Implementation handoff package**
**Given** spike completion
**When** results are documented
**Then** Story 4.3 receives implementation-ready guidance: Drizzle schema files to create, seed data for default thresholds, service interface for FraudEngine with HeuristicRegistry + ConfigService + ScoringAggregator, worker implementation pattern, API endpoint design for threshold CRUD, and file touchpoints.

## Tasks / Subtasks

- [x] Task 1: Heuristic algorithm documentation (AC: prep.7.1)
  - [x] 1.1 Document GPS Clustering algorithm: DBSCAN with Haversine distance metric, `epsilon=50m`, `minSamples=3`, `timeWindow=4h` per enumerator. Include Haversine formula, radian conversion, and DBSCAN noise-point interpretation for fraud flagging. Document GPS accuracy filter (`>50m = flag`), teleportation detection (`>120km/h between consecutive interview GPS = flag`), and duplicate-coordinate detection (`<5m between different enumerators same day`).
  - [x] 1.2 Document Speed Run algorithm: Two-tier median-ratio model. Tier 1 (superspeceder): `completionTime < 25% of enumerator median` = 25 points. Tier 2 (speeder): `completionTime < 50% of median` = 12 points. Bootstrap problem: use theoretical minimum (`(closedQ * 3s) + (openQ * 8s) + (numericQ * 4s) + 30s overhead`) until 30+ interviews establish empirical median. Document per-section timing analysis and questions-per-minute secondary metric (`>15 qpm = suspicious, >30 qpm = critical`).
  - [x] 1.3 Document Straight-lining algorithm: Three complementary methods — (a) PIR (Percentage Identical Responses): flag at PIR >= 0.80 in batteries of 5+ scale questions, (b) LIS (Longest Identical String): flag at LIS >= 8 consecutive identical, (c) Shannon entropy: flag at H < 0.5 bits. Require flags in 2+ separate batteries to trigger. Document false-positive mitigation: battery-level only, cross-battery consistency, direction check, per-enumerator baseline.
  - [x] 1.4 Write research document to `_bmad-output/implementation-artifacts/prep-7-fraud-heuristics-research.md` with all algorithm specs, threshold rationale, and academic references

- [x] Task 2: Drizzle schema design (AC: prep.7.2)
  - [x] 2.1 Create `apps/api/src/db/schema/fraud-thresholds.ts` — `fraud_thresholds` table with temporal versioning: `id` (UUIDv7), `ruleKey` (varchar 100), `displayName`, `ruleCategory` (enum: gps, speed, straightline, duplicate, timing, composite), `thresholdValue` (numeric 12,4), `weight` (numeric 5,2 nullable), `severityFloor` (varchar 20 nullable), `isActive` (boolean), `effectiveFrom` (timestamp), `effectiveUntil` (timestamp nullable), `version` (integer), `createdBy` (UUID FK→users), `createdAt`, `notes` (text nullable). Unique constraint on `(ruleKey, version)`.
  - [x] 2.2 Create `apps/api/src/db/schema/fraud-detections.ts` — `fraud_detections` table: `id` (UUIDv7), `submissionId` (UUID FK→submissions), `enumeratorId` (UUID FK→users), `computedAt` (timestamp), `configSnapshotVersion` (integer — pin threshold version at compute time), component scores (`gpsScore`, `speedScore`, `straightlineScore`, `duplicateScore`, `timingScore` — all numeric 5,2 default 0), `totalScore` (numeric 5,2), `severity` (varchar 20), detail JSONB columns (`gpsDetails`, `speedDetails`, `straightlineDetails`, `duplicateDetails`), resolution fields (`reviewedBy` UUID FK nullable, `reviewedAt` timestamp nullable, `resolution` varchar 30 nullable, `resolutionNotes` text nullable). Index on `(severity, resolution)` for supervisor queue queries.
  - [x] 2.3 Export both tables from `apps/api/src/db/schema/index.ts` and verify Drizzle picks them up

- [x] Task 3: TypeScript types and Zod schemas (AC: prep.7.4)
  - [x] 3.1 Create `packages/types/src/fraud.ts` with: `FraudSeverity` union type (`'clean' | 'low' | 'medium' | 'high' | 'critical'`), `HeuristicCategory` union (`'gps' | 'speed' | 'straightline' | 'duplicate' | 'timing' | 'composite'`), `FraudThresholdConfig` interface (mirrors DB columns), `FraudComponentScore` interface (`{ gps, speed, straightline, duplicate, timing }`), `FraudDetectionResult` interface (full result with component scores + details + severity), `FraudHeuristic` interface (pluggable heuristic contract: `{ key, category, evaluate(submission, config) → score + details }`)
  - [x] 3.2 Create `packages/types/src/validation/fraud.ts` with Zod schemas: `fraudThresholdConfigSchema`, `fraudDetectionResultSchema`, `updateThresholdSchema` (for API input validation)
  - [x] 3.3 Export all fraud types from `packages/types/src/index.ts`

- [x] Task 4: Seed data and composite scoring model (AC: prep.7.3)
  - [x] 4.1 Create `apps/api/src/db/seeds/fraud-thresholds.seed.ts` — 21 default threshold records covering: GPS (6 records: radius=50m, minSize=3, timeWindow=4h, maxAccuracy=50m, teleportSpeed=120km/h, weight=25), Speed (4 records: superspeceder=25%, speeder=50%, bootstrapN=30, weight=25), Straight-lining (5 records: PIR=0.80, minBattery=5, entropy=0.50, batteries=2, weight=20), Duplicate (1 record: weight=20), Timing (1 record: weight=10), Severity cutoffs (4 records: 25/50/70/85). All records have `isSeeded: true` equivalent, `effectiveFrom: NOW()`, `version: 1`.
  - [x] 4.2 Document scoring formula in research doc: `totalScore = min(100, gpsScore + speedScore + straightlineScore + duplicateScore + timingScore)`. Document severity-to-action mapping: clean=auto-accept, low=weekly supervisor review, medium=next-day callback, high=immediate notification + hold payment, critical=auto-quarantine + block enumerator.

- [x] Task 5: Implementation handoff package (AC: prep.7.5)
  - [x] 5.1 Document FraudEngine service interface for Story 4.3: `FraudEngine.evaluate(submissionId) → FraudDetectionResult`. Internal architecture: `HeuristicRegistry` (register/unregister heuristics), `ConfigService` (load active thresholds from DB with Redis cache `fraud:thresholds:*` TTL 5min), `ScoringAggregator` (combine component scores into composite). Worker pattern: BullMQ `fraud-detection` job triggers `FraudEngine.evaluate()`, stores result in `fraud_detections` table, pushes notification if severity >= high. **Cache invalidation requirement:** On threshold INSERT (new version), ConfigService MUST invalidate Redis cache keys immediately via explicit `DEL fraud:thresholds:*` — do NOT rely on TTL expiry alone. Story 4.3 AC requires "immediately apply" semantics.
  - [x] 5.2 Document API endpoints for threshold management: `GET /api/v1/fraud-thresholds` (list active), `PUT /api/v1/fraud-thresholds/:ruleKey` (create new version, not update), `GET /api/v1/fraud-detections` (supervisor filtered list), `PATCH /api/v1/fraud-detections/:id/review` (resolve with verdict). Auth: thresholds = Super Admin only, detections = Supervisor + Verification Assessor + Super Admin.
  - [x] 5.3 Document file touchpoints for Story 4.3 implementation: files to create, files to modify, files to leave unchanged. Include test strategy (unit tests for each heuristic in isolation, integration test for composite scoring, E2E test for threshold change → new score).

### Review Follow-ups (AI) — 2026-02-17

- [x] [AI-Review][HIGH] H1: Add missing configurable thresholds for Duplicate (3 records: exact_threshold, partial_threshold, lookback_days) and Timing (3 records: night_start_hour, night_end_hour, weekend_penalty) — ADR-003 requires all thresholds DB-backed [apps/api/src/db/seeds/fraud-thresholds.seed.ts]
- [x] [AI-Review][HIGH] H2: Add DB-level enum constraint to `severity` column in fraud_detections — was plain text, now uses `fraudSeverityTypes` enum [apps/api/src/db/schema/fraud-detections.ts:58]
- [x] [AI-Review][MEDIUM] M1: Consolidate duplicated enum constants — schema files now import `heuristicCategories`, `fraudResolutions`, `fraudSeverities` from @oslsr/types as single source of truth [apps/api/src/db/schema/fraud-thresholds.ts, fraud-detections.ts]
- [x] [AI-Review][MEDIUM] M2: Change `ruleKey` from text() to varchar(100) per Task 2.1 spec — DB-level length constraint now enforced [apps/api/src/db/schema/fraud-thresholds.ts:35]
- [x] [AI-Review][MEDIUM] M3: `epics.md` modified in git but not from this story — unrelated concurrent change, no action needed
- [x] [AI-Review][LOW] L1: Tighten FK assertion from `>= 2` to `=== 3` verifying all 3 FK targets [apps/api/src/db/schema/__tests__/fraud-schema.test.ts:138]
- [x] [AI-Review][LOW] L2: Add `timingDetails` JSONB column for off-hours audit data + `timing` field in FraudDetectionResult.details and Zod schema [apps/api/src/db/schema/fraud-detections.ts, packages/types/src/fraud.ts, packages/types/src/validation/fraud.ts]
- [x] [AI-Review][LOW] L3: Add seed thresholdValue format consistency test enforcing `X.XXXX` pattern [apps/api/src/db/seeds/__tests__/fraud-thresholds.seed.test.ts]

## Dev Notes

### What Already Exists (Do NOT Recreate)

| Component | File | Status |
|-----------|------|--------|
| BullMQ fraud queue | `apps/api/src/queues/fraud-detection.queue.ts` | Complete (stub worker) |
| Worker skeleton | `apps/api/src/workers/fraud-detection.worker.ts` | Stub — returns `{ processed: false }` |
| Queue trigger | `apps/api/src/services/submission-processing.service.ts:177-191` | Fires when GPS present |
| Job data interface | `FraudDetectionJobData` in queue file | `{ submissionId, respondentId, gpsLatitude?, gpsLongitude? }` |
| GPS columns | `apps/api/src/db/schema/submissions.ts` | `gps_latitude`, `gps_longitude` (doublePrecision) |
| Supervisor placeholder | `apps/web/src/features/dashboard/pages/SupervisorFraudPage.tsx` | UI placeholder only |

### What Does NOT Exist (This Story Creates)

- `apps/api/src/db/schema/fraud-thresholds.ts` — Threshold configuration table
- `apps/api/src/db/schema/fraud-detections.ts` — Detection results table
- `apps/api/src/db/seeds/fraud-thresholds.seed.ts` — Default threshold seed data
- `packages/types/src/fraud.ts` — Shared types/interfaces
- `packages/types/src/validation/fraud.ts` — Zod schemas
- `_bmad-output/implementation-artifacts/prep-7-fraud-heuristics-research.md` — Research document

### Architecture Compliance (ADR-003)

```
FraudEngine
  ├── HeuristicRegistry (pluggable rules — each heuristic is independent)
  ├── ConfigService (DB-backed thresholds — never hardcode values)
  └── ScoringAggregator (weighted additive, 0-100 composite score)
```

- **Runtime adjustment:** Super Admin changes threshold → INSERT new version row → ConfigService cache invalidated → next evaluation uses new values
- **Pilot tuning:** Dashboard shows threshold hit rates. Target: 2-5% flagged submissions
- **Each heuristic independently testable** and can be disabled via `isActive` flag

### Heuristic Algorithm Summary

**1. GPS Clustering (max 25 points)**
- Algorithm: DBSCAN with Haversine distance
- Default: epsilon=50m, minSamples=3, timeWindow=4h per enumerator per day
- Secondary signals: GPS accuracy >50m, teleportation >120km/h, duplicate coordinates <5m
- Implementation: Pure TypeScript — compute Haversine distance pairs, apply density-based clustering. No PostGIS dependency needed at 200-enumerator scale.

**2. Speed Run (max 25 points)**
- Algorithm: Two-tier median-ratio model
- Tier 1 (superspeceder): completionTime < 25% of median → 25 points
- Tier 2 (speeder): completionTime < 50% of median → 12 points
- Bootstrap: Use theoretical minimum (`closedQ*3s + openQ*8s + numericQ*4s + 30s`) until 30+ interviews establish empirical median
- Per-section timing: Flag any section < 20% of section median

**3. Straight-lining (max 20 points)**
- Algorithm: PIR + LIS + Shannon entropy
- Flag: PIR >= 0.80 in 2+ batteries of 5+ scale questions → 20 points; 1 battery → 10 points
- False-positive mitigation: Battery-level only, cross-battery consistency, per-enumerator baseline

**4. Duplicate Response (max 20 points)**
- Exact duplicate of another interview → 20 points
- Partial duplicate (>70% field match) → 10 points

**5. Off-Hours Submission (max 10 points)**
- Submitted 11 PM - 5 AM local time → 10 points
- Weekend submission → 5 points

### Composite Scoring

```
totalScore = min(100, gpsScore + speedScore + straightlineScore + duplicateScore + timingScore)
```

| Score | Severity | Supervisor Action |
|-------|----------|-------------------|
| 0-24 | clean | Auto-accept |
| 25-49 | low | Weekly review batch |
| 50-69 | medium | Next-day callback/verification |
| 70-84 | high | Immediate notification, hold payment |
| 85-100 | critical | Auto-quarantine, block enumerator until cleared |

### Threshold Schema Design: Temporal Versioning

**Never UPDATE threshold rows — always INSERT new version:**
```sql
-- Change GPS radius from 50m to 75m:
UPDATE fraud_thresholds SET effective_until = NOW()
  WHERE rule_key = 'gps_cluster_radius_m' AND effective_until IS NULL;
INSERT INTO fraud_thresholds (rule_key, threshold_value, version, effective_from, ...)
  VALUES ('gps_cluster_radius_m', 75, 2, NOW(), ...);
```

**Historical score auditing:** Every `fraud_detections` row stores `config_snapshot_version` — the threshold version active when the score was computed. This enables re-evaluation and audit trail.

### Database Naming Patterns (Mandatory)

- Tables: `fraud_thresholds`, `fraud_detections` (snake_case, plural)
- Columns: `rule_key`, `threshold_value`, `gps_score`, `total_score` (snake_case)
- Drizzle schema: camelCase properties mapping to snake_case columns
- Primary keys: UUIDv7 via `$defaultFn(() => uuidv7())`
- Foreign keys: `enumerator_id` → `users.id`, `submission_id` → `submissions.id`

### Redis Cache Pattern

```typescript
// Threshold cache (invalidate on threshold change)
`fraud:thresholds:active`          // JSON blob of all active thresholds, TTL 5 min
`fraud:thresholds:gps_cluster`     // Individual rule cache

// Enumerator stats cache (updated on each scoring)
`fraud:stats:${enumeratorId}:${formId}`  // Rolling median/percentile, TTL 1 hour
```

### ESM Import Convention (Backend)

All relative imports in `apps/api/src/` MUST include `.js` extension:
```typescript
// CORRECT
import { fraudThresholds } from '../db/schema/fraud-thresholds.js';
import { fraudDetections } from '../db/schema/fraud-detections.js';

// WRONG — will fail at runtime
import { fraudThresholds } from '../db/schema/fraud-thresholds';
```

### What NOT to Do

- **Do NOT implement the actual heuristic algorithms** — that's Story 4.3 scope; this spike defines them
- **Do NOT build the FraudEngine service** — that's Story 4.3; this spike designs the interface
- **Do NOT create the fraud threshold UI** — that's Story 4.3; this spike documents the API contract
- **Do NOT modify the existing fraud-detection worker** — that's Story 4.3; leave the stub
- **Do NOT use PostGIS** — DBSCAN with Haversine in pure TypeScript is sufficient at 200-enumerator scale
- **Do NOT use ML/AI models** — the weighted additive model is appropriate for the pilot phase
- **Do NOT use `console.log`** — all logging through Pino structured events
- **Do NOT use `uuid` v4 package** — if IDs are needed, use `uuidv7` from the `uuidv7` package

### Existing Patterns to Follow

| Pattern | Source File | Reuse For |
|---------|------------|-----------|
| Drizzle schema pattern | `apps/api/src/db/schema/submissions.ts` | Schema for fraud tables |
| Seed data pattern | `apps/api/src/db/seeds/` | Fraud threshold seed |
| Types export pattern | `packages/types/src/index.ts` | Fraud type exports |
| Zod validation pattern | `packages/types/src/validation/native-form.ts` | Fraud Zod schemas |
| Queue pattern | `apps/api/src/queues/fraud-detection.queue.ts` | Reference for worker design |
| UUIDv7 pattern | Any schema file | `id: uuid('id').primaryKey().$defaultFn(() => uuidv7())` |

### Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R1 | GPS accuracy varies widely across Nigerian hardware (TECNO/Infinix devices) | High | Medium | Default 50m accuracy filter; configurable threshold |
| R2 | Straight-lining false positives on legitimately uniform responses | Medium | High | Require 2+ battery flags; per-enumerator baseline comparison |
| R3 | Speed median unreliable in first week of field data | High | Medium | Theoretical minimum floor until 30+ interviews establish empirical median |
| R4 | Threshold changes affect in-flight scoring | Low | Medium | Pin config_snapshot_version on each score row; temporal versioning |
| R5 | Composite score weights may need rebalancing after pilot | High | Low | All weights stored in DB and adjustable by Super Admin |

### Project Structure Notes

New files follow existing structure:
```
apps/api/src/db/schema/
├── fraud-thresholds.ts          # NEW: Threshold config table
├── fraud-detections.ts          # NEW: Detection results table
├── index.ts                     # MODIFY: Export new tables

apps/api/src/db/seeds/
├── fraud-thresholds.seed.ts     # NEW: Default threshold seed data

packages/types/src/
├── fraud.ts                     # NEW: Shared types/interfaces
├── validation/
│   └── fraud.ts                 # NEW: Zod validation schemas
├── index.ts                     # MODIFY: Export fraud types
```

Research output:
```
_bmad-output/implementation-artifacts/
├── prep-7-fraud-heuristics-research.md   # NEW: Algorithm research document
```

### References

- [Source: _bmad-output/planning-artifacts/architecture.md — ADR-003: Fraud Detection Engine Design]
- [Source: _bmad-output/planning-artifacts/epics.md — Epic 4: Stories 4.3, 4.4, 4.5]
- [Source: _bmad-output/implementation-artifacts/epic-3-retro-2026-02-14.md — prep-7 action item]
- [Source: apps/api/src/queues/fraud-detection.queue.ts — Existing queue infrastructure]
- [Source: apps/api/src/workers/fraud-detection.worker.ts — Existing stub worker]
- [Source: apps/api/src/services/submission-processing.service.ts:177-191 — Queue trigger]
- [Source: apps/api/src/db/schema/submissions.ts — GPS columns]
- [Source: _bmad-output/project-context.md — Critical implementation rules]
- [Research: PMC11646990 — AI-powered fraud and survey integrity (speeder thresholds)]
- [Research: PMC8944307 — Comparison of detection methods for interviewer falsification]
- [Research: PMC10818231 — Assessing data integrity in web-based surveys]
- [Research: AAPOR Task Force Report — Falsification in surveys]
- [Research: Oxford Academic JSSAM — Detecting interviewer fraud using multilevel models]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

No debug issues encountered. All tests passed on first run.

### Implementation Plan

1. Created comprehensive research document covering all 5 heuristics with pseudocode, thresholds, false-positive mitigation, and OSLSR-specific adaptations
2. Created Drizzle schemas for `fraud_thresholds` (temporal versioning) and `fraud_detections` (per-submission scoring)
3. Created shared TypeScript types and Zod validation schemas in `packages/types`
4. Created seed data with 21 default threshold records (weights sum to 100)
5. Documented FraudEngine service interface, API endpoints, file touchpoints, and test strategy for Story 4.3 handoff

### Completion Notes List

- Task 1: Research document written with GPS Clustering (DBSCAN+Haversine), Speed Run (two-tier median-ratio), Straight-lining (PIR+LIS+entropy), Duplicate Response, and Off-Hours detection algorithms. All include pseudocode, default thresholds with rationale, and OSLSR-specific adaptations for Nigerian field conditions (TECNO/Infinix devices, Oyo State geography, offline-first PWA).
- Task 2: Drizzle schemas created following existing patterns. `fraud_thresholds` uses temporal versioning (never UPDATE, always INSERT new version) with unique constraint on `(rule_key, version)`. `fraud_detections` stores 5 component scores + composite with JSONB detail breakdowns and resolution workflow fields. Both exported from schema index. 14 schema tests pass.
- Task 3: TypeScript types created in `packages/types/src/fraud.ts`: FraudSeverity, HeuristicCategory, FraudThresholdConfig, FraudComponentScore, FraudDetectionResult, FraudHeuristic. Zod schemas in `validation/fraud.ts`: fraudThresholdConfigSchema, updateThresholdSchema, fraudDetectionResultSchema, reviewFraudDetectionSchema. 27 validation tests pass.
- Task 4: Seed data with 27 records across 6 categories (GPS=6, Speed=4, Straightline=5, Duplicate=4, Timing=4, Composite=4). Weights sum to 100 (25+25+20+20+10). All heuristic parameters now DB-configurable per ADR-003. Scoring formula and severity-to-action mapping documented in research doc Section 7. 25 seed tests pass.
- Task 5: Implementation handoff in research doc Section 9: FraudEngine/HeuristicRegistry/ConfigService/ScoringAggregator interfaces, BullMQ worker pattern, 4 API endpoints with auth matrix, 16 files to create + 2 to modify + 4 to leave unchanged, test strategy (unit per heuristic, integration for composite, E2E for threshold change).

### File List

**New files:**
- `_bmad-output/implementation-artifacts/prep-7-fraud-heuristics-research.md` — Research document (all algorithm specs, threshold rationale, implementation handoff)
- `apps/api/src/db/schema/fraud-thresholds.ts` — Drizzle schema for fraud_thresholds table
- `apps/api/src/db/schema/fraud-detections.ts` — Drizzle schema for fraud_detections table
- `apps/api/src/db/schema/__tests__/fraud-schema.test.ts` — Schema structure tests (14 tests)
- `apps/api/src/db/seeds/fraud-thresholds.seed.ts` — 27 default threshold seed records
- `apps/api/src/db/seeds/__tests__/fraud-thresholds.seed.test.ts` — Seed data tests (20 tests)
- `packages/types/src/fraud.ts` — Shared types/interfaces (FraudSeverity, HeuristicCategory, etc.)
- `packages/types/src/validation/fraud.ts` — Zod validation schemas
- `packages/types/src/validation/__tests__/fraud.test.ts` — Type and Zod schema tests (27 tests)

**Modified files:**
- `apps/api/src/db/schema/index.ts` — Added exports for fraud-thresholds and fraud-detections
- `packages/types/src/index.ts` — Added exports for fraud types and validation schemas

## Change Log

- 2026-02-17: Story implemented — all 5 tasks complete. Research document, Drizzle schemas, TypeScript types, Zod schemas, seed data, and implementation handoff package created. 61 new tests.
- 2026-02-17: Adversarial code review (AI) — 8 findings (2 HIGH, 3 MEDIUM, 3 LOW). All fixed: added 6 missing configurable threshold records (21→27), added severity enum constraint, consolidated duplicated enums via @oslsr/types imports, changed ruleKey to varchar(100), added timingDetails JSONB column + timing in types/Zod, tightened FK test assertions, added format consistency test. 67 new tests (+6), all API tests pass (467), all web tests pass (1340), 0 regressions.
