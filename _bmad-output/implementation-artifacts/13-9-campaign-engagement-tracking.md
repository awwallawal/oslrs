# Story 13.9: Campaign Engagement Tracking — tag the links, catch the bounces, measure the conversions (no pixels)

Status: ready-for-dev

<!-- Authored 2026-06-27 by Bob (SM) via canonical *create-story from John's PM brief (pm-brief-2026-06-27-campaign-measurement.md). 🚦 PRE-BLAST — the tagging + suppression are ONE-WAY DOORS that must ship before the Jul-1 blasts. Opens OUT (privacy + unreliable). -->

## Story

As the **operator about to spend across radio / social / email for the Jul-1 push**,
I want **every blast email tagged so a completed registration attributes to it, bounces/complaints suppressed so deliverability holds, and a first-party event trail of delivered/clicked/converted**,
so that **after the spend I can answer "which channel earned registrations" and retarget the non-responders — without a single tracking pixel.**

## Context & Why This Is Pre-Blast

The north-star is **completed registrations per channel** (PM brief). Two pieces are **one-way doors**: an **untagged** blast can never be attributed retroactively, and an **un-suppressed** bounce list permanently degrades sender reputation (real emails → spam). Both must ship **before the first Jul-1 blast**. Opens are **out** — Apple Mail Privacy Protection makes them unactionable, and an open-pixel re-opens the DPIA we closed by *parking* the 13-1 pixels [Source: pm-brief-2026-06-27-campaign-measurement.md].

**The funnel we measure: sent → delivered → clicked → converted** (+ bounce/complaint for hygiene). First-party only — the magic-link IS our endpoint, so a click hits our app and a conversion is the wizard completion we already record.

## Acceptance Criteria

### AC1 — Campaign-tagged magic-links (CORE, one-way door)
1. Blast magic-links carry a **`utm_campaign`** (+ `utm_source`/`utm_medium`) param. The wizard's existing UTM capture (Story 13-1) reads it into `extras.utm` → `raw_data.campaign_source` at submit, so a **completed registration attributes to the exact blast** [Source: apps/web/.../WizardPage UTM effect (13-1); registration.controller.ts buildCampaignSource]. No new attribution mechanism — reuse 13-1.
2. The tag is applied at the link-build sites in the blast scripts: `apps/api/scripts/_reengagement-email-blast.ts` (9-27) and `apps/api/scripts/_cohort-a-supplemental-survey-blast.ts` (9-28), plus `magic-link.controller.ts` if links are minted there. A single `campaignId` per blast run; documented.

### AC2 — Bounce / complaint suppression (CORE, deliverability)
1. A **suppression list** (do-not-send) of bounced/complained addresses that the blast scripts **honor before sending** — extends the 9-63 recipient-hygiene/dedup path [Source: apps/api/src/services/email.service.ts; notification-meter METER_KEYS]. A hard-bounce or spam-complaint address is never blasted again.
2. Suppression is queryable (so a recipient can be checked/removed) and audited.

### AC3 — Resend webhook → `email_events` (ENABLER, net-new)
1. A **signature-verified** webhook endpoint receives Resend events (`email.delivered`, `email.bounced`, `email.complained`, `email.clicked`). Resend signs with **Svix** — verify the signature (no unauthenticated writes). No webhook pattern exists yet — this is net-new; register the route + a raw-body/signature middleware [Source: apps/api/src/routes/index.ts route-registration pattern; no existing webhook].
2. Events land in a new **`email_events`** table keyed by **message-id + recipient + campaign-id** (+ event type + timestamp). `sent` already comes from the 9-63 meter; this adds the inbound events. **NO `opened` event stored** (privacy + unactionable — AC4).
3. `bounced`/`complained` events **feed AC2's suppression list** automatically.

### AC4 — Opens are OUT (explicit)
1. Resend **open-tracking is NOT enabled**; the `email.opened` event is **not consumed or stored**. Click-tracking (first-party via the magic-link, or Resend `clicked`) + conversion are the signals. Rationale recorded (privacy/DPIA parity with the parked 13-1 pixels; unreliable under Apple MPP).

### AC5 — Conversion read (CORE measurement)
1. A query/service surfaces, **per `campaignId`**: sent (9-63 meter) · delivered · clicked · **converted** (completed registrations whose `raw_data.campaign_source.utm.campaign` = the campaignId). This is the data 13-10 visualises; expose it as a service method (extend `report.service`) even before the dashboard.

## Tasks / Subtasks
- [ ] **Task 1 — Campaign tagging (AC1)** — add `campaignId`/utm to the link-build in both blast scripts (+ magic-link.controller if minted there); verify it round-trips to `raw_data.campaign_source` via a test.
- [ ] **Task 2 — Suppression list (AC2)** — schema + honor-before-send in the blast scripts + feed from bounce/complaint; tests.
- [ ] **Task 3 — Resend webhook + email_events (AC3/AC4)** — `email_events` schema; signature-verified endpoint (Svix); store delivered/bounced/complained/clicked (NOT opened); wire bounce/complaint → suppression; tests (valid sig, bad sig rejected, event→row).
- [ ] **Task 4 — Conversion read (AC5)** — `report.service` method joining sent/delivered/clicked/converted by campaignId; test.
- [ ] **Task 5 — Operator note** — Resend dashboard: enable the webhook (URL + signing secret), confirm open-tracking OFF.

## Dev Notes
- **REUSE, don't rebuild:** 13-1 attribution spine (no new attribution), 9-63 meter (sent count + hygiene hook), the existing email/Resend send path. Net-new = the webhook endpoint + `email_events` + suppression.
- **Resend signs webhooks with Svix** — use Svix verification (or the documented HMAC scheme); raw body needed for signature.
- **Scope OUT:** opens/pixels; automated retarget *sends* (13-10 surfaces cohorts; sending stays the operator blast scripts); SMS (KYC-blocked); the dashboard UI (that's 13-10).
- **Operator dependency:** Resend webhook URL + signing secret must be set on the box env before events flow.

### References
- [Source: _bmad-output/planning-artifacts/pm-brief-2026-06-27-campaign-measurement.md] — scope, funnel, opens-out, sequencing
- [Source: apps/api/scripts/_reengagement-email-blast.ts; _cohort-a-supplemental-survey-blast.ts] — magic-link build sites (utm tag)
- [Source: apps/api/src/controllers/magic-link.controller.ts] — magic-link minting
- [Source: apps/api/src/services/email.service.ts] — Resend send path + 9-63 meter/hygiene
- [Source: apps/api/src/services/report.service.ts:67 getCampaignBreakdown] — the conversion-attribution read (13-1)
- [Source: apps/api/src/routes/index.ts] — route-registration pattern (webhook is net-new)

## Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-06-27 | Authored from John's PM brief. 🚦 pre-blast: tagging + suppression are one-way doors before Jul-1; webhook/email_events enable the funnel; opens OUT. 5 ACs / 5 Tasks. Reuses 13-1 + 9-63. | Bob (SM) |
