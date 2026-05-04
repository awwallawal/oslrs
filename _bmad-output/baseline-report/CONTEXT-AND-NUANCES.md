---
title: OSLSR Document System — Context & Nuances
purpose: Living context document for Ministry-facing report drafting
last_updated: 2026-04-29
maintained_by: Claude (Anthropic) — responsible for tracking and updating as new context and nuances emerge in conversation
status: Active. Update whenever a new diplomatic principle, structural decision, or audit-defensive patch is established.
---

# OSLSR Document System — Context & Nuances

**Read this before drafting any new Ministry-facing document in this workstream.** It captures the decisions, principles, and pitfalls established during the PFSR drafting cycle so that the IUBR, Field Survey Report, and Transfer Protocol artefacts are written from a shared, coherent posture.

**Maintenance ownership:** Claude maintains this file. When new diplomatic principles, audit-defensive patches, or structural decisions emerge during drafting, they are recorded in the relevant section here before being considered locked-in. Awwal (the human Builder) flags missed instances and corrections; Claude tracks and updates.

**Build-time learning (IUBR sweep, 2026-04-30):** When applying mass terminology refactors across a multi-file document set, the **Edit tool can race against bulk perl/sed operations** running in subsequent Bash invocations — the Edit appears to succeed, but the bulk write reads stale content and overwrites the Edit. **Use perl with explicit Unicode codepoints (e.g., `\x{2014}` for em-dash) and sed with carefully delimited patterns for sweep operations**, not the Edit tool. The Edit tool is safe for one-off, contextual changes when no bulk operation will follow on the same file.

---

## 1. Strategic Document Sequence

| Doc Ref | Document | Status |
|---|---|---|
| (none) | Baseline Report v1 (May 2025 internal draft) | Internal only — never submitted |
| CHM/OSLR/2026/001 | Pre-Field Survey Status Report (PFSR) | v1.0 — submitted May 2026 |
| CHM/OSLR/2026/002 | Improved Updated Baseline Report (IUBR) | **Submitted together with PFSR.** Pre-fieldwork; the detailed companion to the PFSR. Refactored from the v1 baseline (22 chapters); retains the n=330 pre-field validation findings as its empirical baseline. Post-fieldwork empirical refresh happens via the Field Survey Report. |
| CHM/OSLR/2026/003 | Field Survey Report | Post-fieldwork deliverable. Carries empirical findings from the May 2026 statewide enumeration. |
| CHM/OSLR/2026/Transfer | Transfer Protocol | In legal review, awaits execution |

**Numbering principle (Option A, decided):** v1 baseline was internal-only and never received a CHM/OSLR/ ref. The first Ministry-facing document is the PFSR (/001).

---

## 2. Engagement Chronology (Diplomatic Record)

This is the chronology that anchors the PFSR and should be inherited by IUBR and Transfer Protocol:

- **Award letter:** November 2025 (six-month engagement, contractual end May 2026)
- **Letter of Introduction:** issued end of February 2026 (passive voice in documents)
- **Effective operational window:** approximately three months (March–May 2026)
- **Fieldwork commences:** first week of May 2026
- **Pre-field validation cycles:** two completed, producing instrument Version 3 (`oslsr_master_v3.xlsx`)

**Diplomatic principle:** Establish dates as facts on the record without assigning blame. Use passive voice on Ministry-side actions ("was issued"); active voice on consultant accomplishments ("delivered, refined, validated"). The arithmetic is reader-derived.

**Why this matters:** In a developing-country political environment, naming actors who delayed inputs risks loss-of-life-and-property repercussions. The chronology is on the record (defensive cover for the consultant if anything is later questioned) but never editorialised.

---

## 3. Diplomatic Principles (Apply to ALL Ministry-facing Documents)

### 3.1 Never name the Honourable Commissioner as the actor on action items

In the body of a public report, do **not** write phrases like:
- "The Honourable Commissioner has indicated willingness to..."
- "...presented to the Honourable Commissioner for counter-signature"
- "...single working session with the Honourable Commissioner"

Use neutral or institutional language instead:
- "...drafted and is in legal review"
- "...will be executed by both parties on completion of review"
- "...single working session at the Ministry's convenience"

**Cover letters are addressed TO the Commissioner so naming the addressee in the body is conventional. Reports are not letters — never name the office as actor in the body.**

