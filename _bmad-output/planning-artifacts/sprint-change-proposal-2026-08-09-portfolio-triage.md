# Sprint Change Proposal — 2026-08-09 — Portfolio triage of the 64 open stories

**Status:** PROPOSED — awaiting (a) Awwal's ruling on the one open decision in §6, and (b) the
`fix/staff-role-filter` merge (§7 resume protocol).
**Author:** John (PM) — session 2026-08-09, main @ `0ab4574`.
**Supersedes nothing. Folds in:** the SCP that was owed for the 13-38 → 13-58 carve-out and the
13-38/13-42 amendments committed in `0ab4574` (BMAD rule: a session ending in scope changes produces
an SCP; that one was never written).

> ⚠️ **This file was deliberately created as a NEW file rather than a section in
> `docs/adjudication-agent-handoff.md`.** The adjudication agent is live in a side worktree and that
> doc is its living artifact — editing it now would collide on merge. The pointer into the handoff doc
> gets added AFTER the merge, per §7.

---

## 1. Trigger

Awwal asked for the six newly-written stories to be validated and the planning documents harmonised
before development, and then raised a broader suspicion: that among the remaining stories some are
"almost identical", producing ACs for work already done.

The suspicion is correct. The diagnosis needed widening, and the measurement below reframes the
exercise from story hygiene into portfolio triage.

---

## 2. What was measured — as of 2026-08-09, main @ `0ab4574`

⚠️ **Every number in this section is point-in-time and will move.** Re-derive with the commands given
rather than trusting the figure. This is the [[pattern-a-record-about-the-work-is-not-the-work]]
discipline applied to this document itself.

### 2.1 The board

```bash
# status distribution across the whole sprint file
grep -oE "^  [a-z0-9][a-zA-Z0-9.-]*: [a-z-]+" _bmad-output/implementation-artifacts/sprint-status.yaml \
  | awk '{print $2}' | sort | uniq -c | sort -rn
```

| status | count |
|---|---|
| done | 254 |
| ready-for-dev | 37 |
| backlog | 25 |
| in-progress | 7 |
| superseded | 5 |
| optional | 4 |
| review | 1 |

Not-done, not-superseded = **74 entries**, of which **10 are `epic-*` roll-up rows, not stories.**

> **➜ 64 remaining stories.** Awwal's recalled figure was exact.

```bash
# open stories grouped by epic (excludes done/superseded; the 'epic' bucket is roll-up rows)
grep -oE "^  [a-z0-9][a-zA-Z0-9.-]*: [a-z-]+" _bmad-output/implementation-artifacts/sprint-status.yaml \
  | grep -vE ": (done|superseded)$" | sed 's/^  //' | awk -F'-' '{print $1}' | sort | uniq -c | sort -rn
```

| epic | open | identity (confirmed from the file, not from memory) |
|---|---|---|
| **13** | 21 | Launch |
| **12** | 18 | `epic-12-dashboard-system-refresh-brief.md` — **but see Finding 3** |
| **9** | 11 | — |
| **11** | 6 | Multi-Source Registry |
| **10** | 5 | API Exchange (consumer auth / rate limit / admin UI / dev portal / audit dashboard; DSA legal track runs ahead of engineering) |
| prep + marketplace | 3 | — |
| | **64** | **6 epics simultaneously `in-progress`** |

### 2.2 Epic 13 alone

59 total: 38 done, 9 ready-for-dev, 12 backlog → **21 open**.

---

## 3. Findings

### F1 — The duplication is three different diseases, and merging cures only one

Awwal's instinct (merge near-identical stories) is right about a real problem but is the wrong
instrument for the case that prompted it.

