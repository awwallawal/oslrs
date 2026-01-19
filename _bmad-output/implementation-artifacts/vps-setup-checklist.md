# VPS Setup Checklist - OSLSR Staging Environment

**Created:** 2026-01-18
**Purpose:** Step-by-step guide to provision and configure the staging VPS for OSLSR
**Owners:** Awwal (Lead) + Charlie (Technical Support)

---

## Overview

This checklist covers the complete infrastructure setup for the OSLSR staging environment. The staging environment will:

1. Host the current Epic 1 codebase for agency review
2. Provide a real environment for testing auth flows
3. Prepare the foundation for Epic 2 (ODK integration)

### Architecture Overview

```
                    Internet
                        |
                        v
                 +-------------+
                 |   Domain    |
                 | (DNS A/CNAME)|
                 +-------------+
                        |
                        v
+-----------------------------------------------+
|              Hetzner VPS (Staging)            |
|  +------------------------------------------+ |
|  |              NGINX (Port 80/443)         | |
|  |  - SSL Termination (Let's Encrypt)       | |
|  |  - Reverse Proxy                         | |
|  +------------------------------------------+ |
|         |              |              |       |
|         v              v              v       |
|  +----------+   +----------+   +----------+   |
|  |   Web    |   |   API    |   |   ODK    |   |
|  | (React)  |   | (Node)   |   | Central  |   |
|  | Port 3000|   | Port 4000|   | Port 8383|   |
|  +----------+   +----------+   +----------+   |
|         |              |                      |
|         v              v                      |
|  +------------------------------------------+ |
|  |           Docker Compose                 | |
|  |  - PostgreSQL (Port 5432)                | |
|  |  - Redis (Port 6379)                     | |
|  +------------------------------------------+ |
+-----------------------------------------------+
```

---

## Phase 1: VPS Provisioning

### 1.1 Create Hetzner Account

