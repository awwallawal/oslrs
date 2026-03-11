# APPENDIX H: DATA PROTECTION IMPACT ASSESSMENT (DPIA) SUMMARY

---

## H.1 Assessment Overview

| Parameter | Detail |
|-----------|--------|
| **Assessment Title** | DPIA for the Oyo State Skilled Labour Register |
| **Data Controller** | Ministry of Trade, Industry, Investment and Cooperatives, Oyo State |
| **Data Processor** | Chemiroy Nigeria Limited |
| **Legal Framework** | Nigeria Data Protection Act 2023 (NDPA); Nigeria Data Protection Regulation 2019 (NDPR) |
| **Assessment Date** | January 2026 |
| **Assessment Conducted By** | Lawal Awwal, Principal Consultant |

---

## H.2 Purpose of Processing

The OSLSR collects and processes personal data for the following purposes:

1. **Registry establishment**: Creating a digital register of skilled workers in Oyo State for government labour market planning
2. **Skills marketplace**: Operating a public directory enabling employers to find and engage skilled workers
3. **Policy analysis**: Generating aggregate labour market statistics to inform state economic policy
4. **Training needs assessment**: Identifying skills gaps and unmet training demand across the state

---

## H.3 Categories of Personal Data Processed

| Category | Data Elements | Sensitivity | Lawful Basis |
|----------|-------------|:-----------:|:------------:|
| **Identity** | Name, NIN, phone number, date of birth | High | Consent (Q1.2) + Legitimate interest (government mandate) |
| **Demographics** | Gender, marital status, education, disability | Medium | Consent |
| **Employment** | Occupation, employment type, income, hours worked | Medium | Consent |
| **Location** | LGA, GPS coordinates, business address | Medium | Consent |
| **Skills** | Primary skills, desired skills | Low | Consent |
| **Business** | Business name, CAC status, apprentice count | Low | Consent |
| **Household** | Household size, dependents, housing tenure | Medium | Consent |
| **Marketplace** | Professional bio, portfolio link | Low | Explicit consent (Q6.1, Q6.2) |

---

## H.4 Data Subject Rights

| NDPA Right | OSLSR Implementation |
|-----------|---------------------|
| **Right to be informed** | Survey introduction (Q1.1) explains purpose, data handling, and rights |
| **Right to consent** | Explicit consent (Q1.2) required before any data collection |
| **Right to access** | Respondents can access their data through edit token mechanism |
| **Right to rectification** | Profile enrichment/correction via edit token |
| **Right to withdraw consent** | Marketplace opt-out available; registry withdrawal through Ministry request |
| **Right to data portability** | Data export functionality available to authorised administrators |
| **Right to object** | Free to decline survey participation (Q1.2 = No) at any point |

---

## H.5 Risk Assessment

| # | Risk | Likelihood | Impact | Mitigation | Residual Risk |
|---|------|:----------:|:------:|-----------|:-------------:|
| 1 | Unauthorised access to PII | Low | High | RBAC, JWT auth, bcrypt, TLS, Redis session management | **LOW** |
| 2 | Data breach / exfiltration | Low | Critical | 6-layer defence-in-depth, OWASP compliance, audit logs | **LOW** |
| 3 | Excess data collection | Very Low | Medium | Data minimisation (36 questions, purpose-specific), shared Zod schemas | **VERY LOW** |
| 4 | Purpose drift | Low | Medium | Purpose limitation in architecture; role-based data access; audit trail | **LOW** |
| 5 | Inadequate consent | Very Low | High | Explicit consent gate (Q1.2); 3-tier progressive consent for marketplace | **VERY LOW** |
| 6 | Data retention beyond purpose | Low | Medium | 7-year retention policy aligned with NDPA; automated backup lifecycle | **LOW** |
| 7 | Cross-border data transfer | Low | Medium | Primary data on Nigerian infrastructure; offsite backups encrypted; data residency awareness | **LOW** |
| 8 | Enumerator data mishandling | Medium | Medium | Training (Module A), device management, supervision, fraud detection | **LOW** |
| 9 | Loss of data integrity | Very Low | Critical | Immutable audit logs (SHA-256 chain), database triggers, ACID transactions | **VERY LOW** |
| 10 | Marketplace privacy violation | Low | High | Progressive consent, CAPTCHA rate-limited contact reveal, anonymisation by default | **LOW** |

---

## H.6 Technical and Organisational Measures

### Technical Measures

| Control | Description |
|---------|-------------|
| Encryption in transit | TLS 1.2+ on all connections |
| Encryption at rest | AES-256 database encryption; encrypted backups |
| Access control | JWT-based authentication; 8-role RBAC; LGA scope enforcement |
| Password security | bcrypt 12 salt rounds; 15-min token expiry |
| Session management | Redis-backed session blacklist; token revocation on password change |
| Input validation | Shared Zod schemas (frontend + backend); parameterised queries |
| Audit logging | Immutable SHA-256 hash-chained audit trail; PII access logged |
| Monitoring | Real-time system health monitoring; configurable alert thresholds |
| Backup | Daily automated encrypted backups; 7-year retention |
| Vulnerability management | pnpm audit CI gate; dependency CVE remediation pipeline |

### Organisational Measures

| Control | Description |
|---------|-------------|
| Staff training | Module A–D capacity building programme (Chapter 18) |
| Role-based access | Staff accounts created with minimum required permissions |
| Supervision | Supervisory review layer; per-enumerator monitoring |
| Incident response | Audit trail enables forensic analysis; breach notification documented |
| Data handling agreements | Consultant-Ministry data processing arrangement |
| Regular review | Quarterly security review schedule; dependency audit |

---

## H.7 DPIA Conclusion

| Assessment Element | Conclusion |
|-------------------|-----------|
| **Necessity** | Processing is necessary for the legitimate objective of establishing a state labour register |
| **Proportionality** | Data collection is proportionate — only data necessary for registry objectives is collected |
| **Consent** | Explicit, informed, granular consent obtained before any data collection |
| **Security** | Comprehensive technical and organisational measures in place; OWASP Top 10 compliant |
| **Data subject rights** | All NDPA data subject rights are accommodated in the platform design |
| **Residual risk** | All identified risks reduced to LOW or VERY LOW through implemented mitigations |

**DPIA Result: APPROVED — Processing may proceed with implemented safeguards.**

---

*Document Reference: CHM/OSLR/2026/001 | Appendix H | Chemiroy Nigeria Limited*
