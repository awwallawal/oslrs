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

**Canonical source of truth:** [`infra/nginx/oslsr.conf`](../infra/nginx/oslsr.conf) in this repo.

Since Story 9-7 (2026-04-11), the production nginx config lives in the repo at `infra/nginx/oslsr.conf` and is deployed automatically via CI. **Do not edit `/etc/nginx/sites-available/oslsr` directly on the VPS** — any manual edit will be overwritten on the next deploy.

**What's in `infra/nginx/oslsr.conf`:**
- HTTP → HTTPS redirect server block
- HTTPS main server block with `http/2` enabled
- TLS hardening: `ssl_protocols TLSv1.2 TLSv1.3` (override of stock Ubuntu default that inherits the deprecated TLSv1/1.1)
- `server_tokens off` — hide nginx version from `Server:` header
- 6 security headers: HSTS, X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy
- 1-year immutable cache headers on fingerprinted static assets (JS/CSS/images/fonts)
- `/api` reverse proxy to `localhost:3000`
- `/socket.io/` WebSocket proxy

**CI deploy wiring (see `.github/workflows/ci-cd.yml` deploy step):**

```bash
sudo cp infra/nginx/oslsr.conf /etc/nginx/sites-available/oslsr
sudo nginx -t && sudo systemctl reload nginx
```

The `nginx -t` acts as a gate — malformed config aborts reload, and the previous good config stays live. Zero site-down risk.

**First-time manual bootstrap (only if provisioning a brand-new VPS before CI has run):**

