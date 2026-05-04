# DATA-SHARING AGREEMENT (DSA)

**Template version:** v1.1 (Iris draft incorporating Gabe legal-review M1–M6 + R2 adversarial-review findings; awaiting real-Iris/real-Gabe ratification)
**Status:** PENDING-RATIFICATION — not for partner-facing use until `dsa-template-v1-signoff.md` is fully signed
**Effective scope:** Oyo State Skilled Labour Registry (OSLRS) Partner-API Programme — `submissions:read_pii` and adjacent scopes

> **Implementer note:** This document is the canonical *source* for the DSA. Render to `.docx` for partner counter-signature via:
> ```
> pandoc data-sharing-agreement-template-v1.md -o data-sharing-agreement-template-v1.docx --reference-doc=ministry-letterhead.docx
> ```
> Render to `.pdf` for archival via:
> ```
> pandoc data-sharing-agreement-template-v1.md -o data-sharing-agreement-template-v1.pdf
> ```
> The `.docx` and `.pdf` artefacts go to partners; the `.md` source stays in the repo as the canonical version-controlled history.
>
> **PRE-RENDER PLACEHOLDER CHECK (mandatory before sending to Partner).** Run:
> ```
> grep -nE '\[[A-Z_]+\]' data-sharing-agreement-template-v1.md
> ```
> Every match represents an unpopulated placeholder. **Do not render to `.docx` until this command returns zero unintended matches.** Intentional placeholders that the Partner counter-signs into (e.g. `[PARTNER_SIGNATURE_DATE]`) are listed in the SOP STEP 3 placeholder map; everything else must be populated. NDPA s.25(1) requires "documented instructions" — a literal `[APPENDIX_H_SECTION_NUMBER]` in a partner-facing DSA does not meet that bar.

## Change Log

| Version | Date | Author | Summary |
|---|---|---|---|
| v1 | 2026-05-03 | Iris (draft) | Initial 12-Article + 3-Schedule template |
| v1.1 | 2026-05-03 | Iris + R2 reviewer | Incorporates Gabe M1–M6 + 13 R2 findings (placeholder-escape guard, NDPA s.26 framing, deletion-attestation audit right, LGA-scoping language, PII rotation cap, k-anonymity suppression, analytics-derivative carve-out, post-signature population mechanism, rotation collision constraint) |

---

## DATA-SHARING AGREEMENT

**This Agreement** is made on **[EFFECTIVE_DATE]** (the *Effective Date*)

**BETWEEN:**

**(1) THE GOVERNMENT OF OYO STATE**, acting through the **Oyo State Ministry of Trade, Investment, and Cooperatives**, having its principal address at *[Ministry HQ Address, Ibadan, Oyo State, Nigeria]*, represented by **[MINISTRY_SIGNATORY_NAME]**, *[MINISTRY_SIGNATORY_ROLE]*, the **Data Controller** (*"the Ministry"*); **AND**

**(2) [PARTNER_LEGAL_NAME]**, a *[PARTNER_LEGAL_FORM — e.g. Federal MDA / Cooperative / Limited Company]* having its principal address at *[PARTNER_ADDRESS]* and registration number *[PARTNER_REGISTRATION_NUMBER]*, represented by **[PARTNER_SIGNATORY_NAME]**, *[PARTNER_SIGNATORY_ROLE]*, the **Data Processor** (*"the Partner"*).

The Ministry and the Partner are each a *Party* and together the *Parties*.

---

## RECITALS

**WHEREAS:**

**A.** The Ministry operates the Oyo State Skilled Labour Registry (OSLRS), a state government data system that enrols, verifies, and curates information on skilled and informal-economy workers ordinarily resident in Oyo State, Nigeria. Personal data processed via OSLRS includes National Identification Numbers (NIN), names, dates of birth, biometric selfie verification, location of residence at Local Government Area (LGA) level, occupation, skills, and consent metadata.

**B.** The Ministry is a *Data Controller* under section 65 of the **Nigeria Data Protection Act, 2023 (NDPA)** in respect of all personal data processed via OSLRS, and is registered with the Nigeria Data Protection Commission (NDPC) under registration *[NDPC_REG_NUMBER]*.

**C.** The Partner has requested access to a defined subset of OSLRS data via the OSLRS Partner-API Programme for the purposes set out in **Schedule 1 §1 (Purpose of Processing)** of this Agreement.

**D.** The Parties acknowledge that any processing of personal data carried on by the Partner pursuant to this Agreement is in the capacity of *Data Processor* on behalf of the Ministry within the meaning of section 25 of the NDPA, and that this Agreement constitutes the *documented instructions* required by section 25(1)(a) of the NDPA.

**E.** The Ministry has conducted a Data Protection Impact Assessment in respect of the Partner-API Programme (the *DPIA*) recorded at **Appendix H §[APPENDIX_H_SECTION_NUMBER]** of the OSLRS Baseline Study Report, and the Partner acknowledges receipt of a copy of the relevant DPIA section.

**F.** The Parties enter into this Agreement to set out the rights, obligations, and procedures governing the Partner's processing of personal data made available via the OSLRS Partner-API.

**NOW THEREFORE** the Parties agree as follows.

---

