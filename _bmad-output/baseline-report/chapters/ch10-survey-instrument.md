# CHAPTER 10: SURVEY INSTRUMENT DESIGN & VALIDATION

---

## 10.1 Introduction

This chapter documents the design, structure, and iterative validation of the **OSLSR Labour & Skills Registry Survey** — the primary data collection instrument for the Oyo State Skilled Labour Register. The instrument was purpose-built to capture the multidimensional nature of labour force participation in Oyo State, incorporating international statistical standards, Nigerian regulatory requirements, and the specific policy objectives of the commissioning authority.

The final instrument (Version 3.0) represents the outcome of **three iterative review cycles**, each incorporating feedback from methodological review, technical feasibility assessment, and alignment verification against the ILO International Conference of Labour Statisticians (ICLS-19) framework.

---

## 10.2 Design Principles

The survey instrument was designed according to five governing principles:

| # | Principle | Rationale | Implementation |
|---|-----------|-----------|----------------|
| 1 | **ILO ICLS-19 Alignment** | Ensures data compatibility with national and international labour force statistics | Labour force classification cascade (Q3.1–Q3.4) follows the ICLS-19 employment/unemployment resolution framework |
| 2 | **Minimum Respondent Burden** | Maximises completion rates in field conditions where respondent attention is limited | 10-minute estimated completion time; skip logic eliminates irrelevant questions |
| 3 | **Data Minimisation** | NDPA 2023 compliance requires collection of only data necessary for the stated purpose | 36 questions total; no questions unrelated to registry objectives |
| 4 | **Progressive Consent** | Respondents must understand and agree to each level of data sharing | Three-tier consent: (1) registry participation, (2) anonymous marketplace, (3) identifiable contact details |
| 5 | **Digital-First, Paper-Compatible** | Field conditions may necessitate paper backup, but primary collection is digital | One-question-per-screen mobile interface; paper form layout mirrors digital flow for data entry digitisation |

---

## 10.3 Instrument Evolution

The survey instrument underwent three major revisions before finalisation:

### 10.3.1 Version History

| Version | Date | Key Changes | Trigger |
|---------|------|-------------|---------|
| **v1.0** | December 2025 | Initial 28-question instrument; basic demographics, employment status, skills inventory (40 skills) | Inception phase design |
| **v2.0** | January 2026 | Expanded to 33 questions; added NIN requirement, LGA field, years of experience, expanded employment types; skills expanded to 50+ | PRD requirements analysis (FR5, FR17, FR21) |
| **v3.0** | January 2026 | Finalised at 36 questions; added marketplace section (6.0–6.4), business fields (address, apprentice count), refined education levels to 9 options, CAC registration status | Marketplace module requirements, stakeholder feedback on enterprise data needs |

### 10.3.2 Review Cycle Process

Each version underwent a structured review cycle:

