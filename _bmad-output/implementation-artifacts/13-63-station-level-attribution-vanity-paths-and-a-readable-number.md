# Story 13-63: Station-level attribution — vanity paths that survive the landing, and a number someone can read

Status: ready-for-dev

<!-- Authored 2026-08-21 by Bob (SM), carved from Story 13-46's residual ledger rows **R3** (High, OPEN,
hard-deadlined) and **R2** (Med, OPEN, evidence-triggered).

⚠️ **THESE TWO ARE ONE STORY ON PURPOSE, AND SPLITTING THEM WOULD BE THE MISTAKE.** Both are answers to
a single question — *how does the radio campaign get measured?* — and they are not independent: R3's
vanity paths attribute a listener **who never answers the question**, which is precisely what decides
whether R2's post-submit ask is worth its funnel risk. Filed separately, the cheap-and-urgent half (R3)
and the expensive-and-conditional half (R2) drift apart, and the likely outcome is that someone picks up
R2 — the one with a code change, a funnel touch and no deadline — while R3, which has a deadline nobody
can move, waits for a sprint. The ordering below is load-bearing for the same reason 13-46's was.

⚠️ **R3's premise required one correction before this story could be written, and the correction is the
story's centre of gravity.** 13-46 records the instrument as `oyoskills.com/fresh` → 302 → `/?ref=fresh`.
Verified against the tree on 2026-08-21: **that target captures nothing.** `parseUtm` is called from
exactly ONE place — `WizardPage.tsx:172`, mounted at `/register` — and every route into the wizard is a
bare `<Link to="/register">` that drops the query string. A listener redirected to `/` with `?ref=fresh`
loses the ref at the first click. The fix is one path segment in the redirect target and is still zero
code (see AC1), but had the rules been created from the residual's wording they would have been live,
verified-as-redirecting, and silently attributing nothing — [[pattern-ship-a-fix-that-never-fires]] at
the exact moment the money is being spent.

⚠️ **A second gap, found the same way:** `ReportService.getCampaignBreakdown` groups ONLY on
`campaign_source ->> 'channel'` and coalesces NULL to `'(unknown)'` (`report.service.ts:89`). A
`?ref`-only arrival stores `{"channel": null, "utm": {"ref": "fresh"}}`, so **all 11 stations collapse
into one `(unknown)` row** — and the function has **no controller, no route and no caller anywhere in
`apps/`**. The data would land and remain unreadable. AC4 exists because of this. -->

## Story

As **the operator paying for a jingle on 11 radio stations**,
I want **a per-station link a presenter can say out loud that still carries its station tag by the time the wizard loads, and one read that tells me how many registrations each station earned**,
so that **at the end of the flight I can renew the two stations that worked and drop the nine that did not — instead of knowing only that "radio worked".**

## Context & Evidence (verified 2026-08-21 against the working tree on `story/13-46-burst-readiness`; prod facts flagged as such)

### 1. The capture chain exists and is complete — right up to the landing page

`buildCampaignSource` (`apps/api/src/controllers/registration.controller.ts:141-159`) writes
`raw_data.campaign_source` when **either** a channel **or** a UTM is present:

```ts
if (!channel && !utm) return {};
return { campaign_source: { channel, utm: utm ?? {} } };   // :157-158
```

That single **OR** is the whole reason vanity paths matter: **a `?ref` arrival is attributed even when
the listener never answers "How did you hear about us?"** — the question is optional by ruling (13-46
R-B), and on prod only **25 of 291** submissions carried `campaign_source` at all as of 2026-08-13.

The client half is `parseUtm` (`apps/web/src/features/registration/lib/attribution.ts:172-183`), which
treats a bare `?ref` as first-class (`params.get('ref')` at `:177` → `utm.ref` at `:181`), inside the
4-key allow-list `source/medium/campaign/ref` (`:165`). The submit spreads it into `raw_data`
(`registration.controller.ts:1097`).

### 2. 🔴 But `parseUtm` runs in ONE place, and it is not the page the redirect lands on

```
apps/web/src/features/registration/pages/WizardPage.tsx:168-176   ← the ONLY call site
```

