# NPC ENUMERATION AREA DELINEATION: REFERENCE NOTE

**Document Reference:** CHM/OSLR/2026/REF-001
**Prepared by:** Chemiroy Nigeria Limited
**Date:** March 2026

---

## 1. Introduction

This reference note provides a comprehensive account of the National Population Commission's (NPC) Enumeration Area Demarcation (EAD) framework in Nigeria, with particular attention to Oyo State. It serves as the evidentiary foundation for the Enumeration Area Framework adopted in the Oyo State Skilled Labour Register (OSLSR) methodology (Baseline Study Report, Chapter 9, Section 9.5).

---

## 2. Definition and Purpose

An **Enumeration Area (EA)** is the smallest geographic unit into which a country is divided for the purpose of systematic field data collection during a census or large-scale survey operation. The NPC defines Enumeration Area Demarcation (EAD) as:

> *"The process of dividing the entire country into smaller units with clearly defined and identifiable boundaries, called Enumeration Areas (EAs), done in such a manner that there is no overlap or gap between them."*
> — National Population Commission, EAD Programme Documentation

The EA serves as:
- The **assignment unit** for a single enumerator during field operations
- The **building block** of the national sampling frame for household surveys
- The **geographic control unit** for quality assurance and coverage verification
- The **smallest unit of data dissemination** for census and survey results

---

## 3. History of EAD in Nigeria

Nigeria has conducted Enumeration Area Demarcation exercises prior to four census operations:

| Census Year | EAD Characteristics | Technology |
|:-----------:|--------------------|-----------:|
| **1973** | First-ever pre-census EA demarcation in Nigeria | Manual cartographic methods, paper maps |
| **1991** | Manual delineation with limited aerial photography | Paper maps, limited aerial imagery |
| **2006** | GPS and satellite imagery introduced for geo-referenced EA maps; OMR/OCR/ICR data capture | GPS receivers, satellite imagery, optical scanning |
| **2023** (planned) | First fully digital, nationwide GIS-based EAD | Esri ArcGIS Pro, ArcPy, ArcGIS Online, custom EADPad application, high-resolution satellite imagery, PDAs |

The 2006 census represented a turning point — it was the first time GPS and satellite imagery were used to create geo-referenced Enumeration Area maps, replacing the purely cartographic approach of earlier censuses.

### 3.1 The 2023 Census EAD Programme

The most recent EAD exercise — conducted in preparation for the (as yet unscheduled) national population and housing census — was by far the most ambitious and technologically advanced:

- **Pilot Phase**: December 1–11, 2014, in Ondo State
- **Full execution**: 18 phases, spanning 7 years (planned duration was 3 years; delays caused by inadequate timely funding)
- **Completion**: November 2021
- **Recognition**: NPC received the **Special Achievement in GIS (SAG) Award** at the 2022 Esri User Conference in San Diego, California — the global gold standard for GIS excellence

**Methodology evolution across phases:**

| Phase | Innovation |
|-------|-----------|
| Early phases | Printed forms with satellite imagery overlay |
| Mid phases | Digital CSPro application on Personal Digital Assistants (PDAs) |
| Later phases | Customised **EADPad** application integrating satellite imagery and attribute forms on a single platform |
| Final phases | Iterative field-challenge modifications, ArcGIS Pro topology correction |

**Technical infrastructure:**
- **ArcGIS Pro** with custom tools and **ArcPy** scripts for dataset cleaning, spatial topology error correction, thematic map generation, and geocoding
- **ArcGIS Online** as central repository for the NPC's large spatial dataset, including millions of building records and the complete EA frame
- **High-resolution satellite imagery** for building identification, road networks, water bodies, and administrative boundary verification
- **Postcode system**: Each postcode area restricted to ≤2 hectares and ≤99 postcode units

---

## 4. EA Design Parameters

### 4.1 International Standards

The United Nations *Principles and Recommendations for Population and Housing Censuses* (Series M, No. 67, Revisions 3 and 4) and the UN *Handbook on Census Management for Population and Housing Censuses* (Series F, No. 83, Rev. 2) establish the following criteria for Enumeration Area design:

