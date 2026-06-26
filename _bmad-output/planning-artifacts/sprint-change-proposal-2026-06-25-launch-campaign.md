# Sprint Change Proposal — Launch Campaign (Epic 13)

**Date:** 2026-06-25
**Author:** John (PM) · facilitated via `correct-course` workflow (batch mode)
**Owner / Decision-maker:** Awwal (Builder)
**Trigger artifact:** Go-to-market plan with a hard external date — umbrella-body meeting + 5-channel launch (Mon 2026-06-29)
**Source docs:** `docs/launch-campaign/association-condensed-sheet-spec.md`, `docs/launch-campaign/attribution-spec.md`, `docs/roadmap-to-launch.md`, recon of attribution state + Epic 11 import foundation (2026-06-25)
**Canonical sequencing touched:** `docs/roadmap-to-launch.md` (Phase 2), `_bmad-output/implementation-artifacts/sprint-status.yaml`, `_bmad-output/planning-artifacts/epics.md`

---

## Section 1 — Issue Summary

**Problem.** The project has stalled at "launch-critical dev done, operator-gated" while the registry risks becoming a white-elephant. Awwal has committed a concrete, dated go-to-market push and needs it folded into the roadmap as tracked work:
1. **Umbrella body** of State skilled workers — Monday 2026-06-29 meeting; present a **condensed data sheet** (physical + electronic) for cascade distribution (umbrella head → association heads → members) + direct-to-website option.
2. **Radio jingles** from Mon 2026-06-29 across **11 stations**, 4 slots each, in 2× Yoruba / 1× Pidgin / 1× English. **Date is movable 24–48h (Awwal owns the narrative).**
3. **Paid social** — ~₦200,000 across Facebook/Instagram/Twitter.
4. **Enumerators** across the 33 LGAs, media-first then concurrent.

**Goal.** BOTH a large administrative count AND representative/policy-grade data (labour registry = data for policymaking + contacts to give policy bite, e.g. tailor clusters per LGA → site a textile centre).

