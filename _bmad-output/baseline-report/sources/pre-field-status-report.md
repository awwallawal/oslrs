---
docRef: CHM/OSLR/2026/001
classification: Confidential, for official use only
title: Pre-Field Survey Status Report
subtitle: Skilled Labour Registry deployment readiness for the Ministry of Trade, Industry and Cooperatives
superhead: Oyo State Labour & Skills Registry
authors: Mrs Fateemah Roy-Lagbaja
firm: Chemiroy Nigeria Limited
date: May 2026
version: 1.0
coverCredit: 'Cover image: "A Tailor Sewing Clothes in Her Shop", Meritkosy / Wikimedia Commons (CC BY-SA 4.0)'
---

# Document Control

| Field | Value |
|---|---|
| Document reference | CHM/OSLR/2026/001 |
| Title | Pre-Field Survey Status Report, Oyo State Labour & Skills Registry |
| Version | 1.0 |
| Issue date | May 2026 |
| Valid as of | The submission date stated above. Every factual claim in this Report is true as of that date. |
| Classification | Confidential, for official use only |
| Subject programme | Oyo State Labour & Skills Registry. Establishment of the State Electronic Labour Register. |
| Authority | Ministry of Trade, Industry and Cooperatives, Oyo State Government |
| Consultant | Chemiroy Nigeria Limited |
| Engagement period | November 2025 – May 2026 (six-month consulting engagement) |
| Conflicts of interest | None to declare |

## Distribution List

| Copy | Recipient | Format |
|---|---|---|
| 1 | Honourable Commissioner, Ministry of Trade, Industry and Cooperatives | Hard copy + Digital |
| 2 | Permanent Secretary, Ministry of Trade, Industry and Cooperatives | Hard copy + Digital |
| 3 | Director, Trade & Investment, Ministry of Trade, Industry and Cooperatives | Digital |
| 4 | SABER Secretariat, Oyo State | Digital, courtesy copy |
| 5 | Mrs Fateemah Roy-Lagbaja, Managing Director, Chemiroy Nigeria Limited | Hard copy + Digital |
| 6 | File Copy, Chemiroy Nigeria Limited | Hard copy |

## Confidentiality Notice

This Report is confidential. It is prepared for the Ministry of Trade, Industry and Cooperatives and the recipients listed above, and contains commercially sensitive information about the Oyo State Labour & Skills Registry programme. Reproduction or distribution beyond the named recipients without our prior written consent is not permitted.

## Disclaimer

This is a status update. It describes the position of the Registry platform and the state of field-survey readiness as of the issue date, and is intended to support the Ministry's decision on authorising fieldwork.

# 1. Executive Summary

## Field-Survey Readiness Statement

The Oyo State Labour & Skills Registry is on track for fieldwork to begin in the first week of May 2026. The Registry platform is delivered, secured, and operating to specification. There are no outstanding pre-launch dependencies on the Ministry beyond the action items set out at the end of this Report.

<div class="stat-grid stat-grid-4">
  <div class="stat-card">
    <p class="stat-card__value">A-</p>
    <p class="stat-card__label">Security posture</p>
    <p class="stat-card__sublabel">Independently assessed; state-government-grade</p>
  </div>
  <div class="stat-card">
    <p class="stat-card__value">132</p>
    <p class="stat-card__label">Field staff planned</p>
    <p class="stat-card__sublabel">33 supervisors and 99 enumerators</p>
  </div>
  <div class="stat-card">
    <p class="stat-card__value">33</p>
    <p class="stat-card__label">LGAs covered</p>
    <p class="stat-card__sublabel">100% of Oyo State</p>
  </div>
  <div class="stat-card">
    <p class="stat-card__value">6/6</p>
    <p class="stat-card__label">Workstreams on schedule</p>
    <p class="stat-card__sublabel">Two complete; four progressing</p>
  </div>
</div>

## Headline position

Stakeholder sensitisation across the three Senatorial Districts of Oyo State is complete. The Registry platform is built, secured, and operational, with analytics infrastructure ready to interpret post-field data. The survey instrument has been validated through two pre-field enumeration cycles and is now at Version 3. Capacity-building materials are being prepared for delivery in the days immediately before fieldwork. The remaining work is scoped and on schedule.

<div class="callout callout--key">
  <p class="callout-label">Key finding</p>
  <p class="callout-body">The Registry is a deployed, secured, and feature-complete platform ready to receive field data. The remaining gating activities for the start of fieldwork are operational (capacity building, schema readiness, public-wizard polish), not architectural.</p>