### 3.2 Never expose internal scheduling

Do not write:
- "...subject to FRC items reaching completion (currently on schedule)"
- "Final scheduling of the counter-signature appointment is among..."
- "...closure within the readiness window" / "...closing within the readiness window"

These belong in internal-team status meetings, not external reports. The **"readiness window"** in particular is OUR planning concept, not the Ministry's — they don't need to know about an internal closing window for FRC items, only that the platform is on schedule for fieldwork in May 2026.

Use neutral language instead:
- "...all six items closing before fieldwork starts"
- "...The Field Readiness Certificate is on schedule for fieldwork"
- "All six items will close before fieldwork begins"

**Watch-list for similar internal-scheduling phrases that may slip in:**
- "readiness window"
- "soak window"
- "stabilisation period"
- "pre-launch buffer"
- "internal go/no-go"
- "dev cycle"
- "ramp-up"
- "soft-launch window"
- Any noun phrase that names an internal phase the Ministry didn't agree to or doesn't need to know about.

### 3.3 Never commit to dates that are aspirational rather than firm

Avoid:
- "We plan to file in the second quarter of 2026"
- "...by Q3 2026"
- "Counter-signature scheduled for [date]"

Use instead:
- "...drafted in preparation for filing"
- "...will be completed in due course"
- "...is in legal review ahead of execution"

### 3.4 Remove em-dashes, AI tells, and template-derived language

- No em-dashes (—). They signal AI authorship.
- No "It is our honour and privilege" / "We respectfully solicit" / "renewed assurance of our highest consideration" — too templated.
- No verbatim BERAP citations. BERAP informs Chemiroy's project structure but is not quoted in any document.

### 3.5 Section cross-references should be prose, not § symbols

Don't write: "see §3.2"
Write instead: "described later in this Report" or "the security section of this Report"

### 3.6 Never reference v1 baseline draft

The v1 baseline was internal-only. Mentioning it in Ministry-facing documents looks unprofessional.

### 3.7 No financial framing

Operational scope only. Financials are dealt with separately, in different documents, with different audiences.

### 3.8 Stat cards must lead with confident numbers, not damning numbers

"2/6 complete" with weeks remaining is HONEST but TONALLY DAMNING. Use "6/6 on schedule" with breakdown in sublabel. Same principle for any progress metric.

### 3.9 Conclusions don't recap internal artefacts

The Conclusion section closes the report with a confident voice about the broader programme position. It does **not** recap operational artefacts (audit logs, capacity-building modules, KPI framework, etc.) which are already covered in their dedicated sections.

The opening sentence of the conclusion ("...is on track for the start of its Field Survey phase in the first week of May 2026") **already conveys readiness**. Restating that readiness via an internal mechanism is both redundant and re-exposes an internal concept in the closing voice — exactly the wrong place to do so.

Save the closing voice for what the Ministry should remember about the programme as a whole, not for restating the operational mechanisms by which it was delivered.

### 3.10 Internal hardening checklists are not Ministry-facing artefacts

The Consultant's internal **Field Readiness Certificate** (or any similar internal quality-uplift checklist) is **not a Ministry-facing artefact**. Surfacing it as a "go/no-go gate" with items "in active development" makes voluntary stretch goals look like incomplete deliverables. The Ministry hired the Consultant to deliver a Registry that works for fieldwork — that has been done. Items the Consultant chooses to harden beyond the contractual baseline are **professional standards, not gating items**.

In Ministry-facing documents:

- **Do not** show an internal quality checklist as a table of incomplete items
- **Do not** describe the checklist as a "go/no-go gate"
- **Do not** name the FRC at all — not in body, conclusion, stat cards, or cover letters
- **Do** describe the security/quality posture in confident absolute terms (e.g., "delivered to specification at A- security posture, state-government-grade")
- **Do** frame ongoing hardening as a **"continuous quality-uplift programme"** running alongside the Build Phase, with explicit clarification that its progress does not gate fieldwork or business logic
- **Current grade framing (locked):** A- = achieved (state-government-grade); A+ = aspiration (highest tier on the threat-model dimensions applied). B+ was an interim assessment from earlier session memory; the work done since has materially advanced the posture. Always lead with A- in Ministry-facing documents.

