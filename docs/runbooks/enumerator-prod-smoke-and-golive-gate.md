# Enumerator Prod Smoke & the Media-Spend Go/No-Go Gate

**Story:** 13-4 · **Created:** 2026-08-06 · **Owner:** Awwal (operator) · **Runs on:** prod, via Tailscale

> **This does not fork the launch process.** `docs/runbooks/pre-launch-operator-runbook.md` remains the
> ordered runway ("what next"). This runbook is the **spend gate** that sits across it: the
> conditions that must be green before radio / paid social is bought, plus the procedure for the one
> item nobody has ever actually exercised at scale — the enumerator path.
>
> ⚠️ **This gate was authored with FOUR items and now has SEVEN.** `docs/roadmap-to-launch.md`
> § *Pre-flight gate* is **canonical**; this table is its operator-facing form, and it had drifted
> three items behind (item 5 was added there by 13-46 on 2026-07-30 and never propagated here).
> Harmonised 2026-08-21 (John/PM). **Add a gate item in both places in the same pass** —
> [[pattern-a-record-about-the-work-is-not-the-work]].
>
> Campaign hub: `docs/runbooks/re-engagement-campaign-launch.md` · Teardown recipe this one extends:
> `docs/runbooks/pre-blast-dry-run.md` §5.

---

## §0 — Provisioning an enumerator account (recorded live, 2026-09-05)

This runbook began at "you have an enumerator". §0 is the step before it, written by actually doing
it on prod rather than from reading the code — the two disagreed twice, and both disagreements are
recorded below.

### 0.1 The five inputs, and the two that are not obvious

| field | value | note |
|---|---|---|
| `fullName` | `Lawal Kolade (TEST ENUMERATOR)` | Put the word TEST in the NAME. It is the only marker visible to someone reading a dashboard who does not know the email convention. |
| `email` | `lawalkolade+test@gmail.com` | **Plus-addressing.** Delivers to the existing inbox — no new mailbox to create. Survives the app's normalisation (emails are only lowercased and trimmed; nothing strips `+`). |
| `phone` | `+2348000000001` | ⚠️ **`users.phone` is UNIQUE.** Every account needs its own. Reserved sentinel series for test staff: `+234800000000X`. Verified free before use. |
| `roleId` | `019c899b-6ccf-7b55-8c04-49dec8280e45` | enumerator |
| `lgaId` | `019c899b-6d7e-7ed3-bc7b-53b96b48a72d` | Ibadan North |

⛔ **`lgaId` IS MANDATORY FOR ENUMERATORS, despite being `.optional()` in the schema.** The Zod
schema says `lgaId: z.string().uuid().optional()` — "optional for state-wide" — but
`staff.service.ts:866` throws `LGA_REQUIRED` for the enumerator role. Discovered by the create call
failing, not by reading the type. **There is no state-wide enumerator.** Decide each person's LGA
before you start; it is not a field you can leave for later.

### 0.2 The call

Operator path is **Super Admin → Staff** (`/staff`), which posts to `POST /api/v1/staff/manual`
(super_admin only). Server-side equivalent, used here because the operator UI was not the path under
test:

```ts
await StaffService.createManual(
  { fullName, email, phone, roleId, lgaId },
  actorId,   // the super_admin performing it — this lands in audit_logs
);
```

Bulk: `POST /api/v1/staff/import`, CSV columns **`full_name, email, phone, role_name, lga_name`** —
role and LGA by NAME, not UUID, which is what makes a 20-row sheet writable by hand.

### 0.3 What was actually created

```
userId      : 01a0733b-5f22-7776-8f2f-7239b31324e8
email       : lawalkolade+test@gmail.com
status      : invited
emailStatus : pending          <- QUEUED, not sent. See 0.4.
invited_at  : 2026-09-05 20:21:05+00
```

### 0.4 Proving the invitation actually arrived — and the wrong turn taken here

`emailStatus: "pending"` means the job was **queued to BullMQ**, not that mail was sent. The first
check grepped the API logs for the address and found nothing, and this runbook nearly recorded "the
email did not send". **It had.** The worker logs key on `userId`, not the address:

```
email-worker    email.job.completed  jobId=8265 type=staff-invitation userId=01a0733b…
resend-webhook  resend_webhook.recorded  type=sent       campaignId=staff-invitation
resend-webhook  resend_webhook.recorded  type=delivered  campaignId=staff-invitation
```

⭐ **Grep the logs by `userId`, not by email.** And treat `delivered` from the Resend webhook as the
proof — `sent` only means Resend accepted it.

### 0.5 ⏰ THE 48-HOUR CLOCK — the constraint that shapes a 20-person rollout

⚠️ **CORRECTED 2026-09-08. This section said 24 hours until now** — the window was raised to 48 on
2026-09-06 (`INVITATION_EXPIRY_HOURS`, deploy `45cae26`) and this runbook was not updated in the same
pass. An operator following the stale text would have provisioned a whole cohort a day earlier than
necessary. [[pattern-a-record-about-the-work-is-not-the-work]], in the document that exists to stop
exactly that.

The invitation expires **`INVITATION_EXPIRY_HOURS` after `invited_at`** — currently **48**, hard,
not from first click and not extendable. ⚠️ **Do not re-type the number into this runbook.** It is
one constant in `apps/api/src/config/invitation.ts`, deliberately, because it used to be written
five times across two files: three that set what the email PROMISES and two that ENFORCE it, so
changing one made the system lie. Read the constant.

**Still do NOT bulk-create a cohort days ahead.** 48 hours covers a weekend, not a week. Provision
them the morning people are ready to activate, or the trial opens with
`POST /api/v1/staff/:userId/resend-invitation` calls that are themselves rate-limited
(`RESEND_LIMIT_TTL` = 24h).

Check who has not activated:

```sql
-- Interval must match INVITATION_EXPIRY_HOURS. If you edit one, edit both.
SELECT email, invited_at, invited_at + interval '48 hours' AS expires_at,
       round(extract(epoch FROM (invited_at + interval '48 hours' - now()))/3600, 1) AS hours_left
FROM users WHERE status = 'invited' ORDER BY invited_at;
```

### 0.6 The teardown key — capture it NOW, not at teardown

⚠️ **Delete by `submitter_id`, never by matching the email string.** The `+test` tail is the
human-readable marker; the **user id is the join key**. The reason is already on prod: four earlier
test enumerators exist and their addresses are `+enum1`, `+testenumerator`, `+testenumeratornew`,
`+testfour` — **`+enum1` does not match `%+test%`**. One inconsistent address and a string-based
teardown silently misses a whole enumerator's rows.

