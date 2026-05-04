# DSA Template v1 — Legal Review & Sign-off

**Status:** **PENDING-REAL-HUMAN-RATIFICATION** — this document is an AI-agent–authored review draft (acting in the Iris/Gabe personae per Story 10-5 AC#2). Real-Iris and real-Gabe must ratify the findings before the DSA is partner-facing.

**Document under review:** `docs/legal/data-sharing-agreement-template-v1.md` (Iris draft, dated 2026-05-03)
**Companion documents under review:** `docs/legal/consumer-onboarding-sop-v1.md` + `_bmad-output/baseline-report/BASELINE-STUDY-REPORT-COMPLETE.md` Appendix H §H.8

**Review date:** 2026-05-03
**Review round:** R1 (initial)
**Next review due:** annually OR on regulatory change (whichever is earlier)

---

## Review checklist (matches Story 10-5 AC#2)

| Dimension | Iris perspective (DPIA / NDPA) | Gabe perspective (legal enforceability + doc quality) |
|---|---|---|
| NDPA s.25 obligations covered (a–h) | ✅ All 8 sub-clauses mapped to specific DSA Articles. Recital D explicitly cites s.25 of NDPA. | ✅ Citations are clean. Article 5.1 explicitly invokes s.39 measures. |
| Lawful basis defensible | ✅ Default s.6(1)(e) public interest — appropriate for a state government registry. PII branch correctly invokes s.26(1)(b). | ✅ Schedule 1 §4 forces explicit selection per consumer; no implicit defaulting. |
| Data subject rights forwarded | ✅ Article 4 forwards within 5 business days; Partner cannot respond directly. | ⚠ M3 — assistance period (10 business days, Article 4.3) may be too generous; see findings. |
| Security obligations specific | ✅ Article 5 + Schedule 2 §4 are concrete (TLS 1.2, AES-256, 180-day rotation). | ⚠ L2 — deletion-method standard not mandated; see findings. |
| Sub-processing controlled | ✅ Article 6.1 written-consent gate; Initial Sub-Processors carved out via Schedule 1 §7. | ✅ Article 6.3 Partner liability is unambiguous. |
| Audit rights effective | ✅ Article 7 — quarterly cap, 5-day notice, immediate-on-breach exception. | ⚠ M2 — Article 7.4 quarterly attestation lacks consequence-on-failure clause; see findings. |
| Breach notification timely | ✅ Article 8 — 24h Partner→Ministry, supports 72h Ministry→NDPC under s.40. | ✅ Article 8.4 correctly routes NDPC notification through Ministry only. |
| Termination + deletion | ✅ Article 9 — 90-day notice / 30-day deletion / 7-year DSA-on-file. NDPA s.26 covered. | ⚠ M4 — Schedule 1 §3 (Authorised Personnel) quarterly refresh creates latent amendment-friction with Article 12.2; see findings. |
| Governing law clarity | ✅ Article 11 — Nigerian law, Lagos arbitration, English language. | ⚠ M1 — "Lagos Court of Arbitration" needs disambiguation; see findings. |
| Liability proportionate | ✅ Article 10 — unlimited for gross negligence/wilful/fraud/confidentiality; capped otherwise. | ⚠ M5 — Article 10.3 liability cap framing references "consideration paid" which is meaningless for a non-fee-bearing programme; see findings. |
| Schedule 1/2/3 populate-able | ✅ Each Schedule has clear placeholders. SOP STEP 3 lists required Partner inputs matching Schedule fields. | ✅ Field-by-field mapping is unambiguous. |
| Internal cross-references | ✅ DSA ↔ SOP ↔ Tracker ↔ Appendix H all link bidirectionally. | ⚠ L1 — DSA Schedule 2 §2 commits to a signing scheme (X-API-Sig HMAC) not yet shipped in Story 10-1; see findings. |

---

## Findings

Severity legend: **H** = High (must fix before partner-facing use) · **M** = Medium (should fix in v1.1) · **L** = Low (track for v2)

### M1 — `[MEDIUM]` "Lagos Court of Arbitration" needs institutional disambiguation

**Location:** DSA Article 11.3
**Current text:** *"by arbitration under the Arbitration and Mediation Act, 2023, by a single arbitrator appointed by the Lagos Court of Arbitration"*

**Issue:** "Lagos Court of Arbitration" is the colloquial name of the *Lagos Court of Arbitration* (the institution; informal abbrev: LCA), but the phrasing is ambiguous to a non-Nigerian counterpart who might think it refers to a court (i.e. judiciary). In a partner-MDA scenario both parties are Nigerian and this is fine; in a future cross-border partner this is not.

**Recommended fix:**

> *"by arbitration under the Arbitration and Mediation Act, 2023, administered by the Lagos Court of Arbitration (LCA) in accordance with the LCA Arbitration Rules then in force, by a single arbitrator appointed by the LCA. The seat of arbitration shall be Lagos, Nigeria."*

**Iris note:** Confirm with Gabe that LCA Rules are the Ministry's preferred administering body. Alternatives: NICA (National Institute of Chartered Arbitrators of Nigeria), Lagos Multi-Door Courthouse mediation track for non-binding pre-arbitration mediation.

---

### M2 — `[MEDIUM]` Quarterly attestation has no specified consequence-on-failure

**Location:** DSA Article 7.4 + SOP §STEP 7 (Quarterly Review)
**Current text:** *"The Partner shall provide the Ministry, within 10 business days of the end of each calendar quarter, a written attestation..."*

**Issue:** What happens if Partner fails to provide the attestation? Silence in the DSA defaults to "material breach under Article 9.3 if persistent" — but "persistent" is undefined. A literal Partner could miss two quarters before the Ministry can credibly invoke Article 9.3.

**Recommended fix:**

Add Article 7.5:

> *"7.5 Failure to provide the attestation under §7.4 within 30 days of the prescribed deadline shall, on the Ministry's written notice, constitute a material breach for the purposes of Article 9.3 unless remedied within 14 days of such notice. Repeated failure (two consecutive quarters) is itself a material breach incapable of remedy."*

**Cross-reference SOP:** add to STEP 7 Quarterly Review action: *"If attestation is not received by Day +10 of quarter end, Super Admin sends a reminder; if not received by Day +30, Super Admin issues an Article 7.5 notice via Schedule 3 §3 contact."*

---

### M3 — `[MEDIUM]` Article 4.3 Data Subject Rights assistance — 10 business days too generous

**Location:** DSA Article 4.3
**Current text:** *"The Partner shall...assist the Ministry to fulfil a Data Subject request including by providing copies of OSLRS Data held by the Partner relating to the Data Subject within 10 business days."*

**Issue:** NDPA s.34(2) gives the Ministry 30 days to respond to a Data Subject access request. If Partner takes 10 business days (≈ 14 calendar) to provide its slice, the Ministry has half its statutory window consumed by Partner-side delay. For erasure requests (s.36) and rectification (s.35) the timeline is similarly tight.

**Recommended fix:** tighten to **5 business days**:

> *"The Partner shall, on the Ministry's reasonable request, assist the Ministry to fulfil a Data Subject request including by providing copies of OSLRS Data held by the Partner relating to the Data Subject within **5 business days** of the Ministry's request."*

**Iris note:** If 5 days is operationally infeasible for some Partners (large MDAs with slow internal processes), allow case-by-case extension with Ministry written agreement; do not loosen the default.

---

### M4 — `[MEDIUM]` Article 12.2 amendment requirement frictions with Schedule 1 quarterly refreshes

**Location:** DSA Article 12.2 vs Schedule 1 §3 (Authorised Personnel quarterly refresh) and §5 (IP allowlist)
**Current text:** Article 12.2 — *"No amendment of this Agreement is valid unless in writing and signed by authorised representatives of both Parties."*

**Issue:** Schedule 1 §3 specifies the Authorised Personnel roster "refreshes quarterly" and Article 5.4 says IP allowlist changes notified within 5 business days. Both are *de facto* amendments to the DSA. Requiring a full counter-signed amendment for routine personnel turnover or IP-block additions is operationally unworkable.

**Recommended fix:** carve out routine operational schedules from the formal amendment requirement.

Replace Article 12.2 with:

> *"12.2 No amendment of this Agreement is valid unless in writing and signed by authorised representatives of both Parties, save that:
>
> (a) updates to Schedule 1 §3 (Authorised Personnel Roster) made on the Partner's written notice (signed email from Partner's authorised signatory) take effect on the Ministry's written acknowledgement (signed email from Ministry's Super Admin) without further amendment formality;
>
> (b) updates to Schedule 1 §5 (IP Allowlist) follow the same process; and
>
> (c) replacement of API Keys via routine rotation per Schedule 3 §2 takes effect without amendment formality.
>
> All other amendments to this Agreement, including any change to a Schedule beyond §3 and §5, require an amendment instrument signed by authorised representatives of both Parties."*

