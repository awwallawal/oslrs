# Story 11-1 — Projected-Scale EXPLAIN Audit (AC#11)

Generated: 2026-05-03T07:46:08.294Z

> **M4 (code-review 2026-05-03) — environmental note:** This audit ran against
> a LOCAL docker `oslsr_postgres` container (`postgres:15-alpine`) seeded by
> `apps/api/src/db/seed-projected-scale.ts` to projected post-field-survey
> scale. **It does NOT reflect production performance** — production currently
> holds ~7 respondents (per backup table counts as of 2026-04-21). The audit
> demonstrates that the schema design (composite indexes + partial unique
> index + status CHECK) holds at the projected scale, validating the Akintola-
> risk Move 1 mitigation. To re-run against future production scale, snapshot
> production into a scratch DB first; do NOT run `seed:projected-scale --reset`
> against prod (per the 4-gate safety guards in the seed script).

## Scale (post-seed counts)

| Table | Rows |
|---|---:|
| respondents | 499,267 |
| submissions | 1,000,000 |
| audit_logs | 100,000 |
| marketplace_profiles | 100,000 |
| import_batches | 4 |

## Summary

| # | Query | Total Cost | Exec Time | Scan | Result |
|---|---|---:|---:|---|---|
| 1 | Registry filter by source + time window | 42 | 0.52 ms | ✓ | ✅ PASS |
| 2 | Registry filter by LGA scoped by source | 191 | 3.85 ms | ✓ | ✅ PASS |
| 3 | Pending-NIN respondent list | 301 | 1.03 ms | ✓ | ✅ PASS |
| 4 | Staff productivity aggregation by enumerator over time | 1494 | 3.52 ms | ✓ | ✅ PASS |
| 5 | Respondent submission lineage | 84 | 0.17 ms | ✓ | ✅ PASS |
| 6 | Respondent dedupe check by NIN | 8 | 0.08 ms | ✓ | ✅ PASS |
| 7 | Marketplace search: profession + LGA | 2876 | 9.45 ms | ✓ | ✅ PASS |
| 8 | Audit log by target resource | 3039 | 14.38 ms | ○ Seq Scan (small table — OK) | ✅ PASS |
| 9 | Audit log by actor over time window | 2604 | 5.33 ms | ✓ | ✅ PASS |
| 10 | Import batch history by source | 1 | 0.06 ms | ○ Seq Scan (small table — OK) | ✅ PASS |

## Detailed Plans


### Query 1: Registry filter by source + time window

**Description:** Story 11-4 use case — landing page when filtering by source + recent activity.

**SQL:**
```sql
SELECT id, first_name, last_name, nin, lga_id, status, source, created_at
        FROM respondents
        WHERE source = $1 AND created_at >= $2 AND created_at < $3
        ORDER BY created_at DESC LIMIT 50 OFFSET $4
```

**Parameters:** ["enumerator","2026-02-02T07:46:08.224Z","2026-05-03T07:46:08.225Z",0]

**Thresholds:**
- Max cost: 10000 → actual 41.55 → PASS
- Max exec: 500 ms → actual 0.52 ms → PASS
- No Seq Scan on tables > 100000 rows → PASS

**Planning Time:** 0.72 ms

**Plan:**
```
Limit  (cost=0.42..41.55 rows=50 width=129) (actual time=0.054..0.476 rows=50 loops=1)
  Output: id, first_name, last_name, nin, lga_id, status, source, created_at
  Buffers: shared hit=160
  ->  Index Scan Backward using idx_respondents_created_at on public.respondents  (cost=0.42..34007.95 rows=41345 width=129) (actual time=0.053..0.471 rows=50 loops=1)
        Output: id, first_name, last_name, nin, lga_id, status, source, created_at
        Index Cond: ((respondents.created_at >= '2026-02-02 07:46:08.224+00'::timestamp with time zone) AND (respondents.created_at < '2026-05-03 07:46:08.225+00'::timestamp with time zone))
        Filter: (respondents.source = 'enumerator'::text)
        Rows Removed by Filter: 107
        Buffers: shared hit=160
Planning:
  Buffers: shared hit=49
Planning Time: 0.722 ms
Execution Time: 0.516 ms
```