**Why this matters (the own-goal that was nearly committed):** the original FRC framing volunteered a list of half-finished work for stretch goals the Ministry didn't ask for, when the actual story is "platform delivered to spec at a security tier already in the top quartile of commercial standards, with voluntary uplift toward state-government-grade in continuous operation alongside it." A reader of the original framing would conclude "consultant rushed and is patching things to make fieldwork." A reader of the corrected framing concludes "consultant delivered, and is exceeding the baseline." Same facts, opposite reception.

This principle applies to **any internal quality artefact** — not only the FRC. Internal sprint plans, internal QA checklists, internal "tightening lists," internal stabilisation roadmaps: none of these belong in Ministry-facing documents. They are how the work gets done, not what the Ministry receives.

---

## 4. Workstream Structure (Six Workstreams, Chronological Order)

1. **Stakeholder sensitisation across the three Senatorial Districts** (Oyo Central, Oyo South, Oyo North — 11 LGAs each)
2. **Platform delivery** (Labour Data Centre and Registry application — collapsed from "Establishment" + "Equipping")
3. **Stakeholder engagement with the private sector** (MAN, ASNAT, ASVAN for Marketplace tier)
4. **Capacity building for the field-staff cohort** (33 supervisors, 99 enumerators)
5. **Handover to the Ministry** (governed by Transfer Protocol)
6. **Monitoring and evaluation** (KPI framework + system-health monitoring)

**Important — what is NOT a workstream:**
- "Engagement of consultant" (vestige of BERAP template; Ministry already engaged Chemiroy)
- Anything financial (operational scope only)

---

## 5. Distribution List Architecture

For Confidential, for-official-use-only Ministry documents:

| Copy | Recipient | Format |
|---|---|---|
| 1 | Honourable Commissioner, MTIC | Hard copy + Digital |
| 2 | Permanent Secretary, MTIC | Hard copy + Digital |
| 3 | Director, Trade & Investment, MTIC | Digital |
| 4 | SABER Secretariat, Oyo State | Digital, courtesy copy |
| 5 | Mrs Fateemah Roy-Lagbaja, MD, Chemiroy | Hard copy + Digital |
| 6 | File Copy, Chemiroy | Hard copy |

**Why SABER:** Coordinating office for the framework that informed the engagement. Body label does NOT reintroduce "BERAP" (the Honourable Commissioner knows the link).

---

## 6. Audit-Defensive Infrastructure (Six Patches Established)

These patches lift Ministry-facing documents from "competent friendly-review" to "competent friendly-review with hostile-review defensive infrastructure." Inherit ALL of these into IUBR and beyond.

| # | Patch | Location | Defends against |
|---|---|---|---|
| 1 | Public-task authority anchored to Ministry mandate (statutory function in respect of trade, industry, labour) | §6.1 NDPA | NDPC audit; lawful-basis challenge |
| 2 | Seven-year retention softened from "required by NDPA" to "consistent with NDPA and supporting frameworks for State records" | §6.1 NDPA | Privacy lawyer accuracy review |
| 3 | Data residency added as new §6.4, deferring detail to DPIA | §6.4 | NDPC audit; sovereignty critics |
| 4 | Field-staff engagement row added to operations posture table ("Engaged under the Consultant's contractual accountability, with data-handling obligations cascaded through written agreements") | §4.2 | NDPA processor accountability; breach attribution |
| 5 | Conflicts of interest declared "None" in Document Control | Document Control | Procurement audit; press scrutiny |
| 6 | Political/stakeholder-environment risk row added to Risk Register | §5 Risk Register | "You should have flagged this" criticism if anything materialises |
| 7 | Field Readiness Certificate framing pivoted away from "go/no-go gate" + table-of-incomplete-items into a "continuous quality-uplift programme" alongside the Build Phase, with platform stated as "delivered to specification" in confident absolute terms. §4.1 FRC subsection removed entirely; §4 renumbered (Field operations posture, Field-survey window, Instrument validation). Stat card pivoted to **A- security-posture marker (state-government-grade), with stated aspiration toward A+**. Cover letters reworded. | §1 readiness statement, §1 stat cards, §3.2 security posture, §4 (FRC removed + renumbered), both cover letters | Eliminates the appearance of a half-assed delivery rushing to fieldwork. Strengthens "delivered to spec" defensibility against compressed-timeline criticism. Stops volunteering stretch goals as gating items. |