```bash
# Copy the file from the repo
sudo cp infra/nginx/oslsr.conf /etc/nginx/sites-available/oslsr
# Enable site, remove default
sudo ln -s /etc/nginx/sites-available/oslsr /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

After the first CI deploy, subsequent updates flow automatically — never touch the VPS file by hand.

---

## Part 5.1: Content Security Policy (CSP)

**Added:** 2026-03-01 (Story SEC-2) | **Updated:** 2026-04-12 (Story 9-8 — parity test, rollback recipe, corrected enforcement state)

### Architecture: Two-Layer CSP

OSLRS uses a **two-layer CSP** because NGINX and Express serve different content:

| Layer | Serves | CSP Source | Enforcement |
|-------|--------|------------|-------------|
| **NGINX** | SPA `index.html`, static JS/CSS/fonts | `add_header` in `infra/nginx/oslsr.conf` | Report-Only (promotion to enforcing via single-line rename) |
| **Express (Helmet)** | API JSON responses (`/api/v1/*`) | `cspDirectives` export in `apps/api/src/app.ts` | **Already enforcing in production** since sec2-3 (2026-04-04) |

Both layers **must** have identical CSP directives. The `csp-parity.test.ts` test file enforces this invariant — if you edit one side without the other, CI fails.

### Drift Protection: `csp-parity.test.ts`

**File:** `apps/api/src/__tests__/csp-parity.test.ts` (6 tests)

Reads the `cspDirectives` export from `apps/api/src/app.ts` and the nginx conf text from `infra/nginx/oslsr.conf`, normalizes both (directive ordering, source-list sorting, `wsUrl` substitution, `upgrade-insecure-requests` conditional handling), and asserts byte-level parity. Also runs a supertest round-trip against the Express app to verify the live wire header matches the nginx config.

**Example failure if someone edits Helmet but not nginx:**
```
FAIL  Helmet has "https://new-service.example.com" in script-src but nginx does not
```

### How to Add a New Third-Party Domain

1. Edit the `cspDirectives` object in `apps/api/src/app.ts` (add the domain to the appropriate directive's source array)
2. Edit `infra/nginx/oslsr.conf` — add the same domain to the matching directive in BOTH the server-level and static-asset location `Content-Security-Policy` `add_header` values
3. Run `pnpm vitest run apps/api/src/__tests__/csp-parity.test.ts` — confirm parity test passes
4. Commit and push — CI deploys both changes atomically

**When NOT to add a new source:** if the new dependency serves a JS/CSS bundle from its own CDN (e.g., a new analytics provider), prefer bundling it locally (`pnpm add` + Vite tree-shake) over allowlisting an external domain. Every domain in the allowlist is a trust anchor — a compromise of that CDN affects your users.

### `style-src 'unsafe-inline'` Justification

`'unsafe-inline'` is required in `style-src` because:
- shadcn/ui (Radix `react-style-singleton`) injects `<style>` tags for scroll locking
- Recharts renders SVG with inline `style` attributes
- Sonner toast uses inline styles for positioning
- Google Identity Services SDK and hCaptcha widget inject inline styles
- 25+ application components use `style={{}}` for dynamic widths/heights
- PERF-1 critical-CSS `<style>` block in `apps/web/index.html:47-118` (LCP optimization)

This is an accepted tradeoff — inline styles cannot execute code (unlike inline scripts). A nonce-based approach would require server-rendered HTML.

### Promoting NGINX from Report-Only to Enforcing

**Prerequisites:** 48+ hours of monitoring with zero legitimate violations in `/api/v1/csp-report` logs (or self-testing across 2-3 browsers covering the full feature matrix).

**Single-line change** — in `infra/nginx/oslsr.conf`, rename the header in BOTH the server-level and static-asset location blocks:

```diff
- add_header Content-Security-Policy-Report-Only "..." always;
+ add_header Content-Security-Policy "..." always;
```

Commit, push, CI deploys. Helmet is already enforcing in production (`reportOnly: process.env.NODE_ENV !== 'production'` evaluates to `false` on the VPS) — the nginx change is the only step needed.

### 2-Minute Emergency Rollback (Enforcing → Report-Only)

If a regression breaks user flows after promotion, revert in under 2 minutes:

```bash
# SSH to VPS
ssh root@oyotradeministry.com.ng

# Edit in-place: rename Content-Security-Policy back to Report-Only
sudo sed -i 's/Content-Security-Policy "/Content-Security-Policy-Report-Only "/g' /etc/nginx/sites-available/oslsr

# Validate + reload (no downtime)
sudo nginx -t && sudo systemctl reload nginx
```

Then immediately open a hotfix PR with the same `sed` applied to `infra/nginx/oslsr.conf` so the NEXT CI deploy doesn't re-enforce.

### Interpreting a CSP Violation Report

Violations POST to `/api/v1/csp-report` (handled by `apps/api/src/routes/csp.routes.ts`). Payload example:

```json
{
  "csp-report": {
    "document-uri": "https://oyotradeministry.com.ng/dashboard",
    "violated-directive": "script-src 'self' https://accounts.google.com ...",
    "blocked-uri": "https://evil-extension.example.com/inject.js",
    "source-file": "https://oyotradeministry.com.ng/assets/index-C5E2kt7y.js",
    "line-number": 1,
    "column-number": 42
  }
}
```

| Field | What it means |
|-------|--------------|
| `document-uri` | The page URL where the violation occurred |
| `violated-directive` | Which CSP directive blocked the resource |
| `blocked-uri` | The URL that was blocked (inspect this first) |
| `source-file` + `line-number` | Where in the JS the violating request originated |

**Common patterns:** browser extensions inject scripts from unknown domains (noise — document and ignore); Google/hCaptcha rotates CDN subdomains (legitimate — the `*.hcaptcha.com` wildcard handles this but new root domains need adding).

### Validating CSP is Active

```bash
# Check API responses (Helmet — already enforcing)
curl -sI https://oyotradeministry.com.ng/api/v1/health | grep -i content-security

# Check SPA page (NGINX — Report-Only until promoted)
curl -sI https://oyotradeministry.com.ng/ | grep -i content-security
```

API should return `Content-Security-Policy:` (enforcing). SPA should return `Content-Security-Policy-Report-Only:` (until promotion).

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

### Pre-Deploy Env Var Check

**Added:** 2026-03-05 (Story prep-2)

Before every deploy, the CI pipeline validates that all required environment variables exist on the VPS `.env` file. This prevents crash-restart loops like the SEC-3 incident (2026-03-02), where `CORS_ORIGIN` was added to `requiredProdVars` but not set on the VPS, causing 12+ PM2 crash cycles.

**How it works:**

1. CI fetches the latest code from `origin/main` on the VPS (without pulling)
2. Extracts the latest `scripts/check-env.sh` and `apps/api/src/app.ts` via `git show`
3. Runs the check script against the VPS `.env` file
4. If any required var is missing → deploy **aborts** (app is never restarted)
5. If all required vars present → deploy proceeds normally

**Adding a new required env var:**

1. Add the var name to `requiredProdVars` array in `apps/api/src/app.ts`
2. **Before deploying:** SSH to VPS and add the var to `~/oslrs/.env`
3. Deploy — the pre-deploy check will now validate the new var

> **Critical rule:** Always set the var on VPS `.env` BEFORE deploying code that requires it.
> The pre-deploy check catches this if you forget, but the fix is still manual.

**Running the check manually on VPS:**

```bash
cd ~/oslrs
bash scripts/check-env.sh
# Or with custom paths:
bash scripts/check-env.sh --env-file /path/to/.env --app-ts /path/to/app.ts
```

**What it checks:**

| Category | Behavior |
|----------|----------|
| Required vars (from `requiredProdVars` in app.ts) | FAIL — blocks deployment |
| Empty required var values | FAIL — blocks deployment |
| JWT_SECRET length < 32 chars | FAIL — blocks deployment |
| S3, Email, OAuth vars | WARN — deployment proceeds |

### Deploy Step (runs on VPS via SSH)

```bash
cd ~/oslrs
git pull origin main
pnpm install --frozen-lockfile
pnpm --filter @oslsr/api db:push              # Push schema changes (added 2026-02-23)
cd apps/api && pnpm tsx scripts/migrate-audit-immutable.ts && cd ~/oslrs  # Idempotent migration (added 2026-02-26)
sudo cp -r /tmp/oslrs-web-dist-${GITHUB_SHA}/* /var/www/oslsr/  # Wave 0: dist from cloud-runner artifact
sudo rm -rf /tmp/oslrs-web-dist-${GITHUB_SHA}
pm2 restart oslsr-api
```

> **Why `VITE_API_URL` at build time?** Vite replaces `import.meta.env.VITE_*` during build, not at
> runtime. If omitted, the frontend bakes in `http://localhost:3000` from `.env` and all API calls
> fail with CORS errors in production. Now baked in by the cloud-runner build (`VITE_API_URL=/api/v1`)
> per Part 6.2 below — the VPS no longer runs vite+tsc.

### Part 6.2: Build Off-VPS Artifact Handoff (added 2026-04-27, Wave 0)

**Problem:** Until Wave 0, every deploy ran `pnpm --filter @oslsr/web build` on the 2GB VPS,
consuming 700MB-1GB RAM + 70-90% CPU for 2-3 minutes. The system-health digest tripped CRITICAL
thresholds on every deploy and trained operators to ignore alerts. Triage of the 2026-04-27 06:32
UTC alert (commit `718f84e` Story 9-10 evidence) confirmed PM2 ↺ counter inflation was deploy-driven,
not spontaneous.

**Solution:** The `lint-and-build` job already builds `dist/` on a GitHub-hosted cloud runner and
uploads it as the `build-artifacts` artifact (consumed by the test-* jobs). The deploy job now
downloads the same artifact and ships `apps/web/dist` to the VPS via `appleboy/scp-action`. The VPS
side runs `cp` instead of `vite+tsc`.

```text
push to main
   │
   ▼
lint-and-build (cloud runner, GH-hosted)
   - pnpm install
   - pnpm lint
   - VITE_API_URL=/api/v1 pnpm build         ← bakes relative URL into apps/web/dist
   - upload-artifact build-artifacts          ← apps/*/dist + packages/*/dist + .turbo
   │
   ▼
test-unit / test-api / test-web / lighthouse  (cloud runners, parallel — unchanged)
   │
   ▼
deploy (cloud runner, then SSH to VPS)
   - download-artifact build-artifacts                              ← NEW, ~10s
   - scp-action: build-artifacts/apps/web/dist → /tmp/oslrs-web-dist-<sha>  ← NEW, ~30s
   - SSH:
       git pull origin main
       pnpm install --frozen-lockfile          (kept — runtime tsx needs node_modules)
       pnpm --filter @oslsr/api db:push
       pnpm tsx scripts/migrate-audit-immutable.ts
       sudo cp -r /tmp/oslrs-web-dist-<sha>/* /var/www/oslsr/      ← NEW, no vite/tsc
       sudo rm -rf /tmp/oslrs-web-dist-<sha>
       nginx backup → copy → test → reload
       pm2 restart oslsr-api
```

**Why `VITE_API_URL=/api/v1` at the lint-and-build step:** Vite bakes `import.meta.env.VITE_*` at
build time. Setting `VITE_API_URL: /api/v1` in the `Build` step's `env:` block makes the relative
URL the canonical artifact value. Test jobs don't care (vitest re-compiles from source), and
lighthouse rebuilds its own dist for perf measurement, so this doesn't affect either.

**Why `${{ github.sha }}` namespacing on the temp dir:** Concurrent or retried deploys never collide,
and a failed deploy leaves the leftover dir tagged with its own SHA — easy to identify and clean up
later (`rm -rf /tmp/oslrs-web-dist-*` is safe between deploys).

**Why scp-action and not rsync:** Same maintainer as `appleboy/ssh-action` we already use →
consistent auth + retry semantics. `strip_components: 4` flattens
`build-artifacts/apps/web/dist/index.html` to `index.html` on the VPS side. Fall back to
`rsync -az` over SSH only if scp-action is measured slow (cloud runner backbone is fast; expect
<30s for ~50MB dist).

**Why `pnpm install` is preserved on VPS:** The API runs via `pnpm tsx src/index.ts` at runtime;
`tsx` resolves modules through `node_modules/`. To eliminate the install we'd need to either ship
a `node_modules` tarball (~500MB+, fragile) or bundle the API into a single file via tsup/esbuild
(multi-day work; deferred to a future story if 9-10 trajectory data still shows residual spikes).
The `pnpm install` peak is ~400MB — bounded and far below the ~1GB build-step peak we eliminated.

**Resource impact:** During-deploy CPU drops from 70-90% to <30% (1-min load avg <0.5); memory peak
drops from ~1.5-1.8Gi to <1Gi; total wall-clock from ~7 min to <4 min. CRITICAL system-health
digests during deploy windows stop firing.

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

> **Use only for emergency recovery when CI is unreachable.** Routine deploys go through CI
> (`git push origin main`) which runs the cloud-runner artifact handoff per Part 6.2 — no
> VPS-side build, no CPU/memory spike. The manual snippet below INTENTIONALLY runs vite+tsc on
> the VPS and WILL trip the CRITICAL system-health digest (Pitfall #22). Accept the spike only
> when the alternative is downtime.

```bash
cd ~/oslrs
git pull origin main
pnpm install
pnpm --filter @oslsr/api db:push
cd apps/api && pnpm tsx scripts/migrate-audit-immutable.ts && cd ~/oslrs

# All three VITE_* values must be set on the same line (Vite bakes them at build time
# and the VPS .env supplies the canonical source). Skipping VITE_HCAPTCHA_SITE_KEY or
# VITE_GOOGLE_CLIENT_ID falls back to the hCaptcha public test sitekey + empty Google
# client ID — login captcha breaks silently. See Pitfall #23.
set -a; source /root/oslrs/.env; set +a
VITE_API_URL=https://<YOUR_DOMAIN>/api/v1 \
  VITE_HCAPTCHA_SITE_KEY="${VITE_HCAPTCHA_SITE_KEY}" \
  VITE_GOOGLE_CLIENT_ID="${VITE_GOOGLE_CLIENT_ID}" \
  pnpm --filter @oslsr/web build

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

### Periodic Maintenance (quarterly)

```bash
# Sweep orphaned Wave 0 artifact temp dirs. Each deploy creates
# /tmp/oslrs-web-dist-<sha>/ and the deploy script's EXIT trap cleans up
# normally — but a hard kill mid-deploy could leak one. Idempotent.
ssh root@oslsr-home-app 'rm -rf /tmp/oslrs-web-dist-* 2>/dev/null; ls -la /tmp/oslrs-* 2>/dev/null || echo "clean"'

# Sweep the previous-dist backup (M3 — the deploy script keeps only one
# generation, so this is normally a no-op verifier, not a cleaner).
ssh root@oslsr-home-app 'du -sh /var/www/oslsr.bak.prev 2>/dev/null || echo "no backup present"'
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
| 10 | Frontend calls `localhost:3000` in production | `VITE_API_URL` not set at build time | Pass `VITE_API_URL=https://domain/api/v1` as inline env var during `pnpm build`. Vite bakes `VITE_*` at build time, not runtime. **Updated 2026-04-29:** VPS-side build was removed in Wave 0 (`prep-build-off-vps-cloud-runner`). The `VITE_*` values now flow through the cloud-runner `Build` step's `env:` block — see Part 6.2 (cloud-runner artifact handoff) and Pitfall #23 (full inventory of VITE_* fallbacks). Pitfall #10 retains relevance only for emergency manual recovery on the VPS itself. |
| 11 | `HCAPTCHA_SECRET_KEY` missing, API crash-loops | `.env` has `HCAPTCHA_SECRET` but code expects `HCAPTCHA_SECRET_KEY` | Rename in `.env`: `sed -i 's/HCAPTCHA_SECRET=/HCAPTCHA_SECRET_KEY=/' .env && pm2 restart oslsr-api` |
| 12 | `db:seed` email stored with literal quotes — **and inserted into `users` table as a real super_admin row** that the digest sender will then try to deliver to | Multi-line shell command with `"` wrapping; VPS terminal inserts whitespace + trailing `\` on line-wrap. Both `.env` AND any seed run that consumed it are corrupted — `--admin-from-env` INSERTs the broken value as a `users` row that `getActiveSuperAdminEmails()` returns to the digest sender (silent bounce target). | (a) Always use single-line commands for seed: `SUPER_ADMIN_EMAIL=x SUPER_ADMIN_PASSWORD=y pnpm --filter @oslsr/api db:seed --admin-from-env`. No quotes around simple values. (b) After ANY `--admin-from-env` run, audit: `SELECT email FROM users INNER JOIN roles ON users.role_id=roles.id WHERE roles.name='super_admin'` — any email containing `"`, leading/trailing whitespace, or `\` is a fossil. Sweep FK refs via `information_schema` (12 tables FK to `users.id` as of 2026-04-26), then hard-delete. Validated 2026-04-26: 1 fossil row purged from prod, 0 FK refs. |
| 13 | WebSocket `wss://` connection refused | NGINX missing `/socket.io/` proxy block | Add `location /socket.io/ { proxy_pass ...; proxy_set_header Connection "upgrade"; }` to NGINX config. See Part 5. |
| 14 | `pnpm db:seed` command not found at repo root | Seed script defined in `apps/api`, not root `package.json` | Use `pnpm --filter @oslsr/api db:seed` or `cd apps/api && pnpm db:seed` |
| 15 | `tsx -e` top-level await fails | esbuild CJS output doesn't support top-level await | Wrap in async IIFE: `tsx -e "(async()=>{...})()"`, or write to a temp `.ts` file and run with `tsx /tmp/script.ts` |
| 16 | PM2 crash-restart loop after deploy | New code requires env var not set on VPS `.env` | Pre-deploy check now catches this automatically. Fix: add var to VPS `.env` before deploying. See "Pre-Deploy Env Var Check" in Part 6. |
| 17 | Docker-UFW bypass: Redis/Postgres publicly exposed | Docker writes iptables rules directly, bypassing UFW firewall completely | ALWAYS bind to `127.0.0.1:HOST_PORT:CONTAINER_PORT` in `docker-compose.yml`. Use DigitalOcean Cloud Firewall as the true perimeter (hypervisor-level, Docker-proof). Never rely on UFW alone for Docker services. |
| 18 | Local tests pass but CI's `pnpm build` fails on TS errors | vitest uses tsx (transpile-only, no strict type check); CI runs `tsc` which IS strict. Type errors slip past local test runs. | (superseded 2026-04-30) Pre-commit hook now runs `tsc --noEmit --incremental` automatically on staged `.ts`/`.tsx` changes in `apps/(api|web)/`. See `.husky/pre-commit`. Bypass with `git commit --no-verify` if needed. Originating CI failure (2026-04-27): `proxy-addr` import — missing `@types/`-package + 2-arg trust fn signature, two CI rounds (`bf98931` → `1383373`). **Cache recovery:** if the hook reports clean but CI still catches type errors, clear the incremental cache: `rm apps/*/tsconfig.tsbuildinfo apps/web/tsconfig.node.tsbuildinfo` and re-stage (rare; happens after heavy branch-switching with mid-write interrupts). |
| 19 | `req.ip` resolves to Cloudflare edge IP after CF proxy enabled | CF doesn't always include the real client in X-Forwarded-For — sometimes only the CF edge. Express's trust-proxy walking has nothing untrusted to stop at and returns the last trusted IP (CF edge). Effects: rate-limit buckets all CF-edge-served users together; audit logs show CF edge IPs. | Read `CF-Connecting-IP` header directly — Cloudflare sets it on every proxied request and overwrites any client-supplied value. See `apps/api/src/middleware/real-ip.ts` for the canonical implementation. Security guard: only honor the header when `X-Real-IP` (set by nginx to immediate-client) is in published Cloudflare IP ranges, else an attacker bypassing CF could spoof it. Trust-proxy whitelist with CF IPs stays as defense-in-depth fallback for non-CF traffic. |
| 20 | Cloudflare auto-injects content into `robots.txt` | When a zone is proxied (orange-cloud), CF prepends "Cloudflare Managed Content" with bot-blocking directives (Amazonbot, ClaudeBot, GPTBot, etc.) to the response. Visible in HTTP responses, NOT in the source file on disk. | This is automatic and not a security concern. Don't try to "remove it" by editing the source file — your edits are appended below the CF content. Configure CF's bot-blocking rules in the dashboard if you want them disabled. |
| 21 | Email delivery breaks instantly when DNS records flipped to proxied | MX records cannot be proxied — Cloudflare doesn't proxy SMTP. SPF/DKIM TXT records get cached/rewritten in transit, breaking authentication. | Email DNS records (MX × all, TXT for SPF/DKIM/DMARC) MUST stay DNS-only/grey-cloud forever, regardless of zone-level proxy choices for A/CNAME records. Document this as immutable in zone setup; verify after every Cloudflare config change. |

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

## Part 7: Tailscale Operator Access (added 2026-04-25)

**Goal:** restrict SSH access to a private overlay network rather than relying on public-internet exposure.

**See also:** `docs/emergency-recovery-runbook.md` for break-glass paths; `_bmad-output/planning-artifacts/architecture.md` ADR-020 for full decision rationale.

### One-time setup (per VPS + per operator device)

```bash
# On VPS (existing public-IP SSH session):
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --hostname=<droplet-name>
# Browser-auth flow; copy URL, click Connect
tailscale status
tailscale ip -4    # save the 100.x.x.x address