**Cross-reference SOP:** STEP 7 Quarterly Review action — *"If Partner submits Schedule 1 §3 / §5 update via email, Super Admin acknowledges in writing and updates the tracker; no DSA amendment is needed."*

---

### M5 — `[MEDIUM]` Article 10.3 liability cap framing — "consideration paid" is meaningless for a non-fee-bearing programme

**Location:** DSA Article 10.3
**Current text:** *"...each Party's aggregate liability is capped at the greater of (a) ₦20,000,000 (twenty million Naira) or (b) the value of consideration paid under this Agreement in the 12 months preceding the event giving rise to the claim."*

**Issue:** The OSLRS Partner-API Programme is non-fee-bearing — partners pay nothing. So clause (b) always evaluates to zero, and the cap defaults to ₦20M flat. The dual formulation suggests the drafter copied a commercial template without adapting. Worse: a Partner counter-counsel might argue the absence of consideration undermines contract formation under Nigerian common-law contract principles, though Recitals D and the public-interest framing should rebut.

**Recommended fix:** replace with non-fee-bearing variant:

> *"10.3 The OSLRS Partner-API Programme is a non-fee-bearing data-sharing arrangement made in furtherance of the Ministry's public-interest mandate. Each Party's liability for direct losses under this Agreement is unlimited where such liability arises from gross negligence, wilful misconduct, fraud, or breach of confidentiality. For all other liabilities, each Party's aggregate liability under this Agreement, in respect of any single event or series of related events, is capped at ₦20,000,000 (twenty million Naira). The non-fee-bearing nature of this Agreement does not affect the consideration provided by each Party in the form of the rights, obligations, and assurances exchanged hereunder, which the Parties acknowledge as adequate."*

