# Story 10.5: Data-Sharing Agreement Template + Consumer Onboarding SOP

Status: ready-for-dev

<!--
Created 2026-04-25 by Bob (SM) per SCP-2026-04-22 §A.5.

Legal artefact + operational runbook. Owners: Iris (DPIA / NDPA) + Gabe (legal review). Independent of all other Epic 10 stories.

CRITICAL prerequisite for `submissions:read_pii` partner-API scope provisioning per FR24 + ADR-019. Without a signed DSA on file, no partner can be granted PII access.

Sources:
  • PRD V8.3 FR24 + NFR10
  • Architecture Decision 3.4 (DSA precondition for `submissions:read_pii`) + ADR-019
  • UX Custom Component #16 ApiConsumerScopeEditor (UI enforces DSA precondition)
  • Epics.md §Story 10.5

FRC adjacent gate — DSA template DRAFTED is required for field-readiness.
-->

## Story

As **Iris (DPIA / NDPA owner) and Gabe (legal reviewer)**,
I want **a standard Data-Sharing Agreement template aligned with NDPA Article 25 plus a Consumer Onboarding SOP runbook**,
so that **the legal precondition for `submissions:read_pii` partner-API scope provisioning is satisfiable in days (not months) for incoming MDA partners, and the onboarding workflow is repeatable post-Transfer when Ministry ICT inherits operational responsibility**.

## Acceptance Criteria