Record every id at creation. The chain that makes teardown possible:
`respondents.submitter_id` → `users.id` → `users.email` (verified on prod).

```sql
-- The trial cohort, as ids. Paste the list into the teardown; do not re-derive it by pattern.
SELECT u.id, u.email, u.full_name FROM users u
JOIN roles r ON r.id = u.role_id
WHERE r.name = 'enumerator' AND u.email LIKE '%+test%';
```

⚠️ **Bound the teardown by TIME as well as submitter** — `AND created_at BETWEEN <trial start> AND
<trial end>`. The day a trial account is reused for real work, its genuine registrations would
otherwise match the delete.

⚠️ **TEARDOWN IS CHILD-FIRST, AND IT CHANGED ON 2026-09-05.** The importer now writes a `submissions`
row per respondent and `submissions.respondent_id` is a plain FK with **no cascade**. Deleting
respondents first raises a foreign-key violation and leaves the whole set behind. Delete
`submissions`, then `respondents`. (Found the hard way in the API integration suite the same day.)

⚠️ **`audit_logs` are append-only by trigger and are NEVER deleted.** Teardown removes the people;
the permanent record that they were created and removed remains, and an auditor can see it. That is
correct and honest — know it rather than discover it.

### 0.7 What a trial does and does not disturb on the public page

Verified against the live payload 2026-09-05:

- **Accounts alone are publicly invisible.** `/insights` carries no staff or enumerator counts. Twenty
  accounts move nothing a citizen can see.
- **The headline absorbs practice rows.** At **8,662** registered, ~100 practice rows is a **1.2%**
  wobble. At 387 the same rows would have been a 26% spike and a visible collapse. The scale is the
  cover, and it only arrived with the association import.
- ⚠️ **The thin cells do NOT absorb them.** `PUBLIC_MIN_N = 10`, and published cells sit exactly on it
  today — `akinyele/teaching = 10`, `itesiwaju/livestock = 10`, `event_planning = 10`. If practice
  rows cluster 10+ in one LGA×trade, a **new cell appears on the public map and vanishes at
  teardown**; a genuine 9-person cell pushed to 10 will blink into view and back out.
  **Brief the trial: vary LGA and trade, and prefer dense trades** (`farming` 4,654, `livestock`
  2,619 swallow anything). Natural spread across 33 LGAs does most of this — the failure mode is
  twenty people in one room reaching for the same default.

### 0.9 The trial cohort — ids, onboarding tracker, and the teardown query

Provisioned **2026-09-06 08:18 UTC**: 17 enumerators from the OYO STATE LABOUR REGISTRY WhatsApp
group, plus the operator test account from 0.3. All 17 invitations **delivered** (confirmed by
Resend `delivered` webhooks, not merely queued).

**Invitation deadline — 48h from creation:** the 17 expire **2026-09-08 08:18 UTC**; the operator
account, created a day earlier, expires **2026-09-07 20:21 UTC**.

⚠️ **THE ID LIST IS THE KEY. The email pattern is a convenience, not the selector.** Today
`email LIKE '%+test@%'` happens to select exactly these 18 and correctly excludes the four earlier
test enumerators (`+enum1`, `+testenumerator`, `+testenumeratornew`, `+testfour` — none of which
contain the literal `+test@`). That is luck, not design: `+enum1` carries no "test" at all, so one
inconsistent address in a future cohort makes a pattern-based teardown silently miss a whole
enumerator's rows. **Paste the ids. Do not re-derive the cohort by pattern.**

| user id | test account | LGA |
|---|---|---|
| `01a0733b-5f22-7776-8f2f-7239b31324e8` | lawalkolade+test@gmail.com | Ibadan North |
| `01a075cc-0a52-760f-a55d-7548f0d47054` | zjbadmus+test@gmail.com | Oluyole |
| `01a075cc-0a8d-749b-a20b-e117dfc89d31` | olayiwolaprecious109+test@gmail.com | Ibadan South-West |
| `01a075cc-0aa8-78fe-b76d-be11041e8c5b` | atitebiesther948+test@gmail.com | Ibadan South-West |
| `01a075cc-0ac2-750b-9c20-a6b4ab08d49b` | bashiratfasasi+test@gmail.com | Lagelu |
| `01a075cc-0ad6-763d-86c0-0132e000008d` | checkadetola+test@gmail.com | Egbeda |
| `01a075cc-0aed-7efa-afea-98e28d175e8a` | folashadeasmau+test@gmail.com | Ibadan North-West |
| `01a075cc-0b11-744c-b2da-7f8736784d56` | badmusalia2+test@gmail.com | Oluyole |
| `01a075cc-0b24-79cd-a621-ef6649c9882d` | ferdew31+test@gmail.com | Ona Ara |
| `01a075cc-0b37-7505-b606-d9f4512b2a1d` | uthmanayo07+test@gmail.com | Egbeda |
| `01a075cc-0b47-79da-bfd5-60b60a4ac7be` | koyebimpe2011+test@gmail.com | Ido |
| `01a075cc-0b57-7a24-b7f9-256519151d38` | anuoluwapo568+test@gmail.com | Ido |
| `01a075cc-0b73-79c5-aa4c-c5ae1bd7b722` | faaizbadmus+test@gmail.com | Ibadan North |
| `01a075cc-0b84-747a-b2b7-5d1866d8473f` | victoriakilanko023+test@gmail.com | Ibadan North-East |
| `01a075cc-0b97-7f06-92d2-3ec826d0c9ee` | callmezainab3000+test@gmail.com | Akinyele |
| `01a075cc-0baf-7907-8b8f-4fb59881509c` | badmusboluwatife22+test@gmail.com | Ibadan North |
| `01a075cc-0bd7-7cfa-8b0c-b6c6f7462585` | oladokuncomfort77+test@gmail.com | Lagelu |
| `01a075cc-0bea-7d3d-8092-268d8010d88d` | moboladeidrees+test@gmail.com | Akinyele |

**The id list, ready to paste** — substitute it wherever a query below says `/* the 18 ids */`:

```sql
-- 18 ids: 17 field enumerators + the operator test account.
'01a0733b-5f22-7776-8f2f-7239b31324e8',
  '01a075cc-0a52-760f-a55d-7548f0d47054',
  '01a075cc-0a8d-749b-a20b-e117dfc89d31',
  '01a075cc-0aa8-78fe-b76d-be11041e8c5b',
  '01a075cc-0ac2-750b-9c20-a6b4ab08d49b',
  '01a075cc-0ad6-763d-86c0-0132e000008d',
  '01a075cc-0aed-7efa-afea-98e28d175e8a',
  '01a075cc-0b11-744c-b2da-7f8736784d56',
  '01a075cc-0b24-79cd-a621-ef6649c9882d',
  '01a075cc-0b37-7505-b606-d9f4512b2a1d',
  '01a075cc-0b47-79da-bfd5-60b60a4ac7be',
  '01a075cc-0b57-7a24-b7f9-256519151d38',
  '01a075cc-0b73-79c5-aa4c-c5ae1bd7b722',
  '01a075cc-0b84-747a-b2b7-5d1866d8473f',
  '01a075cc-0b97-7f06-92d2-3ec826d0c9ee',
  '01a075cc-0baf-7907-8b8f-4fb59881509c',
  '01a075cc-0bd7-7cfa-8b0c-b6c6f7462585',
  '01a075cc-0bea-7d3d-8092-268d8010d88d'
```

#### Tracking onboarding — who has actually logged in

`invited` means the email was sent. `active` means they clicked, set a password, and completed the
activation form. Only the second is onboarding.

```sql
-- Progress board. Run this to see who is still outstanding and how long they have left.
SELECT
  u.full_name,
  u.email,
  l.name                                          AS lga,
  u.status,                                       -- invited = not yet onboarded; active = can log in
  (u.invited_at + interval '48 hours')            AS invitation_expires_utc,
  round(extract(epoch FROM (u.invited_at + interval '48 hours' - now()))/3600, 1) AS hours_left,
  u.last_login_at
FROM users u
JOIN roles r ON r.id = u.role_id
LEFT JOIN lgas l ON l.id = u.lga_id
WHERE r.name = 'enumerator' AND u.id IN ( /* the 18 ids */ )
ORDER BY u.status, u.full_name;
```

```sql
-- One-line summary for a standup.
SELECT count(*) FILTER (WHERE status = 'active')  AS onboarded,
       count(*) FILTER (WHERE status = 'invited') AS still_invited,
       count(*)                                    AS cohort
FROM users WHERE id IN ( /* the 18 ids */ );
```

⚠️ **`status = 'active'` means they CAN log in — it does not mean they have.** `last_login_at` is
the column that answers "did they actually get in". A person can complete activation and still fail
at the login screen, and the two are different support problems.

**If someone misses the 48h window:** `POST /api/v1/staff/:userId/resend-invitation`. It mints a
fresh token and a fresh 48h. It is rate-limited per user (`RESEND_LIMIT_TTL` = 24h), so it is not a
button to lean on for a whole cohort — which is the argument for provisioning the morning people are
ready, per 0.5.

#### ⛔ 0.9a — THE TEARDOWN CANNOT RUN BLIND. Observed 2026-09-08, 48 hours in.

**The predicate below would have deleted two REAL, CONSENTING registrants.** This is not a
hypothetical hardening note; it is what the data already looks like.

Two enumerators practised by registering **themselves**, through the correct flow:

| enumerator account | person registered | LGA | when |
|---|---|---|---|
| `oladokuncomfort77+test@gmail.com` | **Comfort Oladokun** | Lagelu | 2026-09-06 20:18 |
| `faaizbadmus+test@gmail.com` | **Faaiz Badmus** | Ibadan North | 2026-09-07 15:20 |

Both match `submitter_id IN (the 18 test ids)` **and** `created_at BETWEEN trial_start AND
trial_end`. Neither carries the `ZZSMOKE` tag. **Tagged rows: 0. Rows from test accounts: 2.**

⚠️ **Bounding by time AND submitter is NOT sufficient, and it is worth being precise about why.**
Those two conditions describe *who typed it and when*. What separates practice data from real data
is **whether a real person consented** — and no column records that. A test account is perfectly
capable of capturing a genuine registrant, which is exactly what these two did, and it is the
sensible way to rehearse.

⭐ **So the teardown produces a LIST first, and a human confirms each row is not a real person
before anything is deleted.** At trial volume that is trivial — 2 rows in 48 hours — and it is
honest about what the data actually is. Deleting a real registrant to tidy up practice data is a
far worse outcome than leaving practice data in the register: the first is a person removed from a
government record they consented to join; the second is a number slightly wrong for a week.

**Run this BEFORE the delete, and read every row:**

```sql
-- Everything a trial account captured. Read the NAMES. Anyone real stays.
SELECT r.id, r.first_name, r.last_name, r.lga_id, r.created_at::timestamp(0),
       u.email AS captured_by,
       (upper(r.last_name) LIKE '%ZZSMOKE%') AS tagged_as_practice
FROM respondents r
JOIN users u ON u.id::text = r.submitter_id
WHERE u.id IN ( /* the 18 ids */ )
  AND r.created_at BETWEEN :trial_start AND :trial_end
ORDER BY r.created_at;
```

Then delete **by explicit id list**, built from that review — never by re-running the predicate.

⚠️ **Tell the enumerators the rule, and tell them EARLY.** Every untagged row created from here on
is undecidable after the fact, and the cost of guessing wrong is deleting a real person. The
message that removes the ambiguity:

> *If you register a real person who agrees to join the register, that is good — tell us, because we
> KEEP those. If you are inventing someone to practise with, put **ZZSMOKE** as the surname so we can
> remove it cleanly afterwards.*

Sent to the group 2026-09-08. Anything captured before that message needs the row-by-row review
above; anything after it should be unambiguous.

#### ⭐ Teardown — child-first, and VERIFIED AS COUNTS BEFORE ANY DELETE

Run the SELECT form first, every time. It is the same predicate as the delete, so a surprising number
here is a surprising delete you have not run yet. Measured 2026-09-06, immediately after
provisioning: **submissions 0, respondents 0, marketplace_profiles 0** — correct, because nobody had
submitted anything. Re-run after the trial; the numbers should match the practice rows you expect,
and if they do not, STOP.

