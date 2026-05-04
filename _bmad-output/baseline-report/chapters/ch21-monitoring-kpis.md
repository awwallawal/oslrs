# 18. Monitoring and Evaluation Framework: Key Performance Indicators

---

## 18.1 Introduction

This chapter establishes the **Monitoring and Evaluation (M&E) Framework** for the Oyo State Skilled Labour Register, comprising a set of **Key Performance Indicators (KPIs)** that provide quantifiable measures of project progress, data quality, and registry outcomes. The KPI framework enables objective assessment at each Stage Gate review (Chapter 19) and supports evidence-based decision-making throughout the remaining project phases.

The framework is structured across five KPI domains, with each indicator assigned a **data source**, **measurement frequency**, **target value**, and **alert threshold** that triggers management attention.

---

## 18.2 KPI Framework Structure

```
┌──────────────────────────────────────────────────────────────┐
│              KPI FRAMEWORK, 5 DOMAINS                        │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐     │
│  │  DOMAIN 1: ENUMERATION PROGRESS                     │     │
│  │  How much data are we collecting?                    │     │
│  │  7 KPIs, Daily/Weekly measurement                  │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐     │
│  │  DOMAIN 2: DATA QUALITY                              │     │
│  │  How good is the data we are collecting?             │     │
│  │  8 KPIs, Daily/Weekly measurement                  │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐     │
│  │  DOMAIN 3: FIELD OPERATIONS                          │     │
│  │  How effectively are field teams performing?          │     │
│  │  6 KPIs, Daily measurement                         │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐     │
│  │  DOMAIN 4: PLATFORM PERFORMANCE                      │     │
│  │  Is the technology infrastructure performing?        │     │
│  │  7 KPIs, Continuous/Daily measurement              │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐     │
│  │  DOMAIN 5: REGISTRY OUTCOMES                         │     │
│  │  Are we achieving the registry's policy objectives?  │     │
│  │  6 KPIs, Weekly/Gate measurement                   │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                               │
│  TOTAL: 34 KPIs across 5 domains                             │
└──────────────────────────────────────────────────────────────┘
```

---

## 18.3 Domain 1: Enumeration Progress KPIs

These indicators track the volume and geographic distribution of data collection.

| # | KPI | Definition | Target | Alert Threshold | Frequency | Data Source |
|---|-----|-----------|:------:|:---------------:|:---------:|-------------|
| EP-1 | **Daily submission rate (state)** | Total submissions received per day across all channels | ≥ 800/day | < 500/day | Daily | Platform analytics |
| EP-2 | **Daily submission rate (per enumerator)** | Average submissions per active enumerator per day | ≥ 8/day | < 5/day | Daily | Per-user analytics |
| EP-3 | **Cumulative registry count** | Running total of verified registry entries | 23,760 by Day 30 | < 70% of pro-rata target | Daily | Registry database |
| EP-4 | **LGA coverage (% of 33 LGAs active)** | Percentage of LGAs with ≥ 1 submission in current week | 100% | < 90% (3+ LGAs inactive) | Weekly | Platform analytics |
| EP-5 | **LGA equity ratio** | Ratio of highest to lowest LGA submission count | < 5:1 | > 8:1 | Weekly | Platform analytics |
| EP-6 | **Self-registration volume** | Public web self-registrations (non-enumerator) | Supplementary (no target) |, | Weekly | Channel analytics |
| EP-7 | **Offline sync backlog** | Number of submissions pending sync from offline devices | < 50 statewide | > 200 statewide | Daily | Sync queue |

---

## 18.4 Domain 2: Data Quality KPIs

These indicators assess the integrity and reliability of collected data.

| # | KPI | Definition | Target | Alert Threshold | Frequency | Data Source |
|---|-----|-----------|:------:|:---------------:|:---------:|-------------|
| DQ-1 | **Fraud flag rate** | Percentage of submissions flagged by automated fraud detection | < 10% | > 15% | Daily | Fraud detection engine |
| DQ-2 | **NIN duplication rate** | Percentage of submissions rejected for duplicate NIN | < 2% | > 5% | Daily | Database constraint |
| DQ-3 | **Field completeness rate** | Percentage of required fields populated across all submissions | > 98% | < 95% | Daily | Validation layer |
| DQ-4 | **Validation error rate** | Percentage of submission attempts failing validation (corrected and resubmitted) | < 5% | > 10% | Daily | Validation logs |
| DQ-5 | **Supervisory review completion** | Percentage of flagged submissions reviewed within 48 hours | > 90% | < 75% | Daily | Fraud review queue |
| DQ-6 | **Fraud flag resolution rate** | Percentage of reviewed flags resulting in approval (vs. rejection) | 70–90% approval | < 60% or > 95% | Weekly | Fraud review outcomes |
| DQ-7 | **Gender distribution** | Male/female ratio across all submissions | 45–55% male | Outside 40–60% range | Weekly | Demographic analytics |
| DQ-8 | **NBS benchmark alignment** | Key indicators (employment rate, self-employment rate, education distribution) compared to NBS NLFS baselines | Within ± 10% of NBS | Outside ± 15% of NBS | Weekly | Statistical analysis |

