# Troubleshooting Guide
## Common Issues and Solutions for OSLSR Development

**Purpose:** Quick reference for solving common problems during OSLSR development and deployment.

---

## Docker Issues

### Issue: "Cannot connect to Docker daemon"

**Symptoms:**
```bash
docker ps
# Error: Cannot connect to the Docker daemon. Is the docker daemon running?
```

**Solutions:**

**Windows:**
```bash
# Check if Docker Desktop is running
# Look for Docker icon in system tray

# If not running, start Docker Desktop from Start menu

# If still not working, restart Docker Desktop
# Right-click Docker icon → Restart
```

**macOS:**
```bash
# Check Docker Desktop status
docker info

# If not running, open Docker Desktop from Applications

# Restart Docker
# Click Docker icon → Restart
```

**Linux:**
```bash
# Check Docker service status
sudo systemctl status docker

# Start Docker
sudo systemctl start docker

# Enable Docker to start on boot
sudo systemctl enable docker

# Add your user to docker group (then log out/in)
sudo usermod -aG docker $USER
```

---

### Issue: "Port already in use"

**Symptoms:**
```bash
docker-compose up
# Error: Bind for 0.0.0.0:5432 failed: port is already allocated
```

**Solution:**

**Find what's using the port:**
```bash
# Windows
netstat -ano | findstr :5432

# macOS/Linux
lsof -i :5432
sudo netstat -tulpn | grep 5432
```

**Kill the process:**
```bash
# Windows (replace PID with actual process ID)
taskkill /PID 1234 /F

# macOS/Linux
kill -9 PID
```

**Or change port in docker-compose.yml:**
```yaml
services:
  postgres:
    ports:
      - "5433:5432"  # Use different host port
```

---

### Issue: Docker containers crash on startup

**Symptoms:**
```bash
docker ps
# Container is missing or status shows "Restarting"
```

**Solutions:**

```bash
# Check logs for error messages
docker logs CONTAINER_NAME

# Common issues:

# 1. Missing environment variables
# Fix: Check .env file exists and has all required variables

# 2. Database connection failed
# Fix: Ensure PostgreSQL container is healthy first
docker-compose up postgres
# Wait for "database system is ready to accept connections"
# Then start other services

# 3. Out of disk space
df -h  # Check disk usage
docker system prune  # Clean up unused Docker data

# 4. Memory limit
# Increase Docker Desktop memory allocation
# Docker Desktop → Settings → Resources → Memory → 4GB+
```

---

## Database Issues

### Issue: "Connection refused" to PostgreSQL

**Symptoms:**
```bash
psql -h localhost -U postgres
# psql: error: connection to server at "localhost" (127.0.0.1), port 5432 failed: Connection refused
```

**Solutions:**

```bash
# 1. Check if PostgreSQL container is running
docker ps | grep postgres

# 2. Check PostgreSQL logs
docker logs oslsr-postgres-local

# 3. Wait for PostgreSQL to be ready (takes 10-15 seconds)
docker-compose ps
# Look for "healthy" status

# 4. Check correct port (might be 5433 if 5432 in use)
psql -h localhost -p 5433 -U postgres

# 5. Check connection string format
# Correct: postgresql://user:password@localhost:5432/dbname
# Wrong: postgresql://localhost:5432 (missing credentials)
```

---

### Issue: "Authentication failed for user"

**Symptoms:**
```bash
psql -h localhost -U postgres
# psql: error: FATAL: password authentication failed for user "postgres"
```

**Solutions:**

```bash
# 1. Check password in .env or docker-compose.yml
cat .env | grep POSTGRES_PASSWORD

# 2. Use correct credentials from environment
# If POSTGRES_PASSWORD=secret, then:
psql -h localhost -U postgres
# Password: secret

# 3. Reset PostgreSQL container (DELETES ALL DATA!)
docker-compose down -v  # -v removes volumes
docker-compose up -d

# 4. Access without password (emergency)
docker exec -it oslsr-postgres-local psql -U postgres
```

---

## Redis Issues

### Issue: "Connection to Redis refused"

**Symptoms:**
```bash
redis-cli ping
# Could not connect to Redis at 127.0.0.1:6379: Connection refused
```

**Solutions:**