It is a one-shot effect keyed on hydration, reading the wizard route's own `searchParams`. `WizardPage`
is mounted at **`/register`** (`App.tsx:638`). The homepage is a different route and parses nothing.

Every documented path from the homepage into the wizard is a **bare link with no query forwarding**:

| Call site | Link |
|---|---|
| `apps/web/src/features/home/sections/HeroSection.tsx:30` | `to="/register"` |
| `apps/web/src/features/home/sections/FinalCtaSection.tsx:26` | `to="/register"` |
| `apps/web/src/layouts/components/SmartCta.tsx:91` | `to="/register"` |
| `apps/web/src/features/participate/pages/WorkersPage.tsx:161,342` | `to="/register"` |

So the residual's target — `oyoskills.com/fresh` → `/?ref=fresh` — produces: homepage loads with the ref
in the URL → nothing reads it → the listener clicks Register → `/register` with **no query string** →
`extras.utm` is never written → `campaign_source` is `{}` unless the listener also answers the question.
**The instrument that was supposed to survive an unanswered question does not survive the first click.**

### 3. ⭐ This exact class was already found and fixed — on the other hop

`MagicLinkLandingPage.tsx:291-303` (Story 13-9 AC1) forwards the allow-listed params by hand across the
`/auth/magic` → `/register` hop, with the reasoning written into the code:

> *"Without this forward, the hop drops the params and a blast conversion can't be attributed (the
> one-way door)."*

The project has already paid to learn that a hop drops params. **The homepage → `/register` hop has the
identical defect and no forward was ever built**, because until now nothing landed a campaign on the
homepage. Nothing here is a surprise; it is the same door, unlocked on the other side.

### 4. 🔴 Even once the data lands, nobody can read it per station

`ReportService.getCampaignBreakdown` (`apps/api/src/services/report.service.ts:86-97`):

```ts
channel: sql`COALESCE(${submissions.rawData} -> 'campaign_source' ->> 'channel', '(unknown)')`,  // :89
.where(sql`${submissions.rawData} -> 'campaign_source' IS NOT NULL`)                             // :93
.groupBy(sql`1`)                                                                                 // :94
```

Two consequences, both fatal to a station-level conclusion:

1. **It groups on `channel` only.** A `?ref=fresh` arrival with no answer has `channel: null` → it lands
   in the single `'(unknown)'` bucket. **Eleven stations, one row.** `utm.ref` is read by nothing on the
   API side — the only other UTM read is `utm ->> 'campaign'` in `getCampaignFunnel`
   (`report.service.ts:133`).
2. **It has zero callers.** Grepped across `apps/api/src/controllers`, `apps/api/src/routes`,
   `apps/api/scripts`, `scripts/` and all of `apps/web`: no controller, no route, no script, no
   component. 13-46's AC9 dry run proved it *works* by invoking it directly — which proves the function,
   not the reachability. This is the `getCampaignFunnel` shape 13-44 was written to fix
   (`13-44-super-admin-campaign-observability.md`, Context: *"dead-ended in the service layer"*).

### 5. The station instrument was specified 14 months ago and deliberately not built

`docs/launch-campaign/attribution-spec.md:38` shows the intended shape, with a `station` key:

```json
"campaign_source": { "channel": "radio", "station": "fresh_fm", "utm": {} }
```

and `:54` says the *"11 stations are editable without a deploy if a station is added/dropped"*. Story
13-1 AC2.4 then dropped the sub-picker on purpose (`attribution.ts:15`: *"no per-station sub-picker"*),
because asking a listener which station they heard is a fifth question at the conversion moment. **The
vanity path is how the spec's `station` intent gets satisfied without asking anything** — it is not a
reversal of 13-1, it is the alternative 13-1's own note pointed at.

### 6. The deadline, and why it is not a preference

11 stations are on the buy (`docs/roadmap-to-launch.md:107`). The jingle script is read on air; the URL
in it becomes physical the moment it is recorded and broadcast. **A URL read on air cannot be
retrofitted.** If the paths are not live and proven before the first spot, the station dimension is
unrecoverable for the whole flight — there is no backfill, no reprocessing and no second chance, because
the signal was never emitted.

