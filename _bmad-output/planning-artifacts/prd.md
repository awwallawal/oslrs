# Oyo State Labour & Skills Registry (OSLSR) - Product Requirements Document (PRD) - V7.6

**Harmonization Date:** 2026-01-04
**Orchestrator:** Sarah (PO)
**Project Name:** Oyo State Labour & Skills Registry (OSLSR)

## 1. Executive Summary

The **Oyo State Labour & Skills Registry (OSLSR)** is a state-wide digital system designed to establish a trusted, continuously updated register of skilled, semi-skilled, and unskilled workers across all 33 Local Government Areas of Oyo State.

The Registry addresses a persistent structural gap in workforce planning: **the absence of reliable, granular, and up-to-date labour market data**. Existing surveys provide statistical estimates but lack the depth, coverage, and administrative usability required for targeted policy action, skills development, job creation programs, and private-sector investment facilitation.

OSLSR combines **enumerator-assisted data collection** with **self-registration via mobile devices**, enabling broad population coverage while maintaining strong data integrity controls. The system is designed to operate **online and offline**, ensuring inclusion of rural and low-connectivity communities.

At its core, OSLSR emphasizes:
*   **Identity assurance without prohibitive costs**
*   **Fraud detection and quality control at scale**
*   **Real-time policy dashboards for government decision-makers**

The Registry is not a one-off data exercise but a **living state asset** that supports employment programs, skills training initiatives, investment promotion, and labour formalization strategies over time.

## 2. Goals and Strategic Objectives

#### Primary Goals
*   **Establish the Registry:** Create a secure, mobile-optimized repository for labor data using **ODK (Open Data Kit)** as the robust collection engine.
*   **Ensure Integrity:** Implement robust mechanisms for data authenticity to prevent fraud, utilizing a custom **Context-Aware Fraud Signal Engine**.
*   **Empower Decision Makers:** Provide comprehensive, tailored dashboards for Government Officials to visualize workforce trends in real-time.
*   **Enable the Marketplace:** Connect skilled workers to opportunities via a Public Skills Marketplace (Logically Isolated Read Replica for security).

#### Success Metrics & KPIs
To ensure the project is delivering on its objectives, success will be measured against the following Key Performance Indicators (KPIs) within six months of public launch.

**Measurement Period Definition:**
*   **Public Launch Date:** Defined as the date when Public Self-Registration (Story 3.6) is enabled for general use.
*   **Measurement Window:** Metrics measured from Launch Day to Launch Day + 180 days (cumulative).
*   **Review Process:** If metrics are not met by Month 6, Product Owner and Architect will conduct retrospective and propose corrective actions (not automatic project cancellation).

**Key Performance Indicators:**

*   **Data Quality & Integrity:**
    *   Reduce flagged data integrity issues (inconsistent responses, outliers) by 40% compared to the initial month of operation.
    *   Achieve a fraud/suspicious activity alert rate of less than 2% of all submissions.
*   **User Adoption & Efficiency:**
    *   Attain an active user base of at least 80% of the provisioned enumerators, logging in at least 3 times per week.
    *   Reduce the average time-to-complete-survey by 25% from the baseline established in the first month.
    *   Achieve a 90% satisfaction rate from a pilot group of enumerators and supervisors.
*   **System Performance & Reliability:**
    *   Maintain 99.5% uptime (Single-VPS SLA).
    *   Ensure 95th percentile (p95) API response times remain under the 250ms target.
    *   Offline sync success rate of **95% within 3 retry attempts** (measured over 30 days). Note: 100% is impossible due to real-world network conditions, device failures, and storage constraints.
    *   Ensure no critical security vulnerabilities are identified in quarterly penetration tests.

#### Technical Background (The Engine)
The **Robust Data Collection Platform (RDCP)** is the technical backbone powering the OSLSR. We are adopting a **Composed Architecture**: utilizing **ODK Central** for the "hard" problems of form delivery and offline synchronization, while building a **Custom Modular Monolith** for User Management, Dashboards, Fraud Analysis, and the Public Marketplace.

We are also adopting a **Lean Infrastructure Strategy** (Docker, Single high-performance VPS, Postgres as BullMQ Queue) to balance performance with government procurement constraints. This "Best of Both Worlds" approach minimizes technical risk, accelerates delivery, and ensures field-proven reliability.

#### Change Log

| Date         | Version | Description                                                               | Author       |
| :----------- | :------ | :------------------------------------------------------------------------ | :----------- |
| 2025-12-18   | 1.0     | Initial Draft                                                             | John (PM)    |
| 2025-12-26   | 1.1     | Validated with `po-master-checklist`.                                     | Sarah (PO)   |
| 2025-12-26   | 2.0     | **Major Architecture Pivot:** Integrated ODK Central for Collection Engine. | Orchestrator |
| 2025-12-26   | 2.1     | **Infrastructure Update:** Added GitHub Actions, Portainer, Lean Stack.     | John (PM)    |
| 2025-12-27   | 3.0     | **Final Integration Lock:** BullMQ Ingestion, AES-256 Tokens.             | Orchestrator |
| 2025-12-27   | 3.1     | **Battle-Hardening:** Bulk Import, Verhoeff, ID Cards, Offline Safety.    | Orchestrator |
| 2025-12-27   | 4.0     | **Vision Restoration:** Restored all staff roles and reporting workflows. | Sarah (PO)   |
| 2025-12-31   | 5.0     | **FINAL HARMONIZATION:** Merged all key features and Dev details (Env Vars). | Sarah (PO)   |
| 2026-01-01   | 5.1     | **PO Refinements:** Clarified Consent Flow, Bulk Provisioning, and Data Entry specs. | Sarah (PO)   |
| 2026-01-01   | 5.2     | **Security Hardening:** Added Anti-Race, Idempotency, and Immutable Log requirements. | Winston (Architect) |
| 2026-01-01   | 5.3     | **Legendary Reliability:** Added S3 Backups, AWS SES, Old-Phone Support, and Context-Aware Fraud Logic. | Sarah (PO)   |
| 2026-01-01   | 6.0     | **Risk-Hardened Defensibility:** Implemented Source of Truth Matrix, NDPA limits, ODK Constraints, and 132 Staff limit. | Sarah (PO)   |
| 2026-01-01   | 6.1     | **Final PO Validation:** Checked against `po-master-checklist`. APPROVED for Architecture. | Sarah (PO)   |
| 2026-01-01   | 7.0     | **Strategic Reframing:** Global rename to OSLSR and Policy-Aligned Summary. | Sarah (PO)   |
| 2026-01-01   | 7.1     | **Unified Approval:** PRD & Architecture synchronized. FINAL GO for Implementation. | Sarah (PO)   |
| 2026-01-02   | 7.2     | **Remuneration Logic:** Added Manual Payment Management, Bulk Recording, and Dispute Resolution (Epic 6.7). | Sarah (PO)   |
| 2026-01-02   | 7.3     | **Adversarial Review & Battle-Hardening:** Fixed 25 critical issues identified in comprehensive review: Resolved BVN contradiction, added NIN uniqueness enforcement, clarified paper collection policy, defined consent workflow technical specs, added ODK deployment details, enhanced fraud detection configurability, added marketplace authentication, improved error handling, expanded backup strategy, defined role permissions, added session timeouts, enhanced bot protection, and clarified all ambiguous specifications. Incorporated supporting docs (homepage_structure.md, questionnaire_schema.md). | Claude (Reviewer) + Awwal (PO) |
| 2026-01-02   | 7.4     | **Role Clarification & Scalability Enhancement:** Clarified Field Staff vs Back-Office distinction (Assessors & Officials are both back-office with full PII READ access). Changed 200 staff limit from hard cap to flexible soft planning capacity with unlimited technical scalability. Government Officials now have full READ access to individual PII for oversight ("trust but verify") but remain READ-ONLY. Updated RBAC model with clear permission boundaries. Confirmed sequential workflow (PRD→Architecture→UX). | Awwal (PO) |
| 2026-01-04   | 7.5     | **Critique Resolution & Technical Clarity:** Fixed "Air-Gapped" misnomer to "Logically Isolated Read Replica". Clarified Live Selfie serves dual purposes (identity verification + ID card portrait) with liveness detection and auto-crop specifications. Added comprehensive Data Routing Matrix explaining what data resides in ODK Central vs Custom App databases, data flow rules, and architectural rationale for two-database strategy. | Awwal (PO) |
| 2026-01-22   | 7.6     | **Epic 1 Retrospective Decisions:** Added Google OAuth as primary public registration method (ADR-015) with email fallback using Hybrid Email Verification (Magic Link + OTP in same email). Defined Layout Architecture (ADR-016) separating PublicLayout (static pages) from DashboardLayout (authenticated dashboards). Added database seeding patterns (Hybrid approach for dev/prod). Staff activation via email link serves as implicit email verification. | Awwal (PO) |

