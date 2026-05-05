# Operations Manual — Enumerator Section v1 — Gabe Sign-off

**Status:** **PENDING-REAL-HUMAN-RATIFICATION** — this document is an AI-agent–authored review draft (acting in the Gabe persona per Story `prep-operations-manual-enumerator-section` AC#6). Real-Gabe must ratify the findings before the manual is field-deployed for legal-ops and operational-clarity content (Sections 5–6 specifically; Section 4 is Iris's review).

**Document under review:** `docs/operations-manual/enumerator-v1.md`
**Companion document under review:** `docs/operations-manual/enumerator-quick-ref-v1.md` (Quick-Reference Card)

**Review date:** 2026-05-04
**Review round:** R1 (initial)
**Review scope (per Story AC#6):** Legal enforceability + documentation-quality perspective on:
- Section 5 reimbursement / payment / phone-allowance procedure (`enumerator-v1.md` § Section 5)
- Section 6 escalation paths (`enumerator-v1.md` § Section 6)
- Overall doc structure + cross-section voice consistency + first-time-app-reader accessibility
- Quick-Reference Card escalation rows
**Next review due:** annually OR on regulatory change (whichever is earlier)

---

## Review checklist — Gabe perspective (legal enforceability + doc quality)

| Dimension | Assessment | Finding ref (if applicable) |
|---|---|---|
| Section 5 — payment terms unambiguous | ⚠ M1 — naira amounts left as `<!-- AWWAL-VERIFY -->` placeholders by design (Awwal directive); fine for v1 ratification, BUT field-deployment requires resolution. Track as v1 → v1.1 hard gate. | M1 |
| Section 5 — payment cycle explicit (when paid, by whom) | ✅ Section 5.6 sets clear weekly cycle: Sun timesheet → Mon 10 AM submit → Tue 5 PM payroll → Fri close payment hits account. Enforceable timeline. | — |
| Section 5 — payment escalation path | ✅ Section 5.6 closes with "If payment is delayed beyond Friday, see Section 6.2"; Section 6.2 row has Field Supervisor as first contact + Ministry Payroll only via supervisor (correct — direct payroll contact would create cohort confusion). | — |
| Section 5 — reimbursable categories defined | ✅ Section 5.5 enumerates 3 categories (inter-LGA transport, replacement printing, genuine field-emergency). 30-day stale-claim window is enforceable. | — |
| Section 5 — what counts as "valid submission" | ✅ Section 5.4 four-condition test (synced + verified + non-duplicate + non-fraud). Defensible against gaming. | ⚠ L1 — "verified within 3-5 business days" is a soft commitment, not a guarantee |
| Section 5 — replacement printing reimbursement reasonable | ⚠ L2 — `<!-- AWWAL-VERIFY: replacement-print-cap -->` undefined; matches M1 pattern but worth a separate flag because reimbursement caps that are too low push enumerators toward improvisation | L2 |
| Section 6 — escalation order clear | ✅ Section 6.1 strict 3-level chain (Supervisor → ICT/Builder → Data Office). "Do not contact senior officials directly" is correctly framed as protection for both enumerator and the office. | — |
| Section 6 — problem-to-contact mapping complete | ✅ Section 6.2 table covers 9 problem categories. No obvious omissions. | ⚠ M2 — Vehicle / road-traffic accident in field NOT explicitly covered |
| Section 6 — out-of-hours rules clear | ✅ Section 6.4 narrows out-of-hours to phone-loss + breach incidents only. Protects on-call capacity. | — |
| Section 6 — contact details actionable | ⚠ M3 — `<!-- AWWAL-PROVIDE -->` placeholders for ALL phone numbers and names — by design at v1, but a v1 manual without phone numbers is field-blocking. Real names + phone numbers are required before printing. | M3 |
| Section 6 — escalation respects supervisor authority | ✅ "Default escalation rule when unsure: call your supervisor" + "supervisor escalates payroll" + "supervisor wakes ICT for phone-loss" — supervisor authority preserved through chain. | — |
| Voice consistency across personae (1-3 Awwal / 4 Iris / 5-6 Gabe) | ✅ Imperative-second-person dominant across all sections. Iris voice softens slightly in Section 4 footnotes (appropriate). Gabe voice in Section 5-6 procedural-clean (matches 10-5 SOP register). No tonal jumps that would feel disjointed to first-time-app reader. | — |
| First-time-app-reader accessibility | ✅ Manual front-matter "How to use this manual" sets reader expectation correctly. Section 1 daily checklist is the right entry point. Section 2 walkthrough is screenshot-anchored. Sections 3-6 are reference-shaped. Reader load distribution is correct. | ⚠ L3 — Glossary missing (some app-specific terms not defined) |
| Cross-references to other docs | ✅ Manual + sign-offs + 10-5 SOP + DSA template all cross-linked correctly. Story file referenced. Build pipeline documented. | — |
| Versioning convention applied | ✅ AC#7 semver applied: filename `enumerator-v1.md` + Document Control table version=v1 + sign-off table version=v1 + cross-reference to v1.1 path in Document Control. Consistent everywhere. | — |
| Risks not flagged in scope | None obvious | — |

---

## Findings

Severity legend: **H** = High (must fix before field-deployment) · **M** = Medium (should fix in v1.1) · **L** = Low (track for v2)

### M1 — `[MEDIUM]` Naira amount placeholders (Section 5) must be filled before field-deployment

**Location:** `enumerator-v1.md` § Section 5.1, 5.2, 5.5.
**Specific placeholders:**
- Daily allowance: `<!-- AWWAL-VERIFY: daily-allowance-amount -->`
- Per-submission rate: `<!-- AWWAL-VERIFY: per-submission-rate -->`
- Phone allowance monthly: `<!-- AWWAL-VERIFY: phone-allowance-monthly-amount -->`
- Airtime/data monthly: `<!-- AWWAL-VERIFY: airtime-data-monthly-amount -->`
- Replacement print cap: `<!-- AWWAL-VERIFY: replacement-print-cap -->`

**Issue:** the manual ships v1 with placeholders by Awwal directive 2026-05-04 ("describe the screenshot title; I source post-draft" applied analogously to amounts). Acceptable for v1 ratification by AI personae — the SHAPE of Section 5 is correct. **NOT acceptable for field deployment.** A printed manual with `<!-- AWWAL-VERIFY -->` text in front of an enumerator at training is a documentation failure.

**Recommended fix:** before the v1 manual is printed for the field, Awwal pulls Ministry-approved figures from the budget approval (which is already on file) and replaces all 5 placeholders. v1.1 incorporates these alongside Iris findings + post-dry-run friction.

**Hard rule for v1.1:** zero `<!-- AWWAL-VERIFY -->` markers in Section 5 of the v1.1 markdown source. Enforce via grep before render.

### M2 — `[MEDIUM]` Vehicle / road-traffic accident in field not in escalation table

**Location:** `enumerator-v1.md` § Section 6.2.

**Issue:** Section 6.2 covers 9 problem categories (app crash, sync failure, magic-link, NDPA question, data request, phone loss, data breach, payment delayed, inter-LGA transport, personal emergency). It does NOT cover **vehicle accident** — which is the most likely *physical* emergency in field work. Enumerators travel between assigned locations on commercial transport (okada, danfo, keke); accidents are a real risk.

A field-staff manual that does not tell an enumerator what to do after a road accident is a gap.

**Recommended fix:** add a new row to Section 6.2:

| Problem | First contact | Second contact (if first unavailable >4 hrs) |
|---|---|---|
| Vehicle / road-traffic accident in field (you or respondent injured) | **Emergency services first (112 / 199)** + Field Supervisor | Ministry HR if extended absence |

Add a corresponding paragraph at end of Section 6 (before Section 6.5) explaining the order: "*If you are injured in the field, your immediate priority is your own safety. Call emergency services if needed. Once safe, message your supervisor with location + status. The Ministry's HR office handles work-related injury claims; your supervisor routes to HR.*"

**Why fix:** field-staff manuals routinely include physical-emergency procedures. Skipping this looks careless. Real-Gabe ratification should treat this as a gap to close before printing.

### M3 — `[MEDIUM]` Section 6.3 phone numbers MUST be filled before field-deployment

**Location:** `enumerator-v1.md` § Section 6.3 + `enumerator-quick-ref-v1.md` § BACK § Contacts table.

**Issue:** Section 6.3 contains 5 rows of phone numbers + names + emails — all `<!-- AWWAL-PROVIDE -->` placeholders. Same pattern as M1 (acceptable at v1 ratification by AI personae; NOT acceptable at field deployment).

**Recommended fix:** before v1 is printed, Awwal pulls the actual roster from Ministry team assignments and fills all `<!-- AWWAL-PROVIDE -->` placeholders. The Quick-Reference Card BACK also receives the same phone numbers — must be kept in sync (single source of truth in Section 6.3, copy to card).

**Hard rule for v1.1:** zero `<!-- AWWAL-PROVIDE -->` markers in Section 6.3 OR card BACK of the v1.1 versions. Enforce via grep before render.

**Note on email convention:** the AI-persona-drafted version uses `support@oyoskills.com` and `admin@oyoskills.com` for the Builder team — these match the project email architecture established 2026-04-26 (per Story 9-9 + the project email architecture decision in MEMORY.md). Real-Gabe should verify these are still the canonical contact addresses at print-time.

### L1 — `[LOW]` "Verified within 3-5 business days" is a soft commitment

**Location:** `enumerator-v1.md` § Section 5.4.

**Current text:**
> *"Verification typically completes within 3-5 business days of sync. Your weekly payment includes only verified submissions from the previous week — submissions captured Monday–Saturday week 1 are paid in week 2."*

**Issue:** "typically completes" is enforceable as a *soft* commitment. If verification slips to 7+ business days during a high-volume week, the enumerator's payment slips an extra week. The current text does not promise a hard SLA, but it implies one. A diligent enumerator could legitimately ask: *"What if verification takes longer than 5 business days?"*

**Recommended fix:** add a sentence to Section 5.4:

> *"If verification has not completed within 5 business days, the submission is paid in the FOLLOWING week's cycle (i.e., week N submissions verified by end of week N+1 are paid in week N+2). Verification slippage does not lose your payment — only delays it by one cycle."*

**Why fix:** removes ambiguity. Cuts "what about late verification" support questions before they happen.

### L2 — `[LOW]` Replacement-print reimbursement cap should be reasonable for Ibadan local print shops

**Location:** `enumerator-v1.md` § Section 5.5 row 2.

**Issue:** the cap is currently `<!-- AWWAL-VERIFY: replacement-print-cap -->` (covered in M1's placeholder list). Setting the cap too low (e.g., < ₦1,500 for the full manual + card combo) pushes enumerators toward improvisation (e.g., reading a smudged print rather than reprinting). Local commercial print in Ibadan for a 30-page A4 manual + A5 card is typically ₦1,500–₦2,500 per set in 2026.

**Recommended cap (for Awwal's consideration when filling M1):** ₦3,000 per replacement set, with claims above that requiring written supervisor approval. Generous enough to never push toward improvisation; bounded enough that the Ministry budget is not abused.

**Why fix:** small enough that Awwal can resolve in the same M1 placeholder-fill pass.

### L3 — `[LOW]` Glossary missing for app-specific terms

**Location:** Manual front-matter / Section 2.

**Issue:** the manual references several app-specific terms without explaining them: *Magic Link*, *Pending NIN*, *NIMC*, *idempotent submission*, *consent script*. A first-time-app reader without prior briefing may stumble on these.

**Recommended fix (v2, not v1.1):** add a short Glossary appendix at the end of the manual (≤ 1 page; one-line definitions). Defer to v2 to keep v1 lean — v1 ratification + v1.1 incorporation should NOT be slowed by glossary work.

**Why defer:** Training-of-Trainers (per Section 4 + Awwal directive) explains these terms orally. Glossary is a nice-to-have, not a v1 deficit.

---

## Cross-section voice review (per Story Task 6.2 "overall doc structure")

The manual cross-cuts three author personae — Awwal-Builder (Sections 1–3), Iris (Section 4), Gabe (Sections 5–6). Story Risk #3 flagged voice drift between sections as a concern. Assessment:

- **Section 1 (Daily Workflow)** — terse imperative checklist register. Concrete numbers (battery %, data balance MB, time-of-day). Effective for daily-routine reference. ✅
- **Section 2 (Capture Flow)** — narrative imperative with screenshot-anchor placeholders. Slightly more verbose than Section 1 (appropriate — walkthroughs need narrative). ✅
- **Section 3 (Common Errors)** — symptom + recovery + when-to-escalate triplet, repeated 6 times. Predictable structure makes mid-field lookup fast. ✅
- **Section 4 (NDPA Briefing)** — softer register; "Duty 1" / "Duty 2" framing borrowed from Iris voice in 10-5 SOP. NDPA citations in footnotes (not body). Appropriately distinct in tone WITHOUT feeling disjointed. ✅
- **Section 5 (Payment)** — procedural-clean register matching 10-5 SOP § STEP language. Numeric tables + cycle-based timelines. ✅
- **Section 6 (Escalation)** — table-driven decision tree. Pragmatic. Closes with "When in doubt, call your supervisor" — appropriate humility for a field-staff doc. ✅

**No tonal jumps** that would feel disjointed to a first-time-app reader. Voice review **passes**.

---

## Sign-off block

**This sign-off is PENDING-REAL-HUMAN-RATIFICATION.** Real-Gabe reviews the findings above and either ratifies v1 (if findings are accepted as v1.1 backlog) or counter-proposes amendments before v1 is field-deployed.

| Reviewer | Name | Date | Comments-addressed | Signature |
|---|---|---|---|---|
| AI agent in Gabe persona (initial review) | *Claude Opus 4.7* | 2026-05-04 | All findings drafted with concrete fixes; v1.1 round will incorporate. Voice review passes. | *AI-generated; not a binding signature.* |
| Real-Gabe (Legal & Documentation Reviewer) | *— pending —* | *— pending —* | *— pending —* | *— pending —* |

**Findings carried to v1.1 (post-real-Gabe ratification):**

| ID | Severity | Description | Status |
|---|---|---|---|
| M1 | Medium | Naira amount placeholders (5 sites in Section 5) filled with Ministry-approved figures | Pending Awwal supplies + ratification |
| M2 | Medium | Vehicle/road-traffic accident row added to Section 6.2 + paragraph at end of Section 6 | Pending ratification |
| M3 | Medium | Section 6.3 phone numbers + names filled with Ministry team roster (5 rows + card BACK sync) | Pending Awwal supplies + ratification |
| L1 | Low | Section 5.4 verification-slippage payment-cycle clarification | Track for v1.1 |
| L2 | Low | Replacement-print reimbursement cap suggested at ₦3,000 (resolved with M1) | Track for v1.1 |
| L3 | Low | Glossary appendix added | Track for **v2** (NOT v1.1) |

**Hard gate before field-deployment (printable v1.1):**
- ALL M1 placeholders replaced with real figures
- M2 vehicle-accident row added
- ALL M3 phone numbers + names filled (Section 6.3 + Quick-Reference Card BACK in sync)

If any of these three remains placeholder-marked, the manual is **not** printable for field use. Field-readiness gate (FRC #6 `done` flip) gates on this.

**Next steps:**
1. Real-Gabe reviews this document against `enumerator-v1.md` Section 5 + Section 6 + `enumerator-quick-ref-v1.md` BACK.
2. Real-Gabe ratifies M1–M3 + L1–L3 or counter-proposes.
3. Awwal supplies the placeholder values (M1 + M3) per Ministry roster + budget approval.
4. v1.1 incorporation pass produces `enumerator-v1.1.md` + `enumerator-quick-ref-v1.1.md`.
5. Real-Gabe signs the table above; status flips PENDING → RATIFIED-v1.1.
6. FRC item #6 in `epics.md` flips `🟡 Review → ✅ Done <date>` (gated also on real-Iris ratification of `iris-signoff-v1.md`).

**Pairing note:** real-Gabe ratification of this document SHOULD occur in the same session as real-Gabe ratification of `docs/legal/dsa-template-v1-signoff.md` per Story Dev Notes § "Why ratification gate mirrors 10-5 (single session)". Single ratification session minimises real-Gabe meeting load and forces voice/tone consistency check across the DSA + SOP + Operations Manual triplet.
