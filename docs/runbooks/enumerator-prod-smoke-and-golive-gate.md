# Enumerator Prod Smoke & the 4-Point Go/No-Go Gate

**Story:** 13-4 · **Created:** 2026-08-06 · **Owner:** Awwal (operator) · **Runs on:** prod, via Tailscale

> **This does not fork the launch process.** `docs/runbooks/pre-launch-operator-runbook.md` remains the
> ordered runway ("what next"). This runbook is the **spend gate** that sits across it: the four
> conditions that must be green before radio / paid social is bought, plus the procedure for the one
> item nobody has ever actually exercised at scale — the enumerator path.
>
> Campaign hub: `docs/runbooks/re-engagement-campaign-launch.md` · Teardown recipe this one extends:
> `docs/runbooks/pre-blast-dry-run.md` §5.

---

## 🚦 The gate — buy no media until all four are green

| # | Gate item | How to verify | Verdict |
|---|---|---|---|
| 1 | **Prod happy-path self-serve verified** — one fresh, real end-to-end public submission | Run `pre-launch-operator-runbook.md` **Step 5b** in a real browser against the form pinned *at blast time*. PASS = summary reached once, Submit enabled on first arrival. Then confirm the row landed: `§A query 1` with `source='public'`. | ⬜ GREEN ⬜ RED |
| 2 | **Enumerator path proven on prod** — 5–10 real submissions | This runbook, §B–§E. PASS = ≥5 verified rows, `source='enumerator'`, each with a `submissions` row, **and** the §C household pair yielding **two** respondent rows. | ⬜ GREEN ⬜ RED |
| 3 | **Attribution capture live + verified** (Story 13-1) | ⚠️ **A fresh PUBLIC submission** carries `raw_data->>'campaign_source'`; `§A query 3` returns it non-null **on `source='public'` rows only**. ⛔ **DO NOT run this against enumerator rows.** The acquisition question exists only on the public wizard — on a staff-captured row the enumerator IS the channel, so `campaign_source` is correctly NULL. Reading a null there as a failure is what happened on 2026-08-13: six enumerator rows returned null and gate item 3 was briefly reported as not-green, on entirely correct behaviour. ⚠️ Nulls among PUBLIC rows are also expected — the question is **optional** by ruling R-B; 25 of 291 submissions carry it. Verify with **gate item 1**, not with this run. | ⬜ GREEN ⬜ RED |
| 4 | **Capacity load-test green + static fallback deployed** (Story 13-3) | `docs/runbooks/13-3-launch-capacity-and-fallback.md` + `13-3-cutover-and-failover.md`. PASS = load test green **and** the Cloudflare Pages fallback answers with a confirmed KV round-trip. | ⬜ GREEN ⬜ RED |

**Neither box ticked = NOT RUN, which is not the same as red and is definitely not green.** An empty
row holds the spend exactly as a red one does; the difference matters only for knowing what is left
to do.

> ⚠️ **PRECONDITION — the AC1b fix must be ON PROD before you start §C.** The exemption ships in
> `submission-processing.service.ts` (story 13-4). If you run the household case against a box that
> predates that deploy, `§A query 4` returns **1** and you will have proved the old bug, not tested
> the new code. Confirm the running SHA first (`cd /root/oslrs && git rev-parse --short HEAD`) and
> check it against the story's **Deploy SHA** line.

### The decision rule

- **ALL FOUR green → fire radio / paid social.**
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

**Other three gate items:** record date + evidence pointer against the table at the top.

---

## Provenance

Story 13-4 (`_bmad-output/implementation-artifacts/13-4-enumerator-prod-smoke-and-golive-gate.md`),
per SCP-2026-06-25-launch-campaign. The 4-point gate is quoted from that SCP §45–49; the decision
rule from §43,49. §B/§C/§E carry the 2026-08-05 adjudication findings (ACs 1b/1c/1d) and the
2026-08-06 verification of the teardown chain against the code.