</div>

## Engagement context

Chemiroy Nigeria Limited was appointed as Consultant by the Ministry of Trade, Industry and Cooperatives in November 2025, on a six-month engagement concluding in May 2026. The Letter of Introduction authorising the Consultant to engage development partners and counterpart agencies on behalf of the Ministry was issued at the end of February 2026. The Build Phase of the engagement, including this field-survey activity, is scheduled to conclude within the contractual period.

The survey instrument has been refined through two pre-field enumeration cycles conducted as instrument validation. The current questionnaire is Version 3, reflecting the iterative refinement that those cycles produced.

# 2. Mandate Audit, Status by Workstream

This Report sets out progress across the six workstreams that comprise the Registry engagement. The mandate authority is the Ministry of Trade, Industry and Cooperatives. Anticipated contributions from State agencies include the Ministries of Budget, Youth & Sport, Women Affairs, and Education; the Oyo State Investment Public and Private Partnership Agency (OYSIPA); and the Board for Technical and Vocational Training. Anticipated private-sector partners include the Manufacturing Association of Nigeria (MAN), the Association of Nigerian Artisans and Technicians (ASNAT), and the Association of Skilled and Vocational Artisans of Nigeria (ASVAN).

| Workstream | Description | Status |
|---|---|---|
| 1 | Stakeholder sensitisation across the three Senatorial Districts of Oyo State | Complete |
| 2 | Platform delivery (Labour Data Centre and Registry application) | Complete. Production-deployed |
| 3 | Stakeholder engagement with the private sector | In progress |
| 4 | Capacity building for the field-staff cohort | In progress. Curriculum drafted; materials in production |
| 5 | Handover to the Ministry | Designed. Transfer Protocol drafted; counter-signature scheduled |
| 6 | Monitoring and evaluation | Designed and operational. KPI framework and system-health monitoring in place |

## 2.1 Stakeholder sensitisation. Complete.

A programme-launch sensitisation was conducted across the three Senatorial Districts of Oyo State (Oyo Central, Oyo South, and Oyo North) at the start of the engagement. Each district session brought together representatives from the eleven Local Government Areas in that zone, traditional rulers, market and artisan associations, and Local Government secretariat officials. The sessions established programme awareness across the 33-LGA catchment, surfaced LGA-level operational considerations, and opened the community channel through which the field-survey roll-out will be announced.

## 2.2 Platform delivery. Complete.

The Registry platform is established, equipped, and operational. The Labour Data Centre and the Registry application were delivered as one continuous build through the Build Phase of the engagement.

**Infrastructure layer.** Production hosting is on a dedicated DigitalOcean droplet running Ubuntu 24.04 LTS. Storage is split across three layers: a primary PostgreSQL 15 database for transactional respondent records, a Redis 7 in-memory cache for session, queue, and rate-limit state, and DigitalOcean Spaces (S3-compatible) for daily encrypted backups and respondent media (photographs and identification documents). Operator access is restricted to authorised devices through a private overlay network (Tailscale), with key-only Secure Shell access and brute-force mitigation (fail2ban) at the operating-system layer.

**Application layer.** The Registry serves five operational user roles (Enumerator, Clerk, Supervisor, Assessor, and Super Admin) plus a Public tier, through:

- A React front-end web application, optimised for mobile devices, and shipped as a Progressive Web App with seven-day offline draft capability for field operations under intermittent connectivity.
- An Express API service on Node.js, rate-limited per endpoint, with security headers enforced at the application and edge layers.
- A native form system with skip logic, validation rules, and an occupation taxonomy mapped to the International Standard Classification of Occupations (ISCO-08).
- A Fraud Signal Engine with three configurable heuristics: geographic clustering, speed-run detection, and response-pattern analysis.
- An audit-trail subsystem with append-only, hash-chained logs that support the seven-year retention period required by the Nigeria Data Protection Act 2023.
- An analytics layer providing descriptive statistics, inferential statistics (chi-square, correlations, group comparisons with 95% confidence intervals), cross-tabulation, equity analysis, geographic visualisation (LGA choropleth), and policy-brief PDF export. The infrastructure is built and tested against a synthetic dataset, and is ready to interpret field-survey data without further engineering.

A registered super-administrator account is operational, with a break-glass second super-administrator account in place to support continuity of operations.

## 2.3 Stakeholder engagement with the private sector. In progress.