```bash
# 1. Check if Redis container is running
docker ps | grep redis

# 2. Start Redis if not running
docker-compose up -d redis

# 3. Connect to Redis inside container
docker exec -it oslsr-redis-local redis-cli
# Inside container:
> ping
# Should return: PONG

# 4. Check Redis logs
docker logs oslsr-redis-local

# 5. Check if Redis requires password
redis-cli -a YOUR_REDIS_PASSWORD ping
```

---

## Frontend (React) Issues

### Issue: "Cannot connect to API" (CORS Error)

**Symptoms:**
```
Browser Console:
Access to fetch at 'http://localhost:3000/api/status' from origin 'http://localhost:5173' has been blocked by CORS policy
```

**Solutions:**

```typescript
// apps/api/src/index.ts
import cors from 'cors';

app.use(cors({
  origin: [
    'http://localhost:5173',  // Vite default
    'http://localhost:3000',  // React default
    'http://localhost:5000',  // Alternative
  ],
  credentials: true
}));
```

```bash
# Or set CORS to allow all origins in development
app.use(cors({
  origin: '*'  // Development only! Don't use in production
}));
```

---

### Issue: "Module not found" after installing package

**Symptoms:**
```bash
pnpm run dev
# Error: Cannot find module 'react-router-dom'
```

**Solutions:**

```bash
# 1. Ensure you're in the correct directory
cd apps/web
pnpm install

# 2. Check if package is in package.json
cat package.json | grep react-router-dom

# 3. Reinstall dependencies
rm -rf node_modules package-lock.json
pnpm install

# 4. Clear Vite cache
rm -rf node_modules/.vite
pnpm run dev

# 5. Check if using correct import
# Correct:
import { BrowserRouter } from 'react-router-dom';
# Wrong:
import { BrowserRouter } from 'react-router';  # Wrong package name
```

---

## VPS Deployment Issues

### Issue: "Permission denied (publickey)" when SSH

**Symptoms:**
```bash
ssh root@YOUR_VPS_IP
# Permission denied (publickey).
```

**Solutions:**

```bash
# 1. Check if SSH key was added to Hetzner
cat ~/.ssh/id_ed25519.pub
# Copy and verify it's in Hetzner Cloud Console

# 2. Use password authentication (if enabled)
ssh -o PreferredAuthentications=password root@YOUR_VPS_IP

# 3. Generate new SSH key
ssh-keygen -t ed25519 -f ~/.ssh/oslr_vps
ssh-copy-id -i ~/.ssh/oslr_vps.pub root@YOUR_VPS_IP

# 4. Use specific key file
ssh -i ~/.ssh/id_ed25519 root@YOUR_VPS_IP

# 5. Reset SSH key in Hetzner Console
# Hetzner Cloud → Servers → Your Server → ISO & Rescue → Enable Rescue & Power Cycle
# Follow Hetzner's reset instructions
```

---

### Issue: "Connection timed out" to VPS

**Symptoms:**
```bash
ssh root@YOUR_VPS_IP
# ssh: connect to host YOUR_VPS_IP port 22: Connection timed out
```

**Solutions:**

```bash
# 1. Check if VPS is running (Hetzner Console)
# Status should be "Running"

# 2. Check if firewall is blocking SSH
# In Hetzner Cloud Console → Firewalls
# Ensure Port 22 (SSH) is allowed

# 3. Verify VPS IP address
ping YOUR_VPS_IP
# Should respond

# 4. Try from different network (VPN might block SSH)

# 5. Check UFW firewall on VPS (via Hetzner Console)
# Hetzner → Servers → Your Server → Console
ufw status
ufw allow ssh
```

---

### Issue: "docker-compose: command not found" on VPS

**Symptoms:**
```bash
docker-compose up -d
# bash: docker-compose: command not found
```

**Solutions:**

```bash
# 1. Check Docker Compose version
docker compose version  # Note: no hyphen!
# Docker Compose v2 uses "docker compose" not "docker-compose"

# 2. Use Docker Compose v2 syntax
docker compose up -d

# 3. Install Docker Compose v2 (if missing)
sudo apt update
sudo apt install docker-compose-plugin

# 4. Create alias for old syntax
echo 'alias docker-compose="docker compose"' >> ~/.bashrc
source ~/.bashrc
```

---

## SSL/HTTPS Issues