| Criterion | Description |
|-----------|-------------|
| **Mutually exclusive** | No geographic point falls within more than one EA |
| **Exhaustive** | Every point in the national territory falls within exactly one EA |
| **Identifiable boundaries** | EA limits follow physical/cultural features recognisable on the ground (roads, rivers, railway lines, fences, footpaths) |
| **Administrative consistency** | EAs nest within the administrative hierarchy (ward → LGA → state) — no EA crosses an administrative boundary |
| **Population equivalence** | EAs are designed to contain approximately equal populations to ensure balanced enumerator workloads |
| **Single-enumerator coverage** | Each EA must be small enough for one enumerator to canvass completely within the allotted enumeration period |
| **Privacy threshold** | EAs must be large enough that individual respondents cannot be identified from aggregate EA-level data |

### 4.2 NPC EA Size Parameters

The NPC's EA design parameters have varied across census cycles. Based on available documentation:

| Parameter | 2006 Census | 2023 Census (EAD) |
|-----------|:-----------:|:------------------:|
| **Target population per EA** | ~500–600 persons [WA] | Varies by density; GIS-optimised |
| **Enumeration period** | 5 days per EA | 5 days per EA |
| **Boundary method** | GPS waypoints + satellite imagery | Full GIS polygons (ArcGIS Pro) |
| **Map format** | Printed geo-referenced maps | Digital maps on PDAs/tablets |
| **Enumerators per EA** | 1 | 1 |

**Note**: The `[WA]` tag indicates a Working Assumption based on international norms and available literature. The NPC has not published a single definitive EA population target applicable across all census cycles; actual EA populations vary significantly between urban high-density areas and rural dispersed settlements.

### 4.3 EA Geographic Hierarchy

The NPC EAD produces a nested geographic hierarchy:

```
National Territory
  └── State (36 + FCT)
        └── Senatorial District (3 per state)
              └── Federal Constituency
                    └── Local Government Area (LGA)
                          └── Registration Area (RA) / Ward
                                └── Locality
                                      └── Supervisory Area (SA)
                                            └── Enumeration Area (EA)
```

Each level nests perfectly within the level above — no EA crosses a ward boundary, no ward crosses an LGA boundary, and so forth. This nesting property is what makes the EA frame usable as both a census operational unit and a survey sampling frame.

---

## 5. Oyo State: Census Geography

### 5.1 Administrative Structure

Oyo State comprises **33 Local Government Areas** across **3 Senatorial Districts**:

| Zone | Senatorial District | LGAs |
|------|--------------------|----|
| **Oyo Central** | Oyo Central | Afijio, Akinyele, Atiba, Egbeda, Ido, Lagelu, Oyo East, Oyo West, Oluyole, Ona-Ara |
| **Oyo South** | Oyo South | Ibadan North, Ibadan North-East, Ibadan North-West, Ibadan South-East, Ibadan South-West, Ibarapa Central, Ibarapa East, Ibarapa North |
| **Oyo North** | Oyo North | Atisbo, Irepo, Iseyin, Itesiwaju, Iwajowa, Kajola, Ogbomosho North, Ogbomosho South, Ogo Oluwa, Olorunsogo, Orelope, Ori Ire, Saki East, Saki West, Surulere |

### 5.2 LGA Population (2006 Census) and Projected 2025 Population

The table below presents the **verified** 2006 NPC census figures for all 33 LGAs and **projected** 2025 population estimates using the NPC standard 3.0% annual growth rate:

| # | Local Government Area | 2006 Census Population [VF] | Projected 2025 Population [WA] | Zone |
|:-:|----------------------|:--------------------------:|:-----------------------------:|------|
| 1 | Afijio | 132,184 | 225,157 | Central |
| 2 | Akinyele | 211,811 | 360,870 | Central |
| 3 | Atiba | 168,246 | 286,666 | Central |
| 4 | Atisbo | 109,965 | 187,335 | North |
| 5 | Egbeda | 283,643 | 483,245 | Central |
| 6 | Ibadan North | 308,119 | 524,940 | South |
| 7 | Ibadan North-East | 331,444 | 564,701 | South |
| 8 | Ibadan North-West | 154,029 | 262,480 | South |
| 9 | Ibadan South-East | 266,457 | 453,951 | South |
| 10 | Ibadan South-West | 283,098 | 482,316 | South |
| 11 | Ibarapa Central | 103,243 | 175,885 | South |
| 12 | Ibarapa East | 117,182 | 199,619 | South |
| 13 | Ibarapa North | 100,293 | 170,859 | South |
| 14 | Ido | 104,087 | 177,322 | Central |
| 15 | Irepo | 121,240 | 206,530 | North |
| 16 | Iseyin | 255,619 | 435,487 | North |
| 17 | Itesiwaju | 127,391 | 217,008 | North |
| 18 | Iwajowa | 102,847 | 175,210 | North |
| 19 | Kajola | 200,528 | 341,637 | North |
| 20 | Lagelu | 148,133 | 252,337 | Central |
| 21 | Ogbomosho North | 198,859 | 338,793 | North |
| 22 | Ogbomosho South | 100,379 | 171,006 | North |
| 23 | Ogo Oluwa | 65,198 | 111,057 | North |
| 24 | Olorunsogo | 81,339 | 138,559 | North |
| 25 | Oluyole | 203,461 | 346,635 | Central |
| 26 | Ona-Ara | 265,571 | 452,441 | Central |
| 27 | Orelope | 104,004 | 177,181 | North |
| 28 | Ori Ire | 149,408 | 254,509 | North |
| 29 | Oyo East | 124,095 | 211,391 | Central |
| 30 | Oyo West | 136,457 | 232,439 | Central |
| 31 | Saki East | 108,957 | 185,617 | North |
| 32 | Saki West | 273,268 | 465,553 | North |
| 33 | Surulere | 140,339 | 239,051 | North |
| | **STATE TOTAL** | **5,580,894** | **9,507,764** | |

