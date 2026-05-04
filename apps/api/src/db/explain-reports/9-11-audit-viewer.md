# Story 9-11 — Audit Log Viewer Scale Verification (AC#11)

**Generated:** 2026-05-04T08:31:09.535Z
**Bench DB:** `oslsr_bench` (Postgres 15-alpine on local Docker)
**Result:** ✅ PASS — 6/6 queries within threshold

## Methodology

Each query runs 3 times against the seeded bench DB. The first run primes the buffer cache; runs 2-3 capture warm-cache performance. Reported `medianMs` is the median of the three runs to filter cache-warmth and GC noise.

### Bench data distribution (R2-M1 disclosure)

The seed (`scripts/seed-audit-bench.ts`) generates rows with **uniform-random** distribution across actor / consumer / system principals + uniform-random action / target_resource / created_at within the 90-day window. This differs from production where the distribution is expected to be skewed (~95% user-principal, ~5% consumer-principal once Epic 10 ships, ~ε system) and where action distributions follow user-behaviour clusters rather than uniform.

**Implication:** queries that scan-and-filter (q2, q3) read more rows in this bench than they would in production for the same filter, because uniform-random distribution puts ~33% of rows in each principal bucket vs. production's long-tailed distribution. Reported numbers are therefore conservative for the principal-filter shapes — production should be at least this fast, often much faster (smaller selection scan).

**Follow-up (Session 2 or post-field):** add a second bench seed mode with production-skewed distribution (95/5/ε) and re-run; compare numbers to confirm they remain within thresholds. Tracked as story Review Follow-up R2-M1.

## Summary

| Query | Threshold | Run 1 | Run 2 | Run 3 | Median | Result |
|---|---|---|---|---|---|---|
| q1_list_no_filter | < 500 ms | 76.7 ms | 4.5 ms | 3.9 ms | 4.5 ms | ✅ PASS |
| q2_list_principal_consumer | < 500 ms | 760.5 ms | 10.4 ms | 8.9 ms | 10.4 ms | ✅ PASS |
| q3_list_consumer_plus_target | < 800 ms | 51.4 ms | 15.1 ms | 21.5 ms | 21.5 ms | ✅ PASS |
| q4_list_three_filters_plus_date | < 1000 ms | 23.1 ms | 11.1 ms | 9.1 ms | 11.1 ms | ✅ PASS |
| q5_cursor_page_1000 | < 500 ms | 4.8 ms | 4.6 ms | 4.8 ms | 4.8 ms | ✅ PASS |
| q6_principal_autocomplete | < 100 ms | 60.9 ms | 2.6 ms | 2.2 ms | 2.6 ms | ✅ PASS |

## Per-query detail

### q1_list_no_filter

**Description:** List, no filter (last 100 rows DESC).
**Threshold:** < 500 ms
**Median:** 4.5 ms (✅ within threshold)

```
Limit  (cost=0.86..19.68 rows=100 width=225) (actual time=0.288..0.567 rows=100 loops=1)
  Buffers: shared hit=110
  ->  Incremental Sort  (cost=0.86..188211.32 rows=1000000 width=225) (actual time=0.287..0.552 rows=100 loops=1)
        Sort Key: al.created_at DESC, al.id DESC
        Presorted Key: al.created_at
        Full-sort Groups: 4  Sort Method: quicksort  Average Memory: 30kB  Peak Memory: 30kB
        Buffers: shared hit=110
        ->  Nested Loop Left Join  (cost=0.71..143211.32 rows=1000000 width=225) (actual time=0.077..0.421 rows=101 loops=1)
              Buffers: shared hit=110
              ->  Nested Loop Left Join  (cost=0.57..118705.66 rows=1000000 width=208) (actual time=0.060..0.335 rows=101 loops=1)
                    Buffers: shared hit=110
                    ->  Index Scan Backward using idx_audit_logs_created_at on audit_logs al  (cost=0.42..94564.36 rows=1000000 width=195) (actual time=0.024..0.208 rows=101 loops=1)
                          Buffers: shared hit=106
                    ->  Memoize  (cost=0.15..0.16 rows=1 width=29) (actual time=0.001..0.001 rows=1 loops=101)
                          Cache Key: al.actor_id
                          Cache Mode: logical
                          Hits: 99  Misses: 2  Evictions: 0  Overflows: 0  Memory Usage: 1kB
                          Buffers: shared hit=4
                          ->  Index Scan using users_pkey on users u  (cost=0.14..0.15 rows=1 width=29) (actual time=0.010..0.010 rows=1 loops=2)
                                Index Cond: (id = al.actor_id)
                                Buffers: shared hit=4
              ->  Memoize  (cost=0.14..0.16 rows=1 width=33) (actual time=0.000..0.000 rows=0 loops=101)
                    Cache Key: al.consumer_id
                    Cache Mode: logical
                    Hits: 100  Misses: 1  Evictions: 0  Overflows: 0  Memory Usage: 1kB
                    ->  Index Scan using api_consumers_pkey on api_consumers c  (cost=0.13..0.15 rows=1 width=33) (actual time=0.014..0.014 rows=0 loops=1)
                          Index Cond: (id = al.consumer_id)
Planning:
  Buffers: shared hit=6
Planning Time: 0.595 ms
Execution Time: 0.761 ms
```

