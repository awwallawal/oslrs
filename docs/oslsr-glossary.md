# OSLRS Glossary

**Purpose:** authoritative definitions of terms used throughout the OSLRS project — system docs, Transfer Protocol, code, runbooks. Removes ambiguity for Ministry signatories, Ministry ICT operators post-Transfer, future contractors, NDPC reviewers, and any auditor reading Schedule 1.

**Read this first** if you are encountering a term used in confusing or contradictory ways across docs.

**Scope:** OSLRS-specific usage. Where a term has both general industry meaning and OSLRS-specific meaning, both are noted.

**Status:** Living document — updated as new terms enter use.
**Becomes:** Schedule 6 of D2 Transfer Protocol when finalised at Transfer Day.

---

## I. Register, Registry, Registration — the disambiguation

These four terms cause the most confusion. OSLRS uses each precisely.

### `Registry` (capital R, proper noun) — the institutional system

The **Oyo State Labour & Skills Registry**. The full institutional asset that gets transferred to the Ministry under the BOT model — software + data + processes + domain + credentials + documentation.

When a document says "the Registry will be transferred", it means the entire system as enumerated in D2 Transfer Protocol Schedule 1.

**British/Commonwealth English usage** — Nigerian English follows this. Compare: Land Registry, Companies Registry, Births Registry.

### `register` (verb) — the user action

The act of enrolling. "Register today" CTA on the homepage. "An enumerator *registers* an artisan." Implementation: Story 9-12 Public Wizard + the existing enumerator data-collection flow.

### `registration` (noun) — the act, OR the resulting status

Used in two slightly different senses:
- **The act:** "Public self-registration is delivered by Story 9-12 (FR27)."
- **The resulting status:** "Adebayo's registration is `pending_nin_capture`" — see `respondents.status` enum (per ADR-018):
  - `active` — registration complete; NIN captured
  - `pending_nin_capture` — registration started; NIN not yet provided
  - `nin_unavailable` — registration cannot complete without alternative ID
  - `imported_unverified` — record exists from secondary ingestion (e.g. ITF-SUPA Epic 11 import); not a real OSLRS-flow registration

### `register` (noun, less formal) — the underlying list

Less common in OSLRS docs but appears in compounds:
- "The labour register" — colloquial for the `respondents` table
- "Be on the register" — informal for "appear in the database"

### `registrant` — NOT used in OSLRS

We say **respondent** (see below).

### Domain-name context — separate sense

In DNS terminology (NOT OSLRS-app terminology):
- **Domain Registry** — organisation managing a TLD (Verisign for `.com`, NiRA for `.ng`)
- **Domain Registrar** — retailer that sells domain registrations to end users (Namecheap, Porkbun)
- **Registrant** — the buyer/owner of the domain

When OSLRS docs say "buy `oyoskills.com` from a registrar", that's DNS terminology, not the app sense.

---

## II. People + roles

### `respondent`
Person whose data is in the OSLRS Registry as a labour-force participant. Database: `respondents` table. Used exclusively — NEVER "user", NEVER "citizen", NEVER "registrant".

### `user`
A staff or admin actor with login credentials. Database: `users` table. Distinct from `respondent`. Includes the seven roles below + Super Admin.

### `citizen`
Common English term. Avoided in OSLRS code/docs because (a) registrant might not be a Nigerian citizen (NDPA processes lawful-residents too), (b) ambiguity with the unrelated public-facing meaning. Use `respondent` for data-subject; `user` for actor.

### Field roles (often confused)

- **Enumerator** (99 in baseline plan, 3 per LGA) — frontline data collector. Visits respondents in the field. Role string: `enumerator`. PRD FR8.
- **Supervisor** (33 in baseline plan, 1 per LGA) — manages a team of enumerators within an LGA. Role string: `supervisor`. PRD FR12. Story 4-1 Team Dashboard.
- **Data Entry Clerk** — back-office staff who digitise paper forms. Role string: `data_entry_clerk`. PRD FR20. Story 3-6 keyboard-optimised entry.
- **Verification Assessor** — state-level second-line auditor; full PII access for verification. Role string: `verification_assessor`. PRD FR15. Story 5-2 Audit Queue.

Quick disambiguation: enumerator = field; clerk = office; supervisor = oversight; assessor = audit.

### Government roles

- **Government Official** — read-only access to aggregated analytics. Role string: `government_official`. PRD FR15.
- **Public User** — self-registered respondent who additionally has a login account. Role string: `public_user`. Distinct from `respondent` (some respondents are not public_users; some public_users are not respondents — e.g., during the wizard before they submit data).
- **Super Admin** — top-level OSLRS administrator. Role string: `super_admin`. Currently 1 account; Story 9-9 subtask 7 adds a 2nd for break-glass.

---

## III. Identity / verification terms