```sql
-- 1. DRY RUN. What would be deleted? Run this, read it, and only then proceed.
WITH cohort AS (
  SELECT u.id::text AS uid FROM users u
  JOIN roles r ON r.id = u.role_id
  WHERE r.name = 'enumerator' AND u.id IN ( /* the 18 ids */ )
), theirs AS (
  SELECT rp.id FROM respondents rp
  WHERE rp.submitter_id IN (SELECT uid FROM cohort)
    AND rp.created_at BETWEEN :trial_start AND :trial_end   -- ⚠️ ALWAYS bound by time
)
SELECT
  (SELECT count(*) FROM submissions          WHERE respondent_id IN (SELECT id FROM theirs)) AS submissions,
  (SELECT count(*) FROM marketplace_profiles WHERE respondent_id IN (SELECT id FROM theirs)) AS marketplace_profiles,
  (SELECT count(*) FROM theirs)                                                              AS respondents;
```

```sql
-- 2. DELETE, child-first. Order is NOT optional.
BEGIN;
-- children first: submissions.respondent_id is a plain FK with NO cascade (since 2026-09-05),
-- so deleting respondents first raises a violation and leaves the whole set behind.
DELETE FROM submissions          WHERE respondent_id IN (SELECT id FROM theirs);
DELETE FROM marketplace_profiles WHERE respondent_id IN (SELECT id FROM theirs);
DELETE FROM respondents          WHERE id             IN (SELECT id FROM theirs);
-- Check the row counts against the dry run BEFORE committing.
COMMIT;   -- or ROLLBACK if anything surprised you
```

⚠️ **BOUND IT BY TIME, not only by submitter.** The day a trial account is promoted to real work, its
genuine registrations match `submitter_id` too. `:trial_start` / `:trial_end` are what stop the
teardown eating real data.

⚠️ **The ACCOUNTS are not deleted by this.** Teardown removes the practice DATA; the 18 users stay so
`audit_logs` (append-only, FK to the actor) remains intact. Retire an account with
`POST /api/v1/staff/:userId/deactivate`, not a `DELETE`.

⚠️ **`audit_logs` are never removed.** The permanent record that these rows were created and deleted
survives and is visible to an auditor. Correct and honest — know it rather than discover it.

#### ⚠️ Resend rate limit — 7 of 17 failed on the first attempt

Creating 17 accounts in a tight loop outran the mail provider: **7 invitation jobs failed with
`Too many requests. You can only make 10 requests per second`.**

All 7 recovered — BullMQ retried and all 17 show `email.job.completed` with 17 `delivered` webhooks.
**But that only worked because invitations go through a QUEUE.** A loop calling the mail provider
directly would have silently dropped 7 of 17: the accounts would exist, look perfectly healthy in the
database, and seven people would sit waiting for an email that was never going to arrive.

⭐ **So: after any bulk provisioning, COUNT the completions — do not assume the creations imply them.**

```sql
-- Anyone provisioned but with no invitation actually delivered is invisible in `users`.
-- There is no delivery column, so cross-check the worker log by userId:
--   pm2 logs oslsr-api --lines 4000 --nostream | grep "email.job.completed.*staff-invitation.*<id>"
-- Expect one line per account. Missing = resend that user.
```

### 0.8 Handover to §B

The account is `invited`. The person clicks the activation URL **within the invitation window (48h — see 0.5)**, sets a password,
and lands as `active`. From there §B's test-data protocol applies unchanged — and it should be read
BEFORE the first submission, not after.

## 🚦 The gate — buy no media until all seven are green

| # | Gate item | How to verify | Verdict |
|---|---|---|---|
| 1 | **Prod happy-path self-serve verified** — one fresh, real end-to-end public submission | Run `pre-launch-operator-runbook.md` **Step 5b** in a real browser against the form pinned *at blast time*. PASS = summary reached once, Submit enabled on first arrival. Then confirm the row landed: `§A query 1` with `source='public'`. | ⬜ GREEN ⬜ RED |
| 2 | **Enumerator path proven on prod** — 5–10 real submissions | This runbook, §B–§E. PASS = ≥5 verified rows, `source='enumerator'`, each with a `submissions` row, **and** the §C household pair yielding **two** respondent rows. | ⬜ GREEN ⬜ RED |
| 3 | **Attribution capture live + verified** (Story 13-1) | ⚠️ **A fresh PUBLIC submission** carries `raw_data->>'campaign_source'`; `§A query 3` returns it non-null **on `source='public'` rows only**. ⛔ **DO NOT run this against enumerator rows.** The acquisition question exists only on the public wizard — on a staff-captured row the enumerator IS the channel, so `campaign_source` is correctly NULL. Reading a null there as a failure is what happened on 2026-08-13: six enumerator rows returned null and gate item 3 was briefly reported as not-green, on entirely correct behaviour. ⚠️ Nulls among PUBLIC rows are also expected — the question is **optional** by ruling R-B; 25 of 291 submissions carry it. Verify with **gate item 1**, not with this run. | ⬜ GREEN ⬜ RED |
| 4 | **Capacity load-test green + static fallback deployed** (Story 13-3) | `docs/runbooks/13-3-launch-capacity-and-fallback.md` + `13-3-cutover-and-failover.md`. PASS = load test green **and** the Cloudflare Pages fallback answers with a confirmed KV round-trip. | ⬜ GREEN ⬜ RED |
| 5 | **Burst controls armed** (Story 13-46) — all four sub-items | `docs/roadmap-to-launch.md` gate item 5. PASS = marketing send cap live (`MARKETING_DAILY_CAP`/`MARKETING_MONTHLY_CAP`), the registration-scoped WAF rule armed (`pre-viral-push-checklist.md` §1a), the attribution liveness dry run discharged (`13-3-cutover-and-failover.md` — done 2026-08-21), and the turn-away BEFORE baseline recorded. ⚠️ The dry-run sub-item is **independent of the rest** — discharge it regardless of how much else has shipped. | ⬜ GREEN ⬜ RED |
| 6 | **Per-station vanity paths LIVE + the `?ref` dry run discharged** (Story 13-63, **AC1–AC3 only**) | Load a real vanity URL in a browser; confirm the final URL still carries `?ref=`, **then** confirm `wizard_drafts.form_data.extras.utm.ref` holds the slug. A 302 that lands and a tag that is *captured* are two different claims — assert the second. 🔴 **The target is `/register?ref=<slug>`, NOT `oyoskills.com/?ref=<slug>`** — the apex form is dropped at the first click (`parseUtm` runs only at `WizardPage.tsx:172`, mounted at `/register`), so those rules would redirect correctly and attribute nothing. ⚠️ **PERISHABLE — the only item in this table that cannot be discharged after the fact.** A URL read on air cannot be retrofitted: miss the first spot and the station dimension is gone for the whole flight, across all 11 stations on the buy. 13-63's AC4–AC7 do **not** gate spend. | ⬜ GREEN ⬜ RED |
| 7 | **Write-path capacity evidence at the modelled peak** (Story **13-65**, `review`, authored 2026-08-22 by Bob/SM) | Item 4's green measured a **read** (`GET /api/v1/forms/public-active`); this is the write. One public registration fires **three** synchronous outbound emails (13-46 residual R6, measured on prod 2026-08-21), so the load is ~3N per registration on a 2GB VPS with **no swap** — an OOM kill, not a graceful degrade. Discharge by ANY ONE of: (a) a bounded write-path load test at a stated peak, same rig as 13-3, correct endpoint; (b) queueing the thank-you outreach so the in-request cost falls to the transactional sends; (c) a **written** peak estimate, with its basis, that 13-3's measured headroom bounds. ✍️ **13-65 takes (a) AND (b) together** — it queues ALL THREE registration sends onto the existing `email-notification` queue (unbounded fan-out becomes at most 5 concurrent), then runs the write-path test BEFORE and AFTER so the comparison is the evidence. ⚠️ Claim only what it buys: **bounded concurrency, durability, retry and backpressure — NOT CPU reduction and NOT event-loop isolation**, because all 10 workers run in the API process. ✅ **(c) still stands on its own** if 13-65 slips. ⛔ An unstated estimate is not (c). 🟡 **2026-08-22 — HALF DONE. (b) shipped to `review`; (a) has NOT run.** The three sends are enqueued, the guards moved into the worker with them, and the queue-wide budget-exhaustion **auto-pause was REMOVED** (13-65 review B1): BullMQ's `Queue.pause()` is GLOBAL, so jobs enqueued after a pause land in the paused list and are never dequeued — an exemption inside the processor could only ever help a job already picked up, so an exhausted **marketing** budget still stopped every subsequent citizen **login link**, durably and with manual-only recovery. Budget exhaustion now refuses the offending `standard` job ONLY; the check runs before the provider call, so the spend control is intact. **The queue buys **bounded concurrency, durability, retry and backpressure**; it does **not** reduce total CPU and does **not** give event-loop isolation, because the workers run in the API process.** 📅 The (a) numbers come from the **first real spot, Mon 24 Aug 2026 (Fresh FM, one station, one 60-second spot)**, not from a synthetic prod run that would leave thousands of rows and send thousands of real emails. Method + readings + teardown: `13-3-cutover-and-failover.md` § *Write-path capacity (13-65 AC8)*. ⛔ **Leave this RED until the before/after comparison is recorded there.** | ⬜ GREEN ⬜ RED |