# On operator laptop (Windows):
# Download MSI: https://tailscale.com/download/windows
# Sign in with same Google account
# Verify both devices online: tailscale status
```

In Tailscale admin console, **enable MagicDNS** so `ssh root@<droplet-name>` works without remembering IPs.

### SSH key authentication (required before firewall lockdown)

```powershell
# On laptop:
Get-ChildItem $env:USERPROFILE\.ssh -Force
# If no id_ed25519: ssh-keygen -t ed25519 -C "<email>" -f $env:USERPROFILE\.ssh\id_ed25519

# Append public key to VPS (NOTE: >> not > — preserves existing keys like github-actions-deploy):
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh root@<droplet-name> "cat >> ~/.ssh/authorized_keys"

# Create ~/.ssh/config:
Set-Content -Path $env:USERPROFILE\.ssh\config -Encoding ASCII -Value @('Host <droplet-name>','    HostName <droplet-name>','    User root','    IdentityFile ~/.ssh/id_ed25519','    IdentitiesOnly yes')

# Verify key-only login works:
ssh -o PasswordAuthentication=no root@<droplet-name>
```

### sshd hardening — drop-in override is the gotcha

```bash
sudo nano /etc/ssh/sshd_config
# Set: PermitRootLogin prohibit-password
# Set: PasswordAuthentication no
# Set: PubkeyAuthentication yes

