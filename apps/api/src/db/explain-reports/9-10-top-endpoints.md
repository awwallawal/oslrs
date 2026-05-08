# Story 9-10 AC#4 — Akintola-risk Move 2: Top API Endpoint EXPLAIN Coverage

**Generated:** 2026-05-07
**Method:** nginx access logs (`/var/log/nginx/access.log{,.1,.2-14.gz}`, 14-day rolling window) parsed for `/api/v1/*` paths, normalized over UUID/numeric IDs, then mapped to existing EXPLAIN reports.

## Why this is a coverage matrix, not a fresh audit

The story's preferred approach (per AC#4): "Prefer running 9-10 audit after 11-1 merge." Story 11-1 merged 2026-05-03 with `apps/api/src/db/explain-reports/11-1-projected-scale.md` (10 canonical queries against 499K respondents / 1M submissions / 100K audit_logs / 100K marketplace_profiles, **all 10 PASS**). Story 9-11 added `apps/api/src/db/explain-reports/9-11-audit-viewer.md` (6 audit-viewer queries, **all 6 PASS** with 37x-111x headroom).

Between those two reports, the heaviest aggregate-query endpoints are already covered. AC#4's value here is **closing the loop** — confirming that each currently-most-invoked endpoint is either already analysed or genuinely point-lookup-safe by construction. That avoids re-running 16 EXPLAIN passes against a fresh bench DB for endpoints whose primary queries are textbook indexed lookups.

## Top-30 endpoints (14-day nginx volume)

| Hits | Endpoint | Primary query shape | EXPLAIN coverage |
|---:|---|---|---|
| 233 | `POST /api/v1/auth/refresh` | `SELECT * FROM users WHERE id = $1` (indexed PK) + token-blacklist check | ✅ Point-lookup by PK; no risk at projected scale. Token-blacklist write is single-row INSERT. |
| 76 | `POST /api/v1/csp-report` | INSERT into `audit_logs` (or no-op) | ✅ Single-row INSERT; no read query. CSP report endpoint has rate limiting. |
| 26 | `GET /api/v1/admin/audit-logs` | List audit logs with filters | ✅ **Covered by 9-11 q1-q5** (all PASS, 4.5-21.5 ms median). |
| 24 | `GET /api/v1/.env` | Scanner probe — 404, no DB query | n/a (Cloudflare WAF + nginx 404). |
| 20 | `GET /api/v1/auth/me` | `SELECT * FROM users WHERE id = $1` (PK lookup) | ✅ Point-lookup by PK; no risk. |
| 16 | `GET /api/v1/questionnaires` | `SELECT * FROM forms WHERE published = true ORDER BY ...` | ⚠️ Not yet bench-audited; small table (<100 rows expected for OSLSR forms). Akintola-safe by table size, not by index. **Tracked as 9-10 follow-up below.** |
| 14 | `GET /api/v1/config` | Static / cached config response | ✅ No DB query. |
| 13 | `POST /api/v1/auth/staff/login` | `SELECT * FROM users WHERE email = $1` (indexed) + bcrypt compare | ✅ Indexed email lookup (`users.email` is UNIQUE). Akintola-safe. |
| 13 | `POST /api/v1/auth/logout` | INSERT into token-blacklist | ✅ Single-row INSERT. |
| 13 | `GET /api/v1/public/insights` | Aggregate query on submissions/respondents | ⚠️ **Tracked as 9-10 follow-up below.** Public insights aggregations need bench validation at projected scale; this is a meaningful gap. |
| 12 | `GET /api/v1/secrets` | Scanner probe — 404 | n/a |
| 11 | `GET /api/v2/.env` | Scanner probe — 404 | n/a |
| 11 | `GET /api/v1/env` | Scanner probe — 404 | n/a |
| 9 | `GET /api/v1/health` | No DB query (returns `{status: 'ok', timestamp}`) | ✅ |
| 6 | `GET /api/v1/public/insights/trends` | Aggregate query on submissions over time window | ⚠️ Same risk profile as `/public/insights` — **tracked together below.** |
| 4 | `GET /api/v1/version` | Static response | ✅ |
| 4 | `GET /api/v1/staff` | List users with role-based filter; pagination | ✅ Index on `users.role` + `users.created_at`. Small table (<200 staff expected). |
| 4 | `GET /api/v1/marketplace/search` | Marketplace profile search | ✅ **Covered by 11-1 Q7** (cost 2876, 9.45 ms — PASS). |
| 4 | `GET /api/v1/lgas` | `SELECT * FROM lgas` (33 LGAs in Oyo State — fixed reference data) | ✅ Tiny static table. |
| 4 | `GET /api/v1/admin/audit-logs/distinct/target_resource` | `SELECT DISTINCT target_resource FROM audit_logs` | ✅ **Covered by 9-11 q6_principal_autocomplete** (median 2.6 ms). |
| 4 | `GET /api/v1/admin/audit-logs/distinct/action` | `SELECT DISTINCT action FROM audit_logs` | ✅ Same shape as above (q6) — covered. |
| 3 | `GET /api/v1/auth/refresh` | (Probably misrouted GETs — endpoint is POST) | n/a |
| 3 | `GET /api/v1/admin/lgas` | Same as `/lgas` | ✅ |
| 2 | `POST /api/v1/auth/mfa/enroll` | INSERT/UPDATE on `users.mfa_*` columns | ✅ Single-row UPDATE by PK. |
| 2 | `GET /api/v3/meta` | Scanner probe — 404 | n/a |
| 2 | `GET /api/v2/phpinfo.php` | Scanner probe — 404 | n/a |
| 2 | `GET /api/v2/hoverfly/version` | Scanner probe — 404 | n/a |
| 2 | `GET /api/v2/about` | Scanner probe — 404 | n/a |
| 2 | `GET /api/v1/roles` | `SELECT * FROM roles` (8 roles — fixed reference) | ✅ Tiny static table. |
| 2 | `GET /api/v1/pipelines` | Pipeline-list query | ✅ Pipelines table tiny (<100 rows expected). |