## Requirements

#### Functional
*   **FR1:** The system shall present a clear consent screen at the beginning of any survey (Enumerator-led, Paper, or Public self-submission) to allow respondents to explicitly opt-in for an anonymous marketplace profile (Profession, LGA, Experience Level).
    *   **Paper Collection Purpose:** Paper forms are provided as an **inclusion and accessibility strategy** to reach: (1) residents that Enumerators cannot physically attend to due to time/distance constraints, (2) non-technically literate populations (elderly, those without digital skills), and (3) overflow capacity when digital collection channels are saturated. All paper forms must have pre-printed serial numbers and be submitted to Supervisors before Data Entry Clerk digitization to maintain accountability.
*   **FR2:** The system shall implement a **Two-Stage Consent Workflow** within the ODK survey form itself:
    *   **Stage 1 (Field: `consent_marketplace`):** "Do you consent to join an anonymous marketplace profile?" (Profession, LGA, Experience Level only)
    *   **Stage 2 (Field: `consent_enriched`, only shown if Stage 1 = Yes):** "Do you consent to allow employers to view your Name and Phone Number?"
    *   **Technical Note:** Both consent fields are part of the XLSForm specification (see `docs/questionnaire_schema.md` Section 6). Data extraction logic in Story 7.1 and 7.2 must reference these exact field names.
*   **FR3:** The system shall provide a public-facing Homepage with options for "Staff Login" and "Public Register".
    *   **Clarification:** Staff Login and Public Login must use **distinct authentication endpoints** (`/auth/staff/login` vs `/auth/public/login`) to enable separate session management, rate limiting policies, and role-based security controls. The homepage structure is defined in `docs/homepage_structure.md`.
*   **FR4:** The system shall allow registered Public Users to securely log in and fill out survey questionnaires (served via Enketo integration).
*   **FR5:** The system shall require public users to provide their National Identity Number (NIN) during registration, preventing multiple completed registrations by the same individual. **Note:** Only NIN is accepted for identity verification to ensure NDPA compliance (BVN is explicitly excluded per NFR4.1).
*   **FR6:** The system shall allow Super Admins to invite (provision) new staff users (**Supervisors, Enumerators, Data Entry Clerks, Verification Assessors, Government Officials**) via **Manual Single-User Creation** or **Bulk CSV Import**.
    *   **Manual Creation:** Super Admins can create individual staff accounts through a form interface requiring: Full Name, Email, Phone, Role, Assigned LGA (for Enumerators/Supervisors). System generates invitation link/token immediately.
    *   **Bulk Import:** Super Admins can upload CSV with columns: `full_name,email,phone,role,lga_code` (LGA optional for non-field roles). Upon Bulk Import, the system shall asynchronously queue and send individual invitation emails/SMS to all imported users containing unique, time-limited account setup links.
*   **FR7:** The system shall allow Enumerators and all other defined staff roles to securely log in to the Custom App using unique credentials.
*   **FR8:** The system shall provide Enumerators with a personalized dashboard displaying their daily/weekly progress against targets.
*   **FR9:** The system shall enable Enumerators to collect data offline using **embedded Enketo forms** (browser-based PWA), and synchronize automatically via ODK Central when connectivity is restored. **Note:** ODK Collect mobile app is NOT used in this implementation - all data collection happens via Progressive Web App (PWA) accessed through Chrome browser. Enumerators can use "Add to Home Screen" for app-like experience.
*   **FR10:** The system shall support pausing and resuming incomplete survey sessions for Enumerators (native ODK feature).
*   **FR11:** The system shall provide in-app communication channels for staff to message their Supervisors or teams.
*   **FR12:** The system shall allow Supervisors to view the real-time progress and activity of all assigned Enumerators on a dashboard.
*   **FR13:** The system shall implement a **Context-Aware Fraud Signal Engine** with **configurable thresholds**:
    *   **Heuristic A (Cluster Detection):** >3 submissions (configurable) within 15 meters (configurable) in <1 hour (configurable) = **"Cluster Warning"**.
    *   **Heuristic B (Speed Run):** Survey duration < 180 seconds (configurable) = **"Quality Warning"**.
    *   **Heuristic C (Straight-lining):** >5 consecutive identical answers (configurable) = **"Pattern Warning"**.
    *   **Configuration Access:** Super Admin can adjust all thresholds via Settings UI based on pilot feedback and real-world validation.
    *   **Action:** These flags do **NOT** reject data. They mark submissions as "Pending Verification".
    *   **Resolution:** Supervisors receive an alert and can "Verify Event" (e.g., "Association Meeting confirmed") to clear flags in bulk, or "Reject" if fraud is confirmed. Supervisors can mark false positives, allowing system to learn over time.
*   **FR14:** The system shall enable Super Admins to manage questionnaires via **XLSForm upload** to the Custom App, which pushes to ODK Central.
*   **FR15:** The system shall provide **Government Officials and Verification Assessors** with comprehensive dashboards and reporting tools. Both are **back-office analytical roles** (not field staff) with full data access:
    *   **Verification Assessors:** State-level auditors (not restricted by LGA) with:
        *   **READ Access:** Full access to all individual respondent records including PII (names, NINs, phone numbers, addresses) for quality verification
        *   **WRITE Access:** Can approve/reject submissions in Verification Queue (second-level check after Supervisor verification)
        *   **Permissions:** Cannot modify respondent data, only change verification status
    *   **Government Officials:** Policy-makers and oversight personnel with:
        *   **READ Access:** Full access to all individual respondent records including PII for investigation, policy analysis, and verification purposes
        *   **WRITE Access:** None - completely READ-ONLY
        *   **Export Capability:** Can export detailed reports in PDF/CSV with **full PII included** (for authorized government use)
        *   **Rationale:** Officials need complete visibility for oversight ("trust but verify") but cannot tamper with data
*   **FR16:** The system shall include detailed audit trails for all user actions and data modifications.
*   **FR17:** The system shall provide a public-facing interface for searching and filtering skilled worker profiles in the marketplace by skill, LGA, and years of experience.
*   **FR18:** The system shall require Public Searchers to register and log in to view the unredacted contact details of skilled workers who have provided enriched consent.
*   **FR19:** The system shall log every instance of a registered Public Searcher viewing a skilled worker's unredacted contact details, including Searcher ID, Worker ID, and timestamp.
*   **FR20:** The system shall provide a dedicated, **High-Volume Data Entry Interface** for Clerks. This interface must be fully keyboard-optimized, ensuring all form navigation can be performed via 'Tab' and submissions triggered via 'Enter' (or similar hotkey) without requiring mouse interaction.
*   **FR21:** The system shall enforce **Global NIN Uniqueness** across all submission sources (Enumerator ODK, Public Self-Registration, Paper Entry). Any submission with a NIN that already exists in the database shall be rejected with error message: "This individual has already been registered on [DATE] via [SOURCE]." Super Admins can override with documented justification (e.g., "Correcting erroneous previous entry").

#### Non-Functional
*   **NFR1: Performance**
    *   **NFR1.1:** API response times for all standard CRUD operations must be below 250ms at the 95th percentile (p95).
    *   **NFR1.2:** Frontend page loads (Largest Contentful Paint) for authenticated dashboards must be under 2.5 seconds on a 4G mobile connection.
    *   **NFR1.3:** Offline-to-online sync of 20 completed surveys (average size) must complete in under 60 seconds (ODK Central native performance).
*   **NFR2: Scalability**
    *   **NFR2.1:** **Staffing Model:** Support a **baseline capacity of 132 Field Staff** (33 Supervisors + 99 Enumerators), structured as 1 Supervisor + 3 Enumerators per Local Government Area (33 LGAs). The system architecture must support **unlimited staff accounts** with no hard technical limits.
    *   **NFR2.2:** **Planning Capacity:** The initial deployment targets **~200 total staff accounts** (132 field staff + ~68 back-office/admin). This is a **soft planning number**, not a hard limit. The system must gracefully scale beyond 200 if needed via vertical scaling (VPS resource upgrade).
    *   **NFR2.3:** **Capacity Monitoring:** System alerts Super Admin when field staff count exceeds 120 (early warning for resource planning), and again at 180 field staff (consider VPS upgrade).
    *   **NFR2.4:** **Bulk Import Validation:** Bulk Import validates that the CSV format is correct and user data is complete. No hard limits on row count - imports of 500+ users are supported.
    *   **NFR2.5:** **Concurrency:** Support ~1,000 concurrent Public Users during peak registration periods.