**Sources:**
- 2006 figures: National Population Commission, *2006 Population and Housing Census — Priority Table Vol. 1* [VF]
- 2025 projections: Computed at 3.0% annual growth rate (NPC standard projection factor) over 19 years [WA]. Formula: P₂₀₂₅ = P₂₀₀₆ × (1.03)¹⁹ = P₂₀₀₆ × 1.7535

### 5.3 Estimated Enumeration Areas in Oyo State

**Important methodological note**: The NPC does not publish EA counts at the state level in its publicly available documentation. The following estimates are derived from a **density-adjusted estimation model** using verified 2006 census population data and internationally recognised EA sizing parameters. All estimates are classified as **Working Assumptions [WA]**.

#### 5.3.1 NBS Survey Sampling Frame

The NBS General Household Survey Panel (2015) documentation references approximately **23,070 Enumeration Areas** in the NBS national sampling frame, distributed at approximately **30 EAs per LGA** across Nigeria's 774 LGAs. For Oyo State (33 LGAs), this yields approximately **990 EAs** in the NBS survey frame [WA].

However, this figure represents the *survey sampling frame* — a coarser geographic grid used for inter-censal household surveys (mean population ~6,000 persons per EA). The operational census EA frame, where each unit is sized for a single enumerator to canvass in 5 days, is substantially finer.

#### 5.3.2 Density-Adjusted EA Estimation Model

To estimate the operational census EA count, the Consultant developed a **three-tier density classification model** based on the settlement characteristics of each LGA:

| Classification | EA Population Target | Rationale |
|---------------|:-------------------:|-----------|
| **Urban** (high-density metropolitan) | 800 persons/EA | Compact settlements, short travel distances between households; enumerator covers more persons per day but in smaller geographic area |
| **Semi-Urban** (peri-urban and secondary towns) | 650 persons/EA | Mixed density with both compact town centres and dispersed peri-urban growth areas |
| **Rural** (predominantly agrarian/dispersed) | 500 persons/EA | Dispersed settlements, longer travel distances between households; enumerator covers fewer persons per day across larger geographic area |

These parameters are consistent with the UN *Principles and Recommendations for Population and Housing Censuses* (Rev. 3, Para. 1.186) and the NPC's own EA design principle that each unit must be coverable by a single enumerator within the allotted census period (5 days).

#### 5.3.3 LGA Classification

**Urban (5 LGAs)** — The five LGAs constituting the Ibadan metropolitan core, characterised by continuous high-density settlement:

> Ibadan North, Ibadan North-East, Ibadan North-West, Ibadan South-East, Ibadan South-West

**Semi-Urban (11 LGAs)** — LGAs containing significant urban centres (secondary cities, large towns) or forming the peri-urban fringe of Ibadan metropolis:

> Akinyele, Egbeda, Lagelu, Oluyole, Ona-Ara (peri-urban Ibadan); Ogbomosho North, Ogbomosho South (Ogbomosho city); Oyo East, Oyo West (Oyo town); Saki West (Saki town); Iseyin (Iseyin town)

**Rural (17 LGAs)** — LGAs with predominantly dispersed, agrarian settlement patterns:

> Afijio, Atiba, Atisbo, Ibarapa Central, Ibarapa East, Ibarapa North, Ido, Irepo, Itesiwaju, Iwajowa, Kajola, Ogo Oluwa, Olorunsogo, Orelope, Ori Ire, Saki East, Surulere

