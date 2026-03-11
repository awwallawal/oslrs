# CHAPTER 4: EXECUTIVE SUMMARY

---

## 1. Background

The Ministry of Trade, Industry, Investment and Cooperatives, Oyo State Government, commissioned Chemiroy Nigeria Limited in November 2025 to undertake the **Production of the Oyo State Skilled Labour Register** — a comprehensive state-wide digital registry of skilled, semi-skilled, and unskilled workers across all thirty-three (33) Local Government Areas of Oyo State.

The engagement, with a duration of six (6) months, encompasses three (3) principal deliverables: (1) Establishment of a Data Center; (2) Creation of the State Labour Register; and (3) Training of Ministry/Government Officials on the Operations of the Registry.

This Baseline Study Report presents the findings and outputs of the first phase of the engagement (November 2025 – March 2026), covering the establishment of the digital and physical infrastructure, the design and validation of the data collection methodology, and the development of a comprehensive occupational skills taxonomy for Oyo State.

---

## 2. Scope of Work Completed

The following activities were completed during the reporting period:

### Phase 1: Inception & Situational Analysis (Weeks 1–5)
- Stakeholder identification and engagement with Ministry officials
- Comprehensive desk review of labour market data sources (NBS, NPC, ILO, SMEDAN)
- Comparative analysis of state-level labour registry initiatives (Lagos, Kaduna, Edo)
- Baseline survey methodology design aligned with ILO ICLS-19 standards

### Phase 2: Infrastructure & Instrument Development (Weeks 6–10)
- Procurement and configuration of on-premises Data Center at Ministry premises
- Deployment of cloud infrastructure for production application hosting
- Survey instrument design through three iterative review cycles
- Occupational skills taxonomy development (150 skills, 20 sectors, ISCO-08 mapped)
- Data quality assurance framework design incorporating fraud detection heuristics

### Phase 3: Platform Development & Validation (Weeks 11–14)
- Full development of the Oyo State Labour & Skills Registry (OSLSR) digital platform
- 3,564 automated quality assurance tests executed with zero critical failures
- OWASP Top 10 security compliance assessment
- Nigeria Data Protection Act 2023 (NDPA) compliance review

### Phase 4: Baseline Validation & Reporting (Weeks 15–16)
- Structured validation exercise across all 33 LGAs (n=330 respondents)
- Instrument performance analysis and findings documentation
- Capacity building curriculum design for eight (8) user roles
- Preparation of this Baseline Study Report

---

## 3. Key Findings

### 3.1 Labour Market Situational Analysis

Oyo State, with an estimated population of 8.6 million (NPC 2025 projection), has no centralised, digitised register of its workforce. The state's labour market mirrors national patterns: **93% informal employment** (NBS NLFS Q2 2024), **75% self-employment** rate, and significant skills data gaps that impede evidence-based policy formulation.

This data gap has particular significance in the context of Nigeria's subnational business enabling environment reform programme, which assesses state competitiveness across sixteen indicators — including **skilled labour readiness**. Oyo State has risen from 27th to **3rd nationally** (62.7%) in the 2025 assessment. The Skilled Labour Register provides the evidence base to sustain and advance this competitive position by making the state's workforce visible, searchable, and verifiable for the first time.

A desk review of existing data sources revealed that while the National Bureau of Statistics (NBS) provides quarterly national and zonal estimates through the Nigeria Labour Force Survey (NLFS), **no state-level register exists** that captures granular, individual-level data on occupational skills, employment status, and business ownership across all 33 LGAs. Comparable initiatives in Lagos (LSETF Jobs Portal) and Kaduna (KADSTEP) have focused on specific populations (youth, graduates) rather than comprehensive workforce enumeration.

### 3.2 Validation Exercise Results

A structured validation exercise was conducted to verify instrument functionality and establish preliminary demographic baselines. Key findings from the purposive sample (n=330, 10 respondents per LGA):

| Indicator | Validation Sample | NBS Benchmark | Alignment |
|-----------|:-----------------:|:-------------:|:---------:|
| Gender (Male/Female) | 52.1% / 47.9% | 51.5% / 48.5% | ✓ Within 1% |
| Employment Rate | 83.0% | 87.3% | ✓ Within 5% |
| Self-Employment Rate | 74.5% | 75.0% | ✓ Within 1% |
| Informal Employment | 91.6% | 93.0% | ✓ Within 2% |
| Business Ownership | 38.5% | ~35% (SMEDAN) | ✓ Within 4% |
| CAC Registration | 22.8% | ~20% (SMEDAN) | ✓ Within 3% |
| Marketplace Consent | 68.2% | N/A (novel) | Baseline established |
| Avg. Completion Time | 9.2 minutes | Target: ≤10 min | ✓ Met |

