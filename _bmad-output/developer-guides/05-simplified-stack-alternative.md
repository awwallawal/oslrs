# Simplified Stack Alternative Options
## Easier Deployment Paths (Trade-offs Included)

**Purpose:** Explore simplified OSLSR deployment options closer to your MERN + Vercel/Render experience.

**Important:** These alternatives sacrifice some benefits (NDPA compliance, cost savings, full control) for easier deployment.

---

## Option 1: Hybrid Approach (Vercel + Render + Minimal VPS)

### Architecture

```
Frontend (React) → Vercel (Auto-deploy from GitHub)
           ↓
API (Node.js) → Render (Auto-deploy from GitHub)
           ↓
ODK Central → Self-hosted VPS (Manual setup)
           ↓
PostgreSQL → Render PostgreSQL ($7/month)
Redis → Upstash Redis (Free tier or $10/month)
```

### Pros & Cons

**Pros:**
- ✅ Familiar workflow (close to MERN + Vercel/Render)
- ✅ Auto-deployments from GitHub (like you're used to)
- ✅ No Docker/NGINX/Linux knowledge needed
- ✅ Easier to get started (30 minutes vs 3-4 hours)

**Cons:**
- ❌ **NDPA Violation:** Data goes through US servers (Vercel/Render are US-based)
- ❌ **Higher Cost:** ~$80-100/month vs $14/month (7x more expensive)
- ❌ **Still Need VPS:** Can't self-host ODK Central on Vercel/Render
- ❌ **Split Stack Complexity:** Managing 4 different platforms
- ❌ **Less Control:** Can't customize NGINX, can't run Plausible Analytics

### Setup Guide

#### 1. Frontend (Vercel)

```bash
# In your local project
cd apps/web

# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel --prod

# Configure environment variables in Vercel Dashboard
# VITE_API_URL=https://your-api.onrender.com
# VITE_ODK_URL=https://odk.yourvps.com
```

#### 2. Backend API (Render)

1. Go to https://render.com
2. Click "New +" → "Web Service"
3. Connect GitHub repository
4. Configure:
   - **Name:** oslsr-api
   - **Environment:** Node
   - **Build Command:** `cd apps/api && npm install && npm run build`
   - **Start Command:** `cd apps/api && npm start`
   - **Plan:** Starter ($7/month)
5. Add environment variables:
   - `DATABASE_URL` (from Render PostgreSQL)
   - `REDIS_URL` (from Upstash)
   - `JWT_SECRET`
   - `ODK_SERVER_URL`

#### 3. PostgreSQL (Render)

1. In Render Dashboard, click "New +" → "PostgreSQL"
2. **Name:** oslsr-db
3. **Plan:** Starter ($7/month)
4. Copy connection string to API environment variables

#### 4. Redis (Upstash)

1. Go to https://upstash.com
2. Create account → Create Redis database
3. **Region:** EU (closest to Nigeria)
4. **Plan:** Free tier (10k commands/day) or Pay-as-you-go
5. Copy `UPSTASH_REDIS_REST_URL` to API environment variables

#### 5. ODK Central (Minimal VPS)

**Still need a VPS** (but simpler setup):

```bash
# Rent cheapest Hetzner VPS: CX11 (€3.79/month)
# Just for ODK Central

# SSH into VPS
ssh root@YOUR_VPS_IP

# Install Docker
curl -fsSL https://get.docker.com | sh

# Run ODK Central
docker run -d \
  --name odk-central \
  -p 8383:8383 \
  -v odk-data:/data \
  odk/central:latest

# Configure domain
# Point odk.yourdomain.com to VPS IP
```

**Total Monthly Cost:**
- Vercel: Free (hobby plan)
- Render API: $7
- Render PostgreSQL: $7
- Upstash Redis: $0-10
- Hetzner VPS (ODK): $4
- **Total: ~$18-28/month** (vs $14 for full self-hosted)

---

## Option 2: Render-Only Stack (No Vercel, No VPS)

### Architecture

```
Frontend + API → Render Web Service
PostgreSQL → Render PostgreSQL
Redis → Render Redis
```

**Problem:** Can't host ODK Central on Render (not supported).

**Workaround:** Use Google Forms or Typeform instead of ODK Central.

### Pros & Cons

**Pros:**
- ✅ Single platform (Render)
- ✅ No VPS management
- ✅ Auto-deployments from GitHub

**Cons:**
- ❌ **Loses Core OSLSR Feature:** No offline-first ODK surveys
- ❌ **NDPA Violation:** Data in US servers
- ❌ **Expensive:** $50-80/month
- ❌ **Can't Run Analytics:** No Plausible self-hosted

**Verdict:** **NOT RECOMMENDED** - Loses too many core features.

---

## Option 3: Railway.app (All-in-One Platform)

### Architecture

```
All Services → Railway.app
├─ Frontend (React)
├─ API (Node.js)
├─ PostgreSQL
├─ Redis
└─ ODK Central (Docker)
```

### Pros & Cons

**Pros:**
- ✅ Supports Docker containers (can run ODK Central!)
- ✅ Single platform
- ✅ GitHub auto-deploy
- ✅ Simple dashboard

**Cons:**
- ❌ **NDPA Violation:** US-based
- ❌ **Expensive:** ~$60-100/month
- ❌ **Less mature:** Frequent pricing changes
- ❌ **Still need to configure Docker:** Not simpler than self-hosted

### Setup Guide

1. Go to https://railway.app
2. Sign up with GitHub
3. Create new project → Deploy from GitHub repo
4. Railway detects services automatically from docker-compose.yml
5. Add environment variables
6. Deploy

**Total Cost:** ~$60-100/month

---

## Option 4: DigitalOcean App Platform

### Architecture

```
All Services → DigitalOcean App Platform
├─ Frontend (Static Site)
├─ API (Web Service)
├─ PostgreSQL (Managed Database)
└─ Redis (Managed Database)
```

**Problem:** Can't deploy ODK Central (no Docker support on App Platform).

**Workaround:** Use DigitalOcean Droplet (VPS) for ODK only.

### Pros & Cons

**Pros:**
- ✅ Familiar DigitalOcean brand
- ✅ Good documentation
- ✅ Nigeria datacenter available (Lagos)

**Cons:**
- ❌ **Expensive:** $60-120/month
- ❌ **Still need Droplet for ODK:** Defeats simplicity purpose
- ❌ **Less features than Vercel/Render**

**Verdict:** **NOT RECOMMENDED** - Expensive without added benefits.

---

## Recommendation: Stick with Full Self-Hosted

### Why Full Self-Hosted is Better

**Cost Comparison (Monthly):**
- Full Self-Hosted: **$14**
- Hybrid (Option 1): **$18-28** (29-100% more)
- Railway (Option 3): **$60-100** (329-614% more)
- DigitalOcean (Option 4): **$60-120** (329-757% more)

**Feature Comparison:**

| Feature | Self-Hosted | Hybrid | Railway | DigitalOcean |
|---------|-------------|--------|---------|--------------|
| **NDPA Compliant** | ✅ Yes | ❌ No | ❌ No | ⚠️ Lagos only |
| **ODK Central** | ✅ Full | ⚠️ Minimal VPS | ✅ Docker | ⚠️ Droplet needed |
| **Plausible Analytics** | ✅ Yes | ❌ No | ⚠️ Maybe | ❌ No |
| **Full Control** | ✅ Yes | ⚠️ Split | ⚠️ Limited | ⚠️ Limited |
| **Cost** | ✅ $14 | ⚠️ $18-28 | ❌ $60-100 | ❌ $60-120 |
| **Learning Curve** | ⚠️ High | ✅ Low | ⚠️ Medium | ⚠️ Medium |

### Our Recommendation

**Stick with full self-hosted approach** BECAUSE:

1. **You'll Learn Valuable Skills:** Docker, NGINX, Linux are transferable to any project
2. **Cost Savings:** Pay for itself in 2 months vs alternatives
3. **NDPA Compliance:** Required for Nigerian government project
4. **Full Control:** No platform limitations
5. **I'll Guide You:** Step-by-step tutorials make it manageable

**BUT we provide support:**
- ✅ Comprehensive guides (you're reading them!)
- ✅ Hands-on tutorials for each technology
- ✅ Troubleshooting guide for common issues
- ✅ Available to answer questions during implementation

---

## If You Still Want Simplified Option

**Best Compromise:** **Option 1 (Hybrid)**

**Why:**
- Closest to your MERN + Vercel/Render workflow
- Still get automatic GitHub deployments
- Only manage minimal VPS for ODK Central
- Can migrate to full self-hosted later (learning path)

**Migration Path:**
```
Phase 1 (Month 1): Hybrid approach
  → Get familiar with ODK Central on VPS
  → Develop features on Vercel/Render

Phase 2 (Month 2-3): Add Docker knowledge
  → Complete Docker tutorials
  → Test full stack locally

Phase 3 (Month 4): Migrate to full self-hosted
  → Save $50-80/month
  → Achieve NDPA compliance
  → Full control
```

---

## Next Steps

**If choosing full self-hosted (recommended):**
- ✅ [Local Development Quick Start](03-local-development-quickstart.md)
- ✅ [Developer Onboarding Guide](02-developer-onboarding-guide.md)
- ✅ [VPS Deployment Guide](04-vps-deployment-guide.md)

**If choosing Hybrid (Option 1):**
- ⚠️ Follow Hybrid Setup Guide above
- ⚠️ Plan migration to full self-hosted in 3-6 months
- ⚠️ Accept NDPA compliance risk (document in project notes)

**Questions to help decide:**
1. Is NDPA compliance required? → **Yes** = Full self-hosted only
2. Is budget limited (<$20/month)? → **Yes** = Full self-hosted
3. Need to ship quickly (<1 week)? → Consider Hybrid, then migrate
4. Want to learn DevOps skills? → Full self-hosted is best investment

Your choice! But remember: **The full self-hosted approach is only 3-4 weeks of learning for years of benefits.** 💪
