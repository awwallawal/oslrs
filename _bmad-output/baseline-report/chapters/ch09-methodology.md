# CHAPTER 9: BASELINE STUDY METHODOLOGY

---

## 9.1 Introduction

This chapter describes the methodological framework adopted for the baseline study, encompassing the research design, data collection strategy, sampling approach, quality assurance protocols, and the assumption classification system employed throughout this report. The methodology was designed in accordance with the International Labour Organization (ILO) guidelines for labour force surveys, specifically the **Resolution Concerning Statistics of Work, Employment and Labour Underutilization** adopted at the **19th International Conference of Labour Statisticians (ICLS)** in Geneva, 2013.

---

## 9.2 Research Design

The baseline study adopted a **mixed-methods approach** comprising:

1. **Desk Review** (Secondary Data Analysis) — Systematic analysis of existing labour market data from the National Bureau of Statistics (NBS), National Population Commission (NPC), International Labour Organization (ILO), Small and Medium Enterprises Development Agency of Nigeria (SMEDAN), and state-level administrative records

2. **Instrument Development** — Design, iterative refinement, and validation of a structured survey questionnaire aligned with ILO ICLS-19 standards, incorporating a bespoke 150-skill occupational taxonomy

3. **Technology Platform Development** — Construction and deployment of a digital data collection, management, and analysis platform incorporating offline capability, fraud detection, and quality assurance automation

4. **Structured Validation Exercise** — A purposive field validation across all 33 LGAs to verify instrument functionality, assess platform performance, and establish preliminary demographic baselines

5. **Comparative Analysis** — Benchmarking against comparable state-level labour registration initiatives in Nigeria to identify best practices and design differentiation

---

## 9.3 Assumption Classification Framework

Following international best practice in research reporting, this study employs a **three-tier assumption classification framework** to ensure transparency about the epistemic status of all data, projections, and estimates presented in this report. Every material assertion is classified using one of the following tags:

| Classification | Symbol | Definition | Verification Standard |
|---------------|:------:|------------|----------------------|
| **VERIFIED FACT** | `[VF]` | Data sourced from authoritative national or international institutions, independently confirmable through publicly available records | Source cited at point of use; data retrievable from referenced publication |
| **FIELD-DEPENDENT** | `[FD]` | Reasonable estimate based on regional or national data, requiring field verification through the full-scale statewide enumeration (Deliverable 2) to establish Oyo State-specific values | National benchmark cited; state-specific validation pending full enumeration |
| **WORKING ASSUMPTION** | `[WA]` | Projections, estimates, or design parameters based on professional judgement, international standards, or comparable programme experience; subject to revision based on field evidence | Basis of assumption documented; sensitivity noted where material |

This framework is applied consistently throughout Chapters 7–17 of this report. Readers are advised that findings tagged `[FD]` or `[WA]` are explicitly acknowledged as requiring validation through subsequent project phases. This intellectual honesty about what is known, what is estimated, and what remains to be tested is not a limitation — it is the foundation of methodological rigour (cf. ILO, *Guidelines Concerning the Measurement of Employment*, 2018).

---

## 9.4 Desk Review Methodology

### 9.4.1 Scope

The desk review encompassed a systematic analysis of the following categories of secondary data:

| Category | Sources Reviewed | Data Extracted |
|----------|-----------------|----------------|
| **National Labour Statistics** | NBS Nigeria Labour Force Survey (NLFS) — Q1 2024, Q2 2024, Annual 2023 | Employment rates, informal sector size, self-employment patterns, sectoral distribution, education-employment correlations |
| **Population Data** | NPC 2006 National Census; NPC Population Projections (3.0% annual growth rate) | LGA-level population estimates for Oyo State (33 LGAs) |
| **MSME Data** | SMEDAN/NBS National MSME Survey 2021; PwC MSME Survey 2020 | Enterprise size distribution, sector concentration, formality rates |
| **International Standards** | ILO ICLS-19 Resolution (2013); ISCO-08 Classification | Labour force classification methodology; occupational taxonomy framework |
| **Vocational Skills** | NABTEB 26 Trade Syllabi; NBTE Vocational Skills Directory; ITF Skills Acquisition Reports | Occupational categories, artisan trade classifications, vocational training standards |
| **State-Level Initiatives** | Lagos LSETF, Kaduna KADSTEP, Edo EdoJobs, Kano State Trade Registry | Comparable programme designs, implementation approaches, gaps and lessons |
| **Data Protection** | Nigeria Data Protection Act 2023 (NDPA); NDPR 2019 | Compliance requirements, consent models, data retention obligations |

### 9.4.2 Data Quality Assessment

Each secondary data source was assessed against four quality criteria:

1. **Authority**: Institutional credibility of the publishing organisation
2. **Recency**: Publication date relative to current conditions (priority given to 2023–2025 publications)
3. **Methodology**: Documented research methodology and sample design
4. **Relevance**: Applicability to Oyo State's specific economic and demographic context

Sources meeting all four criteria were classified as `[VF]`. Sources meeting three criteria were used as supporting evidence with appropriate caveats. Sources meeting fewer than three criteria were excluded.

---

## 9.5 National Enumeration Area Framework

### 9.5.1 Concept and Definition

An **Enumeration Area (EA)** is the smallest geographic unit into which a country's territory is divided for systematic field data collection during a census or large-scale survey. The United Nations *Principles and Recommendations for Population and Housing Censuses* (Rev. 3, Para. 1.186) establishes that EAs must be: mutually exclusive (no overlap), exhaustive (no gaps), bounded by identifiable physical features, consistent with the administrative hierarchy, approximately equal in population, and small enough for a single enumerator to canvass within the allotted period.

In Nigeria, the **National Population Commission (NPC)** is the statutory authority responsible for Enumeration Area Demarcation (EAD) — the process of dividing the entire national territory into EAs. The **National Bureau of Statistics (NBS)** subsequently utilises digitised EA maps from the NPC as the spatial basis for household surveys, including the Nigeria Labour Force Survey (NLFS) from which the labour market benchmarks used in this study are derived.

### 9.5.2 History of EA Demarcation in Nigeria

Nigeria has conducted EAD exercises prior to four census operations:

| Census | EAD Innovation | Technology |
|:------:|---------------|-----------|
| **1973** | First-ever pre-census EA demarcation in Nigeria | Manual cartographic methods, paper maps |
| **1991** | Expanded delineation with limited aerial photography | Paper maps, limited aerial imagery |
| **2006** | GPS and satellite imagery introduced for geo-referenced EA maps | GPS receivers, satellite imagery, OMR/OCR/ICR data capture |
| **2023** | First fully digital, nationwide GIS-based EAD; completed November 2021 after 18 phases spanning 7 years | Esri ArcGIS Pro, ArcPy, custom EADPad application, high-resolution satellite imagery |

The 2023 Census EAD was a landmark achievement — the NPC received the **Special Achievement in GIS (SAG) Award** at the 2022 Esri User Conference in San Diego, California, for its nationwide digital EA demarcation of all 774 LGAs using GIS methodology. The exercise produced spatial datasets at every level of the geographic hierarchy: EA, Supervisory Area (SA), Locality, Registration Area/Ward, and LGA — along with geocoded building footprints, road networks, water bodies, and infrastructure data.

### 9.5.3 NPC Enumeration Area Hierarchy

The NPC's EA frame follows a nested geographic hierarchy in which each level sits entirely within the level above:

```
National Territory
  └── State (36 + FCT)
        └── Senatorial District (3 per state)
              └── Local Government Area (LGA)
                    └── Registration Area (RA) / Ward
                          └── Locality
                                └── Supervisory Area (SA)
                                      └── Enumeration Area (EA)
```

