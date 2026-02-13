# Infrastructure Scaling & Performance Tuning Guide

**Project:** OSLRS (Oyo State Labour & Skills Registry)
**Created:** 2026-02-11
**Target:** DigitalOcean Droplet — $24/mo (2 vCPU, 4GB RAM, 80GB SSD, AMS3)
**Capacity:** ~3,000 concurrent users on single Droplet

---

## Current Infrastructure

| Spec | Value |
|------|-------|
| **Provider** | DigitalOcean |
| **Droplet** | Basic $24/mo |
| **vCPU** | 2 |
| **RAM** | 4 GB |
| **Disk** | 80 GB SSD |
| **Region** | AMS3 (Amsterdam) |
| **OS** | Ubuntu 24.04 LTS |
| **Latency to Nigeria** | ~130-160ms |

---

## Migration Plan: SFO2 → AMS3 (with RAM Upgrade)

### Pre-Migration (No Downtime)

**1. Lower DNS TTL — do 24-48 hours before migration:**

Set your domain's A record TTL to **300 seconds** (5 minutes). This ensures the IP change propagates quickly after migration.

**2. Back up configs locally:**

```bash
ssh root@<your-sfo2-ip>

# Save copies of these files locally:
docker ps                          # running containers
cat /etc/nginx/sites-enabled/*     # nginx config
cat /home/deploy/apps/oslrs/.env   # env vars
crontab -l                         # cron jobs
ufw status                         # firewall rules
```

### Migration Steps (~10-15 Minutes Downtime)

**3. Power off the SFO2 Droplet:**

In DO Console: **Droplets → your-droplet → Power → Turn Off**

Or via SSH:
```bash
docker compose down
sudo poweroff
```

**4. Create a Snapshot:**

In DO Console:
- **Droplets → your-droplet → Snapshots → Take Snapshot**
- Name: `oslsr-pre-migration-2026-02-11`
- Wait 2-5 minutes for completion

**5. Create New Droplet from Snapshot in AMS3:**

In DO Console:
- **Droplets → Create Droplet**
- **Region:** Amsterdam 3 (AMS3)
- **Choose Image → Snapshots tab** → select your snapshot
- **Size:** Basic → **$24/mo** (2 vCPU / 4 GB RAM / 80 GB SSD)
- **Authentication:** Same SSH key
- **Hostname:** `oslsr-production`
- **Create Droplet**

Note the new IP address.

**6. Verify the New Droplet:**

```bash
ssh root@<new-ams3-ip>

docker ps                                       # containers running
curl http://localhost:3000                       # web app responds
curl http://localhost:4000/api/v1/health         # API responds
```

**7. Update DNS:**

Point your domain's A record to the new AMS3 IP address. With TTL at 300s, propagation takes ~5 minutes.

**8. Verify via Domain:**

```bash
curl https://your-domain.com/api/v1/health
```

**9. Destroy Old SFO2 Droplet (hours/days later):**

Only after confirming AMS3 works. Keep the snapshot for a week as insurance, then delete it (snapshots cost $0.06/GB/month).

---

## Performance Tuning Layers

### Layer 1: OS-Level Tuning

**Add swap (safety net against OOM kills):**

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Only use swap as emergency
sysctl vm.swappiness=10
echo 'vm.swappiness=10' >> /etc/sysctl.conf
```

**Increase connection limits:**

```bash
# Add to /etc/sysctl.conf
net.core.somaxconn = 4096
net.ipv4.tcp_max_syn_backlog = 4096
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_tw_reuse = 1
net.core.netdev_max_backlog = 2000

# Apply immediately
sysctl -p
```

**Increase file descriptor limits:**

```bash
# Add to /etc/security/limits.conf
deploy soft nofile 65535
deploy hard nofile 65535
root   soft nofile 65535
root   hard nofile 65535
```

### Layer 2: NGINX Tuning

```nginx
# /etc/nginx/nginx.conf

worker_processes 2;                  # match 2 vCPUs

events {
    worker_connections 2048;         # per worker = 4,096 total
    multi_accept on;
}

