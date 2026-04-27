---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
  - docs/homepage_structure.md
  - docs/questionnaire_schema.md
workflowComplete: true
completionDate: 2026-01-05
---

# Oyo State Labour & Skills Registry (OSLSR) - Epic Breakdown

## Change Log

| Date | Updates | Author |
|------|---------|--------|
| 2026-01-05 | Initial epic breakdown for Epics 1–8 | Awwal (with Bob facilitation) |
| 2026-04-25 | **SCP-2026-04-22 — Multi-source registry, API governance, security hardening, field-survey UX readiness, admin audit visibility.** Added Epic 10 (API Governance & Third-Party Data Sharing, 6 stories: 10-1 Consumer Auth / 10-2 Per-Consumer Rate Limiting / 10-3 Consumer Admin UI / 10-4 Developer Portal / 10-5 DSA Template + Onboarding SOP / 10-6 Consumer Audit Dashboard). Added Epic 11 (Multi-Source Registry & Secondary Data Ingestion, 4 stories: 11-1 Schema Foundation / 11-2 Import Service + Parsers / 11-3 Admin Import UI / 11-4 Source Badges + Filter Chips). Refreshed Epic 9 goal statement to span polish + domain migration + security hardening + field-survey UX readiness + admin audit visibility. Added 3 new Epic 9 stories: 9-10 PM2 Restart-Loop Investigation, 9-11 Admin Audit Log Viewer, 9-12 Public Wizard + Pending-NIN + Magic-Link Email. Backfilled previously undocumented Epic 9 stories 9-6 / 9-7 / 9-8 (drift between sprint-status.yaml and epics.md prior to this pass). Documented Story 9-9 expanded scope as a 10-subtask matrix with current as-deployed state (Tailscale + SSH hardening done 2026-04-23; OS patching done 2026-04-25; 8 subtasks remaining). Added standalone `prep-input-sanitisation-layer` prep task (centralised normalisation utilities at every input boundary, schema strengthening DOB TEXT→DATE + phone CHECK, slot before field survey). Cross-referenced the Field Readiness Certificate (SCP §5.3.1) — six-item field-survey go/no-go gate. **Scope locked:** no stories added beyond the 14 enumerated in SCP §5.2; Epics 1–8 preserved unchanged. See `_bmad-output/planning-artifacts/sprint-change-proposal-2026-04-22.md` §2.1 + §4.1 for full SCP context. Inputs: PRD V8.2 (post-John A.1) + Architecture revision (post-Winston A.2; Decisions 1.5 / 2.4–2.8 / 3.4 / 5.4–5.6 + ADRs 018/019/020) + UX revision (post-Sally A.3; Journey 2 rewrite + Journeys 5–8 + 6 components + Form Patterns + NDPA Compliance Checklist updates). | John (PM) |

## Overview

This document provides the complete epic and story breakdown for Oyo State Labour & Skills Registry (OSLSR), decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: Consent Management - The system shall present a clear consent screen (Two-stage marketplace consent workflow) allowing respondents to opt-in for an anonymous marketplace profile. Paper forms must have pre-printed serial numbers.
FR2: Two-Stage Consent Workflow - The system shall implement `consent_marketplace` (Stage 1: Anonymous) and `consent_enriched` (Stage 2: Name/Phone) fields within the survey form.
FR3: Public Access & Authentication - The system shall provide a public-facing Homepage with distinct authentication endpoints for "Staff Login" and "Public Register".
FR4: Public User Survey - The system shall allow registered Public Users to securely log in and fill out survey questionnaires via the native form renderer.
FR5: NIN Verification - The system shall require public users to provide their National Identity Number (NIN) during registration (Global Uniqueness enforced).
FR6: Staff Provisioning - The system shall allow Super Admins to invite/provision new staff via Manual Single-User Creation or Bulk CSV Import (with LGA locking).
FR7: Staff Login - The system shall allow Enumerators and staff to securely log in to the Custom App using unique credentials.
FR8: Enumerator Dashboard - The system shall provide Enumerators with a personalized dashboard displaying daily/weekly progress.
FR9: Offline Collection (PWA) - The system shall enable offline data collection using the native form renderer (browser-based PWA) with IndexedDB draft storage and background sync to the API.
FR10: Pause/Resume - The system shall support pausing and resuming incomplete survey sessions via IndexedDB draft storage with exact question position restore.
FR11: In-App Communication - The system shall provide communication channels for staff to message Supervisors.
FR12: Supervisor Dashboard - The system shall allow Supervisors to view real-time progress of assigned Enumerators.
FR13: Context-Aware Fraud Detection - The system shall implement a Fraud Signal Engine with configurable thresholds for Cluster Detection, Speed Run, and Straight-lining. Flags do NOT block data.
FR14: Questionnaire Management - The system shall enable Super Admins to manage questionnaires via the native Form Builder UI, with one-time XLSForm migration for existing forms.
FR15: Back-Office Reporting - The system shall provide Verification Assessors (Read/Write verification status) and Government Officials (Read-Only/Export) with dashboards.
FR16: Audit Trails - The system shall include detailed immutable audit trails for all user actions and data modifications.
FR17: Marketplace Search - The system shall provide a public-facing interface for searching skilled worker profiles by skill, LGA, and experience.
FR18: Enriched Contact Access - The system shall require Public Searchers to register/log in to view unredacted contact details.
FR19: Contact View Logging - The system shall log every instance of a Public Searcher viewing unredacted contact details.
FR20: Data Entry Interface - The system shall provide a dedicated, keyboard-optimized High-Volume Data Entry Interface for Clerks.
FR21: Global NIN Uniqueness - The system shall enforce uniqueness of NIN across all submission sources (Enumerator, Public, Paper) at the database level.
FR22: Survey Analytics - The system shall provide role-scoped statistical analysis (descriptive and inferential) of survey data across all dashboard roles, with appropriate access controls.
FR23: Public Labour Market Insights - The system shall publish anonymized, aggregated labour market statistics on the public-facing website for transparency and policy communication.

### NonFunctional Requirements

NFR1.1: API response times < 250ms (p95).
NFR1.2: Frontend page loads < 2.5s on 4G.
NFR1.3: Offline-to-online sync of 20 surveys < 60s.
NFR2.1: Scalability - Support baseline 132 Field Staff (scalable).
NFR2.2: Planning Capacity ~200 total staff accounts (soft limit).
NFR2.3: Capacity monitoring alerts at 120 and 180 field staff.
NFR2.4: Bulk Import supports 500+ users.
NFR2.5: Support ~1,000 concurrent Public Users.
NFR3.1: 99.5% SLA (Single-VPS target).
NFR3.2: Degraded Mode (IndexedDB preserves drafts if API is unavailable; background sync retries).
NFR3.3: Comprehensive Backup Strategy (Daily S3 dumps, Real-time media sync, 7-year retention).
NFR3.4: Disaster Recovery (6-hour snapshots, 1-hour RTO).
NFR4.1: Data Minimization (Collect NIN, DO NOT collect BVN).
NFR4.2: Retention (7 years raw data, Marketplace until revoked).
NFR4.3: Logically Isolated Marketplace (Read-Only Replica).
NFR4.4: Defense-in-Depth (Rate Limiting, Honeypots, CSP, IP Throttling).
NFR4.5: Input Validation & Sanitization (Frontend + Backend).
NFR4.6: Role Conflict Prevention.
NFR4.7: Encryption (TLS 1.2+ transit, AES-256 rest).
NFR5.1: WCAG 2.1 AA Compliance.
NFR5.2: Legacy Device Support (Android 8.0+ / Chrome 80+).
NFR6: Operations - Portainer for management, GitHub Actions for CI/CD.
NFR8.1: Race Condition Defense (Database-Level Unique Constraints).
NFR8.2: Atomic Transactions.
NFR8.3: Immutable Audit Logs (Append-Only).
NFR8.4: Anti-XSS (Strict CSP).
NFR6.2: Verifiable in local/staging environment.

### Additional Requirements

**Architecture:**
- **Starter Template:** Custom Manual Initialization (Monorepo structure: `apps/web`, `apps/api`, `packages/*`).
- **Infrastructure:** Single self-hosted Linux VPS (Hetzner CX43), Docker Compose orchestration.
- **Database Architecture:** Single PostgreSQL database (`app_db`) with native form schemas stored as JSONB.
- **Authentication:** Hybrid strategy (JWT + Redis blacklist).
- **Native Form System:** Form definitions stored as JSONB in PostgreSQL; skip logic engine; IndexedDB offline sync; one-question-per-screen renderer.
- **Marketplace Search:** PostgreSQL Full-Text Search (tsvector) with Read-Only Replica.
- **Fraud Engine:** Rule-based with pluggable heuristics, running on `app_db` ingested records.
- **Media Handling:** Live Selfie (Dual-purpose: Identity + ID Card) using `face-api.js` (client) and `sharp`/`Rekognition` (server).
- **Networking:** NGINX reverse proxy as single entry point.
- **Analytics:** Self-hosted Plausible or Umami (privacy-respecting).
- **Tech Stack:** Node.js 20 LTS, PostgreSQL 15, Redis 7, React 18.3, Vite, Tailwind v4, shadcn/ui, BullMQ.

