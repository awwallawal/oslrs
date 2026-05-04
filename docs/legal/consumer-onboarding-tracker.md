# Consumer Onboarding Tracker — OSLRS Partner-API Programme

**Maintainer:** Super Admin (Awwal until Transfer; Ministry ICT post-Transfer)
**Purpose:** Lightweight per-request log of every Partner-API onboarding request from initial contact through provisioning, active operation, renewal, and termination.
**Migration trigger:** when this tracker exceeds 5 active rows (`status` ∈ {`provisioned`, `active`}), migrate to a Notion database for richer filtering / linking. Markdown stays canonical until then.
**Gitignore:** **NO** — this tracker is metadata-only (no PII, no tokens). The signed DSA PDFs themselves live in S3 (`digitalocean://oslsr-media/legal/dsa-signed/`).

## Schema

| Column | Type | Notes |
|---|---|---|
| `request_id` | string | Format `CON-YYYYMMDD-NNN`; sequential per day |
| `partner_org` | string | Partner organisation legal name |
| `contact_email` | string | Partner technical / authorised contact |
| `requested_scopes` | comma-list | Initial request — may differ from final granted |
| `requested_lga_scope` | comma-list \| `all` | LGA codes |
| `track` | enum | `pii-track` \| `sensitive-track` \| `public-track` (set in STEP 2; **does not change** for the lifetime of the row — a Partner that later wants a different track files a fresh `CON-…` request) |
| `status` | enum | `received` \| `in-review` \| `rejected` \| `dsa-drafted` \| `dsa-signed` \| `provisioned` \| `active` \| `termination-notice` \| `terminated` \| `stalled` |
| `received_at` | ISO date | STEP 1 |
| `dsa_drafted_at` | ISO date \| `—` | STEP 3 completion |
| `dsa_signed_at` | ISO date \| `—` | STEP 4 completion |
| `dsa_signed_url` | URL \| `—` | **Format: `digitalocean://oslsr-media/legal/dsa-signed/<request_id>.pdf`** (DigitalOcean Spaces URI under the existing S3 SDK config — see Story 9-9 backup architecture). `—` until STEP 4 closes. Other URI schemes are not accepted in production rows; the `dryrun://no-real-pdf` form is permitted ONLY in dry-run rows that carry `(DRY-RUN)` in the `status` cell. |
| `super_admin_approval_at` | ISO date \| `—` | Two-person approval marker. **Populated for `pii-track` AND `sensitive-track`** (Super Admin signs off on technical fit + scope-LGA congruence). For `public-track`, populated as a single Super Admin approval on STEP 5 transition. |
| `ict_lead_approval_at` | ISO date \| `—` | Two-person approval marker. **Populated for `pii-track` ONLY** (FR24 / Decision 3.4 — Ministry ICT Lead second signature on PII access decision). For `sensitive-track` and `public-track` this column remains `—` for the row's lifetime. |
| `provisioned_at` | ISO date \| `—` | STEP 5 completion |
| `api_key_id` | UUID \| `—` | `api_keys.id` reference. **Must be a valid UUID v4 per RFC 4122** (e.g. `0190abcd-1234-7000-8abc-1234567890ab`); the `00000000-0000-0000-0000-DRYRUN` form is permitted ONLY in dry-run rows. Production-row UUID-format violations are caught by `scripts/lint-tracker.ts` (CI job to be added with Story 10-3). |
| `effective_date` | ISO date \| `—` | DSA Effective Date |
| `next_quarterly_review` | ISO date \| `—` | T+3 months from effective_date, rolling. **Updated by Super Admin at the close of every quarterly review** (set to `today + 3 months`). This column is canonical; any calendar-system reminder is secondary. |
| `next_renewal` | ISO date \| `—` | T+12 months from effective_date |
| `data_deletion_attested_at` | ISO date \| `—` | Post-termination |
| `notes` | freeform — **soft cap 200 characters per session** | Channel of receipt; flags; one-line quarterly review outcomes. **For longer narratives** (multi-sentence findings, incident reports, scope-change rationale), create or append to `_bmad-output/legal/findings-log.md` with a finding ID (`FND-YYYYMMDD-NNN`) and reference that ID inline in `notes` instead of pasting the narrative here. Rationale: this column is consumed by VCS diff and (eventually) by automated tooling; long prose creates merge conflicts and opacity. |

---

## Tracker

| request_id | partner_org | contact_email | requested_scopes | requested_lga_scope | track | status | received_at | dsa_drafted_at | dsa_signed_at | dsa_signed_url | super_admin_approval_at | ict_lead_approval_at | provisioned_at | api_key_id | effective_date | next_quarterly_review | next_renewal | data_deletion_attested_at | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CON-20260503-001 | Test Partner — Lagos Tech Hub | techops@example-test-partner.test | `marketplace:read_public` | all | `public-track` | `provisioned` (DRY-RUN) | 2026-05-03 | 2026-05-03 | 2026-05-03 | `dryrun://no-real-pdf` | n/a (public-track does not require two-person approval) | n/a | 2026-05-03 | `00000000-0000-0000-0000-DRYRUN` | 2026-05-03 | 2026-08-03 | 2027-05-03 | — | **DRY-RUN per Story 10-5 AC#9.** Hypothetical partner — no real onboarding. Time-per-step captured in story Completion Notes. Walked Steps 1–5 + 7 quarterly-review path; Step 4 abbreviated (no actual partner counter-signature). DSA Schedule 1 populated with mock Partner data; verified template fields render correctly. Validates SOP mechanics + DSA template fields; no real Partner data, no real API key issued. |

---

*Add new rows above this line. Sort by `request_id` ascending.*
