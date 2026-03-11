# CHAPTER 6: PROJECT OVERVIEW & MANDATE

---

## 6.1 Engagement Background

By Award Letter referenced [Award Letter Reference], the Ministry of Trade, Industry, Investment and Cooperatives, Oyo State Government, engaged **Chemiroy Nigeria Limited** to undertake the **Production of the Oyo State Skilled Labour Register**. The consultancy award was received on **18th November 2025**, with a project duration of **six (6) months** concluding in **May 2026**.

The engagement was commissioned in recognition of a fundamental gap in the state's economic planning infrastructure: **the absence of a comprehensive, digitised register of Oyo State's workforce**. Despite an estimated population of 8.6 million (NPC 2025 projection) and a labour force participation rate exceeding 70% (NBS NLFS 2024), no centralised system existed to capture, verify, and maintain granular data on the skills, employment status, and economic activity of workers across the state's 33 Local Government Areas.

This data deficit constrains evidence-based policy formulation, limits the state's ability to target skills development programmes, and impedes the matching of available workforce skills with employer demand and investment opportunities.

---

## 6.2 Terminology: Register and Registry

A note on terminology used throughout this report. The two terms serve distinct but complementary functions:

- **Register** (noun) — The official authoritative record: the list of workers, their skills, demographics, and employment data. This is what the Ministry commissioned — the *Production of the Oyo State Skilled Labour **Register***. It is analogous to an electoral register, a birth register, or a land register: the definitive dataset.

- **Registry** (noun) — The system, platform, and institutional framework that creates, maintains, and serves the register. The **Oyo State Labour & Skills Registry (OSLSR)** is the digital platform — encompassing the web application, mobile PWA, database, fraud detection engine, and public Skills Marketplace — through which the register is produced and operated.

In summary: the **Registry** (system) produces and maintains the **Register** (data). Both terms are used precisely throughout this report. Where the text refers to the official list of workers, it uses "register"; where it refers to the technology platform, it uses "registry."

---

## 6.3 Project Objectives

The overarching objective of the engagement is to establish a **trusted, continuously updated digital register** of skilled, semi-skilled, and unskilled workers across all 33 LGAs of Oyo State. The registry platform is designed to:

1. **Provide granular workforce data** — Individual-level records capturing demographics, skills, employment status, business ownership, and location across all 33 LGAs

2. **Enable evidence-based policy** — Real-time dashboards and analytical tools to inform government decisions on skills development, job creation, trade facilitation, and investment attraction

3. **Connect workers to opportunities** — A public Skills Marketplace enabling employers, contractors, and investors to discover verified skilled workers by trade, location, and experience level

4. **Ensure data integrity** — Automated fraud detection, identity verification (NIN validation), and immutable audit trails to guarantee the trustworthiness of registry data

5. **Support continuous updating** — An always-on platform allowing ongoing self-registration, profile enrichment, and data maintenance beyond the initial field enumeration period

---

## 6.4 Project Deliverables

The engagement Terms of Reference specify three (3) principal deliverables:

| # | Deliverable | Description | Timeline |
|---|-------------|-------------|----------|
| **1** | **Establishment of Data Center** | Procurement, configuration, and deployment of physical and digital infrastructure to host, process, and secure the Labour Register data | Months 1–3 |
| **2** | **Creation of the State Labour Register** | Design and deployment of the digital registry platform; development of data collection instruments; conduct of statewide field enumeration across all 33 LGAs; population of the registry with verified worker data | Months 2–5 |
| **3** | **Training of Ministry/Government Officials** | Design and delivery of capacity building programme to equip Ministry and government officials with the knowledge and skills to operate, maintain, and utilise the Labour Register system | Months 5–6 |

---

## 6.5 Project Structure and Governance

### 6.5.1 Consultant Team

| Role | Name | Responsibility |
|------|------|----------------|
| Principal Consultant | Lawal Awwal | Project leadership, technical architecture, methodology design, quality assurance |
| Managing Director | Mrs Fateemah Roy Lagbaja | Corporate governance, strategic oversight, client liaison |

### 6.5.2 Ministry Oversight

The project operates under the supervision of the Ministry of Trade, Industry, Investment and Cooperatives, Oyo State Government, with designated Ministry officials serving as project supervisors responsible for:

- Facilitating access to Ministry premises for Data Center installation
- Coordinating with relevant state agencies (e.g., National Population Commission state office, State Internal Revenue Service)
- Providing administrative support for field enumeration logistics
- Reviewing and accepting project deliverables

### 6.5.3 Reporting Framework

| Report Type | Frequency | Recipient |
|-------------|-----------|-----------|
| Baseline Study Report (this document) | Mid-term | Ministry of Trade, Industry, Investment and Cooperatives |
| Progress Updates | As required | Designated Ministry Supervisors |
| Completion Report | End of engagement | Ministry of Trade, Industry, Investment and Cooperatives |

---

## 6.6 Activity Schedule

The following schedule documents the activities undertaken during the first sixteen (16) weeks of the engagement, organised by phase:

### Phase 1: Inception & Situational Analysis (Weeks 1–5: 18 November – 22 December 2025)