*   **NFR3: Availability & Reliability**
    *   **NFR3.1:** **99.5% SLA** (Honest Single-VPS target = 3.65 hours downtime/month maximum).
    *   **NFR3.2:** **Degraded Mode (Process-Level Only):** If Custom App process crashes/restarts, ODK Central Docker container must remain available for raw data collection. **Note:** This does NOT apply to VPS-level failures (hardware crash, network partition) - in such scenarios, both Custom App and ODK Central will be unavailable. Enumerators must be trained to continue offline data collection on their devices for up to 7 days until VPS is restored.
    *   **NFR3.3:** **Comprehensive Backup Strategy:**
        *   **Custom App DB:** Daily encrypted dump to S3 at 2:00 AM WAT
        *   **ODK Central DB:** Daily encrypted dump to S3 at 3:00 AM WAT
        *   **Media Attachments:** Real-time sync to S3 (configured in ODK Central)
        *   **Retention Policy:** 7-day rolling window + monthly snapshots retained for 7 years (per NFR4.2)
        *   **Backup Testing:** Monthly restore drills in staging environment to validate backup integrity
    *   **NFR3.4:** **Disaster Recovery:** VPS must have automated snapshots every 6 hours with 1-hour Recovery Time Objective (RTO). Super Admin can initiate Point-in-Time Restore (PITR) via Admin panel for recovery up to 24 hours back. Dashboard must detect VPS connectivity issues and display "OFFLINE MODE - Data Will Sync When Server Returns" banner to enumerators.
*   **NFR4: Security & Compliance (NDPA-Aligned)**
    *   **NFR4.1 Data Minimization:** Collect NIN (validated via Verhoeff) but **explicitly DO NOT** collect or store BVN.
    *   **NFR4.2 Retention:** Raw survey data retained 7 years; Marketplace profiles retained until consent revoked.
    *   **NFR4.3 Logically Isolated Marketplace:** Public Search queries a separate **Read-Only Replica** of the marketplace table (never ODK directly). This logical separation ensures marketplace traffic cannot impact data collection performance.
    *   **NFR4.4 Defense-in-Depth:** Rate Limiting (Redis), Honeypots, strict Content Security Policy (CSP), and IP Throttling with the following thresholds:
        *   **Login Attempts:** 5 attempts per IP per 15 minutes (temporary 30-minute block after 10 failed attempts)
        *   **Marketplace Search:** 30 queries per IP per minute
        *   **Profile Views (Contact Reveal):** 50 contacts per authenticated user per 24 hours
        *   **API Endpoints (General):** 100 requests per user per minute
        *   **Password Reset:** 3 requests per email per hour
        *   **Profile Edit Token Request:** 3 requests per NIN per day
    *   **NFR4.5 Input Validation & Sanitization (Defense-in-Depth Security):** All user input must undergo comprehensive validation and sanitization at both frontend (client-side) and backend (server-side) layers:
        *   **Frontend Validation:** HTML5 input constraints, zod schema validation, real-time error feedback, character count limits. Purpose: Immediate user feedback, reduce server load from malformed requests.
        *   **Backend Validation (Source of Truth):** All API endpoints must re-validate using zod schemas, enforce database constraints (unique NIN, email format, Verhoeff checksum), sanitize against SQL injection (parameterized queries via Drizzle ORM), XSS attacks (DOMPurify for user-generated content), and command injection. Purpose: Security cannot rely on client-side validation alone.
        *   **Specific Rules:** NIN (11 digits + Verhoeff check), Email (RFC 5322 compliant), Phone (Nigerian format validation), GPS coordinates (decimal degrees within Nigeria bounds), File uploads (type whitelist, size limits, virus scanning for profile photos).
    *   **NFR4.6 Role Conflict:** A single user account cannot hold conflicting roles (e.g., A Supervisor cannot also be an Enumerator) to prevent fraud.
    *   **NFR4.7:** All data must be encrypted in transit (TLS 1.2+) and at rest (AES-256).
*   **NFR5: Usability & Compatibility:**
    *   **NFR5.1:** WCAG 2.1 AA.
    *   **NFR5.2 Legacy Device Support:** The Enumerator Web App (PWA) must be fully functional on **Android 8.0+** running **Chrome 80+**.
*   **NFR6: Operations & Testability**
    *   **NFR7: Ease of Operations:** System must include **Portainer** for visual management and use **GitHub Actions** for automated deployment.
*   **NFR8: Advanced Security & Concurrency (Anti-Fragility):**
    *   **NFR8.1: Race Condition Defense:** Critical uniqueness checks (e.g., NIN, Email) must rely on **Database-Level Unique Constraints**, not just application logic. The `respondents` table must enforce a **UNIQUE constraint on the `nin` column** to prevent duplicate registrations at the database level (implements FR21).
    *   **NFR8.2: Atomic Transactions:** All multi-step write operations (e.g., User Provisioning) must be wrapped in ACID-compliant database transactions.
    *   **NFR8.3: Immutable Audit Logs:** The `audit_logs` table must be implemented as **Append-Only** (via DB permissions or Trigger logic) to prevent tampering by compromised admin accounts.
    *   **NFR8.4: Anti-XSS:** The system must enforce a strict **Content Security Policy (CSP)** and utilize automated output encoding (React default) to neutralize malicious scripts in User Bios or Form definitions.
    *   **NFR6.2:** The entire system (Custom App + ODK Integration) must be verifiable in a local/staging environment before production deployment.

## User Interface Design Goals

#### Overall UX Vision
**Seamless Integration.** Users should feel they are using *one* application. The application's user experience should be **intuitive, efficient, and minimize cognitive load** for all users, featuring **optimistic UI updates** and **skeleton screens** to ensure responsiveness on slow government networks. The transition between the Custom Dashboard and the ODK/Enketo data collection form must be visually consistent and fluid.

#### Core Screens and Views
*   **Homepage:** Public-facing page with "Staff Login" and "Public Register" buttons.
*   **Login Screen:** Secure and straightforward access for all roles (staff and public).
*   **Public Registration Portal:** For new public users to create accounts and access surveys.
*   **Enumerator Dashboard:** Overview of personal progress, targets, and communication. Includes "Start Survey" button (Seamless Enketo Launch) and "Pending Upload" warning banners.
*   **Supervisor Dashboard:** Real-time team monitoring, alerts, and communication hub.
*   **Super Admin Dashboard:** Bulk User Import, XLSForm Management, and System Health metrics.
*   **Verification Assessor Dashboard:** Progress tracking and report generation.
*   **Government Official Dashboard:** High-level data insights and policy-making support.
*   **Questionnaire Form (ODK/Enketo):** Clear, grouped questions with progress indicators and validation feedback (embedded in Custom App).
*   **Data Entry Interface:** Dedicated screen for Data Entry Clerks to input paper-based survey responses via Enketo.
*   **Public Skills Marketplace:** Public-facing search and profile discovery platform with 3-route structure.
*   **Verification Portal:** Public `/verify-staff/:id` URL for ID Card verification.

## MVP Validation Plan

The success of the MVP will be validated through a multi-faceted approach involving a pilot program and qualitative feedback.

*   **Pilot Program:**
    *   **Participants:** A pilot group will be selected, consisting of 2 Supervisors and 10 Enumerators from two different Local Government Areas (LGAs).
    *   **Duration:** The pilot will run for two weeks under real-world conditions.
    *   **Goal:** The pilot group will use the application for all their data collection activities during this period.
*   **Feedback Collection:**
    *   **Structured Interviews:** At the end of the pilot, structured interviews will be conducted with all 12 participants to gather qualitative feedback on usability, workflow efficiency, and pain points.
    *   **In-App Feedback Form:** A simple, non-intrusive feedback button will be available in the application for users to report bugs or suggestions at any time.
*   **Success Criteria:**
    *   **Quantitative:** The pilot group must be able to complete their daily data collection tasks with a task-related error rate of less than 10%. The average time to complete a survey should meet the targets defined in the NFRs.
    *   **Qualitative:** At least 80% of the pilot group must report a "Satisfied" or "Very Satisfied" rating with the overall usability of the application.
    *   **Go/No-Go Decision:** The project will move beyond the MVP phase if all success criteria are met.

## Scope Boundaries (Out of Scope for MVP)

To ensure focus and timely delivery of core value, the following features and functionalities are explicitly **OUT of scope** for the initial MVP release.

