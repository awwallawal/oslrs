# Story 1.1: Project Initialization & CI/CD Pipeline

**ID:** 1.1
**Epic:** Foundation, Secure Access & Staff Onboarding
**Status:** ready-for-dev
**Priority:** High
**Estimates:** (No time estimates per BMAD protocol)

## 📖 User Story

**As a** Developer,
**I want to** set up the project's foundational structure, build pipeline, and core services,
**So that** we have a stable and automated environment for development, testing, and deployment.

## ✅ Acceptance Criteria

**Given** a clean repository
**When** I initialize the monorepo with `apps/web` (React/Vite) and `apps/api` (Node/Express)
**Then** the project should build successfully locally using pnpm workspaces
**And** GitHub Actions should deploy a health-check endpoint to the Hetzner VPS via Docker Compose
**And** the `.env.example` should contain placeholders for all required environment variables.

---

## 🛠️ Developer Context (ULTIMATE ENGINE)

### 🚀 Technical Requirements & Constraints

- **Runtime:** Node.js 20 LTS (locked via `.nvmrc`)
- **Package Manager:** `pnpm` (required for workspaces)
- **Language:** TypeScript 5.x (strict mode enabled)
- **Frontend Stack:** React 18.3.1 (DO NOT use React 19), Vite 6.x, Tailwind CSS v4, shadcn/ui
- **Backend Stack:** Express.js (ES Modules), Drizzle ORM, PostgreSQL 15
- **Infrastructure:** Hetzner Cloud CX43 (8 vCPU, 16GB RAM), Docker Compose
- **CI/CD:** GitHub Actions with Docker Hub/Registry push and SSH deployment to VPS
- **Analytics:** Self-hosted Plausible or Umami (ADR-013 privacy requirement)

### 🏗️ Architecture Compliance (ADR-001, ADR-011, ADR-013)

- **Monorepo Structure:**
  ```
  oslsr/
  ├── apps/
  │   ├── web/              # React PWA (Vite)
  │   └── api/              # Express API
  ├── packages/
  │   ├── types/            # Shared TS types
  │   ├── utils/            # Shared utilities (AppError, Verhoeff)
  │   └── config/           # Shared constants
  ├── services/
  │   └── odk-integration/  # ODK API abstraction layer
  ├── docker/
  │   ├── docker-compose.yml
  │   ├── Dockerfile.api
  │   └── Dockerfile.web
  ├── .nvmrc
  └── pnpm-workspace.yaml
  ```
- **Reverse Proxy:** NGINX as the single entry point (ADR-013) for SSL termination (Let's Encrypt) and routing.
- **Data Residency:** All core services (Postgres, Redis, ODK Central) must be self-hosted on the Hetzner VPS (NDPA compliance).

### 📦 Library & Framework Requirements

- **API:** `express`, `helmet`, `cors`, `pino` (structured logging), `dotenv`
- **DB:** `drizzle-orm`, `pg`, `zod` (validation)
- **Jobs/Queue:** `bullmq`, `ioredis`
- **UI:** `lucide-react`, `clsx`, `tailwind-merge`

### 🧪 Testing & Quality Requirements

- **CI Pipeline:** Must include `pnpm lint`, `pnpm build`, and a basic health-check test before deployment.
- **Logging:** Implement `pino` for structured JSON logs from day one (Decision 5.1).

### 📋 Environment Variables (.env.example)

Include placeholders for:
- `DATABASE_URL` (app_db)
- `DATABASE_URL_REPLICA` (marketplace read-only)
- `REDIS_URL`
- `ODK_SERVER_URL`
- `ODK_ADMIN_EMAIL` / `ODK_ADMIN_PASSWORD`
- `JWT_SECRET` / `REFRESH_TOKEN_SECRET`
- `AWS_SES_REGION` / `AWS_SES_ACCESS_KEY` (or equivalent)
- `S3_BUCKET_NAME` / `S3_ENDPOINT` (for backups)
- `SUPER_ADMIN_EMAIL` (for alerts)

---

## 🎯 Implementation Status
**Status:** done
**Note:** Ultimate context engine analysis completed - comprehensive developer guide created. Implementation complete with all ACs satisfied.

### 📝 Dev Agent Record (AI)
**Implementation Plan:**
1. Initialize monorepo structure with pnpm workspaces.
2. Setup apps/api with Express, TypeScript, and ES modules.
3. Setup apps/web with React 18.3.1, Vite, and Tailwind v4.
4. Initialize shared packages and ODK service.
5. Configure Docker orchestration.
6. Setup GitHub Actions CI/CD pipeline.
7. Verify build process.

**Completion Notes:**
- Monorepo established correctly.
- All technical constraints (React 18.3.1, Node 20, etc.) respected.
- Build pipeline verified green.
- **Resolved Review Findings:**
    - Created comprehensive README.md with Portainer guide.
    - Implemented `AppError` in shared utils.
    - Added API health check tests and verified via `vitest`.
    - Enhanced CI/CD pipeline with real deployment steps and test execution.
    - Added `.gitignore`.

### 📂 File List
- `package.json`
- `pnpm-workspace.yaml`
- `.nvmrc`
- `.env.example`
- `apps/api/package.json`
- `apps/api/tsconfig.json`
- `apps/api/src/index.ts`
- `apps/web/package.json`
- `apps/web/tsconfig.json`
- `apps/web/vite.config.ts`
- `apps/web/index.html`
- `apps/web/src/main.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/index.css`
- `docker/docker-compose.yml`
- `docker/Dockerfile.api`
- `docker/Dockerfile.web`
- `.github/workflows/ci-cd.yml`
- `packages/types/package.json`
- `packages/utils/package.json`
- `packages/config/package.json`
- `services/odk-integration/package.json`

### 🕒 Change Log
- **2026-01-05:** Story initialized and completed. All foundational infrastructure established.