**Neither box ticked = NOT RUN, which is not the same as red and is definitely not green.** An empty
row holds the spend exactly as a red one does; the difference matters only for knowing what is left
to do.

> ⚠️ **PRECONDITION — the AC1b fix must be ON PROD before you start §C.** The exemption ships in
> `submission-processing.service.ts` (story 13-4). If you run the household case against a box that
> predates that deploy, `§A query 4` returns **1** and you will have proved the old bug, not tested
> the new code. Confirm the running SHA first (`cd /root/oslrs && git rev-parse --short HEAD`) and
> check it against the story's **Deploy SHA** line.

### The decision rule

- **ALL SEVEN green → fire radio / paid social.**
- **ANY red → hold the spend.** Radio is movable on **24–48h** notice, which is precisely what gives
  this gate teeth: holding costs a schedule change, firing blind costs the budget.
- A gate item is green only with **evidence recorded in §F** — an ID, a count, a screenshot. "I ran
  it and it looked fine" is not a green box. The 2026-08-05 lesson stands: a monitor reading zero and
  a monitor that never ran look identical.

---

## §A — Verification queries

Access: `ssh root@100.93.100.28` → `docker exec -it oslsr-postgres psql -U oslsr_user -d oslsr_db`.
(psql/redis-cli are **not** installed on the host — go through `docker exec`.)

```sql
-- 1. BASELINE. Capture immediately before you start, and again after teardown.
--    Re-measure; never "restore to N" (§D.5).
SELECT source, status, count(*) FROM respondents GROUP BY 1,2 ORDER BY 1,2;
SELECT count(*) AS total_respondents FROM respondents WHERE status <> 'rolled_back';

-- 2. THE GATE-ITEM-2 EVIDENCE. Every smoke row, with its submissions row proven present.
--    A respondent with no submissions row is a broken pipeline, not a passing one
--    (the 9-26 unified-ingestion invariant).
SELECT r.id           AS respondent_id,
       r.reference_code,
       r.first_name, r.last_name, r.phone_number,
       r.source, r.status, r.submitter_id,
       s.id           AS submission_id,
       s.submission_uid,
       s.questionnaire_form_id,
       s.processed, s.processing_error
FROM respondents r
LEFT JOIN submissions s ON s.respondent_id = r.id
WHERE r.source = 'enumerator'
  AND r.created_at >= '<SMOKE_START_TS>'
ORDER BY r.created_at;

-- 3. ATTRIBUTION (gate item 3) — PUBLIC ROWS ONLY.
--    ⛔ The unbounded version of this query is a TRAP. It returns every submission in the
--    window, including staff-captured ones that have no acquisition question to answer, so a
--    perfectly healthy enumerator smoke reads as an attribution failure. Corrected 2026-08-13
--    after exactly that happened.
SELECT s.id, r.source, s.raw_data->>'campaign_source' AS campaign_source
FROM submissions s JOIN respondents r ON r.id = s.respondent_id
WHERE s.submitted_at >= '<SMOKE_START_TS>' AND r.source = 'public'
ORDER BY s.submitted_at;
-- Shape when it IS captured: {"utm": {"source":"referral","campaign":"..."}, "channel":"Facebook"}
-- A NULL here is still not automatically red: the question is OPTIONAL (ruling R-B).

-- 4. THE AC1b ASSERTION — the household pair must be TWO rows, not one.
--    The failure mode is a MISSING row: one row looks exactly like success.
--
--    ⚠️ MATCH ON THE LAST 10 DIGITS, NOT ON WHAT YOU TYPED. Phones are stored CANONICALISED
--    (`normaliseNigerianPhone` → +234XXXXXXXXXX). Pasting `08012345678` against a stored
--    `+2348012345678` returns 0 and reads RED on a fix that is working perfectly.
--    ⚠️ AND BOUND IT. Without the rolled_back filter and the time window, a phone that was used
--    in an earlier dry-run returns 2 and reads GREEN without this smoke having proved anything.
SELECT count(*) AS rows_for_household_phone
FROM respondents
WHERE right(regexp_replace(coalesce(phone_number,''), '\D', '', 'g'), 10)
    = right(regexp_replace('<HOUSEHOLD_PHONE>',        '\D', '', 'g'), 10)
  AND status <> 'rolled_back'
  AND created_at >= '<SMOKE_START_TS>';                      -- MUST return 2

-- 5. DID THE EXEMPTION ACTUALLY FIRE? (§C step 3 — mandatory, not optional.)
--    This is the only positive evidence the guard EXECUTED. Query 4 returning 2 is consistent
--    with the fix working AND with the branch never having been reached (see §C).
--    --lines/--nostream are REQUIRED: bare `pm2 logs` tails from now and shows you nothing that
--    already happened, which is every event by the time you look.
--    (run on the box, not in psql)
--    pm2 logs oslsr-api --lines 2000 --nostream | grep identity_match_exempted_staff_capture

-- 6. THE COST SIDE OF THE EXEMPTION — run this at teardown AND weekly once field work starts.
--    The exemption's accepted trade is that a genuine re-registration now mints a duplicate
--    instead of merging. Nothing alerts on that yet (story residual R6), so it is a manual watch.
--    Rows here are shared-handset groups: EXPECTED for households, SUSPECT when the names match.
SELECT phone_number, count(*) AS people,
       string_agg(first_name || ' ' || last_name || ' [' || status || ']', ' | '
                  ORDER BY created_at) AS members
FROM respondents
WHERE source IN ('enumerator','clerk') AND status <> 'rolled_back' AND phone_number IS NOT NULL
GROUP BY phone_number HAVING count(*) > 1
ORDER BY count(*) DESC;
```

