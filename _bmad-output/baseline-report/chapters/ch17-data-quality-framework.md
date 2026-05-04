# 14. Data Quality Assurance Framework

---

## 14.1 Introduction

Data quality is the cornerstone of a credible labour register. A registry populated with inaccurate, duplicated, or fraudulent records would undermine the policy objectives of the Oyo State Skilled Labour Register and erode stakeholder confidence in the data. This chapter documents the **four-layer data quality assurance (QA) protocol** designed to ensure that every record in the registry meets minimum quality standards before being accepted as a verified entry.

The QA framework operates on the principle of **progressive filtration**, each layer captures a distinct category of data quality issue, and records must pass through all four layers before being accepted into the verified registry.

---

## 14.2 Four-Layer Quality Assurance Protocol

```
┌──────────────────────────────────────────────────────────────────┐
│              DATA QUALITY ASSURANCE PROTOCOL                      │
│              4-Layer Progressive Filtration                        │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  LAYER 1: POINT-OF-ENTRY VALIDATION                        │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │ • Zod schema validation (shared frontend/backend)    │  │  │
│  │  │ • NIN Modulus 11 checksum                            │  │  │
│  │  │ • Phone number format verification                   │  │  │
│  │  │ • Cross-field consistency (dependents ≤ household)   │  │  │
│  │  │ • Age threshold enforcement (≥ 15 years)             │  │  │
│  │  │ • Skip logic integrity verification                  │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  │  ❌ Invalid submissions rejected with specific error       │  │
│  │     messages, respondent/enumerator can correct and retry │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                    │
│                              ▼                                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  LAYER 2: AUTOMATED FRAUD DETECTION                        │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │ • GPS clustering analysis                            │  │  │
│  │  │ • Speed-run detection (implausibly fast completions) │  │  │
│  │  │ • Straight-lining detection (response patterns)      │  │  │
│  │  │ • NIN global uniqueness enforcement                  │  │  │
│  │  │ • Temporal anomaly detection (submission patterns)   │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  │  ⚠️ Flagged submissions queued for human review            │  │
│  │     (not auto-rejected, minimises false positive impact)  │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                    │
│                              ▼                                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  LAYER 3: SUPERVISORY REVIEW                               │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │ • Fraud-flagged submission review (approve/reject)   │  │  │
│  │  │ • Enumerator productivity monitoring                 │  │  │
│  │  │ • LGA-level submission pattern analysis              │  │  │
│  │  │ • Field team coordination and feedback               │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  │  ✅ Human judgement applied to ambiguous cases              │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                    │
│                              ▼                                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  LAYER 4: VERIFICATION AUDIT                               │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │ • Random sampling of approved submissions            │  │  │
│  │  │ • Cross-reference verification                       │  │  │
│  │  │ • Aggregate statistical consistency checks           │  │  │
│  │  │ • NBS benchmark alignment monitoring                 │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  │  📊 Statistical quality gates applied at aggregate level   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  OUTCOME: Verified Registry Record                               │
└──────────────────────────────────────────────────────────────────┘
```

---

## 14.3 Layer 1: Point-of-Entry Validation

Point-of-entry validation prevents structurally invalid data from entering the system. These checks are **deterministic**, a submission either passes or fails, with no ambiguity.

### 14.3.1 Validation Rules

| # | Rule | Implementation | Error Handling |
|---|------|---------------|----------------|
| 1 | **NIN format & checksum** | 11-digit numeric string; Modulus 11 checksum algorithm | Real-time error: "NIN must be exactly 11 digits" |
| 2 | **NIN uniqueness** | Database-level UNIQUE constraint across all submissions | Rejection: "This NIN has already been registered" |
| 3 | **Phone format** | Regex: 0[7-9][0-1]\d{8} (Nigerian mobile) | Real-time error with format guidance |
| 4 | **Age threshold** | Auto-calculated from DOB; must be ≥ 15 | Auto-computed; below-threshold respondents screened out |
| 5 | **Date validity** | DOB cannot be future date | Calendar picker constraint |
| 6 | **Hours worked** | Integer, 0–168 range | Range error with corrective guidance |
| 7 | **Dependents ≤ household** | Cross-field validation: Q4.3 ≤ Q4.2 | "Dependents cannot exceed household size" |
| 8 | **Required field completeness** | All 28 required fields must be populated | Field-level "Required" indicators |
| 9 | **Skip logic integrity** | Conditional fields only accepted when show-condition is met | Server-side enforcement regardless of client |
| 10 | **Character limits** | Bio ≤ 150 chars; Other skills ≤ 200 chars | Character counter with enforcement |