Note the asymmetry that sets the ordering inside this story: **capture is perishable, reporting is not.**
If AC4's read slips, the rows still exist and a SQL query recovers the answer afterwards. If AC1-AC3 slip
past the first spot, no query recovers anything.

### 7. The `?ref` path has executed ZERO times on prod

13-46's AC9 discharged the **channel** half on 2026-08-21
(`docs/runbooks/13-3-cutover-and-failover.md:51-101`): submission `OSL-2026-9F4TRH` stored
`{"utm": {}, "channel": "Radio"}` and `getCampaignBreakdown()` returned `Radio|1`. Note what that run did
**not** exercise: `utm` was `{}`. The runbook says so itself at `:84`:

> ⚠️ *If the jingle will use per-station vanity links … extend this dry run to cover a UTM/`?ref` arrival
> too — that path has also never executed on prod.*

Of the 25 prod rows carrying `campaign_source` on 2026-08-21, seven are UTM-only — but those arrived via
the re-engagement blast's `utm_source=referral` links (`thankyou-email.ts:43`), which land on
`/auth/magic` where 13-9's forward exists. **No row has ever arrived via a bare `?ref` on a cold
landing.** The one hop that works is the one somebody built a forward for.

### 8. R2 — the post-submit ask, and why it is NOT being built yet

13-46 built a submit-time nudge and then **dropped it** on Awwal's ruling (2026-08-21, residual R1). The
reasoning is recorded in the code that replaced it, `Step5ReviewAndSave.tsx:89-108`:

> *"the risk is asymmetric: a lost registration is permanent and costs a citizen who has just spent 10-15
> minutes, while a missing attribution answer costs one data point. On a slow phone connection 'I pressed
> Save and nothing happened' reads as BROKEN, not as PROMPTED."*

What shipped instead is pure prominence — a highlighted card and one line when the question is unanswered
(`Step5ReviewAndSave.tsx:246-300`) — with `onSubmit` wired straight through, and four regression tests
asserting the first press submits in all three states.

The post-submit ask (asking on the **confirmation screen**, after the row is committed, then PATCHing
`campaign_source`) carries none of that conversion risk: the registration is already safe. It is
genuinely the stronger response-rate instrument. **It is still not authorised**, because 13-46's R2 makes
it evidence-triggered, and the evidence does not exist yet: the AC10 prominence must deploy, and the
public-rows-only `answered_rate` must then be measured
(`docs/runbooks/13-3-cutover-and-failover.md:117-124`). If prominence moves the rate, a funnel change
buys nothing. **AC7 is written as a gate, not as work.**

### 9. ⚠️ Where the confirmation screen actually is — check this before touching it

The wizard **never navigates to `RegistrationCompletePage`**. It renders an inline `CompletionScreen`
declared at `WizardPage.tsx:780` and mounted at `:640-649`. `RegistrationCompletePage.tsx:46-49` carries
the warning in its own comments, written by someone who lost time to it:

> *"⚠️ This page is NOT the wizard's completion screen … Confetti lives in BOTH places on purpose —
> putting it only here is why the first attempt never fired."*
> *"Third instance today of the same trap: two implementations of one concept, and the change landed on
> the one the traffic does not take."*

Also relevant to AC7's shape: `completionData` holds only `{ referenceCode, pendingNin }`
(`WizardPage.tsx:142-146`) — **no submission id**. A post-submit patch therefore needs either the submit
response to return an id, or a reference-code-keyed endpoint. That is a design decision to make, not a
detail to discover mid-task.

## Non-goals (decisions already made, recorded so they are not re-opened mid-sprint)

- **No per-station question in the wizard.** 13-1 AC2.4 dropped the sub-picker deliberately
  (`attribution.ts:15`); a fifth question at the conversion moment is exactly what the vanity path avoids.
- **No admin UI.** `13-44` (super-admin campaign observability) and `13-10` (channel-comparison
  dashboard) own the surfaces. AC4 extends the read those stories consume — it does not build their page.
- **No new runbook.** This story EXTENDS `13-3-cutover-and-failover.md`, `pre-viral-push-checklist.md`
  and the roadmap paid-spend gate, exactly as 13-46 did, and creates no fourth artifact.