### Issue: "Let's Encrypt rate limit exceeded"

**Symptoms:**
```bash
certbot certonly --standalone -d oslsr.gov.ng
# Error: too many certificates already issued for exact set of domains
```

**Solutions:**

```bash
# 1. Use --staging flag for testing
certbot certonly --standalone --staging -d oslsr.gov.ng
# Test your setup, then remove --staging for real certificate

# 2. Wait 7 days (Let's Encrypt rate limit: 5 certs/week)

# 3. Use different subdomain temporarily
certbot certonly --standalone -d test.oslsr.gov.ng

# 4. Use existing certificates if available
ls /etc/letsencrypt/live/oslsr.gov.ng/
# If certificates exist, just copy them
```

---

### Issue: "SSL certificate has expired"

**Symptoms:**
```
Browser: "Your connection is not private" / NET::ERR_CERT_DATE_INVALID
```

**Solutions:**

```bash
# 1. Check certificate expiry
sudo certbot certificates

# 2. Renew certificates
sudo certbot renew

# 3. Force renewal
sudo certbot renew --force-renewal

# 4. Set up auto-renewal (should be automatic, but verify)
sudo systemctl status certbot.timer
sudo systemctl enable certbot.timer

# 5. Restart NGINX after renewal
docker-compose -f docker-compose.prod.yml restart nginx
```

---

## ODK Central Issues

### Issue: Cannot access ODK Central web interface

**Symptoms:**
```
Browser: http://localhost:8383 → Connection refused
```

**Solutions:**

```bash
# 1. Check if ODK container is running
docker ps | grep odk

# 2. Check ODK logs
docker logs oslsr-odk-central-local

# 3. Wait for ODK to start (takes 2-3 minutes first time)
docker logs -f oslsr-odk-central-local
# Wait for: "Server is running on port 8383"

# 4. Check correct URL
# Local: http://localhost:8383
# Production: https://odk.oslsr.gov.ng

# 5. Restart ODK container
docker-compose restart odk-central
```

---

### Issue: ODK login not working

**Symptoms:**
```
ODK Central login page loads, but credentials don't work
```

**Solutions:**

```bash
# 1. Use default ODK credentials (first-time setup)
# Check docker-compose.yml for ODK_ADMIN_EMAIL and ODK_ADMIN_PASSWORD

# 2. Reset ODK admin password
docker exec -it oslsr-odk-central sh
# Inside container:
odk-cmd user-set-password admin@oslsr.gov.ng NEW_PASSWORD

# 3. Create new admin user
docker exec -it oslsr-odk-central odk-cmd user-create \
  admin@oslsr.gov.ng \
  NEW_PASSWORD

# 4. Check ODK database connection
docker exec -it oslsr-postgres-odk psql -U odk_admin -d odk_db
# Should connect without errors
```

---

## Performance Issues

### Issue: Docker is very slow on Windows

**Symptoms:**
- `docker-compose up` takes 10+ minutes
- File changes take long to reflect in containers
- High CPU usage

**Solutions:**

```bash
# 1. Enable WSL2 backend (faster than Hyper-V)
# Docker Desktop → Settings → General → "Use WSL2 based engine"

# 2. Move project to WSL2 filesystem
# Windows path: C:\Users\Awwal\project (slow)
# WSL2 path: \\wsl$\Ubuntu\home\awwal\project (fast!)

# Access WSL2:
wsl
cd ~
git clone <your-repo>

# 3. Increase Docker Desktop resources
# Docker Desktop → Settings → Resources
# CPU: 4+ cores
# Memory: 4+ GB
# Swap: 1GB

# 4. Disable file watching in node_modules
# In package.json:
"dev": "nodemon --ignore node_modules"

# 5. Use .dockerignore file
echo "node_modules" >> .dockerignore
echo ".git" >> .dockerignore
```

---

## Build/Deployment Issues

### Issue: GitHub Actions deployment fails

**Symptoms:**
```
GitHub Actions log:
Error: Host key verification failed
```

**Solutions:**

