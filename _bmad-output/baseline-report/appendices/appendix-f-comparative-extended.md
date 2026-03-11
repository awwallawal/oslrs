# APPENDIX F: COMPARATIVE STATE REGISTRY ANALYSIS — EXTENDED TABLES

---

*This appendix provides extended comparative tables supporting the analysis in Chapter 8.*

---

## F.1 Feature-by-Feature Comparison

| Feature | Lagos (LETF) | Kaduna (KADSRA) | Edo (EdoJobs) | Delta (JCO) | OSLSR (Oyo) |
|---------|:---:|:---:|:---:|:---:|:---:|
| **Year Established** | 2016 | 2018 | 2019 | 2020 | 2025 |
| **Primary Objective** | Loan facilitation | Universal resident ID | Skills training | Youth employment | Labour register |
| **Target Population** | Entrepreneurs | All residents | Youth (15–35) | Youth | Skilled workers (all ages) |
| **Administering Body** | State Trust Fund | Dedicated agency | Skills Dev. Agency | Ministry | Ministry (+ Consultant) |
| **Legislation** | LETF Law 2016 | KADSRA Law 2018 | Executive Order | Administrative | Engagement TOR |
| **Budget (est.)** | ₦25B endowment | Not disclosed | GIZ-supported | State allocation | Engagement budget |
| **Registration Channels** | Web portal | Field + centres | Web + training | Web + paper | **Mobile PWA + Web + Field** |
| **Offline Capability** | No | Limited | No | No | **Yes (7 days)** |
| **Mobile App** | No | Yes (Android) | No | No | **PWA (all platforms)** |
| **Survey Instrument** | Basic form | Registration form | Training intake form | Basic form | **36-Q ILO-aligned** |
| **Unique Identifier** | BVN | KAD-ID | NIN | None | **NIN** |
| **Biometric** | No | Yes (fingerprint) | No | No | No |
| **Skills Taxonomy** | None | Occupation only | Training categories | None | **150 skills / 20 sectors** |
| **ILO Alignment** | No | No | No | No | **ICLS-19** |
| **ISCO-08 Mapping** | No | No | No | No | **Yes** |
| **Labour Force Classification** | No | No | Partial | No | **Full cascade** |
| **Skip Logic** | Basic | Basic | Basic | No | **12 conditional paths** |
| **GPS Capture** | No | Yes | No | No | **Yes (auto)** |
| **Fraud Detection** | BVN dedup | Biometric | NIN dedup | None | **Multi-algorithm** |
| **GPS Clustering** | No | No | No | No | **Yes** |
| **Speed-Run Detection** | No | No | No | No | **Yes** |
| **Straight-Line Detection** | No | No | No | No | **Yes** |
| **Supervisory Dashboard** | Basic | Yes | Basic | No | **Comprehensive** |
| **Public Marketplace** | No | No | Job board | No | **Skills directory** |
| **Progressive Consent** | No | No | No | No | **3-tier model** |
| **Audit Trail** | Unknown | Unknown | Unknown | No | **SHA-256 hash chain** |
| **Data Export** | Limited | Yes | Limited | No | **CSV + PDF filtered** |
| **Automated Testing** | Unknown | Unknown | Unknown | No | **3,564 tests** |
| **OWASP Assessment** | Unknown | Unknown | Unknown | No | **10/10 SECURE** |
| **NDPA Compliance** | Unknown | Partial | Partial | No | **Full (DPIA completed)** |
| **Open Source** | No | No | No | No | No (proprietary) |
| **API Documentation** | Unknown | Unknown | Unknown | No | **69 endpoints documented** |
| **Disaster Recovery** | Unknown | Unknown | Unknown | No | **Daily backup; <1hr RTO** |
| **Training Programme** | Ad hoc | Field agent training | Included | Ad hoc | **4-module curriculum** |
| **Estimated Registrants** | 300,000+ | 6,000,000+ | 50,000+ | ~20,000 | **330 (validation)** |
| **Coverage** | Lagos only | All 23 LGAs | Edo urban | Delta urban | **All 33 LGAs** |

