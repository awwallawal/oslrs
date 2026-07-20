# Story 11.6: Backfill `respondents.email` for Existing Wizard / OAuth Rows

Status: backlog

> 🌱 **Backlog shell** — spun up 2026-07-20 (John PM) from the email-channel planning thread. Not dev-ready; captures intent + deps so it isn't lost.

## Why
Story 11-5 adds a first-class `respondents.email` column and populates it via the **import** path. But existing self-registered rows (public wizard, Google-OAuth registrants) carry their email only on `users.email` / in submission `raw_data`, not on `respondents.email`. Until those are backfilled, **email dedup against the live registry is weak** (11-5 keeps email a SOFT, flag-not-collapse key precisely because of this) and the email campaign can't target self-registered respondents by respondent-email. This story closes that gap with a one-shot, audited backfill.

## Sketch (to be fully specced at *create-story time)
- Operator-gated one-shot runner (`scripts/_backfill-respondent-email.ts`) that populates `respondents.email` from the authoritative source per row: linked `users.email` (via `respondents.user_id`), else the wizard submission `raw_data` email, normalized via `normaliseEmail`.
- Idempotent; dry-run count first; hashed audit trail (mirror the `prep-input-sanitisation-layer` backfill pattern).
- Respect the R2 identity key — do NOT merge rows; only populate the email field.
- After backfill, email dedup (11-5) becomes meaningfully strong against the existing registry.

## Dependencies / cross-refs
- **HARD:** 11-5 (the `respondents.email` column must exist first).
- Coordinates with: R2 identity key + `identity_ambiguous` (taxonomy), 13-39 (email campaign targeting), Story 11-7 (merge tooling acts on any duplicates this surfaces).

## Change Log
| Date | Change |
|------|--------|
| 2026-07-20 | Backlog shell created (John PM) from the email-channel ingest thread. Epic 11. Blocked on 11-5. |
