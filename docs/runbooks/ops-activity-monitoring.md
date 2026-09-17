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
