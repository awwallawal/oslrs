# Operations Manual — Enumerator Section v1 — Iris Sign-off

**Status:** **PENDING-REAL-HUMAN-RATIFICATION** — this document is an AI-agent–authored review draft (acting in the Iris persona per Story `prep-operations-manual-enumerator-section` AC#5). Real-Iris must ratify the findings before the manual is field-deployed for NDPA-bearing content (Section 4 specifically; Sections 5–6 are Gabe's review).

**Document under review:** `docs/operations-manual/enumerator-v1.md`
**Companion document under review:** `docs/operations-manual/enumerator-quick-ref-v1.md` (Quick-Reference Card — privacy-bearing content on the back face)

**Review date:** 2026-05-04
**Review round:** R1 (initial)
**Review scope (per Story AC#5):** DPIA / NDPA perspective on:
- Section 2 consent walkthrough wording (`enumerator-v1.md` § Section 2.6)
- Section 4 NDPA briefing accuracy (`enumerator-v1.md` § Section 4)
- Quick-Reference Card consent script + privacy answers (`enumerator-quick-ref-v1.md` § BACK)
**Next review due:** annually OR on regulatory change (whichever is earlier)

---

## Review checklist — Iris perspective (DPIA / NDPA)

| Dimension | Assessment | Finding ref (if applicable) |
|---|---|---|
| Lawful basis correctly stated | ✅ Section 4 footnote [^2] correctly cites NDPA s.6(1)(e) Public Interest. Recital is appropriate for a state-government registry. | — |
| Lawful basis explanation accessible to enumerator | ✅ Plain-language framing in body; technical citation in footnote only. Matches Awwal directive 2026-05-04 ("translation, not transcription"). | — |
| Data collector role (s.25 obligations) clearly assigned | ✅ Section 4 § "What the law calls you" correctly identifies enumerator as data collector acting on behalf of Controller (Ministry); duties 1 + 2 correctly map to s.25(1)(a) and s.25(1)(b). | — |
| Data minimisation (collect-only-what-asked) explicit | ✅ Duty 1 explicitly forbids capturing non-asked data (address, religion, ethnic group, political affiliation). Strong language. | — |
| Confidentiality duty + field-staff 24-hour escalation window (NDPA s.40 mandates 72h Ministry-level notification; 24h field-to-supervisor window is the operational mechanism that lets the Ministry meet its 72h obligation) | ✅ Duty 2 requires immediate supervisor call on phone loss; field-staff 24-hour window correctly grounded in s.40 72h Ministry-notification timeline (footnote [^3] gets the cascade right: field-staff 24h → Ministry assesses → Ministry notifies NDPC + data subjects within 72h of becoming aware). | — |
| Data-subject rights — access | ✅ "Can I see what you have on me later?" answer correctly affirms s.34 right of access; routes through Ministry Data Office. | — |
| Data-subject rights — rectification | ⚠ M1 — Implicit only ("correct mistakes") | M1 |
| Data-subject rights — erasure | ⚠ M1 — Implicit only ("ask for it to be deleted") | M1 |
| Data-subject rights — objection / withdrawal of consent | ⚠ M2 — "What if I don't want to answer?" covers refusal at point of collection but NOT later withdrawal | M2 |
| Consent script — informed | ⚠ L1 — Minor: script does not name the *specific* lawful basis (Public Interest s.6(1)(e)); could be tightened | L1 |
| Consent script — freely given (no pressure) | ✅ Section 2.6 body explicitly forbids pressure ("Do not pressure the respondent"); declines do not count against enumerator's totals. | — |
| Consent script — specific and unambiguous | ✅ Single yes/no question; no compound consent. | — |
| Sensitive-data prohibition | ✅ Duty 1 explicitly excludes religion, ethnic group, political affiliation — three of the s.30 special-category data classes. | ⚠ L2 — health data not explicitly excluded |
| Authority-claimed-data-access social-engineering defence | ✅ "If anyone asks you to show data outside the app's normal flow, say no, then call supervisor immediately" — strong text. | — |
| Cross-link to DSA template / SOP | ⚠ M3 — manual references `docs/legal/consumer-onboarding-sop-v1.md` only in build-comments; respondent-facing answer should reference Ministry Data Office (operational) not the SOP (internal) — already correct, but may merit explicit comment | M3 |
| Footnote NDPA citations | ✅ Footnotes [^1] [^2] [^3] correctly cite s.6, s.25, s.39, s.40. Section numbers verified against NDPA 2023 published text. | — |
| Yoruba translation handling | ✅ Section 2.6 + Section 4 correctly defer Yoruba to oral-at-Training-of-Trainers per Awwal directive 2026-05-04. Manual stays English-only with no false claims of bilingual coverage. | — |

---

## Findings

Severity legend: **H** = High (must fix before field-deployment) · **M** = Medium (should fix in v1.1) · **L** = Low (track for v2)

### M1 — `[MEDIUM]` Data-subject rights to rectification + erasure should be named explicitly

**Location:** `enumerator-v1.md` § Section 4 § "What to say when a respondent asks" — Question 2.
**Quick-Reference companion:** `enumerator-quick-ref-v1.md` § BACK § "Can I see what you have on me later?"

**Current text (manual):**
> *"Yes. You have the right to see your record, correct mistakes, or ask for it to be deleted. To do so, contact the Oyo State Ministry of Trade's data office..."*

**Issue:** "Correct mistakes" and "ask for it to be deleted" are correct *colloquial* renderings of NDPA s.35 (rectification) and s.36 (erasure), but they read as Ministry-discretionary courtesies rather than statutory rights. A respondent asking "*Is that my legal right or just a Ministry policy?*" cannot be answered confidently from the current text. NDPA s.34–s.36 enumerate access, rectification, and erasure as statutory rights — the manual should say so plainly.

**Recommended fix (manual Section 4 — Question 2 answer):**

> *"Yes. The Nigeria Data Protection Act gives you three rights: to see your record (Section 34), to correct mistakes in it (Section 35), and to ask for it to be deleted (Section 36). To exercise any of these, contact the Oyo State Ministry of Trade's data office. The phone number is on the Quick-Reference Card I will leave with you."*

**Recommended fix (Quick-Reference Card BACK — same row):**

> *"Yes. NDPA gives you three rights: see your record (s.34), correct mistakes (s.35), ask for deletion (s.36). Contact Ministry's Data Office. Phone below."*

**Why fix:** statutory grounding is the difference between a *demanded* right and a *requested* favour. Real-Iris ratification should review this fix and either accept or counter-propose plainer phrasing that still names the statutory basis.

### M2 — `[MEDIUM]` Right to withdraw consent (post-collection) is missing

**Location:** `enumerator-v1.md` § Section 4 § "What to say when a respondent asks" — Question 3 + Section 2.6.
**Quick-Reference companion:** `enumerator-quick-ref-v1.md` § BACK row "What if I don't want to answer?"

**Issue:** Question 3 ("What if I don't want to answer?") covers refusal *at point of collection*. NDPA s.36 + s.6(2) also give the data subject the right to withdraw consent **after** their data has been recorded — which is materially different. A respondent who agreed in the field but later changes their mind currently has no path described in this manual.

**Recommended fix:** add a new Question 4 to Section 4 (and a new row to the Quick-Reference Card BACK):

> *"4. **What if I agree now but change my mind later?**" — "*You can withdraw your agreement at any time. Contact the Ministry's Data Office and ask for your record to be deleted. The phone number is on the card I will leave with you. There is no penalty for withdrawing.*"*

**Cross-reference:** matches the Section 36 erasure right (which is the operational mechanism for withdrawal), and matches the SOP § Step 7 quarterly review cadence at `docs/legal/consumer-onboarding-sop-v1.md` which assumes data subjects can request deletion at any point in the relationship.

**Why fix:** without this answer, a respondent's lawful right to withdraw is invisible to the enumerator, who may inadvertently dismiss the request or escalate inappropriately. Fix the manual; fix the card.

### M3 — `[MEDIUM]` Section 4 cross-link to Story 10-5 SOP should be explicit for traceability

**Location:** `enumerator-v1.md` § Section 4 (entire section).

**Issue:** Section 4 derives its NDPA framing from the established Iris voice in `docs/legal/consumer-onboarding-sop-v1.md` per Story AC#4. The build-comment block at the top of `enumerator-v1.md` mentions this dependency, but the section itself does not reference the SOP — making it harder for real-Iris to verify "every NDPA claim traces back to a specific clause" (per Story Task 2.4) on the ratification pass.

**Recommended fix:** add a short footnote at the end of Section 4's introductory paragraph:

> *"This briefing is consistent with the OSLRS Consumer Onboarding SOP v1 (`docs/legal/consumer-onboarding-sop-v1.md`) and the Data-Sharing Agreement template v1 (`docs/legal/data-sharing-agreement-template-v1.md`); both ratified by Iris under the Story 10-5 review cycle.[^4]"*

with `[^4]` resolving to: *"See `docs/legal/dsa-template-v1-signoff.md` for the v1 ratification status."*

**Why fix:** strengthens the audit trail. Real-Iris can ratify v1.1 of this manual against v1.1 of the DSA + SOP knowing the cross-references are explicit, not implicit.

### L1 — `[LOW]` Consent script could name the lawful basis explicitly

**Location:** `enumerator-quick-ref-v1.md` § BACK § "Consent script (read aloud, word-for-word)" + by inheritance `enumerator-v1.md` § Section 2.6.

**Issue:** the consent script tells the respondent *what* the data is used for (training planning, skill-gap analysis, opportunity matching) but does not name the *legal basis* under which the State collects it. NDPA s.6(1)(e) Public Interest is the basis; naming it makes the basis verifiable rather than implicit.

**Recommended fix:** insert one phrase into the consent script:

> *"I work for the Oyo State Ministry of Trade. **Under the State's official authority and Section 6(1)(e) of the Nigeria Data Protection Act**, I am collecting information for the Skilled Labour Registry…"*

**Caveat:** this raises the linguistic complexity of the script. Real-Iris may prefer to keep the field-script plain and add the lawful basis to a written information notice the enumerator hands the respondent (separate document, not part of v1 scope). Track both options for the v1.1 conversation.

### L2 — `[LOW]` Health data not explicitly named in Duty 1 sensitive-data exclusion

**Location:** `enumerator-v1.md` § Section 4 § Duty 1.

**Current text:** *"Do not record the respondent's home address, religion, ethnic group, or political affiliation unless a specific field asks."*

**Issue:** religion / ethnic group / political affiliation are three of the s.30 sensitive-category classes. The full s.30 list also includes health data, sexual orientation, biometric data, and trade-union membership. For a Skilled Labour Registry, **trade-union membership** is plausibly a question an enumerator might encounter (e.g., a respondent volunteering "I am a member of the National Union of Tailors"). Health data is less likely but possible (e.g., respondent volunteering a disability that affects their trade).

**Recommended fix:** broaden Duty 1's example list:

> *"Do not record the respondent's home address, religion, ethnic group, political affiliation, **health information, biometric data beyond the photograph, sexual orientation, or trade-union membership** unless a specific field asks."*

**Why fix:** completeness; specifically the trade-union case which is plausible in this domain. Trade-union membership is sensitive under NDPA s.30(j).

---

## Sign-off block

**This sign-off is PENDING-REAL-HUMAN-RATIFICATION.** Real-Iris reviews the findings above and either ratifies v1 (if findings are accepted as v1.1 backlog) or counter-proposes amendments before v1 is field-deployed.

| Reviewer | Name | Date | Comments-addressed | Signature |
|---|---|---|---|---|
| AI agent in Iris persona (initial review) | *Claude Opus 4.7* | 2026-05-04 | All findings drafted with concrete fixes; v1.1 round will incorporate. | *AI-generated; not a binding signature.* |
| Real-Iris (DPIA / NDPA Counsel) | *— pending —* | *— pending —* | *— pending —* | *— pending —* |

**Findings carried to v1.1 (post-real-Iris ratification):**

| ID | Severity | Description | Status |
|---|---|---|---|
| M1 | Medium | Data-subject rights to rectification + erasure named explicitly with NDPA s.34/35/36 references | Pending ratification |
| M2 | Medium | Right to withdraw consent post-collection added as new Q4 in Section 4 + new row in Quick-Reference Card | Pending ratification |
| M3 | Medium | Section 4 footnote cross-link to Story 10-5 SOP + DSA template + signoff | Pending ratification |
| L1 | Low | Consent script names NDPA s.6(1)(e) lawful basis (or pushes to separate written notice) | Track for v2 |
| L2 | Low | Duty 1 sensitive-data list broadened to cover full s.30 categories | Track for v2 |

**Next steps:**
1. Real-Iris reviews this document against `enumerator-v1.md` Section 4 + `enumerator-quick-ref-v1.md` BACK.
2. Real-Iris ratifies M1–M3 or counter-proposes.
3. v1.1 incorporation pass produces `enumerator-v1.1.md` + `enumerator-quick-ref-v1.1.md`.
4. Real-Iris signs the table above; status flips PENDING → RATIFIED-v1.1.
5. FRC item #6 in `epics.md` flips `🟡 Review → ✅ Done <date>`.

**Pairing note:** real-Iris ratification of this document SHOULD occur in the same session as real-Iris ratification of `docs/legal/dsa-template-v1-signoff.md` per Story Dev Notes § "Why ratification gate mirrors 10-5 (single session)". Single ratification session minimises real-Iris meeting load and forces voice/tone consistency check across the DSA + SOP + Operations Manual triplet.
