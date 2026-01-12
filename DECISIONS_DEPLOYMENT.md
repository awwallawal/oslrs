# Deployment Strategy & Decisions
**Date:** 2026-01-12
**Author:** Amelia (Dev Agent)

## 1. Objective
Ensure "One-Click" deployment reliability to a Hetzner VPS (or similar) where the AI Agent is not available to assist.

## 2. Identified Risks & Decisions

### Risk A: "404 Not Found" on Page Refresh
*   **Problem:** React Router manages URLs client-side (e.g., `/dashboard`). When a user refreshes, the request goes to the Nginx server. Default Nginx looks for a file named `dashboard`, doesn't find it, and returns 404.
*   **Decision:** Create a custom `nginx.conf` and inject it into the `web` Docker image.
*   **Implementation:**
    *   Create `docker/nginx.conf` with `try_files $uri /index.html`.
    *   Update `Dockerfile.web` to copy this config to `/etc/nginx/conf.d/default.conf`.

### Risk B: Database Schema Drift
*   **Problem:** The API container starts but crashes because tables don't exist (on fresh install) or are outdated.
*   **Decision:** Automate migrations on container startup.
*   **Implementation:**
    *   Create a `scripts/entrypoint.sh` for the API container.
    *   It will run `pnpm db:push` (or `migrate`) *before* starting the application.
    *   This ensures code and database are always in sync.

### Risk C: Docker Build Context Failures
*   **Problem:** Monorepos are tricky in Docker. `apps/api` depends on `packages/types`. If you just build `apps/api`, it fails because it can't find the workspace dependency.
*   **Decision:** Use a multi-stage Docker build that copies the *entire* relevant workspace context correctly.
*   **Implementation:** Refine `Dockerfile.api` to ensure `pnpm-workspace.yaml` and local packages are copied and linked correctly before building.

### Risk D: Secrets Management
*   **Problem:** `docker-compose.yml` has hardcoded passwords.
*   **Decision:** Enforce `.env` usage in production.
*   **Implementation:** Update `docker-compose.yml` to strictly use variable substitution (`${VAR}`) and fail if variables are missing.

## 3. The "Deployment Pack" Deliverables

I will generate the following files to be committed to the repo:

1.  `DEPLOYMENT.md`: A standalone manual for you.
    *   *Contents:* Prerequisites, Initial Server Setup (Docker installation), First Deployment, Updating (CI/CD vs Manual).
2.  `docker/nginx.conf`: The fix for React routing.
3.  `docker/production-entrypoint.sh`: The "Migrate-then-Start" script.
4.  `scripts/deploy.sh`: A helper script you can run on the server if you aren't using GitHub Actions (e.g., `bash scripts/deploy.sh`).

## 4. Proposed Workflow
1.  **You:** Push code to `main`.
2.  **GitHub Action:** SSHs into server.
3.  **Server:**
    *   Pulls latest code.
    *   Builds images (using new robust Dockerfiles).
    *   Starts containers.
    *   API Container automatically runs `db:push`.
    *   Site is live.
