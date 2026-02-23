# OSLRS Infrastructure & CI/CD Playbook

**Created:** 2026-02-21
**Purpose:** Portable, transferable reference for replicating the OSLRS infrastructure and CI/CD pipeline on other projects.
**Source:** Distilled from `SESSION-NOTES-2026-01-20-VPS-SETUP.md`, `vps-setup-checklist.md`, `DEPLOYMENT.md`, `.github/workflows/ci-cd.yml`, `infrastructure-scaling-guide.md`

---

## Architecture Overview

```
                         Internet
                            |
                            v
              ┌──────────────────────────┐
              │   Domain DNS (A Record)  │
              │ oyotradeministry.com.ng  │
              └──────────────────────────┘
                            |
           ┌────────────────┴────────────────┐
           v                                 v
┌─────────────────────────┐    ┌─────────────────────────┐
│  Droplet 1: OSLSR App   │    │  Droplet 2: ODK Central │
│  $12/mo, 2GB RAM        │    │  $12/mo, 2GB RAM        │
│                         │    │                         │
│  NGINX (80/443)         │    │  ODK Central (own NGINX)│
│   ├─ SSL (Let's Encrypt)│    │  Enketo + PostgreSQL    │
│   ├─ / → static files   │    │  Portainer (9443)       │
│   └─ /api → PM2:3000    │    └─────────────────────────┘
│                         │    odkcentral.oyotradeministry.com.ng
│  PM2 → API (tsx:3000)   │
│  Docker: Postgres 15    │
│  Docker: Redis 7        │
│  Portainer (9443)       │
│                         │
│  /var/www/oslsr/ (web)  │
│  ~/oslrs/ (repo clone)  │
└─────────────────────────┘
oyotradeministry.com.ng
```

---

## Part 1: VPS Provisioning (DigitalOcean)

### 1.1 Create Droplet

Via DigitalOcean Console:
- **Image:** Ubuntu 22.04 LTS
- **Plan:** Basic $12/mo (2GB RAM, 1 vCPU, 50GB SSD)
- **Region:** Choose closest to target users
- **Auth:** Add SSH key (see Appendix A)
- **Name:** `oslsr-app`

### 1.2 First Connection & System Setup

```bash
# SSH into droplet
ssh root@<DROPLET_IP>

# System update + essentials
apt update && apt upgrade -y
apt install -y curl wget git vim htop ufw

# Firewall
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 9443/tcp    # Portainer
ufw enable
ufw status
```

### 1.3 Install Docker

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
docker --version
docker compose version
```

### 1.4 Install Portainer (Container Management GUI)

```bash
docker volume create portainer_data
docker run -d -p 8000:8000 -p 9443:9443 \
  --name portainer --restart=always \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:latest

# IMPORTANT: Access https://<DROPLET_IP>:9443 within 5 minutes
# to create admin account, otherwise it locks out (see Pitfalls)
```

### 1.5 Install Node.js 20 + pnpm + PM2

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g pnpm pm2
node --version && pnpm --version
```

### 1.6 Install NGINX + Certbot

```bash
apt install -y nginx certbot
```

---

## Part 2: SSL Certificate (Let's Encrypt)

```bash
# Stop NGINX temporarily for standalone cert
systemctl stop nginx

# Obtain certificate
certbot certonly --standalone -d <YOUR_DOMAIN> -d www.<YOUR_DOMAIN>

# Certificates stored at:
# /etc/letsencrypt/live/<YOUR_DOMAIN>/fullchain.pem
# /etc/letsencrypt/live/<YOUR_DOMAIN>/privkey.pem

# Test auto-renewal
certbot renew --dry-run

# Start NGINX back
systemctl start nginx
```

---

## Part 3: Database Services (Docker)

```bash
# PostgreSQL 15
docker run -d --name oslsr-postgres \
  -p 5432:5432 \
  -e POSTGRES_DB=oslsr_db \
  -e POSTGRES_USER=oslsr_user \
  -e POSTGRES_PASSWORD=<STRONG_PASSWORD> \
  -v postgres_data:/var/lib/postgresql/data \
  --restart=always \
  postgres:15-alpine

# Redis 7
docker run -d --name oslsr-redis \
  -p 6379:6379 \
  -v redis_data:/data \
  --restart=always \
  redis:7-alpine

# Verify both running
docker ps
```

**Alternative (Docker Compose for local dev):**

```bash
# From project root — starts Postgres + Redis
pnpm services:up       # docker compose -f docker/docker-compose.dev.yml up -d
pnpm services:down     # stop
pnpm services:logs     # view logs
```

---

## Part 4: Deploy Application

### 4.1 Clone & Install

