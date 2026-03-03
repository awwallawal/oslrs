---
stepsCompleted: [step-01-init, step-02-discovery, step-03-success, step-04-journeys, step-05-domain, step-07-project-type, step-08-scoping, step-09-functional, step-10-nonfunctional, step-11-polish, step-12-complete]
classification:
  projectType: web_app
  domain: govtech-fintech
  complexity: high
  projectContext: greenfield
  pwaStrategy: basic-installability-only
inputDocuments:
  - _bmad-output/planning-artifacts/product-brief-vlprs-2026-02-13.md
  - _bmad-output/brainstorming/brainstorming-session-2026-02-13.md
  - docs/vlprs/1-CONCEPT-NOTE.md
  - docs/vlprs/2-PRD.md
  - docs/vlprs/3-DATA-MIGRATION-PLAN.md
  - docs/vlprs/4-GOVERNANCE-PACK.md
  - docs/vlprs/5-ROLLOUT-PLAN.md
  - docs/vlprs/6-CABINET-PRESENTATION.md
  - docs/vlprs_council_slides_rollout_pack_rbac.md
  - docs/vlprs_cabinet_pack_prd_business_proposal.md
  - docs/vehicle_loan_lifecycle_payroll_reconciliation_system_concept_prd_state_machine_compliance.md
  - docs/wordvomit.txt
  - docs/dump.md
  - docs/Full_Context.md
documentCounts:
  briefs: 1
  research: 0
  brainstorming: 1
  projectDocs: 11
workflowType: 'prd'
lastEdited: '2026-02-20'
editHistory:
  - date: '2026-02-20'
    changes: 'About page & integration readiness: Added FR82 (About the Programme page — Mission, Vision, Core Values, Programme Leadership, Programme Governance, Institutional Story). Added /about as top-level nav item. Removed /scheme/ag-office (content absorbed into /about Programme Governance section). Updated FR77 nav structure (added About direct link, The Scheme dropdown now 4 items). Updated FR78 (removed AG Office from scheme pages). Updated FR count 81→82. Added content directory convention (src/content/*.ts) for CMS migration readiness. Added Extension Points & Future Integration section to architecture (data ingestion abstraction, API consumer readiness, domain isolation, event emission pattern). Added Sanity as deferred headless CMS choice. Added Phase 2/3 integration scenarios (State Payroll DB forward integration, API consumer backward integration, AG Office platform expansion).'
  - date: '2026-02-20'
    changes: 'Public Website wireframes & implementation guide: Added wireframes-epic-14.md with ASCII wireframes for all 20 public pages, 4 reusable page templates (Content Page, Card Grid, Placeholder, Homepage), 8 shared public components (PublicNavBar, LoginModal, PublicFooter, BreadcrumbNav, PageHeader, CtaBanner, DisclaimerCallout, ProgrammeDisclaimer), shadcn/ui component mapping, responsive breakpoint annotations, pre-written SEO meta tags for all 17 routes, and recommended build order. Updated FR77 to reference shared component inventory. Updated FR81 to reference wireframes and page templates. Updated SEO Strategy with meta tag table reference. Updated build sequence step 4 with implementation artifacts. No new FRs added.'
  - date: '2026-02-20'
    changes: 'Public Website & Scheme Information Portal: Expanded Public Zone from minimal landing page to comprehensive multi-page public website. Added 6 new FRs (FR76-FR81): homepage with institutional branding, navigation architecture with login modal, scheme information pages (eligibility, loan tiers, repayment rules, How It Works), resources & support pages (FAQ, MDA guide, downloads, news), legal & compliance pages (privacy/NDPR, disclaimer, accessibility), and footer architecture. Elevated Public Zone from "functional but minimal" to full institutional portal — IT assessors and AG see a government-grade public presence before login. Updated MVP Feature Set (12→13 features). Updated Application Architecture section. Added public page performance NFR. Updated SEO Strategy to include MVP public pages. Updated Solo Developer Build Sequence (14→15 steps). Updated Phase 2 scope to remove items now covered in MVP Public Zone. De-escalated confrontational language: all public-facing copy uses neutral framing (what VLPRS enables, not what was broken). Added "Expression of Interest" language rule — never "Apply for Loan" on public surfaces. Added Programme Disclaimer requirement. Total: FR76-FR81 added, 1 NFR added.'
  - date: '2026-02-19'
    changes: 'User invitation & account lifecycle: Rewrote FR72 with downward-only management hierarchy (super_admin manages dept_admin + mda_officer; dept_admin manages mda_officer; super_admin accounts CLI-only), full account state machine (Active ↔ Deactivated → Deleted), welcome email via Resend with temporary credentials, forced first-login password change, profile self-service (view own details, change own password). Rewrote FR73 with admin-initiated password reset scoped by hierarchy, must_change_password flag. Moved FR72/FR73 from Epic 13 (Sprint 13) to Epic 1 (Sprint 1) — user invitation is a Sprint 1 foundation requirement. Added canonical visual reference to client-approved ux-design-directions.html. No new FRs added.'
  - date: '2026-02-18'
    changes: 'OSLRS playbook integration: Added Structured UAT Checkpoints section under Client Visibility Strategy — formalized "What to Test" checklists sent to client after every 2-3 stories. No FR changes.'
  - date: '2026-02-17'
    changes: 'Story 1.8 alignment: Updated Solo Developer Build Sequence to reflect frontend screen scaffolding with mock data at step 3 (Foundation), enabling continuous client visibility from Sprint 1 via hosted domain. Updated demonstrability milestone to include Sprint 1 demo-ready UI shell. Updated Implementation Considerations to specify design system and mock data layer established in Sprint 1. Updated Solo Developer Risks to include continuous client access via hosted URL. No FR changes.'
  - date: '2026-02-15'
    changes: 'Post-validation housekeeping: hardened 6 FRs for measurability (FR20, FR34, FR35, FR38, FR39, FR54 — replaced vague terms with enumerated fields and testable criteria). Removed 2 implementation leakage references (Lighthouse, OWASP ZAP → tool-agnostic language). Fixed 3 NFRs (scalability future-growth → testable API consumer requirement; removed motivational prose from design quality standard; replaced aspirational quality bar with measurable statement). Renumbered FR71-FR75 for sequential grouping (Service Status Verification Report moved from after FR70 to FR71, shifted User Account Management to FR72, Password Reset to FR73, Staff ID Management to FR74, Duplicate Staff ID Detection to FR75). Updated Journey Requirements Summary table to reflect expanded Journeys 3-6. Added Phase 2/3 traceability references linking each feature to stakeholder needs, journeys, or discovery artifacts.'
  - date: '2026-02-15'
    changes: 'Staff temporal profile & date tracking: added DOB, appointment date, computed retirement date to loan master (FR10). Expanded CSV from 6 to 8 fields with conditional Event Date and Cessation Reason (FR16-17, FR20). Added 16 new FRs (FR60-FR75): pre-submission checkpoint, mid-cycle event reporting, cross-validation engine, retirement/tenure validation, gratuity receivable tracking, early exit workflow, MDA historical data upload, user account management, Staff ID governance. Updated 4 user journeys (3-6) with temporal data, early exit, user management, and checkpoint flows. Expanded MVP from 10 to 12 features, build sequence from 10 to 14 steps. Elevated date-bearing employment events from Phase 2 to MVP. Added 7 measurable outcomes, 4 business success milestones, new performance NFR targets. Added data quality risk to adoption risks.'
  - date: '2026-02-14'
    changes: 'Post-validation fixes: added FR53-FR59, hardened 12 Security NFRs, refined 10 SMART FRs, reconciled MDA count, added success metrics'
---

# Product Requirements Document - VLPRS

**Author:** Awwal
**Date:** 2026-02-15

---

## Executive Summary

### Vision

VLPRS (Vehicle Loan Processing & Receivables System) is the central digital system of record for the Oyo State Government Car Loan Scheme. It replaces manual spreadsheet-based administration across 63 MDAs managing 3,100+ active loans with a single, computation-authoritative platform.

### Core Problem

63 MDAs independently compute loan balances using inconsistent manual spreadsheets (17 columns, different formulas). Verified calculation errors in ~30% of sampled records. Over-deduction disputes escalate to physical confrontations. Paper-based records require days to retrieve. The Accountant General cannot answer basic questions about scheme exposure without 2-3 days of manual reconciliation.

### Product Differentiator

VLPRS separates fact submission from computation authority. MDAs submit 8 fields of deduction facts (6 core fields plus conditional event date and cessation reason). The system computes truth — balances, interest, retirement timelines, exceptions — from an immutable append-only repayment ledger. No manual balance edits. No inconsistent formulas. One computation engine, applied uniformly, auditor-verifiable.

### Target Users

| Role | Count | Primary Need |
|------|-------|-------------|
| Accountant General (Super Admin) | 1 | Instant scheme-wide visibility from mobile |
| Deputy AG (Super Admin — Power User) | 1 | Pattern detection and exception investigation |
| Department Admin (Car Loan Dept) | 1-2 | Loan management, migration, reporting, user account management |
| MDA Reporting Officers | 63 | Simple monthly deduction submission |
| Beneficiaries | 3,100+ | Protection from over-deduction |

### Key Differentiators

- **Immutable ledger** — banking-grade financial record integrity
- **Computed balances** — derived from ledger, never stored or manually edited
- **Auto-Stop Certificate** — automatic deduction cessation at zero balance
- **Non-punitive design** — "comparison" not "error," "variance" not "mistake"
- **Trust-then-verify** — accept MDA submissions, surface variances asynchronously

---

## Success Criteria

### User Success

**The Accountant General (Super Admin):**
- Answers the Commissioner of Finance's fund status question in real time from her phone
- Opens VLPRS dashboard and sees four accurate headline numbers without a single click in <3 seconds
- Generates a Cabinet-ready report with one tap
- Knows which MDAs submitted and which didn't, without asking anyone

**The Deputy AG (Super Admin — Power User):**
- Catches anomaly patterns before they reach the AG's desk
- Drills from headline numbers to individual MDA data in 2-3 clicks
- Reviews exception queues and variance reports independently

**Department Admin (Car Loan Dept):**
- Generates reports in seconds instead of 2-3 days
- Looks up any loan record instantly instead of searching file cabinets
- Captures institutional knowledge in annotations that persist beyond his tenure
- Processes early exit requests from computation to closure in a single session
- Manages MDA officer accounts (create, deactivate, reassign) without IT support
- Sees retirement pipeline — which loans shift from payroll to gratuity recovery in coming months

**MDA Reporting Officers (x63):**
- Submits monthly data in 15 minutes instead of half a day
- Submits 8 fields of fact (6 core + 2 conditional) instead of computing 17 columns of derived values
- Reviews pre-submission checkpoint showing staff requiring attention before each upload
- Reports employment events (retirement, transfer, death) immediately via mid-cycle form — not delayed until monthly submission
- Sees variance comparisons in neutral, non-accusatory language
- Never manually calculates interest or balances again

**Beneficiaries (3,100+):**
- Never over-deducted beyond loan completion — guaranteed by Auto-Stop Certificate
- Receives notification when loan reaches zero

### Business Success

| Timeframe | Success Indicator |
|-----------|------------------|
| First pilot deployment | AG sees live data from real MDAs on her dashboard |
| Month 3 post-rollout | 95%+ of 63 MDAs submitting on time via VLPRS |
| Month 6 | 50% reduction in over-deduction incidents vs pre-VLPRS baseline |
| Month 6 | Legacy spreadsheets retired for all 63 MDAs |
| Month 3 post-rollout | Staff ID completion rate >80% (up from migration baseline) |
| Month 6 | Retirement pipeline visibility: 100% of loans with computed retirement dates |
| Month 6 | All post-retirement activity flags resolved (service extension documented or event filed) |
| Month 12 | Near-zero over-deduction incidents; Auto-Stop Certificates preventing all new cases |
| Month 12 | Staff ID completion rate >95%; all records enriched with temporal profile |
| Month 12 | VLPRS is institutionalised — sole system of record, indispensable |

