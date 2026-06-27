# Story 13.10: Campaign Dashboard — the funnel + one-click retarget cohorts

Status: backlog

<!-- Authored 2026-06-27 by Bob (SM) from John's PM brief. POST-LAUNCH (reads the data the Jul-1 blasts generate). DEPENDS-ON 13-9 (the event data) + Epic-12/13-6 (the dashboard surface). The dashboard's job is one-click cohort EXPORT, not vanity charts. -->

## Story

As **the operator deciding where to put the next naira after the Jul-1 spend**,
I want **a per-campaign funnel and one-click retarget cohorts on the existing dashboard**,
so that **I can see which channel earned registrations and immediately act on the non-responders — double down, kill, or nudge.**

## Context

13-9 produces the data (sent → delivered → clicked → converted, per campaign, + bounce/complaint, in `email_events` + `raw_data.campaign_source`). This story **visualises it and makes the retarget cohorts exportable**. Per the PM brief, **the retarget loop IS the product** — the dashboard exists to turn each funnel stage into a next action, not to show charts nobody acts on. **Post-launch** — it reads the data the blasts generate, so it can't be built before there's data.

## Acceptance Criteria

### AC1 — Per-campaign funnel
1. For each `campaignId`: **sent · delivered · clicked · converted** (+ bounce/complaint counts), as a funnel with stage-to-stage rates. Sourced from 13-9's `report.service` conversion read + `email_events`; **no new aggregation engine** — extend the existing report/analytics services [Source: report.service.ts getCampaignBreakdown/getOverviewStats; survey-analytics getTrends].

### AC2 — One-click retarget cohort export (the point of the story)
1. Each funnel stage exports its cohort (CSV/list): **bounced/complained → suppress** (already auto-suppressed by 13-9; surfaced for review), **delivered-not-clicked → resend** (new subject / other channel), **clicked-not-converted → nudge** (the step-4/5 wizard stall — tie to 9-56 support follow-up), **converted → exclude** from future blasts.
2. Cohorts are the input the operator feeds back into the 9-27/9-28 blast scripts. (Automated *sending* stays out — operator-run.)

### AC3 — Channel comparison (the spend decision)
1. A view comparing **radio vs paid-social vs email vs association** by registrations earned (and cost-per-registration where cost is entered), over the registration trend. Built on 13-1's `getCampaignBreakdown` channel data. This is the "double down / kill" view leadership asks for.

### AC4 — On the existing surface
1. Lands on the existing OfficialHome/Operations/Epic-12 dashboard — **NOT a new app or route tree**. Respects the design-system/DataTable primitive (Epic 12 12-3).

## Tasks / Subtasks
- [ ] **Task 1 — Funnel data API (AC1)** — extend report.service with a per-campaign funnel query over email_events + campaign_source.
- [ ] **Task 2 — Funnel UI (AC1)** — the funnel component on the existing dashboard.
- [ ] **Task 3 — Cohort export (AC2)** — the four retarget cohorts as exportable lists.
- [ ] **Task 4 — Channel comparison (AC3)** — the channel/cost view over getCampaignBreakdown + trend.
- [ ] **Task 5 — Design-system compliance (AC4)** — DataTable primitive / Epic-12 surface.

## Dev Notes
- **DEPENDS-ON 13-9** (the event/conversion data) — cannot start meaningfully before it. **DEPENDS-ON Epic 12 / 13-6** (the dashboard denominator + surface — avoid the 76-vs-139 mislabel).
- **REUSE:** report.service / survey-analytics / getCampaignBreakdown — extend, don't rebuild. No new analytics product (PM boundary).
- **Scope OUT:** open-rate (doesn't exist — 13-9 AC4); automated retarget sends; a standalone analytics app.

### References
- [Source: _bmad-output/planning-artifacts/pm-brief-2026-06-27-campaign-measurement.md] — the retarget loop + channel-decision framing
- [Source: _bmad-output/implementation-artifacts/13-9-campaign-engagement-tracking.md] — the data this reads
- [Source: apps/api/src/services/report.service.ts:67] — getCampaignBreakdown (channel)
- [Source: _bmad-output/implementation-artifacts/13-6-channel-and-coverage-dashboard.md] — sibling dashboard surface

## Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-06-27 | Authored from John's PM brief. Post-launch; depends-on 13-9 + Epic-12/13-6. Funnel + one-click retarget cohorts + channel comparison on the EXISTING dashboard. 4 ACs / 5 Tasks. | Bob (SM) |
