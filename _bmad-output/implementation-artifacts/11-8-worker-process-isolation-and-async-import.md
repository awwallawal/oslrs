# Story 11-8: Worker-process isolation (separate PM2 process) + async respondent import

Status: backlog

<!-- Surfaced 2026-07-22 (Opus 4.8, emergent from an 11-2 architecture review). POST-LAUNCH SCALING, NON-GATING, trigger-deferred. During the 11-2 code review an architectural imprecision was caught + verified: ALL BullMQ workers run INSIDE the API process (`app.ts:103` → `initializeWorkers()`; single `src/index.ts` entrypoint; no process-role split), so every background job shares the API's ONE event loop. BullMQ here provides request-decoupling / retry / cron / durability — NOT CPU/event-loop isolation. This story surfaces the two paired improvements so they are not lost: (AC1) split workers into a second PM2 process behind an env flag — the real isolation lever, benefiting ALL queues; (AC2) move respondent import to a real BullMQ job (only when import volume outgrows in-request). Deliberately deferred: today's load (super-admin-only imports ~1.2s/4K rows; modest job volume on a 2GB VPS) does not require it. Pick up when the trigger conditions below are met. See MEMORY.md "WORKER MODEL" key pattern + [[pattern-ship-a-fix-that-never-fires]] (surface-so-we-don't-miss-it). -->

## Story

As **the platform operator running OSLRS on a single VPS**,
I want **background workers to run in a separate process from the HTTP API (toggled by an env flag), and long-running respondent imports to run as real BullMQ jobs rather than in-request**,
so that **a CPU-heavy background job (a large import parse, a fraud/marketplace burst) can no longer degrade live API latency, and each tier can be scaled and resource-tuned independently — the "proper BullMQ at scale" shape, instead of everything sharing one event loop.**

## Context & Evidence (verified 2026-07-22)

- **All 10 workers run in-process with the API.** `apps/api/src/app.ts:100-105` calls `initializeWorkers()` (guarded only against test mode). `apps/api/src/workers/index.ts` creates every worker via `new Worker()` at module load. There is ONE entrypoint, `src/index.ts`; PM2 runs ONE app (`oslsr-api`). No `PROCESS_ROLE`/`WORKER_MODE` gate exists.
- **Consequence:** BullMQ workers (fraud @ concurrency 4, marketplace 4, webhook 10, email 5, import/staff 2, …) share the API's single Node event loop. So BullMQ here = **request-decoupling + retry/backoff + cron scheduling + restart-durability**, NOT CPU/event-loop isolation. A CPU-bound job degrades HTTP latency exactly as in-request work would. (This is a deliberate simplicity tradeoff for a 2GB VPS — evidence of resource-awareness: monitoring interval cut 30s→120s "to lower CPU/RAM on VPS"; worker concurrency caps; the test-mode dynamic-import guard.)
- **`import.worker.ts` / `import.queue.ts` are the `staff-import` queue** (`StaffService.processImportRow`, bulk staff invites) — UNRELATED to respondent import. Story 11-2 correctly did NOT reuse it. Name collision to avoid: the new respondent-import queue must be `respondent-import`, never `staff-import`.
- **11-2 chose in-request import handling** (Task 6) because 4K rows commit in ~1.2s, and hardened the sync path with `import/parse-limits.ts` (row/page caps + active pdfjs deadline). That remains correct at current volume. This story is the NEXT rung, not a fix to 11-2.

### Trigger conditions (pick this up when ANY holds)
1. A background job class routinely does enough CPU work to measurably raise p95 API latency (large imports; a fraud/marketplace burst; a heavy analytics job).
2. Respondent import files grow beyond in-request comfort — e.g. MDA exports materially larger than the ITF-SUPA ~3,600-row cohort, or parse times approaching the 30s `PARSE_DEADLINE_MS`.
3. You want to scale the API and the background tier independently (RAM/CPU/instance count) on the VPS or a move to multi-node.

## Acceptance Criteria

1. **AC1 — Worker/API process split behind an env flag (backward-compatible).** Introduce `PROCESS_ROLE` (values `all` | `api` | `worker`; default `all` = today's single-process behavior, so no deploy changes until opted in):
   - `all`: HTTP API **and** workers (current behavior — unchanged default).
   - `api`: HTTP API only — `initializeWorkers()` is skipped; the process still enqueues jobs and reads Redis.
   - `worker`: workers only — does **not** bind/listen on the HTTP port (optionally binds a tiny health/liveness port for PM2/monitoring), runs `initializeWorkers()` + the schedulers.
   - Both roles share the same Redis (jobs enqueued by `api` are processed by `worker`). One codebase, one build; role is runtime-selected.

2. **AC2 — Two-app PM2 topology.** A committed PM2 ecosystem config (or documented deploy step) defines `oslsr-api` (`PROCESS_ROLE=api`) and `oslsr-worker` (`PROCESS_ROLE=worker`), sharing env/Redis. The ci-cd deploy starts/reloads both. Graceful shutdown (SIGTERM/SIGINT → `closeAllWorkers()`) works per-process; the existing shutdown path in `workers/index.ts:193-204` is reused, and the API-only process no longer owns worker shutdown.

3. **AC3 — Async respondent import job (paired with AC1; volume-gated).** Add a `respondent-import` BullMQ queue + worker (NOT `staff-import`). Move the confirm-time parse + transactional ingest off the HTTP request into the job:
   - `POST /confirm` validates the dry-run token, enqueues a `respondent-import` job, and returns `202` with a `job_id` (instead of doing the ingest inline).
   - A status endpoint (`GET /api/v1/admin/imports/jobs/:jobId`) reports `queued|active|completed|failed` + the `ConfirmResult` counters on completion.
   - The job reuses the existing pure `planIngest` + batched ingest + `import/parse-limits.ts` bounding; the transaction/audit/rollback semantics are unchanged.
   - Dry-run stays synchronous (preview only). Single-use token + file-hash dedup semantics preserved (the job consumes the draft).
   - ⚠️ BullMQ dup-jobId gotcha (13-27): a duplicate `jobId` silently returns the existing job — probe `getJob()`, never rely on `add()` throwing.

4. **AC4 — No behavioural regression in `all` mode.** With `PROCESS_ROLE` unset/`all`, everything behaves exactly as today (single process, in-process workers). The split is strictly opt-in. Full API suite + web + `tsc --noEmit` + eslint clean in the default configuration.

5. **AC5 — Isolation proven.** A test/verification demonstrates that in split mode a job enqueued via the `api` role is processed by the `worker` role and NOT by the `api` process, and that a deliberately CPU-heavy job does not block a concurrent API health check on the `api` process. (Integration-level; may run against a local two-process/Redis harness.)

6. **AC6 — Docs + monitoring.** `docs/infrastructure-cicd-playbook.md` documents the two-process model, the `PROCESS_ROLE` flag, and the deploy/rollback for both apps. Health/alerting (`MonitoringService`, ops-digest) is aware there are now two processes (worker liveness surfaced). MEMORY.md "WORKER MODEL" note updated from "future lever" to "shipped" when done.

## Tasks / Subtasks

- [ ] **Task 1 — Role gating** (AC: #1, #4)
  - [ ] Add `PROCESS_ROLE` parsing (default `all`). Gate `initializeWorkers()` in `app.ts:102-105` on role ∈ {`all`,`worker`}. Gate HTTP `listen()` (in `src/index.ts`) on role ∈ {`all`,`api`}; for `worker`, optionally start a minimal health server.
  - [ ] Ensure the `worker` role still runs the schedulers (`scheduleNightlySnapshot`/backup/reminders/ops-digest/digest-flush + the monitoring & reveal-anomaly intervals) — they belong with the workers, not the API.
- [ ] **Task 2 — PM2 topology + deploy** (AC: #2)
  - [ ] Commit a PM2 ecosystem config with `oslsr-api` + `oslsr-worker`; wire both into the ci-cd deploy (reload both; zero-downtime for api). Per-process graceful shutdown verified.
- [ ] **Task 3 — Async respondent import** (AC: #3) — *volume-gated; may be split to its own story if AC1/AC2 ship first.*
  - [ ] `respondent-import.queue.ts` + `respondent-import.worker.ts` (queue name `respondent-import`). Worker calls the extracted confirm-ingest core.
  - [ ] Refactor `ImportService.confirm` so the ingest body is a pure-ish core the worker invokes; the route enqueues + returns `202 { jobId }`. Add the job-status endpoint. Reuse `parse-limits` + `planIngest`; probe `getJob()` for dedup (13-27).
- [ ] **Task 4 — Tests + docs** (AC: #4, #5, #6)
  - [ ] Default-mode regression green; split-mode isolation test; playbook + MEMORY.md update.

## Dev Notes

### Dependencies
- **11-2 (done)** — the import spine (`import.service.ts`, `ingest-plan.ts`, `import/parse-limits.ts`) AC3 refactors + reuses. No schema change for AC1/AC2; AC3 adds a queue + a status endpoint only.
- Redis (existing, `lib/redis.ts` connection factory) — both processes use it. No new infra beyond a second PM2 app.
- Independent of the email-channel stack (11-5/6/7) and 13-2; AC1/AC2 benefit every queue.

### Approach — why a process split, not `worker_threads`
- `worker_threads` gives per-thread CPU isolation but is a known footgun in this ESM + tsx(dev/test) + tsc→dist(prod) stack (see MEMORY.md). A second Node **process** (same code, `PROCESS_ROLE=worker`) gives the same isolation with the project's existing PM2 idiom and zero loader gymnastics — and additionally lets you scale/oom-tune the tiers independently. BullMQ's Redis broker already makes cross-process job hand-off trivial.
- AC1/AC2 (the split) are the high-value, low-risk core and can ship alone. AC3 (async import) is the first concrete beneficiary but is **volume-gated** — if AC1 lands first and imports are still small, AC3 can be deferred or carved to its own story without loss.

### Project Structure Notes
- **Modified:** `apps/api/src/app.ts` (gate `initializeWorkers`), `apps/api/src/index.ts` (gate `listen` / health port), `apps/api/src/workers/index.ts` (schedulers belong to the worker role), `.github/workflows/ci-cd.yml` (deploy both apps), `docs/infrastructure-cicd-playbook.md`.
- **NEW:** PM2 ecosystem config; (AC3) `apps/api/src/queues/respondent-import.queue.ts` + `apps/api/src/workers/respondent-import.worker.ts` + a job-status route; extracted confirm-ingest core.
- **Do NOT** name the new queue `staff-import` (taken by the unrelated staff-invite worker).

### References
- [Source: apps/api/src/app.ts:100-105 — in-process `initializeWorkers()` (the gate point)]
- [Source: apps/api/src/workers/index.ts — worker registration + schedulers + graceful shutdown (:193-204)]
- [Source: apps/api/src/queues/import.queue.ts:14 + workers/import.worker.ts:39 — `staff-import` (name-collision to avoid)]
- [Source: apps/api/src/services/import.service.ts — `confirm` (the ingest to move async in AC3) + `import/parse-limits.ts` (reused bounding)]
- [Source: apps/api/src/lib/redis.ts — shared connection factory both processes use]
- [Source: MEMORY.md "WORKER MODEL" key pattern (2026-07-22 verification) + Production Deployment (VPS) — PM2 + NGINX]
- [Source: 11-2 story "why not worker_threads" + Task 6 in-request decision]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

### Review Follow-ups (AI)

## Change Log

| Date | Change | Rationale |
|------|--------|-----------|
| 2026-07-22 | Story surfaced (Opus 4.8), emergent from an 11-2 architecture review that verified all BullMQ workers run in-process with the API (`app.ts:103`) → one shared event loop → BullMQ ≠ CPU isolation here. Two paired, trigger-deferred improvements captured: AC1/AC2 split workers into a second PM2 process behind a `PROCESS_ROLE` flag (the real isolation lever, backward-compatible default `all`, benefits every queue); AC3 move respondent import to a `respondent-import` BullMQ job (volume-gated). POST-LAUNCH, NON-GATING. Status → backlog with explicit trigger conditions so it is not missed when latitude permits. | Surface-so-we-don't-miss-it; the latent risk is that every background job shares the API loop, not imports specifically. Correct wording captured in MEMORY.md "WORKER MODEL". |