**Professional Objective:** A working, adopted, State-level government IT system that demonstrates architectural quality and earns the AG's endorsement as a reference.

### Technical Success

| Metric | Target | Rationale |
|--------|--------|-----------|
| Computation accuracy | 100% — bit-identical to hand-verified calculations | Financial system — zero tolerance for math errors |
| Dashboard load (mobile, 4G) | <3 seconds | AG's 30-second scenario requires instant rendering |
| CSV upload processing (100 rows) | <10 seconds | MDA officers must get immediate confirmation |
| System availability (business hours) | 99.5% Mon-Fri, 8am-6pm WAT | Government working hours — not a 24/7 consumer app |
| Data integrity | Zero data loss events | Immutable ledger — no financial record overwritten or deleted |
| Concurrent submissions | 63 MDA officers in same week without degradation | Peak load during submission window (20th-28th monthly) |
| Report generation | <10 seconds for any standard report | Replaces 2-3 day manual process |
| Ledger immutability | 100% — no UPDATE or DELETE on financial records | Banking-grade audit requirement |

### Measurable Outcomes

| Outcome | Metric | Threshold |
|---------|--------|-----------|
| Computation correctness | % of loans with verified-accurate balances | 100% |
| MDA submission success rate | % of uploads accepted without error | >95% |
| Report generation speed | Time from request to rendered report | <10 seconds |
| Migration accuracy | % of pilot MDA records correctly categorised | >98% |
| Auto-Stop trigger reliability | % of zero-balance loans that generate certificate | 100% |
| Notification delivery | % of email/SMS reminders successfully sent | >95% |
| Audit traceability | % of balances fully reconstructable from ledger | 100% |
| RBAC enforcement | % of access attempts correctly authorised/denied | 100% |
| Protection Score | Cumulative Auto-Stop Certificates issued | Tracked from day one |
| Grievance resolution | Average working days to resolve beneficiary discrepancy | <10 working days |
| Fund rotation rate | % of recovered funds redeployed to new approvals within 60 days | Tracked from Month 6 |
| Staff ID completion | % of loan records with verified Staff ID | >95% by Month 12 |
| Temporal profile completeness | % of loan records with DOB + appointment date + computed retirement date | 100% for new loans; >90% for migrated records by Month 6 |
| Early exit processing | Average working days from request to loan closure | <5 working days |
| Retirement receivables visibility | % of split-tenure loans with tracked gratuity receivable amount | 100% |
| Service status verification | % of post-retirement activity flags resolved within 30 days of migration | >95% |
| Event reporting timeliness | % of employment events reported within 30 days of effective date | >90% by Month 6 |

### Compliance Milestones (Govtech + Fintech)

- **NDPR:** Privacy notices on all data collection points, consent capture, data minimisation, role-based access, retention policy implemented
- **Audit readiness:** Every action logged with user, timestamp, IP, and role — from day one
- **Segregation of duties:** Enforced in RBAC — no single actor controls both input and outcome
- **Computation chain:** Any auditor can trace any balance back to source ledger entries
- **Data retention:** Per government financial record retention regulations (minimum 7 years for audit logs)

---

## Product Scope & Phased Development

### MVP Strategy

**Approach:** Problem-Solving MVP — the minimum system that makes the AG's pain disappear, Mr. Okonkwo's workload manageable, and MDA officers' submissions simple.

**Launch Strategy:** All 63 MDAs data uploaded at inception. The AG opens VLPRS for the first time and sees her entire state's loan portfolio — real numbers, real MDAs, real balances. A fully populated system from day one.

**Resource Model:** Solo developer. Build sequence optimised for dependency order and demonstrable progress at each stage.

**Client Visibility Strategy:** System is deployed to the client's domain from Sprint 1 with CI/CD auto-deploying on every merge to `main`. The client receives demo credentials and can access the live hosted system at any time — watching mock data become real data sprint by sprint. No scheduled laptop demos; continuous access builds compounding trust.

**Structured UAT Checkpoints (from OSLRS playbook):** Passive client access is not sufficient — structured feedback loops are required. After every 2-3 stories (or after each epic completion), send the client a "What to Test" checklist: specific flows to walk through with their demo credentials, what changed since last update, and what is still mock data. Example: *"Sprint 2 deployed. Log in as AG — dashboard numbers are now real. Tap Active Loans and verify the MDA list loads. Try it on your phone."* This turns the client from passive observer into active UAT participant and catches UX issues before they compound across sprints.

### Solo Developer Build Sequence

| Order | Feature | Milestone |
|-------|---------|-----------|
| 1 | Database Schema (Loan Master + Repayment Ledger) | Data foundation established |
| 2 | Computation Engine (all 4 tiers, all settlement paths) | Mathematical core verified |
| 3 | RBAC + Authentication + CI/CD + Frontend Screen Scaffolding | Access control operational, CI/CD deploying to client domain, all role-specific screens live with mock data — dashboard, submission, migration, loan detail. Design system established. Demo seed credentials active. |
| 4 | Public Website & Scheme Information Portal | Institutional public face live — homepage, scheme info, eligibility, repayment rules, FAQ, legal pages. AG and IT Assessors see a government-grade portal at the URL before login. Implementation follows wireframes-epic-14.md: 4 page templates (Content Page, Card Grid, Placeholder, Homepage), 8 shared components, 20 pages across 3 stories. |
| 5 | Staff Temporal Profile & Event Model | Temporal data foundation for migration |
| 6 | Snapshot-Forward Migration Tool | Real data in system — all 63 MDAs |
| 7 | AG Executive Dashboard (wired to real data) | Mock dashboard numbers replaced with live data — flagship experience with real numbers |
| 8 | Core Reports | System provably correct |
| 9 | MDA Submission Interface (8-field CSV + manual) | Ongoing operations enabled |
| 10 | Pre-Submission Checkpoint & Mid-Cycle Events | Accountability and event tracking operational |
| 11 | Basic Validation Engine | Data quality enforced |
| 12 | Auto-Stop Certificate | Automatic deduction cessation at loan completion — guaranteed |
| 13 | Early Exit Workflow | Full loan completion paths operational |
| 14 | Basic Notifications (email first, SMS fast-follow) | Operational loop complete |
| 15 | User & Staff Record Management | Administrative self-sufficiency achieved |

**Demonstrability milestone:** Feature 3 delivers a demo-ready product shell hosted on the client's domain — role-specific screens with mock data, seeded demo credentials, responsive on mobile. The AG can open the dashboard on her phone from Sprint 1. Feature 4 delivers the institutional public face — when the AG forwards the URL to the Commissioner or IT Assessors, they see a government-grade portal that signals architectural seriousness before reaching the login screen. Features 5-8 progressively replace mock data with real data — DOB, appointment dates, computed retirement dates, real MDA figures. Features 9-15 complete operational loops: submission, event tracking, validation, auto-stop, early exit, notifications, and administrative self-service. Each sprint's merge to `main` auto-deploys, so the client watches the product evolve in real time.

### MVP Feature Set (Phase 1)

All 13 features confirmed as must-have after pressure testing:

1. **Computation Engine** — all 4 tiers, all settlement paths, moratorium, auto-split, last payment adjustment
2. **Loan Master + Immutable Repayment Ledger** — canonical data stores, computed views
3. **MDA Monthly Submission Interface** — 8 fields, CSV upload, mobile-friendly
4. **Snapshot-Forward Migration Tool** — import, validate, categorise, variance reports
5. **AG Executive Dashboard** — three-row view, four headline numbers, attention items
6. **RBAC** — 3 core roles (Super Admin, Department Admin, MDA Reporting Officer)
7. **Core Reports** — Executive Summary, MDA Compliance, Variance, Loan Snapshot by MDA
8. **Basic Validation Engine** — period lock, duplicate detection, amount reasonableness
9. **Auto-Stop Certificate** — automatic zero-balance detection, stop-deduction generation
10. **Basic Notification System** — submission reminders, overdue alerts, completion notifications (email at launch, SMS fast-follow)
11. **Staff Temporal Profile & Employment Event Tracking** — Date of birth, date of first appointment, computed retirement date on every loan record. Date-bearing employment events (Retired, Deceased, Suspended, Absconded, Transferred Out, Dismissed, LWOP) reported via mid-cycle event form or monthly CSV. Pre-submission checkpoint. Cross-validation engine.
12. **User & Staff Record Management** — User account lifecycle management (create, deactivate, reassign MDA officers). Staff ID management (add, update, duplicate detection). MDA historical data upload for cross-validation against migration baseline.

13. **Public Website & Scheme Information Portal** — Multi-page public zone serving as the institutional face of VLPRS. Homepage with Oyo State Government branding, Official Programme Notice, "How It Works" beneficiary journey, loan category cards (4 tiers with amounts), repayment & settlement rules, key capabilities, trust & compliance section, endorsement placeholder, and news section. Sub-pages: Programme Overview, About VLPRS, Eligibility & Loan Categories, Repayment & Settlement Rules, FAQ, MDA Submission Guide, Downloads & Forms, News & Announcements, Help & Support, Privacy & Data Protection, Programme Disclaimer, Accessibility Statement. Responsive navigation with login modal (Staff Portal active, Beneficiary Portal and EOI as "Coming Soon — Phase 2" placeholders). Footer with 4-column layout and legal strip. Designed to signal institutional credibility to the AG, IT Assessors, and the public before login.

**Public Zone Language Rule:** All public-facing copy describes what VLPRS enables — never what was broken. Prohibited on public pages: references to past errors, calculation discrepancies, disputes, or institutional failures. Required framing: "VLPRS centralises..." not "Before VLPRS, MDAs had inconsistent...". "Expression of Interest" — never "Apply for Loan" (creates legal expectations). Programme Disclaimer required on homepage and EOI-related pages: "Submission does not constitute loan approval. Committee decisions remain final under existing government procedures."

### MVP User Journey Coverage

| Journey | MVP Coverage |
|---------|-------------|
| AG — 30-Second Truth | Full (dashboard, headline numbers, drill-down) |
| Deputy AG — Pattern Hunter | Partial (attention items, drill-down, exception flagging — variance trends Phase 2) |
| Dept Admin — Migration | Full (migration tool, categorisation, baseline acknowledgment, temporal profile, post-retirement scan, MDA historical upload) |
| Dept Admin — Daily Ops | Expanded (loan lookup, early exit full workflow, exception resolution, user management, Staff ID management) |
| MDA Officer — Happy Path | Full (8-field CSV, pre-submission checkpoint, submission wizard, comparison, confirmation) |
| MDA Officer — Error Recovery | Full (atomic upload, clear errors, re-upload) |
| Beneficiary — Completion | MVP: Auto-Stop Certificate generated and sent. Phase 2: beneficiary dashboard |
| Committee — Approval | Phase 2 |
| Front Desk — Walk-In | Phase 2 |
| Auditor — Investigation | Phase 2 (read-only audit role) |

### Phase 2 — Growth (Continuous Deployment After MVP)