---

## F.2 Technology Stack Comparison

| Component | Lagos | Kaduna | Edo | Delta | OSLSR |
|-----------|-------|--------|-----|-------|-------|
| **Frontend** | PHP/HTML | Custom Android | React | HTML forms | **React 18 + Vite** |
| **Backend** | PHP/Laravel | Java/.NET | Node.js | PHP | **Node.js + Express** |
| **Database** | MySQL | PostgreSQL | PostgreSQL | MySQL/Spreadsheet | **PostgreSQL 15** |
| **Cache** | None | Redis | None | None | **Redis 7** |
| **ORM** | Eloquent | Custom | Sequelize | None | **Drizzle ORM** |
| **Validation** | Server-only | Server-only | Server-only | None | **Shared Zod schemas** |
| **Auth** | Session-based | JWT + Biometric | JWT | Basic auth | **JWT + Redis blacklist** |
| **Queue** | None | RabbitMQ | None | None | **BullMQ** |
| **Monitoring** | Basic | Custom | None | None | **prom-client + Pino** |
| **CI/CD** | Unknown | Unknown | Unknown | None | **Turbo + CI gates** |
| **Package Mgr** | Composer | Maven/NuGet | npm | N/A | **pnpm (monorepo)** |

---

## F.3 Data Quality Comparison

| Mechanism | Lagos | Kaduna | Edo | Delta | OSLSR |
|-----------|:-----:|:------:|:---:|:-----:|:-----:|
| Format validation | ✓ | ✓ | ✓ | Partial | **✓** |
| Cross-field validation | Partial | Partial | No | No | **✓** |
| Unique ID dedup | BVN | KAD-ID | NIN | No | **NIN (Modulus 11)** |
| GPS verification | No | Yes | No | No | **Yes** |
| Speed-run detection | No | No | No | No | **Yes** |
| Pattern detection | No | No | No | No | **Yes** |
| Supervisory review | Ad hoc | Yes | Ad hoc | No | **Structured workflow** |
| Statistical QA gates | No | Partial | No | No | **8 gates (NBS-aligned)** |
| Audit trail | Basic | Partial | Basic | No | **Immutable (SHA-256)** |
| QA layers | 1–2 | 2–3 | 1–2 | 0–1 | **4 layers** |

---

## F.4 Lessons Applied to OSLSR Design

| # | Lesson Source | Observation | OSLSR Design Response |
|---|-------------|------------|----------------------|
| 1 | Lagos (LETF) | Financial incentive drives registration | Skills Marketplace provides economic incentive (visibility to employers) |
| 2 | Lagos (LETF) | Web-only registration excludes offline workers | Three-channel approach including offline-capable PWA |
| 3 | Kaduna (KADSRA) | Broad scope = shallow skills data | Focused scope (skilled workers) with deep taxonomy (150 skills) |
| 4 | Kaduna (KADSRA) | Massive scale requires systematic QA | 4-layer QA protocol with automated fraud detection |
| 5 | Kaduna (KADSRA) | Biometric capture adds cost and complexity | NIN-based deduplication achieves uniqueness without biometric hardware |
| 6 | Edo (EdoJobs) | Training-driven registration misses existing skilled workers | Direct enumeration of existing workforce regardless of training status |
| 7 | Edo (EdoJobs) | GIZ dependency creates sustainability risk | Platform designed for Ministry self-operation post-handover |
| 8 | Delta (JCO) | Spreadsheet-based management doesn't scale | Purpose-built digital platform with database architecture |
| 9 | All states | No ISCO-08 mapping = limited comparability | Full ISCO-08 mapping for national/international comparability |
| 10 | All states | Limited or unknown security posture | OWASP Top 10 compliant; 3,564 automated tests; NDPA DPIA completed |

---

*Document Reference: CHM/OSLR/2026/001 | Appendix F | Chemiroy Nigeria Limited*
