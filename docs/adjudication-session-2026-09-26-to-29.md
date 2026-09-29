# Adjudication session record — 2026-09-26 → 2026-09-29

**What this is.** The evidence trail for the session that closed the GPS problem and rewrote the
enumerator field guide. It exists so a cold-start agent can verify claims rather than inherit them.

**How to use it with the handoff.** `docs/adjudication-agent-handoff.md` is the LIVING document and
is read first — its §0 ritual, §2 playbook and §3 current state govern. This file is the dated,
immutable backing evidence: row ids, SHAs, measurements, and the findings with their proofs. If the
two ever disagree, **the handoff is wrong and this file is stale** — re-measure, do not pick one.

⛔ **Nothing in this file is a substitute for re-reading prod.** Every SHA and count below was true
when written and may not be now. Handoff D6: never quote a prod SHA from a document.

---

## Part A — Where things stood when this session ended

### Git and prod

- Local `main` at **`0603c96`**, **1 commit ahead of origin** (the field-guide rewrite, deliberately
  unpushed so it did not collide with the 13-76 dev pass).
- Origin and prod at **`f75b268`**, health 200.
- ⚠️ **The working tree is NOT clean.** Story 13-76 is implemented and **uncommitted** — the dev and
  code-review passes ran in the other CLI. `apps/web/src/features/forms/**` and
  `route-resolution.integration.test.tsx` carry that work. It has **not been adjudicated.**

### Story board

| Story | Status | Open residuals | Where it is |
|---|---|---|---|
| 13-70 | review | 3 of 10 | deployed `eeacee3`; R2 post-deploy read outstanding |
| 13-71 | review | 10 of 11 | deployed; R15 discharged, R5 closure proposed |
| 13-73 | review | 2 of 14 | deployed; **R1 + R8 are the prod restore, NOT yet run** |
| 13-74 | ready-for-dev | 0 | AC1+AC2 shipped `c07357a`; AC3–AC8 remain |
| 13-75 | review | 5 of 7 | deployed `cfbe307`; R3 discharged on hardware |
| 13-76 | review | 6 of 6 | **uncommitted, awaiting adjudication** |

(Counts from `residualRows()` + `isOpenState(r.parts[2])`, not from the guard's pass line — see
Finding 2.)

### The immediate next actions, in the order they were agreed

1. **Adjudicate 13-76** (uncommitted in the tree).
2. **13-73 R1/R8 — the prod restore**, `019f8ed3` only, committed atomically and pushed to a clean
   tree. ⛔ **This writes to production and requires Awwal's explicit go-ahead each time.**
3. **Re-provision the 8 enumerators**, then the field start.
4. Then 13-72 pass 1 → pass 2 → R-A8.

---

## Part B — What shipped, with its evidence

### 13-71's field defect (`1554a37`, deployed with `1e67166`, CI 36232347782)

Reported from the field as *"I had to click the gps after allowing."* Cause was the **intersection
of two individually-correct ultra fixes**: U3's watchdog was budgeted `timeout + grace` = 15 s and
its clock starts when the survey opens — including time the "Allow location?" prompt sits
unanswered, because `PositionOptions.timeout` does not run during the prompt. U9's once-guard then
latched on that timeout settlement, so auto-capture never retried.

Fixed with a **per-call-site watchdog** (`OPEN_CAPTURE_WATCHDOG_MS` = 120 s for the open capture,
which nothing awaits; the tight deadline retained for the awaited submit refresh) and an extracted
`isRetryableCaptureFailure()` so only `permission_denied`/`unsupported` latch.

RED-verified: neutering the budget reproduced the field symptom verbatim —
`expected { ok: false, reason: 'timeout' } to deeply equal { ok: true, position: {…} }`.

### 13-75 — the blocked submit now offers the fix (`cfbe307`, CI 36329354441)

