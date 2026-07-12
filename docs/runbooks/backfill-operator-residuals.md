# Backfill & One-Shot Operator Residuals — Run Tracker

**Purpose.** A single source of truth for every **state-mutating, operator-run one-shot** in the repo
(data backfills + campaign blasts), so none silently stays un-run. An un-run backfill is the *same*
failure mode as a silent code fallback: a fix that never fires and nobody notices — see the
["ship-a-fix-that-never-fires" pattern](../../.claude/projects/C--Users-DELL-Desktop-oslrs/memory/pattern-ship-a-fix-that-never-fires.md)
(13-21 dead thank-you loop, 13-23 sentinel binding, 13-23-M2 backfill stale-carry).

> **Scope:** operator-run scripts that MUTATE prod state (data or outbound email). Schema
> `migrate-*-init.ts` scripts run automatically at deploy (CI `db:push:force`) and are **not** tracked
> here (see the appendix for the inventory). Pure read-only diagnostics (`_audit-*`, `_diagnose-*`,
> `_list-*`, `_verify-*`, `*-smoke-*`) are also out of scope.

---

## How to verify "did we run it?" — do NOT trust memory

**Every data backfill below is idempotent + PREVIEW-BY-DEFAULT.** That is the whole trick:

1. Run the script with `--dry-run` on the box.
2. Read the count of rows it *would* change.
   - **0 rows to change → already applied (or a genuine no-op). Tick it ✅.**
   - **N > 0 rows → NOT yet applied (or new rows accumulated). It's still ⬜.**
3. For a couple of scripts a direct SQL probe is cleaner than a dry-run — given per row.

This converts every ❓ below into a ✅ / ⬜ in ~30 seconds each, empirically, without guessing.
Prod access (per project memory): `ssh root@100.93.100.28` (Tailscale IP — MagicDNS name doesn't
resolve in-shell) → `docker exec oslsr-postgres psql -U oslsr_user -d oslsr_db`. Scripts:
`cd /root/oslrs/apps/api && pnpm tsx scripts/<name>.ts --dry-run`.

**Status legend:** ✅ applied + verified (date + evidence) · 🟡 dry-run done, apply pending · ⬜ not run ·
❓ unverified — run the dry-run/probe to resolve · ⛔ deliberately deferred (decision on file) ·
➖ N/A — verified no-op.

---

## A. Data backfills (prod row mutation)

| Script (`apps/api/scripts/`) | Story | What it does | Status | Verify / evidence |
|---|---|---|---|---|
| `migrate-lgaid-uuid-to-slug.ts` | 13-16 | Converts `respondents.lga_id` UUID→canonical slug | ✅ **applied 2026-07-05** (`acd68e6`) | 139 converted, **0 UUID left**. Probe: `SELECT count(*) FROM respondents WHERE lga_id ~ '^[0-9a-f-]{36}$'` = 0 |
| `_backfill-public-form-binding.ts` | 13-23 | Binds sentinel `no-form-pinned-at-submit` public submissions to the form pinned at their `submitted_at` (audit-timeline) | ⬜ **not run** (new; code review-passed 2026-07-12) | **Probe 2026-07-12: 2 sentinel rows** (Modupe 07-06 + 1). Gated on committing 13-23 first. `--dry-run` → apply |
| `_backfill-registration-autosends.ts` | 13-21 | Sends the confirmation + evergreen thank-you/referral that never fired for the public channel (Modupe + completers) | ⬜ **not run** (memory: "NOT yet done") | ⚠️ **Resend-Pro-gated** (send, not just DB). `--dry-run` lists the pool; markers `confirmation_email_sent_at` / `thankyou_referral_sent_at` gate idempotency |
| `_backfill-reference-code.ts` | 9-58 | Fills `OSL-<YYYY>-<code>` for respondents with `reference_code IS NULL` | ✅ **applied — verified 2026-07-12** | Probe: `reference_code IS NULL` = **0 / 142 respondents** ⇒ fully backfilled |
| `_backfill-wizard-public-users.ts` | 9-38 | Provisions passwordless `public_user` accounts for respondents registered 9-12→9-38 (email from `submissions.raw_data.email`) | ✅ **APPLIED 2026-07-12** | LIVE run: **provisioned=75, already-linked=0, skipped-no-email=63, failed=0**. The 63 no-email public respondents remain accountless by design (no recovery key) |
| `_backfill-wizard-questionnaire-loss.ts` | 9-26 B | Stamps `metadata.questionnaire_data_lost=true` on the 2026-05-14→19 data-loss cohort (NDPA record; answers unrecoverable) | ✅ **applied — verified 2026-07-12** | Probe: `metadata->>'questionnaire_data_lost'='true'` = **55** — matches 13-25's documented 55 exactly ⇒ marker complete |
| `_backfill-name-canonicalization.ts` | 9-18 F | Fixes mis-split Yoruba surname-first names on existing rows — **two-phase: `--dry-run` writes an XLSX for the operator to fill a `surname` column, `--apply` re-reads it** | ⬜ **DEFERRED — verified 2026-07-12** | No `surname` column/data exists; the manual surname-designation XLSX pass was never done, so the backfill cannot have run. Low priority (cosmetic name-split); revisit post-launch |

## B. Campaign / recovery sends (outbound email — operator-gated)