- **No change to the acquisition question's optionality.** Ruled 2026-08-11 and re-affirmed 2026-08-21;
  the whole point of the vanity path is that it works without an answer.

## Acceptance Criteria

> **Ordering is load-bearing.** AC1-AC3 are perishable (§6) and must be complete before the first spot
> airs. AC4-AC5 are recoverable after the fact. AC7 must not start at all until AC6's measurement exists.

1. **AC1 — The redirect target is the WIZARD, and that is proven, not assumed.**
   Each station's vanity path 302s to **`/register?ref=<slug>`** — the route where `parseUtm` actually
   runs (`WizardPage.tsx:168-176`) — **not** to `/?ref=<slug>`, which drops the tag at the first click
   (§2).
   - **Proof, not inspection.** For at least one slug: load the vanity URL in a browser, confirm the
     final URL still carries `?ref=`, **then** confirm `wizard_drafts.form_data.extras.utm.ref` holds the
     slug once the draft autosaves. A 302 that lands correctly and a tag that is *captured* are two
     different claims; assert the second.
   - **If landing a cold listener on `/` is preferred for trust framing, that is a DIFFERENT story and it
     is CODE** — an app-root capture into `sessionStorage` plus a wizard read, i.e. the homepage twin of
     13-9's `/auth/magic` forward (§3). It is not zero code, it cannot ship by the deadline, and choosing
     it means the deadline is missed. **Record the choice; do not discover it.** The default in this
     story is `/register?ref=<slug>`, chosen precisely because it preserves the zero-code property.
2. **AC2 — One Cloudflare Redirect Rule per station, from a written slug registry.**
   Created in the SAME Cloudflare sitting as 13-3's parked fallback rule and 13-46 AC6's WAF rule
   (`docs/runbooks/13-3-cutover-and-failover.md:13-25`) — Rules → Redirect Rules, 302 (temporary), one
   rule per station.
   - **A slug registry is committed to the repo** (in the runbook, beside the rules) mapping
     station → slug → target. Eleven stations means eleven chances for the on-air URL and the rule to
     disagree; the registry is the one thing both the media buyer and the operator read.
   - **Slugs are radio-sayable**: lowercase, one word where possible, no hyphens to read aloud, no digits
     a listener will mishear. A slug a presenter improvises is a slug that 404s.
   - 🔴 **A collision check against the app's own routes is an AC, not a courtesy.** A vanity slug shadows
     any real path with the same first segment, at the edge, before the origin ever sees it. Check every
     proposed slug against the top-level segments registered in `apps/web/src/App.tsx` — currently
     `about`, `participate`, `support`, `terms`, `marketplace`, `insights`, `verify-staff`,
     `check-registration`, `login`, `staff`, `forgot-password`, `reset-password`, `auth`, `register`,
     `registration`, `activate`, `unauthorized`, `profile-completion`, `dashboard` — and record the check.
   - **These rules are ENABLED, unlike 13-3's parked fallback.** State that in the runbook, so nobody
     "tidies up" by disabling them alongside the disabled rule they sit next to.
3. **AC3 — A `?ref` liveness dry run on prod, modelled on 13-46's AC9 — both halves, teardown BY ID.**
   The `?ref` path has run zero times on prod (§7). Discharge it exactly as AC9 was discharged, and record
   the run in `13-3-cutover-and-failover.md` under its existing attribution section:
   - **Write half:** arrive via a real vanity URL, complete one registration **without answering the
     acquisition question**, and assert the stored value is
     `{"channel": null, "utm": {"ref": "<slug>"}}`. The unanswered case is the only case worth testing —
     an answered one re-proves the channel path AC9 already proved.
   - **Read half, not optional:** the station must be visible in AC4's read. A row that lands and never
     surfaces is the `getCampaignFunnel` failure again (§4).
   - **Teardown uses the CHILD-FIRST chain, not "respondent + submission".** 13-46's AC9 run proved the
     short wording orphans `users`, `magic_link_tokens`, `marketplace_profiles` and `campaign_sends`
     (residual R5). Use the verified chain at `13-3-cutover-and-failover.md:66-80`, read every `DELETE n`
     count, and **never restore to a baseline number** — re-measure.
     ⚠️ `campaign_sends` above all: 13-46's new per-address throttle reads that ledger, so a leftover row
     silently suppresses the next real thank-you to that address for the whole
     `MARKETING_CONTACT_GAP_DAYS` window.
   - Use the established smoke tagging (surname `ZZSMOKE`, the `7000000001x` NIN sentinel series — next
     unused **`70000000012`**, phones `0800000001x`, a `+tag` address the operator controls).
