# CHAPTER 13: REGISTRY PLATFORM DEVELOPMENT & CAPABILITIES

---

## 13.1 Introduction

This chapter documents the design, development, and deployment of the **Oyo State Labour & Skills Registry (OSLSR)** digital platform — the core technology infrastructure upon which the State Labour Register operates. The platform was purpose-built to address the specific requirements of workforce enumeration in a developing economy context, incorporating offline-capable mobile data collection, multi-channel registration, automated fraud detection, and a public-facing skills marketplace.

The platform is **operational and deployed**, accessible to authorised users from the on-premises Data Center workstations and via any internet-connected device.

---

## 13.2 Platform Architecture

### 13.2.1 Architecture Overview

The OSLSR platform employs a **modular monolith architecture** — a proven design pattern that combines the simplicity of a single deployable unit with the maintainability of modular internal boundaries. This architecture was selected over microservices based on the project's scale requirements (200+ concurrent staff users, 1,000 concurrent public users) and the operational simplicity demanded by a single-VPS deployment.

```
┌────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                                 │
│                                                                     │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────┐   │
│  │  Mobile PWA  │   │  Desktop Web │   │   Public Website     │   │
│  │(Enumerators) │   │  (Staff)     │   │   (Self-Registration │   │
│  │ Offline-     │   │              │   │    + Marketplace)    │   │
│  │ Capable      │   │              │   │                      │   │
│  └──────┬───────┘   └──────┬───────┘   └──────────┬───────────┘   │
│         │                  │                       │               │
└─────────┼──────────────────┼───────────────────────┼───────────────┘
          │          HTTPS / TLS 1.2+                │
┌─────────┼──────────────────┼───────────────────────┼───────────────┐
│         ▼                  ▼                       ▼               │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                      NGINX REVERSE PROXY                     │  │
│  │  • SSL Termination   • Rate Limiting   • Static Assets      │  │
│  │  • Security Headers  • GZIP            • Content Security   │  │
│  │                                          Policy (CSP)       │  │
│  └─────────────────────────┬───────────────────────────────────┘  │
│                             │                                     │
│  ┌─────────────────────────┼───────────────────────────────────┐  │
│  │                   APPLICATION SERVER                         │  │
│  │                                                              │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │  │
│  │  │   Auth   │ │  Staff   │ │  Survey  │ │  Marketplace │  │  │
│  │  │ Module   │ │ Mgmt     │ │ Engine   │ │   Module     │  │  │
│  │  │(JWT+Redis│ │(RBAC,    │ │(Forms,   │ │(Search, FTS, │  │  │
│  │  │Blacklist)│ │Lifecycle)│ │Offline,  │ │ Profiles,    │  │  │
│  │  │         │ │          │ │Ingestion)│ │ Contact)     │  │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────┘  │  │
│  │                                                              │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │  │
│  │  │  Fraud   │ │ Remuner- │ │  Audit   │ │  Monitoring  │  │  │
│  │  │Detection │ │  ation   │ │  Trails  │ │   & Health   │  │  │
│  │  │ Engine   │ │  Module  │ │(Immutable│ │  (Metrics,   │  │  │
│  │  │(GPS,Speed│ │(Payments,│ │ SHA-256  │ │   Alerts)    │  │  │
│  │  │ Pattern) │ │ Dispute) │ │ Chained) │ │              │  │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────┘  │  │
│  │                                                              │  │
│  └──────────────────────────┬──────────────────────────────────┘  │
│                              │                                    │
│  ┌───────────┐  ┌───────────┴────────┐  ┌────────────────────┐  │
│  │   Redis   │  │    PostgreSQL 15   │  │   Offsite Backup   │  │
│  │  Cache &  │  │   (Primary DB)     │  │  (S3-Compatible)   │  │
│  │Rate Limit │  │  UUIDv7 PKs        │  │  Daily Encrypted   │  │
│  │Session Mgr│  │  Full-Text Search  │  │  7-Year Retention  │  │
│  └───────────┘  └────────────────────┘  └────────────────────┘  │
│                                                                   │
│                        SERVER LAYER                                │
└───────────────────────────────────────────────────────────────────┘
```

### 13.2.2 Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Frontend** | React | 18.3 | User interface framework |
| | Vite | 6.x | Build tooling with hot module replacement |
| | Tailwind CSS | v4 | Utility-first styling framework |
| | shadcn/ui | Latest | Accessible component library (Radix UI) |
| | TanStack Query | Latest | Server state management and caching |
| | React Hook Form + Zod | Latest | Form handling with runtime validation |
| | React Router | v7 | Client-side routing with role isolation |
| **Backend** | Node.js | 20 LTS | Server runtime |
| | Express.js | Latest | REST API framework |
| | Drizzle ORM | 1.x | TypeScript-first database ORM |
| | Pino | 9.x | Structured JSON logging |
| **Database** | PostgreSQL | 15 | Relational database with JSONB and PostGIS |
| **Cache/Queue** | Redis | 7 | Caching, rate limiting, session management |
| | BullMQ | Latest | Asynchronous job queue processing |
| **Security** | Helmet | Latest | Security headers including CSP |
| | bcrypt | 6.x | Password hashing (12 salt rounds) |
| | JWT | Latest | Stateless authentication tokens |
| **Validation** | Zod | 3.x | Runtime type validation (shared frontend/backend) |
| **Identity** | uuidv7 | Latest | Time-ordered universally unique identifiers |

