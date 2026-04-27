# Post-Handover Security Recommendations — Ministry / State ICT

**Authored:** 2026-04-27 by John (PM) per cost-aware roadmap session with Builder (Awwal Lawal).
**Audience:** Oyo State Ministry / State ICT inheriting OSLRS at Transfer Day per BOT contract D2.
**Purpose:** Document security-hardening items the Builder identified as valuable but consciously deferred during the Build/Operate phase on cost grounds. None of these are field-blocking; all are recommended for the Ministry to consider funding once OSLRS is operational and the field survey is complete.

---

## Why this document exists

During the Build phase, the Builder funded all out-of-pocket project costs personally (domain registration, project SIM, ongoing airtime), with reimbursement tied to the D2 §6 retainer clause. Net out-of-pocket has been bounded under ₦100K total project lifetime by deliberate choice — every additional incurring-cost item was weighed against budget realism and field-criticality.

The result: OSLRS reaches field-survey-ready (B+ → defensible A- via 5-day Wave 0 + Wave 1 close-out) **with zero additional ongoing cost** beyond what was already in the budget (Resend free tier + Cloudflare free tier + DigitalOcean droplet + DO Spaces + domain renewal).

Several items that an external security assessment (2026-04-27) flagged as "would push posture to A" were deferred specifically because they incur recurring or significant one-time cost. This document lists those items so the Ministry inherits a complete picture of the security posture: **what's done, what's knowingly deferred, and what funding each deferred item would require.**

---

## Recommendation 1 — Push-channel alerting tier (SMS / WhatsApp / paged)

**Severity:** High (for multi-operator deployments) / Medium (for solo-operator)
**Cost (one-time):** ~₦5-15K for Twilio account setup + verified Nigerian sender ID
**Cost (ongoing):** ~₦500-2,000/month at OSLRS's expected alert volume (assumes <100 CRITICAL events/month)
**Risk closed:** Detection lag during after-hours incidents. Today's email-only channel has a measured operator-to-response gap that varied from ~80 minutes (when Builder was at the keyboard) to ~19 hours (when Builder had unrelated constraints — the 2026-04-20 distributed SSH brute-force).

**Why deferred:** During Operate phase, Builder operates as solo email-attentive operator and assessed email + active inbox-monitoring as field-survivable. The SMS/paged tier becomes high-leverage when:
- Operator pool grows beyond 1 person (rotation, on-call, after-hours coverage)
- Field-survey scale produces alert volumes high enough to swamp the email digest
- Ministry's IT staff do NOT keep the OSLRS admin inbox in their primary view

**Recommended priority:** Schedule for the first quarter post-handover, alongside Ministry IT staff onboarding.

**Vendor options:**
- **Twilio Programmable SMS** (most documentation, NDPC-data-residency caveats apply for citizen PII flows — but alerts are operator-bound, not citizen-PII, so caveats are limited)
- **Termii** (Nigerian-based, lower-cost SMS for NG numbers, simpler onboarding)
- **WhatsApp Business API** (cheaper per message but more complex onboarding via Meta Business Verification)

**Implementation effort:** ~1-2 days dev work. Story 9-9 AC#6 has the design captured; implementation slot reserved but unfilled.

---

## Recommendation 2 — Boutique Nigerian penetration test

**Severity:** High (industry-standard pre-cutover practice for citizen-PII registries)
**Cost (one-time):** ~₦200,000 - ₦300,000 for a 1-week black-box + grey-box engagement at Nigerian rates
**Cost (ongoing):** ₦0 — recommend annual cadence (~₦200-300K/year) post-Operate phase
**Risk closed:** Internal code-review discipline (149 + 133 + 142 + 167 findings across the last four epics, 90%+ fix rate per retro records) is unusually strong, but internal review systematically misses certain classes:
- Timing attacks
- Race conditions in patterns the team has habituated to
- Business-logic abuse (chained-action exploits)
- API contract assumption violations
- Authentication / session-management quirks at edge cases

A boutique pentest would surface unknown unknowns before a real adversary does.

**Why deferred:** Real out-of-pocket cost in NGN, no clear reimbursement path during Operate. Ministry budget can absorb it as a line item.

**Recommended priority:**
1. **Pre-Transfer-Day** — ideal: pentest BEFORE Ministry takes over, so report and remediation history transfers as part of D2 §11 documentation. Saves Ministry from "inheriting unknown risks."
2. **Post-Transfer Year 1** — also acceptable; aligns with NDPA Article 32 (technical and organisational measures) attestation cycle.

**Vendor options (Nigerian-based, NDPA-aware):**
- DigitalEncode (Lagos)
- Streamsowers & Köhn cybersecurity practice
- KPMG Nigeria Cyber
- Independent boutique CRESTs / OSCPs via referral from OWASP Nigeria chapter