**Iris note:** the final sentence is a defensive consideration-recital. Confirm with Gabe whether Nigerian contract law requires more (a peppercorn?). If yes, adjust.

---

### M6 — `[MEDIUM]` PII scope 6-month expiry creates a re-issuance gap not handled in SOP

**Location:** DSA Schedule 1 §2 (`submissions:read_pii` row → expiry "6 months from Effective Date") + SOP STEP 7
**Current state:** PII scope expires at 6 months while DSA itself runs 12 months. Halfway through the term, the PII scope dies.

**Issue:** SOP doesn't describe what happens at the 6-month mark. Options:
- (i) PII scope auto-renews for the second 6 months (subject to Iris re-affirmation)
- (ii) PII scope requires a mid-term Schedule 1 amendment to re-grant
- (iii) PII scope is a one-shot 6-month grant and must be re-onboarded if Partner wants more

Without a documented choice, Super Admin will improvise.

**Recommended fix:** pick (i) with conditions. Add to Schedule 1 §2 footnote:

> *"`submissions:read_pii` 6-month expiry: at the 6-month mark, the scope auto-renews for a further 6 months provided that (a) Iris has re-affirmed the Appendix H §H.\<N\>.10 annual review or written equivalent within the prior 30 days, AND (b) no breach of this Agreement is outstanding. Failure of either condition causes the scope to lapse on expiry."*

**Cross-reference SOP:** add a STEP 7.5 — "Mid-Term PII Re-affirmation" — to the SOP with the specific Iris check.

---

### L1 — `[LOW]` DSA Schedule 2 §2 commits to a signing scheme not yet shipped

**Location:** DSA Schedule 2 §2
**Current text:** *"...corresponding signing secret is presented as a separate `X-API-Sig` header containing an HMAC-SHA256 signature of the request body..."*

**Issue:** Story 10-1 (Consumer Auth) hasn't shipped. The signing scheme described commits the Partner to whatever Story 10-1 ultimately implements. If Story 10-1 lands with a different scheme (e.g. JWT-based, or no signing at all), every signed DSA needs amendment.

**Recommended fix:** soften reference; let the Developer Portal be authoritative:

> *"...the corresponding signing secret is presented per the authentication scheme documented at the OSLRS Developer Portal (Story 10-4) at the date of API Key issuance. The scheme in force at issuance applies for the lifetime of that API Key; rotation under Schedule 3 §2 may include scheme change with at least 90 days' written notice to the Partner."*

