# A.6 Dev-Story Sequence — 14 stories ready for `dev-story` workflow

**Authored:** 2026-04-27
**Anchor:** SCP-2026-04-22 §A.6 (Dev agents run `bmad:bmm:workflows:dev-story` per story); 14 stories validated ready-for-dev by Bob (SM) per A.5 (commit `1e65e9f`).
**Why this doc:** sprint-status.yaml has the per-story state but doesn't encode dependency-aware ORDER. Without an explicit sequence the next builder picks alphabetically (10-1 first?) or by epic order (Epic 9 first?), both of which violate hard dependencies. This doc is the running source of truth for which story to start next.

## Three principles

1. **Field Readiness Certificate (FRC) blockers first.** The 6-item FRC gates field-survey kickoff. Three of the 14 stories are FRC items — those must close before non-FRC engineering. As of this doc, FRC progress is 2/6 (Tailscale + 2nd super-admin done; remaining FRC items: 11-1 schema, 9-12 public wizard, prep-input-sanitisation, 9-9 AC#6 alerting tier).
2. **Maximize parallelism.** Independent tracks should run concurrently (legal track + engineering track + observation track). The "wave" structure below labels what can start in parallel.
3. **Respect hard dependencies.** A schema migration before consumers; an audit viewer before consumer auth; a DSA template before PII-scope grants. These are not soft suggestions — Story 10-1 explicitly lists 9-11 + 10-5 as HARD prereqs.

## Dependency graph (compressed)

```
prep-input-sanitisation ──┐
                          ▼
                       11-2 import service ──┐
11-1 schema ──┬─────────▶ 11-3 import UI ◀──┤
              ├─▶ 9-12 public wizard ───────┘ (provides components)
              ├─▶ 11-4 source badges
              └─▶ 9-11 audit viewer ───────────┐
                                                ├──▶ 10-1 consumer auth ──┬──▶ 10-2 rate limit ──┬──▶ 10-3 admin UI
10-5 DSA template ─────────────────────────────┘                          │                      ├──▶ 10-4 dev portal
(legal/Iris+Gabe track)                                                   │                      └──▶ 10-6 audit dash
                                                                          │
9-10 PM2 trajectory (passive observation, AC#2 fix shipped 2026-04-27) ───┘
```

## Wave 1 — start now (3 parallel tracks)

| Story | Track | FRC? | Size | Why this wave |
|---|---|---|---|---|
| **prep-input-sanitisation-layer** | Engineering | ✅ #4 | M | Independent. Hard prereq for 11-2. |
| **11-1 multi-source schema foundation** | Engineering | ✅ #2 | L | Foundation. Akintola-risk Move 1 (composite-index audit at 500K respondents + 1M submissions + 100K audit_logs + 100K marketplace_profiles). Unblocks 9-12, 11-2, 11-4. |
| **10-5 data-sharing-agreement template** | Legal (Iris+Gabe) | — | M | Runs entirely outside engineering. NDPA Article 25 alignment. Hard prereq for 10-1. **Don't wait for engineering on this.** |

**Definition of done for Wave 1:** all three landed, 11-1 seeder reusable for downstream EXPLAIN ANALYZE work, DSA template + SOP runbook + onboarding tracker checked in.

## Wave 2 — start as 11-1 lands

| Story | Depends on | FRC? | Size | Notes |
|---|---|---|---|---|
| **9-12 public wizard + pending-NIN magic-link** | 11-1 (status enum) | ✅ #3 | L | Releases the public-facing critical path. 14 ACs. |
| **9-11 admin audit log viewer** | 11-1 (audit_logs at 1M-row scale) | — | M-L | Akintola-risk Move 3. Hard prereq for 10-1 + 10-6. 12 ACs. |
| **11-2 import service parsers** | 11-1 + prep-input-sanitisation | — | L | PDF/CSV/XLSX + dry-run/confirm/rollback. Hard prereq for 11-3. |
| **11-4 source badges + filter chips** | 11-1 (extended source enum) | — | S-M | Independent of 11-2/11-3. Can ship in parallel with import pipeline. |
| **9-10 PM2 trajectory observation** | (passive, partial fix shipped 2026-04-27) | — | passive | 7-day window opens 2026-04-25 → completes 2026-05-02. AC#3 post-fix observation re-anchors at commit `718f84e` deploy time. |

**Definition of done for Wave 2:** 9-12 + 9-11 + 11-2 + 11-4 merged. 9-10 trajectory captured. FRC progress reaches 4/6 (with prep-input-sanitisation + 11-1 also done in Wave 1).

## Wave 3 — start as 11-2 + 9-12 + 9-11 + 10-5 land

| Story | Depends on | Notes |
|---|---|---|
| **11-3 admin import UI** | 11-2 + 9-12 (WizardStepIndicator, LawfulBasisSelector) | Closes the import pipeline. 3-step wizard (Upload → Review → Confirm). |
| **10-1 consumer auth (expanded)** | 9-11 + 10-5 | Gates Epic 10 PII-scope release. 12 ACs incl. scoped API keys + LGA scoping + IP allowlist + 180-day rotation. |

**Definition of done for Wave 3:** import pipeline end-to-end (parser → UI → confirm → status updates flow). Consumer auth ready for downstream Epic 10 plumbing.

## Wave 4 — start as 10-1 lands

| Story | Depends on | Notes |
|---|---|---|
| **10-2 per-consumer rate limiting** | 10-1 (req.consumer) | Hard prereq for 10-3 + 10-4. Redis-backed per-scope quotas + 429 with structured details. |
| **10-3 consumer admin UI** | 10-1 + 10-2 + 10-5 | 3-tab wizard + token-displayed-once + per-consumer activity drawer + DSA precondition gate. |
| **10-4 developer portal** | 10-1 + 10-2 | Public /developers + OpenAPI/Swagger UI + scope reference + request-access form. Independent of 10-3. |
| **10-6 consumer audit dashboard** | 9-11 + 10-1 + 10-2 | Filters audit_logs by consumer_id; time-series, scope breakdown, anomaly detection. |

10-3 + 10-4 + 10-6 can all run in parallel after 10-2 lands.

**Definition of done for Wave 4:** Epic 10 (API Governance) fully shipped. PII-scope grants available with full audit + rate-limit + DSA-precondition enforcement.

## Background tracks (passive throughout all waves)

- **Story 9-9 remaining 6 subtasks:** port audit, app-layer rate-limit audit on `/auth/*`, backup AES-256 client-side encryption + quarterly restore drill, alerting tier (FRC #5 — SMS/WhatsApp/paged for CRITICAL), logrotate for PM2 + journalctl retention, SOC-style activity baseline. None block A.6.
- **Architectural: build off-VPS** via self-hosted GH Actions runner inside tailnet. Eliminates the 2GB VPS deploy-build resource spike (cause of the 2026-04-26/27 CRITICAL alerts), and lets us re-narrow the SSH firewall back to `100.64.0.0/10` + DO infra ranges. Pairs with Story 9-9 follow-up. ~half-day of work; defer to between waves.
- **Manual ops checklists:** `docs/follow-ups/2026-05-04-...md` (WAF + PM2 + CSP review) and `docs/follow-ups/2026-06-22-...md` (cert auto-renew preflight). User actions, not dev-story work.

## How to use this doc

When invoking `bmad:bmm:workflows:dev-story`:
1. Open this file. Pick the next eligible Wave. Prefer earliest unblocked story in that wave.
2. If multiple stories in the same wave are eligible AND independent, parallel-spawn dev agents (each on a separate branch).
3. As each story merges, re-check the next-wave dependency rows — some Wave 2/3/4 stories unblock as soon as one prereq lands, not all of them.
4. Update sprint-status.yaml status (in-progress → review → done) per story state. The `# updated:` log captures cross-story decisions.

## Wave-2 decision rule

Within Wave 2, **start with 11-2 + 9-11 in parallel** if dev agents are available. Reasoning:
- 9-12 has the largest scope (14 ACs, biggest UI surface) → don't parallel-start with another large story.
- 11-2 + 9-11 are independent of each other and both unblock multiple Wave-3 stories.
- 11-4 is small enough to run alongside whichever of {11-2, 9-11, 9-12} a dev finishes first.

## When to revisit this doc

- After any story flips done → check if it unblocked Wave-3 or Wave-4 stories early.
- After any new SCP → the priority order may shift (e.g., a security incident could promote 9-9 alerting tier ahead of 10-1).
- After 9-10 trajectory analysis at 2026-05-04 → if spontaneous-restart rate exceeds 5/wk, AC#2 needs further work and 9-10 might re-block.
- At 2026-05-15 (FRC gate review) — verify 4/6 minimum FRC items closed before field-survey scheduling.
