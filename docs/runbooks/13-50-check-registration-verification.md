# 13-50 — `/check-registration` dead-end link: post-deploy verification

**What this is.** The re-runnable evidence for story 13-50 AC3. Every claim the story's Residuals
ledger makes about prod resolves to one of the queries below. None of them can run before deploy —
they are [[pattern-verification-that-cannot-run-yet]], handed to an operator with a reopen trigger
rather than closed on a pre-deploy zero.

**Access** (project memory): `ssh root@100.93.100.28` (Tailscale IP — MagicDNS does not resolve
in-shell) → `docker exec -it oslsr-postgres psql -U oslsr_user -d oslsr_db`.

> ⚠️ **`psql` and `redis-cli` are not installed on the host.** Go through `docker exec`.

---

## R1 — AC3.1: the dead-end stock is 0, and STAYS 0

The stock returning is the signal that AC1 branched on the wrong condition. Run it **once right
after deploy**, then **again after a full day of jingle traffic**. One reading is not a trend.

```sql
-- Live wizard_resume tokens bound to an ADOPTED respondent.
-- After 13-50 this must be 0: /check-registration is the only surface that binds a
-- wizard_resume to a respondent_id, and it no longer mints that purpose for a complete record.
SELECT count(*) AS live_dead_end_tokens
FROM magic_link_tokens t
JOIN respondents r ON r.id = t.respondent_id
WHERE t.purpose   = 'wizard_resume'
  AND t.used_at   IS NULL
  AND t.expires_at > now()
  AND r.metadata->>'adopted_by' = '13-49';
```

**Wider form — do not skip it.** The strict query above joins on `respondent_id`, which the
adoption programme's own invitations leave NULL. If a NEW producer appears that mints by email
only, the strict query reads 0 while the stock grows. This one sees both:

```sql
SELECT count(*) AS live_dead_end_tokens_by_email
FROM magic_link_tokens t
WHERE t.purpose    = 'wizard_resume'
  AND t.used_at    IS NULL
  AND t.expires_at > now()
  AND lower(t.email) IN (
        SELECT lower(s.raw_data->>'email')
        FROM respondents r
        JOIN submissions s ON s.respondent_id = r.id
        WHERE r.metadata->>'adopted_by' = '13-49'
          AND s.raw_data->>'email' IS NOT NULL
      );
```

⚠️ **A non-zero on the wider query with a zero on the strict one is not noise** — it means a
producer minted a resume link for an adopted person WITHOUT binding it to their record, which is a
different defect from the one 13-50 fixed. Reopen and find the producer; do not just expire the
stock. That treadmill is what 13-49 R5 already ran once.

## R2 — AC2: the blind spot is closed, and the mints are now attributable

Before 13-50 this returned rows for `login` and `pending_nin_complete` only. `wizard_resume` — a
whole purpose — was invisible. After deploy every mint writes a row and every row names its cause.

```sql
-- The picture AC2 exists to make available. "86 wizard_resume today" was the number that took
-- five screens to find; this is that number on the first one.
SELECT details->>'purpose' AS purpose,
       details->>'trigger' AS trigger,
       count(*)            AS mints
FROM audit_logs
WHERE action = 'magic_link.issued'
  AND created_at > now() - interval '1 day'
GROUP BY 1, 2
ORDER BY mints DESC;
```

**The AC2 pass condition, stated so it is falsifiable:** `check_registration_status` must appear
with purposes `login` and/or `pending_nin_complete`, and **must not appear with `wizard_resume`
for a respondent whose status is `active`, `imported_unverified` or `pending_nin_capture`**.
Such a row means AC1's branch is not executing on prod — the fix shipped and never fired
([[pattern-ship-a-fix-that-never-fires]]).

> ⚠️ **CORRECTED BY CODE REVIEW 2026-08-24 (M1) — THIS TRIGGER USED TO CONTRADICT RESIDUAL R5.**
> It read *"a single `(wizard_resume, check_registration_status)` row means AC1's branch is not
> executing"*. But R5 **accepts** that `nin_unavailable` keeps `wizard_resume` from this surface,
> and `statusLinkPurposeFor('nin_unavailable') === 'wizard_resume'` is pinned by a test. So the
> first `nin_unavailable` person to check their status would have fired a **false reopen**, and an
> operator following this runbook would have concluded the story shipped dead. Scope the query by
> status, below, and read R5 before reopening anything.