---

## 13.3 Platform Capabilities

The following table summarises the platform's operational capabilities:

| # | Capability | Description | Status |
|---|-----------|-------------|:------:|
| 1 | **Multi-Channel Data Collection** | Field enumeration (mobile PWA), desktop data entry, and public web self-registration — three distinct channels feeding a unified registry | ✓ Operational |
| 2 | **Offline-Capable PWA** | Progressive Web Application with Service Worker caching and IndexedDB storage enabling 7-day offline data collection with automatic synchronisation | ✓ Operational |
| 3 | **Native Form Renderer** | One-question-per-screen survey interface with skip logic, real-time validation, and auto-save; supports the full 150-skill taxonomy | ✓ Operational |
| 4 | **National Identity Verification** | NIN (National Identity Number) validation using Modulus 11 checksum at point of entry, with global uniqueness enforcement across all submission channels | ✓ Operational |
| 5 | **Role-Based Access Control** | Eight (8) distinct user roles with granular permissions: Super Admin, Admin, Supervisor, Enumerator, Data Entry Clerk, Verification Assessor, Government Official, Public User | ✓ Operational |
| 6 | **Context-Aware Fraud Detection** | Automated detection of GPS clustering (multiple submissions from same location), speed-run submissions (implausibly fast completion), and straight-lining (repetitive response patterns); configurable thresholds | ✓ Operational |
| 7 | **Public Skills Marketplace** | Searchable public directory of anonymised worker profiles with government verification badges, full-text search, trade/LGA filtering, and CAPTCHA-protected contact reveal | ✓ Operational |
| 8 | **Staff Remuneration Management** | Bulk payment recording with bank reference/receipt upload, payment history, dispute mechanism (report → dispute → resolution → acknowledgement), and immutable records | ✓ Operational |
| 9 | **Immutable Audit Trails** | SHA-256 hash-chained, append-only audit log recording all user actions, PII access, and administrative operations; tamper-proof with database trigger protection; NDPA-compliant 7-year retention | ✓ Operational |
| 10 | **System Health Monitoring** | Real-time dashboard tracking CPU, RAM, disk utilisation, database performance (p95 latency), job queue depth, and email delivery status; configurable alert thresholds with email notifications | ✓ Operational |
| 11 | **Automated Backup System** | Daily encrypted database backups to offsite storage via scheduled job (2:00 AM WAT); 7-day daily retention + 7-year monthly archives; tested restore procedure | ✓ Operational |
| 12 | **Data Export & Reporting** | Role-authorised CSV and PDF export of registry data with audit logging; filtered exports by LGA, date range, occupation, and status | ✓ Operational |
| 13 | **In-App Team Messaging** | Real-time messaging system for field team coordination between Supervisors and Enumerators; broadcast capability; message audit trail | ✓ Operational |
| 14 | **ID Card Generation** | Digital ID card generation with photo, QR code for public verification, and role-specific design; PDF output for printing | ✓ Operational |
| 15 | **Super Admin View-As** | Debugging and oversight tool enabling Super Administrators to view the platform as any other role, with read-only enforcement and full audit trail | ✓ Operational |

---

## 13.4 User Role Architecture

The platform enforces strict role-based access control (RBAC) across eight distinct user roles. Each role has precisely defined permissions, ensuring that users can only access data and functions appropriate to their designated responsibilities.

