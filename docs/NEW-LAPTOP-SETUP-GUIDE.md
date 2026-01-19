# OSLSR New Laptop Setup Guide

**Version:** 1.0
**Created:** 2026-01-19
**Purpose:** Step-by-step guide for setting up the OSLSR development environment on a new laptop

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites Checklist](#prerequisites-checklist)
3. [Phase 1: Install Core Tools](#phase-1-install-core-tools)
4. [Phase 2: Clone and Configure Project](#phase-2-clone-and-configure-project)
5. [Phase 3: Start Development Services](#phase-3-start-development-services)
6. [Phase 4: Verify Installation](#phase-4-verify-installation)
7. [Phase 5: IDE Setup](#phase-5-ide-setup)
8. [Troubleshooting](#troubleshooting)
9. [Quick Reference](#quick-reference)

---

## Overview

### What You're Setting Up

| Component | Technology | Purpose |
|-----------|------------|---------|
| **API Server** | Node.js + Express + Drizzle ORM | Backend REST API |
| **Web App** | React 18 + Vite + Tailwind v4 | Frontend PWA |
| **Database** | PostgreSQL 15 | Data storage |
| **Cache/Queue** | Redis 7 | Caching & job queues |
| **Package Manager** | pnpm 9.x | Monorepo dependency management |
| **Build System** | Turborepo | Monorepo task orchestration |

### Project Structure

```
oslsr/
├── apps/
│   ├── api/          # Express.js API (@oslsr/api)
│   └── web/          # React PWA (@oslsr/web)
├── packages/
│   ├── types/        # Shared TypeScript types
│   ├── utils/        # Shared utilities
│   └── testing/      # Test utilities
├── services/
│   └── odk-integration/  # ODK Central integration
├── docker/
│   └── docker-compose.dev.yml  # Local dev services
├── _bmad/            # BMAD method configuration
├── _bmad-output/     # BMAD artifacts (PRD, architecture, stories)
└── docs/             # Documentation
```

---

## Prerequisites Checklist

Before starting, ensure you have:

- [ ] Administrator access on your laptop
- [ ] Stable internet connection
- [ ] At least 20GB free disk space
- [ ] GitHub account with repository access

---

## Phase 1: Install Core Tools

### 1.1 Install Git

**Windows:**
1. Download Git from [git-scm.com](https://git-scm.com/download/win)
2. Run installer with default options
3. **Important:** Select "Git from the command line and also from 3rd-party software"
4. Verify installation:
   ```powershell
   git --version
   # Expected: git version 2.x.x
   ```

**macOS:**
```bash
# Install via Homebrew (recommended)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install git

git --version
```

- [ ] Git installed and verified

---

### 1.2 Install Node.js 20 LTS

**Option A: Direct Download (Simplest)**
1. Go to [nodejs.org](https://nodejs.org/)
2. Download **20.x LTS** (NOT Current)
3. Run installer with default options
4. Verify:
   ```powershell
   node --version
   # Expected: v20.x.x (must be 20.18.1 or higher)

   npm --version
   # Expected: 10.x.x
   ```

**Option B: Using nvm-windows (Recommended for developers)**
1. Download nvm-windows from [github.com/coreybutler/nvm-windows](https://github.com/coreybutler/nvm-windows/releases)
2. Run `nvm-setup.exe`
3. Close and reopen terminal
4. Install Node:
   ```powershell
   nvm install 20.18.1
   nvm use 20.18.1
   node --version
   ```

**Option C: Using nvm (macOS/Linux)**
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc  # or ~/.zshrc

nvm install 20.18.1
nvm use 20.18.1
node --version
```

- [ ] Node.js 20.x installed and verified

---

### 1.3 Install pnpm 9.x

pnpm is the package manager used by this project. **Do not use npm or yarn.**

```powershell
# Install pnpm globally
npm install -g pnpm@9.15.0

# Verify installation
pnpm --version
# Expected: 9.15.0
```

**If you get permission errors on Windows:**
```powershell
# Run PowerShell as Administrator, then:
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
npm install -g pnpm@9.15.0
```

- [ ] pnpm 9.x installed and verified

---

### 1.4 Install Docker Desktop

Docker runs PostgreSQL and Redis locally so you don't have to install them directly.

**Windows:**
1. Download from [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/)
2. Run installer
3. **Important:** Enable "Use WSL 2 instead of Hyper-V" if prompted
4. Restart your computer when prompted
5. Open Docker Desktop and complete setup
6. Verify:
   ```powershell
   docker --version
   # Expected: Docker version 24.x.x or higher

   docker compose version
   # Expected: Docker Compose version v2.x.x
   ```

**macOS:**
1. Download from [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/)
2. Drag to Applications folder
3. Open Docker Desktop and complete setup
4. Verify same commands as above

**Troubleshooting Docker on Windows:**
- If Docker won't start, ensure WSL 2 is installed:
  ```powershell
  wsl --install
  # Restart computer, then try Docker again
  ```

- [ ] Docker Desktop installed and running
- [ ] Docker Compose available

---

### 1.5 Generate SSH Key (For GitHub)

If you haven't already set up SSH for GitHub:

**Windows (PowerShell):**
```powershell
# Generate SSH key
ssh-keygen -t ed25519 -C "your_email@example.com"
# Press Enter for default location, then enter passphrase (or leave empty)

# View your public key
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
```

**macOS/Linux:**
```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
cat ~/.ssh/id_ed25519.pub
```

**Add to GitHub:**
1. Copy the public key output
2. Go to GitHub → Settings → SSH and GPG keys → New SSH key
3. Paste and save

**Test connection:**
```bash
ssh -T git@github.com
# Expected: "Hi username! You've successfully authenticated..."
```

- [ ] SSH key generated and added to GitHub

---

## Phase 2: Clone and Configure Project

### 2.1 Clone the Repository

```powershell
# Navigate to your preferred directory
cd C:\Users\YourUsername\Desktop
# Or: cd ~/Desktop (macOS/Linux)

# Clone via SSH (recommended)
git clone git@github.com:awwallawal/oslrs.git

# Or clone via HTTPS (if SSH not set up)
git clone https://github.com/awwallawal/oslrs.git

# Enter project directory
cd oslrs
```

- [ ] Repository cloned successfully

---

### 2.2 Install Dependencies

```powershell
# Install all dependencies across the monorepo
pnpm install
```

**This will take 2-5 minutes** depending on your internet speed. You'll see output like:
```
Packages: +1234
++++++++++++++++++++++++++++++++++++++++++++
Progress: resolved 1234, reused 0, downloaded 1234, added 1234, done
```

**If you see errors:**
- `EACCES` or permission errors → Run terminal as Administrator
- `ERESOLVE` → Try `pnpm install --force`
- Network errors → Check internet connection, try again

- [ ] Dependencies installed successfully

---

### 2.3 Configure Environment Variables

```powershell
# Copy example environment file
copy .env.example .env
# Or on macOS/Linux: cp .env.example .env
```

**Edit `.env` file** (use VS Code, Notepad++, or any text editor):

For **local development**, the defaults should work:
```env
# App Database (PostgreSQL 15) - matches docker-compose.dev.yml
DATABASE_URL=postgres://user:password@localhost:5432/app_db

# Redis (Job Queue & Caching)
REDIS_URL=redis://localhost:6379

# Public URL (Vite dev server)
PUBLIC_APP_URL=http://localhost:5173

# Security (generate your own for production, these are fine for dev)
JWT_SECRET=dev-jwt-secret-change-in-production
REFRESH_TOKEN_SECRET=dev-refresh-secret-change-in-production

# Server Config
PORT=3000
NODE_ENV=development
```

**Important:** The `DATABASE_URL` credentials must match `docker/docker-compose.dev.yml`:
- User: `user`
- Password: `password`
- Database: `app_db`

- [ ] `.env` file created and configured

---

## Phase 3: Start Development Services

### 3.1 Start Docker Services (PostgreSQL + Redis)

**Ensure Docker Desktop is running first!**

```powershell
# Start database and cache services
pnpm services:up
```

You should see:
```
[+] Running 2/2
 ✔ Container oslsr_redis     Started
 ✔ Container oslsr_postgres  Started
```

**Verify services are running:**
```powershell
docker ps
```

Expected output:
```
CONTAINER ID   IMAGE              STATUS          PORTS
xxxx           postgres:15-alpine Up X seconds    0.0.0.0:5432->5432/tcp
xxxx           redis:7-alpine     Up X seconds    0.0.0.0:6379->6379/tcp
```

- [ ] PostgreSQL container running
- [ ] Redis container running

---

### 3.2 Initialize Database Schema

```powershell
# Push database schema to PostgreSQL
pnpm --filter @oslsr/api db:push
```

You should see output indicating tables were created.

**If you get connection errors:**
1. Check Docker is running: `docker ps`
2. Check DATABASE_URL in `.env` matches docker-compose credentials
3. Wait 10 seconds for PostgreSQL to fully start, then retry

- [ ] Database schema initialized

---

### 3.3 Start Development Servers

```powershell
# Start all dev servers (API + Web)
pnpm dev
```

This starts:
- **API Server** at `http://localhost:3000`
- **Web App** at `http://localhost:5173`

You'll see output from both servers. Look for:
```
@oslsr/api: Server running on port 3000
@oslsr/web: VITE v5.x.x ready in XXX ms
@oslsr/web: Local: http://localhost:5173/
```

**Keep this terminal running!** Open a new terminal for other commands.

- [ ] API server running on port 3000
- [ ] Web app running on port 5173

---

## Phase 4: Verify Installation

### 4.1 Test API Health

Open a new terminal or browser:

```powershell
# Test API health endpoint
curl http://localhost:3000/api/health
# Or just open http://localhost:3000/api/health in browser
```

Expected response:
```json
{"status":"ok"}
```

- [ ] API health check passes

---

### 4.2 Test Web App

Open browser and go to: **http://localhost:5173**

You should see the OSLSR homepage or login page.

- [ ] Web app loads in browser

---

### 4.3 Run Tests

```powershell
# Run all tests
pnpm test
```

All tests should pass. If some fail, check the error messages.

- [ ] Tests pass

---

## Phase 5: IDE Setup

### 5.1 Install VS Code (Recommended)

1. Download from [code.visualstudio.com](https://code.visualstudio.com/)
2. Install with default options

---

### 5.2 Recommended VS Code Extensions

Open VS Code, go to Extensions (Ctrl+Shift+X), and install:

| Extension | Purpose |
|-----------|---------|
| **ESLint** | JavaScript/TypeScript linting |
| **Prettier** | Code formatting |
| **Tailwind CSS IntelliSense** | Tailwind autocomplete |
| **TypeScript Vue Plugin (Volar)** | Better TypeScript support |
| **Docker** | Docker file support |
| **GitLens** | Enhanced Git features |
| **Error Lens** | Inline error highlighting |

---

### 5.3 Open Project in VS Code

```powershell
# From project root
code .
```

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| `pnpm: command not found` | Reinstall pnpm: `npm install -g pnpm@9.15.0` |
| `docker: command not found` | Ensure Docker Desktop is installed and running |
| `Port 3000 already in use` | Run `pnpm clean:ports` or manually kill the process |
| `Port 5173 already in use` | Same as above |
| `ECONNREFUSED` to database | Check Docker is running: `docker ps` |
| `Permission denied` on Windows | Run terminal as Administrator |
| `node: command not found` | Reinstall Node.js, restart terminal |
| Git clone fails | Check SSH key is added to GitHub |
| `DATABASE_URL is not set` during db:push | Ensure `.env` file exists in project root (not in `apps/api/`). See [Database Issues](#database-issues) below. |
| TypeScript error in `registration-rate-limit.ts` | This was fixed in the codebase. If you see this error, pull the latest changes from the repository. |

### Port Cleanup

If you have zombie processes holding ports:

```powershell
# Clean all common dev ports
pnpm clean:ports
```

### Database Issues

#### "DATABASE_URL is not set in environment variables"

This error can occur when running `pnpm --filter @oslsr/api db:push` or `pnpm dev` if the `.env` file cannot be found.

**Checklist:**
1. Ensure `.env` file exists in the **project root** (not in `apps/api/`)
2. Verify it contains `DATABASE_URL=postgres://user:password@localhost:5432/app_db`
3. Ensure Docker containers are running: `docker ps` should show `oslsr_postgres`

**Note:** All API source files are configured to load `.env` from the monorepo root using explicit path resolution (e.g., `path.resolve(__dirname, '../../../.env')`). This is required because in a monorepo, the working directory varies depending on how commands are run.

### Reset Everything

If things are broken and you want to start fresh:

```powershell
# Stop all services
pnpm services:down

# Remove Docker volumes (WARNING: deletes database data)
docker volume rm oslsr_postgres_data_dev oslsr_redis_data_dev

# Remove node_modules
rm -rf node_modules
rm -rf apps/api/node_modules
rm -rf apps/web/node_modules
rm -rf packages/*/node_modules

# Reinstall
pnpm install

# Start fresh
pnpm services:up
pnpm --filter @oslsr/api db:push
pnpm dev
```

### View Docker Logs

```powershell
# View all service logs
pnpm services:logs

# View specific container logs
docker logs oslsr_postgres
docker logs oslsr_redis
```

---

## Quick Reference

### Daily Development Commands

```powershell
# Start everything (run in project root)
pnpm services:up    # Start PostgreSQL + Redis
pnpm dev            # Start API + Web servers

# Stop everything
Ctrl+C              # Stop dev servers
pnpm services:down  # Stop Docker services
```

### Database Commands

```powershell
# Push schema changes to database
pnpm --filter @oslsr/api db:push

# Generate migrations
pnpm --filter @oslsr/api db:generate

# Open Drizzle Studio (database GUI)
pnpm --filter @oslsr/api db:studio
```

### Testing Commands

```powershell
pnpm test              # Run all tests
pnpm test:web          # Run web tests only
pnpm test:golden       # Run golden path tests
pnpm test:security     # Run security tests
```

### Build Commands

```powershell
pnpm build             # Build all packages
pnpm lint              # Run linter
```

### URLs

| Service | URL |
|---------|-----|
| Web App | http://localhost:5173 |
| API | http://localhost:3000 |
| API Health | http://localhost:3000/api/health |
| Drizzle Studio | http://localhost:4983 (when running) |

---

## Version Requirements Summary

| Tool | Required Version | Check Command |
|------|-----------------|---------------|
| Node.js | 20.x (20.18.1+) | `node --version` |
| pnpm | 9.x (9.15.0) | `pnpm --version` |
| Docker | 24.x+ | `docker --version` |
| Git | 2.x+ | `git --version` |

---

## Need Help?

1. Check this guide's troubleshooting section
2. Check the main `README.md` in the project root
3. Look at existing GitHub issues
4. Ask the team

---

*Document created: 2026-01-19*
*Created by: BMad Master for Awwal's laptop transition*
