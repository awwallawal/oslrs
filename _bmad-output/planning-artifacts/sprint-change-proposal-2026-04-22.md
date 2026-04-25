# Sprint Change Proposal — 2026-04-22

**Status:** Draft pending Awwal approval
**Classification:** Major — requires PM, Architect, UX Designer, SM involvement in sequence
**Prepared via:** `bmad:bmm:workflows:correct-course` workflow, incremental mode
**Author / Facilitator:** Bob (Scrum Master)
**User:** Awwal (Principal Consultant, OSLSR)
**Prior SCPs on file:** `sprint-change-proposal-2026-02-05.md`, `sprint-change-proposal-2026-04-04.md`

---

## 1. Issue Summary

### 1.1 Problem statement

As of 2026-04-22, six interdependent scope decisions have been made during an operationally triggered working session without corresponding updates to the canonical planning artefacts (PRD, Architecture, UX Specification, Epics). The decisions add two new epics (Epic 10 API Governance, Epic 11 Multi-Source Registry), two new stories within Epic 9 (9-11 Admin Audit Log Viewer, 9-12 Public Wizard + Pending-NIN + NinHelpHint), one new parallel story (9-10 PM2 Restart-Loop Investigation), and scope expansion of Story 9-9 (infrastructure security hardening with Tailscale, SSH lockdown, OS patching, port audit, app-layer rate-limit audit, backup client-side encryption, alerting tier, log rotation, second super-admin account, activity baseline).

The FR21 duplicate-NIN policy is being **scoped, not removed** — rejection applies only when NIN is present. Submissions without NIN enter a new `pending_nin_capture` status. This is a refinement of existing policy, not an MVP change.

Without a formal Sprint Change Proposal that routes these changes to the appropriate planning-document owners (PM, Architect, UX Designer) before Story Manager (SM) creates stories, the BMAD discipline is breached and downstream implementation will proceed on verbal decisions rather than amended documentation. This risks drift, lost context in future sessions, and an unreliable audit trail at Transfer time.

### 1.2 Discovery context

The cascade unfolded in a single working session:

- Retrospective workflow invoked → pivoted when Monday 2026-04-20 incident emails surfaced (CPU Critical at 100%; Memory Warning at 82%)
- VPS investigation confirmed distributed SSH brute-force attack from 14+ IPs (Story 9-9 backlog re-validated as urgent)
- Ministry pressure for progress report surfaced → Option A Baseline Report v2 (full refresh) committed; preliminary addendum de-scoped
- ITF-SUPA PDF ingestion request surfaced → Epic 11 (Multi-Source Registry) designed
- API governance question (Epic 10) surfaced in consumer-auth design conversation
- Field-friction on NIN capture surfaced → Path A pending-NIN status model adopted over blanket NIN relaxation
- Admin audit dashboard gap confirmed in codebase read → Story 9-11 scoped
- Public wizard collapse (Story 9-12) emerged from UX comparison with ITF-SUPA screenshots
- BMAD discipline breach flagged by user → `correct-course` workflow invoked

### 1.3 Supporting evidence

| Change area | Evidence | Source |
|---|---|---|
| SSH/Tailscale hardening urgency | CPU 100% alert 2026-04-20 11:04 WAT; 14+ attacking IPs in journalctl; PM2 restart counter 916+ over 89 days | VPS investigation output (`new_err.txt`) |
| Multi-source ingestion need | ITF-SUPA public artisan PDF, 759KB, redacted phones, email typos (`gmail.vom`, `mail.com`), missing LGAs, duplicate emails | `C:\Users\DELL\Downloads\Oyo_shortlisted_artisans.pdf` |
| NIN codebase entanglement | NIN referenced in 40+ API files (fraud detection, marketplace, ID card, audit hash chain, rate-limit, session) | `grep nin apps/api/src` |
| Existing `source` column present | `apps/api/src/db/schema/respondents.ts:16` with enum `['enumerator', 'public', 'clerk']` | Codebase read |
| Submissions `source` broader | `apps/api/src/db/schema/submissions.ts:20` with enum including `'backfill'`, `'manual'` | Codebase read |
| Audit read-side UI gap | Admin sidebar has 13 items, zero for audit; backend exposes only `/api/v1/audit-logs/verify-chain` (hash-chain integrity, not listing) | `apps/web/src/features/dashboard/config/sidebarConfig.ts`, `apps/api/src/routes/audit.routes.ts` |
| Ministry report pressure | Confirmed by Awwal; Baseline Report v2 commitment | Session conversation |
| ITF-SUPA competitive / complementary | Federal 10M-artisan programme; public portal screenshots at `docs/itf_supa/*.png`; web-search summary confirms scope; three-tier registration (Artisan/Intending/Training Centre), wizard UX, beneficiaries self-service page | `docs/itf_supa/`, web search 2026-04-22 |
| Chemiroy baseline v1 | 22-chapter March 2026 report; v2 new-file commitment | `_bmad-output/baseline-report/BASELINE-STUDY-REPORT-COMPLETE.md` |
| Prior SCP pattern | Two prior SCPs on file | `_bmad-output/planning-artifacts/` |

---

## 2. Impact Analysis

### 2.1 Epic impact

**Epic 9 (Platform Polish, Profile & Domain Migration) — scope expansion**

- **Story 9-9** Infrastructure Security Hardening — expanded scope:
  - Tailscale VPN + SSH lockdown (primary, domain-independent)
  - OS patching + scheduled monthly reboots (47 pending updates + kernel)
  - Public port audit (`ss -tlnp`; close/restrict Portainer)
  - App-layer rate-limit audit on `/auth/*` endpoints
  - Backup client-side encryption (AES-256 pre-S3)
  - Incident-response tier for CRITICAL alerts (SMS/WhatsApp/paged)
  - Logrotate for PM2 logs + journalctl retention
  - Second super-admin account (break-glass)
  - SOC-style activity baseline / SSH log differentiation
  - Cloudflare WAF/CDN + rate-limiting (domain-gated; proceed when `oslrs.com` lands)
  - Incident report for 2026-04-20 attack appended as Evidence
- **Story 9-10** (new) PM2 Restart-Loop Investigation & Stabilisation — independent, parallelisable
- **Story 9-11** (new) Admin Audit Log Viewer — prerequisite for Epic 10 PII scope release
- **Story 9-12** (new) Public Wizard + Pending-NIN + NinHelpHint + Magic-Link Email — field-survey UX readiness
- **Story 9-8** (in-progress) CSP nginx rollout — unchanged, continues
- **Stories 9-2, 9-4** remain deferred (domain-blocked)

Epic 9 goal statement refresh: from "Platform polish + domain migration" to "Platform polish + domain migration + security hardening + field-survey UX readiness + admin audit visibility prior to transfer".

**Epic 10 (new) — API Governance & Third-Party Data Sharing**

6 stories covering partner API substrate:

- **10-1** Consumer Authentication Layer (expanded scope per Awwal's decision):
  - Scoped API keys (not OAuth2, not mTLS)
  - 5 initial scopes (`aggregated_stats:read`, `marketplace:read_public`, `registry:verify_nin`, `submissions:read_aggregated`, `submissions:read_pii`)
  - LGA-scoping per key (via `api_key_scopes` join table)
  - IP allowlist per key
  - Time-bounded per-scope grants
  - 180-day rotation with 7-day overlap
- **10-2** Per-Consumer Rate Limiting & Quotas (Redis-backed, per-scope)
- **10-3** Consumer Admin UI (3-tab detail view: Identity / Access / Permissions)
- **10-4** Developer Portal (public `/developers` page, OpenAPI/Swagger UI, request-access form)
- **10-5** Data-Sharing Agreement Template + Consumer Onboarding SOP (legal artifact, Iris + Gabe)
- **10-6** Consumer Audit Dashboard (extends audit infrastructure, uses Story 9-11's viewer foundation)

**Epic 11 (new) — Multi-Source Registry & Secondary Data Ingestion**

4 stories:

- **11-1** Schema Foundation (already drafted at `_bmad-output/implementation-artifacts/11-1-multi-source-registry-schema-foundation.md`; will be regenerated via `create-story` after `epics.md` updates):
  - Nullable NIN with partial unique index (`UNIQUE WHERE nin IS NOT NULL`)
  - `status` enum (`active`, `pending_nin_capture`, `nin_unavailable`, `imported_unverified`)
  - Extended `source` enum (`imported_itf_supa`, `imported_other`)
  - `external_reference_id`, `import_batch_id`, `imported_at` columns
  - `import_batches` table
  - Service-layer FR21 scoping (preserved for NIN-present submissions)
- **11-2** Import Service + PDF/CSV/XLSX Parsers + Dry-Run/Confirm/Rollback endpoints
- **11-3** Admin Import UI (Super Admin sidebar item; upload form; dry-run preview; batch history)
- **11-4** Source Badges + Filter Chips (across Registry Table, Respondent Detail, Marketplace cards, Assessor Queue)

### 2.2 Story impact

| Story | Nature of impact |
|---|---|
| **9-9** | Scope expansion (10 tasks from the original Cloudflare-only scope) |
| **9-10** | New |
| **9-11** | New |
| **9-12** | New |
| **11-1, 11-2, 11-3, 11-4** | New |
| **10-1 through 10-6** | New |
| **prep-input-sanitisation-layer** | New prep task (pre-field-survey; normalise email, phone, name, date, trade) |
| **Staff wizard step-indicator polish** | Minor UX polish; slotted as a prep task, not a full story |

### 2.3 Artifact conflicts

#### PRD (`_bmad-output/planning-artifacts/prd.md`, V7.8)

Sections requiring amendment and their line references (approximate):

| Section | Line | Action |
|---|---|---|
| FR21 (duplicate NIN) | ~181, changelog ~88 | Scope to "reject duplicate NIN **when NIN is present**"; document `pending_nin_capture` / `imported_unverified` exclusions |
| FR5 (mandatory NIN at public registration) | ~102 | Soften to "shall prompt for NIN; if unavailable at submission, record may be saved as `pending_nin_capture` with completion path" |
| NFR8.1 (DB unique on NIN) | ~181 | Update to "**partial** UNIQUE index on `nin` WHERE `nin IS NOT NULL`" |
| Right to Erasure verification (NIN + Phone) | ~499 | Add alternative verification for NIN-absent records (phone + DOB + LGA match) |
| Epic List | ~293 | Add Epic 10, Epic 11 |
| Technical Assumptions | ~232 | Add: Tailscale VPN access; nullable-NIN; magic-link email (primary); SMS OTP infra-only; multi-source ingestion; partner API |
| Changelog | ~88 | New V7.9 entry covering all SCP changes |

New functional/non-functional requirements to add:

| ID | Summary | Owner |
|---|---|---|
| **FR24** | Partner API via scoped keys (rate limits, LGA scoping, IP allowlist, time-bound scopes, audit-logged) | Epic 10 |
| **FR25** | Secondary-data ingestion (PDF/CSV/XLSX) with source-labelled records, batch lawful-basis, dry-run preview, 14-day rollback | Epic 11 |
| **FR26** | Super-admin audit-log viewer (search, filter, paginate, export) | Story 9-11 |
| **FR27** | Public self-registration single-wizard with deferred authentication (email magic-link primary, SMS OTP infra-only) | Story 9-12 |
| **FR28** | Deferred-NIN capture via `pending_nin_capture` status; `*346#` retrieval hint at NIN input + in reminder notifications | Story 9-12 |
| **NFR9** | Production SSH restricted to Tailscale overlay network; key-only auth; public SSH disabled | Story 9-9 |
| **NFR10** | Partner API tokens as SHA-256 hashes; plaintext shown once at provisioning; 180-day rotation default | Epic 10 |

#### Architecture (`_bmad-output/planning-artifacts/architecture.md`, 4398 lines)

Section amendments:

| Section | Line | Action |
|---|---|---|
| Data Architecture | ~410 | `respondents` nullable NIN + new columns; `import_batches`; `api_consumers` + `api_keys` + `api_key_scopes` |
| Data Routing & Ownership Matrix | ~450 | Partner-API consumer flows; import batch flow |
| Authentication & Security | ~625 | API key middleware; magic-link email; SMS OTP (gated); Tailscale SSH |
| API Design & Documentation | ~919 | `/api/v1/partner/*` namespace; scope taxonomy; error semantics |
| Observability | ~1369 | Audit log consumer_id principal; viewer surface; consumer activity dashboard |
| ADR-013 Reverse Proxy | ~1900 | Append Tailscale SSH architecture |
| ADR-015 Public User Registration | ~2371 | Rewrite for wizard + magic-link + pending-NIN |
| Security Patterns | ~3445 | API-key-hash pattern; per-consumer Redis rate-limit keying; timing-safe comparison |
| Pattern Category 5 Communication | ~3233 | consumer_id logging pattern; audit principal-exclusive check |

New ADRs to author:

- **ADR-018** Multi-Source Registry & Pending-NIN Status Model
- **ADR-019** API Consumer Authentication Model
- **ADR-020** Tailscale Access Architecture

#### UX Specification (`_bmad-output/planning-artifacts/ux-design-specification.md`, 5226 lines)

Section amendments:

| Section | Line | Action |
|---|---|---|
| Journey 2: Public Respondent Self-Registration | ~2422 | Rewrite for single wizard flow (4-hop → 5-step) with trust badges, magic-link, pending-NIN |
| Form Patterns | ~3587 | Add NinHelpHint component spec; email-typo detection; pending-NIN checkbox |
| Progress Patterns | ~3636 | Visible step-indicator pattern |
| Navigation Patterns | ~3677 | Super-admin sidebar: Audit Log + Import Data items |
| Component Strategy — Custom | ~2837 | Add NinHelpHint, SourceBadge, ImportDryRunPreview, AuditLogFilter, ApiConsumerScopeEditor, LawfulBasisSelector |
| Rate Limiting UX Patterns | ~4451 | Partner API rate-limit messaging |
| NDPA Compliance Checklist | ~5202 | Pending-NIN status implications; multi-source lawful-basis; per-scope DSA precondition |

New user journeys to author:

- **Journey 5** Super-Admin Data Import
- **Journey 6** Super-Admin Audit Log Investigation
- **Journey 7** Super-Admin API Consumer Provisioning
- **Journey 8** Public User Return-to-Complete via Magic Link

#### Other artifacts

| Artifact | Action | Owner |
|---|---|---|
| `sprint-status.yaml` | Add Epic 10, Epic 11 keys; 9-10/9-11/9-12 story keys; Epic 10/11 story keys; prep-input-sanitisation key; 2026-04-22 comment block | Bob |
| `.github/workflows/ci-cd.yml` | Migration step coverage for Epic 11 partial unique index | Dev |
| `docs/infrastructure-cicd-playbook.md` | Append Tailscale section (Phases 0–8); SSH lockdown runbook; DO Console break-glass procedure | Dev |
| `docs/team-context-brief.md` | Session reassembly notes for pending-NIN / multi-source / API governance | Bob |
| Baseline Report Appendix H DPIA | Update for pending-NIN + multi-source + partner API processing activities; erasure path for NIN-absent records | Iris / Gabe |
| Deliverable Commitment Matrix | New artefact: locks every v2 report claim to implementation state; submission gate | Fiona / Awwal |
| DPIA (D1 standalone) | Draft aligned to new design decisions | Iris |
| Transfer Protocol (D2) | Already drafted at `docs/transfer-protocol-template.md`; Schedule 1 to enumerate API consumer credentials + import_batches data | Iris |

### 2.4 Technical impact

- **Database migration** — Nullable NIN + partial unique index + CHECK constraint on status enum + 3 new tables (`import_batches`, `api_consumers`, `api_keys`) + join table (`api_key_scopes`) + 4 new columns on respondents + 1 new column on audit_logs. Single Drizzle migration preferred, with manual SQL overrides for the partial unique index dance.
- **Service layer** — `SubmissionProcessingService` NIN dedupe wrapped in NIN-presence conditional; new `ImportService`; new `ApiKeyAuthMiddleware`; new `requireScope` helper; new `MagicLinkService`.
- **Infrastructure** — Tailscale install on VPS + laptop + phone; DO Cloud Firewall rule restrict SSH to `100.64.0.0/10`; sshd key-only; fail2ban.
- **CI/CD** — Migration application order; Drizzle push vs generate semantics respected.
- **Test suite** — Baseline 4,191 tests; +minimum ~80 new tests for AC coverage (schema constraints, middleware branches, import flows, wizard, pending-NIN paths).

---

## 3. Recommended Approach

### 3.1 Selected path — Hybrid

**Option 1 (Direct Adjustment) primary + Option 3 (PRD refinement) secondary.**

- Modify Epic 9 scope; add Epics 10 and 11 as net-new
- Refine FR21 (scoping, not removal); no MVP reduction
- Sequential documentation flow: PRD → Architecture → UX → Epics → Stories → Dev → Review

### 3.2 Rationale

1. **Implementation effort** — Option 1 accommodates the trigger cascade's additive + refining shape; no do-over required
2. **Technical risk** — All three new documents already architecturally sketched; Story 11-1 drafted as reference; API consumer design brief already in `docs/`
3. **Team momentum** — Existing Epic 9 work (9-8, 9-2/9-4) undisturbed
4. **Long-term sustainability** — Epic 10 (governance) and Epic 11 (multi-source) are Transfer-phase prerequisites; building now while Awwal owns codebase is safer than successor-maintained
5. **Stakeholder expectations** — Ministry progress-report pressure satisfied by Baseline v2 gated by Deliverable Commitment Matrix; federal ITF-SUPA context validates Epic 11

### 3.3 Effort, risk, and timeline

| Dimension | Assessment |
|---|---|
| PRD amendment | Low effort, Low risk |
| Architecture amendment + 3 new ADRs | Medium effort, Low risk |
| UX amendment + 4 new journeys + component specs | Medium effort, Low risk |
| Epic 9 additions (4 stories) | High effort (implementation), Medium risk (field-survey window tight) |
| Epic 10 (6 stories) | High effort, Medium risk |
| Epic 11 (4 stories) | Medium-High effort, Low-Medium risk |
| prep-input-sanitisation-layer | Low effort, Low risk |
| Baseline Report v2 | Medium effort (contingent on implementation completion) |
| **Aggregate** | **High-Medium effort, Medium risk, field-survey window tight but achievable with scope lock** |

### 3.4 Scope lock after this SCP

No additional epics, stories, or FRs may be added to this change set without a separate `correct-course` invocation. Primary risk mitigation.

---

## 4. Detailed Change Proposals

### 4.1 Story changes

#### Story 9-9 (scope expansion)

```
Story: 9-9 Infrastructure Security Hardening
Section: Scope / Tasks

OLD (current draft per sprint-status comment):
  Full security posture assessment (B+ grade) + 6 tasks:
  P0 Cloudflare WAF/CDN, P0 CF rate limiting, P1 secrets runbook,
  P2 alerting dashboard, P2 automated vuln scanning

NEW:
  10 tasks covering:
  1. Tailscale VPN + SSH lockdown (primary, domain-independent)
     - Tailscale install on VPS + laptop + phone
     - DO Cloud Firewall: restrict 22/tcp to 100.64.0.0/10
     - sshd_config: PermitRootLogin prohibit-password, PasswordAuthentication no
     - fail2ban install + config
     - DO Console documented as break-glass
  2. OS patching + scheduled monthly reboots
  3. Public port audit (ss -tlnp); close Portainer external exposure
  4. App-layer rate-limit audit on /auth/* endpoints
  5. Backup client-side encryption (AES-256 pre-S3) + quarterly restore drill
  6. Incident-response tier for CRITICAL alerts (SMS/WhatsApp/paged)
  7. Logrotate for PM2 logs + journalctl retention
  8. Second super-admin account (break-glass)
  9. SOC-style activity baseline / SSH log differentiation
  10. Cloudflare WAF/CDN + rate-limiting (domain-gated; proceed when oslrs.com lands)
  + Incident 2026-04-20 report appended as Evidence

Rationale: Monday 2026-04-20 brute-force attack evidenced that SSH lockdown
is the P0 issue, not Cloudflare (which is domain-gated). Tailscale selected
over Cloudflare Zero Trust Tunnel for zero-config rotating-IP handling.
```

#### New Story 9-10

```
Story: 9-10 PM2 Restart-Loop Investigation & Stabilisation
Status: backlog (create after SCP approval)
Goal: Investigate PM2 restart counter of 916+ over 89 days uptime; identify
root cause (suspected ioredis reconnect churn from sec2-2 factory gaps);
apply targeted fix; verify restart count falls to near-zero over 7-day
observation window.
Dependencies: none (fully parallelisable with 9-9)

Additional AC (Akintola-risk mitigation, Move 2):
AC#4 — EXPLAIN ANALYZE audit of top 10 most-invoked endpoints:
  - Parse pino/PM2 logs over the past 30 days to identify the 10 most-invoked
    API endpoints by request count (SQL query extraction from service layer
    for each).
  - For each endpoint, capture EXPLAIN (ANALYZE, BUFFERS) against the seeded
    500K-respondent + 1M-submission + 100K-audit-log dataset produced by
    Story 11-1 Task 2.5 (same seeder; reuse the scratch DB).
  - Any plan showing Seq Scan on a table >100K rows OR total cost >10,000 is
    flagged. For each flagged query, either:
      (a) Add required composite index in this story's migration, OR
      (b) Route as follow-up to the endpoint's owning epic/story, documented
          in Dev Notes with explicit hand-off.
  - Output: apps/api/src/db/explain-reports/9-10-top-endpoints.md committed
    with this story.
  - Note: this AC depends on Story 11-1 having landed (seed script exists).
    If 9-10 starts before 11-1 completes, use docker-compose scratch DB and
    manual seeding. Prefer running 9-10 audit after 11-1 merge.
```

#### New Story 9-11

```
Story: 9-11 Admin Audit Log Viewer
Status: backlog (create after SCP approval)
Goal: Expose existing write-side audit infrastructure (Epic 6) via super-admin
UI. List + filter + paginate audit logs by principal (user OR consumer),
action, target resource, time range. Required before Epic 10 PII-scope
consumer API release.
Dependencies: Epic 6 audit write infrastructure (done); Story 11-1 seed
  infrastructure (for AC#X scale verification)
Unblocks: Epic 10-1 DPIA credibility gate
Sidebar: add "Audit Log" nav item for super_admin role

Additional AC (Akintola-risk mitigation, Move 3):
AC#X — Audit viewer performance at projected scale:
  - Seed 1,000,000 audit_logs rows using the Story 11-1 seeder (reuse the
    same scratch DB if possible; re-seed if needed).
  - Verify: list query p95 < 500ms with any single filter applied;
    list query p95 < 800ms with two filters combined; pagination remains
    constant-time (offset + fetch plan stable at page 1, 100, 1000).
  - Verify required composite indexes are added in this story's migration:
      CREATE INDEX idx_audit_logs_actor_created_at
        ON audit_logs(actor_id, created_at);
      CREATE INDEX idx_audit_logs_target_created_at
        ON audit_logs(target_resource, target_id, created_at);
      CREATE INDEX idx_audit_logs_action_created_at
        ON audit_logs(action, created_at);
  - Capture EXPLAIN (ANALYZE, BUFFERS) for each of the main filter
    combinations into apps/api/src/db/explain-reports/9-11-audit-viewer.md.
  - If any filter combination fails the 500ms/800ms threshold, either add
    further indexes in this story OR document the failure and propose
    materialised-view follow-up in Dev Notes.
```

#### New Story 9-12

```
Story: 9-12 Public Wizard + Pending-NIN + NinHelpHint + Magic-Link Email
Status: backlog (create after SCP approval and 11-1 schema migration)
Goal: Collapse current 4-hop public registration (register → login → form →
submit) into single 5-step wizard with:
  - Trust badges at bottom (SUPA-inspired)
  - Consent captured at step 3 (not end)
  - Optional login setup at end (email magic-link primary; password fallback)
  - pending_nin_capture option with *346# inline hint
  - NinHelpHint shared component (inline, tooltip, banner variants)
  - Email magic-link authentication (primary)
  - SMS OTP infrastructure built but inactive (budget-gated)
  - Staff activation wizard step-indicator visibility polish (bundled prep task)
Dependencies: Story 11-1 schema foundation (status enum)
Unblocks: field-survey UX readiness
```

#### New Epic 11 stories

```
Epic 11: Multi-Source Registry & Secondary Data Ingestion
Goal: Enable ingestion of secondary data sources (ITF-SUPA and future MDAs)
into the canonical respondent registry with source-labelled provenance,
batch-level lawful-basis documentation, and rollback capability — without
creating a parallel registry.

Story 11-1: Multi-Source Registry Schema Foundation
  (draft exists at _bmad-output/implementation-artifacts/; regenerate via
   create-story after epics.md landing)

Story 11-2: Import Service + PDF/CSV/XLSX Parsers + Endpoints
  - POST /api/v1/admin/imports/dry-run (multipart upload; preview JSON)
  - POST /api/v1/admin/imports/confirm (transaction; lawful-basis required)
  - POST /api/v1/admin/imports/:id/rollback (14-day window; soft-delete)
  - GET /api/v1/admin/imports, GET /api/v1/admin/imports/:id (batch history)
  - ITF-SUPA source config as first reference implementation
  - Auto-skip policy on email/phone match (per Awwal's decision)
  - Fraud + marketplace pipelines excluded for NIN-null rows (per Path A)

Story 11-3: Admin Import UI
  - Super Admin sidebar: new "Import Data" nav item
  - Upload form → dry-run preview → confirm → batch history
  - Per-source column mapping display
  - Match-candidate display with confidence scores
  - Lawful-basis capture (required)

Story 11-4: Source Badges + Filter Chips
  - SourceBadge component wired into Registry Table, Respondent Detail,
    Marketplace cards, Assessor Queue
  - Source filter chip (multi-select) on Registry page
  - Trust-level semantics: field_verified > clerk_entered > self_registered >
    imported_cross_referenced > imported_unverified
```

#### New Epic 10 stories

```
Epic 10: API Governance & Third-Party Data Sharing
Goal: Establish authenticated, scoped, rate-limited, audit-logged partner
API for third-party MDA access (ITF-SUPA, NBS, NIMC, future integrations).

Story 10-1: Consumer Authentication Layer (expanded scope)
  - Scoped API keys (not OAuth2)
  - 5 initial scopes (see PRD FR24)
  - LGA-scoping per key (api_key_scopes join table)
  - IP allowlist per key (allowed_ip_cidrs TEXT[])
  - Time-bounded per-scope grants (scope expires_at)
  - 180-day rotation + 7-day overlap
  - Keys stored as SHA-256 hashes; plaintext shown once
  - Design brief: docs/epic-10-1-consumer-auth-design.md (already drafted)

Story 10-2: Per-Consumer Rate Limiting & Quotas (Redis, per-scope)
Story 10-3: Consumer Admin UI (3-tab: Identity, Access, Permissions)
Story 10-4: Developer Portal (public /developers; OpenAPI/Swagger; request-access form)
Story 10-5: Data-Sharing Agreement Template + Consumer Onboarding SOP (Iris + Gabe)
Story 10-6: Consumer Audit Dashboard (builds on Story 9-11 viewer)

Provisioning policy (post-Transfer): Ministry ICT lead with two-person
approval required for submissions:read_pii scope (per Awwal's decision).
```

#### New prep task

```
Prep Task: prep-input-sanitisation-layer
Goal: Centralised normalisation utilities (email, Nigerian phone, name, date,
trade) applied at every input boundary (submission, import, registration,
staff). Prevents field-survey data-cleaning overhead (email typos like
"gmail.vom" seen in ITF-SUPA PDF). Schema strengthening: date_of_birth
TEXT → DATE; phone with CHECK; back-fill script for existing rows.
Slot: before field survey execution.
```

#### Parked — named but not in this SCP's scope (Move 4)

```
Parked Item: prep-query-performance-gate
Status: PARKED. Not in scope of this SCP; flagged for the next epic planning
cycle or a subsequent correct-course invocation.
Goal (when promoted): CI job that runs EXPLAIN (ANALYZE, BUFFERS) on queries
touched in PRs against a seeded 500K-respondent + 1M-submission + 1M-audit-log
scratch DB. Fail the build on:
  - Seq Scan on any table >100K rows
  - Plan cost >10,000 for any query
  - Execution time >500ms p95 for any query
Infrastructure: reuses apps/api/src/db/seed-projected-scale.ts from Story 11-1;
requires a persistent scratch Postgres in CI (GitHub Actions service container
or self-hosted runner); requires a SQL-extraction step that parses PR diff
for new/modified raw-SQL and Drizzle query paths.
Rationale for parking: CI infrastructure lift not time-justified before field
survey. The three in-scope moves (Stories 11-1 AC#11, 9-10 AC#4, 9-11 AC#X)
cover the critical queries pre-field. CI gate becomes a regression-prevention
improvement, which is a post-field concern.
Owner when promoted: TBD — likely Charlie during a post-field retro.
```

### 4.2 PRD modifications

See Section 2.3 PRD subsection. Key amendments:

- FR21 scoping (partial reject, not total)
- FR5 soften NIN mandatory language
- NFR8.1 partial-unique-index terminology
- Epic List adds 10, 11
- New FRs 24–28, new NFRs 9–10
- Changelog V7.9

### 4.3 Architecture modifications

See Section 2.3 Architecture subsection. Key amendments:

- Data Architecture schema section updates
- Authentication & Security additions (API key, magic-link, Tailscale)
- ADRs 018, 019, 020 new

### 4.4 UI/UX modifications

See Section 2.3 UX subsection. Key amendments:

- Journey 2 rewrite (single-wizard flow)
- 4 new journeys (5–8)
- 6 new custom components
- NDPA checklist update

---

## 5. Implementation Handoff

### 5.1 Scope classification

**Major** — fundamental replan required involving PM, Architect, UX Designer, then SM, then Dev, then code-review.

### 5.2 Handoff plan

Sequential, not parallel:

1. **John (PM)** — `bmad:bmm:agents:pm`. Amend `_bmad-output/planning-artifacts/prd.md` per Section 2.3 PRD list. Add FRs 24–28, NFRs 9–10. Update Epic List. Refresh FR21 wording. Changelog V7.9 entry. Output: PRD V7.9.

2. **Winston (Architect)** — `bmad:bmm:agents:architect`. Amend `_bmad-output/planning-artifacts/architecture.md` per Section 2.3 Architecture list. Author ADRs 018, 019, 020 as new subsections. Output: architecture.md revision.

3. **Sally (UX Designer)** — `bmad:bmm:agents:ux-designer`. Amend `_bmad-output/planning-artifacts/ux-design-specification.md` per Section 2.3 UX list. Author Journeys 5–8. Specify 6 new custom components with states, accessibility, interaction. Update NDPA Compliance Checklist. Output: UX specification revision.

4. **PM + Architect joint** — `bmad:bmm:workflows:create-epics-and-stories`. Generate formal Epic 10 + Epic 11 sections in `_bmad-output/planning-artifacts/epics.md`. Update Epic 9 section with 9-10/9-11/9-12 additions and 9-9 expanded scope. Output: epics.md revision.

5. **Bob (SM)** — `bmad:bmm:agents:sm`, workflow `create-story`. Create story files in `_bmad-output/implementation-artifacts/`:
   - `9-10-pm2-restart-loop-investigation.md`
   - `9-11-admin-audit-log-viewer.md`
   - `9-12-public-wizard-pending-nin-magic-link.md`
   - `11-1-multi-source-registry-schema-foundation.md` (regenerate from existing draft)
   - `11-2-import-service-parsers.md`
   - `11-3-admin-import-ui.md`
   - `11-4-source-badges-filter-chips.md`
   - `10-1-consumer-auth-expanded.md` (expand existing draft scope)
   - `10-2-consumer-rate-limiting.md`
   - `10-3-consumer-admin-ui.md`
   - `10-4-developer-portal.md`
   - `10-5-data-sharing-agreement.md`
   - `10-6-consumer-audit-dashboard.md`
   - `prep-input-sanitisation-layer.md`
   - Expanded Story 9-9 file (revise existing draft per new scope)

6. **Bob (SM)** — Update `_bmad-output/implementation-artifacts/sprint-status.yaml` with new entries and 2026-04-22 comment block.

7. **Dev agents** — `bmad:bmm:agents:dev`, workflow `dev-story` per story. Priority order:
   - Tailscale hardening (9-9 P0 task subset) — Awwal hands-on with Charlie coaching
   - Story 9-10 PM2 investigation
   - Story 11-1 Schema foundation
   - Story 9-11 Admin Audit Log Viewer
   - Story 9-12 Public Wizard
   - Story 10-1 Consumer Auth (expanded)
   - Remainder 11-2/11-3/11-4 and 10-2..10-6 in parallel
   - `prep-input-sanitisation-layer`
   - 9-9 remaining tasks (OS patching, port audit, backups, etc.)
   - 9-8 CSP rollout continues in parallel
   - 9-9 Cloudflare when domain lands

8. **Dev or dedicated reviewer** — code-review workflow per established pattern (before commit, on uncommitted working tree).

9. **Iris / Gabe (parallel track)** — DPIA (D1) draft, Baseline Report Appendix H update, Transfer Protocol (D2) legal review.

10. **Awwal** — Commission external pen-test (C1), DPIA review (C2), external evaluation (C3) as budget permits; external labels if not commissioned.

11. **Awwal** — Initiate Baseline Report v2 drafting ONLY after implementation completion verified against Deliverable Commitment Matrix.

### 5.3 Success criteria

- All planning docs (PRD, Architecture, UX, Epics) amended with V7.9 / revision markers
- All new stories filed with status `ready-for-dev`
- sprint-status.yaml reflects new structure
- All `status=done` stories verifiable against AC
- Test suite green at each PR; baseline maintained and grows with new ACs
- Code review findings resolved per each story per existing three-layer quality pattern
- Deliverable Commitment Matrix verifies before Baseline v2 submission

### 5.3.1 Field Readiness Certificate — six-item go/no-go gate

Field survey commences only after ALL six items are verified true. The
Certificate is the single-page artefact attached as an appendix to Baseline
Report v2 and retained in `_bmad-output/baseline-report/field-readiness-certificate.md`.

  1. Tailscale live (Story 9-9 subset) + SSH public port closed
  2. Story 11-1 schema + Akintola-risk composite indexes (AC#11) merged
  3. Story 9-12 Public Wizard + Pending-NIN + NinHelpHint + Magic-Link Email live
  4. prep-input-sanitisation-layer merged
  5. Alerting tier with at least one push channel (Story 9-9 subset) live
  6. Operations Manual enumerator-section (D4 subset) drafted and printed

Tier B items (Stories 9-10, 9-11, DPIA filing, backup encryption, OS patching)
can ship during the first weeks of field operation without blocking start.

Epic 10 (API Governance) and Epic 11 Stories 11-2/11-3/11-4 can ship
post-field.

### 5.4 Dependencies and blockers

- **Tailscale Phase 0–8** — Awwal hands-on, currently unexecuted; blocks 9-9 completion
- **Domain purchase (`oslrs.com`)** — blocks 9-2, 9-4, 9-9 Cloudflare subtask
- **External commissions (C1/C2/C3)** — contingent on Ministry budget
- **Ministry counter-signature of Transfer Protocol** — blocks formal Transfer phase start

### 5.5 Risk register additions (for architecture document)

- **R-29** SSH brute-force exposure (mitigated by 9-9 Tailscale)
- **R-30** PM2 restart instability (mitigated by 9-10 investigation)
- **R-31** Ingestion lawful-basis drift across sources (mitigated by per-batch `lawful_basis` column; DPIA reviews)
- **R-32** API consumer key compromise (mitigated by 180-day rotation + IP allowlist + scope minimisation)
- **R-33** Pending-NIN records stale indefinitely (mitigated by N-day reminder + supervisor review workflow in Story 9-12)
- **R-34** Baseline Report v2 submitted before implementation complete (mitigated by Deliverable Commitment Matrix + Awwal personal gate)

---

## 6. Approval and Execution

**Awwal's explicit confirmations obtained during this session:**

- Section 1 (trigger / problem statement / evidence) — approved
- Section 2 (epic impact assessment) — approved
- Section 3 (artifact conflicts — PRD / Architecture / UX / other) — approved ([a all])
- Section 4 (path forward — Hybrid Option 1 + Option 3 refinement) — approved
- Scope lock after this SCP — confirmed
- No rollback — confirmed
- MVP intact — confirmed
- Baseline Report v1 untouched; v2 as new file — confirmed
- MEMORY.md not updated this session — confirmed

**Final approval for execution:** pending (this is the final approval gate; Section 5 below requests explicit yes/no).

---

## 7. Completion Log

Running tally of work landed against this SCP. Populated as each item completes, ahead of or during Bob's formal `create-story` pass. Each entry cross-references the detailed evidence.

### 7.1 Completed items

| Date | Item | Scope | Evidence / detailed record |
|---|---|---|---|
| **2026-04-23** | **Story 9-9 — Tailscale + SSH hardening subtask (P0)** | (a) Tailscale overlay network installed on VPS + laptop; (b) `/root/.ssh/authorized_keys` updated (2 keys: `github-actions-deploy` + personal); (c) sshd hardened (`PasswordAuthentication no` enforced in main + both drop-ins; `PermitRootLogin prohibit-password`; `PubkeyAuthentication yes`); (d) DO Cloud Firewall SSH source narrowed to `100.64.0.0/10` CGNAT range; (e) fail2ban installed + sshd jail active; (f) negative tests passed (public-IP SSH times out, key-disabled SSH refuses, Tailscale SSH succeeds without password prompt); (g) emergency recovery runbook authored at `docs/emergency-recovery-runbook.md`. | Story 9-9 Change Log entry 2026-04-23; Story 9-9 File List "Tailscale Hardening Subtask" section; `docs/emergency-recovery-runbook.md` |

### 7.2 Outstanding items on Field Readiness Certificate (§5.3.1)

| # | Item | Status |
|---|---|---|
| 1 | Tailscale live + SSH public port closed | ✅ **Done 2026-04-23** |
| 2 | Story 11-1 schema + Akintola-risk composite indexes (AC#11) merged | ⏳ Blocked on PM → Architect → UX → Bob chain |
| 3 | Story 9-12 Public Wizard + Pending-NIN + NinHelpHint + Magic-Link Email live | ⏳ Same chain |
| 4 | `prep-input-sanitisation-layer` merged | ⏳ Same chain |
| 5 | Alerting tier with at least one push channel (Story 9-9 subset) live | ⏳ Same chain |
| 6 | Operations Manual enumerator-section (D4 subset) drafted and printed | ⏳ Gabe + Awwal |

### 7.3 Outstanding items on Story 9-9 expanded scope (§2.1)

Tailscale subtask complete; 9 subtasks remaining:

- [ ] OS patching + scheduled monthly reboots (51 pending updates + kernel 6.8.0-90 → 6.8.0-110)
- [ ] Public port audit (`ss -tlnp`; close/restrict Portainer exposure)
- [ ] App-layer rate-limit audit on `/auth/*` endpoints
- [ ] Backup client-side encryption (AES-256 pre-S3) + quarterly restore drill
- [ ] Incident-response tier for CRITICAL alerts (SMS/WhatsApp/paged)
- [ ] Logrotate for PM2 logs + journalctl retention
- [ ] Second super-admin account (break-glass)
- [ ] SOC-style activity baseline / SSH log differentiation
- [ ] Cloudflare WAF/CDN + rate-limiting (domain-gated on `oslrs.com` purchase)

### 7.4 Immediate loose ends (from runbook §6.1)

- [ ] Take DO droplet snapshot named `tailscale-hardening-complete-2026-04-23`
- [ ] Reset + save VPS root password to password manager (retry DO Console via incognito / mobile hotspot for ISP WebSocket workaround)
- [ ] Clean up `github_actions_deploy` private key from laptop (hygiene — should only live in GitHub Secrets)

### 7.5 Handoff chain status

- [x] John (PM) — amend PRD V7.8 → V8.2 per §2.3 PRD subsection _(completed 2026-04-23; versioned V8.2 because V7.9/V8.0/V8.1 already in changelog; added FR24–FR28, NFR9–NFR10, new "Identity, Access & Data Sharing" Technical Assumptions block, Epic 10 + Epic 11 in Epic List, scoped FR21, softened FR5, partial-UNIQUE-index NFR8.1, alt Right-to-Erasure verification path)_
- [x] Winston (Architect) — amend architecture.md per §2.3 Architecture subsection; author ADRs 018, 019, 020 _(completed 2026-04-25; new Decisions 1.5 / 2.4–2.8 / 3.4 / 5.3–5.5; ADR-013 Tailscale subsection appended; ADR-015 rewritten end-to-end with original preserved as Superseded; ADRs 018/019/020 authored. Pattern Categories 5 + 7 extended. Frontmatter updated with V8.2 alignment + 2026-04-25 revision marker. Three flagged scope-lock items from PRD V8.2 — FR28 cadence T+2/7/14/30, supervisor-attestation alt erasure path — architected to as PRD-canonical; flagged for Awwal review and potential Bob-time relocation.)_
- [x] Sally (UX Designer) — amend ux-design-specification.md per §2.3 UX subsection; author Journeys 5–8 _(completed 2026-04-25; Journey 2 rewritten end-to-end with original preserved as Superseded; 3 new Form Patterns; visible step-indicator Progress Pattern; super-admin sidebar additions Audit Log + Import Data; 6 custom components NinHelpHint / SourceBadge / ImportDryRunPreview / AuditLogFilter / ApiConsumerScopeEditor / LawfulBasisSelector with full anatomy/states/variants/accessibility/props; Partner-API Rate Limiting UX patterns; NDPA Compliance Checklist updated with 3 new items; Journeys 5–8 authored. Change Log V3.0. No scope-lock flags from Winston's architecture or John's PRD V8.2 — all UX implications tracked back to SCP §2.3.)_
- [ ] PM + Architect — run `create-epics-and-stories` to formalise Epic 10 + Epic 11 in `epics.md`
- [ ] Bob (SM) — run `create-story` per §5.2 item 5 list (14 stories, including Story 9-9 regeneration reflecting the completed Tailscale subtask above)
- [ ] Dev agents — implement per §5.2 item 7 priority order

---

*SCP authored 2026-04-22 via bmad:bmm:workflows:correct-course incremental mode. For execution: Awwal to invoke John (PM) in separate CLI session with this document as input, then Winston (Architect), then Sally (UX Designer), then PM+Architect run create-epics-and-stories, then Bob (SM) runs create-story per story.*

*Completion Log appended 2026-04-23 recording Tailscale + SSH hardening subtask of Story 9-9 delivered ahead of formal SCP-driven story regeneration. All other SCP scope remains as originally locked — no scope expansion, no additional items.*

---

## Appendix A — Agent Invocation Prompts

Canonical prompts for each downstream agent in the handoff chain. Paste into a new CLI session verbatim. Each prompt is self-contained and includes scope lock.

### A.1 John (PM) — PRD amendment

**Status:** ✅ Delivered 2026-04-23/24. Output: PRD V8.2 (John bumped minor version beyond the V7.9 target; spot-check his V8.2 changelog if you want to confirm no scope expansion beyond SCP §2.3).

> Load the BMM PM agent (`bmad:bmm:agents:pm`), then amend the PRD.
>
> **Inputs:**
> - `_bmad-output/planning-artifacts/sprint-change-proposal-2026-04-22.md` — authoritative change document; read Section 2.3 PRD subsection and Section 7 Completion Log in full
> - `_bmad-output/planning-artifacts/prd.md` — current V7.8, target V7.9
>
> **Task:** Amend the PRD per SCP Section 2.3 PRD subsection. Specifically:
>
> 1. **FR21 scoping refinement** — rewrite from absolute "reject duplicate NIN" to "reject duplicate NIN when NIN is present". Add explicit exclusions for `pending_nin_capture` and `imported_unverified` status values.
> 2. **FR5 softening** — change mandatory-NIN-at-registration language to "shall prompt for NIN; record may be saved as `pending_nin_capture` with `*346#` retrieval path if unavailable at submission".
> 3. **NFR8.1 terminology update** — "UNIQUE constraint on the `nin` column" → "partial UNIQUE index on `nin` WHERE `nin IS NOT NULL`".
> 4. **Right to Erasure** — add alternative identity verification path for NIN-absent records (phone + DOB + LGA match).
> 5. **Epic List** — add Epic 10 (API Governance & Third-Party Data Sharing) and Epic 11 (Multi-Source Registry & Secondary Data Ingestion) per SCP Section 2.1 definitions.
> 6. **New FRs** — add FR24 (partner API), FR25 (secondary-data ingestion), FR26 (admin audit log viewer), FR27 (public wizard with deferred authentication), FR28 (deferred-NIN capture + `*346#` hint). Text templates in SCP Section 2.3 PRD table.
> 7. **New NFRs** — add NFR9 (Tailscale-only SSH access), NFR10 (partner API token storage).
> 8. **Technical Assumptions** — add subsections for Tailscale VPN access, nullable-NIN status model, magic-link email auth (primary), SMS OTP infra-only, multi-source ingestion, partner API.
> 9. **Changelog** — author new V7.9 entry listing all changes above with 2026-04-22 date and SCP cross-reference.
>
> **Output:** PRD V7.9 saved to the same path (`_bmad-output/planning-artifacts/prd.md`).
>
> **Scope lock:** Do NOT introduce any PRD change not specified in SCP Section 2.3. No new FRs beyond 24–28. No new NFRs beyond 9–10. If SCP contradicts itself or is ambiguous, flag for Awwal rather than interpreting.
>
> **Do not modify:** Architecture doc, UX specification, epics.md (those are Winston and Sally's responsibility; John only owns prd.md).

### A.2 Winston (Architect) — Architecture amendment + ADRs 018/019/020

**Status:** ⏳ Pending invocation.

> Load the BMM Architect agent (`bmad:bmm:agents:architect`), then amend the architecture document.
>
> **Inputs:**
> - `_bmad-output/planning-artifacts/sprint-change-proposal-2026-04-22.md` — authoritative change document; read **Section 2.3 Architecture subsection** in full, and **Section 7 Completion Log** (notes which items have already been delivered so no re-scoping happens)
> - `_bmad-output/planning-artifacts/prd.md` — current V8.2, the requirements you are architecting to. FR24–28 and NFR9–10 are the new inputs; FR21 was scoping-refined.
> - `_bmad-output/planning-artifacts/architecture.md` — current file, target revision
> - `_bmad-output/implementation-artifacts/11-1-multi-source-registry-schema-foundation.md` — Story 11-1 working draft; treat as working reference for the schema changes you document, but the architecture doc is authoritative
> - `_bmad-output/implementation-artifacts/9-9-infrastructure-security-hardening.md` — Change Log 2026-04-23 records the Tailscale subtask as already delivered; architecture doc must describe the now-deployed state, not propose it
> - `docs/emergency-recovery-runbook.md` — documented operational state of the Tailscale access architecture; reference in ADR-020
>
> **Task — amend `architecture.md` per SCP Section 2.3 Architecture subsection.** Specifically:
>
> 1. **Data Architecture (~line 410)** — update `respondents` schema to document:
>    - Nullable `nin` column with **partial UNIQUE index** `respondents_nin_unique_when_present ON respondents(nin) WHERE nin IS NOT NULL` (rationale: preserves FR21 dedupe for NIN-present records; allows `pending_nin_capture` and `imported_unverified` rows; chosen over `UNIQUE NULLS NOT DISTINCT` for Postgres portability)
>    - New `status` column with CHECK constraint and values `active | pending_nin_capture | nin_unavailable | imported_unverified` (enum typed in Drizzle via `respondentStatusTypes` array)
>    - Extended `source` enum to include `imported_itf_supa`, `imported_other`
>    - New nullable columns: `external_reference_id TEXT`, `import_batch_id UUID REFERENCES import_batches(id) ON DELETE SET NULL`, `imported_at TIMESTAMPTZ`
>    - New indexes: `idx_respondents_status`, `idx_respondents_source`, `idx_respondents_import_batch`, plus the Akintola-risk composite indexes `(source, created_at)`, `(lga_id, source)`, `(status, source)`, `(status, created_at)`
>
>    Add three new tables:
>    - `import_batches` (file hash UNIQUE, lawful-basis capture, row-count stats, rollback status) — see SCP §4.1 for full DDL
>    - `api_consumers` (identity, DSA link, organisation type, status)
>    - `api_keys` (SHA-256 key hash, IP allowlist, 180-day rotation)
>    - `api_key_scopes` (per-key per-scope join table with `expires_at` and `allowed_lga_ids[]`)
>    - Extend `audit_logs` with nullable `consumer_id` column and CHECK constraint enforcing `(user_id IS NOT NULL AND consumer_id IS NULL) OR (user_id IS NULL AND consumer_id IS NOT NULL) OR (user_id IS NULL AND consumer_id IS NULL)` for system events
>
>    **Drizzle constraint reminder:** schema files must NOT import from `@oslsr/types` (drizzle-kit compiles JS and `@oslsr/types` has no `dist/`). Inline enum constants locally.
>
> 2. **Data Routing & Ownership Matrix (~line 450)** — add three new flows:
>    - Partner-API request lifecycle: middleware `apiKeyAuth` → `requireScope` → controller → audit-log with `consumer_id`
>    - Import batch lifecycle: admin upload → file-hash dedupe → parser → dry-run preview → confirm transaction → rollback window
>    - Magic-link email lifecycle: wizard submit → token issued → email sent → link click → session established (distinct from standard JWT flow)
>
> 3. **Authentication & Security (~line 625)** — new subsections documenting:
>    - **API key middleware** (`apiKeyAuth`): bearer extraction, SHA-256 lookup, revoke/expire checks, scope enforcement, timing-safe comparison via `crypto.timingSafeEqual`, error taxonomy (`API_KEY_MISSING`/`INVALID`/`REVOKED`/`EXPIRED`/`SCOPE_INSUFFICIENT`/`IP_NOT_ALLOWED`)
>    - **Magic-link email authentication** (primary for public users): one-time token, short TTL, single-use, resumes wizard at saved step
>    - **SMS OTP authentication** (secondary, infrastructure-only / budget-gated): code path exists but feature-flag disabled; document the toggle
>    - **Tailscale SSH operator access** (already deployed per SCP §7.1): reference to NFR9, operational link to `docs/emergency-recovery-runbook.md`, DO Cloud Firewall `100.64.0.0/10` rule, sshd `PasswordAuthentication no`
>    - **Ambiguous-auth rejection**: requests with both JWT and API key → 400 `AMBIGUOUS_AUTH`
>
> 4. **API Design & Documentation (~line 919)** — add `/api/v1/partner/*` namespace section:
>    - Scope taxonomy: `aggregated_stats:read`, `marketplace:read_public`, `registry:verify_nin`, `submissions:read_aggregated`, `submissions:read_pii`
>    - Error envelope consistency with existing `{ code, message, details? }` pattern
>    - Per-scope default rate limits (adjustable per-consumer via Story 10-3)
>    - DSA-precondition enforcement for `submissions:read_pii` scope assignment
>
> 5. **Observability (~line 1369)** — document:
>    - Audit log principal-exclusive CHECK constraint and how reads render both user and consumer principals in Story 9-11 viewer
>    - Consumer activity dashboard (Story 10-6) as a scoped view over audit_logs filtered by `consumer_id`
>    - Per-consumer rate-limit metrics via Redis counters keyed by `consumer_id + scope + minute`
>
> 6. **ADR-013 Reverse Proxy (~line 1900)** — append a "Tailscale Operator Access" subsection:
>    - Cross-reference ADR-020 for the full decision
>    - Note that nginx layer for API traffic is unchanged
>    - Note that Cloudflare (when domain lands) fronts public traffic; Tailscale handles operator/SSH traffic (different concern, different layer)
>
> 7. **ADR-015 Public User Registration (~line 2371)** — rewrite:
>    - Old: register → login → fill form (4 hops)
>    - New: single 5-step wizard with trust badges + consent at step 3–4 + optional login setup at end + email magic-link primary + SMS OTP infra-only (budget-gated) + `pending_nin_capture` path with `*346#` hint
>    - Document interaction with Story 11-1 status enum
>    - Migration note: existing public_user accounts continue to work; only new registrations flow through the wizard
>
> 8. **Security Patterns (~line 3445)** — add three new patterns:
>    - API-key-hash storage pattern (generate, SHA-256 hash, single-view return to super-admin, never retrievable)
>    - Per-consumer Redis rate-limit keying (key format, TTL, atomic INCR/EXPIRE)
>    - Timing-safe comparison for key lookup (why: prevent timing oracles that leak valid-vs-invalid-key distinction)
>
> 9. **Pattern Category 5 Communication (~line 3233)** — add:
>    - `consumer_id` logging pattern in Pino (parallel to existing `user_id` pattern)
>    - Audit log principal-exclusive check enforced at both service-layer and DB-CHECK layers
>
> **Author three new ADRs as new subsections of the "Key Architectural Decisions" area:**
>
> - **ADR-018: Multi-Source Registry & Pending-NIN Status Model**
>   - Decision: nullable NIN with partial unique index + `status` enum rather than (a) blanket NIN removal or (b) separate `external_beneficiaries` table
>   - Context: FR21 scoping refinement; Epic 11 ingestion need; ITF-SUPA PDF lacks NIN; field friction when respondents forget NIN
>   - Options considered: B1 (separate table, FR21 absolute), B2 (extend respondents, nullable NIN — SELECTED), B3 (synthesised placeholder NIN — rejected)
>   - Consequences: fraud and marketplace pipelines must status-gate; DPIA update needed; `*346#` hint surfaced at capture points; partial unique index preferred over `UNIQUE NULLS NOT DISTINCT` for Postgres portability
>   - Cross-refs: FR21, FR28, Epic 11, Story 9-12
>
> - **ADR-019: API Consumer Authentication Model**
>   - Decision: scoped opaque API keys (SHA-256 hash at rest) over OAuth2 client-credentials and mTLS
>   - Context: FR24 partner API; expected consumer count 3–10 MDAs; developer experience matters for MDA adoption
>   - Options considered: scoped API keys (SELECTED), OAuth2 client-credentials (deferred, door open for scale), mTLS (rejected — PKI overhead, worst DX)
>   - Consequences: per-consumer rate-limits via Redis keyed by `consumer_id + scope`; LGA-scope + IP allowlist + time-bounded scope grants as first-class features (not deferred); DSA precondition for PII scope; 180-day rotation with 7-day overlap
>   - Cross-refs: FR24, NFR10, Epic 10, Story 9-11 (audit viewer dependency)
>
> - **ADR-020: Tailscale Access Architecture**
>   - Decision: Tailscale overlay network primary + DO Console break-glass + fail2ban defence-in-depth; Cloudflare Zero Trust Tunnel and self-hosted WireGuard rejected for this tier
>   - Context: Monday 2026-04-20 brute-force attack evidence (14+ distributed IPs); NFR9 requirement; SSH lockdown needs rotating-ISP-IP tolerance; solo-dev operational simplicity
>   - Options considered: Tailscale (SELECTED), Cloudflare Zero Trust Tunnel (viable alternative if vendor consolidation with Cloudflare WAF makes sense later), self-hosted WireGuard (rejected — overkill), DO Console only (rejected — clunky for daily ops, only break-glass)
>   - Consequences: DO Cloud Firewall SSH rule restricted to `100.64.0.0/10`; sshd `PasswordAuthentication no` + `PermitRootLogin prohibit-password`; laptop `~/.ssh/config` with `IdentitiesOnly yes`; emergency recovery documented at `docs/emergency-recovery-runbook.md`; snapshot as additional break-glass; quarterly recovery drill required
>   - Cross-refs: NFR9, Story 9-9 (Change Log 2026-04-23 records as-built state)
>
> **Output:** amended `architecture.md` saved to the same path. Add a Change Log entry at the bottom (or equivalent section if one exists) noting 2026-04-24 revision with SCP cross-reference.
>
> **Scope lock:** do NOT introduce architectural changes outside SCP Section 2.3 Architecture subsection. No new ADRs beyond 018/019/020. If any section needs broader rewrite to accommodate the additions, flag for Awwal rather than proceeding. If John's PRD V8.2 introduced anything not in SCP §2.3, flag that too — architecture must align to approved scope, not to unilateral PRD changes.
>
> **Do not modify:** PRD (John's domain), UX specification (Sally's domain), epics.md (PM + Architect joint via `create-epics-and-stories` — different workflow, separate session).

### A.3 Sally (UX Designer) — UX specification amendment + Journeys 5–8

**Status:** ⏳ Pending invocation.

> Load the BMM UX Designer agent (`bmad:bmm:agents:ux-designer`), then amend the UX specification.
>
> **Inputs:**
> - `_bmad-output/planning-artifacts/sprint-change-proposal-2026-04-22.md` — authoritative change document; read **Section 2.3 UX subsection** in full, and **Section 7 Completion Log** + **Appendix A.2** (so you understand what John and Winston have already committed)
> - `_bmad-output/planning-artifacts/prd.md` — current V8.2 with FR24–28 + NFR9–10 (the user-facing requirements you are designing for)
> - `_bmad-output/planning-artifacts/architecture.md` — Winston's revision: Decisions 1.5, 2.4–2.8, 3.4, 5.3–5.5; ADR-015 rewritten; ADRs 018, 019, 020. Reference these for component contracts (e.g. `apiKeyAuth` middleware shapes the `ApiConsumerScopeEditor` component data flow)
> - `_bmad-output/planning-artifacts/ux-design-specification.md` — current file, target revision
> - `docs/itf_supa/*.png` — ITF-SUPA design screenshots; useful only for the trust-badges idea and the wizard step-indicator pattern. Do NOT clone; OSLRS is differentiated, not derivative
> - `_bmad-output/implementation-artifacts/9-9-infrastructure-security-hardening.md` — context only (Tailscale subtask is operator-side, no UX impact)
>
> **Task — amend `ux-design-specification.md` per SCP Section 2.3 UX subsection.** Specifically:
>
> 1. **Journey 2: Public Respondent Self-Registration (~line 2422) — full rewrite.**
>    - Old: register → login → form → submit (4 hops, documented abandon rate concern)
>    - New: single 5-step wizard with explicit step-indicator visibility (1 of 5, 2 of 5, …)
>    - Step contents (subject to your design judgment): Step 1 Basic Info; Step 2 Contact + LGA; Step 3 Consent (T&C + Privacy + marketplace opt-in); Step 4 Questionnaire; Step 5 Optional Login Setup (email magic-link primary; password fallback) + trust-badges row
>    - **Pending-NIN path:** at the NIN input, surface `NinHelpHint` inline + `*346#` USSD reminder. If respondent can't provide NIN, allow proceed with `status = pending_nin_capture`. Step 5 in this branch additionally surfaces "we'll email you when you can complete registration."
>    - **Magic-link return-to-complete:** if respondent leaves mid-wizard, system emails magic-link that resumes them at the saved step. Document the email body, link expiry, and "what if I lose the email" recovery path.
>    - **Trust badges (SUPA-inspired but distinct):** at the foot of every step show three badges — "Secure Registration" (lock icon), "Official Oyo State Platform" (state-logo lockup), "Free to Join" (no-cost icon). Specify the visual contract.
>    - **Migration note:** existing public_user accounts continue to work via current login; only new registrations flow through the wizard. Document the cutover messaging on the existing login page ("New here? Try the new registration wizard.").
>
> 2. **Form Patterns (~line 3587)** — add three new patterns:
>    - **`NinHelpHint` component** — variants `inline` (under input), `tooltip` (info icon hover), `banner` (full-width above field). All three carry the `*346#` retrieval text plus an "I don't have my NIN now" link that switches to `pending_nin_capture` mode.
>    - **Email-typo detection hint** — if user types `gmail.vom`, `gmial.com`, `mail.com` etc., show inline correction suggestion ("Did you mean gmail.com?"). Use a published common-typo dictionary; do not auto-correct.
>    - **Pending-NIN checkbox/toggle pattern** — explicit "I don't have my NIN with me right now" affordance, with consequence preview ("Your registration will be saved as pending; we'll email you to complete it.").
>
> 3. **Progress Patterns (~line 3636)** — add visible step-indicator pattern:
>    - 1-line breadcrumb-style "Step N of M" with completed steps clickable (back-navigation), current step highlighted, future steps disabled
>    - Used in: Public Wizard (Story 9-12), Staff Activation Wizard (existing), Admin Import Wizard (Story 11-3 — dry-run → confirm flow)
>    - Mobile responsive variant: collapse to "Step 3 / 5" text only on screens <480px
>
> 4. **Navigation Patterns (~line 3677)** — super-admin sidebar additions:
>    - Add **"Audit Log"** nav item (Story 9-11 destination) — placement: between "System Health" and "Settings" (order TBD by Sally; specify icon — e.g. `📋` or Lucide `ScrollText`)
>    - Add **"Import Data"** nav item (Story 11-3 destination) — placement: in the data-management cluster (Registry / Submissions / Imports). Specify icon (e.g. Lucide `Upload` or `Database`).
>    - Both items are super-admin-only (per existing role-isolated sidebar pattern); document the access predicate
>
> 5. **Component Strategy — Custom Components (~line 2837)** — author specs for **6 new custom components**. For each: purpose, variants, states (idle/loading/error/empty/success), accessibility (ARIA + keyboard), interaction model, sample wireframe sketches:
>    - **`NinHelpHint`** (see Form Patterns)
>    - **`SourceBadge`** — colour-coded chip indicating respondent provenance: `enumerator` (green), `clerk` (teal), `public` (blue), `imported_itf_supa` (amber), `imported_other` (grey). Sized for table-row inline display + detail-page header display
>    - **`ImportDryRunPreview`** — table+summary component for Story 11-3. Top: parse stats (rows parsed / matched / will-insert / will-skip / failures). Below: scrollable preview table of first 50 rows with column-mapping editor. Bottom: lawful-basis dropdown (required) + free-text justification + Confirm button (disabled until lawful basis selected)
>    - **`AuditLogFilter`** — filter sidebar for Story 9-11. Fields: principal-type toggle (User / Consumer / System), actor select (autocomplete), action multi-select, target-resource select, date-range picker. Reset + Apply buttons; filters carry to URL params
>    - **`ApiConsumerScopeEditor`** — for Story 10-3 admin UI. Per-scope row showing: enabled checkbox, expiry date picker (optional), LGA multi-select (optional), DSA-required badge (if scope is `submissions:read_pii` and DSA not on file). Save shows dry-run summary first
>    - **`LawfulBasisSelector`** — used in `ImportDryRunPreview` and Story 10-3 consumer creation. Dropdown with 8 NDPA-aligned options (`ndpa_6_1_a`–`ndpa_6_1_g`, `data_sharing_agreement`); each shows a tooltip with NDPA section reference. Free-text justification field underneath, required for `g` (legitimate interest) and `data_sharing_agreement`
>
> 6. **Rate Limiting UX Patterns (~line 4451)** — add partner-API consumer-facing messaging:
>    - **429 response display** — for browser-based consumer admin views (Story 10-3 + 10-4 portal), show countdown to `Retry-After` clearly
>    - **Daily quota progress bar** — per-scope progress bar visible to consumer in developer portal (Story 10-4) and to admin in Story 10-3
>    - **Per-scope vs per-consumer messaging** — when a consumer hits a per-scope cap on one scope but has headroom on another, the error message must point to the specific exhausted scope, not generic "rate limited"
>
> 7. **NDPA Compliance Checklist (~line 5202)** — update with three new line items:
>    - `pending_nin_capture` records: lawful basis path documented; right-to-erasure verification path (phone + DOB + LGA + magic-link or supervisor attestation) explicit
>    - Multi-source ingestion: per-batch lawful-basis is mandatory; DPIA Appendix H captures each source's processing activity
>    - Per-scope DSA precondition: `submissions:read_pii` scope cannot be assigned without DSA on file; UI enforces this at provisioning time
>
> **Author four new user journeys as new subsections of "User Journey Flows":**
>
> - **Journey 5: Super-Admin Data Import (Story 11-3 happy path + error paths)**
>   - Upload PDF → file-hash check → dry-run preview shows column mapping + match candidates + failures
>   - Admin reviews; selects lawful basis (mandatory); writes justification
>   - Confirm → transactional ingest → batch history view shows new entry
>   - Error paths: duplicate file (matched hash); parse failure; lawful-basis missing
>   - Rollback path: 14-day window; confirm dialog warns about effects on downstream (analytics, marketplace)
>
> - **Journey 6: Super-Admin Audit Log Investigation (Story 9-11)**
>   - Investigator arrives at Audit Log page (sidebar nav)
>   - Filter sidebar applied: "all consumer activity in last 24 hours touching `respondents` PII"
>   - Results paginated, sortable
>   - Click row → detail panel shows full event payload + before/after diff (where applicable)
>   - Export button → CSV with applied filters and timestamp; filename includes filter signature
>
> - **Journey 7: Super-Admin API Consumer Provisioning (Story 10-3)**
>   - Create new consumer → 3-tab wizard: Identity (name, contact, organisation type, DSA upload), Access (key rotation, IP allowlist, key expiry), Permissions (per-scope toggles + LGA + per-scope expiry)
>   - On save: dry-run summary modal showing "Consumer X will have Y access from Z IPs through scopes A, B, C until D" — admin confirms
>   - Token displayed exactly once with copy-to-clipboard + warning "this is the only time you'll see this token"
>   - Audit log entry created
>
> - **Journey 8: Public User Return-to-Complete via Magic Link (Story 9-12)**
>   - Respondent left wizard at Step 3 of 5; receives magic-link email
>   - Clicks link → lands on Step 3 with previously-entered data preserved
>   - For `pending_nin_capture` follow-up: lands on a dedicated "Complete your registration" view with `*346#` hint surfaced; can also choose "I still don't have my NIN — remind me later" which resets the reminder timer
>   - On NIN entry + validation: status promotes from `pending_nin_capture` to `active`; FR21 dedupe runs at this moment; notification email confirms
>
> **Output:** amended `ux-design-specification.md` saved to the same path. Add a Change Log entry near the top noting 2026-04-2X revision with SCP cross-reference (use today's actual date, not a forecast).
>
> **Scope lock:** do NOT introduce UX changes outside SCP Section 2.3 UX subsection. No new components beyond the 6 named. No new journeys beyond 5–8. If Winston's architecture or John's PRD introduced something with UX implications not covered by SCP §2.3, flag for Awwal rather than designing for it.
>
> **Do not modify:** PRD (John's domain), architecture.md (Winston's domain), epics.md (PM + Architect joint workflow), implementation-artifact stories (Bob's domain via `create-story`).

### A.4 PM + Architect joint — create-epics-and-stories

**Status:** ⏳ Pending. Invoke `bmad:bmm:workflows:create-epics-and-stories` after Sally completes. Produces formal Epic 10 and Epic 11 definitions in `_bmad-output/planning-artifacts/epics.md` and updates Epic 9.

### A.5 Bob (SM) — create-story per story

**Status:** ⏳ Pending. Invoke `bmad:bmm:workflows:create-story` once per story in §5.2 item 5 list. Story 9-9 regeneration must incorporate §7.1 completed Tailscale subtask as baseline state (not re-scope it).

### A.6 Dev agents — dev-story per story

**Status:** ⏳ Pending. Implementation priority order per §5.2 item 7.