```
┌──────────────────────────────────────────────────────────────────┐
│                   INSTRUMENT REVIEW CYCLE                         │
│                   (Applied 3 times: v1.0 → v3.0)                 │
│                                                                   │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────────────┐   │
│  │  DRAFT   │───▶│ METHODOLOGY  │───▶│  TECHNICAL            │   │
│  │          │    │  REVIEW      │    │  FEASIBILITY          │   │
│  │ Principal│    │              │    │  ASSESSMENT            │   │
│  │ Consultant│   │ ILO alignment│    │                       │   │
│  │ drafts   │    │ NDPA check   │    │ Digital form mapping  │   │
│  │ questions│    │ Skip logic   │    │ Validation rules      │   │
│  │          │    │ verification │    │ Database schema fit    │   │
│  └──────────┘    └──────────────┘    └───────────┬───────────┘   │
│                                                    │              │
│                                                    ▼              │
│                  ┌──────────────┐    ┌──────────────────────┐   │
│                  │   REVISED    │◀───│  STAKEHOLDER          │   │
│                  │   VERSION    │    │  FEEDBACK             │   │
│                  │              │    │  INTEGRATION           │   │
│                  │ Incorporates │    │                       │   │
│                  │ all feedback │    │ Ministry priorities   │   │
│                  │              │    │ Policy alignment      │   │
│                  └──────────────┘    └──────────────────────┘   │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 10.4 Instrument Structure

The final instrument (v3.0) comprises **six sections** containing **36 questions**, of which **28 are required** and **12 are conditional** (displayed based on skip logic).

### 10.4.1 Section Overview

| Section | Title | Questions | Required | Conditional | Purpose |
|---------|-------|:---------:|:--------:|:-----------:|---------|
| 1 | Introduction & Consent | 2 | 1 | 0 | Informed consent and study introduction |
| 2 | Identity & Demographics | 11 | 10 | 0 | Personal identification and demographic profiling |
| 3 | Labour Force Participation | 9 | 8 | 5 | ILO-aligned employment status classification |
| 4 | Household & Welfare | 4 | 4 | 0 | Household composition and living conditions |
| 5 | Skills & Business | 8 | 3 | 4 | Occupational skills inventory and enterprise data |
| 6 | Public Skills Marketplace | 5 | 1 | 3 | Progressive consent for marketplace participation |
| **Total** | | **39*** | **27** | **12** | |

*\* Including display-only informational fields (Q1.1, Q6.0) and auto-calculated fields (Q2.5)*

### 10.4.2 Estimated Completion Time

| Respondent Profile | Estimated Time | Basis |
|-------------------|:--------------:|-------|
| Employed, business owner, marketplace opt-in | 10–12 minutes | All sections, all conditional paths active |
| Employed, no business, marketplace opt-out | 7–8 minutes | Sections 5.4–5.8 and 6.2–6.4 skipped |
| Unemployed, job-seeking | 6–7 minutes | Employment details (Q3.5–Q3.9) skipped |
| Outside labour force | 5–6 minutes | Most of Section 3 skipped |

The instrument is designed for a **maximum completion time of 12 minutes** under the most complex respondent profile, ensuring that field enumerators can achieve the target of **8 submissions per day** within a 6-hour operational window (accounting for travel, engagement, and breaks).

---

## 10.5 Section-by-Section Analysis

### 10.5.1 Section 1: Introduction & Consent

| # | Question | Type | Required | Notes |
|---|----------|------|:--------:|-------|
| 1.1 | Welcome note introducing the OSLSR | Display only | — | Informational text explaining the purpose, duration, and data handling |
| 1.2 | Do you consent to participate? | Yes / No | Yes | **Gate question** — "No" terminates the survey with a thank-you message |

**Design rationale**: NDPA 2023 Section 25 requires informed consent before personal data collection. The consent question serves as a legally compliant gate — no data is collected or transmitted until explicit consent is obtained. This satisfies the lawful basis for processing requirement.

### 10.5.2 Section 2: Identity & Demographics

| # | Question | Type | Required | Validation |
|---|----------|------|:--------:|-----------|
| 2.1 | Surname | Text | Yes | Non-empty |
| 2.2 | First Name | Text | Yes | Non-empty |
| 2.3 | Gender | Single choice | Yes | Male / Female / Prefer not to say |
| 2.4 | Date of Birth | Date | Yes | Cannot be future date |
| 2.5 | Age | Auto-calculated | — | Derived from DOB; must be ≥15 years |
| 2.6 | Marital Status | Single choice | Yes | 5 options: Single, Married, Divorced, Widowed, Separated |
| 2.7 | Highest Education | Single choice | Yes | 9 levels from No Formal Education to Doctorate |
| 2.8 | Disability status | Yes / No | Yes | Self-declared |
| 2.9 | Phone Number | Text | Yes | Nigerian mobile format: 0[7-9][0-1]xxxxxxxx |
| 2.10 | NIN | Text | **Yes** | Exactly 11 digits; Modulus 11 checksum validation |
| 2.11 | LGA of residence | Single choice | Yes | 33 Oyo State LGAs |

**Design rationale**:

- **NIN as mandatory field**: The National Identification Number serves as the primary deduplication key across all submission channels. The Modulus 11 checksum validation catches transcription errors at point of entry, reducing the need for post-collection data cleaning. Global uniqueness enforcement prevents the same individual from being registered multiple times.

- **Age threshold (≥15 years)**: Aligned with the ILO ICLS-19 definition of the working-age population. The auto-calculation from Date of Birth eliminates the common field survey problem of respondents misreporting age.

- **Education levels (9 options)**: The expanded education classification distinguishes between NCE/OND and HND/BSc — a distinction that is significant in the Nigerian labour market where holders of different credentials occupy distinctly different employment niches.

- **GPS auto-capture**: Device GPS coordinates are captured automatically (not displayed to the respondent), enabling the fraud detection engine to identify geographic clustering anomalies.

### 10.5.3 Section 3: Labour Force Participation

This section implements the **ILO ICLS-19 labour force classification cascade** — a structured decision tree that classifies respondents into mutually exclusive labour force categories.

```
┌──────────────────────────────────────────────────────────┐
│           ILO ICLS-19 CLASSIFICATION CASCADE               │
│           (Questions 3.1 – 3.4)                            │
│                                                             │
│   Q3.1: Worked for pay/profit in last 7 days?              │
│         │                                                   │
│         ├── YES ──▶ EMPLOYED                               │
│         │          (Proceed to Q3.5–Q3.9)                  │
│         │                                                   │
│         └── NO ──▶ Q3.2: Temporarily absent from job?      │
│                    │                                        │
│                    ├── YES ──▶ EMPLOYED (Absent)            │
│                    │          (Proceed to Q3.5–Q3.7)       │
│                    │                                        │
│                    └── NO ──▶ Q3.3: Looked for work         │
│                               in last 4 weeks?             │
│                               │                            │
│                               ├── YES ──▶ UNEMPLOYED       │
│                               │          (Job-Seeking)     │
│                               │                            │
│                               └── NO ──▶ Q3.4: Available   │
│                                          within 2 weeks?   │
│                                          │                 │
│                                          ├── YES ──▶       │
│                                          │  POTENTIAL       │
│                                          │  LABOUR FORCE   │
│                                          │                 │
│                                          └── NO ──▶        │
│                                             OUTSIDE         │
│                                             LABOUR FORCE   │
│                                                             │
└──────────────────────────────────────────────────────────┘
```

| # | Question | Type | Required | Show If | Notes |
|---|----------|------|:--------:|---------|-------|
| 3.1 | Worked for pay/profit in last 7 days? | Yes / No | Yes | Always | Primary employment indicator |
| 3.2 | Temporarily absent from a job? | Yes / No | Yes | Q3.1 = No | Captures maternity, sick leave, seasonal pause |
| 3.3 | Looked for work in last 4 weeks? | Yes / No | Yes | Q3.2 = No | Unemployment indicator |
| 3.4 | Available to start within 2 weeks? | Yes / No | Yes | Q3.3 = No | Labour force availability |
| 3.5 | Main Occupation / Job Title | Text | Yes | Q3.1=Yes OR Q3.2=Yes | Free text, validated against taxonomy |
| 3.6 | Type of Employment | Single choice | Yes | Q3.1=Yes OR Q3.2=Yes | 6 options (see below) |
| 3.7 | Years of Experience | Single choice | Yes | Q3.1=Yes OR Q3.2=Yes | 5 ranges from <1 year to >10 years |
| 3.8 | Hours worked last week | Number | Yes | Q3.1 = Yes | Range: 0–168 hours |
| 3.9 | Monthly income estimate (₦) | Number | No | Q3.1 = Yes | Optional; cannot be negative |

**Employment Type Classification**:

| Code | Label | ILO Alignment |
|------|-------|--------------|
| wage_public | Government/Public Sector Employee | ICSE-18: Employee |
| wage_private | Private Sector Employee | ICSE-18: Employee |
| self_employed | Self-Employed (Artisan/Trader/Business Owner) | ICSE-18: Own-account worker |
| contractor | Contractor/Consultant | ICSE-18: Own-account worker |
| family_unpaid | Unpaid Family Worker | ICSE-18: Contributing family worker |
| apprentice | Apprentice/Intern | ICSE-18: Employee (dependent) |

**Design rationale**: The six employment type options reflect the structure of the Nigerian labour market, where the distinction between formal wage employment and self-employment is critical for policy analysis. The inclusion of "Apprentice/Intern" captures the significant informal apprenticeship economy that characterises Yoruba-speaking states.

### 10.5.4 Section 4: Household & Welfare

| # | Question | Type | Required | Validation |
|---|----------|------|:--------:|-----------|
| 4.1 | Head of household? | Yes / No | Yes | — |
| 4.2 | Total household size | Number | Yes | Minimum: 1 |
| 4.3 | Number of dependents | Number | Yes | Cannot exceed household size (Q4.2) |
| 4.4 | Housing ownership | Single choice | Yes | 5 options: Owned, Rented, Family, Employer-provided, Other |

**Design rationale**: Household data enables the computation of dependency ratios and housing tenure profiles — key indicators for labour policy planning. The cross-validation rule (dependents ≤ household size) prevents data quality errors at the point of entry.

### 10.5.5 Section 5: Skills & Business

| # | Question | Type | Required | Show If | Validation |
|---|----------|------|:--------:|---------|-----------|
| 5.1 | Primary skills | Multi-select | Yes | Always | 150 skills across 20 sectors |
| 5.2 | Other skills (free text) | Text | No | Always | Max 200 characters |
| 5.3 | Skills desired to learn | Multi-select | No | Always | Same 150-skill list |
| 5.4 | Own/operate a business? | Yes / No | Yes | Always | — |
| 5.5 | Business name | Text | Yes | Q5.4 = Yes | — |
| 5.6 | CAC registration status | Single choice | Yes | Q5.4 = Yes | Registered / Unregistered / In Progress |
| 5.7 | Business address | Text | Yes | Q5.4 = Yes | — |
| 5.8 | Number of apprentices | Number | No | Q5.4 = Yes | Cannot be negative |

**Design rationale**:

- **150-skill taxonomy**: The comprehensive skills list (documented in Chapter 11) enables precise matching between worker capabilities and employer needs in the Skills Marketplace. The multi-select format acknowledges that workers in the informal economy typically possess multiple tradeable skills.

- **"Skills desired to learn" (Q5.3)**: This forward-looking question captures unmet training demand — critical data for the Ministry's skills development programme planning.

- **Business registration data**: CAC registration status provides a proxy measure for formalisation of the informal economy, directly relevant to the Ministry's mandate.

### 10.5.6 Section 6: Public Skills Marketplace

| # | Question | Type | Required | Show If | Validation |
|---|----------|------|:--------:|---------|-----------|
| 6.0 | Marketplace explanation | Display only | — | Always | Explains anonymous vs enriched profiles |
| 6.1 | Join anonymous marketplace? | Yes / No | Yes | Always | Opt-in for basic profile visibility |
| 6.2 | Allow name/phone visibility? | Yes / No | Yes | Q6.1 = Yes | Second-tier consent for contact details |
| 6.3 | Professional bio | Text | No | Q6.2 = Yes | Max 150 characters |
| 6.4 | Portfolio/social media link | URL | No | Q6.2 = Yes | Optional professional link |

**Design rationale**: The marketplace section implements a **three-tier progressive consent model**:

```
TIER 1: Registry Only (Default)
├── Respondent data stored in secure registry
├── Accessible only to authorised staff
└── Not visible on public marketplace