| Week | Activities |
|:----:|-----------|
| 1–2 | Project inception and administrative setup; Receipt and review of engagement terms; Establishment of project management framework; Stakeholder identification and engagement planning |
| 2–3 | Initiation of stakeholder consultations with Ministry officials; Identification of data requirements and functional needs; Review of existing Ministry data holdings and administrative records |
| 3–4 | Commencement of desk review: National Bureau of Statistics (NBS) Labour Force Survey publications; National Population Commission (NPC) population estimates and projections; ILO statistical standards and ISCO-08 occupational classification framework; SMEDAN/NBS National MSME Survey reports |
| 4–5 | Comparative analysis of state-level labour registry initiatives (Lagos LSETF, Kaduna KADSTEP, Edo EdoJobs); Survey methodology design — ILO ICLS-19 alignment; Initial questionnaire framework development; Data Center requirements specification and vendor evaluation |

### Phase 2: Infrastructure & Instrument Development (Weeks 6–10: 23 December 2025 – 26 January 2026)

| Week | Activities |
|:----:|-----------|
| 5–6 | Data Center hardware procurement (3× HP Core i7 workstations, Airtel 5G ODU router); Physical installation and configuration at Ministry premises; Cloud infrastructure provisioning and security baseline |
| 6–7 | Survey instrument Version 1.0 development; ILO ICLS-19 labour force classification module design; Skills taxonomy research — NABTEB trade areas, SMEDAN MSME sectors, ILO ISCO-08 |
| 7–8 | Survey instrument Version 2.0 — internal peer review; Skip logic and validation rule refinement; Choice list expansion (education levels, employment types, housing status) |
| 8–9 | Survey instrument Version 3.0 — final validation; Occupational skills taxonomy completion (150 skills, 20 sectors); Data quality assurance framework design — fraud detection heuristics |
| 9–10 | Database schema design and implementation; Registry platform architecture design; Data Protection Impact Assessment (NDPA 2023) |

### Phase 3: Platform Development & Validation (Weeks 11–14: 27 January – 23 February 2026)

| Week | Activities |
|:----:|-----------|
| 10–11 | Registry platform core module development — authentication, role-based access control, staff management; Database migration and schema deployment |
| 11–12 | Survey form renderer development — one-question-per-screen interface, offline capability (Progressive Web Application), GPS capture; Data submission pipeline with idempotent processing |
| 12–13 | Fraud detection engine development — GPS cluster analysis, submission speed monitoring, response pattern analysis; Role-specific dashboards (8 user roles); Public Skills Marketplace development |
| 13–14 | Automated quality assurance testing (3,564 tests executed); OWASP Top 10 security compliance assessment; System hardening — Content Security Policy, dependency audit, input validation |

### Phase 4: Baseline Validation & Reporting (Weeks 15–16: 24 February – 8 March 2026)

| Week | Activities |
|:----:|-----------|
| 14–15 | Structured validation exercise execution — 10 respondents per LGA across all 33 LGAs (n=330); Instrument performance data collection — completion times, error rates, device compatibility |
| 15–16 | Validation data analysis and findings documentation; Capacity building curriculum design (8 user roles, training module development); Field enumeration methodology finalisation; Preparation and compilation of this Baseline Study Report |

---

## 6.7 Convergence of Factors — Why This Project, Why Now

The establishment of a State Skilled Labour Register is not merely a data collection exercise; it responds to a convergence of six structural factors that make this intervention both timely and necessary:

1. **Federal Policy Alignment**: The Federal Government's ongoing National Identity Management System (NIMS) expansion and NIN mandate creates an enabling environment for state-level registries that leverage verified national identity data. The OSLSR's NIN validation at point of entry (Modulus 11 checksum) directly interfaces with this national infrastructure.

2. **Youth Unemployment Imperative**: Nigeria's youth unemployment rate, while declining from 8.4% (Q1 2024) to 6.5% (Q2 2024) nationally (NBS NLFS Q2 2024), masks significant underemployment and skills mismatches. Oyo State, with an estimated 2.4 million persons aged 15–34, requires granular skills data to design targeted interventions.

3. **Informal Sector Dominance**: With 93% of Nigeria's workforce in informal employment (NBS 2024), traditional employer-based labour registries capture less than 7% of the actual workforce. The OSLSR's design — encompassing artisans, traders, farmers, and survivalist occupations — addresses this methodological gap.

4. **Digital Technology Maturity**: The availability of affordable mobile devices, expanding 4G/5G coverage (including Airtel's SmartConnect 5G ODU targeting underserved areas), and increasing digital literacy enable mobile-based data collection at a scale and cost that was infeasible even five years ago.

5. **Investment Attraction**: The absence of verified, searchable workforce data is a documented barrier to industrial and commercial investment. The Skills Marketplace component transforms the register from a cost centre into an active tool for connecting skilled workers with opportunities, contributing directly to economic development.

6. **Business Enabling Environment Reform**: Nigeria's subnational business enabling environment reform programme — a World Bank-supported initiative assessing states across sixteen (16) indicators and thirty-six (36) sub-metrics — includes **skilled labour readiness** as a measured dimension of state competitiveness. Oyo State has demonstrated significant progress under this framework, rising from 27th to 3rd nationally (62.7% in the 2025 assessment). The Oyo State Skilled Labour Register directly strengthens the state's performance on this indicator by providing a verified, searchable database of available workforce skills — a capability that no other state currently possesses at this level of depth. The register positions Oyo State to sustain and improve its competitive standing in subsequent assessment cycles.

These factors are not the product of a single policy decision. They represent a structural convergence that creates a window of opportunity for Oyo State to consolidate its rising position in national business environment competitiveness rankings and establish a first-mover advantage in comprehensive workforce data management among Nigeria's 36 states.

---

*Document Reference: CHM/OSLR/2026/001 | Chapter 6 | Chemiroy Nigeria Limited*
