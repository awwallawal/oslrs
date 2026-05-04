# 17. Risk Register and Mitigation Framework

---

## 17.1 Introduction

This chapter presents the formal Risk Register for the remaining phases of the Oyo State Skilled Labour Register project. The risk register was developed using a structured **Probability × Impact** assessment methodology, with each identified risk assigned a severity classification, designated owner, and specific mitigation strategy.

The risk register is a living document, it will be updated at each Stage Gate review (Chapter 19) as risks materialise, are mitigated, or as new risks emerge.

---

## 17.2 Risk Assessment Methodology

### 17.2.1 Probability Scale

| Rating | Probability | Description |
|:------:|:----------:|-------------|
| 1 | Very Low (< 10%) | Unlikely to occur under normal circumstances |
| 2 | Low (10–25%) | Could occur but only under specific conditions |
| 3 | Medium (25–50%) | Reasonable possibility of occurrence |
| 4 | High (50–75%) | More likely than not to occur |
| 5 | Very High (> 75%) | Expected to occur without intervention |

### 17.2.2 Impact Scale

| Rating | Impact | Description |
|:------:|:------:|-------------|
| 1 | Negligible | Minimal effect on project; absorbed within normal operations |
| 2 | Minor | Localised effect; manageable within existing resources |
| 3 | Moderate | Noticeable impact on timeline or quality; requires management attention |
| 4 | Major | Significant impact on project delivery, data quality, or stakeholder confidence |
| 5 | Critical | Project-threatening; could result in failure to deliver or fundamental compromise of registry integrity |

### 17.2.3 Risk Severity Matrix

```
┌────────────────────────────────────────────────────────────┐
│                    RISK SEVERITY MATRIX                      │
│                    Probability × Impact                      │
│                                                              │
│  I                                                           │
│  M  5 │  5    10   [15]  [20]  [25]                        │
│  P    │  MED  HIGH  HIGH  CRIT  CRIT                       │
│  A    │                                                     │
│  C  4 │  4    8    [12]  [16]  [20]                        │
│  T    │  LOW  MED   HIGH  CRIT  CRIT                       │
│       │                                                     │
│     3 │  3    6     9    [12]  [15]                        │
│       │  LOW  MED   MED   HIGH  HIGH                       │
│       │                                                     │
│     2 │  2    4     6     8    10                           │
│       │  LOW  LOW   MED   MED  HIGH                        │
│       │                                                     │
│     1 │  1    2     3     4    5                            │
│       │  LOW  LOW   LOW   LOW  MED                         │
│       │                                                     │
│       └──────────────────────────────────────               │
│          1     2     3     4    5                            │
│                 PROBABILITY                                  │
│                                                              │
│  [  ] = Risks currently in register                         │
│  CRIT = Immediate escalation required                       │
│  HIGH = Active mitigation required                          │
│  MED  = Monitor and prepare contingency                     │
│  LOW  = Accept and monitor                                  │
└────────────────────────────────────────────────────────────┘
```

---

## 17.3 Risk Register

### 17.3.1 Category A: Resource Mobilisation Risks

| ID | Risk | Prob | Impact | Severity | Owner | Mitigation | Contingency |
|:--:|------|:----:|:------:|:--------:|-------|-----------|-------------|
| R-01 | **Delayed mobilisation of field personnel**, Recruitment of 132 field staff delayed beyond planned timeline | 4 | 5 | **CRITICAL (20)** | Ministry / Consultant | Early engagement with Ministry HR; pre-identification of candidate pools through LGA education offices and NYSC networks; streamlined recruitment criteria | Phased deployment, begin with 11 priority LGAs while recruiting remaining staff |
| R-02 | **Delayed procurement of mobile devices**, 132 Android devices not available when field staff are ready | 3 | 4 | **HIGH (12)** | Ministry / Procurement | Early procurement initiation; bulk purchase from verified suppliers; specification flexibility (any Android 8.0+ device with required features) | Temporary use of enumerator personal devices (with data allowance compensation) for initial deployment |
| R-03 | **Insufficient funding for field logistics**, Transport allowances, airtime, and materials budget not released | 3 | 5 | **HIGH (15)** | Ministry | Clear budget breakdown submitted with this report (Chapter 22); phased budget release aligned with Stage Gates | Prioritise high-population LGAs; reduce from 30-day to 20-day enumeration period |

### 17.3.2 Category B: Field Operations Risks

