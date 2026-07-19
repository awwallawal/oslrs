# Registry Unified Ingestion Contract (Story 13-33 AC4)

**The invariant every registry channel MUST satisfy:**

> Each ingestion channel produces **BOTH** a `respondents` row (carrying
> denormalized identity + geography: `nin`/name/`phone_number`/`lga_id`,
> consent, `source`, `status`, provenance) **AND**, when it collects answers, a
> `submissions` row with `raw_data` (the survey payload — skills, employment,
> gender, business).

## Why

The canonical read (`registry-unified.ts`) is `respondents ⟕ latest-non-empty
submission`. It is honest by construction:

- A channel that writes a respondent but **no** submission still appears in every
  count/insight — as a registered person **without answers** (`raw_data` null:
  `data_lost` / `no_submission` / `pending_nin` / a bare import).
- A channel that writes a submission but **no** respondent would be **invisible**
  to the registry (the read is anchored `FROM respondents`). This is the failure
  mode the contract forbids.

So: **skills / marketplace / insights presence requires the respondent row; the
answer-bearing analytics require the submission's `raw_data`.** An import that
writes only a respondent is *counted but answerless*; an import that writes only
a submission is *lost*.

## Live channels (must already satisfy this)

- **Public wizard** — writes respondent + submission(`raw_data`) at submit.
- **Field enumeration** — writes respondent + submission(`raw_data`) with GPS.
- **Webhook / manual** — writes respondent + submission(`raw_data`).

The unified read's `registry-unified-db-smoke.integration.test.ts` guards the
READ side of this: submission-less respondents are included (never silently
dropped), and answer-bearing respondents carry `raw_data`.

## Source #3 — the association importer (NOT built yet — 13-2 is enum-only)

`imported_association` is currently an enum value + taxonomy classification only
(Story 13-2); there is no live importer. When it is built it **MUST write both
rows**:

1. a `respondents` row (`source = imported_association`, `status =
   imported_unverified`, denormalized identity + `lga_id`), and
2. a `submissions` row with `raw_data` carrying at least the association 12-column
   core set (skills + sector), so association members appear in
   marketplace/insights skills — not merely as a headcount.

If it writes only the respondent, association members are **counted but invisible
to skills/marketplace/insights**. That requirement is encoded as:

- this document,
- the read design (which already includes submission-less rows, so a
  respondent-only import is *counted* — the gap is only *answers*), and
- a failing/`todo` test in `registry-ingestion-contract.test.ts` that must be
  implemented alongside the importer.

Do **not** inherit the "imports are the exception" carve-out — close it here.