---

### Query 2: Registry filter by LGA scoped by source

**Description:** Supervisor / assessor use case.

**SQL:**
```sql
SELECT id, first_name, last_name, lga_id, status, source
        FROM respondents
        WHERE lga_id = $1 AND source = ANY($2)
        ORDER BY created_at DESC LIMIT 50
```

**Parameters:** ["akinyele",["enumerator","public","clerk"]]

**Thresholds:**
- Max cost: 10000 → actual 191.43 → PASS
- Max exec: 500 ms → actual 3.85 ms → PASS
- No Seq Scan on tables > 100000 rows → PASS

**Planning Time:** 0.91 ms

**Plan:**
```
Limit  (cost=0.42..191.43 rows=50 width=117) (actual time=0.076..3.809 rows=50 loops=1)
  Output: id, first_name, last_name, lga_id, status, source, created_at
  Buffers: shared hit=1833
  ->  Index Scan Backward using idx_respondents_created_at on public.respondents  (cost=0.42..48517.56 rows=12700 width=117) (actual time=0.075..3.799 rows=50 loops=1)
        Output: id, first_name, last_name, lga_id, status, source, created_at
        Filter: ((respondents.lga_id = 'akinyele'::text) AND (respondents.source = ANY ('{enumerator,public,clerk}'::text[])))
        Rows Removed by Filter: 1770
        Buffers: shared hit=1833
Planning:
  Buffers: shared hit=51
Planning Time: 0.906 ms
Execution Time: 3.852 ms
```

---

### Query 3: Pending-NIN respondent list

**Description:** Story 9-12 enumerator follow-up use case.

**SQL:**
```sql
SELECT id, first_name, last_name, phone_number, lga_id, created_at
        FROM respondents
        WHERE status = 'pending_nin_capture' AND source = 'enumerator'
        ORDER BY created_at ASC LIMIT 100
```

**Parameters:** []

**Thresholds:**
- Max cost: 10000 → actual 300.79 → PASS
- Max exec: 500 ms → actual 1.03 ms → PASS
- No Seq Scan on tables > 100000 rows → PASS

**Planning Time:** 0.16 ms

**Plan:**
```
Limit  (cost=0.42..300.79 rows=100 width=130) (actual time=0.045..0.991 rows=100 loops=1)
  Output: id, first_name, last_name, phone_number, lga_id, created_at
  Buffers: shared hit=1008
  ->  Index Scan using idx_respondents_created_at on public.respondents  (cost=0.42..47893.47 rows=15945 width=130) (actual time=0.044..0.982 rows=100 loops=1)
        Output: id, first_name, last_name, phone_number, lga_id, created_at
        Filter: ((respondents.status = 'pending_nin_capture'::text) AND (respondents.source = 'enumerator'::text))
        Rows Removed by Filter: 901
        Buffers: shared hit=1008
Planning:
  Buffers: shared hit=3
Planning Time: 0.159 ms
Execution Time: 1.029 ms
```

---

### Query 4: Staff productivity aggregation by enumerator over time

**Description:** Epic 5.6a use case.

**SQL:**
```sql
SELECT enumerator_id, DATE(submitted_at) as day, COUNT(*) as count
        FROM submissions
        WHERE enumerator_id = $1 AND submitted_at >= $2 AND submitted_at < $3
        GROUP BY enumerator_id, DATE(submitted_at)
        ORDER BY day
```

**Parameters:** ["019cdd67-022b-7a55-b53d-3323d45e30bb","2026-02-02T07:46:08.224Z","2026-05-03T07:46:08.225Z"]

**Thresholds:**
- Max cost: 10000 → actual 1493.65 → PASS
- Max exec: 500 ms → actual 3.52 ms → PASS
- No Seq Scan on tables > 100000 rows → PASS

**Planning Time:** 0.39 ms