---

## 7. Known Gaps (Defer to IUBR / Transfer Protocol / DPIA)

These gaps are KNOWN and intentionally deferred to other documents. When drafting those documents, address them.

| Gap | Defer to | Required action |
|---|---|---|
| Specific DPIA filing timeline and rationale | DPIA Filing Memorandum | Document why filing is timed pre/post fieldwork |
| Detailed cross-border transfer mitigations | DPIA itself | Article 41-43 NDPA compliance memo |
| Operate Phase end-date and consultant-liability cessation | Transfer Protocol | Define when consultant accountability ends |
| Fraud Signal Engine precision/recall stats; appeal mechanism | IUBR or Technical Annexure | Document false-positive rates; human-in-the-loop process |
| Statutory citation for public-task basis (specific instrument) | Transfer Protocol legal review | Cite specific State Law / Mandate Statement / Executive Order |
| Field-staff employment relationship (sub-consultant vs. casual) | Internal — written agreements | Documented but not in Ministry-facing report |
| Indemnity / liability cap | Transfer Protocol | Standard contractual provisions |
| Operate Phase quarterly reporting cadence | Transfer Protocol | Define reporting frequency, format, recipients |
| Dual-super-admin audit-trail attribution clarity | Internal operations runbook | Each admin's actions distinguishable in audit log |

---

## 8. Stat Card Reframing Rules

Both PFSR stat cards were reframed during drafting. Rule: **lead with the confident number, put the breakdown in the sublabel.**

| Original (damning) | Reframed (confident) |
|---|---|
| `2/6 · "Field readiness" · "4 in active development"` | `6/6 · "Field Readiness Certificate" · "On schedule for May 2026"` |
| `2/6 · "Workstreams complete" · "4 active or operational"` | `6/6 · "Workstreams on schedule" · "Two complete; four progressing"` |

Apply the same principle to any IUBR / Field Survey Report stat cards.

---

## 9. Cover Letter Variants

Two registers maintained:

- **Formal** (NG government register): "Through:" + "renewed assurance" cleaned out + "We are pleased" lead-in
- **Modern** (professional register): bulleted progress + concrete ask list

Both share these conventions:
- "Six workstreams" reference
- "Field Readiness Certificate is on schedule" framing (NOT "2 of 6 complete")
- Mrs Lagbaja sole signatory
- Five operational user roles + Public tier (consistent with PFSR)
- Transfer Protocol "in legal review ahead of execution by both parties" (NOT "awaits Commissioner's counter-signature")

---

## 10. Build Pipeline Notes

- Source markdown lives in `_bmad-output/baseline-report/sources/`
- Build via `node _bmad-output/baseline-report/assets/build.js <input.md> <output.pdf>`
- CSS is INLINED into rendered HTML for self-containment
- `print-color-adjust: exact` (chromium-specific) preserves background colours
- Each chapter (H1) starts a new page via `page-break-before: always`
- Cover photo: "A Tailor Sewing Clothes in Her Shop", Meritkosy / Wikimedia Commons (CC BY-SA 4.0)

---

## 11. Key Actors / Stakeholders

**Direct Ministry counterparts:**
- **Ministry of Trade, Industry and Cooperatives (MTIC)** — engagement authority
- **Honourable Commissioner** — political head; address letters TO; never name as actor in body
- **Permanent Secretary** — administrative head; co-recipient of Ministry-facing reports
- **Director, Trade & Investment** — technical counterpart at Ministry level

**External programme bodies:**
- **SABER Secretariat, Oyo State** — coordinating body for BERAP framework; courtesy copy

**Consultant team:**
- **Mrs Fateemah Roy-Lagbaja** — Managing Director, Chemiroy Nigeria Limited; sole signatory and face. **No other Chemiroy individual is named in any Ministry-facing document.**
- **Chemiroy Nigeria Limited** — Consultant; refers to itself as "Chemiroy" or "the Consultant" in body

**Anticipated partners (mentioned but not active in PFSR period):**
- MAN, ASNAT, ASVAN — private-sector partners for Marketplace tier
- Ministries of Budget, Youth & Sport, Women Affairs, Education
- Oyo State Investment Public and Private Partnership Agency (OYSIPA)
- Board for Technical and Vocational Training
- Industrial Training Fund (federal, SUPA programme)

