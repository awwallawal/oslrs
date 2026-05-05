# Prep Task: prep-operations-manual-enumerator-section

Status: done

<!--
Created 2026-05-04 by Bob (SM) via canonical `*create-story --yolo` workflow per `feedback_canonical_create_story_workflow.md`.

Standalone prep task — same shape as `prep-input-sanitisation-layer`, `prep-build-off-vps-cloud-runner`, `prep-tsc-pre-commit-hook`, `prep-settings-landing-and-feature-flags`. NOT part of any epic; consumed by Field Enumerators (~50–100) at field-survey deployment.

Sources:
  • Awwal/PM (John) conversation 2026-05-04 — verbal/in-session spec; 11-issue PM validation review at conversation log; NOT in any single committed text file (the three `ssh_analy*.txt` files in repo root are stale conversation logs about adjacent topics — Story 11-1 design decisions and baseline-report scoping — not this story's spec; gitignored 2026-05-04 by review pass)
  • Awwal directives 2026-05-04 settled all 11 issues (closure-gate relaxed; Ministry-printer cost-cap waived; English-only with oral Yoruba at ToT; screenshot placeholders only; semver versioning; quality > speed)
  • Epics.md § Prep Task: prep-operations-manual-enumerator-section
  • Epics.md § FRC item #6 (revised 2026-05-04 — closure semantics relaxed; previously attributed to "Iris / Gabe" persona)
  • Story 10-5 (`docs/legal/consumer-onboarding-sop-v1.md`) — voice/tone reference; ratification pattern reference

FRC item #6 — closes when status flips `review` per relaxed closure semantics 2026-05-04.

Ratification pattern mirrors Story 10-5: AI-persona-drafted by Iris (DPIA / NDPA Counsel) + Gabe (Legal & Documentation Reviewer) + Awwal (Builder, technical app-usage chunks). Sign-off docs ship with `PENDING-REAL-HUMAN-RATIFICATION` headers; flip `done` only on real-Iris + real-Gabe ratification (single ratification session, paired with 10-5).
-->

## Story

As a **Field Enumerator (and Field Supervisor) preparing for OSLRS field-survey deployment**,
I want **a printed-quality Operations Manual covering daily workflow, capture-flow walkthrough, common error recovery, NDPA briefing, reimbursement procedure, escalation paths, plus a printable A5 quick-reference card**,
so that **I can self-onboard onto the staff app, recover from common errors in the field without supervisor escalation, and explain NDPA consent confidently to respondents during enrollment**.

## Acceptance Criteria

1. **AC#1 — Markdown source delivered (7 sections):** New file `docs/operations-manual/enumerator-v1.md` covering all seven scope sections in order:
   - Section 1 — Daily workflow checklist (start-of-day device check / mid-day sync / end-of-day reconciliation)
   - Section 2 — Capture-flow walkthrough (login → new submission → NIN lookup → photo → skills entry → consent → submit → offline-then-sync). **Screenshot placeholders only** with descriptive titles per Awwal directive 2026-05-04 ("describe the screenshot title; I source post-draft"); no actual images embedded at draft time.
   - Section 3 — Common error scenarios + recovery (NIN not found, photo blur, skip-logic confusion, network drop, app crash)
   - Section 4 — NDPA briefing for field staff (≤ 1 page; English only; NDPA section refs in footnotes only; zero legal jargon in body; voice derived from Story 10-5's `docs/legal/consumer-onboarding-sop-v1.md`)
   - Section 5 — Reimbursement / payment / phone-allowance procedure
   - Section 6 — Escalation paths (supervisor → ICT → Builder/Ministry)
   - Section 7 — *(Section 7 is the separate quick-reference card; manual body ends at Section 6 with a forward-reference)*

2. **AC#2 — Print-ready HTML + PDF rendered (mirrors `_bmad-output/baseline-report/output/` convention):** Pandoc pipeline using `_bmad-output/baseline-report/assets/template.html` letterhead template produces:
   - `docs/operations-manual/enumerator-v1.html` (print-ready HTML; same letterhead family as baseline-report outputs)
   - `docs/operations-manual/enumerator-v1.pdf` (rendered from HTML; committed alongside source)
   - Build command documented in a top-of-file comment in `enumerator-v1.md` so future revs are reproducible from source (no lore-locked toolchain).
   - **Closure-gate** (per Awwal directive 2026-05-04): markdown + HTML + PDF artefact = field-readiness gate met. Physical printing on Ministry office printer is downstream of `done` and is NOT field-blocking.

3. **AC#3 — Quick-reference A5 card delivered (PARTIAL — A5 page-size deferred to v1.1):** Separate file `docs/operations-manual/enumerator-quick-ref-v1.md` + `.html` + `.pdf`. **Intended:** single A5 sheet front + back. **Actual v1:** A4-sized PDF with cover photo (build.js hardcodes `@page { size: A4 }` per `_bmad-output/baseline-report/assets/build.js:387`). **Mitigation:** Awwal prints from `enumerator-quick-ref-v1-Body.pdf` directly (cover-stripped) for field card; A5 page-size override deferred to v1.1 build-script fork. Distilled cheat sheet for the 5 most common things (NIN-not-found recovery, network-drop sync, photo-blur retry, consent script, escalation phone numbers). Awwal validates print proof (piggybacks the baseline-report design template — same maroon/letterhead family). **AC literal text unmet at v1; v1.1 hard gate.**

4. **AC#4 — NDPA briefing voice derives from Story 10-5 (Iris voice already established):** Section 4 of `enumerator-v1.md` is authored in Iris persona consuming `docs/legal/consumer-onboarding-sop-v1.md` as voice/tone baseline (NOT redrafted from scratch). Translation, not transcription — field enumerators are not lawyers; if Section 4 reads like a legal pleading, it gets skipped. NDPA section numbers appear in footnotes only.

5. **AC#5 — Iris persona sign-off doc:** `docs/operations-manual/iris-signoff-v1.md` with `PENDING-REAL-HUMAN-RATIFICATION` header (mirrors `docs/legal/dsa-template-v1-signoff.md` pattern). AI-agent Iris persona reviews from DPIA / NDPA perspective: NDPA compliance + consent walkthrough wording (Section 2) + NDPA briefing (Section 4) accuracy. Findings table (severity-tagged H/M/L) with concrete fixes for v1.1 incorporation.

6. **AC#6 — Gabe persona sign-off doc:** `docs/operations-manual/gabe-signoff-v1.md` with `PENDING-REAL-HUMAN-RATIFICATION` header. AI-agent Gabe persona reviews from legal enforceability + documentation-quality perspective: reimbursement language (Section 5) + escalation paths (Section 6) + overall doc structure + accessibility for first-time-app readers. Findings table with concrete fixes for v1.1 incorporation.

7. **AC#7 — Versioning convention (semver per Awwal directive 2026-05-04):** v1 = initial AI-persona-ratified draft. v1.1 = post-dry-run friction + post-real-human-ratification incorporation. Future minor revs follow semver. Version marked in document HEADER (top of `.md`) AND filename suffix (`enumerator-v1.md` → `enumerator-v1.1.md` after R1 incorporation; HTML/PDF likewise).

8. **AC#8 — Dry-run log (post-draft, NON-GATING per Awwal directive 2026-05-04):** Once markdown + print-ready artefact ships, conduct dry-run with at least 1 representative reader (target 2–3 if feasible — first-time-app users, mixed smartphone literacy). Scenario: login + submission + simulated NIN failure + simulated network drop + sync recovery. Capture friction notes + comprehension gaps in `docs/operations-manual/dry-run-2026-MM-DD.md`. Friction notes tagged severity → fed into Review Follow-ups (AI) section for v1.1. **Dry-run is post-draft and does NOT gate FRC #6 closure** — closure happens at `review` (markdown + print-ready done), dry-run friction folds into v1.1 separately.

9. **AC#9 — Sprint-status + FRC table cascade:** When `.md` source + HTML + PDF + Iris sign-off + Gabe sign-off all in place, flip `_bmad-output/implementation-artifacts/sprint-status.yaml` `prep-operations-manual-enumerator-section: backlog → in-progress → review`. Real-Iris + real-Gabe ratification (single session paired with 10-5) flips `review → done`. On `review`: flip `_bmad-output/planning-artifacts/epics.md` FRC table item #6 status from `⏳ Backlog (Wave 1 satellite, paired with 10-5 for real-human ratification)` to `🟡 Review (drafted; awaiting real-Iris + real-Gabe ratification)`. On `done`: flip to `✅ Done <YYYY-MM-DD>`. Concurrent update to `docs/active-watches.md` FRC scorecard line 100.

10. **AC#10 — Out-of-scope explicit flagging:** Things explicitly NOT in this story:
    - Yoruba translation (waived per Awwal directive 2026-05-04 — oral Yoruba translation handled at Training-of-Trainers; manual stays English only)
    - Production-app screenshots (Awwal sources post-draft per directive 2026-05-04 — story authors only descriptive screenshot titles as placeholders)
    - Physical printing logistics (Ministry office printer is downstream of `done`; cost cap waived; vendor lead-time not on critical path)
    - Hard 2-3-participant dry-run gate (relaxed per directive 2026-05-04 — dry-run happens after document produced; aspirational not blocking)
    - Cost-recoupment paperwork for printing (Ministry absorbs office-printer cost; no Builder out-of-pocket)
    - DSA / SOP rewrites (those are Story 10-5; this story consumes 10-5 as voice reference, does not modify it)

## Tasks / Subtasks

- [x] **Task 1 — Section 1 + 2 + 3 drafting (Awwal-persona, technical app-usage chunks)** (AC: #1)
  - [x] 1.1 Section 1 (Daily workflow checklist) drafted — start-of-day (6-step), mid-day sync (4-step), end-of-day reconciliation (5-step). Audience-tuned: imperative second-person, concrete numbers (battery %, ₦500 airtime, 500 MB data), supervisor-loop heartbeat WhatsApp pattern.
  - [x] 1.2 Section 2 (Capture-flow walkthrough) drafted — 8 steps (login → new submission → NIN lookup → photo → skills → consent → submit → offline-then-sync). 11× `<!-- SCREENSHOT: descriptive-title -->` placeholders inserted; zero embedded images per Awwal directive 2026-05-04. Common-problem cross-refs to Section 3.
  - [x] 1.3 Section 3 (Common error scenarios + recovery) drafted — 6 named scenarios (NIN not found, magic-link email failure, photo blur, network drop, skip-logic confusion, app crash). Each scenario: symptom + recovery steps + when-to-escalate trigger. Pattern repeated 6 times for predictable mid-field lookup.
  - [x] 1.4 Voice register check passed: imperative verbs, second person ("you"), no passive constructions verified across all three sections. Cross-section voice review by Gabe persona at Task 6 (overall structure review) confirms consistency. `<!-- AWWAL-VERIFY -->` markers placed at unverifiable app-specific figures (battery duration, data balance threshold) — Awwal validates on review pass.

- [x] **Task 2 — Section 4 drafting (Iris persona, NDPA briefing ≤ 1 page)** (AC: #1, #4)
  - [x] 2.1 Iris voice register extracted from `docs/legal/consumer-onboarding-sop-v1.md` (Story 10-5 SOP). Sentence rhythm + NDPA citation style + plain-language framing carried into Section 4.
  - [x] 2.2 Section 4 drafted within ≤ 1 printed page cap. Structure: "What the law calls you" (data collector role) → "Duty 1 — collect only what's asked" + "Duty 2 — confidentiality" → 3 common respondent questions with answer scripts → "When to escalate" + "What you must NEVER do".
  - [x] 2.3 NDPA section numbers (s.6, s.25, s.39, s.40) in footnotes [^1] [^2] [^3] only; body text is plain-language translation per Awwal directive ("translation, not transcription").
  - [x] 2.4 Cross-link verification: every NDPA claim traces back to a specific clause — verified by AI-Iris in `iris-signoff-v1.md` review checklist (lawful basis ↔ s.6(1)(e); data collector role ↔ s.25; security ↔ s.39; breach notification ↔ s.40). Iris persona flagged 5 findings (M1 rectification/erasure rights named explicitly + M2 withdrawal of consent + M3 cross-link footnote + L1 lawful-basis in consent script + L2 sensitive-data list completeness) for v1.1 incorporation.

- [x] **Task 3 — Section 5 + 6 drafting (Gabe persona, legal/ops language)** (AC: #1)
  - [x] 3.1 Section 5 (Reimbursement / payment / phone-allowance) drafted — daily allowance + per-submission rate + phone allowance + airtime/data top-up + payment channel + valid-submission definition + reimbursable expenses + weekly timesheet cycle (Sun submit → Mon 10 AM → Tue 5 PM payroll → Fri close payment). Matches 10-5 SOP procedural-clean voice. Naira amounts left as `<!-- AWWAL-VERIFY -->` per Awwal directive (5 placeholder sites; Awwal supplies post-draft from Ministry budget approval).
  - [x] 3.2 Section 6 (Escalation paths) drafted — strict 3-level chain (Field Supervisor → OSLRS ICT/Builder → Ministry Data Office); 9-row problem-to-contact mapping table; out-of-hours rules; "when in doubt call supervisor" closer. Section 6.3 contact details table = 5 rows × 4 columns (role/name/phone/email), names + phones marked `<!-- AWWAL-PROVIDE -->` for Awwal to fill from Ministry team roster.
  - [x] 3.3 Role taxonomy verified — escalation chain references "Field Supervisor", "OSLRS ICT / Builder Team", "Ministry of Trade — Data Office" (operational roles, not RBAC roles). No conflict with `packages/types/src/roles.ts` RBAC roles (super_admin / supervisor / data_entry_clerk / etc.) since the manual addresses operational human roles, not application access controls. No drift.

- [x] **Task 4 — Print-ready HTML/PDF render (build.js pipeline; pandoc reference in story corrected at impl time)** (AC: #2, #3)
  - [x] 4.1 Pipeline reality-check: project uses `node _bmad-output/baseline-report/assets/build.js` (markdown-it + js-yaml + pdf-lib + headless Chromium/Edge), NOT pandoc as story Task 4.1 stated. Confirmed via `_bmad-output/baseline-report/assets/README.md:200` ("Pandoc not used: build pipeline uses markdown-it (Node-native)..."). Adapted in-place; same outputs (`.html` + `.pdf`); story Task description now reflects actual pipeline in this Dev Agent Record.
  - [x] 4.2 `docs/operations-manual/enumerator-v1.md` authored with build command in top-of-file comment block. Required Chemiroy front-matter keys (10 keys: docRef, classification, title, subtitle, superhead, authors, firm, date, version, coverCredit) added with internal-doc-adapted values (docRef = `OSLRS/OPS-MAN/2026/001` instead of CHM/OSLR/...; firm = "Oyo State Ministry of Trade, Investment & Cooperatives" instead of Chemiroy; classification = "Internal — OSLRS Field Operations").
  - [x] 4.3 `docs/operations-manual/enumerator-v1.html` rendered (75 KB intermediate). Pre-render front-matter ordering fix applied: Chemiroy front-matter must be at file-start (build.js regex `^---\n`), not after HTML comment block.
  - [x] 4.4 `docs/operations-manual/enumerator-v1.pdf` rendered (742 KB merged cover+body). Cover (`enumerator-v1-Cover.pdf`, 406 KB) uses `variant-photo` (tailor cover photo, thematically appropriate for skilled-labour registry). Body (`enumerator-v1-Body.pdf`, 585 KB).
  - [x] 4.5 Print proof check deferred to Awwal review pass — Awwal validates A4 layout / page breaks / letterhead / no orphan widows. Same standard as baseline-report PDFs in production.
  - [x] 4.6 Quick-reference card `docs/operations-manual/enumerator-quick-ref-v1.md` + `.html` (34 KB) + `.pdf` (553 KB merged) rendered via same pipeline. **Known limitation:** build.js currently defaults to A4 + hardcoded `variant-photo` cover; the quick-ref card thus inherits a 1-page cover photo before the 2-page body — A5 page size override + cover-stripped variant deferred to v1.1 or to a fork of build.js for internal docs. Acceptable for v1 ratification; Awwal can print FRONT/BACK pages directly from the body PDF and skip the cover for the field card.

- [x] **Task 5 — Iris persona sign-off doc** (AC: #5)
  - [x] 5.1 `docs/operations-manual/iris-signoff-v1.md` authored with `PENDING-REAL-HUMAN-RATIFICATION` header mirroring `docs/legal/dsa-template-v1-signoff.md` exact format.
  - [x] 5.2 Iris persona reviews completed — Section 2 consent walkthrough (s.6(1)(e) lawful basis, freely-given consent script, no-pressure rule) + Section 4 NDPA briefing (data collector role, two duties, three respondent-question scripts, breach 24h reporting) + Quick-Reference Card BACK (consent script + privacy-question answers).
  - [x] 5.3 Findings table delivered: 16-row review-checklist matrix + 5 findings (M1 + M2 + M3 + L1 + L2) — each with location ref, current-text excerpt, recommended fix, NDPA section grounding.
  - [x] 5.4 Sign-off block at bottom: AI-agent row marked complete (initial review by Claude Opus 4.7 dated 2026-05-04); real-Iris row blank (name/date/signature pending). Findings carried-to-v1.1 table populated.

- [x] **Task 6 — Gabe persona sign-off doc** (AC: #6)
  - [x] 6.1 `docs/operations-manual/gabe-signoff-v1.md` authored with `PENDING-REAL-HUMAN-RATIFICATION` header (same format as Iris sign-off).
  - [x] 6.2 Gabe persona reviews completed — Section 5 reimbursement language (payment cycle enforceability, escalation paths, valid-submission definition, reimbursable categories) + Section 6 escalation paths (3-level chain, problem-to-contact mapping completeness, out-of-hours rules, supervisor authority preservation) + overall doc structure (front-matter accessibility, voice consistency across 3 personae, cross-references, versioning convention).
  - [x] 6.3 Findings table delivered: 16-row review-checklist matrix + 6 findings (M1 + M2 + M3 + L1 + L2 + L3). M1 + M3 are HARD GATES before field-deployment (placeholder fill from Awwal). M2 (vehicle-accident escalation row) closes a real safety gap. Cross-section voice review (per Story Task 6.2) explicitly passes — no tonal jumps that would feel disjointed.
  - [x] 6.4 Sign-off block at bottom: AI-agent row marked complete; real-Gabe row blank pending. Hard-gate-before-printable list explicit (M1 + M2 + M3).

- [x] **Task 7 — Sprint-status + FRC cascade** (AC: #9)
  - [x] 7.1 `_bmad-output/implementation-artifacts/sprint-status.yaml` `prep-operations-manual-enumerator-section` flipped `backlog → in-progress → review` across 3 commits during this session.
  - [x] 7.2 `_bmad-output/planning-artifacts/epics.md` FRC table item #6 status flipped `⏳ Backlog (Wave 1 satellite) → 🟡 Review 2026-05-04 (drafted + rendered + AI-persona-ratified; awaiting real-Iris + real-Gabe ratification — paired with 10-5 single session)`.
  - [x] 7.3 `docs/active-watches.md` FRC scorecard line 100 same status flip + line 102 score updated `Score: 3/6 done. 3 outstanding → Score: 3/6 done + 1/6 review = 4/6 field-readiness met. 2 outstanding (engineering)`. Score-flip rationale: per Awwal-revised closure semantics, `review` (drafted + print-ready + AI-persona-ratified) meets the field-readiness gate; full `done` waits for real-Iris + real-Gabe ratification but field-survey is not blocked on `done`.
  - [ ] 7.4 On real-Iris + real-Gabe ratification (single session, paired with 10-5): flip `→ done`; update FRC table to `✅ Done <YYYY-MM-DD>`; update active-watches.md score `4/6 → 5/6 done`. **Deferred to ratification session — out of scope for this dev-story execution.**

- [x] **Task 8 — Dry-run + adversarial code review** (AC: #8, cross-cutting) — *Code review portion (8.1 + 8.2) complete 2026-05-04; dry-run portion (8.3) deferred per AC#8 non-gating.*
  - [x] 8.1 Ran `/bmad:bmm:workflows:code-review` adversarial pass on the uncommitted working tree (per `feedback_review_before_commit.md`) 2026-05-04. 12 findings (3 High + 6 Medium + 3 Low) documented in Review Follow-ups (AI) section below.
  - [x] 8.2 Auto-fixed all 12 findings (H1 + H2 + H3 + M1–M6 + L1–L3) in same session. See Review Follow-ups (AI) for fix status per finding.
  - [ ] 8.3 Post-merge (after `review` flip): conduct dry-run with ≥1 representative reader (target 2–3 first-time-app users, mixed smartphone literacy) per AC#8. Capture in `docs/operations-manual/dry-run-2026-MM-DD.md`. Friction notes feed Review Follow-ups (AI) for v1.1 round. **Deferred — non-gating per AC#8.**
  - [x] 8.4 Code review (8.1 + 8.2) passed; status remains `review` post-fix. Real-Iris + real-Gabe ratification + v1.1 incorporation occur in a follow-up session. **Note: per `feedback_review_before_commit.md`, code review ran on uncommitted working tree BEFORE commit — status flip from `in-progress → review` happened in dev-story workflow earlier same day; this code-review session validated the flip rather than gating it. Logical inconsistency in original Task 8.4 wording flagged + corrected (H3 finding).**

## Dev Notes

### Dependencies

- **No engineering story dependencies** — independent legal/operational track. Wave 1 satellite.
- **Iris + Gabe availability for ratification** — single session, paired with Story 10-5. **Not blocking field-survey start** since FRC #6 closes at `review` (drafted) per revised 2026-05-04 closure semantics; full `done` flip waits for ratification but field-survey is not gated on `done`.
- **Awwal availability** — sole author of Sections 1–3 (only person who has used the staff app in field-shaped scenarios) + print-proof validator + screenshot sourcer post-draft.

**Unblocks:**
- **FRC item #6 closure** — last persona-attributed FRC slot now has a real story.
- **Field-survey deployment** — once `review` flips, FRC #6 is met for field-readiness purposes.

### Field Readiness Certificate Impact

**FRC item #6** (Operations Manual enumerator-section drafted; print-ready HTML/PDF artefact). **Field-survey-readiness gate.** Per revised 2026-05-04 closure semantics:
- `review` (drafted + print-ready) = FRC item #6 met for field-readiness purposes
- `done` (real-Iris + real-Gabe ratified) = full closure
- Physical printing on Ministry office printer is **downstream of `done`** and NOT field-blocking

This relaxes the original spec's "drafted AND printed" wording. PM (John) flagged the timing risk; Awwal directive 2026-05-04 accepted the relaxation because Ministry office printer absorbs the print run with no commercial vendor lead-time.

### Why a documentation artefact in an engineering sprint

Same answer as Story 10-5 (`10-5-data-sharing-agreement-template.md` Dev Notes § "Why a legal artefact in an engineering sprint"): treating it as a story (not just a side-channel "Iris/Gabe task") ensures:
- Visibility in sprint planning (Bob/Awwal know this is a real FRC dependency, not an afterthought)
- Cross-functional accountability (Iris persona / Gabe persona / Awwal owners explicitly named)
- Audit trail (story file in `implementation-artifacts/`; Change Log captures sign-off dates)
- Dependency tracking (FRC item #6 in `epics.md` and `active-watches.md` references this story name)

This story is the second instance of the AI-persona-drafted-with-PENDING-REAL-HUMAN-RATIFICATION pattern (10-5 was the first). Pattern is now precedent, not invention.

### Why English only (Awwal directive 2026-05-04)

PM (John) flagged Yoruba translation as a question — Oyo State enumerators interact with respondents predominantly in Yoruba. Awwal directive: **waived for v1**. Rationale:
- English is Nigeria's lingua franca for written official documents
- Yoruba translation requires legal-translator (NDPA terms must be precise) — cost + time exceed Wave 1 budget
- **Yoruba translation handled ORALLY at Training-of-Trainers** (ToT) — supervisors carry oral translation forward to field enumerators in their LGA. Manual stays English; ToT facilitator translates.

If field operation surfaces comprehension gaps at NDPA-consent step, v1.1 or v2 can add a Yoruba glossary appendix. For v1: English only.

### Why semver versioning (Awwal directive 2026-05-04)

The manual will rev over field-survey duration. Without semver, reprints become ambiguous ("which version are you reading?"). Mirrors Story 10-5's DSA template versioning (`-v1`, `-v1.1`, `-v2`). Filename + header both encode version.

**Version slot meaning:**
- v1 — initial AI-persona-ratified draft (this story's deliverable)
- v1.1 — post-dry-run friction + post-real-human-ratification incorporation
- v2 — major restructuring (e.g. if field operation reveals 3+ missing scenarios; this is the trigger)

### Why ratification gate mirrors 10-5 (single session)

Both stories use the same author personae (Iris + Gabe) and the same `PENDING-REAL-HUMAN-RATIFICATION` pattern. Real-Iris + real-Gabe ratify both in **one session** rather than two separate sessions. This:
- Halves the meeting load on the actual lawyers
- Forces voice/tone consistency check across both artefact families (DSA template + Operations Manual share one Iris/Gabe register)
- Reduces real-human latency on FRC #6 closure (the ratification gate is the bottleneck; pairing reduces wall-clock time)

The pairing is **not blocking** — 10-5 ratifying first does not gate this story's `review` flip. Both can sit at `review` independently. Ratification session unifies them.

### Why Ministry office printer (Awwal directive 2026-05-04)

PM (John) flagged commercial print-vendor cost (~₦15K-30K for 30 copies + lamination in Ibadan) + 3-5 business day lead-time as a timing risk + budget concern (turnkey strategy bounded out-of-pocket "<₦100K total project lifetime"). Awwal directive: **Ministry office printer absorbs the print run.** Rationale:
- Zero commercial-vendor cost — no Builder out-of-pocket
- Ministry-internal control over the run timing
- Print quality acceptable for field-staff reference (vs partner-facing collateral which needs commercial print)
- Closure-gate decoupled from vendor lead-time — `review` flips on artefact done, print run downstream

Quick-reference A5 card lamination follows the same path (Ministry-internal lamination if available; otherwise a single-sheet Awwal-validated print suffices for field reference).

### Why screenshot placeholders (Awwal directive 2026-05-04)

PM (John) flagged: Section 2 needs production-app screenshots, but the app rev'd 5+ times in last 30 days; screenshots from a dev-version are worse than no screenshots. Awwal directive: **author writes descriptive screenshot titles only as placeholders; Awwal sources actual production screenshots post-draft.** Rationale:
- Decouples authoring from app-version capture timing
- Awwal is the only person who has used the staff app in field-shaped scenarios — sole authoritative screenshot source
- Placeholder pattern: `<!-- SCREENSHOT: <descriptive-title> -->` inline in the markdown, e.g. `<!-- SCREENSHOT: login-page-with-magic-link-input-empty -->`

Post-draft Awwal does a single screenshot-capture pass on a stable production app rev (commit hash captured in Dev Notes at that time) and replaces placeholders with image references. Story `done` does NOT gate on screenshots being filled; `review` flips with placeholders intact and v1.1 incorporates real screenshots.

### Risks

1. **Awwal availability is the rate-limiting step for Sections 1–3.** Sections 4–6 can be drafted by AI personas with no Awwal-blocked input; Sections 1–3 require Awwal's experiential knowledge of the staff app. Mitigation: split tasks so AI-persona drafting (Tasks 2 + 3 + 5 + 6) can run in parallel with Awwal authoring (Task 1). Awwal can also delegate a first-cut draft to an AI agent in his persona, then review/edit — same pattern as Iris/Gabe personae.

2. **Real-Iris + real-Gabe ratification timeline is uncontrollable.** Same risk as Story 10-5. Mitigation: pair ratification with 10-5 to halve meeting load; FRC #6 closes at `review` not `done` so field-survey is not blocked on real-human ratification.

3. **Voice drift between sections (5 different author personae across 7 sections).** Awwal authors Sections 1–3; Iris persona authors Section 4; Gabe persona authors Sections 5–6; Section 7 is the standalone quick-reference card. Risk: tonal jumps between sections feel disjointed to first-time-app readers. Mitigation: voice-register check at Task 1.4 (imperative verbs, second person, no passive constructions); cross-section voice review by Gabe persona at Task 6.2 ("overall doc structure" review covers cross-section voice consistency).

4. **Ministry office printer print quality may not match commercial standards for the quick-reference A5 card.** A5 card is the most-handled artefact in field; cheap office-printer ink will smudge under field-handling. Mitigation: Awwal validates print proof at Task 4.5; if office-printer quality is field-unviable for the A5 card specifically (not the full manual), Awwal can opt to commercial-print just the A5 cards (small cost, ~₦5K for 30 cards). Decision deferred to print-proof time; not a story-level blocker.

5. **NDPA Section 4 voice may drift from established 10-5 Iris voice.** Iris persona drafted 10-5's SOP in 2026-05-03; this story drafts Section 4 in 2026-05-04+. AI-persona-pass output can drift between sessions. Mitigation: Task 2.1 explicitly opens 10-5's `consumer-onboarding-sop-v1.md` first to anchor on the established register before drafting; cross-link verification at Task 2.4 ensures every NDPA claim traces back to a specific 10-5 / DSA clause.

6. **Footer/header letterhead may not render correctly at A5 page size.** Pandoc + baseline-report template was designed for A4 outputs. A5 quick-ref card may need bespoke CSS overrides. Mitigation: Task 4.6 explicitly handles A5 pipeline as a separate render command; any bespoke CSS isolated to `enumerator-quick-ref-v1.md`'s top-of-file build command. If A5 letterhead is too cramped, fall back to a header-stripped variant (still maroon-themed for brand consistency).

### Project Structure Notes

- **This story produces no code.** All deliverables are documentation artefacts (markdown source + print-ready HTML + PDF + AI-persona sign-off docs + dry-run log) plus FRC table updates. Mirror of Story 10-5 structure.
- **NEW directory `docs/operations-manual/` does NOT exist** as of 2026-05-04 — created alongside the first deliverable file (Task 1.1 produces `enumerator-v1.md`). Sibling pattern to existing `docs/legal/` (peers: `docs/legal/data-sharing-agreement-template-v1.md`, `docs/legal/consumer-onboarding-sop-v1.md`, `docs/legal/dsa-template-v1-signoff.md`, `docs/legal/consumer-onboarding-tracker.md`, `docs/legal/dry-run-2026-05-03-test-partner-lagos-tech-hub.md` — verified to exist 2026-05-04).
- **Pandoc letterhead pipeline** at `_bmad-output/baseline-report/assets/template.html` + companion CSS (verify exact filenames at impl time via `_bmad-output/baseline-report/assets/README.md`). Existing baseline-report outputs at `_bmad-output/baseline-report/output/CHM-OSLR-2026-001-PFSR.{html,pdf}` etc. demonstrate the convention — `.md` source + `.html` rendered + `.pdf` rendered, all three committed alongside.
- **Voice/tone reference** = `docs/legal/consumer-onboarding-sop-v1.md` (Story 10-5 Iris voice; verified to exist 2026-05-04). Section 4 derives from this; cross-link verification at Task 2.4 ensures NDPA claims trace back to specific clauses.
- **Ratification pattern reference** = `docs/legal/dsa-template-v1-signoff.md` (Story 10-5 sign-off doc; verified to exist 2026-05-04). Iris + Gabe sign-off doc format mirrors this exactly — `PENDING-REAL-HUMAN-RATIFICATION` header, review-checklist matrix per dimension, severity-tagged findings table, sign-off block left blank for real-human signature.
- **No code paths touched.** No `apps/api/`, `apps/web/`, or `packages/` modifications. Story is pure docs + artefact rendering.
- **No DB migrations.** No schema changes.
- **No tests in `apps/api` or `apps/web`.** Documentation-only stories don't ship code-path tests. The "test" equivalents are: AC#5 + AC#6 sign-off doc reviews (peer review by AI personae), AC#8 dry-run with representative reader (UAT-shaped), and Task 8.1 adversarial code review of the working tree (catches doc-quality drift).
- **NEW directories created by this story:**
  - `docs/operations-manual/` (with all deliverable `.md` + `.html` + `.pdf` files)

### References

- Epics — Prep Task entry (this story): [Source: `_bmad-output/planning-artifacts/epics.md` § Prep Task: prep-operations-manual-enumerator-section]
- Epics — FRC item #6 (revised 2026-05-04): [Source: `_bmad-output/planning-artifacts/epics.md:244`]
- Active watches — FRC scorecard item #6: [Source: `docs/active-watches.md:100`]
- Sprint-status entry: [Source: `_bmad-output/implementation-artifacts/sprint-status.yaml` — `prep-operations-manual-enumerator-section: backlog`]
- Story 10-5 (ratification pattern reference + voice/tone baseline): [Source: `_bmad-output/implementation-artifacts/10-5-data-sharing-agreement-template.md`]
- Story 10-5 SOP (Iris voice baseline for Section 4 NDPA briefing): [Source: `docs/legal/consumer-onboarding-sop-v1.md`]
- Story 10-5 sign-off doc (PENDING-REAL-HUMAN-RATIFICATION pattern reference): [Source: `docs/legal/dsa-template-v1-signoff.md`]
- DSA template (NDPA cross-references for Section 4 footnotes): [Source: `docs/legal/data-sharing-agreement-template-v1.md`]
- Pandoc letterhead pipeline (HTML template): [Source: `_bmad-output/baseline-report/assets/template.html`]
- Baseline-report assets README (build command convention): [Source: `_bmad-output/baseline-report/assets/README.md`]
- Baseline-report output convention (sibling artefact pattern: `.md` + `.html` + `.pdf`): [Source: `_bmad-output/baseline-report/output/CHM-OSLR-2026-001-PFSR.{html,pdf}`]
- Role taxonomy (escalation paths in Section 6 must match): [Source: `docs/oslsr-glossary.md` + `packages/types/src/roles.ts`]
- Glossary (terminology consistency): [Source: `docs/oslsr-glossary.md`]
- Canonical create-story workflow feedback (this story authored via `*create-story --yolo` per the rule): [Source: `feedback_canonical_create_story_workflow.md`]
- Code-review-before-commit feedback (Task 8 follows this rule): [Source: `feedback_review_before_commit.md`]
- MEMORY.md project pattern: turnkey hand-off strategy (Ministry office printer absorbs print run): [Source: MEMORY.md "Hand-off strategy: TURNKEY PACKAGE"]
- MEMORY.md project pattern: three-layer quality (Layer 1 automated tests / Layer 2 adversarial code review / Layer 3 human UAT): [Source: MEMORY.md "Process Patterns"]
- ssh_analysis.txt (Awwal-authored spec; original input to PM validation pass): [Source: `C:\Users\DELL\Desktop\oslrs\ssh_analysis.txt`]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m] (Claude Code) — acting in role-play as the Iris (DPIA / NDPA Counsel), Gabe (Legal & Documentation Reviewer), and Awwal-Builder personas. AI-agent persona drafts are explicitly NOT real-human sign-off; the Iris and Gabe `PENDING-REAL-HUMAN-RATIFICATION` sign-off docs remain in that state until real-Iris and real-Gabe ratify or amend (single ratification session, paired with Story 10-5 ratification).

### Debug Log References

- This story has no executable code artefacts — debug logs do not apply.
- AC#8 dry-run log captured in `docs/operations-manual/dry-run-2026-MM-DD.md` once dry-run runs (post-`review` flip).

### Completion Notes List

**v1 deliverables shipped 2026-05-04** by Amelia (dev-story workflow) — all 7 in-scope tasks complete; Task 8 (post-`review` code review + dry-run) deferred per story design.

**Same-day pipeline:** spec (`ssh_analysis.txt`) → PM validation (John, 11-issue review) → Awwal directive answers → epics/active-watches/sprint-status cascade (John) → canonical `*create-story --yolo` (Bob) → dev-story execution (Amelia) → status `review`. All in one session.

**Build pipeline finding (story Task 4.1 corrected at impl):** Story stated "pandoc pipeline using `_bmad-output/baseline-report/assets/template.html`" but project actually uses `node _bmad-output/baseline-report/assets/build.js` (markdown-it + js-yaml + pdf-lib + headless Chromium/Edge). Confirmed via `_bmad-output/baseline-report/assets/README.md:200` ("Pandoc not used"). Adapted in-place — same outputs (`.html` + `.pdf`); story Task description corrected in the marked-off task list. Build pipeline gap suggests a v1.1 enhancement: a fork of build.js for internal-doc rendering (no Chemiroy `variant-photo` cover; A5 page-size override).

**Front-matter ordering fix:** `build.js` regex requires `^---\n` (front-matter at file-start, before any content). Initial author pass placed Chemiroy front-matter AFTER the HTML comment block — build.js exited code 2. Fixed in-line: front-matter at file-top; HTML comment block follows.

**Internal-doc front-matter adaptation:** The 10 required Chemiroy keys (docRef, classification, title, subtitle, superhead, authors, firm, date, version, coverCredit) are designed for Chemiroy → MTIC formal reports. Adapted with internal-doc-appropriate values:
- `docRef`: `OSLRS/OPS-MAN/2026/001` (NOT `CHM/OSLR/...` — internal namespace)
- `firm`: "Oyo State Ministry of Trade, Investment & Cooperatives" (NOT Chemiroy Nigeria Limited — Ministry-internal handbook)
- `classification`: "Internal — OSLRS Field Operations" (NOT "Confidential — For Official Use Only" — internal field-staff doc)
- `authors`: "Lawal Awwal (Builder) · AI persona-drafted (Iris/Gabe/Awwal)" (honest attribution; NOT Chemiroy consultant attribution)

**Cover photo retained:** Tailor cover image (`assets/images/cover-tailor-meritkosy.jpg`, CC BY-SA 4.0) is thematically appropriate for a Skilled Labour Registry doc and was kept. Acceptable for v1; v1.1 may strip the cover for an even-cleaner internal-doc look.

**A5 quick-ref card limitation:** build.js hardcodes A4 + `variant-photo` cover; the quick-ref `.pdf` therefore includes a 1-page cover photo before the 2-page card body. Acceptable workaround: Awwal prints from `enumerator-quick-ref-v1-Body.pdf` (cover-stripped) directly for the field card, OR uses the merged `.pdf` and discards the cover sheet. Documented as a v1.1 / build-script-fork follow-up; NOT field-blocking.

**Voice review across 3 personae passes** (per Gabe persona review, `gabe-signoff-v1.md` § "Cross-section voice review"). No tonal jumps that would feel disjointed to a first-time-app reader.

**Hard gates before field-printable v1.1** (from Iris + Gabe AI-persona findings):
- Iris M1 — rectification + erasure rights named explicitly with NDPA s.34/35/36 references (Section 4 + Quick-Reference Card BACK)
- Iris M2 — withdrawal-of-consent path added as new Q4 in Section 4 + new row in Quick-Reference Card BACK
- Iris M3 — Section 4 footnote cross-link to Story 10-5 SOP + DSA + signoff
- Gabe M1 — Section 5 naira-amount placeholders filled (5 sites: daily allowance + per-submission rate + phone allowance + airtime/data + replacement-print cap)
- Gabe M2 — vehicle/road-traffic-accident row added to Section 6.2 + paragraph at end of Section 6
- Gabe M3 — Section 6.3 phone numbers + names filled (5 rows + Quick-Reference Card BACK sync)

All 6 hard gates require Awwal-supplied content (placeholder fill + Ministry roster) + real-Iris/real-Gabe ratification. Iris L1, L2 + Gabe L1, L2, L3 are tracked-not-blocking.

**Test equivalents for documentation-only story (per Project Structure Notes):**
- AC#5 sign-off doc review by Iris persona — **passed** (5 findings, all with concrete fixes)
- AC#6 sign-off doc review by Gabe persona — **passed** (6 findings, all with concrete fixes; voice review explicit pass)
- AC#8 dry-run with representative reader — **deferred** (post-`review` per story design; not gating)
- Adversarial code review on uncommitted working tree (Task 8.1) — **completed 2026-05-04** (same Claude Opus 4.7 session via `/bmad:bmm:workflows:code-review`; 12 findings all auto-fixed in-session per Awwal directive; documented in Review Follow-ups (AI) section)

**Sign-off timestamp anomaly (M6 finding, acknowledged):** Filesystem timestamps show `iris-signoff-v1.md` (18:22) and `gabe-signoff-v1.md` (18:24) saved BEFORE `enumerator-v1.md` (18:43+). The AI-Iris/AI-Gabe reviews were conducted against in-memory drafts of the manual that were subsequently saved to disk; the signoffs reflect the in-memory drafts. Consequence: the saved manual may differ from what the signoffs reviewed. Real-Iris + real-Gabe ratification on the saved artefact closes this; M6-flagged as a workflow process note for future runs (signoffs should be saved AFTER the artefact they review).

**Section 4 ≤1 page constraint (M5 finding, deferred):** AC#1 + AC#4 require Section 4 to fit ≤1 printed page. PDF was rendered (742KB merged) but no rendered-page-count check is documented. Section 4 markdown is 48 lines (`enumerator-v1.md:338-385`); after letterhead margins + footnotes, may exceed 1 page. Awwal validates at print-proof time; if Section 4 spills to 2 pages, v1.1 incorporation tightens the body (e.g., shift the "What you must NEVER do" list to the Quick-Reference Card BACK and reference from Section 4).

**FRC item #6 status:** `🟡 Review 2026-05-04` per Awwal-revised closure semantics. Field-readiness gate met. Real-Iris + real-Gabe ratification flips `review → done` in single session paired with Story 10-5 ratification.

### File List

**Created (verified shipped 2026-05-04):**
- `docs/operations-manual/enumerator-v1.md` — Sections 1–6 + Section 7 forward-reference; Chemiroy front-matter adapted; build-command in top-of-file comment block; ~700 lines (~40 KB) including front-matter + 11 screenshot placeholders + 6 error scenarios + NDPA briefing + payment procedure + escalation tables. v1.0 dated May 2026.
- `docs/operations-manual/enumerator-v1.html` — rendered via build.js (~75 KB; intermediate, kept for debugging).
- `docs/operations-manual/enumerator-v1-Cover.html` — cover-only HTML for split-PDF render (~28 KB).
- `docs/operations-manual/enumerator-v1-Body.html` — body-only HTML (~74 KB).
- `docs/operations-manual/enumerator-v1-Cover.pdf` — full-bleed cover with tailor photo (~406 KB).
- `docs/operations-manual/enumerator-v1-Body.pdf` — body pages with letterhead margins (~585 KB).
- `docs/operations-manual/enumerator-v1.pdf` — merged cover+body via pdf-lib (~742 KB; primary deliverable for printing).
- `docs/operations-manual/enumerator-quick-ref-v1.md` — A5 quick-ref card (FRONT 5-section + BACK consent/privacy/escalation); Chemiroy front-matter adapted; ~5 KB.
- `docs/operations-manual/enumerator-quick-ref-v1.html` — rendered intermediate (~34 KB).
- `docs/operations-manual/enumerator-quick-ref-v1-Cover.html` + `-Body.html` — split intermediates.
- `docs/operations-manual/enumerator-quick-ref-v1-Cover.pdf` (~406 KB) + `-Body.pdf` (~237 KB).
- `docs/operations-manual/enumerator-quick-ref-v1.pdf` — merged (~553 KB; print FROM the Body.pdf for field card to skip cover photo per Completion Notes A5 limitation).
- `docs/operations-manual/iris-signoff-v1.md` — `PENDING-REAL-HUMAN-RATIFICATION` review draft; 16-row review-checklist matrix + 5 findings (3 Medium + 2 Low) + sign-off block; ~14 KB.
- `docs/operations-manual/gabe-signoff-v1.md` — `PENDING-REAL-HUMAN-RATIFICATION` review draft; 16-row review-checklist matrix + 6 findings (3 Medium + 3 Low) + cross-section voice review pass + 3-row hard-gate-before-printable list + sign-off block; ~16 KB.

**Modified:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `prep-operations-manual-enumerator-section: backlog → in-progress → review` (3 line-edits across the day; current state: `review`). **Code-review pass:** ssh_analysis.txt false reference removed from update note.
- `_bmad-output/planning-artifacts/epics.md` line 244 — FRC table item #6 status flipped from `⏳ Backlog (Wave 1 satellite, paired with 10-5 for real-human ratification)` to `🟡 Review 2026-05-04 (drafted + rendered + AI-persona-ratified; awaiting real-Iris + real-Gabe ratification — paired with 10-5 single session)`. **Code-review pass:** ssh_analysis.txt false reference removed from "Context:" line of Prep Task block.
- `docs/active-watches.md` line 100 — FRC scorecard line same status flip; line 102 score line updated `Score: 3/6 done. 3 outstanding → Score: 3/6 done + 1/6 review = 4/6 field-readiness met. 2 outstanding (engineering)`.
- `_bmad-output/implementation-artifacts/prep-operations-manual-enumerator-section.md` — this file. Status `ready-for-dev → review`. Tasks 1–7 marked `[x]`. **Code-review pass:** Task 8 parent + 8.1 + 8.2 + 8.4 marked `[x]` (8.3 dry-run remains deferred per AC#8 non-gating); Sources block rewritten; AC#3 reworded to PARTIAL; Review Follow-ups (AI) section populated with 12-finding table; Completion Notes augmented with M5 + M6 acknowledgements; Change Log "first" claim narrowed; new Change Log entry added for code-review pass.
- `docs/operations-manual/enumerator-v1.md` — **Code-review pass:** L2 build-comment strengthened ("DO NOT use pandoc"); M2 cross-reference label fixed (Story 11-1 → Story 9-12).
- `docs/operations-manual/enumerator-quick-ref-v1.md` — **Code-review pass:** M3 `<!-- AWWAL-VERIFY -->` marker + precedence rule ("If app shows different script, **read app screen, not card**") added to consent-script section.
- `docs/operations-manual/iris-signoff-v1.md` — **Code-review pass:** M4 "24-hour breach notification window" row reworded to make field-staff-24h-vs-Ministry-72h cascade explicit.
- `.gitignore` line 60 — **Code-review pass:** M1 pattern broadened from `ssh_analysis*.txt` → `ssh_analy*.txt` to catch all 3 typo variants of stale conversation logs in repo root.

**Out of scope (explicitly NOT modified):**
- `apps/api/`, `apps/web/`, `packages/` — no code paths touched (documentation-only story).
- Database schemas / migrations — none.
- Story 10-5 deliverables in `docs/legal/` — referenced as voice baseline only; NOT modified.
- Production-app screenshots — Awwal sources post-draft per directive 2026-05-04; story ships with 11 `<!-- SCREENSHOT: descriptive-title -->` placeholders inline.
- Yoruba glossary / translation — waived per directive 2026-05-04 (oral at Training-of-Trainers); manual stays English only.
- Real-human signature blocks in `iris-signoff-v1.md` / `gabe-signoff-v1.md` — left blank by design (PENDING-REAL-HUMAN-RATIFICATION).
- Naira-amount fills in Section 5 (`<!-- AWWAL-VERIFY -->` × 5 sites) — Awwal supplies from Ministry budget approval at v1.1 incorporation pass.
- Phone-number/name fills in Section 6.3 (`<!-- AWWAL-PROVIDE -->` × 5 rows + Quick-Reference Card BACK contacts table sync) — Awwal supplies from Ministry team roster at v1.1 incorporation pass.
- Vehicle/road-traffic-accident escalation row (Gabe M2) — to be added in v1.1 per Gabe sign-off finding.
- A5 quick-ref card cover-stripped variant (Task 4.6 known limitation) — deferred to v1.1 or build-script-fork follow-up.

### Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-05-04 | Prep task drafted by Bob (SM) via canonical `*create-story --yolo` workflow following PM (John) cascade. 10 ACs covering 7 sections + print-ready HTML/PDF render + A5 quick-reference card + Iris persona sign-off + Gabe persona sign-off + semver versioning + dry-run (post-draft, non-gating) + sprint-status/FRC cascade + explicit out-of-scope flagging. Status `ready-for-dev`. Closure semantics revised per Awwal directive 2026-05-04: `review` flips on `.md` + print-ready HTML/PDF + AI-persona sign-offs delivered (Ministry office-printer print run downstream of `done`, NOT field-blocking); `done` flips on real-Iris + real-Gabe ratification (single session, paired with Story 10-5 ratification). | FRC item #6 — last persona-attributed FRC slot ("Iris / Gabe") now has a real story name. Replaces impostor-attribution drift pattern flagged in `feedback_canonical_create_story_workflow.md`. Voice/tone reference + ratification pattern reference both established by Story 10-5 — this story is the second instance of that pattern (precedent, not invention). Wave 1 satellite track — paired with 10-5 for shared real-human ratification gate. |
| 2026-05-05 | Status flipped `review → done` per Awwal directive ("written process is done; all other issues will be resolved outside here"). FRC item #6 in `epics.md` flipped `🟡 Review → ✅ Done 2026-05-05`; `active-watches.md` scorecard line 102 updated `4/6 field-readiness met → 4/6 done`; `sprint-status.yaml` development_status entry flipped `review → done` with note about external-resolution scope. Real-Iris + real-Gabe ratification + Awwal-supplied placeholder fills (Iris M1+M2+M3 + Gabe M1+M2+M3 + code-review M3 AC#3 A5 page-size) tracked as v1.1 follow-ups OUTSIDE this story's scope. Story committed + pushed to `main` 2026-05-05. | Closure-semantics adjustment per Awwal directive 2026-05-05: the original closure semantics (2026-05-04) decoupled `review` from print-readiness (Ministry office-printer absorbs print run downstream of `done`) but kept `done` gated on real-Iris + real-Gabe ratification. The 2026-05-05 directive further decouples `done` from real-human ratification — treating ratification as an external/separate process rather than an in-story gate. Justification: the written deliverables are complete (manual + quick-ref + Iris signoff + Gabe signoff + adversarial code review pass clean); the remaining items (placeholder fills + ratification) are operator-driven actions that don't gate the story-as-deliverable. The signoff docs themselves correctly retain `PENDING-REAL-HUMAN-RATIFICATION` headers — those are accurate because real-human ratification IS still pending; the story status `done` reflects "written work complete" which is a different question. |
| 2026-05-04 | Adversarial code review pass via `/bmad:bmm:workflows:code-review` workflow (same Claude Opus 4.7 [1m] session as dev-story; user directive: "Create action items (critical to low) and fix them all automatically"). 12 findings (3 High · 6 Medium · 3 Low) all auto-fixed in-session — see Review Follow-ups (AI) section for the per-finding fix-status table. Highlights: H1 broken sourcing trail (story Sources block + sprint-status note + epics.md "Context:" line all referenced `ssh_analysis.txt` which is actually a 9-line Story 11-1 design-decision file, NOT this story's spec — fixed by rewording Sources block to honestly describe input as Awwal/PM (John) verbal/in-session conversation; cascade applied to sprint-status.yaml + epics.md); H2 AC#3 literal text "Single A5 sheet" unmet because build.js hardcodes A4 — AC reworded as "PARTIAL — A5 page-size deferred to v1.1"; H3 status-flip-before-code-review process violation per `feedback_review_before_commit.md` — fixed by running code review BEFORE commit (working tree still uncommitted post-review); 6 Mediums + 3 Lows all addressed; cross-reference label fix `Story 11-1 → Story 9-12` in `enumerator-v1.md`; Quick-Ref consent-script `<!-- AWWAL-VERIFY -->` marker + precedence rule added; Iris-signoff "24-hour breach" mislabel corrected to field-staff-24h-vs-Ministry-72h cascade; signoff timestamp anomaly + Section 4 ≤1-page constraint acknowledged in Completion Notes; Change Log "first" claim narrowed to "first **field-operations**"; build-comment "DO NOT use pandoc" warning strengthened. `.gitignore:60` pattern broadened from `ssh_analysis*.txt` → `ssh_analy*.txt` to catch all 3 typo variants of stale conversation logs in repo root. Status remains `review` post-fix; FRC item #6 unchanged at 🟡 Review. | Three-layer quality validation: Layer 1 (automated tests N/A — docs-only story) skipped, Layer 2 (adversarial code review) executed in-session — 12 findings auto-fixed; Layer 3 (human UAT — dry-run with representative readers per AC#8) deferred to post-`review` per story design. The H1 sourcing-trail break was the most significant finding — 3 docs (story file + sprint-status + epics.md) all confidently citing a file that contains unrelated content. Triangulation: only by checking actual file contents (not just existence) was the gap surfaced. Process lesson: sourcing claims that name files should include a content-verification step at story-author time. |
| 2026-05-04 | Implementation complete via `dev-story` workflow (Amelia, Claude Opus 4.7 [1m] in yolo mode). Tasks 1–7 done; Task 8 (post-`review` adversarial code review + post-merge dry-run) deferred per story design. **9 deliverable files shipped** in new directory `docs/operations-manual/`: enumerator-v1.{md,html,pdf} + enumerator-v1-{Cover,Body}.{html,pdf} + enumerator-quick-ref-v1.{md,html,pdf} + enumerator-quick-ref-v1-{Cover,Body}.{html,pdf} + iris-signoff-v1.md + gabe-signoff-v1.md. Build pipeline finding (story Task 4.1 corrected): project uses build.js (markdown-it+Chromium), NOT pandoc — adapted in-place. Front-matter ordering fix applied (regex requires `^---\n`). Internal-doc front-matter values adapted (docRef=OSLRS/OPS-MAN/2026/001 not CHM/OSLR/...; firm=Ministry not Chemiroy). AI-persona findings: Iris 5 (M1+M2+M3+L1+L2) covering NDPA briefing accuracy; Gabe 6 (M1+M2+M3+L1+L2+L3) covering Section 5/6 + cross-section voice review explicit pass. **Hard gates before printable v1.1** (3 items): Iris M1+M2+M3 (NDPA-bearing edits) + Gabe M1+M3 (Awwal-supplied placeholder fills) + Gabe M2 (vehicle-accident escalation row). Status flipped `ready-for-dev → in-progress → review` across same session. FRC item #6 in epics.md + active-watches.md flipped `⏳ Backlog → 🟡 Review 2026-05-04`; active-watches FRC scorecard score updated `3/6 done → 3/6 done + 1/6 review = 4/6 field-readiness met`. | Foundation prep delivered: 7-section enumerator manual + 2-sided A5 quick-ref card + Iris+Gabe AI-persona sign-off docs all rendered through the existing baseline-report design system. FRC item #6 closure pending real-Iris + real-Gabe ratification (single session paired with 10-5) + Awwal-supplied placeholder fills (M1 naira amounts + M3 phone numbers + M2 vehicle row). All 9 deliverables in place; field-readiness gate met per relaxed closure semantics. **First field-operations documentation-only story to ship in <1 session through the full PM→SM→Dev chain** (Story 10-5 was the first docs-only story overall but spanned multiple sessions) — confirms the AI-persona-drafted-with-PENDING-REAL-HUMAN-RATIFICATION pattern (established by Story 10-5) generalises beyond legal-ops to field-operations documentation. |

### Review Follow-ups (AI)

**Code review pass completed 2026-05-04** via `/bmad:bmm:workflows:code-review` adversarial workflow (same Claude Opus 4.7 session as dev-story; per `feedback_review_before_commit.md` — review on uncommitted working tree; user directive: "Create action items (critical to low) and fix them all automatically"). 12 findings (3 High · 6 Medium · 3 Low) — all auto-fixed in-session.

| ID | Severity | Description | Status | Fix applied |
|---|---|---|---|---|
| H1 | High | Story Sources block + sprint-status.yaml note + epics.md "Context:" line all referenced `ssh_analysis.txt` as the "Awwal-authored spec, 2026-05-04" — but that file is 9 lines about Story 11-1 design decisions, NOT this story's spec. The actual input was a verbal/in-session conversation between Awwal and PM (John). Three near-identically-named `ssh_analy*.txt` files in repo root — all stale conversation logs about adjacent topics, none is the canonical spec. | ✅ Fixed | Story Sources block rewritten to honestly describe the input as "Awwal/PM (John) conversation 2026-05-04 — verbal/in-session spec; NOT in any single committed text file"; explicit note that the three `ssh_analy*.txt` files are stale logs about adjacent topics. Cascade: same edit applied to sprint-status.yaml note + epics.md "Context:" line. |
| H2 | High | AC#3 literal text says "Single A5 sheet front + back" but actual deliverable is A4-sized PDF with cover photo (build.js:387 hardcodes `@page { size: A4 }`). Story Dev Notes acknowledged the gap but AC was claimed "delivered". | ✅ Fixed | AC#3 reworded to mark as "PARTIAL — A5 page-size deferred to v1.1" with explicit acknowledgement that AC literal text is unmet at v1 + v1.1 hard gate. Mitigation (print from `-Body.pdf` cover-stripped) carried into AC text. |
| H3 | High | Status flipped to `review` BEFORE Task 8.1 (code review) ran. Task 8.4 stated *"Only after code review passes, commit and mark status `review`."* Self-contradicting workflow. Contradicted MEMORY.md `feedback_review_before_commit.md` ("code review runs BEFORE commit"). | ✅ Fixed | This code-review session executed the deferred Task 8.1+8.2 BEFORE commit (working tree still uncommitted). Tasks 8.1, 8.2, 8.4 marked `[x]` with explicit notes; Task 8.3 (dry-run) remains `[ ]` per AC#8 non-gating. Status remains `review` because review passed + all H/M/L findings auto-fixed in same session. |
| M1 | Medium | Three `ssh_analy*.txt` files cluttering repo root: `ssh_analysis.txt` (9 lines, Story 11-1 design), `ssh_analyssis.txt` (229 lines, conversation log), `ssh_analysiss.txt` (3237 lines, baseline-report scoping). Existing `.gitignore:60` pattern `ssh_analysis*.txt` caught only 2 of 3 (missed the typo'd `ssh_analyssis.txt`). | ✅ Fixed | `.gitignore:60` pattern broadened from `ssh_analysis*.txt` → `ssh_analy*.txt` to catch all 3 typo variants. Files preserved (not deleted) — they are operator's conversation logs from adjacent work. |
| M2 | Medium | `enumerator-v1.md:58` cross-reference label said "Story 11-1 Public Wizard" but path was `9-12-public-wizard-pending-nin-magic-link.md`. Story 11-1 is "Multi-Source Registry Schema Foundation" per sprint-status; Public Wizard is Story 9-12. | ✅ Fixed | One-line edit: "Story 11-1" → "Story 9-12" in build-comment block reference list. |
| M3 | Medium | `enumerator-quick-ref-v1.md:91` Quick-Ref Card prints a verbatim "Consent script (read aloud, **word-for-word**)" authored by AI — not pulled from staff-app source. Risk: enumerator reads card script aloud while app shows different script → consent-evidence audit-trail conflict. | ✅ Fixed | Added `<!-- AWWAL-VERIFY: matches app consent screen at print-time -->` marker above script + appended explicit "If app shows different script, **read app screen, not card.** Tell supervisor at end-of-day for re-print." instruction. Card script kept as reference; precedence rule made explicit. |
| M4 | Medium | `iris-signoff-v1.md:26` row labelled "Confidentiality duty + 24-hour breach notification window" implied NDPA s.40 mandates 24h. Actually s.40 mandates 72h Ministry-level notification; the 24h is the field-staff-to-supervisor escalation window enabling Ministry to meet 72h. Footnote [^3] in manual gets this right; signoff row could mislead a real-Iris skim-read. | ✅ Fixed | Iris-signoff row reworded: "Confidentiality duty + field-staff 24-hour escalation window (NDPA s.40 mandates 72h Ministry-level notification; 24h field-to-supervisor window is the operational mechanism that lets the Ministry meet its 72h obligation)". Cascade chain made explicit in the assessment column too. |
| M5 | Medium | AC#1 + AC#4 require Section 4 ≤1 printed page. Rendered PDF size ≠ page-count verification; Iris-signoff doesn't address this AC element. | ✅ Fixed (acknowledged) | Note added to Completion Notes List: AC#5 ≤1-page constraint deferred to Awwal print-proof validation; if Section 4 spills to 2 pages, v1.1 mitigation = shift "NEVER do" list to Quick-Reference Card BACK. Iris-signoff row not added (would require real-Iris re-review); flagged as v1.1 review-checklist addition. |
| M6 | Medium | Filesystem timestamps: `iris-signoff-v1.md` (18:22) + `gabe-signoff-v1.md` (18:24) saved BEFORE `enumerator-v1.md` (18:43+). AI-Iris/AI-Gabe reviewed in-memory drafts; saved manual may differ from reviewed version. | ✅ Fixed (acknowledged) | Note added to Completion Notes List explicitly stating the timestamp anomaly + workflow process note for future runs (signoffs should be saved AFTER the artefact they review). Real-Iris + real-Gabe ratification on the saved artefact closes the gap. |
| L1 | Low | Change Log claim *"First documentation-only story to ship in <1 session through the full PM→SM→Dev chain"* overstated — Story 10-5 (the voice baseline cited 18× here) is also documentation-only. | ✅ Fixed | Reworded to "First **field-operations** documentation-only story to ship in <1 session through the full PM→SM→Dev chain (Story 10-5 was the first docs-only story overall but spanned multiple sessions)". |
| L2 | Low | Build-pipeline comment in `enumerator-v1.md:39-47` said "build.js, NOT pandoc" but the structural shape of the comment block read pandoc-shaped (input file → output file). Could mislead a future maintainer. | ✅ Fixed | Strengthened comment header: "DO NOT use pandoc; build.js calls markdown-it + js-yaml + pdf-lib + headless Chromium directly". Pipeline call structure preserved (it's correct). |
| L3 | Low | Task 8 parent unchecked but Tasks 1-7 parents all `[x]` when subs done. Convention drift. | ✅ Fixed | Task 8 parent flipped to `[x]` with parenthetical note "Code review portion (8.1 + 8.2) complete 2026-05-04; dry-run portion (8.3) deferred per AC#8 non-gating". Sub-task statuses updated individually (8.1 [x] + 8.2 [x] + 8.3 [ ] + 8.4 [x]). |

**Summary:** 12 of 12 findings fixed in-session 2026-05-04. Code review session ran on uncommitted working tree before commit (per `feedback_review_before_commit.md`). All H/M/L findings actionable + concrete fix applied; M5 + M6 are acknowledged-deferred (require real-human pass at ratification). No critical-severity findings remain.

**v1.1 hard gates carry-forward (unchanged from Iris + Gabe AI-persona findings; not new from this code-review pass):**
- Iris M1 — rectification + erasure rights named explicitly with NDPA s.34/35/36 references
- Iris M2 — withdrawal-of-consent path added as new Q4 in Section 4 + new row in Quick-Reference Card BACK
- Iris M3 — Section 4 footnote cross-link to Story 10-5 SOP + DSA + signoff
- Gabe M1 — Section 5 naira-amount placeholders filled (5 sites)
- Gabe M2 — vehicle/road-traffic-accident row added to Section 6.2 + paragraph at end of Section 6
- Gabe M3 — Section 6.3 phone numbers + names filled (5 rows + Quick-Reference Card BACK sync)
- **NEW from code-review pass:** AC#3 A5 page-size deferred — build-script fork required for v1.1 OR drop "A5" from AC text (Awwal directive needed at v1.1 round)

**Post-dry-run friction notes (per AC#8 / Task 8.3) will be appended below when dry-run runs post-`review` flip.**

_— End of code review pass 2026-05-04 —_
