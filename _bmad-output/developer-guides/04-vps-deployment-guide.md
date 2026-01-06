# VPS Deployment Guide
## Step-by-Step Production Deployment to Self-Hosted VPS

**Purpose:** Deploy OSLSR to a production VPS server in Nigeria (or Germany for development).

**Prerequisites:**
- Completed local development setup
- Basic Linux command line knowledge
- Domain name (e.g., oslsr.gov.ng)
- Credit/debit card for VPS rental

**Estimated Time:** 3-4 hours for first deployment

---

## Deployment Overview

```
Phase 1: VPS Setup (60 min)
├─ Rent VPS from Hetzner Cloud
├─ Initial server security
└─ Install Docker + Docker Compose

Phase 2: Application Deployment (90 min)
├─ Clone repository to VPS
├─ Configure environment variables
├─ Start Docker Compose stack
└─ Configure NGINX + SSL

Phase 3: Domain & DNS (30 min)
├─ Point domain to VPS IP
├─ Configure SSL certificates
└─ Test production URLs

Phase 4: Automation (45 min)
├─ Set up GitHub Actions
└─ Configure automated deployments
```

---

## Phase 1: VPS Setup

### Step 1: Rent Hetzner Cloud VPS

**Why Hetzner?**
- 86% cheaper than Render/Vercel ($14/month vs $100+/month)
- Located in Germany (NDPA compliant - EU data protection)
- Excellent performance
- Simple interface

**Specs for OSLSR:**
- **Development/Testing:** CX31 (4 vCPU, 8GB RAM, 80GB SSD) - €4.49/month (~$5)
- **Production:** CX43 (8 vCPU, 16GB RAM, 160GB SSD) - €10/month (~$11)

#### Create Hetzner Account

1. Visit: https://www.hetzner.com/cloud
2. Click "Sign Up"
3. Enter email, create password
4. Verify email
5. Add payment method (credit/debit card)

#### Create New VPS

1. Go to **Cloud Console**: https://console.hetzner.cloud
2. Click **"New Project"**
   - Name: `oslsr-production`
3. Click **"Add Server"**
4. **Location:** Falkenstein, Germany (or Nuremberg)
5. **Image:** Ubuntu 22.04 (LTS)
6. **Type:** Shared vCPU → **CX31** (development) or **CX43** (production)
7. **Networking:**
   - Public IPv4: Yes
   - Public IPv6: Yes
8. **SSH Key:** Click "Add SSH Key"

   ```bash
   # On your local machine, generate SSH key (if you don't have one)
   ssh-keygen -t ed25519 -C "oslsr-vps"
   # Press Enter for all prompts (default values)

   # Display public key
   cat ~/.ssh/id_ed25519.pub
   # Copy the output (starts with "ssh-ed25519...")
   ```

   Paste your public key in Hetzner interface

9. **Name:** `oslsr-production-01`
10. Click **"Create & Buy Now"**

**Wait 1-2 minutes** for VPS creation. You'll see:
- **IPv4 Address:** e.g., `116.203.45.67` (example)
- **Status:** Running

### Step 2: Connect to VPS

```bash
# Replace with YOUR VPS IP address
ssh root@116.203.45.67

# First time, you'll see:
# The authenticity of host '116.203.45.67' can't be established.
# Type: yes

# You're now connected to your VPS!
# Prompt changes to: root@oslsr-production-01:~#
```

### Step 3: Initial Server Security

```bash
# Update system packages
apt update && apt upgrade -y

# Install essential tools
apt install -y curl git vim ufw fail2ban

# Configure firewall
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh          # Port 22 (SSH)
ufw allow http         # Port 80 (HTTP)
ufw allow https        # Port 443 (HTTPS)
ufw enable

# Start fail2ban (protects against brute-force SSH attacks)
systemctl enable fail2ban
systemctl start fail2ban

# Create non-root user (better security)
adduser oslr
# Enter password, fill in details (or skip with Enter)

# Add user to sudo group
usermod -aG sudo oslr

# Add user to docker group (we'll install Docker next)
usermod -aG docker oslr

# Copy SSH key to new user
mkdir -p /home/oslr/.ssh
cp ~/.ssh/authorized_keys /home/oslr/.ssh/
chown -R oslr:oslr /home/oslr/.ssh
chmod 700 /home/oslr/.ssh
chmod 600 /home/oslr/.ssh/authorized_keys
```

### Step 4: Install Docker & Docker Compose

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Start Docker service
systemctl enable docker
systemctl start docker