## ARTICLE 1 — DEFINITIONS AND INTERPRETATION

**1.1** In this Agreement, the following capitalised terms have the meanings set out below. Where a term is also defined in the NDPA, the NDPA definition prevails to the extent of any inconsistency.

| Term | Meaning |
|---|---|
| **Agreement** | This Data-Sharing Agreement, including its Recitals and Schedules 1, 2, and 3, as amended from time to time in writing. |
| **API** | The OSLRS Partner-API as described in Schedule 2 (Technical Specifications). |
| **API Key** | The credential issued by the Ministry to the Partner under §1 of Schedule 1, comprising a public-facing identifier and a secret bearer token, used to authenticate the Partner's API requests. |
| **Authorised Personnel** | Those employees, officers, or contractors of the Partner who (a) require access to OSLRS Data to perform the Purpose, (b) are subject to a written confidentiality undertaking at least equivalent to Article 5.2, and (c) are listed in Schedule 1 §3 (Authorised Personnel Roster) as updated quarterly. |
| **Data Subject** | A natural person whose personal data is processed via OSLRS. |
| **DPIA** | The Data Protection Impact Assessment referenced in Recital E and recorded at Appendix H of the OSLRS Baseline Study Report. |
| **NDPA** | The Nigeria Data Protection Act, 2023, as amended from time to time. |
| **NDPC** | The Nigeria Data Protection Commission established under section 4 of the NDPA. |
| **OSLRS Data** | Personal data made available to the Partner via the API pursuant to the Scopes granted under Schedule 1, including any derivatives, copies, extracts, summaries, or analytics produced therefrom. *For the avoidance of doubt: aggregated statistical outputs derived solely from the `aggregated_stats:read` Scope and meeting the Schedule 2 §3 k-anonymity threshold (k ≥ 5) do not contain Personal Data and fall outside the deletion obligation in Article 9.4(b). Any outputs that fail the k-anonymity threshold, or that combine aggregated outputs with other data such that re-identification becomes possible, remain OSLRS Data and are within scope.* |
| **Personal Data** | Has the meaning given in section 65 of the NDPA. |
| **Personal Data Breach** | Has the meaning given in section 65 of the NDPA, namely a breach of security leading to the accidental or unlawful destruction, loss, alteration, unauthorised disclosure of, or access to OSLRS Data. |
| **Purpose** | The specific lawful purpose for which the Partner is permitted to process OSLRS Data, as set out in Schedule 1 §1. |
| **Scope** | A named permission granting access to a defined subset of OSLRS Data and operations, listed in Schedule 1 §2 and defined in the OSLRS Scope Catalogue at Schedule 2 §3. |
| **Sub-Processor** | Any third party engaged by the Partner to process OSLRS Data on the Partner's behalf, including without limitation cloud-hosting providers, analytics processors, and managed-service vendors. |

**1.2** Any reference to a statute or regulation includes any subordinate legislation made under it and any amendment, re-enactment, or replacement.

**1.3** Headings are for convenience only and do not affect interpretation. The singular includes the plural and vice versa.

**1.4** This Agreement is governed by the NDPA and the laws of the Federal Republic of Nigeria as set out in Article 11.

---

## ARTICLE 2 — SCOPE OF PROCESSING (NDPA s.25(1)(a) — DOCUMENTED INSTRUCTIONS)

**2.1 Documented instructions.** The Partner shall process OSLRS Data only on the documented instructions of the Ministry as set out in this Agreement. Any processing outside the Purpose (Schedule 1 §1) or beyond the Scopes (Schedule 1 §2) is unlawful and constitutes a material breach of this Agreement.

**2.2 No secondary use.** OSLRS Data shall not be used for any purpose other than the Purpose. Without limitation, OSLRS Data shall not be used for direct marketing, profiling for commercial gain, training of foundation AI models, or onward sale.

**2.3 LGA scoping.** Where the Schedule 1 §2 Scope grant restricts access to specified Local Government Area codes (the *LGA Scope*), the Partner shall query the API only with parameters falling within that LGA Scope. The Ministry's API enforces this technically by rejecting out-of-scope queries with HTTP 403 `AUTH_LGA_OUT_OF_SCOPE`; routine API rejections that are absorbed by Partner code without further action do not, of themselves, constitute breach of this clause. The Partner remains contractually liable, however, for: (a) any attempt to circumvent the technical control (including credential sharing under Article 5.5, social engineering of Ministry staff, or exploiting an undisclosed vulnerability); (b) any onward processing of OSLRS Data already retrieved that exceeds the LGA Scope; and (c) any successful out-of-scope retrieval arising from such circumvention.

**2.4 Time bounding.** Each Scope grant in Schedule 1 §2 carries an expiry date. On expiry the API will reject further requests automatically; the Partner shall not seek to circumvent expiry.

**2.5 Aggregation prohibition.** Where Schedule 1 §2 grants `submissions:read_aggregated` (statistical only), the Partner shall not attempt to re-identify Data Subjects through linkage with other datasets.

**2.6 Geographic processing constraint.** OSLRS Data shall be processed within Nigeria save where transfer outside Nigeria is permitted under section 41 of the NDPA and disclosed at Schedule 1 §6 (Cross-Border Transfers, if any).

