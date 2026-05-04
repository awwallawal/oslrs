# 15. Capacity Building Programme Design

---

## 15.1 Introduction

Deliverable 3 of the engagement Terms of Reference requires the **Training of Ministry/Government Officials** in the operation, management, and utilisation of the Oyo State Skilled Labour Register. This chapter documents the design of the comprehensive capacity building programme, a structured, role-specific training curriculum that ensures each category of platform user possesses the knowledge and skills necessary to perform their designated functions effectively.

The capacity building programme was designed during the baseline study phase, informed by:
1. The 8-role user architecture documented in Chapter 13
2. The data quality assurance requirements documented in Chapter 17
3. The operational workflows validated during the validation exercise (Chapter 15)
4. Best practice in government ICT capacity building from comparable state-level initiatives (Chapter 8)

**Deliverable Status: DESIGN COMPLETE**, Training delivery is scheduled for Gate 3 (Chapter 19), contingent upon mobilisation of field personnel.

---

## 15.2 Programme Structure

The capacity building programme comprises **four modules**, each targeting a specific tier of the platform user hierarchy:

```
┌──────────────────────────────────────────────────────────────┐
│           CAPACITY BUILDING PROGRAMME STRUCTURE                │
│           4 Modules × 8 Roles                                  │
│                                                                │
│  MODULE A: PLATFORM OPERATIONS, ENUMERATOR                   │
│  ┌──────────────────────────────────────────────────────┐     │
│  │ Target: Field Enumerators (99 persons)               │     │
│  │ Duration: 2 days (classroom + hands-on)              │     │
│  │ Delivery: 3 batches of 33 (central venue)            │     │
│  │ Assessment: Practical test + written quiz             │     │
│  │ Pass threshold: 85%                                  │     │
│  └──────────────────────────────────────────────────────┘     │
│                                                                │
│  MODULE B: FIELD SUPERVISION & QUALITY ASSURANCE              │
│  ┌──────────────────────────────────────────────────────┐     │
│  │ Target: Field Supervisors (33 persons)               │     │
│  │ Duration: 2 days (classroom + dashboard practicals)  │     │
│  │ Delivery: Single cohort                              │     │
│  │ Assessment: Scenario-based evaluation                │     │
│  │ Pass threshold: 85%                                  │     │
│  └──────────────────────────────────────────────────────┘     │
│                                                                │
│  MODULE C: SYSTEM ADMINISTRATION & REPORTING                  │
│  ┌──────────────────────────────────────────────────────┐     │
│  │ Target: Ministry Admin staff (3–5 persons)           │     │
│  │ Duration: 2 days (intensive hands-on)                │     │
│  │ Delivery: Small group at Data Centre                 │     │
│  │ Assessment: Live system administration tasks         │     │
│  │ Pass threshold: 85%                                  │     │
│  └──────────────────────────────────────────────────────┘     │
│                                                                │
│  MODULE D: DATA ANALYSIS & DASHBOARD UTILISATION              │
│  ┌──────────────────────────────────────────────────────┐     │
│  │ Target: Government Officials, Policy Users (5–10)    │     │
│  │ Duration: 1 day (demonstration + guided practice)    │     │
│  │ Delivery: Briefing format at Ministry premises       │     │
│  │ Assessment: Dashboard navigation competency check    │     │
│  │ Pass threshold: 80%                                  │     │
│  └──────────────────────────────────────────────────────┘     │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

---

## 15.3 Module A: Platform Operations, Enumerator

### 15.3.1 Training Overview

| Parameter | Detail |
|-----------|--------|
| **Target audience** | Field Enumerators (99 persons) |
| **Prerequisite** | Literate (minimum SSS/WAEC); proficient with smartphone operation |
| **Duration** | 2 days (Day 1: Classroom; Day 2: Hands-on practice) |
| **Delivery format** | 3 batches of 33 trainees each; instructor-led with guided practice |
| **Equipment required** | Configured Android smartphone per trainee; projector; internet connectivity |
| **Assessment** | Practical test (complete a full survey submission) + written quiz (20 questions) |
| **Pass threshold** | 85% (17/20 on quiz; successful submission with zero validation errors) |

### 15.3.2 Curriculum

**Day 1: Classroom, Understanding the Registry and Survey**

| Session | Duration | Content |
|---------|----------|---------|
| 1.1 | 45 min | **Project Context**: What is the OSLSR? Why is it needed? Role of enumerators in national labour statistics. Ministry mandate and government authority for enumeration |
| 1.2 | 60 min | **Survey Instrument Walkthrough**: Section-by-section review of all 36 questions; explanation of skip logic; ILO classification cascade (Q3.1–Q3.4); skills taxonomy overview |
| 1.3 | 45 min | **Ethical Obligations**: Informed consent procedure; NDPA 2023 data protection requirements; respondent confidentiality; handling refusals; identifying vulnerable respondents |
| 1.4 | 30 min | **Field Protocol**: Identification materials usage; community engagement etiquette; approaching respondents; safety procedures; reporting incidents |
| 1.5 | 60 min | **NIN and Data Quality**: Importance of accurate NIN recording; Modulus 11 validation explanation; common NIN entry errors; phone number format; GPS auto-capture explanation |

**Day 2: Hands-On Practice**

| Session | Duration | Content |
|---------|----------|---------|
| 2.1 | 45 min | **Device Setup**: PWA installation; Service Worker caching; verifying offline capability; understanding the auto-save indicator; battery management |
| 2.2 | 90 min | **Guided Survey Practice**: Instructor-led completion of 3 full surveys (employed business owner, unemployed job-seeker, outside labour force), covering all conditional paths |
| 2.3 | 60 min | **Offline Operations**: Airplane mode practice; completing survey offline; reconnecting and verifying synchronisation; understanding the offline queue indicator |
| 2.4 | 45 min | **Troubleshooting Common Issues**: No GPS signal; slow network; app crash recovery; battery depletion mid-survey; respondent changes answer mid-survey |
| 2.5 | 60 min | **Assessment**: Complete one full survey independently (practical); 20-question written quiz covering instrument, ethics, and procedures |

### 15.3.3 Assessment Rubric

| Component | Weight | Pass Criteria |
|-----------|:------:|-------------|
| Written quiz (20 MCQs) | 40% | ≥ 17/20 correct (85%) |
| Practical test, survey completion | 40% | Zero validation errors; all required fields completed; correct skip logic path |
| Field protocol knowledge | 20% | Demonstrates consent procedure; handles hypothetical refusal correctly |
| **Overall pass threshold** |, | **85% weighted aggregate** |

---

## 15.4 Module B: Field Supervision & Quality Assurance

### 15.4.1 Training Overview

| Parameter | Detail |
|-----------|--------|
| **Target audience** | Field Supervisors (33 persons) |
| **Prerequisite** | Management experience; familiarity with government field programmes; minimum OND/NCE |
| **Duration** | 2 days (Day 1: Supervisory functions; Day 2: Fraud detection and team management) |
| **Delivery format** | Single cohort; instructor-led with dashboard demonstrations |
| **Assessment** | Scenario-based evaluation, respond to 5 simulated field situations |
| **Pass threshold** | 85% (correct handling of ≥ 4/5 scenarios) |

### 15.4.2 Curriculum

**Day 1: Supervisory Platform Functions**

| Session | Duration | Content |
|---------|----------|---------|
| 1.1 | 45 min | **Supervisor Role Overview**: LGA-scoped access; team of 3 enumerators; daily review responsibilities; escalation procedures |
| 1.2 | 60 min | **Team Dashboard**: Viewing enumerator submissions; monitoring daily progress; identifying underperforming enumerators; using the in-app messaging system |
| 1.3 | 60 min | **Data Quality Indicators**: Understanding submission counts, completion rates, average completion times; interpreting per-enumerator metrics |
| 1.4 | 45 min | **LGA Coverage Management**: Monitoring geographic distribution of submissions; ensuring ward-level coverage; coordinating enumerator deployment |
| 1.5 | 30 min | **Reporting Upward**: Daily status reporting to Admin; weekly summary preparation; communicating field challenges |

**Day 2: Fraud Detection & Team Management**

| Session | Duration | Content |
|---------|----------|---------|
| 2.1 | 60 min | **Fraud Detection Dashboard**: Understanding flag types (GPS clustering, speed-run, straight-lining); reviewing flagged submissions; approve/reject/re-interview workflow |
| 2.2 | 60 min | **Interpreting Fraud Indicators**: GPS clustering in market areas (legitimate) vs. fabrication (illegitimate); fast completions by experienced enumerators vs. speed-running; contextual judgement |
| 2.3 | 45 min | **Enumerator Performance Management**: Coaching underperformers; addressing quality issues constructively; identifying training needs; documenting performance concerns |
| 2.4 | 45 min | **Field Incident Management**: Respondent complaints; community access issues; device failures; connectivity problems; security concerns |
| 2.5 | 90 min | **Scenario Assessment**: 5 simulated field situations requiring supervisory judgement (GPS cluster in market area, enumerator with 40% flag rate, evening submission pattern, device failure during active survey, community leader refusing access) |

---

## 15.5 Module C: System Administration & Reporting

### 15.5.1 Training Overview

| Parameter | Detail |
|-----------|--------|
| **Target audience** | Ministry-designated Admin and Super Admin staff (3–5 persons) |
| **Prerequisite** | Computer literacy; basic understanding of database concepts; Ministry staff designation |
| **Duration** | 2 days (intensive hands-on at Data Centre) |
| **Delivery format** | Small group instruction at on-premises Data Centre workstations |
| **Assessment** | Live system administration tasks on training environment |
| **Pass threshold** | 85% (successful completion of all core tasks) |

### 15.5.2 Curriculum

**Day 1: System Administration**

| Session | Duration | Content |
|---------|----------|---------|
| 1.1 | 45 min | **Platform Architecture Overview**: How the system works (simplified); Data Centre → Cloud → Database; what happens when a survey is submitted |
| 1.2 | 60 min | **Staff Management**: Creating user accounts; assigning roles; activating/deactivating staff; resetting credentials; LGA assignment |
| 1.3 | 60 min | **Form & Configuration Management**: Viewing active survey version; understanding platform settings; configuring fraud detection thresholds |
| 1.4 | 60 min | **ID Card Generation**: Generating staff ID cards; understanding QR verification; batch printing procedures |
| 1.5 | 45 min | **Payment Management**: Recording staff payments; uploading bank references; handling payment disputes; generating payment reports |

**Day 2: Reporting & Monitoring**

| Session | Duration | Content |
|---------|----------|---------|
| 2.1 | 60 min | **Dashboard Analytics**: Navigating the admin dashboard; understanding real-time submission counts; interpreting LGA distribution charts; time-series analysis |
| 2.2 | 60 min | **Data Export**: Generating CSV and PDF exports; applying filters (LGA, date, status, occupation); understanding export audit trail; data handling responsibilities |
| 2.3 | 45 min | **System Health Monitoring**: Understanding CPU, RAM, and disk metrics; database performance indicators; interpreting alert notifications; when to escalate technical issues |
| 2.4 | 45 min | **Audit Trail Review**: Navigating audit logs; understanding logged actions; using audit data for accountability reviews |
| 2.5 | 60 min | **Practical Assessment**: Perform all core administrative tasks on training environment (create user, generate ID card, export data, review audit log, interpret dashboard) |

---

## 15.6 Module D: Data Analysis & Dashboard Utilisation

### 15.6.1 Training Overview

| Parameter | Detail |
|-----------|--------|
| **Target audience** | Government Officials, Policy Users, Senior Ministry staff (5–10 persons) |
| **Prerequisite** | Basic computer literacy |
| **Duration** | 1 day (half-day briefing + half-day guided practice) |
| **Delivery format** | Briefing/demonstration format at Ministry premises |
| **Assessment** | Navigate dashboard and generate one report independently |
| **Pass threshold** | 80% |

### 15.6.2 Curriculum

| Session | Duration | Content |
|---------|----------|---------|
| 1.1 | 60 min | **Registry Overview**: What the register contains; how data was collected; data quality assurance measures; what the numbers mean |
| 1.2 | 60 min | **Dashboard Navigation**: Statewide statistics; LGA drill-down; employment distribution charts; skills inventory; demographic breakdowns |
| 1.3 | 45 min | **Skills Marketplace**: How the marketplace works; employer perspective; searching for workers by trade, LGA, and experience; contact reveal mechanism |
| 1.4 | 45 min | **Report Generation**: Generating standard reports; applying filters; exporting data for policy analysis; interpreting exported datasets |
| 1.5 | 30 min | **Guided Practice**: Each participant navigates the dashboard, generates a filtered export, and interprets one LGA summary independently |

---

## 15.7 Training Materials

The following training materials will be developed and provided:

| # | Material | Format | Audience |
|---|----------|--------|----------|
| 1 | **Enumerator Field Guide** | Printed booklet (A5) + digital PDF | Enumerators |
| 2 | **Survey Instrument Quick Reference** | Laminated card (front: question flow; back: skip logic) | Enumerators |
| 3 | **Supervisor Operations Manual** | Digital PDF | Supervisors |
| 4 | **System Administrator Guide** | Digital PDF + printed manual | Admin staff |
| 5 | **Dashboard User Guide** | Digital PDF | Government Officials |
| 6 | **Training Slide Decks** | PowerPoint/PDF per module | Trainers |
| 7 | **Assessment Question Bank** | Internal document | Trainers |
| 8 | **Video Walkthroughs** | Screen recordings of key platform workflows | All roles |

---

## 15.8 Training Schedule

The training delivery schedule is designed to minimise disruption while ensuring all personnel are trained before field deployment:

```
┌──────────────────────────────────────────────────────────┐
│              TRAINING DELIVERY SCHEDULE                     │
│              (Gate 1, Pre-Deployment)                      │
│                                                            │
│  WEEK 1                                                    │
│  ─────                                                     │
│  Mon-Tue:  Module B, Supervisors (33 persons)            │
│            [2 days, single cohort]                         │
│                                                            │
│  Wed-Thu:  Module A, Enumerators Batch 1 (33 persons)    │
│            [2 days]                                        │
│                                                            │
│  WEEK 2                                                    │
│  ─────                                                     │
│  Mon-Tue:  Module A, Enumerators Batch 2 (33 persons)    │
│            [2 days]                                        │
│                                                            │
│  Wed-Thu:  Module A, Enumerators Batch 3 (33 persons)    │
│            [2 days]                                        │
│                                                            │
│  Fri:      Field Pilot Launch (3 selected LGAs)           │
│                                                            │
│  WEEK 3 (during/after enumeration)                        │
│  ─────                                                     │
│  Mon-Tue:  Module C, System Administration (3–5 persons) │
│            [2 days at Data Centre]                         │
│                                                            │
│  Wed:      Module D, Government Officials (5–10 persons) │
│            [1 day at Ministry premises]                    │
│                                                            │
│  TOTAL: 9 training days across 3 weeks                    │
│  TOTAL TRAINED: ~145 personnel across 4 modules           │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