#### 5.3.4 LGA-by-LGA Enumeration Area Estimate

| # | Local Government Area | Classification | 2006 Population [VF] | Persons/EA | Estimated EAs [WA] |
|:-:|----------------------|:--------------:|:--------------------:|:----------:|:-------------------:|
| | **URBAN LGAs** | | | **800** | |
| 1 | Ibadan North | Urban | 308,119 | 800 | **385** |
| 2 | Ibadan North-East | Urban | 331,444 | 800 | **414** |
| 3 | Ibadan North-West | Urban | 154,029 | 800 | **193** |
| 4 | Ibadan South-East | Urban | 266,457 | 800 | **333** |
| 5 | Ibadan South-West | Urban | 283,098 | 800 | **354** |
| | *Urban subtotal* | | *1,343,147* | | ***1,679*** |
| | **SEMI-URBAN LGAs** | | | **650** | |
| 6 | Akinyele | Semi-Urban | 211,811 | 650 | **326** |
| 7 | Egbeda | Semi-Urban | 283,643 | 650 | **436** |
| 8 | Iseyin | Semi-Urban | 255,619 | 650 | **393** |
| 9 | Lagelu | Semi-Urban | 148,133 | 650 | **228** |
| 10 | Ogbomosho North | Semi-Urban | 198,859 | 650 | **306** |
| 11 | Ogbomosho South | Semi-Urban | 100,379 | 650 | **154** |
| 12 | Oluyole | Semi-Urban | 203,461 | 650 | **313** |
| 13 | Ona-Ara | Semi-Urban | 265,571 | 650 | **409** |
| 14 | Oyo East | Semi-Urban | 124,095 | 650 | **191** |
| 15 | Oyo West | Semi-Urban | 136,457 | 650 | **210** |
| 16 | Saki West | Semi-Urban | 273,268 | 650 | **420** |
| | *Semi-Urban subtotal* | | *2,201,296* | | ***3,386*** |
| | **RURAL LGAs** | | | **500** | |
| 17 | Afijio | Rural | 132,184 | 500 | **264** |
| 18 | Atiba | Rural | 168,246 | 500 | **337** |
| 19 | Atisbo | Rural | 109,965 | 500 | **220** |
| 20 | Ibarapa Central | Rural | 103,243 | 500 | **207** |
| 21 | Ibarapa East | Rural | 117,182 | 500 | **234** |
| 22 | Ibarapa North | Rural | 100,293 | 500 | **201** |
| 23 | Ido | Rural | 104,087 | 500 | **208** |
| 24 | Irepo | Rural | 121,240 | 500 | **243** |
| 25 | Itesiwaju | Rural | 127,391 | 500 | **255** |
| 26 | Iwajowa | Rural | 102,847 | 500 | **206** |
| 27 | Kajola | Rural | 200,528 | 500 | **401** |
| 28 | Ogo Oluwa | Rural | 65,198 | 500 | **130** |
| 29 | Olorunsogo | Rural | 81,339 | 500 | **163** |
| 30 | Orelope | Rural | 104,004 | 500 | **208** |
| 31 | Ori Ire | Rural | 149,408 | 500 | **299** |
| 32 | Saki East | Rural | 108,957 | 500 | **218** |
| 33 | Surulere | Rural | 140,339 | 500 | **281** |
| | *Rural subtotal* | | *2,036,451* | | ***4,075*** |
| | | | | | |
| | **OYO STATE TOTAL** | | **5,580,894** | | **9,140** |

#### 5.3.5 Summary of EA Estimates

| Tier | LGAs | Population (2006) | % of State | Estimated EAs | % of EAs | Avg. EAs per LGA |
|------|:-----:|:-----------------:|:----------:|:-------------:|:--------:|:-----------------:|
| **Urban** | 5 | 1,343,147 | 24.1% | 1,679 | 18.4% | 336 |
| **Semi-Urban** | 11 | 2,201,296 | 39.4% | 3,386 | 37.0% | 308 |
| **Rural** | 17 | 2,036,451 | 36.5% | 4,075 | 44.6% | 240 |
| **Total** | **33** | **5,580,894** | **100%** | **9,140** | **100%** | **277** |