### q2_list_principal_consumer

**Description:** List, principal=consumer only.
**Threshold:** < 500 ms
**Median:** 10.4 ms (✅ within threshold)

```
Limit  (cost=1.25..58.38 rows=100 width=225) (actual time=4.916..5.099 rows=100 loops=1)
  Buffers: shared hit=5732
  ->  Incremental Sort  (cost=1.25..113104.80 rows=197967 width=225) (actual time=4.914..5.091 rows=100 loops=1)
        Sort Key: al.created_at DESC, al.id DESC
        Presorted Key: al.created_at
        Full-sort Groups: 4  Sort Method: quicksort  Average Memory: 32kB  Peak Memory: 32kB
        Buffers: shared hit=5732
        ->  Nested Loop Left Join  (cost=0.71..104196.29 rows=197967 width=225) (actual time=4.810..5.035 rows=101 loops=1)
              Buffers: shared hit=5732
              ->  Nested Loop Left Join  (cost=0.57..99344.51 rows=197967 width=208) (actual time=4.787..4.974 rows=101 loops=1)
                    Buffers: shared hit=5726
                    ->  Index Scan Backward using idx_audit_logs_created_at on audit_logs al  (cost=0.42..94564.36 rows=197967 width=195) (actual time=4.707..4.857 rows=101 loops=1)
                          Filter: (consumer_id IS NOT NULL)
                          Rows Removed by Filter: 5580
                          Buffers: shared hit=5726
                    ->  Memoize  (cost=0.15..0.16 rows=1 width=29) (actual time=0.001..0.001 rows=0 loops=101)
                          Cache Key: al.actor_id
                          Cache Mode: logical
                          Hits: 100  Misses: 1  Evictions: 0  Overflows: 0  Memory Usage: 1kB
                          ->  Index Scan using users_pkey on users u  (cost=0.14..0.15 rows=1 width=29) (actual time=0.041..0.041 rows=0 loops=1)
                                Index Cond: (id = al.actor_id)
              ->  Memoize  (cost=0.14..0.16 rows=1 width=33) (actual time=0.000..0.000 rows=1 loops=101)
                    Cache Key: al.consumer_id
                    Cache Mode: logical
                    Hits: 98  Misses: 3  Evictions: 0  Overflows: 0  Memory Usage: 1kB
                    Buffers: shared hit=6
                    ->  Index Scan using api_consumers_pkey on api_consumers c  (cost=0.13..0.15 rows=1 width=33) (actual time=0.007..0.007 rows=1 loops=3)
                          Index Cond: (id = al.consumer_id)
                          Buffers: shared hit=6
Planning:
  Buffers: shared hit=6
Planning Time: 0.566 ms
Execution Time: 5.226 ms
```

### q3_list_consumer_plus_target

**Description:** List, principal=consumer AND target_resource=respondents.
**Threshold:** < 800 ms
**Median:** 21.5 ms (✅ within threshold)

