# CHAPTER 12: DATA CENTER ESTABLISHMENT

---

## 12.1 Introduction

Deliverable 1 of the engagement Terms of Reference requires the **Establishment of a Data Center** for the Oyo State Skilled Labour Register. This chapter documents the design rationale, procurement, configuration, and operational status of the Data Center infrastructure, which employs a hybrid architecture combining on-premises computing resources with cloud-hosted production services.

The Data Center was established at the premises of the **Ministry of Trade, Industry, Investment and Cooperatives**, ensuring physical proximity to the commissioning authority, facilitating Ministry oversight, and establishing data sovereignty within a government-controlled environment.

**Deliverable Status: COMPLETE** ✓

---

## 12.2 Design Rationale

### 12.2.1 Hybrid Architecture Decision

The Data Center adopts a **hybrid architecture** — combining on-premises physical infrastructure with cloud-hosted services — to address the dual requirements of operational resilience and cost efficiency. This design was selected based on the following considerations:

| Factor | On-Premises Only | Cloud Only | Hybrid (Selected) |
|--------|:-:|:-:|:-:|
| Data sovereignty (government premises) | ✓ | ✗ | ✓ |
| Power continuity (5G ODU backup) | ✓ | N/A | ✓ |
| 24/7 application availability | ✗ | ✓ | ✓ |
| Disaster recovery | ✗ | ✓ | ✓ |
| Capital expenditure | High | Low | Moderate |
| Operational expenditure | Low | Moderate | Moderate |
| Scalability | Limited | High | High |
| Physical access for training | ✓ | ✗ | ✓ |

The hybrid model ensures that:
- **Operational activities** (data entry, quality assurance, training, administrative functions) are performed on-premises at Ministry premises, under direct government oversight
- **Production application hosting** (the OSLSR platform, database, and fraud detection engine) runs on cloud infrastructure with enterprise-grade availability, automated backups, and disaster recovery
- **Data synchronisation** between on-premises terminals and the cloud platform occurs in real-time via the dedicated broadband connection

---

## 12.3 On-Premises Operations Node

### 12.3.1 Hardware Specifications

The on-premises node comprises three (3) enterprise-grade HP workstations, procured and configured for specific operational functions:

| Unit | Type | Specifications | Assigned Function |
|------|------|---------------|-------------------|
| **Workstation 1** | HP Desktop | Intel Core i7 Processor, 16 GB RAM, 512 GB HDD, Full HD Display | Data Entry & Quality Assurance Terminal — Primary data entry station for Data Entry Clerks; quality assurance review of flagged submissions |
| **Workstation 2** | HP Desktop | Intel Core i7 Processor, 16 GB RAM, 512 GB HDD, Full HD Display | Administrative Operations & Reporting Terminal — System administration, report generation, supervisory monitoring, and dashboard analytics |
| **Workstation 3** | HP Laptop | Intel Core i7 Processor, 16 GB RAM, 512 GB HDD, Integrated Display | Field Supervision & Mobile Operations Unit — Portable unit for field visits, on-site training delivery, demonstration sessions, and mobile supervisory functions |

### 12.3.2 Operating Environment

All workstations are configured with:
- Modern web browser (Google Chrome, latest stable release) for OSLSR platform access
- Operating system security updates applied
- User accounts with role-appropriate platform access credentials
- Local backup of essential reference documents and training materials

### 12.3.3 Physical Security

The Data Center is located within the secured premises of the Ministry of Trade, Industry, Investment and Cooperatives, benefiting from:
- Ministry building security (access control, security personnel)
- Designated workspace for Data Center equipment
- Equipment inventory and asset tagging for accountability

---

## 12.4 Network Infrastructure

### 12.4.1 Broadband Connectivity

Network connectivity is provided via the **Airtel SmartConnect 5G Outdoor Unit (ODU) Router**, a next-generation broadband solution specifically designed for Nigerian operating environments.

| Specification | Detail |
|--------------|--------|
| **Device** | Airtel SmartConnect 5G ODU Router |
| **Network** | 5G (primary) with automatic 4G LTE fallback |
| **Data Plan** | Unlimited monthly data at speeds up to 50 Mbps |
| **Monthly Subscription** | ₦25,000 |
| **Mounting** | Outdoor-mounted for optimised signal reception |
| **Device Connections** | Up to 64 simultaneous devices |
| **Power Backup** | Built-in battery providing 5–6 hours of operation during power outages |
| **Parental/Usage Controls** | Configurable access and browsing controls |

### 12.4.2 Network Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   MINISTRY PREMISES                          │
│                                                              │
│  ┌─────────────┐                                            │
│  │  Airtel 5G  │    Outdoor-mounted                         │
│  │  ODU Router │    50 Mbps Unlimited                       │
│  │  (5G/4G LTE)│    5-6hr battery backup                   │
│  └──────┬──────┘                                            │
│         │ Wi-Fi / LAN                                       │
│         │                                                    │
│  ┌──────┴──────────────────────────────────────────────┐    │
│  │              Local Area Network                      │    │
│  │                                                      │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │    │
│  │  │Workstation│  │Workstation│  │   Workstation    │  │    │
│  │  │    1      │  │    2      │  │       3          │  │    │
│  │  │(Data Entry│  │(Admin &  │  │(Field Supervision│  │    │
│  │  │   & QA)   │  │ Reporting)│  │     Laptop)      │  │    │
│  │  └──────────┘  └──────────┘  └──────────────────┘  │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
└──────────────────────────┬───────────────────────────────────┘
                           │
                    Encrypted HTTPS
                    Connection (TLS 1.2+)
                           │