- Beneficiary Dashboard — login, status, history, statements, grievance submission (extends Journey 7: Beneficiary — Completion; stakeholder: Beneficiaries)
- Public Education Portal Expansion — adding interactive features to the MVP Public Zone: EOI form (digital submission with reference number), Approved Beneficiary Lists (searchable, published by batch with NDPR-compliant masked identifiers), and loan repayment calculator (stakeholder: general public; discovery: Cabinet Presentation). Note: static scheme information pages (eligibility, loan tiers, repayment rules, FAQ) are delivered in MVP Public Zone
- Guarantor Tracking — entity model, relationships, circular detection (discovery: Governance Pack guarantor requirements)
- Full Staff Employment Status Taxonomy — expand from 7 MVP event types to 13 statuses with detailed workflow rules and automated status transitions (extends MVP FR60-FR67 temporal profile foundation)
- Transfer Handshake Protocol — paired Transfer Out/In between MDAs (extends Journey 4: Dept Admin — Daily Ops event handling)
- Discrepancy Ticket System — formal correction workflow (extends Journey 4 exception resolution; stakeholder: Dept Admin)
- Annotation System — institutional memory capture (discovery: Concept Note knowledge preservation requirement)
- Historical Data Archaeology Tool (extends Journey 3: Dept Admin — Migration)
- Retirement-Gratuity Handshake Protocol — 12-month pipeline, automated reports (extends MVP FR67 gratuity receivable tracking)
- Fund Pool Forecasting — 3/6/12-month projections (stakeholder: AG; extends Journey 1 executive oversight)
- Full Executive Report Suite — Retirement Pipeline, Fund Pool, Committee Action Items, Trends, Rankings (extends Journeys 1-2: AG and Deputy AG)
- Share as PDF — branded output with Oyo State crest (extends MVP FR54 PDF generation)
- Committee Admin, Front Desk Officer, Auditor/Oversight roles (enables Journeys 8-10)
- Variance Trend Tracking — month-over-month patterns (extends Journey 2: Deputy AG — Pattern Hunter)
- Sanity CMS Integration — migrate static public website content from `src/content/*.ts` files to Sanity headless CMS. Enables non-developer content updates (news, FAQ, downloads, leadership changes). MVP content directory pattern ensures zero template/layout changes — only data source swaps (discovery: content update frequency concern; MVP preparation: content directory convention and Sanity as deferred technology in architecture)

### Phase 3 — Vision

- Policy Versioning Engine — interest rates, tiers, moratorium as versioned data (discovery: 4-tier interest rate structure; enables dynamic policy changes without code deployment)
- MDA Lifecycle Management — rename, merge, split, dissolve (discovery: MDA organisational restructuring events)
- Concurrent Loan Policy configuration (discovery: future policy evolution beyond single active loan)
- Computation Integrity Monitor — nightly 5-check self-audit (extends NFR data integrity requirements; immutable ledger verification)
- Full Notification Escalation Engine — T-3 to T+7 ladder (extends MVP notification foundation; stakeholder: all roles)
- Upload Resilience Protocol — offline email fallback, status page (discovery: MDA connectivity challenges noted in rollout planning)
- System Self-Correction Protocol — append-only corrections, transparency playbook (extends immutable ledger architecture)
- State Payroll Database Direct Integration — replace CSV uploads with direct data pull from payroll system. MVP `DeductionRecord[]` abstraction means computation engine is data-source agnostic (discovery: Deputy AG directive on payroll database linkage; MVP preparation: data ingestion abstraction in architecture)
- AG Office Platform Expansion — extract VLPRS infrastructure services (auth, audit, RBAC, email, PDF) as shared foundation for other AG internal tools (discovery: AG vision for expanded internal tool role; MVP preparation: domain isolation convention in architecture)
- External API Consumer Programme — expose read-only reporting and forecasting APIs to authorised external consumers (Payroll Office, oversight bodies) via API key authentication (discovery: Payroll Office interest in VLPRS granular data; MVP preparation: versioned API envelope pattern in architecture)

### Risk Mitigation Strategy

**Technical Risks:**
- Computation engine must be 100% accurate — verified against hand-calculated test cases for all 4 tiers before any data enters the system
- Immutable ledger architecture prevents "quick fix" data patches — design must be right the first time
- Mitigation: extensive test suite for computation engine, verified against real MDA spreadsheet samples

**Adoption Risks:**

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| MDA resistance to adoption | System becomes shelfware | High | Non-punitive design language, reduced workload (8 fields vs 17 columns), training |
| Legacy data quality surfaces blame dynamics | Political backlash, project killed | High | Governance clause: no retrospective liability. Variances classified as "administrative variances inherited from prior manual system" |
| Institutional inertia delays rollout | Window of opportunity closes | High | Fast MVP delivery, visible wins early, AG as champion |
| Data quality gaps in legacy records | Incomplete Staff IDs, missing DOB/appointment dates delay temporal features | High | "Profile Incomplete" flag allows migration to proceed; Staff ID completion tracked as data quality metric trending toward 100%; MDA officers empowered to enrich their own records |
| Over-deduction disputes during transition | Trust erosion | Medium | Auto-Stop Certificate in MVP, clear communication that VLPRS tracks but doesn't modify payroll |
| Data entry errors by MDA officers | Incorrect ledger entries | Medium | Atomic upload (all-or-nothing), validation engine, comparison against expected schedules |
| Key personnel change (AG or HOD) | Loss of champion | Medium | System designed to be institutionally valuable — once adopted, the data dependency makes it indispensable |
| Computation errors undermine trust | Entire system credibility lost | Low | 100% accuracy target, banking-grade immutable ledger, auditor-verifiable computation chain |

**Solo Developer Risks:**
- Build sequence creates demonstrable progress at each stage — visible wins maintain momentum
- Design system and screen scaffolding established in Sprint 1 with mock data — all subsequent screens reuse the same tokens, components, and patterns. No per-screen redesign
- Client has continuous access to the live hosted system from Sprint 1 — no dependency on scheduled demos or physical presentations. Progress is visible on the client's domain at all times
- Migration conversations with Mr. Okonkwo should start early — get MDA spreadsheets flowing in parallel with build
- This PRD is the scope contract — if it's not in MVP, it waits for Phase 2
- Staff temporal profile established before migration ensures retirement date computation is available from day one — avoids costly retrofit

---

## User Journeys

### Journey 1: Madam AG — The 30-Second Truth

**Opening Scene:**
It's 9:14am on a Tuesday. The AG is between meetings. Her phone buzzes — the Commissioner of Finance is calling. "What's our current loan exposure? I need it for the Governor's briefing at 10." Three months ago, this question would have meant "Let me get back to you in 2-3 days" — a response that made her look unprepared and the department look disorganised.

**Rising Action:**
She opens VLPRS on her phone. The dashboard loads in under 3 seconds. Row 1: four headline numbers. Active Loans: 3,147. Total Exposure: ₦1.84B. Fund Available: ₦126M. Monthly Recovery: ₦47.2M. She doesn't need to click anything. She doesn't need to call anyone. The numbers are there — computed from the immutable ledger, updated with last month's submissions from all 63 MDAs.

**Climax:**
"Commissioner, our total exposure is ₦1.84 billion across 3,147 active loans. We have ₦126 million available for new approvals, and we're recovering approximately ₦47 million monthly. I can send you the full report in 30 seconds." She taps "Share as PDF." Done.

**Resolution:**
The Commissioner pauses. He's not used to instant answers from this department. "That was fast. Send me the breakdown by grade level too." She drills one level — taps Grade Level view — taps share again. Two PDFs, under 60 seconds. The AG puts her phone down and walks into her next meeting. VLPRS just defended her competence in real time.

**Requirements Revealed:**
- Dashboard renders <3 seconds on mobile (4G)
- Four headline numbers always visible without interaction
- Share as PDF with one tap
- Report generation <10 seconds
- Grade level breakdown drill-down from headlines
- Branded output suitable for Commissioner/Governor circulation

---

### Journey 2: Deputy AG — The Pattern Hunter

**Opening Scene:**
It's Wednesday afternoon. The Deputy AG has blocked 45 minutes to review the weekly VLPRS digest. Unlike the AG who needs headlines, he's the one who interrogates the data. He opens VLPRS on his office desktop and goes straight to the Attention Items panel.

**Rising Action:**
Three items in amber. One catches his eye: "MDA Submission Variance — Ministry of Works: declared outstanding balance ₦12.4M, system-computed ₦14.1M. Difference: ₦1.7M. Pattern: 3rd consecutive month of growing variance." He clicks through to the MDA detail view. The variance trend is clear — each month the gap widens by roughly ₦500K. He opens the individual loan records for Works and spots it: 4 staff members whose declared deductions don't match the expected schedule. Two are under-deducting. Two have no deductions posted for 2 months.

**Climax:**
He drills into the 2 staff with no deductions. The system shows their employment event flag: both flagged as "NONE" by the MDA — meaning the MDA declared no events. But VLPRS has flagged them as "Inactive — No Deduction for 60+ Days." The Deputy opens the comparison view: payroll says deductions should be happening, but no money is arriving. This is either a payroll error at Works, or these staff have left service and the MDA hasn't declared it.

He doesn't escalate to the AG. Instead, he flags both records for Department Admin review with a note: "Investigate deduction gap — possible undeclared transfer or separation." The exception enters the queue with his priority tag. Mr. Okonkwo will see it first thing Thursday morning.

**Resolution:**
The Deputy caught a ₦1.7M growing variance before it became a ₦5M crisis on the AG's desk. He did it in 20 minutes from his office, using data the system surfaced proactively. No phone calls, no paper files, no waiting. He reviews the remaining two amber items, clears one as informational, flags the other for monitoring. Closes the browser and moves on. The AG will never know about the Works variance — because it was handled before it reached her.

**Requirements Revealed:**
- Attention items with trend indicators (growing/stable/shrinking variance)
- MDA detail view with drill-down to individual loan records
- Comparison view (declared vs computed, side by side)
- Inactive loan detection (no deduction for X days)
- Exception flagging with priority tags and notes
- Exception queue assignment to Department Admin
- Variance trend tracking (month-over-month pattern)
- Employment event flag vs system detection mismatch highlighting

---

### Journey 3: Mr. Okonkwo — The Migration Marathon

**Opening Scene:**
It's the first week of VLPRS deployment. Mr. Okonkwo has the MDA spreadsheets on his desk. He's spent 15 years managing these records on paper. Today, for the first time, they go digital. He's excited but nervous. What if the numbers don't match? What if the system exposes errors he didn't know about?

**Rising Action:**
He logs into VLPRS as Department Admin. Opens the Migration Tool. Selects "Import MDA Data" and chooses the first file: Sports Council, 23 staff with active loans. The migration template requires columns he expected — Staff ID, principal, outstanding balance, interest rate, tenure — plus two he has to pull from the personnel files: Date of Birth and Date of First Appointment. He spends 40 minutes cross-referencing personnel records to fill in those two columns for all 23 staff. It's tedious but he understands why the system needs them: retirement date computation depends on both.

He uploads the completed Excel file. The system processes it in 8 seconds and returns a categorisation report:

- Clean: 14 records (61%)
- Minor Variance: 5 records (22%) — rounding differences <₦500
- Significant Variance: 3 records (13%) — ₦2,000-₦15,000 difference
- Structural Error: 1 record (4%) — interest rate used was 11.1%, not 13.33%

The system isn't accusing anyone. The language reads: "Comparison Complete. 14 records aligned. 9 records show variance. Details below." For each variance, it shows the MDA's declared value, the system's computed value, and the mathematical explanation of the difference.

But there's a second panel he didn't expect: "Retirement Status Review." The system computed retirement dates for all 23 staff from their dates of birth and dates of first appointment. Two records are flagged amber: "Service Status Verification Required — Staff ID 2201, computed retirement: September 2024. Active deductions recorded through February 2026. Please verify: service extension or status update needed." And: "Service Status Verification Required — Staff ID 2209, computed retirement: November 2024. Active deductions recorded through February 2026. Please verify: service extension or status update needed."

Mr. Okonkwo recognises Staff 2201 immediately — the man retired. He attended the send-off. But nobody updated the central records, and Sports Council kept deducting. Staff 2209 is different — she received a two-year service extension that was never captured digitally. He files the appropriate events: a retirement event for 2201 (loan status transitions to "Retired — Deductions Should Have Ceased") and a service extension event for 2209 (retirement date updated to November 2026, loan continues).