| Disease | Evidence | Correct cure |
|---|---|---|
| **A. Story ↔ story overlap** | **13-44 ⊂ 13-10.** 13-44 (ready-for-dev, authored 2026-07-24, "EMERGENT from *do we have a campaign_sends UI?* — answer: no") exposes `ReportService.getCampaignFunnel` through a super-admin UI. 13-10 (backlog, older) already promised "per-campaign FUNNEL (sent→delivered→clicked→converted + bounce/complaint)… on the EXISTING dashboard surface". The funnel is in both. | **SUBSUME** |
| **B. Story ↔ CODE overlap** — the AC asks for shipped work | **13-57 AC1** (see F2). Merging two stories that each carry a stale AC yields one story with two stale ACs. | **DELETE THE AC**, cite `file:line` |
| **C. Story ↔ story coupling on one surface** | 13-42 AC10 + 13-57 AC3 + 13-60 AC3 all write the ops digest, sequenced independently → merge pain + [[pattern-census-counts-sites-not-callers]]. | **Assign one owner + consumers** |

**The case Awwal cited as motivation is B, not A.** Story-level merging would have left that AC intact.
Therefore dedupe must happen at the **AC level against the code**, not at the story level against
other stories.

**Counter-argument on record:** merging runs against the grain of the last successful move. 13-38 was
**split** into 13-58 on 2026-08-09 precisely because a badge story sat trapped behind an import that
had not started — and the split **released 224 live cards**. Splitting created value. So the rule is
conditional: **merge only where the merged story still ships in one pass.** 13-44→13-10 qualifies;
anything that would then sit behind a gate does not.

### F2 — 13-57's stated root cause does not survive one grep

13-57 AC1 asserts `normaliseNigerianPhone` "already exists in this codebase and is simply not called
on this path."

It **is** called — `apps/api/src/services/submission-processing.service.ts:235`, imported at `:25`.
The real defect is different, and is visible in `apps/api/src/lib/normalise/phone.ts:61-64`:

- `+234 08120004038` → strips to `+23408120004038` → `+234` branch → NSN = **11 digits** →
  `wrong_length` → the function **returns the raw input by design** ("so the row is not lost"). The
  caller does `canonical.phoneNumber = r.value || null` and hands that to a column carrying
  `CHECK (phone_number ~ '^\+234\d{10}$')`. **The normaliser's never-lose-the-row contract and the DB
  CHECK are in direct contradiction, and the warning it emitted goes nowhere.**
- `07051286580` (Adekemi) → `0` branch → NSN `7051286580`, prefix `70` (known) → `+2347051286580`,
  which **passes** the CHECK. So that insert did **not** die of phone format. Either that path never
  reaches `:235`, or it threw for another reason.

**Consequence:** a dev handed AC1 as written would find the normaliser already wired up and either
mark it done or flail. **AC1 must be rewritten before dev, and the second failure is still
undiagnosed.**

> ⏸️ **HELD PENDING MERGE (2026-08-09).** Awwal reports the adjudication agent has concluded Rosemary
> and Adekemi were **errors on its own path**, i.e. a different cause from the one diagnosed above.
> **F2's specific attribution is therefore UNCONFIRMED** until `fix/staff-role-filter` merges and its
> reasoning can be read (§7.2). Do not act on F2's root cause until then.
>
> **F2b — the systemic finding stands regardless of what caused those two.** Independently verified:
> - `submissions.processing_error` **column already exists** (`schema/submissions.ts:79`), alongside
>   `processed` / `processed_at`.
> - It is written in exactly **one** place: `webhook-ingestion.worker.ts:193`. The **webhook** channel
>   records its failures. The `public` / `enumerator` / `clerk` path
>   (`submission-processing.service.ts`) writes neither a terminal state nor a reason.
> - It is already **read** in three places, including an operator-facing counter —
>   `supervisor.controller.ts:188`:
>   `COUNT(*) FILTER (WHERE processing_error IS NOT NULL AND processed = true)`
>   and a classifier at `respondent.service.ts:640`.
>
> **Therefore the supervisor's failure counter cannot see any `processed = false` failure** — it
> requires `processed = true` AND a non-null error, and the failing human-channel path sets neither.
> A failure counter blind to failures is [[pattern-monitor-measuring-something-else]].
>
> **Consequence for 13-57: it is a WIRE-UP plus channel parity, not a build.** Column, writer pattern,
> reader and operator surface all exist and are proven on one channel. This holds even if the two known
> cases are fully explained by the adjudication agent — resolving the two rows without extending the
> mechanism is "clear the stock, leave the producer" (13-50 R5), which 13-57's own text warns against.

