# Story 13-44: Super-Admin campaign observability — funnel + contact-log + ledger-liveness

Status: ready-for-dev

<!-- Authored 2026-07-24 by Bob (SM), EMERGENT from "do we have a campaign_sends UI?" (Awwal). Answer: no — and no campaign/communications admin UI at all. The campaign-measurement spine is built but INVISIBLE: `ReportService.getCampaignFunnel` (Story 13-9, DONE) computes sent/delivered/clicked/converted per campaign but is wired to NO controller/route/UI; `campaign_sends` (Story 13-24, DEPLOYED) records every marketing contact but is read only by the dedupe service. So an operator can only see campaign performance + who-was-contacted via a Tailscale psql query. This story adds the missing CONSUMER: a super-admin-only page surfacing (1) the per-campaign funnel that already exists, (2) the campaign_sends contact log, and (3) — folding in the 13-24 M1 concern — a ledger-liveness signal (the fail-soft `recordCampaignSend` means a silent no-op is possible; seeing rows populate IS the confirmation, replacing the manual SELECT in pre-blast-dry-run.md §2). POST-LAUNCH, NON-GATING (the launch works via CLI dry-runs + Telegram digest); this makes the measurement you already paid for actually visible. -->

## Story
As **a super-admin running the launch campaigns**,
I want **a single admin view of per-campaign performance + who was contacted + proof the contact-ledger is recording**,
so that **I can watch campaign funnels, answer "why did I get this email?" support questions, and confirm the dedupe ledger is armed — without a raw DB query.**

