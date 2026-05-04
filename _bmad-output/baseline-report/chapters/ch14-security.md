# 11. Security Architecture and Data Protection

---

## 11.1 Introduction

The protection of respondent data is a fundamental design principle of the OSLSR platform, not an afterthought. This chapter documents the security architecture, data protection measures, and compliance frameworks implemented to ensure the confidentiality, integrity, and availability of the State Labour Register data. The security posture was validated through a comprehensive assessment against the **OWASP (Open Web Application Security Project) Top 10** framework and mapped against the requirements of the **Nigeria Data Protection Act 2023 (NDPA)**.

---

## 11.2 Defence-in-Depth Architecture

The OSLSR platform employs a **six-layer defence-in-depth strategy**, multiple independent security controls operating at different architectural levels, ensuring that the compromise of any single layer does not result in a system-wide breach.

```
┌─────────────────────────────────────────────────────────────┐
│                    DEFENCE-IN-DEPTH                          │
│                    6 Security Layers                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Layer 6: EDGE PROTECTION                                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ NGINX: Rate Limiting (IP-based), SSL/TLS,           │    │
│  │ Security Headers (CSP, HSTS, X-Frame-Options)       │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Layer 5: APPLICATION SECURITY                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Helmet CSP, Input Validation (Zod), Parameterised   │    │
│  │ Queries (Drizzle ORM), Mass Assignment Protection   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Layer 4: AUTHENTICATION & AUTHORISATION                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ JWT (15-min access + 7-day refresh), Redis Session  │    │
│  │ Blacklist, RBAC (8 roles), LGA Scope Enforcement    │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Layer 3: BOT & ABUSE PROTECTION (Public Routes)            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ hCaptcha, Device Fingerprinting, Honeypot Fields,   │    │
│  │ Progressive Rate Limiting, Pagination Limits         │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Layer 2: DATA INTEGRITY                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Immutable Audit Logs (SHA-256 Hash Chain),          │    │
│  │ Database Triggers (TRUNCATE/UPDATE protection),     │    │
│  │ ACID Transactions, SELECT FOR UPDATE (TOCTOU)       │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Layer 1: INFRASTRUCTURE SECURITY                           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Encrypted Backups (S3), AES-256 at Rest,            │    │
│  │ TLS 1.2+ in Transit, Dependency Audit (CI Gate),    │    │
│  │ Firewall Rules, SSH Key-Only Access                 │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 11.3 Authentication and Session Management

| Control | Implementation |
|---------|---------------|
| **Password Hashing** | bcrypt with 12 salt rounds, computationally resistant to brute-force attacks |
| **Access Tokens** | JSON Web Tokens (JWT) with 15-minute expiry, minimises exposure window from token compromise |
| **Refresh Tokens** | 7-day expiry, stored in httpOnly secure cookies (inaccessible to JavaScript) |
| **Session Blacklist** | Redis-backed token blacklist; revoked tokens are instantly invalidated across all server instances |
| **Rate Limiting** | Login attempts rate-limited to prevent credential stuffing attacks |
| **Token Revocation** | All active sessions revoked on password change; individual session revocation supported |
| **Multi-Role Isolation** | Each of the five operational roles and the Public tier restricted to designated routes; cross-role access attempts logged and rejected |

---

## 11.4 OWASP Top 10 Compliance Assessment

A comprehensive security assessment was conducted against the OWASP Top 10 (2021 edition), the industry-standard framework for web application security:

| # | OWASP Category | Risk Level | Controls Implemented | Status |
|---|---------------|:----------:|---------------------|:------:|
| A01 | Broken Access Control | Critical | Auth middleware on all routes; RBAC enforcement; LGA scope restriction; horizontal access control; 403 tests per endpoint | ✓ **SECURE** |
| A02 | Cryptographic Failures | Critical | bcrypt 12 rounds; HS256 JWT with ≥32-char secret; httpOnly/secure/sameSite:strict cookies; TLS 1.2+ enforced | ✓ **SECURE** |
| A03 | Injection | Critical | Drizzle ORM parameterised queries; zero `dangerouslySetInnerHTML`; server-generated filenames; database lookup for file serving | ✓ **SECURE** |
| A04 | Insecure Design | High | Multi-tier rate limiting; hCaptcha on public forms; triple-layer file upload validation (extension + MIME + magic bytes); configurable fraud detection | ✓ **SECURE** |
| A05 | Security Misconfiguration | High | Helmet with custom CSP (11 directives); `strict-dynamic` script-src; HSTS; X-Frame-Options DENY; report-only monitoring | ✓ **SECURE** |
| A06 | Vulnerable Components | High | `pnpm audit` CI gate; CVE remediation pipeline; exact version pinning for security-critical dependencies; quarterly review schedule | ✓ **SECURE** |
| A07 | Authentication Failures | High | 15-min token expiry; Redis session management; JTI blacklist; token revocation on password change | ✓ **SECURE** |
| A08 | Data Integrity Failures | Medium | Immutable audit logs with SHA-256 hash chaining; database triggers preventing modification/deletion; atomic ACID transactions | ✓ **SECURE** |
| A09 | Logging & Monitoring | Medium | AuditService (all actions logged); PII access logging; structured logging (Pino); prom-client metrics; automated backup monitoring | ✓ **SECURE** |
| A10 | SSRF | Low | No user-provided URLs processed server-side; all external API calls use hardcoded, validated URLs | ✓ **SECURE** |

**Result: A- security posture (state-government-grade) across all OWASP Top 10 categories**

---

## 11.5 Nigeria Data Protection Act 2023 (NDPA) Compliance

The OSLSR platform's data handling practices were assessed against the requirements of the Nigeria Data Protection Act 2023 and its predecessor, the Nigeria Data Protection Regulation (NDPR) 2019.

| NDPA Requirement | OSLSR Implementation | Compliance |
|-----------------|---------------------|:----------:|
| **Lawful Basis for Processing** | Explicit informed consent obtained before any data collection (Survey Q1.2); government mandate for registry establishment | ✓ Compliant |
| **Purpose Limitation** | Data collected exclusively for the stated registry purpose; platform enforces purpose-specific data access | ✓ Compliant |
| **Data Minimisation** | Only data necessary for registry objectives collected; marketplace profiles anonymised by default | ✓ Compliant |
| **Consent Management** | Two-stage progressive consent model: (1) Basic consent for registry participation; (2) Additional consent for Skills Marketplace inclusion; (3) Further consent for contact detail visibility | ✓ Compliant |
| **Data Subject Rights** | Profile enrichment via edit token (respondent-initiated); data accessible to authorised roles only | ✓ Compliant |
| **Data Security** | AES-256 encryption at rest; TLS 1.2+ in transit; RBAC; bcrypt password hashing | ✓ Compliant |
| **Data Retention** | 7-year retention period with automated backup lifecycle management (daily → monthly archival) | ✓ Compliant |
| **Breach Notification** | System health monitoring with alerting; audit trail enables forensic analysis; incident response documented | ✓ Compliant |
| **Cross-Border Transfer** | All primary data stored on servers; offsite backups to encrypted storage with data residency awareness | ✓ Compliant |
| **Data Protection Impact Assessment** | DPIA conducted as part of baseline study methodology (Chapter 9) | ✓ Compliant |

---

## 11.6 Data Encryption Standards

| Layer | Standard | Implementation |
|-------|----------|---------------|
| **Data in Transit** | TLS 1.2+ | All client-server communication encrypted via HTTPS; SSL certificates managed and auto-renewed |
| **Data at Rest** | AES-256 | Database storage encrypted; backup files encrypted before offsite transfer |
| **Password Storage** | bcrypt | 12 salt rounds; one-way hashing (passwords never stored in plaintext or reversible encryption) |
| **Audit Log Integrity** | SHA-256 | Hash chaining, each audit entry's hash incorporates the previous entry's hash, creating a tamper-evident chain |
| **Session Tokens** | HMAC-SHA256 | JWT tokens signed with server-side secret ≥32 characters; signature verification on every request |

---

## 11.7 Secure-by-Design Patterns

The following ten security patterns are embedded in the platform's codebase as mandatory conventions:

| # | Pattern | Description |
|---|---------|-------------|
| 1 | **Database-backed file serving** | All file downloads resolved via database record lookup, no direct filesystem path construction from user input |
| 2 | **Memory-only file uploads** | Uploaded files processed in memory (multer memoryStorage); never written to filesystem before validation |
| 3 | **Triple-layer upload validation** | File extension check + MIME type verification + magic byte analysis, all three must pass |
| 4 | **Shared Zod validation** | Same validation schemas enforced on both frontend and backend, single source of truth |
| 5 | **Parameterised queries exclusively** | All database queries via Drizzle ORM; zero string concatenation in SQL construction |
| 6 | **Server-generated filenames** | All stored files renamed with UUIDv7 identifiers; original filenames never used in storage paths |
| 7 | **Dual authentication** | SameSite strict cookies (CSRF protection) + Bearer token (API authentication) |
| 8 | **Redis-backed sessions** | Server-side session state with 8-hour inactivity timeout and 24-hour absolute timeout |
| 9 | **Fail-fast environment validation** | Required environment variables validated at application startup; missing variables cause immediate, informative failure |
| 10 | **Immutable audit logs** | SHA-256 hash chaining with database triggers preventing UPDATE, DELETE, and TRUNCATE operations on audit tables |

---

*Document Reference: CHM/OSLR/2026/002 | Chapter 14 | Chemiroy Nigeria Limited*
