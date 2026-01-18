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

### 3.4 Install Node.js (for build tools)

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

```bash
# Start PostgreSQL and Redis via Docker Compose
docker compose -f docker/docker-compose.yml up -d postgres redis

# Verify containers running
docker ps

# Run database migrations
pnpm --filter @oslsr/api db:push
```

- [ ] PostgreSQL container running
- [ ] Redis container running
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

```bash
# Start full stack via Docker Compose
docker compose -f docker/docker-compose.yml up -d

# Or start manually for debugging
pnpm --filter @oslsr/api start &
pnpm --filter @oslsr/web preview &
```

- [ ] API service running
- [ ] Web service running
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
| NGINX 502 Bad Gateway | Check if app is running: `docker ps` |
| SSL certificate error | Verify domain DNS, re-run certbot |
| Database connection failed | Check DATABASE_URL, verify postgres is running |
| Emails not sending | Verify SES credentials, check sandbox mode |

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
*Last updated: 2026-01-18*