## Context & Evidence
- **The measurement exists but has no surface.** `ReportService.getCampaignFunnel(campaignId)` (13-9) reads `email_events` (sent/delivered/clicked by distinct recipient) + `submissions` (distinct-registrant conversions via `campaign_source.utm.campaign`). Verified: NO controller/route/web references it — it is dead-ended in the service layer.
- **`campaign_sends` (13-24, LIVE on prod)** records `{email, campaign_id, category, channel, message_id, sent_at}` on every marketing send, but is read only by `filterMarketingCohort`. No UI, no endpoint.
- **Existing super-admin UI pattern to reuse:** `<ProtectedRoute allowedRoles={['super_admin']}>` in `App.tsx` guards the Audit Log Viewer (9-11) + Operations Dashboard (9-19). The audit-log feature (`apps/web/src/features/audit-log`) is the closest table/list + filter pattern to model on. (Epic 12's `DataTable` primitive 12-1 is not built yet — model on audit-log; adopt DataTable if 12-1 lands first.)
- **Ledger-liveness tie-in (13-24 M1):** `recordCampaignSend` is fail-soft, so a missing/failing write silently disables dedupe. The runbook (`pre-blast-dry-run.md §2`) uses a manual `SELECT` to prove a row landed; this view makes that visible (latest `campaign_sends` row + a "recording OK" indicator).

## Acceptance Criteria
1. **AC1 — Backend: campaign list + funnel endpoint (super-admin only).** `GET /api/v1/admin/campaigns` returns the distinct campaigns (union of `campaign_sends.campaign_id` + `email_events.campaign_id`) with per-campaign counts + last-send timestamp; `GET /api/v1/admin/campaigns/:campaignId/funnel` returns the existing `getCampaignFunnel` shape (sent/delivered/clicked/converted). Both behind `authenticate` + a super-admin role guard (mirror the 9-11/9-19 routes) + route-registration + auth-guard tests.
2. **AC2 — Backend: campaign_sends contact-log endpoint (scoped, paginated).** `GET /api/v1/admin/campaigns/contact-log` returns `campaign_sends` rows filterable by `email` (exact/canonical), `campaignId`, and `sentAt` range, **paginated + capped** (never dumps the whole ledger — mirror the 13-9 M2 "scope the read" discipline). Super-admin only.
3. **AC3 — Web: Super-Admin Campaign Observability page.** A super_admin-only route (+ `ProtectedRoute allowedRoles={['super_admin']}`, registered in `App.tsx`, linked from the admin nav alongside Ops Dashboard / Audit Log) showing: (a) the campaigns list with funnel metrics per row; (b) a contact-log table (email + campaign + category + sent_at) with the AC2 filters; (c) a **ledger-liveness banner** — latest `campaign_sends` `sent_at` + total-today count, so "is the dedupe recording?" is answerable at a glance.
4. **AC4 — PII handling for the contact-log email column.** Email is PII: mask by default in the list (reuse the app's `maskEmail` helper) with an explicit, audited reveal (reuse the reveal-purpose pattern if applicable), OR render full only within the super-admin-audited context — follow whatever the Audit Log Viewer already does for PII so this is consistent, not a new precedent. The VIEW access itself is audit-logged (`AUDIT_ACTIONS`), parity with 9-11.
5. **AC5 — No new heavy dependency; reuse.** No new registry read, no new worker. Reuse `getCampaignFunnel` as-is (do not reimplement), the audit-log table/filter pattern, and existing admin nav. Web tsc + eslint + full suite green; API tsc + eslint + route/controller tests green; `NODE_ENV=production` web build green.

## Tasks / Subtasks
- [ ] **Task 1 (AC1)** — controller + routes for campaigns-list + funnel (super-admin guard); wire `ReportService.getCampaignFunnel`; a small `listCampaigns()` service query. Route-registration + auth-guard tests.
- [ ] **Task 2 (AC2)** — `campaign_sends` contact-log service query (scoped/paginated/filterable) + endpoint + tests.
- [ ] **Task 3 (AC3)** — `apps/web/src/features/campaigns` (or fold into an existing admin area): the page + campaigns table + contact-log table + ledger-liveness banner; route + nav link (super_admin).
- [ ] **Task 4 (AC4)** — PII masking/reveal consistent with the Audit Log Viewer; audit-log the view access.
- [ ] **Task 5 (AC5)** — gates: web+api tsc/eslint/suites; prod web build.

## Dev Notes
- **This is the missing CONSUMER, not new measurement.** The funnel math (13-9) + the contact ledger (13-24) already exist and are correct; the whole story is exposing them behind a super-admin surface. Resist re-deriving either — call `getCampaignFunnel` and read `campaign_sends` directly.
- **Ledger-liveness is the highest-value small piece.** Because `recordCampaignSend` is fail-soft, "the dedupe is silently off" is a real failure mode ([[pattern-ship-a-fix-that-never-fires]]). A banner showing the latest `campaign_sends` row turns the runbook's manual `SELECT` into a glanceable operator signal — do this even if the fuller funnel UI is trimmed.
- **PII is the one real design decision** — do NOT invent a new PII-exposure pattern; match the Audit Log Viewer (9-11), which already solved super-admin PII display + audit. Consistency here matters more than cleverness.
- **Sequencing:** POST-LAUNCH, non-gating. Natural companion to Epic 12's dashboard-refresh (adopt the 12-1 `DataTable` primitive if it lands first; otherwise the audit-log pattern is fine). Depends only on 13-9 (done) + 13-24 (deployed).

### References
- [Source: apps/api/src/services/report.service.ts:111 `getCampaignFunnel` — the built-but-unwired funnel]
- [Source: apps/api/src/db/schema/campaign-sends.ts — the contact ledger (13-24); pre-blast-dry-run.md §2 ledger-liveness SELECT this view visualises]
- [Source: apps/web/src/features/audit-log + App.tsx super_admin ProtectedRoute (9-11) — the table/filter/PII/audit pattern to mirror]
- [Source: Story 13-9 (campaign engagement tracking), 13-24 (campaign_sends dedupe), 9-19 Operations Dashboard]

## Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-07-24 | Story drafted, EMERGENT from "do we have a campaign_sends UI?" — answer: no, and no campaign admin UI at all (13-9's funnel is built but unwired; 13-24's ledger is dedupe-only). Adds the missing super-admin consumer: campaign funnel + campaign_sends contact log + a ledger-liveness banner (folding in the 13-24 fail-soft M1 concern). POST-LAUNCH, non-gating; reuses getCampaignFunnel + the audit-log UI pattern; PII handled per the Audit Log Viewer. | Bob (SM) |

## SCOPE EXTENSION — adoption panel + consent toggle (added 2026-08-01, Awwal's ruling)

**Why here and not a new story:** 13-44 already owns the super-admin campaign surface, the contact log and
the ledger-liveness banner. Story **13-49** (draft-adoption programme) needs an operator view of a
*different* question — not "how did the campaign perform" but "is the adoption programme converting" — and
minting a second admin story would split one screen across two backlogs. 13-49 EMITS the counts (its AC12);
this story RENDERS them; 13-42 alerts on the delta.

### AC-A1 — Adoption panel

A panel on the same super-admin view showing, live from the DB (no cached blob):

| Metric | Source |
|---|---|
| Adopted (D1) / Enriched (D2) / Adopted-pending (D3) | `respondents.metadata.adopted_by = '13-49'` + `adopted_at` |
| Invited (D4), and how many have since completed | invite send + subsequent `submissions` row |
| Excluded (D5) and Ignored (D6) | disposition, for completeness — these must be visibly ZERO-action |
| Still pending NIN | `status = 'nin_unavailable'`, cross-linked to the 9-12 ladder state |
| **Registry total, split by data_status** | the 12-4 taxonomy — see the 12-4 note below, its buckets change |

⚠️ **The adoption counters must read the `adopted_by` marker, not a stored total.** That marker is also
13-49's rollback key (its AC11), so panel and rollback agree by construction.

### AC-A2 — Consent toggle (super-admin, audited, reason-required)

Replaces 13-49's original "hard immutable exclude" with a **controlled** one, per Awwal 2026-08-01:

- **`consent_marketplace = yes` is the actionable state.** Code adopts and displays only on that basis.
- A super-admin can change a respondent's consent from this screen — because consent legitimately changes
  (someone says yes by phone, or withdraws later) and there must be a lawful way to record it.
- ⚠️ **The toggle is NOT a bypass.** It must: (a) require a free-text **reason** (e.g. *"confirmed by phone
  2026-08-05"*), (b) write an `audit_logs` row naming the actor, the before/after value and the reason,
  (c) be **per-respondent — never bulk**, and (d) leave 13-49's code guard intact, so an unchanged
  `consent_basic = no` still cannot be adopted by a script.
- **Why the reason field is load-bearing, not ceremony:** this is NDPA-regulated consent for a government
  register. A toggle that changes a consent flag with no record of the person's instruction converts an
  auditable decision into an unexplained one. The reason IS the evidence.
- The existing self-service path stays primary — a citizen can already flip their own marketplace consent
  (`me.controller.ts:45-67`). The admin toggle is for the cases where they told us by another channel.