The validation sample was designed to approximate the demographic distribution documented in the NBS NLFS (Q2 2024). Findings are presented for instrument validation and operational planning purposes; statistically representative estimates of Oyo State's labour force will require the full-scale statewide enumeration.

### 3.3 Occupational Skills Taxonomy

A bespoke occupational skills taxonomy was developed comprising **150 skills across 20 economic sectors**, mapped to the International Labour Organization's International Standard Classification of Occupations (ISCO-08). The taxonomy captures the full breadth of Oyo State's labour force — from formal sector professionals to artisanal tradespeople, agro-processors, and survivalist occupations — reflecting the 93% informal employment reality documented by NBS.

### 3.4 Data Center Establishment

A hybrid Data Center architecture was established, comprising:

- **On-premises Operations Node** at Ministry premises: three (3) enterprise-grade HP workstations (Intel Core i7, 16GB RAM, 512GB storage) with dedicated 5G broadband connectivity (Airtel SmartConnect ODU, 50 Mbps unlimited)
- **Cloud Infrastructure**: secure production server with automated daily backups, 7-year NDPA-compliant data retention, and 99.9% uptime SLA

### 3.5 Registry Platform

The Oyo State Labour & Skills Registry (OSLSR) digital platform was developed and deployed, featuring:

- Multi-channel data collection (field mobile, desktop data entry, public web self-registration)
- Offline-capable Progressive Web Application (PWA) with 7-day data retention
- Context-Aware Fraud Detection Engine with configurable thresholds
- Role-based access control for eight (8) distinct user roles
- Public Skills Marketplace with anonymised worker profiles
- Immutable audit trails with NDPA-compliant 7-year retention
- System health monitoring with real-time alerting

The platform underwent **3,564 automated quality assurance tests** with zero critical failures and a comprehensive **OWASP Top 10 security assessment** with all categories rated SECURE or remediated to compliance.

---

## 4. Deliverable Status Summary

| # | Deliverable | Status | Evidence |
|---|-------------|:------:|----------|
| 1 | Establishment of Data Center | **COMPLETE** | Physical infrastructure operational at Ministry premises; cloud infrastructure deployed and monitored |
| 2 | Creation of the State Labour Register | **IN PROGRESS** | Platform deployed and validated; data collection methodology designed; awaiting mobilisation of 132 field personnel for statewide enumeration |
| 3 | Training of Ministry/Government Officials | **DESIGN COMPLETE** | Capacity building curriculum designed for 8 user roles; classroom delivery scheduled for implementation phase |

---

## 5. Recommendations

For the successful execution of the statewide field enumeration (Deliverable 2), the Consultant recommends the immediate mobilisation of the following resources:

**(a)** Recruitment and training of **One Hundred and Thirty-Two (132) field personnel**, comprising Three (3) Enumerators and One (1) Field Supervisor per Local Government Area across all Thirty-Three (33) LGAs of Oyo State;

**(b)** Procurement of mobile data collection devices (Android smartphones, minimum specification: Android 8.0, 2GB RAM, 32GB storage, GPS-enabled) for all field personnel;

**(c)** Field logistics support including transportation allowances, identification materials (branded vests, ID cards), and communication airtime for data synchronisation;

**(d)** Printing and distribution of sensitisation materials for community engagement and respondent awareness;

**(e)** Establishment of LGA-level coordination with traditional rulers, community leaders, and ward heads to facilitate field access and respondent cooperation.

The digital infrastructure, validated survey instrument, 150-skill occupational taxonomy, data quality assurance framework, and operational Data Center are **deployment-ready**. The commencement of field enumeration is contingent upon the mobilisation of the above human and material resources as specified in the project terms of reference.

---

## 6. Conclusion

Chemiroy Nigeria Limited has, within the first four (4) months of the engagement, completed Deliverable 1 (Data Center Establishment) in full, designed and validated the methodology and instruments for Deliverable 2 (State Labour Register), and completed the curriculum design for Deliverable 3 (Training). The remaining activities — field enumeration, data analysis, and training delivery — are achievable within the remaining engagement period, subject to the timely mobilisation of field personnel and logistics resources.

This Baseline Study Report provides the evidentiary foundation for the next phase of the engagement and demonstrates the Consultant's commitment to international best practice, methodological rigour, and the successful delivery of the Oyo State Skilled Labour Register.

---

*Chemiroy Nigeria Limited*
*March 2026*