**Climax:**
Mr. Okonkwo clicks on the structural error. Staff member Badmus F.G. — the system shows that Sports Council calculated interest at 11.1% instead of 13.33%. The difference over 37 months: ₦14,800. He's seen this kind of thing in the paper files for years but never had a tool that could pinpoint it. He clicks "Acknowledge Variance — Baseline as Declared" because this is a legacy issue. The system creates the baseline entry, notes the variance for the record, and marks Sports Council as "Imported — Pending Reconciliation."

He moves to the next MDA. Then the next. By end of day, all pilot MDAs are imported.

Meanwhile, across the building, Mrs. Adebayo at the Board of Internal Revenue has been given access to upload her own historical monthly records. She has 18 months of data in her 17-column spreadsheet — the same spreadsheet she's been maintaining for 11 years. She exports the relevant columns and uploads them through the MDA Historical Data Upload tool. The system ingests her 47 staff across 18 months and cross-references every record against Mr. Okonkwo's central migration data for BIR. 41 of 47 records match cleanly. 6 show variances — mostly timing differences: Mrs. Adebayo recorded a January deduction that Mr. Okonkwo's central file logged as February, or an amount that appears rounded differently between the two sources. None of them are alarming. All 6 flow into a reconciliation report that lands in Mr. Okonkwo's queue: "BIR Historical Cross-Validation: 41/47 matched. 6 variances identified. Largest: ₦1,200 timing difference on Staff ID 4419, January 2025."

The Migration Dashboard tracks progress. The AG's dashboard, for the first time, shows real numbers from real MDAs.

**Resolution:**
Over the following weeks, Mr. Okonkwo imports all 63 MDAs in batches. Some are clean. Some reveal years of accumulated calculation errors. Two more post-retirement deduction cases surface. The system categorises everything without blame. Mr. Okonkwo's institutional knowledge — which MDAs have messy data, which staff have unusual arrangements — finally has a place to live: the annotation field on each loan record. His expertise isn't replaced. It's preserved. And the cross-validation from MDA officers like Mrs. Adebayo gives him a second data source to triangulate against — a luxury he never had with paper files.

**Requirements Revealed:**
- Migration Tool UI: file upload, progress indicator, result categorisation
- Date of Birth and Date of First Appointment as required migration fields
- Computed retirement date generation from DOB and appointment date
- Post-retirement activity detection during migration (active deductions past computed retirement date)
- Service status verification workflow (flag, investigate, file event: retirement or extension)
- Column trust classification (automatic)
- Variance categorisation: Clean / Minor / Significant / Structural / Anomalous
- Side-by-side comparison with mathematical explanation
- Baseline acknowledgment workflow ("Accept as declared")
- Summary ledger entry creation from migration data
- Migration Dashboard: per-MDA status tracking (Pending → Certified)
- Batch import capability (multiple MDAs per session)
- Annotation field for institutional context on each loan record
- MDA historical data upload for cross-validation against central migration data
- Reconciliation report generation (matched/unmatched counts, variance details, timing difference identification)

---

### Journey 4: Mr. Okonkwo — The Daily Grind (Post-Migration)

**Opening Scene:**
It's the 12th of the month. Submission deadline is the 28th, but Mr. Okonkwo likes to check early. He opens VLPRS and goes to the MDA Compliance view. 18 of 63 MDAs have already submitted. The rest have until the 28th. No action needed — the system will send automated reminders at T-3.

**Rising Action:**
A walk-in arrives: Alhaja Musa, a Level 9 officer from the Ministry of Health, wanting to know her loan balance. In the old days, this would mean 20 minutes of searching through file cabinets. Mr. Okonkwo types her staff ID into the search bar. Her complete loan record appears in 2 seconds: Principal ₦600,000. 34 of 60 installments paid. Outstanding balance: ₦305,822.50. Last deduction: January 2026, ₦10,000 posted by MOH.

Alhaja Musa asks "Can I pay off early?" Mr. Okonkwo clicks "Simulate Early Exit." The system shows: Outstanding principal: ₦260,000. Interest waived if paid today: ₦45,822.50. "You'd pay ₦260,000 and the interest balance is forgiven." She thanks him and leaves to think about it.

She comes back the next week. "I want to pay off." Mr. Okonkwo clicks "Initiate Early Exit." The system computes the payoff: Remaining principal ₦260,000. February interest accrued: ₦2,888.75. Total payoff amount: ₦262,888.75. Valid until: February 28, 2026. He prints the computation slip — a single-page document with unique reference EX-2026-0034, showing the breakdown, the expiry date, and the payment instructions. Alhaja Musa reviews it and confirms: she'll bring a bank draft by February 25. Mr. Okonkwo records the commitment in the system — loan status shifts to "Early Exit — Commitment Recorded. Payoff reference: EX-2026-0034. Expected payment: February 25, 2026."

On February 24, she returns with the bank draft. Mr. Okonkwo opens the payoff reference, clicks "Record Payment," enters the draft details, and confirms. Loan status changes to "Completed — Early Exit." The system generates the Auto-Stop Certificate automatically — same certificate that fires on zero-balance completion, but triggered by the early exit closure. Alhaja Musa's MDA payroll officer receives the cease-deduction notification. Done. Five clicks, two visits, one clean closure.

**Climax:**
At 3pm, the exception queue pings. The Deputy AG flagged two Ministry of Works records that morning. Mr. Okonkwo opens the first: Staff ID 4412, no deduction posted for 2 months, MDA declared "NONE" for events. He picks up the phone and calls the Works Reporting Officer. "Your records show deductions for Staff 4412 are up to date, but we're not seeing them in the system. Can you verify?" Works checks — the staff member transferred to Federal service 2 months ago. They forgot to flag the event. Mr. Okonkwo enters a note: "Confirmed: transferred to Federal service Nov 2025. Event flag updated. Loan status: Transferred Out — deductions ceased." The exception is resolved.

At 4pm, a call comes in. The Reporting Officer at Ministry of Agriculture has been transferred to Federal service. The new officer, Mrs. Balogun, needs an account. Mr. Okonkwo opens User Management. He finds the outgoing officer's account, clicks "Deactivate" — status changes to "Inactive," login disabled, all active sessions terminated. He clicks "Create New User." Name: Mrs. Balogun. Email: her official address. Role: MDA Reporting Officer. Assigned MDA: Ministry of Agriculture. He saves. The system generates temporary credentials and queues a welcome email with login instructions and a link to the training materials. Mrs. Balogun will be submitting by next month. Total time: 3 minutes.

At 4:30pm, Mr. Okonkwo opens the Data Quality dashboard. A panel shows: "Staff ID Coverage: 2,828 of 3,112 records have Staff IDs (90.9%). Missing: 284." Down from 412 at migration — he's been chipping away at this. He filters by MDA: Ministry of Health shows 8 records missing Staff IDs. He opens the personnel register — the physical one, still in his filing cabinet — and cross-references. Staff member by staff member, he enters the IDs. Seven go through cleanly. The eighth — Staff ID 7823 — triggers a flag: "Duplicate Staff ID: 7823 is already assigned to loan record VLC-2024-0847 (Ministry of Education). Cannot assign to VLC-2025-0112 (Ministry of Health)." He investigates. VLC-2024-0847 is Alhaji Mustapha at Education. VLC-2025-0112 is also Alhaji Mustapha — same name, same Staff ID, but a loan originated through Health. Same person, two loans from different MDAs. This shouldn't exist under scheme rules. He flags both records for AG review with a note: "Potential concurrent loan violation — same Staff ID, two active loans originated through different MDAs. Requires AG determination."

**Resolution:**
Mr. Okonkwo generates the weekly report for the AG: Executive Summary, Compliance Status, Exceptions Resolved. Three clicks. He prints it and walks it upstairs. The Data Quality metric ticks up to 91.2% — 277 missing IDs now. Total time for a day that used to be consumed by paper files and phone calls: 2 hours of focused work, not 8 hours of chaos.

**Requirements Revealed:**
- Loan lookup by staff ID (instant search)
- Early exit simulation calculator
- Early exit workflow: computation with expiry date, commitment recording, payment recording, closure
- Computation slip with unique reference number (EX-YYYY-NNNN format), breakdown, and expiry
- Auto-Stop Certificate generation on early exit closure
- Exception queue with priority ordering
- Exception resolution workflow (investigate → note → resolve)
- Event flag correction capability
- Loan status transitions (Active → Transferred Out, Active → Early Exit Commitment → Completed — Early Exit)
- User account lifecycle management: create new user, deactivate existing user, assign MDA, credential generation
- Welcome email with temporary credentials on account creation
- Session termination on account deactivation
- Staff ID search and update capability (system-wide for Department Admin)
- Staff ID duplicate detection across all loan records
- Data quality dashboard: Staff ID coverage metric, filterable by MDA, trend tracking
- Concurrent loan detection via Staff ID
- Weekly report generation (Executive Summary format)
- MDA compliance view with submission countdown

---

### Journey 5: Mrs. Adebayo — First Submission (Happy Path)

**Opening Scene:**
Mrs. Adebayo, MDA Reporting Officer for the Board of Internal Revenue (BIR), has been managing a 17-column spreadsheet for 11 years. She received a 2-hour virtual training session last week on VLPRS. Today is her first real submission.

**Rising Action:**
She opens VLPRS on her office computer. Logs in with the credentials from training. The interface is clean — one prominent button: "Submit Monthly Data." She clicks it. The system asks: "Submission for which month?" She selects February 2026.

Before the upload screen appears, a Pre-Submission Checkpoint loads. The header reads: "Before submitting, please review the following staff requiring attention." Two sections appear:

"Approaching Retirement (next 12 months): Staff 2847 — Badmus F.G. — Retirement: October 2026 (8 months)."

"Mid-Cycle Events Reported: None this month."

Mrs. Adebayo reads the retirement flag. She knows Badmus — he's still working, still getting deducted, loan is on track. No action needed this month, but the system is telling her: start thinking about this one. She ticks the confirmation checkbox: "I confirm I have reviewed the above and my submission reflects the current status of all staff." The upload screen appears.

The system shows her a template: 8 columns. Staff ID. Month. Amount Deducted. Payroll Batch Reference. MDA Code (pre-filled as BIR). Event Flag. Event Effective Date. Deduction Cessation Reason.

She has 47 staff with active loans. For all 47, everyone is paying normally this month — no retirements, no transfers, no leave events. She opens her payroll summary from the Accountant's office, copies the deduction amounts into the template, marks all Event Flags as "NONE," and leaves the last two columns — Event Effective Date and Deduction Cessation Reason — blank. The cognitive load is near zero for the happy path: 8 columns in the template, but only 5 require her input (MDA Code is pre-filled, and the last two are conditional fields that stay empty when nothing has changed). She uploads the CSV.

**Climax:**
The system processes in 6 seconds. "Upload Complete. 47 records received. Reference: BIR-2026-02-0001. Timestamp: 14-Feb-2026 10:23 WAT." Then a second screen appears: "Comparison Summary." The system has compared her submission against the expected deduction schedule. 43 records: "Aligned." 3 records: "Minor Variance (< ₦500)." 1 record: "Variance: ₦4,166.67 — Expected deduction ₦14,166.25, received ₦10,000.00."

The language is neutral. An information icon, not a warning. She clicks on the variance. The system shows: "Staff ID 2847 — expected monthly deduction ₦14,166.25. Amount submitted: ₦10,000.00. Difference: ₦4,166.25. This variance has been logged for reconciliation." She knows this one — Staff 2847 was on half-pay last month due to leave without pay. The system has already logged it. No emergency. No blame.