```bash
cd ~
git clone https://github.com/<ORG>/oslrs.git
cd oslrs
pnpm install
```

### 4.2 Environment Configuration

```bash
cp .env.example .env
nano .env
```

**Critical production variables:**

```env
NODE_ENV=production
PORT=3000
PUBLIC_APP_URL=https://<YOUR_DOMAIN>

# Database (use the Docker container credentials)
DATABASE_URL=postgres://oslsr_user:<password>@localhost:5432/oslsr_db

# Redis
REDIS_URL=redis://localhost:6379

# Security — generate with: openssl rand -base64 32
JWT_SECRET=<generated-secret>
REFRESH_TOKEN_SECRET=<generated-secret>

# hCaptcha (get from https://dashboard.hcaptcha.com)
# IMPORTANT: The env var name is HCAPTCHA_SECRET_KEY (not HCAPTCHA_SECRET)
HCAPTCHA_SECRET_KEY=<secret>
VITE_HCAPTCHA_SITE_KEY=<site-key>

# Google OAuth (get from Google Cloud Console)
GOOGLE_CLIENT_ID=<client-id>
VITE_GOOGLE_CLIENT_ID=<client-id>

# Email (Resend)
EMAIL_PROVIDER=resend
RESEND_API_KEY=<api-key>
EMAIL_FROM_ADDRESS=noreply@<YOUR_DOMAIN>

# S3 Storage (DigitalOcean Spaces)
S3_ENDPOINT=https://<region>.digitaloceanspaces.com
S3_REGION=<region>
S3_BUCKET_NAME=<bucket-name>
S3_ACCESS_KEY=<access-key>
S3_SECRET_KEY=<secret-key>
```

### 4.3 Database Migrations & Seed

```bash
# Push schema to database (REQUIRED before first run and after any schema changes)
pnpm --filter @oslsr/api db:push

# Seed production admin account (first-time only)
# Use inline env vars so credentials are not persisted in any file.
# IMPORTANT: Put everything on ONE line — multi-line \ commands on VPS terminals
# can corrupt values by inserting whitespace when lines wrap.
SUPER_ADMIN_EMAIL=admin@yourdomain.com SUPER_ADMIN_PASSWORD=YourStr0ngP4ss SUPER_ADMIN_NAME="Admin Name" pnpm --filter @oslsr/api db:seed --admin-from-env

# Seed development data (staging/dev only, never production)
pnpm --filter @oslsr/api db:seed:dev
```

### 4.4 Build & Deploy

```bash
# Build frontend
pnpm --filter @oslsr/web build

# Copy to NGINX web root
mkdir -p /var/www/oslsr
cp -r apps/web/dist/* /var/www/oslsr/
chown -R www-data:www-data /var/www/oslsr

# Start API with PM2
# NOTE: Use tsx (not node) because monorepo packages export .ts source files
pm2 start "npx tsx src/index.ts" --name oslsr-api --cwd ~/oslrs/apps/api
pm2 save
pm2 startup    # auto-start on reboot
```

---

## Part 5: NGINX Configuration

Create `/etc/nginx/sites-available/oslsr`:

```nginx
# HTTP → HTTPS redirect
server {
    listen 80;
    server_name <YOUR_DOMAIN> www.<YOUR_DOMAIN>;
    return 301 https://$server_name$request_uri;
}

# Main HTTPS server
server {
    listen 443 ssl;
    server_name <YOUR_DOMAIN> www.<YOUR_DOMAIN>;

    # SSL
    ssl_certificate /etc/letsencrypt/live/<YOUR_DOMAIN>/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/<YOUR_DOMAIN>/privkey.pem;

    # Frontend — serve static React build
    root /var/www/oslsr;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;  # SPA routing fallback
    }

    # API reverse proxy
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket proxy (Socket.IO realtime notifications)
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
    gzip_min_length 1000;
}
```

```bash
# Enable site, remove default
ln -s /etc/nginx/sites-available/oslsr /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default

# Test and reload
nginx -t
systemctl restart nginx
```

---

## Part 6: CI/CD Pipeline (GitHub Actions)

**File:** `.github/workflows/ci-cd.yml`

### Pipeline Architecture

```
Push to main (or PR)
        ↓
┌──────────────────┐
│  lint-and-build   │  pnpm install → lint → build → upload artifacts
└────────┬─────────┘
         ↓ triggers 5 parallel jobs
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐
│test-unit │ │test-api  │ │test-web  │ │test-e2e  │ │ lighthouse │
│(utils,   │ │(Postgres │ │(no deps) │ │Playwright│ │ perf audit │
│ testing) │ │+ Redis)  │ │          │ │          │ │            │
└────┬─────┘ └────┬─────┘ └────┬─────┘ └──────────┘ └────────────┘
     └─────────────┴────────────┘
                   ↓
          ┌──────────────┐
          │  dashboard    │  merge results → HTML report → GitHub summary
          └───────┬──────┘
                  ↓ (main branch only, after tests pass)
          ┌──────────────┐
          │   deploy      │  SSH → git pull → build → copy → pm2 restart
          └──────────────┘
```

