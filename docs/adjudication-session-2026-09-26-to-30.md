# Adjudication session record — 2026-09-26 → 2026-09-30

**What this is.** The evidence trail for the session that closed the GPS problem and rewrote the
enumerator field guide. It exists so a cold-start agent can verify claims rather than inherit them.

**How to use it with the handoff.** `docs/adjudication-agent-handoff.md` is the LIVING document and
is read first — its §0 ritual, §2 playbook and §3 current state govern. This file is the dated,
immutable backing evidence: row ids, SHAs, measurements, and the findings with their proofs. If the
two ever disagree, **the handoff is wrong and this file is stale** — re-measure, do not pick one.

⛔ **Nothing in this file is a substitute for re-reading prod.** Every SHA and count below was true
when written and may not be now. Handoff D6: never quote a prod SHA from a document.

---

## Part A — COLD START: read this part, then act

### A.0 The first five minutes

```bash
cd /c/Users/DELL/Desktop/oslrs
git log --oneline -8
git status --short && git fetch origin -q && git status -sb | head -1
ssh -o ConnectTimeout=25 root@oslsr-home-app 'cd /root/oslrs && git rev-parse --short HEAD'
curl -s -o /dev/null -w '%{http_code}\n' https://oyoskills.com/api/v1/health     # want 200
docker ps --format '{{.Names}} {{.Status}}'        # want oslsr_postgres + oslsr_redis healthy
```

⚠️ **AFTER A MACHINE RESTART THE LAST ONE WILL BE EMPTY.** `oslsr_postgres` and `oslsr_redis` do not
auto-start. Run `pnpm services:up` before any suite, or ~98 API tests fail with connection errors and
it looks exactly like a code defect (Part D, Finding 12 — it cost 20 minutes on 2026-09-30).

**Known-good values at the end of this session (verify, never read — handoff D6):**
prod = origin = `4b721bf`, health 200. Local was **2 commits ahead** — see A.1.

### A.1 ⚠️ TWO COMMITS EXISTED ONLY ON THIS MACHINE

At session end, `8b82e39` (pre-push banner fix) and `fa58f1e` (the 37 portable verification laws)
were **committed but unpushed**. They are docs/hook only, so the scoped gate pushes them in seconds.
**If `git status -sb` still shows `ahead 2`, push before doing anything else** — a local-only commit
survives a restart but not a disk failure.

### A.2 OUTSTANDING ISSUES — what to resolve, in priority order

⛔ **Needs Awwal specifically** (a decision, a device, or production authority):

| # | Item | What it needs | Why it matters |
|---|---|---|---|
| 1 | **13-76 R2** | ONE Android read, ~5 min | **Decides whether 13-76 did anything.** Its whole premise — that Chrome reports `prompt` after a dismissed prompt — is jsdom-only. If Chrome says `denied`, the story changes nothing on the device it was written for. Ignore the prompt, reach the amber block, expect *"Tap Capture and choose Allow"* with the waiver **withheld** |
| 2 | **13-73 R1 + R8** | Explicit go-ahead, then adjudication applies it | The prod restore (`019f8ed3` ONLY). **WRITES TO PRODUCTION.** Blocks 13-72 pass 2. Approval does not carry across a session — ask again |
| 3 | **Re-provision the 8 enumerators** | Operator action, no deploy | The GPS blocker they were paused for is closed and verified on hardware. F2 is 11.4% and cannot move without people in the field; the unscored backlog grows ~7/day |
| 4 | **13-76 R6** | Route to a 13-71/13-75 follow-up | **Prod-affecting.** `permissionAllowsSilentRefresh`'s iOS branch is dead on iOS 16+ (the Permissions API exists there), so 13-71's submit refresh and 13-75 AC11's silent retry may never run for the **4 iOS-Safari enumerators** the function exists to protect |
| 5 | **The 9 contradictory-consent citizens** | Ministry-level decision | They answered "No" to survey consent and hold live OSLRS numbers; 9 are marketplace-visible to authenticated employers. Engineering can stop the 10th; it cannot decide about these 9 |
| 6 | **13-75 R2** | A borrowed iPhone, ~1 min | The `permission_denied` copy tells iOS users to fix `aA → Website Settings`; never read on a device. 4 trial enumerators are on iOS Safari. Neither of Awwal's devices can close it |
| 7 | **`lessThanField`** + **consent gate** | Ruling, then a story | Both measured, neither yet a story. `lessThanField` must be `≤` not `<` (43 rows are exactly equal). Consent: sections 6/7/8 are ungated on BOTH published forms |
| 8 | **13-71 R5** | Accept now, or on the post-restart re-measure | Closure proposed on 0 of 3 rows — N=3 is too small to sign |
| 9 | **13-76 R3 / R4 / R5** | Screen read · ratify deviations · Q1/Q2 | R3: three new strings never read on a phone. R4: closure proposed. R5: iOS-16 premise, (a) ruled and built |
| 10 | **Teardown runbook wording** | Awwal owns it (13-73 R3 secondary) | It still tells a reader an auditor can see these deletions. The teardown is raw psql and writes **no audit row** — about to be exercised across 8 live accounts |