Ten ACs. In-banner capture button, one `commitGeopoint()` for all four commit sites, auto-retry of
the submit on success (ruled by Awwal), reason-specific copy from one module, waiver demoted and
gated on retryability, and **AC11** (added mid-review by Awwal's ruling): one silent capture at
submit for a retryable miss, fenced exactly as capture is.

Adjudication gates, run in-session and not inherited: web **284 files / 3241 passed / 2 todo**,
tsc 0, eslint 0, guards 414/414/330. Test delta **+47**, reconciled two independent ways (suite
3194 → 3241; the three touched files at 78 + 11 + 6 = 95 against a 48 baseline) from the runner's
per-file output, never a grep.

### 13-74 AC1 + AC2 — the production-storage guard (`c07357a`)

`auth.activation.test.ts` gated on `!!(S3_ACCESS_KEY && S3_SECRET_KEY)` — credentials *existing*
says nothing about which bucket they open. Verified before writing: this machine's root `.env` sets
`S3_BUCKET_NAME=oslsr-full-access` with live keys.

New pure module `apps/api/test/s3-guard.ts` refuses a target when the bucket is a known production
bucket **or** the endpoint is a real remote store and the bucket does not look like a test bucket —
the second clause is what catches a new prod bucket nobody deny-listed.

⚠️ **It refuses the CONFIG rather than throwing the suite, deviating from db-guard deliberately.**
db-guard must throw (no database, no suite); S3 is allowed to skip. A throwing setup guard would
have redded the entire API suite, pre-push gate included, on the next push.

Visible in the suite totals: API skipped went **8 → 9**, deterministically, with a named reason.
The wobble that hid seven months of production writes is now a fixed number.

### The field guide (`0603c96`, committed, unpushed)

`docs/runbooks/enumerator-field-briefing.md` rewritten 147 → 334 lines. It **replaces** rather than
supplements, because that file already *is* the in-app download (`/users/field-briefing`, rendered
to PDF from the Markdown at request time — one source, nothing to drift).

Every fact read from the **live published form**, not from `docs/questionnaire_schema.md`:
`oslsr_master_v3 / 2026072301`, 8 sections, 47 questions, 11 choice lists.

---

## Part C — Discharges, with the rows that prove them

| Row | Ref / id | What it proves |
|---|---|---|
| 13-71 **R15** | `01a0dd27`, 2026-09-26 09:59Z | auto-capture with **no tap**; `gps_accuracy` 58.8 m; also proves AC5 on prod |
| 13-73 **R7** (enum half) | `01a0dd27`, `01a0e199` | `form_id_logical=oslsr_master_v3`, `form_version=2026072301`, read by column |
| 13-73 **R7** (public half) | `01a0e789`, `01a0e78b`, `01a0e79e` | `oslsr_public_core_v1` / `1.0.1`, matching the live published form — **R7 fully discharged** |
| 13-75 **R3** | `01a0e802`, 2026-09-28 12:34Z | recovery FROM the amber panel: 22.6 m, no reason, and **the survey submitted itself** (AC3) |
| 13-71 **R5** | 0 of 3 enumerator rows | closure **proposed, awaiting ruling** — N=3 is too small to sign |

**Two corroborations that came from the data rather than the account**, both on `01a0e802`:
`raw_data._gpsOpenCapture` **absent** ⇒ a manual capture (the only writers are the open-time
auto-capture and the submit refresh); and **exactly one row** for that interview ⇒ review finding
M1 (a second `completeDraft`) does not recur on the live path.

⭐ **The arc, measured at both ends.** The first human ever to reach the amber panel (`01a0e199`)
waived a `timeout` — the retryable class — because the panel's only instruction was the one action
that dismissed it. The same panel now recovers in one tap.

---

## Part D — Findings that outlive this session

### 1. A `✅` anywhere in a residual's state cell disarms the row

`ROW_IS_CLOSED = /\bCLOSED\b|✅|\bRESOLVED\b|\bDISCHARGED\b/` is tested against **`parts[2]`**. A tick
decorating a sub-point closes the whole row. **Four instances**: 13-70 R8, 13-73 R7, 13-71 **R15**
(which read "STILL OPEN AS DISCHARGE-ON-DEPLOY" in a cell beginning `✅ **FIXED` — the story could
have gone `done` without the retest that was its entire discharge condition), and a fourth written
**by this session, inside the edit that added the warning about it**. Use bold **MET** / **NOT MET**
for sub-points, never a tick.

### 2. The guard's pass line proves almost nothing

`story-residual-guard` only fires on stories already marked `done`. A green
"N stories scanned, no done-with-open-residuals" says nothing about an open story's rows. **Probe
every row**: `residualRows(content)` + `isOpenState(r.parts[2])`. There is no `state` field on
`ResidualRow` — the state IS `parts[2]`.

### 3. Cached gates replay stale results on docs-only commits

Twice this session the pre-commit hook printed `✅ story-residual guard: 330 stories … today
2026-09-27` on the 28th, and the whole pre-push suite came back `cache hit, replaying logs` —
5 of 5 packages, FULL TURBO, 3.1 s, **no test actually ran**. Correct behaviour (the hash did not
change), but a green line on a docs-only push proves the cache key held, not that anything was
verified. ⚠️ A DATED residual expiring that day would not have been caught.

### 4. `asyncUtilTimeout` is 1000 ms and `testTimeout` does not govern it

Cost a failed push. `Step2ContactLga`'s first test waits on `findByRole`, whose budget is 1000 ms
regardless of `testTimeout: 10000`; the mock resolves instantly, so the whole budget went on the
cold jsdom render — measured **1134 ms green, 1945 ms red on an idle machine**. Fix with an explicit
`{ timeout: N }` in `findByRole`'s **third** argument, and RED-verify at `{ timeout: 1 }`, because
putting it in the second argument silently does nothing.

**Splitting real from flaky:** re-run the file **alone**. Passes alone ⇒ contention (Pitfall #37),
leave it. Fails alone ⇒ real, fix it. `route-resolution` passed alone; `Step2ContactLga` did not.

### 5. The prod docroot is `/var/www/oslsr`, and the git-tree `dist` is a decoy

`/root/oslrs/apps/web/dist` is stale from **April 2026** and is NOT what NGINX serves. The deploy
swaps the docroot wholesale. Verify a frontend fix by grepping the **served** chunk under
`/var/www/oslsr/assets/`, and confirm the page's entry chunk imports it.

### 6. `_gpsOpenCapture` distinguishes an automatic capture from a manual one

Written only by the open-time auto-capture and the submit refresh. Its **absence** on a row carrying
coordinates proves a human pressed a button. It cannot distinguish *which* button — neither manual
site writes it — which is why the 12:22 capture was recorded as PARTIAL and R3 needed a second run.

### 7. The briefing PDF renderer supports no tables and strips bold

`field-briefing.service.ts` parses only h1–h3, blockquote, bullets and body. A Markdown table falls
through to body and renders as literal pipes; `**bold**` is stripped by `stripInline`. **The
blockquote is the only way to shout.** Verify a briefing edit by rendering it:
`parseBriefingMarkdown` + `renderBriefingPdf`, and assert zero lines containing `|`.

### 8. `lessThanField` is declared and implemented nowhere — and fails OPEN

The XLSForm converter (`xlsform-to-native-converter.ts:129`) writes it; `formSchema.ts`'s
`checkRule` switch handles only `minLength, maxLength, min, max, regex, modulus11` and **has no
`default`**, so an unimplemented rule type silently passes. The API does not implement it either.
`dependents_count`'s "Cannot exceed household size" has never fired: **22 prod rows violate it.**

⚠️ **The semantics must be `≤`, not `<`.** 43 prod rows have dependents exactly equal to household
size — a strict `lessThanField` would reject all of them. The rule NAME and its MESSAGE disagree,
and the data settles it in favour of the message.

### 9. Declining consent does not end the survey — on BOTH forms

`consent_basic = yes` gates the Identity section. The age fork then hides Labour Force and Guardian
Consent (age is unknown without `dob`). But **Household & Welfare, Skills & Business and Public
Skills Marketplace carry no condition at all** and stay visible. Verified on `oslsr_master_v3` AND
`oslsr_public_core_v1` — identical structure.

**And it is not theoretical.** 12 prod submissions carry `consent_basic = 'no'`, all public, all
with names, NINs, respondent records and **issued OSLRS numbers**, from 2026-05-20 to 2026-09-19.
The mechanism: on the public path, identity is collected by the **wizard** before the survey, so the
respondent exists regardless of the later consent answer. Hiding a section also does **not retract
answers already given** — anyone can fill the form, go Back, set consent to No, and submit intact.

**Marketplace exposure, checked:** 10 of the 12 have live marketplace profiles; 9 are
`consent_enriched`. ⚠️ **But this is not an open PII leak, and the first draft of this finding
overstated it.** `searchProfiles` returns anonymous fields only and applies no consent filter, so
the profiles are publicly searchable **as anonymous listings**. Name and phone come only from
`revealContact`, which is POST behind `authenticate` + CAPTCHA + step-up + a 50/24h limit and
fail-closes to `not_found` when `consent_enriched` is false.

**And all nine explicitly answered "Yes" to the marketplace question.** So the accurate framing is
**contradictory consent on record** — "No, I don't consent to this survey" followed by "Yes, publish
my details" — resolved silently by the system in favour of publication, with no human ever seeing
the contradiction. A consent-integrity problem, not a live leak. It has stood since May.

### 10. Measure before fixing, especially near a deadline

Both of the above looked like small patches until measured. The measurement changed the verdict on
each: the consent one turned out to involve 12 real citizens and needs a Ministry-level decision,
not a code change; the dependents one turned out to have a semantics trap that would have rejected
43 legitimate rows. Neither should ship the night before a field launch.

---

## Part E — Open decisions that need Awwal

1. **13-71 R5** — closure proposed on 0 of 3; accept now, or accept on the post-restart re-measure?
2. **13-75 and 13-76 authorship deviation** — both story files were written in the adjudication
   context, not minted by the SM `*create-story` workflow. Declared in both headers. Ratify or
   re-mint.
3. **13-73 R1 / R8 — the prod restore** (`019f8ed3` only). Writes to production; explicit go-ahead
   required.
4. **The 9 contradictory-consent citizens** — leave them (they did consent to the marketplace
   explicitly), contact them to re-confirm, or withdraw them. Operational/Ministry call.
5. **`lessThanField`** — implement as `≤`, and accept that it will newly block rows that pass today.
6. **13-75 R2** — the iOS copy has never been read on an iPhone, and 4 trial enumerators are on iOS
   Safari. Neither of Awwal's devices can close it.
7. **The teardown plan.** Agreed shape: mark practice captures with the **ZZSMOKE** convention so
   teardown keys on submitter id ∧ time window ∧ marker, not a clock boundary; **read F2 before
   deleting anything**; and do not tear down under deadline pressure — tagged rows are
   *identifiable*, which is all registry cleanliness needs before field work.
   ⛔ The gate runbook still claims at lines ~181 and ~566 that an auditor can see these deletions.
   The teardown is raw psql and writes **no audit row**. That wording is 13-73 R3's open secondary
   finding, Awwal owns it, and it is about to be exercised across 8 live accounts.

---

## Part F — The narrative, briefly

**2026-09-26.** Resumed mid-push. The push had already failed — not network, the pre-push suite was
red on three tests in files nobody had touched. Split them by re-running alone: `route-resolution`
×2 were contention, `Step2ContactLga` was a real latent flake racing a 1 s budget (Finding 4). Fixed
and pushed; 13-71's field fix deployed and verified in the served bundle.

Awwal ran two ZZSMOKE captures. The first discharged R15. The second recorded `timeout` and he did
not complete it — which became the evidence for a new story.

**2026-09-27.** Adjudicated nothing until the ledgers were probed, which found R15 disarmed
(Finding 1) — and then I disarmed R7 the same way inside the edit warning about it. Wrote 13-75 from
the field observation, ran the dev/review cycle in the other CLI, adjudicated it, deployed
`cfbe307`. Awwal's question about the GPS toggle exposed the two-independent-gates problem and
became AC4/AC5.

**2026-09-28.** Awwal's Android read: ignored the prompt, toggle off. It produced the `timeout`
copy telling him to move to a window while his Location was off (wrong advice), recorded
`permission_denied` for a *dismissed* prompt, and handed him the waiver immediately. That became
13-76. He then ran the recovery properly and discharged R3 on hardware.

**2026-09-29.** Rewrote the field guide from the live form. Writing it surfaced Findings 7, 8 and 9
— the renderer's limits, the inert validation rule, and the consent hole with twelve real citizens
behind it.
