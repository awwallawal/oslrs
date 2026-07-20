# Story 11.5: Email-Channel Ingest — First-Class Respondent Email, Reachability-Based Required Fields & `shared_email`-Safe Dedup

Status: ready-for-dev

> 📎 **Requirements brief:** [`docs/launch-campaign/itf-email-channel-ingest-brief.md`](../../docs/launch-campaign/itf-email-channel-ingest-brief.md). 🔗 Anchors on the [Registry Data-Status Taxonomy](../planning-artifacts/registry-data-status-taxonomy.md) + the [13-33 ingestion contract](../../docs/registry-unified-ingestion-contract.md).
>
> ✂️ **SPLIT (Awwal-ratified 2026-07-20).** This is the **INGEST half**. The email **verification/contact half** (confirm-first magic-link, tier-1→tier-2 promotion, bounce, Cohort-D send, DPIA) is carved into **Story 13-39** (Epic 13 launch), which depends-on this + the 13-2 Axis-3 marker + a DPIA update. Rationale: ingest ships value now with zero sends + zero external gates; the send is DPIA/taxonomy-gated launch work. Mirrors the 11-2(spine)/13-2(campaign) pattern.
>
> ✅ **PM rulings baked in (John):** `respondents.email` non-unique (email is not 1:1 with a person); `shared_email` collapse threshold **N=3** (operator-tunable — two sharing an address can be a legit couple; ≥3 signals a proxy/cybercafé). Email is a **SOFT** dedup key (flag-not-collapse); phone/NIN stay hard.

> 🎯 **WHY (strategic):** the ITF-SUPA Oyo artisan register (`Oyo_shortlisted_artisans.pdf`, 3,675 rows) is a high-value, government-accountable acquisition cohort with clean **E-MAIL / LGA / TRADE** — but its shortlist PDF has **REDACTED phones**, and Story 11-2's importer makes phone mandatory → every row fails today. This story makes the registry ingest **email-only rows** so we are **independent of whether ITF ever hands us a clean CSV**: if they do, we gain phone + stronger dedup; if they refuse/stall, we still extract ~3,600 email-reachable artisans from the PDF we already hold. Ingested rows land as honest **tier-1 `imported_unverified`** (source-attested, held out of marketplace/fraud until the 13-39 verification promotes them).

<!-- Authored 2026-07-20 by Bob (SM) via *create-story (yolo); PM-validated + split by John. Epic 11 (Multi-Source Registry). Builds on 11-2 (import spine, review). -->

## Story

As the **Super Admin / Ministry data operator ingesting an accountable public register (ITF-SUPA) that carries email but not phone**,
I want **email promoted to a first-class respondent contact field, a per-source "reachable if phone OR email" required-field policy, and `shared_email`-safe email-aware dedup**,
so that **we can ingest the ~3,600 email-reachable ITF artisans regardless of whether ITF ever gives us a clean CSV, landing them as honest tier-1 `imported_unverified` rows, without collapsing distinct people who share an email or exposing contact-PII publicly.**

## Context

Story 11-2 (import spine — dry-run → confirm → 14-day rollback, CSV/XLSX/PDF parsers, `imported_unverified` status gate) is DONE/review. Its real-fixture test against ITF's PDF surfaced two facts that drive this story: **(a) the register's phones are redacted** and **(b) `respondents` has NO email column** — so 11-2 preserves imported email only in `metadata.imported_email`, where it can neither dedup nor be a campaign target. This story closes that gap. **Contacting/verifying** these rows is Story 13-39.

**Reuse, do not rebuild:** the import path (11-2 `ImportService`, pure `ingest-plan.ts`, `import-sources.ts`) and the email normaliser (`normaliseEmail`) all exist. This story extends them; it does not fork them.

## Acceptance Criteria

### AC1 — First-class `respondents.email`
1. Add a nullable `email` column to `respondents` (normalized via the existing `normaliseEmail`), populated by the import path (and any trivial adjacent new-write chokepoint; wizard/OAuth backfill is OUT of scope).
2. Add a **non-unique** index on `email` (email is NOT 1:1 with a person — AC3.2 — so NO UNIQUE/partial-unique). Managed via a plain Drizzle `index()` or a `migrate-*-init.ts` runner (implementer's call, documented; follow 11-2's `migrate-import-service-init.ts` pattern if a normalized index is needed).
3. The importer writes the normalized email to `respondents.email` (superseding `metadata.imported_email` for the column; keep `import_extra` for genuinely column-less fields). Email is covered by the existing respondent-erasure path.