### What CI Checks

| Check | Tool | Purpose |
|-------|------|---------|
| TypeScript strict | `pnpm build` (tsc) | No type errors |
| ESLint | `pnpm lint` | Code style + A3 test rules |
| Unit tests | Vitest (utils, testing) | Package-level tests |
| API tests | Vitest + Postgres + Redis | Integration tests with real DB |
| Web tests | Vitest + jsdom | Component + hook tests |
| E2E tests | Playwright | Browser automation (non-blocking) |
| Performance | Lighthouse CI | Performance, accessibility, SEO scores |
| DB migrations | `db:push:force` | Non-interactive schema push for CI |

### Key CI Optimizations

1. **Turbo Remote Cache** — skip rebuilt packages
2. **Parallel matrix** — unit tests run in parallel per package
3. **PR change detection** — only test packages affected by the PR
4. **Artifact sharing** — build once, test in parallel jobs
5. **Concurrency cancellation** — cancel in-progress runs for same branch

### GitHub Secrets Required

| Secret | Value | Purpose |
|--------|-------|---------|
| `VPS_HOST` | Droplet IP | SSH target |
| `VPS_USERNAME` | `root` | SSH user |
| `SSH_PRIVATE_KEY` | Private key content | SSH auth |

### Deploy Step (runs on VPS via SSH)

```bash
cd ~/oslrs
git pull origin main
pnpm install --frozen-lockfile
pnpm --filter @oslsr/api db:push              # Push schema changes (added 2026-02-23)
VITE_API_URL=https://<YOUR_DOMAIN>/api/v1 pnpm --filter @oslsr/web build  # VITE_ vars are build-time only
sudo cp -r apps/web/dist/* /var/www/oslsr/
pm2 restart oslsr-api
```

> **Why `VITE_API_URL` at build time?** Vite replaces `import.meta.env.VITE_*` during build, not at
> runtime. If omitted, the frontend bakes in `http://localhost:3000` from `.env` and all API calls
> fail with CORS errors in production.

---

## Part 7: Daily Operations

### Check Status

```bash
pm2 status                              # API process
docker ps                               # Postgres, Redis, Portainer
sudo systemctl status nginx             # NGINX
```

### View Logs

```bash
pm2 logs oslsr-api --lines 50           # API logs
docker logs oslsr-postgres              # DB logs
sudo tail -f /var/log/nginx/error.log   # NGINX errors
```

### Restart Services

```bash
pm2 restart oslsr-api                   # API
sudo systemctl restart nginx            # NGINX
docker restart oslsr-postgres oslsr-redis  # DB + Cache
```

### Manual Redeploy

```bash
cd ~/oslrs
git pull origin main
pnpm install
pnpm --filter @oslsr/api db:push
VITE_API_URL=https://<YOUR_DOMAIN>/api/v1 pnpm --filter @oslsr/web build
sudo cp -r apps/web/dist/* /var/www/oslsr/
pm2 restart oslsr-api
```

### Database Operations

```bash
# Run migrations
cd ~/oslrs && pnpm --filter @oslsr/api db:push

# Seed dev data
cd ~/oslrs && pnpm --filter @oslsr/api db:seed:dev

# Clean seeded data
cd ~/oslrs && pnpm --filter @oslsr/api db:seed:clean

# Connect to PostgreSQL directly
docker exec -it oslsr-postgres psql -U oslsr_user -d oslsr_db
```

---

## Part 8: Pitfalls & Solutions