### F3 — Epic 12 is mislabelled, and the label is why it was deferred

Its open Tier-1 stories are **12-4** registryTotals model · **12-5** label honesty + n-per-chart ·
**12-6** data-health view · **12-7** registry data-status · **12-8** export data-health preview.

That is not a dashboard redesign. **It is the measurement-honesty track** — the same defect class as
`EMAIL_TIER` silently enforcing FREE on a Pro account, as
[[pattern-monitor-measuring-something-else]] (five metrics caught lying in one day), and as the
76-vs-139 mislabel that 13-6 is explicitly blocked on.

"Dashboard system refresh" reads as cosmetic and postponable. **The title is doing the
deprioritising.** Renaming it re-prioritises eleven stories with no scope argument.

Epic 12's 18 also split unevenly: **11 real** (12-1…12-11 + 12-9, all ready-for-dev, authored
2026-06-16) and **7 backlog shells** (12-12…12-18, one per role, self-labelled phaseable post-launch).

### F4 — Every deferred structural epic sheds symptom stories into Epic 13

This is the mechanism behind a 59-story launch epic, and it is the finding that most changes the plan.

| Deferred epic | Symptoms now living in Epic 13 |
|---|---|
| **12** (18) — measurement honesty | 13-6 (blocked on 12-4/12-6), 13-42 integrity watch, 13-44 |
| **11** (6) — multi-source registry | 13-2 / 13-39 / 13-40 all blocked on 11-2/11-5; **13-49's duplicate citizen records are 11-7's absence** (identity-ambiguous resolution + respondent merge) |
| **9-26** — the ingestion seam | **13-57** (see F5) |
| **10** (5) — API Exchange | **none.** Genuinely parkable |

The discrimination matters: **Epic 10 can be parked outright. Epics 11 and 12 cannot, because they
are already leaking into the launch epic** as blocked stories and as emergent incidents.

### F5 — 9-26 stopped the haemorrhage in one direction only

9-26's invariant, verbatim from the story file (`9-26-unified-ingestion-pipeline.md:132`):

> *"every respondent has a submissions row"*

**Directional.** Respondent ⇒ submission. Its AC#D2 even simulates a *submissions*-insert failure and
asserts the controller surfaces an error — i.e. the guarded case is the submission write failing after
a respondent exists.

Rosemary and Adekemi are the **exact inverse**: a submission that never became a respondent. Same
seam, opposite direction, and the guarded direction was already the safe one.

**➜ 13-57 is not a launch story. It is 9-26's missing half.** The fix belongs on the seam, not on the
symptom.

### F6 — States that are not real states, and stories that document their own death

- **6 epics `in-progress` at once** (8, 9, 10, 11, 12, 13) = zero epics in progress. This is *also*
  the generator of F1-A: when the board cannot be seen, an emergent story gets written from scratch
  instead of found in the backlog. 13-44 is the predictable output of 64 open stories across 6 open
  epics, not carelessness. **Fix the WIP and the duplication stops generating itself.**
- **9-27** `in-progress` since **2026-05-31** — ten weeks.
- **9-18** parked in `review` — precisely where [[pattern-verification-that-cannot-run-yet]] warns
  stories rot.
- **9-25** is `ready-for-dev` and its own status line reads *"DOWNGRADED to low/optional, DEFER… **Both
  reasons-to-exist are GONE**"*. **9-23** is `ready-for-dev` and re-scoped to *"a ~30-min cleanup"*.
  → These are killable **from the status line alone, without opening the story file.** That fact is
  the lever for §5's two-pass design.
- Epic **7, 8, 9, 11** retrospectives are all `optional` and all **unrun**. Four skipped retros — and
  a retro is exactly where "we wrote that story twice" surfaces. It was found by Awwal's intuition
  instead.

### F7 — The Assessor view HOLDS for the client deliverable; its Audit Queue is blind to the public channel

Measured 2026-08-09 (main `0ab4574`) in answer to Awwal's closure question — *can we get the data in
front of the Assessors?*

**What an Assessor CAN do today — verified at the route guard, not inferred:**
`apps/api/src/routes/respondent.routes.ts:19-44` — `AUTHORIZED_ROLES` includes
`UserRole.VERIFICATION_ASSESSOR` on:

