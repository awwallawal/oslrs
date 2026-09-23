# Ops Activity Monitoring — enumerators and the jingle

**Purpose:** one place to answer *"what is actually happening?"* without re-deriving a query each
time. Every figure quoted in a status report or a presentation should come from here, so that two
people asking the same question get the same number.

**Created 2026-09-17.** Consolidates the ad-hoc queries used across the 09-14 → 09-17 incident work.

> ⚠️ **Read-only by construction.** Every block sets `default_transaction_read_only=on`. If a block
> ever needs to write, it does not belong in this file.

> ⛔ **A zero from a query that has never returned non-zero is not evidence.** Several blocks below
> carry a **positive control** — a second count that MUST be non-zero. If the control is zero, the
> query is broken or pointed at the wrong data; do not report the headline figure.

---

## 0. Prerequisites

```bash
ssh root@100.93.100.28      # Tailscale
```

All DB blocks run through the container; `psql` is not installed on the host:

```
docker exec -e PGOPTIONS='-c default_transaction_read_only=on' oslsr-postgres \
  psql -U oslsr_user -d oslsr_db -P pager=off -c "<SQL>"
```

Logs are pm2's, retained about 14 days:

```
~/.pm2/logs/oslsr-api-out__YYYY-MM-DD_00-00-00.log
```

⚠️ **Retention is the binding constraint on every log figure.** The jingle-week traffic data was
lost exactly this way (handoff §9a). If a number matters, capture it before it ages out.

---

## 1. ENUMERATOR — the roster (who is actually working)

```sql
SELECT split_part(u.email,'+',1) AS person, u.status,
       COALESCE(to_char(u.last_login_at,'MM-DD HH24:MI'),'never') AS last_login,
       COALESCE(c.n,0) AS captured, COALESCE(to_char(c.last,'MM-DD'),'-') AS last_capture
FROM users u
LEFT JOIN (SELECT submitter_id, count(*) n, max(created_at) last
           FROM respondents WHERE source='enumerator' GROUP BY 1) c
  ON c.submitter_id = u.id::text
WHERE u.email LIKE '%+test@%' AND u.email NOT LIKE 'lawalkolade%'
ORDER BY COALESCE(c.n,0) DESC, u.last_login_at DESC NULLS LAST;
```

**How to read it.** `status = invited` means the invitation was never completed. `last_login = never`
with `status = active` is the dangerous one: **setup finished, account unused** — and per §0.1a that
usually means they cannot guess their own login address, not that they lost interest.

⛔ **`captured` joins on `submitter_id`, which has NO foreign key.** If an account is ever deleted
its captures vanish from this report silently (§0.9b). The roster is not a safe basis for a delete.

## 2. ENUMERATOR — daily throughput and coverage

```sql
SELECT r.created_at::date AS day, split_part(u.email,'+',1) AS person,
       r.lga_id, count(*) AS captured
FROM respondents r LEFT JOIN users u ON u.id::text = r.submitter_id
WHERE r.source='enumerator' AND r.created_at > now() - interval '14 days'
GROUP BY 1,2,3 ORDER BY 1 DESC, 4 DESC;
```

**Benchmark, measured 2026-09-16:** one enumerator captured 14 people between 05:06 and 07:54 —
**about one every 12 minutes**, sustained, single LGA. Use that as the realistic per-person rate when
sizing a cohort; do not use a theoretical figure.

## 2a. ENUMERATOR — GPS coverage, per person per day (Story 13-71)

⛔ **`u.email NOT LIKE 'lawalkolade%'` IS NOT OPTIONAL AND IS NOT COSMETIC.** Nine of the 28
enumerator accounts on prod are the operator's own harness logins (`+demo1/2/3`, `+enum1`, `+test`,
`+testenumerator`, `+testenumeratornew`, `+testfour`, and the bare address); seven of them have
logged in. Leaving them in is precisely how the go-live gate's F2 came to read **13.5%** when real
field coverage was **11.4%** — two `ZZSMOKE` operator captures sat in the window and one carried
GPS. ⚠️ **The `+test` suffix does NOT separate the two populations**: `bashiratfasasi+test` is a real
enumerator and `lawalkolade+test` is the operator. **Ownership is the discriminator, not the suffix.**