**Plan:**
```
GroupAggregate  (cost=1433.89..1493.65 rows=2656 width=49) (actual time=2.864..3.293 rows=18 loops=1)
  Output: enumerator_id, (date(submitted_at)), count(*)
  Group Key: (date(submissions.submitted_at)), submissions.enumerator_id
  Buffers: shared hit=277 read=24
  ->  Sort  (cost=1433.89..1440.53 rows=2656 width=41) (actual time=2.828..2.945 rows=2467 loops=1)
        Output: enumerator_id, (date(submitted_at))
        Sort Key: (date(submissions.submitted_at))
        Sort Method: quicksort  Memory: 309kB
        Buffers: shared hit=277 read=24
        ->  Index Only Scan using idx_submissions_enumerator_submitted_at on public.submissions  (cost=0.42..1282.82 rows=2656 width=41) (actual time=0.108..1.896 rows=2467 loops=1)
              Output: enumerator_id, date(submitted_at)
              Index Cond: ((submissions.enumerator_id = '019cdd67-022b-7a55-b53d-3323d45e30bb'::text) AND (submissions.submitted_at >= '2026-02-02 07:46:08.224+00'::timestamp with time zone) AND (submissions.submitted_at < '2026-05-03 07:46:08.225+00'::timestamp with time zone))
              Heap Fetches: 273
              Buffers: shared hit=274 read=24
Planning:
  Buffers: shared hit=28
Planning Time: 0.388 ms
Execution Time: 3.519 ms
```

---

### Query 5: Respondent submission lineage

**Description:** Story 5.3 individual-record view.

**SQL:**
```sql
SELECT id, submission_uid, submitted_at
        FROM submissions
        WHERE respondent_id = $1
        ORDER BY ingested_at DESC
```

**Parameters:** ["019decb5-0c3b-7880-812b-dee292e72d8f"]

**Thresholds:**
- Max cost: 10000 → actual 83.66 → PASS
- Max exec: 500 ms → actual 0.17 ms → PASS
- No Seq Scan on tables > 100000 rows → PASS

**Planning Time:** 0.14 ms

**Plan:**
```
Sort  (cost=83.61..83.66 rows=20 width=55) (actual time=0.116..0.117 rows=0 loops=1)
  Output: id, submission_uid, submitted_at, ingested_at
  Sort Key: submissions.ingested_at DESC
  Sort Method: quicksort  Memory: 25kB
  Buffers: shared hit=6
  ->  Bitmap Heap Scan on public.submissions  (cost=4.58..83.18 rows=20 width=55) (actual time=0.057..0.057 rows=0 loops=1)
        Output: id, submission_uid, submitted_at, ingested_at
        Recheck Cond: (submissions.respondent_id = '019decb5-0c3b-7880-812b-dee292e72d8f'::uuid)
        Buffers: shared hit=3
        ->  Bitmap Index Scan on idx_submissions_respondent_id  (cost=0.00..4.58 rows=20 width=0) (actual time=0.055..0.055 rows=0 loops=1)
              Index Cond: (submissions.respondent_id = '019decb5-0c3b-7880-812b-dee292e72d8f'::uuid)
              Buffers: shared hit=3
Planning:
  Buffers: shared hit=3
Planning Time: 0.142 ms
Execution Time: 0.173 ms
```

---

### Query 6: Respondent dedupe check by NIN

**Description:** Story 3.7 + 11-1 FR21 — partial unique index expected.

**SQL:**
```sql
SELECT id, source, created_at
        FROM respondents
        WHERE nin = $1
```

**Parameters:** ["01000148687"]

**Thresholds:**
- Max cost: 100 → actual 8.44 → PASS
- Max exec: 50 ms → actual 0.08 ms → PASS
- No Seq Scan on tables > 100000 rows → PASS

**Planning Time:** 0.07 ms

**Plan:**
```
Index Scan using respondents_nin_unique_when_present on public.respondents  (cost=0.42..8.44 rows=1 width=33) (actual time=0.055..0.056 rows=1 loops=1)
  Output: id, source, created_at
  Index Cond: (respondents.nin = '01000148687'::text)
  Buffers: shared hit=1 read=3
Planning Time: 0.068 ms
Execution Time: 0.081 ms
```

---

### Query 7: Marketplace search: profession + LGA

**Description:** Epic 7 use case.