**Key observations:**
- The **weighted average EA population** across Oyo State is approximately **611 persons per EA**, consistent with international norms
- Rural LGAs account for **44.6%** of all EAs despite holding only 36.5% of the population — reflecting the larger number of smaller EAs required to cover dispersed settlements
- Urban Ibadan metropolis concentrates 24.1% of the state's population in just 18.4% of EAs — reflecting the efficiency of high-density enumeration
- The **largest LGA by EA count** is Egbeda (436 EAs), followed by Saki West (420 EAs) and Ibadan North-East (414 EAs)
- The **smallest LGA by EA count** is Ogo Oluwa (130 EAs), reflecting its small and dispersed rural population

#### 5.3.6 Sensitivity Analysis

| Scenario | Urban Target | Semi-Urban Target | Rural Target | Total EAs |
|----------|:-----------:|:-----------------:|:------------:|:---------:|
| **Conservative** (larger EAs) | 900 | 750 | 600 | 7,424 |
| **Base case** (adopted) | 800 | 650 | 500 | **9,140** |
| **Granular** (smaller EAs) | 700 | 550 | 400 | 11,107 |

The sensitivity analysis confirms a plausible range of **7,400–11,100 EAs** for Oyo State. The base case estimate of **~9,140 EAs** is adopted as the Consultant's working figure.

#### 5.3.7 2025 Projected EA Requirement

Applying the NPC standard 3.0% annual growth rate, the 2025 projected population of **~9.5 million** would require an estimated **~16,025 EAs** using the same density-adjusted model (assuming the settlement classification of each LGA remains unchanged). This figure is broadly consistent with the expected output of the NPC's 2023 Census EAD (completed November 2021), which used GIS technology to create a finer-grained EA frame than the 2006 exercise.

**For OSLSR planning purposes**, the Consultant adopts the 2006-based estimate of **~9,140 operational census EAs in Oyo State** [WA] as the reference figure, noting that:
1. The precise NPC figure is obtainable from the NPC State Office (Agodi, Ibadan) or NPC Headquarters (Abuja)
2. The 2023 Census EAD outputs, once published, will provide the definitive updated figure
3. The OSLSR's own enumeration framework operates at the LGA/Ward level (not EA level), making the exact EA count informational rather than operationally critical

---

## 6. NPC EAD Institutional Framework

### 6.1 Organisational Structure

The EAD programme involves multiple NPC departments:

| Department | Role in EAD |
|-----------|-------------|
| **Census Department** | Quality assurance of EA outputs |
| **ICT Department** | PDA configuration, EADPad development, ArcGIS management |
| **Legal Department** | Data confidentiality protocols |
| **Planning & Research** | Monitoring and evaluation |
| **Human Resources** | Training of demarcation personnel |
| **Public Affairs** | Community advocacy and sensitisation |
| **Finance** | Phase-wise fund disbursement |

### 6.2 Field Personnel Structure

| Role | Function |
|------|---------|
| **EAD Manager** | State-level programme coordination |
| **EAD Coordinator** | Zonal supervision across multiple LGAs |
| **EAD Assistant** | LGA-level operational management |
| **Quality Assurance Officer** | Field verification of EA boundary accuracy |
| **GIS Team** | Satellite imagery processing, topology correction, map production |
| **Supervisor** | Direct oversight of demarcation teams |
| **Demarcator** | Ground-level boundary identification and recording |

### 6.3 Data Outputs

The completed EAD exercise produces the following spatial and attribute datasets:

1. **Enumeration Area (EA) polygons** — the fundamental unit
2. **Supervisory Area (SA) polygons** — clusters of EAs assigned to one supervisor
3. **Locality boundaries** — settlement-level geographic units
4. **Registration Area (RA) / Ward boundaries** — administrative ward delineation
5. **LGA boundaries** — verified and updated LGA geographic limits
6. **Building information** — geocoded building footprints with attribute data
7. **Road networks** — classified road data within each EA
8. **Water bodies** — rivers, streams, lakes mapped within and bounding EAs
9. **Infrastructure data** — schools, health facilities, markets, places of worship
10. **Socio-economic amenities** — community facilities and services inventory

---

## 7. Relevance to the OSLSR Enumeration Area Framework

The OSLSR adopts the NPC's EA concept but adapts it for the specific requirements of a skills register (as distinct from a population census):