This strict nesting — no EA crosses a ward boundary, no ward crosses an LGA boundary — is what makes the EA frame usable as both a census operational unit and a national survey sampling frame.

### 9.5.4 EA Design Parameters and Oyo State Estimate

The NPC designs each EA to be coverable by **one enumerator within 5 days**. International norms and available NPC documentation indicate a target population of approximately **500–800 persons per EA**, varying by settlement density: urban high-density areas use the upper range (fewer, larger-population EAs), while rural dispersed areas use the lower range (more, smaller-population EAs). `[WA]`

The NPC does not publish state-level EA counts in publicly available documentation. To provide a planning reference, the Consultant developed a **density-adjusted estimation model** using verified 2006 NPC census data for all 33 LGAs of Oyo State, applying differentiated EA population targets by settlement classification:

| Classification | LGAs | Population (2006) [VF] | Persons/EA | Estimated EAs [WA] |
|---------------|:-----:|:---------------------:|:----------:|:-------------------:|
| **Urban** (Ibadan metropolitan core) | 5 | 1,343,147 | 800 | 1,679 |
| **Semi-Urban** (secondary towns & peri-urban Ibadan) | 11 | 2,201,296 | 650 | 3,386 |
| **Rural** (dispersed agrarian settlements) | 17 | 2,036,451 | 500 | 4,075 |
| **Oyo State Total** | **33** | **5,580,894** | **611** (weighted avg.) | **~9,140** |

Sensitivity analysis across conservative (900/750/600) and granular (700/550/400) EA sizing parameters yields a plausible range of **7,400–11,100 EAs** for Oyo State. The weighted average of ~611 persons per EA falls squarely within the UN-recommended range. A detailed LGA-by-LGA breakdown with full methodology is provided in the reference note (CHM/OSLR/2026/REF-001).

### 9.5.5 Significance for the OSLSR

The NPC's EA framework provides three essential inputs for the Skilled Labour Register:

1. **Population baseline** — NPC census data (Chapter 7) provides the LGA-level population denominators against which register coverage rates will be measured
2. **Geographic reference** — The NPC's nested hierarchy (State → LGA → Ward) is adopted as the OSLSR's own enumeration hierarchy, ensuring consistency with national statistical geography
3. **Methodological precedent** — The NPC's 50-year experience with EA-based field enumeration informs the OSLSR's enumerator deployment model, workload planning, and coverage monitoring approach

However, the OSLSR is not a census — it is a **voluntary skills registration exercise**. This fundamental difference in purpose requires deliberate adaptations to the NPC model, as detailed in the following section.

---

## 9.6 OSLSR Enumeration Area Framework

### 9.6.1 Adaptation Rationale

The Oyo State Skilled Labour Register adapts — rather than directly adopts — the NPC's EA framework, reflecting the fundamental differences between a mandatory population census and a voluntary skills registration exercise:

| Dimension | NPC Census Model | OSLSR Adapted Model | Rationale for Adaptation |
|-----------|:---------------:|:-------------------:|-------------------------|
| **Purpose** | Universal population count | Voluntary skilled workforce registration | Register captures willing respondents, not every household |
| **Primary unit** | EA (~500–800 persons) | LGA (33 units statewide) | 3 enumerators per LGA cannot cover ~280 EAs per LGA individually; LGA is the appropriate accountability unit |
| **Sub-unit** | Supervisory Area | Ward (rotation basis) | Wards are the locally recognised administrative units with community leadership structures |
| **Coverage target** | 100% household enumeration | Maximum voluntary participation | Not every person will be encountered or willing to register |
| **Boundary method** | Pre-delineated GIS polygon maps | GPS capture at point of submission | OSLSR builds its own coverage map progressively; pre-printed EA maps are not operationally necessary |
| **Map production** | Years in advance (EAD exercise) | Real-time (progressive GPS heatmap) | Eliminates dependency on NPC map availability |
| **Enumerators per unit** | 1 per EA | 3 per LGA (rotating across wards) | Workload model sized for voluntary registration throughput, not universal coverage |
| **Duration** | 5 days per EA | 30 days per LGA (continuous) | Longer engagement period reflects voluntary nature — respondents must be located, engaged, and persuaded |