---

## 18.5 Domain 3: Field Operations KPIs

These indicators monitor the operational effectiveness of field teams.

| # | KPI | Definition | Target | Alert Threshold | Frequency | Data Source |
|---|-----|-----------|:------:|:---------------:|:---------:|-------------|
| FO-1 | **Enumerator activity rate** | Percentage of trained enumerators submitting ≥ 1 record per day | > 90% | < 80% | Daily | Per-user analytics |
| FO-2 | **Enumerator attrition rate** | Cumulative percentage of enumerators who have ceased activity | < 5% | > 10% | Weekly | HR records + activity |
| FO-3 | **Average completion time** | Mean survey completion time across all submissions | 7–12 min | < 4 min or > 20 min | Daily | Submission timestamps |
| FO-4 | **Supervisor review rate** | Number of flagged submissions reviewed per supervisor per day | ≥ 10/day | < 5/day | Daily | Fraud dashboard |
| FO-5 | **Device utilisation rate** | Percentage of deployed devices with active submissions | > 90% | < 80% | Weekly | Device analytics |
| FO-6 | **Team messaging engagement** | Percentage of supervisors using in-app messaging for team coordination | > 80% | < 60% | Weekly | Messaging analytics |

---

## 18.6 Domain 4: Platform Performance KPIs

These indicators ensure the technology infrastructure supports operational needs.

| # | KPI | Definition | Target | Alert Threshold | Frequency | Data Source |
|---|-----|-----------|:------:|:---------------:|:---------:|-------------|
| PP-1 | **Application uptime** | Percentage of time the platform is accessible and responsive | > 99.5% | < 99% | Continuous | Health monitoring |
| PP-2 | **API response time (p95)** | 95th percentile response time for API requests | < 500ms | > 1000ms | Continuous | prom-client metrics |
| PP-3 | **Database query latency (p95)** | 95th percentile database query execution time | < 100ms | > 250ms | Continuous | Database metrics |
| PP-4 | **Server CPU utilisation** | Average CPU usage on production server | < 60% | > 80% | Continuous | System monitoring |
| PP-5 | **Server memory utilisation** | Average RAM usage on production server | < 70% | > 85% | Continuous | System monitoring |
| PP-6 | **Backup success rate** | Percentage of daily automated backups completed successfully | 100% | Any failure | Daily | Backup job logs |
| PP-7 | **SSL certificate validity** | Days until SSL certificate expiry | > 30 days | < 14 days | Daily | Certificate monitor |

---

## 18.7 Domain 5: Registry Outcomes KPIs

These indicators assess whether the registry is achieving its policy objectives.

| # | KPI | Definition | Target | Alert Threshold | Frequency | Data Source |
|---|-----|-----------|:------:|:---------------:|:---------:|-------------|
| RO-1 | **Total verified registrants** | Number of records passing all 4 QA layers | Project-specific target (TBD by Ministry) | < 70% of target at Gate 2 | Weekly | Registry database |
| RO-2 | **Skills inventory breadth** | Number of distinct skills recorded across all registrants | ≥ 100 of 150 taxonomy skills represented | < 80 skills represented | Gate reviews | Skills analytics |
| RO-3 | **Marketplace opt-in rate** | Percentage of registrants opting into Skills Marketplace | > 40% | < 25% | Weekly | Consent analytics |
| RO-4 | **Sector representation** | Number of 20 economic sectors with ≥ 10 registrants | All 20 sectors | < 15 sectors | Gate reviews | Sector analytics |
| RO-5 | **Youth registration (15–35)** | Percentage of registrants aged 15–35 | 40–60% (aligned with Oyo demographics) | < 30% or > 70% | Weekly | Age analytics |
| RO-6 | **Business registration capture** | Percentage of employed registrants who report business ownership | > 30% | < 20% | Weekly | Section 5 analytics |

---

## 18.8 KPI Dashboard Integration

All 34 KPIs are designed to be measured using **data already captured by the OSLSR platform**, no additional data collection infrastructure is required. The platform's built-in analytics dashboard (Chapter 13) provides real-time or daily computation of these indicators.