# Verify Docker installation
docker --version
# Should show: Docker version 24.x.x

docker-compose --version
# Should show: Docker Compose version v2.x.x

# Test Docker
docker run hello-world
# Should see "Hello from Docker!" message
```

### Step 5: Set Up Directory Structure

```bash
# Switch to oslr user
su - oslr

# Create application directory
mkdir -p /home/oslr/oslr_cl
cd /home/oslr/oslr_cl

# Create directories for persistent data
mkdir -p data/postgres data/postgres-odk data/redis data/odk data/nginx/ssl
```

---

## Phase 2: Application Deployment

### Step 1: Clone Repository

```bash
cd /home/oslr/oslr_cl

# Clone your repository
git clone https://github.com/your-org/oslr_cl.git .

# If repository is private
# You'll need to authenticate:
# Option 1: SSH key (recommended)
# Option 2: Personal Access Token
git clone https://YOUR_GITHUB_TOKEN@github.com/your-org/oslr_cl.git .
```

**Generate GitHub Personal Access Token:**
1. Go to: https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scopes: `repo` (all checkboxes)
4. Click "Generate token"
5. Copy token (only shown once!)

### Step 2: Create Production Environment File

```bash
# Create .env file
nano .env

# Or use cat with heredoc
cat > .env <<'EOF'
# Node Environment
NODE_ENV=production

# Database (Custom App)
DATABASE_URL=postgresql://oslsr_admin:CHANGE_THIS_PASSWORD@postgres:5432/app_db
DATABASE_URL_REPLICA=postgresql://oslsr_readonly:CHANGE_THIS_PASSWORD@postgres:5432/app_db

# Database (ODK Central)
ODK_DB_USER=odk_admin
ODK_DB_PASSWORD=CHANGE_THIS_PASSWORD

# Redis
REDIS_URL=redis://redis:6379

# JWT Secrets
JWT_SECRET=GENERATE_RANDOM_64_CHAR_STRING_HERE
JWT_REFRESH_SECRET=GENERATE_ANOTHER_RANDOM_64_CHAR_STRING

# ODK Central
ODK_SERVER_URL=http://odk-central:8383
ODK_ADMIN_EMAIL=admin@oslsr.gov.ng
ODK_ADMIN_PASSWORD=CHANGE_THIS_PASSWORD

# S3 Storage (DigitalOcean Spaces or AWS S3)
AWS_S3_BUCKET=oslsr-production
AWS_REGION=fra1
AWS_ENDPOINT=https://fra1.digitaloceanspaces.com
AWS_ACCESS_KEY_ID=YOUR_SPACES_KEY
AWS_SECRET_ACCESS_KEY=YOUR_SPACES_SECRET

# Email (AWS SES)
EMAIL_PROVIDER=ses
SES_REGION=us-east-1
SES_ACCESS_KEY_ID=YOUR_SES_KEY
SES_SECRET_ACCESS_KEY=YOUR_SES_SECRET
SES_FROM_EMAIL=noreply@oslsr.gov.ng

# Plausible Analytics
PLAUSIBLE_SECRET=GENERATE_RANDOM_64_CHAR_STRING
PLAUSIBLE_DB_PASSWORD=CHANGE_THIS_PASSWORD

# Domain
DOMAIN=oslsr.gov.ng
ODK_DOMAIN=odk.oslsr.gov.ng
PLAUSIBLE_DOMAIN=plausible.oslsr.gov.ng
EOF

# Generate random secrets
openssl rand -base64 48
# Copy output and use for JWT_SECRET, PLAUSIBLE_SECRET, etc.
```

**Important: Replace ALL placeholders:**
- `CHANGE_THIS_PASSWORD` - Use strong passwords
- `GENERATE_RANDOM_64_CHAR_STRING` - Use `openssl rand -base64 48`
- `YOUR_SPACES_KEY` - Get from DigitalOcean Spaces
- `YOUR_SES_KEY` - Get from AWS SES

### Step 3: Create Production Docker Compose File

```bash
nano docker-compose.prod.yml
```

```yaml
version: '3.8'

