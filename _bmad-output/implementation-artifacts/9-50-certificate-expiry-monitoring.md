# Story 9.50: Certificate Expiry Monitoring — ops-dashboard countdown + alerting

Status: ready-for-dev

<!--
Authored 2026-06-09 by Bob (SM) via canonical *create-story --yolo workflow.
Source: F-024 origin-lock close-out (Story 9-9 #11). NOT a launch gate — ops hygiene.
WHY: F-024 moved the origin OFF Let's Encrypt (auto-renew) onto MANUAL long-lived certs
with NO auto-renewal — CF Origin Cert (exp 2041-06-05) + CF origin-pull CA for AOP
(exp 2029-11-01). If one lapses unnoticed the site breaks (Origin Cert → CF 526;
AOP CA → mTLS handshake fail / 400). A laptop reminder is the wrong tool (won't survive
machine/personnel change / BOT transfer). Make the SYSTEM responsible: surface a live
countdown on the Super Admin operations dashboard + a CRITICAL alert ahead of expiry.
Refs: docs/infrastructure-cicd-playbook.md Part 13 (Certificate Inventory),
docs/security/findings-register.md F-024, docs/f-024-origin-lock-runbook.md.
-->

## Story

As **the OSLSR super_admin / custodian**,
I want **the operations dashboard to show a live days-until-expiry countdown for the origin's TLS certificates, with a CRITICAL alert fired well before any expiry**,
so that **the manual (non-auto-renewing) Cloudflare Origin Cert and origin-pull CA introduced by F-024 can never silently lapse and take the site down — regardless of who owns the project or which machine they use**.

## Acceptance Criteria

1. **AC#1 — Backend reads cert expiry (config-driven, .pem only).** `MonitoringService.getSystemHealth()` reads the `notAfter` of a **configured list** of cert paths and computes `daysUntilExpiry` **server-side** for each. The list is config-driven (env var `CERT_MONITOR_PATHS` comma-separated, defaulting to the two known certs) or a directory scan of `/etc/ssl/cloudflare/*.pem` — **NOT hardcoded to today's two certs**, so a future cert auto-appears. Only public `.pem` files are read (never a `.key`; the Origin Cert key is `600 root`). A missing/unreadable cert is reported as a distinct `error` state, not silently omitted. [Source: apps/api/src/services/monitoring.service.ts → getSystemHealth; apps/api/src/controllers/system.controller.ts:18]
2. **AC#2 — Health payload carries certificates.** `SystemHealthResponse` (packages/types) gains `certificates: CertHealthStats[]` where each entry is `{ name, path, notAfter (ISO), daysUntilExpiry, status: 'ok' | 'warning' | 'critical' | 'error' }`. `name` is a stable human label (e.g. `cloudflare-origin`, `cloudflare-aop-ca`) derived from the filename. [Source: packages/types/src/monitoring.ts:20 SystemHealthResponse + QueueHealthStats sibling pattern]
3. **AC#3 — Alerting reuses the existing pipeline.** `alert.service.ts` gains a `cert_expiry` threshold `{ warningThreshold: 60, criticalThreshold: 30, direction: 'below' }` (days), and `evaluateAlerts` pushes one metric **per cert** keyed `cert_expiry:<name>` (mirroring the existing `queue_waiting:<name>` pattern). No parallel alert path — it flows through the same `evaluateMetric` → digest → Telegram/email (Story 9-15). **Test:** a cert at 25 days → CRITICAL transition + `alert.critical_evaluated`. [Source: apps/api/src/services/alert.service.ts:68-76 THRESHOLDS, :119-140 evaluateAlerts]
4. **AC#4 — UAT-triggerable.** `scripts/uat-trigger-critical-alert.ts` accepts a synthetic `--metric=cert_expiry` (e.g. days=20) so the cert alert path is exercisable on demand like the other metrics (operator handover + regression check). [Source: scripts/uat-trigger-critical-alert.ts]
5. **AC#5 — Operations dashboard countdown widget.** `OperationsDashboardPage.tsx` renders a "Certificates" card: one row per cert with name, expiry date, and a **days-until-expiry countdown**, color-coded **green > 60d / amber 30–60d / red < 30d** (matching the alert thresholds), and an explicit error badge for unreadable certs. super_admin-only (the existing operations route + `operations-rate-limit`). [Source: apps/web/src/features/dashboard/pages/OperationsDashboardPage.tsx]
6. **AC#6 — Zero regression + tests.** Full API + web suites green; `tsc` + lint clean (api + web). New tests: backend cert-read (valid/expiring/missing → correct status + days), alert transition at threshold, dashboard widget render + color states. Document net-new test counts. No existing health/alert behavior changed.

## Tasks / Subtasks

- [ ] **Task 1 — Type + backend cert read (AC: #1, #2)** _(tests first)_
  - [ ] 1.1 `packages/types/src/monitoring.ts`: add `CertHealthStats` + `certificates: CertHealthStats[]` to `SystemHealthResponse`.
  - [ ] 1.2 `MonitoringService.getSystemHealth()`: resolve the cert list (`CERT_MONITOR_PATHS` env, comma-separated; default = the two F-024 certs / scan `/etc/ssl/cloudflare/*.pem`), read each `.pem` `notAfter` (Node `crypto.X509Certificate(readFileSync(path)).validTo`), compute `daysUntilExpiry`, map to status via the 60/30 thresholds; unreadable → `status:'error'`. Never open a `.key`.
  - [ ] 1.3 Tests: valid cert (ok), <60d (warning), <30d (critical), missing file (error). Use fixture PEMs (generate self-signed in-test, or check in throwaway PEMs).
- [ ] **Task 2 — Alerting (AC: #3, #4)** _(tests first)_
  - [ ] 2.1 `alert.service.ts`: add `cert_expiry` to `THRESHOLDS` (`warning 60, critical 30, direction 'below'`); in `evaluateAlerts`, push `{ key: 'cert_expiry:'+c.name, value: c.daysUntilExpiry }` for each `health.certificates` entry (skip `error` entries OR alert them separately — dev judgment, document).
  - [ ] 2.2 `scripts/uat-trigger-critical-alert.ts`: add `cert_expiry` synthetic metric (default 20 days) feeding a synthetic `certificates` entry into the `SystemHealthResponse` it builds.
  - [ ] 2.3 Tests: 25d → critical transition; 45d → warning; 90d → none.
- [ ] **Task 3 — Dashboard widget (AC: #5)** _(tests first)_
  - [ ] 3.1 `OperationsDashboardPage.tsx`: "Certificates" card reading `health.certificates`; per-cert countdown + color (green/amber/red at 60/30) + error badge. Reuse the page's existing card/poll pattern.
  - [ ] 3.2 Tests (`OperationsDashboardPage.test.tsx`): renders rows; green/amber/red by days; error badge for `status:'error'`.
- [ ] **Task 4 — Regression + commit (AC: #6)**
  - [ ] 4.1 Full suites green; `tsc` + lint clean; document net-new test counts.
  - [ ] 4.2 Pre-commit fresh-context `[CR]` per [[feedback-review-before-commit]]; then commit.

## Dev Notes

- **Read `.pem` only, never `.key`.** We only need `notAfter` (public cert metadata). The Origin Cert key is `600 root`; the API process must not require it. The AOP CA `.pem` and Origin Cert `.pem` are `644`.
- **Server-side day math** — compute `daysUntilExpiry` on the backend from `notAfter` so the dashboard and the alert agree and it's immune to client clock skew. Frontend just renders the number + color.
- **Thresholds match the alert** (60 warning / 30 critical, `direction:'below'`) — mirror `disk_free`'s shape exactly so behavior is consistent and the state machine / digest / hourly-rate-limit all work unchanged.
- **Per-cert metric keys** (`cert_expiry:<name>`) mirror the existing `queue_waiting:<name>` fan-out in `evaluateAlerts` — each cert gets its own alert state.
- **The two certs today** (defaults): `cloudflare-origin` = `/etc/ssl/cloudflare/oyoskills-origin.pem` (exp 2041), `cloudflare-aop-ca` = `/etc/ssl/cloudflare/origin-pull-ca.pem` (exp 2029-11-01). But the list MUST be config/scan-driven so it's not a maintenance trap.
- **In dev/CI the cert paths won't exist** — getSystemHealth must degrade gracefully (report `error`/empty `certificates`, don't throw). Tests use fixture PEMs, not the prod paths.
- Testing: backend `__tests__/` (vitest, `vi.mock` fs/crypto or fixture files); web vitest for the page.

### Project Structure Notes
- Touch: `packages/types/src/monitoring.ts` (type), `apps/api/src/services/monitoring.service.ts` (cert read), `apps/api/src/services/alert.service.ts` (threshold + metric), `scripts/uat-trigger-critical-alert.ts` (synthetic metric), `apps/web/src/features/dashboard/pages/OperationsDashboardPage.tsx` (widget). Tests alongside each.
- **No schema migration. No new audit action. No new route** (rides the existing `GET /system/health` → operations dashboard). super_admin-gated via the existing operations route + `operations-rate-limit`.
- File-overlap caution: `alert.service.ts` + `OperationsDashboardPage.tsx` are shared with Stories 9-15 / 9-19; re-grep line numbers at impl. Add `CERT_MONITOR_PATHS` to `.env.example` if used.

### References
- [Source: docs/infrastructure-cicd-playbook.md → Part 13 Certificate Inventory] (the certs + expiries + renewal)
- [Source: docs/security/findings-register.md → F-024] · [Source: docs/f-024-origin-lock-runbook.md]
- [Source: packages/types/src/monitoring.ts:20 → SystemHealthResponse]
- [Source: apps/api/src/controllers/system.controller.ts:18 → getHealth → MonitoringService.getSystemHealth]
- [Source: apps/api/src/services/alert.service.ts:68 THRESHOLDS, :119 evaluateAlerts (queue_waiting:<name> fan-out pattern)]
- [Source: scripts/uat-trigger-critical-alert.ts] (Story 9-15 permanent alert UAT runner — extend)
- [Source: apps/web/src/features/dashboard/pages/OperationsDashboardPage.tsx] (Story 9-19 ops dashboard)

## Dev Agent Record
### Agent Model Used
_(to be filled by dev)_

### Debug Log References

### Completion Notes List

### File List

### Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-06-09 | Authored (F-024 close-out follow-up): cert-expiry monitoring — ops-dashboard countdown + alert via the existing pipeline. NOT a launch gate. 6 ACs / 4 Tasks. | Bob (SM) |
