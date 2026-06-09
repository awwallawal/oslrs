# Story 9.50: Expiry Monitoring — TLS certs + domain registration + declared secrets (ops-dashboard countdown + alert)

Status: ready-for-dev

<!--
Authored 2026-06-09 by Bob (SM) via canonical *create-story --yolo. BROADENED same day
from "Certificate Expiry Monitoring" → a GENERIC expiry monitor (Awwal directive): the
cert case generalizes to every silent-expiry infra risk via one framework + one dashboard
card + one alert path. NOT a launch gate — ops hygiene / handover durability.
WHY: F-024 introduced MANUAL certs (CF Origin Cert exp 2041 + AOP CA exp 2029, no
auto-renewal). The SAME silent-lapse risk applies to DOMAIN REGISTRATION (let oyoskills.com
lapse and the whole platform + email dies — worse than a cert) and any API token / paid
service with an expiry. A laptop reminder is the wrong tool (won't survive machine/personnel
change / BOT transfer) — make the SYSTEM responsible: dashboard countdown + proactive alert.
Refs: docs/infrastructure-cicd-playbook.md Part 13 (Expiry Inventory), findings-register F-024.
-->

## Story

As **the OSLSR super_admin / custodian**,
I want **the operations dashboard to show a live days-until-expiry countdown for every time-sensitive piece of infrastructure — TLS certs, domain registrations, and operator-declared expiries (API tokens / paid services) — each with a CRITICAL alert fired well ahead of expiry**,
so that **no silent lapse (cert → CF 526, domain → total outage incl. email, token → integration failure) can take the platform down, regardless of who owns the project or which machine they use**.

## Acceptance Criteria

1. **AC#1 — Generic expiry framework (pluggable sources).** A `MonitoredExpiry` abstraction with source **adapters** keyed by `kind` (`cert` | `domain` | `manual`). Each adapter yields `{ name, kind, expiresAt (ISO|null), daysUntilExpiry (number|null), status: 'ok'|'warning'|'critical'|'error', detail }`. `daysUntilExpiry` is computed **server-side**. Adding a new monitored item or a new source kind is **additive** — no type/dashboard/alert change. A failing adapter yields `status:'error'` for that item and **never throws into `getSystemHealth`**. [Source: apps/api/src/services/monitoring.service.ts → getSystemHealth; apps/api/src/controllers/system.controller.ts:18]
2. **AC#2 — Health payload carries expiries.** `SystemHealthResponse` (packages/types) gains `expiries: MonitoredExpiry[]`. [Source: packages/types/src/monitoring.ts:20 — sibling of QueueHealthStats]
3. **AC#3 — `cert` adapter.** Reads a config-driven list of cert paths (`CERT_MONITOR_PATHS` env, default = the two F-024 certs / scan `/etc/ssl/cloudflare/*.pem`), `notAfter` via `crypto.X509Certificate(...).validTo`. **`.pem` only — never a `.key`** (Origin Cert key is `600 root`). Defaults: `cloudflare-origin` (`/etc/ssl/cloudflare/oyoskills-origin.pem`, ~2041), `cloudflare-aop-ca` (`/etc/ssl/cloudflare/origin-pull-ca.pem`, 2029-11-01).
4. **AC#4 — `domain` adapter (registration expiry).** For configured domains (`DOMAIN_MONITOR_LIST`, default `oyoskills.com`), query **RDAP** (`https://rdap.org/domain/<d>` → registry RDAP; the structured WHOIS replacement) for the registration-expiry event. **Cache the result (≥12h)** and treat the network call as best-effort: timeout/unsupported-TLD → `status:'error'`/`unavailable`, never block or throw. **`oyoskills.com` (.com → Verisign RDAP, reliable) is the priority**; `oyotradeministry.com.ng` (.com.ng — RDAP often absent) falls back to a `manual` entry. _Domain lapse is the highest-impact item here — it kills web AND email._
5. **AC#5 — `manual` adapter (declared expiries).** Operator-declared items in config (`MONITORED_EXPIRIES` JSON env or a small checked-in/`.env`-driven list): `[{ name, kind, expiresAt }]` — for things not auto-queryable: API tokens **that actually have an expiry** (e.g. a CF API token with a set expiry), paid-service renewals, and the `.com.ng` domain. _(Note: most API keys — Resend, Termii — do NOT expire; only declare ones with a real expiry. Don't invent dates.)_
6. **AC#6 — Alerting reuses the existing pipeline.** `alert.service.ts` gains an `expiry` threshold `{ warningThreshold: 60, criticalThreshold: 30, direction: 'below' }` (days); `evaluateAlerts` pushes one metric per item keyed `expiry:<name>` (mirroring `queue_waiting:<name>`). Flows through the existing `evaluateMetric` → digest → Telegram/email (Story 9-15). `error`-status items raise a distinct low-noise warning (can't-determine-expiry is itself worth knowing). UAT-triggerable via `scripts/uat-trigger-critical-alert.ts --metric=expiry`. [Source: apps/api/src/services/alert.service.ts:68 THRESHOLDS, :119 evaluateAlerts]
7. **AC#7 — Operations dashboard "Expiries" card.** `OperationsDashboardPage.tsx` renders one card grouping items by kind (Certificates / Domains / Tokens & services): name, expiry date, days-until-expiry countdown, color-coded **green > 60d / amber 30–60d / red < 30d** (matching the alert), explicit error badge for `status:'error'`. super_admin-only (existing operations route + `operations-rate-limit`). [Source: apps/web/src/features/dashboard/pages/OperationsDashboardPage.tsx]
8. **AC#8 — Docs + zero regression.** `docs/infrastructure-cicd-playbook.md` Part 13 broadened from "Certificate Inventory" → **"Expiry Inventory"** (certs + domains + declared). Full API + web suites green; `tsc` + lint clean. Per-adapter tests (ok/warning/critical/error), alert transition, widget render. Document net-new test counts. No existing health/alert behavior changed.

