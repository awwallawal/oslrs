# Story 9-10 AC#5 — pino log noise audit findings

**Source:** `pm2 logs oslsr-api --lines 5000 --nostream --raw` on production VPS, captured 2026-05-07 ~20:30 UTC.
**Method:** parse JSON pino lines, group by `level` + `event` field.
**Timebox spent:** ~30 min of the 2-hour ceiling.

## Level histogram (last 5000 lines)

| Level | Count | Share | Notes |
|---|---|---|---|
| 30 (info) | 4,652 | 93.0% | Operational signal |
| 40 (warn) | 331 | 6.6% | Mostly client-error noise (see below) |
| 50 (error) | 17 | 0.34% | All historical (see below) |

## WARN-level (top events)

| Count | Event | Verdict |
|---|---|---|
| 251 | `api.error` (mostly `AUTH_INVALID_TOKEN` on `/api/v1/auth/refresh`) | **DEMOTED** to `debug` for 4xx client errors. Token expiry = expected; clients hit `/auth/refresh` after every JWT TTL → uses ~76% of warn budget without carrying signal. |
| 42 | `csp_violation_unknown_format` | Kept at warn — surface for Story 9-8 follow-ups (browsers posting non-standard CSP report payloads). |
| 35 | `csp_violation` | Kept at warn — real signal; matches the 78 violations finding in `docs/follow-ups/2026-05-04-cloudflare-waf-pm2-csp-review.md` Part (c). |
| 2 | `captcha.verification_failed` | Kept at warn — real bot-detection signal. |
| 1 | `auth.token_blacklisted` | Kept at warn — real security signal. |

## ERROR-level (top events)

| Count | Event | Verdict |
|---|---|---|
| 17 | `api.error.unknown` | All 17 entries are from a 6-minute burst on **2026-05-03 11:59-12:05 UTC**, all targeting `audit-log-viewer.service.ts:312` during Story 9-11 development/test deploys. PIDs all `194583` (a single transient process during 9-11 dev work). Zero entries in error log since 2026-05-03 12:05. **Not a current bug — historical Story 9-11 dev noise.** |

## INFO-level (top events from sample)

| Count | Event | Verdict |
|---|---|---|
| 1,106 | `email.worker.job_completed` | Kept at info — operational health signal. |
| 1,071 | `email.digest.flush_started` | **DEMOTED** to `debug`. Cron fires every 30 min; the `started` log is unconditional and carries no extra info beyond the cron fact itself. |
| 1,071 | `email.digest.flush_empty` | **DEMOTED** to `debug`. Empty-flush is a no-op — the worker should be silent when there's nothing to do. |
| 89 | `photo_service.initialized` | Kept — boot signal, low volume. |
| 76 | `realtime.connect` / 74 `realtime.disconnect` | Kept — operator can disable per-event log sampling later if needed. |
| 53 | `email.resend.sent` | Kept — outbound delivery audit trail. |
| 44 × multiple boot events | `workers.initialized`, `server_start`, `monitoring.scheduler_started`, etc. | All boot-time events ≈44 entries each = matches 44 PM2 restart events recorded in `pm2.log` over the sample period. **No anomaly.** |

## Changes shipped

1. **`apps/api/src/app.ts`** — error handler middleware splits `api.error` log level by HTTP status: 4xx client errors log at `debug`, 5xx server errors continue at `warn`. Comment cites the AC#5 finding and explains the 76% noise share rationale.
2. **`apps/api/src/workers/email.worker.ts`** — `email.digest.flush_started` and `email.digest.flush_empty` info → debug. `email.digest.flush_skipped` (budget exhaustion) stays at warn since it's an actionable operator signal.

## Projected noise reduction (next sample)

- **Warn level:** ~331 → ~80 (76% reduction). Remaining warn entries will be CSP + captcha + token-blacklist (real signals).
- **Info level:** ~4,652 → ~2,510 (46% reduction). Remaining info dominated by `email.worker.job_completed` + boot events.
- **Error level:** unchanged (no current production bugs identified).

## Items NOT addressed within the 2-hour timebox

None. Both surfaced patterns covered. **No infinite-tinker scope.**

## Validation pending (added 2026-05-08 per code-review M3)

The 76% / 46% reductions above are **projected**, not observed. The fix lands in the same commit as this story closure, so the next sample window after deploy will show the actual reduction. Operator follow-up:

- **24-48h post-deploy:** capture another 5,000-line histogram via the same command (`pm2 logs oslsr-api --lines 5000 --nostream --raw`), parse level + event counts, and compare to the projection. Add a "## Observed reduction" section below this doc with the deltas. Acceptable variance: ±10% on warn count, ±5% on info count (digest cycle noise is deterministic; auth-refresh noise depends on active staff session count which is bounded).
- **If observed reduction is materially below projection** (>10% gap on warn, >5% on info), open a `9-10c-ac5-followup` ticket investigating whether a third log-source is overlooked (e.g. csp_violation rate post-Story-9-8 enforcement, or a regression in the 4xx warn→debug routing).
- **If observed matches projection,** no follow-up needed — the AC#5 fix is verified and this doc is the final artifact.

The validation is operator-deferred (not gating Story 9-10 closure) because the projected reductions are based on direct event-frequency math from the audit sample, not modelled extrapolation.

## Cross-story callbacks (informational, not in 9-10 scope)

- **Story 9-8 callback:** 78 csp_violation entries since 2026-04-26 (Phase 2 deploy). Story 9-8 close-out doc said the close-out window 2026-05-01→2026-05-03 was clean, but post-window violations have accumulated. Recommend operator runs Part (c) of `docs/follow-ups/2026-05-04-cloudflare-waf-pm2-csp-review.md` and either (a) classifies the new tuples per Story 9-8 AC#6 or (b) opens a Story 9-8b follow-up ticket if the violations indicate enforcing-CSP gaps that the 1-week post-promotion window didn't surface.
- **Story 9-11 callback (informational):** the 17 `api.error.unknown` errors from 2026-05-03 12:00 UTC have a stack landing in `audit-log-viewer.service.ts:312` (the listAuditLogs SELECT query). The query SQL prints fine but no PG `cause` is logged — pino is missing the underlying PG error message. Recommend a low-priority Story 9-11b ticket to enrich the global error handler with `err.cause` extraction so future audit-log query failures (if any) surface root cause instead of just the SQL text.