---

## ARTICLE 3 — LAWFUL BASIS

**3.1 Primary basis.** The Ministry's primary lawful basis for disclosing OSLRS Data to the Partner is recorded at Schedule 1 §4 and shall be one of:

- **NDPA s.6(1)(e)** — processing necessary for the performance of a task carried out in the public interest or in the exercise of official authority vested in the Ministry *(default for Partner-API onboardings)*; OR
- **NDPA s.6(1)(c)** — processing necessary for compliance with a legal obligation borne by the Ministry.

**3.1A Supplementary basis (NIN processing).** Where the Schedule 1 §2 grant includes `submissions:read_pii` or `registry:verify_nin`, the Ministry additionally relies on **NDPA s.26(1)(b)** as a *supplementary* basis specifically authorising processing of National Identification Numbers under the national identification framework. The Schedule 1 §4 selection records both the primary basis (s.6) AND the s.26(1)(b) supplementary basis where applicable; the supplementary basis is not an alternative to or substitute for a primary s.6 basis.

**3.2** The Partner's lawful basis for processing OSLRS Data shall be the same basis as the Ministry's, the Partner acting solely as Data Processor.

**3.3** Where the Purpose changes, both Parties shall re-execute Schedule 1 in writing before any processing on the new basis commences.

---

## ARTICLE 4 — DATA SUBJECT RIGHTS (NDPA s.25(1)(e))

**4.1** The Partner shall not respond directly to any request from a Data Subject exercising rights under sections 34–40 of the NDPA (rights of access, rectification, erasure, restriction, portability, objection, and against automated decision-making). Such requests must be forwarded to the Ministry within **5 business days** of receipt, accompanied by all information the Partner holds relevant to the Data Subject.

**4.2** The Partner shall maintain a request log capturing date received, Data Subject identifier (where lawfully ascertainable), request type, and date forwarded to the Ministry.

**4.3** The Partner shall, on the Ministry's reasonable request, assist the Ministry to fulfil a Data Subject request including by providing copies of OSLRS Data held by the Partner relating to the Data Subject within **5 business days** of the Ministry's request. Where 5 business days is operationally infeasible for a particular Partner (e.g. large MDAs with internal records-management lead times), the Ministry may agree a longer period in writing on a per-request basis; the default of 5 business days otherwise prevails so as to preserve the Ministry's statutory response window under NDPA s.34–40.

---

## ARTICLE 5 — SECURITY OBLIGATIONS (NDPA s.25(1)(b)–(c), s.39)

**5.1 Article 39 measures.** The Partner shall implement appropriate technical and organisational measures to ensure a level of security appropriate to the risk, including all measures set out in Schedule 2 §4 (Security Specifications) and at minimum:

(a) encryption of OSLRS Data in transit (TLS 1.2 or higher) and at rest (AES-256 or equivalent);
(b) role-based access control limiting access to Authorised Personnel;
(c) a documented secret-management practice for the API Key;
(d) logging of every API request and every internal access to OSLRS Data, retained for at least 12 months;
(e) regular vulnerability assessment of any system handling OSLRS Data (at minimum annually);
(f) timely application of security patches to operating systems, runtimes, and dependencies.

**5.2 Personnel confidentiality.** All Authorised Personnel shall be subject to a written confidentiality undertaking (employment contract or equivalent) covering OSLRS Data and surviving termination of their engagement. The Partner shall maintain evidence of such undertakings and produce them on the Ministry's reasonable request.

**5.3 Key rotation.** The Partner shall rotate its API Key every **180 days** (as configured in Schedule 1 §1), with a 7-day overlap window during which both old and new keys are valid. The rotation procedure is documented in Schedule 3 §2.

**5.4 IP allowlist.** The Partner shall keep the IP-address allowlist registered at Schedule 1 §5 current and notify the Ministry within 5 business days of any change.

**5.5 No credential sharing.** The API Key shall not be shared with any party not on the Authorised Personnel roster. A leaked API Key is a Personal Data Breach within the meaning of Article 8.

---

## ARTICLE 6 — SUB-PROCESSING (NDPA s.25(1)(d))

**6.1** The Partner shall not engage any Sub-Processor to process OSLRS Data without the prior **written** consent of the Ministry, save for those Sub-Processors listed in Schedule 1 §7 at the Effective Date (the *Initial Sub-Processors*).

**6.2** Where the Ministry consents to a new Sub-Processor, the Partner shall procure that the Sub-Processor enters into a written agreement with the Partner imposing obligations at least equivalent to those imposed on the Partner under this Agreement, including without limitation Articles 4 (Data Subject Rights), 5 (Security), and 8 (Breach Notification).

**6.3** The Partner remains fully liable to the Ministry for the performance of any Sub-Processor's obligations and any acts or omissions of any Sub-Processor as if they were those of the Partner.

**6.4** The Partner shall maintain an up-to-date list of all Sub-Processors and provide it to the Ministry on the Ministry's reasonable request.

---

## ARTICLE 7 — AUDIT RIGHTS (NDPA s.25(1)(h))

