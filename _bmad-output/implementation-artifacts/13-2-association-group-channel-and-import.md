# Story 13.2: Association Group Channel & Importer — Freeze the Condensed Sheet + `imported_association` on the Epic 11 Import Spine

Status: backlog

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
3. Imported rows land `status = imported_unverified` [Source: docs/launch-campaign/association-condensed-sheet-spec.md:46] — so they are **excluded from fraud-detection, marketplace-extraction, and partner-API `verify_nin`** by the existing 11-1 status gate (the honest Tier-2 stratum) [Source: apps/api/src/db/schema/respondents.ts:9-13].

### AC4 — Required-field + dedup discipline that makes or breaks the data
1. **Phone is mandatory** — a row with no phone can't be deduped or re-contacted; the importer treats it as invalid (row-level failure with a clear reason, not a silent insert) [Source: docs/launch-campaign/association-condensed-sheet-spec.md:29,40]. Phone normalises to +234 on import.
2. **Dedup against existing individuals:** the import auto-skips any row whose phone (or NIN, when present) already exists in any source, so a member who already self-registered won't double-count [Source: docs/launch-campaign/association-condensed-sheet-spec.md:49]. NIN is optional (nullable post-11-1; the partial-unique index protects FR21 when NIN is present) [Source: docs/launch-campaign/association-condensed-sheet-spec.md:36].
3. **Consent is the gate:** Consent = "Yes" → `consentMarketplace = true`; rows marked **No or blank are NOT entered** [Source: docs/launch-campaign/association-condensed-sheet-spec.md:37,58].
4. **Trade is validated against the controlled list** (Appendix B); free-text "Tailor"/"Tailoring"/"fashion designer" must not become three clusters of one [Source: docs/launch-campaign/association-condensed-sheet-spec.md:41].

### AC5 — Lawful basis, reconciliation, and source-by-construction attribution
1. Import **lawful basis** records `ndpa_6_1_e` (public task — a government labour registry) WITH the per-member Consent column as the defensible backstop; `lawful_basis_note` cites this sheet + the meeting date (final basis to confirm with the DPIA owner — Appendix H) [Source: docs/launch-campaign/association-condensed-sheet-spec.md:59] [Source: apps/api/src/db/schema/import-batches.ts:74-75].
2. **Reconciliation:** `rows_inserted` vs the head's **declared member count** (sheet header) surfaces gaps as a data-quality check / follow-up trigger [Source: docs/launch-campaign/association-condensed-sheet-spec.md:20,49].
3. **Source-by-construction attribution:** association-sheet rows are attributed `imported_association` by the ingestion path — they need NO "How did you hear about us?" question (that's Story 13-1's self-report, which does NOT run on imports) [Source: docs/launch-campaign/attribution-spec.md:17,31-34]. (A member who instead self-registers *direct* on the website picks "Association / cooperative" in 13-1's question — a separate path.)
4. **⚠️ Member-side verification — the incentive is also a data-integrity attack vector** (peer review 2026-06-25). The association pitch ("register your members → the State sites a textile centre where YOU are") **incentivises roll-padding with ghost members**, and the declared-vs-received reconciliation (AC5.2) **cannot catch it — the head controls both numbers.** Dedup catches duplicates, not fabrications. So `imported_association` rows are held as **Tier-2 `imported_unverified`** until a member-side check: a **confirmation SMS** (once Termii sender-ID clears) OR a **sampled call-back audit** of N rows per batch before any row is promoted/counted as verified. The verification mechanism (SMS vs sampled call-back) is a deliberate AC, not an afterthought.
5. **⚠️ Proxy collection is a NEW DPIA pattern, not just an import format** (peer review 2026-06-25). An **untrained association head collecting members' NIN/phone on a paper sheet** introduces: a **processor/controller relationship**, **paper-retention + security** obligations, and **proxy-consent** provenance. **Appendix H (DPIA) needs a real update** for this collection pattern — a per-member consent column is necessary but NOT sufficient. This gates the *cascade go-live*, separate from the importer build.

### AC6 — Tests
1. Importing a valid frozen-format sheet inserts respondents with `source = imported_association`, `status = imported_unverified`, consent mapped, trade validated, phone normalised — asserted end-to-end through the dry-run → confirm path.
2. Required-field failures (no phone) and consent=No/blank rows are skipped/failed with clear reasons; a phone/NIN that already exists auto-skips (no double-count).
3. `imported_unverified` rows are confirmed excluded from the fraud/marketplace/verify paths by the existing status gate (regression assertion). Full `pnpm test` green; tsc + lint clean.

## Tasks / Subtasks

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

## Change Log

| Date | Change |
|------|--------|
| 2026-06-25 | Story authored by Bob (SM) via canonical *create-story, per SCP-2026-06-25-launch-campaign (Epic 13). 6 ACs (freeze the condensed sheet as the import contract; add `imported_association` source + `import-sources.ts` config; wire the importer on the 11-2 backbone; required-field/dedup discipline; lawful-basis/reconciliation/by-construction attribution; tests). REUSE the Epic 11 spine (11-1 done, 11-2 association slice pulled forward) — NOT a rebuild. Status → backlog. Sheet = Monday zero-cost deliverable; importer = fast-follow. |