---

## §B — Before the first submission: the test-data protocol

Five things will bite in ways that look like enumerator bugs but are not. Decide all of this
**before** you create row one — deciding it afterwards is how smoke data ends up in a launch metric.

**1. Give each test person a DISTINCT phone and UNRELATED names** — except the one pair required by
§C. Test data is usually built the exact wrong way (same handset, similar names), and until
2026-08-06 that silently merged people. It no longer does for enumerator-captured rows, but the
public path still merges by design, so keep test identities separate as a habit.

**2. REAL EMAILS SEND, IMMEDIATELY.** Prod holds the real Resend key and the 9-63 dev-credential
isolation does **not** apply here. Any captured `email` fires the 9-58 confirmation carrying the
OSLRS number (`submission-processing.service.ts` reads `rawData['email'] ?? rawData['email_address']`
and does **not** branch on source). Use `+tag` addresses you control — which is also how §E proves
the number actually arrives.

**3. TAG THE ROWS BEFORE CREATING THEM.** Agree a reserved marker now so teardown is a `WHERE`
clause instead of archaeology. Recommended, consistent with prior dry-runs: surname `ZZSMOKE`, and
where a NIN is entered at all, the `7000000001x` sentinel series (next unused: check §F).

> ⚠️ **The NIN sentinel is for the ORDINARY submissions only — NOT for the §C household pair.**
> §C requires those two to be captured with the NIN field **left blank**, for the reason spelled
> out there. Reaching for a sentinel NIN out of tidiness is the single easiest way to make this
> whole smoke prove nothing.

**4. TEARDOWN IS CHILD-FIRST — AND THE CHAIN DEPENDS ON WHICH PATH MINTED THE ROW.**
*(Verified against the code 2026-08-06, because the previous note generalised from one run.)*

```sql
-- Always, in this order:
DELETE FROM fraud_detections    WHERE submission_id IN (SELECT id FROM submissions WHERE respondent_id = '<RID>');
DELETE FROM marketplace_profiles WHERE respondent_id = '<RID>';
DELETE FROM magic_link_tokens    WHERE respondent_id = '<RID>' OR lower(email) = '<TEST_EMAIL>';
DELETE FROM submissions          WHERE respondent_id = '<RID>';
DELETE FROM respondents          WHERE id = '<RID>';
```

- **`magic_link_tokens`: delete on `respondent_id` OR `email`, never on one alone.** The older note
  claimed `respondent_id` is always NULL on a wizard token; the R21 run found both tokens carrying a
  real `respondent_id`. Both keys, every time.
- **`users` — only for WIZARD/public rows, and only LAST.** The public wizard mints one user row per
  email via `auth.service.ts` passwordless provisioning, so a two-pass wizard test leaves orphan
  accounts. **The enumerator path does not create users at all** (`submission-processing.service.ts`
  never inserts into `users`), so for a pure enumerator smoke there is nothing to delete here. If
  your test also exercised the public wizard: `DELETE FROM users WHERE lower(email)='<TEST_EMAIL>'`
  **after** the respondent is gone — `respondents.user_id` references it and the FK blocks it
  otherwise.
- **`wizard_drafts`** — only if the wizard was used: `DELETE FROM wizard_drafts WHERE lower(email) = '<TEST_EMAIL>'`.
- **READ THE `DELETE n` COUNTS. A `DELETE 0` is a failed teardown, not a clean one.**

🚫 **`audit_logs` IS EXEMPT — NEVER DELETE FROM IT.** It is hash-chained and append-only; removing
rows forks the chain to erase the legitimate record that a test happened. Test rows in the audit
trail are correct and should stay. (The R21 run left 7; they remain.)

**5. RE-MEASURE, NEVER "RESTORE TO N".** The register is live and moving — 4 people arrived during a
single hour on 2026-08-05. Capture `§A query 1` before you start and again after teardown, and
expect organic arrivals in between rather than treating them as leftovers.

**Form note.** The **Master** form (8 sections / 47 questions) has more sections than the pinned
public form (Public Core, 6 / 25), so step count and `_pendingNin` behaviour differ from the public
wizard — step count is form-driven. **Record which form each submission used**, or the results are
not comparable to the public path. Master is a strict superset of Public Core.

---

## §C — The shared-phone household case (AC1b) — do not skip this one

**Why it exists.** The R13 identity guard matches on *same phone + ≥2 shared name tokens* and was
tuned on self-registration data: one person, one handset, zero cases of two distinct people sharing a
phone. **Field enumeration inverts that.** An enumerator walks a compound and registers four people
on one phone; a mother `Fatima Bello` and daughter `Fatima Aisha Bello` share a phone and two tokens.