**Evidence / why it's a sprint change.**
- **Attribution is ABSENT** (verified): `respondents.source` records method, not acquisition channel; wizard reads only `?token=`; Cloudflare Web Analytics has no per-registration channel. Firing 5 channels blind = a permanent dark window (the project's own "analytics-before-launch" lesson).
- **Association Groups have no data model**, but the **Epic 11 import spine is half-built**: 11-1 (schema: `import_batches`, nullable NIN, `status`, provenance, status-gating) is **DONE**; 11-2 (import service: dry-run/confirm/rollback, CSV/XLSX parsers, phone/email auto-skip, lawful-basis) is **ready-for-dev, not built**.
- **prod runs on a home server** (`oslsr-home-app`) and faces a state-wide radio spike with **no clean post-9-18-redesign completion data** and **only one enumerator submission ever** exercised in prod.

**HEAD-reconciliation (verified against current tree 2026-06-25).** Wizard redesign 9-18 (NIN optional Step 1, ~8 dynamic steps) is live; pending-NIN **email** reminders work, **SMS** reminder is a placeholder pending Termii sender-ID. `respondents.source` enum = `enumerator|public|clerk|imported_itf_supa|imported_other` (`respondents.ts:21-27`). No-migration capture slots: `wizard_drafts.form_data.extras`, `submissions.raw_data`.

## Section 2 — Impact Analysis

**Epic impact.** NEW **Epic 13 — Launch Campaign** (next free id; highest existing = Epic 12). Additive; reframes roadmap **Phase 2** ("Field-readiness + go live") as Epic-13-executed. No existing epic rewritten.

**Story impact.** Six new stories (13-1…13-6). Touches but does not rewrite: Epic 11 (13-2 builds the association importer on the 11-2 backbone — pulls 11-2 forward from Phase 5 *for the association source only*); 9-20 (capacity) is complemented by 13-3 (static fallback + load test).

**Artifact conflicts.** `roadmap-to-launch.md` Phase 2 + 🚦 gate (add a pre-flight gate); `sprint-status.yaml` (add epic-13 block); `epics.md` (add Epic 13 section). No PRD/Architecture conflict — attribution + import use existing schema slots.

**Technical impact.** Attribution = **no migration** (extras → raw_data). Association source = +1 enum value + 1 `import-sources.ts` config block (audit generic). Capacity = Cloudflare static fallback + a load test (ops, not schema). Enumerator smoke = data + checklist, no code.

## Section 3 — Recommended Approach

**Selected path — Option 1: Direct Adjustment (additive epic + roadmap fold).** Rollback rejected (nothing to undo); MVP-reduction rejected (the gate IS the MVP discipline).

**The load-bearing distinction:** what gates **paid spend** vs what is **fast-follow**. The Monday **meeting and sheet distribution are zero-cost** and proceed regardless; only **radio + paid social** wait on the pre-flight gate (and radio is movable 24–48h, so the gate has teeth).

**Pre-flight gate — all green before paid spend (radio/ads):**
1. Prod happy-path self-serve completion verified (one fresh real end-to-end submission).
2. Enumerator path proven on prod (13-4: 5–10 real submissions) — today: one ever.
3. Attribution capture live + verified (13-1).
4. Capacity load-test green + static fallback deployed (13-3).

**Tiering**

| Bucket | Items |
|---|---|
| **🚦 Pre-spend gate (this week)** | 13-1 attribution capture · 13-3 capacity + fallback · 13-4 enumerator smoke + go/no-go |
| **Monday (zero-cost, no gate)** | Sheet **frozen** (spec doc) + umbrella meeting + sheet distribution |
| **Fast-follow (post-spend, days)** | 13-2 association importer (on 11-2) · 13-5 Yoruba comprehension layer · 13-6 channel + coverage dashboard |

**Language decision (Awwal, 2026-06-25):** build the **Yoruba form**, not enumerator-routing for readers. **Reframed:** Yoruba is a **comprehension/trust uplift, not an access gate** — a Yoruba reader almost certainly reads English (Yoruba is more spoken than written), so English self-serve is not a literacy blocker. Therefore **13-5 is fast-follow, OUT of the pre-spend gate.** Low-literacy / non-readers are served by the **cascade + enumerators** (oral, in Yoruba/Pidgin), not a text form in any language. Radio CTA routes by capability: readers → website; non-readers → association head / "an enumerator will visit your area."

**Effort / risk / timeline.** Additive, non-disruptive. 13-1/13-3/13-4 are small and parallelisable within the 24–48h-movable runway. No existing story blocked.

## Section 4 — Detailed Change Proposals

### 4.1 — New dev stories (Epic 13)

| Story | Title | Scope | Tier |
|---|---|---|---|
| **13-1** | campaign-attribution-capture | UTM/`?ref` parse on wizard entry → `extras.utm`; mandatory "How did you hear about us?" question (single channel list: Radio/TV/Word-of-mouth/Association/Search/FB/IG/X/Other) → `extras.acquisition`; merge to `raw_data.campaign_source` on submit; channel report query. **No migration.** Pixel embedding is a parked sub-decision (default: UTM+self-report only for launch; pixels need consent-gate + CSP + DPIA — see attribution-spec §5). | 🚦 pre-spend |
| **13-2** | association-group-channel-and-import | Freeze condensed sheet (spec doc); add `imported_association` source + `import-sources.ts` config; build the association importer on the 11-2 backbone (dry-run/confirm/rollback, phone dedup, `imported_unverified` status). | sheet=Mon; import=fast-follow |
| **13-3** | launch-capacity-and-static-fallback | Load-test prod for a state-wide radio spike; deploy a Cloudflare-cached static fallback landing that captures intent if the API/home-box degrades. | 🚦 pre-spend |
| **13-4** | enumerator-prod-smoke-and-golive-gate | 5–10 real enumerator submissions end-to-end on prod; codify the 4-point pre-flight go/no-go checklist. | 🚦 pre-spend |
| **13-5** | acquisition-yoruba-comprehension-layer | Yoruba rendering of wizard labels/consent (comprehension/trust uplift). Not an access gate. | fast-follow |
| **13-6** | channel-and-coverage-dashboard | Attribution report (channel × station, CPA) + registrations by **LGA × trade × channel** to steer enumerators into thin LGAs. | fast-follow |

### 4.2 — Subtask additions to existing stories
- **11-2** (import service): note that 13-2 pulls the association-source slice forward; keep ITF-SUPA/other sources in Phase 5.
- **9-20** (capacity prep): cross-link 13-3 (static fallback is the new sibling of the capacity work).

### 4.3 — Artifact edits
- `sprint-status.yaml`: add `epic-13: backlog` + `13-1…13-6` keys (this SCP, applied 2026-06-25).
- `roadmap-to-launch.md`: Phase 2 reframed as Epic-13-executed + **pre-flight gate** added (this SCP, applied 2026-06-25).
- `epics.md`: append the Epic 13 section (stories above as As-a/I-want/So-that + ACs) — **handoff to Bob (SM) via `*create-story`** for canonical authoring.

## Section 5 — Implementation Handoff

**Change scope classification:** **MODERATE** (new epic, additive; one Phase-5 story partially pulled forward; no existing-story rewrites).

| Recipient | Responsibility |
|---|---|
| **Bob (SM)** | Author 13-1…13-6 via `*create-story`; append the Epic 13 section to `epics.md`; story keys already in `sprint-status.yaml` |
| **PM/Builder (John)** | Roadmap + sprint-status edits (done in this SCP); maintain the pre-flight gate |
| **Dev agent (Amelia)** | Implement 13-1 first (pre-spend); then 13-3 wiring; 13-2 importer fast-follow |
| **Operator (Awwal, Tailscale)** | Run the prod load test (13-3) + the 5–10 enumerator smoke submissions (13-4); supply the 11 station names + Yoruba translations + trade-list confirmation |

**Execution order:** 13-1 ∥ 13-3 ∥ 13-4 (pre-spend, this week) → fire radio/ads when the 4-point gate is green → 13-2 importer + 13-5 Yoruba + 13-6 dashboard (fast-follow).

**Success criteria:** attribution lands in `raw_data.campaign_source` (asserted by test) before first jingle; load test green + fallback live before spend; ≥5 enumerator prod submissions verified; Epic 13 keys tracked in sprint-status; roadmap Phase 2 reflects the gate.

**Deferred, NOT reopened:** generic viral (recast as association-seeded + trade-referral); ITF-SUPA/other import sources (stay Phase 5); SMS pending-NIN reminder (stays blocked on Termii sender-ID — independent track).

---

## Section 6 — Risks & coordination (folded from peer code-review 2026-06-25)

A second-pass review (code-grounded against the wizard/submit path) surfaced launch-coordination risks the original SCP under-weighted. Folded here as tracked risks:

1. **🔴 Termii phone-first dependency — the headline channel's follow-up is broken.** Radio reaches a **phone-first** audience → they defer NIN → and the **SMS reminder path is dead** (`dispatchSmsReminder` returns `dispatched: false`; it rides on Termii, whose sender-ID is stuck in KYC — confirmed empirically). So the campaign drives **precisely the demographic whose follow-up doesn't work.** **Action:** make **Termii KYC / sender-ID the #1 long-lead operator task starting today**, OR design the **radio CTA to route phone-first listeners to association/enumerator** instead of self-serve. This is now a launch-critical dependency, not a Tier-B note.

2. **🟠 Campaign ↔ Cohort A/B blast collision.** Firing `9-27`/`9-28` (email/SMS blasts) in the **same week** as radio/social/association draws on the **same Resend quota** (the exact exhaustion `9-63` metering was built for) **and confounds attribution** (can't tell campaign from blast). **Action:** **sequence them** — hold the blasts until the campaign's first-wave funnel data is in, or attribution is unreadable.

3. **🟠 Name the gate-override + write an ABORT tripwire.** The campaign fires **before** `9-18`'s "Step-4 stall <30% measured over 7 days" gate is satisfied — which is *fine and necessary* (you can't measure stall at ~1/day organic; you need the volume). **But say so explicitly**, and define the abort rule: **if completion-rate craters in the first hours** (watch the `9-19` funnel + `cf-traffic-watch`), **pause the spend.** The movable radio date is exactly what buys this option. The plan had the instruments but no written abort rule — this adds it.

4. **🟢 13-1 correction recorded (done).** The attribution question was moved to the **Review step** and made **best-effort / never-blocking** (front-loaded + mandatory was a conversion self-own on the eve of paid spend); launch-safety AC added (two `raw_data` write-sites, autosave timing, feature-flag + rollback, verify-happy-path-AFTER-deploy). Pre-flight gate item #1 ("prod happy-path verified") therefore runs **after** 13-1 deploys, not before.

## Addendum — outstanding operator inputs (gate the print/airing, not the build)

1. **Pixel decision** (attribution-spec §5) → UTM+self-report only for launch (default rec), or pixels-with-consent-gate (needs CSP allowances + DPIA addendum)? (Story 13-1 branch.)
2. **Yoruba translations** → sheet declaration/headers (13-2 sheet) + wizard layer (13-5).
3. **Trade list confirmation/extension** → Appendix B of the sheet spec (clustering quality).
4. **Print logistics** → copies per association.
5. **CPA kill-switch ceiling** → pre-agree the 48h cost-per-registration threshold before spend (attribution spec §3).
