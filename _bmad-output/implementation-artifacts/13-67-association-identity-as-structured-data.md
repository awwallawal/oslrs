# Story 13.67: Association identity as structured data — the name the badge will say

Status: ready-for-dev

<!--
  CARVED 2026-09-05 at adjudication, deliberately NOT as an amendment to 13-2.
  13-2's ACs are delivered and its channel is live on prod (8,278 rows). Reopening a story whose
  ACs are done, whose AC3.3/AC4.3 were corrected mid-flight, and which carries five open residuals
  would give a fresh agent a scope it has to navigate rather than execute. This is the small,
  clean slice that stands between 13-2 and 13-58.
-->

## Story

As **an employer about to see an association badge on a worker's card**,
I want **the association's name to be a stored field rather than free text in an operator note**,
so that **the badge can say who actually vouched for this person — which is the whole content of
the claim it makes.**

## Context — why this exists, measured

13-58 (`marketplace-association-confirmed-badge`) has as its first AC:

> A card whose respondent is `source = imported_association` … renders **"[Association] — confirmed
> member"** using **the stored association name**.

**There is no stored association name.** Verified 2026-09-05: no `association_name` column anywhere,
no `member_confirmed` flag anywhere. The only association identity on prod is free text in
`import_batches.source_description`, written by the operator at import time:

| batch | `source_description` (truncated) | rows |
|---|---|---|
| `01a071c8-709f-73a3-9e31-eb0e8cedf01a` | `ASNAT Tiler Association (Oyo State) - WhatsApp intake, 56 clean rows of 70; 14 held for ma…` | 56 |
| `01a072ae-83e7-7e8f-902d-590f0c589c74` | `Oyo farming groups consolidated intake - 8,234 flag-free rows of 9,563 collected (NCARES +…` | 8,222 |

A badge reading *"ASNAT Tiler Association (Oyo State) - WhatsApp intake, 56 clean rows of 70 —
confirmed member"* is not a badge. And the second row is worse than untidy: **"Oyo farming groups"
names no accountable body at all**, and the badge's entire premise is that a named body vouched.

⭐ **Awwal answered that on 2026-09-05 — the vouching bodies are:**
- **ASNAT** (Association of Tilers, Oyo State) → batch `01a071c8…`, 56 rows
- **AFAN** (All Farmers Association of Nigeria) → batch `01a072ae…`, 8,222 rows

That ruling is the reason this story is buildable. Do not re-derive it from the source sheets; NCARES
and L-PRES are *programme registers*, not associations, and reading them as the vouching body would
put a programme name on a card where a guild name belongs.

## ⛔ Read before designing the schema

**Put the name on the RESPONDENT's metadata, not only on the batch.** The obvious design is
`import_batches.association_name`, and it is wrong on its own:

`registry_unified` — the canonical read every marketplace/insights surface aggregates over — exposes
`respondent_id, lga_id, source, status, nin, phone_number, submitter_id, metadata,
consent_marketplace, consent_enriched, created_at, raw_data`. **It does NOT expose `import_batch_id`.**
So a batch-only design forces every badge read into a join, or forces a change to the canonical view
— which has its own governance rules in `registry-unified.sql.ts` ("state WHO needs it and WHY", and
raw substrate only).

`metadata` **is** already exposed. Writing `metadata.association_name` at import time means the badge
is readable everywhere with no join, no new view column, and no view edit. It travels with the row,
survives rollback, and mirrors how `metadata.import_extra` already works.

⚠️ Store it in **both** places, and know why each is there: `import_batches.association_name` is the
operator-facing record of who a batch came from (and the thing the next import's UI should prompt
for); `respondents.metadata.association_name` is the read path. The batch column is the source of
truth; the respondent copy is a denormalisation written at insert.

## Acceptance Criteria

