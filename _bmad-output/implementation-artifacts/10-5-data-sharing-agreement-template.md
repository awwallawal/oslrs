# Story 10.5: Data-Sharing Agreement Template + Consumer Onboarding SOP

Status: review (awaiting real-Iris + real-Gabe ratification of AI-agent persona drafts)

<!--
Created 2026-04-25 by impostor-SM agent per SCP-2026-04-22 §A.5.

Legal artefact + operational runbook. Owners: Iris (DPIA / NDPA) + Gabe (legal review). Independent of all other Epic 10 stories.

CRITICAL prerequisite for `submissions:read_pii` partner-API scope provisioning per FR24 + ADR-019. Without a signed DSA on file, no partner can be granted PII access.

Sources:
  • PRD V8.3 FR24 + NFR10
  • Architecture Decision 3.4 (DSA precondition for `submissions:read_pii`) + ADR-019
  • UX Custom Component #16 ApiConsumerScopeEditor (UI enforces DSA precondition)
  • Epics.md §Story 10.5 (under Epic 10 starting at line 2542)

FRC adjacent gate — DSA template DRAFTED is required for field-readiness.

Validation pass 2026-04-29 (Bob, fresh-context mode 2 per `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`): rebuilt to canonical template structure; all 10 ACs preserved verbatim; one minor codebase fix (docs/legal/ directory does not exist — flagged in Project Structure Notes as "directory new"); cross-references to ADR-019 + Architecture Decision 3.4 + Baseline Report Appendix H verified.
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
   - Channel choice + delivery date + recipient name captured in `audit_logs` with `action: 'api_key.delivered'` (via `AuditService.logAction()` per `apps/api/src/services/audit.service.ts:226`; new audit action to be added to `AUDIT_ACTIONS` const at `audit.service.ts:35-64` by Story 10-1 or 10-3, whichever ships first)