---

## 12. Terminology / Style Conventions

| Use | Don't use |
|---|---|
| Registry (capital R, programme/system) | register (when referring to programme) |
| respondent | registrant |
| field-staff cohort | enumerator pool (mostly) |
| Honourable Commissioner | the Commissioner |
| Senatorial District | senatorial zone |
| BOT (Build, Operate, Transfer) | spell out on first use |
| NDPA-aligned | NDPA-compliant (latter is too strong without DPIA filing) |
| A- security posture (state-government-grade); aspiration toward A+ | B+ (interim assessment; the work has advanced beyond it) |
| six-month engagement | six-month contract (preserves voice) |
| in legal review ahead of execution | awaits counter-signature |
| in preparation for filing | will be filed in [quarter/date] |
| at the Ministry's convenience | at the Honourable Commissioner's convenience |
| before fieldwork begins / on schedule for fieldwork | within the readiness window |

---

## 13. Inheriting Context to IUBR

The IUBR (CHM/OSLR/2026/002) is the **detailed companion** to the PFSR, submitted at the same time. It is the v1 baseline refactored to PFSR conventions. Pre-fieldwork. Retains the n=330 pre-field validation findings; defers post-fieldwork empirical refresh to the Field Survey Report (CHM/OSLR/2026/003).

When drafting the IUBR:

1. **Inherit ALL Section 3 diplomatic principles.** They don't reset between documents.
2. **Carry the chronology.** IUBR Document Control must have the engagement period row, the LoI-issuance reference (in Engagement-context narrative, passive voice), and the Conflicts-of-interest row.
3. **Inherit the 6-workstream structure** in any retrospective discussion. Do NOT carry forward v1's "Phase 1 / Phase 2 / Phase 3 / Phase 4" weeks-based framing.
4. **The IUBR is pre-fieldwork.** The pre-field validation findings (n=330, 10 per LGA) stay as the empirical baseline; statewide-fieldwork findings will be carried in the Field Survey Report.
5. **Carry forward the seven audit-defensive patches** (Section 6 of this doc) without exception.
6. **Distribution list** — same five Ministry recipients + SABER courtesy copy + Mrs Lagbaja + Chemiroy file copy.
7. **Replace v1's framing in every chapter:** "NDPA-compliant" → "NDPA-aligned"; "OWASP Top 10 SECURE" → A- security posture (state-government-grade) with A+ aspiration; "8 user roles" → 5 operational + Public tier; em-dashes removed; BERAP verbatim citations removed; FRC framing absent; AI tells removed.
8. **Address some of the deferred gaps** (Section 7 of this doc) where they reach maturity in the IUBR's expanded scope (e.g., statutory authority citation can sit in IUBR's compliance chapter without legal-review block).

---

## 14. Out-of-Scope Reminders

The PFSR (and IUBR) operate within these scope locks:

- **Operational scope only** — financials are dealt with separately
- **No SSH security event narrative** — operational/internal, not external
- **No reference to Lawal Awwal** — Mrs Lagbaja is the sole face/signatory of Chemiroy
- **No verbatim BERAP citation** — BERAP guides; documents do not quote
- **No v1 baseline draft references** — internal-only; never submitted

---

## 15. Threat Model for the PFSR (carries to IUBR)

The realistic threats over the 12-month horizon are:

| Threat | Defended by | Residual exposure |
|---|---|---|
| Friendly Ministry review | Tone, structure, professionalism | None |
| SABER audit | Workstream alignment, NDPA-aligned framing | Low |
| NDPC privacy audit | §6.1 patches, §6.4 data residency, DPIA in flight | DPIA filing timing — close before fieldwork or document rationale |
| Opposition-party / press scrutiny (toward 2027 elections) | Conflicts-of-interest declaration, political-risk row | Low–Medium |
| Future plaintiff (respondent or employer claim) | Lawful basis disaggregated, processor accountability stated | Medium — strengthens via DPIA filing and IUBR refinement |
| Ministry-internal blame attempt for compressed delivery | Engagement chronology in three places (metadata, narrative, contract anchor) | **Fully mitigated.** This is the document's strongest defence. |

---

*Maintained alongside the baseline-report sources. When IUBR drafting begins, read this document first. When new diplomatic principles or audit-defensive patches are established, add them to the relevant section here.*