TIER 2: Anonymous Marketplace (Q6.1 = Yes)
├── Skills, LGA, and experience level visible
├── Name and contact details hidden
└── Employers can see capability but not identity

TIER 3: Identifiable Contact (Q6.2 = Yes)
├── Name and phone number visible to employers
├── Professional bio and portfolio link displayed
└── Contact reveal protected by hCaptcha + rate limiting
```

This progressive model ensures that respondents make informed, granular decisions about their data visibility — a core principle of the NDPA 2023 consent framework.

---

## 10.6 Validation Rules

The instrument enforces **10 validation rules** at the point of data entry, preventing common data quality issues before submission:

| # | Field | Constraint | Error Message | Layer |
|---|-------|-----------|---------------|-------|
| 1 | NIN | Exactly 11 digits, numeric; Modulus 11 checksum | "NIN must be exactly 11 digits" | Frontend + Backend |
| 2 | Phone | Nigerian mobile format: 0[7-9][0-1]xxxxxxxx | "Enter valid Nigerian mobile number" | Frontend + Backend |
| 3 | Age | Calculated from DOB; must be ≥ 15 years | "Respondent must be 15 years or older" | Frontend + Backend |
| 4 | Date of Birth | Cannot be a future date | "Cannot be a future date" | Frontend + Backend |
| 5 | Hours Worked | Integer range 0–168 | "Hours must be between 0 and 168" | Frontend + Backend |
| 6 | Monthly Income | Numeric, ≥ 0 | "Cannot be negative" | Frontend + Backend |
| 7 | Dependents | Integer, ≤ household size (Q4.2) | "Dependents cannot exceed household size" | Frontend + Backend |
| 8 | Household Size | Integer, ≥ 1 | "Must be at least 1" | Frontend + Backend |
| 9 | Professional Bio | ≤ 150 characters | "Bio must be 150 characters or less" | Frontend + Backend |
| 10 | Other Skills | ≤ 200 characters | "Maximum 200 characters" | Frontend + Backend |

**Critical design decision**: All validation rules are enforced on **both frontend and backend** using shared Zod schemas — a single source of truth that prevents validation bypass through API manipulation. This dual-enforcement is a direct mitigation for OWASP A03 (Injection) and A04 (Insecure Design).

---

## 10.7 Skip Logic Architecture

The instrument employs conditional display logic (skip logic) to minimise respondent burden by showing only relevant questions:

```
┌───────────────────────────────────────────────────────────────┐
│                    SKIP LOGIC FLOW                              │
│                                                                 │
│  Q1.2 CONSENT                                                  │
│  ├── No  → END (Thank you message)                             │
│  └── Yes → Section 2 (Identity)                                │
│                                                                 │
│  Q2.5 AGE (auto-calculated)                                    │
│  ├── < 15 → END (Below working age)                            │
│  └── ≥ 15 → Section 3 (Labour Force)                           │
│                                                                 │
│  Q3.1 WORKED LAST 7 DAYS                                      │
│  ├── Yes → Q3.5, Q3.6, Q3.7, Q3.8, Q3.9                      │
│  └── No  → Q3.2                                                │
│           ├── Yes → Q3.5, Q3.6, Q3.7 (skip Q3.8, Q3.9)       │
│           └── No  → Q3.3                                       │
│                    ├── Yes → Skip to Section 4                  │
│                    └── No  → Q3.4 → Skip to Section 4          │
│                                                                 │
│  Q5.4 OWNS BUSINESS                                            │
│  ├── Yes → Q5.5, Q5.6, Q5.7, Q5.8                             │
│  └── No  → Skip to Section 6                                   │
│                                                                 │
│  Q6.1 JOIN MARKETPLACE                                         │
│  ├── Yes → Q6.2                                                │
│  │         ├── Yes → Q6.3, Q6.4                                │
│  │         └── No  → END                                       │
│  └── No  → END                                                 │
│                                                                 │
└───────────────────────────────────────────────────────────────┘
```

**Total possible paths**: 12 unique paths through the instrument, ranging from 2 questions (consent declined) to 36 questions (fully employed business owner with marketplace opt-in).

---

## 10.8 Multi-Channel Delivery

The survey instrument is delivered through three channels, each optimised for its target user context:

| Channel | Interface | Target User | Key Features |
|---------|-----------|-------------|-------------|
| **Mobile PWA** | One-question-per-screen, swipe navigation, large touch targets | Field Enumerators | Offline capable (7-day); GPS auto-capture; auto-save on every question; Service Worker caching |
| **Desktop Web** | Keyboard-optimised multi-field layout | Data Entry Clerks | Tab navigation between fields; batch entry workflow; paper form digitisation |
| **Public Self-Registration** | Responsive web form with hCaptcha | General Public | Bot protection; progressive disclosure; no login required; mobile-responsive |

All three channels feed into a **unified ingestion pipeline** that applies identical validation rules, fraud detection algorithms, and deduplication checks — ensuring data quality parity regardless of the submission source.

---

## 10.9 ILO ICLS-19 Compliance Verification

The following table maps the instrument's labour force questions to the specific ICLS-19 requirements they satisfy:

| ICLS-19 Requirement | Resolution | Instrument Question |
|---------------------|-----------|-------------------|
| Working-age population definition | 15 years and above | Q2.4 (DOB) → Q2.5 (auto-calculated age ≥ 15) |
| Employment — short reference period | 7-day recall period | Q3.1: "Worked for pay or profit in the last 7 days?" |
| Employment — temporary absence | Job attachment despite absence | Q3.2: "Temporarily absent from a job?" |
| Unemployment — active search | 4-week job search period | Q3.3: "Looked for work in the last 4 weeks?" |
| Unemployment — availability | 2-week availability criterion | Q3.4: "Available to start work within 2 weeks?" |
| Status in employment (ICSE-18) | 6 employment type categories | Q3.6: Employment type (6 options mapped to ICSE-18) |
| Working time | Weekly hours worked | Q3.8: "Hours worked last week" (0–168) |
| Informal employment proxy | Self-employment + unpaid family work | Q3.6 categories: self_employed, family_unpaid |

---

## 10.10 Instrument Limitations

The following limitations are acknowledged for transparency:

1. **Income data is self-reported and optional**: Monthly income (Q3.9) is not required, and where provided, is subject to recall bias and potential underreporting — a well-documented phenomenon in labour force surveys in developing economies.

2. **Single time-point measurement**: The instrument captures a snapshot of labour force status at the time of interview. Seasonal employment patterns (particularly in agriculture-dependent LGAs) are not captured by a single-round survey.

3. **Skills self-assessment**: Skill proficiency is self-declared, not independently verified. The registry records claimed skills, not assessed competencies.

4. **Proxy responses not explicitly captured**: Where an enumerator records a household member's data via a proxy respondent (e.g., a spouse), the instrument does not explicitly flag the response as proxy.

These limitations are standard for large-scale labour force registration exercises and are consistent with the methodological constraints documented in Chapter 9.

---

*Document Reference: CHM/OSLR/2026/001 | Chapter 10 | Chemiroy Nigeria Limited*