This adaptation preserves the core EA principles — systematic geographic coverage, workload-based assignment, and quality assurance through spatial analysis — while recognising that a skills register operates under fundamentally different conditions from a population census.

### 9.6.2 OSLSR Enumeration Hierarchy

The OSLSR adopts a **four-tier geographic hierarchy** for enumeration planning, aligned with the upper tiers of the NPC hierarchy:

```
┌───────────────────────────────────────────────────────────┐
│              ENUMERATION AREA HIERARCHY                     │
│              Oyo State Skilled Labour Register               │
├───────────────────────────────────────────────────────────┤
│                                                             │
│  TIER 1: STATE                                             │
│  └── Oyo State (1)                                         │
│                                                             │
│  TIER 2: ZONE                                              │
│  └── 6 Administrative Zones                                │
│      (Ibadan Metro, Ibadan Periph., Ogbomosho,            │
│       Oyo, Oke-Ogun, Ibarapa)                             │
│                                                             │
│  TIER 3: LOCAL GOVERNMENT AREA (LGA)                       │
│  └── 33 LGAs — Primary enumeration unit                   │
│      Each LGA assigned: 1 Supervisor + 3 Enumerators      │
│                                                             │
│  TIER 4: WARD                                               │
│  └── Political wards within each LGA                       │
│      Enumerators rotate across wards on a daily            │
│      schedule to achieve geographic coverage               │
│                                                             │
└───────────────────────────────────────────────────────────┘
```

Tiers 1–3 map directly to the NPC hierarchy (State → Senatorial District/Zone → LGA). Tier 4 corresponds to the NPC's Registration Area/Ward level, but the OSLSR uses wards as **rotation units** for enumerator deployment rather than as fixed EA assignments.

### 9.6.3 LGA as Primary Enumeration Unit

The **Local Government Area (LGA)** — rather than the individual EA — serves as the primary enumeration unit for the following reasons:

| Criterion | Justification |
|-----------|--------------|
| **Administrative alignment** | LGAs are the smallest administrative units with dedicated local government structures, enabling coordination with LGA chairmen and community leaders |
| **NPC precedent** | The NPC organises census operations by LGA, and all population data (Chapter 7) is available at the LGA level |
| **Staffing model** | The 4-person team structure (1 Supervisor + 3 Enumerators per LGA) maps directly to the LGA boundary |
| **Scale proportionality** | With ~9,140 estimated NPC EAs across 33 LGAs (averaging ~277 EAs per LGA), assigning 3 enumerators to individual EAs would require ~27,420 enumerators — far exceeding the resource envelope. The LGA is the operationally appropriate unit for 132 field personnel |
| **Dashboard analytics** | The OSLSR platform provides per-LGA dashboards, enabling real-time monitoring of enumeration progress by geographic unit |
| **Validation alignment** | The baseline validation exercise (n=330) was structured at 10 respondents per LGA, establishing LGA-level baselines |

### 9.6.4 Ward-Level Enumeration Planning

Within each LGA, the three assigned enumerators are deployed across political wards on a rotating daily schedule:

| Day | Enumerator A | Enumerator B | Enumerator C |
|:---:|:---:|:---:|:---:|
| 1 | Ward cluster 1 | Ward cluster 2 | Ward cluster 3 |
| 2 | Ward cluster 2 | Ward cluster 3 | Ward cluster 1 |
| 3 | Ward cluster 3 | Ward cluster 1 | Ward cluster 2 |
| ... | *Rotation continues* | | |