| ID | Risk | Prob | Impact | Severity | Owner | Mitigation | Contingency |
|:--:|------|:----:|:------:|:--------:|-------|-----------|-------------|
| R-04 | **Community resistance to enumeration**, Respondents refuse to participate due to suspicion of government data collection | 3 | 3 | **MEDIUM (9)** | Supervisor / Consultant | Advance sensitisation programme (Chapter 22, Rec. 4); Ministry introductory letters; branded identification; community leader engagement | Deploy community liaison persons from within the LGA; reschedule to post-sensitisation period |
| R-05 | **Enumerator attrition during field period**, Enumerators abandon the exercise before completion | 3 | 3 | **MEDIUM (9)** | Supervisor | Competitive remuneration; clear payment schedule; team morale management; performance recognition | Standby pool of 10% additional trained reserves; redistribute workload among remaining enumerators |
| R-06 | **Poor network connectivity in rural LGAs**, Inability to synchronise data from remote areas | 2 | 2 | **LOW (4)** | Consultant | PWA offline capability (7-day autonomous operation); 2G/3G sufficient for sync; weekly sync schedule for remote areas | Supervisor collects devices weekly for centralised sync at nearest connectivity point |
| R-07 | **Device failure or loss in field**, Smartphones damaged, stolen, or rendered inoperable | 3 | 2 | **MEDIUM (6)** | Supervisor | Protective cases provided; device insurance; enumerator accountability protocol; regular backup via sync | Spare device pool (10% reserve); temporary reassignment to co-located enumerator device |
| R-08 | **Adverse weather during enumeration**, Rainy season disrupts field operations | 3 | 2 | **MEDIUM (6)** | Supervisor | Scheduling around known rainy patterns; flexible daily scheduling; waterproof device cases | Extension of enumeration period; indoor enumeration at markets and community centres |

### 17.3.3 Category C: Data Quality Risks

| ID | Risk | Prob | Impact | Severity | Owner | Mitigation | Contingency |
|:--:|------|:----:|:------:|:--------:|-------|-----------|-------------|
| R-09 | **Enumerator data fabrication**, Field staff submit fictitious records to inflate productivity | 3 | 4 | **HIGH (12)** | Consultant / Supervisor | Automated fraud detection (GPS clustering, speed-run, straight-lining); per-enumerator monitoring; configurable thresholds | Immediate suspension of flagged enumerators; re-interview requirement for all flagged submissions; termination for confirmed fabrication |
| R-10 | **NIN transcription errors**, Respondents provide incorrect NIN leading to invalid records | 3 | 3 | **MEDIUM (9)** | Enumerator | Modulus 11 real-time validation catches mathematical errors; enumerator training emphasis on NIN accuracy; re-entry prompt on failure | Post-collection NIN verification batch (if NIMC API access becomes available) |
| R-11 | **Respondent self-selection bias**, Registry over-represents certain demographics or skills categories | 3 | 3 | **MEDIUM (9)** | Consultant / Supervisor | Stratified enumeration targets per LGA; ward-level coverage monitoring; active pursuit of underrepresented demographics | Post-hoc weighting adjustments; supplementary targeted enumeration in underrepresented areas |
| R-12 | **High fraud flag rate overwhelming supervisory capacity**, More than 20% of submissions flagged, exceeding review capacity | 2 | 3 | **MEDIUM (6)** | Consultant | Threshold calibration from validation exercise; targeted retraining for high-flag enumerators | Dynamic threshold adjustment; additional verification assessor capacity; batch review triage |

### 17.3.4 Category D: Technical & Infrastructure Risks

| ID | Risk | Prob | Impact | Severity | Owner | Mitigation | Contingency |
|:--:|------|:----:|:------:|:--------:|-------|-----------|-------------|
| R-13 | **Server downtime during peak enumeration**, Cloud infrastructure experiences outage during high submission volume | 2 | 3 | **MEDIUM (6)** | Consultant | 99.9% uptime SLA; automated monitoring and alerting; tested disaster recovery (< 1hr RTO) | PWA offline capability buffers all submissions locally; sync upon restoration; zero data loss |
| R-14 | **Data Centre connectivity disruption**, Airtel 5G/4G service disruption at Ministry premises | 2 | 2 | **LOW (4)** | Ministry / Consultant | 5G/4G automatic fallback; ODU battery backup (5–6 hours); data entry can continue via cloud from any internet source | Temporary mobile hotspot; field laptop (Workstation 3) can operate from alternative location |
| R-15 | **Database capacity exhaustion**, Registry growth exceeds allocated storage | 1 | 3 | **LOW (3)** | Consultant | Current VPS capacity supports 100,000+ records with substantial headroom; monitoring alerts at 80% capacity | Vertical scaling (upgrade VPS); database archiving of completed records |
| R-16 | **Security breach or data leakage**, Unauthorised access to PII data | 1 | 5 | **MEDIUM (5)** | Consultant | 6-layer defence-in-depth (Chapter 14); OWASP Top 10 compliant; immutable audit logs; bcrypt+JWT+TLS; RBAC enforcement | Incident response: isolate affected component; forensic audit via immutable logs; breach notification per NDPA 2023 |

### 17.3.5 Category E: Stakeholder & Governance Risks