*   **Advanced Statistical Analysis:** Complex statistical modeling, time-series forecasting, and predictive analytics.
*   **Public User Profile Customization:** Public users who opt-in to the marketplace will have a standardized, non-customizable profile page.
*   **Third-Party HR Integrations:** The system will not integrate with external Human Resources or payroll systems in the MVP.
*   **GIS-based Enumeration Area Creation:** A map-based, graphical tool for drawing and defining area boundaries is out of scope.
*   **Multi-language Support:** The entire user interface will be in English only for the MVP.

## Technical Assumptions

#### Repository Structure: Monorepo
Given the full-stack nature of the application and the potential for shared components, a **Monorepo** structure is assumed.

#### Service Architecture: Composed Modular Monolith
*   **Custom App (Node.js/React):** The **Single Source of Truth**. Handles Auth, Users, Dashboards, Marketplace, Fraud Logic, and Orchestration.
    *   **Frontend Stack:** React with **Tailwind CSS** and **shadcn/ui**.
    *   **Queue:** **BullMQ** utilizing the **Sidecar Redis** instance for high-performance ingestion.
    *   **Ingestion Pattern:** The synchronization between ODK Central and the Custom App must be **Idempotent**. Re-processing the same Submission ID (e.g., in case of queue retry) must not result in duplicate records or data corruption.
    *   **Notification Service:** Use **AWS SES** (or equivalent high-deliverability provider) for emails. Implement a strict **Daily Cost Circuit Breaker** (e.g., max $50/day) to prevent SMS/Email billing spikes.
    *   **Storage Strategy:** All Database Backups and ODK Media Attachments must be stored in **S3-Compatible Object Storage** (e.g., DigitalOcean Spaces, AWS S3) to ensure data survival even if the VPS is destroyed.
    *   **Scalability:** **Vertical Scaling Strategy.** The system is designed to run on a single high-performance VPS (8GB+ RAM). Increased load is handled by upgrading server resources (CPU/RAM) rather than horizontal auto-scaling, to minimize cost and architectural complexity.
*   **Collection Engine (ODK Central):** **Self-hosted containerized instance** handling Form Management (Enketo) and Data Aggregation. ODK Central will be deployed via Docker on the same VPS as the Custom App to ensure **data residency within Nigeria** for NDPA compliance. No cloud-hosted ODK services will be used to prevent data from leaving Nigerian infrastructure.
*   **Source of Truth Matrix:**
    *   **Raw Submissions:** ODK Central (Immutable).
    *   **Ingested Records:** Custom App DB (Derived/Idempotent).
    *   **Marketplace Profiles:** Custom App DB (Derived/Revocable).
    *   **Drafts:** Enketo (Ephemeral/Non-Authoritative).
*   **Data Routing Matrix (What Goes Where):**
    *   **ODK Central Database (PostgreSQL) Stores:**
        *   Survey form definitions (XLSForms pushed from Custom App)
        *   Raw survey submissions (JSON with media attachments)
        *   Submission metadata (GPS coordinates, timestamps, device info)
        *   ODK App User tokens (for Enumerator authentication)
        *   Draft survey data (stored locally in browser IndexedDB, synced to ODK when submitted)
    *   **Custom App Database (PostgreSQL) Stores:**
        *   User accounts & authentication (all roles: Staff, Public Users, Admins)
        *   RBAC permissions & role assignments
        *   LGA assignments for Field Staff
        *   Staff profile data (NIN, bank details, live selfie, next of kin)
        *   Ingested survey records (extracted from ODK webhooks and enriched)
        *   Fraud detection scores and flags
        *   Marketplace profiles (derived from consent fields)
        *   Audit logs (all user actions, system events)
        *   Payment records and dispute tracking
        *   Communication/messaging between Supervisors and Enumerators
        *   Encrypted ODK tokens (AES-256, for seamless Enketo launch)
    *   **Data Flow Rules:**
        *   **Questionnaires:** Custom App → ODK Central (XLSForm upload)
        *   **Survey Submissions:** Enketo (browser) → ODK Central → Custom App (webhook)
        *   **User Provisioning:** Custom App → ODK Central (create App User via API)
        *   **Authentication:** Custom App handles ALL login flows; ODK tokens used only for embedded Enketo forms
        *   **Reporting/Dashboards:** Custom App queries its own database (never queries ODK directly)
        *   **Marketplace:** Custom App Read-Only Replica (logically isolated from main database)
    *   **Why Two Databases?**
        *   **Separation of Concerns:** ODK Central is the immutable "field collection vault"; Custom App is the "operational system of record"
        *   **Performance Isolation:** Public marketplace traffic cannot slow down data collection
        *   **Data Integrity:** Raw survey data remains untouched; Custom App can re-ingest if processing logic changes
        *   **NDPA Compliance:** Both databases reside on the same Nigerian VPS (no data leaves the country)
*   **ODK Constraints:** The Custom App must **not** attempt to modify Enketo's internal UI or Draft state directly. All "Resume" functionality must rely on native Enketo/ODK links.
*   **Database Strategy:** Two Separate Databases (App DB vs ODK DB) on the same Linux VPS server.
*   **Integration Strategy:**
    *   **User Sync:** Custom App -> ODK API (Automatically create ODK 'App Users').
    *   **Data Sync:** ODK Webhook -> Custom App (Real-time BullMQ ingestion pipeline).
    *   **Questionnaire Flow:** Custom App hosts the XLSForm upload which pushes to ODK Central.

#### Infrastructure & Deployment
*   **Hosting:** Single VPS (Linux) running Docker Compose.
*   **CI/CD:** GitHub Actions (Automated "Build & Push" to VPS).
*   **Management:** **Portainer** GUI for visual container management.
*   **Backups:** Nightly encrypted DB dumps off-site + Manual downloads via Admin interface.

## Epic List

*   **Epic 1: Foundation & Secure Access**
*   **Epic 2: Core Administration & Questionnaire Management (ODK Integration)**
*   **Epic 3: Enumerator, Public & Data Entry Collection**
*   **Epic 4: Supervisor Oversight & Field Management**
*   **Epic 5: High-Level Reporting & Data Insights**
*   **Epic 6: Advanced Data Integrity & System Accountability**
*   **Epic 7: Public Skills Marketplace**

## Epic 1: Foundation & Secure Access
**Goal:** Establish the core technical infrastructure, secure user authentication, and robust authorization for all defined roles.

#### Story 1.1 Project Setup & Core Services
As a **Developer**,
I want to **set up the project's foundational structure, build pipeline, and core services**,
so that we have a stable and automated environment for development, testing, and deployment from day one.

**Acceptance Criteria:**
1.  Project repository is initialized with a Monorepo structure.
2.  Automated build, test, and deployment pipelines (CI/CD) are configured using GitHub Actions.
3.  A basic health-check endpoint is deployed and accessible.
4.  Core database schema is established for user management (PostgreSQL 15+).
5.  Development environment is locked to **Node.js 20 LTS**, **PostgreSQL 15**, and **Redis 7**.
6.  A `.env.example` file is created containing placeholders for:
    *   `DATABASE_URL` (PostgreSQL)
    *   `REDIS_URL`
    *   `ODK_SERVER_URL` (Cloud Sandbox URL)
    *   `ODK_ADMIN_TOKEN`
    *   `JWT_SECRET` and other session/security tokens.
    *   `PORT` and other environment-specific variables.
    *   `AWS_SES_CREDENTIALS` (or equivalent) for emails.
    *   `S3_BUCKET_URL` for backups.
7.  An initial `README.md` is created that includes: required tools, installation steps, and comprehensive Portainer deployment guide with:
    *   **Portainer Installation:** Step-by-step installation of Portainer CE (Community Edition) on VPS before deploying OSLSR
    *   **Container Management:** Portainer manages all system containers: ODK Central, Custom App, Redis, PostgreSQL
    *   **Security:** Portainer access restricted to Super Admin via strong password + 2FA (Two-Factor Authentication)
    *   **Stack Import:** Instructions for importing OSLSR Docker Compose stack into Portainer
    *   **Configuration:** Environment variable management and container health monitoring via Portainer UI

#### Story 1.2 User Authentication & Session Management (Bulk Import & Profile Completion)
As a **User** (Staff: Enumerator, Supervisor, Data Entry Clerk, Verification Assessor, Government Official; Public: Public User),
I want to **securely log into the application with unique credentials and maintain an active session**,
so that I can access my designated features and my identity is verified for all actions.

