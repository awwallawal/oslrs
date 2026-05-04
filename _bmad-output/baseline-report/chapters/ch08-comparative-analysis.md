# 5. Comparative Analysis: State-Level Registry Initiatives

---

## 5.1 Introduction

This chapter presents a comparative analysis of state-level workforce registration and skills enumeration initiatives across Nigeria. The analysis serves two purposes: (1) to situate the Oyo State Skilled Labour Register within the broader national landscape of sub-national labour market information systems, and (2) to identify lessons learned and best practices from comparable initiatives that have informed the OSLSR design.

---

## 5.2 Landscape Overview

Several Nigerian states have undertaken workforce registration or skills mapping initiatives in recent years, driven by the shared challenge of informal economy visibility and the need for evidence-based skills development planning. However, these initiatives vary significantly in scope, methodology, technology, and outcomes.

```
┌──────────────────────────────────────────────────────────────┐
│         STATE-LEVEL REGISTRY INITIATIVES IN NIGERIA            │
│         Comparative Landscape                                   │
│                                                                │
│  STATE          INITIATIVE                     STATUS          │
│  ─────          ──────────                     ──────          │
│                                                                │
│  Lagos          Employment Trust Fund /        Operational     │
│                 Lagos Innovates Portal                          │
│                                                                │
│  Kaduna         Kaduna State Residents         Operational     │
│                 Registration Agency (KADSRA)                    │
│                                                                │
│  Edo            EdoJobs / Edo Skills Map       Operational     │
│                                                                │
│  Delta          Delta State Job Creation       Partial         │
│                 Office / Skills Registry                        │
│                                                                │
│  Ogun           Ogun State Digital Skills      Planning        │
│                 Registry                                        │
│                                                                │
│  OYO (OSLSR)    Oyo State Skilled Labour       Operational*   │
│                 Register                       (*Field pending)│
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

---

## 5.3 Comparative Analysis

### 5.3.1 Lagos State, Employment Trust Fund

| Parameter | Detail |
|-----------|--------|
| **Initiative** | Lagos Employment Trust Fund (LETF) / Lagos State Employment Portal |
| **Established** | 2016 |
| **Administering Body** | Lagos Employment Trust Fund (State agency) |
| **Scope** | Loan facilitation for entrepreneurs; job matching; skills training referral |
| **Technology** | Web portal with online registration |
| **Registration Model** | Self-registration (online only); employer registration for job posting |
| **Skills Taxonomy** | General skills categories (not detailed artisan-level) |
| **Unique Identifier** | BVN (Bank Verification Number) for loan applicants |
| **Estimated Registrants** | 300,000+ (self-reported) |
| **Key Strength** | Direct linkage to financial services (loans up to ₦5M) creates strong registration incentive |
| **Key Limitation** | Primarily serves the formal/semi-formal sector; limited penetration into informal artisan economy |
| **Fraud Detection** | BVN-based deduplication; no field enumeration component |

### 5.3.2 Kaduna State, Kaduna State Residents Registration Agency (KADSRA)

| Parameter | Detail |
|-----------|--------|
| **Initiative** | Kaduna State Residents Registration Agency (KADSRA) |
| **Established** | 2018 |
| **Administering Body** | Dedicated state agency under the Governor's office |
| **Scope** | Universal resident registration (not skills-specific); captures demographics, occupation, location |
| **Technology** | Custom mobile application for field agents; web dashboard |
| **Registration Model** | Door-to-door enumeration by field agents; self-registration at designated centres |
| **Skills Taxonomy** | Occupational categories (broad groupings, not detailed skill-level) |
| **Unique Identifier** | KAD-ID (state-assigned unique number) |
| **Estimated Registrants** | 6+ million (reported 2022) |
| **Key Strength** | Largest state-level registration exercise in Nigeria; universal coverage (not just skilled workers) |
| **Key Limitation** | Broad scope means limited depth of skills data; designed for general administration rather than labour market intelligence |
| **Fraud Detection** | Biometric capture (fingerprint); agent supervision |

### 5.3.3 Edo State, EdoJobs / Edo Skills Map

| Parameter | Detail |
|-----------|--------|
| **Initiative** | EdoJobs portal / Edo Innovation Hub |
| **Established** | 2019 |
| **Administering Body** | Edo State Skills Development Agency |
| **Scope** | Youth skills training, job matching, skills assessment; linked to GIZ partnership |
| **Technology** | Web platform with online registration; integrated with training programmes |
| **Registration Model** | Self-registration (online); training programme enrollment captures skills data |
| **Skills Taxonomy** | Training programme-oriented categories (ICT, fashion, construction, agriculture) |
| **Unique Identifier** | NIN (National Identification Number) |
| **Estimated Registrants** | 50,000+ (through training programmes) |
| **Key Strength** | Direct linkage to skills training creates pipeline from registration to development; GIZ technical support |
| **Key Limitation** | Registration is training-programme driven, does not capture existing skilled workers who are not seeking training |
| **Fraud Detection** | NIN validation; training programme attendance records |

### 5.3.4 Delta State, Job Creation Office

| Parameter | Detail |
|-----------|--------|
| **Initiative** | Delta State Job Creation Office (JCO) |
| **Established** | 2020 |
| **Administering Body** | Delta State Ministry of Economic Planning |
| **Scope** | Youth employment tracking; skills database for government programmes |
| **Technology** | Basic web registration form; spreadsheet-based data management |
| **Registration Model** | Self-registration (online and paper); integrated with STEP/YAGEP programmes |
| **Skills Taxonomy** | General skills categories |
| **Estimated Registrants** | ~20,000 |
| **Key Limitation** | Limited technology infrastructure; data management challenges at scale |

---

## 5.4 Comparative Matrix

| Feature | Lagos (LETF) | Kaduna (KADSRA) | Edo (EdoJobs) | OSLSR (Oyo) |
|---------|:---:|:---:|:---:|:---:|
| **Primary Purpose** | Finance access | Resident ID | Skills training | Labour register |
| **Target Population** | Entrepreneurs | All residents | Youth | Skilled workers |
| **Registration Channels** | Web only | Field + centres | Web + training | Mobile PWA + Web + Field |
| **Offline Capability** | No | Limited | No | **Yes (7-day)** |
| **Skills Taxonomy Depth** | General categories | Occupation only | Training categories | **150 skills, 20 sectors** |
| **ILO Alignment** | No | No | Partial | **Yes (ICLS-19)** |
| **NIN-Based Deduplication** | No (BVN) | No (KAD-ID) | Yes | **Yes** |
| **Automated Fraud Detection** | Basic | Biometric | Basic | **Multi-algorithm** |
| **Skills Marketplace** | No | No | Partial (job board) | **Yes (public directory)** |
| **Immutable Audit Trail** | Unknown | Unknown | Unknown | **Yes (SHA-256 chain)** |
| **NDPA Compliance** | Unknown | Partial | Partial | **Full compliance** |
| **Automated Testing** | Unknown | Unknown | Unknown | **3,564 tests** |
| **OWASP Assessment** | Unknown | Unknown | Unknown | **10/10 SECURE** |
| **Progressive Consent** | No | No | No | **3-tier model** |

---

## 5.5 Key Lessons from Comparable Initiatives

The comparative analysis yields five key lessons that have directly informed the OSLSR design:

### Lesson 1: Multi-Channel Registration is Essential

**Observation**: Lagos and Edo rely primarily on web-based self-registration, which excludes workers who lack internet access or digital literacy. Kaduna's field agent model achieves broader coverage but requires massive human resources.

**OSLSR Application**: The OSLSR implements a **three-channel approach** (Mobile PWA for field enumeration, desktop web for data entry, public self-registration), combining the reach of field enumeration with the scalability of self-registration.

### Lesson 2: Skills Taxonomy Depth Determines Utility

**Observation**: Initiatives with broad occupational categories (e.g., "Construction," "Agriculture") provide limited utility for skills matching or labour market analysis. The value of a registry increases with the granularity of the skills data captured.

**OSLSR Application**: The OSLSR implements a **150-skill taxonomy across 20 sectors**, mapped to ISCO-08 international standards (Chapter 11), providing the granularity required for meaningful skills matching and policy analysis.

### Lesson 3: Registration Incentive Drives Participation

**Observation**: Lagos achieves high registration through financial incentive (loan access). Edo achieves registration through training programme enrollment. Registries without clear incentives struggle with participation.

**OSLSR Application**: The OSLSR offers the **Skills Marketplace** as a tangible incentive, registered workers gain visibility to potential employers and clients through a publicly searchable directory, creating a direct economic benefit from registration.

### Lesson 4: Offline Capability is Non-Negotiable for Field Work

**Observation**: States that rely on internet-connected registration have limited reach in rural areas with poor connectivity.

**OSLSR Application**: The OSLSR PWA operates for **up to 7 days offline** with automatic synchronisation, a critical capability for enumeration in rural Oke-Ogun and Ibarapa LGAs where connectivity is intermittent.

### Lesson 5: Data Quality Requires Systematic Controls

**Observation**: Large-scale registration exercises (particularly Kaduna's 6M+ registrants) face significant data quality challenges without systematic fraud detection and quality assurance mechanisms.

**OSLSR Application**: The OSLSR implements a **4-layer quality assurance protocol** (Chapter 17) with automated fraud detection, supervisory review, and statistical quality gates, a more rigorous approach than any comparable state initiative.

---

## 5.6 OSLSR Positioning

The comparative analysis positions the OSLSR as a **next-generation state-level labour register** that addresses the limitations observed in earlier state initiatives:

```
┌──────────────────────────────────────────────────────────────┐
│              OSLSR, NEXT-GENERATION POSITIONING               │
│                                                                │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  EARLIER INITIATIVES                                  │    │
│  │  ✗ Single-channel (web only or field only)           │    │
│  │  ✗ Broad skills categories (limited matching value)  │    │
│  │  ✗ No offline capability                             │    │
│  │  ✗ No automated fraud detection                      │    │
│  │  ✗ No skills marketplace incentive                   │    │
│  │  ✗ No ILO-aligned methodology                        │    │
│  │  ✗ Limited or unknown NDPA compliance                │    │
│  └──────────────────────────────────────────────────────┘    │
│                         ▼                                      │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  OSLSR (OYO STATE)                                    │    │
│  │  ✓ Three-channel registration (mobile + desktop       │    │
│  │    + self-registration)                               │    │
│  │  ✓ 150-skill taxonomy (ISCO-08 mapped)               │    │
│  │  ✓ 7-day offline capability (PWA)                    │    │
│  │  ✓ Multi-algorithm fraud detection (GPS, speed,      │    │
│  │    pattern, NIN dedup)                                │    │
│  │  ✓ Public Skills Marketplace with 3-tier consent     │    │
│  │  ✓ ILO ICLS-19 aligned methodology                  │    │
│  │  ✓ Full NDPA 2023 compliance                         │    │
│  │  ✓ 3,564 automated tests; OWASP 10/10               │    │
│  │  ✓ Immutable audit trails (SHA-256 hash chain)       │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

---

## 5.7 Chapter Summary

The comparative analysis demonstrates that while several Nigerian states have undertaken workforce registration or skills mapping initiatives, the OSLSR represents a significant methodological and technological advancement over existing efforts. The OSLSR's distinguishing features, offline-capable multi-channel data collection, granular 150-skill taxonomy with ISCO-08 mapping, automated multi-algorithm fraud detection, public skills marketplace with progressive consent, and ILO ICLS-19 aligned survey methodology, position it as a potential model for state-level labour market information systems in Nigeria.

The lessons drawn from Lagos, Kaduna, Edo, and Delta have been systematically incorporated into the OSLSR design, ensuring that known failure modes and limitations are addressed proactively rather than discovered post-deployment.

---

*Document Reference: CHM/OSLR/2026/002 | Chapter 8 | Chemiroy Nigeria Limited*