This rotation model ensures:
- **Complete ward coverage** within each LGA across the enumeration period
- **Cross-validation** — different enumerators visit the same wards, enabling consistency checks
- **Fraud deterrence** — an enumerator cannot fabricate responses for areas they have not visited, as GPS coordinates are captured automatically

### 9.6.5 GPS-Based Digital Enumeration Area Mapping

Unlike traditional NPC EA delineation, which relies on pre-demarcated GIS polygon maps produced years in advance during the EAD exercise (Section 9.5.2), the OSLSR creates a **digital enumeration area map in real time** through GPS capture at the point of each survey submission:

1. **Automatic GPS capture**: The OSLSR mobile PWA records the respondent's geographic coordinates at the time of survey completion (with respondent knowledge and consent)
2. **Geo-referenced submissions**: Each record in the register is tagged with latitude/longitude, enabling spatial analysis
3. **Progressive coverage mapping**: The accumulation of geo-referenced submissions across the enumeration period generates a digital coverage map, showing precisely where data has been collected — functionally equivalent to a post-hoc EA map built from actual field operations rather than pre-census planning
4. **Coverage gap identification**: Supervisors can view the geographic distribution of submissions on the platform dashboard, identifying wards or areas with low submission density and redirecting enumerators accordingly
5. **Fraud detection integration**: The GPS cluster analysis algorithm (Chapter 17, Layer 2) uses the geographic distribution of submissions to detect anomalous patterns — for example, an improbably high density of submissions from a single coordinate, suggesting fabrication

This approach eliminates the OSLSR's dependency on NPC map availability while producing a geographic dataset that can be compared against the NPC's EA frame as a post-enumeration coverage audit.

### 9.6.6 Enumeration Area Summary

| Parameter | NPC Census Reference | OSLSR Design |
|-----------|---------------------|--------------|
| **Geographic hierarchy** | State → Senatorial District → LGA → Ward → Locality → SA → EA | State → Zone → LGA → Ward |
| **Primary enumeration unit** | EA (~500–800 persons) | LGA (33 units) |
| **Estimated EAs in Oyo State** | ~9,140 [WA] | N/A (LGA-based) |
| **Team per unit** | 1 Enumerator per EA | 1 Supervisor + 3 Enumerators per LGA |
| **Sub-unit deployment** | Fixed EA assignment | Ward rotation (daily schedule) |
| **EA mapping method** | Pre-demarcated GIS polygons (EAD exercise) | GPS-based digital mapping (real-time) |
| **Coverage monitoring** | EA completion checklists | Platform dashboard with LGA drill-down + GPS heatmap |
| **Quality assurance** | Supervisor visits to EAs | GPS cluster analysis + ward rotation cross-validation |

*For detailed NPC EA methodology, Oyo State LGA-by-LGA EA estimates, and the density-adjusted estimation model, see Reference Note CHM/OSLR/2026/REF-001.*

---

## 9.7 Validation Exercise Design

### 9.7.1 Objective

The structured validation exercise was designed to achieve the following objectives:

1. Verify the functionality and usability of the survey instrument across diverse respondent profiles (age, education, occupation, urban/rural)
2. Assess the digital platform's performance across multiple device types, operating systems, and network conditions
3. Establish preliminary demographic baselines for comparison with national benchmarks
4. Identify and resolve any instrument issues prior to full-scale deployment
5. Validate the 150-skill occupational taxonomy's coverage and comprehensiveness
6. Measure completion times and user experience metrics

### 9.7.2 Sampling Strategy

| Parameter | Design Choice | Justification |
|-----------|--------------|---------------|
| **Sample Size** | 330 respondents | 10 per LGA × 33 LGAs = complete geographic coverage |
| **Sampling Method** | Purposive (quota-based) | Validation objective requires demographic representativeness, not probability sampling |
| **Stratification** | By LGA (primary) and gender (secondary) | Ensures every LGA is represented; gender quota approximates national distribution |
| **Demographic Quotas** | Age, education, employment status aligned with NBS NLFS Q2 2024 benchmarks | Enables comparison of instrument performance across representative profiles |

