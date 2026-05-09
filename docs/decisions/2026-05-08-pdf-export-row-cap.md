# Decision Memo — PDF Export Row Cap

**Date:** 2026-05-08
**Author:** John (PM)
**Status:** Ratified by Awwal 2026-05-08. Routed to Bob (SM) for story creation.
**Originating brief:** `docs/follow-ups/2026-05-08-pdf-export-row-cap-product-decision.md`
**Routes to:** Bob (SM) for story creation if ratified

---

## Context

Story 9-10's 2nd-pass code review (2026-05-08) lifted the BENCHMARK gate that had hidden the cost of `ExportService.generatePdfReport` at scale. Measured on developer laptop, synthesised in-memory rows:

| Format | Rows    | Time       | Output size |
|--------|--------:|-----------:|------------:|
| PDF    |   1,000 |    2.4 s   |     9.7 MB  |
| PDF    |  10,000 |   14.6 s   |    93.0 MB  |
| CSV    |  10,000 |    0.12 s  |   634 KB    |
| CSV    | 100,000 |    0.34 s  |     6.3 MB  |

`ExportService` currently has no row cap. A confused or hostile user can request a 50K-row PDF and pin a request for ~75 s, returning ~470 MB.

**This is a preventive call.** No real export volume has hit production yet; no abuse observed. The decision is intended to ship before the first real "export everything" attempt, not after.

---

## Decision

### Q1 — Should PDF export be capped?