### `NIN` — National Identity Number
11-digit ID issued by NIMC. Validated locally via Modulus 11 checksum (per Story 1-11 session note — original PRD spec was Verhoeff but real Nigerian NINs are Modulus 11).

**FR21 (refined per SCP-2026-04-22):** NIN dedupe enforced at DB layer via partial UNIQUE index `WHERE nin IS NOT NULL`. Exclusions: rows with `status` in `{pending_nin_capture, nin_unavailable, imported_unverified}` exempt from FR21.

### `BVN` — Bank Verification Number
**Explicitly excluded from OSLRS per NFR4.1** for NDPA data-minimisation. Do NOT collect, store, validate, or reference BVN anywhere in the system.

### `*346#` — USSD code
Nigerian NIMC-published USSD shortcode. Citizens dial it on a NIN-registered phone to retrieve their NIN. Surfaced in OSLRS via the `NinHelpHint` component (Story 9-12) at every NIN input + in reminder emails for `pending_nin_capture` respondents.

### `Phone`
PRD-permitted (per FR17). Stored in E.164 format post-Story `prep-input-sanitisation-layer`. Used for SMS OTP (infrastructure built but feature-flagged off; budget-gated), magic-link return-to-complete, contact reveal in marketplace.

### `PII` — Personally Identifiable Information
NDPA-defined. In OSLRS scope: NIN, full name, phone number, date of birth, photo, GPS location (sub-LGA), email. Access controls per PRD FR15 (read-access matrix). Audit logged per Epic 6.

### `respondent` vs `submission`

- A **respondent** is a person (one row in `respondents` table; deduped by NIN).
- A **submission** is a single questionnaire fill (one row in `submissions` table; multiple submissions can link to one respondent).

A respondent submits multiple submissions over time (re-survey, update). FR21 prevents multiple respondents with the same NIN; does NOT prevent multiple submissions per respondent.

---

## IV. Operations + infrastructure

### `tailnet`
A private overlay network managed by Tailscale. OSLRS tailnet has two devices: VPS `oslsr-home-app` @ `100.93.100.28` + Builder laptop `desktop-qe4lplq` @ `100.113.78.101`. Per ADR-020.

### `VPN` — Virtual Private Network
General term. In OSLRS context, usually refers to the Tailscale tailnet. Distinct from corporate VPN solutions (OpenVPN, IPsec) which OSLRS does not use.

### `Firewall` (OSLRS context)
DigitalOcean Cloud Firewall named "OSLRS". Inbound SSH rule (post 2026-04-25): `0.0.0.0/0` + `::/0` + `100.64.0.0/10`. Defence-in-depth, NOT the primary access control. Primary access control is sshd-level key-only auth (per ADR-020 + runbook §1.4).

### `sshd` vs `ssh.service` (Ubuntu naming gotcha)
- Daemon binary: `sshd`
- systemd unit on Ubuntu: `ssh.service` (NOT `sshd.service`)
- Use `sudo systemctl reload ssh` on Ubuntu, NOT `reload sshd`

### `DOTTY` / `droplet-agent`
DigitalOcean's in-droplet agent. Manages SSH-based DO Web Console connections (Console is SSH-based, not hypervisor-OOB — see runbook §1.1 + ADR-020).

### `DO Console` vs `DO Recovery Console` vs `DO Snapshot restore`
Three different break-glass paths, all at DigitalOcean dashboard:
- **DO Console** — browser-based terminal; SSH-based via DO infrastructure IPs to your droplet's port 22; depends on SSH firewall posture
- **DO Recovery Console** — boots a recovery OS image; mounts your disk; suspected to share SSH-port dependency (verify in next quarterly drill per runbook §7)
- **DO Snapshot restore** — true hypervisor-level disk operation; works regardless of SSH firewall; **only TRUE hypervisor-OOB break-glass path**

### `MagicDNS`
Tailscale feature that lets you `ssh root@oslsr-home-app` instead of `ssh root@100.93.100.28`. Enabled in OSLRS tailnet.

### `fail2ban`
Open-source intrusion prevention service. OSLRS config: default Ubuntu sshd jail (maxretry 5, bantime 10m). **Load-bearing second-line defence** post-2026-04-25 firewall amendment — sshd is the primary control, fail2ban handles repeat-offender IPs. Steady-state ban-list non-emptiness is health, not anomaly.

---

## V. BOT (Build-Operate-Transfer) terms

### `BOT` — Build-Operate-Transfer
Contract model. OSLRS BOT model: Awwal builds + operates the system; transfers complete ownership to Ministry at "Transfer Day" per D2 Transfer Protocol.

### `Builder`
The party responsible for building + operating the system before Transfer. In OSLRS context: Awwal (Lawal Awwal Akolade), Principal Consultant for Chemiroy Nigeria Limited. Per D2 §1.