| capability | route |
|---|---|
| Paginated respondent **registry list** | `GET /api/v1/respondents` |
| Respondent **detail** | `GET /api/v1/respondents/:id` |
| **Submission responses** (full questionnaire answers) | `GET /:respondentId/submissions/:submissionId/responses` |
| **Per-submission export**, CSV + PDF | `GET /:respondentId/submissions/:submissionId/export` |

Plus `export.routes.ts` admits the role, and the sidebar
(`features/dashboard/config/sidebarConfig.ts:131-137`) ships six entries: Home · **Audit Queue** ·
Analytics · **Registry** · Completed · Evidence. The pages all exist
(`AssessorHome/QueuePage/CompletedPage/EvidencePage/AnalyticsPage` + `AssessorReviewActions`), with
tests including an RBAC test.

> ⚠️ **Method note:** a first grep for the string `'verification_assessor'` across `routes/` returned
> only `assessor.routes.ts` + `export.routes.ts` and appeared to show the sidebar advertising a
> Registry the API refused. That was wrong — the guard uses the **enum constant**
> `UserRole.VERIFICATION_ASSESSOR`, not the string literal. Chased to the guard before asserting
> ([[feedback_verify_against_reality_before_asserting]]). Record the near-miss: a string-literal grep
> is not a permission audit.

**The real hole — the Audit Queue, `assessor.service.ts:104-187`:**

```
FROM fraud_detections
INNER JOIN submissions ON fraud_detections.submission_id = submissions.id
LEFT  JOIN respondents ON submissions.respondent_id = respondents.id
INNER JOIN users       ON fraud_detections.enumerator_id = users.id     ← requires an enumerator
WHERE (resolution IS NOT NULL OR severity IN ('high','critical'))
  AND assessor_resolution IS NULL
```

1. The queue is driven by **`fraud_detections`, not by respondents.** With no high/critical detections
   outstanding, the queue is **legitimately empty** — the dashboard works perfectly and shows nothing.
2. **`INNER JOIN users ON enumerator_id`** means every queue row requires an enumerator. **Public
   self-registrations have no enumerator, so the entire `public` channel is structurally invisible to
   the Audit Queue** — and the public channel is where the recent 145 → ~310 growth came from, and
   where the radio jingle will send everyone.
3. `respondents` is a LEFT JOIN and the only respondent column selected is `lgaId` — no name, trade or
   contact. This surface is an **enumerator quality-control console**, not an assessment tool.

**Verdict:** the Assessor can see, open, read and export the registry — **the client deliverable is
served.** What does not hold is the *Audit Queue*, and only for the public channel. Two different
products; do not let an empty queue be read as "the Assessor view is broken".

**Not asserted, needs one prod query before the client session** (there is no basis in code for a count):

```sql
SELECT severity, count(*) FROM fraud_detections
WHERE assessor_resolution IS NULL
  AND (resolution IS NOT NULL OR severity IN ('high','critical'))
GROUP BY severity;
```

### F8 — The Super-Admin-for-the-Assessor fallback is unnecessary, and should not be held in reserve

Awwal's stated worst case: provision a Super Admin account for the Assessor, revoke it after the
assessment. **F7 makes it moot** — the Assessor role already carries registry list + detail +
responses + export. But it should be struck as a fallback too, on four grounds:

1. **Scope.** Super admin on this system is not "registry plus a bit". It is user management, role
   assignment, settings/feature flags, the audit-log viewer, operations tooling and full export — over
   a citizen registry holding **NINs, phone numbers and photographs**, under NDPA with a DPIA on file
   (Appendix H). That is a data-protection exposure created to solve a problem that does not exist.
2. **The revocation is an un-run future action.** "Revoke when the assessment is over" is precisely
   [[pattern-ship-a-fix-that-never-fires]] — this project's top defect class. Revocations contingent on
   someone remembering do not happen.
3. **It corrupts attribution.** Assessor actions taken through a super-admin account are audited as
   super-admin. On a system where audit-chain integrity has been deliberately invested in, that is
   self-inflicted damage to the exact record the client is being shown.