**UX Design:**
- **PWA Strategy:** Mobile-first, "Add to Home Screen", Service Worker caching for 7-day offline capability.
- **Visual System:** Tailwind v4 + shadcn/ui, Oyo State Red theme (#9C1E23), Inter + Poppins typography.
- **Micro-interactions:** Submission success animations, circular progress rings, skeleton screens.
- **Specific Flows:**
    - **Enumerator:** "Resume Draft" prominent button, Sync status indicators (Green/Amber/Red).
    - **Supervisor:** Bulk fraud verification UI.
    - **Data Entry:** Keyboard-only navigation (Tab/Enter), auto-focus, sub-60s target.
    - **Marketplace:** 3-route structure, Search filters.
- **Offline UX:** Persistent storage warnings, Emergency "Upload Now" button.
- **Accessibility:** WCAG 2.1 AA compliance (contrast, touch targets >44px).

**Homepage & Schema:**
- **Routes:** `/`, `/about`, `/register`, `/marketplace`, `/insights`, `/support`, `/login`, `/dashboard/*`.
- **Questionnaire:** 6 Sections (Intro, Identity, Labor, Household, Skills, Marketplace), Skip logic, NIN validation.

### FR Coverage Map

FR1 (Consent): Epic 3, Epic 7
FR2 (2-Stage Consent): Epic 3, Epic 7
FR3 (Homepage/Auth): Epic 1, **Epic 1.5** (Public Website), **Epic 2.5** (Role Dashboards)
FR4 (Public Survey): Epic 3
FR5 (Public NIN): Epic 1
FR6 (Staff Provisioning): Epic 1, **Epic 2.5** (Staff Management UI)
FR7 (Staff Login): Epic 1, **Epic 2.5** (Dashboard Access)
FR8 (Enumerator Progress): Epic 3 (integrated with dashboard), **Epic 2.5** (Dashboard Shell)
FR9 (Offline PWA): Epic 3
FR10 (Pause/Resume): Epic 3
FR11 (In-App Messaging): Epic 4
FR12 (Supervisor Dashboard): Epic 4, **Epic 2.5** (Dashboard Shell)
FR13 (Fraud Signal Engine): Epic 4 (Oversight/Action)
FR14 (Form Management): Epic 2 (Native Forms), **Epic 2.5** (Form Builder UI Integration)
FR15 (Back-Office Dashboards): Epic 5, **Epic 2.5** (Dashboard Shells)
FR16 (Audit Trails): Epic 6
FR17 (Marketplace Search): Epic 7
FR18 (Enriched Contact Access): Epic 7
FR19 (Contact View Logging): Epic 7
FR20 (Data Entry Interface): Epic 3, **Epic 2.5** (Keyboard Dashboard Shell)
FR21 (Global NIN Uniqueness): Epic 1 (Registration), Epic 3 (Submission)
FR22 (Survey Analytics): Epic 8
FR23 (Public Labour Market Insights): Epic 8

### NFR Coverage (Epic 1.5)

NFR5.1 (WCAG 2.1 AA): Epic 1.5 (Design System, Color Contrast)
NFR5.2 (Legacy Device Support): Epic 1.5 (Mobile-responsive layouts)

## Epic List

### Epic 1: Foundation, Secure Access & Staff Onboarding
**Goal:** Establish the core infrastructure, secure authentication, and allow the state to provision and onboard its workforce with verified identities (NIN, Live Selfie).
**User Outcome:** Admins can bulk-provision staff; Staff can securely log in, complete profiles, and verify their legitimacy via ID cards.
**FRs covered:** FR3, FR5, FR6, FR7, FR21

### Epic 1.5: Public Website Foundation (Phase 1 Static)
**Goal:** Implement the public-facing website infrastructure and static pages, establishing the visual identity, layout architecture (ADR-016), and design system before proceeding to backend-heavy epics.
**User Outcome:** Public visitors see a professional, complete website explaining OSLSR; Client can demonstrate progress to stakeholders; Visual patterns established for all future development.
**FRs covered:** FR3 (Homepage), NFR5.1 (WCAG 2.1 AA), NFR5.2 (Legacy Device Support)
**Dependencies:** Epic 1 (Foundation) complete
**Source Documents:** `docs/public-website-ia.md`, `_bmad-output/planning-artifacts/ux-design-specification.md`, Architecture ADR-016

### Epic 2: Questionnaire Management & Native Form System
**Goal:** Enable the management of digital survey forms via a native form definition system with skip logic, validation, and a visual Form Builder UI.
**User Outcome:** Admins can create, edit, and publish questionnaires via the Form Builder; the system stores form schemas natively and is ready to render forms for data collection.
**FRs covered:** FR14

### Epic 2.5: Role-Based Dashboards & Feature Integration
**Goal:** Scaffold role-specific dashboard shells for all 7 system roles, wire up existing backend capabilities from Epic 1 and Epic 2, establish RBAC route protection, and create testable UI surfaces before proceeding to Epic 3.
**User Outcome:** Every user role has a functional post-login experience that demonstrates implemented capabilities; developers can test features end-to-end; stakeholders can see progress demos; route guards prevent unauthorized cross-role access.
**FRs covered:** FR3 (Dashboard Access), FR6 (Staff Management UI), FR7 (Staff Login), FR8 (Enumerator Dashboard), FR12 (Supervisor Dashboard), FR14 (Form Builder UI), FR15 (Back-Office Dashboards), FR20 (Data Entry Interface)
**Dependencies:** Epic 1 (Foundation), Epic 1.5 (Public Website), Epic 2 (Native Form System) - Complete
**Source Documents:** `ux-design-specification.md`, `ux-design-directions.html`, Architecture ADR-016
**Security:** Strict route isolation - each role can ONLY access their own dashboard routes

### Epic 3: Mobile Data Collection & Ingestion Pipeline
**Goal:** Provide field enumerators and the public with a robust, offline-capable tool for data submission, and establish the real-time ingestion of that data.
**User Outcome:** Enumerators can collect data offline; public users can self-register and submit surveys; data flows instantly into the Custom App for processing.
**FRs covered:** FR1, FR2, FR4, FR9, FR10, FR20, FR21 (validation)

### Epic 4: Supervisor Oversight & Field Management
**Goal:** Empower local managers with the tools to monitor their teams, communicate in real-time, and manage data quality via fraud alerts.
**User Outcome:** Supervisors can track team progress, message enumerators, and handle fraud flags without blocking field work.
**FRs covered:** FR11, FR12, FR13

### Epic 5: Back-Office Audit & Policy Reporting
**Goal:** Provide high-level stakeholders and state auditors with the tools to verify registry integrity and extract policy-driving insights.
**User Outcome:** Assessors can audit the verification queue; Government officials can view state-wide trends, browse all respondent data, and export PII-rich reports for planning.
**FRs covered:** FR15
**Stories:** 5.1 (Policy Dashboard), 5.2 (Assessor Audit Queue), 5.3 (Individual Record PII View), 5.4 (PII-Rich Exports), 5.5 (Respondent Data Registry Table), 5.6a (Supervisor Team Productivity Table & API Foundation), 5.6b (Super Admin Staff Productivity Table)

### Epic 6: System Integrity, Accountability & Remuneration
**Goal:** Ensure the absolute trustworthiness of the registry through immutable audit trails, system health monitoring, and transparent staff payment management.
**User Outcome:** The system remains healthy and tamper-proof; staff are fairly remunerated with a clear dispute resolution process.
**FRs covered:** FR16

### Epic 7: Public Skills Marketplace & Search Security
**Goal:** Create a secure, privacy-compliant bridge between skilled workers and potential employers through an anonymous registry.
**User Outcome:** The public can find verified local talent; workers can opt-in to opportunities; the state protects worker PII via authenticated contact reveal.
**FRs covered:** FR1, FR2, FR17, FR18, FR19

### Epic 8: Survey Analytics & Public Insights
**Goal:** Transform raw survey data into actionable statistical insights across all system roles, and publish anonymized labour market intelligence on the public website.
**User Outcome:** Super Admins see system-wide analytics; Supervisors and Enumerators track field performance; Assessors monitor verification quality; Government Officials access policy-driving statistics; the public sees transparent labour market trends.
**FRs covered:** FR22, FR23
**Dependencies:** Epic 3 (Submissions pipeline), Epic 4 (Supervisor/Enumerator hierarchy), Epic 5 (Back-Office dashboards), Epic 7 (Marketplace profiles)
**Source Documents:** `docs/survey-analytics-spec.md`

### Epic 9: Platform Polish, Profile, Domain Migration, Security Hardening, Field-Survey UX Readiness & Admin Audit Visibility
**Goal:** _(Refreshed 2026-04-25 per SCP-2026-04-22)_ Platform polish + domain migration + security hardening + field-survey UX readiness + admin audit visibility prior to Transfer.
**User Outcome:** Production VPS hardened against the 2026-04-20 SSH brute-force vector; field survey can launch on a 5-step wizard with deferred-NIN path; super-admin can investigate any audit event including partner-API consumer activity; Transfer-readiness baseline established.
**FRs covered:** FR21 (scoped), FR26, FR27, FR28, NFR9
**Dependencies:** Story 11-1 schema (HARD prerequisite for Story 9-12); Epic 6 audit infrastructure (foundation for Story 9-11)
**Status:** In-progress — 9-1/9-3/9-5/9-6/9-7 done; 9-8 in-progress; 9-2/9-4 deferred (domain-gated); 9-9 in-progress (2 subtasks done, 8 remaining); 9-10/9-11/9-12 backlog

### Epic 10: API Governance & Third-Party Data Sharing _(Added 2026-04-25 per SCP-2026-04-22)_
**Goal:** Establish an authenticated, scoped, rate-limited, audit-logged partner-API substrate so that third-party MDA consumers can access the registry under formal agreement without compromising NDPA compliance or operator visibility.
**User Outcome:** Ministry can onboard ITF-SUPA, NBS, NIMC, and future MDA partners onto a government-grade data-sharing platform with per-consumer rate limits, LGA scoping, IP allowlist, time-bounded scope grants, and full audit traceability.
**FRs covered:** FR24, NFR10
**Dependencies:** Story 9-11 (audit viewer — HARD prerequisite for PII scope release); Architecture ADR-019; Story 10-5 DSA template (legal precondition for `submissions:read_pii` scope)
**Source Documents:** `docs/epic-10-1-consumer-auth-design.md`, Architecture Decisions 2.4 / 2.8 / 3.4 / 5.4 + ADR-019, UX Journey 7
**Field-Survey Relationship:** Post-field — does NOT block field-survey start. Story 10-5 drafted is the only Epic 10 item adjacent to FRC.

### Epic 11: Multi-Source Registry & Secondary Data Ingestion _(Added 2026-04-25 per SCP-2026-04-22)_
**Goal:** Enable ingestion of secondary data sources (ITF-SUPA Oyo public artisan list, future MDA exports) into the canonical respondent registry with source-labelled provenance, batch-level lawful-basis documentation, and a 14-day rollback window — without creating a parallel registry.
**User Outcome:** OSLSR becomes the single source of truth for skilled-worker registration in Oyo State, regardless of origin (field, public, clerk, secondary import). Source provenance is honestly surfaced via `SourceBadge` so consumers never confuse low-trust imports for field-verified records.
**FRs covered:** FR21 (scoped), FR25
**Dependencies:** Story 9-12 depends on Story 11-1 (status enum) — Epic 9 critical path runs through Epic 11's foundation story
**Source Documents:** `_bmad-output/implementation-artifacts/11-1-multi-source-registry-schema-foundation.md` (working draft), Architecture Decision 1.5 + ADR-018, UX Journey 5
**Field-Survey Relationship:** Story 11-1 is on the Field Readiness Certificate (FRC §5.3.1 item 2). Stories 11-2/11-3/11-4 are post-field.

---

## Field Readiness Certificate (FRC)

_Per SCP-2026-04-22 §5.3.1, the field survey commences only after **all six items** below are verified true. The Certificate is the single-page artefact attached as an appendix to Baseline Report v2 and retained at `_bmad-output/baseline-report/field-readiness-certificate.md`._

_**Revised 2026-04-27** per cost-aware roadmap session with Awwal: item #5 (alerting tier with push channel) demoted to Ministry hand-off recommendation; backup AES-256 client-side encryption (9-9 AC#5) promoted to FRC. Reasoning captured in `docs/post-handover-security-recommendations.md` and PM session notes._

| # | Item | Story | Status |
|---|---|---|---|
| 1 | Tailscale live + SSH public-port closed | 9-9 (Tailscale subtask) | ✅ Done 2026-04-23 |
| 2 | Story 11-1 schema + Akintola-risk composite indexes (AC#11) merged | 11-1 | ⏳ Backlog |
| 3 | Story 9-12 Public Wizard + Pending-NIN + NinHelpHint + Magic-Link Email live | 9-12 | ⏳ Backlog |
| 4 | `prep-input-sanitisation-layer` merged | prep task | ⏳ Backlog |
| 5 | Backup AES-256 client-side encryption + restore drill executed (9-9 AC#5) **[REVISED 2026-04-27]** | 9-9 (subtask 5) | ⏳ Backlog (Wave 1) |
| 6 | Operations Manual enumerator-section (D4 subset) drafted and printed | Iris / Gabe | ⏳ Backlog |

**Tier B items** (Stories 9-10, 9-11, DPIA filing, OS patching, super-admin TOTP MFA Story 9-13) can ship during the first weeks of field operation without blocking start. Note: Story 9-13 is Tier B per FRC but is slotted in Wave 0 because it's zero-cost and small (~1-2 days) — recommended to land before field rather than during.

**Demoted from FRC to Ministry hand-off recommendation 2026-04-27:**
- **Push-channel alerting tier (SMS/WhatsApp/paged)** — original FRC #5. Rejected on cost grounds (~₦500-2K/mo Twilio). Email + solo-operator attentiveness deemed field-survivable. Captured as recommendation in `docs/post-handover-security-recommendations.md` for Ministry/State ICT consideration post-handover. Builder (Awwal) operates in email-attentive mode during Operate phase; SMS/paged tier becomes valuable when operator-pool grows beyond one person.

**Epic 10 (API Governance) and Epic 11 Stories 11-2/11-3/11-4** can ship post-field.

---

## Epic 1: Foundation, Secure Access & Staff Onboarding

**Epic Goal:** Establish the core infrastructure, secure authentication, and allow the state to provision and onboard its workforce with verified identities (NIN, Live Selfie).

### Story 1.1: Project Initialization & CI/CD Pipeline

As a Developer,
I want to set up the project's foundational structure, build pipeline, and core services,
So that we have a stable and automated environment for development, testing, and deployment.

**Acceptance Criteria:**

**Given** a clean repository
**When** I initialize the monorepo with `apps/web` (React/Vite) and `apps/api` (Node/Express)
**Then** the project should build successfully locally using pnpm workspaces
**And** GitHub Actions should deploy a health-check endpoint to the Hetzner VPS via Docker Compose
**And** the `.env.example` should contain placeholders for all required environment variables.

### Story 1.2: Database Schema & Access Control (RBAC)

As a Super Admin,
I want to define specific roles with clear permission boundaries,
So that each user only accesses features and data relevant to their responsibilities.

**Acceptance Criteria:**

**Given** the Drizzle ORM setup
**When** I define the schema for Users, Roles, and LGA assignments using UUIDv7 primary keys
**Then** the system should enforce RBAC for Field Staff (LGA-restricted) and Back-Office (State-wide)
**And** a user with the 'Enumerator' role should be forbidden from accessing the 'Verification Queue'
**And** all critical uniqueness checks (NIN, Email) must rely on Database-Level Unique Constraints.

### Story 1.3: Staff Provisioning & Bulk Import

As a Super Admin,
I want to provision new staff via manual creation or bulk CSV import,
So that I can onboard the workforce efficiently.

**Acceptance Criteria:**

**Given** a staff CSV file with Name, Email, Phone, Role, and LGA_ID
**When** I upload the file to the Bulk Import interface
**Then** the system should validate the format and queue individual invitation emails
**And** each created user must be hard-locked to their assigned LGA
**And** the import should support 500+ users without timeout.

### Story 1.4: Staff Activation & Profile Completion

As a Staff Member,
I want to complete my profile after accepting an invitation,
So that my identity is verified and my payroll details are captured.

**Acceptance Criteria:**

**Given** a valid invitation link
**When** I set my password and provide NIN, Age, Home Address, Bank Details, and Next of Kin
**Then** my NIN must be validated using the Verhoeff checksum algorithm
**And** my profile should be locked for editing once marked as "Verified" by an Admin.

### Story 1.5: Live Selfie Capture & Verification

As a Staff Member,
I want to capture a live selfie during profile completion,
So that my identity is visually verified and my ID card has a recent portrait.

**Acceptance Criteria:**

**Given** a device with a camera
**When** I use the Live Selfie interface (face-api.js) to capture my photo
**Then** the system should perform client-side and server-side liveness detection
**And** the photo must be auto-cropped by the server (sharp) for ID card specifications
**And** any attempt to upload a static photo file must be rejected.

### Story 1.6: ID Card Generation & Public Verification

As a Staff Member,
I want to download a printable ID card with a verification QR code,
So that I can prove my legitimacy to respondents in the field.

**Acceptance Criteria:**

**Given** a verified staff profile with a selfie
**When** I click "Download ID Card"
**Then** the system should generate a PDF with my photo, role, and a unique QR code
**And** scanning the QR code should lead to a public `/verify-staff/:id` page showing my active status.

### Story 1.7: Secure Login & Session Management

As a User,
I want to securely log in and maintain an active session,
So that I can access my designated features safely.

**Acceptance Criteria:**

**Given** registered credentials
**When** I log in to the Custom App
**Then** the system should issue a 15-minute JWT and a 7-day refresh token
**And** rate limiting must block IPs after 5 failed login attempts in 15 minutes
**And** logging out must add the token JTI to the Redis blacklist.

### Story 1.8: Public User Self-Registration

As a Public User,
I want to register on the public website using my NIN and email,
So that I can access the system and submit my own survey data.

**Acceptance Criteria:**

**Given** the public registration page
**When** I provide my NIN, Email, and Password
**Then** the system should validate the NIN using the Verhoeff checksum algorithm
**And** enforce global NIN uniqueness via database constraints
**And** send a hybrid verification email containing BOTH a magic link AND a 6-digit OTP code
**And** rate limit registration attempts to 5 per 15 minutes per IP.

### Story 1.9: Global UI Patterns

As a Developer,
I want standardized UI patterns implemented across the application,
So that users have a consistent and polished experience.

**Acceptance Criteria:**

**Given** the design system requirements
**When** I implement loading states, error handling, and mutations
**Then** all data-loading states must use Skeleton screens (not spinners)
**And** all critical components must be wrapped in Error Boundaries with graceful fallback UI
**And** all mutations must use the `useOptimisticMutation` hook with automatic toast notifications
**And** toast notifications must follow the timing configuration (success: 3s, error: 5s, warning/info: 4s).

### Story 1.10: Test Infrastructure & Dashboard

As a Developer,
I want a visual test dashboard and comprehensive test infrastructure,
So that I can monitor test health and catch regressions early.

**Acceptance Criteria:**

**Given** the monorepo test setup
**When** I run `pnpm test:dashboard --open`
**Then** I should see a visual dashboard showing test results grouped by stage and package
**And** GitHub Actions CI must run all tests and fail on any test failure
**And** test results must be uploaded as artifacts for debugging.

---

## Epic 1.5: Public Website Foundation (Phase 1 Static)

**Epic Goal:** Implement the public-facing website infrastructure and static pages defined in `docs/public-website-ia.md`, establishing the visual identity, layout architecture (ADR-016), and design system specified in the UX Design Specification. This provides visible progress to stakeholders before proceeding to backend-heavy Epic 2.

**Dependencies:**
- Epic 1 (Foundation) - Complete
- `docs/public-website-ia.md` - Content ready
- `_bmad-output/planning-artifacts/ux-design-specification.md` - Design system ready

**Out of Scope (Phase 2 - API-dependent):**
- Marketplace search/results (requires Epic 7)
- Insights Dashboard with live data
- Skills Map visualization
- Live metrics on homepage

### Story 1.5.1: Design System Foundation & Layout Architecture

As a Developer,
I want to implement the core design system tokens and layout components per ADR-016,
So that all subsequent pages share consistent styling and navigation patterns.

**Acceptance Criteria:**

**Given** the UX Design Specification "Design System Foundation" section
**When** I implement the design tokens and layout components
**Then** CSS variables must be defined for:
  - Oyo State color palette (Primary-50 through Primary-900, #9C1E23 as Primary-600)
  - Semantic colors: Success-600 (#15803D), Warning-600 (#D97706), Error-600 (#DC2626), Info-600 (#0284C7), Neutrals
  - Typography scale: Poppins (brand/headings), Inter (UI), JetBrains Mono (monospace)
  - Spacing scale following 4px baseline grid
**And** `PublicLayout` component must include:
  - Global header with Oyo State logo (40px height, links to `/`)
  - Primary navigation: About, Participate, Support, Marketplace
  - Mobile hamburger menu with slide-in drawer (per `public-website-ia.md` Section 2)
  - Footer with 3-column layout (Quick Links, About, Contact)
  - Renders `<Outlet />` for page content
**And** `AuthLayout` component must include (per ADR-016):
  - Minimal chrome: "← Back to Homepage" link only
  - Centered content card with Oyo State logo (60px height)
  - No header/footer (focused auth experience)
**And** Skeleton screen components must be created:
  - `PageSkeleton` - Full page shimmer with Oyo State brand colors
  - `CardSkeleton` - Dashboard card placeholder
  - `TextSkeleton` - Line-by-line text loading

**References:**
- UX Spec: "Design System Foundation" section (Typography, Color System, Brand Assets)
- Architecture: ADR-016 "Layout Architecture"
- public-website-ia.md: Navigation wireframes (Section 2)

---

### Story 1.5.2: Homepage Implementation

As a Public Visitor,
I want to see a professional homepage that clearly explains OSLSR and provides paths to registration,
So that I understand the initiative's purpose and can take action.

**Acceptance Criteria:**

**Given** the homepage wireframe in `public-website-ia.md` Section 3.1
**When** I visit the homepage (`/`)
**Then** the Hero Section must display:
  - Oyo State Government logo centered (80px height)
  - H1: "Oyo State Labour & Skills Registry" (Poppins SemiBold)
  - Tagline: "Mapping the Workforce, Empowering the Economy"
  - Primary CTA: "Register Now" → `/auth/register` (Oyo State Red button)
  - Secondary CTA: "Explore Skills Marketplace" → `/marketplace` (Ghost button)
**And** the Statistics Section must display 4 metric cards:
  - "Registered Workers", "Skills Categories", "LGAs Covered" (33), "Verified Profiles"
  - Phase 1: Display "Coming Soon" or static values; design supports future API integration
**And** the "How It Works" Section must display 4-step visual:
  - Create Account → Verify Email → Complete Survey → Get Verified
  - Icon + title + description for each step (per wireframe)
**And** the "For Workers / For Employers" Section must display:
  - Two-column layout with benefits for each audience
  - CTAs linking to `/participate/workers` and `/participate/employers`
**And** the Trust Section must display:
  - "Government Verified" badge explanation
  - Partner logos placeholder grid
**And** the Final CTA must display:
  - "Ready to contribute to Oyo State's future?" + Register button

**References:**
- PRD FR3: "Public-facing Homepage with Staff Login and Public Register"
- public-website-ia.md: Section 3.1 Homepage wireframe with exact copy
- UX Spec: Logo placements (80px hero), typography scale

---

### Story 1.5.3: About Section (5 Pages)

As a Public Visitor,
I want to learn about the OSLSR initiative, leadership, and data practices,
So that I trust the platform before registering.

**Acceptance Criteria:**

**Given** the About section wireframes in `public-website-ia.md` Sections 3.1-3.6
**When** I navigate to the About section
**Then** the following pages must be implemented with exact copy from wireframes:

1. **/about** - Landing page:
   - Section overview cards linking to sub-pages
   - Brief introduction to OSLSR

2. **/about/initiative** - The Initiative:
   - Full explanation of OSLSR purpose
   - "What is OSLSR?", "Why It Matters", "Who It Serves" sections
   - "Living Registry" concept explanation
   - "Ready to Contribute?" CTA

3. **/about/how-it-works** - How It Works:
   - 4-step visual registration walkthrough (icons + descriptions)
   - Step 1: Create Account, Step 2: Verify Email, Step 3: Complete Survey, Step 4: Get Verified
   - "What You'll Need" section (NIN, Phone, Email, 10 minutes)
   - NIN info callout with link to NIMC

4. **/about/leadership** - Leadership:
   - Commissioner profile card (photo placeholder, quote)
   - Project Director profile card
   - Oversight section with government seals
   - Contact information

5. **/about/partners** - Partners:
   - "Government Agencies" logo grid (Ministry, Bureau of Statistics, NBS)
   - "Industry Associations" logo grid
   - "Become a Partner" CTA with email

6. **/about/privacy** - Privacy & Data Protection:
   - TL;DR summary box (plain language)
   - "What Data We Collect" section (Personal, Work/Skills, Optional Marketplace)
   - "How We Use Your Data" section
   - "What We Don't Do" box (Never sell, Never share unauthorized, etc.)
   - "Data Protection Measures" (Encryption, Access Control, Audit Logging)
   - "Your Rights Under NDPA" section
   - "Data Retention" policy
   - Data Protection Officer contact

**References:**
- public-website-ia.md: Sections 3.1-3.6 with complete wireframes and copy
- PRD NFR4: NDPA compliance requirements
- UX Spec: Trust signals, transparency principles

---

### Story 1.5.4: Participate Section (3 Pages)

As a Public Visitor (worker or employer),
I want to understand how the registry benefits me specifically,
So that I'm motivated to register or engage.

**Acceptance Criteria:**

**Given** the Participate section wireframes in `public-website-ia.md` Section 4
**When** I navigate to the Participate section
**Then** the following pages must be implemented:

1. **/participate** - Landing page:
   - Hero: "Be Part of Oyo State's Workforce Revolution"
   - Two pathway cards: "I'm a Worker" and "I'm an Employer"
   - Brief description of benefits for each

2. **/participate/workers** - For Workers:
   - Hero: "Your Skills Deserve Recognition"
   - Benefits grid:
     - "Get Visible" - Appear in Skills Marketplace
     - "Get Verified" - Government Verified badge
     - "Get Opportunities" - Connect with employers
     - "Get Trained" - Priority access to skills programs
   - "How to Join" section with registration CTA
   - FAQ accordion specific to workers

3. **/participate/employers** - For Employers:
   - Hero: "Find Verified Local Talent"
   - Benefits grid:
     - "Verified Profiles" - Government-vetted workers
     - "Search by Skill" - Filter by trade, LGA, experience
     - "Direct Contact" - Reveal contact with consent
     - "Support Local" - Hire Oyo State residents
   - "How It Works" section
   - "Start Searching" CTA to marketplace

**References:**
- public-website-ia.md: Section 4 Participate wireframes
- PRD FR17-FR19: Marketplace search and contact reveal requirements

---

### Story 1.5.5: Support Section (5 Pages)

As a Public Visitor or Registered User,
I want to find answers to common questions and contact support,
So that I can resolve issues without confusion.

**Acceptance Criteria:**

**Given** the Support section wireframes in `public-website-ia.md` Section 5
**When** I navigate to the Support section
**Then** the following pages must be implemented:

1. **/support** - Landing page:
   - Support cards linking to: FAQ, Guides, Contact, Verify Worker
   - Search box (Phase 1: UI only, full search in Phase 2)

2. **/support/faq** - Frequently Asked Questions:
   - Accordion FAQ grouped by category:
     - Registration (5-7 questions)
     - Marketplace (5-7 questions)
     - Privacy & Data (5-7 questions)
     - Technical Issues (5-7 questions)
   - "Still have questions?" CTA to contact page

3. **/support/guides** - How-To Guides:
   - Guide cards for:
     - "How to Register" - Step-by-step with screenshots
     - "How to Update Your Profile" - Edit token process
     - "How to Search the Marketplace" - Filters and contact reveal
   - Each guide expandable with numbered steps

4. **/support/contact** - Contact Us:
   - Contact form with fields:
     - Category dropdown (General, Technical, Privacy, Partnership)
     - Email (required)
     - Subject
     - Message
   - Ministry contact details sidebar (address, email, phone)
   - Response time expectation ("We respond within 2-3 business days")

5. **/support/verify-worker** - Verify a Worker:
   - Explanation of ID card verification process
   - QR code scanner (Phase 1: instructions only, links to `/verify-staff/:id`)
   - Manual ID lookup field
   - "What You'll See" section explaining verification result

**References:**
- public-website-ia.md: Section 5 Support wireframes
- PRD UI Design Goals: "Reduce anxiety and build confidence"
- Epic 1 Story 1.6: ID Card Generation & Public Verification

---

### Story 1.5.6: Legal Pages & Navigation Cleanup

As a Public Visitor,
I want to review terms of service and easily navigate to support resources,
So that I understand my rights and can quickly find help when needed.

**Acceptance Criteria:**

**AC1: Terms of Service Page**
**Given** the Legal section wireframes in `public-website-ia.md` Section 6
**When** I navigate to `/terms`
**Then** Terms of Service page must include:
  - Last updated date
  - Sections:
    - Acceptance of Terms
    - Eligibility
    - User Responsibilities
    - Marketplace Rules (for workers and employers)
    - Prohibited Activities
    - Limitation of Liability
    - Disclaimer of Warranties
    - Governing Law (Nigerian jurisdiction, Oyo State courts)
    - Changes to Terms
    - Contact Information

**AC2: Navigation - Support Dropdown**
**Given** the current navigation structure
**When** I view the desktop navigation
**Then** Support must be a dropdown menu (like About and Participate) containing:
  - Support Center → `/support`
  - FAQ → `/support/faq`
  - Guides → `/support/guides`
  - Verify Worker → `/support/verify-worker`
**And** the dropdown must follow the same pattern as `aboutItems` and `participateItems`

**AC3: Navigation - Contact Link**
**Given** the user need for quick contact access
**When** I view the desktop navigation
**Then** "Contact" must appear as a top-level navigation item
**And** it must link to `/support/contact`
**And** it must replace the current Staff Login button position

**AC4: Navigation - Staff Login Relocation**
**Given** staff login is an internal feature
**When** I view the desktop navigation
**Then** Staff Login button must NOT appear in the main navigation
**And** Staff Login link must be added to the Footer (less prominent for security)

**AC5: Footer Updates**
**Given** the footer link structure
**When** I view the footer
**Then** Footer must include:
  - Privacy link → `/about/privacy`
  - Terms link → `/terms`
  - Contact Us link → `/support/contact` (not `/support`)
  - Staff Login link → `/staff/login` (new addition)
  - All support links functional
  - Ministry contact information
  - Copyright notice with current year

**AC6: Mobile Navigation Sync**
**Given** mobile navigation must match desktop
**When** I view the mobile navigation
**Then** Support must expand to show subpages
**And** Contact must appear as a navigation item
**And** Staff Login must NOT appear in mobile navigation

**References:**
- public-website-ia.md: Section 6 Legal pages
- PRD NFR4: Security & Compliance requirements
- UX Decision: Staff Login moved to footer to reduce visibility to bad actors

---

### Story 1.5.7: Guide Detail Pages

As a Worker or Employer,
I want to read detailed step-by-step guides for each registration task,
So that I can complete the process confidently and correctly.

**Acceptance Criteria:**

**AC1: Worker Guide Pages (4 pages)**
**Given** the GuidesPage worker section
**When** I click "Read Guide" on any worker guide card
**Then** I must be navigated to a dedicated guide page:
  - `/support/guides/register` - How to Register
  - `/support/guides/survey` - How to Complete the Survey
  - `/support/guides/marketplace-opt-in` - How to Opt Into the Marketplace
  - `/support/guides/get-nin` - How to Get a NIN
**And** each page must include:
  - Clear step-by-step instructions with numbered steps
  - Visual aids or icons for each major step
  - Estimated time to complete
  - Prerequisites or requirements
  - Common troubleshooting tips
  - "Back to Guides" navigation link
  - Related guides section

**AC2: Employer Guide Pages (3 pages)**
**Given** the GuidesPage employer section
**When** I click "Read Guide" on any employer guide card
**Then** I must be navigated to a dedicated guide page:
  - `/support/guides/search-marketplace` - How to Search the Marketplace
  - `/support/guides/employer-account` - Setting Up an Employer Account
  - `/support/guides/verify-worker` - How to Verify a Worker
**And** each page must include:
  - Clear step-by-step instructions with numbered steps
  - Visual aids or icons for each major step
  - Estimated time to complete
  - Prerequisites or requirements
  - Common troubleshooting tips
  - "Back to Guides" navigation link
  - Related guides section

**AC3: GuidesPage Link Updates**
**Given** the current GuidesPage implementation
**When** Guide cards are rendered
**Then** Each "Read Guide" link must point to the corresponding guide detail page
**And** Links must NOT use anchor navigation (e.g., `/participate/workers#survey`)

**AC4: Routing Integration**
**Given** the App.tsx routing structure
**When** guide routes are added
**Then** Routes must be nested under `/support/guides/*`
**And** All guide pages must lazy load for code splitting
**And** Pages must use PublicLayout

**References:**
- public-website-ia.md: Section 5.3 Guides wireframe
- Story 1.5.5: Support Section (GuidesPage implementation)
- PRD FR1.2: Worker digital registration journey

---

## Epic 2: Questionnaire Management & Native Form System

**Epic Goal:** Enable the management of digital survey forms via a native form definition system with skip logic, validation, and a visual Form Builder UI.

### Story 2.1: XLSForm Upload & Validation

As a Super Admin,
I want to upload an XLSForm definition file directly to the Custom App,
So that I can update the survey structure without using the ODK Central UI.

**Acceptance Criteria:**

**Given** a completed XLSForm (`.xlsx` or `.xml`)
**When** I upload it via the Custom App dashboard
**Then** the system should validate the file format and questionnaire schema
**And** successfully validated forms should be stored and versioned in the `app_db`.

> **Note (SCP-2026-02-05-001):** This story is COMPLETE. The XlsformParserService is retained solely for the one-time migration of oslsr_master_v3.xlsx to the native form schema (see Story 2.9). No ongoing XLSForm parsing is required.

### ~~Story 2.2: ODK Central Form Publishing~~ — SUPERSEDED

> **SUPERSEDED by Sprint Change Proposal SCP-2026-02-05-001**
> Reason: ODK Central removed. Native form system replaces all ODK integration.
> Replaced by: Stories 2.7-2.10 (Native Form System)

~~As a Super Admin,
I want to publish validated questionnaires to ODK Central via a manual action,
So that they are available for field collection.~~

### ~~Story 2.3: Automated ODK App User Provisioning~~ — SUPERSEDED

> **SUPERSEDED by Sprint Change Proposal SCP-2026-02-05-001**
> Reason: ODK Central removed. No ODK App Users needed with native forms.
> Replaced by: Stories 2.7-2.10 (Native Form System)

~~As a System,
I want to automatically create ODK App Users for every provisioned staff member,
So that they can collect data immediately.~~

### ~~Story 2.4: Encrypted ODK Token Management~~ — SUPERSEDED

> **SUPERSEDED by Sprint Change Proposal SCP-2026-02-05-001**
> Reason: ODK Central removed. No ODK tokens needed with native forms.
> Replaced by: Stories 2.7-2.10 (Native Form System)

~~As a System,
I want to securely store ODK App User tokens,
So that I can launch seamless Enketo forms without exposing credentials.~~

### ~~Story 2.5: ODK Sync Health Monitoring~~ — SUPERSEDED

> **SUPERSEDED by Sprint Change Proposal SCP-2026-02-05-001**
> Reason: ODK Central removed. No ODK sync monitoring needed.
> Replaced by: Stories 2.7-2.10 (Native Form System)

~~As a Super Admin,
I want to monitor the health of the ODK Central integration,
So that I can resolve synchronization issues promptly.~~

### ~~Story 2.6: ODK Mock Server for Integration Testing~~ — SUPERSEDED

> **SUPERSEDED by Sprint Change Proposal SCP-2026-02-05-001**
> Reason: ODK Central removed. No ODK mock server needed.
> Replaced by: Stories 2.7-2.10 (Native Form System)

~~As a Developer,
I want a mock ODK Central server that simulates the real ODK Central API,
So that integration tests for `@oslsr/odk-integration` can verify full HTTP request/response flows without requiring a live ODK Central instance.~~

---

### Story 2.7: Native Form Schema & Types

As a Developer,
I want the database schema and TypeScript types for native forms,
So that I can build the form builder and renderer with type safety.

**Dependencies:** Story 2.1 (XLSForm Parser — for migration only)

**Acceptance Criteria:**

**AC2.7.1:** **Given** the existing `questionnaire_forms` table, **when** I run the database migration, **then** it adds `form_schema` JSONB and `is_native` BOOLEAN columns with a GIN index for JSON queries.

**AC2.7.2:** **Given** the native form schema requirements, **when** I create types in `packages/types/src/native-form.ts`, **then** all form components (NativeFormSchema, Section, Question, Condition, ConditionGroup, Choice, ValidationRule) are fully typed.

**AC2.7.3:** **Given** the TypeScript interfaces, **when** I create Zod schemas in `packages/types/src/validation/native-form.ts`, **then** I can validate form schemas at runtime with 10+ unit tests passing.

**Tasks/Subtasks:**
- Task 2.7.1: Create migration `apps/api/drizzle/0014_add_native_form_schema.sql`
- Task 2.7.2: Update `apps/api/src/db/schema/questionnaires.ts` with new columns
- Task 2.7.3: Create `packages/types/src/native-form.ts` with all interfaces
- Task 2.7.4: Create `packages/types/src/validation/native-form.ts` with Zod schemas and tests

### Story 2.8: Skip Logic & Form Services

As a Developer,
I want API services for skip logic evaluation and form CRUD,
So that the Form Builder can save and validate forms.

**Dependencies:** Story 2.7

**Acceptance Criteria:**

**AC2.8.1:** **Given** a form with conditions, **when** I evaluate skip logic using the SkipLogicService, **then** it correctly determines field visibility for all operator types (equals, not_equals, greater_than, etc.) and condition groups (AND/OR).

**AC2.8.2:** **Given** a form schema, **when** I call CRUD methods on the NativeFormService, **then** forms are created, updated, validated for publish, and flattened for rendering.

**AC2.8.3:** **Given** an authenticated Super Admin, **when** they call native form API endpoints (`POST /native`, `GET /:id/schema`, `PUT /:id/schema`, `GET /:id/preview`), **then** they can create and manage forms with proper validation.

**Tasks/Subtasks:**
- Task 2.8.1: Create `apps/api/src/services/skip-logic.service.ts` (evaluateCondition, evaluateConditionGroup, parseXlsformRelevance) with 15+ unit tests
- Task 2.8.2: Create `apps/api/src/services/native-form.service.ts` (createForm, updateFormSchema, validateForPublish, getFormSchema, flattenForRender) with 12+ unit tests
- Task 2.8.3: Update `apps/api/src/routes/questionnaire.routes.ts` with native form endpoints
- Task 2.8.4: Update `apps/api/src/controllers/questionnaire.controller.ts` with native form methods

### Story 2.9: XLSForm Migration Script

As a Super Admin,
I want the existing oslsr_master_v3 form migrated to native format,
So that I can use the native form system with existing questionnaire data.

**Dependencies:** Story 2.8

**Acceptance Criteria:**

**AC2.9.1:** **Given** the `oslsr_master_v3.xlsx` file, **when** I run the migration script, **then** it parses all worksheets (survey, choices, settings) correctly, maps XLSForm types to native types, and converts begin_group/end_group to sections.

**AC2.9.2:** **Given** the parsed XLSForm data, **when** the script converts relevance expressions, **then** it produces valid native form Condition objects that pass Zod validation.

**AC2.9.3:** **Given** the converted form, **when** the script completes, **then** the form is stored in the database with `is_native=true` and all 35 questions, 6 sections, and 12 choice lists are present.

**Tasks/Subtasks:**
- Task 2.9.1: Create `scripts/migrate-xlsform-to-native.ts` (parse, map types, convert groups, convert relevance, generate UUIDs)
- Task 2.9.2: Add validation and logging (validate against Zod schema, log migration summary)
- Task 2.9.3: Run migration and verify output

### Story 2.10: Native Form Builder UI

As a Super Admin,
I want a Form Builder UI to create and edit questionnaires,
So that I can manage forms without uploading XLSForm files.

**Dependencies:** Story 2.8

**Acceptance Criteria:**

**AC2.10.1:** **Given** Super Admin navigates to `/dashboard/super-admin/questionnaires/builder`, **when** the page loads, **then** they see a tabbed interface (Settings, Sections, Choices, Preview) for form editing with Save/Publish buttons.

**AC2.10.2:** **Given** the Settings tab, **when** Super Admin edits form title and version, **then** changes are persisted via the native form API.

**AC2.10.3:** **Given** the Sections tab, **when** Super Admin adds/edits/deletes sections and questions, **then** they can configure question types, required flags, and skip logic conditions via a visual ConditionBuilder.

**AC2.10.4:** **Given** the Choices tab, **when** Super Admin creates/edits choice lists, **then** the lists are available for `select_one` and `select_multiple` question types.

**AC2.10.5:** **Given** the Preview tab, **when** Super Admin opens it, **then** they see the JSON structure and a field summary of the form.

**Tasks/Subtasks:**
- Task 2.10.1: Create `FormBuilderPage.tsx` (tab state, form data state, Save/Publish)
- Task 2.10.2: Create form-builder components (FormBuilderTabs, FormSettingsTab, SectionsTab, SectionEditor, QuestionEditor, ConditionBuilder, ChoiceListsTab, ChoiceListEditor, PreviewTab)
- Task 2.10.3: Create React Query hooks (`useNativeForm.ts`, `native-form.api.ts`)
- Task 2.10.4: Update routes in `App.tsx` and `QuestionnaireManagementPage.tsx`

---

## Epic 2.5: Role-Based Dashboards & Feature Integration

**Epic Goal:** Scaffold role-specific dashboard shells for all 7 system roles, wire up existing backend capabilities from Epic 1 and Epic 2, establish RBAC route protection, and create testable UI surfaces before proceeding to Epic 3.

**Why This Epic Exists:**
- Backend features from Epic 1 and Epic 2 cannot be tested via frontend
- No way to verify RBAC is working without role-specific routes
- Stakeholders need to see progress per role, not just API responses
- Epic 3 requires dashboard foundations (Stories 3-1, 3-5, 3-6 depend on dashboard shells)
- Mirrors Epic 1.5 pattern: build → reflect → consolidate → advance

**Dependencies:** Epic 1 (Foundation), Epic 1.5 (Public Website), Epic 2 (Native Form System) - All Complete

**Security Model:** Strict route isolation - each role can ONLY access their own dashboard routes. Super Admin gets 360° visibility via aggregated widgets, not by visiting other role's routes.

**Route Structure:**
- `/dashboard/super-admin` - Super Admin
- `/dashboard/supervisor` - Supervisor
- `/dashboard/enumerator` - Enumerator
- `/dashboard/clerk` - Data Entry Clerk
- `/dashboard/assessor` - Verification Assessor
- `/dashboard/official` - Government Official
- `/dashboard/public` - Public User

### Story 2.5-1: Dashboard Layout Architecture & Role-Based Routing

As a System Architect,
I want the DashboardLayout component and role-based routing infrastructure,
So that each role lands on their appropriate dashboard with correct navigation and route protection.

**Acceptance Criteria:**

1. **Given** ADR-016 layout patterns, **when** a user navigates to `/dashboard/*`, **then** DashboardLayout renders with role-appropriate sidebar (Enumerator: 3-4 items, Super Admin: 12+ items).
2. **Given** a logged-in user with role X, **when** they access the root `/dashboard` route, **then** they are redirected to their role-specific home.
3. **Given** the existing `useAuth()` hook and RBAC middleware, **when** a user attempts to access another role's route, **then** they receive a 403 Forbidden response and are redirected to their own dashboard.
4. **Given** the sidebar navigation component, **when** a user clicks a nav item, **then** the active state is visually indicated and the route loads in the main content area.
5. **Given** the UX spec requirement for role-specific navigation, **then** sidebar items are dynamically rendered based on `user.role` with icons from the design system.
6. **Given** the Oyo State branding guidelines, **then** DashboardLayout includes header with logo, user dropdown with profile/logout, consistent footer, and mobile bottom navigation for touch-primary roles.
7. **Given** the UX spec loading state requirements, **when** any dashboard data is being fetched, **then** skeleton screens (shimmer effect in Oyo brand colors) MUST be displayed instead of spinners, following the patterns established in Story 1.5-1 and Story 1.9.

### Story 2.5-2: Super Admin Dashboard - Questionnaire & Form Management (Epic 2 Features)

As a Super Admin,
I want my dashboard with Questionnaire Management and Form Builder access,
So that I can manage native forms and monitor questionnaire status from a consolidated view.

> **Updated per SCP-2026-02-05-001:** ODK Health panel removed. Form Builder CTA added. XLSForm upload retained for migration only.

**Acceptance Criteria:**

1. **Given** the Super Admin dashboard at `/dashboard/super-admin`, **when** the page loads, **then** a dashboard home displays with Questionnaire Management card and Quick Stats card.
2. **Given** the questionnaire list, **when** clicking a questionnaire, **then** the detail view shows version history, status, and "Edit in Form Builder" button for native forms.
3. ~~**Given** the XLSForm upload feature, **when** Super Admin clicks "Upload XLSForm", **then** a modal opens with file picker, validation feedback, and upload progress.~~ SUPERSEDED — replaced by Form Builder (Story 2.10).
4. ~~**Given** the ODK Health widget, **when** ODK is unreachable for 3+ consecutive checks, **then** a prominent warning banner displays.~~ REMOVED — no longer applicable.
5. **Given** the Form Builder link, **when** Super Admin clicks "Create Form", **then** navigate to `/dashboard/super-admin/questionnaires/builder`.
6. **Given** the UX spec multi-panel layout, **then** the Super Admin dashboard uses card-based layout with critical metrics prominent and skeleton loading states.

### Story 2.5-3: Super Admin Dashboard - Staff Management (Epic 1 Features)

As a Super Admin,
I want Staff Management features on my dashboard,
So that I can provision users, send invitations, and manage roles from a unified interface.

**Acceptance Criteria:**

1. **Given** the Super Admin dashboard, **when** navigating to "Staff Management" section, **then** a table displays all staff with columns: Name, Email, Role, LGA, Status, Actions.
2. **Given** the bulk import feature, **when** Super Admin clicks "Bulk Import", **then** a modal opens for CSV upload with validation feedback.
3. **Given** the invitation system, **when** Super Admin clicks "Send Invitation" for a pending user, **then** the invitation email is triggered and status updates.
4. **Given** a staff member in "pending" status, **when** Super Admin views them, **then** they see options: "Resend Invitation", "Edit Role", "Deactivate".
5. **Given** the RBAC system, **when** Super Admin changes a user's role, **then** the change is reflected immediately and logged.
6. **Given** a role change occurs, **when** the user has active sessions, **then** ALL active sessions for that user MUST be invalidated (JTIs added to Redis blacklist), forcing re-login with updated permissions.
7. **Given** the ID card generation, **when** Super Admin views an active staff member, **then** they can generate/download their ID card.

### Story 2.5-4: Supervisor Dashboard Shell

As a Supervisor,
I want my dashboard to show team overview and fraud alerts,
So that I can monitor my enumerators and investigate suspicious activity.

**Acceptance Criteria:**

1. **Given** a Supervisor logging in, **when** they reach `/dashboard/supervisor`, **then** they see a team-focused dashboard with Team Overview card, Pending Alerts card (placeholder), Today's Collection card, and Last Updated timestamp with refresh button.
2. **Given** the Team Overview card, **when** clicked, **then** they see a list of their enumerators with status indicators.
3. **Given** the sidebar navigation, **then** Supervisor sees: Dashboard, Team, Alerts, Messages (4 items).
4. **Given** route guards, **when** a Supervisor tries to access `/dashboard/super-admin/*` or `/dashboard/enumerator`, **then** they receive 403 Forbidden.

### Story 2.5-5: Enumerator Dashboard Shell

As an Enumerator,
I want my mobile-optimized dashboard with survey access and sync status,
So that I can start surveys, resume drafts, and know my work is being saved.

**Acceptance Criteria:**

1. **Given** an Enumerator logging in on mobile, **when** they reach `/dashboard/enumerator`, **then** they see a touch-optimized layout with large tap targets (minimum 44x44px).
2. **Given** the dashboard, **when** rendered, **then** it displays "Start Survey" primary CTA, "Resume Draft" button (placeholder), "Daily Progress" card, and Sync status indicator.
3. **Given** the published native form questionnaires, **when** Enumerator views available surveys, **then** they see a list of active questionnaires with "Start Survey" buttons.
4. **Given** no questionnaires are published, **when** Enumerator views the survey list, **then** they see an empty state: "No surveys assigned yet. Contact your supervisor."
5. **Given** the "Start Survey" button, **when** clicked, **then** it shows "Coming in Epic 3" modal.
6. **Given** the sidebar navigation (mobile: bottom nav), **then** Enumerator sees: Home, Surveys, Drafts, Profile (3-4 items).
7. **Given** the PWA offline capability requirement, **then** the dashboard shell registers a service worker with no-op fetch handler (actual caching in Epic 3).
8. **Given** an Enumerator attempts to access `/dashboard/super-admin/*` or `/dashboard/supervisor`, **then** they receive 403 Forbidden.

### Story 2.5-6: Data Entry Clerk Dashboard

As a Data Entry Clerk,
I want a keyboard-optimized dashboard for paper form digitization,
So that I can process hundreds of forms efficiently without using a mouse.

**Acceptance Criteria:**

1. **Given** a Data Entry Clerk logging in, **when** they reach `/dashboard/clerk`, **then** they see a desktop-optimized interface with keyboard shortcuts guide.
2. **Given** the UX spec keyboard-primary requirement, **when** the page loads, **then** focus is automatically set to the first actionable element.
3. **Given** the dashboard, **when** rendered, **then** it displays "New Form Entry" primary action, "Today's Progress" card, "Recent Entries" list, and keyboard shortcuts help.
4. **Given** the questionnaire list, **when** pressing Tab, **then** focus moves sequentially through interactive elements without traps.
5. **Given** keyboard shortcuts, **then** the following shortcuts work (single keys, NOT Ctrl+ to avoid browser conflicts): `N` - New entry, `D` - View drafts, `?` - Show shortcuts modal, `Esc` - Close modal.
6. **Given** the "Start Entry" action, **when** pressing Enter on a questionnaire, **then** placeholder form opens (actual native form renderer launch in Epic 3).
7. **Given** the sidebar navigation, **then** Clerk sees: Dashboard, Active Forms, Completed, Help (4 items).
8. **Given** a Data Entry Clerk attempts to access `/dashboard/super-admin/*` or `/dashboard/supervisor`, **then** they receive 403 Forbidden.

### Story 2.5-7: Verification Assessor & Government Official Dashboards

As a Verification Assessor or Government Official,
I want my dashboard with appropriate data views,
So that I can perform audits (Assessor) or view read-only reports (Official).

**Acceptance Criteria:**

**Verification Assessor Dashboard (`/dashboard/assessor`):**

1. **Given** a Verification Assessor at `/dashboard/assessor`, **when** the page loads, **then** they see an audit-focused dashboard with Verification Queue card (placeholder), Recent Activity card, Evidence Panel placeholder, and quick filters (By LGA, By Enumerator, By Date Range).
2. **Given** the UX spec evidence display requirement, **then** Assessor dashboard includes placeholder area for GPS clustering, completion times, and response patterns (Epic 5 wiring).

**Government Official Dashboard (`/dashboard/official`):**

3. **Given** a Government Official at `/dashboard/official`, **when** the page loads, **then** they see a read-only Reports Dashboard with State Overview card, Collection Progress card, Export Data button (placeholder), and formal styling per Direction 08.
4. **Given** all Government Official dashboard elements, **when** rendered, **then** they are READ-ONLY (no edit/action buttons except export).
5. **Given** the formal interface requirement, **then** the Government Official dashboard uses Direction 08 styling from ux-design-directions.html.

**Shared Route Isolation:**

6. **Given** route isolation, **when** Assessor tries to access Official routes (or vice versa), **then** they receive 403.
7. **Given** either role attempts to access `/dashboard/super-admin/*`, **then** they receive 403 Forbidden.

### Story 2.5-8: Public User Dashboard & RBAC Integration Testing

As a Public User,
I want my simple dashboard with profile status and Insights placeholder,
So that I can access public features and know my next steps.

As a Developer/QA,
I want comprehensive RBAC integration tests,
So that we can verify all role routes are properly protected.

**Acceptance Criteria:**

1. **Given** a Public User at `/dashboard/public`, **when** the page loads, **then** they see a simple, mobile-first dashboard with profile completion status, "Complete Survey" CTA, marketplace opt-in status, and "Coming Soon: Skills Marketplace Insights" teaser.
2. **Given** the UX spec mobile-first requirement for public users, **then** the dashboard is optimized for mobile with minimal complexity.
3. **Given** the public user's limited scope, **then** navigation shows only: Home, Profile, Help (2-3 items).
4. **Given** a Public User attempts to access any `/dashboard/*` route except `/dashboard/public`, **then** they receive 403 Forbidden.
5. **Given** all 7 role dashboards are implemented, **when** running RBAC integration tests, **then** the access matrix verifies each role can ONLY access their own routes (strict isolation).
6. **Given** the RBAC integration tests, **then** they run in CI on every PR and block merge if any role can access unauthorized routes.
7. **Given** any RBAC violation attempt, **when** it occurs, **then** it is logged to audit trail with: attempted route, user ID, role, timestamp.
8. **Given** RBAC violation logging, **when** integration tests run, **then** they verify both the 403 response AND that an audit log entry was created.

**RBAC Access Matrix (Strict Isolation):**

| From Role ↓ \ To Route → | super-admin | supervisor | enumerator | clerk | assessor | official | public |
|--------------------------|-------------|------------|------------|-------|----------|----------|--------|
| **Super Admin**          | ✓ Allow     | ✗ 403      | ✗ 403      | ✗ 403 | ✗ 403   | ✗ 403   | ✗ 403  |
| **Supervisor**           | ✗ 403       | ✓ Allow    | ✗ 403      | ✗ 403 | ✗ 403   | ✗ 403   | ✗ 403  |
| **Enumerator**           | ✗ 403       | ✗ 403      | ✓ Allow    | ✗ 403 | ✗ 403   | ✗ 403   | ✗ 403  |
| **Clerk**                | ✗ 403       | ✗ 403      | ✗ 403      | ✓ Allow | ✗ 403  | ✗ 403   | ✗ 403  |
| **Assessor**             | ✗ 403       | ✗ 403      | ✗ 403      | ✗ 403 | ✓ Allow | ✗ 403   | ✗ 403  |
| **Official**             | ✗ 403       | ✗ 403      | ✗ 403      | ✗ 403 | ✗ 403   | ✓ Allow | ✗ 403  |
| **Public**               | ✗ 403       | ✗ 403      | ✗ 403      | ✗ 403 | ✗ 403   | ✗ 403   | ✓ Allow |
| **Unauthenticated**      | → Login     | → Login    | → Login    | → Login | → Login | → Login | → Login |

---

## Epic 3: Mobile Data Collection & Ingestion Pipeline

**Epic Goal:** Provide field enumerators and the public with a robust, offline-capable tool for data submission, and establish the real-time ingestion of that data.

### Story 3.1: Native Form Renderer & Dashboard

> **Rewritten per SCP-2026-02-05-001:** Enketo replaced by native form renderer.

As an Enumerator,
I want to fill out surveys using a native form interface,
So that I can collect data efficiently in the field.

**Dependencies:** Epic 2 Stories 2.7-2.10 (Native Form System)

**Acceptance Criteria:**

**AC3.1.1:** **Given** an authenticated session, **when** I click "Start Survey", **then** the native form renderer loads with one-question-per-screen navigation, progress indicator, and Next/Back buttons.

**AC3.1.2:** **Given** the form schema, **when** rendering questions, **then** all types are supported: text, number, date, select_one, select_multiple, geopoint, note.

**AC3.1.3:** **Given** a question with `showWhen` condition, **when** the condition is not met, **then** the question is skipped automatically.

**AC3.1.4:** **Given** a geopoint question, **when** the user captures location, **then** GPS coordinates are stored with accuracy indicator.

**AC3.1.5:** **And** the respondent's consent for the Marketplace must be the first mandatory field.

**AC3.1.6:** **Given** a Super Admin navigating to `/dashboard/super-admin/questionnaires/:formId/preview`, **when** the page loads, **then** `FormFillerPage` renders in read-only sandbox mode (`mode='preview'`) with one-question-per-screen navigation, progress indicator, and skip logic — but submit is disabled, no data is persisted, and a "Preview Mode" banner is displayed. `FormFillerPage` accepts a `mode` prop (`'fill' | 'preview'`) defaulting to `'fill'` for normal data collection; existing ACs (3.1.1–3.1.5) describe `fill` mode behavior.

**AC3.1.7:** **Given** the Form Builder interface, **when** a Super Admin views a form, **then** a "Live Preview" button is available on the existing Preview tab (alongside the schema summary and field table) that navigates to `/dashboard/super-admin/questionnaires/:formId/preview`, launching the form renderer in preview mode.

**Tasks/Subtasks:**
- Task 3.1.1: Create `apps/web/src/features/forms/pages/FormFillerPage.tsx` (load schema, track current question, navigation)
- Task 3.1.2: Create question renderer components (QuestionRenderer, TextInput, NumberInput, DateInput, SelectOneInput, SelectMultipleInput, GeopointInput, NoteDisplay)
- Task 3.1.3: Create `skipLogic.ts` client-side utility (getVisibleQuestions, getNextQuestionIndex)
- _Preview Mode (Tasks 3.1.4–3.1.6 are non-blocking; implement after core renderer Tasks 3.1.1–3.1.3)_
- Task 3.1.4: Add `mode` prop to `FormFillerPage` (`'fill' | 'preview'`) — in preview mode, disable submit, prevent data persistence, show "Preview Mode" banner
- Task 3.1.5: Create preview route `/dashboard/super-admin/questionnaires/:formId/preview` and wire `FormFillerPage` with `mode='preview'`
- Task 3.1.6: Update `FormBuilderPage` to include "Live Preview" button/link navigating to the preview route

### Story 3.2: PWA Service Worker & Offline Assets

As an Enumerator,
I want the survey form to load even when I have no internet access,
So that I can work in remote areas without interruption.

**Acceptance Criteria:**

**Given** a device that has previously loaded the app
**When** I access the survey interface without a network connection
**Then** the Service Worker should serve the native form assets and form schema definitions from the cache
**And** the app must request browser "Persistent Storage" to prevent cache eviction.

### Story 3.3: Offline Queue & Sync Status UI

As an Enumerator,
I want to see the status of my survey submissions on my dashboard,
So that I know if my data has been successfully uploaded or is pending.

**Acceptance Criteria:**

**Given** one or more completed surveys in the browser's IndexedDB
**When** I view my dashboard
**Then** the Sync Status Badge should show "Syncing" (Amber) if uploading or "Offline" (Red) if no connection
**And** a Red Warning Banner must appear if there is unsent data.

### Story 3.4: Idempotent Submission Ingestion (BullMQ)

> **Updated per SCP-2026-02-05-001:** ODK webhook replaced by native form submission API.

As a System,
I want to reliably ingest survey submissions from the native form renderer,
So that the data is available for reporting and fraud detection.

**Acceptance Criteria:**

**Given** a survey submission from the native form renderer
**When** the client syncs a completed form via the submission API
**Then** the system should push the job to BullMQ and deduplicate by `submission_id`
**And** the record should be extracted and saved to the `app_db` (idempotent ingestion).

### Story 3.0: Google OAuth & Enhanced Public Registration

As a Public User,
I want to register using my Google account as the primary option,
So that I can sign up faster with a pre-verified email and reduced friction.

**Dependencies:**
- Epic 1 (Foundation) - Complete
- Epic 1.5 (Public Website) - Complete
- ADR-015: Public User Registration & Email Verification Strategy

**Blocks:** Story 3.5 (Public Self-Registration & Survey Access)

**Acceptance Criteria:**

**AC1: Google OAuth Primary Registration**
**Given** the public registration page
**When** I view the registration options
**Then** "Continue with Google" MUST be displayed as the primary/recommended option
**And** clicking it MUST initiate Google OAuth 2.0 authorization flow
**And** upon successful OAuth callback, the system MUST:
  - Extract verified email from Google response
  - Create user account with `auth_provider: 'google'` and `google_id` stored
  - Skip email verification (Google pre-verifies)
  - Redirect to NIN entry and profile completion

**AC2: Email Registration Fallback**
**Given** the public registration page
**When** I choose "Register with Email" (secondary option)
**Then** I MUST provide email and password
**And** the system MUST send Hybrid Verification Email per ADR-015:
  - Single email containing BOTH magic link AND 6-digit OTP
  - Magic link expires in 24 hours
  - OTP expires in 10 minutes
  - Either method verifies the email successfully

**AC3: Database Schema Updates**
**Given** the existing user table
**When** implementing OAuth support
**Then** the schema MUST include:
  - `auth_provider` ENUM ('email', 'google') NOT NULL DEFAULT 'email'
  - `google_id` VARCHAR(255) NULLABLE UNIQUE
  - `password_hash` NULLABLE (NULL for Google OAuth users)
  - `email_verified_at` TIMESTAMP (set immediately for Google users)

**AC4: Login Flow Enhancement**
**Given** an existing user
**When** they attempt to log in
**Then** the system MUST:
  - Show "Continue with Google" as primary option
  - Show "Login with Email" as secondary option
  - For Google users: only allow Google OAuth login (no password)
  - For Email users: allow email/password login
  - Prevent account linking conflicts (same email, different providers)

**AC5: Security Requirements**
**Given** the OAuth implementation
**When** handling authentication flows
**Then** the system MUST:
  - Use OAuth 2.0 `state` parameter to prevent CSRF attacks
  - Validate Google ID token signature server-side
  - Store only necessary Google data (id, email, name)
  - Never store Google access/refresh tokens
  - Implement rate limiting: 10 OAuth attempts per IP per hour

**AC6: Profile Completion Flow**
**Given** a newly registered user (via Google or Email)
**When** registration is complete
**Then** the user MUST be redirected to profile completion
**And** profile completion flow remains unchanged:
  - NIN entry with Verhoeff validation
  - Live selfie capture
  - Bank details for stipend
  - Next of kin information

**AC7: Password Reset Handling**
**Given** a user requesting password reset
**When** the user registered via Google OAuth
**Then** the system MUST display message: "This account uses Google Sign-In. Please use 'Continue with Google' to access your account."
**And** password reset MUST NOT be offered to Google OAuth users

**References:**
- ADR-015: Public User Registration & Email Verification Strategy
- PRD FR3: Public Access & Authentication
- Story 1.8: Public User Self-Registration (enhanced by this story)
- UX Design Specification Section 8.3: Registration Flow

---

### Story 3.5: Public Self-Registration & Survey Access

As a Public User,
I want to register on the website and fill out the survey,
So that I can contribute my skills to the registry.

**Dependencies:**
- Story 3.0: Google OAuth & Enhanced Public Registration

**Acceptance Criteria:**

**Given** the public homepage
**When** I register via Google OAuth or Email (per Story 3.0)
**Then** the system should verify my NIN uniqueness and provide access to the survey portal
**And** my submission should be ingested into the same pipeline as enumerator data.

### Story 3.6: Keyboard-Optimized Data Entry Interface (Clerks)

As a Data Entry Clerk,
I want a dedicated interface optimized for rapid keyboard input,
So that I can digitize paper forms quickly and without RSI.

**Acceptance Criteria:**

**Given** a batch of paper forms
**When** I use the Data Entry interface
**Then** I should be able to navigate all fields using 'Tab' and submit using 'Enter'
**And** the form must auto-focus the first field after each successful submission.

### Story 3.7: Global NIN Uniqueness Enforcement

As a System,
I want to prevent the same individual from being registered multiple times,
So that the registry maintains high data integrity.

**Acceptance Criteria:**

**Given** a new survey submission (Enumerator, Public, or Clerk)
**When** the ingestion worker processes the record
**Then** it must check the `respondents` table for an existing NIN
**And** if found, the submission must be rejected with an error message showing the original registration date.

---

## Epic 4: Supervisor Oversight & Field Management

**Epic Goal:** Empower local managers with the tools to monitor their teams, communicate in real-time, and manage data quality via fraud alerts.

### Story 4.1: Supervisor Team Dashboard

As a Supervisor,
I want to view a real-time dashboard of my assigned team's progress,
So that I can monitor daily quotas and identify laggards.

**Acceptance Criteria:**

**Given** an authenticated Supervisor session
**When** I access the Supervisor Dashboard
**Then** I should see a list of my 3 assigned Enumerators and their daily/weekly submission counts
**And** the dashboard must show a map view of their latest GPS-captured submissions.

### Story 4.2: In-App Team Messaging

As a Supervisor,
I want to send and receive messages with my assigned Enumerators,
So that I can provide real-time guidance and support.

**Acceptance Criteria:**

**Given** a need to communicate with the field
**When** I send a message through the In-App Messaging panel
**Then** the assigned Enumerator should receive a notification on their dashboard
**And** the entire chat history must be preserved for audit purposes.

### Story 4.3: Fraud Engine Configurable Thresholds

> **Dependencies:** prep-7 (Fraud Detection Domain Research) — heuristic definitions, threshold schema, types, and scoring model

As a Super Admin,
I want to adjust the fraud detection thresholds via a UI,
So that I can tune the system based on pilot results.

**Acceptance Criteria:**

**Given** the Super Admin Settings UI
**When** I adjust the "Cluster Detection Radius" or "Speed Run Duration" thresholds
**Then** the Fraud Engine must immediately apply these new rules to all incoming ingestions
**And** the changes must be logged in the system audit trail.

### Story 4.4: Flagged Submission Review (Evidence Panel)

> **Dependencies:** prep-7 (Fraud Detection Domain Research) — fraud schema, severity levels, and detection result types

As a Supervisor,
I want to review the evidence for flagged submissions,
So that I can decide whether to verify or reject them.

**Acceptance Criteria:**

**Given** a flagged submission in my LGA
**When** I open the Evidence Panel
**Then** I should see a map with the GPS cluster, the survey duration, and any pattern warnings
**And** I must have the option to mark the individual record as "Verified" or "Rejected".

### Story 4.5: Bulk Verification of Mass-Events

> **Dependencies:** prep-7 (Fraud Detection Domain Research) — fraud schema, composite scoring model, and GPS clustering algorithm

As a Supervisor,
I want to verify a group of flagged submissions with one click,
So that I can efficiently handle legitimate community registration events.

**Acceptance Criteria:**

**Given** a cluster of 3+ flagged submissions at the same location/time
**When** I select the cluster and click "Verify Mass Event"
**Then** all submissions in that group must have their fraud flags cleared and status updated to "Verified"
**And** I must provide a mandatory justification (e.g., "Trade Union Meeting").

### Story TD-4.1: Migrate Survey Forms to React Hook Form + Zod (Tech Debt)

As a Developer,
I want a unified form state management approach using React Hook Form + Zod across all survey form components,
So that validation logic is consistent, re-renders are minimized, and the codebase aligns with Architecture Decision 4.3.

**Acceptance Criteria:**

**Given** the FormFillerPage and ClerkDataEntryPage currently use controlled `useState` for form state,
**When** this story is complete,
**Then** both components use React Hook Form with dynamic Zod schemas generated from `FlattenedQuestion[]`,
**And** all existing form tests pass without regression,
**And** `QuestionRenderer` and child input components work with RHF `Controller` wrappers,
**And** `useDraftPersistence` integrates with RHF `watch()` for auto-save,
**And** skip logic re-evaluation works correctly with the dynamic schema rebuild cycle.

**Notes:**
- Estimated effort: 10-15 hours
- Requires dynamic Zod schema builder (`FlattenedQuestion[]` → `z.object()`) handling all 7 validation types
- Key challenge: circular dependency between `watch()` → skip logic → visible questions → schema rebuild — solve with `useMemo` and careful ordering
- Auth forms (RegistrationForm, ActivationForm) already use RHF + Zod — use as reference pattern
- Origin: Conscious deviation documented in Architecture Decision 4.3 amendment (2026-02-14)

---

## Epic 5: Back-Office Audit & Policy Reporting

**Epic Goal:** Provide high-level stakeholders and state auditors with the tools to verify registry integrity and extract policy-driving insights.

### Story 5.1: High-Level Policy Dashboard

As a Government Official,
I want to see a read-only overview of state-wide labor statistics,
So that I can make data-driven policy decisions.

**Acceptance Criteria:**

**Given** an Official login
**When** I access the Policy Dashboard
**Then** I should see real-time registration counts, skills distribution charts, and LGA heatmaps
**And** all data should be read-only with no ability to modify records.

### Story 5.2: Verification Assessor Audit Queue

As a Verification Assessor,
I want a state-wide queue of submissions marked for final audit,
So that I can perform a secondary level of quality control.

**Acceptance Criteria:**

**Given** an Assessor login
**When** I open the Audit Queue
**Then** I should see all submissions that have been verified by Supervisors or flagged with high fraud scores
**And** I must be able to "Final Approve" or "Reject" the record.

### Story 5.3: Individual Record PII View (Authorized Roles)

As an Authorized Auditor,
I want to view the full PII of a respondent,
So that I can perform deep-dive investigations into suspicious records.

**Acceptance Criteria:**

**Given** a specific respondent record
**When** I click "View Full Details"
**Then** the system should display the Name, NIN, and Phone Number
**And** every instance of this PII access must be logged in the immutable audit trail.

### Story 5.4: PII-Rich CSV/PDF Exports

As a Government Official,
I want to export filtered datasets including personally identifiable information,
So that I can perform offline analysis for authorized government use.

**Acceptance Criteria:**

**Given** a set of filters (e.g., Skills + LGA)
**When** I click "Export with PII"
**Then** the system should generate a secure CSV or PDF including Name and Contact info
**And** the export action must be logged with the Official's ID and the filter parameters used.

### Story 5.5: Respondent Data Registry Table

> **Added:** Epic 4 Retrospective (2026-02-20) — identified gap: no existing Epic 5 story provides a browsable table of all respondent data.

As an authorized back-office user,
I want a server-paginated, filterable table of all respondent records,
So that I can browse, search, and analyze registry data at scale.

**Dependencies:**
- Epic 4: `fraud_detections` table (severity scores, resolution status), `team_assignments` table (supervisor LGA scoping)
- Story 5.4: Export integration — Story 5.4 exports should respect active filters from this table

**Acceptance Criteria:**

**AC5.5.1: Access Control**

| Role | Scope | PII Visible | Audit Logged |
|------|-------|:-----------:|:------------:|
| Super Admin | All LGAs | Yes | Yes |
| Verification Assessor | All LGAs | Yes | Yes (every row view) |
| Government Official | All LGAs | Yes | Yes (every row view) |
| Supervisor | Own LGA only | No (operational data only) | Yes |

**AC5.5.2: Filter Controls**

**Given** the registry table page, **when** the table loads, **then** the following filter controls must be available:
- LGA (dropdown, pre-filtered for Supervisors to own LGA only)
- Gender (male / female / other)
- Collection channel (Public Self-Registration, Enumerator Field Collection, Data Entry Clerk)
- Date range (from/to date picker)
- Verification status (pending, verified, rejected, quarantined)
- Fraud severity (clean, low, medium, high, critical)
- Form/questionnaire type
- Enumerator (who collected it)
- Free text search (respondent name or NIN — PII roles only)

**AC5.5.3: Column Visibility per Role**

| Column | Super Admin | Assessor | Official | Supervisor |
|--------|:-----------:|:--------:|:--------:|:----------:|
| Respondent Name | Yes | Yes | Yes | No |
| NIN | Yes | Yes | Yes | No |
| Phone | Yes | Yes | Yes | No |
| Gender | Yes | Yes | Yes | Yes |
| LGA | Yes | Yes | Yes | Yes (own) |
| Collection Channel | Yes | Yes | Yes | Yes |
| Enumerator | Yes | Yes | Yes | Yes (own team) |
| Submission Date | Yes | Yes | Yes | Yes |
| Fraud Score | Yes | Yes | Read-only | Yes |
| Verification Status | Yes | Yes | Read-only | Yes |
| Form Responses | Yes | Yes | Yes | No |

**AC5.5.4: Technical Requirements**

**Given** the need to support 1M records at project end, **when** implementing the table, **then**:
- Server-side pagination (cursor-based for performance)
- Server-side filtering and sorting (query params to API)
- TanStack Table in server-side mode
- Designed to scale from pilot (thousands) to target (1M records)
- Export integration: Story 5.4 exports should respect active filters from this table

**AC5.5.5: Quick-Filter Presets**

> **Added:** PM discussion (2026-02-22) — Super Admin needs to monitor incoming submissions in real-time, not just browse historical records. Quick-filter presets turn the same table into both a monitoring tool and a research tool.

**Given** the registry table page, **when** the table loads, **then** a row of quick-filter preset buttons must appear above the filter controls:

| Preset | Filters Applied | Default Sort | Purpose |
|--------|----------------|:------------:|---------|
| **Live Feed** | Date = Today | Newest first | "What's coming in right now?" — real-time operational monitoring |
| **This Week** | Date = Mon–Sun (current week, WAT) | Newest first | Weekly progress check |
| **Flagged** | Fraud severity = medium, high, critical | Severity desc | Submissions needing attention |
| **Pending Review** | Verification status = pending | Oldest first | Backlog of unreviewed records (oldest first to prevent stale queue) |
| **All Records** | No filters | Newest first | Full registry browse (default on page load) |

- Clicking a preset sets the corresponding filters and sort order, replacing any currently active filters
- The active preset button is visually highlighted (e.g., filled/primary variant)
- User can further refine filters after selecting a preset — the preset button deselects to indicate "custom" state
- Presets are available to all authorized roles (Super Admin, Assessor, Official, Supervisor) but filtered data respects role scope (e.g., Supervisor still sees own LGA only)

**AC5.5.6: Live Monitoring Mode**

**Given** the "Live Feed" preset is active, **when** the Super Admin is monitoring incoming submissions, **then**:
- The table auto-refreshes every **60 seconds** (polling interval, consistent with Supervisor dashboard pattern from Story 4.1)
- A subtle "Last updated: X seconds ago" indicator shows below the table header
- When new submissions arrive since the last fetch, a notification bar appears above the table: **"N new submissions — Click to refresh"** (avoids jarring auto-scroll that disrupts reading)
- Auto-refresh is **only active** when the Live Feed preset is selected — other presets and custom filters use standard manual pagination without polling
- Auto-refresh pauses when the browser tab is not visible (Page Visibility API) to avoid unnecessary API load

**AC5.5.7: Row Navigation to Detail View**

**Given** an authorized user (Super Admin, Assessor, Official) viewing the registry table, **when** they click a row, **then**:
- Navigate to the individual record PII view (Story 5.3) for that respondent
- Supervisor row click navigates to an operational detail view (no PII — submission metadata, fraud score, verification status only)
- Row hover shows a pointer cursor and subtle highlight to indicate clickability

### Story 5.6a: Supervisor Team Productivity Table & API Foundation

> **Added:** Epic 4 Retrospective & PM discussion (2026-02-22) — the existing supervisor dashboard shows summary cards but lacks a queryable, filterable, exportable productivity table with target tracking. Split from original 5.6 for scope management (Team Agreement A4).

As a Supervisor,
I want a filterable, sortable table showing my team's submission productivity against daily targets,
So that I can track enumerator output, identify underperformers, and export the data for reporting.

**Dependencies:**
- Epic 4: `team_assignments` table (supervisor team scoping), `getTeamMetrics` query pattern in `supervisor.controller.ts`
- prep-2 (Audit Logging): All table views audit-logged
- prep-3 (Export Infrastructure): CSV/PDF export via `ExportService` (`generatePdfReport`, `generateCsvExport`)

**Acceptance Criteria:**

**AC5.6a.1: Access Control**

| Role | Scope | View | Export |
|------|-------|:----:|:------:|
| Supervisor | Own assigned Enumerators only (via `team_assignments` / LGA fallback) | Yes | Yes (CSV/PDF) |
| Super Admin | All staff — _but Super Admin view is Story 5.6b_ | — | — |

- This story delivers the **Supervisor view only** plus the shared API foundation that 5.6b builds on
- Verification Assessors, Government Officials, Data Entry Clerks, and Public Users do NOT have access

**AC5.6a.2: Productivity Target System**

**Given** the need to track output against quotas, **when** the system is configured, **then**:
- System-wide default daily target: **25 submissions/day** (stored in system settings, editable by Super Admin)
- Per-LGA target override: Optional — Super Admin can set a different target for specific LGAs (e.g., 20/day for difficult terrain)
- Target applies to Enumerators and Data Entry Clerks (both produce submissions)
- Targets stored in a `productivity_targets` config (JSONB in system settings or dedicated table — implementation decides)

**AC5.6a.3: Table Columns**

| Column | Description |
|--------|-------------|
| Enumerator | Full name of the assigned enumerator |
| Today | Submissions collected today (WAT: UTC+1) |
| Target | Daily target for this LGA (default 25, or per-LGA override) |
| % | Today's progress as percentage of target |
| Status | Derived indicator (see AC5.6a.4) |
| Trend | Arrow indicator: ↑ improving, ↓ declining, → flat vs. previous equivalent period |
| This Week | Submissions this week (Mon–Sun WAT) with target (e.g., "98/125") |
| This Month | Submissions this calendar month with target (e.g., "420/500") |
| Approved | Submissions with approved/verified status in selected period |
| Rejected | Submissions rejected in selected period |
| Rej. Rate | Rejected / Total as percentage — quality signal (high volume + high rejection = gaming) |
| Days Active | Days with ≥1 submission / total working days in period |
| Last Active | Timestamp of most recent submission (relative: "2 min ago", "3 hrs ago") |

**AC5.6a.4: Status Indicator Logic**

**Given** the current time of day and submissions count, **when** calculating status, **then**:

| Status | Condition | Color |
|--------|-----------|-------|
| **Complete** | Today ≥ Target | Green |
| **On Track** | Projected to hit target based on current pace and hours remaining in workday (8am–5pm WAT) | Blue |
| **Behind** | Projected pace will NOT hit target | Amber |
| **Inactive** | 0 submissions today AND last active > 24 hours | Red |

Projection formula: `(submissions_so_far / hours_elapsed) * hours_remaining ≥ remaining_target`

**AC5.6a.5: Filter & Sort Controls**

**Given** the supervisor's team productivity page, **when** the table loads, **then**:
- Time range picker: Today (default), This Week, This Month, Custom date range
- Status filter: All, On Track, Behind, Inactive
- Sort by any column (ascending/descending)
- Free text search (enumerator name)
- Summary row at bottom: team totals and averages across all visible enumerators

**AC5.6a.6: Export (CSV/PDF)**

**Given** the export button, **when** the Supervisor clicks export, **then**:
- **CSV**: Generated via `ExportService.generateCsvExport()` with UTF-8 BOM (Excel-compatible). Downloads as `oslsr-team-productivity-{supervisor-lga}-{date}.csv`
- **PDF**: Generated via `ExportService.generatePdfReport()` with Oyo State branded header, report title ("Team Productivity Report"), LGA name, date range, filters applied, and generated-by Supervisor name. Downloads as `oslsr-team-productivity-{supervisor-lga}-{date}.pdf`
- Export respects all active filters and sort order
- Export action audit-logged with Supervisor user ID, LGA, filters applied, record count, format, and timestamp
- Staff counts are bounded (< 10 per LGA), so PDF is always viable (no row cap issue)

**AC5.6a.7: Daily Productivity Snapshots**

**Given** the need for historical trend data (weekly/monthly totals, trend arrows), **when** the system runs nightly, **then**:
- A scheduled BullMQ job runs at **11:59 PM WAT daily** to snapshot each staff member's daily submission count
- Snapshot stored in `daily_productivity_snapshots` table: `{ id, userId, lgaId, roleId, date, submissionCount, approvedCount, rejectedCount, createdAt }`
- The table queries **live data** for "Today" and **snapshots** for historical periods (This Week, This Month, custom range)
- This prevents expensive full-table scans for historical aggregation at scale

**AC5.6a.8: API Endpoints (Shared Foundation)**

New endpoints that serve both 5.6a (Supervisor) and 5.6b (Super Admin/Official):

```
GET /api/v1/productivity/team
  - Supervisor: returns own team's productivity data
  - Query params: period (today|week|month|custom), dateFrom, dateTo, status, search, sortBy, sortOrder, page, pageSize
  - Response: { data: StaffProductivityRow[], pagination, summary: { totalSubmissions, avgPerDay, totalTarget, overallPercent } }

GET /api/v1/productivity/targets
  - Super Admin: get/set default target and per-LGA overrides
  - Response: { defaultTarget: 25, lgaOverrides: [{ lgaId, lgaName, target }] }

PUT /api/v1/productivity/targets
  - Super Admin only: update default target or per-LGA overrides

POST /api/v1/productivity/export
  - Supervisor/Super Admin: export current filtered view
  - Body: { format: "csv"|"pdf", filters: {...}, columns: [...] }
  - Response: file download (Content-Disposition: attachment)
```

**AC5.6a.9: Technical Requirements**

- Server-side pagination (offset-based — staff counts are bounded, not 1M+)
- Server-side filtering and sorting (query params to API)
- TanStack Table in server-side mode
- Core query extends existing `getTeamMetrics` pattern using SQL `COUNT(*) FILTER (WHERE ...)`
- WAT (UTC+1) timezone boundary calculations for day/week/month periods
- Trend calculation: compare current period average vs. previous equivalent period (e.g., this week vs. last week)
- Re-uses existing `TeamAssignmentService.getEnumeratorIdsForSupervisor()` for team scoping

---

### Story 5.6b: Super Admin Cross-LGA Analytics & Government Official View

> **Added:** Epic 4 Retrospective & PM discussion (2026-02-22) — split from original 5.6. Builds on 5.6a's API foundation to deliver Super Admin cross-LGA analytics with comparison mode, supervisorless LGA monitoring, and a Government Official aggregate-only view.

As a Super Admin,
I want a cross-LGA staff productivity dashboard with individual staff tracking, LGA comparison, and supervisorless LGA monitoring,
So that I can hold all teams accountable, identify systemic issues, and manage LGAs without on-ground supervisors.

As a Government Official,
I want a read-only LGA-level productivity summary (no individual staff names),
So that I can track field operation progress without accessing personal staff data.

**Dependencies:**
- **Story 5.6a** (MUST complete first): API foundation, productivity targets, daily snapshots, export infrastructure integration
- `team_assignments` table: determines staffing model per LGA
- `users.lgaId` + `users.roleId`: determines which LGAs have supervisors vs. direct Super Admin monitoring

**Acceptance Criteria:**

**AC5.6b.1: Access Control**

| Role | View | Scope | Individual Staff Names | Export |
|------|------|-------|:---------------------:|:------:|
| Super Admin | Individual Staff Tab + LGA Comparison Tab | All LGAs, all field roles | Yes | Yes (CSV/PDF) |
| Government Official | LGA Aggregate Summary only | All LGAs | **No** — aggregates only | **No** — read-only |

- Supervisors use their own view from Story 5.6a (no access to cross-LGA data)
- Verification Assessors, Data Entry Clerks, Enumerators, Public Users do NOT have access

**AC5.6b.2: Super Admin — Individual Staff Performance Tab**

**Given** the Super Admin productivity page, **when** the "Staff Performance" tab is active, **then** display:

| Column | Description |
|--------|-------------|
| Staff Name | Full name |
| Role | Enumerator, Data Entry Clerk, or Supervisor |
| LGA | Assigned Local Government Area |
| Supervisor | Assigned supervisor name, or **"— Direct"** if LGA has no supervisor (Super Admin monitors directly) |
| Today | Submissions today (WAT) |
| Target | Daily target (system default or LGA override) |
| % | Progress percentage |
| Status | On Track / Behind / Inactive / Complete (same logic as AC5.6a.4) |
| Trend | ↑ ↓ → vs. previous period |
| This Week | Week total with target |
| This Month | Month total with target |
| Approved | Approved count in period |
| Rej. Rate | Rejection rate percentage |
| Days Active | Active days / total working days |
| Last Active | Relative timestamp |

**Supervisor productivity row**: When Role = Supervisor, the Today/Week/Month columns show **submissions reviewed** (approved + rejected), not collected. Target for supervisors = sum of their team's targets (e.g., 3 enumerators × 25 = 75 reviews/day).

**AC5.6b.3: Super Admin — LGA Comparison Tab**

**Given** the Super Admin productivity page, **when** the "LGA Comparison" tab is active, **then** display:

| Column | Description |
|--------|-------------|
| LGA | Local Government Area name |
| Staffing Model | Inferred from actual assignments: "Full (1+N)", "Lean (1+N)", or "No Supervisor (N)" where N = enumerator count |
| Enumerator Count | Number of active enumerators in LGA |
| Supervisor | Supervisor name, or **"— Super Admin"** if none assigned |
| Today Total | Sum of all enumerator submissions today |
| LGA Target | Sum of individual targets (count × per-staff target) |
| % | LGA progress percentage |
| Avg/Enumerator | Today total / enumerator count |
| Best Performer | Name + count of highest-output enumerator |
| Lowest Performer | Name + count of lowest-output enumerator |
| Rej. Rate | LGA-wide rejection rate |
| Trend | ↑ ↓ → vs. previous period |

**Staffing model inference**: Derived from actual role assignments — no separate configuration needed:
- Query users with `roleId = Supervisor` and `lgaId = X` → if found, "Full" or "Lean" based on enumerator count
- If no supervisor found for LGA → "No Supervisor"
- The model updates automatically when staff are added, removed, or roles changed

**Supervisorless LGA highlighting**: LGAs with no assigned supervisor are visually highlighted (amber background or badge) and can be filtered to show "Direct monitoring" LGAs only — these are the ones that need Super Admin's closest attention.

**Comparison mode**: Super Admin can select 2+ LGAs (checkbox) to view a side-by-side comparison card that shows both LGAs' key metrics together for easy visual comparison.

**AC5.6b.4: Government Official — LGA Aggregate Summary**

**Given** a Government Official accessing the productivity view, **when** the page loads, **then** display an **aggregate-only table** with NO individual staff names:

| Column | Description |
|--------|-------------|
| LGA | Local Government Area name |
| Active Staff | Count of active enumerators + clerks in LGA |
| Today Total | Sum of all submissions today |
| Daily Target | Sum of individual targets |
| % | Progress percentage |
| This Week | Total submissions this week |
| Week Avg/Day | Average daily submissions this week |
| This Month | Total submissions this month |
| Completion Rate | Month total / month target as percentage |
| Trend | ↑ ↓ → vs. previous period |

- **No individual staff names, no staff-level rows** — only LGA-level aggregates
- **No export button** — Government Officials view this data on-screen only
- **No staffing model column** — Officials don't need to know internal team structure
- Rationale: Providing staff-level data to Government Officials creates political pressure on individual field staff. Officials need to see "Is this LGA on track?" not "Is Adamu performing?"

**AC5.6b.5: Filter & Sort Controls**

**Super Admin (both tabs):**
- Time range picker: Today (default), This Week, This Month, Custom date range
- LGA dropdown (multi-select for comparison)
- Role filter: Enumerator, Data Entry Clerk, Supervisor (Staff tab only)
- Supervisor filter: dropdown of supervisors (Staff tab only)
- Staffing model filter: Full, Lean, No Supervisor (LGA tab only)
- Status filter: On Track, Behind, Inactive (Staff tab only)
- Sort by any column (ascending/descending)
- Free text search (staff name on Staff tab, LGA name on LGA tab)
- Summary row: totals and averages across visible rows

**Government Official:**
- Time range picker: Today, This Week, This Month, Custom date range
- LGA dropdown (single or multi-select)
- Sort by any column (ascending/descending)

**AC5.6b.6: Export (CSV/PDF) — Super Admin Only**

**Given** the export button on Super Admin's view, **when** the Super Admin clicks export, **then**:
- **CSV**: Via `ExportService.generateCsvExport()` with UTF-8 BOM. Downloads as `oslsr-productivity-{tab}-{date}.csv`
- **PDF**: Via `ExportService.generatePdfReport()` with Oyo State branded header, report title (e.g., "Staff Productivity Report" or "LGA Comparison Report"), date range, filters applied, generated-by Super Admin name, and print-optimized layout. Downloads as `oslsr-productivity-{tab}-{date}.pdf`
- Export respects all active filters and sort order
- Export action audit-logged with Super Admin user ID, tab, filters applied, record count, format, and timestamp
- **Government Official has NO export button** (read-only view only)

**AC5.6b.7: Supervisorless LGA Workflow (Option A)**

**Given** an LGA with no assigned Supervisor, **when** submissions are made by enumerators in that LGA, **then**:
- Submissions follow the normal ingestion pipeline (fraud scoring, storage)
- The Super Admin can see all submissions from supervisorless LGAs in their existing dashboard views (fraud review, data overview)
- The productivity table marks these LGAs as "No Supervisor — Super Admin" in the Supervisor column
- Super Admin can filter to show only supervisorless LGAs for focused monitoring
- No separate approval workflow is needed — Super Admin uses existing fraud review and verification tools to review submissions from these LGAs
- **Note**: This is a monitoring model, not a new workflow. The Super Admin's existing tools (fraud review, bulk verification, data overview) handle the review. The productivity table surfaces which LGAs need attention.

**AC5.6b.8: API Endpoints**

Extends the foundation from Story 5.6a:

```
GET /api/v1/productivity/staff
  - Super Admin only: returns all staff productivity data across all LGAs
  - Query params: period, dateFrom, dateTo, lgaId, roleId, supervisorId, status, search, sortBy, sortOrder, page, pageSize
  - Response: { data: StaffProductivityRow[], pagination, summary }

GET /api/v1/productivity/lga-comparison
  - Super Admin only: returns LGA-level aggregated productivity data
  - Query params: period, dateFrom, dateTo, lgaIds (multi), staffingModel, sortBy, sortOrder
  - Response: { data: LgaProductivityRow[], summary }

GET /api/v1/productivity/lga-summary
  - Government Official: returns LGA aggregates only (no staff names)
  - Query params: period, dateFrom, dateTo, lgaId, sortBy, sortOrder
  - Response: { data: LgaAggregateSummaryRow[], summary }
```

**AC5.6b.9: Technical Requirements**

- Builds on 5.6a's daily snapshot table — no duplicate infrastructure
- LGA comparison queries use `GROUP BY lga_id` on snapshots + live data for today
- Staffing model inferred at query time via `EXISTS (SELECT 1 FROM users WHERE lga_id = ? AND role = 'supervisor' AND status IN ('active','verified'))`
- Supervisor review throughput: count rows in `fraud_detections` or submission status changes where `reviewed_by = supervisor_id`
- TanStack Table with tab switching (Staff Performance / LGA Comparison) for Super Admin
- Government Official view is a separate route/component with its own API endpoint (enforced at backend — cannot access staff-level endpoints)
- All views respect existing RBAC middleware (`authorize()` + `requireLgaLock()` where applicable)

---

## Epic 6: System Integrity, Accountability & Remuneration

**Epic Goal:** Ensure the absolute trustworthiness of the registry through immutable audit trails, system health monitoring, and transparent staff payment management.

### Story 6.1: Immutable Append-Only Audit Logs

As a System,
I want to record every user action in a tamper-proof log,
So that the state has an absolute forensic trail of system activity.

**Acceptance Criteria:**

**Given** any API request that modifies data or accesses PII
**When** the action is performed
**Then** the system should insert a record into the `audit_logs` table
**And** the table must be configured as append-only via database permissions to prevent any deletion.

### Story 6.2: System Health & Performance Monitoring

As a Super Admin,
I want to monitor the real-time health of the VPS and application,
So that I can proactively resolve technical issues.

**Acceptance Criteria:**

**Given** the Super Admin dashboard
**When** I view the "System Health" panel
**Then** I should see metrics for CPU/RAM usage, BullMQ queue lag, and p95 API latency
**And** I should receive an automated email alert if any critical threshold is breached.

### Story 6.3: Automated Off-site Backup Orchestration

As a System,
I want to automatically back up all data to off-site storage,
So that the registry is resilient against catastrophic hardware failure.

**Acceptance Criteria:**

**Given** the daily backup schedule (2 AM / 3 AM)
**When** the backup job triggers
**Then** the system should generate encrypted SQL dumps of `app_db`
**And** successfully upload them to S3-compatible storage with a 7-year retention policy.

### Story 6.4: Staff Remuneration Bulk Recording

As a Super Admin,
I want to record stipend payments to staff in bulk,
So that I can efficiently manage the field workforce payroll.

**Acceptance Criteria:**

**Given** a list of eligible Enumerators/Supervisors
**When** I record a "Tranche" payment with Amount and Bank Reference
**Then** the system should update the staff's payment history and trigger a notification
**And** the record must be immutable (new version created for any corrections).

### Story 6.5: Staff Payment History & Dispute Mechanism

As a Staff Member,
I want to see my payment history and report missing stipends,
So that I can resolve remuneration issues transparently.

**Acceptance Criteria:**

**Given** my staff dashboard
**When** I view "Payment History" and click "Report Issue" on a record
**Then** the status should change to "Disputed" and appear on the Super Admin's dashboard
**And** I must be able to provide comments describing the issue.

### Story 6.6: Payment Dispute Resolution Queue

As a Super Admin,
I want to resolve reported payment issues with evidence,
So that staff grievances are handled fairly.

**Acceptance Criteria:**

**Given** a "Disputed" payment record
**When** I provide "Resolution Evidence" (e.g., bank screenshot) and mark as "Resolved"
**Then** the staff member should receive a notification
**And** the audit trail must record the resolution details and the admin who closed the case.

### Story 6.7: Super Admin View-As Feature

As a Super Admin,
I want to view what another role's dashboard looks like for debugging and demos,
So that I can troubleshoot user issues and demonstrate the system to stakeholders.

**Source:** Deferred from Epic 2.5 retrospective - requires audit infrastructure from Story 6.1.

**Acceptance Criteria:**

1. **Given** a Super Admin at `/dashboard/super-admin/view-as/:role`, **when** they select a role to view as, **then** the target role's dashboard renders in a sandboxed context (NOT the actual route).
2. **Given** the View-As mode, **when** active, **then** a prominent banner displays "Viewing as [Role] - Read Only" to prevent confusion.
3. **Given** the View-As session, **when** it starts and ends, **then** full audit trail is recorded: who viewed as whom, start timestamp, end timestamp, duration.
4. **Given** the View-As context, **when** Super Admin attempts any action, **then** the action is blocked (read-only mode) with message "Actions disabled in View-As mode."
5. **Given** security requirements, **when** implementing View-As, **then** Super Admin session remains isolated - no cross-contamination with target role's permissions.
6. **Given** the View-As feature, **when** accessed, **then** it does NOT grant Super Admin access to other role's actual routes (strict isolation preserved).

**Security Notes:**
- View-As renders target dashboard components in Super Admin's context
- Super Admin NEVER visits other role's actual routes
- Full audit logging required before this feature can be enabled
- Consider adding "reason for viewing" mandatory field

---

## Epic 7: Public Skills Marketplace & Search Security

**Epic Goal:** Create a secure, privacy-compliant bridge between skilled workers and potential employers through an anonymous registry.

**Prerequisites (from Epic 6 Retrospective 2026-03-04):**
- **prep-1:** Fix `text = uuid` production bug (CRITICAL — active errors in respondent.service.ts:325)
- **prep-2:** Deployment env var safety script (HIGH — prevents crash loops when Epic 7 adds new env vars for marketplace, CAPTCHA, etc.)
- **prep-3:** Replace placeholder catch-all pages with proper 404 (HIGH — public users must not see "coming soon")
- **prep-4:** Marketplace data model spike (HIGH — anonymous profile extraction, PII stripping, consent model, search strategy)
- **prep-5:** Public route security spike (HIGH — threat model for unauthenticated routes: rate limiting, bot protection, search injection, CAPTCHA strategy)

**Security Notes:**
- This is the first epic introducing **public unauthenticated routes** — fundamentally different security surface from all previous epics.
- Security hardening (SEC-1 through SEC-4) completed in Epic 6 as prerequisite: 0 critical/0 high CVEs, CSP configured, mass assignment hardened, CI audit gate active.
- Stories 7-2, 7-4, and 7-6 depend on the public route security spike (prep-5) to define rate limiting, CAPTCHA, and bot protection strategies.

**VPS Strategy:**
- Start on current DigitalOcean 2GB VPS (production healthy at 26% RAM utilization)
- Monitor actively via System Health dashboard (Story 6-2)
- Upgrade trigger: RAM consistently >75% or p95 latency >250ms → upgrade to larger droplet

**Architecture Note:** Story 7.2 references "Read-Only Replica" but current production runs a single database. The marketplace spike (prep-4) should evaluate whether pg_trgm full-text search on the primary database is sufficient at current scale, or if a replica is needed.

### Story 7.1: Marketplace Data Extraction Worker

As a System,
I want to automatically extract worker profiles from survey data,
So that the marketplace is populated without manual intervention.

**Acceptance Criteria:**

**Given** an ingested survey submission
**When** the `consent_marketplace` field is 'Yes'
**Then** the background worker should extract the Profession, LGA, and Experience Level
**And** create or update a profile in the `marketplace_profiles` table.

### Story 7.2: Public Marketplace Search Interface

As a Public Searcher,
I want to search for skilled workers using filters,
So that I can find talent in specific LGAs or trades.

**Acceptance Criteria:**

**Given** the marketplace search page
**When** I filter by trade (e.g., Plumber) and LGA
**Then** the system should query the Read-Only Replica using tsvector full-text search
**And** display a list of matching anonymous profiles with "Years of Experience".

### Story 7.3: Anonymous Profile & "Government Verified" Badges

As a Public Searcher,
I want to see which workers have been vetted by the state,
So that I can trust the quality of the talent.

**Acceptance Criteria:**

**Given** a list of search results
**When** a profile corresponds to a submission that is 'Final Approved'
**Then** the card should display a green "Government Verified" badge
**And** the worker's name and contact details must remain hidden until revealed.

### Story 7.4: Authenticated Contact Reveal & CAPTCHA

As a Public Searcher,
I want to see the contact details of a skilled worker,
So that I can hire them for a job.

**Acceptance Criteria:**

**Given** an anonymous worker profile card
**When** I click "Reveal Contact"
**Then** the system must require me to log in and pass a CAPTCHA
**And** if the worker gave `consent_enriched`, their Name and Phone Number should be displayed.

### Story 7.5: Profile Enrichment via Edit Token

As a Skilled Worker,
I want to improve my marketplace visibility by adding a bio and portfolio,
So that I am more attractive to potential employers.

**Acceptance Criteria:**

**Given** an existing marketplace profile
**When** I request an "Edit Token" via the website
**Then** the system should send a secure 32-character token to my phone via SMS
**And** clicking the link should allow me to edit my Bio (150 chars) and Portfolio URL without a password.

### Story 7.6: Contact View Logging & Rate Limiting

As a System,
I want to monitor and limit the harvesting of worker contact data,
So that I protect workers from spam and scrapers.

**Acceptance Criteria:**

**Given** an authenticated contact reveal action
**When** the user clicks "Reveal Contact"
**Then** the system must log the Viewer ID, Worker ID, and timestamp
**And** enforce a hard limit of 50 reveals per user per 24 hours.

---

## Epic 8: Survey Analytics & Public Insights

**Epic Goal:** Transform raw survey data into actionable statistical insights across all system roles, and publish anonymized labour market intelligence on the public-facing website for transparency and policy communication.

**Design Document:** `docs/survey-analytics-spec.md` — comprehensive specification covering 80 features across 6 roles + public page, 5 implementation phases, role-by-role feature matrix, and technical architecture.

**Prerequisites (from Epic 7 completion):**
- **prep-1:** Analytics data layer spike (HIGH — define aggregation strategy: real-time vs materialized views vs scheduled snapshots for each stat category)
- **prep-2:** Chart library selection & design system integration (MEDIUM — evaluate recharts/nivo/chart.js for bundle size, accessibility, SSR compatibility with existing Tailwind/shadcn stack)
- **prep-3:** Role-scoped API middleware pattern (HIGH — establish reusable scope chain pattern: system-wide → LGA-scoped → personal, consumed by all analytics endpoints)
- **prep-4:** Sample size & statistical validity guard (MEDIUM — implement minimum-N thresholds to prevent misleading statistics from small samples; define suppression rules for public-facing data)

**Architecture Notes:**
- All analytics endpoints share a single scope chain middleware: Super Admin/Gov Official see system-wide data; Supervisors see LGA-scoped data; Enumerators/Clerks see personal data only.
- Descriptive statistics computed from `submissions.raw_data` JSONB via SQL aggregation functions. Inferential statistics (chi-square, correlation) computed in application layer (no heavy stats library — use lightweight formulas).
- Public insights page shows only anonymized, aggregated data with minimum sample size thresholds to prevent de-identification.
- Materialized views recommended for expensive cross-tabulations; simple counts can use real-time queries.

**Sidebar Integration Plan:**
- Super Admin: Add "Survey Analytics" item (distinct from existing "Reveal Analytics")
- Government Official: Expand existing "Statistics" page with tabbed analytics sections
- Assessor: Add "Analytics" item (verification pipeline + quality flags)
- Supervisor: Add "Team Analytics" item (distinct from existing "Productivity" and "Team Progress")
- Enumerator: Add "My Stats" item
- Clerk: Replace existing placeholder "My Stats" with real analytics content
- Public site: Replace "Coming Soon" Insights dropdown with real pages (`/insights`, `/insights/skills`, `/insights/trends`)

### Story 8.1: Analytics Backend Foundation & Descriptive Statistics API

As a System,
I want a reusable analytics API layer with role-scoped access and core descriptive statistics,
So that all dashboard roles can query survey data within their authorized scope.

**Acceptance Criteria:**

**Given** an authenticated user with any dashboard role
**When** they request the analytics summary endpoint
**Then** the API should return descriptive statistics scoped to their role:
  - Super Admin / Government Official: system-wide aggregates
  - Supervisor: LGA-scoped aggregates (their assigned LGA only)
  - Enumerator / Clerk: personal submission aggregates only
**And** the response should include:
  - Submission counts (total, by status, by time period)
  - Demographic distributions (age bands, gender, LGA)
  - Employment statistics (employment status breakdown, sector distribution)
  - Skills frequency ranking (top N skills by count)
  - Experience level distribution
  - Consent rates (marketplace opt-in %, enriched consent %)

**Given** fewer than 5 submissions in any aggregation bucket
**When** the data is requested by any role
**Then** the bucket should be suppressed (returned as null) to prevent de-identification.

### Story 8.2: Super Admin & Government Official Survey Analytics Dashboard

As a Super Admin or Government Official,
I want a comprehensive survey analytics dashboard with charts and cross-tabulation,
So that I can understand state-wide labour market patterns and make data-driven policy decisions.

**Acceptance Criteria:**

**Given** a Super Admin navigating to "Survey Analytics" in the sidebar
**When** the page loads
**Then** it should display:
  - Summary stat cards (total submissions, completion rate, avg completion time, active enumerators)
  - Time-series chart (submissions per day/week/month with date range selector)
  - Demographic breakdown charts (age, gender, LGA distribution)
  - Employment & skills charts (top skills, employment status, sector distribution)
  - Cross-tabulation engine (select any two categorical variables for contingency table)
**And** all charts should support CSV export of underlying data.

**Given** a Government Official navigating to the existing "Statistics" page
**When** the page loads
**Then** it should display the same analytics as Super Admin in a tabbed layout
**And** PII fields (names, NIN, phone) must never appear in analytics views.

### Story 8.3: Field Team Analytics (Supervisor, Enumerator, Clerk)

As a Supervisor,
I want to see team-level analytics for my assigned LGA,
So that I can identify performance patterns, coverage gaps, and coach my enumerators effectively.

As an Enumerator or Clerk,
I want to see my personal submission statistics,
So that I can track my own productivity and data quality.

**Acceptance Criteria:**

**Given** a Supervisor navigating to "Team Analytics" in the sidebar
**When** the page loads
**Then** it should display LGA-scoped analytics:
  - Team submission volume (daily/weekly trend chart)
  - Per-enumerator comparison (bar chart: submissions per enumerator)
  - Coverage heatmap (submissions by ward/area within their LGA)
  - Data quality indicators (completion rates, fraud flag rates per enumerator)
  - Demographic summary for their LGA vs state-wide comparison

**Given** an Enumerator navigating to "My Stats" in the sidebar
**When** the page loads
**Then** it should display personal analytics:
  - Daily/weekly submission count trend
  - Average completion time per survey
  - Personal fraud flag rate with comparison to team average
  - Skills collected frequency (what skills they've recorded most)

**Given** a Clerk navigating to "My Stats" in the sidebar
**When** the page loads
**Then** it should display the same personal analytics as Enumerator
**And** include data entry speed metrics (avg time per submission).

### Story 8.4: Assessor Verification Analytics & Quality Dashboard

As an Assessor,
I want analytics on the verification pipeline and data quality patterns,
So that I can prioritize my audit queue and identify systematic quality issues.

**Acceptance Criteria:**

**Given** an Assessor navigating to "Analytics" in the sidebar
**When** the page loads
**Then** it should display:
  - Verification funnel (submissions → flagged → reviewed → approved/rejected)
  - Fraud detection breakdown (flags by type: cluster, speed-run, straight-lining)
  - Resolution rate trend (verified per day/week)
  - Top flagged enumerators table (ranked by fraud flag count)
  - Inter-rater reliability score (agreement rate between assessors on same submissions)
  - Data quality scorecard (completeness %, consistency checks passed %)

**Given** the assessor clicks on a fraud type in the breakdown chart
**When** the drill-down loads
**Then** it should show the specific submissions flagged for that fraud type
**And** link directly to the audit queue filtered by that flag.

### Story 8.5: Public Insights Page (Anonymized Labour Market Intelligence)

As a Public Visitor,
I want to see anonymized labour market statistics for Oyo State,
So that I can understand the local skills landscape without requiring login.

**Acceptance Criteria:**

**Given** a public visitor navigating to `/insights` from the navbar
**When** the page loads
**Then** it should display:
  - Hero stat cards (total registered workers, LGAs covered, skills tracked)
  - Skills distribution chart (top 15 skills by count, anonymized)
  - LGA coverage map or chart (submissions per LGA, no PII)
  - Experience level distribution (pie/donut chart)
  - Gender distribution (bar chart)
**And** all data must be aggregated with minimum sample size of 10 per bucket
**And** no PII (names, NIN, phone, individual records) shall be exposed.

**Given** a public visitor navigating to `/insights/skills`
**When** the page loads
**Then** it should display a detailed skills breakdown:
  - Searchable/filterable skills table (skill name, count, % of total)
  - Skills by LGA cross-tabulation (which LGAs have which skills)
  - Experience level by skill (how experienced workers are in each skill)

**Given** a public visitor navigating to `/insights/trends`
**When** the page loads
**Then** it should display temporal patterns:
  - Monthly registration trend (line chart)
  - Skills demand trend (new skills appearing over time)
  - LGA registration growth comparison

**Given** the existing "Insights" navbar dropdown shows "Coming Soon" placeholders
**When** Epic 8 is deployed
**Then** the placeholders should be replaced with links to the real `/insights`, `/insights/skills`, and `/insights/trends` pages.

### Story 8.6: Cross-Tabulation Engine, Skills Inventory & Gap Analysis

As a Super Admin, Government Official, or Supervisor,
I want a cross-tabulation engine for flexible two-dimensional data exploration and a full skills inventory with gap analysis,
So that I can discover hidden patterns in the workforce data and identify skills mismatches for policy planning.

**Progressive Activation**: All features built and deployed; each self-enables when its data threshold is met (cross-tab: 50 submissions, skills: 30 submissions, skills by LGA: 20 per LGA). Below threshold, components show progress toward activation.

**Acceptance Criteria:**

**Given** a Super Admin or Government Official navigates to the "Cross-Tab" tab on Survey Analytics
**When** ≥ 50 submissions exist
**Then** a cross-tabulation interface displays with row/column dimension selectors (8 dimensions), measure toggle (count / row% / col% / total%), and a heatmap-styled table
**And** cells with count < 5 show "< 5" (suppression)
**And** results are role-scoped (system-wide for SA/Official, LGA for Supervisor).

**Given** a Super Admin or Government Official navigates to the "Skills" tab
**When** the page loads
**Then** it displays full skills bar chart (all skills), ISCO-08 category grouping, skills concentration by LGA (top 3 per LGA), skills gap diverging bar (have vs want-to-learn), and Shannon diversity index per LGA
**And** each section independently shows a threshold guard if insufficient data.

### Story 8.7: Inferential Statistics, Progressive Activation & PDF Export

As a Super Admin or Government Official,
I want inferential statistical insights (chi-square, correlations, group comparisons, confidence intervals), exportable policy brief PDFs, and a progressive activation system,
So that I can make evidence-based policy decisions and share findings with offline stakeholders.

**Progressive Activation**: Capstone activation story. Builds all Phase 4 features (13 items) + registers Phase 5 features (5 items) as dormant hooks. An Activation Status Panel shows all features grouped by Active/Approaching/Dormant with progress bars.

**Acceptance Criteria:**

**Given** a Super Admin or Government Official navigates to the "Insights" tab
**When** ≥ 100 submissions exist
**Then** it displays: 6 chi-square association tests, 4 correlations, 5 group comparisons, 5 proportion confidence intervals — each with significance badges and plain-English interpretations.

**Given** a Super Admin or Government Official clicks "Export Policy Brief"
**When** the PDF generates
**Then** a branded ≤ 5-page PDF downloads with executive summary, key demographics, employment findings, inferential insights, and methodology note.

**Given** any analytics page
**When** the user views the Activation Status Panel
**Then** it shows all analytics features grouped as Active (green), Approaching (amber, > 50%), or Dormant (grey) with progress bars
**And** Phase 5 features (regression, anomaly detection) appear as Dormant with "Requires 500+ submissions" messaging.

**Given** the public `/insights` page and ≥ 200 submissions
**When** the page loads
**Then** a "Key Findings" section shows 2-3 anonymized plain-English inferential findings (no p-values or technical stats).

### Story 8.8: Geographic Visualization, Registry Integration & Analytics Spec Completion

As a Super Admin, Government Official, Supervisor, or public visitor,
I want LGA choropleth maps, a registry summary strip on all registry pages, inter-enumerator reliability analysis, and a complete activation roadmap for all 80 analytics features,
So that every feature in the analytics specification is either live, threshold-guarded, or registered as a dormant hook — zero gaps.

**Spec Completion**: This is the clean-up story that closes all remaining gaps. After 8.8, all 80 features from `docs/survey-analytics-spec.md §11` are accounted for across Stories 8.1-8.8.

**Acceptance Criteria:**

**Given** the Geographic tab on SA/Official Survey Analytics, Supervisor Team Analytics, or the public `/insights` page
**When** the page loads
**Then** an interactive Leaflet choropleth map of Oyo State's 33 LGAs displays, with color intensity proportional to registration count per LGA
**And** hovering shows LGA name + count, clicking filters to that LGA (authenticated pages only).

**Given** any of the 4 registry pages (Super Admin, Official, Assessor, Supervisor)
**When** the page loads
**Then** a collapsible 5-stat-card summary strip appears above the respondent table (Total, Employed%, Female%, AvgAge, BusinessOwners%)
**And** the strip updates live when registry filters change.

**Given** a Supervisor's Team Analytics → Data Quality tab
**When** ≥ 2 enumerators each have ≥ 20 submissions in the same LGA
**Then** an inter-enumerator reliability section shows answer distribution comparisons, Jensen-Shannon divergence scores, and amber/red flags for suspicious divergence.

**Given** the Activation Status Panel (Story 8.7)
**When** it renders
**Then** it includes all remaining Phase 5 dormant hooks (T7 seasonality, T8 campaign effectiveness, S11 response entropy, S12 GPS dispersion) alongside existing dormant hooks.

---

## Epic 9: Platform Polish, Profile, Domain Migration, Security Hardening, Field-Survey UX Readiness & Admin Audit Visibility

**Epic Goal:** Platform polish + domain migration + security hardening + field-survey UX readiness + admin audit visibility prior to transfer. _(Goal statement refreshed 2026-04-25 per SCP-2026-04-22 §2.1; original goal scoped only polish + domain migration.)_

**Source:** `_bmad-output/implementation-artifacts/polish-and-migration-plan-2026-03-14.md`; expanded scope per `_bmad-output/planning-artifacts/sprint-change-proposal-2026-04-22.md` §2.1.

**Context:** After 8 feature epics + 2 security hardening phases, the platform is functionally complete. This epic addresses polish, UX fixes, infrastructure readiness for a professional domain, **security hardening (incl. Tailscale operator-access overlay deployed 2026-04-23 + OS upgrade 2026-04-25)**, **field-survey UX readiness (5-step wizard + pending-NIN + magic-link)**, and **admin audit visibility prior to Transfer**. The expanded scope is driven by the Monday 2026-04-20 distributed SSH brute-force incident, ITF-SUPA secondary-data ingestion request, and field-friction findings on NIN capture.

### Story 9.1: Profile Page & Auth/Me Fix + Editable Profile

As a Staff User,
I want `/auth/me` to return my full profile and to edit my profile via a dedicated page,
So that my name displays correctly in the UI and I can update my details without admin help.

**Status:** Done (2026-04-05)

### Story 9.2: Domain Migration — oyotradeministry.com.ng to oyoskills.com

As the Super Admin,
I want to migrate the platform from `oyotradeministry.com.ng` to `oyoskills.com`,
So that the system has a clean, memorable domain independent of government bureaucracy.

**Status:** Deferred — blocked by domain purchase. Scope reduced by Story 9-5 (code-level domain centralization). Remaining scope: static files, documentation, VPS runbook. When domain purchased, merge with Story 9-4.

### Story 9.3: Trust Section & Footer Minor Polish

As a Public Visitor,
I want the Trust section to show the correct logo and the footer Insights column to link to real pages,
So that the website feels complete and professional.

**Status:** Done (2026-04-05)

### Story 9.4: Email Setup — Resend Domain Verification & Human-Facing Email

As the Super Admin,
I want transactional emails sent from the new domain with proper DNS authentication and reachable support addresses,
So that emails are delivered reliably and recipients see a professional sender.

**Status:** Deferred — blocked by domain purchase. Pure ops/configuration work (DNS, Resend, email provider). When domain purchased, merge with Story 9-2 remainder.

### Story 9.5: Fix Domain/Email Bugs & Centralize Domain Configuration

As the Super Admin,
I want all broken domain and email references fixed and all domain-related values centralized to environment variables,
So that users see correct support emails and verification links, and future domain changes are a config update, not a codebase sweep.

**Acceptance Criteria:**

**Given** the production codebase contains 3 wrong domain variants (`oslrs.oyostate.gov.ng`, `support@oslsr.gov.ng`, `support@oslsr.oyo.gov.ng`)
**When** this story is complete
**Then** all references use the correct live domain (`oyotradeministry.com.ng`) via centralized env vars, a single `site.config.ts` module serves frontend components, and `.env.example` documents the domain migration checklist.

**Status:** Done

### Story 9.6: Fix Supervisor Analytics + Registry Bugs

As a Supervisor,
I want the analytics and registry pages to load my LGA data correctly,
So that I can do my oversight work without seeing "Unable to load data" errors.

**Context:** Hotfix discovered post-9.1 deploy. Three bugs: missing LGA fallback in analytics-scope middleware, `ANY(${array})` Drizzle/pg type error (7 occurrences across 3 services), text=uuid join mismatch.

**Status:** Done (2026-04-05) — All 3 bugs fixed, zero regressions across the 4,191-test baseline.

### Story 9.7: Security Hotfix — Nginx Forward-Fix + Drizzle 0.30→0.45 Validation

As the Super Admin,
I want production nginx security headers brought back into the repo, the Drizzle 0.30→0.45 CVE patch validated at runtime, and CI deploys to wire the nginx config so that ad-hoc orphan commits cannot drift production again,
So that securityheaders.com grade A is preserved and traceability is restored.

**Context:** Two orphan commits (b352b41 nginx headers + 51cceea drizzle CVE patch) had been applied directly on the VPS but never reached `docker/nginx.conf` in the repo. This story brings prod nginx config into the repo, validates the Drizzle upgrade live, and wires the nginx layer into CI deploy.

**Status:** Done (2026-04-11) — All 11 ACs met via 3 merge commits (f3bd895 + f5ed89d + 8a91df8). Live-verified: 6 security headers, securityheaders.com grade A, TLS 1.2+ hardened, Socket.IO + hCaptcha + Google OAuth + `/api/v1/health` all green. 11 code review findings resolved across 7 commits. Bonus discovery (now in MEMORY.md Key Patterns): Helmet CSP on 404/error responses uses `default-src 'none'` fallback, NOT the user-configured directive set.

### Story 9.8: Content Security Policy — Nginx Mirror Rollout

As the Super Admin,
I want the production-vetted Helmet CSP mirrored to the nginx static-HTML layer with a Report-Only → Enforcing two-phase rollout and a parity test for drift protection,
So that static HTML pages enforce the same CSP as the API responses without breaking real user traffic.

**Context:** Forward-fix for Story 9-7 code review finding M4. Scope narrowed from initial multi-day nonce-wiring estimate once discovery confirmed Helmet CSP is already prod-enforcing and `/api/v1/csp-report` endpoint exists.

**Status:** In-progress — Tasks 1-4 + Task 8 complete. Report-Only CSP live on prod static HTML. Awaiting Awwal's 48-hour browser self-test (DevTools Console walk-through in Firefox + Chrome searching for `csp` violations). After clean → single-line rename to enforcing → done.

### Story 9.9: Infrastructure Security Hardening (Expanded Scope per SCP-2026-04-22)

As the Super Admin,
I want the production VPS hardened against the 2026-04-20 distributed SSH brute-force attack vector and the broader infrastructure surface tightened ahead of the Transfer phase,
So that the platform meets a B+ → A- security posture without requiring the `oyoskills.com` domain to land first.

**Context:** Original scope was Cloudflare-only. SCP-2026-04-22 expanded to 10 subtasks after the Mon 2026-04-20 11:04 UTC brute-force attack from 14+ distributed IPs (`2.57.122.x`, `144.31.234.20`, `92.118.39.x`, …) drove CPU to 100% and Memory to 82% with 19h detection-to-response. Cloudflare alone is **domain-gated** on `oyoskills.com` purchase; the SSH attack surface needed addressing first.

**Subtask state (as of 2026-04-25):**

| # | Subtask | Status |
|---|---|---|
| 1 | Tailscale VPN + SSH lockdown | ✅ **Done 2026-04-23.** Tailscale overlay deployed (laptop `100.113.78.101` + VPS `100.93.100.28`). sshd hardened across main file + both drop-ins (`PasswordAuthentication no`, `PermitRootLogin prohibit-password`, `PubkeyAuthentication yes`). fail2ban installed + sshd jail active. Emergency recovery runbook authored at `docs/emergency-recovery-runbook.md`. **Note (2026-04-25):** DO Cloud Firewall SSH rule was widened from `100.64.0.0/10`-only to `0.0.0.0/0 + 100.64.0.0/10` after discovering DO Web Console uses SSH from DO infrastructure IPs (not WebSockets — earlier theory wrong); **sshd hardening is now the primary control**, firewall is defence-in-depth. Documented in ADR-020 Consequences + runbook §1.1 + §2.2. Verified post-config: public-IP SSH with password = refused; key-disabled SSH = refused; Tailscale SSH = no-prompt success. |
| 2 | OS patching + scheduled monthly reboots | ✅ **Done 2026-04-25.** Ubuntu 24.04.3 → 24.04.4; kernel 6.8.0-90 → 6.8.0-110; 49 packages upgraded including systemd / apparmor / snapd / cloud-init / nodejs / openssh. Pre-flight verified: tailscaled enabled-on-boot, PM2 startup hook (pm2-root.service via systemd) + pm2 save executed, Docker `restart: unless-stopped`. Reboot 08:54:37 UTC. Post-reboot all services up; HTTPS health 200 with full sec2-3 CSP. Two snapshots: `pre-os-upgrade-2026-04-25` + `clean-os-update-2026-04-25`. **PM2 ↺ counter reset 916+ → 0 establishes baseline for Story 9-10 investigation observability window.** |
| 3 | Public port audit (`ss -tlnp`); close/restrict Portainer | ⏳ Backlog |
| 4 | App-layer rate-limit audit on `/auth/*` endpoints | ⏳ Backlog |
| 5 | Backup client-side encryption (AES-256 pre-S3) + quarterly restore drill | ⏳ Backlog |
| 6 | Incident-response tier for CRITICAL alerts (SMS/WhatsApp/paged) | ⏳ Backlog |
| 7 | Logrotate for PM2 logs + journalctl retention | ⏳ Backlog |
| 8 | Second super-admin account (break-glass) | ⏳ Backlog |
| 9 | SOC-style activity baseline / SSH log differentiation | ⏳ Backlog |
| 10 | Cloudflare WAF/CDN + rate-limiting | ⏳ **Domain-gated** — proceed when `oyoskills.com` lands |

**Field-Readiness gate impact:** Subtask #1 (done) and Subtask #6 alerting tier are on the Field Readiness Certificate (FRC §5.3.1 items 1 + 5). Other subtasks are Tier B — can ship during the first weeks of field operation without blocking start.

**Status:** In-progress — 2 subtasks done (Tailscale, OS patching), 8 remaining. Story remains open until subtasks 3-9 are delivered (Cloudflare deferred to domain availability).

### Story 9.10: PM2 Restart-Loop Investigation & Stabilisation

As the Super Admin,
I want the PM2 restart counter that hit 916+ over 89 days uptime investigated and root-caused,
So that the API process stops thrashing and the alerting noise stops drowning out real incidents.

**Context:** SCP-2026-04-22 surfaced the long-standing PM2 ↺ count anomaly. Suspected ioredis reconnect churn from sec2-2 factory gaps. **PM2 ↺ counter RESET to 0 at 2026-04-25 08:54 UTC reboot — observation window now open**; Dev Notes should capture the 7-day post-reboot trajectory as evidence.

**Acceptance Criteria (summary; full ACs from create-story):**
- AC#1-3: Investigation, root-cause hypothesis, targeted fix, restart count falls to near-zero over 7-day observation window post-reboot
- **AC#4 (Akintola-risk Move 2):** EXPLAIN ANALYZE audit of top 10 most-invoked API endpoints against the 500K-respondent + 1M-submission + 100K-audit-log seeded dataset from Story 11-1 Task 2.5. Any plan with Seq Scan on a table >100K rows OR cost >10,000 is flagged; either fix in this story's migration OR route as documented hand-off to the owning epic/story. Output: `apps/api/src/db/explain-reports/9-10-top-endpoints.md` committed with the story.

**Dependencies:** Independent / parallelisable with Story 9-9. AC#4 prefers Story 11-1 to land first (seeder reuse); falls back to docker-compose scratch DB if 9-10 starts earlier.

**Status:** Backlog (per SCP-2026-04-22).

### Story 9.11: Admin Audit Log Viewer

As a Super Admin,
I want a UI to investigate the existing write-side audit log by principal (user OR consumer), action, target resource, and time range,
So that I can answer compliance questions without opening psql, and so the Epic 10 PII-scope partner-API can launch with credible NDPA oversight.

**Context:** SCP-2026-04-22. Realises FR26. Surfaces the audit infrastructure already built in Epic 6 (write-side) via a super-admin read-side UI. **Hard prerequisite for Epic 10 PII-scope partner-API release** (per ADR-019 + Decision 5.4 — partner-API access to PII without a working audit-read surface is an NDPA hole).

**Acceptance Criteria (summary):**
- List + filter + paginate audit logs by principal-type (User / Consumer / System), actor (autocomplete across users + consumers), action (multi-select), target resource, date range
- URL-routed filter state for shareable investigation links; CSV export with applied filters baked into the filename
- Sidebar nav item **Audit Log** added between System Health and Settings (per Sally's UX A.3 spec) — super-admin-only via existing role-isolated sidebar pattern
- **AC (Akintola-risk Move 3):** Audit-viewer-at-1M-rows verification using the Story 11-1 seeder; list query p95 < 500ms with any single filter; < 800ms with two combined; pagination constant-time at page 1 / 100 / 1000
- **Composite indexes added in this story's migration:** `audit_logs(actor_id, created_at)`, `audit_logs(target_resource, target_id, created_at)`, `audit_logs(action, created_at)`. EXPLAIN (ANALYZE, BUFFERS) output captured at `apps/api/src/db/explain-reports/9-11-audit-viewer.md`
- Audit-log-export action is itself audit-logged with `action: 'audit_log.exported'`, `meta: { filter_signature, row_count }`

**Dependencies:** Epic 6 audit write infrastructure (done); Story 11-1 seed infrastructure (for AC scale verification).
**Unblocks:** Epic 10-1 DPIA credibility gate.

**UX:** Sally's Journey 6 (Super-Admin Audit Log Investigation) + `AuditLogFilter` component (#15).

**Status:** Backlog (per SCP-2026-04-22).

### Story 9.12: Public Wizard + Pending-NIN + NinHelpHint + Magic-Link Email

As a Public Respondent,
I want to register through a single 5-step wizard with the option to defer NIN capture if I don't have it on me right now,
So that I can complete registration in one continuous flow on my phone, and pick up where I left off via emailed magic link.

**Context:** SCP-2026-04-22. Realises FR27 + FR28. Collapses the existing 4-hop public registration (register → verify email → login → fill form) into a single 5-step wizard. Magic-link email is the primary auth channel; SMS OTP infrastructure is built but feature-flagged off (budget-gated until Nigerian SMS provider lands).

**Scope:**
- 5-step WizardLayout: Basic Info → Contact + LGA → Consent → Questionnaire → NIN + Optional Login Setup
- `NinHelpHint` shared component (3 variants: inline / tooltip / banner) surfacing `*346#` USSD retrieval reminder
- Pending-NIN explicit toggle ("I don't have my NIN with me right now") — sets `respondent.status = 'pending_nin_capture'`
- Magic-link email service (per Architecture Decision 2.5) — primary auth channel; 15-min TTL for login / 72-hour TTL for `wizard_resume` and `pending_nin_complete` purposes; SHA-256 hashed at rest; single-use enforcement
- SMS OTP infrastructure built (route + provider adapter interface + audit wiring + rate limit) but feature-flagged OFF via `settings.auth.sms_otp_enabled`
- Reminder cadence (FR28): T+2d / T+7d / T+14d emails to `pending_nin_capture` respondents; T+30d transition to `nin_unavailable` with supervisor-review queue entry
- Trust-badges row at the foot of every wizard step (3 badges: Secure Registration, Official Oyo State Platform, Free to Join)
- **Bundled task: Staff activation wizard step-indicator polish** (visible step indicator retro-fitted on the existing staff activation flow; low-risk visual consistency)
- Migration note: existing `public_users` accounts continue to work via `/auth/public/login`; only new registrations flow through the wizard. Google OAuth route retired (404). Hybrid Magic-Link/OTP email template removed.

**Dependencies:** Story 11-1 schema foundation (`status` enum, partial UNIQUE on `nin`).
**Unblocks:** Field-survey UX readiness (Field Readiness Certificate item #3).

**UX:** Sally's Journey 2 rewrite + Journey 8 (Return-to-Complete via Magic Link) + Form Patterns (NinHelpHint, Email-Typo Detection, Pending-NIN Toggle) + Visible Step Indicator pattern.

**Status:** Backlog (per SCP-2026-04-22).

---

### Prep Task: prep-input-sanitisation-layer

As a Developer,
I want centralised input-normalisation utilities (email, Nigerian phone E.164, full-name casing, date parsing, trade vocabulary) applied at every input boundary (submission, import, registration, staff provisioning),
So that the field survey does not surface ITF-SUPA-style data hygiene problems (email typos like `gmail.vom`, inconsistent phone formats, name-casing drift, date-format ambiguity).

**Context:** SCP-2026-04-22. Standalone prep task — same shape as previous prep tasks (`prep-typescript-strict-mode`, `prep-test-baseline-stabilisation`). NOT part of any epic; consumed by every input-boundary service.

**Scope:**
- `apps/api/src/lib/normalise/{email,phone,name,date,trade}.ts` modules with shared schemas
- Wired into: submission ingest pipeline, Story 11-2 import service, Story 9-12 public wizard, staff provisioning bulk-CSV import
- **Schema strengthening:** `respondents.date_of_birth TEXT → DATE` migration; phone CHECK constraint enforcing E.164; back-fill script for existing rows with audit-log entries for any normalisation-induced changes
- Test coverage: unit tests per normaliser + integration tests at every consuming boundary
- DO NOT include trade-vocabulary auto-correction in this task — that requires UX work on suggestion display (out of scope)

**Slot:** Before field survey (FRC item #4). Independent / parallelisable with all Epic 9-11 stories.

**Status:** Backlog (per SCP-2026-04-22).

---

## Epic 10: API Governance & Third-Party Data Sharing

**Epic Goal:** Establish an authenticated, scoped, rate-limited, audit-logged partner-API substrate so that third-party MDA consumers (ITF-SUPA, NBS, NIMC, future integrations) can access the registry under formal agreement without compromising NDPA compliance or operator visibility.

**Source:** SCP-2026-04-22 §2.1 + §4.1 Story 10-1; design brief at `docs/epic-10-1-consumer-auth-design.md`.

**Business Outcome:** OSLSR transitions from a single-tenant internal tool to a **government-grade data-sharing platform** that the Ministry can operate as a public asset post-Transfer. Each MDA consumer is a named, auditable principal; PII access is gated on signed Data-Sharing Agreements and two-person Ministry-ICT approval; rate limits and quotas are enforced per consumer per scope.

**Success Criteria:**
- 5 initial scopes deployed: `aggregated_stats:read`, `marketplace:read_public`, `registry:verify_nin`, `submissions:read_aggregated`, `submissions:read_pii`
- Token storage is SHA-256-hashed-only (plaintext shown exactly once at provisioning)
- 180-day rotation cadence with 7-day overlap window (zero-downtime rotation by consumer)
- LGA-scoping + IP allowlist + per-scope `expires_at` enforced at middleware AND service layer (defence in depth)
- DSA precondition for `submissions:read_pii` enforced at UI + service layer (no provisioning bypass)
- Per-consumer per-scope Redis rate-limit + daily/monthly quotas
- Every partner request audit-logged with `consumer_id` principal (per Architecture Decision 5.4 principal-exclusive CHECK)
- Public Developer Portal at `/developers` with OpenAPI/Swagger UI + request-access form
- Consumer Audit Dashboard renders per-consumer activity (extends Story 9-11 viewer foundation)

**Dependencies:**
- Story 9-11 Admin Audit Log Viewer (HARD prerequisite — no PII-scope release without working audit-read surface)
- Architecture Decisions 2.4 / 2.8 / 3.4, ADR-019
- PRD V8.2 FR24 + NFR10

**Scope Boundaries (out of scope for Epic 10):**
- OAuth2 client-credentials grant — explicitly deferred (door open if a future partner mandates; would trigger a new SCP + ADR)
- mTLS — explicitly rejected for MVP (PKI overhead unsustainable at current team size; would require new ADR if revived)
- Self-service consumer onboarding (consumers do not provision themselves; Super Admin provisions per Journey 7)
- Per-scope billing or metering (counts captured for audit; commercial billing is post-Transfer Ministry concern)

**Field-Survey Relationship:** Epic 10 is **post-field**. Does NOT block field-survey start. Field-readiness gates only on Story 10-5 (legal template) being **drafted** — not on Epic 10 implementation completion. Implementation can ship on a stage-by-stage basis after the Field Readiness Certificate is signed.

**Cross-References:** PRD V8.2 FR24 + NFR10 / Architecture Decisions 2.4, 2.8, 3.4, 5.4 + ADR-019 / UX Journey 7 (API Consumer Provisioning) + Components #16 `ApiConsumerScopeEditor` + #17 `LawfulBasisSelector`.

### Story 10.1: Consumer Authentication Layer

As a Super Admin,
I want to provision named partner-API consumers with scoped API keys (LGA-scoped, IP-allowlisted, time-bounded per scope, 180-day rotation),
So that I can give third-party MDAs (ITF-SUPA, NBS, NIMC) controlled access to the registry under formal agreement.

**Scope:**
- New tables: `api_consumers`, `api_keys`, `api_key_scopes` (per Architecture Decision 1.5)
- Audit_logs extension: nullable `consumer_id` FK + principal-exclusive CHECK constraint
- `apiKeyAuth` middleware on `/api/v1/partner/*` (per Decision 2.4): bearer extraction, SHA-256 lookup, timing-safe comparison, revocation/expiry checks, IP allowlist check, ambiguous-auth rejection (`AMBIGUOUS_AUTH` 400)
- `requireScope(scope)` per-route helper: scope check + per-scope expiry + LGA filter context attachment
- 5 initial scopes: `aggregated_stats:read`, `marketplace:read_public`, `registry:verify_nin`, `submissions:read_aggregated`, `submissions:read_pii`
- Token provisioning service: 256-bit random token, SHA-256 hash at rest, plaintext returned once and never persisted
- 180-day rotation with 7-day overlap window (`api_keys.supersedes_key_id` linkage)
- Emergency rotation flow (immediate revoke, audit-logged with `meta.reason = 'emergency_rotation'`)
- Error taxonomy: `API_KEY_MISSING`/`INVALID`/`REVOKED`/`EXPIRED`/`SCOPE_INSUFFICIENT`/`SCOPE_EXPIRED`/`IP_NOT_ALLOWED`/`AMBIGUOUS_AUTH`

**Dependencies:** Story 9-11 (audit viewer foundation — partner activity must be inspectable before PII scope can be released).

**Cross-References:** Architecture ADR-019 + Decision 2.4. Design brief at `docs/epic-10-1-consumer-auth-design.md`.

**Status:** Backlog (per SCP-2026-04-22).

### Story 10.2: Per-Consumer Rate Limiting & Quotas

As an Operator,
I want partner-API requests rate-limited per consumer per scope with daily and monthly quotas,
So that a runaway consumer integration cannot exhaust shared resources or hide its activity in noise.

**Scope:**
- Redis-backed per-minute bucket: key `ratelimit:consumer:{consumer_id}:{scope}:{YYYY-MM-DDTHH:MM}`, atomic `INCR + EXPIRE 70` (overhang for clock drift)
- Daily and monthly quota counters: parallel keys with longer TTL
- Middleware order: `apiKeyAuth` → `requireScope` → per-minute → daily → monthly → controller
- 429 response includes `Retry-After`, `X-Quota-Daily-Used`, `X-Quota-Daily-Limit`, `X-Exhausted-Scope` headers
- Per-scope default limits per Architecture Decision 3.4 table; admin-adjustable per consumer in Story 10-3
- Surfaces partner-API rate-limit metrics in Pino events (`api_partner_request` with `rate_limit_outcome`) for observability per Architecture Decision 5.5

**Dependencies:** Story 10-1 (`req.consumer` + `req.apiKey` populated by `apiKeyAuth`).

**Status:** Backlog (per SCP-2026-04-22).

### Story 10.3: Consumer Admin UI

As a Super Admin,
I want a 3-tab UI to create, edit, and inspect API consumers with one row per scope showing enabled/expiry/LGA-scope state,
So that I can provision partners in <5 minutes without psql, and so I can audit any consumer's current access posture at a glance.

**Scope:**
- 3-tab consumer detail / create wizard: **Identity** (name, organisation type, contact, lawful basis, optional DSA upload) → **Access** (key name, rotation cadence, IP allowlist) → **Permissions** (per-scope `ApiConsumerScopeEditor` rows)
- Sidebar item **API Consumers** (super-admin-only) — placement before **Verification Queue** in the existing role-isolated sidebar
- Dry-run summary modal before any database write — shows every per-scope grant + rotation implication; admin must explicitly confirm
- Token-displayed-once screen with copy-to-clipboard + browser-back warning (per Sally's Journey 7)
- Per-consumer activity drawer (last 7 days quota usage sparkline + per-hour breakdown for today)
- DSA precondition enforced in UI (per `ApiConsumerScopeEditor` component): `submissions:read_pii` row disabled when `consumer.dsa_document_url IS NULL`
- Lawful basis required at consumer level (per `LawfulBasisSelector` component)

**Dependencies:** Story 10-1 (data model); Sally's components #16 (`ApiConsumerScopeEditor`) + #17 (`LawfulBasisSelector`).

**UX:** Sally's Journey 7 (API Consumer Provisioning).

**Status:** Backlog (per SCP-2026-04-22).

### Story 10.4: Developer Portal

As a Partner Developer,
I want a public `/developers` page with OpenAPI/Swagger documentation, scope reference, and a request-access form,
So that I can self-serve API integration without back-and-forth emails with the Ministry.

**Scope:**
- Public route `/developers` (unauthenticated; PublicLayout per ADR-016)
- OpenAPI/Swagger UI rendering the full `/api/v1/partner/*` namespace per Architecture Decision 3.4
- Scope reference table with descriptions, default rate limits, DSA precondition flags
- "Request Access" form: organisation name, contact, intended use case, requested scopes, lawful basis (uses `LawfulBasisSelector`); submission creates an internal Super-Admin task (no auto-provisioning)
- Quota visibility for authenticated consumers viewing their own state (per Sally's Pattern 2 daily quota progress bar)

**Dependencies:** Story 10-1 (OpenAPI spec generation), Story 10-2 (quota state), Story 10-3 (admin onboarding workflow).

**Status:** Backlog (per SCP-2026-04-22).

### Story 10.5: Data-Sharing Agreement Template + Consumer Onboarding SOP

As Iris and Gabe,
I want a standard Data-Sharing Agreement template and a Consumer Onboarding SOP that the Ministry can hand to incoming MDA partners,
So that the legal precondition for `submissions:read_pii` scope provisioning is satisfiable in days, not months, and so onboarding is repeatable post-Transfer.

**Scope:**
- DSA template (legal artefact — Iris + Gabe lead; not engineering work):
  - NDPA Article 25 alignment, processing scope, retention, sub-processing, breach notification, audit rights, termination
  - Schedule 1 enumerates: consumer organisation, scopes granted, LGA scope, IP allowlist, key rotation cadence, DPIA reference
  - Signed PDF stored in DigitalOcean Spaces; reference recorded in `api_consumers.dsa_document_url` per Story 10-1
- Consumer Onboarding SOP — operational runbook for Super Admin:
  - Step-by-step from "request received via /developers form" through to "consumer in production with key in hand"
  - Two-person Ministry-ICT approval workflow for `submissions:read_pii` scope
  - Token delivery channel (signed/encrypted email or in-person handoff per DSA delivery clause)
  - Quarterly DSA review cadence + termination procedure
- Cross-link to Baseline Report Appendix H DPIA (which captures the processing-activity per consumer)

**Dependencies:** None (parallel track; can ship before Story 10-3 admin UI).

**FRC Impact:** **Story 10-5 drafted** is on the Field Readiness Certificate adjacent gate — not strictly blocking field survey start, but required before any production `submissions:read_pii` scope can be provisioned.

**Status:** Backlog (per SCP-2026-04-22). Owners: Iris (DPIA / NDPA), Gabe (legal review).

### Story 10.6: Consumer Audit Dashboard

As a Super Admin,
I want a per-consumer view of audit-log activity filtered to that consumer's `consumer_id`,
So that I can investigate a specific partner's behaviour over time without filtering the whole audit log manually each time.

**Scope:**
- Scoped view over `audit_logs` filtered by `consumer_id` — built on the same primitives as Story 9-11 (which provides the underlying viewer + `AuditLogFilter` component)
- Per-consumer dashboard renders: request-volume time-series, scope-usage breakdown, rate-limit-rejection rate, last-used timestamp per key, top targeted resources, anomaly markers (e.g. >2σ from rolling 7d mean)
- Linked from Story 10-3 Consumer Detail page as a tab/affordance

**Dependencies:** Story 9-11 (audit viewer foundation), Story 10-1 (`consumer_id` principal model), Story 10-2 (rate-limit metrics in Pino events).

**Status:** Backlog (per SCP-2026-04-22).

---

## Epic 11: Multi-Source Registry & Secondary Data Ingestion

**Epic Goal:** Enable ingestion of secondary data sources (ITF-SUPA Oyo public artisan list, future MDA exports) into the **canonical respondent registry** with source-labelled provenance, batch-level lawful-basis documentation, and a 14-day rollback window — without creating a parallel registry.

**Source:** SCP-2026-04-22 §2.1 + §4.1; reference implementation against ITF-SUPA Oyo public-artisan PDF (759KB, ~4,200 records) at `C:\Users\DELL\Downloads\Oyo_shortlisted_artisans.pdf`.

**Business Outcome:** OSLSR becomes the **single source of truth** for skilled-worker registration in Oyo State, regardless of whether records originated from field collection, public self-registration, clerk paper-form digitization, or secondary import. Source provenance is honestly surfaced via `SourceBadge` so consumers (admins, supervisors, marketplace searchers, partner APIs) never confuse imported low-trust records for field-verified ones.

**Success Criteria:**
- `respondents.nin` becomes nullable; FR21 dedupe preserved via partial UNIQUE index `WHERE nin IS NOT NULL`
- New `respondents.status` enum: `active | pending_nin_capture | nin_unavailable | imported_unverified` (CHECK constraint at DB layer + Drizzle enum at app layer)
- Extended `respondents.source` enum: existing `enumerator | public | clerk` + new `imported_itf_supa | imported_other`
- New table `import_batches` with file-hash UNIQUE, parser stats, lawful-basis capture, rollback status
- Import service supports PDF (tabular extractor) / CSV / XLSX with dry-run preview → confirm → 14-day rollback window
- Admin Import UI surfaces parse stats, per-row decision preview, column-mapping editor, lawful-basis capture (mandatory before Confirm enables)
- Source badges + filter chips wired into Registry Table, Respondent Detail, Marketplace cards (when consent permits), Assessor Queue
- Composite indexes added in Story 11-1 migration cover Akintola-risk hot paths (verified at projected scale via AC#11)

**Dependencies:**
- Architecture Decision 1.5 (schema), ADR-018 (decision rationale)
- PRD V8.2 FR21 (scoped) + FR25
- Sally's `SourceBadge`, `ImportDryRunPreview`, `LawfulBasisSelector` components
- Story 9-12 depends on Story 11-1 (status enum) — Epic 9 critical path runs through Epic 11's foundation story

**Scope Boundaries (out of scope for Epic 11):**
- Auto-merge of imported records into existing field-verified respondents — explicitly **NOT** done (`imported_unverified` rows coexist with field-verified rows; merge requires manual action by Super Admin, out of MVP)
- Real-time ingestion (e.g. webhook from ITF-SUPA) — explicitly batch-only for MVP; future enhancement
- Trade-vocabulary normalisation for imported records — covered by `prep-input-sanitisation-layer` prep task
- Cross-MDA conflict resolution beyond email/phone auto-skip — Super Admin handles edge cases manually via supervisor review queue

**Field-Survey Relationship:**
- **Story 11-1 schema is a HARD prerequisite for Story 9-12 Public Wizard** (the `pending_nin_capture` status enum lives in 11-1's migration)
- **Story 11-1 is on the Field Readiness Certificate** (FRC §5.3.1 item 2)
- Stories 11-2, 11-3, 11-4 are post-field — can ship during the first weeks of field operation

**Cross-References:** PRD V8.2 FR21 (scoped) + FR25 / Architecture Decision 1.5 + ADR-018 / UX Journey 5 (Super-Admin Data Import) + Form Patterns (NinHelpHint, Pending-NIN Toggle) + Components #13 `SourceBadge` + #14 `ImportDryRunPreview` + #17 `LawfulBasisSelector`.

### Story 11.1: Multi-Source Registry Schema Foundation

As a Platform Operator,
I want the `respondents` table to accept records from multiple sources with nullable NIN, explicit status tracking, and a dedicated `import_batches` table for provenance,
So that the system can (a) onboard respondents mid-field without blocking on a forgotten NIN, (b) ingest secondary data without creating a parallel canonical registry, (c) preserve FR21's dedupe guarantee for records that do carry NIN, and (d) expose a unified registry with per-record source labelling to downstream UI and analytics.

**Scope:** Schema migration only — no business logic, no UI. 11 ACs (full text in working draft):
- AC#1 NIN nullable + partial UNIQUE index `WHERE nin IS NOT NULL`
- AC#2 `status` column with CHECK + Drizzle enum
- AC#3 `source` enum extended
- AC#4 Provenance columns + indexes
- AC#5 `import_batches` table created
- AC#6 Drizzle types regenerated and exported
- AC#7 `SubmissionProcessingService.findOrCreateRespondent` — NIN dedupe wrapped in NIN-presence conditional (FR21 preserved when NIN present; bypassed when absent)
- AC#8 Existing 4,191-test baseline passes unchanged
- AC#9 Minimum 7 new tests (4 service-layer + 3 DB-constraint)
- AC#10 Sprint status updated
- **AC#11 Akintola-risk Move 1:** Composite-index audit at projected scale (500K respondents + 1M submissions + 100K audit_logs + 100K marketplace_profiles seeded; EXPLAIN (ANALYZE, BUFFERS) on 10 hot queries; thresholds: no Seq Scan on >100K tables, cost <10,000, p95 <500ms; composite indexes added in this migration: `respondents(source, created_at)`, `(lga_id, source)`, `(status, source)`, `(status, created_at)`; output captured to `apps/api/src/db/explain-reports/11-1-projected-scale.md`)

**Working draft:** `_bmad-output/implementation-artifacts/11-1-multi-source-registry-schema-foundation.md` — Bob to regenerate via `create-story` preserving all 11 ACs and the seed-projected-scale infrastructure (used by Stories 9-10 and 9-11 for their own Akintola-risk verifications).

**Dependencies:** Story 9-7 (baseline security posture) — done.
**Unblocks:** Stories 9-12, 11-2, 11-3, 11-4.

**Status:** Backlog (working draft on file; awaits create-story regeneration).

### Story 11.2: Import Service + PDF/CSV/XLSX Parsers + Endpoints

As a Super Admin,
I want a backend import service that parses PDF/CSV/XLSX files, runs a dry-run preview, commits inside a transaction, and supports 14-day rollback,
So that secondary-data ingestion is auditable, reversible, and cannot accidentally overwrite field-verified records.

**Scope:**
- `ImportService` with three parsers: `pdf_tabular` (reference impl: ITF-SUPA Oyo PDF), `csv`, `xlsx`
- Endpoints (per Architecture Decision §"Data Routing & Ownership Matrix" Rule 8):
  - `POST /api/v1/admin/imports/dry-run` (multipart upload; SHA-256 hash check; per-row decision preview; lawful-basis requirement returned)
  - `POST /api/v1/admin/imports/confirm` (transactional; lawful-basis required)
  - `POST /api/v1/admin/imports/:id/rollback` (14-day window; soft-delete via status flip, not row delete; audit-logged with rationale)
  - `GET /api/v1/admin/imports`, `GET /api/v1/admin/imports/:id` (batch history)
- ITF-SUPA source config as first reference implementation (column mapping, parser tuning)
- **Auto-skip policy on email/phone match** (per Awwal's decision, SCP §4.1): match against existing respondent → skip with logged reason (not insert duplicate)
- **Fraud + marketplace pipelines status-gated:** `imported_unverified` rows are excluded from NIN-keyed fraud dedupe and marketplace enrichment requiring NIN (per FR28 + Story 11-1 AC#7 service-layer enforcement)
- Failure report downloadable as CSV (rows that failed to parse with row-level error reasons)
- All actions audit-logged with super-admin `actor_id` principal

**Dependencies:** Story 11-1 (schema foundation including `import_batches` table).

**Status:** Backlog (per SCP-2026-04-22).

### Story 11.3: Admin Import UI

As a Super Admin,
I want a 3-step wizard to upload a file, review its parsed dry-run preview with column mapping and lawful-basis capture, and commit the import,
So that I can ingest a 4K-row PDF in under 3 minutes without ever touching psql.

**Scope:**
- Sidebar item **Import Data** (super-admin-only) — placement after **Submissions** in the data-management cluster (per Sally's UX A.3 Navigation Patterns spec)
- 3-step WizardLayout (uses Sally's Visible Step Indicator pattern):
  - **Step 1 — Upload:** drag-drop / file picker; SHA-256 client-side hash; source dropdown (`imported_itf_supa | imported_other`); duplicate-file detection
  - **Step 2 — Review:** uses `ImportDryRunPreview` component (#14) — stats summary card + scrollable preview table with column-mapping editor + `LawfulBasisSelector`
  - **Step 3 — Confirm:** final summary + commit; success toast with batch ID + link to detail page
- Batch History view at `/dashboard/admin/imports` — list of all batches with rollback affordance (visible only within 14-day window)
- Rollback flow per Sally's Journey 5: confirmation modal with required reason (min 20 chars); soft-delete via status flip
- Error paths handled per Sally's Journey 5 error matrix (duplicate file, parse failure, missing lawful basis, transactional commit failure, permission failure, expired rollback window)

**Dependencies:** Story 11-2 (import endpoints), Sally's components #14 (`ImportDryRunPreview`) + #17 (`LawfulBasisSelector`) + Visible Step Indicator pattern.

**UX:** Sally's Journey 5 (Super-Admin Data Import).

**Status:** Backlog (per SCP-2026-04-22).

### Story 11.4: Source Badges + Filter Chips

As an Admin / Supervisor / Assessor / Marketplace Searcher,
I want to see at a glance which records came from which source (field-verified vs imported vs self-registered) and to filter the registry by source,
So that I can apply appropriate trust-tier thinking to each record without misreading low-trust imports as field-verified.

**Scope:**
- `SourceBadge` component (#13) wired into:
  - **Registry Table** (inline variant, per row)
  - **Respondent Detail** page (detail variant, beside the name)
  - **Marketplace Cards** (corner variant, when respondent has marketplace consent)
  - **Assessor Queue** (inline variant, per row)
- **Source filter chip** on Registry page — multi-select chips with the same colour palette as the badges; URL-routed for shareable filter state
- Imported variants additionally show "⚠ Unverified" sub-badge when `respondent.status = 'imported_unverified'`
- Trust-tier semantics documented in tooltip on hover/focus: `enumerator > clerk > public > imported_cross_referenced > imported_unverified`

**Dependencies:** Story 11-1 (extended source enum + status column), Sally's component #13 (`SourceBadge`).

**Status:** Backlog (per SCP-2026-04-22).
