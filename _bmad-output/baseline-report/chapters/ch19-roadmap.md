# CHAPTER 19: IMPLEMENTATION ROADMAP & STAGE GATES

---

## 19.1 Introduction

This chapter presents the implementation roadmap for the completion of the Oyo State Skilled Labour Register, structured around a **Stage Gate methodology** — a structured decision-making framework that divides the project into distinct phases, each concluded by a formal decision point (gate) where progress is assessed against predefined criteria before authorisation to proceed to the next phase.

The Stage Gate approach ensures disciplined project governance, prevents commitment of resources ahead of evidence, and provides clear checkpoints for the commissioning authority to evaluate progress and make informed decisions.

---

## 19.2 Stage Gate Overview

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  GATE 0  │     │  GATE 1  │     │  GATE 2  │     │  GATE 3  │
│          │     │          │     │          │     │          │
│ Baseline │────▶│  Field   │────▶│  Data    │────▶│ Handover │
│ Complete │     │ Deploy   │     │ Quality  │     │ Complete │
│          │     │          │     │          │     │          │
│ WE ARE   │     │ Mobilise │     │ Validate │     │ Train &  │
│ HERE ◀── │     │ Field    │     │ Registry │     │ Transfer │
│          │     │ Teams    │     │ Data     │     │          │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
  Months 1-4       Month 5       Month 5-6         Month 6
 (Complete)      (Upcoming)     (Upcoming)        (Upcoming)