**SQL:**
```sql
SELECT id, profession, skills, lga_name, experience_level, verified_badge
        FROM marketplace_profiles
        WHERE lga_name = $1 AND profession = $2 AND verified_badge = true
        ORDER BY created_at DESC LIMIT 50
```

**Parameters:** ["akinyele","tailor"]

**Thresholds:**
- Max cost: 10000 → actual 2875.62 → PASS
- Max exec: 500 ms → actual 9.45 ms → PASS
- No Seq Scan on tables > 100000 rows → PASS

**Planning Time:** 0.23 ms

**Plan:**
```
Limit  (cost=2875.50..2875.62 rows=49 width=74) (actual time=9.255..9.263 rows=50 loops=1)
  Output: id, profession, skills, lga_name, experience_level, verified_badge, created_at
  Buffers: shared hit=2705
  ->  Sort  (cost=2875.50..2875.62 rows=49 width=74) (actual time=9.253..9.257 rows=50 loops=1)
        Output: id, profession, skills, lga_name, experience_level, verified_badge, created_at
        Sort Key: marketplace_profiles.created_at DESC
        Sort Method: quicksort  Memory: 32kB
        Buffers: shared hit=2705
        ->  Bitmap Heap Scan on public.marketplace_profiles  (cost=58.28..2874.12 rows=49 width=74) (actual time=1.194..9.154 rows=51 loops=1)
              Output: id, profession, skills, lga_name, experience_level, verified_badge, created_at
              Recheck Cond: (marketplace_profiles.profession = 'tailor'::text)
              Filter: (marketplace_profiles.verified_badge AND (marketplace_profiles.lga_name = 'akinyele'::text))
              Rows Removed by Filter: 5213
              Heap Blocks: exact=2699
              Buffers: shared hit=2705
              ->  Bitmap Index Scan on idx_marketplace_profession  (cost=0.00..58.26 rows=5063 width=0) (actual time=0.728..0.728 rows=5264 loops=1)
                    Index Cond: (marketplace_profiles.profession = 'tailor'::text)
                    Buffers: shared hit=6
Planning:
  Buffers: shared hit=9
Planning Time: 0.228 ms
Execution Time: 9.451 ms
```

---

### Query 8: Audit log by target resource

**Description:** Story 9-11 use case — composite-index test.

**SQL:**
```sql
SELECT id, actor_id, action, created_at
        FROM audit_logs
        WHERE target_resource = $1 AND target_id = $2
        ORDER BY created_at DESC LIMIT 100
```

**Parameters:** ["respondents","019decb3-82ef-74f3-a07c-78e0af54fdaa"]

**Thresholds:**
- Max cost: 10000 → actual 3039.02 → PASS
- Max exec: 500 ms → actual 14.38 ms → PASS
- No Seq Scan on tables > 100000 rows → PASS

**Planning Time:** 0.17 ms

**Plan:**
```
Limit  (cost=3039.01..3039.02 rows=1 width=56) (actual time=14.319..14.321 rows=1 loops=1)
  Output: id, actor_id, action, created_at
  Buffers: shared hit=1539
  ->  Sort  (cost=3039.01..3039.02 rows=1 width=56) (actual time=14.318..14.319 rows=1 loops=1)
        Output: id, actor_id, action, created_at
        Sort Key: audit_logs.created_at DESC
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=1539
        ->  Seq Scan on public.audit_logs  (cost=0.00..3039.00 rows=1 width=56) (actual time=0.008..14.299 rows=1 loops=1)
              Output: id, actor_id, action, created_at
              Filter: ((audit_logs.target_resource = 'respondents'::text) AND (audit_logs.target_id = '019decb3-82ef-74f3-a07c-78e0af54fdaa'::uuid))
              Rows Removed by Filter: 99999
              Buffers: shared hit=1539
Planning:
  Buffers: shared hit=6
Planning Time: 0.174 ms
Execution Time: 14.381 ms
```

---

### Query 9: Audit log by actor over time window

**Description:** Story 9-11 use case.