| Script | Story | What it does | Status | Notes |
|---|---|---|---|---|
| `_recover-abandoned-wizard-drafts.ts` | 9-26 J | Emails a wizard-resume magic-link to drafts holding Step-4 answers but never submitted | ⛔ **SUPERSEDED by 13-11 — do NOT fire** | Probe: 214 answer-bearing drafts — a **subset** of 13-11's 271-draft cohort (13-11 covers steps 1-5 with branched copy). Firing both double-messages the same people. Retire this in favour of `_reengagement-email-blast.ts` |
| `_cohort-a-supplemental-survey-blast.ts` | 9-28 | Supplemental-survey recovery send to Cohort A (identity-only salvage) | ⛔ **deliberately not fired** ("make do" decision) | Capability shipped, operator-gated; decision on file |
| `_reengagement-email-blast.ts` | 13-11 / 9-27 | "Finish your registration" nudge to stalled `wizard_drafts` (steps 1-5), EXCLUDING emails that already completed + suppressed | ⬜ **not fired — dedup verified 2026-07-12** | **True cohort = 271** (0 suppressed, all disjoint from completed registrants). ✅ **Silent 200-cap FIXED (2026-07-12): default now UNCAPPED; `--max-recipients` is opt-in + warns loudly if it truncates** — but the fix must be COMMITTED+DEPLOYED first (box still runs old default-200 until then). Email service still `tier:free` (Pro NOT active). Live once deployed: `--confirm-i-am-not-dry-running --confirm-resend-pro-active` (no cap flag needed). If firing BEFORE deploy, pass `--max-recipients 271`. Re-run `--dry-run` at send-time (re-applies suppressions fresh). **SUPERSEDES 9-26J — do NOT fire both.** DISJOINT from 13-24 welcome → safe to fire independently |
| `_thankyou-referral-blast.ts` | 13-12 | Evergreen thank-you/referral blast | ❓ **unverified** | Overlaps 13-21 auto-send; check for double-send before firing |

> **13-24 coordinated WELCOME send** (all 116 emailable real registrants) is a *planned* send with no
> dedicated script yet — tracked in story 13-24; add its row here when the script lands.

## C. Verified no-ops (no script / no migration needed)

| Item | Story | Why it's a no-op |
|---|---|---|
| Skills-token backfill | 13-22 | Prod audit (`_audit-skills-values.ts`) found **0 unknown tokens** (skills 43canon/10custom, training 46canon/4custom) → read-only fix, **no migration**. ➖ |
| Skills taxonomy 61→150 | 13-20 | Choices-sheet-only XLSX patch; survey sheets untouched. ➖ |
| NIN format-only rows | 13-15 | 78 "failing" Mod-11 rows are VALID NINs — **do NOT purge**. ➖ |

---

## Silent-cap audit (2026-07-12) — a sibling of "a fix that never fires"

A hardcoded default `--max-recipients`/`--max-rows` that silently truncates reads as "covered everyone"
when it didn't — the same silent-failure class. Swept all operator scripts:

- ✅ **Fixed (were truly silent — SQL `LIMIT`, no cap-hit warning):** `_reengagement-email-blast.ts`,
  `_cohort-a-supplemental-survey-blast.ts`, `_thankyou-referral-blast.ts`. Now **default UNCAPPED**;
  `--max-recipients` is opt-in and emits a loud `*.cohort_capped` WARN + console warning naming how many
  were dropped. Tests updated (86 pass).
- 🟡 **Already loud (left as-is):** `_backfill-name-canonicalization.ts` (`--max-rows` 1000),
  `_backfill-wizard-questionnaire-loss.ts` (200), `_recover-abandoned-wizard-drafts.ts` (200) — each
  already prints a `cap_hit` WARN when `count === cap`, so truncation is visible (not silent). Convert to
  uncapped-default only if touched for other reasons; not worth churning retired/applied scripts now.

**Rule for new scripts:** any recipient/row cap defaults to UNCAPPED; a cap is opt-in and MUST warn loudly
when it truncates. Never a silent numeric default.

## Working discipline (keep this file honest)

1. **Every new story that ships a backfill/blast adds a row here in the SAME commit** — mirror the
   sprint-status / epics parity-sweep discipline. A backfill script with no tracker row is a landmine.
2. **Tick ✅ only with evidence** — a date + a count/probe result, not "I think we ran it". The dry-run
   *is* the evidence.
3. **Idempotent + preview-by-default is mandatory** for any new backfill (the `--dry-run` →
   `--apply --confirm-i-am-not-dry-running` two-step). That's what makes retroactive verification
   possible — bake it in, don't bolt it on.
4. When you resolve a ❓, edit the row to ✅/⬜ with the evidence inline. This file should trend toward
   all-✅/⛔ as launch approaches.

## Appendix — schema migrations (auto-run at deploy, NOT operator residuals)

`migrate-audit-immutable`, `migrate-audit-principal-dualism-init`, `migrate-input-sanitisation-init`,
`migrate-lgaid-uuid-to-slug` (also a data backfill — §A), `migrate-mfa-init`,
`migrate-multi-source-registry-init`, `migrate-reference-code-init`, `migrate-registry-search-indexes-init`,
`migrate-respondents-user-id-init`, `migrate-reveal-purpose-init`, `migrate-system-settings-init`,
`backfill-email-verified-at.sql`. These run via CI `db:push`/deploy; listed for completeness only.