4. **A cheaper tool already exists.** If an Assessor's view ever appears broken, the diagnostic is
   **View-As** (`view-as.routes.ts`, `view-as-data.routes.ts`, `ViewAsPage`, `ViewAsBanner`) — noted as
   partial (one role renders, prep-11), which makes finishing View-As the correct answer to "I can't
   see what they see", not a role escalation.

**Recommendation: strike it.** If a genuine gap appears, add the specific route to `AUTHORIZED_ROLES`
for `VERIFICATION_ASSESSOR` — one line, auditable, scoped, reversible in git.

---

## 4. Proposed changes

| # | Change | Rationale | Owner |
|---|---|---|---|
| C1 | **Rewrite 13-57 AC1** against the real defect (F2); diagnose Adekemi's failure separately. Re-home 13-57 as 9-26's second direction. | AC as written is unimplementable | dev + PM |
| C2 | **Rename Epic 12** from "dashboard system refresh" to name the measurement-honesty track | F3 — the title is the deprioritiser | Awwal |
| C3 | **12-12 … 12-18 → one story with a role parameter** (7 → 1) | Template-generated seven times; self-labelled phaseable | PM |
| C4 | **Park Epic 10** entirely | Zero Epic-13 dependencies; DSA legal track already ahead of engineering, so parking costs nothing | Awwal |
| C5 | **13-44 SUBSUME into 13-10** | F1-A | PM |
| C6 | **Resolve non-states**: 9-25 → KILL; 9-23 → 30-min cleanup or kill; 9-27 → real status; 9-18 → out of `review` | F6 | PM |
| C7 | **Name one owner for the ops-digest surface**; 13-42/13-57/13-60 become consumers | F1-C | PM |
| C8 | **Fix the duplicate slug**: `13-38-marketplace-association-confirmed-badge.md` and `13-58-marketplace-association-confirmed-badge.md` are two files with the same slug; 13-38 is now redesign-only and its filename still claims work it no longer owns (§2w drift) | harmonisation | PM |
| C9 | **Extend the backlog-grep rule to emergent stories** — before writing one, grep the backlog for the surface it touches. Currently the rule exists only for canonical primitives ([[feedback_canonical_primitive_backlog_sweep]]) | Stops F1-A regenerating | process |

Expected compression: **64 → low-40s on the board, with a gating set of roughly 12–18.**

---

## 5. Method — two passes, not one

Deep-validating 64 stories against the codebase is weeks. Don't. The status lines in
`sprint-status.yaml` are unusually rich — most carry their own justification, blockers and
re-verification notes, and **9-25 is killable from its status line without opening the story file**
(F6). That is the lever.

**Pass 1 — cheap portfolio triage. Status lines only. All 64. No story files, no code.** One verdict
each:

| Verdict | Meaning |
|---|---|
| **KILL** | Reasons-to-exist gone (9-25 class) |
| **SUBSUME** | Contained in another story (13-44 → 13-10 class) |
| **DEFER-OUT** | Real but post-launch; leaves the launch board |
| **UNBLOCK-FIRST** | Records the true dependency (Epic 12 → 13) |
| **RE-HOME** | ⭐ **The story is a symptom; attach it to the structural story that cures it** (13-57 → 9-26 seam; 13-49-class duplicates → 11-7) |
| **KEEP** | Survives to Pass 2 |

RE-HOME is the verdict F4 exists to justify, and the one a per-story tool cannot produce.

**Pass 2 — deep claim-check, KEEP set only.** Open the story files, grep the code. Every AC gets a
verdict with `file:line` evidence: satisfied-already → **delete the AC**; contradicted → **rewrite**;
unverifiable → **flag**. Affordable because it runs over ~20 stories, not 64.

Output: a portfolio ledger (verdict + evidence + true dependency per row), then
sprint-status ↔ epics ↔ roadmap updated in a single parity sweep
([[feedback_planning_artifact_parity_sweep]]).

### 5.0 PRE-FIELD CHECKLIST — ahead of the triage, per Awwal 2026-08-09

The triage does not get anyone into the field. These do. **Nothing in §5's two passes starts until
these are done.**