**Status: the merge was PROVEN and FIXED before this smoke ran (2026-08-06, story 13-4).** A RED test
against the then-live code confirmed the daughter was attached to the mother's record — not a
hypothetical. `submission-processing.service.ts` now exempts staff-captured sources
(`enumerator` / `clerk`) from the attach, while still running the lookup so the counterfactual stays
measurable. The exemption keys on **source**, not on `submitterId` — an authenticated public user
carries a submitterId too, and that case must still merge.

### 🛑 LEAVE THE NIN BLANK ON BOTH — or this test exercises nothing

**The guard only runs on a submission with NO NIN.** The branch is gated on `!data.nin`
(`submission-processing.service.ts`): a NIN-bearing submission is deduped by FR21's unique index and
never reaches the identity match at all. So if you capture the mother and daughter with two
different NINs — the natural thing to do, and what §B.3's sentinel series would nudge you toward —
then:

- the exemption branch **never executes**,
- `§A query 4` returns **2** anyway,
- and gate item 2 goes **GREEN having tested nothing**.

That is the same failure this project has hit repeatedly: a check that asserts the safe outcome
without ever exercising the guard that is supposed to produce it. **Ask of every step here: would
this still pass if the fix were reverted?** For a NIN-bearing pair, the answer is yes.

**The procedure:**

1. Register **two different people in one household on ONE phone**, with a shared surname at
   minimum, **both with the NIN field left EMPTY**. They will land as `pending_nin_capture` — that
   is correct and expected, and it is the state a real field household is in anyway.
2. Run **`§A query 4`. It MUST return 2.** Assert the count — a pipeline that produced one row looks
   identical to success from the UI.
3. **MANDATORY — confirm the exemption actually fired:** `§A query 5` must show
   `identity_match_exempted_staff_capture` with `wouldHaveMergedInto` naming the first person.
   **This is the step that distinguishes "the fix worked" from "the code never ran".** Query 4
   alone cannot tell those apart, and they look identical in the UI. **No log line → treat gate
   item 2 as RED** and check (a) that the deploy precondition at the top of this runbook is met,
   and (b) that you really did leave both NIN fields blank.
4. **If query 4 returns 1**, the fix did not reach prod or branched on the wrong condition. **Stop —
   this is a hold on gate item 2**, not a note for later: every household enumerated in the field
   would lose people silently.

### One consequence to know about before you send people to field