```
┌─────────────────────────────────────────────────────────────────┐
│                     USER ROLE HIERARCHY                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ADMINISTRATIVE TIER                                            │
│  ┌─────────────┐  ┌─────────────┐                              │
│  │ Super Admin │  │    Admin    │                               │
│  │ (Full System│  │(Staff Mgmt, │                              │
│  │  Control)   │  │ ID Cards,   │                              │
│  │             │  │ Payments)   │                              │
│  └─────────────┘  └─────────────┘                              │
│                                                                  │
│  FIELD OPERATIONS TIER (LGA-Restricted)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐        │
│  │ Supervisor  │  │ Enumerator  │  │ Data Entry Clerk│        │
│  │(Team Mgmt,  │  │(Mobile Data │  │(Keyboard-First  │        │
│  │ Fraud Review│  │ Collection, │  │ Paper Form      │        │
│  │ Messaging)  │  │ Offline PWA)│  │ Digitisation)   │        │
│  └─────────────┘  └─────────────┘  └─────────────────┘        │
│                                                                  │
│  OVERSIGHT TIER (State-Wide, Read-Heavy)                        │
│  ┌─────────────────┐  ┌───────────────────┐                    │
│  │  Verification   │  │   Government      │                    │
│  │   Assessor      │  │    Official       │                    │
│  │(Audit Queue,    │  │(Read-Only         │                    │
│  │ Approve/Reject) │  │ Dashboards,       │                    │
│  │                 │  │ Policy Reports)   │                    │
│  └─────────────────┘  └───────────────────┘                    │
│                                                                  │
│  PUBLIC TIER (Self-Registered)                                  │
│  ┌─────────────────────────────────────────────────┐           │
│  │                 Public User                      │           │
│  │(Self-Registration, Survey Completion,            │           │
│  │ Marketplace Search, Contact Reveal)              │           │
│  └─────────────────────────────────────────────────┘           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 13.4.1 Access Control Matrix

| Function | Super Admin | Admin | Supervisor | Enumerator | Clerk | Assessor | Official | Public |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| System Configuration | ✓ | | | | | | | |
| Staff Management | ✓ | ✓ | | | | | | |
| Form Management | ✓ | ✓ | | | | | | |
| Survey Submission | | | | ✓ | ✓ | | | ✓ |
| Team Supervision | | | ✓ | | | | | |
| Fraud Alert Review | ✓ | | ✓ | | | | | |
| Submission Audit | | | | | | ✓ | | |
| Payment Management | ✓ | ✓* | | | | | | |
| Dashboard Analytics | ✓ | ✓ | ✓† | ✓† | | | ✓ | |
| PII Data Access | ✓ | ✓ | ✓† | | | ✓ | ✓ | |
| Data Export | ✓ | ✓ | | | | | ✓ | |
| Marketplace Search | ✓ | | | | | | | ✓ |
| Contact Reveal | | | | | | | | ✓‡ |
| View-As | ✓ | | | | | | | |

*\* Admin cannot record self-payments*
*† LGA-restricted scope only*
*‡ CAPTCHA + rate limited (50/24hr)*

---

## 13.5 Quality Assurance

### 13.5.1 Automated Testing

The OSLSR platform was subjected to comprehensive automated quality assurance testing:

| Test Category | Count | Pass Rate | Coverage |
|--------------|:-----:|:---------:|----------|
| API Unit & Integration Tests | 1,471 | 100% | All controllers, services, and routes |
| Frontend Component & Hook Tests | 2,093 | 100% | All pages, components, and hooks |
| **Total Automated Tests** | **3,564** | **100%** | **Full platform coverage** |

### 13.5.2 Security Assessment

A comprehensive security assessment was conducted against the OWASP Top 10 framework:

| OWASP Category | Assessment | Status |
|----------------|-----------|:------:|
| A01: Broken Access Control | Auth middleware, RBAC, LGA scope enforcement | ✓ Secure |
| A02: Cryptographic Failures | bcrypt 12 rounds, JWT HS256, httpOnly cookies | ✓ Secure |
| A03: Injection | Parameterised queries (Drizzle ORM), no raw HTML rendering | ✓ Secure |
| A04: Insecure Design | Multi-tier rate limiting, CAPTCHA, file validation | ✓ Secure |
| A05: Security Misconfiguration | Helmet CSP, security headers, hardened configuration | ✓ Secure |
| A06: Vulnerable Components | Dependency audit, CVE remediation, CI gate | ✓ Secure |
| A07: Authentication Failures | 15-min tokens, Redis sessions, JTI blacklist | ✓ Secure |
| A08: Data Integrity Failures | Immutable audit logs, hash chaining, DB triggers | ✓ Secure |
| A09: Logging & Monitoring | AuditService, PII access logging, prom-client metrics | ✓ Secure |
| A10: SSRF | No user-provided URLs for server-side fetching | ✓ Secure |

**All ten OWASP categories rated SECURE** — including one category (A05) that was identified and remediated during the assessment period.

---

## 13.6 Platform Screenshots

*[Refer to Appendix J: Plates 6–12 for platform screenshots demonstrating key interfaces]*

- **Plate 6**: Login and Authentication Screen
- **Plate 7**: Super Administrator Dashboard with real-time analytics
- **Plate 8**: Survey Form Renderer (mobile view) — one-question-per-screen interface
- **Plate 9**: Public Skills Marketplace search interface
- **Plate 10**: Fraud Detection dashboard with flagged submission alerts
- **Plate 11**: System Health Monitoring with CPU, RAM, and latency metrics
- **Plate 12**: Staff Remuneration Management — bulk payment recording

---

*Document Reference: CHM/OSLR/2026/001 | Chapter 13 | Chemiroy Nigeria Limited*