| # | Item | Why it is ahead of the triage | Cost |
|---|---|---|---|
| **0** | **Hand over `admin@oyoskills.com` (MFA reset + rename, §8.4) and walk the export end to end from it**: log in → Registry → filter → bulk export → open the file | This IS the client deliverable. Story 5.4 shipped it; it needs exercising once from the account the assessor will actually use, not building. Turns "it works" into "here it is". Account already exists (§8.4) — **provisioning cost is zero** | 10 min + an afternoon |
| **1** | **Run the fraud-detection count query (F7)** and prepare one sentence for an empty Audit Queue | An empty screen in front of a client who has waited 7 months reads as "your system shows nothing". Narrative fix, not a code fix — free now, expensive live | minutes |
| **2** | **13-57 as channel parity** — write a terminal state + `processing_error` on the `public`/`enumerator`/`clerk` failure path, and fix the supervisor filter so `processed = false` failures are visible (F2b) | Closes Awwal's MVP bar — *no respondent data lost, whatever the channel* — on the three human channels. A wire-up, not a build | small |
| **3** | **13-46** — burst readiness / send caps / registration throttle | The jingle multiplies public-wizard traffic. Already authored | as written |
| **4** | **13-59 + 13-60** — activation leaves something in the person's hands; a failed selfie is not swallowed | Field-day dignity items; enumerators hit these first | small |
| **5** | **One query, all channels, before the jingle**: count submissions with no respondent, per source | Awwal's MVP bar expressed as a check rather than a belief | minutes |

**Then, and only then — Sequencing:** Pass 1 over all 64 → Awwal picks the epic (§6) → Pass 2 on
survivors.

> **Standing note on the bar.** Adopt Awwal's sentence verbatim as the field go/no-go: *"no respondent
> data is lost whatever the channel."* It beats every framing in the PRD/epics/roadmap because it is
> testable and channel-agnostic — item 5 is that bar as a query.

**Tooling note:** do **not** use the IR (check-implementation-readiness) workflow here. It is built to
review PRD + Architecture + Epics at a phase boundary and will generate findings about documents we
are not changing. Its adversarial *posture* is right; its scope is wrong.

---

## 6. The one open decision — Awwal's ruling required

**Which structural track leads after 13-57, and which epics are explicitly parked.**

Pass 1 produces a ranked board but cannot make this call. Six open epics is the disease; a ledger that
leaves six epics open merely documents it more precisely.

**PM recommendation:**
1. **Epic 12's honesty tier (12-4 → 12-6)** — unblocks 13-6, cures the lying-metrics class that has
   already bitten three times, cheapest of the three.
2. **Epic 11's identity/merge (11-7)** — 13-49 already paid for its absence in duplicate citizen
   records.
3. **Epic 10 parked** until field work is done.
4. **Epics 9/10 explicitly parked**, not silently `in-progress`.

Epic scope is Awwal's ruling, not the PM's ([[feedback_halt_on_ac_vs_reality_conflict]]).

---

## 7. Resume protocol — read this first on resume

### 7.1 Repo state observed 2026-08-09 (session start `0ab4574`)

```
main                          0ab4574   clean
C:/Users/DELL/wt-staff        0ab4574   [fix/staff-role-filter]  ← adjudication agent, LIVE
…/scratchpad/wt-ratelimit     6536b8c   (detached HEAD)          ← stale, from another session
```

- **`fix/staff-role-filter` has ZERO commits ahead of main.** The adjudication agent's work exists
  only as **4 uncommitted working-tree changes** in `C:/Users/DELL/wt-staff`:
  - `M apps/api/src/controllers/staff.controller.ts`
  - `M apps/api/src/services/staff.service.ts`
  - `M apps/web/src/features/dashboard/api/registry.api.ts`
  - `?? apps/api/src/services/__tests__/staff-list-excludes-citizens.integration.test.ts`
  → **There is nothing to merge yet.** "Wait for the merge" needs the checkable trigger in §7.2.
- `wt-ratelimit` @ `6536b8c` **is an ancestor of main** — nothing at risk there, it is just a stale
  worktree pinned to the 2026-08-07 handoff refresh. Prunable, no urgency.