```bash
# 1. Verify GitHub Secrets are set correctly
# GitHub → Repository → Settings → Secrets
# Required: VPS_HOST, VPS_USER, VPS_SSH_KEY

# 2. Check SSH key format (must be private key, not public)
cat ~/.ssh/id_ed25519  # Private key (NOT id_ed25519.pub)
# Copy entire content including:
# -----BEGIN OPENSSH PRIVATE KEY-----
# ...
# -----END OPENSSH PRIVATE KEY-----

# 3. Test SSH connection locally
ssh -i ~/.ssh/id_ed25519 oslr@YOUR_VPS_IP
# Should connect without password

# 4. Add VPS to known_hosts (in GitHub Action)
# Add step before deploy:
- name: Add VPS to known_hosts
  run: ssh-keyscan ${{ secrets.VPS_HOST }} >> ~/.ssh/known_hosts
```

---

### Issue: "Out of disk space" on VPS

**Symptoms:**
```bash
docker-compose up -d
# Error: no space left on device
```

**Solutions:**

```bash
# 1. Check disk usage
df -h
# If /dev/sda1 is >90% full, clean up:

# 2. Clean Docker data
docker system prune -a --volumes
# WARNING: Removes unused images, containers, and volumes

# 3. Check log files
du -sh /var/log/*
# Delete large logs:
sudo rm /var/log/large-file.log

# 4. Clean package manager cache
sudo apt clean
sudo apt autoclean

# 5. Resize VPS disk (Hetzner Console)
# Hetzner Cloud → Servers → Your Server → Resize
# Upgrade to next tier

# 6. Move data to external volume
# Hetzner Cloud → Volumes → Create Volume
# Mount and move /home/oslr/data to volume
```

---

## Getting Help

### Before Asking for Help

1. **Check logs first:**
   ```bash
   docker-compose logs SERVICE_NAME
   docker logs CONTAINER_NAME
   journalctl -u docker  # System logs
   ```

2. **Search for error message:**
   - Google the exact error message
   - Search GitHub issues
   - Check Stack Overflow

3. **Verify basics:**
   - Is Docker running?
   - Are all containers healthy?
   - Are environment variables set?
   - Is there enough disk space/memory?

### How to Ask for Help

**Good question format:**

```
**What I'm trying to do:**
Deploy OSLSR to production VPS

**What I did:**
1. Ran: docker-compose -f docker-compose.prod.yml up -d
2. All containers started except postgres
3. Checked logs: docker logs oslsr-postgres

**Error message:**
[paste exact error message]

**Environment:**
- OS: Ubuntu 22.04
- Docker: 24.0.5
- Docker Compose: v2.20.0

**What I've tried:**
- Restarted Docker: sudo systemctl restart docker
- Checked disk space: df -h (40GB free)
- Tried recreating container: docker-compose down && docker-compose up -d
```

### Where to Get Help

1. **Architecture Document:** Check `_bmad-output/planning-artifacts/architecture.md`
2. **PRD:** Check `_bmad-output/planning-artifacts/prd.md`
3. **Docker Documentation:** https://docs.docker.com
4. **PostgreSQL Documentation:** https://www.postgresql.org/docs/
5. **NGINX Documentation:** https://nginx.org/en/docs/
6. **ODK Central Documentation:** https://docs.getodk.org/central-intro/

---

## Quick Reference Commands

### Docker

```bash
# View running containers
docker ps

# View all containers (including stopped)
docker ps -a

# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# Restart specific service
docker-compose restart SERVICE_NAME

# View logs
docker-compose logs -f SERVICE_NAME

# Execute command in container
docker exec -it CONTAINER_NAME bash

# Clean up everything
docker system prune -a --volumes
```

### PostgreSQL

```bash
# Connect to database
docker exec -it oslsr-postgres psql -U postgres -d app_db

# Backup database
docker exec oslsr-postgres pg_dump -U postgres app_db > backup.sql

# Restore database
docker exec -i oslsr-postgres psql -U postgres app_db < backup.sql

# Check database size
docker exec oslsr-postgres psql -U postgres -c "SELECT pg_size_pretty(pg_database_size('app_db'));"
```

### VPS Management

```bash
# SSH into VPS
ssh oslr@YOUR_VPS_IP

# Check disk space
df -h

# Check memory usage
free -h

# Check running processes
htop

# View system logs
journalctl -xe

# Restart Docker
sudo systemctl restart docker

# Renew SSL certificates
sudo certbot renew
```

---

You now have a comprehensive troubleshooting guide! When you encounter issues, start here first. 🛠️