- [ ] Go to [hetzner.com](https://www.hetzner.com)
- [ ] Create account with valid email
- [ ] Verify email address
- [ ] Add payment method (credit card or PayPal)
- [ ] Enable 2FA for account security

### 1.2 Provision VPS Instance

**Recommended Staging Spec:**

| Option | Spec | Price | Notes |
|--------|------|-------|-------|
| CX21 | 2 vCPU, 4GB RAM, 40GB SSD | ~€4.50/mo | Minimum viable |
| CX31 | 2 vCPU, 8GB RAM, 80GB SSD | ~€8.00/mo | Recommended for ODK |

- [ ] Navigate to Cloud Console
- [ ] Click "Add Server"
- [ ] **Location:** Choose closest to Nigeria (e.g., Nuremberg or Helsinki)
- [ ] **Image:** Ubuntu 22.04 LTS
- [ ] **Type:** CX21 or CX31 (see table above)
- [ ] **Networking:** Public IPv4 (required)
- [ ] **SSH Key:** Add your public SSH key
- [ ] **Name:** `oslsr-staging`
- [ ] Click "Create & Buy Now"
- [ ] **Record IP Address:** `___.___.___.__`

### 1.3 Initial SSH Access

```bash
# Test SSH connection
ssh root@<YOUR_VPS_IP>

# If successful, you'll see Ubuntu welcome message
```

- [ ] SSH connection successful
- [ ] Record root password (if not using SSH key)

---

## Phase 2: Domain Configuration

### 2.1 Domain/Subdomain Setup

**Options:**

| Option | Example | Notes |
|--------|---------|-------|
| Subdomain of existing domain | `staging.oslsr.gov.ng` | Recommended |
| New cheap domain | `oslsr-staging.com` | ~$10/year |
| Hetzner reverse DNS | `<ip>.your-server.de` | Free but unprofessional |

- [ ] Choose domain strategy: `_______________________`
- [ ] Domain/subdomain name: `_______________________`

### 2.2 DNS Configuration

Add the following DNS records:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | `@` or subdomain | `<YOUR_VPS_IP>` | 300 |
| A | `www` (optional) | `<YOUR_VPS_IP>` | 300 |
| A | `odk` (for ODK Central) | `<YOUR_VPS_IP>` | 300 |

- [ ] A record created for main domain
- [ ] A record created for ODK subdomain (if using)
- [ ] DNS propagation verified (use `dig` or [dnschecker.org](https://dnschecker.org))

---

## Phase 3: VPS Base Setup

### 3.1 System Update & Security

```bash
# Update system packages
apt update && apt upgrade -y

# Install essential tools
apt install -y curl wget git vim htop ufw

# Configure firewall
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# Verify firewall status
ufw status
```

- [ ] System updated
- [ ] Essential tools installed
- [ ] Firewall configured (SSH, HTTP, HTTPS only)

### 3.2 Create Deploy User

```bash
# Create non-root user for deployments
adduser deploy

# Add to sudo group
usermod -aG sudo deploy

# Copy SSH key to deploy user
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

# Test login as deploy user (from local machine)
# ssh deploy@<YOUR_VPS_IP>
```

- [ ] Deploy user created
- [ ] SSH key copied to deploy user
- [ ] Can SSH as deploy user

### 3.3 Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Add deploy user to docker group
usermod -aG docker deploy

# Install Docker Compose
apt install -y docker-compose-plugin

# Verify installation
docker --version
docker compose version
```

- [ ] Docker installed
- [ ] Docker Compose installed
- [ ] Deploy user can run docker commands

### 3.4 Install Portainer (Container Management UI)

> **PRD Requirement (NFR7):** "System must include Portainer for visual management"

Portainer provides a web-based GUI for managing Docker containers, making it easier to deploy, monitor, and troubleshoot the OSLSR stack.

```bash
# Create Portainer data volume
docker volume create portainer_data

# Deploy Portainer CE (Community Edition)
docker run -d \
  -p 8000:8000 \
  -p 9443:9443 \
  --name portainer \
  --restart=always \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:latest

# Verify Portainer is running
docker ps | grep portainer
```

- [ ] Portainer data volume created
- [ ] Portainer container deployed
- [ ] Portainer running on port 9443

**Initial Portainer Setup:**

1. Access Portainer at `https://<YOUR_VPS_IP>:9443`
2. Create admin account with strong password (min 12 characters)
3. Select "Get Started" → Local Docker environment

- [ ] Admin account created with strong password
- [ ] Local Docker environment connected

**Enable Two-Factor Authentication (2FA):**

1. Click your username (top-right) → "My Account"
2. Scroll to "Security" section
3. Click "Enable 2FA"
4. Scan QR code with authenticator app (Google Authenticator, Authy, etc.)
5. Enter verification code to confirm

- [ ] 2FA enabled for admin account

**Firewall Configuration for Portainer:**

```bash
# Allow Portainer HTTPS port (restrict to your IP for security)
ufw allow from <YOUR_IP_ADDRESS> to any port 9443

# Or allow from anywhere (less secure, use with caution)
# ufw allow 9443/tcp
```

- [ ] Firewall configured for Portainer access

**Portainer Access URL:** `https://<YOUR_VPS_IP>:9443`

---

### 3.5 Install Node.js (for build tools)

```bash
# Install Node.js 20 LTS via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install pnpm
npm install -g pnpm

# Verify installation
node --version  # Should show v20.x.x
pnpm --version
```

- [ ] Node.js 20 LTS installed
- [ ] pnpm installed

---

## Phase 4: SSL Certificate (Let's Encrypt)

### 4.1 Install Certbot

```bash
# Install Certbot
apt install -y certbot

# Stop any service on port 80 temporarily
# (We'll configure NGINX later)
```

- [ ] Certbot installed

### 4.2 Obtain SSL Certificate

```bash
# Obtain certificate (standalone mode)
certbot certonly --standalone -d <YOUR_DOMAIN> -d www.<YOUR_DOMAIN>

# For ODK subdomain (if using)
certbot certonly --standalone -d odk.<YOUR_DOMAIN>

# Certificates will be at:
# /etc/letsencrypt/live/<YOUR_DOMAIN>/fullchain.pem
# /etc/letsencrypt/live/<YOUR_DOMAIN>/privkey.pem
```

- [ ] SSL certificate obtained for main domain
- [ ] SSL certificate obtained for ODK subdomain (if applicable)
- [ ] Certificate paths recorded

### 4.3 Auto-Renewal Setup

```bash
# Test renewal
certbot renew --dry-run

# Certbot automatically adds cron job for renewal
```

- [ ] Auto-renewal configured

---

## Phase 5: Application Deployment

### 5.1 Clone Repository

```bash
# Switch to deploy user
su - deploy

# Create app directory
mkdir -p ~/apps
cd ~/apps

# Clone repository (replace with your repo URL)
git clone https://github.com/<YOUR_ORG>/oslrs.git
cd oslrs

# Install dependencies
pnpm install
```

- [ ] Repository cloned
- [ ] Dependencies installed

### 5.2 Environment Configuration

```bash
# Copy example env file
cp .env.example .env

# Edit environment variables
vim .env
```

**Required Environment Variables:**

| Variable | Value | Notes |
|----------|-------|-------|
| `NODE_ENV` | `production` | |
| `DATABASE_URL` | `postgresql://...` | See Phase 5.3 |
| `REDIS_URL` | `redis://localhost:6379` | |
| `JWT_SECRET` | `<generate-secure-secret>` | `openssl rand -base64 32` |
| `JWT_REFRESH_SECRET` | `<generate-secure-secret>` | `openssl rand -base64 32` |
| `PUBLIC_APP_URL` | `https://<YOUR_DOMAIN>` | |
| `HCAPTCHA_SECRET` | `<from-hcaptcha-dashboard>` | |
| `VITE_HCAPTCHA_SITE_KEY` | `<from-hcaptcha-dashboard>` | |
| `S3_BUCKET_NAME` | `<your-bucket>` | See Phase 6 |
| `S3_ENDPOINT` | `<s3-endpoint>` | |
| `S3_ACCESS_KEY` | `<access-key>` | |
| `S3_SECRET_KEY` | `<secret-key>` | |
| `AWS_SES_REGION` | `eu-west-1` | See Phase 6 |
| `AWS_SES_ACCESS_KEY` | `<access-key>` | |
| `AWS_SES_SECRET_KEY` | `<secret-key>` | |
| `EMAIL_FROM` | `noreply@<YOUR_DOMAIN>` | |

- [ ] .env file created
- [ ] All required variables populated
- [ ] Secrets generated securely

### 5.3 Database Setup

**Start Database Containers:**

```bash
# Via Command Line
docker compose -f docker/docker-compose.yml up -d postgres redis

# Verify containers running
docker ps
```

Or use **Portainer**:
1. Navigate to **Containers**
2. Verify `postgres` and `redis` containers are running
3. Check logs for any startup errors

```bash
# Run database migrations
pnpm --filter @oslsr/api db:push
```

- [ ] PostgreSQL container running (verify in Portainer)
- [ ] Redis container running (verify in Portainer)
- [ ] Database migrations applied

### 5.4 Build Application

```bash
# Build all packages
pnpm build

# Verify build output
ls -la apps/api/dist/
ls -la apps/web/dist/
```

- [ ] API build successful
- [ ] Web build successful

### 5.5 Start Application

**Option A: Via Portainer (Recommended)**

1. Open Portainer at `https://<YOUR_VPS_IP>:9443`
2. Navigate to **Stacks** → **Add Stack**
3. Name: `oslsr`
4. Build method: **Upload** or **Repository**
   - Upload: Upload your `docker/docker-compose.yml` file
   - Repository: Point to your Git repo and specify compose file path
5. Add environment variables (from `.env` file)
6. Click **Deploy the stack**

- [ ] Stack created in Portainer
- [ ] Environment variables configured in Portainer
- [ ] Stack deployed successfully

**Option B: Via Command Line**

```bash
# Start full stack via Docker Compose
docker compose -f docker/docker-compose.yml up -d

# Or start manually for debugging
pnpm --filter @oslsr/api start &
pnpm --filter @oslsr/web preview &
```

**Verify in Portainer:**

1. Navigate to **Containers** in Portainer
2. Verify all containers show green "running" status
3. Check container logs for any errors (click container → Logs)

- [ ] API service running (visible in Portainer)
- [ ] Web service running (visible in Portainer)
- [ ] Health check endpoint responding (`/api/health`)

---

## Phase 6: External Services

### 6.1 hCaptcha Setup

- [ ] Go to [hcaptcha.com](https://www.hcaptcha.com)
- [ ] Create account
- [ ] Add new site with your domain
- [ ] **Site Key:** `_______________________` (for frontend)
- [ ] **Secret Key:** `_______________________` (for backend)
- [ ] Add to `.env` file

### 6.2 AWS S3 Setup (Media Storage)

**Option A: AWS S3**

- [ ] Log into AWS Console
- [ ] Create S3 bucket: `oslsr-staging-media`
- [ ] Configure bucket policy for public read (for selfies/ID cards)
- [ ] Create IAM user with S3 permissions
- [ ] **Access Key:** `_______________________`
- [ ] **Secret Key:** `_______________________`
- [ ] Add to `.env` file

**Option B: DigitalOcean Spaces (S3-compatible)**

- [ ] Log into DigitalOcean
- [ ] Create Space: `oslsr-staging-media`
- [ ] Generate Spaces access keys
- [ ] **Endpoint:** `_______________________`
- [ ] **Access Key:** `_______________________`
- [ ] **Secret Key:** `_______________________`
- [ ] Add to `.env` file

### 6.3 AWS SES Setup (Email)

- [ ] Log into AWS Console
- [ ] Navigate to SES
- [ ] Verify domain (add DNS records)
- [ ] Verify sender email address
- [ ] Request production access (if needed)
- [ ] Create SMTP credentials or IAM user
- [ ] **Region:** `_______________________`
- [ ] **Access Key:** `_______________________`
- [ ] **Secret Key:** `_______________________`
- [ ] Add to `.env` file
- [ ] Test email sending

---

## Phase 7: NGINX Configuration

### 7.1 Install NGINX

```bash
apt install -y nginx
```

- [ ] NGINX installed

### 7.2 Configure NGINX

Create `/etc/nginx/sites-available/oslsr`:

```nginx
# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name <YOUR_DOMAIN> www.<YOUR_DOMAIN>;
    return 301 https://$server_name$request_uri;
}

# Main HTTPS server
server {
    listen 443 ssl http2;
    server_name <YOUR_DOMAIN> www.<YOUR_DOMAIN>;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/<YOUR_DOMAIN>/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/<YOUR_DOMAIN>/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # API proxy
    location /api {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Frontend (React app)
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable site
ln -s /etc/nginx/sites-available/oslsr /etc/nginx/sites-enabled/

# Remove default site
rm /etc/nginx/sites-enabled/default

# Test configuration
nginx -t

# Reload NGINX
systemctl reload nginx
```

- [ ] NGINX config created
- [ ] Config syntax validated
- [ ] NGINX reloaded

### 7.3 Verify HTTPS

- [ ] Visit `https://<YOUR_DOMAIN>` in browser
- [ ] SSL certificate valid (green padlock)
- [ ] HTTP redirects to HTTPS

---

## Phase 8: Demo Accounts & Seed Data

### 8.1 Create Seed Script

```bash
# Run seed script (to be created by Charlie)
pnpm db:seed --profile=demo
```

- [ ] Seed script created
- [ ] Seed data loaded

### 8.2 Demo Accounts

| Role | Email | Password | Notes |
|------|-------|----------|-------|
| Super Admin | `demo-admin@staging.oslsr.gov` | `________` | Full access |
| Supervisor | `demo-supervisor@staging.oslsr.gov` | `________` | LGA: Ibadan North |
| Enumerator | `demo-enumerator@staging.oslsr.gov` | `________` | LGA: Ibadan North |
| Public User | `demo-public@staging.oslsr.gov` | `________` | Registered user |

- [ ] Demo accounts created
- [ ] Credentials documented securely
- [ ] All accounts tested

---

## Phase 9: Verification & Testing

### 9.1 Endpoint Verification

| Endpoint | Expected | Actual | Status |
|----------|----------|--------|--------|
| `https://<domain>/` | Homepage loads | | [ ] |
| `https://<domain>/login` | Login page loads | | [ ] |
| `https://<domain>/register` | Register page loads | | [ ] |
| `https://<domain>/api/health` | `{"status":"ok"}` | | [ ] |
| `https://<domain>/verify-staff/test` | 404 or verification page | | [ ] |

### 9.2 Auth Flow Testing

- [ ] Staff login works
- [ ] Public registration works
- [ ] Password reset email sends
- [ ] Email verification works
- [ ] Logout works

### 9.3 Feature Testing

- [ ] Profile completion form works
- [ ] Live selfie capture works (camera permission)
- [ ] ID card download works
- [ ] Public verification QR scan works

---

## Phase 10: Agency Walkthrough Preparation

### 10.1 Prepare Demo Script

- [ ] Document walkthrough steps
- [ ] Prepare demo credentials
- [ ] Test all demo flows

### 10.2 Schedule Walkthrough

- [ ] Contact agency stakeholders
- [ ] Schedule date/time: `_______________________`
- [ ] Share access URL and credentials
- [ ] Prepare feedback collection method

---

## Environment Variables Summary

```bash
# Server
NODE_ENV=production
PORT=4000
PUBLIC_APP_URL=https://<YOUR_DOMAIN>

# Database
DATABASE_URL=postgresql://oslsr:password@localhost:5432/oslsr_app

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=<generated-secret>
JWT_REFRESH_SECRET=<generated-secret>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# hCaptcha
HCAPTCHA_SECRET=<from-hcaptcha>
VITE_HCAPTCHA_SITE_KEY=<from-hcaptcha>

# S3 Storage
S3_BUCKET_NAME=oslsr-staging-media
S3_ENDPOINT=<s3-endpoint>
S3_REGION=<region>
S3_ACCESS_KEY=<access-key>
S3_SECRET_KEY=<secret-key>

# Email (AWS SES)
AWS_SES_REGION=<region>
AWS_SES_ACCESS_KEY=<access-key>
AWS_SES_SECRET_KEY=<secret-key>
EMAIL_FROM=noreply@<YOUR_DOMAIN>

# ODK Central (Phase 2 - Epic 2)
ODK_SERVER_URL=https://odk.<YOUR_DOMAIN>
ODK_ADMIN_EMAIL=<admin-email>
ODK_ADMIN_PASSWORD=<admin-password>
```

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| SSH connection refused | Check firewall: `ufw status` |
| Docker permission denied | Run `newgrp docker` or re-login |
| NGINX 502 Bad Gateway | Check if app is running: `docker ps` or Portainer |
| SSL certificate error | Verify domain DNS, re-run certbot |
| Database connection failed | Check DATABASE_URL, verify postgres is running |
| Emails not sending | Verify SES credentials, check sandbox mode |
| Portainer not accessible | Check firewall allows port 9443, verify container running |
| Portainer login failed | Reset admin password (see below) |

### Portainer Management

```bash
# Check Portainer container status
docker ps | grep portainer

# View Portainer logs
docker logs portainer

# Restart Portainer
docker restart portainer

# Reset Portainer admin password (if locked out)
docker stop portainer
docker run --rm -v portainer_data:/data portainer/helper-reset-password
docker start portainer
```

### Useful Commands

```bash
# Check running containers
docker ps

# View container logs
docker logs <container_name>

# Check NGINX error log
tail -f /var/log/nginx/error.log

# Check app logs
journalctl -u oslsr-api -f

# Test database connection
psql $DATABASE_URL -c "SELECT 1"

# Test Redis connection
redis-cli ping
```

---

## Sign-off

| Phase | Completed By | Date | Notes |
|-------|--------------|------|-------|
| Phase 1: VPS Provisioning | | | |
| Phase 2: Domain Configuration | | | |
| Phase 3: VPS Base Setup | | | |
| Phase 4: SSL Certificate | | | |
| Phase 5: Application Deployment | | | |
| Phase 6: External Services | | | |
| Phase 7: NGINX Configuration | | | |
| Phase 8: Demo Accounts | | | |
| Phase 9: Verification | | | |
| Phase 10: Agency Walkthrough | | | |

---

**Final Staging URL:** `https://_______________________`

**Walkthrough Scheduled:** `_______________________`

**Notes:**
```




```

---

*Document created: 2026-01-18*
*Last updated: 2026-01-19*
*Updated by: BMad Master - Added Portainer installation (Phase 3.4) per PRD NFR7 requirement*

---

# Appendices

## Appendix A: Understanding SSH Keys

### What is SSH?

**SSH (Secure Shell)** is a cryptographic network protocol for securely connecting to and controlling remote servers. It creates an encrypted tunnel between your local computer and the VPS.

### Why SSH Keys Instead of Passwords?

| Method | Security | Convenience | Risk |
|--------|----------|-------------|------|
| **Password** | Low | Type every time | Bots try millions of passwords (brute force) |
| **SSH Key** | Very High | Automatic auth | Only YOUR computer can connect |

SSH keys use asymmetric cryptography with 256+ bits of randomness, making them virtually impossible to crack.

### How SSH Keys Work

```
┌─────────────────┐                    ┌─────────────────┐
│  YOUR COMPUTER  │                    │    YOUR VPS     │
│                 │                    │                 │
│  🔑 Private Key │ ──── Encrypted ───>│  🔓 Public Key  │
│  (id_ed25519)   │      Challenge     │  (authorized_   │
│  NEVER SHARE    │<──── Response ─────│   keys file)    │
│                 │                    │  Safe to share  │
└─────────────────┘                    └─────────────────┘
        │                                      │
        └──────────── MATCH? ──────────────────┘
                         │
                    ✅ Access Granted
```

**The Key Pair:**
- **Private Key** (`id_ed25519`) - Stays on YOUR computer. Never share this with anyone.
- **Public Key** (`id_ed25519.pub`) - Goes on the server. Safe to share publicly.

### Generating SSH Keys on Windows

#### Option A: PowerShell (Windows 10/11)

```powershell
# Generate the key pair
ssh-keygen -t ed25519 -C "your-identifier"

# When prompted for file location, press Enter for default
# When prompted for passphrase, enter one (recommended) or press Enter for none

# View your public key (copy this to Hetzner)
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
```

#### Option B: Git Bash

```bash
# Generate the key pair
ssh-keygen -t ed25519 -C "your-identifier"

# View your public key
cat ~/.ssh/id_ed25519.pub
```

### Your Public Key Format

Your public key will look like this (one line):
```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx your-identifier
```

**Copy this entire line** when adding to Hetzner during VPS creation.

### SSH Key Security Best Practices

| Practice | Reason |
|----------|--------|
| Use a passphrase | Extra layer of security if private key is stolen |
| Never share private key | Anyone with it can access your servers |
| Use Ed25519 algorithm | Modern, secure, and fast |
| One key per device | Easier to revoke if a device is compromised |

---

## Appendix B: Understanding Portainer

### What is Portainer?

**Portainer** is a web-based graphical user interface (GUI) for managing Docker containers. Instead of typing commands in a terminal, you can manage your entire application stack through a visual dashboard in your browser.

### Why Use Portainer? (PRD Requirement NFR7)

The OSLSR PRD specifically requires Portainer for **"Ease of Operations"**:

> "NFR7: System must include Portainer for visual management and use GitHub Actions for automated deployment."

### Command Line vs Portainer

**Without Portainer (CLI Only):**
```bash
# SSH into server first
ssh deploy@your-server

# See running containers
docker ps

# View logs (must know container name)
docker logs oslsr-api --tail 100

# Restart a service
docker restart oslsr-api

# Check resource usage
docker stats
```

**With Portainer (Visual Dashboard):**
1. Open browser: `https://your-server:9443`
2. See all containers with color-coded status
3. Click "Logs" button to view logs
4. Click "Restart" button to restart
5. View CPU/memory graphs in real-time

### Portainer Dashboard Features

```
┌─────────────────────────────────────────────────────────────────┐
│  PORTAINER DASHBOARD                              [Admin ▼]     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  CONTAINERS (4 running)                                         │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 🟢 oslsr-api     Running   CPU: 2.3%   MEM: 156MB          │ │
│  │    [Logs] [Console] [Inspect] [Stats] [Restart] [Stop]     │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │ 🟢 oslsr-web     Running   CPU: 0.5%   MEM: 89MB           │ │
│  │    [Logs] [Console] [Inspect] [Stats] [Restart] [Stop]     │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │ 🟢 postgres      Running   CPU: 1.1%   MEM: 234MB          │ │
│  │    [Logs] [Console] [Inspect] [Stats] [Restart] [Stop]     │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │ 🟢 redis         Running   CPU: 0.2%   MEM: 12MB           │ │
│  │    [Logs] [Console] [Inspect] [Stats] [Restart] [Stop]     │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  STACKS                    IMAGES              VOLUMES          │
│  [oslsr] Running           4 images            5 volumes        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Key Portainer Capabilities

| Feature | Description | Benefit |
|---------|-------------|---------|
| **Container List** | Visual list of all running services | See health at a glance |
| **One-Click Actions** | Start, stop, restart with buttons | No command memorization |
| **Live Logs** | Stream logs in browser | Debug without SSH |
| **Resource Graphs** | CPU, memory, network charts | Identify performance issues |
| **Stack Management** | Deploy entire app from compose file | Simplified deployments |
| **Environment Variables** | Edit config in UI | No file editing on server |
| **Image Management** | Pull, remove Docker images | Easy updates |
| **Volume Management** | View and manage data volumes | Data persistence visibility |

### Portainer in OSLSR Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         YOUR VPS                                 │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                 PORTAINER (Port 9443)                      │  │
│  │            Visual Management Dashboard                     │  │
│  │     Access: https://<your-vps-ip>:9443                     │  │
│  │     Security: Admin password + 2FA enabled                 │  │
│  └────────────────────────────────────────────────────────────┘  │
│              │              │              │              │      │
│              ▼              ▼              ▼              ▼      │
│       ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐ │
│       │OSLSR-API │   │OSLSR-WEB │   │ POSTGRES │   │  REDIS   │ │
│       │Port 4000 │   │Port 3000 │   │Port 5432 │   │Port 6379 │ │
│       └──────────┘   └──────────┘   └──────────┘   └──────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                  NGINX (Ports 80/443)                      │  │
│  │              Public-facing reverse proxy                   │  │
│  │          Handles SSL termination & routing                 │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                   │
└──────────────────────────────│───────────────────────────────────┘
                               ▼
                     🌐 Internet (Users)
```

### Portainer Security Configuration

Per PRD requirements, Portainer must be secured:

| Security Measure | Implementation |
|------------------|----------------|
| **Strong Password** | Minimum 12 characters, mixed case, numbers, symbols |
| **2FA Enabled** | TOTP via authenticator app (Google Authenticator, Authy) |
| **Firewall Restriction** | Only allow access from admin IP addresses |
| **HTTPS Only** | Portainer runs on port 9443 with TLS |

### When to Use Portainer vs CLI

| Scenario | Recommended Tool |
|----------|------------------|
| Quick status check | Portainer |
| View logs | Portainer |
| Restart a service | Portainer |
| Deploy/update stack | Portainer |
| Complex debugging | CLI (SSH) |
| Automated scripts | CLI |
| Initial server setup | CLI |

### Portainer Quick Reference

**Access URL:** `https://<YOUR_VPS_IP>:9443`

**Common Tasks:**
- View all containers: Home → Containers
- Check logs: Containers → Select container → Logs
- Restart service: Containers → Select container → Restart button
- Deploy stack: Stacks → Add Stack → Upload compose file
- View resources: Containers → Select container → Stats

---

## Appendix C: Pre-Setup Checklist

Before starting Phase 1, ensure you have:

### Accounts to Create

- [ ] **Hetzner** - [hetzner.com](https://www.hetzner.com) - VPS hosting
- [ ] **AWS** - [aws.amazon.com](https://aws.amazon.com) - S3 storage + SES email
- [ ] **hCaptcha** - [hcaptcha.com](https://www.hcaptcha.com) - Bot protection
- [ ] **Domain Registrar** - Purchase staging domain

### Local Setup

- [ ] **SSH Key Generated** - See Appendix A for instructions
- [ ] **Public Key Copied** - Ready to paste into Hetzner
- [ ] **Git Access** - Can clone the OSLSR repository

### Decisions Made

- [ ] **VPS Size** - CX21 (4GB) or CX31 (8GB recommended)
- [ ] **Domain Name** - e.g., `oslsr-staging.com`
- [ ] **S3 Provider** - AWS S3 or DigitalOcean Spaces

### Estimated Costs

| Service | Monthly Cost |
|---------|--------------|
| Hetzner VPS (CX31) | ~€8 |
| Domain | ~$1 (annual ~$10) |
| AWS S3 | ~$1-5 (usage-based) |
| AWS SES | ~$0.10 per 1000 emails |
| hCaptcha | Free |
| **Total** | **~$15-20/month** |

---

*End of Appendices*