4. **AC4 — ONE read that breaks registrations out BY STATION, and that a human can actually reach.**
   Today `getCampaignBreakdown` collapses every station into `(unknown)` and has no caller (§4). Close
   both halves, minimally:
   - The breakdown (or a sibling read beside it) must group on **`campaign_source -> 'utm' ->> 'ref'`** as
     well as `channel`, so an unanswered `?ref` arrival reports as its station rather than as `(unknown)`.
     Keep `(unknown)` meaning *"neither a channel nor a ref"* — it must not quietly become the station
     bucket.
   - **Reachability is part of the AC.** The minimum acceptable surface is a committed, documented
     operator query or a `pnpm` script that prints the per-station counts, referenced from
     `13-3-cutover-and-failover.md`. It does **not** have to be a UI.
   - ⛔ **SCOPE GUARD — do NOT build the admin page here.** `13-44` (ready-for-dev) owns super-admin
     campaign observability and `13-10` (backlog) owns the channel-comparison dashboard; 13-10 AC3 already
     names `getCampaignBreakdown` as its source. Extend the read those stories will consume and leave the
     surface to them. Add a pointer in both story files so the extension is inherited rather than
     re-derived ([[feedback_canonical_primitive_backlog_sweep]]).
   - A test pins the station grouping against a fixture containing (a) channel-only, (b) ref-only,
     (c) both, and (d) neither.
5. **AC5 — The paid-spend gate and the runbooks carry it, so the operator can check it alone.**
   - `docs/roadmap-to-launch.md` pre-flight gate (§ *"Burst controls armed (13-46)"*, `:115-124`) gains a
     bullet: **per-station vanity paths live + `?ref` liveness discharged**, with the same
     *"independent of the rest — discharge it regardless"* framing the attribution dry-run bullet already
     carries.
   - `docs/runbooks/13-3-cutover-and-failover.md:84` — replace the conditional *"If the jingle will use
     per-station vanity links"* with the actual rules, the slug registry and the AC3 run record.
   - `docs/runbooks/pre-viral-push-checklist.md` §1 (Cloudflare posture) gains the vanity rules beside
     §1a's WAF rule, since both are armed in the same sitting and both are Cloudflare state that no
     deploy can restore.
6. **AC6 — The R2 trigger is MEASURED and written down (this is the whole of the R2 work for now).**
   After 13-46's AC10 prominence is deployed to prod, run the public-rows-only `answered_rate` query
   recorded at `docs/runbooks/13-3-cutover-and-failover.md:117-124` — scoped `r.source = 'public'` and
   `s.submitted_at >= '<AC10 DEPLOY>'`, because staff captures were never asked the question and including
   them dilutes the rate with people who could not have answered (ruling R-E's denominator defect, on a
   different metric).
   - Record the figure, the deploy timestamp used as the lower bound, and the row count, in this story's
     Dev Agent Record. **A rate with no `n` is not a measurement.**
   - ⚠️ **Do not run it against a window with too few public submissions to mean anything.** State the `n`
     and say plainly whether it supports a conclusion. An honest *"not enough data yet, re-run after the
     jingle"* is a valid discharge of this AC; an invented conclusion is not
     ([[pattern-verification-that-cannot-run-yet]]).