# CRITICAL: also check drop-ins (first-value-wins!):
sudo grep -rE "^(PermitRootLogin|PasswordAuthentication|PubkeyAuthentication)" /etc/ssh/sshd_config.d/
# /etc/ssh/sshd_config.d/50-cloud-init.conf often has PasswordAuthentication yes — overrides main file
# Edit any drop-ins to match

sudo sshd -t                      # silent = OK
sudo systemctl reload ssh         # NOTE: 'ssh' not 'sshd' on Ubuntu
```

Negative test (run from laptop):

```powershell
ssh -o PubkeyAuthentication=no -o PasswordAuthentication=yes root@<droplet-name>
# Expected: Permission denied (publickey).
```

### Firewall rule — choose the trade-off

DO Cloud Firewall → SSH (TCP 22) → Sources:

- **Defence-in-depth (chosen for OSLRS 2026-04-25):** `0.0.0.0/0` + `::/0` + `100.64.0.0/10`. sshd-key-only is primary control; firewall is shape, not gate. Required when CI deploys via public-IP SSH (e.g. `appleboy/ssh-action` from GitHub-hosted runners).
- **Tailnet-only (tighter):** `100.64.0.0/10` only. Requires self-hosted GH Actions runner inside tailnet. **Caveat:** also breaks DO Web Console (Console connects via SSH from DO infrastructure IPs — must add DO published ranges too).

### fail2ban defence-in-depth

```bash
sudo apt install -y fail2ban
sudo systemctl enable --now fail2ban
sudo fail2ban-client status sshd
```

### Verification checklist

```bash
# On VPS:
tailscale status                                             # Both devices online
systemctl is-active tailscaled ssh fail2ban                  # All active