**Pre-engagement deliverables Builder can prepare (zero cost):**
- Architecture document
- ADR catalog
- Threat model artifact (currently a gap — see Recommendation 5)
- Test scope: focus on auth flows, audit-log immutability claims, marketplace public surface, Epic 10 consumer API, NIN-uniqueness enforcement

---

## Recommendation 3 — Secrets management upgrade (Vault / KMS)

**Severity:** Medium-High at scale (low for current single-VPS deployment)
**Cost (one-time):** Minimal (configuration time)
**Cost (ongoing):** $1-5/month at AWS Secrets Manager pricing for the ~10-15 secrets OSLRS uses; or $0 + ops-time for self-hosted HashiCorp Vault on a $4/mo droplet
**Risk closed:** Today's posture: all secrets (JWT signing keys, Resend API key, S3 access/secret keys, DB connection string, hCaptcha secret, DO API token) live in `/root/oslrs/.env` on the VPS. Mitigations in place:
- VPS hardened (Tailscale + sshd-key-only + fail2ban)
- JWT secrets rotated once during SEC2-1 (2026-04-04)
- File permissions 600

But: no automated rotation cadence, no audit trail on secret access, no central revocation if a VPS-image leak occurs.

**Why deferred:** At single-VPS scale with 1-2 operators, the operational overhead of Vault/KMS exceeds the marginal risk reduction. Becomes high-leverage when:
- Multi-environment (staging + production split)
- Multiple operators with rotation requirements
- Compliance attestation requires secret-rotation evidence

**Recommended priority:** Year 2 post-handover, OR triggered by a compliance attestation requirement (NDPA audit, ISO 27001 path, etc.).

**Vendor options:**
- **AWS Secrets Manager** ($0.40/secret/month, ~$4-6/month total at OSLRS scale; integration via AWS SDK already in use for DO Spaces)
- **HashiCorp Vault** (self-hosted; $4/month nano droplet; higher ops complexity)
- **Doppler** (free tier covers small teams, paid from $7/user/month)

---

## Recommendation 4 — DPIA filing with NDPA Commission

**Severity:** Compliance-mandatory for citizen-PII registries (not security severity per se)
**Cost (one-time):** Filing fee TBD — confirm with Iris (legal)
**Cost (ongoing):** ₦0 (annual review obligation, but no recurring fee)
**Risk closed:** NDPA Article 28 mandatory data protection impact assessment for citizen-PII processing at scale. Non-filing exposes Ministry to regulatory penalty under NDPA enforcement framework (up to ₦10M or 2% of annual gross revenue, whichever is higher).

**Why deferred:** NDPA Commission filing process and current fee schedule require legal-track engagement (Iris). Builder does not unilaterally execute this.

**Recommended priority:** **Pre-field-survey IF possible** — Iris should confirm whether DPIA filing must complete before "live data processing begins" (likely yes per Article 28(3)) or can be filed concurrently with go-live.

**Action items:**
- Iris confirms NDPA Commission current filing fee + processing timeline
- Iris drafts DPIA document leveraging the threat-model + architecture + privacy-by-design artifacts already produced
- Builder provides technical inputs (data flows, retention periods, access controls) — already captured in architecture.md and ADRs

---

## Recommendation 5 — Formal threat model artifact

**Severity:** Low (today) / Medium (pre-Epic 10 third-party API exposure)
**Cost:** ₦0 — internal effort, ~2-3 days
**Cost (ongoing):** ₦0 — annual review only
**Risk closed:** Nothing in the project today is a holistic adversarial review document. ADRs cover specific decisions, retros cover specific epic outcomes, the security assessment covers point-in-time posture. None are an attack-tree analysis (e.g., STRIDE per asset, MITRE ATT&CK alignment).

A threat model artifact:
- Provides input to the Recommendation 2 pentest engagement (saves vendor scoping time)
- Becomes the document a regulator references during NDPA audit
- Surfaces second-order risks the team has habituated to

**Why deferred (in Build phase):** Lower marginal value during pre-field; higher value once Epic 10 third-party API exposure begins (consumer keys, scoped access, rate-limit bypass attempts open new attack classes).

**Recommended priority:** Q3 2026 OR before Epic 10 production rollout, whichever comes first. STRIDE-per-component is the lowest-effort framework and integrates with existing ADR/architecture documents.

**Note:** A `_bmad-output/planning-artifacts/stride-security-posture.md` file may already exist (per commit `36ccfbb` "STRIDE security posture mapping for pre-production audit"). Confirm scope and whether expansion to full threat model is warranted vs. publishing as-is.