7. **AC7 — 🔒 GATED: the post-submit attribution ask. DO NOT BUILD UNTIL AC6 SAYS SO.**
   **Precondition, and it is an acceptance criterion rather than advice:** AC6 has been run, its figure is
   recorded in the Dev Agent Record, and that figure shows prominence did **not** materially move the
   answer rate. If AC6 shows the rate moved, **this AC is discharged by NOT building it** — record the
   number and close it. A dev picking this task up without AC6's figure on file is building unauthorised
   work.
   When, and only when, the gate opens:
   - The ask renders on the **inline `CompletionScreen` (`WizardPage.tsx:780`)** — *not* on
     `RegistrationCompletePage.tsx`, which the wizard never navigates to (§9). Confirm which screen the
     traffic reaches before writing a line.
   - It PATCHes `campaign_source` on the already-committed submission. The registration is already safe,
     so this control may be as prominent as it likes — that is the entire point of moving it here.
   - **Identify the row without leaking one.** `completionData` carries only `referenceCode`
     (`WizardPage.tsx:142-146`). Whatever key is chosen, the endpoint must not become a way to read or
     alter a registration from a guessed reference code: write-only, `campaign_source` only, no read-back
     of any other field, and refuse a second patch on a row that already carries one.
   - It is mounted on the public router with a limiter, following the two-dimension discipline
     (`registration.routes.ts:72-78`), and its route registration is tested
     ([[feedback_route_registration_test_discipline]]).
   - `ATTRIBUTION_ENABLED` (`attribution.ts:12`) still switches it off in one line, preserving 13-1 AC6.3's
     ≤2-minute revert.

## Tasks / Subtasks

- [ ] **Task 1 — Fix the target, then create the rules (AC: 1, 2)** ⏰ *before the first spot*
  - [ ] Agree the station → slug map with the media buy; write it into `13-3-cutover-and-failover.md`
  - [ ] Run the collision check against `App.tsx` top-level segments; record it
  - [ ] Create one 302 Redirect Rule per station → `/register?ref=<slug>`, **enabled**
  - [ ] Verify one slug end-to-end in a browser: the final URL keeps `?ref`, and the draft's
        `extras.utm.ref` holds the slug
- [ ] **Task 2 — `?ref` liveness dry run on prod (AC: 3)** ⏰ *before the first spot*
  - [ ] One registration via a vanity URL with the acquisition question left UNANSWERED
  - [ ] Assert the stored `campaign_source`; assert the station appears in AC4's read
  - [ ] Child-first teardown BY ID incl. `campaign_sends`; read every `DELETE n`; re-measure
  - [ ] Record the run in the runbook's attribution table
- [ ] **Task 3 — Make the station readable (AC: 4)**
  - [ ] Group on `utm ->> 'ref'` alongside `channel`; keep `(unknown)` meaning "neither"
  - [ ] Tests over the four fixture cases (channel-only / ref-only / both / neither)
  - [ ] Commit the operator read (query or script) and reference it from the runbook
  - [ ] Add the inheritance pointer to `13-44` and `13-10`
- [ ] **Task 4 — Gates and runbooks (AC: 5)**
  - [ ] Roadmap pre-flight bullet · `13-3-cutover-and-failover.md:84` replacement ·
        `pre-viral-push-checklist.md` §1
- [ ] **Task 5 — Measure the R2 trigger (AC: 6)**
  - [ ] Run the public-rows-only `answered_rate` after AC10 is on prod; record the rate **and its `n`**
  - [ ] State plainly whether the `n` supports a conclusion
- [ ] **Task 6 — 🔒 The post-submit ask (AC: 7) — BLOCKED until Task 5's figure is recorded here**
  - [ ] ⛔ Do not start. Re-read AC7's precondition. If AC6 showed the rate moved, close AC7 unbuilt.
  - [ ] Design decision on row identification (reference-code key vs an id in the submit response)
  - [ ] Write-only patch endpoint + limiter + route-registration test
  - [ ] Render on the inline `CompletionScreen` (`WizardPage.tsx:780`), never on `RegistrationCompletePage`

## Dev Notes

### The one-line summary a reviewer should hold on to

**`/?ref=fresh` measures nothing. `/register?ref=fresh` measures everything.** One path segment separates
a campaign you can renew on evidence from a campaign you can only have an opinion about.

### Why "zero code" is true of the deadline half and false of the story

R3 is described in 13-46 as zero code, and for **AC1-AC3 that is exactly right** — Cloudflare rules, a
committed slug registry, and one prod dry run. Nothing deploys, so nothing can be blocked by CI, a red
suite, or the flaky GitHub link on this machine. That property is what makes the deadline survivable and
it must not be casually traded away.