**7.1 Right of audit.** The Ministry, or an independent auditor appointed by the Ministry and bound by equivalent confidentiality, may audit the Partner's compliance with this Agreement no more than once per quarter on **5 business days** prior written notice, save in the event of a Personal Data Breach in which case no notice is required.

**7.2 Cooperation.** The Partner shall make available to the Ministry on reasonable request:

(a) records and logs evidencing API access and internal access to OSLRS Data;
(b) the Authorised Personnel roster and confidentiality undertakings;
(c) the Sub-Processor list and Sub-Processor agreements;
(d) results of the most recent vulnerability assessment;
(e) the Data Subject request log per Article 4.2;
(f) any other information reasonably required to demonstrate compliance with this Agreement.

**7.3 Cost of audit.** Each Party bears its own costs of audit save where the audit reveals a material breach of this Agreement, in which case the Partner shall reimburse the Ministry's reasonable audit costs.

**7.4 Quarterly compliance attestation.** The Partner shall provide the Ministry, within 10 business days of the end of each calendar quarter, a written attestation in the form prescribed at Schedule 3 §4 confirming continued compliance with this Agreement and disclosing any material incidents in the quarter.

**7.5 Failure to attest.** Failure to provide the attestation under §7.4 within 30 days of the prescribed deadline shall, on the Ministry's written notice, constitute a material breach for the purposes of Article 9.3 unless remedied by delivery of the outstanding attestation within 14 days of such notice. Failure to attest in respect of two consecutive quarters is itself a material breach incapable of remedy and entitles the Ministry to terminate under Article 9.3 without further cure period.

---

## ARTICLE 8 — PERSONAL DATA BREACH NOTIFICATION (NDPA s.40)

**8.1 Suspicion threshold.** The Partner shall notify the Ministry **without undue delay and in any case within 24 hours** of becoming aware of a Personal Data Breach or a credible suspicion thereof. Notification shall be made to the Ministry's incident contact at Schedule 3 §5 by the most direct available channel (email, telephone, in-person; no requirement to use the API).

**8.2 Initial information.** The first notification shall include, to the extent then known: nature and category of the Breach; categories and approximate number of Data Subjects affected; categories and approximate volume of OSLRS Data affected; likely consequences; remedial measures taken or proposed.

**8.3 Subsequent information.** The Partner shall provide updates to the Ministry without undue delay as further information becomes available, and shall complete a full incident report within 7 days of containment unless the Ministry agrees a longer period.

**8.4 NDPC notification support.** The Partner shall assist the Ministry in fulfilling the Ministry's section 40 NDPA obligation to notify the NDPC within 72 hours of becoming aware of the Breach. The Partner shall not directly notify the NDPC unless the Ministry expressly directs the Partner to do so in writing.

**8.5 No public statement.** The Partner shall not make any public statement concerning the Breach without the prior written approval of the Ministry, save where compelled by law.

---

## ARTICLE 9 — TERMINATION AND DATA DELETION (NDPA s.25(1)(g), s.26)

**9.1 Term.** This Agreement commences on the Effective Date and continues for an initial term of **12 months**, renewable annually by written agreement of the Parties. The annual renewal procedure is described in Schedule 3 §6.

**9.2 Termination for convenience.** Either Party may terminate this Agreement on **90 days** written notice to the other Party.

**9.3 Termination for breach.** The Ministry may terminate this Agreement immediately on written notice where the Partner is in material breach of any obligation under this Agreement and either (a) the breach is incapable of remedy, or (b) the breach has not been remedied within 14 days of the Ministry's written notice requiring remedy.

**9.4 Effect of termination.** On termination, however arising:

(a) the Partner's API Keys shall be revoked by the Ministry on the termination date and the Partner's access to OSLRS Data shall cease;
(b) within **30 days** of the termination date, the Partner shall delete or, at the Ministry's option, return all OSLRS Data, including all derivatives, copies, extracts, summaries, and back-ups (save aggregated statistical outputs satisfying the Article 1 carve-out, and save where retention is required by applicable law in which case Article 9.5 applies);
(c) the Partner shall provide written attestation of deletion (or return) to the Ministry per Schedule 3 §6, signed by the Partner's authorised signatory, within 35 days of the termination date. The Ministry may, on written notice given within 10 business days of receipt of the attestation, audit the Partner's deletion at the Partner's site or by remote evidence (logs, certificates, screen-shares of administrative consoles) to verify the attestation. The Partner shall cooperate reasonably with such verification; non-cooperation is itself a material breach for the purposes of Article 10.1 indemnity and Article 7 cost-shifting;
(d) Articles 4 (Data Subject Rights surviving requests in flight), 5.1(d) (logging retention), 7 (Audit Rights, including post-termination deletion audit per §9.4(c)), 8 (Breach Notification for breaches discovered post-termination concerning Data prior to termination), and 11 (Governing Law) survive termination.

**9.5 Statutory retention exception.** Where the Partner is required by Nigerian law to retain any OSLRS Data after termination, the Partner shall (i) notify the Ministry of the retention requirement and basis, (ii) limit retention to the data and period actually required, (iii) maintain Article 5 security measures throughout retention, and (iv) delete on expiry of the retention period.

**9.6 DSA on file.** The Ministry shall retain a copy of this Agreement for **7 years** following termination per the OSLRS audit retention policy (NFR4.2) regardless of any provision in §9.4.

