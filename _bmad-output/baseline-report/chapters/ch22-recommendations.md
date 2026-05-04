# 19. Recommendations and Next Steps

---

## 19.1 Introduction

This chapter presents the Consultant's formal recommendations for the successful completion of the Oyo State Skilled Labour Register, based on the findings of the baseline study, the validation exercise results, and the operational readiness assessment documented in this report.

---

## 19.2 Summary of Achievements

Before outlining recommendations, the Consultant notes the following milestones achieved during the first phase of the engagement:

| # | Achievement | Reference |
|---|------------|-----------|
| 1 | **Deliverable 1, Data Centre: COMPLETE** | Chapter 12 |
| 2 | Comprehensive desk review of labour market data for Oyo State | Chapter 7 |
| 3 | Comparative analysis of state-level registry initiatives | Chapter 8 |
| 4 | ILO ICLS-19 aligned survey methodology designed | Chapter 9 |
| 5 | Survey instrument developed through 3 iterative review cycles (v3.0) | Chapter 10 |
| 6 | 150-skill occupational taxonomy mapped to ISCO-08 | Chapter 11 |
| 7 | OSLSR digital platform developed, tested (3,564 tests), and deployed | Chapter 13 |
| 8 | OWASP Top 10 security assessment, all categories SECURE | Chapter 14 |
| 9 | NDPA 2023 Data Protection Impact Assessment completed | Chapter 14 |
| 10 | Validation exercise across all 33 LGAs (n=330) | Chapters 15–16 |
| 11 | Data quality assurance framework operational | Chapter 17 |
| 12 | **Deliverable 3, Training curriculum: DESIGN COMPLETE** | Chapter 18 |

The digital infrastructure, validated survey instrument, 150-skill occupational taxonomy, data quality assurance framework, and operational Data Centre are **deployment-ready**. The platform has undergone comprehensive automated testing and security assessment, and is operational and accessible.

---

## 19.3 Recommendations for Deliverable 2: Creation of the State Labour Register

### Recommendation 1: Immediate Mobilisation of Field Personnel

For the successful execution of the statewide field enumeration, the Consultant recommends the **immediate mobilisation** of the following field personnel:

| Role | Number per LGA | Total (33 LGAs) | Profile |
|------|:--------------:|:----------------:|---------|
| **Field Enumerator** | 3 | **99** | Literate adults (minimum SSS/WAEC), proficient with smartphones, resident within assigned LGA, ability to communicate in Yoruba and English |
| **Field Supervisor** | 1 | **33** | Experienced coordinators with management capability, familiarity with government field programmes, minimum OND/NCE education |
| **Total Field Personnel** | 4 | **132** | |

**Justification**: The validated survey instrument requires an estimated 10 minutes per respondent. With 3 enumerators per LGA operating 6 hours/day (accounting for travel and engagement time) at approximately 8 submissions per enumerator per day, a 30-day enumeration period would yield approximately **23,760 validated submissions** (99 enumerators × 8 submissions/day × 30 days), a substantive foundation for the State Labour Register, supplemented by ongoing public self-registration via the web platform.

### Recommendation 2: Procurement of Data Collection Devices

| Item | Minimum Specification | Quantity | Purpose |
|------|----------------------|:--------:|---------|
| Android Smartphone | Android 8.0+, 2GB RAM, 32GB storage, GPS, camera, ≥5" screen | **132** | Field data collection via OSLSR PWA |
| SIM Card with Data | Monthly data allocation ≥2GB per device | **132** | Submission synchronisation |
| Protective Case | Rugged/shockproof | **132** | Device protection in field conditions |
| Portable Power Bank | ≥10,000 mAh | **132** | Extended field operation |

**Justification**: The OSLSR platform is designed as a Progressive Web Application (PWA) operating on Android devices. While the platform supports 7-day offline operation, periodic data synchronisation requires mobile data connectivity. The offline architecture means that high-speed connectivity is not required, 2G/3G is sufficient for submission upload.

### Recommendation 3: Field Logistics and Support

| Item | Specification | Duration | Quantity |
|------|--------------|----------|:--------:|
| Transportation Allowance | Intra-LGA travel for enumerators and supervisors | 30 days | 132 persons |
| Communication Airtime | Voice calling for team coordination | 30 days | 132 persons |
| Identification Materials | Branded vests, laminated ID cards, Ministry introductory letters |, | 132 sets |
| Sensitisation Materials | Community flyers, radio announcement scripts, poster templates |, | 33 LGA packages |
| Field Stationery | Notebooks, pens, consent forms (backup) |, | 132 sets |

**Justification**: Community trust and access are critical success factors for field enumeration, particularly in rural LGAs. Branded identification materials and introductory letters from the Ministry establish the legitimacy of the exercise and facilitate cooperation from traditional rulers, community leaders, and ward heads.

### Recommendation 4: Sensitisation and Community Engagement