┌──────────────────────────┴───────────────────────────────────┐
│                   CLOUD INFRASTRUCTURE                        │
│                                                               │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │   NGINX     │  │  Application │  │    PostgreSQL       │  │
│  │   Reverse   │──│    Server    │──│    Database         │  │
│  │   Proxy     │  │  (OSLSR API) │  │  (Encrypted, Daily  │  │
│  │(SSL/TLS,    │  │              │  │   Backups to S3)    │  │
│  │ Rate Limit) │  │  3,564 Tests │  │                     │  │
│  └─────────────┘  └──────────────┘  └────────────────────┘  │
│                                                               │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │    Redis    │  │   BullMQ     │  │   Offsite Backup   │  │
│  │   Cache &   │  │   Job Queue  │  │   (S3-Compatible)  │  │
│  │ Rate Limit  │  │  (Fraud Det, │  │   7-Year Retention │  │
│  │             │  │   Backups)   │  │   NDPA Compliant   │  │
│  └─────────────┘  └──────────────┘  └────────────────────┘  │
│                                                               │
│  Server: Ubuntu 24.04 LTS | 99.9% Uptime SLA                │
└───────────────────────────────────────────────────────────────┘
```

### 12.4.3 Connectivity Resilience

The network infrastructure incorporates the following resilience measures:

1. **5G/4G Automatic Fallback**: The Airtel ODU automatically switches between 5G and 4G LTE networks based on signal availability, ensuring continuous connectivity even in areas where 5G coverage is intermittent

2. **Built-in Power Backup**: The ODU's integrated battery provides 5–6 hours of operation during power outages — a critical provision given the power supply challenges typical of Nigerian government facilities

3. **Offline-Capable Applications**: The OSLSR platform's Progressive Web Application (PWA) architecture enables field data collection to continue for up to 7 days without network connectivity, with automatic synchronisation upon restoration

4. **Cloud Infrastructure Redundancy**: The production server operates on enterprise infrastructure with built-in redundancy, automated failover, and continuous monitoring

---

## 12.5 Cloud Infrastructure

### 12.5.1 Production Server Specifications

| Component | Specification |
|-----------|--------------|
| **Operating System** | Ubuntu 24.04 LTS (Long-Term Support) |
| **Application Runtime** | Node.js 20 LTS |
| **Web Server / Reverse Proxy** | NGINX (SSL termination, rate limiting, static asset serving) |
| **Database** | PostgreSQL 15 (encrypted at rest, daily automated backups) |
| **Cache / Rate Limiting** | Redis 7 (with AOF persistence) |
| **Job Queue** | BullMQ (fraud detection, backup orchestration, email delivery) |
| **SSL Certificate** | TLS 1.2+ (HTTPS enforced on all endpoints) |
| **Domain** | Configured and operational |

### 12.5.2 Backup & Disaster Recovery

| Parameter | Configuration |
|-----------|--------------|
| **Backup Frequency** | Daily automated backups (2:00 AM WAT) |
| **Backup Method** | PostgreSQL `pg_dump` (full database export) |
| **Offsite Storage** | S3-compatible encrypted storage |
| **Retention Policy** | 7-day daily retention + 7-year monthly archives (NDPA compliance) |
| **Restore Capability** | Documented restore procedure; tested and validated |
| **Recovery Time Objective (RTO)** | < 1 hour from latest backup |
| **Recovery Point Objective (RPO)** | Maximum 24 hours (daily backup interval) |

### 12.5.3 Monitoring & Alerting

The cloud infrastructure is monitored through the OSLSR System Health Monitoring module (detailed in Chapter 13), which tracks:

- CPU utilisation, memory usage, and disk consumption
- Database query performance (p95 latency)
- Application response times
- Job queue depth and processing rates
- SSL certificate expiry
- Automated alert notifications when thresholds are exceeded

---

## 12.6 Cost Efficiency

The hybrid Data Center architecture delivers significant cost efficiency compared to traditional government IT procurement models:

| Cost Component | Description | Frequency |
|----------------|-------------|-----------|
| Hardware (one-time) | 3× HP Core i7 workstations | Capital |
| Network device (one-time) | Airtel 5G ODU Router | Capital |
| Broadband subscription | Unlimited 50 Mbps data plan | ₦25,000/month |
| Cloud hosting | Production server with backup storage | Monthly |
| **Total Monthly Operating Cost** | Broadband + Cloud hosting | **Recurring** |

The operating cost model ensures sustainability beyond the initial engagement period. The Ministry can continue operating the Data Center and platform with minimal recurring expenditure — broadband connectivity and cloud hosting — without requiring additional capital investment.

---

## 12.7 Deliverable Acceptance Criteria

| # | Criterion | Status |
|---|-----------|:------:|
| 1 | Physical hardware procured and installed at Ministry premises | ✓ Complete |
| 2 | Network connectivity operational with adequate bandwidth | ✓ Complete |
| 3 | Cloud infrastructure deployed and accessible from on-premises terminals | ✓ Complete |
| 4 | OSLSR platform accessible from all three workstations | ✓ Complete |
| 5 | Automated backup system operational with offsite storage | ✓ Complete |
| 6 | System monitoring and alerting configured | ✓ Complete |
| 7 | Data Centre operational and ready for production use | ✓ Complete |

**Deliverable 1 — Establishment of Data Center: COMPLETE** ✓

---

*Document Reference: CHM/OSLR/2026/001 | Chapter 12 | Chemiroy Nigeria Limited*