Engagement with the anticipated private-sector partners is ongoing. The Registry's Marketplace tier (an anonymous public search interface for skilled labour) is the channel through which member organisations of the Manufacturing Association of Nigeria (MAN), the Association of Nigerian Artisans and Technicians (ASNAT), and the Association of Skilled and Vocational Artisans of Nigeria (ASVAN) will access skilled-labour profiles once the field survey populates the Register.

We also acknowledge federal-level positioning. The Skilled-Up Nigeria Programme (SUPA), launched by the Industrial Training Fund in March 2026, targets ten million artisans nationally. The Oyo State Labour & Skills Registry sits naturally as a complementary state-level layer that adds LGA-granular validation, fraud detection, and identity assurance, value that a national programme cannot economically provide at scale. A Ministry decision on formal positioning toward SUPA is among the action items at the end of this Report.

## 2.4 Capacity building. In progress.

The capacity-building programme covers four modules: Enumerator, Supervisor, Administrator, and Government Officials. Curriculum content is drafted. Final training materials, including the Operations Manual (enumerator section) and the Supervisor field-protocol document, are in active production. Delivery to the field-staff cohort is scheduled to take place in the days immediately before fieldwork begins.

## 2.5 Handover to the Ministry. Designed.

The Build, Operate, Transfer model that governs this engagement is summarised in Section 7. The formal Transfer Protocol has been drafted and is in legal review.

## 2.6 Monitoring and evaluation. Designed and operational.

A Key Performance Indicator framework of thirty-four indicators across five domains (Enumeration Progress, Data Quality, Field Operations, Platform Performance, and Registry Outcomes) provides the measurement structure for the Registry. System-health monitoring is operational at the platform level, with automated alerts on infrastructure metrics. Monitoring continues throughout the field-survey window and into the Operate Phase.

# 3. Platform Capabilities and Posture

This section sets out what the Registry can do as deployed today, and the security posture under which it operates.

## 3.1 Registry capabilities

The platform supports the following capability set:

- **Analytics tier.** Descriptive statistics, inferential statistics (chi-square, correlations, group comparisons with 95% confidence intervals), cross-tabulation, equity analysis, geographic visualisation (Local Government Area choropleth), anonymised public insights, and policy-brief PDF export.
- **Pending-NIN deferred-capture model.** A defined follow-up cadence (T+2 days, +7 days, +14 days, +30 days) for respondents whose National Identification Number is not available at enumeration. Enumeration proceeds without delay.
- **Multi-source registry framework.** Ingestion of secondary data sources (PDF, CSV, XLSX) with dry-run preview, confirmation, and a fourteen-day rollback window. The framework supports coordination with federal data sources and historical Ministry datasets.
- **Public Wizard.** A single five-step self-registration flow with email magic-link as the primary authentication method, designed to reduce friction for the public.
- **Administrative audit-log viewer.** Investigation-grade access to platform activity at scale, supporting Super-Admin oversight.

## 3.2 Security posture

The Registry's security posture is independently assessed at A- grade, the level appropriate for a state-government registry of long-term custody. The Consultant's continuous quality-uplift programme operates alongside the Build Phase to advance the posture further toward A+, the highest tier on the threat-model dimensions applied. The programme operates on the Registry's defensive layers rather than its business logic, and its progress does not gate fieldwork.

The defensive layers in place include:

- **Identity and operator access.** Tailscale private overlay network for administrator access; key-only Secure Shell; fail2ban brute-force mitigation; and full sshd hardening across configuration drop-ins.
- **Edge protection.** A Cloudflare-managed Web Application Firewall and Distributed Denial-of-Service mitigation in front of the public Registry domain.
- **Application-layer security.** Content Security Policy mirrored between the application and the edge, with automated drift-detection testing; multi-origin Cross-Origin Resource Sharing parsing for the dual-domain configuration.
- **Data integrity.** Append-only, hash-chained audit logs; advisory-lock concurrency control on critical writes; and deduplicated National Identification Number constraint enforcement.

## 3.3 Domain and communications infrastructure

The Registry's public-facing infrastructure is configured for a multi-domain deployment with verified outbound transactional email through Resend, configured against the DKIM, Sender Policy Framework, and Domain-based Message Authentication, Reporting and Conformance (DMARC) standards. Inbound contact addresses (administrator, support, information) are configured through a dedicated forwarding service. Day-to-day Ministry communications can be routed to designated addresses without further engineering work.

# 4. Field Survey Readiness

## 4.1 Field operations posture

