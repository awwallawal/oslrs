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

## Overview

This document provides the complete epic and story breakdown for Oyo State Labour & Skills Registry (OSLSR), decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: Consent Management - The system shall present a clear consent screen (Two-stage marketplace consent workflow) allowing respondents to opt-in for an anonymous marketplace profile. Paper forms must have pre-printed serial numbers.
FR2: Two-Stage Consent Workflow - The system shall implement `consent_marketplace` (Stage 1: Anonymous) and `consent_enriched` (Stage 2: Name/Phone) fields within the ODK survey form.
FR3: Public Access & Authentication - The system shall provide a public-facing Homepage with distinct authentication endpoints for "Staff Login" and "Public Register".
FR4: Public User Survey - The system shall allow registered Public Users to securely log in and fill out survey questionnaires via Enketo.
FR5: NIN Verification - The system shall require public users to provide their National Identity Number (NIN) during registration (Global Uniqueness enforced).
FR6: Staff Provisioning - The system shall allow Super Admins to invite/provision new staff via Manual Single-User Creation or Bulk CSV Import (with LGA locking).
FR7: Staff Login - The system shall allow Enumerators and staff to securely log in to the Custom App using unique credentials.
FR8: Enumerator Dashboard - The system shall provide Enumerators with a personalized dashboard displaying daily/weekly progress.
FR9: Offline Collection (PWA) - The system shall enable offline data collection using embedded Enketo forms (browser-based PWA) and sync automatically via ODK Central.
FR10: Pause/Resume - The system shall support pausing and resuming incomplete survey sessions (native ODK feature).
FR11: In-App Communication - The system shall provide communication channels for staff to message Supervisors.
FR12: Supervisor Dashboard - The system shall allow Supervisors to view real-time progress of assigned Enumerators.
FR13: Context-Aware Fraud Detection - The system shall implement a Fraud Signal Engine with configurable thresholds for Cluster Detection, Speed Run, and Straight-lining. Flags do NOT block data.
FR14: Questionnaire Management - The system shall enable Super Admins to manage questionnaires via XLSForm upload to Custom App (push to ODK Central).
FR15: Back-Office Reporting - The system shall provide Verification Assessors (Read/Write verification status) and Government Officials (Read-Only/Export) with dashboards.
FR16: Audit Trails - The system shall include detailed immutable audit trails for all user actions and data modifications.
FR17: Marketplace Search - The system shall provide a public-facing interface for searching skilled worker profiles by skill, LGA, and experience.
FR18: Enriched Contact Access - The system shall require Public Searchers to register/log in to view unredacted contact details.
FR19: Contact View Logging - The system shall log every instance of a Public Searcher viewing unredacted contact details.
FR20: Data Entry Interface - The system shall provide a dedicated, keyboard-optimized High-Volume Data Entry Interface for Clerks.
FR21: Global NIN Uniqueness - The system shall enforce uniqueness of NIN across all submission sources (Enumerator, Public, Paper) at the database level.

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
NFR3.2: Degraded Mode (ODK Central remains available if Custom App crashes).
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
- **Starter Template:** Custom Manual Initialization (Monorepo structure: `apps/web`, `apps/api`, `packages/*`, `services/odk-integration`).
- **Infrastructure:** Single self-hosted Linux VPS (Hetzner CX43), Docker Compose orchestration.
- **Database Architecture:** Two PostgreSQL databases (`app_db` + `odk_db`) on same VPS.
- **Authentication:** Hybrid strategy (JWT + Redis blacklist).
- **ODK Integration:** Dedicated `services/odk-integration/` abstraction layer; Idempotent webhook ingestion.
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
FR3 (Homepage/Auth): Epic 1
FR4 (Public Survey): Epic 3
FR5 (Public NIN): Epic 1
FR6 (Staff Provisioning): Epic 1
FR7 (Staff Login): Epic 1
FR8 (Enumerator Progress): Epic 3 (integrated with dashboard)
FR9 (Offline PWA): Epic 3
FR10 (Pause/Resume): Epic 3
FR11 (In-App Messaging): Epic 4
FR12 (Supervisor Dashboard): Epic 4
FR13 (Fraud Signal Engine): Epic 4 (Oversight/Action)
FR14 (XLSForm Management): Epic 2
FR15 (Back-Office Dashboards): Epic 5
FR16 (Audit Trails): Epic 6
FR17 (Marketplace Search): Epic 7
FR18 (Enriched Contact Access): Epic 7
FR19 (Contact View Logging): Epic 7
FR20 (Data Entry Interface): Epic 3
FR21 (Global NIN Uniqueness): Epic 1 (Registration), Epic 3 (Submission)