1. **AC#1 — Data-Sharing Agreement template (DSA):** Word document + PDF rendering at `docs/legal/data-sharing-agreement-template-v1.docx` + `.pdf`. Sections (NDPA-aligned):
   - Parties (Oyo State Ministry of Trade Investment & Cooperatives + Partner MDA)
   - Recitals (purpose of agreement, NDPA Article 25 grounding)
   - Definitions (PII, Data Controller, Data Processor, Sub-Processor per NDPA terminology)
   - Scope of Processing (which scopes are granted, LGA scoping if applicable, time bounding)
   - Lawful Basis (NDPA Article 6(1) clause referenced; default Article 6(1)(e) Public Interest unless partner-specific)
   - Data Subject Rights (access, rectification, erasure, objection — partner's obligations to forward requests to Oyo Ministry within 5 business days)
   - Security Obligations (encryption, key rotation per NFR10, incident notification)
   - Sub-Processing (partner cannot sub-process without written consent; if granted, partner liable)
   - Audit Rights (Oyo Ministry can audit partner's use of data with 5 business days notice; quarterly mandatory audit during active relationship)
   - Breach Notification (24-hour notification if partner suspects compromise; 72-hour reporting per NDPA Article 47)
   - Termination (90-day notice; data deletion within 30 days of termination per NDPA Article 26)
   - Governing Law + Dispute Resolution (Nigerian law, Lagos arbitration)
   - **Schedule 1** — Per-Consumer Specifics: enumerates consumer organisation name, scopes granted, LGA scope, IP allowlist, key rotation cadence, DPIA reference (Baseline Report Appendix H section number), DSA effective date + expiry
   - **Schedule 2** — Technical Specifications: API base URL, scope catalogue with limits, error codes, contact for technical issues
   - **Schedule 3** — Operational Specifications: token delivery channel (per AC#3), incident contact, reporting cadence

2. **AC#2 — Iris + Gabe legal review sign-off:** DSA template reviewed by Iris (DPIA-perspective: NDPA compliance + DPIA cross-references) AND Gabe (legal-perspective: enforceability, governing law, dispute resolution). Sign-off captured as a `docs/legal/dsa-template-v1-signoff.md` document with reviewer names, dates, comments addressed, and next-review-date (annual minimum, or on regulatory change).

3. **AC#3 — Consumer Onboarding SOP runbook:** New document `docs/legal/consumer-onboarding-sop-v1.md`. Step-by-step from "request received via /developers form" through to "consumer in production with key in hand":

   ```
   STEP 1: Request Received
     - Trigger: partner submits request via /developers (Story 10-4) OR via direct email to support
     - Action: Super Admin creates a tracking ticket; logs in `consumer_onboarding_requests` (lightweight; could be a Notion/spreadsheet tracker; not a DB table for MVP)

   STEP 2: Initial Eligibility Review (1-3 business days)
     - Action: Super Admin reviews requested scopes; flags PII-bearing scope (`submissions:read_pii`) for full DSA process
     - Decision tree:
       - Aggregated/public scopes only (`aggregated_stats:read`, `marketplace:read_public`, `submissions:read_aggregated`) → fast-track to STEP 5 with simplified Schedule
       - PII-bearing scope (`submissions:read_pii`) OR sensitive scope (`registry:verify_nin`) → full DSA process (STEPS 3-4)

   STEP 3: DSA Drafting (3-5 business days)
     - Action: Super Admin populates DSA template Schedule 1 + 2 + 3 with partner-specific values
     - Required inputs from partner:
       - Organisation legal name + registration number
       - Authorised signatory name + role
       - Technical contact email + phone
       - Intended use case (1-paragraph summary)
       - Requested LGA scope (if any) — list of LGA codes
       - IP allowlist for partner backend
       - DPIA conducted by partner (if `submissions:read_pii`) — partner provides their DPIA OR uses Oyo's Schedule reference
     - Drafted DSA sent to partner for legal review

   STEP 4: Partner Legal Review + Signature (5-15 business days)
     - Partner reviews; raises questions; iterates with Oyo Ministry legal (Gabe)
     - On agreement: both parties sign (electronic signature or wet ink + scan)
     - Signed PDF uploaded to DigitalOcean Spaces; URL recorded
     - Two-person Ministry-ICT approval workflow per FR24:
       - Super Admin signs off on technical fit
       - Ministry ICT Lead signs off on PII access decision (recorded in audit log)

   STEP 5: API Key Provisioning (1 business day)
     - Action: Super Admin uses Story 10-3 Consumer Admin UI to:
       - Create `api_consumers` row with DSA URL referenced
       - Issue first `api_keys` row (180-day rotation per NFR10)
       - Configure scopes per Schedule 1 (with LGA + IP allowlist)
     - Token displayed exactly once; copied to clipboard
     - Token delivery to partner per AC#4

   STEP 6: Partner Integration (variable)
     - Partner integrates against documentation in /developers (Story 10-4)
     - Test calls verified via `aggregated_stats:read` scope first (no PII risk)
     - On success: production traffic begins
     - Quarterly health-check meetings scheduled

   STEP 7: Quarterly Review + Annual DSA Renewal
     - Quarterly: Super Admin reviews consumer activity (Story 10-6 dashboard); flags anomalies; partner provides usage report
     - Annual: DSA renewed (or terminated); rotation history reviewed; sub-processor list audited
   ```

4. **AC#4 — Token Delivery Channel:** SOP §STEP 5 specifies token delivery procedure. Two acceptable channels:
   - **Preferred:** PGP-encrypted email (operator + partner both have PGP keys; partner's public key on file in `consumer_onboarding_requests` tracker)
   - **Acceptable:** in-person handoff at Ministry HQ (printed token on paper, partner takes immediately, paper destroyed)
   - **NOT acceptable:** plain email (token would be readable by mail server admins), Slack/WhatsApp (third-party storage), SMS (SS7 vulnerability)
   - Channel choice + delivery date + recipient name captured in `audit_logs` with `action: 'api_key.delivered'`

5. **AC#5 — Quarterly DSA review cadence + annual renewal:**
   - Quarterly (every 3 months from DSA effective date): Super Admin reviews via Story 10-6 dashboard; partner provides usage report; both parties acknowledge any anomalies
   - Annual (every 12 months): full DSA renewal — sub-processor list audit, rotation cadence review, scope-need re-justification (especially `submissions:read_pii` — does partner still need it?)
   - Tracked in `consumer_onboarding_requests` tracker
   - Renewal failure (DSA lapses without renewal) → automated key revocation 7 days after expiry per NFR10 rotation logic — not silent; surfaces in Story 10-6 dashboard as critical alert

6. **AC#6 — Termination procedure:**
   - On termination (either party initiates with 90-day notice per AC#1 DSA section):
     - Super Admin disables consumer's keys (revoke; not delete) — partner's API access stops at termination date
     - Audit log captures termination event with reason
     - Within 30 days of termination per AC#1 DSA section: Oyo Ministry confirms partner has deleted Oyo data (partner attests in writing)
     - Partner's DSA stays on file for 7 years per NFR4.2 (audit retention)
     - Termination procedure documented in SOP runbook

7. **AC#7 — Cross-link to Baseline Report Appendix H DPIA:** DSA template Schedule 1 references "DPIA Section: see Baseline Report Appendix H §<X>" where <X> is the partner-specific DPIA section. Iris updates Baseline Report Appendix H to include a section per Epic-10-onboarded consumer (one section per consumer, even if scope is non-PII — for completeness).

8. **AC#8 — `consumer_onboarding_requests` tracker:** Lightweight tracker — NOT a DB table for MVP. Options:
   - Notion database (Awwal preferred — already uses Notion)
   - Google Sheets
   - Simple Markdown file at `docs/legal/consumer-onboarding-tracker.md` (lowest-tech; works without auth)
   - Pick: Markdown file initially; migrate to Notion when 5+ requests in tracker
   - Schema: request_id, partner_org, contact_email, requested_scopes, requested_lga_scope, status (received/in-review/dsa-drafted/dsa-signed/provisioned/active/terminated), notes

9. **AC#9 — Acceptance criteria verification:**
   - DSA template + DPIA-approver sign-off + SOP runbook all delivered
   - One end-to-end dry-run of the SOP using a hypothetical partner ("Test Partner — Lagos Tech Hub" requesting `marketplace:read_public` scope) — tests the SOP mechanics without real partner involvement
   - Tracker populated with the dry-run; all SOP steps executed; total elapsed time recorded as baseline

10. **AC#10 — Out-of-scope flagging:** Things explicitly NOT in this story:
    - DSA enforcement automation (auto-revoke on lapse is in NFR10 / Story 10-1; this story is the human/legal layer)
    - Partner self-service portal for DSA upload (manual via Super Admin for MVP — could be future enhancement)
    - Multi-language DSA (English only for MVP; Yoruba translation deferred)
    - Sub-processor approval workflow automation (manual review for MVP)

## Dependencies

- **No engineering story dependencies** — independent legal/operational track
- **Iris + Gabe availability** — only "blockers"; legal review is the rate-limiting step
- **Architecture ADR-019** — DSA precondition is the architectural requirement this story satisfies

**Unblocks:**
- **Story 10-1 PII scope provisioning** — without DSA template ready, no `submissions:read_pii` scope can be provisioned even if 10-1 is technically complete

## Field Readiness Certificate Impact

**Adjacent gate per SCP §5.3.1:** "DSA template DRAFTED" is required for field-readiness IF Epic 10 PII scope is to be provisioned during field operation. Field survey can launch without DSA template (no Epic 10 partner active during field), but as soon as field starts producing data + Ministry wants to grant any partner PII access, DSA template must be ready.

**Recommendation:** ship this story before Story 10-1 lands (independent track; Iris + Gabe are not on the engineering critical path).

## Tasks / Subtasks

### Task 1 — DSA template drafting (AC#1)

1.1. Iris drafts initial DSA from NDPA Article 25 template + Oyo Ministry standard contracts
1.2. Sections per AC#1 outline
1.3. Schedule 1/2/3 templates with placeholder fields
1.4. Output: `docs/legal/data-sharing-agreement-template-v1.docx` + `.pdf` (rendered)

### Task 2 — Legal review + sign-off (AC#2)

2.1. Iris reviews from DPIA / NDPA perspective
2.2. Gabe reviews from legal / enforceability perspective
2.3. Iterate; both sign off
2.4. Output: `docs/legal/dsa-template-v1-signoff.md`

### Task 3 — SOP runbook (AC#3, AC#4, AC#5, AC#6)

3.1. Awwal + Iris co-author SOP per AC#3 step structure
3.2. Token delivery channel section per AC#4
3.3. Quarterly review cadence + annual renewal per AC#5
3.4. Termination procedure per AC#6
3.5. Output: `docs/legal/consumer-onboarding-sop-v1.md`

### Task 4 — Baseline Report Appendix H cross-link (AC#7)

4.1. Iris updates Baseline Report Appendix H to include consumer-DPIA section template
4.2. DSA Schedule 1 references the Appendix H section

### Task 5 — Tracker setup (AC#8)

5.1. Create `docs/legal/consumer-onboarding-tracker.md` with schema header
5.2. Add to .gitignore? — depends on whether tracker entries are sensitive (probably keep in repo since metadata-only, no actual partner data)

### Task 6 — End-to-end dry-run (AC#9)

6.1. Hypothetical partner: "Test Partner — Lagos Tech Hub" requesting `marketplace:read_public`
6.2. Walk through STEPS 1-7 with mock data
6.3. Time each step; capture as Dev Notes evidence
6.4. Verify DSA template populates correctly with mock-partner Schedule 1 values

### Task 7 — Sprint status

7.1. Update `sprint-status.yaml`: `10-5-data-sharing-agreement-template: in-progress` → `review` (after legal sign-off) → `done`

## Technical Notes

### Why a legal artefact in an engineering sprint

Story 10-5 is engineering-adjacent: it does not produce code, but it gates code (10-1 PII scope). Treating it as a story (not just an "Iris task" in a side channel) ensures:
- Visibility in sprint planning (Bob/Awwal know this is a real dependency, not an afterthought)
- Cross-functional accountability (Iris + Gabe owners explicitly named)
- Audit trail (story is in implementation-artifacts; Change Log captures sign-off dates)
- Dependency tracking (Story 10-1 in sprint-status.yaml can declare 10-5 as blocking)

### NDPA Article 25 reference

Article 25 of the NDPA (Nigeria Data Protection Act) governs Data Processor obligations. Key requirements that translate into DSA sections:
- Article 25(1)(a): processing only on documented instructions of controller — DSA Scope section
- Article 25(1)(b): personnel committed to confidentiality — DSA Security section
- Article 25(1)(c): all NDPA Article 39 security measures — DSA Security section + Schedule 2
- Article 25(1)(d): no sub-processing without written consent — DSA Sub-Processing section
- Article 25(1)(e): assist controller with data subject requests — DSA Data Subject Rights section
- Article 25(1)(f): assist controller with breach notification — DSA Breach Notification section
- Article 25(1)(g): delete or return data on contract termination — DSA Termination section
- Article 25(1)(h): make available all info to demonstrate compliance — DSA Audit Rights section

The DSA template references Article 25 explicitly in the Recitals to make compliance traceable.

### Why English only for MVP

Yoruba translation requires legal-translator (NDPA terms must be precise). Cost + time exceed MVP budget. Future enhancement: bilingual DSA. For now, partner organisations onboarding for the partner API are MDAs with English-fluent legal teams — language is not the blocker.

### Why two-person Ministry ICT approval for PII scope

Per FR24 + Architecture Decision 3.4: `submissions:read_pii` is the highest-stakes scope. Single-person approval creates risk of:
- Social engineering (attacker convinces a single Super Admin to provision a malicious partner)
- Single-point-of-failure (departing Super Admin grants residual access)

Two-person approval (Super Admin + Ministry ICT Lead) requires collusion to abuse — substantially harder. The approval is captured in `audit_logs` with both actors' principal IDs.

### Why 180-day key rotation default

Per NFR10. Balance between operational overhead (longer rotation = less work) and exposure window (shorter rotation = less time for compromised key to be exploited). 180 days is the BSI / OWASP / NIST recommendation for moderately-sensitive APIs. Partners can request shorter rotation cadence (90 / 60 / 30 days); longer cadence requires Super Admin approval + risk acceptance memo.

## Risks

1. **Iris + Gabe availability is the rate-limiting step.** Engineering can ship Story 10-1 technically but cannot provision `submissions:read_pii` until DSA template is signed off. Mitigation: start this story early in parallel with engineering work; explicit dependency captured in 10-1 story file.
2. **Partner legal review timeline is uncontrollable.** Federal MDA legal departments operate on their own schedule; 5-15 business days per AC#3 STEP 4 is realistic but could stretch. Mitigation: SOP STEP 4 includes a "legal escalation" sub-step (Super Admin can escalate to Ministry ICT Lead → Permanent Secretary if delay exceeds 30 days).
3. **Termination data-deletion attestation is partner-self-reported.** Per AC#6, partner attests in writing to deletion within 30 days of termination. This is enforced by trust + audit, not by technical means. Mitigation: contractual liability + reputational risk are sufficient deterrents for Ministry-MDA relationships.
4. **DSA template may not satisfy partner-specific legal requirements.** Some partners may have their own template they want to use. Mitigation: SOP STEP 4 allows partner-supplied template; Gabe reviews; if equivalent in protections, accept (with Schedule 1/2/3 still mandatory as our addendum).
5. **Annual renewal cadence may slip as portfolio grows.** With 5+ active partners, renewal calendar needs to be a real calendar (not ad-hoc). Mitigation: when tracker has 5+ entries, migrate from Markdown to Notion (per AC#8); set automated calendar reminders.

## Dev Agent Record

### Agent Model Used

_(Populated when story enters dev — but for this story, "agent" is Iris + Gabe + Awwal, not a software engineer.)_

### Debug Log References

_(Not applicable — legal artefact.)_

### Completion Notes List

_(Populated during implementation.)_

### File List

**Created:**
- `docs/legal/data-sharing-agreement-template-v1.docx`
- `docs/legal/data-sharing-agreement-template-v1.pdf`
- `docs/legal/dsa-template-v1-signoff.md`
- `docs/legal/consumer-onboarding-sop-v1.md`
- `docs/legal/consumer-onboarding-tracker.md`

**Modified:**
- `_bmad-output/baseline-report/BASELINE-STUDY-REPORT-COMPLETE.md` (Appendix H — consumer-DPIA section template added by Iris)
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-04-25 | Story created by Bob (SM) per SCP-2026-04-22 §A.5. Status `ready-for-dev`. 10 ACs covering DSA template + legal sign-off + SOP runbook + token delivery channel + quarterly/annual review cadence + termination procedure + Baseline Report Appendix H cross-link + tracker setup + end-to-end dry-run + out-of-scope flagging. Owners: Iris (DPIA / NDPA) + Gabe (legal). | Independent track from engineering. CRITICAL prerequisite for `submissions:read_pii` scope provisioning per FR24 + ADR-019. FRC adjacent gate. |