| ID | Risk | Prob | Impact | Severity | Owner | Mitigation | Contingency |
|:--:|------|:----:|:------:|:--------:|-------|-----------|-------------|
| R-17 | **Change in Ministry leadership or priorities**, Administrative transition disrupts project continuity | 2 | 4 | **HIGH (8)** | Ministry / Consultant | Comprehensive documentation (this report); platform operates independently of personnel changes; training of multiple Ministry staff (not single-point dependency) | Briefing package for incoming leadership; platform continues operating; data preserved |
| R-18 | **Scope expansion requests during enumeration**, Stakeholders request additional data fields or survey modifications mid-enumeration | 3 | 3 | **MEDIUM (9)** | Consultant | Instrument finalised and versioned (v3.0); change control process requiring Stage Gate review before implementation | Minor additions captured in "Other skills" free text field; major changes deferred to post-enumeration update cycle |
| R-19 | **Inter-LGA coordination failure**, Poor coordination between LGA authorities and field teams | 2 | 3 | **MEDIUM (6)** | Supervisor / Ministry | Ministry introductory letters to all 33 LGA chairmen; advance notification schedule; designated LGA liaison per supervisor | Consultant direct engagement with resistant LGA leadership; Ministry intervention |
| R-20 | **Insufficient respondent participation**, Target submission volumes not achieved within enumeration period | 3 | 3 | **MEDIUM (9)** | Supervisor / Consultant | Community sensitisation; multi-channel collection (field + public self-registration); marketplace incentive (voluntary participation in skills marketplace) | Extend enumeration period; intensify public self-registration promotion; targeted outreach in low-participation areas |

---

## 17.4 Risk Summary Dashboard

```
┌──────────────────────────────────────────────────────────┐
│              RISK SUMMARY DASHBOARD                        │
│              20 Identified Risks                           │
│                                                            │
│  BY SEVERITY:                                              │
│  ┌────────────────────────────────────────────────────┐   │
│  │  CRITICAL  ██░░░░░░░░░░░░░░░░░░░░░░░   1  (5%)   │   │
│  │  HIGH      ████████░░░░░░░░░░░░░░░░░   4 (20%)   │   │
│  │  MEDIUM    ████████████████████░░░░░░  10 (50%)   │   │
│  │  LOW       ██████████░░░░░░░░░░░░░░░   5 (25%)   │   │
│  └────────────────────────────────────────────────────┘   │
│                                                            │
│  BY CATEGORY:                                              │
│  ┌────────────────────────────────────────────────────┐   │
│  │  A: Resource Mobilisation   ███████   3 risks      │   │
│  │  B: Field Operations        ██████████ 5 risks     │   │
│  │  C: Data Quality            ████████   4 risks     │   │
│  │  D: Technical/Infrastructure████████   4 risks     │   │
│  │  E: Stakeholder/Governance  ████████   4 risks     │   │
│  └────────────────────────────────────────────────────┘   │
│                                                            │
│  TOP 5 RISKS (by severity score):                         │
│  1. R-01: Delayed field personnel mobilisation   (20)     │
│  2. R-03: Insufficient field logistics funding   (15)     │
│  3. R-02: Delayed device procurement             (12)     │
│  4. R-09: Enumerator data fabrication            (12)     │
│  5. R-10: NIN transcription errors                (9)     │
│                                                            │
│  NOTE: The single CRITICAL risk (R-01) and top HIGH       │
│  risks (R-02, R-03) are all in Category A (Resource       │
│  Mobilisation), confirming that the primary project      │
│  risk is resource-dependent, not methodology-dependent.   │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

---

## 17.5 Risk Ownership Matrix

| Owner | Risks Owned | Role in Mitigation |
|-------|:-----------:|-------------------|
| **Ministry** | R-01, R-02, R-03, R-14, R-17, R-19 | Resource mobilisation, funding release, inter-agency coordination |
| **Consultant** | R-09, R-11, R-13, R-15, R-16, R-18 | Technical controls, methodology calibration, platform operation |
| **Supervisor** | R-04, R-05, R-07, R-08, R-12, R-19, R-20 | Field management, team coordination, quality oversight |
| **Joint** | R-06, R-10 | Shared responsibility for field data quality and connectivity |

---

## 17.6 Risk Review Schedule

| Review Point | Gate | Scope |
|-------------|------|-------|
| **Pre-deployment review** | Gate 1 entry | All 20 risks, focus on Category A (resource mobilisation) |
| **Mid-enumeration review** | Gate 2 | Categories B, C, D, focus on field operations and data quality |
| **Pre-handover review** | Gate 3 entry | All risks, focus on residual risks for ongoing operations |
| **Post-handover** | Post-Gate 3 | Transfer of risk ownership to Ministry for ongoing registry operation |

---

## 17.7 Key Insight

The risk register reveals a structural pattern that is significant for project governance: **the highest-severity risks (R-01, R-02, R-03) are all in Category A (Resource Mobilisation) and are owned primarily by the Ministry**. The Consultant-owned risks (Categories C and D) are predominantly MEDIUM or LOW severity, reflecting the maturity of the technical and methodological infrastructure established during the baseline study phase.

This pattern confirms that the project's **critical path runs through resource mobilisation, not methodology or technology**. The technical, methodological, and data quality foundations are in place; the remaining risks are predominantly operational and logistical in nature.

---

*Document Reference: CHM/OSLR/2026/002 | Chapter 20 | Chemiroy Nigeria Limited*