**Resolution:**
Mrs. Adebayo closes her browser. First submission: done in 12 minutes. Last month's 17-column spreadsheet took 3 hours. She hasn't calculated a single interest amount or running balance. She submitted facts — in 8 columns, of which the last two sat empty because nothing eventful happened. The system computed truth.

**Requirements Revealed:**
- Monthly submission wizard with month selection
- Pre-submission checkpoint displaying staff requiring attention before upload screen
- Approaching retirement alerts (next 12 months) in pre-submission checkpoint
- Mid-cycle event summary in pre-submission checkpoint
- Confirmation checkbox requirement ("I confirm I have reviewed the above and my submission reflects the current status of all staff")
- Pre-filled MDA code from user profile
- 8-column CSV template (downloadable): Staff ID, Month, Amount Deducted, Payroll Batch Reference, MDA Code, Event Flag, Event Effective Date, Deduction Cessation Reason
- Conditional fields: Event Effective Date and Deduction Cessation Reason required only when Event Flag is not NONE
- Atomic upload with confirmation (reference number, timestamp, row count)
- Automatic comparison against expected deduction schedule
- Neutral variance language ("Comparison Summary," not "Error Report")
- Variance detail view with mathematical explanation
- Information icon for variances, not warning/error icons

---

### Journey 6: Mrs. Adebayo — Error Recovery (Edge Case)

**Opening Scene:**
It's March. Mrs. Adebayo's second submission. She's more confident now. She uploads her CSV, but this time the system returns: "Upload Rejected. 3 issues found."

**Rising Action:**
The system shows three issues:
1. "Row 12: Staff ID 3301 — duplicate entry. This staff ID already has a submission for March 2026."
2. "Row 29: Amount Deducted — value '14,166.25.00' is not a valid number."
3. "Row 33: Amount Deducted is ₦0 with Event Flag = NONE and no Deduction Cessation Reason. Please explain why no deduction was made for Staff ID 5501."

The first is because she accidentally included a staff member twice. The second is a typo — an extra ".00" at the end. The third is a new kind of validation she hasn't seen before: the system won't accept a zero deduction without an explanation. Either the Event Flag needs to indicate why deductions stopped, or the Deduction Cessation Reason field needs to say what happened. You can't just silently submit nothing for a staff member. The system has not processed ANY rows — the upload is atomic. All or nothing.

**Climax:**
She fixes the first two errors in her CSV. Row 12 deleted (duplicate). Row 29 corrected to "14,166.25". For Row 33, she checks her records — Staff 5501 was on leave without pay last month. She corrects the row: sets Event Flag to "LWOP", Event Effective Date to "2026-02-01". Deduction Cessation Reason can stay blank — the Event Flag now explains the zero amount. She re-uploads. "Upload Complete. 47 records received. Reference: BIR-2026-03-0001." The system notes: "This replaces your previous attempt. Previous upload was rejected and no data was processed."

**Resolution:**
Total time to fix and resubmit: 6 minutes. No phone call to IT. No corrupted data sitting half-processed in the system. The atomic upload design means she can't accidentally create a mess. She can only succeed completely or fail cleanly. And the zero-amount validation caught something real — without it, Staff 5501's missing deduction would have silently entered the system as an unexplained gap, surfacing weeks later as an exception on Mr. Okonkwo's queue. The system pushed the explanation upstream, to the person who actually knows the answer.

**Requirements Revealed:**
- Atomic upload (all-or-nothing — no partial processing)
- Clear error messages with row number and specific issue
- Duplicate detection (same staff + same month)
- Data type validation with human-readable error descriptions
- Conditional field validation: zero deduction amount requires either an Event Flag (not NONE) or a Deduction Cessation Reason
- Event Flag + Event Effective Date pairing validation (Event Flag set requires Event Effective Date)
- Re-upload capability that cleanly replaces rejected attempts
- No partial state — system is always consistent

---

### Journey 7: Alhaji Mustapha — Loan Completion (Beneficiary, Phase 2)

**Opening Scene:**
Alhaji Mustapha has been checking his VLPRS dashboard monthly for the past year. His loan started at ₦600,000 principal, 60-month tenure. He's now at month 58. His dashboard shows: Outstanding Balance: ₦28,332.50. Installments Remaining: 2. Projected Completion: April 2026.

**Rising Action:**
April arrives. His salary is paid. He logs into VLPRS the next day. The dashboard has changed. Where the balance used to be, it now reads: "Congratulations! Your vehicle loan has been fully repaid." Below it: "Auto-Stop Certificate generated. Your MDA payroll officer has been notified to cease deductions." There's a green banner: "Download Your Clearance Letter."

**Climax:**
He taps the link. A PDF downloads — official letterhead, Oyo State Government crest, signed by the system with verification code. "This certifies that the vehicle loan obligation of Alhaji Mustapha K., Staff ID 7823, has been fully repaid as of April 2026. All salary deductions related to this loan should cease immediately." The document includes a QR code linking to the verification page.

Simultaneously, his MDA payroll officer at the Ministry of Education received the same certificate via the system — flagged as "Action Required: Cease Deduction for Staff ID 7823."

**Resolution:**
For the first time in his career, Alhaji Mustapha did not have to physically visit the Car Loan Department, bribe a front desk officer to find his file, wait 3 days for confirmation, and then pray that payroll actually stopped the deduction. The system stopped it. Automatically. With proof.

**Requirements Revealed:**
- Beneficiary dashboard with loan countdown (Phase 2)
- Auto-Stop Certificate generation (MVP — triggered by zero balance)
- Certificate with official branding, verification code, QR code
- Dual notification: beneficiary + MDA payroll officer
- Clearance letter PDF generation with digital verification
- "Action Required" notification to MDA with specific instruction

---

### Journey 8: Committee Admin — Approval Cycle (Phase 2)

**Opening Scene:**
The Vehicle Loan Committee meets quarterly to review and approve new loan applications. The Committee Chair opens VLPRS before the meeting and sees the pre-built Committee Action Items report.

**Rising Action:**
The report shows: 84 pending applications. Eligibility pre-validated by the system — 71 meet all criteria (grade level, tenure, no existing active loan). 9 flagged: existing loans not yet closed. 4 flagged: less than 24 months to retirement. Fund available for new approvals: ₦126M. If all 71 clean applications are approved, estimated fund draw: ₦38.7M.

**Climax:**
The committee reviews, discusses, and approves 65 applications, defers 6 for additional documentation. The Chair records each decision in VLPRS. The system generates approval letters, sets up loan records in the Loan Master, and schedules deduction start dates (with 2-month moratorium). All 65 approvals are processed in the meeting itself — no post-meeting paperwork.

**Resolution:**
The approved beneficiaries receive SMS notifications the next day. The Fund Available number on the AG's dashboard updates automatically. The committee's decisions are recorded with full audit trail.

**Requirements Revealed:**
- Committee Action Items report (pre-built, auto-generated before meeting)
- Eligibility pre-validation (grade level, tenure, existing loan check, retirement proximity)
- Fund availability calculation (real-time, adjusted for pending approvals)
- Bulk approval workflow (approve/defer/reject per application)
- Automatic loan record creation upon approval
- Moratorium scheduling (2-month gap before first deduction)
- Approval letter generation
- Decision audit trail (committee member, timestamp, conditions)

---

### Journey 9: Front Desk Officer — Walk-In Enquiry

**Opening Scene:**
It's 11am. Three government workers are waiting at the Car Loan Department front desk. In the old days, each enquiry meant searching through file cabinets — sometimes 20-30 minutes per person.

**Rising Action:**
First visitor: "I want to know my loan balance." Officer types staff ID. Record appears in 2 seconds. "Your outstanding balance is ₦187,442.00. You have 22 installments remaining."

Second visitor: "I submitted my application 3 months ago. What's the status?" Officer searches by name. Application found: "Status: Pending Committee Review. Next committee meeting: March 15."

Third visitor: "My salary was deducted last month but I already paid off my loan!" The officer searches the record. Loan status: Closed. Last deduction: January 2026. But a deduction of ₦14,166.25 appeared in February's payroll. The Auto-Stop Certificate was issued January 28. The officer confirms: "Your loan was completed in January. The stop-deduction certificate was sent to your MDA on January 28. The February deduction was likely already processed before the certificate arrived. I'll raise a refund request." She creates a discrepancy ticket in 2 minutes.

**Resolution:**
Three visitors, 12 minutes total. No file cabinets opened. No bribes offered or expected. The front desk officer's job transformed from file-hunter to information provider.

**Requirements Revealed:**
- Instant loan lookup by staff ID or name
- Application status tracking (for pending applications)
- Loan history visibility (closed loans, past certificates)
- Discrepancy ticket creation from front desk
- Auto-Stop Certificate visibility and audit trail
- Over-deduction post-closure handling workflow

---

### Journey 10: Barrister Folake — The Audit (Read-Only)

**Opening Scene:**
The Auditor-General's office has scheduled a routine review of the Vehicle Loan Scheme. Barrister Folake, a senior audit officer, is assigned the case. She's been given read-only VLPRS access. Her mandate: verify that the system's numbers are trustworthy and that proper controls exist.

**Rising Action:**
She starts with a random sample: 20 loan records across 8 MDAs. For each, she opens the full computation chain. Loan ID VLC-2024-0847: Principal ₦750,000. Interest ₦99,975. 60-month tenure. She sees every monthly ledger entry — source (PAYROLL), amount, payroll batch reference, posting timestamp, posting officer. She verifies the math. The system figure matches.

She tests an edge case: a staff member who accelerated repayment. The ledger shows the tenure change event — old tenure: 60, new tenure: 45 — with timestamp, approving officer, and policy reference. Monthly principal recalculated. She traces the computation. It's correct.

**Climax:**
She exports the complete Repayment Ledger to CSV — 47,000+ entries across all loans. She opens it in her own spreadsheet and runs independent calculations on her 20-sample set. Every figure matches VLPRS to the kobo. She checks the audit log: every login, every upload, every status change, every exception resolution — all timestamped, all attributed to specific users. She cannot find a single manual balance edit. Because there are none. Balances are computed, not stored.

**Resolution:**
Her audit report: "The VLPRS system maintains an immutable repayment ledger from which all balances are computed. No manual balance adjustments are possible. Segregation of duties is enforced through role-based access control. The computation chain for any loan is fully reconstructable from source data. The system is audit-compliant."

**Requirements Revealed:**
- Read-only audit role (view everything, edit nothing)
- Full computation chain visibility per loan
- Ledger export to CSV/Excel for independent verification
- Audit log: every action, every user, every timestamp
- No manual balance edit capability (architectural constraint)
- Tenure change audit trail (old value, new value, approver, policy reference)
- Bulk data export for sample-based audit methodology

---

### Journey Requirements Summary

| Journey | Key Capabilities Revealed |
|---------|--------------------------|
| **AG — 30-Second Truth** | Executive dashboard, PDF sharing, mobile performance, headline numbers |
| **Deputy AG — Pattern Hunter** | Drill-down, variance trends, exception flagging, MDA detail view, comparison views |
| **Dept Admin — Migration** | Migration tool, column trust, variance categorisation, baseline acknowledgment, migration dashboard, temporal profile management, post-retirement detection, MDA historical data upload |
| **Dept Admin — Daily Ops** | Loan lookup, early exit full workflow, exception resolution, event flag correction, report generation, user account management, Staff ID governance, data quality dashboard |
| **MDA Officer — Happy Path** | Pre-submission checkpoint, 8-field CSV with conditional fields (event date, cessation reason), submission wizard, automatic comparison, neutral variance language |
| **MDA Officer — Error Recovery** | Atomic upload, clear error messages, duplicate detection, clean re-upload, conditional field validation (zero amount + NONE event flag) |
| **Beneficiary — Completion** | Auto-Stop Certificate, clearance letter, dual notification, digital verification |
| **Committee — Approval** | Pre-built reports, eligibility validation, bulk approval, fund calculation, moratorium scheduling |
| **Front Desk — Walk-In** | Instant lookup, application status, certificate visibility, discrepancy ticket creation |
| **Auditor — Investigation** | Computation chain, ledger export, audit log, independent verification, no manual edit proof |

