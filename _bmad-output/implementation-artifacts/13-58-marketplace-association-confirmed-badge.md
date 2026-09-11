# Story 13.58: "[Association] — confirmed member" badge (two-tier trust provenance)

Status: review

<!-- CARVED OUT of 13-38 on 2026-08-09 at adjudication. 13-38 bundled a card REDESIGN (shippable
now, 224 live cards) with an association BADGE that renders for nobody, because `imported_association`
has ZERO rows on prod and its producer, Story 13-2, is still `ready-for-dev`. Splitting releases the
redesign. 13-38 KEEPS the redesign — the design file is `docs/design/marketplace-card-13-38.html` and
a mockup named after a story that no longer owns it is the record-vs-artifact drift of §2w. -->

## Story

As **an employer browsing the skills marketplace**,
I want **to see when a worker was confirmed as a member by a named trade association**,
so that **I can trust an association-vouched worker — and the platform discloses precisely what it
knows instead of overstating "verified" or hiding accountable members entirely.**

## Context

Awwal's 2026-07-19 ruling (13-2 DECISION block): association imports arrive through an accountable
source — a named head, mandatory phone, usually a NIN — so they belong in the marketplace **with a
disclosure badge**, not excluded behind a blunt `unverified_import` gate.

**Two tiers**, mapping to Axis-3 of the registry data-status taxonomy:
- **Tier 1 — association-confirmed** (`source = imported_association`, not yet member-confirmed):
  **"[Association] — confirmed member"**
- **Tier 2 — member-verified** (a member-side check fired — SMS reply once Termii clears, or a
  sampled Assessor callback): **"Member-verified"**

⚠️ **HONESTY DISCIPLINE (R1 — LOCKED).** There is **no NIMC/identity-validation path**. A present NIN
is `nin_on_file`, and for imports it was **proxy-transcribed by the head**. The badge must NEVER read
a bare "✓ Verified" implying government-grade proofing — overstating burns the association's
credibility along with ours. Attributing the claim to a named body is both honest and a *stronger*
signal.

## ⛔ Gate — do not start this before 13-2 **and 13-67**

Measured 2026-08-09 on prod: `SELECT source, count(*) FROM respondents` returns **`public 314`,
`enumerator 1`** and nothing else. **`imported_association` does not exist yet.** 13-2 owns the WRITE
side (`source`, the association name, the member-confirmed flag) and is `ready-for-dev`.

Built before 13-2, every AC here renders for **zero people** and cannot be verified against real data.
That is not a scheduling preference — it is the difference between a testable story and a hopeful one.

> ### 📌 UPDATE 2026-09-06 — where the name actually lives (re-pointed by 13-67's code review)
>
> The paragraph above is now **stale in two ways**, and both would send a dev to the wrong place:
>
> 1. **13-2 does NOT own the association name.** 13-2 shipped the channel and is live on prod
>    (8,278 rows). The stored name is **Story 13-67**'s, and it is:
>    - `respondents.metadata.association_name` — **the read path for AC1**. Exposed by
>      `registry_unified` as part of `metadata` (`registry-unified.sql.ts:123` is `r.metadata`), so
>      the badge needs **no join and no view change**; `import_batch_id` is deliberately NOT exposed.
>    - `import_batches.association_name` — the operator-facing source of truth, returned by
>      `GET /api/v1/admin/imports` and `GET /:id`. **Do not read this one for the badge.**
>    - Values on prod after the backfill: **ASNAT** (batch `01a071c8…`, 56) and **AFAN**
>      (`01a072ae…`, 8,222). ⚠️ The backfill is an operator one-shot and, as of 2026-09-06, **has
>      not been run** — see `docs/runbooks/backfill-operator-residuals.md` §A. Until it runs, the
>      key is absent on every live row and AC1's degrade path is all you will see.
>    - **Absence is meaningful**: no key ⇒ render AC1's *"Trade association — confirmed member"*.
>      NEVER fall back to `import_batches.source_description` — it is an operator note that reads
>      *"ASNAT Tiler Association (Oyo State) - WhatsApp intake, 56 clean rows of 70…"*.
> 2. **There is no member-confirmed flag anywhere.** No column, no SMS confirmation loop (Termii is
>    not cleared), no Assessor callback queue. **AC2's tier-2 has no substrate** and 13-67 put
>    building one explicitly out of scope. Do not derive it in the badge; a tier that cannot be
>    earned is a badge that never changes. Either carve the substrate as its own story first, or
>    ship AC1/AC3/AC4/AC5 and leave AC2 open.
>
> Ordering is unchanged and still binding: **13-67 → this story → open `PIPELINE_EXCLUDED_STATUSES`**
> (13-2 R-A2). Reversed, 8,278 people appear on marketplace cards as ordinary verified listings.
>
> ### ⛔ AC4 CONFLICTS WITH AWWAL'S RULING OF 2026-09-07 — read before implementing AC4
>
> AC4 as written says the badge renders **"ONLY for association sources — never for `public` /
> `enumerator` / `clerk` / `imported_other`"**. On 2026-09-07 Awwal ruled that the association's
> vouch **also attaches to the ELEVEN people the AFAN import MATCHED** rather than inserted — people who
> had already registered themselves and whose `source` is therefore **`public`**, not
> `imported_association`. 13-67 R2 has written `metadata.association_name` (plus
> `association_vouched_by_batch_id`) onto exactly those rows.
>
> **So a source-keyed condition renders nothing for them, and the ruling is silently unimplemented**
> — this project's most-repeated defect, a fix that never fires.
>
> The condition AC4 needs is **the presence of the stored name**, not the source:
>
> ```ts
> // right: the badge asserts a NAMED BODY vouched. The name IS the precondition.
> const association = respondent.metadata?.association_name;   // via registry_unified.metadata
> if (association) renderTier1(association);
> ```
>
> AC4's RED-verify still holds and gets STRONGER: a `public` respondent **with no
> `association_name`** must render no badge — which is every public respondent except these 12.
> Assert it on a `public` row that HAS the key too, or the test passes over the ruling.
>
> ⚠️ This is a real AC change and it is **Awwal's to confirm at build time**, not the badge dev's to
> assume. Flagged here rather than edited into AC4 silently.

## 🔌 The plumbing does NOT exist — scoped at adjudication 2026-09-08

⛔ **This is not a badge component. It is four layers, and the badge is the last one.** Measured on
prod today, so nobody re-derives it:

| what | state |
|---|---|
| `respondents.metadata.association_name` | ✅ **populated** — AFAN 8,233, ASNAT 56 (13-67, deploy `9e8235b`) |
| `marketplace_profiles` association column | ❌ **does not exist** |
| `marketplace-extraction.worker.ts` reading `respondents.metadata` | ❌ **never does** |
| `associationName` in the marketplace service / controller | ❌ **appears nowhere** |

So the name is on the respondent and the marketplace reads the PROFILE. **Nothing connects them.**

### The four layers, in the order they must be built

1. **Extraction** — carry `metadata.association_name` onto the profile as it is built.
   `verifiedBadge` (`marketplace.schema:55`) is the existing shape to follow: a column on
   `marketplace_profiles`, set at extraction, read by the service.
2. **API** — expose it in the search and profile responses. `verifiedBadge` shows the path
   (`marketplace.service.ts:193, 270`).
3. **UI** — the badge, beside `GovernmentVerifiedBadge` in `WorkerCard` and
   `MarketplaceProfilePage`, keyed on **`association_name` presence** (AC4 as corrected).
4. **THEN** open `PIPELINE_EXCLUDED_STATUSES` — 13-2 R-A2, and only after 1–3 are live.

### ⛔ THE SEQUENCING RISK, stated because the obvious plan gets it wrong

The intuitive order is *"open the gate, then build the badge"*. **That costs a second production
backfill.** The 8,278 imported respondents have **no marketplace profile at all** today — extraction
skips them by status. Whenever extraction does run for them, if it is not yet carrying
`association_name`, they materialise badge-less and need a second backfill over live rows to repair.

**Extraction must carry the name BEFORE any imported respondent is extracted.** That ordering is
what this story buys, and it holds regardless of how layer 4 is eventually built.