# From laptop:
ssh root@<droplet-name>                                       # No password prompt
ssh -o ConnectTimeout=10 root@<public-ip>                     # Times out OR Permission denied
```

---

## Part 8: OS Patching + Reboot Procedure (added 2026-04-25)

**Cadence:** monthly minimum; immediately for USN Critical/High.

### Pre-flight (~5 min)

```bash
# On VPS via Tailscale SSH:

sudo systemctl is-enabled tailscaled              # must be 'enabled'
pm2 startup                                        # prints sudo command — run it
pm2 save                                           # snapshot processes
docker inspect oslsr-postgres oslsr-redis | grep -i restartpolicy
# If "Name": "no":
docker update --restart=unless-stopped oslsr-postgres oslsr-redis
```

Take a DO Snapshot from the dashboard before proceeding. Name: `pre-os-upgrade-<YYYY-MM-DD>`.

### Execute (10–15 min including reboot)

```bash
sudo apt update
sudo apt list --upgradable
sudo apt upgrade -y

# If prompted "Restart services during package upgrades?" → Yes
# If prompted about /etc/ssh/sshd_config(.d/*) → keep YOUR version (preserves hardening)

sudo reboot
```

SSH session terminates. Wait 60–90 seconds. Reconnect.

### Post-reboot verification (3 min)

```bash
ssh root@<droplet-name>
uname -r                                                  # Should show new kernel
systemctl is-active ssh tailscaled fail2ban
docker ps
pm2 list
curl -sI https://<domain>/api/v1/health
```

If anything fails: `pm2 logs <app> --lines 50` / `journalctl -u <service>` / restore from pre-upgrade snapshot.

### Post-success: take a clean snapshot

DO Dashboard → Droplets → Snapshots → Take Snapshot. Name: `clean-os-update-<YYYY-MM-DD>`.

### Worked example (OSLRS, 2026-04-25)

49 packages upgraded in one transaction (kernel 6.8.0-90 → 6.8.0-110, Ubuntu 24.04.3 → 24.04.4, systemd, apparmor, snapd, cloud-init, nodejs 20.20.0 → 20.20.2, openssh). Zero conflicts. Pre-flight + execute + reboot + verify: ~25 min. All services up. HTTPS health endpoint returned 200 with full sec2-3 CSP headers. Side-effect: **PM2 ↺ counter reset 916+ → 0**, giving clean baseline for restart-loop investigation.

---

## Part 9: Pitfalls (continued — added 2026-04-25)

### Pitfall #16: sshd_config drop-in "first-value-wins" override

`/etc/ssh/sshd_config.d/*.conf` are loaded in alphanumeric order. SSH config uses **first-match-wins**. A directive in `50-cloud-init.conf` overrides the same directive in `60-cloudimg-settings.conf` AND in the main `sshd_config`.

**Mitigation:** always grep all drop-ins after editing sshd_config — `sudo grep -rE "^(PermitRootLogin|PasswordAuthentication|PubkeyAuthentication)" /etc/ssh/sshd_config.d/`.

### Pitfall #17: Ubuntu service is `ssh.service`, not `sshd.service`

Debian/Ubuntu uses `ssh.service`. Red Hat / CentOS / Fedora use `sshd.service`. Wrong name returns "Unit sshd.service not found." Use `sudo systemctl reload ssh` on Ubuntu.

### Pitfall #18: DO Web Console is SSH-based, not hypervisor-OOB

DO Console works by establishing an SSH session from DO's own infrastructure IP ranges (e.g. `162.243.0.0/16`) to your droplet's port 22, then bridging to noVNC. **If you firewall SSH to operator-only sources, Console breaks.**

**Mitigation:** if narrowing the SSH firewall, also permit DO published IP ranges (`https://digitalocean.com/geo/google.csv` or DO API), OR accept Console as unavailable break-glass. Always verify break-glass paths after firewall changes.

True hypervisor-OOB break-glass: DO Snapshot restore (works regardless of firewall).

### Pitfall #19: PM2 doesn't survive reboot without `pm2 startup`

By default PM2 does not auto-start on system boot. After installing PM2, run once:

```bash
pm2 startup    # prints a sudo command — copy and run it
pm2 save       # snapshots current process list
```

Without this, post-reboot you log in to find your app down. The `pm2 startup` command registers `pm2-root.service` with systemd; `pm2 save` writes `/root/.pm2/dump.pm2` which `pm2 resurrect` reads on boot.

### Pitfall #20: Docker containers default to `restart: no`

`docker run` without `--restart` policy leaves containers in `no` (do not auto-restart). After reboot, your Postgres / Redis containers are stopped.

**Fix:**

```bash
docker update --restart=unless-stopped oslsr-postgres oslsr-redis
```

`unless-stopped` survives reboots, respects manual `docker stop`. `always` survives even manual stops. Pick `unless-stopped` for production.

### Pitfall #21: GitHub Actions runners cannot reach a tailnet-only firewall

`appleboy/ssh-action` runs from GitHub-hosted runners on GitHub's public IP space. Tailnet-only firewall (`100.64.0.0/10`) blocks all CI deploys.

**Mitigations:**
- Widen firewall to `0.0.0.0/0` + tailnet (defence-in-depth degraded but acceptable since sshd is key-only)
- Move CI to a self-hosted GitHub Actions runner inside the tailnet (cleaner long-term)

GitHub publishes its Actions IP ranges at `https://api.github.com/meta` → `.actions[]`, but the list is ~6500+ entries — impractical for DO Cloud Firewall (typical limit ~50 rules per firewall).

### Pitfall #22: VPS-side build on small droplets causes alert noise

**Symptom:** System-health digest emails fire CRITICAL (cpu ≥80%, memory ≥80%) every deploy. Operators
learn to ignore them, masking real signals (e.g., the actual ioredis-shutdown bug found in Story 9-10
err-log triage).

**Cause:** Running `pnpm --filter @oslsr/web build` (vite + tsc) on a 2GB droplet during deploy
consumes 700MB-1GB RAM + 70-90% CPU for 2-3 minutes. The build-step peak briefly dwarfs runtime
workload, but is purely operational (not user-facing).

**Fix:** Ship the `dist/` artifact from the GitHub-hosted cloud runner instead of rebuilding on the
VPS. See Part 6.2 above. The cloud runner already builds `dist/` (uploaded as `build-artifacts` for
test jobs); the deploy job downloads that artifact and `scp-action`s it to the VPS. Implemented in
prep-story `prep-build-off-vps-cloud-runner` (Wave 0, 2026-04-27).

**Why this matters beyond noise:** Story 9-10 AC#3 post-fix observation requires clean trajectory
data — every deploy-driven CRITICAL alert that registers as a "spontaneous" PM2 restart corrupts
the 7-day window. Eliminating the build-spike makes Wave 1+ stories' observation data trustworthy.

### Pitfall #23: Moving Vite build off-VPS silently swaps real `VITE_*` keys for code fallbacks

**Symptom:** After Wave 0 (build moved to cloud runner), login fails with "CAPTCHA verification
failed" and the hCaptcha widget shows the small "for testing purposes only — contact admin" banner.
Google OAuth button silently breaks too.

**Cause:** Vite auto-loads `VITE_*` vars from the closest `.env` at build time. The OLD VPS-side
build ran inside `/root/oslrs/` whose `.env` had real `VITE_HCAPTCHA_SITE_KEY` + `VITE_GOOGLE_CLIENT_ID`,
so they were silently baked into `dist/`. The cloud runner has no `.env` for these vars → Vite
falls back to whatever default the source code defines:

| Var | Code fallback | What it breaks |
|---|---|---|
| `VITE_API_URL` | `http://localhost:3000/api/v1` | All API calls (CORS errors) |
| `VITE_HCAPTCHA_SITE_KEY` | `10000000-ffff-ffff-ffff-000000000001` (hCaptcha **public test key**) | Login + any captcha-gated POST: hCaptcha JS renders the test widget; backend POST verify ALWAYS fails because the secret key on the server is the real-prod secret, not the test secret. Defence in depth — silent test/prod mismatch. |
| `VITE_GOOGLE_CLIENT_ID` | `''` (empty) | Google OAuth button non-functional |

`grep -rn "import.meta.env.VITE_" apps/web/src` is the canonical inventory of what gets baked.

**Fix:** Set every required `VITE_*` value as a GitHub Actions **Variable** (NOT Secret — these are
public values embedded in every browser page; redaction in workflow logs adds zero security and
costs debugging clarity), then reference each one in the cloud-runner `Build` step's `env:` block:

```yaml
- name: Build
  env:
    VITE_API_URL: /api/v1                                          # hardcoded (relative)
    VITE_HCAPTCHA_SITE_KEY: ${{ vars.VITE_HCAPTCHA_SITE_KEY }}     # GH Actions Variable
    VITE_GOOGLE_CLIENT_ID: ${{ vars.VITE_GOOGLE_CLIENT_ID }}       # GH Actions Variable
  run: pnpm build
```

**Verification when adding a new `VITE_*` var to source code:**

1. Add to GH Actions Variables (Settings → Secrets and variables → Actions → Variables tab)
2. Add to `Build` step's `env:` block in `.github/workflows/ci-cd.yml`
3. Add to the VPS `.env` (still useful for any one-off VPS-side build, e.g., manual recovery)
4. Add to `.env.example` so future operators know the var exists

Skipping any of these silently breaks production. Step 1 is the easiest to forget.

### Pitfall #24: `pnpm/action-setup@v4` rejects dual version source-of-truth

**Symptom:** CI lint-and-build job fails at the very first pnpm step with:

```
Error: Multiple versions of pnpm specified:
  - version 9 in the GitHub Action config with the key "version"
  - version pnpm@9.15.0 in the package.json with the key "packageManager"
Remove one of these versions to avoid version mismatch errors like ERR_PNPM_BAD_PM_VERSION
```

The lint-and-build failure cascades: every downstream job (test-unit, test-api, test-web, lighthouse, deploy) is **skipped** because it `needs: lint-and-build`. CI looks like a complete outage.

**Cause:** `pnpm/action-setup@v3` happily accepted a `with: version: 9` input even when `package.json` had `"packageManager": "pnpm@9.15.0"`. The v4 release made this an error to prevent silent drift.

**Fix:** drop the `with: version` block from each `pnpm/action-setup@v4` step in workflows. The action reads `pnpm@X.Y.Z` from the `packageManager` field in `package.json` instead — single source of truth. To bump pnpm, update `packageManager` in package.json (one place, not 6 workflow steps).

**Pattern lesson:** action major-version bumps need an isolated single-purpose PR, never bundled with feature work. Today's mistake (commits `4d43274` + `9d4081b`) bundled the action bump with feature commits — when the bump broke, the features failed to deploy too. Single-purpose CI commits surface incompatibilities without blocking release work.

### Pitfall #25: Action `using: node20` warnings even after major-version bump — SHA-pin to main when stable tags lag

**Symptom:** After bumping `actions/upload-artifact@v4` → `@v5` (and similar bumps for download-artifact, pnpm/action-setup), GitHub still shows annotations:

```
! Node.js 20 actions are deprecated. The following actions are running on Node.js 20...
```

**Cause:** GitHub-owned actions like `actions/upload-artifact` shipped `@v5` releases that intentionally **kept** `using: node20` in their `action.yml` for compatibility — they migrate Node 24 on `main` first, then tag a Node 24 stable later. As of 2026-05-01 there is no Node 24-declared stable tag for upload-artifact / download-artifact / pnpm-action-setup; the migration has happened on main but not in any tagged release.

**Three escalating fixes (in order of cleanliness):**

1. **`FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` env var** at workflow level — runs JS actions on Node 24 at runtime even though their `action.yml` declares Node 20. Bridge solution; warning text changes from "running on Node 20" to "target Node 20 but forced to run on Node 24" (cosmetic, less alarming).

2. **SHA-pin to a Node 24 commit on `main`** — verify via `https://raw.githubusercontent.com/{owner}/{repo}/main/action.yml` that `runs.using: node24`, then pin to the latest commit SHA from `https://github.com/{owner}/{repo}/commits/main`. Eliminates the warning entirely AND is GitHub's recommended security best practice (avoids tag-mutation supply-chain attacks). Trade-off: future re-evaluation needed when the action ships a tagged Node 24 release.

3. **Wait for tagged Node 24 release + re-bump tag** — cleanest long-term but lacks a deadline (depends on author cadence). Hard ceiling: 2026-09-16 (Node 20 removed from runner image entirely; bridge stops working).

OSLRS chose path #2 (SHA-pin) on 2026-05-01 to fully close the warnings before the 2026-06-02 forced-default cutover. SHA pins live in `.github/workflows/ci-cd.yml` + `e2e.yml`; comments at each pin site document the re-evaluation trigger.

**Verification recipe** (use it before SHA-pinning any new action):

```sh
# Check what main declares
curl -s https://raw.githubusercontent.com/<owner>/<repo>/main/action.yml | grep -E '^\s*using:'

# Get latest main SHA
curl -s https://api.github.com/repos/<owner>/<repo>/commits/main | jq -r .sha
```

If the `using:` line is `node24` (or `composite` / `docker` — both safe), pin to the SHA. If still `node20`, fall back to env-var bridge.

### Pitfall #26: Raw-SQL migrations need a tsx runner — `db:push` does NOT apply them

**Symptom:** A new `apps/api/drizzle/<NNNN>_*.sql` file ships in a story commit. `db:push` runs in CI deploy without errors. But the raw-SQL contents (CHECK constraints, partial indexes, DO blocks, `ALTER TABLE … ADD CONSTRAINT … NOT VALID`) **never reach production**. Tests pass locally because the dev agent applied the SQL via a one-shot tsx invocation against their local DB. Production deploy completes "successfully" but the schema is silently incomplete.

**Cause:** `pnpm --filter @oslsr/api db:push` runs `drizzle-kit push` which only diffs the **Drizzle TypeScript schema** (`apps/api/src/db/schema/*.ts`) against the live DB. It adds/drops columns + tables + indexes that are expressed in the schema. It **does NOT execute SQL files** in `apps/api/drizzle/`. Those files are documentation + raw-SQL escape valve; running them requires either:
- A dedicated tsx runner script (e.g. `migrate-audit-immutable.ts`, `migrate-mfa-init.ts`, `migrate-input-sanitisation-init.ts`), OR
- Manual `psql $DATABASE_URL -f apps/api/drizzle/<NNNN>_*.sql` invocation by the operator

**Fix:** Every new SQL file in `apps/api/drizzle/` MUST have a matching `apps/api/scripts/migrate-<name>-init.ts` runner that:
1. Reads `DATABASE_URL` from env
2. Uses `pg.Pool` (the project's existing dep — NOT `postgres` which is not installed; see Pitfall #27)
3. Executes the SQL with `IF NOT EXISTS` / `DO $$ … END $$` guards so re-runs are idempotent
4. Wires into `.github/workflows/ci-cd.yml` deploy step alongside `migrate-audit-immutable.ts`

Reference: `apps/api/scripts/migrate-audit-immutable.ts` (canonical pattern, Story 6-1).

**Pre-commit checklist** when adding a SQL migration:
```sh
# 1. Schema diff is in Drizzle schema (will be picked up by db:push):
ls apps/api/src/db/schema/<table>.ts | xargs git diff
# 2. Raw SQL has a runner:
ls apps/api/scripts/migrate-<name>-init.ts || echo "MISSING — write one"
# 3. Runner is in deploy script:
grep "migrate-<name>-init.ts" .github/workflows/ci-cd.yml || echo "MISSING — wire it"
```

If any of those three checks come back empty, the SQL file is dead-letter on production deploy.

### Pitfall #27: Don't use `postgres` package — use `pg` (already a project dep)

**Symptom:** A migration runner script imports `from 'postgres'` (the [postgres.js](https://github.com/porsager/postgres) package). Locally the import works because `tsx` resolves it via dev pnpm cache or because the operator manually `pnpm add`'d it. CI deploy crashes:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'postgres' imported from
  /***/oslrs/apps/api/scripts/migrate-<name>-init.ts