## Epic List

### Epic 1: Foundation, Secure Access & Staff Onboarding
**Goal:** Establish the core infrastructure, secure authentication, and allow the state to provision and onboard its workforce with verified identities (NIN, Live Selfie).
**User Outcome:** Admins can bulk-provision staff; Staff can securely log in, complete profiles, and verify their legitimacy via ID cards.
**FRs covered:** FR3, FR5, FR6, FR7, FR21

### Epic 2: Questionnaire Management & ODK Integration
**Goal:** Enable the management of digital survey forms and the seamless connection between the Custom App and the ODK Central collection engine.
**User Outcome:** Admins can upload and version XLSForms; the system is ready to receive and process field data.
**FRs covered:** FR14

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
**User Outcome:** Assessors can audit the verification queue; Government officials can view state-wide trends and export PII-rich reports for planning.
**FRs covered:** FR15

### Epic 6: System Integrity, Accountability & Remuneration
**Goal:** Ensure the absolute trustworthiness of the registry through immutable audit trails, system health monitoring, and transparent staff payment management.
**User Outcome:** The system remains healthy and tamper-proof; staff are fairly remunerated with a clear dispute resolution process.
**FRs covered:** FR16

### Epic 7: Public Skills Marketplace & Search Security
**Goal:** Create a secure, privacy-compliant bridge between skilled workers and potential employers through an anonymous registry.
**User Outcome:** The public can find verified local talent; workers can opt-in to opportunities; the state protects worker PII via authenticated contact reveal.
**FRs covered:** FR1, FR2, FR17, FR18, FR19

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

---

## Epic 2: Questionnaire Management & ODK Integration

**Epic Goal:** Enable the management of digital survey forms and the seamless connection between the Custom App and the ODK Central collection engine.

### Story 2.1: XLSForm Upload & Validation

As a Super Admin,
I want to upload an XLSForm definition file directly to the Custom App,
So that I can update the survey structure without using the ODK Central UI.

**Acceptance Criteria:**

**Given** a completed XLSForm (`.xlsx` or `.xml`)
**When** I upload it via the Custom App dashboard
**Then** the system should validate the file format and questionnaire schema
**And** successfully validated forms should be stored and versioned in the `app_db`.

### Story 2.2: ODK Central Form Deployment

As a Super Admin,
I want validated questionnaires to be automatically pushed to ODK Central,
So that they are available for field collection.

**Acceptance Criteria:**

**Given** a validated XLSForm in the Custom App
**When** I click "Publish to ODK"
**Then** the `services/odk-integration/` layer should call the ODK Central API to deploy the form
**And** the form status in the Custom App should update to "Published" upon success.

### Story 2.3: Automated ODK App User Provisioning

As a System,
I want to automatically create ODK App Users for every provisioned staff member,
So that they can collect data immediately.

**Acceptance Criteria:**

**Given** a new staff member account creation
**When** the account is successfully created in the Custom App
**Then** the system should asynchronously call the ODK API to create a corresponding App User
**And** the ODK project permissions should be correctly assigned to that user.

### Story 2.4: Encrypted ODK Token Management

As a System,
I want to securely store ODK App User tokens,
So that I can launch seamless Enketo forms without exposing credentials.

**Acceptance Criteria:**