## Tasks / Subtasks

- [ ] **Task 1 — Type + framework (AC: #1, #2)** _(tests first)_ — `MonitoredExpiry` + `expiries: MonitoredExpiry[]` on `SystemHealthResponse`; a source-adapter registry in `MonitoringService`; `getSystemHealth` aggregates all adapters, each wrapped so a failure → `error` item (never throws). Shared `daysUntilExpiry(notAfter)` + status-from-thresholds helper.
- [ ] **Task 2 — `cert` adapter (AC: #3)** _(tests first)_ — config-driven `.pem` read (`.pem` only), fixture PEMs for ok/<60/<30/missing.
- [ ] **Task 3 — `domain` adapter (AC: #4)** _(tests first)_ — RDAP fetch + ≥12h cache + timeout/unsupported → `error`; mock the RDAP response in tests; default `oyoskills.com`.
- [ ] **Task 4 — `manual` adapter (AC: #5)** _(tests first)_ — parse `MONITORED_EXPIRIES` config; `.env.example` entry + a documented shape; seed `oyotradeministry.com.ng` registration here (since .com.ng RDAP is unreliable).
- [ ] **Task 5 — Alerting (AC: #6)** _(tests first)_ — `expiry` threshold + `expiry:<name>` fan-out in `evaluateAlerts`; `uat-trigger-critical-alert.ts --metric=expiry` synthetic item; tests at 25/45/90 days + an `error` item.
- [ ] **Task 6 — Dashboard "Expiries" card (AC: #7)** _(tests first)_ — grouped card on `OperationsDashboardPage.tsx`; color/error states tested.
- [ ] **Task 7 — Docs + regression (AC: #8)** — broaden playbook Part 13 → Expiry Inventory (add domain + declared rows + the `MONITORED_EXPIRIES`/`DOMAIN_MONITOR_LIST` config); full suites + tsc + lint; document counts; pre-commit `[CR]` per [[feedback-review-before-commit]] then commit.

## Dev Notes

- **One framework, three adapters** — the cert case is the reference adapter; domain + manual reuse the same `MonitoredExpiry` shape, threshold (60/30 `below`), per-item alert key (`expiry:<name>`), and dashboard card. Don't fork three monitors.
- **Domain registration is the highest-impact item** — a lapsed registration kills web *and* email *and* the AOP/CF setup, far worse than any cert. Prioritise `oyoskills.com`.
- **RDAP, not WHOIS** — RDAP returns structured JSON (`events[].eventAction == 'expiration'`). `.com` (Verisign) is reliable; **`.com.ng` RDAP is often absent** → don't depend on it; declare `oyotradeministry.com.ng` via the `manual` adapter instead. Cache the RDAP call (≥12h) — it's an external network hop; `getSystemHealth` is polled and must stay fast + must never throw because RDAP timed out.
- **Don't over-reach on API tokens** — Resend and Termii API keys do **not** expire; only declare items that genuinely have an expiry (e.g. a CF API token with a set TTL, a paid-service renewal date). Inventing dates creates false alerts. The `manual` adapter exists for the real ones.
- **`.pem` only, server-side day math, graceful-in-dev** (cert paths/RDAP won't resolve in CI → `error`/empty, not a crash). Tests use fixtures/mocks, never prod paths or live RDAP.
- **Thresholds match across dashboard + alert** (60 warning / 30 critical) — mirror `disk_free`'s `direction:'below'` shape so the state machine / digest / rate-limit all work unchanged.

### Project Structure Notes
- Touch: `packages/types/src/monitoring.ts` (types), `apps/api/src/services/monitoring.service.ts` (framework + adapters), `apps/api/src/services/alert.service.ts` (threshold + fan-out), `scripts/uat-trigger-critical-alert.ts` (synthetic), `apps/web/src/features/dashboard/pages/OperationsDashboardPage.tsx` (card), `docs/infrastructure-cicd-playbook.md` (Part 13 broaden), `.env.example` (`CERT_MONITOR_PATHS` / `DOMAIN_MONITOR_LIST` / `MONITORED_EXPIRIES`). Tests alongside.
- **No schema migration. No new audit action. No new route** (rides `GET /system/health`). super_admin-gated via the existing operations route + `operations-rate-limit`.
- File-overlap: `alert.service.ts` (9-15), `OperationsDashboardPage.tsx` (9-19), `monitoring.service.ts` — re-grep at impl.

### References
- [Source: docs/infrastructure-cicd-playbook.md → Part 13 (Expiry Inventory — broadened by this story)]
- [Source: docs/security/findings-register.md → F-024] · [Source: docs/f-024-origin-lock-runbook.md]
- [Source: packages/types/src/monitoring.ts:20 → SystemHealthResponse]
- [Source: apps/api/src/controllers/system.controller.ts:18 → getHealth → MonitoringService.getSystemHealth]
- [Source: apps/api/src/services/alert.service.ts:68 THRESHOLDS, :119 evaluateAlerts (`queue_waiting:<name>` fan-out)]
- [Source: scripts/uat-trigger-critical-alert.ts] (Story 9-15 permanent alert UAT — extend)
- [Source: apps/web/src/features/dashboard/pages/OperationsDashboardPage.tsx] (Story 9-19 ops dashboard)
- RDAP: `https://rdap.org/domain/<domain>` (bootstrap → registry RDAP; `events[].eventAction='expiration'`)

## Dev Agent Record
### Agent Model Used
_(to be filled by dev)_

### Debug Log References

### Completion Notes List

### File List

### Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-06-09 | Authored (F-024 close-out follow-up): cert-expiry monitoring — ops-dashboard countdown + alert. 6 ACs / 4 Tasks. | Bob (SM) |
| 2026-06-09 | BROADENED (Awwal directive) → generic Expiry Monitoring: cert + domain-registration (RDAP) + manual-declared (API tokens / services) via one framework / one dashboard card / one alert path. Now 8 ACs / 7 Tasks; effort ~1.5–2 dev-days. Domain registration flagged as the highest-impact item. | Bob (SM) |