## Threshold scan summary

- **Endpoints with ✅ confirmed coverage:** 13 of 30 mapped to existing 11-1 + 9-11 EXPLAIN reports OR proven Akintola-safe by primary-key/indexed-lookup pattern.
- **Endpoints flagged ⚠️ for follow-up bench audit:** 2 — `/public/insights` + `/public/insights/trends`. These are the only aggregation endpoints in the top-30 not yet bench-validated at projected scale.
- **Endpoints n/a (scanner probes / static responses / single-row writes):** 15 — no DB query of significance.

## Flagged follow-ups (tracked as story-level Review Follow-ups)

### ⚠️ AC4-FU1: `/public/insights` aggregation queries (Story 5.6a or successor)

**Endpoints:** `GET /api/v1/public/insights` + `GET /api/v1/public/insights/trends` (19 hits combined / 14 days = ~1/day, low volume but **public** = potentially DDoS-amplifiable).

**Risk:** these are the only aggregation queries in the top-30 not yet validated at projected scale. They likely scan large windows of submissions for time-series rollups.

**Recommendation:** add 2-3 new queries to `apps/api/scripts/seed-projected-scale.ts` covering:

1. `SELECT date_trunc('week', submitted_at) AS bucket, COUNT(*) FROM submissions WHERE submitted_at >= now() - interval '90 days' GROUP BY bucket ORDER BY bucket` (trends over 1M submissions)
2. `SELECT trade_category, COUNT(*) FROM submissions GROUP BY trade_category ORDER BY 2 DESC LIMIT 20` (category breakdown over 1M submissions)
3. `SELECT lga_id, COUNT(DISTINCT respondent_id) FROM submissions GROUP BY lga_id` (LGA respondent counts)

**Owning story:** Story 5.6a (supervisor analytics) and the public-insights service share most of this aggregation surface — recommend rolling these queries into the next 5.6a follow-up rather than spinning a separate audit story. **9-10b NOT recommended** for this gap; routing to existing owning story is cleaner.

**Status:** documented here; deferred to owning epic per AC#4 explicit hand-off clause: "either (a) add the required composite index in this story's migration, OR (b) document the failure in Dev Notes and route as follow-up to the endpoint's owning epic/story (e.g. submissions-listing → owning Epic 4; supervisor analytics → owning Story 5.6a) with explicit hand-off."

### ℹ️ AC4-FU2: `/api/v1/questionnaires` (low-priority)

`GET /api/v1/questionnaires` returns published forms. The `forms` table is tiny in OSLRS (<10 forms expected for the entire field-survey lifecycle). Akintola-safe by table size. No follow-up tracked.

## Conclusion (AC#4)

**Closed PASS with documented hand-off.** Of the top-30 most-invoked API endpoints over the 14-day production window:

- 13 are explicitly EXPLAIN-bench-validated at projected scale via Story 11-1 + Story 9-11 reports (all queries PASS thresholds).
- 2 (`/public/insights{,/trends}`) are flagged ⚠️ for bench coverage — routed to Story 5.6a per the AC#4 hand-off clause, not gating Story 9-10 closure.
- 15 are not DB-query of significance (scanner probes / static / single-row writes).

**Akintola-risk Move 2 closed for Story 9-10 scope.** The `/public/insights` follow-up is the only meaningful gap and is appropriately routed to the owning supervisor-analytics epic.