```
Limit  (cost=4.56..406.81 rows=100 width=225) (actual time=15.394..16.464 rows=100 loops=1)
  Buffers: shared hit=9101
  ->  Incremental Sort  (cost=4.56..99863.29 rows=24825 width=225) (actual time=15.393..16.447 rows=100 loops=1)
        Sort Key: al.created_at DESC, al.id DESC
        Presorted Key: al.created_at
        Full-sort Groups: 4  Sort Method: quicksort  Average Memory: 32kB  Peak Memory: 32kB
        Buffers: shared hit=9101
        ->  Nested Loop Left Join  (cost=0.57..98746.16 rows=24825 width=225) (actual time=14.682..16.312 rows=101 loops=1)
              Join Filter: (al.consumer_id = c.id)
              Rows Removed by Join Filter: 102
              Buffers: shared hit=9101
              ->  Nested Loop Left Join  (cost=0.57..97664.86 rows=24825 width=208) (actual time=14.546..16.088 rows=101 loops=1)
                    Buffers: shared hit=9100
                    ->  Index Scan Backward using idx_audit_logs_created_at on audit_logs al  (cost=0.42..97064.36 rows=24825 width=195) (actual time=14.348..15.758 rows=101 loops=1)
                          Filter: ((consumer_id IS NOT NULL) AND (target_resource = 'respondents'::text))
                          Rows Removed by Filter: 8922
                          Buffers: shared hit=9100
                    ->  Memoize  (cost=0.15..0.16 rows=1 width=29) (actual time=0.002..0.002 rows=0 loops=101)
                          Cache Key: al.actor_id
                          Cache Mode: logical
                          Hits: 100  Misses: 1  Evictions: 0  Overflows: 0  Memory Usage: 1kB
                          ->  Index Scan using users_pkey on users u  (cost=0.14..0.15 rows=1 width=29) (actual time=0.179..0.180 rows=0 loops=1)
                                Index Cond: (id = al.actor_id)
              ->  Materialize  (cost=0.00..1.04 rows=3 width=33) (actual time=0.001..0.001 rows=2 loops=101)
                    Buffers: shared hit=1
                    ->  Seq Scan on api_consumers c  (cost=0.00..1.03 rows=3 width=33) (actual time=0.091..0.092 rows=3 loops=1)
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=6
Planning Time: 0.751 ms
Execution Time: 16.689 ms
```

### q4_list_three_filters_plus_date

**Description:** List, principal=user + action=ANY + target_resource + date range.
**Threshold:** < 1000 ms
**Median:** 11.1 ms (✅ within threshold)

```
Limit  (cost=21.73..2155.17 rows=100 width=225) (actual time=1.596..5.472 rows=100 loops=1)
  Buffers: shared hit=5072
  ->  Incremental Sort  (cost=21.73..72451.90 rows=3395 width=225) (actual time=1.595..5.457 rows=100 loops=1)
        Sort Key: al.created_at DESC, al.id DESC
        Presorted Key: al.created_at
        Full-sort Groups: 4  Sort Method: quicksort  Average Memory: 29kB  Peak Memory: 29kB
        Buffers: shared hit=5072
        ->  Nested Loop Left Join  (cost=0.42..72299.13 rows=3395 width=225) (actual time=0.058..5.352 rows=101 loops=1)
              Join Filter: (al.consumer_id = c.id)
              Rows Removed by Join Filter: 303
              Buffers: shared hit=5072
              ->  Nested Loop Left Join  (cost=0.42..72150.36 rows=3395 width=208) (actual time=0.045..5.259 rows=101 loops=1)
                    Join Filter: (al.actor_id = u.id)
                    Rows Removed by Join Filter: 276
                    Buffers: shared hit=5071
                    ->  Index Scan Backward using idx_audit_logs_created_at on audit_logs al  (cost=0.42..71669.19 rows=3395 width=195) (actual time=0.026..5.074 rows=101 loops=1)
                          Index Cond: ((created_at >= '2026-02-03 08:31:08.446+00'::timestamp with time zone) AND (created_at <= '2026-05-04 08:31:08.455+00'::timestamp with time zone))
                          Filter: ((actor_id IS NOT NULL) AND (target_resource = 'respondents'::text) AND (action = ANY ('{auth.login,pii.view_record,data.update}'::text[])))
                          Rows Removed by Filter: 4928
                          Buffers: shared hit=5070
                    ->  Materialize  (cost=0.00..1.15 rows=10 width=29) (actual time=0.000..0.001 rows=4 loops=101)
                          Buffers: shared hit=1
                          ->  Seq Scan on users u  (cost=0.00..1.10 rows=10 width=29) (actual time=0.005..0.009 rows=7 loops=1)
                                Buffers: shared hit=1
              ->  Materialize  (cost=0.00..1.04 rows=3 width=33) (actual time=0.000..0.000 rows=3 loops=101)
                    Buffers: shared hit=1
                    ->  Seq Scan on api_consumers c  (cost=0.00..1.03 rows=3 width=33) (actual time=0.002..0.003 rows=3 loops=1)
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=11
Planning Time: 0.510 ms
Execution Time: 5.650 ms
```

### q5_cursor_page_1000

**Description:** List with cursor at page 1000 (DESC tuple comparison).
**Threshold:** < 500 ms
**Median:** 4.8 ms (✅ within threshold)