```
┌──────────────────────────────────────────────────────────┐
│              KPI MEASUREMENT ARCHITECTURE                  │
│                                                            │
│  ┌──────────────────────┐                                 │
│  │  OSLSR Platform      │                                 │
│  │  ┌────────────────┐  │                                 │
│  │  │ Submission Data │──┼──▶ Domain 1: Enumeration      │
│  │  │ (PostgreSQL)   │  │     Progress KPIs              │
│  │  └────────────────┘  │                                 │
│  │  ┌────────────────┐  │                                 │
│  │  │ Fraud Detection│──┼──▶ Domain 2: Data Quality      │
│  │  │ Engine         │  │     KPIs                        │
│  │  └────────────────┘  │                                 │
│  │  ┌────────────────┐  │                                 │
│  │  │ User Activity  │──┼──▶ Domain 3: Field Operations  │
│  │  │ Logs           │  │     KPIs                        │
│  │  └────────────────┘  │                                 │
│  │  ┌────────────────┐  │                                 │
│  │  │ System Health  │──┼──▶ Domain 4: Platform          │
│  │  │ Monitor        │  │     Performance KPIs            │
│  │  └────────────────┘  │                                 │
│  │  ┌────────────────┐  │                                 │
│  │  │ Analytics      │──┼──▶ Domain 5: Registry          │
│  │  │ Dashboard      │  │     Outcomes KPIs               │
│  │  └────────────────┘  │                                 │
│  └──────────────────────┘                                 │
│                                                            │
│  No additional data collection infrastructure required.   │
│  All KPIs computed from existing platform data.           │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

---

## 18.9 Reporting Schedule

| Report | Content | Audience | Frequency | Format |
|--------|---------|----------|:---------:|--------|
| **Daily Operations Brief** | EP-1, EP-2, DQ-1, FO-1, FO-3, PP-1 | Consultant, Supervisors | Daily | Dashboard view |
| **Weekly Progress Report** | All Domain 1–3 KPIs, aggregated | Ministry, Consultant | Weekly | PDF export |
| **Gate Review Report** | All 34 KPIs with trend analysis | Ministry, Consultant | Per Gate | Formal report |
| **Alert Notification** | Any KPI breaching alert threshold | Designated recipients | Real-time | Email notification |

---

## 18.10 KPI-to-Gate Mapping

The following table maps which KPIs serve as **formal gate criteria** at each Stage Gate review:

| KPI | Gate 1 | Gate 2 | Gate 3 |
|-----|:------:|:------:|:------:|
| EP-1: Daily submission rate | | ✓ | |
| EP-3: Cumulative registry count | | ✓ | ✓ |
| EP-4: LGA coverage | | ✓ | ✓ |
| DQ-1: Fraud flag rate | | ✓ | ✓ |
| DQ-2: NIN duplication rate | | ✓ | |
| DQ-3: Field completeness | | ✓ | ✓ |
| DQ-8: NBS alignment | | | ✓ |
| FO-1: Enumerator activity | ✓* | ✓ | |
| FO-2: Enumerator attrition | | ✓ | |
| PP-1: Application uptime | ✓ | ✓ | ✓ |
| PP-6: Backup success | | | ✓ |
| RO-1: Total verified registrants | | | ✓ |
| RO-2: Skills breadth | | | ✓ |
| RO-4: Sector representation | | | ✓ |

*\* FO-1 at Gate 1 refers to pilot activity rate (3 pilot LGAs)*

---

## 18.11 Assumption Classification of KPI Targets

Following the Assumption Classification Framework (Chapter 9), the KPI targets carry the following classifications:

| Classification | KPIs | Rationale |
|:-------------:|-------|-----------|
| **[VF] Verified Fact** | PP-1, PP-6, PP-7, DQ-3 | Based on observed platform performance during validation exercise |
| **[FD] Field-Dependent** | EP-1, EP-2, EP-3, FO-1, FO-2, FO-3, RO-1, RO-3 | Targets based on calculations from planned field operations; actual performance will be confirmed during Gate 1 pilot |
| **[WA] Working Assumption** | DQ-1, DQ-7, DQ-8, RO-2, RO-4, RO-5, RO-6 | Based on NBS benchmarks and comparable project data; subject to revision upon field data accumulation |

The **[FD] Field-Dependent** KPIs will be recalibrated based on actual performance data from the 3-LGA pilot exercise (Gate 1), ensuring that Gate 2 and Gate 3 targets are grounded in observed rather than projected performance.

---

## 18.12 Continuous Improvement Cycle

The M&E framework supports a continuous improvement cycle aligned with the Stage Gate methodology:

```
         ┌──────────┐
         │  MEASURE  │ ◀── Automated KPI computation
         │  (Daily)  │     from platform data
         └────┬─────┘
              │
              ▼
         ┌──────────┐
         │  ANALYSE  │ ◀── Weekly trend analysis;
         │ (Weekly)  │     benchmark comparison
         └────┬─────┘
              │
              ▼
         ┌──────────┐
         │  DECIDE   │ ◀── Gate review; proceed/
         │  (Gate)   │     hold/stop decision
         └────┬─────┘
              │
              ▼
         ┌──────────┐
         │  ADJUST   │ ◀── Threshold recalibration;
         │ (As needed│     process correction;
         │          │     resource reallocation
         └────┬─────┘
              │
              └──────▶ Return to MEASURE
```

---

*Document Reference: CHM/OSLR/2026/002 | Chapter 21 | Chemiroy Nigeria Limited*