### 14.3.2 Dual-Layer Enforcement

A critical design decision is the enforcement of **all validation rules on both frontend and backend** using shared Zod validation schemas:

```
┌──────────────────────────────────────────────────────┐
│             SHARED VALIDATION ARCHITECTURE              │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │        packages/types/src/schemas/              │   │
│  │                                                  │   │
│  │  surveySchema = z.object({                      │   │
│  │    nin: z.string().length(11).regex(/^\d+$/),   │   │
│  │    phone: z.string().regex(/^0[7-9][01]\d{8}$/),│   │
│  │    ...                                           │   │
│  │  })                                              │   │
│  └──────────────────┬──────────────────────────────┘   │
│                      │                                   │
│        ┌─────────────┴──────────────┐                   │
│        │                            │                    │
│        ▼                            ▼                    │
│  ┌──────────┐               ┌──────────────┐           │
│  │ FRONTEND │               │   BACKEND    │           │
│  │ (React   │               │  (Express    │           │
│  │  Hook    │               │   middleware) │           │
│  │  Form)   │               │              │           │
│  │          │               │  Validates   │           │
│  │ Instant  │               │  ALL requests│           │
│  │ feedback │               │  regardless  │           │
│  │ to user  │               │  of client   │           │
│  └──────────┘               └──────────────┘           │
│                                                         │
│  Same schema ──▶ Same rules ──▶ No bypass possible     │
└──────────────────────────────────────────────────────┘
```

This architecture ensures that **validation cannot be bypassed** by submitting data directly to the API (bypassing the frontend), because the backend independently enforces the identical rules.

---

## 14.4 Layer 2: Automated Fraud Detection

The fraud detection engine identifies **structurally valid but potentially fraudulent** submissions, data that passes all validation rules but exhibits patterns inconsistent with genuine field enumeration.

### 14.4.1 Detection Algorithms

| # | Algorithm | Detection Target | Method | Threshold |
|---|-----------|-----------------|--------|-----------|
| 1 | **GPS Clustering** | Multiple submissions from the same location (enumerator fabrication) | Haversine distance calculation between consecutive submissions by the same enumerator | Configurable radius (default: 50m) |
| 2 | **Speed-Run Detection** | Implausibly fast survey completions (form-filling without genuine interviews) | Elapsed time between survey start and submission | Configurable minimum (default: 3 minutes) |
| 3 | **Straight-Lining** | Repetitive identical responses across consecutive submissions (pattern filling) | Shannon entropy analysis of response distributions per enumerator batch | Low-entropy threshold below expected variation |
| 4 | **NIN Duplication** | Same individual registered multiple times across channels | Global NIN uniqueness constraint + cross-channel deduplication query | Exact match = auto-reject |
| 5 | **Temporal Anomaly** | Submissions outside operational hours or in impossible sequences | Timestamp analysis against expected field operation schedules | Outside 06:00–20:00 WAT flagged for review |

### 14.4.2 Fraud Detection Decision Matrix