### 7.2 Resume trigger (checkable, not vibes)

```bash
git merge-base --is-ancestor fix/staff-role-filter main && echo "MERGED — resume" || echo "not yet"
git log --oneline 0ab4574..main            # what the adjudication agent actually landed
git -C /c/Users/DELL/wt-staff status --short   # should be empty when it is done
```

### 7.3 On resume, in this order

1. `git log --oneline 0ab4574..main` + read the full diff — **take the adjudication agent's context
   once**, as Awwal asked.
2. **Re-run every command in §2.** The merge changes the board; the counts above are as-of `0ab4574`.
3. Reconcile §3 findings against what landed, then proceed from §5's sequencing.
4. **Add the pointer into `docs/adjudication-agent-handoff.md`** (deliberately not done pre-merge —
   see the banner at the top of this file).

### 7.4 Pre-registered invalidation risks — what the incoming diff could break in this proposal

The adjudication agent is editing **staff listing + registry read paths**, and its new test is named
`staff-list-excludes-citizens`. Therefore:

- **A staff list that was showing citizens is the same defect class as F3** — a list reporting the
  wrong population. If confirmed, it is *additional evidence for the Epic 12 rename (C2)*, and should
  be cited there.
- If the diff changes **registry counts or denominators**, then F3's dependency reasoning (12-4
  registryTotals ← 13-6) and every count in §2 need re-reading before Pass 1.
- If it touches `submission-processing.service.ts` or `lib/normalise/*`, **F2 must be re-verified from
  scratch** — the `file:line` citations above would move.
- If it adds or closes stories in `sprint-status.yaml`, the **64 is stale** and §2.1 must be re-run
  before any triage verdict is issued.

### 7.5 Reopen triggers for this SCP

- Awwal rules differently on §6 → rewrite §4 C2/C4 and re-sequence.
- Pass 1 yields materially fewer than ~20 KILL/SUBSUME/DEFER-OUT/RE-HOME verdicts → the compression
  thesis in §4 was wrong; say so plainly rather than forcing the number.
- A third silently-dropped citizen appears before 13-57 ships → stop the triage, ship 13-57 narrow.

---

## 8. Access decision for the client assessment — RULED 2026-08-09

**Awwal's directive:** do not let account provisioning block the field enumeration. The Assessor needs
enough access to judge the whole **data-collection process**, not merely to read the registry. Fix the
Assessor account properly later.

**Priority ACCEPTED without qualification** — field enumeration proceeds; this is not a gate.
**Mechanism CHANGED**, on two measured facts rather than on policy.

### 8.1 Fact one — there is no Assessor-account work to defer

`verification_assessor` is a fully-wired first-class role, not a stub:

- `packages/types/src/constants.ts:6` — enum member
- `packages/types/src/roles.ts:12` — display name "Verification Assessor"; `:41` — in the role list
- `routes/respondent.routes.ts:19-44` + `routes/export.routes.ts:22-25` — admitted at the guards
- `features/dashboard/pages/Assessor*.tsx` (5 pages) + `AssessorReviewActions` + RBAC test
- `sidebarConfig.ts:131-137` — six nav entries

**Creating an Assessor account and creating a super-admin account are the same single act:** create a
staff user, assign a role. **The "cheap option" saves nothing**, because the expensive thing it was
avoiding does not exist.

### 8.2 Fact two — credential sharing does not work on this system

This platform is **single-session by design**, and 9-48's review hardened it further:

- `auth.service.ts:866` — *"Create session (invalidates previous sessions - single session
  enforcement)"*
- `session.service.ts:27, :50` — single-session enforcement; a new session invalidates the previous one
- `token.service.ts:145-146` — *"M2 (Story 9-48 review): enforce AT-MOST-ONE active refresh token per
  user. The system is single-session by design (`users.currentSessionId` is single-…)"*

**Therefore: when the Assessor logs into the shared super-admin account, Awwal is logged out — and when
Awwal logs back in, the Assessor is logged out.** They evict each other in a loop, during a client
assessment and simultaneously during the field push and the radio jingle, when super-admin is the
account running operations.

