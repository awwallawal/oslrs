# Story 11.7: `identity_ambiguous` Resolution & Manual Respondent-Merge Tooling

Status: backlog

> 🌱 **Backlog shell** — spun up 2026-07-20 (John PM) from the email-channel planning thread. Not dev-ready.

## Why
The taxonomy **R2** defines a DISTINCT-identity key (NIN → phone → `id`) and an explicit **`identity_ambiguous`** bucket for rows that can't be safely deduped (shared/duplicate phones, email-only matches, proxy addresses). Multi-channel ingest (11-2 imports, 11-5 email rows, 13-2 associations, public wizard) **will** produce duplicate-candidate + ambiguous rows. Today those are correctly **flagged, not merged** (11-5 `email_match_review`, `shared_email`; Epic 11 explicitly deferred auto-merge). But nothing lets a Super Admin **act** on the flags. This story builds the human resolution path: review the ambiguous/duplicate set, and merge or keep-separate with a full audit trail — never a silent merge.

## Sketch (to be fully specced at *create-story time)
- A Super-Admin "Identity Review" surface listing `identity_ambiguous` + `email_match_review` + `shared_email` candidates (from the 12-4 model + import `failure_report`s).
- A **manual merge** action: pick a survivor, fold provenance (sources, submissions, reference codes) onto it, soft-delete the merged row (status flip, audit-logged) — respecting the 9-26 "erasing an account must not delete survey data" rule.
- A **keep-separate** action that clears the flag with a reason.
- No auto-merge; every action audited (`respondent.merged` / `respondent.kept_separate`).

## Dependencies / cross-refs
- **HARD:** 11-2 (import spine), 12-4 (identity key + `identity_ambiguous` derivation — R2 owner).
- Coordinates with: 11-5 (email review flags), 11-6 (backfill may surface duplicates), 13-2 (association dedup), taxonomy R2.

## Change Log
| Date | Change |
|------|--------|
| 2026-07-20 | Backlog shell created (John PM) from the email-channel ingest thread. Epic 11. Implements the R2 `identity_ambiguous` resolution path (currently flag-only). |