services:
  # NGINX Reverse Proxy
  nginx:
    image: nginx:1.25-alpine
    container_name: oslsr-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/letsencrypt:ro
      - ./apps/web/dist:/var/www/oslr/dist:ro
    depends_on:
      - custom-app
      - odk-central
    networks:
      - oslsr-network

  # Custom App (Node.js API + Workers)
  custom-app:
    build:
      context: ./apps/api
      dockerfile: Dockerfile
    container_name: oslsr-custom-app
    restart: unless-stopped
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - oslsr-network
    volumes:
      - ./logs:/app/logs

  # PostgreSQL (Custom App)
  postgres:
    image: postgis/postgis:15-3.4-alpine
    container_name: oslsr-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: app_db
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
    networks:
      - oslsr-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  # PostgreSQL (ODK Central)
  postgres-odk:
    image: postgres:15-alpine
    container_name: oslsr-postgres-odk
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${ODK_DB_USER}
      POSTGRES_PASSWORD: ${ODK_DB_PASSWORD}
      POSTGRES_DB: odk_db
    volumes:
      - ./data/postgres-odk:/var/lib/postgresql/data
    networks:
      - oslsr-network

  # Redis
  redis:
    image: redis:7-alpine
    container_name: oslsr-redis
    restart: unless-stopped
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    volumes:
      - ./data/redis:/data
    networks:
      - oslsr-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  # ODK Central
  odk-central:
    image: odk/central:latest
    container_name: oslsr-odk-central
    restart: unless-stopped
    environment:
      - DB_HOST=postgres-odk
      - DB_NAME=odk_db
      - DB_USER=${ODK_DB_USER}
      - DB_PASSWORD=${ODK_DB_PASSWORD}
      - DOMAIN=${ODK_DOMAIN}
    volumes:
      - ./data/odk:/data
    depends_on:
      - postgres-odk
    networks:
      - oslsr-network

  # Plausible Analytics
  plausible:
    image: plausible/analytics:latest
    container_name: oslsr-plausible
    restart: unless-stopped
    environment:
      - BASE_URL=https://${PLAUSIBLE_DOMAIN}
      - SECRET_KEY_BASE=${PLAUSIBLE_SECRET}
      - DATABASE_URL=postgres://plausible:${PLAUSIBLE_DB_PASSWORD}@plausible-db:5432/plausible_db
      - CLICKHOUSE_DATABASE_URL=http://plausible-clickhouse:8123/plausible_events_db
    depends_on:
      - plausible-db
      - plausible-clickhouse
    networks:
      - oslsr-network

  plausible-db:
    image: postgres:15-alpine
    container_name: oslsr-plausible-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: plausible_db
      POSTGRES_USER: plausible
      POSTGRES_PASSWORD: ${PLAUSIBLE_DB_PASSWORD}
    volumes:
      - ./data/plausible-db:/var/lib/postgresql/data
    networks:
      - oslsr-network

  plausible-clickhouse:
    image: clickhouse/clickhouse-server:23-alpine
    container_name: oslsr-plausible-clickhouse
    restart: unless-stopped
    volumes:
      - ./data/plausible-clickhouse:/var/lib/clickhouse
    networks:
      - oslsr-network

networks:
  oslsr-network:
    driver: bridge
```

### Step 4: Build and Start Services

```bash
# Build Docker images (first time)
docker-compose -f docker-compose.prod.yml build

# Start all services
docker-compose -f docker-compose.prod.yml up -d

# Check status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# If everything is running, press Ctrl+C to exit logs
```

---

## Phase 3: Domain & SSL Configuration

### Step 1: Point Domain to VPS

**In your domain registrar (e.g., Namecheap, GoDaddy, Nigerian registrar):**

1. Go to DNS settings
2. Add/Update A records:

```
Type    Name        Value (IP Address)      TTL
A       @           116.203.45.67          3600
A       www         116.203.45.67          3600
A       odk         116.203.45.67          3600
A       plausible   116.203.45.67          3600
```

**Wait 5-15 minutes** for DNS propagation.

**Verify DNS:**
```bash
# On your local machine
nslookup oslsr.gov.ng
# Should show your VPS IP

ping oslsr.gov.ng
# Should respond from your VPS IP
```

### Step 2: Install SSL Certificates (Let's Encrypt)

```bash
# On VPS, install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Stop NGINX temporarily
docker-compose -f docker-compose.prod.yml stop nginx

# Generate certificates
sudo certbot certonly --standalone \
  -d oslsr.gov.ng \
  -d www.oslsr.gov.ng \
  -d odk.oslsr.gov.ng \
  -d plausible.oslsr.gov.ng \
  --email admin@oslsr.gov.ng \
  --agree-tos \
  --no-eff-email

# Certificates saved to: /etc/letsencrypt/live/oslsr.gov.ng/

# Copy certificates to project directory
sudo cp -r /etc/letsencrypt /home/oslr/oslr_cl/nginx/ssl/

# Fix permissions
sudo chown -R oslr:oslr /home/oslr/oslr_cl/nginx/ssl

