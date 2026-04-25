# OSLRS Transfer Protocol — Template (D2)

**Status:** Draft template for Ministry counter-signature. Requires review by a Nigerian-qualified legal practitioner before execution. This document is not legal advice; it is a structured instrument that captures the BOT commercial intent for legal review.

**Drafting basis:** Build-Operate-Transfer arrangement between **Lawal Awwal Akolade** ("the Builder") and **Oyo State Ministry of Trade, Investment and Co-operatives** ("the Ministry"), with the **Oyo State Government** ("the State") as ultimate beneficiary.

---

## 1. Preamble

This Transfer Protocol ("Protocol") is entered into at Ibadan, Oyo State, on the _________ day of ___________, 2026, between:

1. **Lawal Awwal Akolade**, of [ADDRESS], a software engineering practitioner, hereinafter referred to as "**the Builder**";

and

2. **The Honourable Commissioner**, Oyo State Ministry of Trade, Investment and Co-operatives, acting on behalf of the **Oyo State Government**, hereinafter referred to as "**the Ministry**."

Collectively referred to as "the Parties."

### Recitals

A. The Builder has, at the invitation and with the cooperation of the Ministry, designed, developed, deployed, and operated the **Oyo State Labour Registry System** ("**OSLRS**" or "**the System**"), a digital platform comprising a web application, backend services, databases, supporting infrastructure, and associated documentation.

B. The Parties agreed, in the spirit of a Build-Operate-Transfer ("BOT") arrangement, that the Builder would (i) build the System, (ii) operate it through an initial field-survey cycle, and (iii) transfer it to the Ministry upon completion of the Operate phase.

C. No prior written agreement formalising the BOT arrangement has been executed between the Parties. The Parties wish now to reduce the transfer arrangement to written form to:
   - define what is transferring, in what form, and on what date;
   - allocate post-transfer responsibilities, liabilities, and support obligations;
   - preserve the Builder's reputational and methodological interests that properly survive transfer; and
   - provide a predictable framework for incidents, disputes, and changes of administration.

NOW THEREFORE, in consideration of the mutual covenants set out below, the Parties agree as follows.

---

## 2. Definitions

| Term | Meaning |
|---|---|
| **"Effective Date"** | The date of execution of this Protocol by both Parties. |
| **"Transfer Date"** | The date on which the Ministry formally accepts the System and the assets listed in Schedule 1, as confirmed by signature on a Transfer Acceptance Certificate (Schedule 5). |
| **"System"** | The OSLRS web application, API, databases, infrastructure configuration, source code, documentation, and all assets enumerated in Schedule 1. |
| **"Methodology"** | The design patterns, architectural approaches, development workflows, documentation templates, and reusable artefacts (including but not limited to the "Portable Playbook") developed by the Builder in the course of building the System. |
| **"Confidential Information"** | Non-public information belonging to either Party, including but not limited to personal data of citizens processed by the System. |
| **"Personal Data"** | As defined in the Nigeria Data Protection Act, 2023 ("NDPA"). |
| **"Field Survey"** | The first operational data-collection cycle conducted using the System during the Operate phase. |
| **"Incident"** | An unplanned interruption, degradation, or security event affecting the System in production. |

---

## 3. Scope of Transfer

### 3.1 Assets transferring

Schedule 1 enumerates every asset transferring under this Protocol, including:

- Source code repositories (including commit history, branches, and issue history)
- Production databases and their schemas
- Domain names and DNS records
- Third-party service accounts (DigitalOcean, Cloudflare, Tailscale, Resend, hCaptcha, etc.)
- Credentials and secrets
- All documentation including the Operations Runbook, Technical Architecture Document, API Documentation, per-role Operations Manuals, DPIA, and incident templates
- The Transition Dossier

Each asset in Schedule 1 is marked with its ownership *before* the Transfer Date and its ownership *after* the Transfer Date.

### 3.2 Assets not transferring (retained by Builder)

The following are expressly **not** transferred under this Protocol and remain the sole property of the Builder:

- The **Methodology** (per Section 2), including the Portable Playbook and any reusable framework derived from but separable from the System
- Generic libraries, patterns, and boilerplate developed by the Builder prior to or independently of this engagement
- The Builder's professional reputation, case studies, publications, portfolio materials, and curriculum vitae
- The Builder's right to reference the engagement publicly, subject to Section 9 (Confidentiality) and Section 10 (Attribution)

### 3.3 Licence to Methodology

The Builder grants the Ministry a **non-exclusive, perpetual, royalty-free, non-transferable licence** to use the Methodology solely for the continued operation, maintenance, and incremental enhancement of the System as transferred. The Ministry may not sub-licence, sell, or distribute the Methodology.

---

## 4. Transfer Conditions and Acceptance

