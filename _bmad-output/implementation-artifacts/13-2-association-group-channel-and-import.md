# Story 13.2: Association Group Channel & Importer — Freeze the Condensed Sheet + `imported_association` on the Epic 11 Import Spine

Status: review

> ⚠️ **STATUS CORRECTED 2026-09-05 — it read `ready-for-dev` while the channel was LIVE ON PROD with
> 8,278 rows imported through it.** The header below still opens with a `BLOCKED-FOR-DEV` banner from
> 2026-07-19; that block is HISTORY, not current state, and is kept for provenance. Anyone opening this
> story cold would have concluded the work was unstarted and re-implemented the config, the
> trade→taxonomy reconciliation and the submissions-write — all of which are deployed and running.
>
> **What is actually built and exercised on prod:** AC1 (sheet frozen), AC2 (`imported_association`
> source + `ASSOCIATION_CONFIG` with an HTML-parsing drift guard), AC3 (importer on the 11-2 backbone —
> **two real imports confirmed**, `01a071c8…` 56/56 and `01a072ae…` 8,222/8,234), AC3.4 (the submissions
> -write, closing the 13-33 ingestion contract), AC4 (required-field + dedup, R2-corrected), AC6 (tests).
>
> **Why `review` and not `done`:** residuals R-A2 through R-A6 are open, and the story-residual lint
> guard refuses `done` with open residuals — correctly. R-A1 is discharged.
>
> 🧭 **CURRENT STATE 2026-09-13 → read `## Adjudication — R-A2` first.** R-A2 is built, reviewed, ruled, and its review proposals P1–P4 (+ L2) are **implemented** — all **NOT committed**; prod `afe1da5` has none of it. The adjudication agent owns commit, push, the handoff doc and live-server work. The next action and the full runbook (with predictions and stop conditions, incl. step 1b) are in §A4; what P1–P4 built is §A6.

> 🔗 **Anchors on the [Registry Data-Status Taxonomy](../planning-artifacts/registry-data-status-taxonomy.md)** (2026-07-01; **12-4** is the derivation MODEL). Association rows classify as **`source=imported_association` / `completeness=core` / `verification=unverified_import`** — they enter `respondents` + the frontend in an HONEST unverified stratum (excluded from the "verified registry" headline) until a **member-side check** (confirmation SMS once Termii clears, or a sampled **Assessor callback** — the Assessor "verify imported rows" queue) promotes them. Adding `imported_association` to `respondents.source` + import-sources config is the cheap PRE-Jul-1 slice; the verify-queue is post-launch. _The taxonomy is the honest-display contract these AC5.x checks must satisfy._

