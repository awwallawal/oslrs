# OSLRS Team Context Brief

> **Purpose:** Read this file to reassemble full project context in a new Claude Code session.
> **Last updated:** 2026-03-04 (after Epic 6 retrospective)

## Quick Context Load

Read these files in order for full project awareness:

1. **Sprint Status:** `_bmad-output/implementation-artifacts/sprint-status.yaml` — current state of all epics, stories, and prep tasks
2. **Latest Retrospective:** `_bmad-output/implementation-artifacts/epic-6-retro-2026-03-04.md` — most recent retro with decisions, action items, and prep tasks for Epic 7
3. **Project Context:** `docs/project-context.md` — coding patterns, architecture rules, testing standards

## For Specific Work

| Task Type | Additional Files to Read |
|-----------|-------------------------|
| Report writing | Relevant story files from `_bmad-output/implementation-artifacts/` |
| New feature dev | `_bmad-output/planning-artifacts/epics.md` + `architecture.md` |
| Bug fixing | Specific story file + check production logs on VPS |
| Sprint planning | Epic files + previous retro for prep task context |
| Story creation | Epic definition + previous stories in same epic |

## Key Project Facts

- **Monorepo:** `apps/api` (Express/Drizzle), `apps/web` (React/Vite/TanStack), `packages/types` (shared)
- **Package manager:** pnpm (never use npx)
- **Production:** oyotradeministry.com.ng (DigitalOcean VPS 2GB, PM2 + NGINX, Docker for PostgreSQL + Redis)
- **Current state:** Epic 6 complete, security hardening done, Epic 7 (Public Skills Marketplace) next
- **Tests:** 3,123 total (1,184 API + 1,939 web), zero regressions policy
- **Process:** spike-first → prep tasks → stories → adversarial code review → retrospective

## Team Process Patterns

1. **Spike-first:** Research spikes before implementation. Zero rework for 4 consecutive epics.
2. **Prep-as-force-multipliers:** Each epic's prep phase builds reusable infrastructure that multiple stories consume.
3. **Three-layer quality:** Layer 1 (automated tests), Layer 2 (adversarial code review), Layer 3 (human UAT by context-holder).
4. **Story-shaped improvements:** Frame all process changes as concrete, deliverable tasks — aspirational commitments slip.
5. **Adversarial code review:** Every story gets a fresh-context review that must find 3-10 issues. ~94% fix rate standard.
6. **Race condition awareness:** Consult `project-context.md` "Race Condition Anti-Patterns" section before implementing any check-then-act, query-before-render, or state transition logic. 5 documented patterns with real file references.

## Critical Deployment Notes

- **VITE_API_URL** must be set at build time: `VITE_API_URL=https://oyotradeministry.com.ng/api/v1 pnpm build`
- **hCaptcha env var:** Code expects `HCAPTCHA_SECRET_KEY` (not `HCAPTCHA_SECRET`)
- **db:push on deploy:** CI runs `pnpm --filter @oslsr/api db:push` before build
- **Admin seeding:** `pnpm --filter @oslsr/api db:seed --admin-from-env` (single-line inline env vars)
- **Env var safety:** Any code adding required env vars MUST coordinate with production `.env` before deploy (SEC-3 crash loop lesson)
- **Production nginx config lives in the repo** at [`infra/nginx/oslsr.conf`](../infra/nginx/oslsr.conf), deployed automatically via CI to `/etc/nginx/sites-available/oslsr`. Any nginx change MUST touch that file — grep for `infra/nginx/oslsr.conf` before editing anything nginx-related. The old `docker/nginx.conf` was orphan code (renamed to `docker/nginx.dev.conf` for dev-container use only in Story 9-7, 2026-04-11) — the file looked like production config but was never read by the VPS. Lesson: verify live headers via `curl -sI https://oyotradeministry.com.ng/` rather than assuming a committed file is deployed.

## Epic 7 Readiness

- **11 prep tasks + 3 doc tasks** tracked in sprint-status.yaml under `prep-epic-7`, 5 critical (text=uuid fix, deploy safety, placeholder pages, marketplace spike, security spike)
- **VPS strategy:** Start on current 2GB droplet, upgrade only if monitoring triggers
- **Security prerequisite:** Complete — CSP, dependency pinning, mass assignment hardening, CI audit gate all in place
- **Key architectural difference:** First public unauthenticated routes — fundamentally different security surface

## Document Map

| Document | Path | Purpose |
|----------|------|---------|
| Sprint Status | `_bmad-output/implementation-artifacts/sprint-status.yaml` | Living state tracker |
| Epic 6 Retro | `_bmad-output/implementation-artifacts/epic-6-retro-2026-03-04.md` | Latest decisions + action items |
| Epics Definition | `_bmad-output/planning-artifacts/epics.md` | All epic/story definitions |
| Architecture | `_bmad-output/planning-artifacts/architecture.md` | ADRs + technical design |
| Project Context | `_bmad-output/project-context.md` | Coding patterns + rules (v2.0.0) |
| Infrastructure Playbook | `docs/infrastructure-cicd-playbook.md` | VPS setup + deployment |
| Previous Retros | `_bmad-output/implementation-artifacts/epic-*-retro-*.md` | Historical decisions |