### 4.1 Conditions precedent to transfer

The Transfer Date shall occur only after the following are complete:

- The Field Survey has been conducted and its results documented in the Field Survey Report
- The DPIA has been filed with the Nigeria Data Protection Commission (NDPC) and any remedial findings addressed
- All documentation enumerated in Schedule 2 has been delivered to the Ministry
- The Ministry has nominated one or more technical personnel to receive credential handover and to serve as the System's day-to-day custodians
- Any security findings classified Critical or High in the most recent security assessment have been remediated

### 4.2 Transfer Acceptance Certificate

On the Transfer Date, the Parties shall execute a Transfer Acceptance Certificate (Schedule 5) confirming:

- Receipt of all assets in Schedule 1
- Receipt of all documentation in Schedule 2
- Acknowledgment of the Ministry's post-transfer responsibilities (Section 5)

### 4.3 Transfer is irrevocable except for defects

Upon execution of the Transfer Acceptance Certificate, ownership and operational responsibility transfer to the Ministry. The Builder is not obligated to accept back any asset, except where an explicit defect existed at the Transfer Date and was not disclosed.

---

## 5. Post-Transfer Responsibilities

### 5.1 Ministry responsibilities

From the Transfer Date, the Ministry assumes responsibility for:

- All operation, maintenance, hosting costs, and infrastructure charges
- NDPA compliance as data controller (the Ministry is already the data controller; this confirms operational responsibility transfers)
- Incident response, subject to the Builder's retainer obligation in Section 6
- Personnel, training, and continuity planning
- Any modification, enhancement, or replacement of the System

### 5.2 Builder responsibilities

From the Transfer Date, the Builder's ongoing responsibilities are limited to:

- Incident-support retainer per Section 6
- Survival obligations per Section 14

The Builder has no obligation to provide feature development, routine operations, user training, or helpdesk services after the Transfer Date, except pursuant to a separate written agreement.

---

## 6. Incident Support Retainer

### 6.1 Scope

The Builder shall be available for **Incident support** for a period of **twelve (12) months** following the Transfer Date ("Retainer Period").

"Incident support" is limited to:

- Diagnostic advice on production outages or security events
- Root-cause analysis for events originating from code or infrastructure delivered under this engagement
- Consultation on remediation steps

It expressly does **not** include:

- New feature development
- Changes introduced by the Ministry or its agents after the Transfer Date
- Training, user support, or routine operations
- Issues caused by the Ministry's failure to apply patches or updates recommended by the Builder

### 6.2 Rate and cap

- Hourly rate: **NGN [RATE]** per hour, invoiced in quarter-hour increments
- Annual cap: **[HOURS]** hours during the Retainer Period
- Hours in excess of the cap are at the Builder's discretion and subject to separate rate agreement

### 6.3 Response targets

| Severity | Response target (business hours) |
|---|---|
| **Critical** (System fully unavailable or active security breach) | Within 4 hours of written report |
| **High** (Major functionality impaired) | Within 1 business day |
| **Medium / Low** | Within 3 business days |

"Business hours" are 09:00–17:00 WAT, Monday to Friday, excluding Nigerian public holidays.

### 6.4 Invoicing and payment

The Builder shall invoice monthly for hours consumed. Payment is due within thirty (30) days of invoice. Interest at 1% per month accrues on overdue amounts.

### 6.5 Termination of retainer

The Retainer Period terminates automatically at twelve (12) months after the Transfer Date, or earlier by mutual written agreement, or immediately upon material breach by the Ministry.

---

## 7. Data Protection and NDPA Obligations

### 7.1 Controller/processor designation

Throughout the Build and Operate phases, the Ministry is the **data controller** for Personal Data processed by the System. The Builder has acted as **data processor** on the Ministry's instructions.

This designation survives the Transfer Date. The Builder ceases to be a data processor on the Transfer Date except to the extent incident-support work (Section 6) requires processing, in which case the Builder resumes processor status for the duration of the relevant incident only.

### 7.2 Liability allocation

- **Pre-Transfer-Date liability** for processing acts or omissions is borne by the Ministry as data controller, except to the extent directly caused by the Builder's gross negligence or wilful misconduct as processor.
- **Post-Transfer-Date liability** is borne exclusively by the Ministry.

### 7.3 DPIA and Records of Processing Activities

The Builder shall deliver the DPIA and RoPA (Records of Processing Activities) as part of the Transfer deliverables. The Ministry shall file the DPIA with NDPC and maintain the RoPA thereafter.

### 7.4 Data subject rights

Post-Transfer-Date, the Ministry is solely responsible for handling data subject rights requests (access, rectification, erasure, objection, portability).

---

## 8. Exit and Shutdown

### 8.1 Disposition upon Ministry cessation of operations