**Acceptance Criteria:**
1.  **Bulk Import:** Super Admin can upload a CSV (`Name, Phone, Email, Role, LGA_ID`) to provision all 132 staff (33 Supervisors, 99 Enumerators) instantly.
2.  **LGA Locking:** The system **Hard-Locks** the user to the LGA defined in the CSV. The user cannot change this during registration.
3.  **Profile Completion:** On activation, users must provide: Password, Age, Home Address, Bank Details (for stipend payment), Next of Kin, and a **Live Selfie** (captured using device camera with liveness detection to prevent photo-of-photo fraud). This single photo serves dual purposes: identity verification and printed ID card portrait.
4.  **NIN Verification:** National Identity Number (11 digits) must be validated locally using the **Verhoeff Checksum Algorithm** to prevent transcription errors.
5.  **Edit Lock:** Users can edit their profile *only* until their account is "Verified" by an Admin. Once verified (and ID Card generated), profile edits are locked.
6.  Public users can self-register via the public homepage with mandatory NIN/BVN verification.
7.  Password hashing with salting is implemented. **Session Security Policy:**
    *   Sessions expire after 8 hours of inactivity
    *   Users must re-authenticate after 24 hours regardless of activity (for security)
    *   Only 1 active session per user (new login invalidates previous session on different device)
    *   "Remember Me" option extends session to 30 days but requires re-auth for sensitive actions (e.g., profile edit, payment disputes)
8.  CAPTCHA is implemented for all public interactions and login flows.
9.  Operational details for OTP/CAPTCHA services are documented.

#### Story 1.3 Role-Based Authorization (Field Staff vs Back-Office)
As an **Administrator**,
I want to **define and assign specific roles to users with clear permission boundaries**,
so that each user only accesses features and data relevant to their responsibilities, ensuring data integrity and security.

**Acceptance Criteria:**
1.  The system enforces role-based access control (RBAC) across all application features with the following role categories:

**Field Staff Roles** (Data Collectors - LGA-Restricted):
*   **Enumerators:** WRITE survey data, READ own submissions, VIEW own dashboard. Restricted to assigned LGA.
*   **Supervisors:** WRITE verification decisions, READ all submissions in assigned LGA(s), WRITE messages to enumerators. Restricted to assigned LGA(s).

**Back-Office Roles** (Analysts - State-Wide Access):
*   **Verification Assessors:** READ all respondent data including PII (state-wide), WRITE verification status (approve/reject), Cannot modify respondent data.
*   **Government Officials:** READ all respondent data including PII (state-wide), READ-ONLY (no write permissions), Can export detailed reports with PII.
*   **Data Entry Clerks:** WRITE survey data (paper digitization via Enketo), READ paper form assignment queue, Cannot view digital submissions by Enumerators.

**Administrative Roles** (System Management):
*   **Super Admin:** Full READ/WRITE access to all system functions, user management, configuration, backups.

2.  **LGA Restrictions:** Field Staff (Enumerators, Supervisors) are hard-locked to their assigned LGA(s). Back-Office Staff (Assessors, Officials, Clerks) have state-wide access.
3.  **PII Access Control:** Only Back-Office Staff (Assessors, Officials) and Admins can view individual respondent PII. Field Staff see anonymized IDs in dashboards.
4.  **Role Conflict Prevention:** A single user cannot hold conflicting roles (e.g., cannot be both Supervisor AND Enumerator). System enforces this at account creation.
5.  Attempts to access unauthorized features are denied with HTTP 403 Forbidden and logged in audit trail with: User ID, Attempted Action, Timestamp, IP Address.

#### Story 1.4 Global UI Patterns (Battle-Hardened UX)
As a **Developer**,
I want to **implement optimistic UI updates and skeleton screens**,
so that the application feels "World Class" and responsive even on slow government networks.

**Acceptance Criteria:**
1.  **Skeleton Screens:** Use animated "Shimmer" skeletons (not spinners) for all initial data loading.
2.  **Optimistic UI:** Buttons (e.g., "Verify", "Save") must react instantly. Revert changes and show a Toast only if the server request fails.
3.  **Error Boundaries:** Catch unexpected crashes gracefully with user-friendly fallbacks.

## Epic 2: Core Administration & Questionnaire Management (ODK Integration)
**Goal:** Provide Super Admins with a comprehensive interface to manage all user accounts, provision new staff users via an invite/bulk system, and manage survey questionnaires via ODK Central.

#### Story 2.1 User Management Interface
As a **Super Admin**,
I want to **create, edit, and delete user accounts (Enumerators, Supervisors, Assessors)**,
so that I can effectively manage the workforce and their access to the system.

**Acceptance Criteria:**
1.  Super Admin can view a list of all system users with their assigned roles.
2.  Super Admin can create new user accounts with specified roles (Enumerator, Supervisor, Verification Assessor).
3.  Super Admin can edit existing user details and change their assigned roles.
4.  Super Admin can deactivate or delete user accounts.
5.  **User Deletion Policy:** Deleting a user account does **NOT delete** their historical survey submissions (required for 7-year retention per NFR4.2). Submissions are re-assigned to `DELETED_USER_[ID]` in the database to maintain audit trail. User PII (name, email, phone) is **redacted** 90 days after account deletion, replaced with `[REDACTED]`.
6.  **Right to Erasure:** Public Users can request complete data deletion via email to Super Admin. Admin must verify identity (NIN + Phone validation) and manually purge data, logging the action in audit trail with justification.
7.  **Synchronization Check:** When a user is created/deactivated, the system must check if an ODK App User needs to be created/revoked.

#### Story 2.2 Questionnaire Management (XLSForm Upload)
As a **Super Admin**,
I want to **upload an XLSForm definition file directly to the Custom App**,
so that the survey structure is updated in the collection engine (ODK Central) without needing complex custom builders.

**Acceptance Criteria:**
1.  Admin uploads `.xlsx` or `.xml` form definition via the Custom App dashboard.
2.  System validates file format and schema.
3.  System pushes form to ODK Central API as a new Draft or Published version.
4.  System stores and versions the raw XLS file in the App database for audit and rollback.

#### Story 2.3 Staff Provisioning (ODK Sync & Encrypted Tokens)
As a **System**,
I want to **automatically provision ODK users and securely store their tokens**,
so that Enumerators have a seamless experience and the App remains the master of all credentials.

**Acceptance Criteria:**
1.  When an Enumerator account is created or an invite is accepted:
2.  Backend calls ODK Central API to create a corresponding 'App User'.
3.  Backend retrieves the ODK Token and stores it in the App Database using **AES-256 encryption**.
4.  The system ensures that the Enumerator's dashboard can now generate correct Enketo survey links using these credentials automatically.
5.  **Error Handling:** If ODK API call fails during account creation:
    *   System logs error to Admin Dashboard ("ODK Sync Failures" widget with error details)
    *   Enumerator can log in but sees "Account Setup Incomplete - Contact Administrator" banner
    *   Super Admin receives automated email alert with user details and error message
6.  **Manual Resync:** Super Admin dashboard includes a "Fix Sync" button that retries API call and displays detailed error logs if retry fails (e.g., "ODK Central unreachable", "Invalid credentials", "Network timeout").

#### Story 2.4 ID Card Generation & Public Verification
As a **Staff Member** or **Admin**,
I want to **generate and download a printable ID card with a verification QR code**,
so that I can prove my legitimacy to respondents in the field.

**Acceptance Criteria:**
1.  **Generation:** System generates a PDF (Front & Back) using the user's verified details and the Live Selfie captured during profile completion (Story 1.2). The system auto-crops and formats the photo to meet ID card portrait requirements.
2.  **QR Code:** The back of the card includes a unique QR Code.
3.  **Public Verification:** Scanning the QR code leads to a public URL (`/verify-staff/:id`) showing a "Verified Active" status, Name, and Photo.
4.  **Access:** Staff can download their own ID card; Admin can search and download in bulk.
5.  **Design:** The card must feature official state branding.

#### Story 2.5 Enumeration Area Management & Assignment
As a **Super Admin**,
I want to **define geographical enumeration areas and assign Supervisors and Enumerators to these areas**,
so that the data collection efforts are properly organized, managed, and monitored spatially.

**Acceptance Criteria:**
1.  Super Admin can define geographical enumeration areas within the system (e.g., by name, boundary definition).
2.  Super Admin can assign one or more Supervisors/Enumerators to a defined enumeration area.
3.  The system prevents assigning an Enumerator or Supervisor to an area they are not authorized for.
4.  **Scale Constraint:** The system must handle 33 Local Government Areas with 1 Supervisor and 3 Enumerators per LGA (total 132 profiles).

## Epic 3: Enumerator, Public & Data Entry Collection
**Goal:** Provide Enumerators with a robust mobile tool for offline data collection, enable Public Users to self-register and submit data, and allow Data Entry Clerks to digitize paper forms.

#### Story 3.1 Seamless Collection Interface & Offline Safety
As an **Enumerator**,
I want to **launch the survey directly from my dashboard and be warned if I have unsent data**,
so that I never lose my hard work due to a browser cache clear.

