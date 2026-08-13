# Sprint Change Proposal — 2026-08-09 — Portfolio triage of the 64 open stories

**Status:** ✅ **BOTH BLOCKING CONDITIONS DISCHARGED 2026-08-11.** ~~awaiting (a) Awwal's ruling on the
one open decision in §6, and (b) the `fix/staff-role-filter` merge (§7 resume protocol).~~
**(a)** §6 **RULED** — Epic 12's honesty tier leads, five epics parked (§6 header, detail §10.14).
**(b)** the merge landed in `7e64074`; §7.4's invalidation risk fired and was **discharged clean** —
the board is still exactly **64** (§10.12 A cross-ref, and the §5 pointer in the handoff).
**➜ Pass 1 may now run.** Remaining open rulings are listed in §10.14 and **none of them block it.**
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
| **12** | 18 | `epic-12-measurement-honesty-and-dashboard-refresh-brief.md` — **but see Finding 3** |
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
| **0b** | ✅ **TEST A — RUN BY AWWAL 2026-08-10. The enumerator field path, end to end, on prod.** Invite → activation wizard → selfie → `/staff/login` → ID card. **It failed at the selfie and the account has no card.** Findings + prod evidence in §9 below; three defects re-homed there. **This item is now CLOSED as executed — do not re-run it as written; Test B (§9.5) supersedes it.** | The path had been travelled exactly once before, and that attempt also failed. Two failures out of two attempts is a measurement, not bad luck | done |
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

## 6. ✅ RULED 2026-08-11 by Awwal — Epic 12's honesty tier leads; five epics parked

> **THE RULING:** **Epic 12's honesty tier (12-4 → 12-6) leads**, **11-7 second**, and **Epics 9 and 10
> are explicitly parked** — parked, not silently `in-progress`. Full wording, the reframe Awwal accepted
> with it, and the other rulings of the same session: **§10.14.**
>
> ⭐ **The reframe matters as much as the pick.** F6 measured **six epics `in-progress` at once, which
> means zero are** — and F6 also identifies that state as the *generator* of the duplication in F1-A.
> So the load-bearing half of this ruling is not "Epic 12 wins", it is **"five epics are closed".**
> Ranking three candidates while leaving six open would have documented the disease more precisely
> without treating it.

*(Original framing preserved below for the reasoning that produced it.)*

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

---

## 9. TEST A — executed by Awwal on prod, 2026-08-10. The field path does not work yet.

**What was run:** Firefox → Super Admin → invite `lawalkolade+testenumerator@gmail.com` as Enumerator
→ activation email received → activation wizard walked → selfie step → `/staff/login` → attempt to
obtain the ID card, from both the enumerator's own account and the Super Admin staff page.

### 9.1 Prod evidence (queried 2026-08-10 via Tailscale, read-only)

```sql
SELECT u.email, r.name, u.status, u.created_at::timestamp(0), u.live_selfie_verified_at,
       (u.live_selfie_original_url IS NOT NULL) AS has_selfie,
       (u.live_selfie_id_card_url  IS NOT NULL) AS has_idcard, u.liveness_score
FROM users u JOIN roles r ON u.role_id=r.id
WHERE u.email LIKE 'lawalkolade+%' OR r.name='enumerator' ORDER BY u.created_at;
```

| email | status | created | has_selfie | has_idcard | liveness_score |
|---|---|---|---|---|---|
| `lawalkolade@gmail.com` | active | 2026-04-20 | **t** | **t** | **0.8589…** |
| `lawalkolade+enum1@gmail.com` | deactivated | 2026-08-09 | f | f | — |
| `lawalkolade+testenumerator@gmail.com` | active | 2026-08-10 | f | f | — |

⭐ **THE APRIL ACCOUNT HAS A SELFIE AND A CARD. BOTH AUGUST ATTEMPTS HAVE NEITHER.** The pipeline is
not unbuilt — it has **worked on this system before**. Two failures out of two recent attempts, on
two different days, by the same operator. That is a measurement, not bad luck, and it makes this a
**suspected regression** rather than an unfinished feature. ⚠️ Not asserted as proven: nobody has
bisected it, and the April capture was on a different device.

### 9.2 D1 — the capture path BLOCKS. This is a third, distinct selfie defect.

Reported: *"the camera snaps the picture but does not accept it — it says face not recognised; if I
click capture it shows captured. In the end I skipped the step."*

`LiveSelfieCapture.tsx:109` — `canCapture = !isModelLoading && (modelFailed || faceCount === 1)`.
With the model loaded and `faceCount === 0`, **the Capture button is disabled and the red "No face
detected" badge shows.** The three selfie defects are now distinct and only one is fixed:

| # | defect | state |
|---|---|---|
| 1 | preview 3:4 vs capture 16:9 — what you saw was never what was saved | fixed `22b00eb` |
| 2 | a failed selfie is swallowed, activation completes silently | **13-60, open** |
| 3 | **face detection returns 0 faces, so capture is blocked entirely** | **NEW — re-homed to 13-60** |

⚠️ **LEADING HYPOTHESIS, NOT A MEASUREMENT — do not fix on it.** The `22b00eb` fix requests a
**portrait** stream (`aspectRatio: 3/4`, ideal `960×1280`, `LiveSelfieCapture.tsx:144-149`) and its
own comment says it was designed so *"3:4 at 960×1280 matches the container"* — **that is a phone
shape.** Awwal tested on **desktop Firefox**, where laptop webcams are natively landscape; with
`ideal` (not `exact`) the browser returns its closest match, which may be a cropped or letterboxed
frame that the detector then reads as no face. **If true, the 08-09 fix improved the phone and
regressed the desktop.** The handoff's existing warning — *"the camera fix is NOT RED-verified;
verify on a phone"* — is therefore **still open**: a desktop failure does not discharge it.

**The one test that settles it, before any code changes:** open the activation page on a **phone**,
and in the desktop case read `video.videoWidth`/`videoHeight` in the console. Two numbers decide
between "the constraint is wrong", "the detector is wrong" and "the model did not load".

**Ruled OUT by inspection, so nobody re-chases them:** CSP is not the blocker — `connectSrc`
explicitly allows `https://cdn.jsdelivr.net` (`app.ts:196`), which is where the model loads from.
And the amber *"Face detection unavailable"* path was not what Awwal saw, so `modelFailed` was false
and the model **did** load.

📌 **Separate risk worth recording while we are here:** the face-detection model is fetched from a
**third-party CDN at activation time** (`LiveSelfieCapture.tsx:29`) with a 15s timeout. A field
officer on poor connectivity silently falls through to `modelFailed`, where capture is allowed with
no guidance at all. That is a launch-path dependency on `jsdelivr.net`.

### 9.3 D2 — `liveness_score` IS NOT A LIVENESS SCORE. Sixth instance of the class.

`photo-processing.service.ts:133-135`:

```ts
// In production, livenessScore comes from Rekognition.
const livenessScore = Math.min(sharpness / 100, 0.99);
```

**Rekognition is not wired. The column named `liveness_score` holds an image-SHARPNESS ratio.** And:

- **Nothing gates on it.** No threshold check exists anywhere in the API.
- `user.controller.ts:47` — `liveSelfieVerifiedAt: new Date(), // Auto-verify for now`.
- The only real check is client-side: *is there one face in frame* — which a printed photograph
  satisfies.

➜ **The live-capture requirement currently buys no anti-fraud property whatsoever.** It is
[[pattern-monitor-measuring-something-else]] again — a field whose NAME asserts a property the value
does not have. Directly decides §9.4.

### 9.4 D3 — Awwal's question: allow a passport-photo UPLOAD instead of live capture?

**Yes — with one non-negotiable condition.** The usual objection is "live capture is the anti-fraud
control", and §9.3 shows that objection is **already false on this system**. Allowing an upload
therefore forfeits nothing that exists today; it removes friction that is currently protecting
nothing, on the step that has now blocked two of two field-path attempts.

⛔ **The condition: record WHICH path produced the photo, and never write an uploaded file into a
column named `live_selfie_*` without a discriminator.** Storing an upload under that name recreates
exactly the defect in §9.3 — a name asserting a property the value does not have — and it would be
self-inflicted, because we would know at write time. Live capture stays the DEFAULT and preferred
path; upload is an explicit, recorded fallback, and the operator can see which staff used which.

### 9.5 D4 — 13-60's TITLE IS WRONG. The card does not ship without a photo; it does not ship AT ALL.

Awwal, from the Super Admin staff page: *"User has not uploaded a selfie. ID Card cannot be
generated."* Confirmed in code — `user.controller.ts:89` refuses when `liveSelfieIdCardUrl` is null.