| Dimension | Configuration |
|---|---|
| Geographic coverage | All 33 Local Government Areas of Oyo State |
| Field-staff structure | 33 supervisors and 99 enumerators (1:3 supervisor-to-enumerator ratio) |
| Public self-registration | Five-step web wizard with email magic-link authentication |
| Offline operation | Seven-day local draft retention; automatic background synchronisation when connectivity is restored |
| Data-quality assurance | Four-layer protocol: entry validation, automated fraud detection, supervisory review, and assessor verification |
| Identity verification | National Identification Number with deduplication; pending-NIN deferred-capture path for unavailable cases |
| Field-staff engagement | Engaged under the Consultant's contractual accountability, with data-handling obligations cascaded through written agreements |

## 4.2 Field-survey window

Fieldwork is scheduled to begin in the first week of May 2026. The Ministry's confirmation of the precise commencement date is among the action items at the end of this Report.

## 4.3 Instrument validation

The survey questionnaire has been validated through two pre-field enumeration cycles conducted in field conditions. Each cycle exercised the questionnaire against real respondents and produced structural and content revisions. The current Version 3 of the questionnaire is the product of this iterative refinement, and the instrument is field-ready for the May 2026 survey window.

Two cycles of pre-field validation, conducted against real respondents rather than synthetic test data, materially reduce the risk of late-breaking instrument defects surfacing during fieldwork. The validation work also produced an empirical baseline for enumerator training, which has been incorporated into the capacity-building materials.

# 5. Risk Register

A formal Risk Register supports the engagement. It covers operational, technical, regulatory, and strategic risk categories, with assigned ownership, mitigation actions, and a review schedule. The status of the most material risks at the time of issue is summarised below.

| Risk | Status | Note |
|---|---|---|
| Operator-access compromise | Materially mitigated | Tailscale overlay and sshd hardening reduce the attack surface to authorised devices |
| Public-edge intrusion or Distributed Denial-of-Service | Materially mitigated | Cloudflare Web Application Firewall and Distributed Denial-of-Service protection at the edge |
| Backup compromise | Active mitigation in progress | Client-side AES-256 encryption is being added on top of the storage provider's encryption at rest |
| Single-administrator lockout | Mitigated | A break-glass second super-administrator account is in place |
| Data-hygiene failure on respondent intake | Active mitigation in progress | A centralised sanitisation layer addresses canonicalisation gaps observed in comparable programmes |
| Political and stakeholder-environment risk | Monitored | The engagement is sensitive to the broader political and stakeholder environment in which the State operates. The Consultant maintains an internal monitoring posture and will report material developments to the Ministry in the ordinary course |

No new categories of strategic risk have surfaced in the period covered by this Report.

# 6. Compliance Posture

## 6.1 Nigeria Data Protection Act 2023

The Registry is **NDPA-aligned**. It is established under the mandate of the Ministry of Trade, Industry and Cooperatives, exercising its statutory function in respect of trade, industry, and labour matters within Oyo State. The Data Protection Impact Assessment (DPIA) has been drafted in preparation for filing with the Nigeria Data Protection Commission (NDPC).

The controls supporting this posture are: collection of National Identification Number as the sole personally-identifying identifier; retention periods consistent with the Nigeria Data Protection Act 2023 and supporting frameworks for State records; immutable audit logs; encrypted-at-rest backups (with client-side encryption being added on top); and role-based access control. These controls are described in greater detail in the security and platform sections of this Report.

## 6.2 Lawful basis

The DPIA records two lawful bases for processing personal data under the Nigeria Data Protection Act 2023. The primary basis is the performance of a public task by the Oyo State Government in pursuit of its official function: the establishment and maintenance of the State's electronic labour register. The secondary basis is individual respondent consent, recorded at enumeration through the platform's two-stage consent workflow as a distinct decision in the system. The National Identification Number is the only personally-identifying identifier collected. We do not collect Bank Verification Numbers. Disclosure to private-sector searchers under the Marketplace tier is gated by separate respondent consent, recorded as a distinct decision in the platform.

## 6.3 Data sharing

A formal Data Sharing Agreement template has been drafted to govern any future provision of Registry data to third parties (federal initiatives, research partners, or private-sector consumers under the Marketplace tier). The template is in legal review.

## 6.4 Data residency

Production data is hosted on cloud infrastructure secured to industry standards. Data-residency arrangements and any cross-border transfer mitigations are documented in the Data Protection Impact Assessment, which the Registry's controls programme references for ongoing alignment.

# 7. Build, Operate, Transfer

