# Adjudication session record — 2026-09-30 → 2026-10-08 · Enumerator trial 2

**What this is.** The evidence trail for the session that re-onboarded the 19 trial enumerators,
rewrote the field guide's onboarding and practice rules, and watched the first real field week.
It exists so a cold-start agent can verify claims rather than inherit them.

**How to use it with the handoff.** `docs/adjudication-agent-handoff.md` is the LIVING document and
governs (§0 ritual, §2 playbook, §3 current state). This file is the dated backing evidence. If the
two disagree, **the handoff is wrong and this file is stale** — re-measure, do not pick one.

⛔ **Every number below was read from prod at the time stated and may not be true now** (handoff D6).
The last full reading was **2026-10-08 21:42 WAT**. No code shipped this session; prod is on
`fb2e4b1` (the field-guide commit), health 200, at that reading.

---

## Part A — COLD START: read this, then act

### A.0 The first five minutes

```bash
cd /c/Users/DELL/Desktop/oslrs
git log --oneline -8 && git status --short && git fetch origin -q && git status -sb | head -1
ssh -o ConnectTimeout=40 root@oslsr-home-app 'cd /root/oslrs && git rev-parse --short HEAD'
curl -s -o /dev/null -w '%{http_code}\n' https://oyoskills.com/api/v1/health
docker ps --format '{{.Names}} {{.Status}}'     # Docker Desktop was NOT running on 2026-09-30
```

Then re-run the trial reading in Part E before believing any count here.

### A.1 ⛔ THE LIVE PROBLEM: declined-consent surveys are being submitted in the field