### 9.7.3 Limitations

The validation exercise is subject to the following acknowledged limitations:

1. **Non-probability sample**: The purposive sampling design does not support inferential statistical analysis or population-level generalisation. Findings are valid for instrument validation and operational planning only. `[WA]`

2. **Sample size**: Ten (10) respondents per LGA provides sufficient diversity for instrument testing but insufficient power for LGA-level statistical estimates. State-level aggregates (n=330) provide indicative patterns only. `[WA]`

3. **Geographic coverage**: While all 33 LGAs are represented, intra-LGA variation (e.g., urban wards vs. rural settlements within a single LGA) is not captured at this sample size. `[FD]`

4. **Temporal snapshot**: The validation exercise captures a single point-in-time assessment. Seasonal employment variations (e.g., agricultural planting/harvest cycles) are not reflected. `[FD]`

These limitations are inherent to the validation phase design and will be addressed by the full-scale statewide enumeration (Deliverable 2), which will employ a probability-based sampling or total enumeration approach with statistically adequate sample sizes per LGA.

---

## 9.8 Data Collection Modes

The OSLSR platform supports three distinct data collection modes, all of which were validated during the baseline exercise:

| Mode | Channel | Target Users | Connectivity | Validation Status |
|------|---------|-------------|-------------|:-----------------:|
| **Field Enumeration** | Mobile PWA (Android 8.0+) | Trained Enumerators | Offline-capable (7-day retention) | ✓ Validated |
| **Desktop Data Entry** | Web Application (Desktop) | Data Entry Clerks | Online required | ✓ Validated |
| **Public Self-Registration** | Web Application (Any device) | General Public | Online required | ✓ Validated |

### 9.8.1 Offline Capability

The field enumeration mode employs a Progressive Web Application (PWA) architecture with the following offline provisions:

- **Service Worker**: Caches application assets for operation without network connectivity
- **IndexedDB Storage**: Stores draft and completed survey responses locally on the device for up to seven (7) days
- **Automatic Synchronisation**: Queued submissions are automatically uploaded when network connectivity is restored
- **Persistent Storage API**: Requests browser persistence to prevent data loss from storage pressure

This architecture is critical for field deployment in Oyo State, where network connectivity is inconsistent across rural and peri-urban LGAs, particularly in the Oke-Ogun and Ibarapa zones.

---

## 9.9 Data Quality Assurance Protocol

Data quality assurance is enforced through a multi-layer framework:

### Layer 1: Client-Side Validation
- Real-time field validation (NIN format, phone format, age calculation, logical constraints)
- Skip logic enforcement (conditional display of questions based on prior responses)
- Mandatory field enforcement (28 of 36 questions are required)
- Auto-save every 30 seconds (IndexedDB)

### Layer 2: Server-Side Validation
- Schema validation (Zod runtime type checking) on all submitted data
- Duplicate submission detection (idempotent processing by submission UUID)
- NIN uniqueness enforcement across all submission channels
- Cross-field consistency checks (e.g., dependents ≤ household size)

### Layer 3: Automated Fraud Detection
- **GPS Cluster Analysis**: Flags multiple submissions from same GPS coordinates within configurable radius
- **Speed-Run Detection**: Flags submissions completed faster than minimum plausible duration
- **Straight-Lining Detection**: Flags submissions with repetitive response patterns
- **Configurable Thresholds**: All detection parameters are adjustable by authorised administrators

### Layer 4: Human Review
- Flagged submissions routed to Supervisors for manual review
- Verification Assessors provide secondary audit of high-risk submissions
- All review actions are immutably logged in the audit trail

---

## 9.10 Ethical Considerations

### 9.10.1 Informed Consent