The Oyo State Labour & Skills Registry is governed by a Build, Operate, Transfer (BOT) model. We state this framing in this Report so that the Ministry has a clear view of how responsibility shifts over the lifetime of the programme.

## 7.1 Build Phase

The Build Phase is the platform construction and field-survey period. We are in this phase now. Chemiroy Nigeria Limited holds the consultant accountability for delivery, and operates the platform on behalf of the Ministry through this period.

## 7.2 Operate Phase

The Operate Phase begins on the day field-survey activities are concluded, when the Registry transitions from "instrument under validation" to "production register of skilled labour for the State." During the Operate Phase, Chemiroy Nigeria Limited continues to provide platform hosting, administrative support, and quarterly reporting. The Ministry's substantive use of the Registry (workforce planning, skills programmes, and private-sector engagement) begins in this phase.

## 7.3 Transfer Phase

The Transfer Phase culminates in formal handover of the Registry to Ministry custodianship. The Transfer Protocol drafted for this engagement covers:

- Source code and intellectual property licensing.
- Domain ownership and migration of supporting service accounts.
- Database custody and operational handover.
- Capacity transfer to Ministry information technology personnel.
- Legal indemnification and post-Transfer support.

The Transfer Protocol is in legal review and will be executed by both parties on completion of review.

<div class="callout callout--key">
  <p class="callout-label">Key finding</p>
  <p class="callout-body">The Build, Operate, Transfer model places the Ministry's substantive obligation in the Operate Phase (substantive use of the Registry) and the Transfer Phase (custodianship). The Build Phase, including this field-survey activity, is delivered under consultant accountability. The Ministry's strategic decisions in this period are: authorising fieldwork; programming post-field stakeholder engagement; and scheduling Transfer Day.</p>
</div>

# 8. Ministry Action Items

The following items require the Ministry's attention to enable the start of fieldwork and the orderly progression of the engagement. Each item is bounded, time-defined, and does not require complex inter-Ministerial coordination.

<div class="callout callout--recommend">
  <p class="callout-label">Recommendation</p>
  <p class="callout-body">All items below can be addressed in a single working session at the Ministry's convenience. We are available to support any clarification or briefing the Ministry may require.</p>
</div>

## 8.1 Pre-fieldwork (immediate)

| # | Action | Notes |
|---|---|---|
| 1 | Confirm field-survey commencement date | Currently scheduled for the first week of May 2026 |
| 2 | Authorise launch communication to the enumerator pool | Required to convene the 132 field staff for capacity building and briefing |

## 8.2 During the field survey (rolling)

| # | Action | Notes |
|---|---|---|
| 3 | Receive weekly field-progress digest | Automated. Emailed to the Honourable Commissioner and the Permanent Secretary |
| 4 | Ministry-led media engagement, week one of fieldwork | Active implementation. Schedule of media events to be confirmed with the Ministry's communications team |

## 8.3 Post-field

| # | Action | Notes |
|---|---|---|
| 5 | Receive the Field Survey Report (Deliverable 2) | Statutory deliverable per the engagement. Covers field methodology, observation log, and data-quality summary |
| 6 | Receive the post-field Baseline Report refresh | A revised Baseline Report integrating empirical labour-market findings from fieldwork |

# 9. Conclusion

The Oyo State Labour & Skills Registry is on track for the start of its Field Survey phase in the first week of May 2026. The Registry platform is established, secured, and operational. Sensitisation across the three Senatorial Districts of the State is complete. Capacity-building materials are in production for delivery to the field-staff cohort in the days before fieldwork begins.

The action items set out in Section 8 are the principal pre-launch matters that require the Ministry's attention. None is complex, and the full set can be addressed in a single working session at the Ministry's convenience.

Chemiroy Nigeria Limited remains at the service of the Ministry of Trade, Industry and Cooperatives throughout the Build, Operate, and Transfer phases of this engagement. We are grateful for the Ministry's confidence and for the constructive collaboration that has brought the Registry to its current state of readiness, and we look forward to the field-survey phase and the empirical labour-market findings it will yield for Oyo State.

# 10. References

- Nigeria Data Protection Act, 2023. Federal Republic of Nigeria.
- International Labour Organization Resolution Concerning Statistics of Work, Employment and Labour Underutilization. 19th International Conference of Labour Statisticians, 2013.
- International Standard Classification of Occupations (ISCO-08). International Labour Office, Geneva.
- Skilled-Up Nigeria Programme (SUPA). Industrial Training Fund, Federal Ministry of Industry, Trade and Investment, March 2026.

---

*End of Report.*