```

---

## 19.3 Gate 0: Baseline Study Complete (CURRENT — ACHIEVED)

### 19.3.1 Scope

Gate 0 encompasses all preparatory work required before field deployment, including infrastructure establishment, methodology design, instrument validation, and platform development.

### 19.3.2 Deliverables and Status

| # | Deliverable | Status | Evidence |
|---|-------------|:------:|----------|
| G0-1 | Physical Data Center established at Ministry premises | ✓ | 3 workstations operational, Airtel 5G connectivity active (Ch. 12) |
| G0-2 | Cloud infrastructure deployed and monitored | ✓ | Production server operational, daily backups active (Ch. 12) |
| G0-3 | Survey instrument designed and validated (v3.0) | ✓ | 36 questions, ILO ICLS-19 aligned, 3 review cycles (Ch. 10) |
| G0-4 | Occupational skills taxonomy complete | ✓ | 150 skills, 20 sectors, ISCO-08 mapped (Ch. 11) |
| G0-5 | OSLSR platform developed and deployed | ✓ | 3,564 tests, OWASP compliant, 15 capabilities operational (Ch. 13) |
| G0-6 | Validation exercise complete (n=330) | ✓ | All 33 LGAs covered, NBS benchmarks aligned (Ch. 15–16) |
| G0-7 | Data quality framework operational | ✓ | 4-layer QA, fraud detection calibrated (Ch. 17) |
| G0-8 | Capacity building curriculum designed | ✓ | 8 role-specific modules developed (Ch. 18) |
| G0-9 | Baseline Study Report submitted | ✓ | This document |

### 19.3.3 Gate 0 Decision

| Criterion | Threshold | Result | Decision |
|-----------|-----------|:------:|:--------:|
| Data Center operational | Hardware + connectivity functional | ✓ Met | **PROCEED** |
| Platform tested | >3,000 automated tests passing | ✓ 3,564 | **PROCEED** |
| Instrument validated | All 33 LGAs covered | ✓ 330 responses | **PROCEED** |
| Security assessment | OWASP Top 10 compliant | ✓ 10/10 | **PROCEED** |
| Methodology documented | Baseline report submitted | ✓ This document | **PROCEED** |

**Gate 0 Status: PASSED — Authorised to proceed to Gate 1**

---

## 19.4 Gate 1: Field Deployment Authorised (UPCOMING)

### 19.4.1 Scope

Gate 1 encompasses the mobilisation and deployment of field enumeration teams across all 33 LGAs. This gate cannot be entered until the requisite human and material resources are mobilised.

### 19.4.2 Prerequisites (Resources Required)

| # | Resource | Specification | Quantity | Purpose |
|---|----------|--------------|:--------:|---------|
| R-1 | Field Enumerators | Literate adults with smartphone proficiency, LGA-resident preferred | **99** (3 per LGA × 33 LGAs) | Door-to-door data collection |
| R-2 | Field Supervisors | Experienced coordinators, management capability | **33** (1 per LGA) | Team coordination, quality oversight, fraud alert review |
| R-3 | Mobile Devices | Android 8.0+, 2GB RAM, 32GB storage, GPS, camera | **132** | Data collection hardware |
| R-4 | SIM Cards with Data | Minimum 2GB/month data allocation per device | **132** | Data synchronisation |
| R-5 | Transportation Allowance | Coverage for intra-LGA travel | 132 persons × 30 days | Field mobility |
| R-6 | Communication Airtime | Voice and data for team coordination | 132 persons × 30 days | In-app messaging, voice calls |
| R-7 | Identification Materials | Branded vests, ID cards, introductory letters from Ministry | 132 sets | Field access and legitimacy |
| R-8 | Sensitisation Materials | Flyers, posters, community announcement templates | 33 LGA sets | Community engagement |
| R-9 | Training Venue | Conference/meeting room with projector, internet | 1 (central) + 5 (zonal) | Enumerator and supervisor training |

### 19.4.3 Gate 1 Activities

| Activity | Duration | Dependency |
|----------|----------|------------|
| Enumerator recruitment and screening | 1 week | R-1 |
| Supervisor recruitment and screening | 1 week | R-2 |
| Classroom training — Enumerators (centralised) | 3 days | R-1, R-9, Ch. 18 curriculum |
| Classroom training — Supervisors (centralised) | 2 days | R-2, R-9, Ch. 18 curriculum |
| Device procurement and configuration | 1 week (parallel) | R-3, R-4 |
| Field pilot — 3 selected LGAs | 3 days | All above |
| Pilot review and final calibration | 2 days | Pilot data |
| Full 33-LGA deployment authorisation | 1 day | All gate criteria met |

### 19.4.4 Gate 1 Proceed/Hold/Stop Criteria

| Criterion | Proceed | Hold | Stop |
|-----------|---------|------|------|
| **Enumerator recruitment** | ≥90 of 99 recruited and trained | 70–89 recruited | <70 recruited |
| **Supervisor recruitment** | ≥30 of 33 recruited and trained | 25–29 recruited | <25 recruited |
| **Devices available** | ≥120 of 132 configured | 100–119 configured | <100 configured |
| **Training completion** | ≥85% pass rate on assessment | 70–84% pass rate | <70% pass rate |
| **Pilot success** | ≥90% submission success rate in 3 pilot LGAs | 75–89% success | <75% success |
| **Logistics confirmed** | Transport + airtime + materials for all 33 LGAs | 25–32 LGAs covered | <25 LGAs covered |

---

## 19.5 Gate 2: Data Quality Validation (UPCOMING)

### 19.5.1 Scope

Gate 2 occurs mid-way through the field enumeration period. It assesses data quality, identifies and resolves field issues, and authorises continuation or course correction.

### 19.5.2 Gate 2 Activities

| Activity | Timing | Method |
|----------|--------|--------|
| Data quality review — first 2 weeks of submissions | Week 3 of enumeration | Automated fraud detection + supervisory review |
| Submission volume assessment by LGA | Weekly | Platform analytics dashboard |
| Enumerator performance review | Weekly | Productivity metrics per enumerator |
| Respondent complaint/feedback review | Ongoing | Ministry coordination |
| Mid-enumeration calibration | If required | Threshold adjustments, additional training |

### 19.5.3 Gate 2 Proceed/Hold/Stop Criteria

| Criterion | Proceed | Hold | Stop |
|-----------|---------|------|------|
| **Fraud flag rate** | <10% of submissions | 10–20% | >20% (systemic quality issue) |
| **Submission volume** | ≥70% of target per LGA | 50–69% | <50% (mobilisation failure) |
| **Data completeness** | ≥95% of required fields populated | 90–94% | <90% (instrument issue) |
| **NIN duplication rate** | <2% | 2–5% | >5% (enumeration overlap) |
| **Enumerator activity** | ≥90% active daily | 75–89% | <75% (attrition/motivation) |

---

## 19.6 Gate 3: Handover & Training (UPCOMING)

### 19.6.1 Scope

Gate 3 is the final phase, encompassing data analysis, registry population confirmation, capacity building delivery (Deliverable 3), and formal project handover to the Ministry.

### 19.6.2 Gate 3 Activities

| Activity | Duration | Deliverable |
|----------|----------|------------|
| Field enumeration completion and final data sync | 2 days | All offline submissions uploaded |
| Data cleaning and quality reconciliation | 3 days | Clean registry dataset |
| Registry population verification | 2 days | Total registrant count and LGA distribution confirmed |
| Ministry official training — Super Admin/Admin | 2 days | Deliverable 3 (partial) |
| Ministry official training — Supervisory roles | 1 day | Deliverable 3 (partial) |
| Ministry official training — Reporting and Analytics | 1 day | Deliverable 3 (complete) |
| Platform documentation and user manuals delivery | 1 day | Operational documentation |
| Formal project handover ceremony | 1 day | Signed handover document |
| Completion Report submission | 3 days | Final engagement deliverable |

### 19.6.3 Gate 3 Acceptance Criteria

| # | Criterion | Threshold |
|---|-----------|-----------|
| 1 | Registry populated with verified respondent records | Minimum target TBD by Ministry |
| 2 | All 33 LGAs represented in registry data | 100% LGA coverage |
| 3 | Ministry officials trained and assessed | ≥85% pass rate on competency assessment |
| 4 | Platform operational documentation delivered | Complete user manual + admin guide |
| 5 | Data backup verified and disaster recovery tested | Successful restore from latest backup |
| 6 | Completion Report accepted by Ministry | Formal written acceptance |

---

## 19.7 Implementation Timeline (Gantt View)

```
MONTH:        1        2        3        4        5        6
WEEK:     1234    5678    9012    3456    7890    1234
          ────    ────    ────    ────    ────    ────