**Two-tier cap.** (Combination of options B and C from the originating brief — adding because the brief's single-cap framing forced soft and hard concerns onto one threshold.)

- **0–2,000 rows** → silent generation, no UI friction.
- **2,001–5,000 rows** → UI modal warns: *"This PDF will be ~20–47 MB and take 5–12 s. Continue, or switch to CSV?"* User can proceed.
- **5,001+ rows** → API returns HTTP 413 with body: *"PDF supports up to 5,000 rows. Use CSV for larger exports."*

**Reasoning:** the modal and the hard cap solve different problems. The modal educates the user about format choice for the legitimate but oversized request. The hard cap protects the API from automation/abuse and from the worst-case "export everything" mistake. Forcing both jobs onto a single threshold either over-frictions legitimate users (low cap) or under-protects the service (high cap).

### Q2 — Thresholds

- **Soft cap (modal): 2,000 rows.** ~19 MB / 4.7 s. Still email-attachable; marginal generation time.
- **Hard cap (413): 5,000 rows.** ~47 MB / 11.7 s. Past Gmail's 25 MB attachment limit; recoverable on a modern machine.

**Reasoning:** 1K is comfortable in every dimension and shouldn't carry UI friction. 2K is where "this might surprise you" becomes true. 5K is where "this is unreasonable for any export the team should be doing in PDF" becomes true — above it, format choice is no longer subjective.

### Q3 — Domain-bounded exports

**Per-endpoint inventory required.** Some exports (e.g. "LGA enumerator productivity for July") have row counts bounded by domain logic (~200 rows max). For these the cap is moot and the modal should be suppressed.

**Routing:** Bob (SM) produces the inventory during story decomposition. He owns whether the modal/cap logic is per-endpoint configurable (suppression flag) or applied uniformly with the modal simply not firing at low row counts.

### Q4 — Backend CSV streaming

**Defer.** Current CSV at 100K rows is 342 ms / 66 MB heap delta. OSLSR's projected lifetime data ceiling is ~100K rows (every respondent in the field-survey submissions table). Streaming is over-engineering until projection grows past ~1M rows.

**Watchpoint:** if the OSLSR dataset projection is revised upward (consumer-facing extension, multi-state expansion), revisit.

### Q5 — Benchmark lane expansion

**Defer 2–3 weeks.** The BENCHMARK lane (`.github/workflows/benchmarks.yml`, created 2026-05-08) covers ExportService PDF/CSV only. Let it prove itself before expanding.

**Candidates for next pass when reviewed (target ~2026-05-29):** admin audit log filters, supervisor analytics rollups, payroll batch generation, ID-card PDF batch render.

---

## Consequences

**If ratified:**
- New story `prep-export-row-cap-and-redirect` (or rolled into next polish epic — Bob's call) added to `_bmad-output/planning-artifacts/epics.md`.
- Story tasks at minimum:
  - Backend: 413 enforcement at 5,001+ rows in `ExportService.generatePdfReport` request path.
  - Frontend: modal on the export trigger UI when the row count estimate is 2,001–5,000.
  - Per-endpoint inventory + suppression flag for domain-bounded exports.
  - Tests covering both thresholds and the suppression case.
- AC includes documenting the suppression-flag list per endpoint.
- No code change to CSV pipeline.
- BENCHMARK lane extension review scheduled ~2026-05-29.

**If not ratified (status quo, Q1 = Option A):**
- Decision recorded here so the question doesn't re-litigate.
- Next "export everything" event becomes the trigger to reopen.

---

## Signoff

- [x] Awwal ratification — **2026-05-08**
- [x] Iris signoff — N/A (unavailable in Operate-phase window; John recommended, Awwal ratified per follow-up brief escalation rule)
- [ ] Bob (SM) story drafted — _________________ (story ref pending)
- [x] Follow-up brief at `docs/follow-ups/2026-05-08-pdf-export-row-cap-product-decision.md` marked closed — 2026-05-08

---

## Open items deliberately not addressed here

- **Print-quality PDFs** (single-record reports, ID cards, certificates): not in scope. These are bounded-by-design at <10 rows and use different code paths.
- **Async export jobs** (queue + email-when-ready): a possible future direction if PDF demand at 5K+ rows turns out to be legitimate. Out of scope for preventive cap; revisit if modal-dismissal telemetry shows real users routinely choosing "continue" at 4K-5K rows.

---

## Propagation log

### Round 1 — ratification edits (2026-05-08, John PM)

| Artifact | Change | Status |
|---|---|---|
| `_bmad-output/planning-artifacts/prd.md` | Title bumped V8.3 → V8.4; Story 5.2 AC#5 added (points to ADR-021 + this memo); Change Log V8.4 row added | ✅ Done — John (PM scope) |
| `docs/follow-ups/2026-05-08-pdf-export-row-cap-product-decision.md` | Header status flipped to ✅ CLOSED with pointer back here | ✅ Done — John (PM scope) |
| `_bmad-output/planning-artifacts/architecture.md` | ADR-021 drafted by John, then **REVERTED** (overreach correction — see Round 2). **Re-authored by Winston 2026-05-08** in Round 3 — leads with boring-tech continuity (parasitic on Sally's existing audit-log 10K cap pattern), is honest about developer-laptop benchmark vs production-VPS extrapolation, locks the HTTP 413 JSON response shape as load-bearing for partner-API consumers (Story 10-1 must reference), defers implementation shape (middleware vs per-controller) to Bob, captures the async-export-job evolution path as a watchpoint not a commitment, and explicitly numbers next-ADR as ADR-022. | ✅ Done — Winston (Architect) |
| `_bmad-output/planning-artifacts/ux-design-specification.md` | Component #18 `ExportRowCapModal` drafted by John, then **REVERTED** (overreach correction — see Round 2). **Re-authored by Sally 2026-05-08** in Round 3 as **`ExportFormatHintModal`** (renamed: "Hint" reframes the modal from punitive to advisory; matches the existing `NinHelpHint` naming pattern). Adds the "user moment" narrative (Aisha story) before anatomy, a load-bearing **Tone & copy guide** (words to use vs avoid — `heads up` not `warning`; `switch` not `must`), explicit **default focus on "Switch to CSV"** with reasoning ("nudge toward better outcome, not block worse one"), graceful degradation for unavailable estimates, ESC/backdrop close honoured as a third option ("user is recomposing, not deciding"), telemetry contract aligned with ADR-021 (audit overrides, not compliance), and **pattern lineage** section explicitly tying to Sally's own Journey 6 step 6 audit-log cap as the originating pattern this component generalises. | ✅ Done — Sally (UX Designer) |

### Round 2 — routing correction (2026-05-08, Awwal directive)

**What happened:** John (PM) initially authored ADR-021 in `architecture.md` and Component #18 in `ux-design-specification.md` directly, on the rationale that Iris (UX product signoff partner) was unavailable in the Operate-phase window per the originating brief's escalation rule. **This was overreach.** The Iris-escalation rule scoped to *signoff* (a UX product judgement), not to *authoring*. Architecture content is Winston's voice; UX-spec custom-component definitions are Sally's voice. Authoring those artifacts under John's hand is the same class of drift as ad-hoc story authoring (impostor-SM pattern) — both violate the canonical-agent discipline.

**Correction:** Awwal directed full revert + re-author from scratch. Architecture and UX spec are now restored to their pre-Round-1 state. The decision memo (this file) and the PRD V8.4 changelog entry remain as the canonical source for what Winston and Sally will author from.

**Sequencing for Round 3 (executed 2026-05-08, single session):**

1. ✅ **Winston (Architect)** — authored ADR-021 in `architecture.md` from this memo + originating brief, in his own voice (boring-tech continuity, honest benchmark caveats, locked HTTP 413 JSON response shape).
2. ✅ **Sally (UX Designer)** — authored Custom Component #18 as **`ExportFormatHintModal`** (renamed from John's `ExportRowCapModal`; "Hint" reframes punitive→advisory, matches `NinHelpHint` pattern) with the Aisha user story, load-bearing tone-and-copy guide, default-focus-on-Switch-to-CSV nudge intent, telemetry asymmetry, and pattern lineage section tying back to her own Journey 6 step 6.
3. ✅ **Bob (SM)** — authored story `prep-export-row-cap-and-redirect` via canonical `*create-story --yolo`, citing PRD AC#5 + ADR-021 + Component #18 + this memo as `[Source: ...]` inputs. Story file at `_bmad-output/implementation-artifacts/prep-export-row-cap-and-redirect.md` (10 ACs, 9 Tasks with file-path-specific subtasks). Added prep-task entry to `_bmad-output/planning-artifacts/epics.md` (between `prep-settings-landing-and-feature-flags` and `## Epic 10`). Added `prep-export-row-cap-and-redirect: ready-for-dev` to `_bmad-output/implementation-artifacts/sprint-status.yaml`. Story is now **ready-for-dev** — implementation pickup by Awwal + dev agents whenever capacity allows; recommended before Story 10-3 / 10-4 partner-API consumer access lands.

**Deliberately NOT pre-edited at any round** (per BMad canonical-create-story discipline):
- `_bmad-output/planning-artifacts/epics.md` — Bob owns this in Round 3.
- `_bmad-output/planning-artifacts/sprint-status.yaml` (or equivalent) — story has no ID until Bob creates it; sprint update follows Bob.
- `docs/project-context.md` — pattern doesn't qualify as project-wide convention until shipped + reused. Re-evaluate after the story lands and the modal pattern proves itself; if it does, elevate to a `tiered-cap-on-expensive-sync-operations` rule that ID-card batch render / payroll batch / supervisor analytics rollups can inherit.

**Process lesson (for the next decision memo):** when an Operate-phase decision touches multiple authoring agents and one is unavailable, the unavailable-agent escalation only covers **signoff**, not **authoring**. Available authoring agents must still be invoked for the artifact in their domain. Captured here so future-John doesn't re-overreach.

**Iris signoff note:** still N/A for the *signoff* itself (Iris remains unavailable in the Operate-phase window). Awwal ratified this decision per the brief's escalation rule. Iris should ratify the component-level UX details (modal copy, focus order, default-CTA choice) on first reachability post-Operate; structural change is not expected.