```sql
SELECT s.submitted_at::date                                   AS day,
       split_part(u.email,'+',1)                              AS person,
       count(*)                                               AS submissions,
       count(s.gps_latitude)                                  AS with_gps,
       round(100.0 * count(s.gps_latitude) / count(*), 1)     AS pct,
       round(percentile_cont(0.5) WITHIN GROUP
             (ORDER BY s.gps_accuracy)::numeric, 1)           AS median_acc_m,
       count(*) FILTER (WHERE s.gps_unavailable_reason='permission_denied')     AS denied,
       count(*) FILTER (WHERE s.gps_unavailable_reason='position_unavailable')  AS unavail,
       count(*) FILTER (WHERE s.gps_unavailable_reason='timeout')               AS timeout,
       count(*) FILTER (WHERE s.gps_unavailable_reason='unsupported')           AS unsupported,
       count(*) FILTER (WHERE s.gps_unavailable_reason='other')                 AS other,
       count(*) FILTER (WHERE s.gps_latitude IS NULL
                          AND s.gps_unavailable_reason IS NULL)                 AS unexplained
FROM submissions s
JOIN users u ON u.id::text = s.submitter_id
WHERE s.source = 'enumerator'
  AND u.email NOT LIKE 'lawalkolade%'          -- ⛔ see above
  AND s.submitted_at > now() - interval '14 days'
GROUP BY 1,2
ORDER BY 1 DESC, 3 DESC;
```

The same thing as one number, for the weekly read:

```sql
SELECT count(*)                                            AS submissions,
       count(s.gps_latitude)                               AS with_gps,
       round(100.0 * count(s.gps_latitude) / count(*), 1)  AS pct,
       count(DISTINCT s.submitter_id)                      AS enumerators,
       count(DISTINCT s.submitter_id) FILTER (WHERE s.gps_latitude IS NOT NULL) AS enum_with_gps
FROM submissions s
JOIN users u ON u.id::text = s.submitter_id
WHERE s.source = 'enumerator'
  AND u.email NOT LIKE 'lawalkolade%'
  AND s.submitted_at > now() - interval '7 days';
```

### How to read it

⭐ **`unexplained` is the column to watch, and it is the one that did not exist before.** It counts
submissions with NO position and NO reason — the state that was previously *every* GPS-less
submission, because "did not tap the button" and "tapped and was refused" were the same absent
value. After this story deploys, an enumerator submission can only reach that state through a path
the requirement does not cover, so **a non-zero `unexplained` on post-deploy rows is a defect report,
not a coverage statistic.** (A14 — a zero must say which kind of zero it is.) Rows submitted BEFORE
the deploy are all unexplained and always will be; they are not back-fillable.

**`denied` is the one that needs a human, not a fix.** A browser "Block" is STICKY per origin and the
re-prompt path is buried in site settings (risk R-a), so a phone that appears here needs someone to
walk its owner through unblocking it. It will not recover on its own, and it will keep appearing
every day until it does.

`median_acc_m` separates a satellite fix from a network one. A person whose median sits in the
hundreds of metres is being located by cell tower, and their captures cannot distinguish a base from
a neighbourhood even though they count as coverage.

### The deploy-day prediction — WRITTEN DOWN BEFORE IT RUNS

> **Recorded 2026-09-20, before 13-71 was deployed. Do not edit this line after the fact.**
>
> **Baseline: 11.4% — 4 of 35 genuine field enumerator submissions carried coordinates**, measured
> 2026-09-20 by adjudication over the 7-day window, operator captures excluded. ⚠️ The raw query
> without the `lawalkolade%` exclusion returns **13.5% (5 of 37)** and that figure is wrong; if a
> re-measurement reproduces 13.5% it has forgotten the exclusion.
>
> **Prediction: GPS-carrying enumerator submissions reach >90% within one week of deploy.**
>
> **Anything in between is a UX failure to INVESTIGATE, not a success to declare.** The mechanism is
> automatic capture on form open, so the arithmetic is nearly binary: the population that fails is
> the population whose browser refused, and `denied` + `unavailable` + `timeout` should account for
> essentially all of the shortfall. If the shortfall is instead concentrated in `unexplained`, the
> requirement is being bypassed somewhere and that is a code defect. If it is concentrated in
> `denied`, the rollout prompted badly on those phones and they need the R-a manual fix.
> [[pattern-predict-then-compare]]
>
> ⚠️ **Minimum sample before either verdict is quoted: N ≥ 20 submissions from ≥ 5 distinct
> enumerators.** One row moves the percentage by roughly three points at present volumes, so a
> smaller sample cannot distinguish >90% from 11.4% honestly.

---

## 3. ENUMERATOR — who cannot get in, and why (the §0.1a monitor)

```bash
grep -h 'auth.login_failed' ~/.pm2/logs/oslsr-api-out__2026-*.log \
  | grep -oh '"reason":"[a-z_]*"' | sort | uniq -c

grep -h 'user_not_found' ~/.pm2/logs/oslsr-api-out__2026-*.log \
  | grep -oh '"email":"[^"]*"' | sort | uniq -c | sort -rn | head -20
```

