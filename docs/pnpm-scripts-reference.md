# pnpm Scripts Reference

> **For:** Developers and AI agents working on OSLSR
> **Last updated:** 2026-02-11

---

## Root (`oslsr`)

| Command | What it does |
|---|---|
| `pnpm dev` | Kills stale ports, then starts API + Web dev servers in parallel |
| `pnpm dev:skip-clean` | Same but skips port cleanup |
| `pnpm build` | Builds all packages via turbo |
| `pnpm test` | Runs all tests across all packages via turbo |
| `pnpm test:golden` | Runs only GoldenPath-tagged tests |
| `pnpm test:security` | Runs only Security-tagged tests |
| `pnpm test:contract` | Runs only Contract-tagged tests |
| `pnpm test:ui` | Runs only UI-tagged tests |
| `pnpm test:web` | Runs tests for `@oslsr/web` only |
| `pnpm test:dashboard` | Runs the testing CLI dashboard |
| `pnpm lint` | Lints all packages via turbo |
| `pnpm services:up` | Starts Docker containers (PostgreSQL + Redis) |
| `pnpm services:down` | Stops Docker containers |
| `pnpm services:logs` | Tails Docker container logs |
| `pnpm prepare` | Sets up Husky git hooks (runs automatically on install) |
| `pnpm migrate:xlsform` | One-time XLSForm to native form migration script |
| `pnpm clean:ports` | Kills processes on ports 3000, 5173-5181 |

---

## API (`@oslsr/api`)

Run from `apps/api` or with `pnpm --filter @oslsr/api`.

### Application

| Command | What it does |
|---|---|
| `pnpm dev` | Starts Express API server with hot reload (tsx watch) |
| `pnpm build` | Compiles TypeScript to `dist/` |
| `pnpm start` | Runs compiled production server |

### Testing & Linting

| Command | What it does |
|---|---|
| `pnpm test` | Runs all API tests (268 tests) |
| `pnpm test:golden` | API GoldenPath tests only |
| `pnpm test:security` | API Security tests only |
| `pnpm test:contract` | API Contract tests only |
| `pnpm test:ui` | API UI tests only |
| `pnpm lint` | Lints API source code |

### Database

| Command | What it does |
|---|---|
| `pnpm db:generate` | Compiles TS, generates migration SQL from schema diff |
| `pnpm db:migrate` | Compiles TS, applies pending migration files |
| `pnpm db:push` | Compiles TS, pushes schema directly (dev only, may prompt) |
| `pnpm db:push:force` | Compiles TS, pushes schema auto-approving all prompts |
| `pnpm db:push:force:verbose` | Same as above with verbose SQL output |
| `pnpm db:studio` | Opens Drizzle Studio GUI for browsing data |
| `pnpm db:check` | Compiles TS, verifies schema matches migration history |
| `pnpm db:seed` | Runs seed script (base mode) |
| `pnpm db:seed:dev` | Seeds 7 test users with known passwords |
| `pnpm db:seed:clean` | Removes only `isSeeded: true` records |
| `pnpm db:reset` | Drops all tables, runs migrate, seeds dev data |

---

## Web (`@oslsr/web`)

Run from `apps/web` or with `pnpm --filter @oslsr/web`.

| Command | What it does |
|---|---|
| `pnpm dev` | Starts Vite dev server (React frontend) |
| `pnpm build` | Compiles TS + Vite production build |
| `pnpm test` | Runs all web tests (957 tests) |
| `pnpm test:golden` | Web GoldenPath tests only |
| `pnpm test:security` | Web Security tests only |
| `pnpm test:contract` | Web Contract tests only |
| `pnpm test:ui` | Web UI tests only |
| `pnpm lint` | Lints web source code |
| `pnpm preview` | Serves production build locally |

---

## Utils (`@oslsr/utils`)

| Command | What it does |
|---|---|
| `pnpm test` | Runs utils tests (65 tests — validation, crypto, skip-logic) |

---

## Types (`@oslsr/types`) & Config (`@oslsr/config`)

No custom scripts. Types has 64 tests that run via turbo. Config has no scripts.