5. **AC#5 — Quarterly DSA review cadence + annual renewal:**
   - Quarterly (every 3 months from DSA effective date): Super Admin reviews via Story 10-6 dashboard; partner provides usage report; both parties acknowledge any anomalies
   - Annual (every 12 months): full DSA renewal — sub-processor list audit, rotation cadence review, scope-need re-justification (especially `submissions:read_pii` — does partner still need it?)
   - Tracked in `consumer_onboarding_requests` tracker (per AC#8)
   - Renewal failure (DSA lapses without renewal) → automated key revocation 7 days after expiry per NFR10 rotation logic — not silent; surfaces in Story 10-6 dashboard as critical alert

6. **AC#6 — Termination procedure:**
   - On termination (either party initiates with 90-day notice per AC#1 DSA section):
     - Super Admin disables consumer's keys (revoke; not delete) — partner's API access stops at termination date
     - Audit log captures termination event with reason
     - Within 30 days of termination per AC#1 DSA section: Oyo Ministry confirms partner has deleted Oyo data (partner attests in writing)
     - Partner's DSA stays on file for 7 years per NFR4.2 (audit retention)
     - Termination procedure documented in SOP runbook

7. **AC#7 — Cross-link to Baseline Report Appendix H DPIA:** DSA template Schedule 1 references "DPIA Section: see Baseline Report Appendix H §<X>" where <X> is the partner-specific DPIA section. Iris updates Baseline Report Appendix H (file `_bmad-output/baseline-report/BASELINE-STUDY-REPORT-COMPLETE.md` — verified to exist 2026-04-29) to include a section per Epic-10-onboarded consumer (one section per consumer, even if scope is non-PII — for completeness).

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

## Tasks / Subtasks

- [x] **Task 1 — DSA template drafting** (AC: #1)
  - [x] 1.1 Iris drafts initial DSA from NDPA Article 25 template + Oyo Ministry standard contracts
  - [x] 1.2 Sections per AC#1 outline
  - [x] 1.3 Schedule 1/2/3 templates with placeholder fields
  - [x] 1.4 Output: `docs/legal/data-sharing-agreement-template-v1.docx` + `.pdf` (rendered). **Note:** `docs/legal/` directory does NOT exist — create alongside this file. *(AI agent in Iris persona drafted v1 as canonical markdown source at `docs/legal/data-sharing-agreement-template-v1.md`. `.docx` and `.pdf` rendering deferred to real-Iris/real-Gabe post-ratification — pandoc commands documented at top of the .md file. Real-Iris ratification gates the binary rendering since the .docx is the partner-facing artefact.)*

- [x] **Task 2 — Legal review + sign-off** (AC: #2)
  - [x] 2.1 Iris reviews from DPIA / NDPA perspective *(AI-agent Iris-persona pass complete; review checklist in dsa-template-v1-signoff.md "Iris perspective" column.)*
  - [x] 2.2 Gabe reviews from legal / enforceability perspective *(AI-agent Gabe-persona pass complete; 6 Medium + 4 Low findings produced — M1 arbitration disambiguation / M2 quarterly attestation consequence / M3 DSR assistance window / M4 amendment-friction with quarterly Schedule 1 refreshes / M5 liability-cap framing for non-fee-bearing programme / M6 PII 6-month auto-renewal / L1–L4 see signoff file.)*
  - [x] 2.3 Iterate; both sign off *(AI-agent personas signed off conditionally — APPROVED-WITH-MEDIUM-FIXES — pending real-human ratification gate.)*
  - [x] 2.4 Output: `docs/legal/dsa-template-v1-signoff.md` *(Created. Status: PENDING-REAL-HUMAN-RATIFICATION.)*

- [x] **Task 3 — SOP runbook** (AC: #3, #4, #5, #6)
  - [x] 3.1 Awwal + Iris co-author SOP per AC#3 step structure (STEPS 1-7)
  - [x] 3.2 Token delivery channel section per AC#4
  - [x] 3.3 Quarterly review cadence + annual renewal per AC#5
  - [x] 3.4 Termination procedure per AC#6
  - [x] 3.5 Output: `docs/legal/consumer-onboarding-sop-v1.md` *(Authored by AI agent in Iris+Awwal persona. Includes STEPS 1–7 + Token Delivery Channel section (Channel A PGP / Channel B in-person + explicit NOT-acceptable list) + quarterly review cadence + annual renewal procedure + termination procedure + escalation paths + linked references.)*

- [x] **Task 4 — Baseline Report Appendix H cross-link** (AC: #7)
  - [x] 4.1 Iris updates `_bmad-output/baseline-report/BASELINE-STUDY-REPORT-COMPLETE.md` Appendix H to include consumer-DPIA section template *(Added §H.8 Per-Consumer DPIA Template after the existing §H.7 DPIA Conclusion. §H.8.1 is the per-consumer markdown template; §H.8.2 the section-number allocation table; §H.8.3 the maintenance cadence.)*
  - [x] 4.2 DSA Schedule 1 references the Appendix H section *(DSA Schedule 1 §2 PII row references "Appendix H §[APPENDIX_H_SECTION_NUMBER]"; Recital E grounds the cross-reference.)*

- [x] **Task 5 — Tracker setup** (AC: #8)
  - [x] 5.1 Create `docs/legal/consumer-onboarding-tracker.md` with schema header *(Created. 19-column schema; first row populated with the AC#9 dry-run.)*
  - [x] 5.2 Decide gitignore status — depends on whether tracker entries are sensitive (probably keep in repo since metadata-only, no actual partner data) *(Decision: KEEP IN REPO. Tracker is metadata-only; signed DSA PDFs themselves live in S3 not the repo. Documented at top of tracker.)*

- [x] **Task 6 — End-to-end dry-run** (AC: #9)
  - [x] 6.1 Hypothetical partner: "Test Partner — Lagos Tech Hub" requesting `marketplace:read_public`
  - [x] 6.2 Walk through STEPS 1-7 with mock data
  - [x] 6.3 Time each step; capture as Completion Notes evidence *(Captured in `docs/legal/dry-run-2026-05-03-test-partner-lagos-tech-hub.md` — paper-exercise total 40 min; wall-clock estimate 5–8 business days for public-track / 15–25 business days for PII-track.)*
  - [x] 6.4 Verify DSA template populates correctly with mock-partner Schedule 1 values *(All Schedule 1/2/3 fields populated cleanly. 5 dry-run findings DR-1 to DR-5 captured for v1.1 incorporation alongside Gabe's M1–M6.)*

- [x] **Task 7 — Sprint status** (AC: cross-cutting)
  - [x] 7.1 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: `10-5-data-sharing-agreement-template: in-progress` → `review` (after legal sign-off) → `done` *(Flipped to `review`. The `done` flip awaits real-Iris + real-Gabe ratification of the v1 sign-off doc OR incorporation of the M1–M6 + DR-1–DR-5 findings into a v1.1 round.)*

## Dev Notes

### Dependencies

- **No engineering story dependencies** — independent legal/operational track
- **Iris + Gabe availability** — only "blockers"; legal review is the rate-limiting step
- **Architecture ADR-019** (`_bmad-output/planning-artifacts/architecture.md:3179`) — DSA precondition is the architectural requirement this story satisfies

**Unblocks:**
- **Story 10-1 PII scope provisioning** — without DSA template ready, no `submissions:read_pii` scope can be provisioned even if 10-1 is technically complete

### Field Readiness Certificate Impact

**Adjacent gate per SCP §5.3.1:** "DSA template DRAFTED" is required for field-readiness IF Epic 10 PII scope is to be provisioned during field operation. Field survey can launch without DSA template (no Epic 10 partner active during field), but as soon as field starts producing data + Ministry wants to grant any partner PII access, DSA template must be ready.

**Recommendation:** ship this story before Story 10-1 lands (independent track; Iris + Gabe are not on the engineering critical path).

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

### Risks

1. **Iris + Gabe availability is the rate-limiting step.** Engineering can ship Story 10-1 technically but cannot provision `submissions:read_pii` until DSA template is signed off. Mitigation: start this story early in parallel with engineering work; explicit dependency captured in 10-1 story file.
2. **Partner legal review timeline is uncontrollable.** Federal MDA legal departments operate on their own schedule; 5-15 business days per AC#3 STEP 4 is realistic but could stretch. Mitigation: SOP STEP 4 includes a "legal escalation" sub-step (Super Admin can escalate to Ministry ICT Lead → Permanent Secretary if delay exceeds 30 days).
3. **Termination data-deletion attestation is partner-self-reported.** Per AC#6, partner attests in writing to deletion within 30 days of termination. This is enforced by trust + audit, not by technical means. Mitigation: contractual liability + reputational risk are sufficient deterrents for Ministry-MDA relationships.
4. **DSA template may not satisfy partner-specific legal requirements.** Some partners may have their own template they want to use. Mitigation: SOP STEP 4 allows partner-supplied template; Gabe reviews; if equivalent in protections, accept (with Schedule 1/2/3 still mandatory as our addendum).
5. **Annual renewal cadence may slip as portfolio grows.** With 5+ active partners, renewal calendar needs to be a real calendar (not ad-hoc). Mitigation: when tracker has 5+ entries, migrate from Markdown to Notion (per AC#8); set automated calendar reminders.

### Project Structure Notes

- **This story produces no code.** All deliverables are documentation artefacts (DSA template, SOP runbook, sign-off doc, tracker) plus a Baseline Report appendix update.
- **NEW directory `docs/legal/` does NOT exist** as of 2026-04-29; create alongside the first file (e.g. `Task 1.4` creates the .docx + .pdf). Standard `docs/` subdirectory pattern (peers: `docs/infrastructure-cicd-playbook.md`, `docs/emergency-recovery-runbook.md`, `docs/team-context-brief.md`, `docs/account-migration-tracker.md`, `docs/transfer-protocol-schedule-1-asset-enumeration.md`, etc.).
- **Baseline Report Appendix H** at `_bmad-output/baseline-report/BASELINE-STUDY-REPORT-COMPLETE.md` (verified to exist 2026-04-29). Iris's edit (Task 4.1) appends a per-consumer DPIA section template; existing Appendix H structure preserved.
- **Architecture cross-references**:
  - ADR-019 (`_bmad-output/planning-artifacts/architecture.md:3179`) — DSA precondition formalised; this story is the artefact-side of that decision
  - Architecture Decision 3.4 — DSA precondition for `submissions:read_pii`; two-person approval; 180-day rotation
- **Audit log integration** — when API keys are eventually delivered (AC#4 — happens during Story 10-1 or 10-3 implementation, not this story), the delivery event uses `AuditService.logAction({ action: 'api_key.delivered', ... })` per `apps/api/src/services/audit.service.ts:226`. New audit action `API_KEY_DELIVERED: 'api_key.delivered'` added to `AUDIT_ACTIONS` const (`audit.service.ts:35-64`) by whichever Epic-10 story implements key issuance first (10-1 or 10-3). NOT this story's responsibility — this story only documents the audit-action contract.
- **Tracker file lives in repo** (per AC#8). `docs/legal/consumer-onboarding-tracker.md` is metadata-only (no actual partner-data PII); safe to commit. Migration to Notion happens when tracker exceeds 5 active rows (AC#8 trigger).
- **DSA versioning**: file naming uses `-v1` suffix (`data-sharing-agreement-template-v1.docx` + `dsa-template-v1-signoff.md`). Future amendments produce `-v2`, etc. — preserves audit trail of which DSA version a partner signed.
- **Cross-story commitments tracked elsewhere**:
  - Story 10-1 (`_bmad-output/implementation-artifacts/10-1-consumer-auth-layer.md`) — declares 10-5 as blocking dependency for `submissions:read_pii` scope
  - Story 10-3 (`_bmad-output/implementation-artifacts/10-3-consumer-admin-ui.md`) — UI gate on DSA precondition (UX Custom Component #16 ApiConsumerScopeEditor)
  - Story 10-4 — `/developers` self-service request form
  - Story 10-6 — quarterly review dashboard
- **NEW directories created by this story**:
  - `docs/legal/` (with all 5 deliverable files)

### References

- Architecture ADR-019 (Partner-API DSA precondition — the decision this story implements): [Source: _bmad-output/planning-artifacts/architecture.md:3179]
- Architecture Decision 3.4 (DSA precondition for `submissions:read_pii`, two-person approval, 180-day rotation): [Source: _bmad-output/planning-artifacts/architecture.md Decision 3.4]
- Epics — Epic 10 entry: [Source: _bmad-output/planning-artifacts/epics.md:2542]
- PRD V8.3 — FR24 (DSA precondition for PII partner scope): [Source: _bmad-output/planning-artifacts/PRD.md FR24]
- PRD V8.3 — NFR10 (180-day key rotation): [Source: _bmad-output/planning-artifacts/PRD.md NFR10]
- PRD V8.3 — NFR4.2 (7-year audit retention; DSA-on-file longevity): [Source: _bmad-output/planning-artifacts/PRD.md NFR4.2]
- UX Custom Component #16 ApiConsumerScopeEditor (UI enforces DSA precondition): [Source: _bmad-output/planning-artifacts/ux-design-specification.md §Components #16]
- Baseline Report Appendix H (DPIA cross-link target — verified to exist): [Source: _bmad-output/baseline-report/BASELINE-STUDY-REPORT-COMPLETE.md Appendix H]
- Audit service `logAction` API (for `api_key.delivered` event when issued by 10-1 / 10-3): [Source: apps/api/src/services/audit.service.ts:226]
- Audit service `AUDIT_ACTIONS` const (extension point for new actions): [Source: apps/api/src/services/audit.service.ts:35-64]
- Story 10-1 (downstream consumer of this template): [Source: _bmad-output/implementation-artifacts/10-1-consumer-auth-layer.md]
- Story 10-3 (downstream consumer — Consumer Admin UI with DSA precondition gate): [Source: _bmad-output/implementation-artifacts/10-3-consumer-admin-ui.md]
- NDPA (Nigeria Data Protection Act) Article 25 — Data Processor obligations: external regulatory reference
- NDPA Article 26 — Termination data deletion: external regulatory reference
- NDPA Article 39 — Security of processing: external regulatory reference
- NDPA Article 47 — Breach notification: external regulatory reference
- NDPA Article 6(1)(e) — Public Interest lawful basis: external regulatory reference
- MEMORY.md project pattern: process patterns + handover strategy: [Source: MEMORY.md "Hand-off strategy: TURNKEY PACKAGE"]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (1M context), acting in role-play as the Iris (DPIA / NDPA Counsel) and Gabe (Legal & Documentation Reviewer) personas defined in `docs/session-2026-04-21-25.md:226-237`. AI-agent persona drafts are explicitly NOT real-human sign-off; the `dsa-template-v1-signoff.md` document remains in `PENDING-REAL-HUMAN-RATIFICATION` state until real-Iris and real-Gabe ratify or amend.

### Debug Log References

- Story 10-5 has no executable artefacts — debug logs do not apply.
- AC#9 dry-run captured in `docs/legal/dry-run-2026-05-03-test-partner-lagos-tech-hub.md` — paper exercise, no real Partner data, no real API key issued.

### Completion Notes List

**DSA template version:** v1. Future amendments increment to v1.1, v2, etc. The v1.1 round is pre-scoped via the Gabe sign-off doc Appendix (M1–M6 fixes + SOP edits per M2/M4/M6).

**Iris + Gabe sign-off dates:** `pending real-human ratification` — the `dsa-template-v1-signoff.md` document is fully populated by AI personas with concrete review findings, but the human signature blocks remain blank by design. Real-Iris reviews the 6 Medium findings; real-Gabe ratifies the resulting v1.1 (or counter-proposes a v1).

**End-to-end SOP dry-run timing per step:** captured in `docs/legal/dry-run-2026-05-03-test-partner-lagos-tech-hub.md`. Paper-exercise total 40 minutes. Wall-clock realistic minimum:
- Public-track: 5–8 business days
- Sensitive-track (e.g. `registry:verify_nin`): 8–14 business days
- PII-track: 15–25 business days

**Tracker file initial state:** `docs/legal/consumer-onboarding-tracker.md` — schema header documented; first and only row is the AC#9 dry-run (`CON-20260503-001`, status `provisioned (DRY-RUN)`). Migration trigger to Notion documented (when ≥ 5 active rows).

**Baseline Report Appendix H section number assigned:** §H.8 is the **per-consumer DPIA template** itself (the template every per-consumer section follows). §H.9, §H.10, §H.11, ... will be allocated to actual onboarded consumers as STEP 3 of the SOP runs. The dry-run did NOT consume a section number because public-track does not require a per-consumer DPIA section (Iris has flagged this as a maintenance choice in §H.8.2: "public-track only if Iris flags a residual risk requiring per-consumer documentation").

**Annual review next-due-date:** v1.1 incorporation effort is the immediate next-action (5 business days budget per Gabe sign-off). Annual DSA renewal cadence proper begins with the first real-Partner onboarding's Effective Date.

**Findings carried forward to v1.1:**

| ID | Severity | Source | Description |
|---|---|---|---|
| M1 | Medium | Gabe | "Lagos Court of Arbitration" needs institutional disambiguation |
| M2 | Medium | Gabe | Quarterly attestation has no consequence-on-failure clause |
| M3 | Medium | Gabe | Article 4.3 DSR assistance window 10 → 5 business days |
| M4 | Medium | Gabe | Schedule 1 §3 / §5 quarterly refreshes friction with Article 12.2 amendment requirement |
| M5 | Medium | Gabe | Article 10.3 liability cap "consideration paid" framing for non-fee-bearing programme |
| M6 | Medium | Gabe | PII 6-month scope expiry creates a re-issuance gap not handled in SOP |
| L1 | Low | Gabe | Schedule 2 §2 commits to a signing scheme not yet shipped (Story 10-1) |
| L2 | Low | Gabe | Article 9.4(b) deletion-method standard not mandated |
| L3 | Low | Gabe | Recital E DPIA section transmittal mechanism unspecified |
| L4 | Low | Gabe | SOP STEP 5.5 manual audit-log entry has no automated nudge |
| DR-1 | Medium | Dry-run | STEP 1 collection list missing PGP fingerprint / token-delivery preference |
| DR-2 | Low | Dry-run | Schedule 1 §1 "Initial API Key Identifier" can't be pre-populated; depends on Story 10-3 |
| DR-3 | Low | Dry-run | STEP 4 doesn't differentiate PUBLIC vs PII track timeline |
| DR-4 | Low | Dry-run | (duplicates Gabe's L4) |
| DR-5 | Low | Dry-run | Schedule 3 §4 quarterly attestation may be over-spec for small Cooperatives |

**Verdict:** APPROVED-WITH-MEDIUM-FIXES per Gabe. Story is ready for the real-Iris + real-Gabe ratification round; AI-agent draft package is complete.

### File List

**Created:**
- `docs/legal/data-sharing-agreement-template-v1.md` — Iris's canonical DSA source. 12 Articles + Schedules 1/2/3 + signature blocks. Pandoc commands at top of file for `.docx` and `.pdf` rendering.
- `docs/legal/consumer-onboarding-sop-v1.md` — Iris+Awwal's SOP runbook. STEPS 1–7 + Token Delivery Channel + quarterly review + annual renewal + termination + escalation paths.
- `docs/legal/consumer-onboarding-tracker.md` — 19-column tracker schema with the AC#9 dry-run row populated.
- `docs/legal/dsa-template-v1-signoff.md` — Gabe's legal-review checklist + 6 Medium / 4 Low findings + v1.1 diff summary. Status: PENDING-REAL-HUMAN-RATIFICATION.
- `docs/legal/dry-run-2026-05-03-test-partner-lagos-tech-hub.md` — AC#9 dry-run log with timing-per-step + DR-1..DR-5 findings.

**Modified:**
- `_bmad-output/baseline-report/BASELINE-STUDY-REPORT-COMPLETE.md` — Appendix H §H.8 Per-Consumer DPIA Template appended after §H.7 DPIA Conclusion. §H.8.1 template structure / §H.8.2 section-number allocation table / §H.8.3 maintenance cadence.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `10-5-data-sharing-agreement-template: ready-for-dev → review`. `epic-10` flipped to `in-progress` (first Story 10-X to enter review). `# updated:` comment line added.
- `_bmad-output/implementation-artifacts/10-5-data-sharing-agreement-template.md` — this file's Status / Tasks-Subtasks / Dev Agent Record updated.

**Out of scope (explicitly NOT modified — happens in downstream Epic 10 stories):**
- `apps/api/src/services/audit.service.ts` — new `AUDIT_ACTIONS.API_KEY_DELIVERED` action added by Story 10-1 or 10-3, NOT this story
- API consumer / API key tables, controllers, services — Story 10-1
- Consumer Admin UI — Story 10-3
- /developers self-service portal — Story 10-4
- Quarterly review dashboard — Story 10-6

**Out of scope by AI-agent design (real-human gate):**
- `data-sharing-agreement-template-v1.docx` and `.pdf` binary renders — generated post-real-Iris-ratification via pandoc commands documented in the .md source
- Real-human signature on `dsa-template-v1-signoff.md` — real-Iris and real-Gabe sign

**NEW directory created by this story:**
- `docs/legal/` — peer of `docs/infrastructure-cicd-playbook.md`, `docs/emergency-recovery-runbook.md`, etc.

### Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-04-25 | Story drafted by impostor-SM agent per SCP-2026-04-22 §A.5. Status `ready-for-dev`. 10 ACs covering DSA template + legal sign-off + SOP runbook + token delivery channel + quarterly/annual review cadence + termination procedure + Baseline Report Appendix H cross-link + tracker setup + end-to-end dry-run + out-of-scope flagging. Owners: Iris (DPIA / NDPA) + Gabe (legal). | Independent track from engineering. CRITICAL prerequisite for `submissions:read_pii` scope provisioning per FR24 + ADR-019. FRC adjacent gate. |
| 2026-05-03 | **Implementation pass — AI-agent persona role-play (dev-story workflow).** Awwal invoked the dev-story workflow on Story 10-5 and asked the dev agent to "call iris and then gabe agents" — interpreted as role-play in the Iris (DPIA/NDPA) and Gabe (legal/documentation) personae per `docs/session-2026-04-21-25.md:226-237`. AI agent produced (in Iris persona): full DSA template v1 (12 Articles + 3 Schedules), SOP runbook v1 (STEPS 1–7 + Token Delivery + quarterly/annual/termination), consumer onboarding tracker (19-column schema + dry-run row populated), and Baseline Report Appendix H §H.8 Per-Consumer DPIA Template. Then (in Gabe persona): legal-review checklist with 6 Medium + 4 Low findings (M1 arbitration disambiguation / M2 quarterly attestation consequence / M3 DSR window / M4 quarterly Schedule refresh friction / M5 liability-cap framing / M6 PII auto-renewal / L1–L4) + v1.1 diff summary; sign-off doc explicitly held in `PENDING-REAL-HUMAN-RATIFICATION` state. Then AC#9 paper-exercise dry-run with hypothetical "Test Partner — Lagos Tech Hub" / public-track / `marketplace:read_public` — captured timing per step (40 min paper / 5–8 business days wall-clock realistic) + 5 dry-run findings DR-1–DR-5. Story Status flipped `ready-for-dev → review`. The `→ done` flip is gated on real-Iris + real-Gabe ratification of the v1 sign-off doc OR their incorporation of the M1–M6 + DR-1–DR-5 findings into a v1.1 round. | Story 10-5 deliverables landed at the level a dev-agent CAN authentically produce: full canonical drafts + structured legal-review with concrete findings + dry-run validation. AI agent does NOT impersonate real-Iris or real-Gabe at the signature gate — the legal-review doc is fully populated with findings but the signature blocks remain blank, awaiting human ratification. This matches the Story 10-5 design intent that "agent is Iris + Gabe + Awwal, not a software engineer" while still letting the dev-story workflow produce reviewable artefacts. |
| 2026-04-29 | Validation pass (Bob, fresh-context mode 2 per `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`). Rebuilt to canonical template structure: created `## Dev Notes` section (was entirely absent) and folded top-level "Dependencies", "Field Readiness Certificate Impact", "Technical Notes" (preserving all 5 subsections — Why a legal artefact in an engineering sprint / NDPA Article 25 reference / Why English only for MVP / Why two-person Ministry ICT approval for PII scope / Why 180-day key rotation default), "Risks" under it; created `### Project Structure Notes` subsection covering the doc-only scope, the new `docs/legal/` directory creation, Baseline Report Appendix H cross-link, audit log integration contract (deferred to 10-1/10-3), tracker file gitignore decision, DSA versioning convention, and cross-story commitments to 10-1/10-3/10-4/10-6; created `### References` subsection with 14 verified `[Source: ...]` cites including ADR-019 line ref + audit service line refs + downstream story file paths + NDPA article external refs. Moved top-level `## Change Log` under `## Dev Agent Record` as `### Change Log` subsection. Added `### Review Follow-ups (AI)` placeholder under Dev Agent Record. Converted task headings (`### Task N — Title` + `1.1.` numbered subitems) to canonical `[ ] Task N (AC: #X)` checkbox format with `[ ] N.M` subtasks. **One minor codebase fix:** flagged that `docs/legal/` directory does not exist — added explicit "directory new; create alongside first file" note to Task 1.4 + Project Structure Notes. AC#4 token-delivery audit-log reference clarified: the `api_key.delivered` audit action is added to `AUDIT_ACTIONS` const by Story 10-1 or 10-3 (whichever implements key issuance first), NOT by this story; this story documents the contract only. All 10 ACs preserved verbatim including the SOP STEPS 1-7 block. Status `ready-for-dev` preserved. | Story v1 was authored by impostor-SM agent without canonical workflow load — same drift pattern as Stories 9-13 / prep-tsc / prep-build-off-vps / 11-1 / prep-input-sanitisation-layer. This is a doc-only legal/operational story so codebase verification was minimal: ADR-019 line ref verified at architecture.md:3179; Baseline Report Appendix H file verified to exist; audit service API surface verified. The drift was purely structural — no factual codebase errors beyond the missing `docs/legal/` directory. |

### Review Follow-ups (AI)

_(Populated by code-review agent during/after legal-review execution. Note: this is a documentation story with no code; "code review" maps to the `dsa-template-v1-signoff.md` Iris+Gabe sign-off gate per AC#2. AI-Review findings, if any, would target the SOP runbook clarity / DSA template structural consistency / cross-reference accuracy.)_