The Consultant recommends a **two-week advance sensitisation programme** preceding field deployment:

1. **Ministry-level announcement**: Official circular from the Honourable Commissioner to all 33 LGA chairmen informing them of the enumeration exercise
2. **Traditional ruler engagement**: Courtesy visits by Supervisors to traditional rulers and community leaders in each LGA
3. **Community-level awareness**: Distribution of flyers at markets, motor parks, and community centres; radio announcements on local stations (e.g., Amuludun FM, Splash FM, Oluyole FM)
4. **Religious institution engagement**: Announcements at Friday mosques and Sunday churches to reach the broadest population

### Recommendation 5: Training Delivery

Upon mobilisation of field personnel, the Consultant will deliver the capacity building programme as designed in Chapter 18:

| Training Module | Duration | Target Group |
|----------------|----------|-------------|
| Platform Operations, Enumerator Module | 2 days | 99 Enumerators (in 3 batches of 33) |
| Field Supervision & Quality Assurance | 1 day | 33 Supervisors |
| System Administration & Reporting | 2 days | Ministry-designated Admin staff |
| Data Analysis & Dashboard Utilisation | 1 day | Government Officials / Policy users |

---

## 19.4 Recommendations for Long-Term Registry Sustainability

### Recommendation 6: Establish Registry as Ongoing Government Function

The Labour Register should not be treated as a one-time enumeration exercise. The Consultant recommends establishing the OSLSR as a **continuously updated government resource** through:

1. **Permanent online registration portal**: The self-registration function (currently operational) remains accessible to the public beyond the field enumeration period, allowing ongoing voluntary registration
2. **Annual data refresh**: A lightweight annual verification exercise (phone/SMS confirmation) to maintain data currency and identify out-of-date records
3. **Dedicated Ministry officer**: Assignment of a trained Ministry staff member as ongoing registry administrator

### Recommendation 7: Leverage Skills Marketplace for Economic Development

The OSLSR Skills Marketplace (currently operational) provides a unique asset for Oyo State's economic development strategy. The Consultant recommends:

1. **Public launch event**: Formal public launch of the Skills Marketplace once sufficient register data is populated
2. **Employer awareness campaign**: Outreach to businesses, contractors, and organisations in Oyo State to register as marketplace users
3. **Integration with Ministry programmes**: Link the marketplace to existing skills development, MSME support, and investment attraction initiatives

### Recommendation 8: Position the Register as a Business Environment Reform Asset

Oyo State's rising performance in the federal subnational business enabling environment assessment, from 27th to 3rd nationally (62.7% in 2025), demonstrates the state's commitment to creating a competitive business environment. The Skilled Labour Register directly supports the **skilled labour readiness** indicator, one of sixteen dimensions assessed in the reform framework. The Consultant recommends:

1. **Formal integration with state business reform reporting**: Register data (total registrants, skills distribution, LGA coverage) should be included in Oyo State's submissions to the federal business environment assessment programme
2. **Quarterly metrics reporting**: Generate automated quarterly reports on register growth and marketplace utilisation for submission to the relevant state reform coordination office
3. **Inter-state visibility**: Position the register as a model for other states participating in the business enabling environment reform programme, Oyo State would be the first to offer a comprehensive, digitised, NIN-linked skilled workforce database with a public search capability

---

## 19.5 Timeline for Completion

Subject to the timely mobilisation of resources outlined above, the Consultant projects the following timeline for project completion:

| Phase | Activity | Duration | Projected Period |
|-------|----------|----------|-----------------|
| **Gate 1** | Recruitment, training, pilot | 2–3 weeks | Upon resource mobilisation |
| **Gate 2** | Full-scale field enumeration | 4 weeks | Following Gate 1 |
| **Gate 3** | Data quality review, training delivery, handover | 2 weeks | Following Gate 2 |
| | **Total remaining duration** | **8–9 weeks** | |

The Consultant affirms that the remaining work is achievable within the engagement timeline, **provided that the mobilisation of field personnel and logistics resources commences promptly**.

---

## 19.6 Conclusion

The first phase of the engagement has established the complete methodological, technological, and operational foundation for the Oyo State Skilled Labour Register. The achievements documented in this report, a production-ready digital platform, a validated ILO-aligned survey instrument, a 150-skill occupational taxonomy, an operational Data Centre, and a rigorous data quality framework, represent a substantial body of work that positions the project for successful completion.

The Consultant stands ready to execute the field enumeration phase immediately upon mobilisation of the requisite field personnel and logistics resources, and remains committed to the timely and successful delivery of all engagement deliverables.

---

*Mrs Fateemah Roy-Lagbaja*
*Managing Director*
*Chemiroy Nigeria Limited*

*May 2026*

---

*Document Reference: CHM/OSLR/2026/002 | Chapter 22 | Chemiroy Nigeria Limited*