**Then, in sequence:** 13-70 R2's post-deploy read → 13-72 pass 1 → pass 2 → R-A8. And **13-74
AC3–AC8** (the S3 estate sweep) whenever there is room — its dangerous half is already closed.

⚠️ **The teardown plan, as agreed:** practice captures carry the **ZZSMOKE** marker so teardown keys
on submitter id ∧ time window ∧ marker — a clock boundary alone is unsafe because trial and real work
share the same live accounts. **Read F2 before deleting anything.** Do not tear down under deadline
pressure: tagged rows are *identifiable*, which is all registry cleanliness needs before field work.

### A.3 Story board

| Story | Status | Open | Where it is |
|---|---|---|---|
| 13-70 | review | 3/10 | deployed; R2 post-deploy read outstanding |
| 13-71 | review | 10/11 | deployed; R15 discharged, R5 closure proposed |
| 13-73 | review | 2/14 | deployed; **R1 + R8 are the prod restore, NOT run** |
| 13-74 | ready-for-dev | 0 | AC1+AC2 shipped `c07357a`; AC3–AC8 remain |
| 13-75 | review | 5/7 | deployed; R3 discharged on hardware; R2 needs an iPhone |
| 13-76 | review | 6/6 | **deployed `4b721bf`**; R2 decides whether it did anything |

Counts from `residualRows()` + `isOpenState(r.parts[2])` — **never** from the guard's pass line, which
only checks stories already marked `done` (Part D, Finding 1).

### A.4 Where the knowledge lives

- **`MEMORY.md`** — auto-loaded every session. Current state + pointers.
- **`docs/adjudication-agent-handoff.md`** — the LIVING doc. §0 ritual, §2 playbook (46 sections),
  §3 current state. **Read first; it governs.**
- **This file** — the dated evidence: row ids, SHAs, measurements, proofs.
- **`docs/portable-verification-laws.md`** — 37 stack-agnostic laws distilled from the above, for
  other projects. Strip `_Provenance:_` lines to share externally.
- **`docs/portable-playbook.md`** — stack/infra/CI, **dated 2026-04-26**, five months stale. Check
  against §2 before citing.

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

### 13-76 and the four CVE bumps (`35fa859`, then `4b721bf`, CI 36674401156, 10/10)

13-76 adjudicated sound: full web suite **284/284 files RAN, 0 unrun**, api **333 files / 4749
passed**, tsc 0, eslint 0, delta **+60** reconciled per-file. **AC8/R-a verified from source** —
`isRetryableCaptureFailure` still governs the open-time latch and AC11's fence; only the waiver gate
reads the new `classifyBlockFailure`, so 13-71 U9 stays closed. AC5's negative is structural.
Confirmed in the **served** bundle (`formSchema-*.js`): the dismissed lead, the toggle-first timeout
line, the platform labels.

The deploy then failed on the OSV gate (Finding 11) and shipped only after the four bumps.

### Tooling and knowledge artifacts (`02c227b`, `8b82e39`, `fa58f1e`)

Pre-push scoped, 40 min → 95 s (Finding 13). Its banner fixed one commit later, because it still
promised a full suite three lines before announcing a scoped one — harmless in effect, the same class
as a lying record. And `docs/portable-verification-laws.md`: 37 laws (Finding 15).

### The enumerator field guide (`0603c96`, deployed)

`docs/runbooks/enumerator-field-briefing.md` rewritten 147 → 334 lines from the **live published
form**, and it IS the in-app download (`/users/field-briefing`, rendered to PDF at request time — one
source, nothing to drift). ⛔ **Never commit a PDF of it.** A point-in-time copy for WhatsApp was
rendered to `C:\Users\DELL\Desktop\OSLRS-Enumerator-Field-Guide-2026-09-30.pdf` (6 pages) through the
same service the app uses.

⛔ **Write to the renderer's limits:** it parses only h1–h3, blockquote, bullets and body. A Markdown
**table renders as literal pipes** and `**bold**` is **stripped** — the blockquote is the only way to
shout. Verify an edit by rendering and asserting zero lines containing `|`.

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

### 11. The OSV security gate blocks deploys on code nobody touched — and its output disagreed with itself

13-76 passed every gate, then CI failed `lint-and-build` with `deploy` skipped. Not 13-76: the OSV
prod-scope gate fired on advisories **newly published** against four dependencies nobody had edited.
Fixed with bounded same-major bumps — `brace-expansion >=5.0.12`, `engine.io >=6.6.11`,
`ip-address >=10.7.2`, and `multer ^2.4.0` as a **direct-dep bump rather than an override**, matching
the existing root-cause-not-override rule.