```
┌──────────────────────────────────────────────────────────────┐
│              FRAUD DETECTION DECISION MATRIX                   │
│                                                                │
│  FLAG SEVERITY     ACTION                                      │
│  ─────────────     ──────                                      │
│                                                                │
│  🟢 No flags       → AUTO-APPROVE (proceed to Layer 3         │
│                       sampling only)                           │
│                                                                │
│  🟡 Single flag    → QUEUE for Supervisor review               │
│     (GPS OR speed     Submission held pending human            │
│      OR pattern)      judgement; enumerator not notified       │
│                                                                │
│  🔴 Multiple flags → PRIORITY QUEUE for Supervisor review     │
│     (2+ concurrent    Elevated visibility in fraud dashboard; │
│      flags)           enumerator performance flagged           │
│                                                                │
│  ⛔ NIN duplicate  → AUTO-REJECT with system message          │
│                       "This respondent has already been        │
│                        registered"                             │
│                                                                │
│  IMPORTANT: Single-flag submissions are NEVER auto-rejected.  │
│  Human review prevents false positive harm to legitimate      │
│  enumerators working in challenging field conditions.          │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

### 14.4.3 Threshold Configuration

All fraud detection thresholds are **configurable by Super Administrators** through the platform interface, enabling calibration based on field conditions:

| Parameter | Default Value | Adjustable Range | Rationale |
|-----------|:------------:|:----------------:|-----------|
| GPS clustering radius | 50 metres | 10–500 m | Tighter in urban areas; wider in rural areas where respondents may gather at a central location |
| Minimum completion time | 3 minutes | 1–10 min | Adjusted based on observed legitimate minimum times during pilot |
| Straight-line entropy threshold | Platform-calibrated | Adjustable | Tuned during validation exercise (Chapter 15) |
| Operational hours | 06:00–20:00 WAT | Configurable | May be extended for evening enumeration in urban markets |

**Calibration approach**: Thresholds were initially set based on methodological assumptions, then refined using data from the validation exercise (n=330). The validation exercise specifically tested edge cases, rapid completions by experienced enumerators, clustered submissions in market areas, and evening submissions, to establish empirically grounded baselines.

---

## 14.5 Layer 3: Supervisory Review

Supervisory review applies **human judgement** to ambiguous cases that automated systems cannot reliably resolve.

### 14.5.1 Supervisor Responsibilities

| Responsibility | Method | Frequency |
|---------------|--------|-----------|
| **Fraud flag review** | Review flagged submissions in fraud dashboard; approve, reject, or request re-interview | Daily (or as flagged) |
| **Enumerator monitoring** | Review per-enumerator productivity metrics (submissions/day, flag rate, completion time distribution) | Daily |
| **LGA coverage tracking** | Monitor geographic distribution of submissions against LGA population targets | Weekly |
| **Team communication** | In-app messaging to enumerators for feedback, correction, and coordination | As needed |
| **Escalation** | Escalate systemic quality issues to Admin/Super Admin for threshold recalibration | As identified |

### 14.5.2 Fraud Review Workflow

```
┌──────────────────────────────────────────────────────────┐
│                 FRAUD REVIEW WORKFLOW                       │
│                                                            │
│  Automated Detection                                       │
│  flags submission ──▶ Fraud Dashboard Queue                │
│                       │                                    │
│                       ▼                                    │
│               Supervisor Reviews                           │
│               ┌─────────────────────┐                     │
│               │ Views:              │                     │
│               │ • Flag reason       │                     │
│               │ • Submission data   │                     │
│               │ • GPS map location  │                     │
│               │ • Enumerator history│                     │
│               │ • Completion time   │                     │
│               └─────────┬───────────┘                     │
│                         │                                  │
│              ┌──────────┼──────────┐                      │
│              │          │          │                       │
│              ▼          ▼          ▼                       │
│         ┌────────┐ ┌────────┐ ┌───────────┐             │
│         │APPROVE │ │ REJECT │ │ RE-INTER- │             │
│         │        │ │        │ │ VIEW      │             │
│         │Record  │ │Record  │ │           │             │
│         │accepted│ │excluded│ │Enumerator │             │
│         │into    │ │from    │ │instructed │             │
│         │registry│ │registry│ │to revisit │             │
│         └────────┘ └────────┘ └───────────┘             │
│                                                            │
│         All decisions logged in immutable audit trail      │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

### 14.5.3 Performance Metrics

Supervisors have access to the following per-enumerator performance indicators:

| Metric | Purpose | Alert Threshold |
|--------|---------|:---------------:|
| Submissions per day | Productivity monitoring | < 4 (below 50% target) |
| Fraud flag rate | Quality indicator | > 20% of submissions flagged |
| Average completion time | Speed-run indicator | < 4 minutes average |
| GPS location spread | Geographic coverage | All submissions within 100m radius |
| Submission time distribution | Work pattern analysis | > 30% outside operational hours |

---

## 14.6 Layer 4: Verification Audit

The verification audit layer provides **statistical quality assurance** at the aggregate level, ensuring that the registry dataset as a whole is consistent and credible.