Allowing a household its own row per person means a phone number no longer identifies one person.
The public **status-check / "resend my number"** flow keys on phone or email, and as of the 13-4
review it now **refuses to answer an identifier that matches more than one living respondent**
rather than guessing the most recent one (which would have emailed one household member a resume
link into another's record). The consequence for field work is concrete:

> **Enumerators must read the OSLRS reference code back to every person they register**, and it
> should go on the slip. For a shared-handset household the reference code is the *only* identifier
> that still resolves — phone will politely tell them nothing was found.

Confirm this during the smoke: after the §C pair exists, run the public status check with the shared
phone and expect the neutral "if we found you, we've emailed you" response **with no email arriving**
— then repeat with one of the two reference codes and expect the email. Log both in §F.

---

## §D — Exercising the 5–10 submissions (AC1)

The gate wants the **real** path: a real enumerator, assigned via `team_assignments`
(supervisor → enumerator → LGA, an active row with `unassigned_at IS NULL`), capturing and submitting
through the live **`EnumeratorHome`** UI on **prod**. Not staging. Not a direct API POST.

1. **Confirm the assignment exists** before you start; an unassigned enumerator is a different test.
2. **Submit 5–10 forms** through the UI, including the §C household pair and both §E email branches.
3. **Verify each one** with `§A query 2`. Every row must show `source='enumerator'`, a non-null
   `submission_id`, `processed = true`, and `processing_error` null.
4. Record every `respondent_id` / `submission_id` in §F — that list *is* the gate-item-2 evidence.

> **On the existing script.** `apps/api/scripts/_enumerator-path-smoke-test.ts` fires synthetic
> submissions straight at `POST /api/v1/forms/submissions` with a signed enumerator JWT. It is a good
> **scale/regression** check and its teardown is idempotent (it sweeps `nin LIKE '99999%'`), but it
> **bypasses the browser**, so it cannot close gate item 2 on its own. The gate is about the path a
> field officer actually walks. Use it to rehearse; use the UI to certify.

---

## §E — Both email branches (AC1d)

`email` already exists and is **optional** on both published forms — Master and Public Core — and is
keyed `email`, exactly what ingestion reads. **No form change, no re-publish, no re-pin is needed.**
(An earlier reading of this claimed no form asked for an email; that was a query bug — `q->>'key'`
instead of `q->>'name'` — and acting on it would have meant a needless re-pin, the operation that
froze 232 public drafts in July. Do not re-open it.)

1. **At least one submission WITH `email`**, at a `+tag` address you control. **Confirm the
   OSLRS-number email is RECEIVED**, not merely that the pipeline was green — a green pipeline proves
   a row was written, not that anyone was told their number.
2. **At least one WITH `email` blank**, which must still succeed. Optional means optional; if a blank
   email breaks ingestion, field work stalls on a field nobody needs.

⚠️ **SMS IS NOT AVAILABLE.** `phone_number` is captured and required, so the *data* is there, but
Termii is blocked on KYC and the provider is a no-op that rejects. "We collect phones so we can SMS
them" is true about the data and false about the channel until 9-27 Part B lands. **Email is the only
working channel today** — which is why (1) matters: for a respondent with no email, nothing reaches
them at all. Manual fallback is the operator phone list (`pnpm tsx apps/api/scripts/sms-outreach-list.ts`).

---

## §F — Gate verdict record (AC3)

Fill this in as you go. **Evidence, not claims.**

**Gate item 2 — "Enumerator path proven on prod"**

- Verdict: ✅ **GREEN — 2026-08-13**
- Operator: Awwal · verified by John (PM) against prod, read-only
- Prod SHA at time of smoke: **`19b51f5`** (contains the 13-4 AC1b fix — precondition met)
- Baseline before (2026-08-12 14:20Z): **327 respondents · 1 enumerator row · 284 submissions · 2 orphans**
- After teardown (2026-08-13): **327 · 1 · 285 · 2** — the +1 submission is an unrelated PUBLIC
  registration that arrived mid-smoke (`OSL-2026-A37K2A`, 11:53:59) and was correctly left alone.
  **Re-measured, not "restored to N".**
- Enumerator submissions completed: **6 of 5–10 required**
- Sentinel marker: surname **`ZZSMOKE`** · NIN series **`70000000010`–`11`** · phones `0800000001x`
- Enumerator used: `lawalkolade+testenumeratornew@gmail.com` (invited + activated 2026-08-12 for this run)

| # | reference_code | person | phone | NIN | email branch | status |
|---|---|---|---|---|---|---|
| 1 | `OSL-2026-TYANTY` | Fatima Zzsmoke | `+2348000000010` | blank | with | `pending_nin_capture` |
| 2 | `OSL-2026-ADTWJP` | Fatima Aisha Zzsmoke | `+2349012345678` | blank | without | `pending_nin_capture` |
| 3 | `OSL-2026-9TT3K8` | Chinedu Zzsmoke | `+2347012345678` | blank | with | `pending_nin_capture` |
| 4 | `OSL-2026-90CVGP` | **Fatima Bisi Zzsmoke** | **`+2348000000010`** ← shared | blank | without | `pending_nin_capture` |
| 5 | `OSL-2026-HA2NQ8` | Yetunde Zzsmoke | `+2348000000012` | `70000000010` | with | **`active`** |
| 6 | `OSL-2026-21DRDA` | Musa Zzsmoke | `+2348000000013` | `70000000011` | without | **`active`** |

All six: `source='enumerator'`, a `submissions` row present, `processed = true`, `processing_error` NULL.

**§C household pair** — rows **1 and 4** (`+2348000000010`):

- Both captured with the NIN field **blank**: ✅
- `§A query 4` returned: **2** ✅
- `§A query 5` showed `identity_match_exempted_staff_capture`, `trigger: no_nin`,
  `wouldHaveMergedInto` = `019ff6ff-1b0a-7183-b102-3df1c4392c63` (**Fatima**, `OSL-2026-TYANTY`) ✅
- Status-check consequence (run **30 minutes apart** to be sure): shared phone `08000000010` →
  neutral response, **no email**. `OSL-2026-TYANTY` → **email arrived.** ✅ R8 demonstrated end to end.

⚠️ **THE FIRST ATTEMPT AT §C DID NOT TEST ANYTHING, AND IT LOOKED FINE.** Rows 1 and 2 were captured
on *different* phones, so no same-phone match existed and the guard never ran —
`identity_match_exempted_staff_capture` count was **0**. `§A query 4` would have returned **1**, which
reads as *"the fix is broken"* when the truth was *"the code never executed."* **Row 4 was added
specifically to form the pair.** This is why §C makes the log line mandatory: the count alone cannot
tell a broken fix from an unexercised one.

**Email branches (§E):** 3 with (`+zzsmoke-c1` ×2, `+zzsmoke-d2` ×1) — **all three OSLRS-number emails
confirmed RECEIVED in the inbox**, not merely `confirmation_email_sent_at = t`. 3 without — all
succeeded.

**Orphan submissions: 2 before, 2 after.** Nothing was lost silently — the only check that would have
caught it, since 13-57 is not built.

**Teardown** (child-first, `ZZSMOKE` marker): `fraud_detections` **6** · `marketplace_profiles` **6** ·
`magic_link_tokens` **1** · `campaign_sends` 0 · `email_suppressions` 0 · `submissions` **6** ·
`respondents` **6**. ⚠️ The 6 + 6 child rows mean a RID-only teardown would have orphaned twelve rows;
the `magic_link_tokens` **1** was the status-check token, which carries `respondent_id = NULL` and
would have survived a delete-by-RID — the 2026-07-30 leak, caught by the clause written after it.
`audit_logs` untouched (append-only).

**Deviations recorded rather than hidden:**
1. **No `team_assignments` row** — none exists on prod and none could be created: the service validates
   the supervisor role and **there is no supervisor account**. The submission path does not read the
   table, so capture was unaffected; **supervisor team views, personal stats and productivity figures
   were NOT exercised.**
2. Rows 1 and 3 share an email (`+zzsmoke-c1`) rather than one each — the sheet said distinct.
   Harmless; both confirmations arrived.

---

- Verdict (superseded line kept for the record): ⬜ GREEN / ⬜ RED — _not yet run_
- Date / operator:
- Prod SHA at time of smoke: ___ (must include the 13-4 AC1b fix — see the precondition above)
- Baseline before (`§A query 1` total):
- Enumerator submissions completed: ___ of 5–10 required
- Form used (Master / Public Core), per submission:
- Sentinel marker used (surname / NIN series):

| # | respondent_id | submission_id | reference_code | NIN? | email branch | notes |
|---|---|---|---|---|---|---|
| 1 | | | | | with / without | |
| 2 | | | | | | |
| 3 | | | | | | |
| 4 | | | | | | |
| 5 | | | | | | |
| 6 | | | | | | |
| 7 | | | | | | |
| 8 | | | | | | |
| 9 | | | | | | |
| 10 | | | | | | |

**§C household pair** (the two rows above that share a handset — record which):

- Both captured with the NIN field **blank**: ⬜ (if not, the test is void — see §C)
- `§A query 4` returned: ___ (**MUST be 2**)
- `§A query 5` showed `identity_match_exempted_staff_capture`, `wouldHaveMergedInto` = ___
  (**MANDATORY — a blank here means the branch never ran and item 2 is RED**)
- Status check on the shared phone returned neutral with **no email**: ⬜ · same check by
  reference code **did** email: ⬜

**Close-out**

- §E confirmation email **received** at: ___
- `§A query 6` (shared-handset groups) reviewed, no unexpected same-name pairs: ⬜
- Teardown `DELETE n` counts read and non-zero: ⬜
- Baseline after teardown (`§A query 1` total): ___ (organic arrivals expected — do not reconcile to the before-figure)

**The other six gate items:** record date + evidence pointer against the table at the top.

---

## Provenance

Story 13-4 (`_bmad-output/implementation-artifacts/13-4-enumerator-prod-smoke-and-golive-gate.md`),
per SCP-2026-06-25-launch-campaign. The ORIGINAL 4-point gate is quoted from that SCP §45–49 (items 5–7
were added later — 5 by 13-46 on 2026-07-30, 6 and 7 by John/PM on 2026-08-21; `roadmap-to-launch.md`
is canonical for the current list, and the SCP is left as the dated record it is). The decision
rule from §43,49. §B/§C/§E carry the 2026-08-05 adjudication findings (ACs 1b/1c/1d) and the
2026-08-06 verification of the teardown chain against the code.