### AC1 — Structured association name on the batch
`import_batches` gains `association_name` (nullable text). The import path accepts it and stores it.
Nullable because `imported_itf_supa` and `imported_other` legitimately have none — this field is not
a general "who sent this", it is specifically the **accountable body that vouched**.

### AC2 — The name travels to the respondent
Every row inserted by an `imported_association` batch carries `metadata.association_name`. Written in
the SAME transaction as the respondent and its submission, for the reason AC3.4 gives: a respondent
whose provenance is missing is exactly the half-state this avoids.

### AC3 — Backfill the two live batches
`01a071c8…` → **ASNAT**, 56 rows. `01a072ae…` → **AFAN**, 8,222 rows.

⚠️ **This is a production data operation on 8,278 live rows, not a `WHERE` clause typed at the
keyboard.** PREDICT the affected count per batch, run it, then verify the count matches the
prediction — [[pattern-predict-then-compare]]. `respondents.metadata` is JSONB and already holds
`normalisation_warnings` / `imported_email` / `import_extra` on these rows: **merge, never replace.**
An `UPDATE … SET metadata = '{"association_name":…}'` would silently destroy the R2 ambiguity flags
and the verbatim `full_name` that R-A6 depends on for recovery.

### AC4 — Operator input at import time
Whoever confirms an `imported_association` batch supplies the association name. It must not be
inferable from a filename or guessed from the sheet.

### AC5 — Tests
Round-trip (supplied → batch → respondent metadata); a non-association source stores nothing; the
backfill **merges** JSONB rather than overwriting (RED-verify: assert a pre-existing metadata key
survives); a missing name does not block an import but is visible to the operator.

## Explicitly OUT of scope

- **The badge itself** — that is 13-58, and it should be built only after this lands.
- **Tier-2 "Member-verified"** — 13-58's AC2. **There is no substrate for it**: no `member_confirmed`
  column, no SMS confirmation loop (Termii is not cleared), no Assessor callback queue. Do not build
  it speculatively; a tier that cannot be earned is a badge that never changes.
- **Opening `PIPELINE_EXCLUDED_STATUSES`** — 13-2 R-A2, and it must come AFTER the badge renders.
  Reversed, 8,278 people appear on marketplace cards reading as ordinary verified listings, which is
  Awwal's ruling §3 breached at scale.

## Traps a fresh agent will hit

1. **13-38 and 13-58 share the slug `marketplace-association-confirmed-badge`.** 13-38 is `done`
   (closed on prod 2026-08-18) and shipped **experience levels and trading names** — NOT the
   association badge. 13-58 was carved out of it on 2026-08-09 and is `backlog`. Adjudication read
   the done one as the gate on 2026-09-05 and had to correct 13-2's R-A2. Check the number, not the name.
2. **R1 is LOCKED.** Never render a bare "✓ Verified" for an import. There is no NIMC path, and a
   present NIN here was **proxy-transcribed by the association head**. Attributing the claim to a
   named body is both honest and a stronger signal.
3. **Nothing renders yet.** `marketplace_profiles` = 291 while the registry holds 8,662, because
   `imported_unverified` is still in `PIPELINE_EXCLUDED_STATUSES`. Expect an empty marketplace for
   these rows until R-A2 opens — that is correct, not a bug in your work.
4. **13-2 read `ready-for-dev` until 2026-09-05** while its channel was live. If any other artefact
   still says the association channel is unbuilt, distrust it and measure.

## Measured facts (2026-09-05, prod)

| fact | value |
|---|---|
| `imported_association` respondents | **8,278** |
| `public` / `enumerator` | 383 / 1 |
| `marketplace_profiles` | **291** |
| registry total (`totalRegistered`) | **8,662** |
| LGAs with a publishable trade | **33** |

## Dependencies

- **HARD: 13-2** — `review`, channel live. This story completes the provenance half it left implicit.
- **BLOCKS: 13-58** — AC1 there cannot be satisfied until AC1–AC3 here land.