### 14.6.1 Audit Activities

| Activity | Method | Frequency | Responsibility |
|----------|--------|-----------|---------------|
| **Random sampling** | Stratified random sample of approved submissions reviewed by Verification Assessor | Weekly (during enumeration) | Verification Assessor |
| **Cross-reference checks** | Phone number verification call to randomly sampled respondents | As capacity allows | Verification Assessor / Supervisor |
| **Statistical consistency** | Compare aggregate distributions (age, gender, employment type, education) against NBS NLFS benchmarks | Weekly | Admin / Super Admin |
| **NBS benchmark alignment** | Flag LGA-level distributions that deviate significantly from national survey baselines | Monthly | Admin / Government Official |
| **Duplication audit** | Post-hoc analysis for near-duplicate records (similar names + same LGA + similar demographics) | Monthly | Automated + manual review |

### 14.6.2 Statistical Quality Gates

At the aggregate level, the following quality gates are monitored:

| # | Gate | Expected Range | Action if Breached |
|---|------|:-------------:|-------------------|
| 1 | **Gender ratio** | 45–55% male (NBS baseline: 51% male) | Investigate LGA-level gender bias in enumeration |
| 2 | **Employment rate** | 85–95% employed (NBS baseline: ~93%) | Verify ILO cascade implementation; check skip logic |
| 3 | **Self-employment rate** | 65–80% (NBS baseline: ~75%) | Cross-reference with education levels and LGA profile |
| 4 | **Education distribution** | No single category > 40% | Investigate if enumerators defaulting to one option |
| 5 | **Age distribution** | Median 30–40 years (NBS working-age baseline) | Check DOB entry accuracy |
| 6 | **Fraud flag rate** | < 10% of total submissions | If > 10%, recalibrate thresholds or investigate systemic issue |
| 7 | **NIN duplication rate** | < 2% | If > 2%, investigate enumeration area overlaps |
| 8 | **Completion rate** | > 90% of required fields populated | If < 90%, investigate instrument or training issue |

---

## 14.7 Data Quality Classification

Every record in the registry carries an internal quality classification:

| Classification | Criteria | Visibility |
|---------------|---------|-----------|
| **Verified** | Passed all 4 layers; no unresolved flags | Full registry inclusion; eligible for marketplace |
| **Pending Review** | Fraud flag awaiting supervisory review | Held; not included in registry counts until resolved |
| **Rejected** | Failed supervisory review or NIN duplicate | Excluded from registry; retained for audit trail |
| **Under Investigation** | Escalated for further verification | Held; subject to additional verification activity |

---

## 14.8 Quality Assurance During Validation Exercise

The QA framework was operationally tested during the validation exercise (n=330, Chapter 15). The following calibration outcomes were achieved:

| QA Component | Calibration Result |
|-------------|-------------------|
| NIN validation | Modulus 11 checksum correctly identified 100% of intentionally malformed NINs |
| GPS clustering | 50m default threshold validated as appropriate for both urban market areas and rural settlement patterns |
| Speed-run detection | 3-minute minimum confirmed as appropriate; no legitimate submissions completed in under 3 minutes during validation |
| Straight-lining | Entropy threshold calibrated against intentional pattern-fill test submissions; zero false positives on legitimate data |
| Supervisor review | Fraud dashboard interface validated; average review time per flagged submission: 45 seconds |
| NIN deduplication | Successfully detected and rejected all duplicate NIN submissions across channels |

---

## 14.9 Continuous Improvement

The QA framework is designed for **continuous improvement** through feedback loops:

1. **Threshold recalibration**: Fraud detection thresholds are adjustable based on accumulated field data. As more data flows through the system, thresholds can be tightened or loosened based on observed false positive and false negative rates.

2. **Enumerator feedback**: Patterns of fraud flags per enumerator inform targeted retraining, an enumerator with consistently high flag rates may need additional training on interview technique rather than disciplinary action.

3. **Aggregate monitoring**: Weekly statistical quality gate reviews identify emerging quality issues before they become systemic, enabling mid-course correction during the enumeration period (Gate 2, Chapter 19).

---

*Document Reference: CHM/OSLR/2026/002 | Chapter 17 | Chemiroy Nigeria Limited*
