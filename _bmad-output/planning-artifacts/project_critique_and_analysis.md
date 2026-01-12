# OSLSR Deep Critique & Analysis

**Date:** 2026-01-04
**Analyst:** BMad Master
**Version:** 1.0

## 1. Executive Summary

The Oyo State Labour & Skills Registry (OSLSR) architecture is a pragmatic, well-scoped solution that effectively balances the constraints of a government environment (Single VPS, NDPA compliance, cost efficiency) with the need for a robust, enterprise-grade system. The "Composed Monolith" approach leveraging ODK Central is the correct strategic choice, minimizing risk while maximizing reliability.

However, the "Single VPS" infrastructure introduces significant Single Point of Failure (SPOF) risks that must be mitigated through rigorous operational procedures. The following analysis details strengths, weaknesses, and actionable recommendations to harden the system.

## 2. Strengths (The Good)

*   **Pragmatic Architecture (Composed Monolith):** The decision to combine a Custom Node.js App with a Self-hosted ODK Central instance avoids the operational complexity of distributed microservices while leveraging an industry-standard collection engine.
*   **Data Integrity & Fraud Detection:** The **Context-Aware Fraud Signal Engine** (Cluster, Speed, Pattern heuristics) operating at the ingestion layer is a standout feature. It allows for non-blocking field collection while ensuring high data quality through post-processing and supervisor verification.
*   **Privacy-First Design:** The architecture inherently respects NDPA compliance through:
    *   Exclusion of BVN data.
    *   Use of Read-Only replicas for the public marketplace.
    *   A robust two-stage consent workflow.
*   **Offline-First Reality:** The system acknowledges the reality of Nigerian network infrastructure. Designing for a 7-day offline capability for enumerators is a critical reliability feature.

## 3. Critical Risks & Weaknesses (The Bad)

*   **Single Point of Failure (SPOF):** The reliance on a single Hetzner VPS is the most significant risk. Hardware failure results in total system outage. The 1-hour RTO (Recovery Time Objective) relying on 6-hour snapshots implies a potential data loss window for dashboard/marketplace data (though ODK data on devices remains safe).
*   **PostgreSQL Version Lock:** Locking to PostgreSQL 15 for ODK Central compatibility prevents the Custom App from utilizing newer features in PG 16/17, potentially impacting future performance optimizations.
*   **BullMQ Single-Process Bottleneck:** All background jobs (ingestion, notifications, fraud scoring, backups) sharing the same Node.js process could lead to event loop lag during peak ingestion periods (e.g., mass media campaigns).
*   **Search Experience Limitations:** PostgreSQL Trigram search is adequate for the initial scale but lacks the advanced relevance scoring and typo-tolerance of dedicated search engines (Meilisearch/Elasticsearch), potentially impacting the marketplace user experience as the dataset grows.

## 4. "Make It Better" - Strategic Recommendations

### A. Infrastructure Resilience
*   **Proposal:** Implement a **Floating IP** on the Hetzner Cloud setup.
*   **Why:** Enables immediate IP remapping to a backup instance (restored from snapshot) in case of hardware failure, bypassing DNS propagation delays.
*   **Cost:** Minimal (~€3/mo).

### B. "Assisted" Offline Sync
*   **Proposal:** Operationalize a **"Supervisor Hotspot"** protocol.
*   **Why:** To support enumerators in deep rural areas with poor connectivity.
*   **Implementation:** Application logic to detect metered connections and prioritize text-data sync over media, combined with operational procedures for weekly sync meets.

### C. Fraud Detection 2.0: "The Honeycomb" (Graph-Based Heuristics)
*   **Proposal:** Introduce **Graph-Based Fraud Detection**.
*   **Why:** To detect collusion and shared data points across seemingly unrelated submissions (e.g., multiple respondents sharing a bank account or Next of Kin phone number).
*   **Implementation:** Nightly batch jobs utilizing recursive SQL queries or self-joins.

### D. Marketplace "Lite" Search Optimization
*   **Proposal:** Implement **Pre-computed Search Tags**.
*   **Why:** To maintain sub-250ms search performance on limited hardware.
*   **Implementation:** Generate and index a `search_vector` (tsvector) column combining Profession, LGA, and Skills, rather than performing raw trigram searches on every query.

### E. Enumerator Experience (UX)
*   **Proposal:** **Gamified Sync Status**.
*   **Why:** To reduce enumerator stress and encourage frequent syncing.
*   **Implementation:** Replace negative "Warning" banners with positive progress indicators (e.g., "Daily Goal: 8/10 Uploaded").

## 5. Immediate Action Plan

1.  **Proceed with Standard Monorepo Initialization (Story 1.1).**
2.  **Refinement:** Enforce strict type boundaries between `odk_db` and `app_db` to prevent cross-contamination.
3.  **Refinement:** Configure Pino logging with explicit tags for "Performance" and "Security" to facilitate future log-based analysis.