```sql
-- The one-line version of that assertion. Any row here is a reopen.
-- ⚠️ EXCLUDES the statuses R5 leaves on wizard_resume ON PURPOSE (`nin_unavailable` and any
-- future status nobody has ruled on). Widening this back to "any wizard_resume" re-creates the
-- false reopen described above.
SELECT count(*) AS branch_not_firing
FROM audit_logs a
JOIN respondents r ON r.id = (a.details->>'respondentId')::uuid
WHERE a.action = 'magic_link.issued'
  AND a.details->>'trigger' = 'check_registration_status'
  AND a.details->>'purpose' = 'wizard_resume'
  AND r.status IN ('active', 'imported_unverified', 'pending_nin_capture');
```

```sql
-- The COMPANION count, and it is not a defect — it is R5's accepted exposure, measured.
-- If this grows, that is the signal R5 names: a `nin_unavailable` person has nowhere good to land.
SELECT r.status, count(*) AS resume_links_from_status_check
FROM audit_logs a
JOIN respondents r ON r.id = (a.details->>'respondentId')::uuid
WHERE a.action = 'magic_link.issued'
  AND a.details->>'trigger' = 'check_registration_status'
  AND a.details->>'purpose' = 'wizard_resume'
GROUP BY 1 ORDER BY 2 DESC;
```

## R3 — AC3.2: the reopen trigger, now that it is queryable

⚠️ **READ THIS BEFORE QUOTING A ZERO.** The story recorded this trigger as "any `NIN_DUPLICATE` in
the audit log from an adopted person. **Currently 0**." That zero was not evidence of anything:
until 13-50, `NIN_DUPLICATE` was thrown as a 409 from `registration.controller.ts` and written
**nowhere** — no audit row, and no `submissions` row either, because the throw happens before the
insert. The trigger was watching a table that could not contain the thing it watched for, and would
have read 0 on a day the dead-end fired a thousand times.

`registration.nin_duplicate_blocked` (added by 13-50) is what makes it real. **The pre-13-50 zero
is unknowable and must not be quoted as a baseline** — the true baseline starts at deploy.

```sql
-- Any adopted person who has been told "This NIN is already registered".
-- Non-empty = the dead-end is still reachable somehow. REOPEN 13-50.
SELECT a.created_at,
       a.target_id                    AS existing_respondent_id,
       r.reference_code,
       a.details->>'trigger'          AS trigger,
       a.details->>'path'             AS path
FROM audit_logs a
JOIN respondents r ON r.id = a.target_id
WHERE a.action = 'registration.nin_duplicate_blocked'
  AND r.metadata->>'adopted_by' = '13-49'
ORDER BY a.created_at DESC;
```

```sql
-- The whole population, not just the adopted slice. Useful as a rate: a NIN_DUPLICATE from
-- ANY already-registered person is the same experience, it just isn't 13-50's cohort.
SELECT date_trunc('day', created_at) AS day,
       details->>'trigger'           AS trigger,
       count(*)                      AS blocked
FROM audit_logs
WHERE action = 'registration.nin_duplicate_blocked'
GROUP BY 1, 2
ORDER BY 1 DESC;
```

## R4 — AC1.3 sanity: `wizard_resume` is still alive where it should be

The branch was on registration completeness, not on the purpose. If this returns nothing after a
blast or a recovery run, 13-50 disabled more than it meant to.

```sql
SELECT details->>'trigger' AS trigger, count(*)
FROM audit_logs
WHERE action = 'magic_link.issued'
  AND details->>'purpose' = 'wizard_resume'
GROUP BY 1 ORDER BY 2 DESC;
```

Expected triggers here: `draft_adoption_invite`, `reengagement_blast`,
`recover_abandoned_wizard_drafts`, `operator_manual_mint`. **Not** `check_registration_status`.