**Acceptance Criteria:**
1.  Dashboard has a "Start Survey" button which launches a pre-authenticated Enketo form.
2.  **Persistent Storage:** The application explicitly requests browser **"Persistent Storage"** permission.
3.  **Data Warning Banner:** The Dashboard must query the browser's IndexedDB. If unsent Enketo records are found, a **Red Warning Banner** ("X Surveys Pending Upload - Do Not Clear Cache") is displayed.
4.  **Service Worker:** Key Enketo assets are cached via Service Worker to ensure the form loads instantly even when offline.
5.  **Legacy Support:** The interface must be tested and fully functional on **Android 8.0 / Chrome 80** devices.
6.  Upon submission, user is redirected back to the Custom App Dashboard.

#### Story 3.2 Data Ingestion Pipeline (Webhook)
As a **System**,
I want to **automatically ingest data from ODK Central via Webhook**,
so that the Custom App database is updated in near real-time.

**Acceptance Criteria:**
1.  Webhook listener endpoint established in the Custom App backend (`/api/webhook/odk`).
2.  Webhook pushed to **BullMQ Job Queue** to ensure reliable processing with exponential backoff retry (5min, 15min, 1hr, 4hr, 24hr).
3.  Worker parses JSON, maps fields to local `SurveyResponse` table, and identifies the submitting Enumerator.
4.  Trigger "Fraud Scoring Engine" (Epic 6) and "Marketplace Extractor" (Epic 7) upon successful ingestion.
5.  **Webhook Failure Handling:** If ODK Central cannot reach Custom App (network issues, server down):
    *   ODK Central automatically retries webhook delivery with built-in exponential backoff
    *   Custom App exposes `/admin/missing-submissions` page showing gaps in submission IDs
    *   Super Admin can manually trigger "Pull from ODK" to fetch all submissions since last successful sync
    *   Failed webhook attempts are logged with timestamp and error reason for debugging

#### Story 3.3 Session Management & Resume
As an **Enumerator**,
I want to **be able to pause and resume data collection sessions**,
so that I can handle interruptions without losing progress.

**Acceptance Criteria:**
1.  The system leverages Enketo's native "Save as Draft" functionality (drafts stored locally in browser IndexedDB).
2.  **Client-Side Only:** Drafts are stored on the Enumerator's device and are **NOT visible to Supervisors** until submitted to ODK Central.
3.  The Custom App Dashboard provides a "Resume Draft" link that retrieves saved surveys from local storage.
4.  **Device Loss Protection:** If an Enumerator is inactive on a draft for >15 minutes, system auto-submits a partial record with **"DRAFT_INCOMPLETE"** flag to ODK Central for backup/recovery purposes.
5.  The system implements auto-save every 30 seconds to prevent data loss during unexpected interruptions.

#### Story 3.4 In-App Communication for Enumerators
As an **Enumerator**,
I want to **send and receive messages with my assigned Supervisor directly within the application**,
so that I can get immediate support and stay informed.

**Acceptance Criteria:**
1.  Enumerator can compose and send messages to their assigned Supervisor.
2.  Enumerator can view a history of sent and received messages with notifications.
3.  The communication channel is secure and compliant with data privacy.

#### Story 3.5 Enumerator Dashboard Access
As an **Enumerator**,
I want to **view my personal performance metrics and daily/weekly targets on a dedicated dashboard**,
so that I can track my progress and manage my workload.

**Acceptance Criteria:**
1.  Enumerator can access a personalized dashboard upon login.
2.  The dashboard displays daily and weekly targets visually.
3.  The dashboard shows the number of completed and incomplete (Draft) forms.
4.  The dashboard is mobile-optimized for easy viewing in the field.

#### Story 3.6 Public Homepage & Self-Registration
As a **Public User**,
I want to **access a public homepage with information about the survey and a self-registration option**,
so that I can easily find relevant information and create an account to participate in data submission.

**Acceptance Criteria:**
1.  The application provides a public-facing homepage accessible without login.
2.  The homepage displays information about the survey's purpose and how to participate.
3.  The homepage features a prominent "Register" button for public users.
4.  Public users can complete a self-registration process to create an account.
5.  Self-registered public users are assigned a specific "Public User" role.
6.  **Google OAuth (Primary):** Public registration offers "Continue with Google" as the primary option for reduced friction and pre-verified email addresses (Google already verifies email ownership during OAuth).
7.  **Email Registration (Fallback):** Users without Google accounts can register via email with Hybrid Email Verification.

**Hybrid Email Verification (ADR-015):**
*   When users register via email (not Google OAuth), they receive a single email containing BOTH:
    *   **Magic Link:** One-click verification link (primary method, mobile-friendly)
    *   **6-digit OTP Code:** Fallback for when links don't work (corporate email filters, copy-paste from different device)
*   **Rationale:** No extra cost (same email, same API call). Covers all edge cases. User chooses whichever method works best for them.
*   **Expiry:** Both link and code expire after 15 minutes.
*   **Security:** Both methods are single-use. Using one invalidates the other.

**Layout Architecture (ADR-016):**
*   **PublicLayout:** Static website pages (homepage, about, registration, login) use a simplified header with "← Back to Homepage" navigation. Full header/footer integration planned for future iteration.
*   **DashboardLayout:** All authenticated role-based dashboards use a separate layout with role-specific navigation, sidebar, and footer. Users do NOT see the static website header/footer while in the dashboard.

#### Story 3.7 Public User Questionnaire Submission
As a **Public User**,
I want to **securely log in and fill out survey questionnaires via a web-based interface**,
so that I can contribute data to the labor statistics survey directly.

**Acceptance Criteria:**
1.  Public users can log in with their registered credentials.
2.  Public users can access and complete assigned survey questionnaires.
3.  Questionnaires for public users follow the same question logic and validation rules as enumerator forms.
4.  Completed public surveys are submitted to the same central database as enumerator submissions.
5.  Public users receive confirmation upon successful submission.

#### Story 3.8 Data Entry Clerk Interface (Paper Digitization)
As a **Data Entry Clerk**,
I want to **access a dedicated interface to accurately input responses from paper-based survey questionnaires**,
so that data collected via traditional methods can be digitised.

**Acceptance Criteria:**
1.  Data Entry Clerks can log in to a dedicated web interface optimized for rapid data entry via Enketo.
2.  **Keyboard-Optimized:** The interface is designed for high-speed transcription (minimal mouse usage).
3.  The interface includes all smart checks and validation rules (e.g., Verhoeff checksum for NIN).
4.  Clerks must select the relevant LGA and respondent details for each entry.
5.  Mechanisms are included to track which paper forms have been digitised to prevent duplicates.

## Epic 4: Supervisor Oversight & Field Management
**Goal:** Empower Supervisors with a dedicated dashboard for real-time team activity monitoring and automated alerts.

#### Story 4.1 Supervisor Dashboard & Team Monitoring
As a **Supervisor**,
I want to **view a comprehensive dashboard displaying the progress, activity, and key metrics of all my assigned enumerators**,
so that I can quickly assess team performance and identify areas needing attention.

**Acceptance Criteria:**
1.  Supervisor dashboard displays a list of all assigned enumerators with their current status (e.g., active, last sync).
2.  Dashboard shows each enumerator's daily quota progress (completed forms vs. target).
3.  Dashboard provides a visual overview (e.g., map view) of submitted forms within the supervisor's assigned area.
4.  Dashboard displays alerts for unread messages from enumerators.
5.  Dashboard includes performance trends and drill-down metrics (e.g., average time per survey).

#### Story 4.2 Supervisor In-App Communication
As a **Supervisor**,
I want to **send and receive messages with my assigned enumerators, and broadcast messages to my entire team**,
so that I can provide real-time support and guidance.

**Acceptance Criteria:**
1.  Supervisor can compose and send individual messages or broadcast messages to all assigned enumerators.
2.  Supervisor can view a history of all sent and received messages.
3.  The communication channel is secure and supports rich text or attachments.

#### Story 4.3 Context-Aware Fraud Alerts (Supervisor)
As a **Supervisor**,
I want to **receive intelligent alerts for potential fraud and be able to verify valid mass-events**,
so that I can distinguish between cheating and legitimate fieldwork.

**Acceptance Criteria:**
1.  System generates "Cluster Warnings" (>3 submissions/15m/<1hr) and "Quality Warnings" (<3min duration).
2.  **Flag, Don't Block:** These submissions are marked "Pending Verification" but are **not** rejected automatically.
3.  **Bulk Verification:** Supervisor can select a flagged cluster and click "Verify Event" (e.g., "Union Meeting") to clear the flags for the entire group.
4.  Supervisor can "Reject" individual submissions if fraud is confirmed.
5.  All verification actions are logged in the audit trail.