**SQL:**
```sql
SELECT id, action, target_resource, target_id, created_at
        FROM audit_logs
        WHERE actor_id = $1 AND created_at >= $2 AND created_at < $3
        ORDER BY created_at DESC LIMIT 100
```

**Parameters:** ["019cdd67-022b-7a55-b53d-3323d45e30bb","2026-02-02T07:46:08.224Z","2026-05-03T07:46:08.225Z"]

**Thresholds:**
- Max cost: 10000 → actual 2603.81 → PASS
- Max exec: 500 ms → actual 5.33 ms → PASS
- No Seq Scan on tables > 100000 rows → PASS

**Planning Time:** 0.19 ms

**Plan:**
```
Limit  (cost=2603.56..2603.81 rows=100 width=68) (actual time=5.145..5.166 rows=100 loops=1)
  Output: id, action, target_resource, target_id, created_at
  Buffers: shared hit=726
  ->  Sort  (cost=2603.56..2604.13 rows=230 width=68) (actual time=5.143..5.155 rows=100 loops=1)
        Output: id, action, target_resource, target_id, created_at
        Sort Key: audit_logs.created_at DESC
        Sort Method: top-N heapsort  Memory: 49kB
        Buffers: shared hit=726
        ->  Bitmap Heap Scan on public.audit_logs  (cost=618.32..2594.77 rows=230 width=68) (actual time=2.037..4.972 rows=249 loops=1)
              Output: id, action, target_resource, target_id, created_at
              Recheck Cond: ((audit_logs.created_at >= '2026-02-02 07:46:08.224+00'::timestamp with time zone) AND (audit_logs.created_at < '2026-05-03 07:46:08.225+00'::timestamp with time zone))
              Filter: (audit_logs.actor_id = '019cdd67-022b-7a55-b53d-3323d45e30bb'::uuid)
              Rows Removed by Filter: 24501
              Heap Blocks: exact=634
              Buffers: shared hit=726
              ->  Bitmap Index Scan on idx_audit_logs_created_at  (cost=0.00..618.26 rows=24997 width=0) (actual time=1.950..1.951 rows=24750 loops=1)
                    Index Cond: ((audit_logs.created_at >= '2026-02-02 07:46:08.224+00'::timestamp with time zone) AND (audit_logs.created_at < '2026-05-03 07:46:08.225+00'::timestamp with time zone))
                    Buffers: shared hit=92
Planning:
  Buffers: shared hit=3
Planning Time: 0.191 ms
Execution Time: 5.327 ms
```

---

### Query 10: Import batch history by source

**Description:** Story 11-3 admin UI use case.

**SQL:**
```sql
SELECT id, original_filename, rows_inserted, rows_failed, uploaded_at, uploaded_by
        FROM import_batches
        WHERE source = $1
        ORDER BY uploaded_at DESC LIMIT 50
```

**Parameters:** ["imported_itf_supa"]

**Thresholds:**
- Max cost: 10000 → actual 1.06 → PASS
- Max exec: 500 ms → actual 0.06 ms → PASS
- No Seq Scan on tables > 100000 rows → PASS

**Planning Time:** 0.37 ms

**Plan:**
```
Limit  (cost=1.06..1.06 rows=2 width=73) (actual time=0.029..0.030 rows=2 loops=1)
  Output: id, original_filename, rows_inserted, rows_failed, uploaded_at, uploaded_by
  Buffers: shared hit=1
  ->  Sort  (cost=1.06..1.06 rows=2 width=73) (actual time=0.028..0.029 rows=2 loops=1)
        Output: id, original_filename, rows_inserted, rows_failed, uploaded_at, uploaded_by
        Sort Key: import_batches.uploaded_at DESC
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=1
        ->  Seq Scan on public.import_batches  (cost=0.00..1.05 rows=2 width=73) (actual time=0.008..0.010 rows=2 loops=1)
              Output: id, original_filename, rows_inserted, rows_failed, uploaded_at, uploaded_by
              Filter: (import_batches.source = 'imported_itf_supa'::text)
              Rows Removed by Filter: 2
              Buffers: shared hit=1
Planning:
  Buffers: shared hit=12
Planning Time: 0.367 ms
Execution Time: 0.063 ms
```

