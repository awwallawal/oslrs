# OSLSR Project Portability & Migration Guide

This guide explains how to move the **OSLSR** project folder to another machine and continue development seamlessly.

## 1. Prerequisites on the New Machine
Ensure the following tools are installed:
- **Node.js 20 LTS** (Check with `node -v`)
- **pnpm** (Install via `npm install -g pnpm`)
- **Docker & Docker Compose** (Required for database and services)
- **Git** (For version control)

## 2. Essential Files to Copy
When copying the project folder, ensure you include:
- **The entire root directory** (`oslrs-main/`)
- **The `.env` file** (CRITICAL: This file is usually hidden and ignored by Git. You must manually copy it from the root directory to ensure API keys and database credentials are preserved.)

## 3. Migration Steps

### Step A: Install Dependencies
Open a terminal in the new project folder and run:
```bash
pnpm install
```
This ensures all packages match the `pnpm-lock.yaml` exactly.

### Step B: Spin Up Infrastructure
Start the required local services (PostgreSQL, Redis, MinIO/S3):
```bash
docker compose -f docker/docker-compose.dev.yml up -d
```

### Step C: Initialize Database
Since Docker volumes are local to the original machine, your new database will be empty.
1. **Push Schema:**
   ```bash
   cd apps/api
   pnpm drizzle-kit push
   ```
2. **Seed Data (Optional):** If you have a seeding script, run it now to populate test users and LGAs.

### Step D: Start Development
Launch both the backend and frontend:
```bash
pnpm dev
```

## 4. Troubleshooting
- **Database Connection Error:** Verify the `DATABASE_URL` in your `.env` file matches the Docker settings.
- **Port Conflict:** If ports 3000, 5173, or 5432 are already in use, stop the conflicting processes.
- **Missing Models:** If face detection fails, ensure the `public/models` directory in `apps/web` was copied correctly.

---
*Generated on: 2026-01-12*