All respondents are presented with a clear, plain-language explanation of the survey's purpose, the data to be collected, how the data will be used, and their right to decline participation. The survey instrument includes a mandatory consent gate (Question 1.2) — no personal data is collected unless the respondent explicitly consents.

### 9.10.2 Data Protection Compliance

The data collection methodology complies with the Nigeria Data Protection Act 2023 (NDPA), including:

- **Purpose limitation**: Data collected exclusively for the stated registry purpose
- **Data minimisation**: Only data necessary for registry objectives is collected
- **Consent-based processing**: All data processing is based on explicit respondent consent
- **Two-stage marketplace consent**: Separate, additional consent required for Skills Marketplace inclusion (anonymous profile) and contact detail visibility (enriched profile)
- **Retention policy**: 7-year data retention aligned with NDPA requirements, with automated backup to encrypted offsite storage
- **Access control**: Role-based access ensuring PII is accessible only to authorised personnel

### 9.10.3 Vulnerability Protections

- Respondents below 15 years of age are excluded from the labour force participation module, consistent with ILO minimum working age standards
- Disability status is captured as a binary field (yes/no) to support inclusive policy planning without requiring disclosure of specific conditions
- Income data is collected as an optional field, respecting respondent sensitivity around financial disclosure

---

## 9.11 Methodology Summary

The baseline study methodology is summarised in the following framework diagram:

```
┌─────────────────────────────────────────────────────────────────┐
│                    BASELINE STUDY METHODOLOGY                    │
│                 Chemiroy Nigeria Limited, 2026                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │  DESK REVIEW │    │  INSTRUMENT  │    │    TECHNOLOGY     │   │
│  │              │    │   DESIGN     │    │    PLATFORM       │   │
│  │ • NBS NLFS   │    │              │    │                   │   │
│  │ • NPC Census │───▶│ • 3 Versions │───▶│ • OSLSR Platform  │   │
│  │ • ILO/ISCO   │    │ • ILO ICLS-19│    │ • 3,564 Tests     │   │
│  │ • SMEDAN     │    │ • 150 Skills │    │ • OWASP Compliant │   │
│  │ • State      │    │ • Skip Logic │    │ • PWA Offline     │   │
│  │   Comparisons│    │ • Validation │    │ • Fraud Detection │   │
│  └──────────────┘    └──────────────┘    └──────────────────┘   │
│          │                    │                     │             │
│          ▼                    ▼                     ▼             │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              VALIDATION EXERCISE (n=330)                 │    │
│  │                                                          │    │
│  │  • 10 respondents × 33 LGAs = 330 total                │    │
│  │  • Purposive sample aligned with NBS benchmarks         │    │
│  │  • 3 data collection modes tested                       │    │
│  │  • 4-layer quality assurance protocol                   │    │
│  └─────────────────────────────────────────────────────────┘    │
│          │                    │                     │             │
│          ▼                    ▼                     ▼             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │   FINDINGS   │    │   ANALYSIS   │    │ RECOMMENDATIONS  │   │
│  │              │    │              │    │                   │   │
│  │ • Demographic│    │ • NBS        │    │ • Field Staffing  │   │
│  │   Profiles   │    │   Benchmark  │    │ • Logistics       │   │
│  │ • Skills     │    │   Comparison │    │ • Training        │   │
│  │   Mapping    │    │ • Zone       │    │ • Timeline        │   │
│  │ • Instrument │    │   Analysis   │    │ • Resources       │   │
│  │   Performance│    │ • Gap ID     │    │                   │   │
│  └──────────────┘    └──────────────┘    └──────────────────┘   │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  ASSUMPTION CLASSIFICATION:                                      │
│  [VF] Verified Fact  [FD] Field-Dependent  [WA] Working Assump. │
└─────────────────────────────────────────────────────────────────┘
```

---

*Document Reference: CHM/OSLR/2026/001 | Chapter 9 | Chemiroy Nigeria Limited*