---

## ARTICLE 10 — LIABILITY AND INDEMNITY

**10.1** The Partner shall indemnify and keep indemnified the Ministry against all losses, claims, damages, costs (including reasonable legal costs), fines, and penalties arising from any breach of this Agreement by the Partner, its Authorised Personnel, or any Sub-Processor.

**10.2** Without prejudice to Article 10.1, the Partner shall be liable for any administrative penalty imposed on the Ministry by the NDPC or any successor regulator to the extent such penalty arises from the Partner's act or omission in breach of this Agreement.

**10.3** The OSLRS Partner-API Programme is a non-fee-bearing data-sharing arrangement made in furtherance of the Ministry's public-interest mandate; the Partner pays no monetary consideration for access to OSLRS Data. Each Party's liability for direct losses under this Agreement is **unlimited** where such liability arises from gross negligence, wilful misconduct, fraud, or breach of confidentiality. For all other liabilities, each Party's aggregate liability under this Agreement, in respect of any single event or series of related events arising from a single root cause, is capped at **₦20,000,000 (twenty million Naira)**. The non-fee-bearing nature of this Agreement does not affect the consideration provided by each Party in the form of the rights, obligations, and assurances exchanged hereunder, which the Parties acknowledge as adequate consideration for the purposes of contract formation under Nigerian law.

---

## ARTICLE 11 — GOVERNING LAW AND DISPUTE RESOLUTION

**11.1** This Agreement is governed by and construed in accordance with the laws of the Federal Republic of Nigeria.

**11.2** The Parties shall first attempt in good faith to resolve any dispute arising under this Agreement by direct negotiation between their respective designated representatives within 30 days of written notice of the dispute by one Party to the other.

**11.3** Failing resolution under §11.2, any dispute shall be finally resolved by arbitration under the Arbitration and Mediation Act, 2023, administered by the **Lagos Court of Arbitration (LCA)** in accordance with the LCA Arbitration Rules then in force, by a single arbitrator appointed by the LCA. The seat of arbitration shall be Lagos, Nigeria. The language of arbitration shall be English.

**11.4** Either Party may seek interim relief from any court of competent jurisdiction in Nigeria pending constitution of the arbitral tribunal.

---

## ARTICLE 12 — MISCELLANEOUS

**12.1 Entire agreement.** This Agreement, including its Schedules, constitutes the entire agreement between the Parties in respect of its subject matter and supersedes all prior negotiations, representations, and agreements, written or oral.

**12.2 Amendment.** No amendment of this Agreement is valid unless in writing and signed by authorised representatives of both Parties, save that the following routine operational updates take effect without amendment formality:

(a) updates to **Schedule 1 §3 (Authorised Personnel Roster)** made on the Partner's written notice (signed email from the Partner's authorised signatory or designated personnel-update contact) take effect on the Ministry's written acknowledgement (signed email from the Ministry's Super Admin);

(b) updates to **Schedule 1 §5 (IP Allowlist)** follow the same notice-and-acknowledgement process; the Partner shall give such notice within 5 business days of any change as required by Article 5.4;

(c) routine **rotation of API Keys** per Schedule 3 §2 takes effect automatically; the new public-facing identifier displaces the prior identifier in Schedule 1 §1 without further amendment formality.

All other amendments to this Agreement, including any change to Schedule 1 beyond §3 and §5, any change to Schedule 2 (Technical Specifications), and any change to Schedule 3 beyond §2 routine rotation, require an amendment instrument signed by authorised representatives of both Parties.

**12.3 Severability.** If any provision is held by a competent authority to be invalid or unenforceable, the remaining provisions continue in full force.

**12.4 No waiver.** No failure or delay by either Party in exercising any right under this Agreement constitutes a waiver of that right.

**12.5 Notices.** Any notice required under this Agreement shall be in writing and delivered by hand, registered post, or email to the contact details set out in Schedule 3 §5 (or such other details as a Party may notify in writing).

**12.6 Assignment.** Neither Party may assign or transfer any of its rights or obligations under this Agreement without the prior written consent of the other, save that the Ministry may assign to a successor government department on written notice.

**12.7 Counterparts.** This Agreement may be executed in counterparts, each of which is an original and which together constitute one Agreement. Electronic signatures (DocuSign, Adobe Sign, or wet-ink scan) are valid.

---

## SIGNED for and on behalf of THE GOVERNMENT OF OYO STATE

| Field | Value |
|---|---|
| Signature | _____________________________ |
| Name | **[MINISTRY_SIGNATORY_NAME]** |
| Role | **[MINISTRY_SIGNATORY_ROLE]** |
| Date | **[MINISTRY_SIGNATURE_DATE]** |
| Witness Signature | _____________________________ |
| Witness Name | **[MINISTRY_WITNESS_NAME]** |

## SIGNED for and on behalf of [PARTNER_LEGAL_NAME]

| Field | Value |
|---|---|
| Signature | _____________________________ |
| Name | **[PARTNER_SIGNATORY_NAME]** |
| Role | **[PARTNER_SIGNATORY_ROLE]** |
| Date | **[PARTNER_SIGNATURE_DATE]** |
| Witness Signature | _____________________________ |
| Witness Name | **[PARTNER_WITNESS_NAME]** |