> ✅ **DECISION (Awwal, 2026-07-19) — association members ARE marketplace-visible WITH a provenance badge; `unverified_import` was too blunt a bucket.** _Escalated from the 13-33 sweep; verification reframed by Awwal; supersedes the AC3.4 note + the ⛔ block that preceded it._
>
> **The reframe (Awwal):** Axis-3 "verification" = has the INDIVIDUAL confirmed their own record (member-side SMS / Assessor callback / NIMC NIN) — **NOT** source legitimacy. Association imports arrive via an accountable source (named head = enumerator-equivalent) **with hard identifiers — mandatory phone (contactable) + usually NIN** — a materially higher trust tier than a name/address bulk list. So they are NOT gated like generic `unverified_import`. (The skepticism the old bucket assumed applies to soft-identifier scrapes, not this.)
>
> **RULED (Awwal):**
> 1. **Marketplace = INCLUDE, with a badge.** Association members appear in the marketplace; each card carries **"[Association] — confirmed member"** (e.g. "ASNAT Tiller Association — confirmed member"), read from the batch's association/guild name. Disclosure = honesty. **TWO TIERS:** tier-1 *association-confirmed* on import; a member-side SMS confirmation **upgrades** to tier-2 *Member-verified*. The SMS loop stops being a gate and becomes progressive enhancement (and still kills roll-padding — ghosts don't reply). **Render = new story 13-38.**
> 2. **Public /insights = INCLUDE** in skills + LGA coverage COUNTS (real, accountable people — the channel's purpose).
> 3. **Honest naming (the one discipline held):** the badge says what is TRUE — "[Association] — confirmed member" — **NEVER** a bare "✓ Verified" (R1: no NIMC path; a present NIN is `nin_on_file`, here proxy-transcribed). Overstating burns the associations' credibility too.
> 4. **The ONE remaining exclusion is COMPLETENESS, not verification:** association rows are the 12-column *core* sheet, so they're absent from deep-field statistical RATE charts (unemployment %/income) because they **weren't asked** those questions (Axis-2 `core`) — label "(field-collected sample)". The "verified registry" headline becomes an honest **composition** (member-verified + association-confirmed + self-declared), never a binary that hides them.
>
> **STILL OPEN (build inputs — resolve before dev; do NOT code around):**
> - **Trade→skills mapping:** importer writes Trade → `raw_data.skills_possessed`; a **Trade → `SKILL_TAXONOMY`(13-20) reconciliation is REQUIRED** (the real ASNAT batch proves why — see INTAKE-REALITY below; a dev must NOT invent a third skills vocabulary).
> - **Consent + intake channel:** see ⚠️ INTAKE-REALITY — the frozen clean-sheet assumption does not match how associations actually submit, and the transmitted data carries **NO consent field**.
> - ~~**Rate-chart consequence:** public-insights employment-RATE stats must exclude `core`/`unverified_import` rows~~ ⛔ **STRUCK 2026-08-11 — SUPERSEDED BY RULING R-E (SCP §10.14).** A rate's denominator is the set of people who **ANSWERED THAT QUESTION**; source is not the variable. Filtering by source is a PROXY that fails in BOTH directions — an association member who later completes the deep-field questionnaire stays wrongly excluded forever, and a field-collected respondent who SKIPPED the question stays wrongly included. Association rows stay INCLUDED, shown as a visible "not asked" band, with `n` published beside every rate. ⚠️ Only the RATE clause is struck: the marketplace-inclusion ruling and the 13-38/13-58 badge stand — a **13-2 ↔ 12-4 ↔ public-insights** coordination item.
>
> ⚠️ **INTAKE-REALITY finding (John/PM 2026-07-19, from a REAL ASNAT Tiller Association batch, ~18 members submitted via WhatsApp) — the frozen clean-sheet assumption does NOT match how associations submit. This RESHAPES the importer scope; do NOT build "wire a CSV onto 11-2" as if the input is clean.**
> - **Channel = freeform WhatsApp text, not a filled XLSX/CSV.** The head pastes each member as a chat message; field ORDER + LABELING vary per message (some use the Surname/Other/Phone template, most are bare newline-separated values, some one-line whitespace-jammed blobs). A CSV/XLSX parser alone cannot ingest this.
> - **Trade = free text, ~15 spellings of ONE trade** (Tiler/Tiller/Tilling/Tiles × Marble/Mable × Terrazzo/Tarrezo/Terrazo; plus bare "Artisan"). AND **Appendix B lists no tiling/terrazzo trade at all** — the controlled list already broke on the FIRST association. Trade canonicalization (fuzzy → taxonomy) is ESSENTIAL; add the tiling family to Appendix B ([AWWAL] input #1 in the sheet spec).
> - **LGA = free text**, mostly mappable ("ONA Ara Local Gov"→Ona Ara) but with invalids ("Adewumi" is not an Oyo LGA) → fuzzy-match to `lgas.code` + an invalid-LGA reject/repair path.
> - **Phone dirty:** letter-O for zero, stray symbols ("0&0…"), multi-value ("08…,08…"). Phone = dedup key + contact channel → robust normalization + a hard-invalid reject.
> - **Age not DOB** (as anticipated) → `raw_data.age_years`. **Dedup works:** one member appears twice in the batch — phone dedup catches it (a good real fixture).
> - ✅ **CONSENT — reframed per Awwal (2026-07-19): handled institutionally; RECORD the provenance, do NOT reject.** The association was briefed **in person at the Secretariat** and the whole process explained; the head is accountable and reads the declaration **aloud** (the inclusion path for non-literate members — the whole reason for the cascade). So consent EXISTS at the head-attested/institutional level even though the per-member Yes/No COLUMN isn't in the WhatsApp transmission. Fix: **re-scope AC4.3 for the association channel** — batch-level head attestation + the Secretariat-briefing date recorded in `lawful_basis_note` (`ndpa_6_1_e` public task + documented consent), NOT a per-row blank-reject. Confirm the exact evidence form with the DPIA owner (Appendix H). A recording requirement, not a blocker.
> - **Intake is ADAPTIVE by design (Awwal 2026-07-19) — inclusion is the point, don't force one format.** The registry deliberately ingests via MANY channels — **enumerators, public wizard, radio→inbound, social outreach, word-of-mouth / WhatsApp groups, sister-site scrapes** — so the count isn't skewed to only the literate/enumerated (an enumeration-only registry would misrepresent the State's artisans). So accommodate each association/channel's easiest form (WhatsApp text, a Google Form, the printed sheet photo, a scrape) and **CONVERGE them through a reusable, channel-agnostic NORMALIZATION layer** (messy input → canonical `respondent` + `submission`), which the 13-33 canonical READ then unifies. **This is the intake-side twin of 13-33: many intakes, one registry.** Build the normalization ONCE — NOT a one-off WhatsApp parser buried in 13-2 (that's the same drift we've been killing all along). See [[feedback_unified_ingestion_pipeline]]. **For launch:** an assisted-cleaning tool (freeform text → the canonical sheet + review flags) handles current volume; a per-channel adapter registry is the durable shape. Per-association channel is negotiated at onboarding (e.g. ASNAT chose WhatsApp for literacy reasons; another may prefer the form).
>
> **Gate → RESOLVED (Awwal approved 2026-07-20); 13-2 UNBLOCKED → ready-for-dev (POST-LAUNCH).** The three open items are ruled:
> 1. **Trade→skills mapping:** fuzzy-canonicalise free-text Trade → the Appendix-B controlled trade → its `SKILL_TAXONOMY`(13-20) slug; low-confidence matches carry a review flag. `SKILL_TAXONOMY` **already has `tiling`** ("Tiling & Flooring", ISCO 7122) so there is **NO taxonomy extension** — only Appendix B needed the entry (now added: "Tiling / Terrazzo / Marble"). ONE vocabulary: the importer writes the canonical slug to `raw_data.skills_possessed` (13-33 AC4) **and** `marketplace_profiles.profession`. Never invent a third trade vocabulary.
> 2. **Consent + intake:** consent for the association channel is **BATCH-LEVEL head attestation** (in-person Secretariat briefing + declaration read aloud for non-literate members) recorded in `lawful_basis_note` (`ndpa_6_1_e` public task + documented consent) — **re-scope AC4.3/AC5.1**, NOT a per-row blank-reject. Intake is **ONE reusable, channel-agnostic normalisation layer** (messy input → canonical `respondent` + `submission`) — the intake-side twin of 13-33 ("many intakes, one registry"), built ONCE, NOT a one-off WhatsApp parser; for launch an **assisted-cleaning tool** (freeform text → canonical sheet + review flags) handles current volume. The **DPIA Appendix H** update for the proxy-collection pattern (untrained head collecting NIN/phone → processor relationship + paper-retention) gates the CASCADE go-live, **not** the importer build — confirm the evidence form with the DPIA owner.
> 3. ~~**Rate-chart coordination:** association `core` rows are **EXCLUDED from deep-field rate charts**~~ ⛔ **STRUCK 2026-08-11 (R-E)** — they are included, with a "not asked" band and a published `n`. Original text follows for the record: (Axis-2 completeness — they weren't asked those questions; label "field-collected sample"); the "verified registry" headline is an honest **COMPOSITION** (member-verified + association-confirmed + self-declared), never a binary that hides them. Coordinate with 12-5/12-7.
> **One remaining EXTERNAL gate (NOT a build blocker):** tier-2 "Member-verified" needs a member-side confirmation SMS → **Termii sender-ID** (Awwal-owned, long-lead — like Resend Pro, deferred until its dependency stories finish). **Tier-1 "[Association] — confirmed member" ships WITHOUT it** (progressive enhancement, 13-38), so the importer + the tier-1 cascade go-live are unblocked. Refs: [taxonomy Axis-3 §27-34,45-46] · [13-33 AC4 + `docs/registry-unified-ingestion-contract.md`] · [13-20 `SKILL_TAXONOMY` `tiling`] · [12-4/12-5/12-7] · [13-38 badge] · [sheet spec §2/§4 + Appendix B].

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- Authored 2026-06-25 by Bob (SM) via canonical *create-story, per SCP-2026-06-25-launch-campaign (Epic 13). Sheet = FROZEN for Monday 2026-06-29 (zero-cost, no gate); importer = FAST-FOLLOW (the cascade is async). REUSE the Epic 11 import spine — do NOT rebuild it. -->

## Story

As a **Super Admin ingesting member lists collected by association heads via the umbrella-body cascade**,
I want **a frozen one-row-per-member condensed sheet whose columns map 1:1 to the registry, plus an `imported_association` source on the existing Epic 11 import path (dry-run → confirm → 14-day rollback, phone-dedup, `imported_unverified` status)**,
so that **sheets collected this week round-trip into the canonical registry next week with zero re-keying, land in the honest Tier-2 stratum (excluded from fraud/marketplace/verify until verified), and don't double-count members who already self-registered.**

## Context & Why This Splits Monday-vs-Build

The Monday umbrella-body meeting presents a **condensed data sheet** (physical + electronic) that association heads fill on behalf of members — the cascade (umbrella head → association head → members) makes the **association head the enumerator-equivalent**, supplying the accountability that self-serve groups lacked [Source: docs/launch-campaign/association-condensed-sheet-spec.md:5,7].

**The cascade is inherently async** (heads collect over days/weeks), so the Monday deliverable is the **frozen sheet** (the spec doc), NOT a working importer. The association importer is a **fast-follow** (this story's build portion). Sheets collected this week import cleanly next week; a Google Form mirroring the exact columns is an acceptable interim that exports to the same CSV [Source: docs/launch-campaign/association-condensed-sheet-spec.md:48].

### REUSE the Epic 11 import spine — do NOT rebuild
- **Story 11-1 is DONE:** `import_batches` table (file-hash UNIQUE, parser stats, lawful-basis capture, `status` active/rolled_back) [Source: apps/api/src/db/schema/import-batches.ts:51,61,74,82]; nullable NIN + partial-unique-where-NIN-present; `respondents.status` enum including `imported_unverified`; the status gate that excludes `imported_unverified` from fraud-detection / marketplace-extraction / partner-API `verify_nin` [Source: apps/api/src/db/schema/respondents.ts:9-13,30-36] [Source: docs/launch-campaign/association-condensed-sheet-spec.md:46].
- **Story 11-2 is ready-for-dev, NOT built:** the import service — dry-run/confirm/rollback endpoints, CSV/XLSX parsers, auto-skip on phone/email match, lawful-basis prompt, 14-day rollback [Source: _bmad-output/planning-artifacts/epics.md:2956-2977] [Source: _bmad-output/implementation-artifacts/11-2-import-service-parsers.md].

This story **pulls the association-source slice of 11-2 forward** (ITF-SUPA/other sources stay Phase 5) and adds the association source config ON that backbone [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:77]. The audit actions `import_batch.created`/`rolled_back` are already generic — no new audit action [Source: docs/launch-campaign/association-condensed-sheet-spec.md:46].

### The frozen column spec (cite — this IS the import column-mapping)
12 member columns, FROZEN [Source: docs/launch-campaign/association-condensed-sheet-spec.md:22-37]: S/N (sheet-only) · Surname→`lastName` · First name→`firstName` · **Phone (primary dedup key, required)**→`phoneNumber` · Gender→`raw_data.gender` · DOB-or-Age→`dateOfBirth`/`raw_data.age_years` · **LGA (primary clustering axis, required)**→`lgaId` · Town/Ward→`raw_data.town` · **Trade (from Appendix B list, required)**→`marketplace_profiles.profession` · Years experience→`marketplace_profiles.experience_level` · NIN (optional)→`nin` · **Consent Yes/No**→`consentMarketplace`. The sheet's column order **is** the import column-mapping — frozen so it round-trips [Source: docs/launch-campaign/association-condensed-sheet-spec.md:47].

## Acceptance Criteria

### AC1 — The condensed sheet is FROZEN (Monday deliverable, zero-cost, no gate)
1. The condensed-sheet spec is treated as **FROZEN v1** for the Monday 2026-06-29 umbrella-body meeting: the per-association header block (umbrella body / association name / head name & phone / primary LGA / date / declared member count) and the **12 member columns** in the spec's exact order are the authoritative import column-mapping [Source: docs/launch-campaign/association-condensed-sheet-spec.md:12-37]. This AC is satisfied by the existing FROZEN spec doc — this story does NOT re-author it; it cites it as the contract the importer must honour.
2. The controlled lists are the import validation contract: LGA validates against `lgas.code` (Appendix A, 33 LGAs) [Source: docs/launch-campaign/association-condensed-sheet-spec.md:70-72]; Trade comes from the Appendix B suggested list (free-text variance kills clustering) [Source: docs/launch-campaign/association-condensed-sheet-spec.md:74-76].
3. **Operator-gated inputs that gate PRINT/AIRING, not this build:** Appendix B trade-list confirmation/extension, the Yoruba translation of the §4 declaration + headers, and print logistics are Awwal's pre-print inputs [Source: docs/launch-campaign/association-condensed-sheet-spec.md:62-66] — noted, NOT blocking the importer build.

### AC2 — `imported_association` source added (the ONLY schema touch)
1. `imported_association` is added to `respondents.source` enum (currently `enumerator | public | clerk | imported_itf_supa | imported_other`) [Source: apps/api/src/db/schema/respondents.ts:21-27], with the matching DB-layer CHECK constraint updated in lockstep (parity with how 11-1 manages the status CHECK [Source: apps/api/src/db/schema/import-batches.ts:28-33]).
2. A per-source config block for the association source is added in `import-sources.ts` (the per-source column-mapping + parser config registry introduced by Story 11-2) — the association mapping IS the frozen 12-column spec [Source: docs/launch-campaign/association-condensed-sheet-spec.md:46]. NO other schema change (the audit actions are already generic; `import_batches` already supports it).

### AC3 — Association importer on the 11-2 backbone (dry-run → confirm → rollback)
1. The association sheet (XLSX/CSV, columns = the frozen headers) goes through the **existing Epic 11-2 import service** path `POST /api/v1/admin/imports/dry-run` → `/confirm` → `/:id/rollback` [Source: docs/launch-campaign/association-condensed-sheet-spec.md:47] — this story wires the association source ONTO that path; it does NOT build a parallel import pipeline.
2. The import reuses the 11-2 mechanics unchanged: file-hash dedup (`import_batches.file_hash` UNIQUE) [Source: apps/api/src/db/schema/import-batches.ts:61], auto-skip on phone/email match against existing respondents (any source), lawful-basis prompt, and the 14-day rollback (soft-delete via status flip, not row delete) [Source: docs/launch-campaign/association-condensed-sheet-spec.md:47-49].
3. ~~Imported rows land `status = imported_unverified` … so they are **excluded from fraud-detection, marketplace-extraction, and partner-API `verify_nin`** by the existing 11-1 status gate (the honest Tier-2 stratum).~~
   > 🔴 **CORRECTED 2026-08-31 (adjudication).** The struck text **contradicted the ruling at the top of this very story** — Awwal, 2026-07-19: "Marketplace = INCLUDE, with a badge" and "Public /insights = INCLUDE in skills + LGA coverage COUNTS". The AC was written before that ruling and never revised when the ruling landed, so a dev reading top-to-bottom would have met the ruling at line 7 and then been instructed to violate it at line 75 — and the AC, being the checkable artefact, would have won. This is the "a record about the work is not the work" failure in its most expensive form: the exclusion is one status constant, and shipping it would have made every association member invisible on the surface the channel exists to populate.
   >
   > **The corrected AC3.3:**
   > - Imported rows land `status = imported_unverified`, which remains correct as a **provenance** marker. What it must NOT do is act as a blanket surface gate.
   > - **Marketplace — INCLUDE.** Association members are extractable and appear on cards, each carrying the provenance badge "[Association] — confirmed member" (render = 13-38). Never a bare "✓ Verified" (R1: no NIMC path exists).
   > - **Public /insights — INCLUDE** in headcount, LGA coverage and the skills breakdown. This is load-bearing: the rows only reach `registry_unified` because they satisfy the AC3.4 ingestion contract (respondent row **and** submission row), and `registry_unified` is what `/insights` aggregates over.
   > - **Fraud-detection — INCLUDE.** Excluding an entire import source from fraud checks does not make the data cleaner; it removes the only mechanism that would notice a padded roll. The 2026-07-19 ruling's own anti-roll-padding argument requires these rows to be *checked*, not exempted.
   > - **Partner-API `verify_nin` — EXCLUDE, and this exclusion is retained deliberately.** It is the one place the struck text was right, for a reason that survives the reframe: a NIN on an association sheet was **transcribed by a proxy**, not presented by its holder. Answering an external "is this NIN verified" query on proxy-transcribed data would assert something no one checked. Axis-3 `nin_on_file ≠ verified` (R1).
   > - **The one genuine exclusion is COMPLETENESS, not verification** (ruling §4): the 12-column core sheet was never asked the deep-field questions, so these rows stay out of deep-field rate charts (unemployment %, income) and are labelled "(field-collected sample)". `PIPELINE_EXCLUDED_STATUSES` is about `rolled_back`, not about this.
   >
   > ⏩ **SUPERSEDED 2026-09-12 by R-A2** — `imported_unverified` has been REMOVED from `PIPELINE_EXCLUDED_STATUSES` (only `rolled_back` remains), 13-58's badge shipped first as this note required, and the fraud side is fed by an operator script. The note below is kept as the 2026-08-31 record. See § Adjudication.
   >
   > ✅ **VERIFIED AGAINST THE CODE, 2026-08-31 — the gate is LIVE, and must not be flipped yet.**
   > `PIPELINE_EXCLUDED_STATUSES` (`apps/api/src/db/schema/respondents.ts:63`) is `['imported_unverified', 'rolled_back']`, and it is read by `marketplace-extraction.worker.ts:207` and `fraud-detection.worker.ts:59`. So association rows are excluded from BOTH surfaces **today**, exactly as the struck AC said — the struck text was not describing an intention, it was describing working code.
   >
   > **This is a sequencing dependency, not an oversight, and the order is load-bearing:**
   > 1. **Do NOT remove `imported_unverified` from the gate before 13-38 ships.** Opening the marketplace first would put association members on cards with **no provenance badge** — an unbadged card reads as an ordinary verified listing, which is precisely the "never a bare ✓ Verified" failure ruling §3 forbids. Fixing the exclusion early would breach the ruling faster than leaving it.
   > 2. **13-38 (badge render) ships first.** Then removing the status from the gate is safe, because the disclosure exists to carry it.
   > 3. **Fraud-detection can be reopened independently of 13-38** — it has no public surface and therefore no badge dependency. It is the anti-roll-padding mechanism the ruling itself relies on, and it is currently switched off for the one source most exposed to padded rolls. Reopening it needs its own RED-verified test (assert an `imported_unverified` respondent IS enqueued/checked), because a worker that silently skips is invisible in green tests.
   >
   > ⛔ **What is NOT gated by this, and is therefore live right now:** `/insights`. `registry_unified` filters only `rolled_back` (2026-08-31), so imported association rows **already count** in headcount, LGA coverage and skills the moment they land. Ruling §2 is satisfied without any further change — which also means an import is publicly visible immediately and a mistake is publicly visible immediately. Dry-run before confirm.
   >
   > 📌 Tracked as **R-A2** below.
4. **⚠️ 13-33 AC4 ingestion-contract (John/PM 2026-07-19) — write respondent AND submission, or members are invisible. → GOVERNED BY the ⛔ BLOCKING OPEN DECISION at the top of this story (mapping + surface-policy ruling awaits Awwal's sign-off).** 13-33 shipped the canonical respondent-anchored `registry_unified` read + the ingestion contract: **every channel writes a `respondents` row AND a `submissions` row with `raw_data`** [Source: docs/registry-unified-ingestion-contract.md §Source #3]. This importer is **source #3** and MUST satisfy it. The frozen sheet maps **Trade → `marketplace_profiles.profession`** (Context §frozen-column-spec) — but that alone leaves association members **INVISIBLE to the public /insights skills breakdown and every marketplace/analytics surface that reads `raw_data->>'skills_possessed'` via `registry_unified`**: they'd be counted (respondent row) but answerless. So the importer MUST also write a `submissions` row whose `raw_data` carries the member's **Trade as the canonical skills key (`skills_possessed`)** (alongside the `gender`/`dob`/`town`/`age_years` it already maps to `raw_data.*`), so association members surface in skills/insights, not merely as a marketplace profile + a headcount. When this lands, implement the 13-33 AC4 `it.todo` in `apps/api/src/services/__tests__/registry-ingestion-contract.test.ts` (drive the importer; assert BOTH rows exist). [Source: 13-33 AC4]

### AC4 — Required-field + dedup discipline that makes or breaks the data
1. **Phone is mandatory** — a row with no phone can't be deduped or re-contacted; the importer treats it as invalid (row-level failure with a clear reason, not a silent insert) [Source: docs/launch-campaign/association-condensed-sheet-spec.md:29,40]. Phone normalises to +234 on import.
2. **Dedup against existing individuals:** the import auto-skips any row whose phone (or NIN, when present) already exists in any source, so a member who already self-registered won't double-count [Source: docs/launch-campaign/association-condensed-sheet-spec.md:49]. NIN is optional (nullable post-11-1; the partial-unique index protects FR21 when NIN is present) [Source: docs/launch-campaign/association-condensed-sheet-spec.md:36].
3. ~~**Consent is the gate:** Consent = "Yes" → `consentMarketplace = true`; rows marked **No or blank are NOT entered**.~~
   > 🔴 **CORRECTED 2026-08-31 (adjudication).** Ruled by Awwal, 2026-08-24: *"for the consent record it as accepted, there is no need for unknown. This is not scraped data, it was sourced directly and the association knows about the use in the registry."*
   >
   > **The corrected AC4.3:**
   > - **Explicit `No` → the row is NOT entered.** Unchanged, and non-negotiable.
   > - **Explicit `Yes` → `consentMarketplace = true`.** Unchanged.
   > - **BLANK → entered, `consentMarketplace = true`, and recorded as consent-by-channel** — not dropped, and not parked in an "unknown" tier. The blank is an artefact of transcription, not a refusal: the member volunteered their details TO their association FOR this registry, through a named accountable head, knowing the purpose. Treating that silence as refusal would discard real people who did consent, and would do it invisibly.
   > - **The provenance must be stored, not assumed.** The basis is recorded per row (batch-level association name + `defaultLawfulBasis: 'ndpa_6_1_e'`), so a later reader can tell a `Yes`-on-the-sheet consent from a channel consent. "Recorded as accepted" is a ruling about the DEFAULT, not a licence to forget which rows were explicit.
   > - ⚠️ This is a **per-source** rule, justified by the accountable-source argument. It does NOT generalise: a bulk list with no named head and no member relationship gets no such default.
4. **Trade is validated against the controlled list** (Appendix B); free-text "Tailor"/"Tailoring"/"fashion designer" must not become three clusters of one [Source: docs/launch-campaign/association-condensed-sheet-spec.md:41].

### AC5 — Lawful basis, reconciliation, and source-by-construction attribution
1. Import **lawful basis** records `ndpa_6_1_e` (public task — a government labour registry) WITH the per-member Consent column as the defensible backstop; `lawful_basis_note` cites this sheet + the meeting date + the **consent-evidence form reference** (`ASSOC-YYYYMMDD-…`). **✅ DPIA DRAFTED 2026-07-20 (Iris):** the proxy-collection pattern is Channel A of `docs/legal/dpia-appendix-h-multichannel-collection-v1.md` (§H-MC); the consent-evidence form is `docs/legal/association-member-consent-evidence-form-v1.md`; DPO/oversight = the **SABER Focal Person** (resolved). Remaining = Ministry ratification + NDPC filing (tracker: `docs/legal/dpia-multichannel-signoff-v1.md`) — gates the CASCADE go-live, not the importer build. [Source: docs/launch-campaign/association-condensed-sheet-spec.md:59] [Source: apps/api/src/db/schema/import-batches.ts:74-75].
2. **Reconciliation:** `rows_inserted` vs the head's **declared member count** (sheet header) surfaces gaps as a data-quality check / follow-up trigger [Source: docs/launch-campaign/association-condensed-sheet-spec.md:20,49].
3. **Source-by-construction attribution:** association-sheet rows are attributed `imported_association` by the ingestion path — they need NO "How did you hear about us?" question (that's Story 13-1's self-report, which does NOT run on imports) [Source: docs/launch-campaign/attribution-spec.md:17,31-34]. (A member who instead self-registers *direct* on the website picks "Association / cooperative" in 13-1's question — a separate path.)
4. **⚠️ Member-side verification — the incentive is also a data-integrity attack vector** (peer review 2026-06-25). The association pitch ("register your members → the State sites a textile centre where YOU are") **incentivises roll-padding with ghost members**, and the declared-vs-received reconciliation (AC5.2) **cannot catch it — the head controls both numbers.** Dedup catches duplicates, not fabrications. So `imported_association` rows are held as **Tier-2 `imported_unverified`** until a member-side check: a **confirmation SMS** (once Termii sender-ID clears) OR a **sampled call-back audit** of N rows per batch before any row is promoted/counted as verified. The verification mechanism (SMS vs sampled call-back) is a deliberate AC, not an afterthought.
5. **⚠️ Proxy collection is a NEW DPIA pattern, not just an import format** (peer review 2026-06-25). An **untrained association head collecting members' NIN/phone on a paper sheet** introduces: a **processor/controller relationship**, **paper-retention + security** obligations, and **proxy-consent** provenance. **Appendix H (DPIA) needs a real update** for this collection pattern — a per-member consent column is necessary but NOT sufficient. This gates the *cascade go-live*, separate from the importer build.

### AC6 — Tests
1. Importing a valid frozen-format sheet inserts respondents with `source = imported_association`, `status = imported_unverified`, consent mapped, trade validated, phone normalised — asserted end-to-end through the dry-run → confirm path.
2. Required-field failures (no phone) and consent=No/blank rows are skipped/failed with clear reasons; a phone/NIN that already exists auto-skips (no double-count).
3. ~~`imported_unverified` rows are confirmed excluded from the fraud/marketplace/verify paths by the existing status gate (regression assertion).~~ ⏩ **Corrected in step with AC3.3 (R-A2, 2026-09-12):** the regression assertions now pin the OPPOSITE for marketplace + fraud — the real gate is OPEN for `imported_unverified` and STILL SHUT for `rolled_back` (`marketplace-extraction.worker.gate-open.test.ts`, `fraud-detection.worker.gate-open.test.ts`, both RED-verified); `verify_nin` exclusion is unchanged. Full `pnpm test` green; tsc + lint clean.

## Tasks / Subtasks

> ⚠️ **These checkboxes were never ticked, and they do NOT describe current state.** AC1–AC4 + AC3.4 shipped to prod on 2026-09-05 (see the status banner at the top and the Change Log), and R-A2 is built and reviewed (§ Adjudication). They are left unticked rather than ticked from memory: ticking them honestly means re-verifying each against the code, which no session has done line by line.

- [ ] **Task 1 — Confirm the frozen sheet as the import contract (AC1)**
  - [ ] Treat `docs/launch-campaign/association-condensed-sheet-spec.md` as FROZEN v1; do NOT re-author it. Confirm the 12-column order + header block are the column-mapping the importer implements (AC1.1) [Source: docs/launch-campaign/association-condensed-sheet-spec.md:12-37].
  - [ ] Record the controlled-list validation contract: LGA → `lgas.code` (Appendix A), Trade → Appendix B (AC1.2). Note the operator pre-print inputs (Appendix B confirmation, Yoruba translation, print logistics) as PRINT-gating, not build-gating (AC1.3) [Source: docs/launch-campaign/association-condensed-sheet-spec.md:62-66].

- [ ] **Task 2 — Add the `imported_association` source (AC2)**
  - [ ] Add `imported_association` to `respondentSourceTypes` [Source: apps/api/src/db/schema/respondents.ts:21-27] and update the DB CHECK constraint in lockstep (parity with the 11-1 status-CHECK pattern) [Source: apps/api/src/db/schema/import-batches.ts:28-33].
  - [ ] Add the association per-source config block in `import-sources.ts` (the 11-2 source registry) — the frozen 12-column mapping (AC2.2). No other schema change.

- [ ] **Task 3 — Wire the association importer on the 11-2 backbone (AC3, AC4)**
  - [ ] Wire the association source onto the EXISTING 11-2 `dry-run → confirm → rollback` service + endpoints [Source: docs/launch-campaign/association-condensed-sheet-spec.md:47] — reuse file-hash dedup, phone/email auto-skip, lawful-basis prompt, 14-day rollback; do NOT build a parallel pipeline (AC3.1, AC3.2).
  - [ ] Map columns per the frozen spec; enforce phone-mandatory (+234 normalise), consent-Yes-only entry, trade-from-Appendix-B validation, optional NIN (AC4). Rows land `status = imported_unverified` (AC3.3) [Source: apps/api/src/db/schema/respondents.ts:9-13].

- [ ] **Task 4 — Lawful basis, reconciliation, attribution-by-construction (AC5)**
  - [ ] Record `ndpa_6_1_e` + per-member consent backstop; `lawful_basis_note` cites the sheet + meeting date (AC5.1) [Source: apps/api/src/db/schema/import-batches.ts:74-75].
  - [ ] Surface `rows_inserted` vs the head's declared member count for reconciliation (AC5.2) [Source: docs/launch-campaign/association-condensed-sheet-spec.md:20,49].
  - [ ] Confirm `imported_association` is the by-construction channel (no 13-1 self-report question on imports) (AC5.3) [Source: docs/launch-campaign/attribution-spec.md:31-34].

- [ ] **Task 5 — Tests (AC6)**
  - [ ] Real-DB integration: valid sheet → `imported_association` / `imported_unverified` rows, consent mapped, trade validated, phone normalised (AC6.1); no-phone fail, consent=No/blank skip, phone/NIN-exists auto-skip (AC6.2); status-gate exclusion regression (AC6.3).
  - [ ] Full `pnpm test` green; tsc + lint clean.

## Dev Notes

### Architecture & engine map (cite these exact targets)
- **Source enum (the ONLY schema touch):** `apps/api/src/db/schema/respondents.ts:21-27` (`respondentSourceTypes`) + the matching DB CHECK; status enum incl. `imported_unverified` at `:30-36`.
- **Import spine (REUSE — 11-1 done):** `apps/api/src/db/schema/import-batches.ts:51-85` (`import_batches`: `file_hash` UNIQUE `:61`, `lawful_basis`/`lawful_basis_note` `:74-75`, `status` active/rolled_back `:82`, status index `:85`). The status CHECK-management pattern to mirror for `source` is at `:28-33`.
- **Import service (REUSE — 11-2 ready-for-dev, pull the association slice forward):** `_bmad-output/implementation-artifacts/11-2-import-service-parsers.md` + epics §11.2 [Source: _bmad-output/planning-artifacts/epics.md:2956-2977] — `POST /api/v1/admin/imports/dry-run | /confirm | /:id/rollback`, CSV/XLSX parsers, phone/email auto-skip, lawful-basis, 14-day rollback. `import-sources.ts` is the per-source config registry it introduces.
- **Frozen column spec (the column-mapping):** `docs/launch-campaign/association-condensed-sheet-spec.md:12-37` (header block + 12 columns + import targets) and `:70-76` (Appendix A LGAs, Appendix B trades).

### REUSE-not-rebuild discipline (read before coding)
- The import service, parsers, dry-run/confirm/rollback, dedup, and lawful-basis ALL come from Story 11-2 — this story adds **one enum value + one `import-sources.ts` config block** and wires the association source onto that path. If you are writing a new import pipeline, stop — pull the 11-2 slice forward instead [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:77].
- The audit actions `import_batch.created` / `rolled_back` are already generic — **no new audit action** [Source: docs/launch-campaign/association-condensed-sheet-spec.md:46].

### Critical implementation rules (from project-context.md)
- **Drizzle schema enum change** — update the Drizzle enum AND the DB CHECK constraint together (the 11-1 pattern); schema files must NOT import from `@oslsr/types` (inline the constant). CI uses `db:push:force`.
- **AppError only**; **parameterised SQL only**; **structured Pino logging** `{domain}.{action}` (e.g. `import.association_skipped`); do NOT log raw PII.
- **Tests** — real-DB integration uses `beforeAll`/`afterAll`, a test org/respondent fixture, never prod data; run the suite against a scratch DB (`app_test`), not UAT `app_db`.

### Dependencies & sequencing
- **HARD deps:** 11-1 (DONE — `import_batches`, nullable NIN, status gate). **SOFT-but-needed:** 11-2 (ready-for-dev) — this story pulls its association slice forward; if 11-2's service isn't built yet, this story builds the association source ONTO the 11-2 design (do not fork it).
- **⚠️ EFFORT FLAG (PM review 2026-06-25):** the "ONLY one enum value + one `import-sources.ts` config block" framing holds **only once 11-2's service exists**. If 11-2 is NOT yet built, 13-2's importer carries the cost of standing up the 11-2 service for the association source (dry-run/confirm/rollback endpoints + CSV/XLSX parser + dedup wiring) — that is NOT a config tweak. **Recommendation: sequence 11-2 first, or budget 13-2 to absorb the 11-2-for-association build.** This is fine because the importer is fast-follow (not Monday) — but the effort must not be under-estimated at planning.
- **Tier:** sheet = FROZEN for Monday (zero-cost, no gate); importer = **fast-follow** (post-spend, the cascade is async) [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:57,70].
- **Pairs with:** 13-1 (source-by-construction attribution — no self-report question on imports), 13-6 (LGA×trade coverage consumes these rows).

### Scope OUT (do not build)
- ITF-SUPA / other import sources (stay Phase 5) [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:77].
- A parallel/new import pipeline (reuse 11-2).
- Auto-merge of imported rows into existing field-verified respondents (Epic 11 explicitly NOT-done — manual Super-Admin action only) [Source: _bmad-output/planning-artifacts/epics.md:2918].
- Re-authoring the sheet spec (it is FROZEN — cite it).
- The Yoruba translation itself (operator pre-print input; the bilingual sheet rendering is Awwal's; the wizard Yoruba layer is Story 13-5).

### References
- [Source: docs/launch-campaign/association-condensed-sheet-spec.md] — frozen header + 12 columns (§1-2), ingestion path (§3), consent/lawful-basis/language (§4), Appendix A LGAs + B trades
- [Source: apps/api/src/db/schema/respondents.ts:21-27,30-36,9-13] — source enum (add `imported_association`) + status enum + status-gate comment
- [Source: apps/api/src/db/schema/import-batches.ts:51-85] — import_batches (REUSE) + status-CHECK pattern
- [Source: _bmad-output/planning-artifacts/epics.md:2956-2977] — Story 11.2 import service scope (the backbone)
- [Source: docs/launch-campaign/attribution-spec.md:17,31-34] — source-by-construction attribution
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:57,70,77] — tiering + pull-11-2-forward
- [Source: _bmad-output/implementation-artifacts/sprint-status.yaml#13-2-association-group-channel-and-import] — scope note

## Residual Ledger

Open items this story has NOT discharged. Each names the trigger that reopens it — a residual with no trigger is a wish.

| ID | Residual | Why it is not closed | Reopen trigger |
|----|----------|----------------------|----------------|
| ~~**R-A1**~~ **DISCHARGED 2026-09-05** | `Date of birth (or Age)` is one column offering two facts; a bare age fails `normaliseDate` and is dropped. | **The residual said "count it first, do not guess" — so it was counted, on both real batches.** ASNAT tilers: **31 of 56** rows (55%) carried an age, not a date, and lost it. Farming: **0** — that source has no DOB/age column at all, so 8,222 rows raised the warning zero times. **Verdict: material for PAPER intake, immaterial for machine extracts.** The fix belongs at the next sheet re-print (split the box into two columns), not in the parser, because the loss only occurs on the handwritten route. **Closed as a SHEET-DESIGN item, not a code item.** No age data is recoverable for the 31 — the raw cell survives in `raw`, so a later pass could re-read it if the sheet is ever re-processed. |
| **R-A2** | ✅ **BUILT 2026-09-12 → REVIEWED + ADJUDICATED 2026-09-13 (ACCEPTED as amended; UNCOMMITTED) — see § Adjudication.** Built: all FOUR changes, and the engine fixed besides; see § R-A2 Implementation below. ⛔ NOT RUN — (d) is carved to R-A7, so this changed CAPABILITY, not STATE.** Original: `imported_unverified` is in `PIPELINE_EXCLUDED_STATUSES`, so association rows are excluded from **marketplace-extraction** and **fraud-detection**, contradicting the 2026-07-19 ruling §1. | Deliberate sequencing, not an oversight. Removing the status from the gate before **13-38** ships would put members on marketplace cards with **no provenance badge** — worse than the exclusion, and a direct breach of ruling §3. | **Marketplace half:** ⚠️ **CORRECTED 2026-09-05 — the gating story is 13-58, NOT 13-38.** The two carry the SAME slug (`marketplace-association-confirmed-badge`) and 13-58 was *carved out of* 13-38 on 2026-08-09; 13-38 closed on prod 2026-08-18 having shipped experience + trading names, **not** the association badge. Reading the done one as the gate would have declared this residual dischargeable months early. **13-58 is now UNBLOCKED and its own gate is discharged:** it was hard-gated on `imported_association` existing at all (measured 2026-08-09: `public 314 / enumerator 1`, the source absent, so "every AC renders for ZERO people"). Measured 2026-09-05: **`imported_association` = 8,278**, 95.5% of the registry. So: ship 13-58, then **R-A2 becomes TWO changes, not one.** **(a)** Remove `imported_unverified` from `PIPELINE_EXCLUDED_STATUSES`, with a RED-verified test asserting such a respondent IS extractable; **and (b)** widen `_backfill-marketplace-extraction.ts`'s `source` predicate (`:126-140`, currently `WHERE r.source = 'public'`) so imported rows are eligible, then RUN it as an operator one-shot. ⛔ **(a) WITHOUT (b) CREATES ZERO PROFILES.** The import service holds no reference to the marketplace-extraction queue; the only production enqueue is `submission-processing.service.ts:1349-1353`, which the importer never calls; and the backfill script skips every imported row. Found at 13-58's adversarial code review as **H3 / 13-58 R7** (2026-09-08) — the raw material exists (AC3.4 gives every imported row a `submissions` row), so the fix is small, but it is **not implied by the gate change**, and the sentence this replaces said it was. A dev following the old wording would have made the one-line change, seen nothing happen, and hunted the cause in the badge. → [[pattern-ship-a-fix-that-never-fires]] ⚖️ **MECHANISM RULED 2026-09-09 (Awwal): widen the script's predicate, NOT an import-time enqueue** — it keeps the operator dry-run checkpoint and does not push 8,278 jobs through BullMQ workers that run **in** the API process on a 2 GB box. **PREDICT BEFORE RUNNING:** profiles created should equal imported respondents with `consent_marketplace = true`; measure that from prod FIRST and compare, per [[pattern-predict-then-compare]]. ⚖️ **ORDERING RULED 2026-09-12 (Awwal): BOTH HALVES GO TOGETHER, AS ONE STORY.** Adjudication recommended splitting them — the fraud half has no public surface and closes a live anti-roll-padding gap, so it could ship sooner and cheaper. Awwal ruled one story, and the trade is worth naming so it is not re-litigated: a single pass means ONE review and ONE adjudication over a change that makes up to 8,278 people publicly visible, instead of a safety fix waiting behind a publicity event. ⛔ **Consequence for whoever builds it: the marketplace half is a PUBLIC PUBLISH with no staging step (R-A3), so the dry-run + predict-then-compare is not optional, and the fraud half must not be quietly dropped because the marketplace half is the interesting one.** 13-58's R6 and R7 were handed here at its close-out. ~~Fraud half is independent and should move sooner — no public surface, no badge dependency, and it is the anti-roll-padding mechanism the ruling relies on, currently off for the source most exposed to padded rolls.~~ ⛔⛔ **THE FRAUD HALF HAS THE SAME DEFECT AS THE MARKETPLACE HALF — measured 2026-09-12 at 13-58's close-out, and corrected here BEFORE a dev follows the old wording.** "Independent, just flip it" is a claim about executed code and had never been traced. **Opening the gate does NOTHING for fraud either.** Verified: `import.service.ts` holds **zero** queue references of any kind; `queueFraudDetection` is called from exactly ONE place, `submission-processing.service.ts`, which the importer never calls; and `fraud-detection.worker.ts:59` consults `PIPELINE_EXCLUDED_STATUSES` only as the defensive SECOND gate, exactly like `marketplace-extraction.worker.ts:211`. ⚠️ **AND IT IS WORSE THAN THE MARKETPLACE HALF:** marketplace at least has a create-profiles script to widen (`_backfill-marketplace-extraction.ts:137`), but there is **NO fraud backfill script at all** — nine `_backfill-*` scripts in `apps/api/scripts/` and not one queues fraud detection. The fraud half needs an enqueue path **WRITTEN**, modelled on the extraction backfill's shape (dry-run default, `--confirm-i-am-not-dry-running`, batched, predict-then-compare), not a predicate widened. **SO R-A2 IS FOUR CHANGES, NOT TWO:** (a) the gate constant; (b) widen `_backfill-marketplace-extraction.ts`'s `source` predicate; (c) a fraud-detection enqueue path for imported rows; (d) run (b) and (c) as operator one-shots, each with its own prediction measured from prod FIRST. ⭐ Third instance of this shape in one epic — **a sequencing argument is a claim about executed code and needs the same trace a fix does** (handoff §2aj). → [[pattern-ship-a-fix-that-never-fires]] |
| **R-A4** | The import makes **9,122 distinct phone numbers** reachable in the registry. It sends nothing itself — but a blast is one operator decision away, and **these people never consented to SMS specifically.** | Awwal's 2026-08-24 consent ruling covers being **counted**: the association gathered the data knowing it was for the registry. An unsolicited SMS is a **different act** from being counted, and inheriting permission for it from an import would be exactly the kind of silent widening this ledger exists to prevent. ⚠️ Note also: 9,563 rows resolve to only **9,122 distinct numbers** (441 shared — the same 441 the R2 fix stopped dropping). A blast reaches **handsets, not people**: for those 441, one message serves several, or reaches someone who never registered. Copy addressed to "you" would be wrong for them. | **Before any campaign targets this cohort.** Verified 2026-09-01 that the import path itself is silent: no queue/notifier/email import in `import.service.ts`, no DB trigger on `respondents` insert (only the marketplace tsvector + audit immutability), and every `SMSService`/`SmsOtpService` caller is user-initiated (OTP request, marketplace edit). The planned AC3.4 submissions-write does **not** change this — nothing listens on `submissions` inserts; `sendRegistrationAutoEmails` is an explicit call on a route the importer never touches. **Email is structurally safe** (no `email` column on `respondents`; `metadata.imported_email` is write-only — grep finds one write and no reads). **Phone is not** — `respondents.phone_number` is a real indexed E.164 column. So this residual is about the NEXT decision, not this one. |
| **R-A3** | `/insights` has **no gate at all** for imported rows — `registry_unified` filters only `rolled_back`, so an association import is publicly visible the instant it confirms. | This is ruling §2 working as intended, not a defect. It is logged because it is a **standing operational hazard**, not a bug to fix. | Permanent. Every association confirm is a public publish. Dry-run, read the plan, then confirm — there is no staging step between the two. ➕ **Mitigated 2026-09-13 (not removed):** the import dry-run now returns a `predicted` integrity reading (inserted / matched / declared gap) from the same planner confirm uses, and the marketplace backfill can publish ONE batch at a time (`--batch-id`). Still no staging environment. |

| **R-A5** | The single Appendix B box **'Agriculture / Agro-processing'** spans TWO canonical slugs — `farming` and `food_processing` — so an agro-processor who ticks it is recorded as a farmer. | Mapped to `farming` on the dominant reading of "Agriculture", **not** because the collision is resolved. A cleverer rule cannot recover information the form never captured. | **The next sheet re-print.** Split the box in two. ⚠️ Not yet load-bearing: the 8,222-row farming import came from machine extracts carrying verbatim taxonomy LABELS ('Crop Farming', 'Food Processing/Preservation'), which resolve exactly and never touch this alias. It bites the day a coordinator fills the box by hand. |
| **R-A6** | **Name ORDER is not guaranteed for the 5,301 NCARES rows.** `splitName` takes the first token as the given name; the consolidation flagged every one of those rows `name_order_unreliable = YES`, because Yoruba registers are inconsistent about which name comes first. Some are stored inverted. | Far better than nameless, and **recoverable rather than lost**: `EXTRA_FIELDS` preserves the verbatim string in `metadata.import_extra.full_name` for all 8,222 rows (verified on prod), so the original survives the split and can be re-derived. | **Whenever a name-order signal becomes available** — an association head confirming, an SMS reply, or a NIMC match. Re-derive from `metadata.import_extra.full_name`; do not re-import. ⚠️ **Do NOT "fix" this by swapping the split rule** — that would invert the ones that are currently right. Any correction must be per-row and evidence-led. |

| **R-A7** | ⛔ **NEITHER OPERATOR SCRIPT HAS BEEN RUN.** R-A2's code is built and gated, but (d) is untouched: no marketplace profile has been created for an imported person, and no fraud detection exists for one. Until both run, R-A2 has changed *capability*, not *state*. | Deliberate — the brief forbids running them from dev, and the marketplace half is a public publish of up to 8,278 people with no staging step (R-A3). Both need a prediction measured from prod FIRST. | **OPEN — owner: adjudication.** Trigger: the Tailscale run, each script separately, dry-run → predict → compare → confirm. Fill in the two predict-then-compare rows above. ⚠️ The two are NOT equally reversible: the marketplace run publishes people, the fraud run publishes nothing. Do not confirm them in the same breath. **This residual is what stands between "the gate is open" and "8,278 people are on the marketplace"** — and an inert, ruled-but-unrun change is exactly how 13-58's R7 nearly got lost. ➕ **Review 2026-09-13:** (i) the fraud script now takes `--batch-id` (fails CLOSED on a malformed id) — **score the 56-row ASNAT batch first and read every detection** before touching the 8,222-row one; (ii) **it is not cheap** — the roll-padding cohort query is O(batch) per job, measured at **49 ms/call on a laptop** over a synthetic 8,222-row batch (≈ 7–8 min serial DB CPU for the farming batch; see the review's execution log for the full drain). Run it off-hours on the 2 GB box; (iii) the `migrate-fraud-thresholds-init.ts` runner must have run on prod (it does on deploy) so the three `padding_*` rows exist before calibration starts; (iv) **a THIRD operator one-shot now belongs to this residual — `_backfill-import-provenance-stats.ts` (Adjudication §A4 step 1b)**, and the marketplace publish is staged by `--batch-id` (step 5). |
| **R-A8** | The `roll_padding` thresholds are **calibrated from one measurement, not from the score distribution.** `padding_contact_reuse_min = 5` comes from R-A4's 9,563-rows-over-9,122-numbers finding; the identity weight and saturation curve are reasoned, not fitted. Nobody has seen what these produce over the real 8,278 rows. | The alternative was to invent a distribution or to ship no heuristic at all. The values are conservative in the direction that matters — silent on ordinary shared handsets. ~~and every one is a `fraud_thresholds` row, so they are tunable without a deploy~~ ⛔ **FALSE AS BUILT (review H3, 2026-09-13):** the seed skips a non-empty table and the self-heal bootstrap only fires on an empty one, so on prod the three `padding_*` rows would never exist and `updateThreshold` throws for a key with no row. Now TRUE once `scripts/migrate-fraud-thresholds-init.ts` (additive-only, wired into the deploy) has run. ⚠️ **AND THE SEVERITY SCALE IS NOW A CHOICE, NOT A GIVEN (review C1):** an import's composite is its duplicate score as a share of `duplicate_weight`, so a pair of identical names in one LGA scores 20 (`clean`), a triple 40 (`low`), a saturated cluster of ≥4 60 (`medium`), identity + saturated contact reuse 100 (`critical`) — and **tuning `duplicate_weight` for FIELD rows re-scales imports too.** | **ACCEPTED — owner: Awwal, with adjudication measuring.** Trigger: immediately after the first fraud run, read the severity distribution (`SELECT severity, count(*) FROM fraud_detections WHERE import_batch_id IS NOT NULL GROUP BY 1`) **BEFORE anyone acts on a single detection.** ⛔ A flood of `high`/`critical` means the thresholds are wrong, NOT that the roll is padded — treat the first run as calibration data, not as findings about real people. ⚠️ Yoruba name frequency makes same-name pairs in one LGA ordinary — the synthetic run in the review scored **8,102 of 8,222 `medium`** because its generator produced only 40 distinct names; it is NOT a calibration, but it shows how fast a common-name roll floods the queue. ➕ **PREDICT THE FLOOD BEFORE RUNNING (review):** measure the cluster-size distribution on prod first — `SELECT n, count(*) FROM (SELECT count(*) n FROM respondents WHERE source='imported_association' AND status<>'rolled_back' GROUP BY import_batch_id, lga_id, array_to_string(ARRAY(SELECT t FROM unnest(regexp_split_to_array(lower(btrim(coalesce(first_name,'')||' '||coalesce(last_name,''))), '\s+')) t WHERE t<>'' ORDER BY t), ' ')) c GROUP BY n ORDER BY n;` — every row in a cluster of 3 lands `low`, of ≥4 `medium`. If that is thousands of people, retune BEFORE the run, not after. ✅ **MEASURED 2026-09-13 (Adjudication §A3): 0 of 8,278 predicted flagged** — 34 same-name pairs, 0 shared phones. ⚠️ **Which means the first run calibrates NOTHING**, and `padding_contact_reuse_min`'s only source (R-A4's 9,563/9,122) does not describe the imported population at all — the "-CLEAN" files carry 8,278 distinct phones. **Trigger re-scoped:** the first batch that arrives NOT pre-cleaned — concretely, **the day any of the 1,491 `needs-eyes` rows are imported** (793 on shared phones): import them as their own batch with a `provenance_stats` record, run the fraud script on that batch at once, and read its distribution before acting. ✅ P3 (2026-09-13): `padding_contact_reuse_min = 5` is now sourced to the measured 345-shared-phone distribution of the consolidation, not R-A4. |
| **R-A9** | `FraudEngine` threw on **any** submission whose `questionnaire_form_id` is a sentinel — `import:<source>` AND the pre-existing `supplemental-survey`. Fixed here by a uuid guard, but the `supplemental-survey` cohort still has **no** fraud enqueue path, so that half of the fix is inert. | Latent, never fired: nothing enqueued fraud for either channel, so the crash had no victims until R-A2 tried to. Fixing the guard was in scope; giving another channel a fraud path is not. | **ACCEPTED — owner: whoever next wants fraud coverage for the supplemental-survey channel.** Trigger: a decision that those submissions should be scored. ⚠️ Do not read "the uuid guard is fixed" as "supplemental-survey is fraud-scored" — it is the same gap-versus-path distinction R-A2 spent four changes learning. |
| **R-A10** | Imported detections are **invisible to supervisors by construction** — they have no `enumerator_id`, so every team-scoped query excludes them. Only super-admin and assessor surfaces can see them. ⛔ **As built, the assessor surfaces could NOT (review H2, 2026-09-13):** `assessor.service.ts` still INNER-JOINed `users` in four queries. Fixed and pinned against a real DB. ⚠️ An import reaches the assessor audit queue only when `high`/`critical` or once a super-admin has recorded a resolution — there is no supervisor to do the first pass. | Correct, not a defect: an import belongs to no supervisor's team, and the supervisor resolutions (`enumerator_warned`, `enumerator_suspended`) are meaningless for one. Stated explicitly so it is not "discovered" later as a bug. | **ACCEPTED — owner: Awwal.** Trigger: if roll padding is ever meant to reach a supervisor queue, it needs a deliberate routing decision (by LGA? by association?), not a relaxation of the scope check. |

## R-A2 Implementation — Dev Agent Record (2026-09-12)

**Scope:** R-A2 ONLY. Every other AC shipped to prod on 2026-09-05 and is untouched.
**Ruling taken mid-build (Awwal, 2026-09-12):** ship (a)+(b) AND build (c) fully, *fixing the engine*.

### What the trace found before any code was written

R-A2 said the fraud half needed "an enqueue path written, modelled on the extraction
backfill". That was still too small. **An imported row could not be SCORED AT ALL**, and
three separate defects stood between the gate and a single fraud detection:

| # | Defect | Evidence (measured, not reasoned) |
|---|---|---|
| 1 | `fraud_detections.enumerator_id` was `uuid NOT NULL`; the engine coerced a missing enumerator to `''` | `SELECT ''::uuid` → `ERROR: invalid input syntax for type uuid: ""`. Every one of 8,278 jobs would throw, retry 3×, dead-letter. |
| 2 | All five field heuristics return 0 for an import, and `off_hours` is actively wrong | No GPS, no completion time; `recentSubmissions` loads via `eq(enumerator_id, '')`, which matches nothing because SQL `NULL` is never `= ''`. **The duplicate heuristic — the anti-roll-padding one — returned a confident zero.** All 8,222 rows of a batch share the operator's single import timestamp, so `off_hours` would have flagged the whole batch on the uploader's clock. |
| 3 | `FraudEngine.loadSubmissionContext` threw for ANY sentinel form id | `submissions.questionnaire_form_id` is `text` and holds `import:imported_association`; `questionnaire_forms.id` is `uuid`. Found by the integration test, not by reasoning. Latent for `supplemental-survey` too. |

⭐ **A fourth instance of [[pattern-ship-a-fix-that-never-fires]] in one epic** — and the
claim that failed the trace this time was the story's own: *"the fraud half closes a live
anti-roll-padding gap."* Like the two before it, it was a statement about executed code
that had never been executed.

### The four changes, as built

- **(a) The gate.** `imported_unverified` removed from `PIPELINE_EXCLUDED_STATUSES`;
  `rolled_back` kept. The existing tripwire in `marketplace-extraction.worker.gate-open.test.ts`
  was INVERTED (it asserted the real constant was still shut), and a mirror tripwire added on
  the fraud side — the gate is shared by both workers and only one side was pinned.
- **(b) The marketplace predicate.** `_backfill-marketplace-extraction.ts` widened from
  `source = 'public'` to an ALLOW-LIST (`public` + `imported_association`) — deliberately not a
  removal, which would have swept in `enumerator`/`clerk` rows the live path already serves.
  Two conditions the widening made necessary: ~~an **association vouch is required** (the ordering
  constraint says every card must carry the name; the badge derives from
  `metadata.association_name`, so this makes it structural rather than lucky)~~ ⚖️ **REVERSED by Awwal 2026-09-13:** no vouch ⇒ no badge, never no card (13-58's ruling) — the vouch condition was REMOVED from the SELECT (now `source IN ('public','imported_association')`); and
  **`rolled_back` is excluded** (no public row is ever rolled back, so it was unnecessary until
  now — without it the dry-run over-promises and predict-then-compare cannot tell that from a defect).
- **(c) The fraud path — engine fixed, then the script written.** `enumerator_id` is now
  nullable and a new `import_batch_id` FK carries accountability. ⛔ The uploader was explicitly
  **rejected** as a substitute: it would make a real super-admin the subject of thousands of
  detections on surfaces whose resolutions are `enumerator_warned` and `enumerator_suspended`.
  The heuristic registry is now **split by provenance** (field rows run the five; imports run
  only `roll_padding`), and `roll_padding` is a new heuristic in the `duplicate` category — roll
  padding IS duplicate detection, batch-scoped rather than enumerator-scoped, so it inherits the
  existing weight, column and review surfaces. `_backfill-fraud-detection-imports.ts` is the
  enqueue path: dry-run default, ugly confirm flag, batched with a pause (all ten BullMQ workers
  run IN the API process on a 2 GB box).
- **(d) NOT RUN.** Neither script has been executed against production.

### Two consumer sweeps the change forced, both silent failures if skipped

1. **`fraud-detections.controller.ts` used `.innerJoin(users, …)` in FOUR places.** An inner
   join DROPS null rows, so imported detections would have been scored, stored, and invisible
   on every fraud surface. Converted to `leftJoin`. Supervisor scope checks now DENY a null
   enumerator explicitly rather than relying on `includes(null)` being false by accident — an
   accident is not an access-control rule.
2. **The web table typed `enumeratorName: string` and rendered it raw**, so an imported
   detection would have shown a blank cell and `aria-label="Select null"`. A shared
   `fraudSubjectLabel()` now renders "Imported batch" — deliberately not "Unknown", because a
   reviewer must know it is a different KIND of subject before choosing a resolution.

### Predict-then-compare (predictions MEASURED read-only on prod 2026-09-13; observations owed by R-A7)

Per [[pattern-predict-then-compare]] — measure from prod FIRST, then run, then compare.
A control that reproduces the CURRENT live number is required before either run.

| Script | Predict from prod BEFORE running | Predicted | Observed | Verdict |
|---|---|---|---|---|
| `_backfill-marketplace-extraction.ts` | `imported_association` rows with `consent_marketplace = true`, a `submissions` row with `raw_data`, `status <> 'rolled_back'`, and NO existing `marketplace_profiles` row. The dry-run prints this by cohort plus the exclusion reasons (and, separately, how many cards will render badge-less) — reconcile EVERY line, not just the total. ⚠️ Control: the `public` cohort count must reproduce today's live figure, or the widening moved something it should not have. | **8,278 imported + 1 public** — measured read-only on prod 2026-09-13 (HEAD `afe1da5`): both batches fully consented, 0 rolled back, **0 without an association name**, 0 with a profile, all 8,278 carry their import submission | _(owed — R-A7)_ | _(owed)_ |
| `_backfill-fraud-detection-imports.ts` | `imported_association` rows with an `import_batch_id`, its IMPORT submission (`questionnaire_form_id LIKE 'import:%'`) with `raw_data`, `status <> 'rolled_back'`, and NO existing `fraud_detections` row. Expect one `fraud_detections` row per enqueued job once the worker drains: `SELECT count(*) FROM fraud_detections WHERE import_batch_id IS NOT NULL;` | **8,278 selectable (56 + 8,222); predicted severity: 8,278 `clean`, 0 flagged** — measured read-only on prod 2026-09-13 by replicating the heuristic in SQL over live thresholds. Identity clusters: 8,210 unique, **68 people in 34 same-name pairs** (a pair scores 20 → `clean`); **0 phones shared within a batch** | _(owed — R-A7)_ | _(owed)_ |

⛔ **The marketplace run is a PUBLIC PUBLISH of up to 8,278 people with no staging step
(R-A3).** The fraud run publishes nothing — its output reaches only internal review surfaces.
They are not equally reversible and should not be confirmed in the same breath.

### Gates run (executed, not reported from memory)

| Gate | Result |
|---|---|
| `tsc --noEmit` — types / api / web | 0 errors each |
| `pnpm --filter @oslsr/api lint` | eslint clean; all three drift guards green (405 files, 322 stories) |
| `pnpm --filter @oslsr/web lint` | clean |
| `pnpm --filter @oslsr/types lint` | clean |
| Types suite (`packages/types`, changed by this story — covered by neither api nor web shards) | **7 files, 117 passed** |
| API suite, `--shard=n/4`, sequential, vs `app_test` | **317 files, 4,479 passed**, 9 skipped |
| Web suite, `--shard=n/4`, sequential | **280 files, 3,095 passed**, 2 todo |

⚠️ The schema change was applied to the test DB with `db:push:full:force` and verified
(`enumerator_id` `is_nullable = YES`, `import_batch_id` present). **Prod gets it via CI's
`db:push` on deploy.**

### File List

Matches `git status` exactly (**31 entries**; the web `api/__tests__/` directory is new, and
this story file is itself one of them — a record that omits itself is not the authoritative
set to commit).

**Created (8):**
- `apps/api/scripts/_backfill-fraud-detection-imports.ts`
- `apps/api/scripts/__tests__/_backfill-fraud-detection-imports.test.ts`
- `apps/api/scripts/__tests__/_backfill-marketplace-extraction.integration.test.ts`
- `apps/api/src/services/fraud-heuristics/roll-padding.heuristic.ts`
- `apps/api/src/services/fraud-heuristics/__tests__/roll-padding.heuristic.test.ts`
- `apps/api/src/services/__tests__/fraud-engine.imports.integration.test.ts`
- `apps/api/src/workers/__tests__/fraud-detection.worker.gate-open.test.ts`
- `apps/web/src/features/dashboard/api/__tests__/fraud-subject-label.test.ts`

**Modified (23):**
- `_bmad-output/implementation-artifacts/13-2-association-group-channel-and-import.md` (this file)
- `apps/api/scripts/_backfill-marketplace-extraction.ts`
- `apps/api/scripts/__tests__/_backfill-marketplace-extraction.test.ts`
- `apps/api/src/controllers/fraud-detections.controller.ts`
- `apps/api/src/db/schema/fraud-detections.ts`
- `apps/api/src/db/schema/respondents.ts`
- `apps/api/src/db/schema/__tests__/fraud-schema.test.ts`
- `apps/api/src/db/seeds/fraud-thresholds.seed.ts`
- `apps/api/src/db/seeds/__tests__/fraud-thresholds.seed.test.ts`
- `apps/api/src/db/seeds/__tests__/seed-orchestrator.test.ts`
- `apps/api/src/services/fraud-engine.service.ts`
- `apps/api/src/services/fraud-heuristics/gps-clustering.heuristic.ts`
- `apps/api/src/services/productivity.service.ts`
- `apps/api/src/services/__tests__/fraud-engine.service.test.ts`
- `apps/api/src/workers/fraud-detection.worker.ts`
- `apps/api/src/workers/__tests__/marketplace-extraction.worker.gate-open.test.ts`
- `apps/web/src/features/dashboard/api/fraud.api.ts`
- `apps/web/src/features/dashboard/components/ClusterDetailView.tsx`
- `apps/web/src/features/dashboard/components/EvidencePanel.tsx`
- `apps/web/src/features/dashboard/components/FraudDetectionTable.tsx`
- `apps/web/src/features/dashboard/components/ReviewDialog.tsx`
- `packages/types/src/fraud.ts`
- `packages/types/src/validation/__tests__/fraud.test.ts`

**Added by the adversarial review (2026-09-13) — 9 more, 40 total (matches `git status --porcelain`, 40 lines):**
- Created: `apps/api/scripts/migrate-fraud-thresholds-init.ts`
- Created: `apps/api/scripts/__tests__/_backfill-fraud-detection-imports.integration.test.ts`
- Modified: `.github/workflows/ci-cd.yml` (deploy step runs the new runner)
- Modified: `apps/api/src/services/assessor.service.ts`
- Modified: `apps/api/src/workers/marketplace-extraction.worker.ts`
- Modified: `apps/web/src/features/dashboard/api/assessor.api.ts`
- Modified: `apps/web/src/features/dashboard/pages/AssessorCompletedPage.tsx`
- Modified: `apps/web/src/features/dashboard/pages/SupervisorFraudPage.tsx`
- Modified: `apps/web/src/features/dashboard/components/__tests__/ReviewDialog.test.tsx`
- Re-edited (already listed): `fraud-engine.service.ts`, `_backfill-fraud-detection-imports.ts` (+ its unit test), `fraud-engine.imports.integration.test.ts`, `marketplace-extraction.worker.gate-open.test.ts`, `fraud-detection.worker.gate-open.test.ts`, `respondents.ts`, `ReviewDialog.tsx`, `fraud.api.ts`, this story file.

**Added by P1–P4 + L2 implementation (2026-09-13) — 26 more, 66 total (matches `git status --porcelain`, 66 lines):**
- Created (7): `packages/types/src/import-provenance.ts` · `packages/types/src/validation/__tests__/import-provenance.test.ts` · `apps/api/src/services/import/batch-integrity.ts` · `apps/api/src/services/import/__tests__/batch-integrity.test.ts` · `apps/api/src/services/__tests__/import.service.provenance.integration.test.ts` · `apps/api/src/lib/import-provenance-backfill.ts` · `apps/api/scripts/_backfill-import-provenance-stats.ts`
- Modified (19): `_bmad-output/implementation-artifacts/sprint-status.yaml` (13-2 comment: current-state line prepended, history kept) · `docs/launch-campaign/association-condensed-sheet-spec.md` (two ingestion notes annotated; frozen columns untouched) · `apps/api/src/controllers/__tests__/assessor.controller.test.ts` · `packages/types/src/index.ts` · `packages/types/src/analytics.ts` · `apps/api/src/db/schema/import-batches.ts` · `apps/api/src/db/schema/import-batch-drafts.ts` · `apps/api/src/services/import.service.ts` · `apps/api/src/routes/imports.routes.ts` · `apps/api/src/routes/__tests__/imports.routes.test.ts` · `apps/api/src/services/audit.service.ts` · `apps/api/src/services/__tests__/audit.service.test.ts` · `apps/api/src/services/verification-analytics.service.ts` · `apps/api/src/services/__tests__/verification-analytics.service.test.ts` · `apps/api/src/controllers/__tests__/verification-analytics.controller.test.ts` · `apps/web/src/features/dashboard/components/charts/FraudTypeBreakdownChart.tsx` · `apps/web/src/features/dashboard/components/charts/__tests__/VerificationCharts.test.tsx` · `apps/web/src/features/dashboard/hooks/__tests__/useAnalytics.test.ts` · `apps/web/src/features/dashboard/pages/__tests__/AssessorAnalyticsPage.test.tsx`
- Re-edited (already listed): `assessor.service.ts`, `_backfill-marketplace-extraction.ts` (+ unit & integration tests), `fraud-thresholds.seed.ts`, `roll-padding.heuristic.ts` (+ test), `fraud-engine.imports.integration.test.ts`, this story file.

⛔ **NOT COMMITTED.** The adversarial review runs on the uncommitted tree.

## Senior Developer Review (AI) — R-A2, 2026-09-13

**Outcome: 11 findings raised (1 critical, 4 high, 4 medium, 2 low); H4 WITHDRAWN on Awwal's ruling → 10 stand.** All critical/high/medium FIXED in this pass, each RED-verified. Tree left UNCOMMITTED. Status stays `review`: R-A3…R-A10 are open by design and the story-residual guard refuses `done`, correctly.

⭐ **The headline: the fraud half was built, tested, recorded as closing the anti-roll-padding gap — and could not flag anyone.** Its tests asserted `componentScores.duplicate > 0`; none asserted a *severity*. Fifth instance of [[pattern-ship-a-fix-that-never-fires]] in this epic, and a clean example of [[pattern-test-that-passes-over-a-hole]].

### Findings

| # | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| C1 | 🔴 CRITICAL | **An imported detection could never be more than `clean`.** `roll_padding` fills only the `duplicate` slot, capped at `duplicate_weight` 20; the composite was a raw sum, so an import topped out at 20 — below `severity_low_min` 25. `clean` is hidden from the fraud list by default (`fraud-detections.controller.ts`, AC4.4.2) and never enters the assessor queue (`high`/`critical` or supervisor-reviewed only, and an import has no supervisor). 8,278 runs → nobody surfaced, anywhere. | Integration test: 3-row cluster → `severity 'clean'`. Synthetic pilot: 4-row padded cluster stored as `clean` at 12 before the fix. | `fraud-engine.service.ts` — an import's composite = duplicate score ÷ `duplicate_weight` × 100 (the component column stays raw). Live: that cluster now `medium` 66.67. ⚖️ **Awwal: the scale is a choice → R-A8.** |
| H1 | 🟠 HIGH | **Provenance was read off the RESPONDENT.** `respondents.import_batch_id` is permanent, and `submission-processing` merges later wizard / NIN-capture submissions onto the same row — so any FIELD submission about an imported person ran roll-padding only and skipped GPS/speed/straight-lining/off-hours. An enumerator fabricating visits to people on an association roll was unscoreable. | Test: field submission (GPS, enumerator) on an imported respondent → `importBatchId` = the batch. | Provenance keyed on the submission's sentinel form id (`IMPORT_FORM_ID_PREFIX = 'import:'`, the importer's own). |
| H2 | 🟠 HIGH | **The consumer sweep missed `assessor.service.ts`** — four `innerJoin(users)` (queue list + count, completed list + count). R-A10 said assessors *can* see imports; they could not. | Integration test: a resolved imported detection absent from `getAuditQueue`. | LEFT joins + `importBatchId` selected; web `assessor.api.ts` types nullable; `AssessorCompletedPage` renders `fraudSubjectLabel`. |
| H3 | 🟠 HIGH | **The three `padding_*` thresholds would never exist on prod.** `seedFraudThresholds` skips a non-empty table; the self-heal bootstrap only fires on an empty one; `updateThreshold` throws for a key with no row. R-A8's "tunable without a deploy" was false. | Code trace (`seeds/index.ts:530-545`, `fraud-config.service.ts:58-64, 209-233`); prod deploy runs no seed. | NEW `scripts/migrate-fraud-thresholds-init.ts` (additive-only, **no-op on an empty table** so it cannot block the bootstrap) + deploy wiring in `ci-cd.yml`. |
| H4 | ~~🟠 HIGH~~ **WITHDRAWN** | ~~The worker would publish a bare card for a vouch-less imported row.~~ ⚖️ **REVERSED BY AWWAL, 2026-09-13:** *"we have already litigated this with allowing the card without a badge. Removing both the card and the badge is a decision that is not in good faith."* The review re-litigated a settled 13-58 ruling (no vouch ⇒ no badge, never no card) and called it a defect. **It was not one.** | The worker guard and its inverted test were removed; the 13-58 twin is restored and now asserts the INSERT. ➕ **Same decision found in a second place and removed with it:** R-A2's own change (b) had made the backfill SELECT require a vouch — the identical withholding, one layer up. Now `source IN ('public','imported_association')`; the dry-run still counts badge-less cards. RED-verified: re-adding either exclusion reds 5 tests. | Prod impact of either version today: nil — **0** imported rows lack a name (measured). |
| M1 | 🟡 MED | **The identity key was order-sensitive** while its own comment cited R-A6 (name order unreliable for 5,301 NCARES rows) to justify coarseness. "Tunde Bakare" ≠ "Bakare Tunde". | Test: swapped pair → `sameIdentityCount 1`. | Token-sorted key, built by ONE SQL expression on both sides (a JS sort and a PG `ORDER BY` do not share a collation). **Cost measured: 19.7 → 49.2 ms per call** on an 8,222-row batch (seq scan either way). |
| M2 | 🟡 MED | **The fraud dry-run could not reconcile, and could score the wrong submission.** Exclusion counts overlapped (rolled-back + no-submission subtracted twice), ignored `import_batch_id IS NULL`, and LEFT JOINed `fraud_detections` (no unique on `submission_id`) so a re-score inflated the total. Selection took the latest submission with raw data — after a merge, a field one. | Integration test with one row per bucket + a merged person. | One partition CTE read by both `fetchCandidates` and `fetchCohortCounts`; import-submission filter; `--batch-id` (fails CLOSED); the dry-run prints `⛔ RECONCILIATION FAILED` on mismatch. Drift-guard exception annotated with its reason. |
| M3 | 🟡 MED | **Stale records contradicting the build:** `respondents.ts` still said `enumerator_id` is `uuid NOT NULL` and imports "cannot currently be SCORED"; the fraud gate-open test header said the same; the marketplace worker's 2b comment still said `imported_unverified` "MUST NOT earn a marketplace profile". | Read. | Corrected. |
| M4 | 🟡 MED | **The review dialog on the super-admin fraud page** received no `importBatchId` (labelled an import "Unattributed") and offered *Enumerator Warned / Suspended* for a detection with no enumerator. | Test. | Caller passes `importBatchId`; enumerator actions hidden for imports. |
| L1 | 🟢 LOW | `loadImportCohort`'s comment called the query "flat"; it is O(batch) per job, O(batch²) per run. | Measured: full synthetic 8,222-row fraud drain **186 s, 0 failed** on a laptop. | Comment corrected; runtime guidance added to R-A7. |
| L2 | 🟢 LOW — ✅ FIXED (Adjudication §A6) | Assessor drill-down `heuristic=duplicate_response` filters on `duplicate_score > 0`, which `roll_padding` also writes, so it returns imported detections under the wrong heuristic name. `VALID_HEURISTICS` has no `roll_padding`. | Read (`assessor.service.ts` `HEURISTIC_SCORE_MAP`). | Left: cosmetic filter mislabel, no data exposure. Fix alongside R-A8 calibration if the drill-down is used for imports. |

### What was EXECUTED (numbers)

| Check | Result |
|---|---|
| Story's own new/changed API tests, pre-change baseline | **11 files, 132 passed** |
| Gate constant reverted (re-add `imported_unverified`) | **3 of 7** gate tests red, both workers |
| Gate constant emptied (drop `rolled_back`) | **3 of 7** red |
| Marketplace predicate mutations: public-only / no vouch clause / no `rolled_back` | **3 / 4 / 3** red of 28 |
| Engine mutations: no uuid guard / `?? ''` restored / single-escaped `\s+` | **7 / 2 / 2** red of 7 |
| Review fixes reverted: C1 / H1 / M2 import filter / M2 precedence / M4 dialog / H4 worker | **1 / 1 / 4 / 1 / 1 / 1** red |
| **Scripts RUN (outside tsconfig) vs `app_test`**, synthetic 8,222 + 56-row batches + controls | predicted by independent SQL → **marketplace dry-run 8,278 imported + 1 public (exact)**, fraud dry-run **8,279 all / 57 pilot (exact)**; bad `--batch-id` → FATAL |
| Fraud LIVE, pilot batch, REAL worker | **57 enqueued, 57 stored, 0 failed**, `enumerator_id` NULL; padded cluster `medium`; re-run selects **0** |
| Fraud LIVE, 8,222-row batch, REAL worker | **8,222 enqueued, drained in 186 s, 0 failed** |
| Marketplace LIVE `--max-rows 40` + stray vouch-less enqueue, REAL worker | **40 profiles, 0 bare, all `AFAN`, `verified_badge false`**; vouch-less → `no_association_vouch`, 0 profiles — ⚠️ **that refusal was the H4 guard, WITHDRAWN on Awwal's ruling**; after the revert a vouch-less imported respondent gets a badge-less card (pinned by the restored 13-58 twin test) |
| `migrate-fraud-thresholds-init.ts` RUN | empty table → no-op (0 rows); 27-row legacy table with a TUNED `duplicate_weight` → **inserted 3, tuned row untouched**; re-run → no-op |
| All synthetic rows, thresholds, users and scratch files | **removed**; `app_test` returned to its prior counts |

### Gates (re-run by the reviewer)

> ⏩ Superseded by the **final-tree gates in § Adjudication A6** (after P1–P4 + L2: API 320 files / 4,502 passed, web 280 / 3,096 passed, types 128). Kept for the review-time record.

| Gate | Result |
|---|---|
| `tsc --noEmit` — types / api / web | **0 / 0 / 0** errors |
| `pnpm --filter @oslsr/api lint` | ⛔ **RED on first run** — the registry-read drift guard blocked the review's own new LATERAL (it selects the IMPORT submission, not the latest one). Annotated with its reason → **green**: eslint clean, drift guards 406 / 406 files, residual guard 322 stories |
| web lint / types lint | clean / clean |
| Types suite | **7 files, 117 passed** |
| API suite **after the H4 withdrawal (FINAL)**, `--shard=n/4`, sequential, `VITEST_MAX_THREADS=1`, vs `app_test` | **318 files, 4,488 tests: 4,480 passed, 8 skipped, 0 failed** — clean run, shards 191 / 159 / 149 / 131 s. One fewer than the pre-withdrawal run below: the removed H4 twin. |
| API suite, pre-withdrawal run (superseded) | **318 files, 4,489 tests: 4,481 passed, 8 skipped, 0 failed.** ⚠️ Shard 2 first ran across a laptop sleep + network drop (21,411 s; `Hook timed out` + `Connection terminated`) and failed `analytics-db-smoke.integration.test.ts`, a file this story does not touch; re-run alone: **17/17 passed in 8.5 s**, and its 17 are counted as passed above |
| Web suite, `--shard=n/4`, sequential | **280 files, 3,098 tests: 3,096 passed, 2 todo, 0 failed** |

**Test-count deltas, by name.** HEAD (13-58's final tree) was 312 files / 4,426 API tests; now 318 / **4,488** = **+6 files, +62 tests** (final tree), fully attributed:
- **NEW files (+6 API, +53 tests):** `_backfill-fraud-detection-imports.test.ts` (15), `_backfill-fraud-detection-imports.integration.test.ts` (3, review), `_backfill-marketplace-extraction.integration.test.ts` (12 — `it.each` over 9 seeds + 3), `fraud-engine.imports.integration.test.ts` (11 — 7 dev + 4 review: *reach a reviewable severity*, *swapped name order*, *FIELD submission on an imported person*, *assessor audit queue*), `roll-padding.heuristic.test.ts` (8), `fraud-detection.worker.gate-open.test.ts` (4).
- **Modified files (+9):** `_backfill-marketplace-extraction.test.ts` +6 (the widened-predicate block); `fraud-engine.service.test.ts` +2 (*runs ONLY roll-padding…*, *runs the five field heuristics…*); `fraud-schema.test.ts` +1 (*allows a NULL enumerator…*; the 4-FK test renamed to 5); `marketplace-extraction.worker.gate-open.test.ts` ±0 (the tripwire renamed and inverted; the no-vouch twin renamed to *writes a badge-less profile…* after H4 was withdrawn — the review's +1 went with it); `fraud-thresholds.seed.test.ts` / `seed-orchestrator.test.ts` ±0 (27 → 30 renames).
- **Web +6 tests, +1 file:** `fraud-subject-label.test.ts` (5, new file), `ReviewDialog.test.tsx` +1 (review). The dev recorded 3,095 passed + 2 todo (3,097); +1 review test = 3,098, reconciled. ⚠️ Web HEAD was NOT re-measured — 13-58's recorded 3,088 + 6 = 3,094 ≠ 3,098, so 4 web tests entered between 13-58's count and this tree from elsewhere; not chased.
- ⚠️ **The dev record's "4,479 passed, 9 skipped" does not reconcile:** HEAD 4,426 + the dev's 53 = **4,479 TOTAL**. The number was a total recorded as a pass count.

### What was NOT verified

- **Nothing ran against production.** Every prediction above is against synthetic `app_test` data; R-A7's prod predict-then-compare is still owed.
- **Calibration.** The synthetic name pool is degenerate; it proves execution and throughput, not what the thresholds do to real rolls (R-A8).
- **Prod-box runtime.** 186 s was a laptop; the 2 GB VPS with the API sharing the CPU will be slower.
- **The deploy wiring of the new runner** is a `ci-cd.yml` edit, exercised only by running the script locally — it first executes for real on the next deploy.
- **`updateThreshold` against a `padding_*` key** after the runner — read, not executed.
- **Browser rendering** of the dialog/assessor changes — component tests only.

### Needs Awwal (not another agent)

1. ✅ **Severity — RULED: measure.** Measured read-only on prod 2026-09-13: the new scale predicts **0 flagged of 8,278** (all `clean`). No flood; no retune needed before the run.
2. ✅ **H4 — RULED: withdrawn** (see the H4 row). Both the worker guard and R-A2's own SELECT exclusion are gone.
3. ✅ **Runner in the deploy — RULED: yes.**
4. ✅ **Fraud script — RULED: proceed as recommended** (pilot batch first, off-hours). ⛔ **Blocked on commit + deploy:** the script, the engine fix and the runner exist only in this uncommitted tree; prod is at `afe1da5`.

### ⭐ What the prod measurement means — the roll-padding signal has nothing to read on these batches

> ⚠️ **CORRECTED 2026-09-13, same session.** An earlier version of this paragraph said the importer's phone dedup *deletes* the contact-reuse evidence. **That was inferred from a zero and never traced — it is false.** `planIngest` (`services/import/ingest-plan.ts:11-17`) deliberately INSERTS rows that share a phone within a batch (taxonomy R2: a shared phone never merges distinct people; such rows are flagged `identityAmbiguous`). Reading the code and re-measuring gave the true cause below. Recorded, not silently fixed, because the wrong cause pointed the proposed follow-up at the wrong layer.

Measured read-only on prod (`afe1da5`), 2026-09-13:
- **All 8,278 imported people have 8,278 distinct phones, and none is shared with any other respondent of any source.** Contact reuse is inert not because the importer removes it, but because **the "-CLEAN" extracts arrived one phone per person** — the cleaning happened upstream, before the registry saw the rows.
- ⚠️ **So R-A4's "9,563 rows over 9,122 numbers" does not describe what was imported**, and `padding_contact_reuse_min = 5` was calibrated from a population that is not on prod (R-A8).
- **Identity duplication survives only as 34 same-name pairs in one LGA** (68 people), which the scale scores `clean` by design.
- **Importer stats:** ASNAT 56 parsed / 56 inserted / 0 matched; farming 8,234 parsed / 8,222 inserted / **12 matched existing** / 0 skipped / 0 failed.

➡️ Whatever the consolidation removed — duplicates, re-used contacts — is exactly the evidence a padding check needs, and it never reached the registry. A per-row heuristic over cleaned rows will keep predicting `clean`. ✅ That evidence is now captured at the batch level — P1 (provenance record) and P2 (integrity reading), implemented 2026-09-13; see Adjudication §A6.

## Adjudication — R-A2 (2026-09-13)

> **Cold-start summary.** R-A2 is **built, reviewed and ruled, NOT committed.** Prod is `afe1da5` and has none of it. Next action — **the adjudication agent** (it owns commit, push, the handoff doc and live-server work): **commit + push**, then run **§A4** in order, including the new step 1b. Nothing in §A4 may be confirmed on a number that does not match its prediction.

### A1 — Verdict

**ACCEPT R-A2, as amended by the review and extended by P1–P4 + L2 (§A6) — not as the dev built it.** The dev's build would have shipped an anti-roll-padding mechanism that could not raise a finding (C1), scored field visits about imported people with the wrong heuristics (H1), been invisible to assessors (H2), and been untunable on prod (H3). All four are fixed and RED-verified. One review finding (H4) re-litigated a settled ruling and is withdrawn. Status stays **`review`**: R-A3…R-A10 are open by design, and R-A7 (the runs) is the gate to anything more.

### A1b — The adjudication agent's OWN verification (third layer, 2026-09-13)

Dev built it, the review hardened it, and none of the numbers below are copied from either.
Re-measured here because this story's own C1 was *"recorded as closing the gap and could not flag
anyone"* — a record can be complete, confident and wrong.

| Check | Result |
|---|---|
| `tsc --noEmit` — types / api / web | **0 / 0 / 0** |
| api lint + drift guards (run DIRECT) | clean; **409 / 409** files, residual guard **322** stories |
| web lint | clean |
| **FULL API suite**, 4 shards, sequential, vs `app_test` | **320 files, 4,510 tests — 4,502 passed, 8 skipped, 0 failed** (1,240 / 982 / 1,107 / 1,181) |
| **FULL web suite**, 4 shards | **280 files, 3,097 passed, 2 todo, 0 failed** (748 / 793 / 736 / 822) |
| **File List vs `git status`** | **complete** — every changed file listed, including the untracked `dashboard/api/__tests__/` |

⭐ **The suite gap the record itself flagged is now closed.** The gates table above says *"the full
suites were NOT re-run after this last change — only the files it touches."* They have been, and
they land on the recorded numbers exactly. That mattered: the same story's **H4 was a gate recorded
green that was red**, and the only reason it was caught was someone re-running instead of reading.

**C1's fix RED-VERIFIED independently.** The normalisation is the heart of this story, so it was
neutered by hand (`componentScores.duplicate` in place of `(duplicate / duplicateSlotMax) * 100`) and
the suite re-run: **2 tests red** — *"lets a duplicate-identity cluster reach a reviewable severity"*
and L2's *"files a roll-padding detection under roll_padding"*, which depends on a non-clean
detection existing. Restored **by hand, never `git checkout`** (the file is uncommitted — a checkout
would have destroyed the dev's work, §2b); zero residue, 12/12 green after.

⚠️ **The arithmetic, worked independently, because "all 8,278 clean" is a number consistent with
both a working check and a dead one** (§2aa). Imports run ONE heuristic; its score caps at
`duplicate_weight` **20**; the lowest non-clean severity is **25**. So on the RAW scale an import
could never be anything but `clean` — *that is exactly C1*, and it is why the fix is a normalisation
rather than a threshold tweak. Post-fix a 3-row identity cluster scores `12 × 2/3 = 8` of 20 →
**40** → reviewable, and a fully padded row reaches **100**. The mechanism can now fire; the
prediction of all-`clean` is therefore a claim about the DATA, not a property of the code.

**Prod ground truth re-measured read-only, not read from §A3:**

| Measure | §A3 said | I measured |
|---|---|---|
| `imported_association` | 8,278 | **8,278** ✅ |
| rolled back / not consented / no association name / already profiled | 0 / 0 / 0 / 0 | **0 / 0 / 0 / 0** ✅ |
| `marketplace_profiles` | 297 | **297** ✅ |
| `fraud_detections` (non-clean) | 1 (0) | **1 (0)** ✅ |
| `padding_*` thresholds | absent | **0 rows** ✅ (H3's premise holds) |
| **candidate control** — the widened predicate by cohort | 8,278 imported + **1** public | **8,278 + 1** ✅ |

That last row is the one the runbook stops on, and it is the reason the widening is safe: the
predicate **enumerates** `('public','imported_association')` rather than dropping the source clause,
so `imported_itf_supa` / `imported_other` — which Awwal's ruling never covered — cannot be swept in.
`consent_marketplace`, `mp.id IS NULL` and an explicit `status <> 'rolled_back'` all survive.

🐞 **ONE FINDING OF MY OWN, from the §2a0 debt gate — and it is not stale paperwork.** 13-2 carries
**16 unchecked task boxes** from the 2026-09-05 channel build. Fifteen are the documented
un-ticked-checklist blind spot (the channel demonstrably ran: 8,278 rows, two batches). **Task 4's
AC5.2 was genuinely unbuilt** — *"surface `rows_inserted` vs the head's declared member count for
reconciliation"* — because, as this review discovered independently, `import_batches` **had no
declared-member-count column at all**. It is satisfied *now*, by P1's `declaredMembers` plus P2's
`declaredGap` / `received_exceeds_declared` / `received_below_declared`. So an AC that had been
unbuildable since July was closed this week as a side effect of a review proposal, and nobody
noticed it was the AC. → [[pattern-a-record-about-the-work-is-not-the-work]]

### A2 — Rulings (Awwal, 2026-09-13)

| # | Question | Ruling | Effect in the tree |
|---|---|---|---|
| 1 | Import severity scale (review C1) | **Measure first.** | Measured on prod: **0 of 8,278 predicted flagged.** Scale kept; no retune before the run. |
| 2 | Review H4 — withhold the card when there is no association vouch | **Withdrawn** — *"we have already litigated this with allowing the card without a badge. Removing both the card and the badge is a decision that is not in good faith."* | Worker guard removed; 13-58's twin restored (asserts the INSERT). The dev's matching vouch requirement in the backfill SELECT removed too — same decision, one layer up. |
| 3 | New `migrate-fraud-thresholds-init.ts` in the deploy | **Yes.** | Wired into `ci-cd.yml`. ⚠️ Clarified to Awwal: this makes the deploy *traceable* (a small, named, idempotent, self-logging unit), not *lighter* — runners still execute sequentially in one deploy step (~1 s for this one). Load protection comes from the operator scripts (batched, paused, `--batch-id`), not from the runner. |
| 4 | Fraud script | **Proceed as recommended** — pilot batch first, off-hours. | Blocked on commit + deploy. |
| 5 | Review proposals P1–P4 | **Implement all, defer nothing** — *"so that we don't have any technical debt arising from this story."* | P1–P4 built, plus L2 and one list-drift closed; § A6. |
| 6 | Who commits / pushes / updates the handoff / fixes the live server | **The adjudication agent.** | The review/implementation agent hands over UNCOMMITTED with this record; it did not commit or edit `docs/adjudication-agent-handoff.md`. |

### A3 — Ground truth on prod before anything runs (read-only, `default_transaction_read_only=on`)

| Measure | Value | Used by |
|---|---|---|
| `imported_association` respondents | **8,278** (ASNAT `01a071c8-709f-73a3-9e31-eb0e8cedf01a` 56; AFAN farming `01a072ae-83e7-7e8f-902d-590f0c589c74` 8,222) | both runs |
| rolled back / not consented / no import submission / already profiled / no association name | **0 / 0 / 0 / 0 / 0** | both runs |
| `fraud_detections` today | **1 row, 0 non-clean** | fraud compare |
| predicted severity for all 8,278 (heuristic replicated in SQL over live thresholds) | **8,278 `clean`** | fraud compare |
| `fraud_thresholds` `padding_*` rows | **absent** (as H3 predicted) | runner check |
| `marketplace_profiles` today | **297** = 287 no association + **10 AFAN** | marketplace compare |
| marketplace backfill candidates today | **8,278 imported + 1 public** (`019e4072-…`, active, created 2026-05-19) | marketplace compare |
| first 57 candidates by `r.id` | **exactly the 1 public + the 56 ASNAT** — no farming row | ~~staged publish~~ superseded by `--batch-id` staging (P4); kept as the evidence that `--max-rows` staging was insertion-order luck |

### A4 — Runbook (R-A7). Run in order; STOP on any mismatch.

Box: `ssh -o ConnectTimeout=25 root@100.93.100.28`, then `cd /root/oslrs/apps/api`. Read-only SQL: `docker exec -e PGOPTIONS='-c default_transaction_read_only=on' oslsr-postgres psql -U oslsr_user -d oslsr_db`.

**0. Commit → push → deploy (Awwal's go).** ONE commit: Awwal ruled on 2026-09-12 that both halves ship as one story, and a split would protect nothing at runtime — every prod effect sits behind a manual `--confirm` flag. Push per [[feedback-never-pipe-a-push-to-tail]]: `FreePhysicalMemory` > 3 GB, `TURBO_CONCURRENCY=1 VITEST_MAX_THREADS=1`, background the push writing its exit code, then `git ls-remote origin main` == `git rev-parse HEAD`.

**1. Verify the deploy.**
- VPS `git rev-parse --short HEAD` == the commit; `curl -s https://oyoskills.com/api/v1/health` → 200.
- Deploy log shows `[migrate-fraud-thresholds-init] ✓ inserted` × 3.
- SQL: `SELECT rule_key, threshold_value FROM fraud_thresholds WHERE rule_key LIKE 'padding_%';` → **3 rows (12 / 8 / 5)**, and the `padding_contact_reuse_min` note cites the 9,563-row consolidation calibration (P3), not R-A4.
- SQL: `SELECT is_nullable FROM information_schema.columns WHERE table_name='fraud_detections' AND column_name='enumerator_id';` → **YES**; `import_batch_id` present. `import_batches.provenance_stats` and `import_batch_drafts.provenance_stats` present (jsonb, nullable).
- ⛔ STOP if the runner printed "no-op" or "no active super_admin": the scale would run on code defaults, untunable.

**1b. Provenance backfill (P1) — writes counts only, publishes nothing.**
- `pnpm tsx scripts/_backfill-import-provenance-stats.ts --dry-run`
- Predict: both batches `exists:true`, `rowsParsed` **56** and **8,234**, `alreadyRecorded:false`, `willWrite:true`, `problems:[]`.
- Apply: `--apply --confirm-i-am-not-dry-running` → `✓ written` × 2. A re-run → `· not written` × 2.
- Verify: `GET /api/v1/admin/imports/01a072ae-83e7-7e8f-902d-590f0c589c74` → `integrity.provenance.rawRows` **10,090**, `cleanOverRaw` **0.8161**, `matchedExistingRatio` **0.0015**, signals include `rows_matched_existing` and NOT `provenance_missing`.
- ⛔ STOP if the dry-run exits 1 (a problem, or a missing batch): the live rows are not the ones the figures were reconciled against.

**2. Fraud — ASNAT pilot.**
- `pnpm tsx scripts/_backfill-fraud-detection-imports.ts --dry-run --batch-id 01a071c8-709f-73a3-9e31-eb0e8cedf01a`
- Predict: respondents **56**, every exclusion **0**, selectable **56**, candidates **56**, no `RECONCILIATION FAILED`.
- Live: same command with `--apply --confirm-i-am-not-dry-running`. Expect `enqueued=56 failed=0`.
- After the drain: `SELECT severity, count(*) FROM fraud_detections WHERE import_batch_id='01a071c8-709f-73a3-9e31-eb0e8cedf01a' GROUP BY 1;` → **`clean` 56**. `SELECT count(*) FROM fraud_detections WHERE import_batch_id='01a071c8-…' AND enumerator_id IS NOT NULL;` → **0**.
- ⛔ STOP if any row is not `clean` (the prediction was wrong — read those detections before continuing), if the count ≠ 56, or if any job failed.

**3. Fraud — AFAN farming, off-hours.**
- Dry-run with `--batch-id 01a072ae-83e7-7e8f-902d-590f0c589c74` → selectable **8,222**.
- Live. While it drains, poll `/api/v1/health` every 30 s; expect ~O(batch²) DB work (review measured 186 s on a laptop; the VPS will be slower).
- Compare: 8,222 rows, severity **`clean` 8,222** (the 34 name pairs score 20).
- Total: `SELECT count(*) FROM fraud_detections;` → **8,279** (1 + 56 + 8,222). The assessor analytics "Roll Padding" bar stays **0** (it counts non-clean only).
- ⛔ STOP on health non-200, any failed job, or any non-`clean` row beyond explanation.

**4. Marketplace — dry-run, unscoped.**
- `pnpm tsx scripts/_backfill-marketplace-extraction.ts --dry-run`
- Predict: by cohort **`imported_association` 8,278, `public` 1**; imported consented 8,278; no submission 0; already has profile 0; rolled back 0; of which no association name **0**.
- ⛔ STOP if the `public` line ≠ 1. That is the control: the widening must not move the original cohort.

**5. Marketplace — STAGED publish, by batch (P4).** ⚠️ R-A3: no staging environment, so stage by batch.
- 5a. `--dry-run --batch-id 01a071c8-709f-73a3-9e31-eb0e8cedf01a` → **56**. Awwal confirms, then the same with `--apply --confirm-i-am-not-dry-running`.
- Compare: `marketplace_profiles` **353** (297 + 56); `SELECT association_name, count(*) FROM marketplace_profiles GROUP BY 1;` → **ASNAT 56, AFAN 10, none 287**.
- Eyeball on the live site: search `ASNAT` → 56 cards, each with the association line, **none** carrying a bare ✓ Verified.
- ⛔ STOP here if any ASNAT card renders without its badge or with a verified mark.
- 5b. `--dry-run --batch-id 01a072ae-83e7-7e8f-902d-590f0c589c74` → **8,222**, then apply. Compare: **8,575** profiles; **AFAN 8,232** (10 + 8,222); `?q=AFAN` returns them.
- 5c. Unscoped dry-run → **1** (`public`), then apply. Compare: **8,576** profiles; **none 288**.

**6. Close out.** Fill the two predict-then-compare rows with the observed values; mark R-A7 discharged with the evidence; R-A8 stays open (below).

### A5 — Residuals after adjudication

- ~~**R-A7**~~ — ✅ **DISCHARGED 2026-09-14. The whole runbook ran, in order, and EVERY step landed on
  its prediction.** Nothing was confirmed on a number that did not match. Observed, against §A4's
  predictions:

  | Step | Predicted | Observed |
  |---|---|---|
  | 1 deploy | SHA, health 200, `padding_*` = 12/8/5, `enumerator_id` → YES, 3 new columns | ✅ all exact |
  | 1b provenance | `rowsParsed` 56 / 8,234, `willWrite:true`, then `· not written` | ✅ exact; re-run idempotent |
  | 2 ASNAT fraud | 56 selectable → `enqueued=56 failed=0` → 56 `clean`, 0 `enumerator_id` | ✅ exact |
  | 3 AFAN fraud | 8,222 selectable → `enqueued=8222 failed=0`; total **8,279** | ✅ exact, all `clean` |
  | 4 marketplace control | `imported_association` 8,278 + `public` **1** | ✅ exact |
  | 5a ASNAT publish | 353 profiles; ASNAT 56 / AFAN 10 / none 287 | ✅ exact; 0 verified badges |
  | 5b AFAN publish | 8,575 profiles; AFAN **8,232** | ✅ exact; `?q=AFAN` → 8,232 |
  | 5c public row | 8,576 profiles; none **288** | ✅ exact |

  **Public surface now: 8,576 listings** (287 pre-existing + 1 public + 56 ASNAT + 8,232 AFAN),
  from **297** the day before. **0** imported cards carry a bare ✓ Verified; **0** are badge-less.

  ⭐ **THE EXECUTION EVIDENCE, not just the outcome (§2aa).** "8,278 rows all `clean`" is a number
  consistent with a working check AND with one that never ran. The stored `duplicate_details` settle
  it: `{"reason":"no_padding_signal","batchSize":56,"samePhoneCount":1,"sameIdentityCount":1,
  "contactReuseMin":5}` — the engine loaded the cohort, computed BOTH cluster counts, and read
  **`contactReuseMin: 5`**, the threshold row that did not exist on prod before this deploy. That is
  H3 proven end to end: the new runner inserted it and the engine demonstrably consumed it at scoring
  time. `clean` here means *measured and clean*, which is the distinction C1 existed to restore.

  ⚠️ **One alarm, correctly disbelieved.** The health monitor fired three `CURL_FAIL`s mid-run. The
  publish it was watching **had not started** (the command was blocked before execution, and
  `marketplace_profiles` was still 353), and `oslsr-api` showed **1,086 minutes of uptime with no
  restart** across the window. So it was the operator's own link, not prod. A monitor that cannot
  tell "the service is down" from "my laptop lost DNS" will report both the same way — gate the
  diagnosis on server-side evidence before acting (§2l).
- **R-A8** — OPEN, re-scoped. ✅ **The prediction held: 8,278 of 8,278 scored `clean`, so the run calibrated nothing** — exactly as forecast, which is why it was never going to be calibration data. The distribution is now a measured baseline (`roll_padding` fired on nobody in a consolidated batch), not an assumption. The first run is predicted all-`clean`, so it calibrates nothing. The contact-reuse minimum IS now calibrated against the population that has shared phones (P3), but it first meets real data **the day any `needs-eyes` rows are imported** — import them as their own batch (handoff D8), run the fraud script on that batch immediately, and read its distribution before acting.
- **R-A10** — assessor visibility fixed (H2). An import reaches the assessor queue only when `high`/`critical` or once a super-admin records a resolution.
- ~~**L2**~~ — **FIXED** (see A6): drill-down and analytics now split `duplicate_response` / `roll_padding` by provenance.

### A6 — Proposals P1–P4 + L2: ✅ IMPLEMENTED 2026-09-13 (Awwal: "implement all… without deferring anything")

**Facts checked before building** (code + prod read-only + the consolidation working files, counts only — no PII read out):
- `import_batches` had **no declared-member-count column** (AC5.2 never had storage); **no web screen for import batches exists**; `fraud_detections.submission_id` is **NOT NULL**, so a batch-level signal cannot be a fraud detection.
- **The farming provenance RECONCILES EXACTLY** — an earlier version of this section said it did not ("an unexplained 162"). That was a subtraction error: `needs-eyes.csv` overlaps `consolidated.csv` (the consolidator routes flagged rows there without dropping them) and also lists 153 no-phone rows that were never consolidated. Joined by `S/N`: **10,090 supplied − 374 merged − 1,482 held (1,329 flagged + 153 no usable phone) = 8,234 = the uploaded file.** ASNAT: **70 = 56 clean + 14 held**.
- `consolidated.csv`: **345 shared phones — 305 by 2 rows, 19 by 3, 9 by 4, 12 by ≥5 (83 rows)**; every shared-phone row was held, none imported.

| # | What was built | Where | Proof |
|---|---|---|---|
| **P1** | `provenance_stats jsonb` on `import_batches` **and** `import_batch_drafts` (nullable). Shape: `rawRows`, `rawRowsBySource`, `mergedRows`, `heldRows`, `heldByReason` (non-partition), `cleanRows`, `declaredMembers` (AC5.2's missing storage), `note` — **strict zod schema, numbers only**. Supplied at dry-run as `provenance_stats` (multipart JSON); **validated and reconciled against the parsed file** — a record that does not add up is refused (`PROVENANCE_MISMATCH`, 400) before any draft is written. Carried to the batch at confirm, included in the `import_batch.created` audit details. An association batch confirmed without one returns `provenanceStatsMissing: true` and logs `import.provenance_stats_missing` (visible, not blocking — same rule as `associationNameMissing`). **Backfill** for the two prod batches with the reconciled figures above: `src/lib/import-provenance-backfill.ts` + `scripts/_backfill-import-provenance-stats.ts` — dry-run default, refuses `--dry-run --apply`, never overwrites (two independent guards), refuses a live batch that does not reconcile, audit row per write (`import_batch.provenance_recorded`, new action; census 65 → 66). | `packages/types/src/import-provenance.ts`; schema `import-batches.ts`, `import-batch-drafts.ts`; `import.service.ts`; `imports.routes.ts`; `audit.service.ts` | 11 schema/reconcile unit tests; 8 real-DB tests (draft → batch → audit; mismatch refused with no draft; malformed refused; missing flagged; backfill writes once, idempotent, refuses drift); script RUN on `app_test` through every path. |
| **P2** | `ImportBatchIntegrity` — one reading per batch, **no score, no thresholds**, only arithmetic: inserted / matched / skipped, `matchedExistingRatio`, shared-phone rows / numbers / max, same-name rows (order-insensitive, within LGA), `cleanOverRaw`, `declaredGap`, and signals `received_exceeds_declared` · `received_below_declared` · `provenance_missing` · `shared_phone_rows_present` · `same_name_rows_present` · `rows_matched_existing`. Returned by **dry-run** (`predicted` — the ingest plan now runs READ-ONLY at dry-run through the same `buildIngestPlan` helper confirm uses), **confirm** (`recorded`) and **`GET /imports/:id`** (`recorded`, recomputed over the rows on the register). | `services/import/batch-integrity.ts` (pure); `import.service.ts` (`buildIngestPlan`, `getIntegrity`); `imports.routes.ts` | 8 pure tests (each signal fires and stays silent); real-DB: **dry-run prediction === confirm record** on a fixture with real shared phones, same-name pair and declared gap; detail endpoint === confirm. |
| **P3** | `padding_contact_reuse_min` **kept at 5**, its note re-sourced to the measured consolidation distribution (the runner writes that note to prod). Same correction in the heuristic header, which ALSO wrongly claimed the importer skips within-batch phone twins — `planIngest` inserts them (R2). | `fraud-thresholds.seed.ts`; `roll-padding.heuristic.ts` + tests' comments | Seed/threshold tests green; text only. |
| **P4** | `--batch-id` on the marketplace backfill, **fails closed** on a malformed or valueless id; scopes both the candidates and the diagnostics. Runbook §A4 step 5 now stages ASNAT → AFAN → public explicitly. | `_backfill-marketplace-extraction.ts` | parse unit test; real-DB test (selects exactly its batch — not the other batch, not the public cohort; diagnostics scoped); CLI run for bad / valueless / scoped id. |
| **L2** | `duplicate_response` and `roll_padding` split by provenance (`import_batch_id IS [NOT] NULL`) in the assessor drill-down (`roll_padding` is now a valid heuristic) and in the analytics breakdown (`FraudTypeBreakdown.rollPadding`, new chart bar "Roll Padding"). Endpoint is uncached — no cache-version bump needed (checked). | `assessor.service.ts`; `verification-analytics.service.ts`; `packages/types/src/analytics.ts`; `FraudTypeBreakdownChart.tsx` + fixtures | Real-DB test: an imported detection is filed under `roll_padding`, never `duplicate_response`, and the LGA-scoped breakdown counts it as `rollPadding: 1`, `duplicateResponse: 0`. |

**Wrong-way runs (each guard deleted, suite re-run):** P4 scope removed → 1 red · P1 mismatch no longer refused → 1 red · P2 dry-run predicts over no rows → 1 red · P1 confirm drops the record → 2 red · L2 drill-down unsplit → 1 red · L2 analytics unsplit → 1 red · backfill overwrite: removing ONE guard stays green (the other still protects — by design), removing BOTH → 1 red.

**One drift closed beyond L2:** the chart's bar → drill-down names and the API's accepted filters were two hand-kept lists. Now ONE: `FRAUD_DRILLDOWN_HEURISTICS` in `@oslsr/types`; `HEURISTIC_FILTERS` is typed `Record<FraudDrilldownHeuristic, SQL>` (a missing filter is a compile error) and the chart map is typed against it, with a web test pinning one bar per breakdown field (RED-verified: removing the Roll Padding bar reds it — recharts draws no bars in jsdom, so no render test could see it).

### Gates — final tree (after P1–P4 + L2)

| Gate | Result |
|---|---|
| `tsc --noEmit` — types / api / web | **0 / 0 / 0** |
| lint — api (+ drift guards) / web / types | clean; drift guards **409 / 409** files, residual guard **322** stories |
| Types suite | **8 files, 128 passed** (+1 file / +11: `import-provenance.test.ts`) |
| API suite, `--shard=n/4`, sequential, vs `app_test` | **320 files, 4,510 tests: 4,502 passed, 8 skipped, 0 failed** — +2 files / +22 tests over the post-H4 318 / 4,488: `batch-integrity.test.ts` (8), `import.service.provenance.integration.test.ts` (8), marketplace unit +1 (`--batch-id` parse), marketplace integration +2 (P4 scope + diagnostics), `fraud-engine.imports.integration.test.ts` +1 (L2), `imports.routes.test.ts` +2 (provenance JSON forwarded / refused) |
| Web suite, `--shard=n/4`, sequential | **280 files, 3,096 passed, 2 todo, 0 failed** |
| After the shared-heuristic-list change (made after the full runs) | re-run: `assessor.controller.test.ts` + `assessor.service.test.ts` + `fraud-engine.imports.integration.test.ts` **44 passed**; `VerificationCharts.test.tsx` **15 passed** (+1 → web total **3,097 passed**); types **128**; tsc + lint clean. ⚠️ The full suites were NOT re-run after this last change — only the files it touches. |
| Schema on `app_test` | `db:push:full:force` — both `provenance_stats` columns present (jsonb, nullable); the fraud-thresholds runner auto-discovered and correctly no-op on an empty table |
| Scripts RUN on `app_test` | provenance backfill: help / both-flags refused / dry-run / apply-unconfirmed refused / apply ✓✓ / re-run no-op / drifted row refused exit 1. Marketplace `--batch-id`: malformed and valueless refused, scoped dry-run ran. All look-alike rows removed. |

**Also fixed while here:** `import.service.ts` header still said imported rows are "excluded from fraud / marketplace" (false since R-A2); the `'import_batch'` audit target literal became `AUDIT_TARGETS.IMPORT_BATCH` (3 sites, same value).

## Change Log

| Date | Change |
|------|--------|
| 2026-09-13 | ✅ **P1–P4 + L2 IMPLEMENTED — nothing deferred (Awwal: "implement all your recommendations… so that we don't have any technical debt").** P1: `provenance_stats` on batches + drafts (strict numbers-only schema, reconciled at dry-run, refused with `PROVENANCE_MISMATCH`, carried to batch + audit, `provenanceStatsMissing` visible) and a never-overwrite backfill for the two prod batches with figures **reconciled by S/N from the consolidation files — 10,090 − 374 − 1,482 = 8,234; 70 = 56 + 14** (an earlier "unexplained 162" was a subtraction error, corrected). P2: per-batch `integrity` with no score and no thresholds — predicted at dry-run through the SAME planning helper confirm uses, recorded at confirm and on `GET /imports/:id`; prediction === record proven on a real DB. P3: `padding_contact_reuse_min` kept at 5, its note re-sourced to the measured 345-shared-phone distribution (and the heuristic header's false "importer skips phone twins" corrected). P4: marketplace `--batch-id`, fail-closed; runbook stages ASNAT → AFAN → public. L2: `roll_padding` split from `duplicate_response` in the assessor drill-down and the analytics breakdown (new "Roll Padding" bar), with ONE shared heuristic list. Every new guard deleted and re-run: each reds a test (the backfill's two overwrite guards red only together, by design). **API 320 files / 4,502 passed / 0 failed; web 280 / 3,096 passed; types 128.** Runbook §A4 gains step 1b. | Debt from this story closed; prod state still unchanged until the adjudication agent commits and runs §A4 |
| 2026-09-13 | ⚖️ **AWWAL RULED on the review.** (1) Severity → **measured** read-only on prod (`afe1da5`): **8,278 selectable, predicted 0 flagged** — 34 same-name pairs score `clean`, and **0 phones shared** — the "-CLEAN" extracts arrived one phone per person (upstream cleaning; an in-session claim that the importer deleted them was traced and CORRECTED — `planIngest` keeps shared phones); batch-level proposals P1–P2 in the Adjudication. (2) **H4 WITHDRAWN** — *"removing both the card and the badge is a decision that is not in good faith"*; the worker guard is removed, AND R-A2's own vouch requirement in the backfill SELECT (the same withholding) is removed with it; 13-58's twin restored. (3) Runner stays in the deploy. (4) Fraud run approved as recommended — **blocked on commit + deploy**. | The review's one re-litigation corrected |
| 2026-09-13 | 🔥 **R-A2 ADVERSARIAL REVIEW — 11 findings, 10 fixed (L2 left, cosmetic — later FIXED with P1–P4), every code fix RED-verified; tree UNCOMMITTED.** ⭐ **C1: the fraud half could not flag anyone** — an import's composite capped at 20, below the `low` cutoff 25, so every detection was `clean`, hidden by default and barred from the assessor queue; its tests asserted a component score, never a severity. H1 provenance keyed on the respondent (field submissions about imported people skipped the field heuristics); H2 the assessor service's four inner joins were missed by the sweep; H3 the `padding_*` thresholds could never reach prod (new additive deploy runner); H4 ~~the marketplace worker would publish a bare card for any vouch-less import~~ — WITHDRAWN on Awwal's ruling, see the row above. M1 order-sensitive identity key; M2 an unreconcilable fraud dry-run that could score a field submission (partition CTE, `--batch-id`). **Both scripts RUN against `app_test` with synthetic 8,222 + 56-row batches — every dry-run number matched an independent SQL prediction exactly; live runs through the REAL workers: 8,222 fraud jobs drained in 186 s, 0 failed; 40 marketplace profiles, 0 bare.** Needs Awwal: the severity scale (R-A8), H4's reversal of a 13-58-pinned behaviour, the `ci-cd.yml` change. | The fraud half now fires; state still unchanged until R-A7 |
| 2026-09-12 | ✅ **R-A2 BUILT — four changes, and the fraud engine fixed to make the fourth possible.** (a) the gate opened for `imported_unverified` (`rolled_back` kept, asserted on both workers); (b) the marketplace backfill's `source` predicate widened to an ALLOW-LIST, plus two conditions the widening made necessary — an association vouch (so no card publishes bare) and `rolled_back` (so the operator's count stays honest); (c) `enumerator_id` made NULLABLE with a new `import_batch_id`, the heuristic registry SPLIT BY PROVENANCE, a new `roll_padding` heuristic, and the enqueue script written; (d) NOT run → R-A7. ⭐ **THE FRAUD HALF'S OWN PREMISE FAILED THE TRACE — a fourth instance of the epic's defining pattern.** "Closes a live anti-roll-padding gap" was untraced: an imported row could not be SCORED at all. Three defects sat between the gate and a single detection — `''::uuid` against a NOT NULL column (every job would dead-letter), all five field heuristics returning 0 with `off_hours` about to flag 8,222 people on the uploader's clock, and a sentinel `questionnaire_form_id` crashing the context loader. The third was found by an integration test, not by reading. ⚠️ Two silent-failure sweeps came with it: four `innerJoin(users)` that would have made imported detections invisible on every surface, and a web table that would have rendered "Select null". | Capability delivered; state unchanged until R-A7 |
| 2026-09-12 | ⛔ **R-A2 CORRECTED AGAIN — the FRAUD half carried the same false premise the marketplace half did.** It said the fraud half was "independent and should move sooner". Traced at 13-58's close-out: `import.service.ts` holds ZERO queue references, `queueFraudDetection` is called only from `submission-processing.service.ts` (which the importer never calls), and **there is no fraud backfill script at all** — so opening the gate creates no fraud runs either, and unlike marketplace there is nothing to widen. R-A2 is now **FOUR** changes. Corrected IN PLACE, because a dev reading it top-to-bottom would have flipped the constant, seen nothing happen, and hunted the cause in the worker. |
| 2026-09-11 | **R-A2 CORRECTED — it carried an instruction that would not have worked.** The trigger read *"ship 13-58, then remove `imported_unverified` from the gate"*, a **one-line** change. 13-58's adversarial code review (H3 → its R7) traced it: the import path **never enqueues marketplace-extraction**, so opening the gate alone creates **zero** profiles, and `_backfill-marketplace-extraction.ts` is scoped `WHERE r.source = 'public'` so it skips every imported row. R-A2 is now explicitly **(a) the gate + (b) widening the backfill predicate**, with Awwal's 2026-09-09 ruling on the mechanism (widen the script, NOT an import-time enqueue — 10 BullMQ workers run IN the API process on a 2 GB box) and a predict-then-compare before the one-shot. **Corrected in place rather than footnoted:** R-A2 is the checkable artefact, and a stale instruction beside a correct note loses to the instruction. |
| 2026-09-05 | **AC3.4 SHIPPED AND EXERCISED ON PROD — the channel is live.** Two imports confirmed: the **ASNAT tiler pilot** (`01a071c8…`, 56/56 inserted) and the **farming intake** (`01a072ae…`, **8,222 inserted / 12 matched / 0 failed in 6.1s**). Registry **440 → 8,662**; LGA coverage with a publishable trade **2 → 33**. Every row carries a `submissions` row with a canonical `skills_possessed` slug, so imported people are DESCRIBABLE, not merely counted — verified through `registry_unified` itself (8,222 rows, names + LGA + slug + gender + resolution basis). **Both imports were PREDICTED before writing and matched exactly** (headcount, withAnswers, gender split, GPI, and the k-anonymity cells) — the one miss was 8,223→8,222, because the local dedup check compared phones only while the importer dedups on phone **OR NIN**. ⛔ **A DEFECT WAS CAUGHT BY AWWAL, NOT BY ME, AND IT IS THE MOST IMPORTANT ENTRY HERE.** The first farming dry-run returned rows with no name, and I reported that 64% of the batch simply had none, then asked how to proceed. Awwal opened the source document and said the `Full Name` column was there. It was — `N_Cares_FInal_Cleaning.csv` column 3, 6,516 rows, already read correctly into `full_name` (5,301/5,301). **The evidence was in front of me: the "missing" fields were 2,933 for name AND dob AND town AND NIN — four fields agreeing to the exact row. I even wrote that this meant "two source cohorts with different schemas", then reasoned from the absence instead of opening the file.** A count that suspicious is a prompt to go and look. Fixed by mapping `Full Name` → `fullName` (the shape ITF-SUPA already uses) and carrying the column in the extract; `splitName` prefers explicit first/last, so each cohort uses what it has. Result: **8,222/8,222 named, 0 nameless.** R-A1 DISCHARGED with the measurement it demanded (31/56 tiler rows lost an age; 0 farming rows — material for paper, immaterial for extracts). R-A5 and R-A6 opened. | The channel is proven end-to-end || 2026-08-31 | **AC3.3 + AC4.3 CORRECTED (adjudication); `imported_association` config LANDED.** ⭐ **AC3.3 contradicted the ruling at the top of its own story** — Awwal's 2026-07-19 "Marketplace = INCLUDE with a badge / Public insights = INCLUDE" versus AC3.3's "excluded from fraud-detection, marketplace-extraction and partner-API `verify_nin`". Written pre-ruling, never revised when the ruling landed; a dev following the checkable artefact would have shipped the exclusion. Corrected to: marketplace INCLUDE (badged), `/insights` INCLUDE, fraud-detection INCLUDE, `verify_nin` **EXCLUDE retained** (a proxy-transcribed NIN must not answer an external verification query — R1). **AC4.3 corrected** per Awwal 2026-08-24: blank consent → **entered and accepted** (consent-by-channel, accountable source), explicit `No` → still rejected; the per-row basis is stored, not assumed, and the default does **not** generalise to sources without a named head. **Verified against code:** `PIPELINE_EXCLUDED_STATUSES` really does gate marketplace + fraud today, so the gate is a **sequencing dependency on 13-38**, not a bug to flip now — logged as R-A2 with the badge-first ordering, since opening the marketplace early would breach ruling §3. **Shipped:** `ASSOCIATION_CONFIG` in `import-sources.ts` mapping the twelve frozen sheet columns plus realistic transcription variants (`S/N` deliberately unmapped — a per-sheet row counter would collide across batches as an `externalReferenceId`), with a drift guard that **parses the frozen print HTML** and fails naming any sheet column that has no mapping (RED-verified by dropping `Town / Ward`). Residual ledger opened: R-A1 (the DOB-or-Age column loses ages — count the warnings on the first real batch before choosing a fix), R-A2, R-A3. | Unblocks the importer; ends an AC-vs-ruling contradiction |
| 2026-06-25 | Story authored by Bob (SM) via canonical *create-story, per SCP-2026-06-25-launch-campaign (Epic 13). 6 ACs (freeze the condensed sheet as the import contract; add `imported_association` source + `import-sources.ts` config; wire the importer on the 11-2 backbone; required-field/dedup discipline; lawful-basis/reconciliation/by-construction attribution; tests). REUSE the Epic 11 spine (11-1 done, 11-2 association slice pulled forward) — NOT a rebuild. Status → backlog. Sheet = Monday zero-cost deliverable; importer = fast-follow. |
| 2026-07-19 | **13-33 AC4 ingestion-contract harmonization (John/PM).** Added AC3.4: as registry source #3, the importer MUST write a `respondents` row AND a `submissions` row with `raw_data` carrying the member's Trade as `skills_possessed` — not only `marketplace_profiles.profession` — else association members are counted but INVISIBLE to the `registry_unified` skills/insights surface (the exact gap 13-33 AC4 forbids). Cross-referenced `docs/registry-unified-ingestion-contract.md`; flagged the 13-33 AC4 `it.todo` to implement when this builds. Found by the post-13-33 backlog sweep. |
| 2026-07-19 | **DECIDED (Awwal) + INTAKE-REALITY finding (John/PM).** Awwal RULED: association members ARE marketplace-visible with a **"[Association] — confirmed member"** badge (two-tier; SMS-confirm upgrades to Member-verified) + included in public skills/coverage counts — `unverified_import` was too blunt (accountable source + mandatory phone + usual NIN ≠ soft-identifier scrape). Held: honest naming (never bare "Verified"); the only residual exclusion is COMPLETENESS-based (core rows out of deep-field RATE charts). Badge render spun out as **13-38**. **NEW: INTAKE-REALITY finding from a real ASNAT Tiller Association WhatsApp batch (~18 members)** — associations submit FREEFORM WhatsApp text (not clean XLSX/CSV), Trade is ~15 spellings of one trade (and Appendix B has no tiling entry), LGA/phone are dirty, and **the data carries NO consent field → the whole batch would be rejected under AC4.3.** Reshapes the importer (parser + normalization + consent-evidence decision), still BLOCKED-FOR-DEV on those. | Real-data check + honest-badge reframe |
| 2026-07-19 | **ESCALATED to ⛔ BLOCKING OPEN DECISION (John/PM).** Awwal's challenge — "the association source is genuine, so why 'unverified'?" — unlocked the precise framing: Axis-3 verification = individual-person confirmation (member-side check / NIMC NIN), NOT source legitimacy; `unverified_import` guards residual per-row risk (padded rows, transcription, proxy-consent), so it gates individual-exposing/trust surfaces, NOT anonymized coverage counts. Elevated AC3.4 to a top-of-story BLOCKING decision (blocks dev until Awwal signs off) with a PROPOSED RULING: (1) write `raw_data.skills_possessed` + require a Trade→`SKILL_TAXONOMY`(13-20) reconciliation; (2) INCLUDE imports in public skills/coverage COUNTS, EXCLUDE from marketplace + verified-registry headline + deep-field RATE charts until a member-side check; (3) public-insights employment-RATE stats must exclude `unverified_import` (13-2↔12-4↔public-insights coordination). Sheet unaffected (Trade already captured; no re-print). Story marked blocked-for-dev in sprint-status. |