⛔ **`vitest@4.1.8` was also printed in the blocking list, and suppressing it would have been wrong.**
It is absent from the prod closure (reproduced locally with the gate's own input, before and after).
And the gate reported **"4 PRODUCTION finding(s)" while printing FIVE packages**, and "3 dev-tree"
while printing two — `vitest` and `@vitest/mocker` share one advisory, counted once and printed
twice. CI then passed on the four bumps **alone**, proving it was a reporting artifact. An
`osv-scanner.toml` ignore would have suppressed a phantom and left a real reporting bug in a security
gate. **The gate's OUTPUT still needs fixing; its policy does not.**

### 12. 98 test failures were a dead database, and the cache had been hiding it

After the dependency bumps the API suite showed **98 failures** — exactly what `multer` or `engine.io`
breaking uploads or sockets would look like. Neither: `oslsr_postgres` and `oslsr_redis` had **exited
13 hours earlier** (status 255, host/Docker restart). Signature: `redis.connection_error`,
`AggregateError` at `net.internalConnectMultiple`, every real-DB test dying in `beforeAll` and
cascading into skips. Services restarted → 333 files / 4749 passed / 0 failed, genuinely executed
(981s).

⭐ **And the push before it had not been protected at all.** Its pre-push API total was
**byte-identical to the previous push** (`331 passed | 2 skipped`, `4749 passed | 9 skipped`) — a
turbo **cache replay**, correctly so, because that story was web-only and the API hash never changed.
The gate did not run API tests against a dead database; **it did not run them at all.** The
protection expired the moment a commit touched the lockfile. **An identical total across two pushes
is the tell that nothing ran.**

### 13. The pre-push gate is now scoped — and the obvious implementation tested nothing

The gate on main ran the full suite: **~40 minutes of the developer's own machine per push**, during
which the laptop is unusable. It duplicated CI, which runs the same suites as parallel jobs on
dedicated runners and where **a failing suite cannot deploy** — demonstrated the same day by the OSV
block. Now `--filter='...[origin/main]'`; full suite via `PREPUSH_FULL=1 git push`. First real run:
**95 seconds** instead of 40 minutes.

⛔ **The hole, found by dry-running each change shape rather than reasoning about the filter:**

```
apps/web/src/**  ->  web + testing + types + utils     (api's 16 min skipped)
apps/api/src/**  ->  api + testing + types + utils     (web's 25 min skipped)
pnpm-lock.yaml   ->  NOTHING                            <-- the hole
```

`[ref]` filtering detects changes **per package directory**; root files belong to no package. turbo
treats the lockfile as a global dependency for *hashing* — which is why every package cache-missed on
the CVE commit — but hashing and `[ref]` filtering are different mechanisms. **The CVE bump itself,
which swapped `multer` and `engine.io` under the whole API, would have tested nothing.** The hook now
forces the full suite on `pnpm-lock.yaml`, root `package.json`, `pnpm-workspace.yaml`, `turbo.json`,
`vitest.base.ts`, `test/setup.ts`, root `tsconfig*.json` — keep that list in step with turbo.json's
`globalDependencies`.

### 14. A raised timeout budget that turned out to be inert

`a3-eslint-policy` blew its 90s budget twice (115s, 137s) in full-suite runs. The file carried an
explicit instruction *"if it ever blows 90s, do not raise it again — that would mean the config graph
has grown."* **That diagnostic was run before overriding it and came back falsified:** the config is
156 lines, last modified **before** the budget was set. So the budget was raised to 210s, and
`route-resolution`'s to 75s.

⚠️ **Then both tests passed at 9.3s and 13.3s in the next push — under their OLD ceilings.** The
machine settling down is what fixed them; the raises are inert headroom. **What has lasting value is
the diagnostic left in the file, not the number:** re-run it alone; still ~10s ⇒ the suite is starved
and the number is not the problem; grown ⇒ the config graph has grown, exactly as the first author
wrote. Verified in both directions the same day.

### 15. The portable playbook had drifted for five months without anyone noticing

Asked how to carry these lessons to other projects, the answer turned out not to be "write a
playbook" — `docs/portable-playbook.md` already existed, 1,503 lines, **dated 2026-04-26**, untouched
while the same lessons were re-learned and written into the handoff instead.

**A document nobody loads drifts into fiction.** Hence `docs/portable-verification-laws.md`: 37
stack-agnostic laws, each with its scar written shape-first so it survives its `_Provenance:_` line
being stripped for external sharing — verified by grepping the law bodies for repo-specific
references and finding none. And the delivery mechanism is stated in the doc rather than assumed:
**paste the laws into the new repo's agent instructions, not into `docs/`.** That is the difference
between a document and a control, and the April playbook is the evidence.

## Part E — Open decisions

⛔ **Moved to §A.2**, prioritised and with what each item needs. Keeping a second list here would
guarantee the two drift apart — which is Finding 5's own lesson applied to this file.

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

**2026-09-30.** Adjudicated 13-76 — the latch verified from source, and the two suite failures proven
non-attributable before signing anything. Its deploy then failed on the OSV gate, which cost the
morning and produced Findings 11–12: four CVE bumps, a `vitest` phantom correctly *not* suppressed,
and 98 failures that were a 13-hour-dead database behind a cache that had been replaying the last
honest answer. Scoped the pre-push gate afterwards (40 min → 95 s) and found its fail-quiet hole by
dry-running each change shape. Closed with the field-guide PDF and 37 portable laws — the last of
which exists because a portable playbook had already been sitting stale since April.