If the Ministry ceases to operate the System for any reason after the Transfer Date, the Ministry shall:

- Notify affected data subjects per NDPA
- Securely dispose of Personal Data per the retention schedule in the DPIA
- Notify the Builder in writing within thirty (30) days of the decision

### 8.2 Right of first refusal on abandonment

If the Ministry decides to decommission the System, the Builder shall have a right of first refusal, exercisable within sixty (60) days of written notice, to acquire the System (excluding Personal Data, which must be disposed of per 8.1) for the purposes of continued operation at the Builder's own expense for non-governmental purposes, subject to renegotiated data-protection terms.

---

## 9. Confidentiality

### 9.1 Duration

Each Party shall keep the other's Confidential Information confidential during the engagement and for three (3) years after the Transfer Date, save for Personal Data which is governed by indefinite NDPA obligations.

### 9.2 Permitted disclosure

The Builder may disclose, in professional contexts, the fact of the engagement, its general scope, and its publicly visible outputs (the live System, published case studies, press releases), subject to Section 10.

---

## 10. Attribution

### 10.1 Codebase attribution

The Builder's name shall remain present in the codebase README, package metadata (where applicable), and in the "About" or equivalent section of the System's administrative interface. Removal of this attribution is a breach of this Protocol.

### 10.2 Public attribution

The Ministry shall, where it publicly discusses the System (speeches, press releases, reports, presentations, ribbon-cuttings), acknowledge the Builder's role as the lead developer of the pilot, at the level of detail appropriate to the venue.

### 10.3 Case studies and publications

The Builder retains the right to author and publish case studies, technical articles, and academic papers about the engagement, subject only to:

- The confidentiality obligations in Section 9
- No disclosure of Personal Data
- A right of review (not approval) by the Ministry of any material that names individual Ministry officers, exercised within thirty (30) days of receipt of the draft. Silence for thirty days constitutes assent.

---

## 11. Non-Disparagement and Non-Circumvention

### 11.1 Mutual non-disparagement

Neither Party shall make public statements that are materially disparaging of the other in connection with the engagement. Good-faith technical criticism, peer review, and regulatory disclosures are not breaches of this clause.

### 11.2 Non-circumvention (Ministry undertaking)

The Ministry shall not:

- Solicit the Builder's employees or sub-contractors (if any) for two (2) years after the Transfer Date
- Use the documentation delivered under this Protocol to onboard a replacement contractor in a manner that misrepresents authorship of the prior work

### 11.3 Non-circumvention (Builder undertaking)

The Builder shall not solicit direct engagements with Ministry staff, parastatals, or subordinate MDAs on matters substantially similar to OSLRS for one (1) year after the Transfer Date without the Ministry's written consent.

---

## 12. Representations and Warranties

### 12.1 Builder warranties

The Builder warrants that, as of the Effective Date:

- The Builder has the right and authority to enter into this Protocol
- To the Builder's knowledge, the System does not knowingly infringe any third-party intellectual property rights
- The System has been developed in accordance with applicable Nigerian law known to apply, including NDPA 2023

### 12.2 Ministry warranties

The Ministry warrants that:

- The Ministry has obtained all internal authorities necessary to enter into this Protocol on behalf of the State
- The Ministry has the legal capacity to receive the assets transferred

### 12.3 Disclaimer

Except as expressly set out, the System is transferred on an "as-is" basis. The Builder makes no warranty as to fitness for any purpose beyond the pilot objectives documented in the Field Survey Report.

---

## 13. Limitation of Liability

### 13.1 Cap

The aggregate liability of the Builder to the Ministry, for all claims arising under or in connection with this Protocol, shall not exceed **the total amount actually paid to the Builder by the Ministry under the incident-support retainer in the twelve months preceding the claim.** If no retainer fees have been paid, liability is capped at **NGN [NOMINAL AMOUNT]**.

### 13.2 Excluded damages

Neither Party shall be liable for indirect, consequential, or punitive damages, loss of business, or loss of reputation, save in cases of gross negligence, wilful misconduct, or breach of confidentiality obligations.

### 13.3 Carve-outs

The liability cap does not apply to:

- Breach of confidentiality
- NDPA-related liabilities expressly allocated in Section 7
- The Ministry's obligation to pay invoiced retainer fees

---

## 14. Survival

The following provisions survive the Transfer Date and any termination of this Protocol:

- Section 3 (Scope of Transfer, including Methodology retention)
- Section 7 (Data Protection, as specified)
- Section 9 (Confidentiality)
- Section 10 (Attribution)
- Section 11 (Non-disparagement and Non-circumvention)
- Section 13 (Limitation of Liability)
- Section 14 (Survival)
- Section 15 (Dispute Resolution)
- Section 16 (Governing Law)

---

## 15. Dispute Resolution

### 15.1 Escalation