**Given** a newly created ODK App User
**When** the ODK API returns the session token
**Then** the system should encrypt the token using AES-256 before storing it in the `app_db`
**And** the token should be retrievable only by the authorized backend service.

### Story 2.5: ODK Sync Health Monitoring

As a Super Admin,
I want to monitor the health of the ODK Central integration,
So that I can resolve synchronization issues promptly.

**Acceptance Criteria:**

**Given** a failure in an ODK API call (e.g., timeout or auth error)
**When** I view the "System Health" dashboard
**Then** the failure should be displayed in the "ODK Sync Failures" widget
**And** I should have a "Manual Resync" button to retry the failed operation.

---

## Epic 3: Mobile Data Collection & Ingestion Pipeline

**Epic Goal:** Provide field enumerators and the public with a robust, offline-capable tool for data submission, and establish the real-time ingestion of that data.

### Story 3.1: Seamless Enketo Launch & Dashboard

As an Enumerator,
I want to launch the survey directly from my dashboard without re-authenticating,
So that I can collect data efficiently in the field.

**Acceptance Criteria:**

**Given** an authenticated session in the Custom App
**When** I click the "Start Survey" button
**Then** the system should decrypt my ODK token and launch the embedded Enketo form
**And** the respondent's consent for the Marketplace must be the first mandatory field.

### Story 3.2: PWA Service Worker & Offline Assets

As an Enumerator,
I want the survey form to load even when I have no internet access,
So that I can work in remote areas without interruption.

**Acceptance Criteria:**

**Given** a device that has previously loaded the app
**When** I access the survey interface without a network connection
**Then** the Service Worker should serve the Enketo assets and form definitions from the cache
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

### Story 3.4: Idempotent Webhook Ingestion (BullMQ)

As a System,
I want to reliably ingest survey submissions from ODK Central,
So that the data is available for reporting and fraud detection.

**Acceptance Criteria:**

**Given** a survey submission from Enketo
**When** ODK Central sends a webhook to the Custom App
**Then** the system should push the job to BullMQ and deduplicate by `submission_id`
**And** the record should be extracted and saved to the `app_db` (idempotent ingestion).

### Story 3.5: Public Self-Registration & Survey Access

As a Public User,
I want to register on the website and fill out the survey,
So that I can contribute my skills to the registry.

**Acceptance Criteria:**

**Given** the public homepage
**When** I register with my NIN and Phone Number
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

As a Super Admin,
I want to adjust the fraud detection thresholds via a UI,
So that I can tune the system based on pilot results.

**Acceptance Criteria:**

**Given** the Super Admin Settings UI
**When** I adjust the "Cluster Detection Radius" or "Speed Run Duration" thresholds
**Then** the Fraud Engine must immediately apply these new rules to all incoming ingestions
**And** the changes must be logged in the system audit trail.

### Story 4.4: Flagged Submission Review (Evidence Panel)

As a Supervisor,
I want to review the evidence for flagged submissions,
So that I can decide whether to verify or reject them.

**Acceptance Criteria:**

**Given** a flagged submission in my LGA
**When** I open the Evidence Panel
**Then** I should see a map with the GPS cluster, the survey duration, and any pattern warnings
**And** I must have the option to mark the individual record as "Verified" or "Rejected".

### Story 4.5: Bulk Verification of Mass-Events

As a Supervisor,
I want to verify a group of flagged submissions with one click,
So that I can efficiently handle legitimate community registration events.

**Acceptance Criteria:**

**Given** a cluster of 3+ flagged submissions at the same location/time
**When** I select the cluster and click "Verify Mass Event"
**Then** all submissions in that group must have their fraud flags cleared and status updated to "Verified"
**And** I must provide a mandatory justification (e.g., "Trade Union Meeting").

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
**Then** the system should generate encrypted SQL dumps of `app_db` and `odk_db`
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

---

## Epic 7: Public Skills Marketplace & Search Security

**Epic Goal:** Create a secure, privacy-compliant bridge between skilled workers and potential employers through an anonymous registry.

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