**Scheduling rationale**: Supervisors are trained first (Week 1, Mon-Tue) so they can assist with enumerator training as teaching assistants. Modules C and D are delivered during or after enumeration commencement, when real production data is available for training exercises, providing a more meaningful learning experience than synthetic training data.

---

## 15.9 Assessment and Certification

### 15.9.1 Assessment Framework

| Module | Assessment Type | Pass Threshold | Remediation |
|--------|----------------|:--------------:|-------------|
| A: Enumerator | Written quiz + practical test | 85% | Re-test after additional coaching; max 2 attempts |
| B: Supervisor | Scenario-based evaluation | 85% (4/5 scenarios) | Additional 1-day coaching session |
| C: Admin | Live system tasks | 85% | Paired mentoring with consultant |
| D: Officials | Dashboard navigation | 80% | Follow-up 1-on-1 demonstration |

### 15.9.2 Records

All training attendance, assessment results, and certification records will be maintained as part of the engagement documentation and included in the Completion Report (Gate 3, Chapter 19).

---

## 15.10 Post-Training Support

The capacity building programme includes a **30-day post-training support period** following field deployment:

| Support Channel | Availability | Target |
|----------------|-------------|--------|
| In-app messaging | 24/7 (asynchronous) | Enumerators ↔ Supervisors |
| WhatsApp support group | During operational hours | Supervisors ↔ Consultant |
| Phone support | During operational hours | Admin ↔ Consultant |
| On-site visit | As required | Critical issues requiring in-person resolution |

---

## 15.11 Knowledge Transfer Strategy

The capacity building programme is designed for **full knowledge transfer**, ensuring that the Ministry can independently operate, maintain, and utilise the OSLSR platform after the engagement concludes:

| Knowledge Area | Transfer Mechanism | Recipient |
|---------------|-------------------|-----------|
| Day-to-day operations | Module C + documented procedures | Ministry Admin |
| Data interpretation | Module D + dashboard user guide | Government Officials |
| Field operations | Module A + B + field guide | Reusable for future enumerator cohorts |
| Technical maintenance | System documentation + admin guide | Ministry IT / designated Admin |
| Troubleshooting | FAQ document + support escalation procedures | All trained personnel |

The goal is **zero dependency** on the Consultant for routine platform operations after the 30-day post-training support period concludes.

---

*Document Reference: CHM/OSLR/2026/002 | Chapter 18 | Chemiroy Nigeria Limited*