# Restart NGINX
docker-compose -f docker-compose.prod.yml start nginx
```

### Step 3: Test Production URLs

Open browser and test:
- ✅ https://oslsr.gov.ng (React app)
- ✅ https://oslsr.gov.ng/api/v1/status (API)
- ✅ https://odk.oslsr.gov.ng (ODK Central)
- ✅ https://plausible.oslsr.gov.ng (Analytics)

---

## Phase 4: Automated Deployments with GitHub Actions

### Step 1: Create GitHub Action Workflow

```bash
# On your local machine
mkdir -p .github/workflows
```

```yaml
# .github/workflows/deploy-production.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Deploy to VPS
        uses: appleboy/ssh-action@v0.1.10
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /home/oslr/oslr_cl
            git pull origin main
            docker-compose -f docker-compose.prod.yml build --no-cache
            docker-compose -f docker-compose.prod.yml up -d
            docker-compose -f docker-compose.prod.yml logs --tail=50
```

### Step 2: Configure GitHub Secrets

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **"New repository secret"**

Add these secrets:

```
Name: VPS_HOST
Value: 116.203.45.67 (your VPS IP)

Name: VPS_USER
Value: oslr

Name: VPS_SSH_KEY
Value: (paste content of ~/.ssh/id_ed25519 from your LOCAL machine)
```

### Step 3: Test Automated Deployment

```bash
# On your local machine
git add .
git commit -m "Set up automated deployment"
git push origin main

# GitHub Actions will automatically deploy to VPS!
# Check progress: https://github.com/your-org/oslr_cl/actions
```

---

## Post-Deployment Checklist

### Security

- [ ] Change all default passwords
- [ ] Enable UFW firewall
- [ ] Configure fail2ban
- [ ] Set up SSL certificates
- [ ] Configure NGINX security headers
- [ ] Review .env file (no secrets in git)

### Monitoring

- [ ] Set up log rotation (`/var/log/oslr/`)
- [ ] Configure Plausible Analytics
- [ ] Set up server monitoring (optional: Uptime Robot)
- [ ] Configure email alerts

### Backups

```bash
# Create backup script
cat > /home/oslr/backup.sh <<'EOF'
#!/bin/bash
BACKUP_DIR="/home/oslr/backups/$(date +%Y%m%d)"
mkdir -p $BACKUP_DIR

# Backup databases
docker exec oslsr-postgres pg_dump -U oslsr_admin app_db | gzip > $BACKUP_DIR/app_db.sql.gz
docker exec oslsr-postgres-odk pg_dump -U odk_admin odk_db | gzip > $BACKUP_DIR/odk_db.sql.gz

# Keep only last 7 days
find /home/oslr/backups/ -type d -mtime +7 -exec rm -rf {} +

echo "Backup completed: $BACKUP_DIR"
EOF

chmod +x /home/oslr/backup.sh

# Schedule daily backups (cron)
crontab -e
# Add line:
0 2 * * * /home/oslr/backup.sh >> /var/log/backup.log 2>&1
```

---

## Troubleshooting

### Issue: Can't connect to VPS

```bash
# Check if SSH port is open
telnet YOUR_VPS_IP 22

# Try verbose SSH
ssh -v root@YOUR_VPS_IP

# Reset SSH key
ssh-keygen -R YOUR_VPS_IP
```

### Issue: Docker containers won't start

```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs postgres
docker-compose -f docker-compose.prod.yml logs redis

# Restart Docker daemon
sudo systemctl restart docker

# Rebuild containers
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d --build
```

### Issue: SSL certificate errors

```bash
# Renew certificates
sudo certbot renew --force-renewal

# Test renewal
sudo certbot renew --dry-run

# Check certificate expiry
sudo certbot certificates
```

---

## Next Steps

Your OSLSR production deployment is complete! 🎉

**What's Next:**
- [Troubleshooting Guide](06-troubleshooting-guide.md) - Common issues and solutions
- [Developer Onboarding Guide](02-developer-onboarding-guide.md) - Deep dive into technologies
- Architecture Document - Understand full system design
- PRD - Business requirements and features

**Maintenance Tasks:**
- Monitor logs daily: `docker-compose -f docker-compose.prod.yml logs --tail=100`
- Check disk space: `df -h`
- Update Docker images monthly: `docker-compose -f docker-compose.prod.yml pull`
- Renew SSL certificates (automatic via certbot)
- Run backups daily (configured via cron)

Congratulations on deploying your first self-hosted VPS application! 🚀