13-60 is titled *"…and the ID card ships without a photo"*. **It does not.** The system correctly
refuses to generate a photoless card. The real consequence is worse for the field and better for
trust: **an enumerator who skips or fails the selfie has NO ID CARD AT ALL** — nothing to show at a
household door. **This raises 13-60 from a dignity item to a hard field-day gate**, and the story
title must be corrected before a dev reads it (13-57's lesson: a story raised on a false claim wastes
a dev's day).

### 9.6 Teardown of the test account — deactivate, do not delete

**Follow the `+enum1` precedent set on 2026-08-09:** that account is `deactivated`, not deleted.

1. **Deactivate `lawalkolade+testenumerator@gmail.com` now**, not later. 13-61 shipped
   `status=active` on the enumerator picker, so deactivation removes it from the live picker
   immediately — and an active test enumerator selectable during a real field day is a live footgun.
2. **Do not DELETE the user row.** `audit_logs` is append-only (a DB trigger rejects DELETE and rolls
   back the whole transaction), and those rows reference the account. §2h says the same.
3. **Reactivate for Test B** — one click, reversible, and reusing the same identity keeps the
   comparison honest.
4. **No respondent cleanup is owed from Test A** — the run never reached a registration, so the §2h
   child-first recipe has nothing to remove. It applies to Test B, which will.

#### ✅ 9.6a CLOSURE STATE — measured 2026-08-12, one action left and it is a UI click

| fact | value |
|---|---|
| account | `lawalkolade+testenumerator@gmail.com` · `019febf3-9853-7ae6-b900-8da60ff4fdde` |
| status | **`active`** — the one thing still to change |
| selfie + ID card | **present** (captured 08-11 after the CSP fix) |
| **submissions registered by it** | **0** |
| respondent cleanup owed | **none** — §2h's child-first recipe has nothing to remove |

**➜ Deactivate it from the Staff page. Two clicks, and it is deliberately NOT scripted.**
`staff.service.ts:338-392` does three things in one transaction — sets `status`, writes the audit row,
and then **`SessionService.invalidateAllUserSessions()` + token revocation (AC6)**. A raw `UPDATE
users SET status` would be a **partial deactivation that leaves a live session behind**, and writing a
script to reproduce a button is how a second path gets built (13-55's five-promotes lesson). The UI
also attributes the action to the human who took it, which a script cannot honestly do.

**What deactivation achieves:** 13-61 shipped `status=active` on the enumerator picker, so the test
account leaves the live picker the moment it flips — no one can assign field work to it by accident.

⚠️ **Keep the account and its artefacts.** The selfie and ID card are the *evidence that the CSP fix
worked* and the starting state for Test B (§9.7). Reactivating is one click. **Do not delete the
row** — `audit_logs` is append-only and references it.

📌 **After the flip, the enumerator count returns to ONE — and that one is still Awwal's.**
Provisioning real field officers remains the only non-code item on the field-day gate.

### 9.7 Test B — supersedes Test A, runs after 13-59 + 13-60

Same walk, **on a phone**, plus: the confirmation email arrives with **no attachments**; the
first-login modal offers both artefacts; the ID card downloads and **opens with a photo present**;
the QR resolves; the briefing PDF matches the current `.md`; and the download audit rows exist.

### 9.8 ⭐ THE RETRY PATH AND THE CARD DOWNLOAD ALREADY EXIST — on a page no enumerator can reach

Found 2026-08-10 while checking why Awwal's phone attempt left `has_selfie = f`. **The activation
wizard is ONE-TIME**: once activated, the link is consumed, so the camera cannot be re-tested on that
account at all. Chasing the alternative turned up this:

| piece | where it already is |
|---|---|
| Post-activation selfie upload | `POST /users/selfie` — `user.routes.ts:23`, `authenticate`-gated |
| The capture UI | `ProfileCompletionPage.tsx:101` renders the **same** `LiveSelfieCapture` |
| **ID card download UI** | `ProfileCompletionPage.tsx:5` imports **`IDCardDownload`** — it exists |
| The route | `/profile-completion`, `App.tsx:719` |

**So the "way back" 13-60 AC2 asks for, and the download surface 13-59 AC5/AC6 specify, are both
already built.** Three defects keep them from existing in practice:

1. **Nothing in the enumerator's navigation points at `/profile-completion`.** `sidebarConfig.ts`
   gives enumerators seven entries and this is not one of them. A page nobody can reach is
   [[pattern-ship-a-fix-that-never-fires]] — the code runs, the path is never travelled.
2. ⛔ **Its guard redirects to the WRONG DOOR for staff.** `App.tsx:721` —
   `<ProtectedRoute redirectTo="/login">`. That is the **citizen** login, which hard-rejects staff.
   **Same defect class as the activation redirect fixed in `22b00eb`**, still live on this route.
3. Nothing ever tells a staff member the page exists.

**Consequences for the two stories — both SHRINK:**

- **13-60 AC2** ("a way back that does not need an admin") is a **wire-up**, not a build: fix the
  redirect to `/staff/login`, put it in the navigation, and point people at it.
- **13-59 AC5/AC6** must **reuse `IDCardDownload`**, not write a second one. 13-55's lesson — five
  hand-written copies of one operation — applies before the second copy exists, not after.

📌 **This is the third time this week the finding has been "the machinery exists, it is not connected
to the person who needs it"** — after 13-57/F2b (`processing_error` written on one channel only) and
13-61 (a filter sent and never applied). Worth naming as a pattern in its own right.

### 9.9 ➜ IMMEDIATE: the camera CAN be re-tested on a phone today, with no new invite

Log in as `lawalkolade+testenumerator@gmail.com` **on the phone** and go to **`/profile-completion`**.
It renders the same `LiveSelfieCapture` component that blocked during activation.

- **If the face badge goes green on the phone** → the desktop-vs-portrait hypothesis in §9.2 is
  confirmed, and the fix is the video constraint, not the detector.
- **If it blocks on the phone too** → the constraint hypothesis is dead and the detector (or the
  model load) is the target. Either way it is one observation, and it is free.
- Success also writes a real selfie, which **unblocks the ID card** and makes the card path testable
  in the same session.

⚠️ Deep-link directly; there is no navigation to it. If it bounces to `/login`, that is defect 2 in
§9.8 firing — the guard, not the camera.

### 9.10 ⛔ ROOT CAUSE CANDIDATE FOUND — "Use Photo" does nothing, and CANNOT report why

Awwal, 2026-08-10, phone, `/profile-completion`: model failed → capture allowed → photo captured and
visible → **"Use Photo" pressed several times, no response of any kind.**

**The certain defect** — `LiveSelfieCapture.tsx:96-103`:

```ts
const confirm = async () => {
  if (!capturedImage) return;
  const res  = await fetch(capturedImage);   // capturedImage is a data: URL
  const blob = await res.blob();
  const file = new File([blob], "selfie.jpg", { type: "image/jpeg" });
  onCapture(file);
};
```

**No `try`/`catch`, no error state, no feedback.** Any throw here rejects an unhandled promise and
the UI does *literally nothing* — which is exactly the reported symptom. This is certain from the
code and is a defect on its own merits, independent of what threw.

⚠️ **It also proves where the failure is.** `ProfileCompletionPage.handleSelfieCapture` (`:23-58`)
*does* have a try/catch and renders `error`. Awwal saw no error, so **the failure happened before
`onCapture(file)` was ever reached** — i.e. inside `confirm()`, not in the upload.

**Leading cause — `fetch()` of a `data:` URL against our own CSP:**

| directive | contains `data:` | consequence |
|---|---|---|
| `imgSrc` (`app.ts:179-185`) | **yes** | the captured preview renders — which is why it *looks* fine |
| `connectSrc` (`app.ts:190-198`) | **no** | `fetch(dataURL)` is a candidate to be blocked outright |

⚠️ **Stated as a candidate, not a conclusion.** The April 2026 account has a selfie and CSP has been
enforced since `aa980a8` (2026-03-01), so a simple "CSP broke it" story does not fit on its own.
Browsers differ on whether `connect-src` governs `data:` URLs in `fetch()`; **a browser change
between April and August is the obvious reconciler and has not been checked.** Do not close this
without the console evidence.

**⭐ THE STRUCTURAL FINDING, AND IT IS THE IMPORTANT ONE — `app.ts:226`:**

```ts
reportOnly: process.env.NODE_ENV !== 'production',
```

**CSP is REPORT-ONLY everywhere except production.** So a CSP-caused failure on this path *cannot
happen* in dev, in test, in CI or in E2E — **it can only happen on prod**, and there it fails
silently because of the missing catch. That is how this shipped and survived: the two defects cover
for each other. Sibling of [[pattern-test-that-passes-over-a-hole]] at the environment level —
**every green suite in this repo runs with the production security posture disabled.**

**The fix removes the class, not the instance: do not `fetch()` your own data URL.** Decode it
directly (`atob` → `Uint8Array` → `Blob`) or take `canvas.toBlob()` from the video frame. No network
layer, no CSP surface, no failure mode. Plus a `try`/`catch` with a visible error, because a capture
step that can fail without saying so is how this cost two field-path attempts.

**Consequences:**

1. 🚨 **This is a HARD FIELD-DAY BLOCKER.** No photo → no ID card (§9.5) → an enumerator with nothing
   to show at a door. It is not a polish item and 13-60 must carry it as AC7.
2. ✅ **AC6's upload fallback BYPASSES this bug entirely** — an `<input type="file">` hands over a
   `File` directly, with no data-URL round trip. That is now a second, independent argument for it.
3. **Add a prod-posture CSP test.** Something must exercise the enforced policy, or the next
   `connect-src` omission is found the same way — by an operator, in the field.

**One diagnostic settles the cause** (do it on desktop, console open, at `/profile-completion`): get
the face badge green, press **Use Photo**, and read the console. A CSP violation naming `connect-src`
confirms it; any other throw redirects the fix. If face detection will not go green, holding a
printed photo or a second screen in front of the camera satisfies the one-face check — which is
itself further evidence for §9.3.

### 9.11 🚨 LIVE PRODUCTION INCIDENT — `sw.js` is cached `immutable` for a year, so NO WEB DEPLOY REACHES A RETURNING USER

**Found 2026-08-10 by chasing the `bad-precaching-response` in Awwal's console. This supersedes and
partially invalidates §9.2, §9.10 — see "What this invalidates" below.**

**The chain, every link measured:**

| # | fact | evidence |
|---|---|---|
| 1 | `sw.js` lives at the **docroot**, not under `/assets/` | `/var/www/oslsr/sw.js` |
| 2 | So it misses the `location ^~ /assets/` block and falls to the generic `location ~* \.(js\|css...)$` regex, which sets `expires 1y` + `Cache-Control public, immutable` | `sites-available/oslsr:102-112` |
| 3 | Cloudflare honours it | `curl -I https://oyoskills.com/sw.js` → `Cache-Control: public, max-age=31536000, immutable`, `cf-cache-status: HIT`, `Age: 549823` (**6.4 days**), `last-modified: Tue, 04 Aug 2026` |
| 4 | The **served** `sw.js` precaches `wizard.api-Dj_u-AzN.js` | `curl -s https://oyoskills.com/sw.js \| grep -oE "wizard\.api-[^\"]+"` |
| 5 | That chunk is **gone** — the current build ships `wizard.api-CpZoi5u9.js` | `Dj_u-AzN` → **404**, `CpZoi5u9` → **200** |
| 6 | The `@previous_build` fallback cannot save it: it holds only the **immediately** previous build, and Aug-4 is several deploys back | `sites-available/oslsr:139` |
| 7 | Workbox `install` therefore throws `bad-precaching-response` → **the new SW never activates** | `sw.js:1 _handleInstall` in Awwal's console |
| 8 | The **origin is healthy** — 253 precache entries, **0 missing** on disk, docroot stamped `2026-08-10 12:43` | verified on the VPS |

➜ **An `immutable` header on a service worker turns a self-updating cache into a permanently frozen
one.** The origin deploys correctly and the browser never sees it.

**Blast radius — this is the finding, not the 404:**

- **Every returning visitor holding a service worker is running the 4 August build.** Awwal included.
- **No web-side change has reached them since.** That includes `22b00eb`'s camera aspect fix (9 Aug)
  and 13-61's `registry.api.ts` picker fix (9 Aug).
- A first-time visitor with no SW gets the current build — so the bug is **invisible to exactly the
  person most likely to test it**, and reproduces only for returning users.
- 🚨 **Launch-gating.** A radio jingle sends returning users to a frozen build, and every subsequent
  fix silently fails to arrive.

**⛔ WHAT THIS INVALIDATES — re-run before trusting:**

- **§9.2's desktop "No face detected" is most likely the PRE-FIX 16:9 capture**, not a new defect: the
  aspect bug was fixed on 9 Aug and that fix **never reached the browser**. A face small and centred
  in a wide frame is exactly what a detector misses. **The leading hypothesis in §9.2 (portrait
  constraint regressed the desktop) is now the LESS likely explanation** — the opposite may be true:
  the fix works and was never delivered.
- **§9.10's dead "Use Photo"** was observed against possibly-stale code. The missing `try`/`catch` in
  `confirm()` is still a real defect in current source, but **whether CSP is what threw is unproven
  and must be re-observed on the current build.**
- **Every Test A camera observation is suspect** until repeated after the SW is cleared.

**The fix — three parts, first two are minutes:**

1. **nginx:** `location = /sw.js { add_header Cache-Control "no-cache"; expires -1; ... }`. An **exact**
   `=` match outranks the regex block (same lesson the `^~ /assets/` comment already records —
   it just did not cover the docroot). Repeat the full security header set: `add_header` in a
   location disables inheritance, and that comment is already in the file.
2. **Purge the Cloudflare cache for `/sw.js`** (a purge-everything is safer given `Age` shows other
   docroot files may be stale too). Without this, step 1 changes nothing at the edge for a year.
3. **A check that would have caught it:** assert `Cache-Control` on `/sw.js` contains `no-cache` as
   part of prod-verify. A deploy that "succeeded" while no user could receive it is
   [[pattern-monitor-measuring-something-else]] applied to the deploy itself — CI green, VPS SHA
   correct, health 200, and the change reaching nobody.

**Operator step for anyone testing:** devtools → Application → Service Workers → **Unregister**, tick
**Update on reload**, hard-reload. That is also the workaround to give any user stuck on a frozen
build until the purge lands.

📌 This is the **fourth** instance this week of "the machinery exists, it is not connected to the
person who needs it" — after `processing_error` (one channel), the staff filter (sent, never applied),
and `/profile-completion` (built, unreachable). Here the whole deploy pipeline works and the artefact
never arrives.

---

## 10. THE SILENT COHORT — one complaint, 92 people in the same state (2026-08-11)

**Author:** adjudication agent, main @ `c8d3aed` (== `origin/main` == prod). All figures queried
read-only against prod via Tailscale on 2026-08-11 and **re-runnable** — the SQL is inline.

**Trigger.** Awwal forwarded a complaint from `raheemjamiu166@gmail.com`, who wrote in saying he could
not register, and asked whether the man was in the registry by now.

### 10.1 He was already registered — and had been for three months

| field | value |
|---|---|
| name | **Jamiu Raheem** |
| **reference code** | **`OSL-2026-F91B8A`** |
| status | `active` |
| NIN | present (11 digits) |
| phone | `+2348163526656` |
| LGA / source | `ori_ire` / `public` |
| registered | **2026-05-19**, last updated 2026-07-05 |

Checked across **all four contact tables** (§3c) plus typo-variants of the address — one record, no
duplicate, no phantom near-miss draft. **He is not missing. He cannot TELL that he is not missing.**

His last three weeks, from `magic_link_tokens`:

```
Aug 5, 08:11   link issued  →  NEVER USED
Aug 5, 14:35   link issued  →  used 14:36
Aug 7, 18:32   link issued  →  NEVER USED
```

Three requests in three days. He got in once and came back anyway — so even the successful open did
not answer his question. **This is 13-50 (`/check-registration` mints a dead-end link) with a name on
it.**

### 10.2 ⭐ THE FINDING THAT CHANGES 13-50's PRIORITY — he is one of 92

The complaint is not the problem. It is the **one sample that happened to be loud.**

```sql
-- links issued in the last 30 days, and how many were never opened
SELECT count(*) FILTER (WHERE used_at IS NULL) AS never_used, count(*) AS issued
FROM magic_link_tokens WHERE created_at > now()-interval '30 days';
```

| measure | value |
|---|---|
| magic links issued, last 30 days | **242** |
| **never used** | **192 — 79%** |
| distinct people holding an unused link | **155** |
| people who asked **2+ times** in 30 days | **54** |
| ↳ **already IN the registry** (Jamiu's exact state) | **92** |
| ↳ not matched to a registry record by this method | **63 — see the warning below** |

```sql
WITH recent_unused AS (
  SELECT DISTINCT lower(email) em FROM magic_link_tokens
  WHERE created_at > now()-interval '30 days' AND used_at IS NULL),
known AS (
  SELECT DISTINCT lower(email) em FROM magic_link_tokens WHERE respondent_id IS NOT NULL
  UNION SELECT DISTINCT lower(u.email) FROM users u JOIN respondents r ON r.user_id=u.id)
SELECT count(*) FILTER (WHERE EXISTS (SELECT 1 FROM known k WHERE k.em=ru.em)) AS registered,
       count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM known k WHERE k.em=ru.em)) AS unmatched
FROM recent_unused ru;
```

> ⛔ **THE 63 ARE "UNMATCHED", NOT "UNREGISTERED". DO NOT WRITE THE SECOND WORD ANYWHERE.**
> The match is by email through `magic_link_tokens.respondent_id` or `users.email` — and **Jamiu's own
> August links carry `respondent_id = NULL` while his May one does not.** So the method demonstrably
> misses recently-registered people. Each of the 63 needs a lookup **by name and phone** before any
> claim is made about them. This is the exact error made about Rosemary and Adekemi (§2x(b) in the
> handoff): *a row-shape anomaly describes rows; people are found by name and phone.*
> **54 people asking twice is the strongest signal here** — asking twice is what a person does when
> the first answer did not arrive.

### 10.3 The `submissions`-less cohort is CLOSED — and it is evidence 9-26 worked

Jamiu has **no `submissions` row**. That looked alarming; measured, it is not.

```sql
SELECT to_char(r.created_at,'YYYY-MM') m,
  count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM submissions s WHERE s.respondent_id=r.id)) no_sub,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM submissions s WHERE s.respondent_id=r.id)) with_sub
FROM respondents r GROUP BY 1 ORDER BY 1;
```

| month | no submission | with submission |
|---|---|---|
| 2026-04 | 0 | 1 |
| **2026-05** | **55** | 70 |
| 2026-06 | 0 | 3 |
| 2026-07 | 0 | 6 |
| 2026-08 | 0 | 190 |

**All 55 are May, and every other month is zero.** It stopped dead and never recurred. That is the
9-26 direction (respondent ⇒ submission) leaking historically and then being sealed — **a closed
cohort, not a live leak.** His answers do exist: his wizard draft carries 17 populated fields with
consent `true`.

**➜ This is the template F5 needs.** 13-57 governs the *inverse* direction (submission ⇒ respondent).
It should carry **this same monthly query as its own proof of closure**, so "we fixed the seam" becomes
a table anyone can re-run rather than a claim. A seam fix that cannot show its own before/after is
indistinguishable from one that never fired.

### 10.4 ⛔ CORRECTION #3 TO 13-57 — the `lga_id` "slug vs UUID" premise is FALSE

13-57 records that Adekemi's `lga_id` was `'saki_west'`, *"a SLUG where every other row carries a UUID,
so there are at least two bad shapes, and AC5 must check value shape rather than field presence."*

```sql
SELECT count(*) FILTER (WHERE lga_id::text !~ '^[0-9a-f]{8}-') AS slugs, count(*) AS total
FROM respondents;              -- → 325 / 325
```

**Every one of the 325 respondents carries a slug `lga_id`. `'saki_west'` is the normal format, not an
anomaly, and there is no second bad shape.** The AC5 *instruction* (check value shape, not field
presence) survives on its own merits; the **evidence cited for it does not** and must be struck. This
is the third correction to 13-57 — the same class each time: **a claim about how bad it is, made
without the query that would have sized it.**

### 10.5 What 13-50 must implement (direction, not ACs — PM to formalise)

1. **Send the ANSWER, not a link.** For an email that resolves to a registered person, the reply body
   must contain **the reference code itself** (`OSL-2026-F91B8A`) and the registered name. A link is a
   second opportunity to fail; 79% of them are not taken. The code in the body cannot dead-end.
2. **Fail loudly and usefully on no-match** — say plainly that no record was found for that address and
   give the route to register. Silence is what produced 54 repeat askers.
3. **Instrument issued-vs-used.** This 79% was invisible until someone asked a question; it should be a
   digest line. Sibling of [[pattern-monitor-measuring-something-else]] — nothing was red because
   nothing was measured. Ties to the ops-digest owner named in C7.
4. **Set `respondent_id` on every token where the email resolves.** Jamiu's August tokens are NULL
   while his May token is not — which is *why* §10.2's method is lossy. Fixing this makes the cohort
   query exact instead of approximate.
5. **Success criterion, measurable on the same query:** unused-link rate falls materially below 79%,
   and repeat-askers below 54 per 30 days.

### 10.6 THE REPLY DECISION — Awwal's question, with a recommendation

> *"Can we send him a reply now, or wait until check-registration is perfected so he gets the mail?"*

**Split it. Reply to HIM today, by hand. Do NOT mail the other 92 until 13-50 ships.**

**Why reply now:**
- He has waited since **Aug 5 — six days.** He is a real person who took the trouble to write to a
  government registry, and we know his answer exactly.
- **Coupling a courtesy to a release is [[pattern-ship-a-fix-that-never-fires]] pointed at a person.**
  "He gets the mail once it is perfected" is a promise contingent on a deploy that has not been
  scheduled. Those promises are this project's most-repeated failure.
- It is **free UAT for 13-50**: his reply tells you whether the reference code alone actually satisfies
  the question. If it does not, §10.5's first point is wrong and better found now than after building.
- If an automated mail later reaches him too, a duplicate reassurance is harmless. Continued silence
  is not.

**Why NOT to mail the 92 yet:** the link is the defect. Mailing 92 people a link that dead-ends
**manufactures 92 more dead ends** and burns the one moment of attention each of them will give this.
It is also a send-volume event and belongs behind 13-46's caps and the suppression list, not ahead of
them. **Once 13-50 ships, the 92 are a ready-made, high-value first campaign** — people who have
already raised their hand.

### 10.7 Consequence for the field-day gate — ✅ UPDATED, §9's blocker is CLOSED

**Superseded within a day. `27e1fdc` — *"one CSP omission blocked every enumerator from getting an ID
card"* — is deployed, and the §9 TEST A query now answers the opposite way.** Verified read-only on
prod 2026-08-11 (prod `27e1fdc`, health 200), by re-running §9.1's own SQL rather than by reading the
commit message:

| email | created | selfie | id card | liveness | verified_at |
|---|---|---|---|---|---|
| `lawalkolade@gmail.com` | 2026-04-20 | t | t | 0.8589 | — |
| `lawalkolade+enum1@gmail.com` (deactivated) | 2026-08-09 | f | f | — | — |
| **`lawalkolade+testenumerator@gmail.com`** | 2026-08-10 | **t** | **t** | **0.5913** | **2026-08-11 05:20:28** |

**The August account that had neither now has both.** §9's suspected-regression framing was right and
the cause was a CSP omission — the fifth instance of §9's own closing pattern, *the machinery exists
and is not connected to the person who needs it.*

Two observations recorded, neither asserted as a problem:
- The new capture scores **0.5913** liveness against April's **0.8589**. Both pass; nobody has
  established what the threshold is or how close this sits to it. **One query before a field day.**
- The new row sets `live_selfie_verified_at` where the April row leaves it NULL — so the verified
  timestamp is newer than the feature. Any cohort query using it will under-count historic accounts.

**➜ Revised pre-field gate: `13-57` + `13-59` + `13-60` + enumerator accounts + the R8 briefing.**
The §9 capture defect leaves the list. 13-50 remains outside the field gate, but now carries **92 named
people and one written complaint** — a stronger warrant than anything else in the backlog.

### 10.8 📮 THE REPLY TO JAMIU — DRAFTED 2026-08-11, **NOT SENT**. Awwal to send.

Per §10.6 the individual reply was decoupled from 13-50 and drafted immediately. **It is written to be
sent BY HAND from `admin@oyoskills.com`; no automated send was triggered and none should be.** Recorded
here so the PM has it in the canonical place and does not re-draft it.

**Voice: institutional "we", not "I"** (Awwal's direction 2026-08-11) — the registry is answering him,
not an individual, and the sender is the mailbox itself so there is no name to sign.

**To:** `raheemjamiu166@gmail.com` · **From:** `admin@oyoskills.com`
**Subject:** `You are registered — Oyo State Livelihood and Skills Registry (OSL-2026-F91B8A)`

> Dear Jamiu Raheem,
>
> Thank you for writing to us, and we are sorry for the delay in replying.
>
> We have checked our records. **You are registered on the Oyo State Livelihood and Skills Registry,
> and you have been since 19 May 2026.** Your registration is active and complete, held under the name
> Jamiu Raheem, in Ori Ire Local Government Area.
>
> **Your registration number is `OSL-2026-F91B8A`.**
>
> Please keep that number safe. It is the surest way to identify your record if you ever need to
> contact us, and you do not need to register again.
>
> The difficulty you ran into was on our side, not yours. When you asked us to confirm your
> registration, our system sent you a link instead of simply telling you the answer — and that link did
> not work as it should have. We are correcting it, and your message is the reason we found it. Other
> people were affected in the same way, so you have helped more than yourself.
>
> If anything above does not match your own records — or if the name or local government we hold for
> you is wrong — please reply to this message and we will correct it.
>
> Thank you again for your patience, and for taking the trouble to tell us.
>
> Warm regards,
>
> **Oyo State Livelihood and Skills Registry**
> `admin@oyoskills.com`

**Notes for whoever sends it:**
- ⛔ **BLOCKER — DO THIS FIRST. `admin@oyoskills.com` IS ON OUR OWN SUPPRESSION LIST,
  `reason='bounced'`.** Verified read-only on prod 2026-08-11:
  `SELECT email, reason FROM email_suppressions WHERE email ILIKE '%oyoskills%';` → one row,
  `admin@oyoskills.com | bounced`. The suppression governs *receiving*, so it does not stop us
  **sending** from that address — **but this mail invites him to reply to it.** If the ImprovMX
  forward is broken, his reply lands nowhere and **we will have apologised for a dead end using a
  dead end.** That is the defect in §10.2 repeated on the one person who already complained.
  **Run the free TEST A from `_diagnose-mailbox-delivery.ts` before sending: mail
  `admin@oyoskills.com` from any external mailbox and confirm it arrives.** No code, no bounce risk.
  If it does not arrive, either fix the forward first or replace the closing invitation with a reply
  path that demonstrably works.
- ✅ **He can receive.** `email_suppressions` holds **0 rows** for `raheemjamiu166@gmail.com`.
- Send from the **operator mailbox, not the campaign/notification path** — one human reply must not
  consume a marketing send or be re-written by template logic.
- **No NIN, no phone number, no date of birth in the email.** The reference code, the name and the LGA
  are enough for him to confirm the record is his, and keep the mail safe to forward or screenshot.
  **The LGA is deliberate**: it lets him verify we hold the right person rather than merely asserting it.
- **"Dear Jamiu Raheem", not "Dear Mr Raheem"** — we do not hold a title or gender for him and should
  not infer one from a name. Full name is formal without guessing.
- **"We are correcting it", not "we are fixing it by <date>"** — 13-50 has no scheduled date, and a
  promise with a date we cannot keep is how the original dead end was made.
- **His answer is free UAT for §10.5.** If he replies still unsure, "send the answer, not a link" is
  insufficient on its own and 13-50's design changes *before* it is built.
- ⛔ **This is ONE reply. It does not authorise mailing the other 92** — see §10.6.

> 🔗 **This blocks more than one thing.** `admin@oyoskills.com` is also the account being handed to the
> client's Verification Assessor (§8.4) and §5.0 item 0's handover is *"reset MFA, the assessor enrols
> their own"* — which is an email, to this same address. **One test A answers both questions.**

### 10.9 Reopen triggers (for §10.1–§10.8 — §10.10 carries its own)

- A second citizen complaint arrives before 13-50 ships → stop treating it as post-field.
- Any of the **63 unmatched** turns out on a name/phone check to be genuinely unregistered → that is a
  live ingestion leak, not a comms problem, and it re-homes to 13-57 immediately.
- The unused-link rate is still ≥70% one month after 13-50 deploys → the answer-not-link thesis in
  §10.5 was wrong; say so plainly rather than re-tuning the copy.

### 10.10 🔴 THE SUPPRESSION LIST IS MEASURING TYPOS, NOT DEAD MAILBOXES (2026-08-11)

**Context.** Awwal asked the adjudication agent to *verify, not redo*, the in-flight ops remediation
(`_diagnose-mailbox-delivery.ts`, `_ops-contact-remediation.ts`). Everything claimed checked out — and
the verification turned up something larger than the two addresses it was aimed at.

**The remediation's own claims, independently verified read-only on prod (main `27e1fdc`):**

| claim | verdict |
|---|---|
| `admin@oyoskills.com` suppression lifted | ✅ **0 rows** in `email_suppressions` |
| the mailbox is healthy | ✅ prod recorded `sent 05:51:09 → delivered 05:52:02` |
| `osegunlajide@gmail.con` corrected | ✅ the `users` row now reads `…@gmail.com`, `active` |
| *"no hard/soft bounce distinction"* | ✅ `suppressionReasons = ['bounced','complained','unsubscribed']`; `email-events.service.ts:97` suppresses on **any** bounce with no severity check |
| *"nothing in this repo ever removes a suppression"* | ✅ the only `delete(emailSuppressions)` calls in the tree are **inside tests** |

⚠️ **On "it was a momentary network blip": keep it a hypothesis.** It fits the evidence and nothing
contradicts it, but **it cannot be proven from our data** — a greylist, a full mailbox and a dead domain
are all stored identically as `bounced`. What IS proven is the *effect*: a false positive that stood for
six weeks. **The inability to tell a blip from a death is the defect**; do not let the cause harden into
a finding on the strength of "it works now" ([[feedback_verify_against_reality_before_asserting]]).

#### The measurement — 6 of 11 non-test suppressions are capture defects with a HEALTHY twin

```sql
SELECT email, suppressed_at FROM email_suppressions ORDER BY suppressed_at;   -- 13 rows, ALL reason='bounced'
```

| suppressed address | correct twin | the twin's footprint | twin suppressed? |
|---|---|---|---|
| `yusuffasiat@gmail.co` | `…@gmail.com` | **users=1**, drafts=1, mlt=1 | **no** |
| `dayoariremako88@gmail.co` | `…@gmail.com` | **users=1**, drafts=1, mlt=4 | **no** |
| `osegunlajide@gmail.con` | `…@gmail.com` | **users=1**, drafts=1, mlt=4 | **no** |
| `aladechristianahtosin@gmail.co` | `…@gmail.com` | drafts=1, mlt=1 | **no** |
| `ogunbonadamola@gmail.co` | `…@gmail.com` | drafts=1 | **no** |
| `wahab akeem olaide <aqeemakolade@gmail.com>` | `aqeemakolade@gmail.com` | drafts=1, mlt=1 | **no** | ⛔ **NOT a capture defect — see §10.11** |

Remaining: 2 test addresses, and 5 well-formed addresses (`fatomidejumoke@mail.com`,
`ibitolayetunde@gmail.com`, `jambestojeke@gmail.com`, `julietiyabodeodiba@gmail.com`,
`ola4ct@outlook.com`) that look like genuine bounces.

> ⭐ **The table is named "these mailboxes bounce". It is actually recording "we captured the address
> wrong."** **5 of 11** are a data-entry defect wearing a deliverability label — another
> [[pattern-monitor-measuring-something-else]], and the third this week.
>
> **The suppressions themselves are CORRECT** — `gmail.co` genuinely is undeliverable. The damage is
> that the metric can never surface the real problem, so nobody goes looking for it.

> ⛔ **CORRECTION, same day, by the author.** This section first read **"6 of 11"** and claimed the
> `wahab akeem olaide <…>` row proved *"the email field has NO format validation — someone pasted an
> RFC display-name string"*. **That was wrong, and wrong in this project's signature way: I inferred an
> ORIGIN from a STRUCTURE without querying for it** ([[feedback_verify_against_reality_before_asserting]],
> and §2x(b) in the handoff — the same error made about Rosemary and Adekemi). Nobody typed it. It never
> passed through a capture form at all. **The count is 5, not 6**, and the sixth row is a different and
> more serious defect, written up as **§10.11**. The wrong version is left visible rather than quietly
> rewritten, because a reader deserves to know the diagnosis moved.

**The last row is its own finding: the email field has NO format validation.** Someone pasted an RFC
display-name string, `Name <addr>`, and it was stored verbatim and then bounced. That is not a typo,
it is an absent check — and it is direct, measured evidence for **13-51** (*"validate email at capture
so we stop manufacturing bounces"*), which should inherit this table rather than re-derive it.

#### ⛔ WHAT THIS MEANS FOR 13-50 — read before writing the ACs

**A person who typed `gmail.co` at registration will type `gmail.co` again at `/check-registration`.**

Under the design in §10.5 they receive *"no record found"* — **the worst available answer, because they
ARE registered.** 13-50 would ship as a fixed endpoint that still fails the exact population it exists
to serve, and it would do so silently and confidently. That is
[[pattern-ship-a-fix-that-never-fires]] arriving one layer up: the fix fires, at the wrong key.

**➜ Additional required behaviour for 13-50:**

1. **Never answer "not found" until a near-miss has also missed.** On no exact match, attempt repair —
   common-TLD correction (`.co`→`.com`, `.con`→`.com`), strip an RFC `Name <addr>` wrapper, trim
   whitespace — then re-look-up.
2. **If a near-miss resolves to a registered person, answer them** with the reference code, and record
   the corrected address for operator review. Do **not** silently rewrite their stored address — that
   is 13-51's audited path (`_ops-contact-remediation.ts` is its manual stopgap), not a side effect of
   a lookup.
3. **Count near-miss hits.** If the repair layer fires often, that is the capture defect measured live
   and it belongs in the digest beside §10.5's issued-vs-used line.
4. **A suppressed address must not be read as "this person is unreachable."** Six of the eleven have a
   healthy twin. Any cohort or blast query that treats `email_suppressions` as a person-level exclusion
   is over-excluding — check the twin first.

#### Reopen triggers for §10.10

- A seventh typo-with-healthy-twin appears before 13-51 ships → the capture hole is actively producing,
  not historic; pull 13-51 forward.
- 13-50's near-miss counter fires for anyone in the 92 (§10.2) → those people were never a comms
  problem, they were a capture problem, and the cohort split in §10.2 must be re-derived.
- Any of the 5 "genuine bounce" addresses later delivers successfully → the blip class is wider than
  `admin@`, and the no-severity gap in `email-events.service.ts:97` becomes urgent rather than noted.

### 10.11 ⛔ FOR 13-51 — A SUPPRESSION THAT CANNOT SUPPRESS (`aqeemakolade@gmail.com`)

**Raised by Awwal 2026-08-11 to be taken up with 13-51.** It began as the "someone pasted a display
name" example in §10.10. It is not that. **Chasing it to its origin instead of assuming one turned a
cosmetic data-hygiene note into a live correctness bug in the send path.**

#### The row

```
email_suppressions: 'wahab akeem olaide <aqeemakolade@gmail.com>'  reason='bounced'  2026-08-03 20:00:37
```

#### It did NOT come from a capture form — measured, not assumed

```sql
WITH allmail AS (SELECT email FROM users UNION ALL SELECT email FROM wizard_drafts
  UNION ALL SELECT email FROM magic_link_tokens UNION ALL SELECT email FROM campaign_sends)
SELECT count(DISTINCT email) FROM allmail WHERE email ~ '[<>]';        -- 0
SELECT count(DISTINCT email) FROM allmail WHERE email ~ '\s';          -- 0
SELECT count(DISTINCT email) FROM allmail WHERE email <> lower(email); -- 0
```

**Zero rows anywhere in `users`, `wizard_drafts`, `magic_link_tokens` or `campaign_sends` contain an
angle bracket, a space, or an uppercase character.** `campaign_sends` holds the *clean* address. So no
human typed this and no form stored it — **it entered through the bounce webhook.**

#### The defect — the write path and the read path disagree on the key

`apps/api/src/services/email-events.service.ts`:

| | code | shape stored/looked up |
|---|---|---|
| **webhook inlet** (bounce/complaint) | `:48` `const recipient = str(toRaw).trim().toLowerCase();` → `:100` `.values({ email: ev.recipient, … })` | **whatever the provider echoed** — trimmed and lowercased, but the RFC `Name <addr>` form is **never unwrapped** |
| unsubscribe inlet | `:112` `toCanonicalEmail(email)` | bare address |
| **reader** `getSuppressedEmails` | `emails.map(toCanonicalEmail)` then `inArray(...)` | **bare address** |

`toCanonicalEmail` is `trim().toLowerCase()` (`lib/canonical-email.ts:12-14`) — it does **not** unwrap
angle brackets. So `'wahab akeem olaide <aqeemakolade@gmail.com>'` is already "canonical" by that
definition and passes through unchanged, while the reader asks for `'aqeemakolade@gmail.com'`.

> ⭐ **The two strings can never be equal. The suppression is inert.** Verified on prod:
> `SELECT count(*) FROM email_suppressions WHERE email='aqeemakolade@gmail.com';` → **0**.
> The address the blast filter will ask about **is not in the table**, while a row that means exactly
> that address sits beside it, unreachable.
>
> This is [[pattern-ship-a-fix-that-never-fires]] at its purest: the guard was written, the row was
> created, the webhook worked, and **nothing is protected.**

#### The harm is LATENT, not yet realised — and the blast is what realises it

Stated precisely, so nobody over-claims it the way §10.10 did:

- **`aqeemakolade@gmail.com` IS a registered person** — `magic_link_tokens` with a non-null
  `respondent_id`, plus a `wizard_drafts` row. They will be **in a re-engagement blast cohort.**
- **Sends after the suppression: 0.** No harm has occurred **only because no blast has run since
  2026-08-03.** Do not report this as "we kept mailing them" — we have not.
- **The next blast sends to them, it bounces again, and the webhook writes another row the reader
  cannot match.** The failure is self-perpetuating and silent, and each cycle adds a bounce to the
  domain reputation the whole blast programme depends on (`_diagnose-mailbox-delivery.ts`'s own words).
- Current blast radius is **1 row of 13** — but the same asymmetry swallows **any** recipient value the
  provider echoes in a non-bare form, so the rate is a property of the provider payload, not of us.

#### What 13-51 must do

1. **Unwrap at the inlet.** `email-events.service.ts:48` must extract the address from an RFC 5322
   `Name <addr>` form before storing. Fixing only this row leaves the next one to the same fault.
2. **Make one function own the key.** The unsubscribe inlet and the reader already call
   `toCanonicalEmail`; the webhook inlet does not. **Route every write and every read through the same
   canonicaliser** — the [[feedback_canonical_primitive_backlog_sweep]] shape, and the same lesson as
   13-55's five promote paths.
3. **Teach `toCanonicalEmail` to unwrap**, so the fix cannot be bypassed by a future caller — then
   **RED-verify**: store `'A B <x@y.com>'`, assert `getSuppressedEmails(['x@y.com'])` returns it, and
   confirm the test fails without the unwrap.
4. **Backfill the existing row** via `_ops-contact-remediation.ts` — it is one row, and it is a
   registered person.
5. **Add a guard, because the class outlives the fix:** a suppression row that is not a bare address is
   a row that cannot function. Assert it — either a CHECK constraint or a lint over the table — so the
   next non-bare value fails loudly instead of sitting inert for months.

#### ✅ ANSWERED 2026-08-11 — it comes from the PROVIDER'S BOUNCE PAYLOAD. We never sent it.

The open question posed above was chased instead of left. **The same `message_id` carries a bare
address on `sent` and `delivered`, and a wrapped one on `bounced`:**

```sql
SELECT event_type, recipient, message_id, occurred_at FROM email_events
WHERE recipient ILIKE '%aqeemakolade%' OR recipient ~ '[<>]' ORDER BY occurred_at;
```

| event | recipient | message_id | at |
|---|---|---|---|
| `sent` | `aqeemakolade@gmail.com` | `f6277b88…` | 20:00:32 |
| `delivered` | `aqeemakolade@gmail.com` | `f6277b88…` | 20:00:32 |
| **`bounced`** | **`wahab akeem olaide <aqeemakolade@gmail.com>`** | **`f6277b88…`** | 20:00:36 |

**One message, one provider, two formats.** We sent the clean address — `campaign_sends` and both
earlier events prove it. The display name exists **only** in the bounce payload, so it is neither an
operator list nor a capture form nor our send path. The earlier speculation is struck.

**The rate, measured across the whole table:**

| | |
|---|---|
| `email_events` rows | 1974 |
| `bounced` events | 25 |
| ↳ **non-bare recipient** | **2 (8% of bounces)** |
| `sent` / `delivered` events non-bare | **0** |

**➜ The provider does not guarantee a bare address on bounce, and we have no control over it.** That
settles the design question: **normalisation must happen at OUR inlet**, because the input is not ours
to fix. It also means the 8% is a property of the provider's payloads and can change without notice —
so the guard in item 5 matters more than the one-row backfill in item 4.

#### 🚨 SEQUENCING — FIXING THE UNWRAP ALONE *CREATES* THE HARM. Read with §10.10.

The two non-bare bounces are **also the only two messages in the entire table that went
`delivered` THEN `bounced`** — an accept-then-reject, i.e. the classic **soft** bounce (full mailbox,
downstream forwarding failure). §10.10 established that this system records no hard/soft distinction
and never lifts a suppression.

So `aqeemakolade@gmail.com` — **a registered person** — is sitting behind **two defects that cancel
each other out**:

| defect | effect on this person |
|---|---|
| §10.10 — a soft bounce suppresses permanently | *should* be excluded from every future blast, wrongly |
| §10.11 — the suppression key can never match | is **not** actually excluded |

**They are reachable today only because the second bug is masking the first.**

> ⛔ **Therefore: ship the unwrap and the hard/soft distinction TOGETHER.** Landing the unwrap on its
> own converts an inert row into a working permanent exclusion of a registered citizen on the strength
> of one soft bounce — **a fix that makes things worse, correctly.** This is the inverse of
> [[pattern-ship-a-fix-that-never-fires]]: a fix that fires, and should not have, because the thing it
> switches on was never safe to switch on.
>
> **13-51 must sequence it: severity first (or in the same commit), unwrap second.** If only one can
> ship, ship neither — the current broken state is strictly safer than half the fix.

#### Reopen triggers for §10.11

- A second non-bare suppression row appears → the inlet is actively producing them; this stops being a
  13-51 line item and becomes a hotfix.
- A blast runs before the unwrap ships → check `campaign_sends` for `aqeemakolade@gmail.com`
  afterwards; a send there is the latent harm becoming real and should be reported as such.
- ~~The origin turns out to be an operator-supplied list → §10.10's "capture defect" framing partially
  revives…~~ **RESOLVED 2026-08-11 — the origin is the provider's bounce payload, proven by one
  `message_id` carrying a bare address on `sent`/`delivered` and a wrapped one on `bounced`. This
  trigger cannot fire; struck rather than left waiting on an answered question.**
- **The unwrap ships WITHOUT the hard/soft severity fix** → stop and revert. That combination silently
  converts an inert row into a permanent exclusion of a registered citizen on one soft bounce. This is
  the trigger that matters most on this page.
- A `sent` or `delivered` event ever arrives non-bare (today: 0 of 1949) → the normalisation gap is
  wider than the bounce path and every inlet needs the canonicaliser, not just `:48`.

### 10.12 REGISTRY INTEGRITY + CAMPAIGN RESULTS — asked by Awwal, measured 2026-08-11

Two direct questions: *is there any duplicate in the registry?* and *what is the success rate of the
re-engagement campaigns?* All figures prod, read-only, at `27e1fdc`.

#### A. The registry is CLEAN — including on the checks that usually find the duplicates

Exact-match checks are the ones that miss; `+234…` versus `0…` is precisely how a duplicate hides. Both
were run.

| check | result |
|---|---|
| respondents | **325** |
| duplicate NIN | **0** |
| duplicate phone — exact | **0** |
| **duplicate phone — NORMALISED (last 9 digits, punctuation stripped)** | **0** |
| duplicate reference code | **0** |
| duplicate name (first+last, trimmed, lowercased) | **0** |
| same surname **+** same normalised phone | **0** |
| missing reference code | **0** |
| phone not in `+234[0-9]{10}` | **0** |
| NIN not exactly 11 digits | **0** |
| orphaned submissions | **2** — the known pair; §2x(b): **both people ARE registered** |
| **pending-NIN cohort (no NIN)** | **36** ⚠️ **was 20 at the 13-53 close — it has GROWN by 16** |

> **The registry itself is in good order.** The one number that moved is the pending-NIN cohort:
> **20 → 36.** That is the exact signal 13-53's stated gap said to watch for — *"REOPEN on the cohort
> climbing while promotes stay at zero"* — and it is now climbing. **It is not a duplicate problem and
> it is not urgent today, but it is the trigger firing, and the 9-12 ladder should be checked against
> it before the jingle multiplies the intake.**

#### B. Campaign deliverability — one campaign is an outlier, and the reason is §10.10

| campaign | sent | delivered | bounced | **bounce rate** |
|---|---|---|---|---|
| **`draft-invite-2026-08`** | 75 | 68 | **7** | **9.3%** ⚠️ |
| `draft-adoption-2026-08` | 178 | 175 | 4 | 2.2% |
| `thankyou-referral-auto` | 232 | 228 | 5 | 2.2% |
| *(transactional, no campaign id)* | 497 | 488 | 9 | 1.8% |

**`draft-invite` bounced at more than 4× every other campaign, and the cause is not mysterious: it
targeted the abandoned-draft population, which is exactly where the `.co`/`.con` typo addresses in
§10.10 live.** The capture defect is not only a comms problem — it is a **deliverability cost**, paid
in domain reputation, on the very sends the blast programme depends on.

> ⛔ **A ~9% bounce rate is in the range that damages sender reputation.** The next large send —
> and certainly the jingle-driven volume behind 13-46 — should not go out before 13-51's capture
> validation lands. **This is the strongest measured argument yet for 13-51 preceding the blasts**,
> and it did not exist before today.

#### C. Conversion — **15 of 75, ≈20%**, and that is a FLOOR

Attributable conversion for `draft-invite-2026-08` (sent 2026-08-05 08:04–08:18): recipients with a
respondent record created **after** the send.

| | |
|---|---|
| distinct recipients | **75** (honest denominator ≈**71** — 4 are phantom typo-drafts of already-registered people) |
| **registered after the invite** | **15** → **20% of 75 · 21% of 71** |
| registry growth after the blast | 8 on 08-05 · 6 on 08-06 · 7 on 08-09 · 3 on 08-10 |

> ⚠️ **THE 15 IS A LOWER BOUND, AND §11.2 IS THE PROOF.** It was matched through
> `magic_link_tokens.respondent_id` ∪ `users.email → respondents.user_id` — **the same method §11.2
> has just shown to be structurally blind**, because `respondents` has no email column and a public
> respondent needs no `users` row. Juliet Odiba and Jumoke Fatomide were invisible to exactly this
> query. **The true conversion is ≥15 and the honest statement is "at least 20%".** Do not quote it as
> a precise rate, and **re-derive it once 13-50 item 4 sets `respondent_id` on every resolvable token**
> — at that point the query becomes exact instead of approximate.

⛔ **Do not credit the campaign with the 4 August spike.** 165 of August's 190 registrations landed on
2026-08-04 and are the **batch draft-adoption**, not a response to any email. A funnel that quietly
absorbs them would report a ~250% conversion rate and be believed.

#### D. ⚠️ `clicked = 0` — on every campaign, across all 987 sends

`emailEventTypes` includes `'clicked'`, and **not one has ever been recorded**; there is no `'opened'`
type at all. So there is **no engagement funnel** — the only signals that exist are *delivered*,
*bounced*, and the registry outcome. Every open-rate or click-rate figure quoted anywhere on this
project is unsourced.

**This is [[pattern-monitor-measuring-something-else]] for the fourth time this week**, and it belongs
to **13-44** (campaign observability). It is also why §C had to be computed from the register rather
than the campaign: *the outcome was measurable only because it was measured somewhere else.*

#### Cross-references and reopen triggers for §10.12

- §10.10's *"suppressed AND in registry: 1"* is **superseded by §11.2 — it is at least 2.** Same lossy
  method, same lesson, and the correction belongs to §11.2 rather than being restated here.
- 13-51 story file **updated 2026-08-11** by the adjudication agent: the §10.11 sequencing warning is
  now a blocking callout under its `## Acceptance Criteria`, and **AC1.2 was corrected** — a
  display-name string is a *third* bucket (provider artefact), not "our data problem".
- **Reopen:** the pending-NIN cohort passes ~45, or any 9-12 ladder run reports zero promotes while it
  grows → 13-53's reopen condition has fired properly and the ladder needs a real look.
- **Reopen:** any subsequent campaign bounces above ~5% → capture validation is no longer optional
  before the jingle; escalate 13-51 above 13-46.
- **Reopen:** a `clicked` event ever appears → click tracking started working by accident; re-run §C
  with engagement data before trusting any earlier engagement claim.

### 10.13 🧹 UNCOMMITTED WORK + COMMIT PLAN — get to a clean tree before the launch stories

**Why this subsection exists.** Two CLIs wrote into one working tree today and **nothing has been
committed since `27e1fdc`.** `main == origin/main`, so every line below exists **only on Awwal's disk**.
The 2026-08-10 incident in handoff §2y is the argument for not leaving it there: a stray destructive
command cost 1,574 tracked files, and recovery was free **only because they were committed**.
**Commit before you clean up, and before you start the launch stories.**

#### A. What is uncommitted, by owner — measured, not guessed

Provenance for the SCP is by line range, since it is the one interleaved file:
committed at `HEAD` it is **557 lines (§1–§8)**; it is now **1631**.

| owner | artefact | lines |
|---|---|---|
| **adjudication agent** | **SCP §10 only** (§10.1–§10.13) | **~614** |
| **adjudication agent** | `13-51-…-suppression-lift.md` — the §10.11 sequencing callout + the AC1.2 three-bucket correction | **45** |
| PM | SCP **§9** (TEST A) and **§11** (contact remediation, the Resend severity pull, Juliet + Jumoke) | ~456 |
| PM | `13-59-staff-activation-confirmation-email.md` | 122 |
| PM | `13-60-a-failed-selfie-must-not-be-swallowed.md` | 73 |
| PM | `13-45-ci-guard-done-with-open-residuals.md` | 19 |
| PM | `sprint-status.yaml` | 6 |
| PM | `13-62-a-query-parameter-the-server-never-read.md` | **new file** |
| PM | `apps/api/scripts/_diagnose-mailbox-delivery.ts` | **new file** |
| PM | `apps/api/scripts/_ops-contact-remediation.ts` | **new file** |

**The adjudication agent has deliberately committed none of it** (handoff §1 — the human brings
uncommitted work here for adjudication; committing another agent's in-flight stories would be
committing work nobody reviewed). **Awwal or the PM should land it.**

#### B. Proposed commit plan — three commits, in this order

Not one blob. Each is separately revertable, and the ordering puts the *executed* work first so the
record matches what production already did.

| # | Commit | Contents |
|---|---|---|
| 1 | `feat(ops): two remediation tools, and the two citizens they found` | `_diagnose-mailbox-delivery.ts`, `_ops-contact-remediation.ts`. **These already RAN on prod** — `admin@` lifted, `osegunlajide@gmail.con` corrected. The code must not sit uncommitted behind its own effects. |
| 2 | `docs(stories): 13-45, 13-51, 13-59, 13-60, 13-62 + sprint-status` | All five story files and the board. 13-51 carries the sequencing callout that **blocks** its own AC3.3. |
| 3 | `docs(scp): §9 TEST A, §10 the silent cohort, §11 contact remediation` | The SCP. One commit — §9/§10/§11 are interleaved in one file and cannot be split cleanly. |

#### C. Gates before pushing — two that are easy to skip here

1. ⚠️ **`apps/api/scripts/` is OUTSIDE tsconfig — `tsc` proves NOTHING about these two files.** ESLint is
   the only compile-time signal, and the real gate is **running them** (`--dry-run` first). Both have
   already been run on prod, which is the strongest evidence available — record that in the commit body.
2. **The pre-push hook runs the full suite on any push to `main`.** These are docs + `scripts/`, so
   `turbo` will cache-hit the test tasks — **and a cached gate is not a passed gate (Pitfall #47).**
   That is *acceptable here* because no `src/` file changed, but say so in the push rather than
   reporting a fresh green. `eslint src scripts` **will** re-run, because the new scripts are inside
   `apps/api`.

#### D. What the clean tree unblocks — the launch set, stated in one place

Per §10.7 (revised after §9's CSP fix closed the capture defect):

| | gate | state |
|---|---|---|
| **13-57** | ingestion boundary — *"no respondent data lost, whatever the channel"* | AC1 already rewritten; **3 corrections applied**, incl. §10.4's `lga_id` premise |
| **13-59** | activation leaves something in the person's hands | PM edits in flight |
| **13-60** | a failed selfie is not swallowed | PM edits in flight |
| **13-50** | `/check-registration` — **Awwal building today**; §10.5 + §10.12's near-miss requirement | 92 named people + 1 written complaint |
| — | **enumerator accounts** — prod holds exactly ONE active enumerator, and it is Awwal's | not a story |
| — | **R8 field briefing** in enumerators' hands | not a story |
| ~~13-46~~ | burst readiness | **gates the JINGLE, not the field day** — and carries an unresolved ruling of Awwal's (mandatory acquisition question) |

> ⭐ **The single most useful reordering in this document:** 13-46 is the largest story on the list
> (835 lines, ~11 ACs) and it does **not** gate getting enumerators into the field. Moving it behind the
> field day converts a four-story gate into a three-story one and brings the start date forward by the
> biggest item on it.

#### E. Cautions carried into the build

- ⛔ **13-51's AC3.3 must not ship without the hard/soft severity work** (§10.11). Now written into the
  story file itself, not only here.
- ⚠️ **13-51 should precede the next large send.** `draft-invite` bounced at **9.3%** vs ~2% elsewhere
  (§10.12 B), and that is domain reputation spent on a capture defect.
- ⚠️ **The pending-NIN cohort is 20 → 36** (§10.12 A). 13-53's reopen condition has fired.
- 📮 **The reply to Jamiu (§10.8) is still UNSENT**, and `admin@`'s forward is now proven healthy
  (`sent 05:51:09 → delivered 05:52:02`), so the blocker on it is discharged. **Juliet (§11.2) has no
  complaint and no reason to write one** — she is the same case without the escalation.

### 10.14 ⚖️ RULINGS — Awwal, 2026-08-11. Three closed, one deferred, four standing.

The open decisions scattered across this SCP, the handoff and five story files were **enumerated by
grep, not from memory**, then put to Awwal in one pass. **The finding that shaped the session: of eight
open rulings, NONE blocked 13-57, 13-59 or 13-60** — the entire field-day set was buildable without
answering any of them, and only 13-46's sat on a critical path (and only once the jingle has a date).

#### ✅ RULED

| id | Decision | Ruling | Consequence |
|---|---|---|---|
| **R-A** | **§6 — which structural track leads** | **Epic 12's honesty tier (12-4 → 12-6) leads. 11-7 second. Epics 9 and 10 explicitly PARKED.** | §6 header updated; the SCP's Status line is discharged; **Pass 1 may run.** C2 (rename Epic 12) and C4 (park Epic 10) are carried by this ruling. |
| **R-B** | **13-46 — make the acquisition question mandatory?** | **NO. Keep it optional.** Ship **AC10** (real `— Select —` placeholder, explicit *"Prefer not to say"*, de-biased ordering) **plus one non-blocking prompt on submit.** | 13-46's `## ⚖️ OPEN DECISION` block is now **RULED** in the story file — it was blocking its own dev. 13-1's guardrail (*prominence ≠ mandatory*) survives; reversible by `ATTRIBUTION_ENABLED`. |
| **R-C** | **13-45's residual guard cannot fire locally** (§10.10/§2y — three consecutive pre-commit runs replayed the identical hash with a story edited between them) | **Split `lint-story-residuals` out of `lint` into its own turbo task with `inputs` covering `_bmad-output/**`.** | Correct invalidation **without** re-running eslint over `apps/api` on every story edit. A small **13-45 follow-up**, not a `turbo.json` tweak. Both originally-proposed options were rejected — one taxed every commit, the other left the local signal misleading. |

**On R-A, record the reframe, because it is the load-bearing half.** The question as posed was *"which
of three leads"*. F6 already measured **six epics `in-progress`, i.e. zero**, and named that state as the
**generator** of the duplication in F1-A. Ranking three while leaving six open would have described the
disease more precisely without treating it. **The pick is secondary to the parking.**

> ⛔ **CORRECTION 2026-08-12, by the author.** This paragraph originally read *"the ruling is therefore
> **one epic in progress, five parked**"*. **That gloss overreached and was never what R-A said.**
> **Epic 13 is the launch epic and cannot be parked; Epic 11 holds 11-7, which R-A itself ranked
> SECOND.** R-A parked **9 and 10** — nothing more. The correct target is **three `in-progress`
> (11, 12, 13)**, and `386e99e` delivered exactly that: **7 → 4 entries, 6 → 3 epics.**
> ✅ **The board matches the ruling.** Left visible rather than rewritten, because a target stated too
> strictly makes correct work read as incomplete — and I flagged it as an outstanding item on that
> basis before checking the file. **A gloss is not the ruling; verify against the artefact.**

**The empirical case for Epic 12, assembled the same day it was ruled on:** five separate instances of
the measuring-something-else class inside one session — a staff list reporting **124** when the answer
was **4** (13-61); a suppression table recording **typos** rather than dead mailboxes (§10.10);
**`clicked = 0` across 987 sends** (§10.12 D); a lint cache scanning a story file that no longer existed
(§2y); and a CI monitor that could never emit (handoff §7m). Not a coincidence — a category.

#### ⏸️ DEFERRED — put, not answered

| id | Decision | State |
|---|---|---|
| **R-D** | **13-2 — association-import verification framing (AC3.4)**, the PM's ⛔ BLOCKING OPEN DECISION of 2026-07-19 | **Left open deliberately.** Nothing in the field-day or jingle path depends on 13-2, and the ASNAT WhatsApp batch reshaped the importer anyway. **It blocks only 13-2's own dev.** Decide it when the association import is genuinely next — and note the proposed ruling is already written, so the cost of deciding later is near zero. |

#### 📋 STANDING — non-blocking, no ruling sought

| Decision | Recommendation on record | Blocks |
|---|---|---|
| **Mail the other 92** (§10.2, §10.6) | **Not until 13-50 ships** — mailing a dead-end link manufactures 92 more dead ends and spends the one moment of attention each will give it | nothing |
| **R1 — where the registry date filter lives** (13-61 ledger) | **Two minutes in devtools decides it**: does `dateFrom` appear in the request? Client-vs-server falls out of that. **Do not fix blind** | nothing |
| **13-36 — `Date.now()` collision key** in `messaging.spec.ts:112,:240` | Add a worker-scoped suffix (`test.info().parallelIndex`). Needs a local Playwright run; park until someone is in that file | burn-in only |
| **§11.3 — `mail.com → gmail.com` typo dictionary** | PM ruled **against**, correctly — `mail.com` is a live provider, not a typo of `gmail.com` | nothing |

#### Reopen triggers for §10.14

- **A second epic is moved to `in-progress` before Epic 12's tier closes** → R-A's parking half has
  been undone, which is the half that does the work. Say so rather than letting it drift back to six.
- **13-46's AC10 ships without the non-blocking nudge** → R-B was half-implemented; the denominator
  recovers but the response rate does not, and the story will read as done.
- **A story is marked `done` carrying an OPEN residual and CI stays green** → R-C's split either did not
  land or landed with the wrong `inputs`; re-run the three-identical-hashes check from §2y.

#### ✅ R-E — RULED 2026-08-11: rate denominators are ANSWER-BASED, not source-based. **And it is already wrong on prod.**

**Origin.** Awwal challenged 13-2's rule that *"public-insights employment-RATE stats must exclude
`core`/`unverified_import` rows"*: **if association members are accepted into the marketplace, why
exclude them from insights — and since they were never asked employment questions, including or
excluding them should make no difference anyway?**

**The instinct is correct and the ruling follows it.** But "no difference" holds only if the rows are
out of **both** numerator and denominator. In the denominator alone, *not asked* silently becomes
*not employed*:

| | asked | employed | rate |
|---|---|---|---|
| field-collected | 100 | 60 | **60%** |
| + 200 never-asked rows in the denominator | 300 | 60 | **20%** |

**THE RULING:** ⭐ **A rate's denominator is the set of people who ANSWERED THAT QUESTION. Publish `n`
beside every rate. Source is not the variable — never filter a rate by `source` or `verification`.**
Association rows stay **included** in counts, coverage and the marketplace, and are shown as a visible
**"not asked"** band rather than dropped, so they are present without corrupting the numerator.

**Why the source filter was the wrong instrument** — it is a proxy that fails in both directions:
an association member who **later completes** the deep-field questionnaire stays wrongly excluded
forever; a **field-collected** respondent who **skipped** the question stays wrongly included.
➜ **13-2's source-based rate rule is SUPERSEDED by R-E and should be struck from that story.**

##### 🔴 It is not preventive — the defect is LIVE on `/insights` today

`public-insights.service.ts:80` defines `answersWhere = ru.raw_data IS NOT NULL` — *"has any answers"*,
**not** *"answered this question"* — and two of the four rates divide by it:

| metric | denominator today | shape |
|---|---|---|
| `biz_rate` (`:110`) | `COUNT(*) FILTER (WHERE raw_data IS NOT NULL)` | ⛔ **coarse** |
| `unemployment_est` (`:117`) | same | ⛔ **coarse** |
| `youth_emp_rate` (`:124`) | `FILTER (WHERE dob BETWEEN 15 AND 35)` | per-field — **safe by accident**, because association rows carry `age_years`, not `dob` |
| `gpi` (`:130`) | `FILTER (WHERE gender='male')` | per-field |

**Measured on prod 2026-08-11 — re-runnable:**

```sql
SELECT count(*) FILTER (WHERE raw_data IS NOT NULL)                        AS current_denom,   -- 282
       count(*) FILTER (WHERE raw_data->>'employment_status' IS NOT NULL)  AS employment_denom,-- 218
       count(*) FILTER (WHERE raw_data->>'has_business' IS NOT NULL)       AS business_denom   -- 199
FROM submissions;
```

| published metric | as published | correct | error |
|---|---|---|---|
| **unemployment estimate** | 52/282 = **18.4%** | 52/**218** = **23.9%** | **understated by 5.5 points (~23% relative)** |
| **business rate** | 91/282 = **32.3%** | 91/**199** = **45.7%** | **understated by 13.4 points (~29% relative)** |

**64 respondents (23%) have `raw_data` but no `employment_status`; 83 (29%) have no `has_business`.**
They are already in the denominator of a published government statistic they were never asked.

> ⚠️ **A public unemployment figure understated by nearly a quarter, on a State registry, in front of
> an assessor.** This is the **sixth** instance of [[pattern-monitor-measuring-something-else]] in one
> session and the most consequential — the others misled us; this one misleads the public.
> **It also independently vindicates R-A**: this is exactly the class Epic 12's honesty tier exists for,
> found the same day that tier was made the lead track.

##### What to do, and where

1. **12-4 / 12-5 own the fix** — make **every** rate denominator per-field
   (`FILTER (WHERE raw_data->>'<field>' IS NOT NULL)`), so safety is **by design, not by accident** as
   `youth_emp_rate` currently is. `n`-per-chart is already 12-5's scope; this *is* that work.
2. **RED-verify:** insert one respondent with `raw_data` but no `employment_status`; assert
   `unemployment_est` does **not** move. It moves today — that is the failing test.
3. **Do not wait for 13-2.** The defect exists now, without a single association row. 13-2 would
   *worsen* it (imports write `raw_data.skills_possessed`, so every member enters the coarse
   denominator) — but it is not the cause.
4. **Decide before the client session** whether the current `/insights` figures are shown as-is,
   corrected first, or shown with the `n` disclosed. **Awwal's call — flagged, not taken.**

##### Reopen triggers for R-E

- 13-2 ships before the per-field denominators land → every imported member deflates two published
  rates on arrival; block the import or fix the denominators first.
- Any NEW rate is added using `answersWhere` rather than a per-field test → R-E did not take; it needs
  a guard, not a convention.
- The corrected figures are published without saying they changed → a silent restatement of a public
  statistic is its own integrity problem; say what moved and why.

##### ⛔ CORRECTION 2026-08-12 (John/PM) — R-E's ARITHMETIC used the wrong table. The DEFECT stands; the NUMBERS do not.

**The finding is unchanged and still live. Only the sizing above is wrong, and it is wrong in a way
that would mislead whoever builds the fix.**

R-E's table computed `52/282` and `91/282` **`FROM submissions`**. The service does not read
`submissions`. It reads **`registry-unified` (`ru`)** — respondent-anchored, **one row per person**,
carrying that person's latest NON-EMPTY submission. That is not incidental: it is **Story 13-33 AC2**,
verbatim in the source — *"everything reads the ONE canonical respondent-anchored unified source
(`registry-unified`), NOT `FROM submissions`"* — a decision taken to kill the 13-25-class drift.
**So the SCP sized a defect using the exact join 13-33 exists to forbid.**

**What the page actually publishes, fetched live 2026-08-12:**

| field | published |
|---|---|
| `unemploymentEstimate` | **18.5 %** |
| `businessOwnershipRate` | **32.1 %** |
| `withAnswers` (the shared coarse denominator) | **271** |
| `youthEmploymentRate` · `gpi` | 47.9 % · 0.82 |

`withAnswers` is **271 respondents**, not the 282/283 submissions R-E quoted. The published values
therefore never matched R-E's "as published" column either — close, differently derived.

**➜ CONSEQUENCE FOR 12-4 / 12-5, and it is a trap:**

1. ⛔ **Do NOT take `23.9%` or `45.7%` as expected values.** An AC or a test asserting them would be
   asserting submissions-level arithmetic against a respondent-level query, and would fail — or worse,
   pass after someone "fixed" the query to match the wrong number.
2. **Derive the corrected figures through the SAME `ru` LATERAL the service uses.** The per-field
   denominators must be `COUNT(*) FILTER (WHERE ru.raw_data->>'<field>' IS NOT NULL)`, respondent-level.
3. ✅ **The structure already supports this.** The service deliberately runs TWO denominators today —
   density/LGAs-covered count ALL respondents, the rates filter to answer-bearing. R-E adds a **third,
   per-field** level. That extends the existing design rather than fighting it.
4. **The direction is certain, the magnitude is not.** 64 respondents' worth of `raw_data` carries no
   `employment_status` and 83 no `has_business` at submissions level; both published rates are
   understated. **Publish the recomputed figures from the real query — do not inherit this document's
   arithmetic.**

> **The lesson is the session's own, turned on the session:** the predicate was not the thing it meant.
> R-E correctly caught a denominator that filtered on *has any answers* while meaning *answered this
> question* — and then sized it with a query that counted *submissions* while meaning *people*.
> **Same error class, one level up, inside the finding that named it.**

#### ✅ R-F — RULED 2026-08-11: **12-4, 12-5 and 12-6 are a BLAST GATE.** Do not fix the rates today.

Awwal's ruling on R-E's timing, and it **changes the launch sequencing recorded in §10.13 D**:

1. **Do NOT hotfix the denominators now.** A correction landing in a working tree that already carries
   two CLIs' uncommitted work is a muddled diff for a small gain. The disparity is **23% / 29%
   relative — not a 50% distortion**, so it does not warrant jumping the queue.
2. ⭐ **12-4, 12-5 and 12-6 MUST SHIP BEFORE THE BLAST**, so the published figures are genuine when
   volume and attention arrive.

> **This PROMOTES Epic 12 from "the lead structural track after the field" (R-A) to "a gate on the
> blast".** R-A ranked it; R-F schedules it. The two are consistent — R-F is R-A with a deadline —
> but §10.13 D's launch table must now read:
>
> | gate | set |
> |---|---|
> | **Field day** | 13-57 · 13-59 · 13-60 · enumerator accounts · R8 briefing |
> | **Blast / jingle** | **12-4 · 12-5 · 12-6** *(new — R-F)* · 13-46 · 13-51 *(the 9.3% bounce, §10.12 B)* |
>
> **Two independent reasons now gate the blast on honesty work**, arrived at from opposite directions:
> R-E (published rates are wrong) and §10.12 B (a 9.3% bounce rate spends domain reputation on a
> capture defect). Neither was visible this morning.

**Why the reasoning is right and worth keeping:** the blast is the moment the figures acquire an
audience. A number that is 23% wrong in a quiet week is a defect; the same number in front of a radio
audience, an assessor and a Ministry is a *published* error that must later be *restated*. **Fixing it
before the blast costs a sprint; fixing it after costs a correction notice.**

⚠️ **Consequence to accept deliberately:** this puts three Epic-12 stories on the critical path to the
jingle. If that is too long, the honest lever is to **narrow 12-5 to `n`-per-chart plus the per-field
denominators** — the R-E fix proper — and let the rest of the label-honesty work follow the blast.
**That narrowing is not taken here; it is the fallback if the date squeezes.**

#### ✅ R-C ALSO CLOSES 13-45's R2 — record it there

13-45 carries **R2 — "THE GUARD CANNOT FIRE ON THE COMMITS IT POLICES"**, High, **OPEN**, owner
*"Awwal (cost ruling)"*, and it states the choice exactly: declare repo-root stories as turbo inputs
(taxing every story edit with an `apps/api` eslint re-run) **or** promote the guard to its own step
with its own inputs. **R-C rules the second.** ➜ **13-45's R2 moves OPEN → CLOSED-BY-RULING**, and its
R1 (*"acceptance withdrawn"*) resolves with it, since the guard leaves the `lint` chain entirely.

**Still open on that story: R3 — the guard's vocabulary does not include `RE-HOMED`** (§10.11 found the
same hole from the other side). 13-61's own note argues the real answer is that a re-homed row **leaves
the ledger** rather than the guard learning a new word. **Not ruled — it is the PM's to fold into
13-45.**

### 10.15 🤝 HANDOVER TO JOHN (PM) — what is done, what is left, who owns it

**Verified state at handover (not asserted — checked):**

```bash
git status -sb | head -1   # ## main...origin/main   (no [ahead N])
git log --oneline -1       # d16c439
ssh root@100.93.100.28 'cd /root/oslrs && git rev-parse --short HEAD'   # d16c439
```

**`main` == `origin/main` == prod == `d16c439`.** The §10.13 B commit plan was followed as written —
`174b60b` ops tools → `8a88e4b` stories → `adfefaf` SCP — plus `d16c439`. **One file remains
uncommitted: `docs/adjudication-agent-handoff.md`** (header, §2z, §7n, written after the push; it will
ride the next commit).

#### A. DONE — do not redo these

| | |
|---|---|
| **Six rulings** taken and recorded at source, not just here: §6 header, 13-46's `⚖️ OPEN DECISION` block, 13-45 R2 | §10.14 |
| **13-61** closed on the deploy, verified on prod rows | §10.12, story `## Closing verdict` |
| **13-57** — all three false premises struck **in the story**, incl. the `lga_id` slug claim (325/325) | §10.4 |
| **13-51** — sequencing callout + AC1.2 three-bucket correction, **in the story** | §10.11 |
| **Registry integrity + campaign funnel** measured, incl. normalised duplicate checks | §10.12 |
| **Handoff doc** — header, §2z playbook entry, §7n session arc | uncommitted |

#### B. JOHN OWNS — six loose ends

**Re-checked 2026-08-12 against the four commits `4fb5041`→`1f06179`. Four of six are DONE.**

1. ~~**13-45 R3** — the guard does not know `RE-HOMED`~~ ✅ **DONE.** **RULED:** `RE-HOMED` is **not a
   ledger state** — a re-homed item names a receiving story or it stays `OPEN`. 13-61's R1 now names
   **12-7**, and the guard passes 317 stories **with the row gone rather than unrecognised**, which is
   the distinction the ruling exists to make.
2. ~~**13-2 still carries the source-based rate rule in 2 places**~~ ✅ **DONE — and my flag was a FALSE
   POSITIVE.** Line 20 was **already struck** with the R-E supersession; the second match is the
   **2026-07-19 changelog entry**, which is *history and correctly immutable*. **I counted `grep`
   matches instead of reading them** — §2z's own failure (the predicate was "contains the string", the
   meaning was "still asserts the rule"). ⚠️ **A count is not a read.**
3. ~~**Epic 12 rename (C2)**~~ ✅ **DONE** — `epic-12-measurement-honesty-and-dashboard-refresh-brief.md`.
   *The title was doing the deprioritising; it no longer does.*
4. ~~**Park Epics 9 and 10**~~ ✅ **DONE** — `in-progress` **7 → 4 entries, 6 → 3 epics** (11, 12, 13).
   **That is exactly what R-A ruled** — see the correction at R-A: my "one epic, five parked" gloss
   overreached, and Epic 13 (launch) plus Epic 11 (holding 11-7, ranked second) are correctly open.
5. ⏳ **Pass 1** — still to run. Unblocked (§6 ruled, §7.4 discharged, board re-derived). Feeds §5 Pass 2.
6. ⏳ **D8 archive** — handoff still **14 §7 entries / 1,624 lines**. Keep §7n + §7m, archive §7→§7k to
   a dated `docs/session-*.md` (**the precedent already exists** — five such files are on disk).
   ~20 minutes, mechanical. *A cold-start doc nobody can read in one sitting has stopped being one.*
7. 🆕 **`9-27-multi-channel-reengagement` is STILL `in-progress`** — F6 measured it at **ten weeks**
   (since 2026-05-31) and C6 asked for a real status. It is the last of F6's non-states left standing,
   and it is now the *only* story-level `in-progress` entry on the board.

#### C. AWWAL OWNS — operator actions, none blocked

- 📮 **Send the Jamiu reply (§10.8)** — `admin@` proven healthy (`sent 05:51:09 → delivered 05:52:02`).
- 📮 **Send the Juliet reply (§11.4)** — she has no complaint and no reason to write one.
- 🔍 **R1** — two minutes in devtools: does `dateFrom` appear in the request? That decides client-vs-server.
- 👥 **Provision enumerator accounts** — prod holds exactly ONE active enumerator and it is Awwal's.
- 📄 **R8 briefing** into enumerators' hands before any field day.
- ⚖️ **Before the client session:** show `/insights` as-is, corrected, or with `n` disclosed (R-E).

#### D. What adjudication will check when work returns

Stated in advance so it is a gate, not a surprise — these are the halves most likely to be dropped:

- **13-51's AC3.3 must NOT arrive without the hard/soft severity work.** Half of that fix is worse than
  none (§10.11). If only one is present, it goes back.
- **13-46's AC10 must arrive WITH the non-blocking nudge.** AC10 alone recovers the denominator and not
  the response rate — the letter of R-B, missing its point.
- **R-E:** every rate denominator per-field, `n` published, and the RED-verify that a row with
  `raw_data` but no `employment_status` does **not** move the rate.
- **Any new `done` story** gets the §2a0 debt gate and the D1/D9 formats — 13-61 is the worked example.

#### E. One shape to carry into the build — it appeared THREE times today

`d16c439` is the third instance of §2z and the PM found it independently: the respondent-write guard
**greps source TEXT** while meaning **a CALL**, so an operator note that merely *named* a helper read as
using it. Alongside the rate denominator that filtered on **source** while meaning **answered**, and the
suppression key **written raw** while **read canonical** — *the predicate was not the thing it meant*,
three times, in three unrelated subsystems, in one day.

> **The commit's own judgement is the part to keep:** it was fixed by **rewording the message, not by an
> allowlist entry**, because allowlisting a file that does not actually violate the rule *makes the list
> lie about what it sanctions*. **Silence a trip only where there is something to silence.**

⚠️ **And it re-proved the push lesson in a new disguise** — the background task reported **exit 0**
while the pre-push suite had failed and `origin/main` was unmoved. **Verify a push by asking git where
the branches are** (`git status -sb`), never by an exit code, whatever produced it.

---

## 11. CONTACT REMEDIATION — executed 2026-08-11, and two citizens found by it

**All changes audited (`email.suppression_lifted`, `user.email_corrected`), all read-backs verified,
temp scripts removed, VPS tree clean.** Suppressions 14 → 11.

| # | action | evidence |
|---|---|---|
| 1 | `admin@oyoskills.com` suppression lifted | probe `sent 05:51:09 → delivered 05:52:02`; operator confirmed token `MBX-MSO8SGXJ` at `oyotradeministry@gmail.com`. Unblocks §5.0 item 0 and §10.8's reply-to path. |
| 2 | `osegunlajide@gmail.con` → `@gmail.com` on the `users` row | probe to the corrected address **delivered 06:25:39**. Oluwasegun Olajide can log in again (magic-link is the auth path, so the address IS the credential). |
| 3 | `julietiyabodeodiba@gmail.com` suppression lifted | Resend: **Transient / MailboxFull** |
| 4 | `ibitolayetunde@gmail.com` suppression lifted | Resend: **Transient / MailboxFull** |

### 11.1 ⭐ THE BOUNCE DETAIL WAS NEVER LOST — WE THREW IT AWAY. RESEND STILL HAD IT.

`GET https://api.resend.com/emails/{message_id}` returns a full `bounce` object for every historic
send. **Zero emails were sent to obtain any of this.**

| address | person | `type` | `subType` | diagnostic |
|---|---|---|---|---|
| `julietiyabodeodiba@gmail.com` | **Juliet Odiba** | **Transient** | **MailboxFull** | `452-4.2.2 out of storage` |
| `ibitolayetunde@gmail.com` | Adewale | **Transient** | **MailboxFull** | `452-4.2.2 out of storage` |
| `fatomidejumoke@mail.com` | **Jumoke Fatomide** | Permanent | General | `550 mailbox unavailable` (postmaster.mail.com) |
| `jambestojeke@gmail.com` | Jamiu | Permanent | General | `550-5.1.1 account does not exist` |
| `ola4ct@outlook.com` | Awosoji | Permanent | General | `550 5.5.0 mailbox unavailable` |

**2 of 5 were false positives — a 40% error rate on the well-formed cohort.** `email-events.service.ts`
collapses every bounce to `reason='bounced'`; the severity Resend hands us is parsed away, so a full
inbox and a dead domain are stored identically and both become permanent.

### 11.2 ⛔ CORRECTION — "no registered person is excluded" was WRONG. Two were.

Stated earlier this session on the strength of a query over `users`, `magic_link_tokens` and
`wizard_drafts`. **Public respondents need no `users` row, and `respondents` has no email column, so
that query structurally could not see them.** I then reported the absence as "not registered" — the
exact error §10.2 warns about in bold (*"unmatched, not unregistered"*), repeated **within the hour of
reading the warning**, and the same error made about Rosemary and Adekemi.

- **Juliet Odiba — `OSL-2026-51CNVZ`, active, Egbeda, registered 2026-08-04 09:11:52.** The bounced
  mail *was her registration-number email*. **She is registered, has never been told her number, and by
  our own policy never would have been.** Recoverable: transient bounce, suppression now lifted.
- **Jumoke Fatomide — `OSL-2026-TYZ3AH`, active, Egbeda, registered 2026-08-04 09:05:24.** Permanent
  bounce; suppression correctly stands. She also has never been told her number.

> **Juliet is Jamiu without the complaint.** Jamiu wrote in and was found. Juliet has **no reason to
> write in** — she was told nothing, so she does not know there is anything to ask about. She is
> §10.2's silent cohort with a name and a reference code, and a stronger warrant for 13-50 than the
> complaint that started it.

### 11.3 RULING — do NOT add `mail.com → gmail.com` to the typo dictionary

Awwal's proposal: treat `mail.com` as a variant of `gmail.com` so a fallback address is tried.
**The instinct is right, the mechanism is wrong, on four measured grounds.**

1. **`mail.com` is a real provider.** The bounce came from **`postmaster.mail.com`** — real MX, real
   postmaster, a specific mailbox that does not exist. It is not a misspelling of anything.
2. **The dictionary asserts "this domain is wrong."** Every existing entry (`gmial.com`, `gmail.con`)
   is a domain that serves no mail. Adding a live provider makes the dictionary lie. It is warn-only
   *today* — but 13-51 may make it act, and a dictionary that rewrites live domains is a silent
   corruption engine pointed at citizen contact data.
3. **n = 1.** Exactly one `@mail.com` address exists in the entire system.
4. ⛔ **The decisive one: `fatomidejumoke@gmail.com` is a GUESS, not evidence.** No record anywhere
   holds that address. Contrast `osegunlajide`, where a same-day `wizard_drafts` twin carrying a NIN
   made the correction evidence-backed. **Mailing a citizen's name, LGA and reference code to a guessed
   address is disclosure to an unidentified third party** — under NDPA, with a DPIA on file. A guessed
   address is not a correction.

**➜ The better answer was already in our hands: she has a phone number.** A verified identifier we
hold beats a guessed one we do not. **Invert Awwal's ordering — phone is the PRIMARY channel for
Jumoke, not the fallback**, because guessing costs more than it saves.

**What DOES survive from the idea, and belongs in 13-51:** on a Permanent bounce, surface a
**recovery candidate for an operator to confirm** — never an automatic rewrite. Rank candidates by
evidence: a same-day draft twin carrying a NIN is strong (osegunlajide); a domain guess is weak and
must be confirmed on another channel before any PII is sent.

### 11.4 📮 REPLY TO JULIET — DRAFTED, **NOT SENT**. Awwal to send by hand.

Same discipline as §10.8: individual reply, sent by a human from the ops mailbox, no automated path,
no NIN/phone/DOB in the body. Her suppression is lifted, so it can leave.

**To:** `julietiyabodeodiba@gmail.com` · **From:** `admin@oyoskills.com`
**Subject:** `You are registered — Oyo State Livelihood and Skills Registry (OSL-2026-51CNVZ)`

> Dear Juliet Odiba,
>
> We are writing to give you your registration number for the Oyo State Livelihood and Skills
> Registry.
>
> **Your registration number is `OSL-2026-51CNVZ`.**
>
> You are registered, and you have been since 4 August 2026. Your record is active, held under the
> name Juliet Odiba, in Egbeda Local Government Area.
>
> We sent this to you once before and it did not reach you — your mailbox was full that day, and our
> system then stopped writing to you altogether. That was our error, not yours, and we have corrected
> it.
>
> Please keep that number safe. It is the surest way to identify your record if you ever need to
> contact us, and you do not need to register again.
>
> If anything above does not match your own records — or if the name or local government we hold for
> you is wrong — please reply to this message and we will correct it.
>
> Thank you for your patience.
>
> **Oyo State Livelihood and Skills Registry**
> `admin@oyoskills.com`

**Notes for whoever sends it:**
- ✅ `admin@oyoskills.com` is now clear to send AND to receive (§11 row 1) — so the closing invitation
  to reply works. That was the §10.8 blocker and it is discharged.
- **If it bounces again, that is a result, not a failure**: it means her inbox is still full, and she
  moves to the phone channel below. Do not re-suppress by hand — the webhook will, and 13-51 must then
  distinguish the retry from a death.
- **No NIN, no phone, no DOB.** Name + LGA + reference code is enough for her to confirm the record is
  hers, and keeps the mail safe to forward or screenshot.
- **Do not promise a date.** "We have corrected it" is true; a date for 13-50 is not.

### 11.5 ☎️ PHONE CHANNEL — two names to add to §7g B

Both are **registered**, both are in **Egbeda**, and neither has ever been told their number.

| person | reference code | phone | why phone |
|---|---|---|---|
| **Jumoke Fatomide** | `OSL-2026-TYZ3AH` | `+2348130237918` | **PRIMARY.** Email permanently dead (`Permanent/550`, postmaster.mail.com). ⚠️ **The `mail.com`→`gmail.com` reading is a REASONABLE HYPOTHESIS and predates this session** — 13-42 AC8 recorded it on 2026-08-05 as *"likely meant gmail.com"*. §11.3 rules only that it must not go in the typo DICTIONARY (mail.com is a live provider) and that her name/LGA/reference code must not be sent to a guessed address. **It does not forbid TESTING it:** a no-PII existence probe to the gmail variant can kill the hypothesis at zero risk, and cannot confirm identity either way. **The phone settles identity in one call; the probe only settles whether a mailbox exists.** |
| **Juliet Odiba** | `OSL-2026-51CNVZ` | `+2348130926690` | 🔴 **PROMOTED TO PRIMARY 2026-08-12 — THE TRIGGER FIRED.** §11.4's email was sent 08-11 16:29 and **bounced 08-12 06:29** (14 h, `Transient/MailboxFull` again, auto-re-suppressed). Her mailbox was still full seven days after the first bounce. **Two attempts, two bounces — she is reachable only by phone.** Registered since 2026-08-04 and still never told her number. Retry-window evidence → 13-51. |

⚠️ **Read the reference code out; do not ask them to read one back.** 13-4 R8's rule: never read a
number to a respondent until the app shows one. Here the app shows one, so reading it out is correct —
but the operator must confirm identity by name and LGA first, not by the number itself.

### 11.6 Reopen triggers

- Juliet's reply bounces again → her mailbox is still full; move to phone and record the second
  bounce as evidence for 13-51's retry-window design (how long is long enough?).
- Any further `Transient` bounce is permanently suppressed after 13-51 ships → the fix did not fire.
- A `mail.com`-style live-provider entry appears in `typo-dictionary.json` → §11.3 was overruled
  without being answered; re-read it before accepting.

---

## 12. GATE ITEM 2 IS GREEN — the enumerator path proven end to end (2026-08-12/13)

**Everything below is prod, read-only verified, and re-runnable.** Baseline captured 2026-08-12
14:20Z at prod `19b51f5`; teardown re-measured 2026-08-13. Full record with IDs:
`docs/runbooks/enumerator-prod-smoke-and-golive-gate.md` §F.

### 12.1 Phase 1 — activation proven a SECOND time, on the field branch

`lawalkolade+testenumeratornew@gmail.com`, invited and activated 2026-08-12 17:00.

```
activation.selfie_processed   livenessScore 0.3107927737952964
activation.complete           backOfficeActivation: false      ← THE FIELD BRANCH
```

**Why a fresh invite was necessary at all:** the activation wizard is **one-time**. Once an account
activates, the invite → email → activation → selfie path cannot be re-run on it. So the only way to
re-test the path that failed twice and had succeeded once was a new account. **It now stands at 2 of
3 attempts succeeding, both successes after the `27e1fdc` CSP fix.**

`backOfficeActivation: false` is the point: 13-59 AC3.3 warned that both prior prod activations were
super-admins taking a **different branch**, so nothing had ever exercised the field path. **It has now.**

#### ⚠️ 12.1a THE SHARPNESS MARGIN IS SHRINKING AND NOBODY HAS ESTABLISHED WHAT IS TYPICAL

| account | score | route |
|---|---|---|
| April 2026 | **0.8589** | activation |
| `+testenumerator` | **0.5913** | `/profile-completion` upload |
| `+testenumeratornew` | **0.3108** | activation, 2026-08-12 |

`liveness_score = min(sharpness/100, 0.99)` and `photo-processing.service.ts:110` **throws
`VALIDATION_ERROR('Image is too blurry. Please retake.')` below `sharpness < 20`** — a score of 0.20.

**Today's capture scored 0.31 — 1.5× the rejection floor.** And because that is an `AppError` with
code `VALIDATION_ERROR`, `auth.service.ts:188-190` **re-throws it, so the activation FAILS OUTRIGHT.**
One dimmer room or one cheaper handset and a field officer cannot activate.

Three samples is not a distribution, and the threshold was *"determined empirically"* with no record
of on what. **It is the only data anyone has, and the working margin is 0.31 against a floor of 0.20.**
→ recorded in **13-60**.

#### ⚠️ 12.1b `live_selfie_verified_at` IS WRITTEN BY ONE OF THE TWO SELFIE PATHS

`grep liveSelfieVerifiedAt` returns exactly one writer: `user.controller.ts:64` — the
`/users/selfie` **upload** path. **`auth.service.ts` never sets it.**

| account | route | `verified_at` |
|---|---|---|
| `+testenumerator` | `/profile-completion` upload | **set** |
| `+testenumeratornew` | activation wizard | **NULL** |

Both hold a selfie and an ID card. **The column does not mean "verified" — it means "arrived via the
upload path".** Any query asking *"who has a verified selfie?"* silently under-counts everyone who
activated normally, which will be **every field officer**. Third instance of a name asserting a
property its value does not carry, on this one surface (with `liveness_score` and the old 13-60 title).

### 12.2 ⛔ THE FIRST ATTEMPT AT §C TESTED NOTHING, AND IT LOOKED FINE

Rows 1 and 2 were captured on **different phones** — the sheet required one shared handset. So no
same-phone match existed, the identity guard never ran, and
`identity_match_exempted_staff_capture` fired **0 times**.

**`§A query 4` would have returned 1** — which reads as *"the fix is broken"* when the truth was
*"the code never executed."* Those two are indistinguishable from the count alone, and from the UI.
**This is exactly what §C's mandatory log-line step exists to separate**, and it caught it.

Row 4 (`Fatima Bisi Zzsmoke`, same phone, NIN blank) was added specifically to form the pair.

### 12.3 The green, with the evidence that cannot be faked

| check | result |
|---|---|
| §A query 2 — all 6 rows | `source='enumerator'`, submission present, `processed=t`, **no processing errors** |
| **§A query 4** — household phone | **2** |
| **§A query 5** — the guard EXECUTED | `trigger: no_nin` · `wouldHaveMergedInto` = Fatima (`OSL-2026-TYANTY`) · `source: enumerator` |
| §A query 6 | one shared-phone group: Fatima + Fatima Bisi. Expected for a household |
| **Orphans** | **2 before, 2 after — nothing lost** |
| NIN branches | 2 with sentinels → `active`; 4 blank → `pending_nin_capture` |
| §E email branches | 3 with, 3 without — **all three OSLRS-number emails CONFIRMED RECEIVED**, not merely `sent_at = t` |
| **R8 status-check** | shared phone → neutral, **no email**; `OSL-2026-TYANTY` → **email arrived**. Run **30 minutes apart** |

**Teardown, child-first:** `fraud_detections` 6 · `marketplace_profiles` 6 · `magic_link_tokens` 1 ·
`campaign_sends` 0 · `email_suppressions` 0 · `submissions` 6 · `respondents` 6.
Re-measured to **327 · 1 · 285 · 2** — the +1 submission is an unrelated **public** registration that
landed mid-smoke (`OSL-2026-A37K2A`, 11:53:59) and was correctly untouched.

⚠️ **Two teardown facts worth keeping.** Every smoke submission spawned a `fraud_detections` AND a
`marketplace_profiles` row, so **a RID-only teardown would have orphaned twelve rows**. And the
`magic_link_tokens` **1** was the status-check token — `respondent_id = NULL`, so a delete-by-RID
would have missed it. That is the 2026-07-30 leak, caught by the clause written after it.

### 12.4 ⛔ FOUR OF SEVEN ROLES HAVE NEVER HAD AN ACCOUNT ON PROD

Found while trying to satisfy §D.1's `team_assignments` precondition:

```
data_entry_clerk 0 · government_official 0 · supervisor 0 · verification_assessor 0
super_admin 2 (both Awwal's) · enumerator 4 (all Awwal's) · public_user 123
```

`TeamAssignmentService.createAssignment` **validates the supervisor role**, so with zero supervisors
the assignment **cannot be created by the canonical path at all** — and forcing it with a raw INSERT
would bypass the one check that service exists to perform.

✅ **The smoke ran anyway, because the submission path does NOT read `team_assignments`** (only
analytics scope, personal stats, productivity and the assignment service do). Recorded in §F as a
stated deviation: **supervisor team views, personal stats and productivity figures were not
exercised.**

➜ **§8.5's assessor finding was not special.** Half the role model has never run in production.
⚠️ **Creating the first supervisor is a first-run of an unexercised role** — treat it as its own task,
not as a prerequisite discovered mid-gate.

### 12.5 ✅ `campaign_source` — NOT A DEFECT. The runbook was.

Six enumerator rows returned NULL and it was briefly reported as gate item 3 failing.

| path | value | why |
|---|---|---|
| public, answered | `{"utm": {...}, "channel":"Facebook"}` | the acquisition question is on that form |
| public, skipped | NULL | **optional by ruling R-B** — a person exercising a choice |
| **enumerator / clerk** | **always NULL, correctly** | no acquisition question exists there. **The enumerator IS the channel** |

**25 of 291 submissions carry it.** Gate item 3 belongs with **gate item 1** (the public happy path).

**Fixed where it misled:** runbook gate item 3 and `§A query 3` are now bound to `source='public'`,
with the trap spelled out. Note in **13-46**, which owns the acquisition question, including the
warning that AC10's success rate must be measured on **public rows only** — computing it over all
submissions would dilute it with staff captures that were never asked, the same defect class as R-E.

### 12.6 ✅ GPS — already working for enumerators; 81 legacy rows are invisible to the columns

`submissions.gps_latitude` / `gps_longitude` are **first-class columns**, and **the enumerator path
populates them**: six live captures at `7.4095707, 3.9080501` etc., accuracy 16–30 m, all within ~10 m
(one operator, one desk). **Nothing needs building for enumerator GPS.**

```
gps_latitude column   7    ← enumerator path (writes column AND raw_data)
raw _gpsLatitude      7    ← same rows
raw gps_location     81    ← the LEGACY full public questionnaire
```

The 81 predate Public Core, which **does not collect GPS at all** — so **jingle traffic adds none
either way, and this is not a launch item.** The defect is that *"how many submissions have GPS?"*
answers **7** or **81** depending on which store you ask, and nothing labels which.

➜ **12-7** (not 12-4/5/6 — those are R-F blast-gated): backfill `gps_location.latitude → gps_latitude`
so a map sees **88 points, not 7**; keep `accuracy` (only the JSON has it); assert the invariant
afterwards; and **RED-verify on a LEGACY row**, because a fresh enumerator capture populates both and
would pass without the backfill running.

### 12.7 Reopen triggers

- A field officer reports *"Image is too blurry"* and cannot activate → 12.1a's margin closed; the
  threshold needs measuring, not adjusting on instinct.
- Any cohort query keyed on `live_selfie_verified_at` reports a number → check it is not silently
  excluding every activation-path account (12.1b).
- A coverage map or export ships reading `gps_latitude` before 12-7's backfill → it will show 7
  points and be believed.
- A second `identity_match_exempted_staff_capture` count of 0 on a §C run → the pair was not formed;
  re-read 12.2 before concluding the fix regressed.