http {
    # Connection efficiency
    keepalive_timeout 30;
    keepalive_requests 1000;

    # Buffering
    client_body_buffer_size 16k;
    client_header_buffer_size 1k;
    large_client_header_buffers 4 8k;

    # Gzip — compress API JSON responses
    gzip on;
    gzip_types application/json text/plain text/css application/javascript;
    gzip_min_length 256;
    gzip_comp_level 4;

    # Proxy to Node.js — persistent upstream connections
    upstream api_backend {
        server 127.0.0.1:4000;
        keepalive 32;
    }

    server {
        # ... your existing server block ...

        # Static file caching (Vite hashes filenames, safe to cache forever)
        location /assets/ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }

        location /api {
            proxy_pass http://api_backend;
            proxy_http_version 1.1;
            proxy_set_header Connection "";   # required for upstream keepalive
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }
    }
}
```

**Key wins:**
- `keepalive 32` to upstream — avoids creating new TCP connections per request from NGINX to Node.js
- `gzip on` — compresses JSON responses (50KB → ~8KB), faster responses and less bandwidth
- Static asset caching — React JS/CSS bundles served from browser cache, zero server load

### Layer 3: Node.js / PM2

**PM2 cluster mode (use both vCPUs):**

```javascript
// ecosystem.config.cjs
module.exports = {
  apps: [{
    name: 'oslrs-api',
    script: './dist/index.js',
    instances: 2,                    // 1 per vCPU
    exec_mode: 'cluster',
    max_memory_restart: '1G',        // auto-restart if a process leaks
    node_args: '--max-old-space-size=768',
    env: {
      NODE_ENV: 'production',
      PORT: 4000
    }
  }]
};
```

**Why 2 instances matters:**
- Node.js is single-threaded. 1 instance = 1 vCPU ≈ 500 req/sec
- 2 instances = both vCPUs = ~1,000 req/sec
- 3,000 concurrent users ≈ 300-600 req/sec (users don't all request simultaneously)

**Express-level tuning:**

```typescript
app.set('trust proxy', 1);     // behind NGINX
app.set('etag', false);        // save CPU if not needed
app.disable('x-powered-by');   // remove header
```

### Layer 4: PostgreSQL Tuning

For 4GB total RAM with PG sharing the box:

```ini
# postgresql.conf (or Docker Compose environment)

# Memory
shared_buffers = 512MB
work_mem = 8MB
maintenance_work_mem = 128MB
effective_cache_size = 2GB

# Connections
max_connections = 100

# Write Performance
wal_buffers = 16MB
checkpoint_completion_target = 0.9

# Query Planner (SSD-optimized)
random_page_cost = 1.1
effective_io_concurrency = 200