---

## Recommendation 6 — Re-narrow SSH firewall after self-hosted runner deployment

**Severity:** Low (sshd-key-only is the primary control; firewall is defence-in-depth)
**Cost (option A):** $4/month for a tailnet-resident GH Actions runner droplet
**Cost (option B):** ₦0 — laptop-availability arrangement (Builder's laptop hosts the runner; deploys only succeed when laptop is online)
**Risk closed:** Today's `OSLRS` Cloud Firewall SSH rule sources include `0.0.0.0/0` to permit GitHub-hosted runner deploys. The primary control is sshd public-key-only auth; firewall widening is defence-in-depth. Re-narrowing to `100.64.0.0/10` (Tailscale range) + DO published infrastructure ranges (for DO Console access) is a small posture improvement.

**Why deferred (in Build phase):** Self-hosted runner introduces ops overhead that didn't justify the marginal posture gain pre-field.

**Recommended priority:** Bundled with Recommendation 1 (push-channel alerting) as part of "Year 1 post-handover Ministry IT operationalization."

**Implementation:** Story 9-9 has the design captured.

---

## Summary table — cost-prioritized

| # | Recommendation | One-time cost | Ongoing cost | Recommended timing |
|---|---|---|---|---|
| 4 | DPIA filing (NDPA) | TBD (Iris) | ₦0 | **Pre-field-survey** (compliance-mandatory) |
| 1 | Push-channel alerting | ₦5-15K | ₦500-2K/mo | Q1 post-handover |
| 2 | Boutique pentest | ₦200-300K | ₦200-300K/yr | **Pre-Transfer-Day** ideal; post-handover acceptable |
| 5 | Formal threat model | ₦0 | ₦0 | Q3 2026 / pre-Epic-10 production |
| 6 | SSH firewall re-narrow | $0-4/mo | $0-4/mo | Y1 post-handover |
| 3 | Secrets management | Minimal | $1-5/mo | Y2 post-handover or compliance-triggered |

**Total Ministry budget commitment to bring OSLRS from "field-ready B+/A-" to "Tier-1 commercial SaaS A":** ~₦300-500K one-time + ~₦7-30K/year ongoing.

That is two orders of magnitude below typical commercial-SaaS security budget for an equivalent system, and entirely manageable within Ministry IT operational allocation.

---

## What is NOT on this list — and why

The following items appear in some security frameworks but were not flagged as gaps for OSLRS specifically:

- **Multi-region failover / DR site** — single-region with snapshots + DO Spaces backups is appropriate for this scale; multi-region is a different problem domain (availability, not security).
- **DDoS mitigation beyond Cloudflare free tier** — free-tier WAF + Cloudflare proxy is solid for OSLRS's traffic profile (citizen registry, not high-frequency commercial site).
- **24/7 SOC** — overkill for OSLRS scale; relevant for institutions with 100+ employee IT departments.
- **HSM-backed key management** — required for some banking compliance regimes; not for NDPA at OSLRS's data-classification level.
- **2GB VPS upgrade** — not a security concern per se; current capacity is field-survivable per 2026-03-03 utilisation review (26% RAM at peak).

---

## Cross-reference

- **Architecture artefact:** `_bmad-output/planning-artifacts/architecture.md` (V8.2-a1 as of 2026-04-25) + ADRs 013, 015, 018, 019, 020
- **PRD:** `_bmad-output/planning-artifacts/prd.md` (V8.3 as of 2026-04-25)
- **STRIDE posture:** `_bmad-output/planning-artifacts/stride-security-posture.md` (commit `36ccfbb`)
- **Field Readiness Certificate:** `_bmad-output/planning-artifacts/epics.md` §"Field Readiness Certificate"
- **Emergency recovery runbook:** `docs/emergency-recovery-runbook.md`
- **Infrastructure / CICD playbook:** `docs/infrastructure-cicd-playbook.md`
- **Account migration tracker:** `docs/account-migration-tracker.md`
- **Transfer Protocol Schedule 1:** `docs/transfer-protocol-schedule-1-asset-enumeration.md`

---

## Builder attestation

The Builder (Awwal Lawal) confirms that during the Build/Operate phase of OSLRS:

- All zero-cost security items identified in the 2026-04-27 external assessment have been addressed (Wave 0 + Wave 1 completion target: Field Readiness Certificate signature).
- All recurring-cost items have been documented in this artefact for Ministry consideration rather than committed unilaterally during pre-handover, in accordance with D2 §6 reimbursement scope discipline.
- This document is part of the D2 §11 Transfer documentation package.

_Signed and dated at Transfer Day; this attestation is finalized when the Field Readiness Certificate is signed._