---

# SCHEDULE 1 — PER-CONSUMER SPECIFICS

*This Schedule is populated per-Partner during Consumer Onboarding STEP 3 (DSA Drafting). Default values are placeholders; replace with Partner-specific values.*

## §1 Consumer Identity and Key

| Field | Value |
|---|---|
| Consumer Organisation Legal Name | **[PARTNER_LEGAL_NAME]** |
| Consumer Internal Reference (`api_consumers.id`) | _populated post-signature by the Ministry per Article 12.2(c) — this row is updated by Schedule 1 Appendix A on first provisioning under STEP 5 of the SOP and does not require counter-signature_ |
| Initial API Key Identifier (public) | _populated post-signature by the Ministry per Article 12.2(c) — this row is updated by Schedule 1 Appendix A on issuance and does not require counter-signature_ |
| Key Rotation Cadence | **180 days** for non-PII scopes; **90 days maximum** for any grant including `submissions:read_pii` (this constraint is mandatory and overrides any longer cadence requested by the Partner — the cadence must additionally be strictly less than the §2 scope expiry date for that scope so that at least one rotation occurs within the scope lifetime). Partner may request 60/30 days for any scope. |
| Key Rotation Overlap Window | 7 days |
| First Issuance Date | **[FIRST_ISSUANCE_DATE]** |
| Effective Date of this Agreement | **[EFFECTIVE_DATE]** |
| Initial Term Expiry Date | **[EFFECTIVE_DATE + 12 months]** |
| Purpose of Processing | **[PURPOSE_PARAGRAPH — single paragraph; specific use-case]** |

> **Schedule 1 Appendix A — Post-Signature Population Record.** This sub-table is populated by the Ministry on first provisioning (SOP STEP 5) and on each subsequent key rotation. Per Article 12.2(c), updates here do not constitute amendments and do not require counter-signature.
>
> | Date populated | Field | Value | Recorded by |
> |---|---|---|---|
> | _populated on provisioning_ | Consumer Internal Reference | _e.g. `0190abcd-...`_ | _Super Admin_ |
> | _populated on issuance_ | Initial API Key Identifier (public) | _e.g. `pk_2026_05_..._a3f1`_ | _Super Admin_ |
> | _populated on each rotation_ | Rotation N — new public identifier | _..._ | _Super Admin_ |

## §2 Scopes Granted

*Tick scopes granted; cross out scopes denied. Scope catalogue at Schedule 2 §3.*

| Scope | Granted? | LGA Scope (if restricted) | Per-Minute Limit | Per-Day Limit | Per-Month Limit | Expiry Date |
|---|:---:|---|:---:|:---:|:---:|---|
| `aggregated_stats:read` | ☐ | _all_ | 60 | 5,000 | 100,000 | _12 months from Effective Date_ |
| `marketplace:read_public` | ☐ | _all_ | 120 | 10,000 | 200,000 | _12 months from Effective Date_ |
| `submissions:read_aggregated` | ☐ | _list LGAs_ | 30 | 1,000 | 20,000 | _12 months from Effective Date_ |
| `submissions:read_pii` | ☐ | _list LGAs — required_ | 10 | 200 | 2,000 | _6 months from Effective Date — explicit shorter expiry_ |
| `registry:verify_nin` | ☐ | _list LGAs_ | 30 | 1,000 | 10,000 | _12 months from Effective Date_ |

**PII scope additional requirements (where granted):**
- DPIA reference: Appendix H §**[APPENDIX_H_SECTION_NUMBER]** of the OSLRS Baseline Study Report (this placeholder MUST be populated with a concrete section number before the DSA is sent to Partner — see Implementer note at top of this document and SOP STEP 3 placeholder check)
- Two-person Ministry approval recorded on **[APPROVAL_DATE]** by:
  - Super Admin: **[SUPER_ADMIN_NAME]** (signature on file)
  - Ministry ICT Lead: **[ICT_LEAD_NAME]** (signature on file)
- Audit-of-issuance recorded in `audit_logs` with `action='api_key.delivered'` on **[ISSUANCE_DATE]**

> **Footnote on `submissions:read_pii` 6-month expiry.** At the 6-month mark from the Effective Date, the `submissions:read_pii` scope auto-renews for a further 6 months provided that:
>
> (a) Iris (or a successor in role) has re-affirmed the Appendix H §[APPENDIX_H_SECTION_NUMBER] DPIA section, or has issued a written equivalent re-affirmation, within the 30 days preceding the 6-month mark (recorded as `action='dpia.reaffirmed'` in `audit_logs`); AND
>
> (b) no breach of this Agreement is outstanding (no open `action='dsa.breach_recorded'` audit entry for this Consumer at the 6-month mark).
>
> Failure of either condition causes the scope to lapse on the 6-month expiry; the Partner is notified by email and may re-onboard the PII scope via SOP STEP 1. The mid-term re-affirmation procedure is documented in SOP STEP 7.5.

## §3 Authorised Personnel Roster (refresh quarterly per Article 5.2)

| Name | Role at Partner | Email | Confidentiality Undertaking on File? |
|---|---|---|:---:|
| _Partner populates_ | | | ☐ |