### `Ministry`
The acquiring entity. In OSLRS context: Oyo State Ministry of Trade, Investment and Co-operatives. Per D2 §1.

### `Operate phase`
The period between Build completion and Transfer Day. Builder operates the system; Ministry observes / inputs. Out-of-pocket reimbursement possible per D2 §6.4.

### `Transfer Day`
The single orchestrated session (~2 hours) when ownership migrates from Builder to Ministry. Per D2 §4.

### `Transfer Acceptance Certificate`
Schedule 5 of D2 Transfer Protocol. Signed by both parties on Transfer Day to formalise the ownership change.

### `Schedule 1` — Asset Enumeration
Document at `docs/transfer-protocol-schedule-1-asset-enumeration.md`. Lists every asset transferring at Transfer Day with owner-before / owner-after columns. 52 assets across 9 categories as of 2026-04-26.

### `Methodology` (Builder-retained)
Per D2 §3.2: design patterns, BMAD workflows, ADRs, Portable Playbook, etc. **Retained by Builder** — does NOT transfer. Builder grants Ministry a perpetual royalty-free license to apply the Methodology to OSLRS (D2 §3.3).

### `D2`
Shorthand for Transfer Protocol Template (`docs/transfer-protocol-template.md`). One of the deliverables in the Awwal/Iris legal track.

### `D1` (forthcoming)
Standalone DPIA deliverable; required for NDPC filing. Iris-drafted; Ministry-filed.

### `Field Readiness Certificate (FRC)`
Per SCP-2026-04-22 §5.3.1. Six-item go/no-go gate for field-survey start. Single-page artefact; appendix to Baseline Report v2; retained at `_bmad-output/baseline-report/field-readiness-certificate.md`. As of 2026-04-26: 1/6 items complete (Tailscale).

### `Turnkey package` (handover strategy)
Per session 2026-04-26 decision. Builder provisions ALL missing project assets (oyoskills.com, project SIM, Cloudflare account) personally during Operate phase, hands complete package to Ministry at Transfer Day. Replaces earlier Ministry-Workspace-coordinated parallel-migration plan. Per Pattern 8 of Portable Playbook v1.3.

### `Canonical migration anchor` — `admin@oyoskills.com`
Per session 2026-04-26 decision. Single email forwarder address at which every project SaaS account is registered. At Transfer Day, flipping the Cloudflare Email Routing destination from Builder Gmail to Ministry-provided email migrates all SaaS account ownership in one operation. Per Pattern 7 of Portable Playbook v1.3.

---

## VI. NDPA + compliance