---

## Domain-Specific Requirements

*Domain: Govtech-Fintech (High Complexity)*

### Compliance & Regulatory

**Nigeria Data Protection Regulation (NDPR):**
- Privacy notices on all data collection points
- Consent capture for personal data processing
- Data minimisation — only data necessary for loan administration
- Right of access — beneficiaries can view their data
- Role-based access control with audit logging
- Data retention policy aligned with government financial record requirements (minimum 7 years for audit logs)
- Data Processing Impact Assessment before go-live

**Government Financial Administration:**
- Segregation of duties — enforced architecturally (MDA submits, system computes, committee approves, auditors observe)
- No single actor controls both input and outcome
- All financial computations fully reconstructable from source data
- Immutable audit trail for every state transition, posting, and exception
- Government approval authority preserved — system informs, humans decide
- Compliance with Oyo State financial regulations and Accountant General's Office procedures

**Audit & Oversight:**
- Complete derivation chain from raw deduction data to computed balance
- Read-only audit role with full system visibility
- Bulk data export capability for independent verification
- No manual balance edit capability (architectural constraint, not just policy)
- Every login, upload, status change, and exception resolution timestamped and attributed
- Audit log tamper resistance — append-only, no deletion

### Technical Constraints

**Financial Data Integrity:**
- Immutable append-only repayment ledger — INSERT only, no UPDATE or DELETE on financial records
- Balances computed from ledger entries, never stored as mutable state
- Decimal precision: kobo-level accuracy (2 decimal places) using appropriate decimal types, not floating point
- Last Payment Adjustment Method: final installment absorbs all rounding for mathematical perfection
- All 4 loan tiers computed identically — no per-tier code paths, only parameterised values
- Deterministic computation: same inputs always produce same outputs, verifiable by any auditor
- Retirement date computation: deterministic derivation from date of birth and date of first appointment, auditable and reproducible

**Security:**
- RBAC with 3 MVP roles (Super Admin, Department Admin, MDA Reporting Officer), expanding to 7 in Phase 2
- Session management with timeout policies appropriate for government use
- All API endpoints authenticated and authorised
- Input validation at all system boundaries (CSV upload, manual entry, API calls)
- Protection against OWASP Top 10 vulnerabilities
- Audit logging of all authentication events (login, logout, failed attempts)

**Data Hosting:**
- Data sovereignty — system and data must be accessible within Nigeria
- Regular automated backups with tested restore procedures
- Encryption at rest for all personal and financial data
- Encryption in transit (TLS) for all communications
- Environment separation (development, staging, production)

### Integration Requirements

**Current (MVP — Standalone):**
- No external system integrations in MVP
- MDA data arrives via CSV upload and manual entry — not API integration
- MDA historical data upload enables internal cross-validation against migration baseline (not external integration)
- System is intentionally standalone to avoid dependency on other government systems
- Export capabilities (CSV, PDF) for data portability

**Future (Phase 2+) — Three Integration Vectors:**

*Forward Integration (Data Ingestion — State Payroll Database):*
- Direct connection to State Payroll Database to pull monthly deduction data, replacing CSV uploads from 63 MDAs
- MVP preparation: all submission processing normalises to a `DeductionRecord[]` interface — CSV parser and future payroll API adapter both produce the same shape. No computation engine changes required when data source switches
- Payroll cross-verification data feed enables real-time variance detection instead of monthly batch comparison
- Gratuity-processing ministry data exchange for retirement receivables

*Backward Integration (API Consumers — Payroll Office & External Systems):*
- Payroll Office accesses VLPRS granular reporting and forecasting capabilities via API
- MVP preparation: consistent API response envelopes (`{ data, meta, error }`) and versioned route structure (`/api/v1/`) enable future external consumers without breaking internal clients. External auth slot (API key header) reserved in middleware chain but not activated until needed
- Potential integration with government identity systems for staff verification

*Lateral Integration (AG Office Platform Expansion):*
- VLPRS infrastructure (auth, audit, RBAC, email, PDF generation) available as shared foundation for other AG Office internal tools
- MVP preparation: strict domain isolation — infrastructure services (auth, audit, RBAC, email, PDF) never import from domain services (loan computation, submission parsing). This means infrastructure can be extracted into a shared package without pulling loan-specific code
- Event emission pattern (`loan.completed`, `submission.processed`, `autostop.triggered`) enables future webhook/queue consumers without modifying core services

---

## Web Application Specific Requirements

### Application Architecture

**Single Page Application (SPA) with Public Website:**
- Two-zone architecture: **Public Zone** (unauthenticated, multi-page) and **Protected Zone** (authenticated dashboard)
- Public Zone in MVP: comprehensive institutional website — homepage with hero section, Official Programme Notice, "How It Works" (4-step beneficiary journey), loan category cards (4 tiers with amounts), repayment & settlement rules (accordion), key capabilities, trust & compliance, endorsement placeholder, news section, and final CTA. Sub-pages for programme information, eligibility, repayment rules, FAQ, MDA guide, downloads, news, help & support, and legal/compliance pages. Responsive navigation with 2-level dropdown structure and login modal (Staff Portal active; Beneficiary Portal and EOI as Phase 2 placeholders). 4-column footer with legal strip and Programme Disclaimer
- Protected Zone: full dashboard experience per RBAC role
- Routing designed for Phase 2 expansion — Beneficiary Portal, EOI form, and Approved Beneficiary Lists slot into the existing Public Zone navigation without architectural changes
- PWA: basic installability only (manifest + service worker for home screen icon, no complex offline caching)

### Browser Compatibility