## §4 Lawful Basis

- [ ] NDPA s.6(1)(c) — legal obligation
- [ ] NDPA s.6(1)(e) — public interest *(default)*
- [ ] NDPA s.26(1)(b) — national identification (NIN-bearing scopes only)
- [ ] Other: __________________________ *(requires Iris approval)*

## §5 IP Allowlist (per Article 5.4)

*Comma-separated list of CIDR blocks from which the Partner's backend will originate API requests.*

```
[PARTNER_IP_CIDR_LIST]
```

## §6 Cross-Border Transfers

- [x] **None — all processing within Nigeria** *(default)*
- [ ] Transfer to: **[COUNTRY/JURISDICTION]** under NDPA section 41 ground: **[GROUND_AND_BASIS]**

## §7 Initial Sub-Processors (per Article 6.1)

| Sub-Processor Name | Role | Country | Sub-Processor Agreement on File? |
|---|---|---|:---:|
| _e.g. AWS_ | _hosting_ | _South Africa_ | ☐ |

---

# SCHEDULE 2 — TECHNICAL SPECIFICATIONS

## §1 API Base URL

```
https://oyotradeministry.com.ng/api/v1/partner
```

## §2 Authentication

API Key delivered per the Token Delivery Channel specified at Schedule 3 §1. Key is presented in every request as a `X-API-Key` header. The corresponding signing secret is presented per the authentication scheme documented at the **OSLRS Developer Portal** (Story 10-4) at the date of API Key issuance; the scheme in force at issuance applies for the lifetime of that API Key. The current default scheme is an `X-API-Sig` header containing an HMAC-SHA256 signature of the request body (or the empty string for GET) keyed by the signing secret. Rotation under Schedule 3 §2 may include scheme change with at least 90 days' written notice to the Partner.

## §3 Scope Catalogue

| Scope | Description |
|---|---|
| `aggregated_stats:read` | Read aggregated statistics on OSLRS data (counts, percentages) — no individual records, k-anonymity ≥ 5. **Suppression behaviour:** any query whose result set would expose a count, sum, or grouping derived from fewer than 5 underlying respondent records is rejected with HTTP 403 `INSUFFICIENT_SAMPLE_SIZE`; the API does not silently substitute a null, zero, or rounded value. The Partner shall not attempt to defeat the suppression by issuing successive over-narrow queries to triangulate a single respondent. |
| `marketplace:read_public` | Read the public Skills Marketplace (consenting respondents only — `consent_marketplace = true` and `verified_badge = true`). |
| `submissions:read_aggregated` | Read submission counts and statistics by LGA / occupation / time. No PII. |
| `submissions:read_pii` | **HIGH-PRIVACY SCOPE.** Read individual respondent records including NIN, name, DOB, phone, LGA. Subject to: signed DSA on file, Appendix H DPIA section, two-person Ministry approval, 6-month maximum scope expiry, mandatory rotation 90 days. |
| `registry:verify_nin` | Submit a NIN; receive boolean "registered in OSLRS or not" (no other PII). Limited to LGAs in §5. |

## §4 Security Specifications

(a) TLS 1.2 minimum at the API endpoint. TLS 1.0 / 1.1 / SSL rejected.
(b) HSTS enforced (preload list).
(c) Per-Consumer rate limits per Schedule 1 §2 — enforced by Story 10-2 layer.
(d) Per-Consumer IP allowlist per Schedule 1 §5 — enforced by Story 10-1 layer.
(e) All requests + responses logged in `audit_logs` with `consumer_id` principal.
(f) Errors carry structured codes per the OSLRS Error Catalogue at the Developer Portal.

## §5 Error Codes

| Code | Meaning | HTTP |
|---|---|---|
| `AUTH_INVALID_KEY` | API Key invalid, expired, or revoked | 401 |
| `AUTH_SCOPE_DENIED` | Key lacks required scope for endpoint | 403 |
| `AUTH_LGA_OUT_OF_SCOPE` | Query LGA not in Schedule 1 §2 LGA Scope | 403 |
| `AUTH_IP_NOT_ALLOWED` | Request origin IP not in Schedule 1 §5 allowlist | 403 |
| `RATE_LIMIT_EXCEEDED` | Per-minute / per-day / per-month limit exceeded | 429 |
| `INSUFFICIENT_SAMPLE_SIZE` | `aggregated_stats:read` query would expose a count below the k-anonymity floor (k ≥ 5) | 403 |
| `DSA_NOT_ON_FILE` | Defensive — should not occur in production | 403 |
| `INTERNAL_ERROR` | Server fault — Partner should retry with exponential backoff | 500 |

## §6 Technical Contact (Ministry side)

| Field | Value |
|---|---|
| Name | _Awwal Lawal (Builder) → Ministry ICT (post-Transfer)_ |
| Email | `support@oyoskills.com` |
| Hours | Mon–Fri 09:00–17:00 WAT |
| Emergency channel | _phone — see Schedule 3 §5_ |

---

# SCHEDULE 3 — OPERATIONAL SPECIFICATIONS

## §1 Token Delivery Channel

The first API Key is delivered to the Partner via **one** of the following channels, selected by the Partner at signature:

- [ ] **Channel A — PGP-encrypted email** (preferred)
  - Partner's PGP public key fingerprint: **[FINGERPRINT]**
  - Partner's recipient email: **[EMAIL]**
  - Encryption tool: GPG / Kleopatra
- [ ] **Channel B — In-person handoff at Ministry HQ**
  - Recipient name: **[NAME]**
  - Handoff date (scheduled): **[DATE]**
  - Recipient brings government-issued photo ID

The following channels are **NOT** acceptable: plain email, SMS, WhatsApp, Slack, Telegram, or any third-party-hosted messaging.

The delivery event is recorded in `audit_logs` with `action='api_key.delivered'`, channel, recipient name, and date.

## §2 Key Rotation Procedure

**Before expiry day −7:**
1. Ministry generates new key in Story 10-3 Consumer Admin UI.
2. New key delivered to Partner per §1 above.
3. Partner deploys new key to production; verifies first request succeeds.

**Day 0 to day +7 (overlap window):** both old and new keys valid.

**Day +7:** old key automatically revoked. Partner verifies all production traffic uses new key.

**On rotation failure** (Partner does not deploy new key by day +7): the old key revokes; Partner is notified by email; Partner contacts Ministry to expedite rotation. Service interruption is on the Partner.

## §3 Incident Contact

| Field | Ministry | Partner |
|---|---|---|
| Primary contact name | **[NAME]** | **[NAME]** |
| Primary contact phone | **[PHONE]** | **[PHONE]** |
| Primary contact email | `incident@oyoskills.com` | **[EMAIL]** |
| Out-of-hours escalation | Ministry duty officer | Partner duty officer |

## §4 Quarterly Compliance Attestation Form

The Partner shall submit, within 10 business days of each calendar quarter end, a written attestation in the following form:

> *"On behalf of [PARTNER_LEGAL_NAME], I attest that during the calendar quarter ending [DATE]:*
>
> *(a) processing of OSLRS Data has been confined to the Purpose and Scopes set out in Schedule 1;*
> *(b) the Authorised Personnel roster in Schedule 1 §3 was current and accurate at quarter end;*
> *(c) the Sub-Processor list in Schedule 1 §7 was current and accurate at quarter end (or amended as notified);*
> *(d) no Personal Data Breach has occurred during the quarter [or — list incidents, dates, status];*
> *(e) the Partner's vulnerability assessment at [DATE] has been completed [or — scheduled for DATE];*
> *(f) the Partner remains in compliance with all obligations under the DSA.*
>
> *Signed: [NAME, ROLE], on behalf of [PARTNER_LEGAL_NAME], dated [DATE]."*

## §5 Annual Renewal Procedure

**90 days before initial term expiry:**
- Ministry sends renewal questionnaire to Partner covering: continued business need; scope changes; LGA scope changes; IP allowlist changes; sub-processor changes.

**60 days before expiry:**
- Both parties review prior 12 months' Audit Log entries together.
- Iris (DPIA) re-affirms or amends DPIA reference.
- Gabe (legal) reviews any DSA amendments needed.

**30 days before expiry:**
- Both parties sign renewal addendum (or terminate if either declines).

**Day of expiry, no renewal:** automated key revocation 7 days after expiry per NFR10. Partner can re-onboard via STEP 1 of the SOP.

## §6 Termination Data-Deletion Attestation

Within 35 days of termination, the Partner shall provide the Ministry the following written attestation:

> *"On behalf of [PARTNER_LEGAL_NAME], I attest that all OSLRS Data, including derivatives, copies, extracts, summaries, and back-ups (other than aggregated statistical outputs falling within the Article 1 carve-out), has been [deleted / returned] in accordance with Article 9.4 of the DSA dated [DATE]. The deletion / return was completed on [DATE] by [NAME, ROLE] using ONE of the following methods (tick exactly one):*
>
> *— [ ] **NIST SP 800-88 Rev. 1 Clear** (logical sanitisation of user-addressable storage locations)*
> *— [ ] **NIST SP 800-88 Rev. 1 Purge** (sanitisation rendering data infeasible to recover by laboratory techniques)*
> *— [ ] **NIST SP 800-88 Rev. 1 Destroy** (physical destruction of media)*
> *— [ ] **Cryptographic erasure with key destruction** — encryption key shredded such that ciphertext is computationally unrecoverable; key-destruction evidence: [DESCRIBE]*
> *— [ ] **Vendor-attested erasure** — managed-cloud or storage vendor issued a deletion certificate; certificate ID: [CERTIFICATE_ID]; vendor: [VENDOR_NAME]*
>
> *Logs evidencing the operation are retained per Article 5.1(d) and available on the Ministry's request, including for the §9.4(c) post-attestation audit window. The Partner acknowledges the Ministry's right under §9.4(c) to verify this attestation within 10 business days of receipt and undertakes to cooperate with such verification.*
>
> *Where any retention is asserted under Article 9.5, this attestation lists the data, basis, and expiry [or — none asserted]."*
>
> *Signed: [NAME, ROLE], on behalf of [PARTNER_LEGAL_NAME], dated [DATE]."*

---

*— END OF DSA TEMPLATE v1 —*
