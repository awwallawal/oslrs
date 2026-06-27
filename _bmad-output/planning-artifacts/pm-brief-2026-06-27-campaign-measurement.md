# PM Brief — Campaign Measurement (Stories 13-9 + 13-10)

**Author:** John (PM) · **Date:** 2026-06-27 · **For:** Bob (SM) to author 13-9 + 13-10 · **Status:** scope locked

## The WHY (the only question that matters)
The Jul-1 push spends real money across **four channels** (radio · paid social · email blasts · association sheets). When the money's spent, leadership asks one question: **"which channel earned registrations, and at what cost — so we double down or kill it?"** Everything here exists to answer that. If a metric doesn't change a spend or retarget decision, **we don't build it.**

→ **North-star metric: completed registrations per channel/campaign** (and, where cost is known, cost-per-completed-registration). Not opens. Not even clicks. **Conversions.**

## The decision that shapes everything: opens are OUT
I pushed on "do we need open-tracking" and the answer is no — and not just on privacy:
- **You can't act on it.** Apple Mail Privacy Protection pre-fetches the pixel → ~100% inflated, per-user signal destroyed. An open-rate you can't trust is a number you can't make a decision on. **We measure what we'll act on.**
- **It's PII collection outside the consent flow** — same class as the 13-1 pixels we deliberately *parked*. Adding an open-pixel now would re-open a DPIA we closed.
- **We don't need it.** The magic-link *is* our endpoint — a **click hits our own app** (first-party, no pixel), and a **conversion is the wizard completion** we already record. We get the funnel that matters without a tracking pixel.

**Funnel we will measure (per campaign): sent → delivered → clicked → converted.** Plus bounce/complaint for hygiene. That's it.

## The retarget loop (this is the product, not the dashboard)
The funnel stages *are* the retarget segments — each implies a next action:
| Segment | Meaning | Action |
|---|---|---|
| Bounced / complained | bad address / unsubscribed | **suppress** — protects deliverability |
| Delivered, not clicked | didn't bite | resend (new subject) or another channel |
| Clicked, not converted | wizard-stall killed them | the known step-4/5 drop-off → "you're 1 step away" nudge / 9-56 human follow-up |
| Converted | done | exclude from further blasts |

The dashboard's job is to **make these cohorts one click to export**, not to show vanity charts.

## Scope split — the one-way door drives it
**Campaign tagging + bounce handling are one-way doors: an UNTAGGED blast can never be attributed retroactively, and an un-suppressed bounce list degrades sender reputation permanently.** So:

### 13-9 — Campaign Engagement Tracking — **MUST ship before the first Jul-1 blast**
- **Campaign-tagged magic-links:** every blast link carries a `utm_campaign` (+ source) → flows through **13-1's `extras.utm → raw_data.campaign_source`** so a completed registration attributes to the exact blast. *(This + the conversion read is the non-negotiable core.)*
- **Resend webhook** (signature-verified) → `email_events` table: `delivered`, `bounced`, `complained`, `clicked`, keyed by message-id + recipient + **campaign-id**. **No `opened`.**
- **Bounce/complaint suppression** — a do-not-send list the blast scripts honor (extends 9-63 recipient-hygiene). Deliverability protection.
- **First-party click + conversion logging** — click = the magic-link hitting our app; conversion = wizard completion tied to the campaign.

### 13-10 — Campaign Dashboard — **after launch (reads the data the blasts generate)**
- Per-campaign **funnel** (sent→delivered→clicked→converted + bounce/complaint counts) over the existing `getCampaignBreakdown` + registration trend.
- **One-click retarget cohort export** (the table above).
- **Channel comparison** (radio vs social vs email vs association) — the spend-decision view.
- Extends the Epic 13 / Epic 12 dashboard surface — **not a new app**.

## Boundaries (OUT of scope — say it loud)
- ❌ Open-tracking / tracking pixels (decision above).
- ❌ A new analytics product or third-party tool (Mixpanel/GA) — we own the funnel first-party.
- ❌ Automated retargeting *sends* — 13-10 surfaces the cohort; the *send* stays the operator-run blast script (9-27/9-28) for now.
- ❌ SMS engagement — SMS is KYC-blocked; email-only.

## Privacy / NDPA stance
First-party click + conversion only; **no pixels, no third-party trackers**. `email_events` is operational metadata (delivery/bounce/click), not new PII beyond what consent already covers. The bounce/complaint suppression is *pro-privacy* (honors unsubscribes). No DPIA re-open required — contrast with the parked pixels.

## Dependencies
- **13-1** (campaign_source attribution) — the spine conversions attribute through. ✅ done.
- **9-63** (notification-meter + recipient-hygiene) — `sent` count + the suppression hook. ✅ done.
- **Resend** — webhooks + signature secret (operator: enable webhook endpoint + secret).
- **13-6 / Epic 12 dashboard** — 13-10 extends this surface.

## Handoff to Bob (SM)
Author **13-9** (ready-for-dev, pre-blast priority) + **13-10** (backlog, post-launch). 13-9's acceptance must make the **tag + suppression** the non-negotiable core (the one-way doors); the webhook/event-table is the enabler. Validate the Resend webhook signature scheme + the `email_events` schema against the codebase before locking ACs.