| Browser | Support Level |
|---------|-------------|
| Chrome (latest 2 versions) | Full support |
| Firefox (latest 2 versions) | Full support |
| Edge (latest 2 versions) | Full support |
| Brave (latest 2 versions) | Full support |
| Opera (latest 2 versions) | Full support |
| Safari (latest 2 versions) | Full support (AG's mobile) |
| Internet Explorer | Not supported |

Modern evergreen browsers only. No polyfills for legacy browsers.

### Responsive Design

- **Mobile-first** for dashboard views — AG's primary access pattern is phone on 4G
- **Desktop-optimised** for data-heavy workflows — migration tool, exception queues, detailed reports
- **Breakpoints:** Mobile (<768px), Tablet (768-1024px), Desktop (>1024px)
- All core workflows functional on mobile; data-intensive workflows optimised for desktop

### SEO Strategy

- **MVP Public Zone:** Basic SEO for all public pages — semantic HTML, meta tags (title, description, Open Graph), descriptive page titles, heading hierarchy. Public pages should be crawlable and indexable. Target: "VLPRS Oyo State" and "Oyo State Vehicle Loan Scheme" searches return the homepage. Pre-defined `<title>` and meta description for all 17 public routes documented in wireframes-epic-14.md § SEO & Meta Tags. Use `react-helmet-async` or React Router `<Meta>` for SPA meta tag management
- **Phase 2 Public Portal Expansion:** Extended SEO for EOI form discoverability, Approved Beneficiary Lists, and dynamic news/announcements pages

### Design Quality Standard

VLPRS will be evaluated by the State ICT Team and serves as a professional portfolio piece. The visual quality must signal architectural seriousness.

**Design Principles:**
- **Modern and polished** — clean typography, purposeful whitespace, subtle transitions/animations for state changes. Should feel like a modern fintech dashboard, not a government form-filling tool.
- **Professional colour palette** — government-appropriate but visually distinctive. Not "government grey." Colour used intentionally for status, hierarchy, and attention.
- **Component consistency** — unified design system with consistent spacing, elevation, border radius, and interaction patterns throughout.
- **Data visualisation quality** — charts, tables, and dashboards rendered with care. Numbers formatted clearly (₦1,840,000.00 not 1840000). Status indicators use colour + icon + text (never colour alone).
- **Responsive polish** — transitions between breakpoints should feel intentional, not collapsed. Mobile is a first-class citizen, not a shrunken desktop.
- **Loading and empty states** — skeleton loaders, contextual empty states with guidance ("No submissions yet for March — submissions open on the 1st"), progress indicators for uploads.
- **Micro-interactions** — subtle feedback on button clicks, form submissions, status changes. The system should feel responsive and alive.

**Quality bar:** ICT Team evaluates the system as professionally built. Design quality comparable to modern fintech dashboards, not legacy government portals.

### Implementation Considerations

- **Framework choice** should support SPA architecture, component-based design, and modern CSS (to be decided in technical architecture)
- **Design system** established in Sprint 1 — Oyo Crimson palette, Inter/JetBrains Mono typography, non-punitive colour tokens, extended Badge variants, and priority reusable components (HeroMetricCard, NairaDisplay, AttentionItemCard, FileUploadZone, MigrationProgressCard, ExceptionQueueRow). All subsequent screens built from this foundation
- **Mock data layer** established in Sprint 1 — all screens fetch data through hook abstractions returning mock data initially. When backend APIs are delivered in subsequent sprints, hooks are updated to call real endpoints with zero UI component changes. Progressive wiring, not big-bang integration
- **Asset optimisation** for 4G mobile performance — lazy loading, code splitting, compressed images
- **State management** appropriate for role-based views with shared data (loan records, dashboard aggregates)
- **API-first backend** — all data access through structured API endpoints, enabling future integrations without backend changes
- **Demo seed script** (`pnpm seed:demo`) delivers 5 named accounts with role-specific credentials, 63 MDAs, and realistic mock loan data — enabling client access to the hosted system from Sprint 1

---

## Functional Requirements

### Loan Computation & Financial Engine

- FR1: System can compute loan repayment schedules for all 4 grade-level tiers with correct principal, interest, and total amounts
- FR2: System can apply 2-month moratorium (grace period) to new loans with no interest accrual during moratorium
- FR3: System can compute accelerated repayment schedules when tenure is shortened
- FR4: System can apply last-payment adjustment method where the final installment absorbs all accumulated rounding
- FR5: System can auto-split monthly deduction amounts into principal and interest components
- FR6: System can compute outstanding balances from the immutable repayment ledger (derived, never stored)
- FR7: System can detect when a loan balance reaches zero and trigger the auto-stop process
- FR8: System can generate an Auto-Stop Certificate with verification code when a loan is fully repaid
- FR9: System can send the Auto-Stop Certificate to both the beneficiary and the MDA Reporting Officer

### Data Management & Immutable Ledger

- FR10: System can store loan master records (borrower details, loan terms, approval data, MDA assignment, date of birth, date of first appointment, computed retirement date). Staff ID is optional at migration but required for all new loans created post-MVP
- FR11: System can record repayment entries as immutable append-only ledger records (no UPDATE or DELETE)
- FR12: System can reconstruct any loan balance at any point in time from the ledger history
- FR13: System can store and retrieve loan records by staff ID, name, MDA, or loan reference number
- FR14: System can track loan lifecycle states (Applied, Approved, Active, Completed, Transferred, Written Off)
- FR15: System can record loan state transitions with timestamp, acting user, and reason

### MDA Monthly Submission

- FR16: MDA Reporting Officers can upload monthly deduction data via CSV file (8 fields: Staff ID, Month, Amount Deducted, Payroll Batch Reference, MDA Code, Event Flag, Event Effective Date — required when Event Flag ≠ NONE and blank when NONE, Deduction Cessation Reason — required when Amount = ₦0 AND Event Flag = NONE to explain why no deduction was made e.g. "Leave Without Pay", "Payroll Error", "Awaiting Salary Reinstatement")
- FR17: MDA Reporting Officers can enter monthly deduction data manually through a form interface that mirrors the 8-field CSV structure (Staff ID, Month, Amount Deducted, Payroll Batch Reference, MDA Code, Event Flag, Event Effective Date — required when Event Flag ≠ NONE and blank when NONE, Deduction Cessation Reason — required when Amount = ₦0 AND Event Flag = NONE) with the same validation rules and atomic behaviour as CSV upload
- FR18: System can validate submissions atomically — all rows accepted or entire upload rejected (no partial processing)
- FR19: System can detect and reject duplicate submissions (same staff ID + same month)
- FR20: System can validate data types and format correctness with error messages that reference specific field names and row numbers, state what is wrong, and state the correct format — validated by usability testing with non-technical government staff. System rejects submissions where Amount = ₦0 with Event Flag = NONE and no Deduction Cessation Reason provided. System validates Event Effective Date is a valid date when Event Flag ≠ NONE
- FR21: System can compare submitted deductions against expected deduction schedules and generate a comparison summary
- FR22: System can display comparison results using neutral language — prohibited terms: "error," "mistake," "fault," "wrong"; required terms: "comparison," "variance," "difference"; informational icons only (no warning/error icons)
- FR23: System can generate a submission confirmation with reference number, timestamp, and row count
- FR24: System can enforce period lock to prevent submissions for future months or already-closed periods

### Data Migration

- FR25: Department Admin can upload legacy MDA spreadsheets (.xlsx and .csv) through the migration tool with a column-mapping step to map source columns to required VLPRS fields (up to 10MB / 500 rows per upload). Migration spreadsheets require Date of Birth and Date of First Appointment columns. Records with missing temporal data flagged as "Profile Incomplete" — migration proceeds but loan record displays amber indicator until resolved
- FR26: System can validate and categorise migrated records (Clean, Minor Variance, Significant Variance, Structural Error, Anomalous)
- FR27: System can display side-by-side comparison of MDA-declared values vs system-computed values with mathematical explanation
- FR28: Department Admin can acknowledge variances and establish baseline positions ("Accept as Declared")
- FR29: System can create summary ledger entries from migrated data to establish the starting baseline
- FR30: System can track migration status per MDA (Pending, Received, Imported, Validated, Reconciled, Certified)
- FR31: Department Admin can view a Migration Dashboard showing all 63 MDAs and their migration status

### Executive Dashboard & Reporting

- FR32: Super Admin can view an executive dashboard with four headline numbers (Active Loans, Total Exposure, Fund Available, Monthly Recovery) without any interaction. Secondary metrics visible without interaction: Pending Early Exits count with expected recovery amount, Gratuity Receivable Exposure total
- FR33: Super Admin can view attention items on the dashboard including: (a) MDAs with submission variance >5% for 2+ consecutive months, (b) MDAs with overdue submissions, (c) loans with zero deduction for 60+ days, (d) Auto-Stop Certificates pending MDA acknowledgment, (e) staff with active deductions past computed retirement date — service status verification required, (f) pending early exit computations approaching payment deadline, (g) records missing Staff ID as data quality indicator with percentage complete metric — with Red (action required), Amber (monitor), Green (informational) status indicators
- FR34: Super Admin can drill down from headline numbers to MDA-level detail showing: MDA name, active loan count, total exposure amount, monthly recovery amount, current-period submission status, and variance percentage vs expected deductions
- FR35: Super Admin can drill down from MDA-level to individual loan records showing: borrower name, Staff ID, loan reference number, principal amount, outstanding balance, installments paid/remaining, last deduction date, loan status, and computed retirement date
- FR36: Super Admin can view MDA compliance status (which MDAs have submitted for the current period)
- FR37: System can generate Executive Summary reports containing: scheme overview (total active loans, total exposure, fund available, monthly recovery rate), MDA compliance status, top 5 variances by magnitude, exception summary (open/resolved counts), and month-over-month trend for key metrics
- FR38: System can generate MDA Compliance reports containing: MDA name, submission status for the current period and prior 3 periods (Submitted/Overdue/Pending), submission date and time, record count per submission, and number of records with variances — filterable by submission status, sortable by MDA name or submission date
- FR39: System can generate Variance reports containing: MDA name, staff name, Staff ID, loan reference number, declared deduction amount, computed expected amount, absolute variance, percentage variance, and variance category (Minor <₦500, Significant ₦500-₦10,000, Structural >₦10,000) — sortable by variance magnitude, filterable by MDA and variance category, covering the selected submission period
- FR40: System can generate Loan Snapshot reports by MDA (the computed 16-column view)
- FR41: Department Admin can generate weekly AG reports containing: executive summary, compliance status (submissions received this week), exceptions resolved with resolution notes, and outstanding attention items — covering the 7-day period ending on generation date, exportable as PDF

### Access Control & Authentication

- FR42: Users can authenticate via email and password (minimum 8 characters, at least one uppercase, one lowercase, one digit) with 30-minute inactivity session timeout, account locked after 5 consecutive failed attempts for 15 minutes, all sessions invalidated on password change
- FR43: System can enforce role-based access control with 3 MVP roles (Super Admin, Department Admin, MDA Reporting Officer)
- FR44: Super Admin can view all data across all MDAs
- FR45: Department Admin can view all data, manage loans, process migrations, and resolve exceptions
- FR46: MDA Reporting Officers can only view and submit data for their assigned MDA
- FR47: System can log all authentication events (login, logout, failed attempts)
- FR48: System can log all user actions with timestamp, user identity, role, and IP address

### Notifications & Alerts

- FR49: System can send email submission reminders to all MDA Reporting Officers who have not yet submitted for the current period at T-3 days (25th of month) before the 28th deadline, including MDA name, submission period, expected record count, and link to submission interface
- FR50: System can send overdue email alerts on T+1 (29th of month) to MDA Reporting Officers who have not submitted, and a consolidated non-compliance list to the Department Admin, including MDA name, submission period, days overdue, and link to submit
- FR51: System can send loan completion notifications to beneficiaries when balance reaches zero
- FR52: System can send Auto-Stop Certificate notifications to MDA payroll officers with instruction to cease deductions

### Report Output & Sharing

- FR53: System can export any generated report as a branded PDF with Oyo State Government crest, official formatting, generation date, and VLPRS reference number
- FR54: Super Admin and Department Admin can share generated PDF reports via: (a) a one-tap download to the user's device, or (b) a one-tap email action that sends the PDF as an attachment to a user-specified email address with a system-generated cover message containing report title, generation date, and VLPRS reference number

### Exception Management

- FR55: Super Admin and Department Admin can flag loan records as exceptions with a priority level (High, Medium, Low), category (Over-deduction, Under-deduction, Inactive, Data Mismatch), and free-text notes
- FR56: Super Admin and Department Admin can view an exception queue showing all open exceptions sorted by priority, filter by category or MDA, and resolve exceptions with a resolution note and action taken
- FR57: System can detect inactive loans (no deduction recorded for 60+ consecutive days) and auto-flag them as exceptions with category "Inactive"

### Record Annotations & Corrections

- FR58: Department Admin can add annotations (free-text notes) to any loan record to capture institutional context, with each annotation timestamped and attributed to the authoring user
- FR59: Department Admin can correct a previously submitted event flag on a loan record through a correction workflow that logs the original value, new value, correction reason, and correcting user

### Pre-Submission & Mid-Cycle Events

- FR60: MDA Reporting Officers can review a pre-submission checkpoint screen before CSV upload or manual submission showing: staff approaching retirement within 12 months (with name, Staff ID, computed retirement date), staff with zero deduction last month and no event filed, mid-cycle events reported since last submission awaiting CSV confirmation. MDA Reporting Officer must confirm review via checkbox before submission is accepted
- FR61: MDA Reporting Officers and Department Admin can file mid-cycle employment events at any time via a form with 5 fields: Staff ID (with name/MDA lookup confirmation), Event Type (Retired, Deceased, Suspended, Absconded, Transferred Out, Dismissed, LWOP Start, LWOP End, Service Extension), Effective Date, Reference Number (required for Retirement, Transfer, Dismissal; optional for others), Notes (optional). System immediately updates staff loan status and sends confirmation
- FR62: System can reconcile mid-cycle employment events against monthly CSV submissions: matched events (same staff + same event type + dates within 7 days) confirmed automatically; date discrepancies flagged for Department Admin reconciliation; mid-cycle events not reflected in subsequent CSV flagged as "Unconfirmed Event"; CSV events with no prior mid-cycle report accepted and recorded normally

### Retirement & Tenure Validation

- FR63: System can compute remaining service months from computed retirement date at loan setup or approval and compare against loan tenure. If tenure exceeds remaining service, system displays: payroll deduction months, gratuity receivable months, and projected gratuity receivable amount — visible to approving authority before loan creation
- FR64: System can track projected gratuity receivable amount (outstanding balance at computed retirement date) for loans where tenure exceeds remaining service, updated monthly as deductions are posted. Total gratuity receivable exposure across all such loans surfaced on executive dashboard
- FR65: System can compute retirement date as the earlier of (date of birth + 60 years) or (date of first appointment + 35 years). Retirement date recomputed automatically if date of birth or date of first appointment is corrected. Computed retirement date stored on loan record and used for all temporal validations
- FR66: Department Admin can record a service extension for a staff member with: new expected retirement date, approving authority reference number, and notes. Override replaces computed retirement date for all temporal validations. Audit-logged with original computed date, new override date, reference, and reason

### Early Exit Processing

- FR67: Department Admin can initiate an early exit computation for an active loan, generating: remaining principal balance, current month interest amount, total lump sum payoff amount, and computation validity expiry date (last day of current month). Each computation assigned a unique reference number
- FR68: Department Admin can record: staff commitment to early exit (with agreed payment deadline), and lump sum payment received (with payment date, amount, and payment reference). Upon confirmed payment matching or exceeding the computed payoff amount, system closes the loan and triggers Auto-Stop Certificate generation
- FR69: System can mark an early exit computation as expired if it reaches its expiry date without recorded payment. A new computation is required for an updated payoff amount. Expired computations retained in audit history. Staff commitment without payment by deadline flagged as attention item for Department Admin

### Historical Data & Migration Reconciliation

- FR70: MDA Reporting Officers can upload historical monthly deduction records (prior months/years) via CSV using the same 8-field format. System validates, timestamps as historical, and cross-references against migration baseline data. Variances between MDA historical records and central migration data surfaced in a reconciliation report for Department Admin review
- FR71: System can generate a Service Status Verification Report during migration processing listing all imported staff whose computed retirement date is before the import date with active loan status. Report includes: staff name, Staff ID (if available), MDA, computed retirement date, months past retirement, and outstanding balance — provided to Department Admin for investigation and resolution

### User & Account Administration

- FR72: User account lifecycle management with downward-only hierarchy. Super Admin can create, deactivate, reactivate, soft-delete, and reassign Department Admin and MDA Reporting Officer accounts. Department Admin can create, deactivate, reactivate, soft-delete, and reassign MDA Reporting Officer accounts only. Super Admin accounts are managed exclusively via CLI commands requiring server access — no Super Admin can manage another Super Admin through the UI (political safety, separation of duties). No user can modify their own account through user management endpoints (self-protection). Account states: Active (can log in), Deactivated (login disabled, sessions terminated, reversible), Deleted (soft delete, one-way, preserved for audit). On account creation, system generates temporary password and sends welcome email via Resend with login URL and credentials. New users must change password on first login (`must_change_password` flag enforced at API level). All account lifecycle changes audit-logged with acting user, target user, action, timestamp, and IP. Last-active-super-admin guardrail prevents deactivation/deletion that would leave zero active super admins. Profile self-service: all users can view their own profile details (name, email, role, MDA, created date, last login) and change their own password
- FR73: Admin-initiated password reset scoped by management hierarchy. Department Admin can reset passwords for MDA Reporting Officer accounts. Super Admin can reset passwords for Department Admin and MDA Reporting Officer accounts. On reset, system generates temporary password, sends reset email via Resend, sets `must_change_password = true`, and revokes all existing refresh tokens for that user. Password reset events audit-logged with acting user and timestamp

### Staff ID Governance

- FR74: MDA Reporting Officers can add or update Staff ID for loan records within their assigned MDA only. Department Admin and Super Admin can search and update Staff IDs system-wide. All Staff ID changes audit-logged with old value, new value, acting user, and timestamp
- FR75: System can detect duplicate Staff IDs when a Staff ID is added or updated by checking all existing records. If a match is found, system displays: "This Staff ID is already assigned to loan record [VLPRS reference]. Please verify before proceeding." User can proceed (with justification note logged) or cancel the update

### Public Website & Scheme Information

- FR76: System renders a public homepage with: hero section (Oyo State Government branding, scheme title, value proposition, primary CTAs for Staff Login and scheme information), Official Programme Notice card (committee-based approvals, payroll deduction repayment, audit-trail record-keeping, NDPR note), trust strip ("Administered by the Accountant-General's Office" with 3 trust badges: NDPR-aligned, Audit-ready reporting, Committee approvals preserved), "How It Works" 4-step beneficiary journey (Expression of Interest → Administrative Review → Committee Decision → Payroll Repayment), loan category cards (4 tiers with grade levels and maximum amounts), key capabilities section (6 cards: Immutable Ledger, Computed Balances, Auto-Stop Certificates, Real-Time Dashboard, Non-Punitive Design, Audit-Ready), repayment & settlement rules accordion (Standard, Accelerated, Early Principal Settlement, Retirement & Gratuity — with Key Clarification panel), "Who VLPRS Serves" role cards (AG, Deputy AG, Car Loan Dept, MDA Officers, Beneficiaries), trust & compliance section (NDPR, audit logging, immutable ledger), endorsement/authority placeholder, news section (3 latest announcements), and final CTA. All copy follows the neutral language rule: describes what VLPRS enables, never what was broken
- FR77: System renders a responsive navigation bar with: Oyo State crest + "Vehicle Loan Scheme" wordmark, top-level navigation items (Home, About as direct link to `/about`, The Scheme and Resources as dropdowns, How It Works and Help & Support as direct links), and a login CTA button that opens a modal dialog with 3 entry points: Staff Portal (active — links to `/login`), Beneficiary Portal (Coming Soon — Phase 2), Expression of Interest (Coming Soon — Phase 2). Navigation collapses to hamburger menu on mobile (<768px). Footer renders a 4-column layout (The Scheme, Resources, Contact, Staff Portal link) with legal strip containing: Programme Disclaimer ("This portal provides general programme information. Loan approvals, payroll deductions, and gratuity processing remain subject to applicable government procedures and committee decisions"), Privacy & Data Protection link, Accessibility link, and copyright notice. Navigation, login modal, footer, breadcrumb, page header, CTA banner, disclaimer callout, and programme disclaimer are implemented as 8 shared public components (see wireframes-epic-14.md § Shared Components) reused across all 20 public pages via 4 page templates (Content Page, Card Grid, Placeholder, Homepage)
- FR78: System renders scheme information pages: Programme Overview (scheme objectives, policy basis, governance structure), About VLPRS (the digital system, "MDAs submit facts, VLPRS computes truth" philosophy, what VLPRS does and does not do), Eligibility & Loan Categories (4 grade-level tiers with loan amounts ₦250k/₦450k/₦600k/₦750k, standard 60-month tenure, eligibility conditions including tenure-to-retirement provisions), Repayment & Settlement Rules (accordion: Standard 60-month, Accelerated shorter tenure, Early Principal Settlement with interest forfeiture, Retirement & Gratuity Settlement — with Key Clarification: "VLPRS supports record accuracy and reconciliation. It does not replace payroll authority or gratuity processing procedures"), and How It Works (4-step visual: EOI → Review → Committee Decision → Payroll Repayment, with disclaimer: "Expression of Interest submission does not constitute loan approval"). Note: former "Role of the AG's Office" page content is absorbed into FR82 (About the Programme) Programme Governance section
- FR79: System renders resources and support pages: Frequently Asked Questions (categorised by audience: beneficiaries, MDA officers, general public — minimum 15 questions), MDA Submission Guide (step-by-step 8-field CSV submission process with screenshots placeholder, downloadable CSV template), Downloads & Forms (CSV template, policy summary PDF, training materials placeholder), News & Announcements (card-based list with title, date, excerpt, and detail view), and Help & Support (contact information: physical office address, email, phone, office hours Mon-Fri 8am-6pm WAT)
- FR80: System renders legal and compliance pages: Privacy & Data Protection (NDPR compliance statement — privacy notices, consent capture, data minimisation, right of access, retention policy), Programme Disclaimer (system scope, committee authority preservation, no legal commitment from EOI), and Accessibility Statement (WCAG 2.1 AA commitment, accessibility features, contact for accessibility issues)
- FR81: All public pages include: descriptive `<title>` tags, meta description tags, Open Graph tags for social sharing (pre-defined for all 17 routes — see wireframes-epic-14.md § SEO & Meta Tags), semantic HTML structure (proper heading hierarchy, landmark regions, nav/main/footer elements), and mobile-responsive layout with minimum 44x44px touch targets. Public pages are served as part of the SPA with client-side routing but use semantic HTML and meta tags for crawlability. All public pages are built from 4 reusable page templates with responsive breakpoints at <768px (mobile), 768–1024px (tablet), >1024px (desktop) — see wireframes-epic-14.md § Page Templates and § Responsive Behaviour Summary
- FR82: System renders an About the Programme page (`/about`) with: Mission Statement (2-3 sentences), Vision Statement (2-3 sentences), Core Values (Transparency, Accountability, Accuracy, Fairness, Institutional Trust), Programme Leadership section (Accountant-General, Deputy Accountant-General, Director Car Loan Department — each with prominent role title, name of current office holder, optional photo, and institutional role description), Programme Governance section (Vehicle Loan Committee structure, decision authority, AG's Office oversight role — absorbs former `/scheme/ag-office` content), and Institutional Story (neutral-language narrative of programme objectives). Leadership cards display role title and institutional description as permanent text, name as swappable text — designed for zero-effort personnel updates. Page accessible via top-level "About" navigation item (not nested in a dropdown). Content extracted to `src/content/about.ts` for future CMS migration readiness

---

## Non-Functional Requirements

### Performance

| Requirement | Target | Measurement Method |
|-------------|--------|-------------------|
| Executive dashboard load (4G mobile) | <3 seconds | Time from navigation to all four headline numbers rendered |
| Subsequent SPA page transitions | <500ms | Time from click to content rendered |
| CSV upload processing (100 rows) | <10 seconds | Time from upload initiation to confirmation screen |
| Report generation (any standard report) | <10 seconds | Time from request to rendered/downloadable report |
| Loan search by staff ID | <2 seconds | Time from search submission to result display |
| Time to Interactive (first visit) | <4 seconds | Industry-standard web performance measurement tooling (TTI metric) |
| Computation engine (single loan schedule) | <1 second | Time to compute full 60-month schedule |
| Migration tool (single MDA import, ~50 records) | <15 seconds | Time from upload to categorisation result |
| Event cross-validation (per monthly submission) | <5 seconds | Time from submission to cross-validation result against mid-cycle events |
| Pre-submission checkpoint load | <3 seconds | Time from "Submit Monthly Data" click to checkpoint screen rendered |
| Early exit computation | <3 seconds | Time from initiation to payoff amount displayed |
| Historical data upload (100 rows) | <15 seconds | Time from upload to cross-reference report generated |
| Public homepage load (4G mobile) | <2 seconds FCP | Time from navigation to first meaningful content painted (hero section visible) |
| Public page navigation | <500ms | Time from click to content rendered (client-side SPA transition) |

### Security

| Requirement | Specification |
|-------------|--------------|
| Authentication | Email/password login. Password policy: minimum 8 characters, at least 1 uppercase, 1 lowercase, 1 digit. All sessions invalidated on password change. |
| Authorisation | Role-based access control enforced at API level — 100% of API endpoints enforce role checks, verified by automated integration tests. No client-side-only access checks. |
| Data encryption (transit) | TLS 1.2+ for all communications |
| Data encryption (rest) | All personal and financial data encrypted at rest using AES-256 or equivalent |
| Financial record immutability | No UPDATE or DELETE operations on repayment ledger — enforced at database and API level |
| Audit logging | Every user action logged with timestamp, user ID, role, IP address, action type |
| Audit log protection | Audit logs are append-only — no modification or deletion capability |
| Input validation | All user inputs validated server-side at API boundary — CSV uploads, form submissions, search queries |
| OWASP Top 10 | System protected against all OWASP Top 10 vulnerability categories — verified by automated security scanning tool before each release |
| Session management | 30-minute inactivity timeout for all roles. Session token regenerated on privilege change. Maximum concurrent sessions: 1 per user. |
| Failed login protection | Account locked for 15 minutes after 5 consecutive failed login attempts within 10 minutes. Failed attempts logged with IP address. |
| NDPR compliance | Privacy notices on all data collection points, consent capture before personal data processing, data minimisation, right of access, retention policy (minimum 7 years for financial records) |

### Scalability

| Requirement | Specification |
|-------------|--------------|
| Concurrent users | 63 MDA officers + 3 admin users submitting in the same week while maintaining all Performance section targets |
| Peak submission window | System maintains performance targets during monthly submission window (20th-28th) |
| Data volume | Support 63 MDAs x ~50 active loans each = ~3,150 loan records with full ledger history |
| Ledger growth | System performs within targets as ledger accumulates 5+ years of monthly entries (~189,000+ ledger rows) |
| Historical data bulk import | System maintains performance targets when processing MDA historical uploads (up to 60 months x 50 staff = 3,000 historical entries per MDA) |
| Future growth | System architecture supports addition of new API consumers (Phase 2 integrations) without changes to existing endpoints or data structures — verified by demonstrating a new read-only API consumer connecting to existing endpoints in a test environment |

### Accessibility

| Requirement | Specification |
|-------------|--------------|
| WCAG compliance level | WCAG 2.1 AA |
| Minimum font size | 16px base with clear typographic hierarchy |
| Colour contrast | Minimum 4.5:1 for body text, 3:1 for large text (per WCAG AA) |
| Touch targets | Minimum 44x44px for all interactive elements |
| Icon usage | All icons accompanied by text labels — no icon-only interactions |
| Keyboard navigation | All workflows in FR16-FR24 (submission), FR32-FR36 (dashboard), FR42 (login), FR25-FR31 (migration), FR60 (pre-submission checkpoint), FR61 (mid-cycle event form), and FR67-FR69 (early exit) navigable by keyboard |
| Error communication | Error messages reference specific field names and row numbers, state what is wrong and what the correct format is, validated by usability testing with non-technical government staff |
| Colour independence | Status indicators use colour + icon + text — never colour alone |

### Reliability & Data Integrity

| Requirement | Specification |
|-------------|--------------|
| System availability | 99.5% during business hours (Mon-Fri, 8am-6pm WAT) |
| Data loss tolerance | Zero — no financial record may be lost under any circumstance |
| Backup frequency | Automated daily backups with tested restore procedures |
| Recovery time objective | <4 hours for full system recovery from backup |
| Atomic operations | All data submissions are atomic — complete success or complete rollback, no partial state |
| Computation determinism | Same inputs always produce identical outputs — verifiable by independent calculation |
| Decimal precision | Kobo-level accuracy (2 decimal places) using appropriate decimal types, never floating point |
| Retirement date computation integrity | Retirement date derivation produces identical result from same DOB + appointment date inputs, verifiable by independent calculation |