```

**Cause:** `postgres` is **not** an `apps/api` dependency. The project's canonical Postgres client is **`pg`** (`apps/api/package.json` → `"pg": "^8.11.5"`). Adding `postgres` would split the connection-pool surface across two libraries with subtly different behaviors (especially around `bigint` and `jsonb` parsing).

**Fix:** Always use the `pg` pattern from `migrate-audit-immutable.ts`:

```typescript
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL!, max: 1 });

await pool.query(`
  -- your DDL here, idempotent
`);

await pool.end();
```

**Process leak this came from:** Story 9-13's `migrate-mfa-init.ts` was authored with `import postgres from 'postgres'`. The Dev Agent Record explicitly noted "import-of-postgres package broken on local; applied via tsx one-shot using existing pg pool" — but never fixed the underlying script. Every CI deploy after Story 9-13 silently exited at this point (`set -eo pipefail` killed the deploy script mid-way; nginx never reloaded; pm2 never restarted; web `dist/` scp'd to `/tmp` but never copied to `/var/www/oslsr/`). 5+ "successful" CI runs landed nothing on the VPS until commit `25efd84` (2026-05-02) rewrote both runners to use `pg`.

**Process lesson:** when a Dev Agent Record explicitly flags **"X is broken on local; worked around with Y"**, treat that as a HIGH-severity follow-up — NOT a debug log note. Either fix-or-escalate before committing. The bug was visible in the dev-story summary at every commit but never escalated until adversarial code-review caught it post-deploy.

---

*Generated: 2026-02-21*
*Updated: 2026-04-25 — Parts 7 (Tailscale), 8 (OS patching), and 9 (Pitfalls #16–21) added per SCP-2026-04-22 + Story 9-9 deployment*
*Updated: 2026-04-27 — Part 6.2 (build off-VPS artifact handoff) + Pitfalls #22–23 added per Wave 0 prep-story (manual pre-flight surfaced #23: silent test-key fallback for VITE_HCAPTCHA_SITE_KEY + VITE_GOOGLE_CLIENT_ID)*
*Updated: 2026-04-29 — Wave 0 code review: Pitfall #10 cross-referenced to Part 6.2 + Pitfall #23 (post-Wave-0 pattern); Manual Redeploy snippet flagged as emergency-only with Pitfall #23 hardening (all 3 VITE_* vars sourced from VPS .env); Periodic Maintenance subsection added with /tmp/oslrs-web-dist-* sweep + dist-backup audit*
*Updated: 2026-04-30 — prep-tsc-pre-commit-hook landed: table row #18 Fix column rewritten with hook reference + cache-recovery one-liner (`rm apps/*/tsconfig.tsbuildinfo`); the unrelated `### Pitfall #18:` heading at line ~975 (DO Web Console SSH-based) deliberately untouched — the playbook's two #18 numberings stay independent*
*Updated: 2026-05-01 — Pitfalls #24-25 added: pnpm/action-setup v3→v4 dual-source-of-truth contract change + Node 24 SHA-pinning recipe for actions whose stable tags lag main branch (verified workflow used to eliminate all warnings before the 2026-06-02 forced-default cutover)*
*Updated: 2026-05-03 — Pitfalls #26-27 added: raw-SQL migrations need a tsx runner (db:push doesn't apply them) + postgres-vs-pg package mistake (postgres pkg not a project dep). Pattern caught after Story 9-13's migrate-mfa-init.ts shipped with `import postgres from 'postgres'`, silently breaking 5+ deploys until prep-input-sanitisation code-review surfaced the bug as F14. Also captures the Dev-Agent-Record lesson: "X is broken on local; worked around with Y" must be treated as HIGH-severity follow-up, not a debug log note.*
*Source project: OSLRS (Oyo State Labour & Skills Registry)*