> ### ⛔ [AI-Review][High] 2026-09-08 — LAYER 4 IS NOT ONE CONSTANT. Measured, not assumed.
>
> This section used to read *"The moment the gate opens, extraction runs and **creates 8,278
> profiles**"*, and that sentence was copied into the worker tests, the backfill service docstring
> and the operator script header. **It is false, and the next story would have acted on it.**
>
> **Opening `PIPELINE_EXCLUDED_STATUSES` alone creates ZERO profiles.** The status gate
> (`marketplace-extraction.worker.ts:211`) is the *defensive second* gate. The primary one is
> by-construction, and the worker says so itself at `:206-210`: *"the import service never enqueues
> this worker."*
>
> | link in the chain | state |
> |---|---|
> | `import.service.ts` enqueues marketplace-extraction | ❌ **no reference to the queue at all** |
> | only production enqueue | `submission-processing.service.ts:1349-1353`, which the importer never calls |
> | `_backfill-marketplace-extraction.ts` (the operator's create-profiles script) | ⛔ scoped `WHERE r.source = 'public'` (`:126-140`) — it would skip every imported row |
> | imported respondents have a `submissions` row to extract from | ✅ yes, since 13-2 AC3.4 (`import.service.ts:574-617`) — so the raw material exists |
>
> So layer 4 is **a gate change PLUS an enqueue path** (widen the extraction backfill script's
> `source` predicate, or enqueue at import). Recorded as **R7**. The good news: the chain being
> broken means there is no race to lose — nothing can create a badge-less profile behind our backs
> while this ships.
>
> ⭐ Why this matters beyond the fact: the story's own ordering argument was resting on a mechanism
> nobody had traced to where it executes. The ordering **conclusion** survives intact — build the
> badge first — but it survives for a different reason than the one written down, and a plan that is
> right by luck fails the next time it is reused. → [[feedback_verify_against_reality_before_asserting]]

### The number that says why this story matters

| | |
|---|---|
| `marketplace_profiles` today | **295** (of 351 `active` respondents) |
| `imported_unverified` | **8,278** |
| …of those, with a marketplace profile | **0** |
| …of those, with `consent_marketplace = true` | **8,278** |

⭐ **Every one of the 8,278 consented to being listed. Not one is.** This is not a data-quality or
consent problem — the extraction worker checks `PIPELINE_EXCLUDED_STATUSES`, sees
`imported_unverified`, and skips. One constant stands between 8,278 people and an employer finding
them.

## Acceptance Criteria

1. **AC1 — Tier-1 badge.** ⚖️ **AMENDED 2026-09-11 (Awwal's ruling on R3).**

   A card whose respondent carries a non-empty **`metadata.association_name`** and is not yet
   member-confirmed renders **"[Association] — confirmed member"** using that stored name
   (e.g. "ASNAT Tiller Association — confirmed member"). Never blank, never a bare "Verified".

   ~~Name unavailable → degrade to **"Trade association — confirmed member"**.~~

   ⛔ **The degrade path is WITHDRAWN, not unimplemented.** It was written when the badge was keyed
   on `source`, where "row is an association import but has no name" was a reachable state. Under
   AC4-as-corrected the badge keys on the name's PRESENCE, so "vouched but unnamed" is
   inexpressible: no name ⇒ no badge. A fallback string no code path can produce is dead copy, and
   dead copy in an AC is worse than absent — the next reader reads it as a missing feature and
   "fixes" it by re-keying that branch on `source = imported_association`, which re-introduces the
   exact predicate AC4 exists to remove and silently drops the eleven again.

   **Failing closed is the honest behaviour:** with no name we cannot say WHO vouched, so we should
   not imply anyone did. → [[pattern-ship-a-fix-that-never-fires]]
2. **AC2 — Tier-2 upgrade.** On member-side confirmation the card renders **"Member-verified"**. The
   tier derives from the taxonomy's verification substrate — **not** a badge-local re-derivation.
3. **AC3 — Honest disclosure.** No surface reads a bare "✓ Verified" for an association import. A
   tooltip / `aria-label` states the meaning: *"Confirmed as a member by [Association]. Identity not
   independently verified."* Copy owned by Paige.
4. **AC4 — Scoped to association provenance.** ⚠️ **CORRECTED AT ADJUDICATION 2026-09-07 (13-67 R3 — NOT this story's R3, which is AC1's degrade path below).**

   ~~Renders ONLY for association sources — never for `public` / `enumerator` / `clerk` /
   `imported_other`.~~

   **Render on the PRESENCE of `metadata.association_name`, NOT on `source`.** A card shows the
   badge when its respondent carries a non-empty `metadata.association_name`, and shows nothing
   when it does not — whatever the `source` says.

   **Why the original wording had to change.** Awwal ruled on 2026-09-07 that the vouch also
   attaches to the **eleven people the AFAN import MATCHED** rather than inserted. Those people had
   already registered themselves, so their `source` is **`public`** — and 13-67 has written
   `metadata.association_name` onto them. Keyed on `source`, this AC would render those twelve
   nothing, and the ruling would become **a fix that never fires**: the most-repeated defect class
   in this project. → [[pattern-ship-a-fix-that-never-fires]]

   ⭐ **The intent of AC4 is unchanged and is fully preserved: never badge anyone no association
   vouched for.** What changed is the mechanism. `source` was only ever a PROXY for "an association
   vouched"; `metadata.association_name` **IS** the claim the badge makes. A proxy fails in both
   directions, and this one failed in the direction that silently drops real people.
   → [[pattern-predicate-must-be-the-thing-you-mean]]

   **RED-verify, both directions — "no badge appears" is also what a broken conditional produces:**
   - a `public` respondent with **no** `association_name` renders **no** badge; and
   - a `public` respondent **with** `association_name` (one of the 12) renders the badge **with the
     correct body's name**. Assert the second explicitly. It is the case the original AC excluded,
     and a source-keyed implementation passes the first test while failing the people this ruling
     was made for.

   ⚠️ Do NOT also add a `source` check "for safety". It re-introduces exactly the bug, and a card
   that requires both conditions is indistinguishable from a correct one until you look for the
   eleven who are missing.

   > **📐 [AI-Review][Medium] 2026-09-08 — the number is ELEVEN people, not twelve.** This AC said
   > "12" in three places while the dev record and every code comment said "eleven", and R2's
   > predict-then-compare is keyed on it. 13-67 settles it: **12 matched DISPOSITIONS, 11 distinct
   > PEOPLE** — "two different rows in the AFAN sheet matched the SAME existing respondent"
   > (`13-67:477`), and its own phase-2 ledger reads `AFAN (matched) | 11 | 11` (`13-67:451`).
   > A disposition is a sheet row; a person is a respondent. Corrected to eleven throughout, because
   > predicting twelve and measuring eleven would read as a defect in the backfill rather than as
   > two spreadsheet rows naming one man.
5. **AC5 — Coexists with the existing badges.** Slots into the trust hierarchy 13-38 establishes
   (`GovernmentVerifiedBadge` vs association-confirmed vs member-verified) without clutter.
   Colour-blind-safe, legible at grid density.
6. **AC6 — Tests.** ⚖️ **AMENDED 2026-09-11 (Awwal's ruling on R3) — the old wording
   CONTRADICTED AC4-as-corrected and a source-keyed implementation would have PASSED it.**

   Tier-1 with name; tier-2 on confirmation; tooltip/aria present; never emits bare "Verified" for
   an import; and **both directions of AC4's predicate**:
   - a respondent with **no** `association_name` renders **no** badge — *whatever its `source`*; and
   - a **`public`** respondent **with** `association_name` (one of the eleven the AFAN import
     matched) **DOES** render the badge, with the correct body's name.

   ~~no badge for non-association sources~~ — struck because it is false under AC4-as-corrected:
   eleven `public` respondents MUST carry the badge. Left standing, this criterion would have been
   satisfied by the source-keyed build AC4 was corrected to prevent, and failed by the correct one.
   ~~name-missing fallback~~ — struck with AC1's degrade path (R3).

## Tasks / Subtasks

> Authored at the start of the dev session (2026-09-08) from the ACs above and the
> adjudication scoping in **🔌 The plumbing does NOT exist**. The story arrived with ACs
> but no task list. Order is the binding one: **extraction → API → UI**. Layer 4
> (opening `PIPELINE_EXCLUDED_STATUSES`) is **13-2 R-A2 and is NOT in this story** —
> see the sequencing block above for why it must come after, not before.

- [x] **Task 1 — Schema: `marketplace_profiles.association_name`** (AC1, AC4)
  - [x] 1.1 Add a nullable `association_name` text column to `apps/api/src/db/schema/marketplace.ts`,
        following the `verified_badge` shape: set at extraction, read by the service.
  - [x] 1.2 Document on the column that it is denormalised from
        `respondents.metadata.association_name` (13-67) and that its PRESENCE is the badge's
        only precondition — never `source`, never `import_batches.source_description`.
  - [x] 1.3 Respect the drizzle constraint: schema files must NOT import from `@oslsr/types`.

- [x] **Task 2 — Extraction carries the name onto the profile** (AC1, AC4)
  - [x] 2.1 RED: worker tests — (a) respondent metadata carries `association_name` -> the
        upsert values carry it; (b) no key -> `null`; (c) a `source = 'public'` respondent WITH
        the key -> still carried (the worker must have no `source` predicate at all).
  - [x] 2.2 Load `metadata` in the worker's respondent query (it currently selects neither
        `metadata` nor `source`).
  - [x] 2.3 Normalise: trim; blank -> `null`. A whitespace-only name must not reach the card.
  - [x] 2.4 Write it on INSERT and in `onConflictDoUpdate`, applying the ADD-or-CORRECT rule
        the `experienceLevel` review fix established — a re-extraction must never blank a
        stored vouch.
  - [x] 2.5 GREEN: worker tests pass, existing worker tests unbroken.

- [x] **Task 3 — API exposes it in search + profile** (AC1, AC3)
  - [x] 3.1 RED: `marketplace.service` tests asserting `associationName` on a search item and
        on `getProfileById`, plus `null` when the column is null.
  - [x] 3.2 Add `associationName: string | null` to `MarketplaceSearchResultItem` and
        `MarketplaceProfileDetail` in `packages/types/src/marketplace.ts`.
  - [x] 3.3 Select `mp.association_name` in both raw SQL queries and map it. No join to
        `respondents` — that table is PII and is deliberately absent from the public read path.
  - [x] 3.4 GREEN.

- [x] **Task 4 — UI renders the badge** (AC1, AC3, AC4, AC5)
  - [x] 4.1 RED: `AssociationConfirmedBadge` tests — renders `"{name} — confirmed member"`;
        carries the AC3 disclosure text; never emits the bare string `Verified`.
  - [x] 4.2 Build `AssociationConfirmedBadge` beside `GovernmentVerifiedBadge`, with a
        `compact` variant for grid density (AC5) and a palette distinct from the government
        green while staying colour-blind-safe.
  - [x] 4.3 Render it in `WorkerCard`, keyed on `profile.associationName` presence (AC4).
  - [x] 4.4 Render it in `MarketplaceProfilePage`, same key.
  - [x] 4.5 RED-verify AC4 in BOTH directions, as the AC demands: a `public`-source profile
        with NO name renders nothing, and a `public`-source profile WITH a name renders the
        badge carrying that body's name. The second is the case the original AC excluded.
  - [x] 4.6 Assert no surface emits a bare "Verified" for an association row (R1 lock).

- [x] **Task 5 — Repair the profiles that already exist** (AC4, real data)
  - [x] 5.1 Extraction only fires on submission, so the people who already hold a marketplace
        profile never revisit it. Add `association_name` to the existing 13-38 backfill
        (`backfillMarketplaceCardFields`) — the service whose stated job is re-deriving card
        fields existing rows never had. Dry-run default, ADD-or-CORRECT only, `updated_at`
        untouched.
  - [x] 5.2 Tests for the new field in the backfill's unit suite.
  - [x] 5.3 Flag in Completion Notes that this is beyond the four scoped layers, with the
        reason, so it can be stripped at review if Awwal disagrees.

- [x] **Task 6 — Gates** (all ACs)
  - [x] 6.1 `tsc --noEmit` clean for api and web.
  - [x] 6.2 `pnpm lint` — the three drift guards stay green.
  - [x] 6.3 API suite against the TEST database (`NODE_ENV=test`, `.../app_test` — never `app_db`).
  - [x] 6.4 Web suite; quote the SUITE total and the FILE count, never a subset.

### Review Follow-ups (AI) — adversarial code review, 2026-09-08

All ten were raised as action items and then fixed in the same pass, on the uncommitted tree.
Severity order. Each carries the file:line it was found at.

- [x] **[AI-Review][High] H1 — a bare "verified" claim over the whole grid.**
      `MarketplaceSearchPage.tsx:98` read *"Find **verified** skilled workers in Oyo State"* — the
      first line an employer reads, directly above the cards. AC3 forbids ANY surface making that
      claim for an association import, and 8,278 such people are queued behind the gate. The
      badge-level R1 tests are scoped to a card and could never see a claim the page makes around
      them. **Fixed:** copy is now *"Find skilled workers in Oyo State"*; the trust claim lives only
      on badges that name their own authority. Pinned by a new page-level R1 test.
- [x] **[AI-Review][High] H2 — the catch-up silently dropped the vouch for answer-less rows.**
      `marketplace-card-backfill.service.ts:207-212` did `if (!answers) { noAnswerSource++;
      continue; }` **above** the association block — but the vouch is read from
      `r.metadata->>'association_name'` and has no dependence on answers. Worse than skipped:
      **uncounted**, so the operator's dry-run printed `association_name add/fixed 0` and read as a
      clean sweep — and R2's predict-then-compare would have confirmed a prediction of zero.
      Verified by probe before fixing: `associationNameChanged 0, updated 0, noAnswerSource 1` with
      `AFAN` sitting on the respondent. These rows are real — the importer wrote only the respondent
      until 13-2 AC3.4 (`import.service.ts:555-573`). **Fixed:** the vouch is computed above the
      guard; every 13-38 counter is unchanged; two tests added.
- [x] **[AI-Review][High] H3 — the sequencing rationale was false** (story `:128-133`, copied into
      `worker.test.ts:688-692`, the backfill docstring and the script header). "The moment the gate
      opens, extraction creates 8,278 profiles" is not what the code does: the import path never
      enqueues the worker, so opening `PIPELINE_EXCLUDED_STATUSES` alone creates **zero** profiles.
      **Fixed:** corrected in all four places with the evidence, and carved as **R7**. The ordering
      conclusion stands; its stated reason did not.
- [x] **[AI-Review][High] H5 — the R1 sweep: the SAME false claim, live on two public pages,
      and PINNED BY TESTS.** Raised after H1 as "grep for other blanket trust language"; Awwal ruled
      **fix everything now, in this story** (2026-09-09). What the sweep found was not more page
      chrome — it was the identity claim itself:
      - `VerifyWorkerPage.tsx:9-13` — under **"What Verification Confirms"**: *"NIN (National
        Identification Number) has been validated"* and *"Worker's identity has been confirmed by
        the government"*.
      - `GuideVerifyWorkerPage.tsx:68-71` — under a green tick reading **"What It DOES Confirm"**:
        *"NIN has been validated"*, *"Identity verified by government"*. Plus `:25`, `:102`
        (*"identity has been confirmed through NIN verification"*) and `:124`.

      **This is verbatim the claim `GovernmentVerifiedBadge` was corrected away from on 2026-08-18**
      — its own comment says *"this panel used to read 'NIN validated and identity confirmed'. It is
      not true and it is the exact claim the R1 honesty discipline forbids."* The badge was fixed;
      these two were never swept. NIN validation is FORMAT-ONLY and there is no NIMC path, so all of
      it was false for three weeks on public pages — and about to get worse, since for 8,278
      incoming association rows the NIN was **proxy-transcribed by the association head**.

      ⭐ **And the lie was GUARDED.** `VerifyWorkerPage.test.tsx:87-88` and
      `GuideVerifyWorkerPage.test.tsx:37` asserted the false strings word for word. A green suite
      made the claim look deliberate, and anyone who fixed the page would have been met by a failing
      test telling them to put it back. **A test can lock in a falsehood, and then the falsehood has
      a defender.** → [[pattern-test-that-passes-over-a-hole]]

      **Fixed at the SOURCE, not in three places.** Three copies of one claim, one of them
      corrected, is a missing canonical source — so `apps/web/src/lib/trust-claims.ts` now holds
      `GOVERNMENT_VERIFICATION_MEANS` / `..._DOES_NOT_MEAN`, and the badge plus both support pages
      render those. ⚠️ The strings are **byte-identical to the wording already ruled correct on the
      badge** — nothing was reworded while being extracted (a copy change and a de-duplication in
      one commit destroys the ability to tell which one broke something), so the badge's 13 tests
      pass untouched. Also fixed: `GuidesPage.tsx:49`, `GuideVerifyWorkerPage.tsx:33`/`:38`
      (H1's marketplace claim on other pages) and the two "registered and verified" straplines.
      → [[feedback_canonical_primitive_backlog_sweep]]

      **Guarded going forward** by `FORBIDDEN_IDENTITY_CLAIMS` (patterns, not exact strings — the
      three that shipped were three phrasings of one idea) plus `trust-claims.test.ts`, which
      **RED-verifies the guard itself** against the three strings that really shipped and asserts it
      does *not* flag the honest replacements. Both support pages now also assert their own rendered
      output is clean.
- [x] **[AI-Review][High] H4 — a gate recorded as green was RED.** The story's gate table claimed
      `pnpm --filter @oslsr/web lint` was clean. It **failed**:
      `WorkerCard.test.tsx:329` asserted `badge.querySelector('.truncate')`, an eslint **error**
      under Team Agreement A3 (no CSS class/id selectors in tests). The line is this story's own —
      it arrived with the +6 WorkerCard tests. Found only because the review re-ran the gates
      instead of reading the table; the api lint was run and the web lint was not, and both were
      reported. **Fixed:** the truncating label carries a test id and the assertion is
      `toHaveClass('truncate')` on it, so the check survives a class rename. `pnpm --filter
      @oslsr/web lint` now exits 0. → [[pattern-a-record-about-the-work-is-not-the-work]]
- [x] **[AI-Review][Medium] M1 — the AC3 disclosure was never announced.**
      `AssociationConfirmedBadge.tsx:66-69` put `aria-label` on a bare `<span>` (role=generic),
      where ARIA does not permit an accessible name — assistive tech ignores it, and `title` is
      mouse-only. On the browse grid, the primary surface, a screen-reader user got
      "AFAN — confirmed member" and none of the "identity not independently verified" half: the R1
      overstatement, aimed at the readers least able to check it. The existing test asserted the
      attribute EXISTS, not that it is announceable — a test that passes over the hole.
      **Fixed:** `role="img"`; pinned by an accessible-name query, not an attribute check.
- [x] **[AI-Review][Medium] M2 — no test used the cohort's own status.** Every association worker
      test seeds `status: 'active'`; the cohort is `imported_unverified`, which returns at the gate
      (`worker.ts:211`) before the derivation at `:249` is reached. The single claim this story's
      ordering rests on was unpinned. **Fixed:** new
      `marketplace-extraction.worker.gate-open.test.ts` opens the gate in a module mock and asserts
      the name is carried for an `imported_unverified` respondent — plus its discriminating twin,
      plus a third test asserting the REAL constant is still closed, so the file cannot be misread
      as evidence the gate is open.
- [x] **[AI-Review][Medium] M3 — File List omitted a changed file.**
      `packages/types/src/__tests__/marketplace.test.ts` (+40, 4 tests) was modified but undocumented.
      **Fixed** below.
- [x] **[AI-Review][Medium] M4 — "12" vs "eleven".** AC4 said 12 people in three places; the dev
      record and every code comment said eleven. 13-67 settles it — 12 dispositions, 11 people
      (`13-67:451`, `:477`). **Fixed:** corrected to eleven, with the disposition-vs-person
      distinction recorded in AC4 so R2 predicts the right number.
- [x] **[AI-Review][Low] L1 —** `MarketplaceProfilePage.tsx:236` rendered an empty flex container
      when neither badge applied. **Fixed:** wrapper is conditional.
- [x] **[AI-Review][Low] L2 — a vacuous assertion.** `expect(updateSql).toContain('association_name')`
      passes unconditionally: the UPDATE names all three columns on every write. **Fixed:** asserts
      the serialised statement carries the PRESERVED bound values (`over_10`, `Bola Motors`), which
      is the actual no-blanking claim.
- [x] **[AI-Review][Low] L3 — an over-broad R1 guard.** `WorkerCard.test.tsx` matched
      `/\bverified\b/i` across the whole card, so unrelated copy (a bio, a future strapline) would
      red it — the same trap the dev had already fixed on the profile page and left here.
      **Fixed:** rescoped to the trust claim, matching its page-level twin.

### Review Follow-ups (AI) — R1 sweep ROUND THREE + the guard's own defect, 2026-09-11

Raised and fixed while closing out the review before adjudication. Round 2 (2026-09-09) fixed two
pages and shipped a guard; **round 3 found five more live pages the guard could not see.**

- [x] **[AI-Review][High] H6 — the sweep ruled complete on 2026-09-09 was not complete. FIVE more
      public surfaces carried the same false claim**, none of them touched by round 2:
      - `FAQPage.tsx:61` — *"your identity has been confirmed through NIN verification by the Oyo
        State government"*, in the answer to the question **"What does 'Government Verified' mean?"**
        — the page a worker reads to find out precisely this.
      - `GuideSearchMarketplacePage.tsx:76` — *"their NIN has been validated and identity confirmed"*.
      - `EmployersPage.tsx:71-85` — **two local arrays** with the badge's exact MEANS /
        DOES-NOT-MEAN shape. The "means" half was false (*'Identity confirmed through NIN
        verification'*, *'Badge indicates trustworthy identity'*); the "does NOT mean" half was
        **worse by omission** — it listed skill, work-history and due-diligence caveats and **never
        said the identity was unconfirmed**, which is the one line that makes the other half honest.
        Plus an FAQ answer at `:109` (*"their NIN was verified"*).
      - `WorkersPage.tsx:191-194` — told **workers themselves** that the badge means *"your identity
        has been confirmed through NIN verification"*.
      - `PrivacyPage.tsx:18` — *"Your NIN is verified locally"*. "Verified" overstates a `^\d{11}$`
        format check.

      **Fixed.** `EmployersPage` now renders the canonical `GOVERNMENT_VERIFICATION_MEANS` /
      `..._DOES_NOT_MEAN` instead of its own copies — it had the same shape as the badge, so it
      should never have held its own list. The other four are prose and were rewritten against
      `lib/trust-claims.ts`, with the NIMC sentence **byte-identical** to
      `GOVERNMENT_VERIFICATION_DOES_NOT_MEAN[0]`.
- [x] **[AI-Review][High] H7 — a THIRD test pinning the false claim.**
      `EmployersPage.test.tsx:62` asserted *'Identity confirmed through NIN verification'* word for
      word, exactly as `VerifyWorkerPage.test.tsx` and `GuideVerifyWorkerPage.test.tsx` did in round
      2. Three instances of one shape in one story. **Fixed:** the test now iterates the canonical
      arrays, so it cannot disagree with the badge about what the platform checks, plus a new
      page-level `FORBIDDEN_IDENTITY_CLAIMS` assertion. → [[pattern-test-that-passes-over-a-hole]]
- [x] **[AI-Review][High] H8 — the guard flagged the story's OWN honest copy.**
      `FORBIDDEN_IDENTITY_CLAIMS[1]` excused a negation only AFTER the verb
      (`(?![^.]{0,40}\bnot\b)`), so it matched **"Identity not independently verified"** — AC3's
      disclosure, the exact string this story shipped to make the badge honest. **Per-page scoping
      hid it:** neither page the guard was wired into renders that string, so it surfaced only when
      the scan went app-wide. A guard that reds on correct copy gets deleted, not obeyed.
      **Fixed:** a negation is now excused on **both** sides of the verb.
- [x] **[AI-Review][Medium] M5 — the guard policed where the fix landed, not where the claim lives.**
      `FORBIDDEN_IDENTITY_CLAIMS` was imported by exactly the two test files for the two pages just
      fixed — a census of **sites**, not of **callers** — so five untouched pages walked straight
      through it, and any page added later would too.
      → [[pattern-census-counts-sites-not-callers]]
      **Fixed:** new `apps/web/src/lib/__tests__/trust-claims.app-wide.test.ts` walks every
      `.ts`/`.tsx` under `apps/web/src`, strips comments (the fixes deliberately quote the false
      strings to explain them) and fails with `file:line`. It needs no cooperation from new code.
      **A source scan, deliberately:** round 3 was hiding in an FAQ data array and two `const`
      lists — string literals no render test was looking at.
      **RED-VERIFIED three ways:** a planted breach
      (`export const BAIT = 'Identity verified by government'`) produced two `file:line` hits and
      went away when removed — proving the *walk* runs, not merely the patterns; the comment
      stripper is asserted not to blind the scan to real code on the same line; and the honest
      replacements, including `Identity not independently verified`, are asserted **not** flagged.
      The allowlist is four files, each carrying a stated reason.
- [x] **[AI-Review][Medium] M6 — R3 RULED (Awwal, 2026-09-11): withdraw AC1's degrade path** —
      **and the ruling moved the ACs, not just the ledger.** AC1 re-keyed onto the name's presence
      with the dead fallback struck and the reason recorded, so nobody "restores" it by re-keying on
      `source`. **AC6 corrected:** it required *"no badge for non-association sources"*, which
      **contradicted AC4-as-corrected** — eleven `public` respondents must carry the badge — and
      would have been **passed by the source-keyed build AC4 exists to prevent, and failed by the
      correct one.** No code change: the shipped behaviour was already right. An AC left
      contradicting the code is how 13-2's AC3.3 went wrong — the AC wins, because the AC is the
      checkable artefact.
- [x] **[AI-Review][Medium] M7 — 13-2's R-A2 carried an instruction that would not have worked**,
      and being another story's, it could not wait for adjudication. Its trigger read *"ship 13-58,
      then remove `imported_unverified` from the gate"* — **one line**. H3 proved that alone creates
      **zero** profiles. **Corrected IN PLACE, not footnoted** (a stale instruction beside a correct
      note loses to the instruction): R-A2 now reads explicitly **(a)** the gate change **and (b)**
      widening `_backfill-marketplace-extraction.ts`'s `source` predicate, carrying Awwal's
      2026-09-09 mechanism ruling and a predict-then-compare. Mirrored on its `sprint-status` entry
      and 13-2's Change Log.
- [x] **[AI-Review][Low] L4 — two stale cross-references.** AC4's *"CORRECTED AT ADJUDICATION
      2026-09-07 (R3)"* meant **13-67's** R3, while this story's R3 is AC1's degrade path — two
      different residuals, both about AC1/AC4. Disambiguated. And 13-67's cold-start banner still
      told a cold reader that **R1 and R3 were "still open"** after the story went `done` and both
      had closed — corrected with a dated note.
      → [[pattern-a-record-about-the-work-is-not-the-work]]

## Dependencies

- **HARD: Story 13-2** — persists `source = imported_association`, the association/guild name, and the
  member-confirmed flag. Confirm the exact field locations with 13-2 before building; do not
  re-derive verification badge-locally.
- **SOFT: Story 13-38** — the card redesign and the shared `TrustBadge` primitive this reuses. If
  13-38 lands first (it should — it is unblocked), this is a slot-in.

## Dev Agent Record

### Context

Dev session 2026-09-08 (Amelia, BMAD dev-story). The story arrived with ACs and the
2026-09-08 adjudication scoping but **no Tasks/Subtasks** — those were authored at the
top of this session from the ACs and are recorded above.

### What was built — the four layers, minus the one that is not mine

| layer | state |
|---|---|
| 1. Extraction carries `metadata.association_name` onto the profile | ✅ shipped |
| 2. API exposes it in search + profile detail | ✅ shipped |
| 3. UI renders the badge on card + profile page | ✅ shipped |
| 4. Open `PIPELINE_EXCLUDED_STATUSES` | ⛔ **NOT DONE — deliberately.** 13-2 R-A2, after this ships. `PIPELINE_EXCLUDED_STATUSES` is untouched; `git diff` on `respondents.ts` is empty. |

### The two ACs that did not ship as written, and why

- **AC2 (tier-2 "Member-verified") is OUT, left open.** There is no `member_confirmed`
  column, no SMS confirmation loop (Termii is not cleared) and no Assessor callback
  queue. A tier that cannot be earned is a badge that never changes. Not faked, not
  derived badge-locally, not quietly dropped — the AC stays open and the existing
  WorkerCard test still asserts `Member-verified` never renders.
- **AC1's degrade path ("Trade association — confirmed member") is now UNREACHABLE.**
  ⚖️ **RULED 2026-09-11 (Awwal): withdraw it** — struck from AC1, and AC6 corrected with it.
  The paragraph below is the dev's original framing, kept because it is the reasoning the
  ruling accepted. AC1 was written when the badge was keyed on `source`, so
  "row is an association import but has no name" was a real state. AC4-as-corrected
  keys the badge on the PRESENCE of the name, which makes "vouched but unnamed"
  inexpressible: no name ⇒ no badge. I implemented AC4 as corrected (it is the later
  ruling, and Awwal's dev brief restates it), rather than carry a fallback string no
  code path can reach. **Awwal's to confirm** — the alternative is to re-key the
  degrade path on `source = imported_association`, which re-introduces the source
  predicate AC4 exists to remove.

### RED-verified, both directions (AC4)

Every test below was watched to FAIL before the implementation existed:

- worker: 8 new tests failed (8 failed / 45 passed) before the worker change, 53/53 after.
- service: 3 new tests failed before the SELECT change, 61/61 after.
- badge component: the file failed to load (component did not exist), 6/6 after.
- card + page: 2 and 4 new tests failed respectively, 28/28 and 47/47 after.

The discriminating case is asserted on **all three** surfaces (worker, card, page): a
`source = 'public'` respondent **carrying** `association_name` renders the badge with
the correct body's name. Its negative twin — a `public` respondent with **no** name
renders nothing — is asserted beside it, because "no badge appeared" is also what a
broken conditional produces and the negative alone proves nothing.

The real-DB smoke seeds that person as `source: 'public'` **on purpose**, and the seed
carries a comment saying so: a source-keyed implementation passes every other test in
that file while rendering the eleven nothing.

### Beyond the four scoped layers — one addition, flagged for review

**Task 5 (`association_name` added to `backfillMarketplaceCardFields`) was not in the
brief.** I added it and am flagging it rather than burying it, because without it AC4
is a fix that never fires for everyone who exists today:

- the extraction worker is the go-forward write path, but it only runs on a submission;
- a respondent who **already holds** a marketplace profile never revisits it;
- on prod that is exactly the eleven people the AFAN import MATCHED — the vouch is on
  their respondent row (13-67) and their card would stay badge-less;
- the 8,278 imported respondents are unaffected either way: they have no profile at
  all, so extraction creates theirs carrying the name whenever the gate opens.

It reuses the existing 13-38 service and its existing operator script — no new script,
no new runbook entry — is dry-run by default, is ADD-or-CORRECT only, and leaves
`updated_at` untouched so a repair cannot reorder the public browse. **Revert it if you
disagree**; the four layers stand without it.

### Two of my own tests were wrong before they were right

Recorded because both are the shapes this project keeps catching:

1. **A guard that could not tell a comment from a clause.** `expect(sql).not.toContain('respondents')` red on a CORRECT query,
   because my own SQL comment explained why the query does not join that table. Fixed
   by rewording the comment, not by weakening the assertion — the blunt guard is worth
   more than the prose. The same trap hit the backfill's SELECT comment minutes later.
2. **An R1 assertion scoped to the whole page.** `document.body.textContent` matched
   "registered users who have **verified** their identity" — copy about the VIEWER's
   account, nothing to do with what the platform claims about the worker. Rescoped to
   the trust claim itself. Left body-wide it would have taught the next dev to delete
   the guard rather than trust it.

Also: two fixtures in the backfill tests let a *different* field drive the update, so
they would have passed while proving nothing about the vouch. Pinned.

### Gate results (measured 2026-09-08, this session)

| gate | result |
|---|---|
| `tsc --noEmit` — `packages/types` | **0 errors** |
| `tsc --noEmit` — `apps/api` | **0 errors** |
| `tsc --noEmit` — `apps/web` | **0 errors** |
| `pnpm --filter @oslsr/api lint` | eslint clean; **registry-read 403 / respondent-write 403 / story-residual 322** — all three drift guards green |
| `pnpm --filter @oslsr/web lint` | ❌ **recorded as "clean" here, but it was RED** — `WorkerCard.test.tsx:329` used a CSS class selector (Team Agreement A3). Found by the reviewer re-running it; fixed at review ([AI-Review] H4). **Green now.** |
| API suite (`NODE_ENV=test`, `…/app_test`) | **311 files — 309 passed, 2 skipped; 4,414 tests — 4,405 passed, 9 skipped. exit 0** |
| Web suite (`cd apps/web && pnpm vitest run`) | **277 files passed; 3,073 tests — 3,071 passed, 2 todo. exit 0** |
| `packages/types` suite | **7 files, 117 passed** |

Suites were run **sequentially, never via turbo** — `turbo run test` runs api and web
vitest concurrently and this machine had only ~2.0 GB free (Firefox holding 3.0 GB
across 29 processes). Free RAM dipped to **1.72 GB** during the API run, inside the
band that has produced false reds here before, so the result was checked for the
contention tell rather than taken at face value: the web run **collected 277 files**,
above the ~273 baseline, and a contended collection under-collects. Both suites are
honest greens.

Per-file confirmation that this story's own files ran inside the full suite (not just
standalone): `MarketplaceProfilePage.test.tsx` 47, `WorkerCard.test.tsx` 29,
`AssociationConfirmedBadge.test.tsx` 6.

⚠️ One comment-only edit (a phrasing fix in a `packages/types` docstring) landed after
the web suite started. No behavioural change; the `packages/types` suite was run after it.

### Reviewer's own gate run (2026-09-08 → 09, adversarial code review)

Re-measured rather than read off the table above — which is how H4 was found.

| gate | reviewer's result |
|---|---|
| `tsc --noEmit` — types / api / web | **0 / 0 / 0** |
| `pnpm --filter @oslsr/api lint` | eslint clean; **registry-read 403 / respondent-write 403 / story-residual 322** — three drift guards green |
| `pnpm --filter @oslsr/web lint` | **was RED** (H4), **now exit 0** |
| Story's API tests vs `…/app_test` | **164 passed / 5 files** — worker 53, gate-open 3 (new), service 61, backfill 33, real-DB smoke 14 (ran, not skipped) |
| `apps/web` marketplace slice | **150 passed / 9 files** ⚠️ a SUBSET, not the web suite — full totals below |
| **FULL API suite** vs `…/app_test` | **312 files (310 passed, 2 skipped); 4,419 tests — 4,411 passed, 8 skipped.** Exactly **+1 file and +5 tests** over the dev's run: the new gate-open file (3) and the two H2 tests. ✅ |
| **FULL web suite** (pre-sweep) | **277 files; 3,075 tests** — 3,072 passed, 1 known flake, 2 todo. Exactly **+2 tests** over the dev's run (the H1 and M1 guards). File count **277 = the dev's 277**, above the ~273 contended-collection baseline, so neither run under-collected. ✅ |
| **FULL web suite** (after H5's copy sweep, final) | **278 files; 3,082 tests — 3,080 passed, 2 todo, ZERO failures.** **+1 file / +7 tests** over the previous run: `trust-claims.test.ts` (5) plus the two per-page R1 guards. ⭐ The `route-resolution` flake **did not recur** in this run, which is the second independent confirmation that it was environmental. ✅ |
| RED-verify | H1 and M1 reverted one at a time; their new tests went red, then green on restore. H2 proven red by probe before the fix. |

⚠️ **Both suites were run in FOUR SHARDS** (`vitest run --shard=n/4`), api then web, never concurrently
and never via turbo. Not a preference: two unsharded attempts were killed at exactly 600 s by the
runner's execution cap, mid-run, on passing lines. **A truncated run is not a red** — it has no
summary line at all, and reading one as a failure is how a green tree gets debugged for an hour.

🔁 **One web failure, chased rather than waved off:** `route-resolution.integration.test.tsx >
resolves an unknown path to the NotFound` failed in shard 2 and **passed 58/58 in isolation** at
2.73 GB free. This is the documented contention casualty — the memory note names *this file* as the
one that reds below ~2 GB — and nothing in this story touches routing. Re-run, not assumed.

⚠️ **Free RAM was 1.71 GB (33 Firefox processes) during this review** — inside the band that has
produced false reds on this machine. Suites were run **sequentially, never via turbo**, and the
full-suite totals below were re-run separately for that reason.

### Gate results — RE-RUN 2026-09-11, not read off any table

Re-run from scratch because the prior table was written by the session that then crashed, and
because **H4 in this very story was "a gate recorded as green was RED."** Preflight met for the
first time in this story: **FreePhysicalMemory 3.7 GB** (documented floor is 3 GB).

| Gate | Result |
|---|---|
| `tsc` — api, web, types | **0 / 0 / 0.** ⚠️ Repo-wide `tsc -b` also surfaces **3 pre-existing errors in `packages/testing/src/reporter.ts`** (vitest 4 renamed `Reporter`/`File`/`Task`). That file is **unmodified vs `HEAD`** and nothing in this story imports it — pre-existing, not introduced, and NOT silently folded into a "0/0/0" claim. |
| api lint + 3 drift guards | **0**, and **403 / 403 / 322** — identical to the counts recorded on 2026-09-08. |
| web lint | **0.** (This is the gate H4 found red; it is green and was re-run, not quoted.) |
| **FULL API suite**, 4-way sharded | **312 files** (310 passed, 2 skipped) / **4,426 tests — 4,417 passed, 9 skipped, ZERO failures.** Run with `DATABASE_URL=…/app_test`; the db-guard correctly refused `app_db` first. |
| **FULL web suite**, 4-way sharded | **279 files** / **3,092 tests — 3,090 passed, 2 todo, ZERO failures.** |

⚠️ **THE TEST TOTALS DO NOT RECONCILE WITH THE PRIOR RECORD, AND THAT IS REPORTED RATHER THAN
SMOOTHED.** This session's web work adds **exactly +6 tests** — proven by counting, not asserted:
`EmployersPage.test.tsx` 12 → 13 `it(` blocks, plus 5 in the new app-wide guard. File count moves
278 → 279, which matches. But the *test* count moves 3,082 → 3,092, **+4 beyond my +6**; and the
API total moved 4,419 → 4,426, **+7 in a package this session did not touch at all.**

The likeliest cause is environment-conditional collection (a `skipIf` that skips rather than
collects changes the denominator — note skipped went 8 → 9 on an untouched API suite), not lost or
gained work. **What is certain is what was measured here: zero failures across all eight shards.**
The prior figures are not being treated as wrong, and this one is not being treated as
authoritative either — the point is that a suite total is a **live artefact**, re-measurable in
minutes, and quoting one across a session boundary is how it drifts.
→ [[pattern-falsifiable-number-is-a-live-artefact]]

⚠️ **An accidental RED-VERIFY of H7, worth recording.** While measuring a baseline, the OLD
`EmployersPage.test.tsx` was restored over the CORRECTED page — and shard 2 went red with 2
failures. That is direct proof the old test was **pinning** the false claim, not merely repeating
it: with the lie removed from the page, the test demanded it back. The baseline run was abandoned
as contaminated (the test was reverted, the page was not) and both files restored byte-identical.

### File List

**New**
- `apps/web/src/features/marketplace/components/AssociationConfirmedBadge.tsx`
- `apps/web/src/features/marketplace/__tests__/AssociationConfirmedBadge.test.tsx`
- `apps/api/src/workers/__tests__/marketplace-extraction.worker.gate-open.test.ts` — **[AI-Review] M2**, the cohort's own status

**Modified — layer 1 (extraction)**
- `apps/api/src/db/schema/marketplace.ts` — `association_name` column
- `apps/api/src/workers/marketplace-extraction.worker.ts` — loads `metadata`, derives + upserts the name

**Modified — layer 2 (API)**
- `packages/types/src/marketplace.ts` — `normaliseAssociationName`, `MARKETPLACE_ASSOCIATION_NAME_MAX_LEN`, the field on both response types
- `apps/api/src/services/marketplace.service.ts` — projects + maps it in search and detail

**Modified — layer 3 (UI)**
- `apps/web/src/features/marketplace/components/WorkerCard.tsx`
- `apps/web/src/features/marketplace/pages/MarketplaceProfilePage.tsx`

**New — the app-wide honesty guard ([AI-Review] M5, 2026-09-11)**
- `apps/web/src/lib/__tests__/trust-claims.app-wide.test.ts` — walks all of `apps/web/src`; RED-verified with a planted breach

**Modified — R1 sweep round 3 ([AI-Review] H6/H7/H8, 2026-09-11)**
- `apps/web/src/lib/trust-claims.ts` — **H8**, negation now excused on both sides of the verb
- `apps/web/src/features/participate/pages/EmployersPage.tsx` — two local arrays to the canonical lists; FAQ answer rewritten
- `apps/web/src/features/participate/__tests__/EmployersPage.test.tsx` — **H7**, was pinning the false claim; now iterates the canonical arrays + asserts R1
- `apps/web/src/features/participate/pages/WorkersPage.tsx`
- `apps/web/src/features/support/pages/FAQPage.tsx`
- `apps/web/src/features/support/pages/guides/GuideSearchMarketplacePage.tsx`
- `apps/web/src/features/about/pages/PrivacyPage.tsx`

**Modified — cross-story records (2026-09-11)**
- `_bmad-output/implementation-artifacts/13-2-association-group-channel-and-import.md` — **M7**, R-A2 corrected in place + Change Log
- `_bmad-output/implementation-artifacts/13-67-association-identity-as-structured-data.md` — **L4**, stale cold-start banner
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 13-2 and 13-58 entries

**Modified — the catch-up (Task 5, flagged above)**
- `apps/api/src/services/marketplace-card-backfill.service.ts`
- `apps/api/scripts/_backfill-marketplace-card-fields.ts`

**Modified — the R1 surface fix ([AI-Review] H1)**
- `apps/web/src/features/marketplace/pages/MarketplaceSearchPage.tsx` — the page-level "verified" claim, removed

**New + modified — the R1 canonical-source sweep ([AI-Review] H5, ruled in by Awwal 2026-09-09)**
- `apps/web/src/lib/trust-claims.ts` — **NEW.** The one place the platform says what it has and has not checked
- `apps/web/src/lib/__tests__/trust-claims.test.ts` — **NEW.** Guards the canonical list; RED-verifies the guard against the three claims that really shipped
- `apps/web/src/features/marketplace/components/GovernmentVerifiedBadge.tsx` — renders the canonical lists (strings byte-identical; its 13 tests untouched)
- `apps/web/src/features/support/pages/VerifyWorkerPage.tsx` — two FALSE "confirms" entries removed; renders canonical
- `apps/web/src/features/support/pages/guides/GuideVerifyWorkerPage.tsx` — same, plus 4 copy fixes
- `apps/web/src/features/support/pages/GuidesPage.tsx` + `SupportLandingPage.tsx` — H1's marketplace claim on other pages
- `apps/web/src/features/support/__tests__/VerifyWorkerPage.test.tsx` — ⚠️ **these tests PINNED the false copy**; rewritten + an R1 guard added
- `apps/web/src/features/support/__tests__/guides/GuideVerifyWorkerPage.test.tsx` — same

**Modified — tests**
- `apps/api/src/workers/__tests__/marketplace-extraction.worker.test.ts` (+8; H3 comment corrected at review)
- `apps/api/src/services/__tests__/marketplace.service.test.ts` (+5)
- `apps/api/src/services/__tests__/marketplace-card-backfill.service.test.ts` (+7, then +2 and 1 rewritten at review — H2, L2)
- `apps/api/src/services/__tests__/marketplace-card-fields-db-smoke.integration.test.ts` (+5, +1 seed)
- `packages/types/src/__tests__/marketplace.test.ts` (+4) — **[AI-Review] M3: was missing from this list**
- `apps/web/src/features/marketplace/__tests__/WorkerCard.test.tsx` (+6, 1 retitled; R1 test rescoped at review — L3)
- `apps/web/src/features/marketplace/__tests__/MarketplaceProfilePage.test.tsx` (+5)
- `apps/web/src/features/marketplace/__tests__/AssociationConfirmedBadge.test.tsx` (+1 at review — M1)
- `apps/web/src/features/marketplace/__tests__/MarketplaceSearchPage.test.tsx` (+1, 1 updated at review — H1)

**Modified — record**
- `_bmad-output/implementation-artifacts/13-58-marketplace-association-confirmed-badge.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

⛔ **NOT modified, deliberately:** `apps/api/src/db/schema/respondents.ts`. Opening
`PIPELINE_EXCLUDED_STATUSES` is 13-2 R-A2 and comes after this ships.

### Residuals

| # | What | State |
|---|---|---|
| **R1** | **A new column must reach prod with the deploy.** `marketplace_profiles.association_name` is pushed by `db:push` at deploy; the badge renders for nobody until it lands. Same deploy dependency 13-38 carried for `business_name`. | OPEN — discharges on deploy |
| **R2** | **The catch-up must actually be RUN.** `_backfill-marketplace-card-fields.ts --dry-run` then `--apply --confirm-i-am-not-dry-running`. Until then the eleven matched respondents keep a badge-less card. **PREDICT BEFORE RUNNING:** `associationNameChanged` should equal the number of the eleven who hold a marketplace profile — measure that from prod first and compare, per [[pattern-predict-then-compare]]. Do not read the script's own report as the evidence; read the rows back. | OPEN — operator action |
| ~~**R3**~~ | ✅ **RULED 2026-09-11 (Awwal): WITHDRAW the degrade path.** AC1's fallback ("Trade association — confirmed member") is unreachable under AC4-as-corrected and is now struck from AC1 with the reasoning, rather than left as dead copy for the next reader to "fix" by re-keying the branch on `source`. **The ruling moved the ACs, not just the ledger:** AC1 re-keyed onto the name's presence, and **AC6 corrected** — it required "no badge for non-association sources", which contradicted AC4 and would have been PASSED by the source-keyed build AC4 exists to prevent and FAILED by the correct one. No code change: the shipped behaviour was already AC4-as-corrected. | **CLOSED 2026-09-11** |
| **R4** | **AC2 (tier-2) has no substrate and stays open.** Carve the member-side check as its own story before any "Member-verified" copy ships. ⚖️ **CARVE TRIGGER recorded 2026-09-11 — so this is a scoped story when someone picks it up, not a rediscovery.** Tier-2 needs THREE things that do not exist: a `member_confirmed` column on the taxonomy substrate (never a badge-local re-derivation, per AC2); an SMS confirmation loop, which is blocked on **Termii not being cleared**; and an Assessor callback queue. ⛔ Do not ship "Member-verified" copy before all three — a tier that cannot be earned is a badge that never changes, and the existing `WorkerCard` test asserting it NEVER renders is the guard holding that line. | OPEN — by design, trigger recorded |
| **R5** | **`search_vector` does not include `association_name`.** An employer cannot find AFAN members by searching "AFAN". Not an AC, not built. Flagged because 13-38's R8 was exactly this shape — the FTS trigger gaining a column with no deploy step — and because whether association membership should be SEARCHABLE (rather than merely disclosed) is a policy call, not a dev one.  ⚖️ **NOT RULED 2026-09-11, and it does not need to be yet — leaving it open is the safe default.** Recommendation on record for whoever picks it up: **do NOT add `association_name` to `search_vector` before the gate opens.** With 8,278 AFAN members behind it, a search for "AFAN" would return a result set dominated by one association and distort browse for everyone else. Decide it once real employer query patterns exist — the column is already stored, so this stays a one-line trigger change whenever it is wanted. | OPEN — deferred by design, recommendation recorded |
| **R6** | **The gate is still shut.** 8,278 consenting people remain invisible to the marketplace until 13-2 R-A2 opens `PIPELINE_EXCLUDED_STATUSES`. That is the correct order, and this story does not do it. | OPEN — next story |
| **R7** | ⛔ **Layer 4 is a gate change PLUS an enqueue path — opening the constant alone creates ZERO profiles.** [AI-Review][High] 2026-09-08. The import service holds no reference to the marketplace-extraction queue; the only production enqueue is `submission-processing.service.ts:1349-1353`, which the importer never calls; and the operator's create-profiles script `_backfill-marketplace-extraction.ts:126-140` is scoped `WHERE r.source = 'public'`, so it skips every imported row. The raw material is there (13-2 AC3.4 gives imported respondents a `submissions` row), so the fix is small, but it must be **named in 13-2 R-A2's plan**, or the gate gets opened, nothing happens, and the cause is hunted in the badge. ⚖️ **MECHANISM RULED 2026-09-09 (Awwal): widen `_backfill-marketplace-extraction.ts`'s `source` predicate — NOT an import-time enqueue.** It stays an operator one-shot with a dry-run checkpoint, and it does not push 8,278 jobs through BullMQ workers that run IN the API process on a 2 GB box. Deliberately NOT implemented here: layer 4 is 13-2 R-A2, and widening the predicate is inert until the gate opens anyway (the worker still refuses on status). **PREDICT BEFORE RUNNING:** profiles created should equal imported respondents with `consent_marketplace = true`; measure from prod first. | OPEN — blocks 13-2 R-A2; mechanism decided |

## 🔍 Code Review (AI) — full session record for the adjudication agent

> Adversarial code review, 2026-09-08 → 09 (Claude Opus 5), run on the **uncommitted** tree per
> [[feedback_review_before_commit]]. Awwal's instruction was *"create action items (critical to low)
> and fix them all automatically"*, so all eleven findings are BOTH recorded (Tasks → **Review
> Follow-ups (AI)**) and fixed in the same pass. Nothing was left as an exercise.
>
> **Read this section before re-deriving anything.** It exists so adjudication starts from what was
> actually measured rather than re-running a day of work — and so it knows precisely which claims in
> this story are load-bearing evidence and which are prose.

### §1 — The one-paragraph version

Layers 1–3 are **built correctly and the central design decision is right**: AC4 is keyed on the
presence of `metadata.association_name`, with **no `source` predicate anywhere in the render path** —
structurally impossible, because `MarketplaceSearchResultItem` carries no `source` field at all.
`PIPELINE_EXCLUDED_STATUSES` is untouched. AC2 was not faked. What the review found was **two live
defects in the diff** (H1, H2), **one false premise the NEXT story would have acted on** (H3 → R7),
**one gate reported green that was red** (H4), and an **accessibility gap that silently voided AC3 on
the primary surface** (M1). All fixed. The story's own conclusions survive; several of its *reasons*
did not.

### §2 — What changed at review, by file

Code fixes (behaviour):

| file | change | finding |
|---|---|---|
| `apps/web/.../pages/MarketplaceSearchPage.tsx` | strapline: "Find **verified** skilled workers…" → "Find skilled workers…" | **H1** |
| `apps/api/src/services/marketplace-card-backfill.service.ts` | the vouch is computed **above** the answer-source guard; `if (!answers)` no longer skips it | **H2** |
| `apps/web/.../components/AssociationConfirmedBadge.tsx` | `role="img"` on the static pill; `data-testid` on the truncating label | **M1**, **H4** |
| `apps/web/.../pages/MarketplaceProfilePage.tsx` | badge wrapper is conditional (no empty flex div) | **L1** |

Tests added or repaired: `MarketplaceSearchPage.test.tsx` (+1 page-level R1 guard, 1 updated),
`AssociationConfirmedBadge.test.tsx` (+1 accessible-name assertion),
`marketplace-card-backfill.service.test.ts` (+2 for H2, 1 vacuous assertion rewritten),
`WorkerCard.test.tsx` (R1 rescoped, A3 violation removed), and a new file
`apps/api/src/workers/__tests__/marketplace-extraction.worker.gate-open.test.ts` (**M2**).

Record corrections: the false sequencing claim (**H3**) in four places — this story, the worker test
block comment, the backfill service docstring, the operator script header — plus **M3** (File List)
and **M4** (eleven vs twelve).

⚠️ **Task 5 was KEPT, not stripped.** The dev flagged it as beyond the four scoped layers and invited
reversion. The review's H2 finding is the argument for keeping it: without the catch-up the badge
ships and fires for nobody who exists today. **Still Awwal's call** — but revert it and R2 becomes
moot while the eleven stay badge-less.

### §3 — Evidence: what was EXECUTED, with the numbers

Every figure below was produced in this session. None is copied from the Dev Agent Record — which is
exactly how **H4** surfaced.

| gate | command | result |
|---|---|---|
| tsc ×3 | `pnpm --filter @oslsr/{types,api,web} exec tsc --noEmit` | **0 / 0 / 0** |
| api lint + drift guards | `pnpm --filter @oslsr/api lint` | clean; **403 / 403 / 322** |
| web lint | `pnpm --filter @oslsr/web lint` | **RED → exit 0** (H4) |
| story's api tests | 5 files vs `…/app_test` | **164 passed** (worker 53, gate-open 3, service 61, backfill 33, real-DB smoke 14) |
| web marketplace slice | `vitest run src/features/marketplace` | **150 passed / 9 files** — ⚠️ a SUBSET |
| **full API suite** | `vitest run --shard=n/4`, n=1..4 | **312 files** (310 passed, 2 skipped); **4,419 tests** (4,411 passed, 8 skipped) |
| **full web suite** | `vitest run --shard=n/4`, n=1..4 | **277 files**; **3,075 tests** (3,072 passed, 1 known flake, 2 todo) |
| `packages/types` | `pnpm --filter @oslsr/types test` | **7 files, 117 passed** — identical to the dev's run |

Per-shard, so a future partial re-run has something to compare against:

- **API** — 1/4: 78 files (77p/1s), 1,204 (1,201p/3s) · 2/4: 78p, 983p · 3/4: 78p, 1,075p · 4/4: 78 (77p/1s), 1,157 (1,152p/5s)
- **web** — 1/4: 70 files, 747p · 2/4: 69 files, 784 (783p, **1 flake**) · 3/4: 69 files, 729p · 4/4: 69 files, 815 (813p, 2 todo)

**Delta arithmetic, checked rather than asserted.** API total is **+5 tests / +1 file** over the dev's
run — exactly the 3 gate-open tests plus the 2 H2 tests, in exactly one new file. ⚠️ But the split is
**+6 passed / −1 skipped**, not +5/0: **one test that was SKIPPED in the dev's run PASSED in mine.**
Almost certainly an environment-gated integration skip (an affordance present here and absent there),
not a behaviour change — nothing in this diff can un-skip a test. **Left as an open thread**
(§5, N7) rather than smoothed over, because "the numbers line up" is how a real discrepancy gets
waved past. Web total is **+2 tests**, exactly the H1 and M1 guards.

**RED-verify — the fixes were watched to fail before they passed:**

- **H2** — a scratch probe (written, run, deleted) returned `associationNameChanged 0, updated 0,
  noAnswerSource 1` with `AFAN` sitting on the respondent. That output IS the defect.
- **H1** and **M1** — each fix was reverted one at a time and its new test went red, then green on
  restore.
- The other findings are record corrections, markup, or test-quality fixes, where a RED-verify would
  assert nothing.

### §4 — What was NOT verified (do not read this review as covering it)

1. **No prod database was queried.** Every production figure in this story — 8,278 imported
   respondents, 295 profiles, ASNAT 56 / AFAN 8,233, "the eleven" — is inherited from the story and
   13-67. **R2's predict-then-compare still has to be done against prod**, and this review is not a
   substitute for it.
2. **R1 is undischarged.** `marketplace_profiles.association_name` reaching prod via `db:push` was
   not observed; it was only proven to exist on `app_test` (the real-DB smoke ran, 14 tests).
3. **No visual/UAT pass.** Colour-blind safety and grid density (AC5) were reasoned about from the
   markup, never seen rendered. The `max-w-[45%]` trust slot and the ellipsised long-name case
   deserve one human look.
4. **No e2e/Playwright run**, and no deploy.
5. **The web suite's one red** was reproduced-as-green in isolation, not root-caused (see N2).

### §5 — Nuances and traps. This is the part worth reading twice.

**N1 · A truncated run is not a red.** Two unsharded full-API attempts were killed at **exactly
600 s** by the runner's execution cap, mid-run, on passing lines. Neither produced a `Test Files`
summary. Both were *reported* to me as "failed, exit 255". **A vitest run with no summary line did
not fail — it did not finish.** The fix is `--shard=n/4` (each API shard ~60–90 s, each web shard
~230 s), api and web sequentially, never turbo. Do not read exit 255 as evidence about the code.

**N2 · The web flake has a name, and it is the one that fired.** `route-resolution.integration.test.tsx
> resolves an unknown path to the NotFound` failed in web shard 2 and **passed 58/58 in isolation** at
2.73 GB free. Memory names *this exact file* as the casualty of the low-free-RAM band, and nothing in
this story touches routing. Chased to isolation rather than waved off — per
[[pattern-flaky-test-hiding-a-prod-bug]], intermittent ≠ environmental until you check. It checked out
as environmental. **Free RAM was 1.71 GB with 33 Firefox processes for most of this session**; the
>3 GB preflight was not met and could not be, since closing someone else's browser is not mine to do.

**N3 · A near-miss worth knowing about: `DATABASE_URL` became the single character `D`.** A PowerShell
mistake — `@(...)` omitted, so `[0]` indexed a *string* and returned its first character instead of
indexing a one-element array. The suite then ran with `DATABASE_URL=D`. **Nothing touched `app_db`**;
the connection simply timed out. I then read `apps/api/test/db-guard.ts` to find out whether the guard
had failed open, and the answer is worth recording so nobody re-raises it:

> `resolveDbName('D')` → `new URL('D')` throws → returns `''` → `assertTestDatabase` hits
> `if (!dbName) return;` and **passes**. That looks like a fail-open, **and it is benign**: an
> unparseable URL cannot connect to *anything*, so there is no wrong database to reach. The guard's
> real job is refusing a **parseable non-test** URL, and that path is intact (`looksLikeTestDb` is
> boundary-matched, so `latest`/`contest` do not sneak through). **Checked, not a defect — do not
> re-open it.**

The transferable lesson is the shell one: in PowerShell, `@(Get-Content … | Where-Object …)` — always
force the array, or a one-match filter silently becomes a string and `[0]` becomes a letter.

**N4 · I corrupted two files' UTF-8 mid-review, and fixed it.** Round-tripping through
`Get-Content -Raw | Set-Content` mangled every em-dash and emoji in `AssociationConfirmedBadge.tsx`
and `MarketplaceSearchPage.tsx` (`—` became `â€"` — ⚠️ **that mangled string is an INTENTIONAL
illustration, the only one in this repo; a mojibake scanner will hit it here and nowhere else**).
It surfaced as *extra* test failures during the H1/M1
RED-verify, which briefly looked like signal and was not. Both files were restored — the search page
via `git checkout` (tracked), the badge by **rewriting it wholesale, because it is UNTRACKED and
`git checkout` could not have saved it** — and both verified clean (`mojibake=False`, 14 and 2
em-dashes present). ⚠️ **Never round-trip a source file through PowerShell's `Set-Content` in this
repo.** Use the editor. An untracked new file has no safety net at all.

**N5 · `a3-eslint-policy.test.ts` proves the RULE exists, not that any file OBEYS it.** This matters
because it explains H4 and prevents a wrong conclusion. The web suite contains
`src/__tests__/a3-eslint-policy.test.ts`, which lints a **synthetic snippet**
(`document.querySelector('.foo')` against a fake filename) and asserts `no-restricted-syntax` fires.
It never scans the repo's real test files. So a **green web suite is not A3 compliance** — only
`pnpm --filter @oslsr/web lint` is — and the dev's suite figure is *not* contradicted by H4; only the
lint figure was false. It is a policy-config guard doing its job, adjacent to
[[pattern-test-that-passes-over-a-hole]] without being an instance of it. Worth naming so the next
person does not "fix" it or trust it for the wrong thing.

**N6 · Eleven vs twelve: a disposition is not a person.** AC4 said "12 people" in three places while
the dev record and every code comment said "eleven". 13-67 settles it: **12 matched dispositions,
11 distinct people** — *"two different rows in the AFAN sheet matched the SAME existing respondent"*
(`13-67:477`), and its phase-2 ledger reads `AFAN (matched) | 11 | 11` (`13-67:451`). Corrected to
eleven throughout. **R2 must predict eleven**; predicting twelve and measuring eleven would look like
a backfill defect instead of two spreadsheet rows naming one man.

**N7 · The one unexplained number.** The skipped-test count moved 9 → 8 between the dev's API run and
mine (see §3). Benign in all likelihood, but unexplained, and this project's habit is to name those
rather than round them off.

**N8 · A dead end, recorded so it is not re-walked.** The L2 fix first tried to extract drizzle's
bound parameters by walking `queryChunks` for objects with a `.value`. It returns junk: a
`StringChunk` also has `.value`, holding an **array of SQL text fragments**, so the walk collects the
statement's words dressed up as parameters. Excluding arrays then yielded `[]`. The working technique
is `JSON.stringify(mockExecute.mock.calls[n][0])` — which the marketplace service test already used
three files away. **Look for the existing technique before inventing one.**

### §5a — ⚖️ AWWAL'S RULINGS, 2026-09-09 (post-review, pre-adjudication)

The review's open questions were put to Awwal before adjudication rather than after. **Four rulings,
all now reflected in the tree and the residuals** — adjudication should treat these as settled and
spend its attention elsewhere.

| # | ruling | effect |
|---|---|---|
| **R1 copy sweep** | **"Fix everything now, in this story."** Not the narrower option of fixing the marketplace lines and carving the guide-page defect. | **H5** above. Scope deliberately widened beyond the four layers into `features/support`, because the claim was false *today* on public pages and had already survived one correction. |
| **R7 — layer 4's mechanism** | **Widen `_backfill-marketplace-extraction.ts`'s `source` predicate.** NOT an import-time enqueue. | Recorded in R7. Reasoning: it stays an operator one-shot with a dry-run checkpoint and a predict-then-compare, and it does **not** push 8,278 jobs through BullMQ — all 10 workers run **in the API process** on a 2 GB VPS, so an import-time enqueue is a self-inflicted load spike. It also leaves import semantics alone for every future import. |
| **R3 — AC1's unreachable degrade path** | **Left OPEN for adjudication**, deliberately not settled here. | R3 unchanged. The review's recommendation is on record (withdraw it: the behaviour fails closed and safe, and a fallback string no code path can produce is dead copy) but adjudication rules. |
| **Task 5 — the backfill catch-up** | **KEEP.** | Task 5 stands, and the dev's "revert it if you disagree" offer is now closed. Without it the badge fires for nobody who exists today. |

⚠️ **R5 was not ruled and does not need to be today.** Leaving it open is the safe default. The
review's recommendation, for whoever picks it up: **do not** add `association_name` to
`search_vector` before the gate opens — a search for "AFAN" would then return 8,278 results
dominated by one association and distort browse. Decide it once real query patterns exist.

### §6 — What needs Awwal, not another agent

| # | question | why it cannot be settled in code |
|---|---|---|
| ~~**R3**~~ | ✅ **RULED 2026-09-11 — WITHDRAW the degrade path.** Left unreachable and struck from AC1; AC6 corrected with it. | The judgement was made: failing closed is honest (no name ⇒ we cannot say who vouched), and dead copy in an AC invites the re-keying that drops the eleven. |
| **R5** | Should association membership be **searchable** (`search_vector`), or only **disclosed**? | Policy. An employer currently cannot find AFAN members by searching "AFAN". |
| ~~**R7**~~ | ✅ **RULED 2026-09-09 — widen the extraction backfill script's `source` predicate, not an import-time enqueue.** See §5a. | Still BLOCKS 13-2 R-A2, but the *mechanism* is no longer an open question — R-A2 executes it. |
| ~~**Task 5**~~ | ✅ **RULED 2026-09-09 — KEEP.** | The dev's "revert it if you disagree" offer is closed. |

### §7 — WHERE ADJUDICATION SHOULD PUSH

> ⚠️ **UPDATED 2026-09-11, after the close-out pass (commit `27423ff`).** The list below was
> written by the reviewer on 2026-09-08/09, before the session crashed. **Four of its five items
> have since been acted on**, so it is re-issued rather than left standing — an adjudication agent
> reading the original would re-walk closed ground and, worse, would trust item 3's description of
> a guard that has since been rebuilt. The original items are kept with their outcomes, because
> *what they turned out to be worth* is the useful part.

#### What the pre-crash list asked for, and what happened

| # | The ask | Outcome |
|---|---|---|
| 1 | **Discharge R7 before R1** — prove by prod `SELECT` + a code trace that opening the gate creates zero profiles | **Trace DONE at review (H3); the prod `SELECT` is still owed.** The mechanism was then ruled by Awwal (widen the backfill predicate) and **13-2's R-A2 was corrected in place**, so the wrong instruction is no longer sitting in the next story. ⚠️ Still open: R7 is *ruled*, not *implemented* — see below. |
| 2 | **Treat H3 as a process finding** — a sequencing argument is a claim about executed code | **STANDS, and is now stronger.** Still owed a line in the handoff playbook. |
| 3 | **The H1 class is under-guarded; grep for other blanket trust language; a suite-level guard would be worth more than three more per-badge assertions** | ✅ **DONE, and the reviewer was right about the size of it.** The grep found **five more live public pages** and a **third** test pinning the claim. The suite-level guard exists: `trust-claims.app-wide.test.ts`. |
| 4 | **Re-run the gates above 3 GB free** | ✅ **DONE** — 3.7 GB, all 8 shards, zero failures. The route-resolution flake did not recur (third independent non-recurrence). |
| 5 | **Sharding should probably be the documented default** | **STANDS, unactioned.** Four-way shards finish comfortably; two unsharded runs were killed at the 600 s cap. Still a playbook edit nobody has made. |

#### What is actually live for adjudication now

1. ⛔ **R7 is RULED but NOT IMPLEMENTED, and it is inert by design — which is exactly how it gets
   lost.** Widening `_backfill-marketplace-extraction.ts`'s `source` predicate does nothing until
   the gate opens, so there is no test that can fail and no symptom to notice. The only thing
   standing between this and a silent drop is the corrected **13-2 R-A2** text.
   **Verify the correction is really there** (`git show 27423ff -- ...13-2-...md`) rather than
   trusting this paragraph — that is the whole lesson of the thing being corrected.
   → [[pattern-ship-a-fix-that-never-fires]]
2. **R2 is the one with a number to get right.** Before running the card-fields backfill, predict
   **how many of the ELEVEN hold a marketplace profile today** — measured from prod, not inferred —
   then compare. Eleven PEOPLE, twelve DISPOSITIONS (M4); predicting twelve and measuring eleven
   would read as a defect in the backfill rather than as two sheet rows naming one man. Read the
   rows back; **do not** accept the script's own report as the evidence.
   → [[pattern-predict-then-compare]]
3. **R1 discharges on deploy — by EXECUTION, not by deploy log.** The column arrives via `db:push`.
   Prove the badge renders by exercising the deployed read path for a respondent that carries
   `metadata.association_name`, not by confirming the migration ran.
4. ⭐ **The finding most worth carrying out of this story is not about copy at all.**
   The same false claim was fixed in three rounds across five months, and **round 2 shipped a guard
   that did not prevent round 3** — because the guard was imported by exactly the two test files for
   the two pages just fixed. It policed **where the fix landed, not where the claim lives**.
   The generalisation, which is not marketplace-specific:
   **a guard wired in at the site of an instance is not a guard on the class.**
   → [[pattern-census-counts-sites-not-callers]], [[pattern-ship-a-fix-that-never-fires]]
   Corollary, from **H8**: the same per-page scoping also hid a defect *in the guard itself* — it
   flagged this story's own honest copy. **Narrow scope hides both the misses and the false
   positives**, and the false positives are the ones that get a guard deleted.
5. **The guard's scope is `apps/web`, and that is currently sufficient BY MEASUREMENT, not by
   construction.** Checked 2026-09-11: `apps/api` and `packages` carry **zero** instances of the
   claim class (email templates, the PDF ID card, notification copy — all clean). But nothing
   *stops* a claim being written there, and the ID card in particular is a document that asserts
   provenance. If a trust claim ever moves server-side, the guard does not follow it.
   **Not carved as a residual** — there is nothing to fix today, and a residual for a hypothetical
   is noise. Recorded so the next person knows the boundary was chosen, not assumed.
6. **Two numbers this session could not reconcile, offered as a decision rather than a defect.**
   Measured totals exceed the pre-crash record by **+4 web** (beyond this session's counted +6) and
   **+7 on an API suite this session did not touch**, with skipped moving 8 → 9. The likeliest cause
   is environment-conditional collection. **Adjudication's call:** chase it to a deterministic
   explanation, or accept "zero failures across 8 shards" as the gate and stop quoting totals
   across session boundaries. The reviewer's lean is the second — but it should be a decision, not
   a drift. → [[pattern-falsifiable-number-is-a-live-artefact]]
7. **R5 and R4 are Awwal's, not adjudication's.** R5 (searchable vs merely disclosed) has a
   recommendation on record and no urgency; R4 (tier-2 substrate) now carries its carve trigger.
   Neither should be resolved by an agent to tidy the residual table.

⚠️ **Do NOT flip this story to `done` at adjudication while R2/R4/R5/R6/R7 are open** — the
story-residual drift guard reds on done-with-open-residuals, and correctly. Same call as 13-59.

## Change Log

| Date | Change |
|---|---|
| 2026-09-11 | **§7 (the adjudication note) RE-ISSUED.** It was written pre-crash and four of its five items had since been acted on — including item 3, which described a guard that has since been rebuilt, so an adjudication agent reading the original would have re-walked closed ground and trusted a stale description. Outcomes recorded against the original five (item 3 was right about the size of it: the grep it asked for found FIVE more live pages and a THIRD pinned test), and a live list put in their place: R7 is ruled-but-unimplemented and **inert by design, which is how it gets lost**; R2's prediction is ELEVEN people not twelve; R1 discharges by EXECUTION, not by deploy log; the class-not-instance guard lesson; the guard's `apps/web` boundary is sufficient **by measurement** (api + packages verified clean today), not by construction; and the unreconciled suite totals are offered as a decision, not a defect. The `git show` command §7 tells the adjudicator to run was itself executed before being written down. |
| 2026-09-11 | **R1 SWEEP ROUND THREE — five more live public pages were still carrying the false identity claim** (`FAQPage`, `GuideSearchMarketplacePage`, `EmployersPage` — two arrays plus an FAQ answer — `WorkersPage`, `PrivacyPage`). Round 2 fixed two pages and shipped a guard; the guard was imported by exactly the two test files for those two pages, so it policed where the fix landed rather than where the claim lives. `EmployersPage` now renders the canonical lists; the rest were rewritten against `lib/trust-claims.ts`. **H6/H7.** |
| 2026-09-11 | **The guard was flagging the story's own honest copy (H8).** Its identity pattern excused a negation only AFTER the verb, so it matched AC3's disclosure "Identity not independently verified". Invisible under per-page scoping; surfaced the instant the scan went app-wide. Negation is now excused on both sides. |
| 2026-09-11 | **App-wide honesty guard added (M5)** — `trust-claims.app-wide.test.ts` scans every `.ts`/`.tsx` under `apps/web/src`, comments stripped, failing with file:line. RED-VERIFIED with a planted breach that produced two hits and cleared when removed, so the WALK is proven, not just the patterns. A third test pinning the false claim (`EmployersPage.test.tsx`) was re-pointed at the canonical arrays. |
| 2026-09-11 | **R3 RULED (Awwal): withdraw AC1's degrade path — and AC1 AND AC6 were amended with it (M6).** AC6 had required "no badge for non-association sources", contradicting AC4-as-corrected: it would have been PASSED by the source-keyed build AC4 exists to prevent and FAILED by the correct one. No code change; the shipped behaviour was already right. |
| 2026-09-11 | **13-2's R-A2 corrected IN PLACE (M7)** — it told the next dev the gate was a one-line change, which H3 had already disproved. Now (a) the gate AND (b) widening the extraction backfill's `source` predicate, with Awwal's 2026-09-09 mechanism ruling and a predict-then-compare. Mirrored on sprint-status and 13-2's Change Log. **R5 recommendation and R4's carve trigger recorded**; two stale cross-references fixed (L4). |
| 2026-09-08 | **Tasks/Subtasks authored** at the start of the dev session — the story arrived with ACs and the adjudication scoping but no task list. Status `backlog` → `in-progress`. |
| 2026-09-08 | **Layer 1 — extraction.** New `marketplace_profiles.association_name` column; the extraction worker now loads `respondents.metadata` and denormalises the vouch onto the profile, ADD-or-CORRECT (a re-extraction can never blank a stored vouch). Shared `normaliseAssociationName` in `@oslsr/types` so blank ⇒ null everywhere. |
| 2026-09-08 | **Layer 2 — API.** `associationName` on `MarketplaceSearchResultItem` and `MarketplaceProfileDetail`, projected from `marketplace_profiles` in both raw-SQL reads. No join to the PII table — asserted by a test. |
| 2026-09-08 | **Layer 3 — UI.** New `AssociationConfirmedBadge` (indigo, `Users` glyph, distinct from the government green by shape as well as hue), rendered on `WorkerCard` and `MarketplaceProfilePage` keyed on the name's PRESENCE. AC3 disclosure on the pill's `aria-label`/`title` and in the expandable panel. |
| 2026-09-08 | **Layer 4 NOT done, deliberately** — `PIPELINE_EXCLUDED_STATUSES` untouched (13-2 R-A2). Opening it before layers 1–3 were live would have cost a second production backfill over 8,278 freshly-created badge-less profiles. |
| 2026-09-08 | **AC2 (tier-2) left open** — no substrate exists. **AC1's degrade path recorded as unreachable** under AC4-as-corrected; flagged as R3 for Awwal's ruling rather than resolved silently. |
| 2026-09-08 | **Task 5 (beyond scope, flagged)** — `association_name` added to the existing 13-38 backfill so the eleven matched respondents who already hold a profile can be repaired. Dry-run default, ADD-or-CORRECT, `updated_at` untouched. |
| 2026-09-08 | Status `in-progress` → `review`. NOT committed — the adversarial code review runs on the uncommitted tree. |
| 2026-09-08 | **Adversarial code review — 10 findings (3 High, 4 Medium, 3 Low), all recorded as action items and all fixed.** Two were live defects in this diff: a page-level bare-"verified" claim over the whole grid (**H1**, `MarketplaceSearchPage.tsx:98`) and the catch-up silently dropping the vouch for answer-less rows (**H2**, proven by probe before fixing, then pinned by two tests). One was a false premise the next story would have acted on: opening `PIPELINE_EXCLUDED_STATUSES` alone creates **zero** profiles because the import path never enqueues extraction (**H3** → **R7**). One was an accessibility gap that made the AC3 disclosure unreachable by screen reader on the primary surface (**M1**). The rest: the cohort's own status was untested (**M2**, new gate-open test file), a missing File List entry (**M3**), the eleven-vs-twelve number R2 predicts on (**M4**), and three test/markup cleanups (**L1–L3**). |
| 2026-09-09 | ⚖️ **Awwal's four rulings** (§5a): fix the R1 copy sweep IN THIS STORY; R7's mechanism is to widen the extraction backfill's `source` predicate (not an import enqueue); R3 stays open for adjudication; Task 5 KEPT. |
| 2026-09-09 | **[AI-Review] H5 — the R1 sweep.** Two public pages were still asserting *"NIN has been validated"* and *"Identity verified by government"* — verbatim the claim `GovernmentVerifiedBadge` was corrected away from on 2026-08-18, and **pinned in place by tests that asserted the false strings word for word**. Fixed at the source: new `lib/trust-claims.ts` is the single canonical list, rendered by the badge and both support pages, with the strings byte-identical to the already-ruled wording. Guarded by `FORBIDDEN_IDENTITY_CLAIMS` + a test that RED-verifies the guard against the three claims that really shipped. Final web suite **278 files / 3,082 tests, zero failures**; web lint + tsc 0. |
| 2026-09-08 | **Gates re-run by the reviewer, not taken from the dev record.** `tsc` 0/0/0; api lint + all three drift guards green (403 / 403 / 322); the story's API tests **164 passed** (5 files, up from 159 — the real-DB smoke ran, not skipped); web marketplace **150 passed** (9 files, up from 148). H1 and M1 were RED-verified by reverting each fix and watching the new tests fail. |