#### Story 4.4 Flagged Submission Management (Reassignment & Re-verification)
As a **Supervisor**,
I want to **review lists of flagged submissions and reassign them for re-verification**,
so that data quality issues can be resolved efficiently.

**Acceptance Criteria:**
1.  **Clarification:** "Incomplete forms" refers to submissions marked **"Pending Verification"** by fraud detection (NOT client-side drafts, which are invisible to Supervisors per Story 3.3).
2.  Supervisor can view a list of all flagged submissions from enumerators under their supervision with reason for flagging (Cluster, Speed, Pattern).
3.  Supervisor can reassign a flagged submission to another enumerator for re-verification or field re-survey.
4.  Reassignment creates a new survey instance linked to the original submission for audit trail purposes.

## Epic 5: High-Level Reporting & Data Insights
**Goal:** Deliver read-only dashboards and customizable reporting tools for high-level stakeholders.

#### Story 5.1 High-Level Data Overview Dashboard
As a **Government Official** or **Verification Assessor**,
I want to **access a read-only dashboard that provides an immediate, high-level overview of key data collection metrics**,
so that I can quickly gauge the overall progress of the survey.

**Acceptance Criteria:**
1.  Dashboard displays real-time total enumerated respondents and total per LGA.
2.  Dashboard provides a high-level summary of data collection pace.
3.  Dashboard is read-only and optimized for quick review on multiple device types.

#### Story 5.2 Customizable Reporting & Query Builder
As a **Government Official** or **Verification Assessor**,
I want to **generate customizable reports and build complex queries on the collected data**,
so that I can extract specific information for policy-making.

**Acceptance Criteria:**
1.  Users can select various data parameters (demographics, LGA, economic indicators) for report generation.
2.  Users can apply filters and sorting to narrow down data sets.
3.  Users can export generated reports in common formats (e.g., CSV, PDF).
4.  The system allows for saving frequently used query templates.

#### Story 5.3 Data Visualization Tools
As a **Government Official** or **Verification Assessor**,
I want to **visualize collected data through various interactive charts and graphs**,
so that I can easily identify trends and understand complex information.

**Acceptance Criteria:**
1.  The dashboard provides interactive bar and line charts for trend analysis.
2.  Users can compare data metrics across multiple enumeration areas.
3.  Visualizations are exportable as images or embedded into reports.

#### Story 5.4 Geographical Data Analysis
As a **Government Official** or **Verification Assessor**,
I want to **analyze collected data geographically through interactive maps**,
so that I can identify regional disparities and inform targeted interventions.

**Acceptance Criteria:**
1.  The system provides interactive heat maps representing key labor statistics (e.g., unemployment rates) across districts.
2.  Users can filter mapped data by various parameters.
3.  Maps allow for zooming, panning, and drilling down into specific LGAs.

#### Story 5.5 Verification Assessor Audit Queue
As a **Verification Assessor**,
I want to **audit flagged submissions and approve/reject them**,
so that the final data registry is 100% verified and trustworthy.

**Acceptance Criteria:**
1.  Assessor can view a "Verification Queue" of submissions flagged with high Fraud Scores.
2.  Assessor can view detailed evidence (GPS clustering, completion time, response logic).
3.  Assessor can mark a submission as "Verified" or "Rejected" (Triggering a notification).

## Epic 6: Advanced Data Integrity & System Accountability
**Goal:** Implement robust data integrity checks, fraud detection scoring, and immutable audit trails.

#### Story 6.1 Comprehensive Data Integrity Checks
As a **Super Admin**,
I want to **detect and manage various data quality issues such as inconsistent responses and mathematical invalidity**,
so that the collected information is accurate and reliable.

**Acceptance Criteria:**
1.  **NIN Integrity:** The system shall utilize the **Verhoeff Checksum Algorithm** to validate respondent NINs in the field.
2.  System flags forms with internally inconsistent data (e.g., employed but no job activity).
3.  System flags statistically significant outlier data points for review.
4.  Super Admin can configure sensitivity thresholds for outlier detection.

#### Story 6.2 Fraud Scoring Engine (Ingestion Pipeline)
As a **System**,
I want to **analyze incoming ODK submissions for fraud signals (GPS, Time, Logic)**,
so that Supervisors are alerted immediately to potential fraud.

**Acceptance Criteria:**
1.  Engine runs automatically upon webhook ingestion from ODK Central.
2.  **Duration Check:** Flags submissions where (End Time - Start Time) < Threshold (e.g., 2 minutes for 50 questions).
3.  **GPS Clustering:** Flags submissions that are geographically identical to previous submissions by the same enumerator ("filling at a spot").
4.  **Logic Checks:** Identify patterns of "Straight-lining" (choosing the first option for every question).
5.  Engine updates the `FraudScore` on the record in the App Database.

#### Story 6.3 Immutable Audit Trails
As a **Super Admin**,
I want to **access detailed and tamper-proof audit trails of all user actions and system changes**,
so that I can ensure accountability and conduct thorough investigations.

**Acceptance Criteria:**
1.  All user logins, data submissions, edits, deletions, and system configuration changes are logged.
2.  Audit logs record: Who performed the action, What was performed, When it occurred, and associated data.
3.  Audit logs are read-only and protected against modification or deletion.

#### Story 6.4 System Health Monitoring & Alerts
As a **Super Admin**,
I want to **monitor the real-time health and performance of the entire system and receive proactive alerts**,
so that I can ensure continuous operation.

**Acceptance Criteria:**
1.  Super Admin dashboard displays key system health metrics (server uptime, database performance, sync queue status).
2.  Super Admin receives automated alerts for critical failures, low disk space, or significant sync delays.

#### Story 6.5 Mass Data Operations for Super Admin
As a **Super Admin**,
I want to **perform bulk actions on user accounts and collected data**,
so that I can efficiently manage the system.

**Acceptance Criteria:**
1.  Super Admin can suspend/reactivate multiple accounts simultaneously.
2.  Super Admin can reassign a large batch of incomplete forms.
3.  Super Admin can initiate secure, encrypted bulk exports of collected data.

#### Story 6.6 Manual Data Export & Physical Archiving
As a **Super Admin**,
I want to **manually trigger a full database backup and download it to my local machine**,
so that I can maintain a physical copy for ultimate redundancy.

**Acceptance Criteria:**
1.  Interface provides a "Generate Full Backup" button.
2.  System generates a compressed SQL dump of the App Database for secure download.
3.  The export process must not interrupt live data collection.

#### Story 6.7 Staff Remuneration Management (Tranches, Bulk Recording & Disputes)
As a **Super Admin** and **Staff Member**,
I want to **manage payment records and raise disputes if payments are missing**,
so that remuneration is transparent and issues are resolved quickly.

**Acceptance Criteria:**
1.  **Tranche Support:** System allows recording multiple payments per user (e.g., "Tranche 1", "Tranche 2").
2.  **Pre-configured Payment Amounts:** Super Admin must configure standard payment amounts (e.g., "N5,000 per Enumerator per Tranche") with approval workflow. Ad-hoc amounts require justification field.
3.  **Bulk Recording:** Admin can filter users (Role/LGA) and bulk-record payments with: `Amount`, `Date`, `Description`, `Bank Reference Number` (optional), and `Transfer Screenshot Upload` (optional for verification).
4.  **Immutable Records:** Payment records are **append-only** once created. Modifications create a new version with full change history visible in audit trail.
5.  **Notification:** Automated email/SMS sent to staff upon recording with payment details.
6.  **Dispute Mechanism:**
    *   Staff can view their "Payment History" on their dashboard.
    *   Staff can click **"Report Issue"** on a specific payment record.
    *   Staff enters a detailed comment (e.g., "Not received yet - checked bank account on [date]").
    *   Status changes to "Disputed" (highlighted in red on Admin dashboard).
7.  **Dispute Resolution:**
    *   Super Admin sees a "Payment Disputes" widget on their dashboard showing all disputed payments.
    *   Admin must provide **"Resolution Evidence"** (e.g., "Confirmed with bank on [date] - payment sent to account XXX").
    *   Admin marks dispute as "Resolved" with evidence attached.
    *   Staff can **re-open dispute** if payment still not received after resolution.
8.  **Audit & Controls:** All payment recording, modifications, disputes, and resolutions are logged in immutable audit trail. System prevents Super Admins from recording payments to their own accounts (requires secondary Admin approval).

## Epic 7: Public Skills Marketplace
**Goal:** Create a public-facing platform for skilled workers with robust data privacy and security.