**28 enumerator submissions since T0 carry `consent_basic = 'no'`** (zjbadmus 19, badmusalia2 9).
The form hides Identity after a No but lets the enumerator continue and **Submit**; the guide says
Discard. Each becomes a respondent row in the registry and the headline count. Most are nameless;
one (`badmusalia2` #56, Aisha Olakuleyin) carries a name — identity was answered first and consent
changed afterwards, and hiding a section does not retract what was entered (session 09-26→30
Finding 9, now observed in the field). **No NIN, no marketplace profile on any of them** — not a
PII exposure. It is consent integrity, and it is growing: 5 → 18 → 28 across three readings.

This turned the 2026-09-29 measured finding ("declining consent does not end the survey") from a
question about 9 old public records into **a live hole on the enumerator form**. See §A.2 item 1.

### A.2 OUTSTANDING — what to resolve, in priority order

⛔ **Everything here needs Awwal: a ruling, a go-ahead for a prod write, or a conversation.**

| # | Item | What it needs | Why |
|---|---|---|---|
| 1 | **Consent gate story** | Write + build: end the survey on `consent_basic = no` (enumerator form AND public form), and retract answers already given | 28 declined-consent rows in 8 days and climbing. Was a "measured, not a story" finding; it is now producing rows daily |
| 2 | **The 28 declined-consent rows** | Ruling: remove? (prod delete, child-first) | "A person who has not consented must not be in the register" — the guide's own words |
| 3 | **Resend to the 10 expired enumerators** | Go-ahead (audited path, §B.2) | 10 of 19 cannot sign in; nothing has moved for them since 2026-10-02 |
| 4 | **Zainab (`callmezainab3000+test`)** | Confirm her address, then clear `email_suppressions` + resend | Soft-bounced 2026-10-01 04:39 UTC; suppressed, so any resend is silently blocked |
| 5 | **Talk to zjbadmus + badmusalia2** | Operator | Discard on No; the 12–36-second surveys; duplicates (§C) |
| 6 | **Staff sign-in creates PUBLIC accounts** | Story | Typing the plain address → "one-time sign-in link" → a `public_user` is created. Victoria (2026-09-30 17:16 UTC) and Uthman (09-17) are now in public accounts at their plain addresses |
| 7 | **Header avatar never shows the photo** | Small story | `ProfileDropdown.tsx` renders initials only since Story 2.5-1 (Feb); the comment says "initials if no photo". Selfies ARE saved — My Profile + ID card show them |
| 8 | **Teardown** | Go-ahead | List in §D. Nothing deleted yet |
| 9 | **Is field work officially open?** | Ruling | Two enumerators started 2026-10-03 without one |
| 10 | Carried from 09-26→30 §A.2 | unchanged | 13-76 R2 (Android read), 13-73 R1+R8 prod restore, 13-76 R6, the 9 contradictory-consent citizens, 13-75 R2, `lessThanField`, 13-71 R5, 13-76 R3/R4/R5, teardown runbook wording |

### A.3 Where the knowledge lives
- `MEMORY.md` (auto-loaded) · handoff §3 + §2at–§2aw (new this session) · this file.
- Field guide: `docs/runbooks/enumerator-field-briefing.md` = the in-app `/users/field-briefing`.
  WhatsApp copy: `C:\Users\DELL\Desktop\OSLRS-Enumerator-Field-Guide-2026-09-30-v2.pdf` (7 pages).
- Submissions list (PII — never commit, never WhatsApp):
  `C:\Users\DELL\Desktop\OSLRS-submissions-zjbadmus-badmusalia2-2026-10-06.csv`.

---

## Part B — What was done

### B.1 Field guide rewrite (`fb2e4b1`, CI 36725624629 10/10 incl. deploy)

Read end-to-end against the code before editing. Changes:
- **§1.1** login-address box: sign in with the address after "Your login:" in the invitation —
  the `+test` suffix locked seven people out last cohort (runbook §0.1a). 48 h link. A re-sent
  invitation keeps the surveys already submitted.
- **§1.2** the selfie screen **has a skip option** (the old text said "you cannot skip steps" — the
  code allows it; 3 of 19 had skipped). Check the photo under My Profile; the header badge is initials.
- **§1.4** two practice surveys, surname **ZZSMOKE** (the old text never named the teardown key),
  no NIN via "I don't have my NIN now" (verified present on `FormFillerPage`), no email, own
  phone, daylight, two respondent profiles covering different branches.
- **Part 2** "ask every question" + an automatic-checks box. **Thresholds deliberately NOT
  published** — telling people "under half your usual time" teaches them to pad the clock.
- Rendered through `field-briefing.service`: 438 lines, **0 with a pipe, 0 with a literal `**`**.
  Verified on prod after deploy: the served Markdown carries 5 ZZSMOKE lines.

⚠️ The guide is the **permanent** in-app document; time-bound trial instructions (dates, "you will
get a new invitation") went in the WhatsApp messages, not the guide.

### B.2 Re-provisioning — the audited path, and how it was run

**T0 = 2026-09-30 14:36:10 UTC.** Baseline: 19 accounts (13 active, 6 invited), 11 ever logged in,
10 photos saved, 38 captures, 0 ZZSMOKE.

- **Never delete and recreate.** `submitter_id` has no FK; deleting orphans captures invisibly
  (runbook §0.9b). Re-onboard **in place**:
  - active → **Deactivate, then Reactivate with re-onboard** (`StaffService.reactivateUser(…,
    reOnboard=true)`): clears password, status `invited`, new token, invitation email, audit rows.
    Exposed in Super Admin → Staff (`ReactivateDialog`). Activation's NIN check skips the user's
    own row, so re-entering their NIN works. ⚠️ Skipping the selfie leaves the OLD photo URL with
    `photo_status = skipped`.
  - invited → **Resend** (`StaffService.resendInvitation`), max 3 per 24 h per user.
- **Resends run from this session** (no Super Admin login here) by calling the service on the VPS
  with `actorId` = Awwal's super_admin (`019c89ab-d629-…`), so audit rows attribute to him:
  - script in `/tmp` (NOT the git tree), extension **`.mts`** (a `/tmp/*.ts` is compiled as CJS →
    top-level await fails), **no bare-package imports** (they cannot resolve from `/tmp`), env via
    `set -a; . /root/oslrs/.env; set +a` (line 33 of `.env` has an unquoted space — harmless
    warning), run with `/root/oslrs/apps/api/node_modules/.bin/tsx`, `rm` after.
  - The script only **enqueues**; the running API's worker sends. Verify with `email_events`
    (`sent` → `delivered`/`bounced`), not with the exit code.
- **6 resends 2026-09-30 14:39 UTC** (6/6 OK, audit row each, 5 delivered + 1 later bounced).
  **checkadetola 2026-10-01 06:19 UTC** (delivered 06:19:36 UTC; her 09-30 invite had ALSO been
  delivered — the problem was where it landed in Gmail, not that it was not sent).
- Awwal ran the 13 deactivate→reactivate himself (16:49–16:55 UTC 09-30).

### B.3 ⛔ The re-onboard wiped three fresh activations

Bashirat, Uthman and Victoria activated from the 14:39 resends (two signed in and downloaded ID
cards), then were re-onboarded ~1 h later, which **cleared the passwords they had just set**. The
instruction never said "skip the six already resent". Two actors, one cohort, no exclusion list.
→ handoff §2at.

---

## Part C — Field week, measured

### C.1 Onboarding (unchanged since 2026-10-02)

| | Count | Who |
|---|---|---|
| Active | 9 | zjbadmus, badmusalia2, ferdew31, checkadetola, koyebimpe2011, badmusboluwatife22, faaizbadmus (selfie skipped), moboladeidrees (selfie skipped), kemiquad1202 (never signed in) |
| Invited, link EXPIRED | 10 | atitebiesther948, uthmanayo07, bashiratfasasi, victoriakilanko023, ablelabake, anuoluwapo568, folashadeasmau, oladokuncomfort77, olayiwolaprecious109, callmezainab3000 (bounced, suppressed) |

**ZZSMOKE practice done properly: 2 of 19** (ferdew31, uthmanayo07, 2 each).
zjbadmus and badmusalia2 practised with fake names and **no tag** (Bssabbe Bssabbe, Zassabe Zassabe;
Socio Mmena, Sarus Kichina — all 2026-09-30).

### C.2 F2 (GPS) — green, and the caveat

| Reading | Subs since T0 | With GPS | % | Enumerators |
|---|---|---|---|---|
| 2026-10-03 21:19 WAT | 51 | 48 | 94.1 | 8 |
| 2026-10-06 15:36 WAT | 108 | 105 | 97.2 | 8 |
| **2026-10-08 21:42 WAT** | **156** | **153** | **98.1** | **8** |

First time F2 meets its criterion (≥90 %, N≥20, ≥5 enumerators; baseline 11.4 %). ⚠️ **147 of the
156 are from two people.** The distinct-enumerator floor is met on paper by six people with 1–2
submissions each. Registry total at the last reading: **8,910**.

### C.3 Quality of the two active enumerators (as of 2026-10-06; full list in the Desktop CSV)

- **Pace:** daily medians 3.4–5.3 min for 25–35 questions (~6–10 s per question).
- **Sub-minute surveys:** 12 by 2026-10-08. Named ones at 12–36 seconds: zjbadmus #22 Kebiroh
  Afolabi (36 s); badmusalia2 #30 Olamide Steven (24 s), #52 Mohammed Jimoh (12 s), #53 Abdulsalam
  Mohammed (12 s). Either not a real interview or the timer counted only part (e.g. a reopened
  draft) — **unestablished**.
- **Duplicates:** Bashit Saka (badmusalia2 2026-09-17 + zjbadmus 2026-10-03 — the duplicate
  heuristic's 7-day lookback missed it); Qoyum Azeez / Azeez Qoyum (zjbadmus #25, #46 — name
  reversed, the second in 1 minute); Emmanuel Fakorede (zjbadmus #48 + #49, **one respondent, two
  submissions**, 29 min apart — re-take or a recurrence of 13-75 review M1; **not yet determined**).
- **NIN carried:** 11 of 47 (badmusalia2), 8 of 47 (zjbadmus) at 2026-10-06.
- ⚠️ **The speed heuristic is self-referential past 30 surveys** — it compares each enumerator to
  their OWN median, so a consistently fast enumerator never looks fast. Overall pace needs a human
  (or a cohort-median rule). → handoff §2aw.

---

## Part D — Teardown candidates (NOTHING deleted; go-ahead required)

| Group | Rows |
|---|---|
| Operator ZZSMOKE (`lawalkolade+demo1`) | 8 — ⚠️ two are cited evidence: Tunde 09-26 09:59Z (13-71 R15, `01a0dd27`), Seyi 09-28 12:34Z (13-75 R3, `01a0e802`) |
| Enumerator ZZSMOKE | 4 (ferdew31 ×2, uthmanayo07 ×2) |
| Untagged practice | 4 (the fake names in C.1) |
| Declined consent | 28 — pending ruling (A.2 #2) |
| Duplicates | Bashit Saka ×1, Emmanuel Fakorede submission ×1, possibly Qoyum Azeez ×1 — after confirmation |
| **Pre-T0 captures of the other enumerators (15)** | ⛔ **NOT practice** — 14 of 15 carry a NIN, all 15 marketplace profiles, 3 are the enumerators themselves (Faaiz, Comfort, Jubril — runbook §0.9a: keep). Awwal's 2026-10-01 instruction was "keep checkadetola's 23, tear down all others"; the reply was: ask each enumerator per row, delete only confirmed practice. **Unresolved** |

Teardown is child-first: `fraud_detections` → `submissions` → `marketplace_profiles` →
`respondents`, by explicit id list, counts dry-run first (runbook §0.9). It writes **no audit row**.

---

## Part E — Re-run these, don't trust the numbers above

The per-enumerator reading (§C.1/C.2) and the F2 line:

```sql
SET default_transaction_read_only = on;
WITH enum AS (SELECT u.* FROM users u JOIN roles r ON r.id=u.role_id
  WHERE r.name='enumerator' AND u.email NOT LIKE 'lawalkolade%' AND u.status<>'deactivated')
SELECT split_part(e.email,'@',1) who, e.status,
  CASE WHEN e.status='invited' AND e.invited_at+interval '48 hours'<now() THEN 'EXPIRED' END link,
  e.photo_status photo, to_char(e.last_login_at+interval '1 hour','DD Mon HH24:MI') last_login,
  (SELECT count(*) FROM submissions s WHERE s.submitter_id=e.id::text AND s.created_at>='2026-09-30 14:36:10+00') subs_t0,
  (SELECT count(*) FROM submissions s WHERE s.submitter_id=e.id::text AND s.created_at>='2026-09-30 14:36:10+00'
     AND s.raw_data->>'consent_basic'='no') declined,
  (SELECT count(*) FROM submissions s JOIN respondents rp ON rp.id=s.respondent_id WHERE s.submitter_id=e.id::text
     AND s.created_at>='2026-09-30 14:36:10+00' AND upper(coalesce(rp.last_name,'')) LIKE '%ZZSMOKE%') zz
FROM enum e ORDER BY subs_t0 DESC, 1;
```

⛔ **Note the `coalesce`.** The first version of this query used `upper(rp.last_name) NOT LIKE
'%ZZSMOKE%'`; a NULL surname makes that NULL, the row is dropped, and **the dropped rows were
exactly the declined-consent ones**. It reported zjbadmus at 44 when she had 49. → handoff §2au.

Delivery: `SELECT recipient, event_type, occurred_at FROM email_events WHERE occurred_at > …` and
`SELECT * FROM email_suppressions WHERE email = …`. pm2 logs rotate daily
(`~/.pm2/logs/oslsr-api-out__<date>.log`) — the live log held 119 lines on 2026-10-01, so an empty
grep of it proves nothing.

---

## Part F — The narrative, briefly

**2026-09-30.** Cold start found Docker Desktop not running and the two "unpushed" commits already
deployed. Awwal asked to re-provision all 19 with `+test` "to start afresh"; the measurement
reframed both words — `+test` had locked seven people out, and 38 existing captures (no ZZSMOKE)
made "afresh" a time boundary (T0), not new accounts. Rewrote the field guide, deployed it,
resent the six, and the re-onboards then reset three of them (§B.3). Victoria's "can't log in" was
five attempts at her plain address and one wrong password — after a successful activation.

**2026-10-01.** Checkadetola "did not get the email": it had been delivered; resent. Found Zainab's
bounce + suppression, and that the sign-in page had created public accounts for Victoria and Uthman.

**2026-10-03 → 06.** Two enumerators began real field work unannounced. F2 went green for the first
time. Then the nameless rows: a `NOT LIKE` undercount hid them, and reconciling the count exposed
them as declined-consent submissions — the 09-29 finding, live.

**2026-10-08.** 28 declined-consent rows. Session closed with no code shipped and every prod write
of this session audited (7 resends; Awwal's 13 re-onboards).