Any dispute arising under this Protocol shall first be escalated in good faith to designated representatives of each Party for discussion for a period of thirty (30) days.

### 15.2 Mediation

If not resolved by escalation, the dispute shall be referred to mediation under the auspices of the **Lagos Multi-Door Courthouse** or equivalent accredited mediation body in Ibadan, Oyo State.

### 15.3 Arbitration or court

If mediation does not resolve the dispute within sixty (60) days of referral, either Party may elect to:

- Refer the matter to arbitration under the Arbitration and Mediation Act, 2023, before a single arbitrator in Ibadan, Oyo State; **or**
- Pursue the matter before the High Court of Oyo State, which shall have non-exclusive jurisdiction.

Election of arbitration by one Party obliges the other to proceed to arbitration.

---

## 16. Governing Law

This Protocol is governed by the laws of the Federal Republic of Nigeria, with specific reference to:

- The Constitution of the Federal Republic of Nigeria, 1999 (as amended)
- The Nigeria Data Protection Act, 2023
- The Freedom of Information Act, 2011
- The Stamp Duties Act (as applicable to this instrument)
- Any other applicable Oyo State legislation

---

## 17. Miscellaneous

### 17.1 Entire agreement

This Protocol, together with its Schedules, constitutes the entire agreement between the Parties as to its subject matter and supersedes any prior oral understandings.

### 17.2 Amendment

Amendments require written agreement signed by both Parties.

### 17.3 Assignment

Neither Party may assign its rights or obligations without the other's written consent, save that the Ministry may reassign the benefit of the Protocol to a successor MDA within the Oyo State Government on written notice.

### 17.4 Severability

If any provision is held unenforceable, the remainder continues in full force.

### 17.5 Notices

Notices shall be in writing and delivered to:

- Builder: [EMAIL] and [POSTAL ADDRESS]
- Ministry: [OFFICE OF THE COMMISSIONER, MINISTRY ADDRESS]

### 17.6 Counterparts

This Protocol may be executed in counterparts, including by electronic signature, each of which shall be deemed an original.

### 17.7 Stamp duty

The Parties shall cooperate to procure stamping of this instrument at the applicable nominal rate under the Stamp Duties Act. Stamping costs shall be borne by the Ministry.

---

## Execution

IN WITNESS WHEREOF the Parties have executed this Protocol on the date first written above.

### For the Builder

Signed: _________________________________

Name: **Lawal Awwal Akolade**

Date: __________________

Witness:

Signed: _________________________________

Name: _________________________________

Designation: _________________________________

Date: __________________

### For the Ministry

Signed: _________________________________

Name: _________________________________

Designation: **Honourable Commissioner, Ministry of Trade, Investment and Co-operatives**

Date: __________________

Counter-signed:

Signed: _________________________________

Name: _________________________________

Designation: **Permanent Secretary**

Date: __________________

Counter-signed:

Signed: _________________________________

Name: _________________________________

Designation: **Head, State ICT / Bureau for Information Systems**

Date: __________________

---

## Schedules (to be completed before execution)

- **Schedule 1** — Asset Enumeration and Ownership Map (repositories, credentials, domains, third-party accounts, with before/after ownership)
- **Schedule 2** — Documentation Deliverables List (runbook, architecture doc, API docs, operations manuals, DPIA, RoPA, incident templates, exit plan, transition dossier)
- **Schedule 3** — Critical Contact List (emergency contacts for Ministry, Builder, third-party vendors, NDPC, hosting providers)
- **Schedule 4** — Retainer Rate Card (confirming hourly rate, hours cap, invoicing address)
- **Schedule 5** — Transfer Acceptance Certificate (template to be executed on the Transfer Date)

---

## Drafting notes (to be removed before execution)

1. **This template must be reviewed by a Nigerian-qualified legal practitioner before being presented to the Ministry for signature.** It captures commercial intent but has not been lawyer-reviewed.
2. Monetary amounts (retainer rate, annual cap, nominal liability cap) are left as placeholders and must be filled before presentation.
3. The Ministry's actual legal name must be verified — the correct title of the parent ministry may differ from "Ministry of Trade, Investment and Co-operatives." Confirm from government publications or the Ministry's letterhead before execution.
4. If a prior procurement process was conducted and records exist, recite that procurement in the Preamble. The current draft assumes no such records exist.
5. The Stamp Duties Act clause may benefit from prior confirmation with the Federal Inland Revenue Service on whether this instrument attracts ad valorem or nominal stamping.
6. Consider whether a separate Data Processing Agreement (DPA) is needed as a sub-instrument under Section 7, particularly if the Builder will continue to process Personal Data during incident support.

---

*Template prepared: 2026-04-21. To be revised after legal review and after Ministry indicates willingness to counter-sign.*