GATE 0: BASELINE STUDY (COMPLETE)
──────────────────────────────────────────────
Inception    ████
Desk Review  ░░████
Instrument       ░░████░░
Data Center      ░░████
Platform Dev         ░░████████░░
Security                     ░░██
Validation                     ░░██
Report                           ░░██
──────────────────────────────────────────────
                                  ▲
                              WE ARE HERE

GATE 1: FIELD DEPLOYMENT
                                      ░░██████
Recruitment                           ░░██
Training                                ░░██
Device Setup                          ░░██
Pilot (3 LGAs)                           ██
Full Deploy                               ██

GATE 2: DATA QUALITY
                                          ████████
Field Enum.                               ████████
QA Reviews                                ░░██████
Mid-Course                                  ░░██

GATE 3: HANDOVER
                                              ████████
Data Clean                                    ░░██
Training                                        ████
Documentation                                   ░░██
Handover                                           ██
Completion Rpt                                     ██

████ = Active    ░░ = Overlap/Preparation
```

---

## 19.8 Critical Path

The project's critical path — the sequence of activities that determines the minimum project duration — is:

1. **Gate 0 → Gate 1 transition** (CURRENT BOTTLENECK): Field deployment cannot commence until enumerator recruitment, device procurement, and logistics are mobilised. This transition is **resource-dependent**, not methodology-dependent.

2. **Field enumeration duration**: The planned 30-day enumeration period across all 33 LGAs is the longest single activity remaining.

3. **Training delivery**: Ministry official training requires completion of enumeration (to train using real production data).

**The Consultant notes that all methodology-dependent activities (Gates 0) have been completed on schedule. The remaining project timeline is contingent upon the timely mobilisation of field resources as detailed in Section 19.4.2.**

---

*Document Reference: CHM/OSLR/2026/001 | Chapter 19 | Chemiroy Nigeria Limited*