**AC4 is code**, and it is in this story anyway, because a station tag nobody can read is not attribution.
The two halves have different deadlines and that is stated rather than blurred: the rules are perishable,
the read is not.

### The trade AC1 makes, stated so nobody re-litigates it under pressure

Redirecting to `/register` skips the homepage's trust framing for a cold radio listener. That is a real
cost, accepted here for two reasons:

1. **The jingle IS the framing.** A listener who has just heard sixty seconds about the state skills
   register has had the pitch; the homepage would repeat it at the price of a click.
2. The alternative preserves framing at the price of **code, a deploy and the deadline** (AC1's second
   bullet). Given the deadline cannot move and the code can ship later, framing is the recoverable half.

If Awwal prefers the homepage landing, the honest sequence is: ship the vanity rules pointing at
`/register` **now** to catch the flight, and file the sessionStorage forward as a follow-up that changes
only the redirect target once it is live.

### What R2 is really buying, and why the gate is the interesting part

The post-submit ask is not controversial on its merits — it is strictly safer than the submit-time nudge
Awwal rejected, because the registration is committed before it appears. What is controversial is
**building it before knowing whether it is needed.** 13-46 shipped prominence for exactly this reason, and
R2's trigger exists so the funnel gets changed on evidence rather than on the feeling that a 30% answer
rate ought to be higher.

Note the interaction that makes this one story: **if AC1-AC4 land, the answer rate matters less.** Vanity
paths attribute the radio listener without asking. With station-level attribution working, R2's value
drops from *"we cannot measure radio"* to *"our self-report sample is thinner than we would like"* — a
much weaker case for touching the conversion funnel. That is precisely why R2 is downstream of R3 and not
beside it.

### Dependencies and relationships

- **13-46 (`in-progress`)** — parent. This story discharges its residuals **R3** and **R2**. 13-46's AC9
  (channel liveness) is DONE on prod; AC3 here is its `?ref` twin.
- **13-1 (`done`)** — built `parseUtm`, `extras.utm`, the channel list, and deliberately dropped the
  station sub-picker (AC2.4). This story satisfies that dropped intent by URL rather than by question.
- **13-9 (`done`)** — built the UTM forward across the `/auth/magic` hop. **The precedent AC1 applies to a
  second hop.**
- **13-44 (`ready-for-dev`)** / **13-10 (`backlog`)** — own the admin surfaces. AC4 extends the read they
  will consume; it must not build their page.
- **13-3 · `pre-viral-push-checklist` · the roadmap paid-spend gate** — the three artifacts that already
  own this moment. This story EXTENDS all three and creates no fourth (same discipline as 13-46).

### Testing standards

- Web: `cd apps/web && pnpm vitest run` (never from the repo root — wrong config).
- API single file: `pnpm vitest run apps/api/src/services/__tests__/<file>`; the suite runs against a test
  DB (`NODE_ENV=test DATABASE_URL=…app_test`, db-guard enforced).
- ⛔ **One vitest suite at a time across BOTH worktrees** — a pre-push hook runs the full suite per tree.
- ⚠️ turbo uses a shared worktree cache; run a guard DIRECT after a status flip rather than trusting a
  replayed hash ([[pitfall-cached-gates-and-vitest-pools]]).
- AC1-AC3 are operator/prod work and carry **no unit tests by design**. Their evidence is the run record
  in the runbook — which is why AC1 demands the captured value and not merely the 302.

### Project Structure Notes

- **Cloudflare only (AC1-AC3):** no repo files change except `docs/runbooks/13-3-cutover-and-failover.md`,
  `docs/runbooks/pre-viral-push-checklist.md`, `docs/roadmap-to-launch.md`.
- **API (AC4):** `apps/api/src/services/report.service.ts` (+ its tests); optionally one script under
  `apps/api/scripts/`.
- **API + web (AC7, gated):** a public route in `apps/api/src/routes/registration.routes.ts` plus its
  controller; `apps/web/src/features/registration/pages/WizardPage.tsx` (`CompletionScreen`).

### References

- [Source: `apps/web/src/features/registration/lib/attribution.ts:12,15,26-36,165,172-183`] — flag, the
  "no sub-picker" note, the channel list, the allow-list, the bare `?ref` read