### `NDPA` — Nigeria Data Protection Act 2023
The Nigerian federal data-protection law. Replaces NDPR. OSLRS aims for "NDPA-aligned, DPIA filed Q2 2026" status (Iris's defensible phrasing) — NOT "NDPA compliant" (overclaim until DPIA filed).

### `NDPC` — Nigeria Data Protection Commission
The regulator. DPIA gets filed with NDPC. RoPA maintained for NDPC review.

### `DPIA` — Data Protection Impact Assessment
Required by NDPA §28 for processing operations like OSLRS. Drafted as Baseline Report Appendix H; standalone copy planned as D1. Ministry files with NDPC.

### `RoPA` — Records of Processing Activities
Required by NDPA §38. Lists each processing activity, lawful basis, retention, recipients. Maintained by Ministry post-Transfer.

### `Lawful basis`
NDPA §6 enumeration. OSLRS uses:
- `ndpa_6_1_e` — public interest / official authority (Ministry of Trade's labour-registry mandate)
- `ndpa_6_1_f` — legitimate interests (specific edge cases)
- `data_sharing_agreement` — for Story 10-5 partner-API consumers

Per-import lawful basis captured in `import_batches.lawful_basis` column (Story 11-1 schema).

### `Right to Erasure`
NDPA §34(1)(c). OSLRS implementation: respondent emails Super Admin → admin verifies identity (NIN + Phone, OR alternative path for `pending_nin_capture` records) → admin manually purges + logs in audit trail with justification. Per PRD V8.3.

### `Data Sharing Agreement (DSA)`
Story 10-5 deliverable. Legal artifact required before any partner-API consumer can be granted the `submissions:read_pii` scope. Iris + Gabe own the template.

---

## VII. Technical glossary

### `FR` / `NFR`
Functional Requirement / Non-Functional Requirement. Numbered (e.g. FR21, NFR9). Defined in PRD V8.3.

### `AC` — Acceptance Criterion
Numbered criteria in story files (e.g. AC#1, AC#2, AC#11). Each must be verifiably true before story status flips to `done`.

### `ADR` — Architectural Decision Record
Numbered (ADR-001 through ADR-020 as of 2026-04-25). Captures decisions with options-considered + decision-details + consequences. Lives in `architecture.md`.

### `SCP` — Sprint Change Proposal
Output of the BMAD `correct-course` workflow. OSLRS has 3 on file: 2026-02-05, 2026-04-04, 2026-04-22. Each routes scope changes through PM → Architect → UX → SM in sequence.

### `FRC` — Field Readiness Certificate
See V above.

### `Akintola-risk`
Composite-index missing-from-DB risk pattern. Named after a 2026 Twitter postmortem about a Nigerian fintech that lost ₦47M in 4 hours due to a missing composite index when query shape changed. Mitigated in OSLRS via Story 11-1 AC#11 (composite-index audit at projected scale) + Story 9-10 AC#4 + Story 9-11 audit-viewer-at-1M-rows. Move 4 (`prep-query-performance-gate` CI gate) explicitly PARKED.

### `pending-NIN` / `Path A`
The `respondents.status` enum value `pending_nin_capture` and the architectural decision behind it (ADR-018). Allows registration to start without NIN; respondent uses `*346#` to retrieve NIN; magic-link email returns them to complete. Story 9-12 implementation.

### `Multi-Source Registry`
Epic 11. Allows OSLRS to ingest secondary data (ITF-SUPA Oyo public artisan PDF, future MDA exports) into the canonical respondent registry with source-labelled provenance + lawful-basis-per-batch + 14-day rollback. Per ADR-018 + FR25.

---

## VIII. Project-specific abbreviations

### `OSLRS` / `OSLSR` (project codename)
The project. Stands for "Oyo State Labour & Skills Registry". Both spellings appear in the codebase (some early files use OSLSR, others OSLRS); both refer to the same project. **OSLRS is the preferred form going forward.** Used in: BMAD planning docs, code repository, internal correspondence, story names. NOT a public-facing brand.

### `oyoskills` (public brand) / `oyoskills.com` (canonical domain)
The public-facing brand for the OSLRS project. Purchased 2026-04-26 by the Builder. Used as the canonical domain for: email forwarders (`admin@oyoskills.com`, `info@oyoskills.com`, etc.), the public marketing brand, post-Story-9-2 production domain target.

**Two-tier branding:** `OSLRS` is the internal project codename (in code, BMAD artifacts, Schedule references); `oyoskills` is the public brand (on the website, in citizen-facing copy, on email signatures). Both refer to the same project. Pattern: NIMC's project is internally called MOSIP but publicly NIN.

When to use which:
- **`OSLRS`** — when referring to the project artefact, the codebase, the BMAD process, the institutional system that gets transferred at Transfer Day
- **`oyoskills`** — when referring to the public-facing service, the workforce-registry brand, the domain anchoring all email addresses

The Glossary file itself is named `oslsr-glossary.md` (using the legacy OSLSR spelling); the project codename is `OSLRS`; the public brand is `oyoskills`. Three different identifiers for the same underlying thing — context makes the reference unambiguous.

### `LGA` — Local Government Area
Administrative subdivision of a Nigerian State. Oyo State has 33 LGAs. Used in role scoping (enumerators are LGA-restricted), analytics (LGA-grouped statistics), security (LGA-scoped partner-API consumers).

### `MDA` — Ministry, Department, or Agency
Nigerian government structural term. Partner-API consumers (Epic 10) are typically MDAs (ITF-SUPA, NBS, NIMC).

### `ITF-SUPA`
Industrial Training Fund — Skill-Up Artisans Programme. Federal-government 10M-artisan training programme launched 2026. Public portal `supa.itf.gov.ng`. Provides reference data ingested by OSLRS Epic 11.

### `NBS` — National Bureau of Statistics
Federal statistics agency. Potential partner-API consumer (Epic 10).

### `NIMC` — National Identity Management Commission
Federal agency that issues NINs. Potential partner-API consumer (Epic 10) for NIN cross-verification.

### `WAT` — West Africa Time (UTC+1)
Nigerian local time. UTC+1 year-round (no DST). All session timestamps in OSLRS docs use either UTC explicitly or WAT.

### `pnpm` / `Turbo`
Project tooling. Package manager: pnpm (NEVER npx). Build orchestrator: Turbo. Per MEMORY.md.

### `Drizzle` / `Drizzle-kit`
ORM + migration tooling. Schema files at `apps/api/src/db/schema/`. **Schema files MUST NOT import from `@oslsr/types`** (Drizzle-kit compiles JS; `@oslsr/types` has no `dist/`). Inline enum constants locally with comments.

---

*Created: 2026-04-26*
*Cross-references: PRD V8.3, Architecture V8.2-a1, UX Specification V3.0, D2 Transfer Protocol Template, runbook, session notes, portable-playbook v1.3, Account Migration Tracker, Schedule 1.*
*Status: living. Will become Schedule 6 of D2 Transfer Protocol once finalised.*