# Logging (catch slow queries)
log_min_duration_statement = 500
```

**Connection pooling (in Drizzle/pg config):**

```typescript
const pool = new Pool({
  max: 20,                      // 20 connections total
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
```

Why 20? Each PG connection uses ~5-10MB RAM. 20 × 10MB = 200MB. With 2 PM2 cluster instances, 20 total is sufficient for 3,000 concurrent users since most queries resolve in <50ms.

### Layer 5: Redis Tuning

```ini
# redis.conf
maxmemory 256mb
maxmemory-policy allkeys-lru
tcp-backlog 511
```

### Layer 6: Application-Level Wins

**1. Verify database indexes exist:**

```sql
-- Staff list (paginated, filtered)
CREATE INDEX IF NOT EXISTS idx_staff_status ON staff(status);
CREATE INDEX IF NOT EXISTS idx_staff_lga ON staff(lga_id);
CREATE INDEX IF NOT EXISTS idx_staff_created ON staff(created_at);

-- Public user lookup (NIN uniqueness on registration)
CREATE INDEX IF NOT EXISTS idx_users_nin ON users(nin) WHERE nin IS NOT NULL;
```

A missing index on a 10,000+ row table turns a 5ms query into a 500ms full table scan.

**2. Always paginate results:**

```typescript
const staff = await db.select().from(staffTable)
  .limit(25)
  .offset(page * 25);
```

**3. Cache read-heavy endpoints:**

```typescript
// Questionnaire schemas rarely change — cache 5 minutes
res.set('Cache-Control', 'public, max-age=300');
```

**4. Keep health checks lightweight:**

```typescript
app.get('/health', (req, res) => res.json({ status: 'ok' }));
```

---

## Capacity Planning

### What $24/mo Handles

| Scenario | Concurrent Users | Req/sec | Status |
|----------|-----------------|---------|--------|
| Pilot (132 staff + public) | ~200 | ~30 | Easily handled |
| Early growth | ~1,000 | ~150 | Comfortable |
| Medium growth | ~2,000 | ~350 | Fine with tuning |
| Upper limit | ~3,000 | ~500 | Near capacity |
| Beyond single Droplet | 5,000+ | 800+ | Needs split architecture |

### Request Flow at 3,000 Concurrent

```
3,000 concurrent users
  │
  │  ~1 request every 5-10 seconds per user
  │  = ~300-600 req/sec sustained
  │
  ▼
NGINX (4,096 max connections, gzip, keepalive)
  │
  │  Static assets served from cache (zero Node.js load)
  │  Only API requests proxied
  │
  ▼
PM2 Cluster (2 instances × ~500 req/sec = 1,000 req/sec capacity)
  │
  │  Each request: ~20-50ms server-side
  │  20 DB connections shared across requests
  │
  ▼
PostgreSQL (indexed queries, 512MB shared_buffers)
  │
  │  Most queries: 5-20ms
  │  Complex queries: 50-100ms
  │
  ▼
Response: ~140ms network + ~30ms server = ~170ms total
✅ Under NFR1.1 (250ms p95)
```

### RAM Budget (4GB)

| Process | Allocated |
|---------|-----------|
| Ubuntu 24.04 OS | ~400 MB |
| PostgreSQL | ~600 MB |
| Redis | ~256 MB |
| Node.js × 2 (PM2 cluster) | ~1,500 MB |
| NGINX | ~30 MB |
| BullMQ workers | ~200 MB |
| Swap (emergency) | 2 GB on disk |
| **Total** | **~3 GB used, ~1 GB headroom** |

---

## Scaling Triggers

| Trigger | Signal | Action |
|---------|--------|--------|
| RAM consistently >80% | `free -h` shows <800MB available | Resize Droplet to next tier |
| API p95 >200ms (server-side) | Application logs / monitoring | Move to Premium AMD (dedicated CPU) |
| Database slow queries | `log_min_duration_statement` logs | Add indexes, or move to DO Managed Database ($15/mo) |
| 5,000+ concurrent users | Growth metrics | Split to multi-Droplet architecture |

### Split Architecture (When You Outgrow Single Droplet)

```
DO Load Balancer ($12/mo)
  ├── App Droplet 1 ($24/mo) — Node.js + PM2
  ├── App Droplet 2 ($24/mo) — Node.js + PM2
DO Managed PostgreSQL ($30/mo)
DO Managed Redis ($15/mo)
Total: ~$105/mo — handles 10,000+ concurrent
```

---

## Load Testing

Load tests run **from your local machine**, not on the server.

**Install k6 locally:**
- Windows: `winget install Grafana.k6`
- macOS: `brew install k6`
- Linux: `sudo apt install k6`

**Run against your server:**
```bash
# Smoke test (15 seconds, 2 virtual users)
k6 run --env BASE_URL=https://your-domain.com tests/load/smoke.js

# Full load test suite
k6 run --env BASE_URL=https://your-domain.com tests/load/combined-stress.js
```

k6 scripts are located at `tests/load/` in the project root. See `tests/load/README.md` for details.

**When to load test:**
- After migration to AMS3 + 4GB upgrade (establish baseline)
- Before major releases (detect regressions)
- When approaching scaling triggers

---

## Priority Implementation Order

| # | Tweak | Impact | Effort |
|---|-------|--------|--------|
| 1 | Region move to AMS3 | **Huge** — cuts 200ms off every request | 15 min |
| 2 | 4GB RAM upgrade | **High** — eliminates OOM risk | During migration |
| 3 | Database indexes verified | **High** — prevents slow query disasters | 10 min |
| 4 | PM2 cluster mode (2 instances) | **High** — doubles throughput | 5 min |
| 5 | NGINX gzip + keepalive | **Medium** — smaller responses, fewer connections | 10 min |
| 6 | PostgreSQL tuning | **Medium** — better query performance | 10 min |
| 7 | OS sysctl limits | **Low** (until 1,000+ concurrent) | 5 min |
| 8 | Swap file | **Safety net** — prevents crashes | 2 min |

Items 1-6 take under an hour total and get you to 3,000 concurrent comfortably.

---

## References

- [DigitalOcean Droplet Resize Guide](https://docs.digitalocean.com/products/droplets/how-to/resize/)
- [DigitalOcean Snapshots](https://docs.digitalocean.com/products/images/snapshots/)
- [OSLRS Architecture: ADR-011](../_bmad-output/planning-artifacts/architecture.md) — original capacity planning
- [OSLRS VPS Setup Checklist](../_bmad-output/implementation-artifacts/vps-setup-checklist.md) — server provisioning steps
- [OSLRS DigitalOcean Spaces Setup](../_bmad-output/developer-guides/digitalocean-spaces-setup.md) — object storage config
- [k6 Load Test Scripts](../tests/load/README.md) — load testing documentation

---

*Created: 2026-02-11*
*Author: BMad Master (Claude Opus 4.6)*