- [Source: `apps/web/src/features/registration/pages/WizardPage.tsx:142-146,168-176,640-649,780`] — the ONLY
  `parseUtm` call site; the completion-data shape; the inline completion screen
- [Source: `apps/api/src/controllers/registration.controller.ts:141-159,1097`] — `buildCampaignSource`'s
  channel-**OR**-utm rule, and the spread into `raw_data`
- [Source: `apps/api/src/services/report.service.ts:86-97,133`] — the channel-only breakdown, and the only
  other UTM read
- [Source: `apps/web/src/features/auth/pages/MagicLinkLandingPage.tsx:291-303`] — 13-9 AC1's forward and its
  "one-way door" reasoning
- [Source: `apps/web/src/features/home/sections/HeroSection.tsx:30`,
  `apps/web/src/features/home/sections/FinalCtaSection.tsx:26`,
  `apps/web/src/layouts/components/SmartCta.tsx:91`] — bare `to="/register"`, no query forwarding
- [Source: `apps/web/src/features/registration/pages/Step5ReviewAndSave.tsx:89-108,246-300`] — the dropped
  nudge and the shipped prominence
- [Source: `apps/web/src/features/registration/pages/RegistrationCompletePage.tsx:46-49`] — the wizard never
  navigates here
- [Source: `apps/api/src/routes/registration.routes.ts:72-78`] — the `POST /wizard` limiter chain
- [Source: `docs/runbooks/13-3-cutover-and-failover.md:13-25,51-101,84,117-124`] — the Cloudflare rule
  recipe, the discharged AC9 run, the vanity-link note, the `answered_rate` query
- [Source: `docs/roadmap-to-launch.md:107,115-124`] — 11 stations; the paid-spend pre-flight gate
- [Source: `docs/launch-campaign/attribution-spec.md:13-38,54`] — the specified-but-unbuilt `station` key
- [Source: `_bmad-output/implementation-artifacts/13-46-public-burst-readiness-send-caps-and-registration-throttle.md`
  § Residual ledger] — R1 (nudge dropped), R2, R3, R5 (teardown chain)

## Dev Agent Record

### Context Reference

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Change | By |
|------|--------|-----|
| 2026-08-21 | **Story drafted**, carving 13-46 residuals **R3** (High, hard-deadlined) and **R2** (Med, evidence-triggered) into ONE story, because both answer "how does the radio campaign get measured?" and splitting them risks shipping the weaker half alone — R2 has code and no deadline, R3 has a deadline nobody can move. **Two corrections found while verifying R3's premise against the tree, both material:** (i) 🔴 the residual's redirect target `/?ref=fresh` **captures nothing** — `parseUtm` is called from exactly one place (`WizardPage.tsx:172`, mounted at `/register`) and every homepage CTA is a bare `<Link to="/register">` that drops the query string, so the tag dies at the first click; the fix is `/register?ref=<slug>`, still zero code, and it is the same class 13-9 AC1 already fixed on the `/auth/magic` hop with the comment *"the hop drops the params … the one-way door"*. (ii) 🔴 `getCampaignBreakdown` groups ONLY on `channel` and coalesces NULL to `(unknown)` (`report.service.ts:89`), so all 11 stations collapse into one row for any listener who skips the question — **and the function has zero callers anywhere in `apps/`**, the `getCampaignFunnel` shape 13-44 exists to fix. Without (i) the rules would have been live, verified-as-redirecting and silently attributing nothing; without (ii) the data would land unreadable. Ordering inside the story follows a stated asymmetry — **capture is perishable, reporting is not** — so AC1-AC3 are deadline-bound and zero code while AC4 may follow. 7 ACs / 6 Tasks. **AC7 is written as a LOCK**: it may not start until AC6's `answered_rate` figure (public rows only, with its `n`) is recorded in the Dev Agent Record, and if prominence moved the rate AC7 is discharged by NOT building it. The dropped submit-time nudge is recorded with Awwal's 2026-08-21 reasoning (asymmetric risk: a lost registration is permanent and costs a citizen 10-15 minutes; an unanswered question costs one data point). Status `ready-for-dev`. | Bob (SM) |