**Cross-reference Story:** flag in Story 10-1's Dev Notes that the auth scheme decision must precede first DSA execution.

---

### L2 — `[LOW]` Article 9.4(b) deletion standard not mandated

**Location:** DSA Article 9.4(b) + Schedule 3 §6 attestation
**Current state:** Schedule 3 §6 mentions "method (e.g. cryptographic erasure, secure overwrite, vendor-issued certificate)" but does not require a specific standard.

**Issue:** Partner could plausibly attest deletion via `rm` on a non-overwriting filesystem, leaving recoverable data on disk. NIST 800-88 Rev. 1 is the international standard; mandating it would be defensible but might exceed some Partners' capacity.

**Recommended fix:** mandate at attestation level, not deletion method:

In Schedule 3 §6 attestation block, replace `[METHOD — e.g. ...]` with:

> *"...the method used (one of: NIST 800-88 Rev. 1 Clear, Purge, or Destroy; cryptographic erasure with key destruction; or vendor-attested erasure with certificate ID): __________"*

**Iris note:** This is a proportionality call. For Partners running on managed cloud (AWS RDS, etc.), vendor-attested erasure is appropriate. For on-prem Partners, NIST Purge/Destroy. Don't overspecify; do require *one* of the named standards.

---

### L3 — `[LOW]` Recital E DPIA section transmittal mechanism unspecified

**Location:** DSA Recital E + SOP STEP 3
**Current state:** Recital E says *"the Partner acknowledges receipt of a copy of the relevant DPIA section"* but neither DSA nor SOP specifies HOW the section is transmitted.

**Recommended fix:** add to SOP STEP 3 required-inputs table:

> *"Iris produces a PDF excerpt of Appendix H §H.\<N\> from `BASELINE-STUDY-REPORT-COMPLETE.md` (using `pandoc baseline-report.md -o appendix-h-N.pdf --section H.<N>`); excerpt is shared with Partner as part of the DSA package for STEP 4 review. Receipt is acknowledged by Partner in their counter-signature line on the DSA."*

---

### L4 — `[LOW]` SOP STEP 5.5 manual audit-log entry is brittle

**Location:** SOP STEP 5.5
**Current state:** Super Admin manually writes the `api_key.delivered` audit log entry after token handoff.

**Issue:** Reliance on operator memory. If forgotten, no audit trail of which channel + recipient — defeats the purpose.

**Recommended fix:** Story 10-3 (Consumer Admin UI) should include a "Token Delivered" modal that pops on first login after key issuance, asking the operator to record channel + recipient. Until Story 10-3 lands, this is a checklist item — add to SOP STEP 5 footnote:

> *"L4 reminder: until Story 10-3 wires this, the operator must remember to write the `api_key.delivered` audit entry. Consider adding a printed checkbox on the operator's onboarding worksheet."*

---

## Summary verdict

**6 Medium / 4 Low findings. No High-severity findings.**