This is not a risk to be accepted. It is the **designed behaviour** of a control this project
deliberately built. Credential sharing was never an available option; it just hadn't been tested.

### 8.3 Conceded — the broad-access instinct is correct

The Assessor role does **not** cover judging the *process*: the audit-log viewer, fraud detections,
import batches, operations/ops-digest surfaces and settings are outside its grant. An assessor asked to
form a judgement on **how data was collected** legitimately needs more than registry read. Awwal's
scope instinct is right; only the sharing mechanism was wrong.

### 8.4 DECISION — the second account already exists. Verified on prod.

Awwal reported two live super-admin accounts. **Confirmed by read-only query on prod
(`oslsr-postgres`, via Tailscale, 2026-08-09), at Awwal's invitation:**

| email | full_name | role | status | mfa_enabled | last_login | created | live_session |
|---|---|---|---|---|---|---|---|
| `awwallawal@gmail.com` | Awwal Lawal | super_admin | active | **t** | **2026-08-09** | 2026-02-23 | f |
| `admin@oyoskills.com` | Super Admin | super_admin | active | **t** | **2026-06-03** | 2026-04-26 | f |

```sql
-- reproduce (read-only). NB: `users` has role_id → roles.name; there is no users.role column,
-- and no users.is_active (it is users.status).
SELECT u.email, u.full_name, r.name AS role, u.status, u.mfa_enabled,
       u.last_login_at::date, u.created_at::date, (u.current_session_id IS NOT NULL) AS live_session
FROM users u JOIN roles r ON u.role_id = r.id
WHERE r.name IN ('super_admin','verification_assessor') ORDER BY r.name, u.created_at;
```

**➜ §8.4's earlier recommendation to "create a second named super-admin" was already satisfied in April
2026.** `admin@oyoskills.com` is a separate, generically-named account **dormant for 67 days**. Awwal's
plan is therefore correct and the cost is **zero**: hand over account #2. No provisioning, no shared
credential, no session eviction (two accounts = two sessions), and revocation is a single account
action. The PM objection in §8.2 applied only to sharing *one* credential and does not apply here.

**Three operational steps, from the prod check:**

1. ⚠️ **MFA is enabled on `admin@oyoskills.com`.** Email + password alone will stall at the MFA prompt,
   and the second factor sits with Awwal. **Reset MFA and have the assessor enrol their own** — which
   also makes attribution honest: the holder of the second factor is the identity in the audit log.
2. **Rename `full_name` from "Super Admin" to the assessor's actual name** for the engagement. One
   field; it converts every audit row generated during the assessment from anonymous into evidence —
   and the audit trail is part of what is being assessed.
3. **Revocation trigger, written down not remembered** ([[pattern-ship-a-fix-that-never-fires]] is this
   project's top defect class, and a credential held by an external party is its worst instance):
   record in `docs/adjudication-agent-handoff.md` **in the same commit that records the handover** —
   *assessment report delivered → reset password + re-bind MFA to Awwal.* Never one without the other.

### 8.5 Unexpected finding — ZERO `verification_assessor` accounts have ever existed on prod

The query above covered both roles and returned **only the two super admins**. So the entire Assessor
surface — five pages, the Audit Queue, the Registry view, the export — **has never been exercised live
by a real account**, despite being fully built (§8.1).

**This cuts FOR Awwal's plan, not against it.** Standing up a first-ever assessor account for a client
session means discovering first-run bugs in front of the client. Using the proven super-admin account
avoids that entirely.

Consequences to carry forward:
- The assessor-account work stays **real, open backlog** — it cannot be marked done on the strength of
  the code existing ([[pattern-a-record-about-the-work-is-not-the-work]]).
- **§5.0 item 0 is retargeted:** exercise the bulk export from `admin@oyoskills.com`, the path the
  assessor will actually use — not from a hypothetical assessor account.
- Whenever a `verification_assessor` account IS first provisioned, treat that session as a first-run
  smoke of an unexercised surface, not as routine login.

**Fallback if broad access later proves excessive:** provision a real `verification_assessor`, which
already carries registry list + detail + responses + bulk filtered export (F7). One role assignment.