⭐ **This is the single most valuable block in this file.** It is the ONLY place a locked-out person
is visible. A wrong ADDRESS never reaches a password check, so `users.failed_login_attempts` stays
**0** and the account looks merely unused.

**The tells:**
- an address WITHOUT the `+test` suffix → §0.1a; the person cannot guess their login
- an address ending `+@gmail.com` → they were told there is a plus and do not know what follows
- many distinct addresses from one IP → possible enumeration; cross-check the IP

**Positive control:** `auth.login_success` must be non-zero over the same window. If it is zero,
either nothing is reaching login or the grep is wrong.

## 4. LIMITERS — is anyone being refused?

```bash
grep -oh '"event":"[a-z_.]*\(rate_limit\|ip_blocked\|flood\)[a-z_]*"' \
  ~/.pm2/logs/oslsr-api-*.log | sort | uniq -c | sort -rn

grep -oh '"keyedBy":"[a-z]*"' ~/.pm2/logs/oslsr-api-*.log | sort | uniq -c
```

**How to read `keyedBy`** (added by stories 13-68 and the 09-15/16 limiter fixes) — it tells you
whether a refusal hit ONE person or EVERYONE behind an address, without reverse-DNS:

| value | meaning |
|---|---|
| `email` / `token` | a per-person budget — usually the person's own retries |
| `ip` | **a shared budget.** Several distinct people refused on one IP is the proxy signature |

⛔ **The proxy signature is a LARGE refusal count over a SMALL number of distinct IPs.** 244
refusals from six addresses (2026-09-07/08) was not abuse; it was Opera Mini. Check distinct IPs
before concluding attack.

## 5. JINGLE / PUBLIC — registrations, and whether they finished

```sql
SELECT created_at::date AS day, source, count(*)
FROM respondents WHERE created_at > now() - interval '30 days'
GROUP BY 1,2 ORDER BY 1 DESC, 3 DESC;

SELECT created_at::date AS day, count(*) AS drafts_started
FROM wizard_drafts WHERE created_at > now() - interval '30 days'
GROUP BY 1 ORDER BY 1 DESC;
```

**How to read it.** `source='public'` is self-registration (the jingle's audience);
`source='enumerator'` is fieldwork. **Never quote the two as one number** — they measure different
programmes.

⚠️ **`source` DEFAULTS to `'enumerator'`**, so a row written by a path that never sets it is
mislabelled. Confirm with `submitter_id`: an enumerator capture has one, a public registration does
not.

⛔ **A large single-day count may be an import, not people.** 2026-09-05 shows **8,278** — that was
the 13-67 association backfill. Check `import_batch_id IS NOT NULL` before celebrating.

**Drafts vs completions** is the conversion signal: drafts are partials, so
`drafts_started` alongside completed rows for the same day gives arrivals vs finishers.

**Baselines, measured:** organic 1–3/day. Jingle week 1 peaked at **19/day** (48 in week 1).
2026-09-15 saw 13 public in one day across 7 LGAs with 7 drafts started.

## 6. Which registrations came from a campaign

```sql
SELECT created_at::date AS day, count(*) FILTER (WHERE metadata ? 'thankyou_referral_sent_at') AS referral_touched,
       count(*) AS total
FROM respondents WHERE source='public' AND created_at > now() - interval '30 days'
GROUP BY 1 ORDER BY 1 DESC;
```

⚠️ **Attribution caveat, and it matters for any public claim:** the jingle lift was clean only
because **zero email blasts ran during week 1** — so radio was the sole variable. Once blasts
resume, that isolation is gone and a rise cannot be attributed to radio without a control.

## 7. One-glance health

```sql
SELECT (SELECT count(*) FROM users WHERE email LIKE '%+test@%' AND last_login_at IS NOT NULL) AS enumerators_logged_in,
       (SELECT count(*) FROM respondents WHERE source='enumerator') AS total_enumerator_captures,
       (SELECT count(*) FROM respondents WHERE source='public') AS total_public,
       (SELECT count(*) FROM users WHERE locked_until > now()) AS accounts_locked_now,
       (SELECT count(*) FROM users WHERE failed_login_attempts > 0) AS accounts_with_failures;
```

⛔ **`accounts_with_failures` is NOT a measure of login trouble.** On 2026-09-17 it read **1**, while
the logs showed **32 failed attempts across seven people** — because a wrong address never reaches a
password check. **Use §3 for login trouble; this column only sees wrong PASSWORDS, never wrong
ADDRESSES.**