| Dimension | NPC Census EA | OSLSR Adapted EA |
|-----------|--------------|-----------------|
| **Purpose** | Universal population count | Targeted skilled workforce enumeration |
| **Primary unit** | EA (~500–800 persons) | LGA (33 units statewide) |
| **Sub-unit** | N/A for field assignment | Ward (rotation basis for 3 enumerators per LGA) |
| **Boundary method** | Pre-delineated polygon maps | GPS capture at point of submission (real-time digital mapping) |
| **Enumerators per unit** | 1 per EA | 3 per LGA (rotating across wards) |
| **Duration** | 5 days per EA | 30 days per LGA (continuous) |
| **Coverage target** | 100% household coverage | Maximum voluntary coverage (not universal) |
| **Map production** | Pre-census (years in advance) | Real-time (progressive GPS heatmap) |

**Key adaptation rationale:**

1. **LGA as primary unit (not EA)**: The OSLSR is a voluntary skills register, not a mandatory census. Universal household coverage is neither required nor feasible with 3 enumerators per LGA. The LGA is the appropriate assignment and accountability unit.

2. **Ward rotation model**: Rather than assigning enumerators to fixed NPC EAs, the OSLSR rotates its 3 enumerators across wards within each LGA on a planned schedule. This ensures geographic coverage while accommodating the voluntary nature of registration.

3. **Real-time GPS mapping**: The OSLSR does not require pre-delineated EA maps because it builds its own geographic coverage map progressively through GPS coordinates captured with each submission. This is operationally simpler and produces a submission density map that serves as both a coverage tool and a fraud detection instrument.

4. **NPC frame as reference, not constraint**: The NPC EA frame remains a valuable reference for understanding population distribution and planning enumerator routes, but the OSLSR is not bound by NPC EA boundaries for field operations.

---

## 8. Sources

1. National Population Commission (NPC). *History of Population Census in Nigeria*. [nationalpopulation.gov.ng/census-enumeration](https://nationalpopulation.gov.ng/census-enumeration)
2. National Population Commission (NPC). *Enumeration Area Demarcation (EAD)*. [nationalpopulation.gov.ng/EAD](https://nationalpopulation.gov.ng/EAD)
3. National Population Commission (NPC). *2006 Population and Housing Census — Priority Table Volume 1*. Abuja: NPC, 2010.
4. Esri. *Nigeria Applies Advanced Geospatial Technology for Census Preparations*. ArcNews, Winter 2024. [esri.com/about/newsroom/arcnews](https://www.esri.com/about/newsroom/arcnews/nigeria-applies-advanced-geospatial-technology-for-census-preparations/)
5. Soluap. *Enumeration Area Demarcation for Nigeria 2023 Population and Housing Census*. [soluap.com](https://soluap.com/enumeration-area-demarcation-for-nigeria-2023-population-and-housing-census/)
6. Geospatial World. *Delineation and Management of Enumeration Areas in Census Operations*. May 2012. [geospatialworld.net](https://geospatialworld.net/article/delineation-and-management-of-enumeration-areas-in-census-operations/)
7. United Nations Statistics Division. *Principles and Recommendations for Population and Housing Censuses, Revision 3*. Series M, No. 67/Rev.3. New York: UN, 2017.
8. United Nations Statistics Division. *Handbook on the Management of Population and Housing Censuses, Revision 2*. Series F, No. 83/Rev.2. New York: UN, 2021.
9. International Household Survey Network (IHSN). *Nigeria — Population and Housing Census 2006*. [catalog.ihsn.org/catalog/3340](https://catalog.ihsn.org/index.php/catalog/3340)
10. CityPopulation.de. *Oyo State — Local Government Areas*. Based on NPC 2006 Census data. [citypopulation.de](https://citypopulation.de/en/nigeria/admin/NGA031__oyo/)
11. Adebekun, R.A. & Oladapo, O.O. *Delineation of Enumeration Areas Using Geographic Information System: Part of Atiba Local Government Area, Oyo State, Nigeria*. ResearchGate, 2019.
12. NBS. *General Household Survey Panel, 2015 — Number of Enumeration Areas*. Nigeria Data Portal. [nigeria.opendataforafrica.org](https://nigeria.opendataforafrica.org/NGGHHSP2017/general-household-survey-panel-2015)

---

## Assumption Classification

This document follows the three-tier assumption classification framework established in Chapter 9 of the Baseline Study Report:

- **[VF]** — Verified Fact: Data from NPC official publications and census records
- **[FD]** — Field-Dependent: Estimates requiring field verification
- **[WA]** — Working Assumption: Projections based on published parameters and professional judgement

---

*Document Reference: CHM/OSLR/2026/REF-001 | NPC EA Framework Reference Note | Chemiroy Nigeria Limited*