All Medium findings are operational-clarity or contractual-precision issues that should be resolved in DSA v1.1 before the first real partner-facing onboarding. None are blockers for *internal use* (Story 10-5's "ratified template ready" deliverable) — but the first real partner-onboarding (STEP 4) should not begin against v1 unmodified.

**Recommendation: APPROVED-WITH-MEDIUM-FIXES.** Iris and Gabe to incorporate M1–M6 into DSA v1.1 within 5 business days. L1–L4 tracked into v2 backlog.

---

## Sign-off

> **NOTE — REAL-HUMAN GATE:**
>
> The two signatures below are the *real-human* gate. The current state of this section is `pending real-human ratification`. The AI agent acting in the Iris and Gabe persona produced the review findings above; only real-Iris and real-Gabe can definitively bind the Ministry. Until both signatures are filled, the DSA is **NOT** partner-facing.

| Role | Name | Signature | Date | Comments |
|---|---|---|---|---|
| **Iris** (DPIA / NDPA Counsel) | _pending real-human ratification_ | | | |
| **Gabe** (Legal & Documentation Reviewer) | _pending real-human ratification_ | | | |

**On real-human ratification:**
1. Real-Iris reviews the DSA template + the 6 Medium findings + R2 findings (5 HIGH + 8 MEDIUM + 4 LOW, see Round 2 section below); either accepts the recommended fixes (already incorporated into v1.1) or substitutes their own.
2. Real-Gabe reviews v1.1 and signs off.
3. Both signatures filled → status flips from `pending real-human ratification` → `RATIFIED v1.1`.
4. SOP-tracked next-review-date set to 2027-05-03 (annual minimum) OR earlier on regulatory change.

---

## Round 2 (R2) — Adversarial review of v1 against v1.1 incorporation

**Review date:** 2026-05-03 (same day as R1; commissioned via `/bmad:bmm:workflows:code-review` against the working-tree drafts)
**Reviewer:** AI agent acting as adversarial code-reviewer persona (operating per `feedback_review_before_commit.md`)
**Context:** R1 cataloged 6 Medium + 4 Low. R2 was tasked to find findings R1 missed.

R2 surfaced **5 HIGH + 8 MEDIUM + 4 LOW = 17 additional findings** below. All have been incorporated into v1.1 of the DSA template + SOP + tracker (see those documents' Change Log entries).

### R2 — HIGH (must be in v1.1 before partner-facing use)

| ID | Finding | Resolution in v1.1 |
|---|---|---|
| **R2-H1** | DSA Recital E + Schedule 1 §2 contain `[APPENDIX_H_SECTION_NUMBER]` placeholders. If `.docx` is rendered before STEP 3 populates them, the partner-facing DSA carries literal bracket text, breaching NDPA s.25(1) "documented instructions". | DSA Implementer note adds mandatory `grep -nE '\[[A-Z_]+\]'` pre-render check; SOP STEP 3 makes the check a numbered action with a placeholder allow-list. |
| **R2-H2** | DSA Article 3 frames NDPA s.26(1)(b) as an alternative basis to s.6(1)(e)/(c) ("with"). s.26 is a *supplementary* basis for NIN-specific processing — not an alternative. | DSA Article 3 split into 3.1 (primary, one of s.6) + 3.1A (supplementary, s.26(1)(b) for NIN scopes only). |
| **R2-H3** | SOP STEP 5 token-delivery deadlocks if the Partner has no PGP key AND cannot travel in person. STEP 1 collection list does not require channel preference upfront. | SOP STEP 1 acknowledgement email now collects channel preference at request-time; STEP 5 cannot reach provisioning with `pending` channel. |
| **R2-H4** | Dry-run abbreviates STEP 4 entirely ("Mock counter-signature: skipped"). The "end-to-end mechanically followable" claim therefore overstates coverage. | Dry-run document annotated to acknowledge this limitation explicitly; first real-Partner onboarding is the true end-to-end test. SOP STEP 4 escalation thresholds tightened so the operator catches stalls earlier. |
| **R2-H5** | DSA Article 9.4(c) post-termination data deletion is enforced solely by Partner self-attestation with no Ministry verification right. NDPA s.25(1)(g) implies post-termination verification. | DSA Article 9.4(c) now grants the Ministry a 10-business-day post-attestation audit window with cooperation obligation. Schedule 3 §6 mandates one of NIST 800-88 / cryptographic erasure + key destruction / vendor-attested erasure (closes Gabe L2 simultaneously). |

### R2 — MEDIUM (incorporated into v1.1)

| ID | Finding | Resolution in v1.1 |
|---|---|---|
| **R2-M1** | DSA Article 2.3 "Partner liable for any attempt or successful retrieval of out-of-scope data" contradicts "API enforces this technically" — if the API enforces, a routine attempt cannot succeed. | Article 2.3 rewritten to scope liability to circumvention (credential-sharing, social engineering, undisclosed-vulnerability exploitation) + onward processing + successful out-of-scope retrieval arising from circumvention. Routine API rejections absorbed by Partner code do not constitute breach. |
| **R2-M2** | DSA Schedule 1 §1 allows ≤180-day rotation; PII scope expires at 6 months. Without a constraint, a Partner could request 180-day rotation for a 6-month scope — the scope expires before any rotation, breaking audit-trail continuity and NFR10 compliance. | Schedule 1 §1 row now explicit: PII rotation cadence ≤90 days AND strictly less than scope expiry. |
| **R2-M3** | SOP STEP 7 Quarterly Review depends on Story 10-6 Consumer Audit Dashboard; Story 10-6 has not yet shipped, so the SOP would deadlock until it does. | STEP 7 now carries an explicit manual-fallback section with three psql queries (status × scope grouping, LGA-violation scan, Top-N target ID surfacing) for the pre-Story-10-6 era. |
| **R2-M4** | SOP STEP 5 does not state its dependency on Stories 10-1 (auth), 10-2 (rate limiting), 10-3 (admin UI) being shipped to production. | STEP 5 preamble now lists all three prerequisites with their roles; explicit instruction to escalate to Product Owner if any is unshipped. |
| **R2-M5** | SOP STEP 4 escalation threshold (30 days) is double the upper bound of the stated review budget (15 days for pii-track), creating ambiguity over when a stall should escalate. | STEP 4 escalation now calibrated to per-track budget upper bound: courtesy check at day +N (5/7/15 by track), internal escalation at +N+5, Permanent Secretary at +30, status `stalled` at +60. |
| **R2-M6** | SOP STEP 1 implicitly leaves the row in `received` state through STEPs 1–2; the `→ in-review` transition is never explicitly assigned to an actor and moment. | STEP 1 closure now numbered action 3: "When Super Admin sits down to begin STEP 2 eligibility review, the first action is to flip tracker `status` `received` → `in-review`." |
| **R2-M7** | SOP STEP 2 introduces `sensitive-track` and `public-track` as cleavage points but never operationally defines what each entails (timeline, approvals, rotation cadence). | STEP 2 decision tree now followed by a 5-column per-track operational profile table. |
| **R2-M8** | DSA Schedule 2 §3 specifies k-anonymity ≥ 5 for `aggregated_stats:read` but does not define the API behaviour when a query would return below the floor (return null? return all? return error code?). | Schedule 2 §3 row now explicit: HTTP 403 `INSUFFICIENT_SAMPLE_SIZE`; no silent substitution. Schedule 2 §5 error catalogue gains the new code. |

### R2 — LOW (incorporated into v1.1)

| ID | Finding | Resolution in v1.1 |
|---|---|---|
| **R2-L1** | Tracker `notes` column is freeform with no character cap, encouraging long prose that creates merge conflicts and is opaque to automated tooling. | Schema note: soft cap 200 chars; longer narratives go to `_bmad-output/legal/findings-log.md` with `FND-…` ID referenced inline. |
| **R2-L2** | Tracker `api_key_id` column accepts arbitrary string values (e.g. dummy `00000000-…-DRYRUN`). | Schema constraint: must be valid UUID v4 per RFC 4122; dummy-form permitted only in dry-run rows; CI lint job (with Story 10-3) to enforce. |
| **R2-L3** | Tracker `dsa_signed_url` column accepts arbitrary URI scheme; dry-run row contains `dryrun://no-real-pdf` which a future automated S3 fetcher would not handle. | Schema constraint: must be `digitalocean://oslsr-media/legal/dsa-signed/<request_id>.pdf` for production rows; `dryrun://` permitted only when `status` cell carries `(DRY-RUN)`. |
| **R2-L4** | Tracker `track` column lifecycle and per-track populated-columns relationship undocumented. | Schema notes for `track`, `super_admin_approval_at`, `ict_lead_approval_at` now clarify: `track` is set at STEP 2 and never changes; ICT Lead approval populated for pii-track only; Super Admin approval populated for all tracks. |

### R2 verdict

**APPROVED-WITH-FIXES → v1.1 incorporates all R2 findings.** None are blockers for *internal use* (Story 10-5's "ratified template ready" deliverable on the AI-agent ratification axis). Real-Iris and real-Gabe ratification on the human axis remains outstanding.

---

## Appendix — diff summary for v1.1 (for Iris's drafting convenience)

If Iris accepts all 6 Medium fixes wholesale, v1.1 changes are:

1. **DSA Article 11.3:** rewrite arbitration clause per M1.
2. **DSA Article 7:** add new §7.5 per M2.
3. **DSA Article 4.3:** change "10 business days" to "5 business days" per M3.
4. **DSA Article 12.2:** rewrite per M4 with carve-outs (a)/(b)/(c).
5. **DSA Article 10.3:** rewrite per M5 (non-fee-bearing variant).
6. **DSA Schedule 1 §2 footnote:** add PII auto-renewal conditions per M6.
7. **SOP §STEP 7:** add Mid-Term PII Re-affirmation step per M6.
8. **SOP §STEP 3:** clarify quarterly attestation reminder cadence per M2.
9. **SOP §STEP 7:** clarify §3/§5 update-by-email process per M4.

---

*— END OF GABE LEGAL REVIEW v1 —*