### AC2 — Reachability-based required-field policy (phone OR email)
1. Add a per-source `requiredContact: 'phone' | 'email' | 'phone_or_email'` to `import-sources.ts`. `imported_association` → `phone`; `imported_itf_supa` → `phone_or_email`; `imported_other` → operator-selectable (default `phone_or_email`).
2. The pure `planIngest` required-field gate becomes a **reachability check**: a row passes when it has ≥1 valid channel per the source policy; a row with **neither** a valid `+234##########` phone **nor** a valid email → `failed: no_reachable_contact`. The `phone`-only policy preserves 11-2 behavior EXACTLY (regression-assert).

### AC3 — Email-aware dedup with `shared_email` safety
1. Dedup keys extend to **phone OR email OR NIN**. Phone/NIN remain **hard** keys (auto-skip a match; NIN via the FR21 partial-unique). Email is a **SOFT** key.
2. **`shared_email` guard (load-bearing safety rule):** if one normalized email appears on **≥3 rows** (operator-tunable) within a batch, it is a shared/proxy/cybercafé address — **do NOT dedup-collapse those rows**; insert all and flag `shared_email` on each (batch `failure_report` + row metadata) for operator review.
3. An email-only match against an **existing** respondent (no phone/NIN match) is a **review/possible-duplicate** signal (`matched: email_match_review`), **never a silent skip that erases a distinct person**. Per the **taxonomy R2/R5 ruling**, email is NOT part of the DISTINCT-identity key (NIN → phone → id) — an email-only match feeds the **`identity_ambiguous`** bucket + the manual-merge tooling (Story 11-7), it does not alter the distinct count. (Soft-merge on name similarity is OUT of scope here — flag, don't merge.)
4. Intra-batch AND against-registry dedup both honor 3.2/3.3; the existing-email lookup is batched (one query, mirroring 11-2's phone/NIN lookup) using `respondents.email`.

### AC4 — Privacy: email is contact-PII, never public
1. `respondents.email` MUST be excluded from every public surface: marketplace cards/reveal, public `/insights`, and any anonymized analytics (12-x). Available only to campaign/verification/admin/authorized reads. Add a regression test asserting email is absent from the public marketplace + insights payloads.
2. The `registry_unified` read may carry email for admin/export use, but public consumers of that read MUST NOT select/emit it.

### AC5 — ITF wiring + both-eventualities
1. `imported_itf_supa` ingests **email-only** rows end-to-end (dry-run → confirm) using the 11-2 PDF path already proven (header auto-detection + the corrected real column mapping), landing tier-1 `imported_unverified` with `email` populated, `phone` null.
2. The **same importer** ingests a clean **CSV/XLSX** ITF export with **no extra code** — more columns (incl. phone) simply strengthen dedup + reachability. Prove with a CSV fixture mirroring the real headers.

### AC6 — Tests
1. Unit (pure): reachability policy (phone-only vs phone_or_email vs email-only-valid); `shared_email` flag-not-collapse at N=3; email soft-match → `email_match_review` not skip; phone/NIN still hard.
2. Integration (real DB): email-only ITF-shaped batch → tier-1 rows with `email` set + `phone` null; existing-email soft-match; `shared_email` batch not collapsed; phone-only source unchanged.
3. Privacy regression: email absent from public marketplace + `/insights` payloads (AC4).
4. Full `pnpm test` green; tsc + lint clean.

## Tasks / Subtasks

- [ ] **Task 1 — `respondents.email` first-class (AC1, AC4)**
  - [ ] 1.1 Add nullable `email` to `respondents` schema + non-unique index; update `RespondentMetadata` note (column supersedes `imported_email`).
  - [ ] 1.2 Importer writes normalized email to the column; keep `import_extra` for column-less fields.
  - [ ] 1.3 Privacy guard: exclude `email` from marketplace + public-insights payloads (+ regression test).
- [ ] **Task 2 — Reachability required-field policy (AC2)**
  - [ ] 2.1 Add `requiredContact` to `ImportSourceConfig`; set per-source values.
  - [ ] 2.2 Generalize `planIngest`'s required gate to a reachability check (preserve 11-2 phone-only behavior exactly).
- [ ] **Task 3 — Email-aware, `shared_email`-safe dedup (AC3)**
  - [ ] 3.1 Extend the batched existing-lookup to include `respondents.email`; build an email→id map.
  - [ ] 3.2 `planIngest`: email as SOFT key; intra-batch `shared_email` frequency detection (N=3) → flag-not-collapse; email-only registry match → `email_match_review`.
  - [ ] 3.3 Surface `shared_email` + email-typo warnings in the dry-run preview + `failure_report`.
- [ ] **Task 4 — ITF wiring + both-eventualities (AC5)**
  - [ ] 4.1 `imported_itf_supa` `requiredContact: 'phone_or_email'`; email-only PDF path end-to-end.
  - [ ] 4.2 CSV/XLSX ITF export ingests with no new code (prove with a fixture).
- [ ] **Task 5 — Tests (AC6)** — pure + real-DB integration + privacy regression; full suite green.
- [ ] **Task 6 — Sprint status + code review** — flip `11-5` → review; run `code-review` before commit.

## Dev Notes

### Architecture & engine map (exact targets — verified during Story 11-2)
- **Respondents schema:** `apps/api/src/db/schema/respondents.ts` (`RespondentMetadata`, `PIPELINE_EXCLUDED_STATUSES`). Add `email` here.
- **Import spine (REUSE):** `apps/api/src/services/import.service.ts`; pure `apps/api/src/services/import/ingest-plan.ts` (required-field + dedup — THE file for AC2/AC3); `apps/api/src/config/import-sources.ts` (add `requiredContact`); `apps/api/src/services/import/parsers/*` (PDF header-detection already handles the ITF title rows).
- **Email normaliser (REUSE):** `apps/api/src/lib/normalise/email.ts` (`normaliseEmail`, emits `suspected_typo`).
- **Read path (AC4 exclusion points):** `apps/api/src/services/registry-unified.*`, public-insights, marketplace.

### Critical implementation rules (project-context)
- Drizzle schema files MUST NOT import `@oslsr/types`; CI uses `db:push:force`; normalized indexes/CHECKs live in `migrate-*-init.ts` runners (auto-discovered by `db-push-full.ts`) — see 11-2's `migrate-import-service-init.ts`.
- `AppError` only; parameterized SQL only; structured Pino logging `{domain}.{action}` (e.g. `import.email_shared_flagged`); never log raw PII (hash where needed).
- Integration tests use `beforeAll`/`afterAll` vs a scratch `app_test` DB; append-only `audit_logs` can't be deleted in teardown (leave tagged rows).
- **`shared_email` is the load-bearing correctness rule** — a blind email-collapse would merge distinct artisans. Test it explicitly (prove it fires on real-shaped data — the "fix that never fires" discipline).

### Dependencies & sequencing
- **HARD:** 11-1 (schema), 11-2 (import spine — review).
- **Unblocks:** 13-39 (email verification — needs `respondents.email` + tier-1 rows).
- **Coordinates with:** 11-4 (source badges — show `imported_unverified` in the registry), 13-33 (registry_unified — carry email, never expose), 12-4/12-5 (email never a public axis; honest denominator when 3,600 imports land).

### Scope OUT (do not build)
- Email verification loop / confirm-first send / Cohort-D / DPIA send-gate → **Story 13-39**.
- SMS/Termii verification (separate).
- Wizard/OAuth backfill of `respondents.email` for pre-existing rows (separate op; email dedup vs the existing registry is intentionally weak until then — that's why email is a SOFT, flag-not-collapse key).
- Soft-merge of email-only matches (flag only).

### References
- [Source: docs/launch-campaign/itf-email-channel-ingest-brief.md]
- [Source: _bmad-output/implementation-artifacts/11-2-import-service-parsers.md] — import spine + real ITF-fixture findings
- [Source: apps/api/src/services/import/ingest-plan.ts] — required-field + dedup (AC2/AC3 target)
- [Source: apps/api/src/config/import-sources.ts] — per-source config (add `requiredContact`)
- [Source: apps/api/src/lib/normalise/email.ts] — `normaliseEmail` + `suspected_typo`
- [Source: _bmad-output/planning-artifacts/registry-data-status-taxonomy.md] — Axis-3 verification tiers
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-11]

## Change Log

| Date | Change |
|------|--------|
| 2026-07-20 | Authored by Bob (SM) via *create-story (yolo) from Story 11-2's real-ITF-fixture findings + the requirements brief. PM-validated by John; **SPLIT (Awwal-ratified): this = INGEST half (email column, reachability, `shared_email`-safe dedup, privacy, ITF both-eventualities); verification/send carved to Story 13-39.** `shared_email` threshold ruled N=3; email = SOFT dedup key. Builds on 11-2. Epic 11. Status → ready-for-dev. |

## Dev Agent Record

### Agent Model Used

_(Populated when story enters dev.)_

### Debug Log References

### Completion Notes List

### File List