```
Limit  (cost=0.87..20.49 rows=100 width=225) (actual time=0.262..0.533 rows=100 loops=1)
  Buffers: shared hit=112
  ->  Incremental Sort  (cost=0.87..194638.13 rows=992034 width=225) (actual time=0.260..0.519 rows=100 loops=1)
        Sort Key: al.created_at DESC, al.id DESC
        Presorted Key: al.created_at
        Full-sort Groups: 4  Sort Method: quicksort  Average Memory: 31kB  Peak Memory: 31kB
        Buffers: shared hit=112
        ->  Nested Loop Left Join  (cost=0.71..149996.60 rows=992034 width=225) (actual time=0.088..0.424 rows=101 loops=1)
              Buffers: shared hit=112
              ->  Nested Loop Left Join  (cost=0.57..125686.14 rows=992034 width=208) (actual time=0.066..0.320 rows=101 loops=1)
                    Buffers: shared hit=106
                    ->  Index Scan Backward using idx_audit_logs_created_at on audit_logs al  (cost=0.42..101737.15 rows=992034 width=195) (actual time=0.042..0.210 rows=101 loops=1)
                          Index Cond: (created_at <= '2026-05-01 08:31:08.455+00'::timestamp with time zone)
                          Filter: (ROW(created_at, id) < ROW('2026-05-01 08:31:08.455+00'::timestamp with time zone, '00000000-0000-0000-0000-000000000000'::uuid))
                          Buffers: shared hit=104
                    ->  Memoize  (cost=0.15..0.16 rows=1 width=29) (actual time=0.001..0.001 rows=0 loops=101)
                          Cache Key: al.actor_id
                          Cache Mode: logical
                          Hits: 99  Misses: 2  Evictions: 0  Overflows: 0  Memory Usage: 1kB
                          Buffers: shared hit=2
                          ->  Index Scan using users_pkey on users u  (cost=0.14..0.15 rows=1 width=29) (actual time=0.011..0.011 rows=0 loops=2)
                                Index Cond: (id = al.actor_id)
                                Buffers: shared hit=2
              ->  Memoize  (cost=0.14..0.16 rows=1 width=33) (actual time=0.001..0.001 rows=1 loops=101)
                    Cache Key: al.consumer_id
                    Cache Mode: logical
                    Hits: 97  Misses: 4  Evictions: 0  Overflows: 0  Memory Usage: 1kB
                    Buffers: shared hit=6
                    ->  Index Scan using api_consumers_pkey on api_consumers c  (cost=0.13..0.15 rows=1 width=33) (actual time=0.005..0.005 rows=1 loops=4)
                          Index Cond: (id = al.consumer_id)
                          Buffers: shared hit=6
Planning:
  Buffers: shared hit=26
Planning Time: 1.023 ms
Execution Time: 0.738 ms
```

### q6_principal_autocomplete

**Description:** Principal autocomplete (ILIKE %query% across users.full_name + api_consumers.name).
**Threshold:** < 100 ms
**Median:** 2.6 ms (✅ within threshold)

```
Append  (cost=1.14..2.23 rows=2 width=63) (actual time=0.078..0.083 rows=0 loops=1)
  Buffers: shared hit=2
  ->  Limit  (cost=1.14..1.14 rows=1 width=61) (actual time=0.041..0.042 rows=0 loops=1)
        Buffers: shared hit=1
        ->  Sort  (cost=1.14..1.14 rows=1 width=61) (actual time=0.040..0.041 rows=0 loops=1)
              Sort Key: users.full_name
              Sort Method: quicksort  Memory: 25kB
              Buffers: shared hit=1
              ->  Seq Scan on users  (cost=0.00..1.12 rows=1 width=61) (actual time=0.018..0.020 rows=0 loops=1)
                    Filter: ((full_name IS NOT NULL) AND (full_name ~~* '%est%'::text))
                    Rows Removed by Filter: 10
                    Buffers: shared hit=1
  ->  Limit  (cost=1.05..1.06 rows=1 width=65) (actual time=0.036..0.037 rows=0 loops=1)
        Buffers: shared hit=1
        ->  Sort  (cost=1.05..1.06 rows=1 width=65) (actual time=0.035..0.035 rows=0 loops=1)
              Sort Key: api_consumers.name
              Sort Method: quicksort  Memory: 25kB
              Buffers: shared hit=1
              ->  Seq Scan on api_consumers  (cost=0.00..1.04 rows=1 width=65) (actual time=0.013..0.013 rows=0 loops=1)
                    Filter: ((status <> 'terminated'::text) AND (name ~~* '%est%'::text))
                    Rows Removed by Filter: 3
                    Buffers: shared hit=1
Planning:
  Buffers: shared hit=2
Planning Time: 0.170 ms
Execution Time: 0.290 ms
```