| # | Pitfall | Cause | Solution |
|---|---------|-------|----------|
| 1 | ODK build fails — missing file | Fresh install needs marker | `touch ./files/allow-postgres14-upgrade` |
| 2 | Portainer admin timeout | 5-min lockout on first access | `docker restart portainer`, then immediately create account |
| 3 | SSH refused after reboot | Server still booting | Wait 1-2 min, or use DO web console |
| 4 | NGINX 403 on `/root/` files | `www-data` can't read `/root/` | Serve from `/var/www/oslsr/` instead |
| 5 | API `.ts` extension error | Node can't run `.ts` directly | Use `pm2 start "npx tsx src/index.ts"` |
| 6 | Leading spaces in `.env` | nano paste artifact | `sed -i 's/^ VAR/VAR/' .env` to fix |
| 7 | `db:push` hangs in CI | drizzle-kit 0.21.x interactive prompt | Use `db:push:force` (custom wrapper) |
| 8 | Drizzle schema import fails | `@oslsr/types` has no `dist/` | Inline enum constants in schema files |
| 9 | `column "X" does not exist` after deploy | CI deploy didn't run `db:push` | Add `pnpm --filter @oslsr/api db:push` to deploy step before build. Now fixed in CI. |
| 10 | Frontend calls `localhost:3000` in production | `VITE_API_URL` not set at build time | Pass `VITE_API_URL=https://domain/api/v1` as inline env var during `pnpm build`. Vite bakes `VITE_*` at build time, not runtime. Now fixed in CI. |
| 11 | `HCAPTCHA_SECRET_KEY` missing, API crash-loops | `.env` has `HCAPTCHA_SECRET` but code expects `HCAPTCHA_SECRET_KEY` | Rename in `.env`: `sed -i 's/HCAPTCHA_SECRET=/HCAPTCHA_SECRET_KEY=/' .env && pm2 restart oslsr-api` |
| 12 | `db:seed` email stored with literal quotes | Multi-line shell command with `"` wrapping; VPS terminal inserts whitespace on line-wrap | Always use single-line commands for seed: `SUPER_ADMIN_EMAIL=x SUPER_ADMIN_PASSWORD=y pnpm --filter @oslsr/api db:seed --admin-from-env`. No quotes around simple values. |
| 13 | WebSocket `wss://` connection refused | NGINX missing `/socket.io/` proxy block | Add `location /socket.io/ { proxy_pass ...; proxy_set_header Connection "upgrade"; }` to NGINX config. See Part 5. |
| 14 | `pnpm db:seed` command not found at repo root | Seed script defined in `apps/api`, not root `package.json` | Use `pnpm --filter @oslsr/api db:seed` or `cd apps/api && pnpm db:seed` |
| 15 | `tsx -e` top-level await fails | esbuild CJS output doesn't support top-level await | Wrap in async IIFE: `tsx -e "(async()=>{...})()"`, or write to a temp `.ts` file and run with `tsx /tmp/script.ts` |

---

## Part 9: Cost Summary

| Service | Monthly Cost |
|---------|-------------|
| OSLSR App Droplet (2GB) | $12 |
| ODK Central Droplet (2GB) | $12 |
| DigitalOcean Spaces (250GB) | $5 |
| Droplet Backups (optional) | ~$5 |
| **Total** | **$29-34/mo** |

---

## Part 10: Turbo Configuration

**File:** `turbo.json`

Key pipeline tasks:
- `build` — depends on package builds (`^build`), outputs `dist/**`
- `test` — depends on builds, needs env vars (`DATABASE_URL`, `REDIS_URL`)
- `lint` — no dependencies, no outputs
- `test:e2e` — Playwright, never cached
- `test:dashboard` — HTML report generation, never cached

---

## Part 11: Local Development Quick Start

```bash
# 1. Clone and install
git clone https://github.com/<ORG>/oslrs.git && cd oslrs
pnpm install

# 2. Start database services (Docker)
pnpm services:up

# 3. Create .env
cp .env.example .env
# Edit with your local values

# 4. Push schema to local DB
pnpm --filter @oslsr/api db:push

# 5. Seed dev data
pnpm --filter @oslsr/api db:seed:dev

# 6. Start dev servers (API + Web in parallel)
pnpm dev

# Web: http://localhost:5173
# API: http://localhost:3000
# Dev credentials: admin@dev.local/admin123, supervisor@dev.local/super123, etc.
```

---

## Appendix A: SSH Key Generation

```bash
# Generate key pair (Windows PowerShell or Git Bash)
ssh-keygen -t ed25519 -C "your-email@example.com"

# View public key (copy to DigitalOcean)
cat ~/.ssh/id_ed25519.pub

# Output format:
# ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... your-email@example.com
```

---

## Appendix B: Adapting This Playbook for New Projects

To reuse this infrastructure for a different project:

1. **Replace domain** — update NGINX config, certbot, `.env`
2. **Replace repo URL** — update git clone and GitHub Actions
3. **Replace secrets** — new JWT, DB password, API keys
4. **Keep the stack** — Node 20 + pnpm + PostgreSQL 15 + Redis 7 + NGINX + PM2 + Portainer
5. **Keep the CI/CD structure** — lint → build → test (parallel) → deploy
6. **Keep the patterns** — `db:push:force` for CI, Turbo for monorepo, Vitest split configs

---

*Generated: 2026-02-21*
*Source project: OSLRS (Oyo State Labour & Skills Registry)*