#### Story 7.1 Marketplace Data Extraction
As a **System**,
I want to **extract marketplace profiles from survey submissions if consent is given**,
so that the public database is populated automatically.

**Acceptance Criteria:**
1.  On ingestion, check the `consent_marketplace` field. If "Yes", extract Profession, LGA, and Experience Level.
2.  The consent screen clearly explains that an anonymous profile will be publicly displayed.
3.  If consent is denied, no marketplace profile is created for this respondent.

#### Story 7.2 Profile Enrichment & Enhanced Consent
As a **Respondent** who has consented to an anonymous profile,
I want to **optionally enrich my marketplace profile with my name and contact details**,
so that potential employers can contact me directly.

**Acceptance Criteria:**
1.  **Secure Profile Access:** During survey submission, if `consent_enriched` = "Yes", system generates a unique **Profile Edit Token** (32-character random string) stored in database.
2.  Token is sent to respondent's phone via SMS: "Edit your profile: https://oslsr.gov.ng/profile/edit?token=ABC123XYZ..."
3.  Respondent accesses the Profile Editor by clicking the link (no separate login required - token authenticates them).
4.  Profile Editor allows adding: Name (pre-filled from survey), Contact Info, Bio (max 150 chars), and Portfolio URL.
5.  **Token Security:** Tokens expire after 90 days. Rate-limited to max 3 token requests per NIN per day to prevent brute-force attacks.
6.  **Forgot Token:** Respondents can request a new token via "Resend Link" by entering their NIN + Phone Number (system validates match before sending).
7.  A second, explicit consent checkbox is required: "I agree to make my personal details publicly visible to registered employers" before saving enriched profile.

#### Story 7.3 Public Marketplace Search (3-Route Structure)
As a **Public Searcher**,
I want to **search and filter the marketplace for skilled workers by trade, LGA, and years of experience**,
so that I can efficiently find local talent.

**Acceptance Criteria:**
1.  **Route Structure:**
    *   `/marketplace`: Static Landing Page (SEO optimized).
    *   `/marketplace/search`: Dynamic Search Engine (Redacted data, Rate limited).
    *   `/marketplace/profile/:id`: Full Profile View (Secure, Canonical URL).
2.  **Enhanced Bot Protection:**
    *   **Rate Limiting:** 30 search queries per IP per minute (per NFR4.4). CAPTCHA required after 10 queries in 5 minutes.
    *   **Honeypot Fields:** Hidden form fields that bots auto-fill, triggering instant block
    *   **JavaScript Challenge:** hCaptcha or Cloudflare Turnstile for suspicious activity
    *   **Device Fingerprinting:** Track patterns across IP changes to detect sophisticated scrapers
    *   **Pagination Limit:** Max 100 profiles per query result (prevents bulk data extraction)
3.  **Data Minimization:** Search results display *only* anonymous info: Profession, LGA, Experience Level.
4.  **Fuzzy Search:** Implements PostgreSQL Trigram matching to handle typos.

#### Story 7.4 Registered Searcher Contact & Logging
As a **Public Searcher**,
I want to **register and log in to view the full contact details of a skilled worker**,
so that I can initiate direct contact while my access is logged.

**Acceptance Criteria:**
1.  Clicking "Reveal Contact" on a profile page checks login and challenges with a **CAPTCHA**.
2.  Upon success, Name and Phone Number are revealed.
3.  **Audit Trail:** System logs event: "Searcher [ID] viewed Contact of Worker [ID] at [Timestamp]" with device fingerprint and IP address.
4.  **Enhanced Rate Limit:** 50 contacts per authenticated user per 24 hours, enforced by **user account + device fingerprint** (not just IP) to prevent circumvention via VPN/proxies. System returns 429 Too Many Requests with retry-after header when limit exceeded.

#### Story 7.5 Admin Verification & Safety Oversight
As a **Super Admin**,
I want to **manage the verification status of skilled worker profiles and apply a "Government Verified" badge**,
so that I can ensure the trustworthiness of the marketplace.

**Acceptance Criteria:**
1.  Super Admin can review credentials and apply a "Government Verified" badge.
2.  Users can report fraudulent profiles; Admin can take action (removal, warning).
3.  All actions and abuse reports are logged in the audit trail.

#### Story 7.6 Help Center & Role-Specific User Guides
As a **User**,
I want to **access a comprehensive help center with clear, searchable guides tailored to my role**,
so that I can learn how to use the application effectively.

**Acceptance Criteria:**
1.  A "Help & Support" section is available with public guides and restricted staff guides.
2.  Dedicated guides are provided for **all** roles (Public, Enumerator, Supervisor, Admin, Official).
3.  Internal guides include workflows like "XLSForm Upload" and "Fraud Alert Management".
4.  Admin has an interface to create and publish help articles separately from core code.

#### Story 7.7 Marketplace Architecture & Security
As a **System Architect**,
I want to **implement the Marketplace using a 3-Route structure and Defense-in-Depth security**,
so that the system is resilient against bots and abuse.

**Acceptance Criteria:**
1.  Marketplace queries run against a **Read-Only database replica** to ensure Enumerator data collection performance.
2.  Rate limiting is IP-based via Sidecar Redis.
3.  Redacted profiles are the default state for all search results.

## Annex: Supplemental Specifications
The following official documents are incorporated by reference as the definitive technical specifications:
1.  **Master Questionnaire Schema:** Located at `docs/questionnaire_schema.md`.
2.  **Homepage & Navigation Specification:** Located at `docs/homepage_structure.md`.

## PO Validation Decision
**Final Decision:** APPROVED AS PRODUCTION-READY SPECIFICATION (V7.5)
**Review Status:** All critique issues resolved - Fixed terminology, clarified photo requirements, enhanced data routing clarity
**Validator:** Awwal (PO) with Claude Code adversarial review
**Date:** 2026-01-04 (V7.5)
**Quality Gate:** PASSED - No blocking issues remain. PRD is comprehensive, unambiguous, and technically sound.
**Workflow Strategy:** SEQUENTIAL (not concurrent) - PRD → Architecture → UX → Epics & Stories
**Next Stage:** Architecture Design (Begin when ready)

## Next Steps (Sequential Workflow)

### **STEP 1: Architecture Design** (Do This First)

#### Architect Prompt
"Design the **Composed Modular Monolith** based on OSLSR PRD v7.5 (all critique issues resolved, data routing clarified). Define the **Lean Infrastructure Stack** (Docker, Single self-hosted VPS, Sidecar Redis, Postgres Queue, ODK Central self-hosted).

**Key Requirements:**
- **Scalability:** Support unlimited staff accounts (baseline 200, flexible vertical scaling). No hard caps.
- **Role-Based Access:** Implement clear RBAC boundaries:
  - Field Staff (Enumerators/Supervisors): LGA-restricted, limited READ, WRITE data
  - Back-Office (Assessors/Officials): State-wide, full PII READ, limited/no WRITE
  - Assessors: Can approve/reject. Officials: READ-ONLY.
- **Data Security:** Global NIN uniqueness (DB-level UNIQUE constraint), Verhoeff validation, PII access controls
- **Fraud Detection:** Configurable thresholds (cluster/speed/pattern) via Admin UI
- **Marketplace:** 3-Route structure with Read-Only replica, enhanced bot protection (CAPTCHA, fingerprinting)
- **ODK Integration:** Self-hosted ODK Central (NDPA compliance), idempotent webhook handling with exponential backoff retry, encrypted token storage (AES-256), error recovery (`/admin/missing-submissions`)
- **Backup Strategy:** Dual-database daily backups (App DB + ODK DB) to S3, real-time media sync, 7-year retention

Reference: `docs/questionnaire_schema.md` (XLSForm fields), `docs/homepage_structure.md` (routes). All technical ambiguities resolved - proceed with confidence."

---

### **STEP 2: UX Design** (Do This After Architecture)

#### UX Expert Prompt
"Based on the completed Architecture Document and OSLSR PRD v7.5, design high-level user flows and wireframes. The Architecture will define technical constraints (API structure, data access patterns, performance limits) that inform UX decisions.

**Focus Areas:**
- Mobile-first PWA for Enumerators (Android 8.0+, Chrome 80+)
- Role-specific dashboards (Field Staff vs Back-Office vs Admin)
- Two-stage marketplace consent flow (`consent_marketplace` → `consent_enriched`)
- ID Card generation/verification workflow
- Optimistic UI updates, skeleton screens, error boundaries
- Paper form tracking interface for Data Entry Clerks

Reference: Architecture Document (API design), `docs/questionnaire_schema.md` (data fields), `docs/homepage_structure.md` (navigation). Wait for Architecture completion before starting."
